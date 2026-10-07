import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync, statfsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';

/**
 * Makes sure the large local address index exists on this server, without
 * ever blocking the server from starting. deploy/start.sh runs it in the
 * background at boot; the running site opens the index the moment the finished
 * file appears (geocode/local-address-index.ts rechecks), so no restart is
 * needed.
 *
 *   ADDRESS_INDEX_PATH       where the index lives (unset = feature off)
 *   ADDRESS_INDEX_URL        a prebuilt index to download, optionally .gz
 *   ADDRESS_INDEX_SHA256     expected sha256 of the downloaded bytes (verified if set)
 *   ADDRESS_INDEX_AUTOBUILD  "1" to build it here from OpenAddresses when no URL is set
 *
 * A download is preferred: it is minutes, not hours, and costs the server
 * almost nothing. The build is the fallback, run at the lowest CPU priority.
 */

export type Action = 'off' | 'present' | 'download' | 'build' | 'not-configured' | 'no-space';

/** Free bytes the from-scratch build needs: the finished index, its sort scratch space and the largest regional zip (~2.7 GB), with headroom. Revisit after the measured build in docs/geocoding-coverage.md. */
export const BUILD_NEEDS_BYTES = 20 * 1024 ** 3;
/** A downloaded index needs room for the file plus, if it is gzipped, nothing extra (it is expanded as it arrives). */
export const DOWNLOAD_NEEDS_BYTES = 16 * 1024 ** 3;

export function decide(input: {
  path: string | undefined;
  exists: boolean;
  url: string | undefined;
  autobuild: boolean;
  freeBytes: number | null;
}): Action {
  if (!input.path) return 'off';
  if (input.exists) return 'present';
  if (input.url) return input.freeBytes !== null && input.freeBytes < DOWNLOAD_NEEDS_BYTES ? 'no-space' : 'download';
  if (input.autobuild) return input.freeBytes !== null && input.freeBytes < BUILD_NEEDS_BYTES ? 'no-space' : 'build';
  return 'not-configured';
}

const log = (msg: string) => console.log(`[address-index ${new Date().toISOString()}] ${msg}`);

function freeBytesAt(dir: string): number | null {
  try {
    const s = statfsSync(dir);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

function indexHasPoints(path: string): boolean {
  try {
    const db = new DatabaseSync(path, { readOnly: true });
    const row = db.prepare('SELECT COUNT(*) AS c FROM points').get() as { c: number };
    db.close();
    return row.c > 0;
  } catch {
    return false;
  }
}

async function download(url: string, dest: string, expectedSha256: string | undefined): Promise<void> {
  const partial = `${dest}.download`;
  rmSync(partial, { force: true });
  log(`downloading ${url.replace(/\?.*$/, '')}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const hash = createHash('sha256');
  const source = Readable.fromWeb(res.body as never);
  source.on('data', (chunk: Buffer) => hash.update(chunk));
  if (url.split('?')[0].endsWith('.gz')) await pipeline(source, createGunzip(), createWriteStream(partial));
  else await pipeline(source, createWriteStream(partial));
  const got = hash.digest('hex');
  if (expectedSha256 && got.toLowerCase() !== expectedSha256.toLowerCase()) {
    rmSync(partial, { force: true });
    throw new Error(`sha256 mismatch: expected ${expectedSha256}, got ${got}`);
  }
  if (!indexHasPoints(partial)) {
    rmSync(partial, { force: true });
    throw new Error('the downloaded file is not a usable address index');
  }
  renameSync(partial, dest);
  log(`installed ${Math.round(statSync(dest).size / 1024 / 1024)} MB (sha256 ${got})`);
}

function tmpDir(path: string): string {
  const dir = join(dirname(path), 'tmp');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function build(path: string): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  log('building from OpenAddresses (this takes hours on a small instance; the site keeps serving meanwhile)');
  return new Promise((resolve, reject) => {
    const child = spawn('nice', ['-n', '19', process.execPath, join(here, 'build-address-index.ts'), '--download'], {
      stdio: 'inherit',
      // SQLite sorts the index through temp files; keep them on the data disk,
      // not the container's small scratch space.
      env: { ...process.env, ADDRESS_INDEX_PATH: path, SQLITE_TMPDIR: tmpDir(path) },
    });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`build exited with ${code}`))));
  });
}

async function main(): Promise<void> {
  const path = process.env.ADDRESS_INDEX_PATH;
  const dir = path ? dirname(path) : '.';
  if (path) mkdirSync(dir, { recursive: true });
  const action = decide({
    path,
    exists: path ? existsSync(path) && statSync(path).size > 0 : false,
    url: process.env.ADDRESS_INDEX_URL || undefined,
    autobuild: process.env.ADDRESS_INDEX_AUTOBUILD === '1',
    freeBytes: path ? freeBytesAt(dir) : null,
  });

  switch (action) {
    case 'off':
      log('ADDRESS_INDEX_PATH is not set; the local address index is off');
      return;
    case 'present':
      log(`index already at ${path}`);
      return;
    case 'not-configured':
      log('no index yet, and neither ADDRESS_INDEX_URL nor ADDRESS_INDEX_AUTOBUILD=1 is set; running on the live address services only');
      return;
    case 'no-space':
      log(`not enough free disk at ${dir} (${Math.round((freeBytesAt(dir) ?? 0) / 1024 ** 3)} GB free); resize the disk, then redeploy`);
      return;
  }

  // One runner at a time: a redeploy that overlaps a long build must not start a second one.
  const lock = `${path}.lock`;
  try {
    writeFileSync(lock, String(process.pid), { flag: 'wx' });
  } catch {
    const ageHours = (Date.now() - statSync(lock).mtimeMs) / 3_600_000;
    if (ageHours < 12) {
      log(`another run holds ${lock} (${ageHours.toFixed(1)}h old); leaving it alone`);
      return;
    }
    log(`removing a stale lock (${ageHours.toFixed(1)}h old)`);
    rmSync(lock, { force: true });
    writeFileSync(lock, String(process.pid), { flag: 'wx' });
  }
  try {
    if (action === 'download') await download(process.env.ADDRESS_INDEX_URL!, path!, process.env.ADDRESS_INDEX_SHA256 || undefined);
    else await build(path!);
    log('done');
  } catch (err) {
    log(`failed: ${(err as Error).message}; the site continues without the local index`);
    process.exitCode = 1;
  } finally {
    rmSync(lock, { force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();

import { DatabaseSync } from 'node:sqlite';
import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { spawn, spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import {
  OPENADDRESSES_REGIONS, ensureIndexSchema, openAddressesRegionUrl, parseOpenAddressesLine, sourceFor, toMicro,
} from './address-index-lib.ts';

/**
 * Turn the OpenAddresses bulk extracts into a local, queryable address
 * index: the thing that makes rooftop precision possible in the states
 * the National Address Database never received.
 *
 * WHY THIS EXISTS, measured rather than assumed. NAD is aggregated from
 * states that volunteer, and a 5km-box probe over each city found ZERO
 * NAD points in Detroit, Grand Rapids, Pittsburgh, Honolulu, Las Vegas,
 * Manchester, Charleston, Boise, Jackson and Miami. So contribution is
 * county-by-county even within one state, and no amount of retrying the NAD
 * service fixes a county that never sent its data. OpenAddresses collects
 * the same kind of authoritative local files directly from the counties.
 *
 * SHAPE OF THE DATA: each regional zip holds us/<state>/<county>.csv with
 * a fixed header: LON,LAT,NUMBER,STREET,UNIT,CITY,DISTRICT,REGION,
 * POSTCODE,ID,HASH.
 *
 * SHAPE OF THE INDEX: one SQLite file keyed by a rounded coordinate CELL, not
 * by address text. Its only job is to narrow ~200M points to the ~200 in a
 * neighbourhood; deciding which of those IS the address stays in rooftop.ts's
 * matchAddressPoint(). This is index FORMAT 2 (see address-index-lib.ts): integer
 * cell, integer micro-degree coordinates, source as an id into `sources`, and a
 * `meta` table that says so. The reader still opens format 1 files.
 *
 * BUILT SAFELY FOR A LIVE SERVER. The build writes `<db>.building` and
 * renames it into place only when it finishes, so a half-built index is never
 * opened and a running server picks the finished one up without a restart.
 * Rows stream from each zip entry line by line, so memory stays flat no
 * matter how large a county is.
 *
 * AN INCOMPLETE BUILD IS NEVER PUBLISHED. A download that fails, an archive that
 * cannot be read, or an entry that stops partway marks the run failed: the
 * `.building` file is deleted, the existing index is left exactly as it was, and
 * the process exits 1 naming what failed. `--allow-partial` publishes what was
 * ingested anyway (and still exits 1 so a script notices).
 *
 * DUPLICATES ARE DROPPED. A county file that lists a point twice (same cell,
 * coordinates, number, street, unit, city and ZIP) contributes it once; each file
 * is staged in a temporary table and copied in with SELECT DISTINCT.
 *
 * REPEAT IMPORTS ARE SAFE. Each county file is loaded in ONE transaction and
 * recorded in `sources.rows` when it commits, so a file already in the index is
 * skipped on the next run (--append twice does not double a county) and a file
 * interrupted mid-way leaves nothing behind.
 *
 * node:sqlite is a Node 22+ built-in, so this adds no npm dependency. Python
 * is used only as a zip reader (Node has no built-in zip).
 *
 *   node scripts/build-address-index.ts [--states MI,PA,HI] [--download] [--keep] [--append] [--allow-partial]
 *
 *   --download   fetch each regional zip from data.openaddresses.io, ingest it,
 *                then delete it (--keep leaves the zips in place)
 *
 * ADDRESS_INDEX_PATH sets the output file (default data/address-points/address-points.db).
 * ADDRESS_INDEX_RAW_DIR sets where the zips are read from / downloaded to.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.ADDRESS_INDEX_PATH ?? join(HERE, '..', 'data', 'address-points', 'address-points.db');
const RAW_DIR =
  process.env.ADDRESS_INDEX_RAW_DIR ??
  (process.env.ADDRESS_INDEX_PATH ? join(dirname(DB_PATH), 'raw') : join(HERE, '..', 'data', 'address-points', 'raw'));

interface Args {
  states: Set<string> | null;
  append: boolean;
  download: boolean;
  keep: boolean;
  allowPartial: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--states');
  return {
    states: i !== -1 && argv[i + 1] ? new Set(argv[i + 1].split(',').map((s) => s.trim().toLowerCase())) : null,
    append: argv.includes('--append'),
    download: argv.includes('--download'),
    keep: argv.includes('--keep'),
    allowPartial: argv.includes('--allow-partial'),
  };
}

/** python3 on a Linux container, python on a machine that only has that. */
function pythonBinary(): string {
  for (const candidate of ['python3', 'python']) {
    if (spawnSync(candidate, ['--version']).status === 0) return candidate;
  }
  throw new Error('Python is needed to read the zip extracts, and neither python3 nor python is on PATH.');
}
const PYTHON = pythonBinary();

function listZipEntries(zipPath: string): string[] | null {
  const out = spawnSync(
    PYTHON,
    ['-c', 'import zipfile,sys\nfor n in zipfile.ZipFile(sys.argv[1]).namelist():\n  print(n)', zipPath],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  // A still-downloading archive has no readable central directory yet: a
  // "come back later", not a reason to abort the other regions.
  if (out.status !== 0) return null;
  return out.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
}

function openDb(path: string, fresh: boolean): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  // Bulk-load settings. This file is a derived artifact rebuilt on demand, so
  // full durability buys nothing, but journal_mode OFF does not work: an
  // interrupted build would leave a database that cannot even be opened.
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = OFF');
  db.exec('PRAGMA cache_size = -200000');
  if (fresh) {
    db.exec('DROP TABLE IF EXISTS points');
    db.exec('DROP TABLE IF EXISTS sources');
    db.exec('DROP TABLE IF EXISTS meta');
  }
  ensureIndexSchema(db, path);
  return db;
}

/**
 * Stream one CSV out of a zip, line by line, without unpacking the archive or
 * holding it in memory. The whole entry is ONE transaction: it either commits
 * complete (and is recorded in `sources.rows`) or leaves nothing. Returns the
 * rows added, or null when the source was already imported.
 */
async function ingestEntry(
  db: DatabaseSync,
  zipPath: string,
  entry: string,
  state: string,
  stage: ReturnType<DatabaseSync['prepare']>,
): Promise<{ added: number; duplicates: number } | null> {
  const src = sourceFor(db, `OpenAddresses ${entry.replace(/^us\//, '').replace(/\.csv$/, '')}`);
  if (src.imported) return null;

  const child = spawn(
    PYTHON,
    ['-c', 'import zipfile,sys,shutil\nz=zipfile.ZipFile(sys.argv[1])\nshutil.copyfileobj(z.open(sys.argv[2]), sys.stdout.buffer)', zipPath, entry],
    { stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const exited = new Promise<number | null>((resolve) => {
    child.on('error', () => resolve(-1));
    child.on('close', (code) => resolve(code));
  });
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const stateCode = state.toUpperCase();
  let read = 0;
  let first = true;
  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM stage');
    for await (const line of lines) {
      if (first) {
        first = false;
        continue;
      }
      const row = parseOpenAddressesLine(line);
      if (!row) continue;
      stage.run(row.cell, toMicro(row.lat), toMicro(row.lon), row.number, row.street, row.unit, row.city, stateCode, src.id, row.zip);
      read++;
    }
    const code = await exited;
    // A truncated or corrupt entry makes the reader exit non-zero after emitting a prefix of its rows.
    if (code !== 0) throw new Error(`could not read ${entry} from ${zipPath} (exit ${code})`);
    // A county file can list the same point twice. SELECT DISTINCT keeps one
    // (NULLs compare equal there), and the staging table keeps memory flat.
    const added = Number(
      db.prepare(
        `INSERT INTO points (cell,lat,lon,number,street,unit,city,state,source,zip)
         SELECT DISTINCT cell,lat,lon,number,street,unit,city,state,source,zip FROM stage`,
      ).run().changes,
    );
    db.prepare('UPDATE sources SET rows = ? WHERE id = ?').run(added, src.id);
    db.exec('DELETE FROM stage');
    db.exec('COMMIT');
    return { added, duplicates: read - added };
  } catch (err) {
    child.kill();
    db.exec('ROLLBACK');
    throw err;
  }
}

async function downloadRegion(region: string): Promise<string> {
  mkdirSync(RAW_DIR, { recursive: true });
  const dest = join(RAW_DIR, `us_${region}.zip`);
  const partial = `${dest}.part`;
  const res = await fetch(openAddressesRegionUrl(region));
  if (!res.ok || !res.body) throw new Error(`download of ${region} failed: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(partial));
  renameSync(partial, dest);
  return dest;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const outPath = args.append ? DB_PATH : `${DB_PATH}.building`;
  if (!args.append) for (const f of [outPath, `${outPath}-wal`, `${outPath}-shm`]) rmSync(f, { force: true });

  let zips: string[] = [];
  if (!args.download) {
    if (!existsSync(RAW_DIR)) {
      console.error(
        `No extracts at ${RAW_DIR}. Re-run with --download, or fetch them yourself:\n` +
          `  curl -L -o ${RAW_DIR}/us_northeast.zip ${openAddressesRegionUrl('northeast')}`,
      );
      process.exit(1);
    }
    zips = readdirSync(RAW_DIR).filter((f) => f.endsWith('.zip')).map((f) => join(RAW_DIR, f));
    if (zips.length === 0) {
      console.error(`No .zip files in ${RAW_DIR}`);
      process.exit(1);
    }
  }

  const db = openDb(outPath, !args.append);
  // Each county file is staged here, then copied into `points` without its duplicates.
  db.exec(`CREATE TEMP TABLE IF NOT EXISTS stage (
    cell INTEGER, lat INTEGER, lon INTEGER, number TEXT, street TEXT, unit TEXT, city TEXT, state TEXT, source INTEGER, zip INTEGER
  )`);
  const stage = db.prepare('INSERT INTO stage (cell,lat,lon,number,street,unit,city,state,source,zip) VALUES (?,?,?,?,?,?,?,?,?,?)');
  let duplicatesDropped = 0;
  let grand = 0;
  let alreadyImported = 0;
  const failures: string[] = [];
  const perState: Record<string, number> = {};

  const sources: { label: string; resolve: () => Promise<string>; disposable: boolean }[] = args.download
    ? OPENADDRESSES_REGIONS.map((r) => ({ label: r, resolve: () => downloadRegion(r), disposable: !args.keep }))
    : zips.map((z) => ({ label: z, resolve: async () => z, disposable: false }));

  for (const src of sources) {
    let zipPath: string;
    try {
      console.log(`\n=== ${src.label}${args.download ? ' (downloading)' : ''}`);
      zipPath = await src.resolve();
    } catch (err) {
      console.error(`  ${(err as Error).message}; FAILED`);
      failures.push(`${src.label}: ${(err as Error).message}`);
      continue;
    }
    console.log(`  ${Math.round(statSync(zipPath).size / 1024 / 1024)} MB`);
    const listed = listZipEntries(zipPath);
    if (listed === null) {
      console.error('  unreadable; FAILED');
      failures.push(`${src.label}: archive could not be read`);
      if (src.disposable) rmSync(zipPath, { force: true });
      continue;
    }
    for (const entry of listed.filter((e) => e.startsWith('us/') && e.endsWith('.csv') && !e.startsWith('summary/'))) {
      const state = entry.split('/')[1];
      if (args.states && !args.states.has(state)) continue;
      let n: number | null;
      try {
        const out = await ingestEntry(db, zipPath, entry, state, stage);
        n = out === null ? null : out.added;
        if (out) duplicatesDropped += out.duplicates;
      } catch (err) {
        console.error(`\n  ${entry}: ${(err as Error).message}; FAILED`);
        failures.push(`${entry}: ${(err as Error).message}`);
        continue;
      }
      if (n === null) {
        alreadyImported++;
        continue;
      }
      if (n > 0) {
        grand += n;
        perState[state.toUpperCase()] = (perState[state.toUpperCase()] ?? 0) + n;
        process.stdout.write(`\r  ${entry.padEnd(46)} ${n.toLocaleString().padStart(10)}  (total ${grand.toLocaleString()})   `);
      }
    }
    console.log();
    if (src.disposable) rmSync(zipPath, { force: true });
  }

  console.log('\nindexing…');
  db.exec('CREATE INDEX IF NOT EXISTS idx_points_cell ON points(cell)');
  db.exec('PRAGMA optimize');
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  db.close();

  if (duplicatesDropped > 0) console.log(`${duplicatesDropped.toLocaleString()} duplicate row(s) inside county files were dropped.`);
  if (alreadyImported > 0) console.log(`${alreadyImported} county file(s) were already in the index and were skipped.`);
  const incomplete = failures.length > 0;
  if (incomplete) {
    console.error(`\n${failures.length} source(s) failed:\n${failures.map((f) => `  - ${f}`).join('\n')}`);
  }

  if (!args.append) {
    // Publish only a complete build: a failed region would otherwise replace a
    // good index with one that silently lacks it.
    if (grand === 0 || (incomplete && !args.allowPartial)) {
      for (const f of [outPath, `${outPath}-wal`, `${outPath}-shm`]) rmSync(f, { force: true });
      console.error(
        grand === 0
          ? 'no points were ingested; nothing was written'
          : `build incomplete; the existing index at ${DB_PATH} was left untouched (rerun, or pass --allow-partial to publish what was ingested)`,
      );
      process.exit(1);
    }
    for (const f of [`${outPath}-wal`, `${outPath}-shm`]) rmSync(f, { force: true });
    renameSync(outPath, DB_PATH);
  }

  console.log('\n--- points per state ---');
  for (const [st, n] of Object.entries(perState).sort((a, b) => b[1] - a[1])) console.log(`  ${st}  ${n.toLocaleString()}`);
  console.log(`\ntotal: ${grand.toLocaleString()} points -> ${DB_PATH}`);
  console.log(`db size: ${Math.round(statSync(DB_PATH).size / 1024 / 1024)} MB`);
  if (incomplete) process.exit(1);
}

await main();

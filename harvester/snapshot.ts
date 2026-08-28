import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Where captures live. Read through a function, and read fresh each call,
 * so a test can point it at a temp directory by setting the env var —
 * a top-level const would be frozen at import time, before any test body
 * runs.
 *
 * This exists because tests/harvester.test.ts used to delete the ENTIRE
 * snapshots directory in a before() hook to get a clean slate, which also
 * deleted all 55 production baselines. Worse, its fixtures write under
 * 'oh-municipal-rates' — a real registered source id — so even a targeted
 * delete would have corrupted the genuine Ohio baseline. Isolation is the
 * only correct answer; a test must not be able to erase what the monitor
 * remembers.
 */
function snapshotRoot(): string {
  return process.env.HARVESTER_SNAPSHOT_ROOT ?? join(import.meta.dirname, 'snapshots');
}

/**
 * Immutable, content-addressed captures of every source we read.
 *
 * The engine never reaches the network, so a snapshot is the only evidence of
 * what a taxing authority actually published on a given day. When an auditor
 * asks why a March cheque used 2.00% rather than 2.25%, the answer has to be a
 * file, not "that is what the website said at the time".
 */

export interface Snapshot {
  sourceId: string;
  fetchedAt: string; // ISO instant
  sha256: string;
  bytes: number;
  path: string;
}

export function hash(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

export function writeSnapshot(
  sourceId: string,
  content: string | Buffer,
  fetchedAt = new Date().toISOString(),
): Snapshot {
  const dir = join(snapshotRoot(), sourceId);
  mkdirSync(dir, { recursive: true });

  const sha = hash(content);
  const stamp = fetchedAt.replace(/[:.]/g, '-');
  const path = join(dir, `${stamp}.${sha.slice(0, 12)}.raw`);

  // Content-addressed: an identical body on a later day is not rewritten,
  // so the snapshot directory records genuine changes rather than fetch runs.
  const existing = findByHash(sourceId, sha);
  if (existing) return existing;

  writeFileSync(path, content);
  const meta: Snapshot = {
    sourceId,
    fetchedAt,
    sha256: sha,
    bytes: Buffer.byteLength(content as string),
    path,
  };
  writeFileSync(`${path}.meta.json`, JSON.stringify(meta, null, 2));
  return meta;
}

function listMeta(sourceId: string): Snapshot[] {
  const dir = join(snapshotRoot(), sourceId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.meta.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Snapshot)
    .sort((a, b) => a.fetchedAt.localeCompare(b.fetchedAt));
}

export function findByHash(sourceId: string, sha: string): Snapshot | null {
  return listMeta(sourceId).find((s) => s.sha256 === sha) ?? null;
}

export function latestSnapshot(sourceId: string): Snapshot | null {
  const all = listMeta(sourceId);
  return all.length ? all[all.length - 1] : null;
}

/**
 * Has this source changed since we last looked?
 *
 * A cheap hash comparison is the first gate. It answers "is there anything to
 * review at all" without parsing, which matters when the answer is no on the
 * overwhelming majority of daily runs.
 */
export function hasChanged(sourceId: string, content: string | Buffer): boolean {
  const latest = latestSnapshot(sourceId);
  if (!latest) return true;
  return latest.sha256 !== hash(content);
}

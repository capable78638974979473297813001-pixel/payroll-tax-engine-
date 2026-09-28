import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * The durable-file primitives behind the JSON stores (api/keys.ts and
 * site/lib/store.ts). Three guarantees a plain readFileSync/writeFileSync
 * pair does not give:
 *
 *   1. Atomic replacement. A write goes to a temp file in the same
 *      directory, is fsynced, then renamed over the real file. A crash or
 *      full disk mid-write leaves the previous file intact instead of a
 *      truncated one.
 *   2. Fail closed on corruption. A file that exists but does not parse
 *      throws StoreCorruptError. The old behaviour -- treat it as empty --
 *      meant the next write saved an empty database over every account,
 *      key and billing record.
 *   3. Cross-process mutual exclusion. withFileLock() holds an exclusive
 *      lock file for the whole read-modify-write, so two processes (or two
 *      instances on one shared volume) can't each load the same state and
 *      overwrite the other's change. Inside a single process the
 *      read-modify-write is synchronous, so it can't interleave anyway.
 *
 * Still a pilot-scale design: every write rewrites the whole file. At real
 * volume move to a database; the load/save seam is the only thing that
 * changes.
 */

export class StoreCorruptError extends Error {
  readonly file: string;
  constructor(file: string, cause: unknown) {
    super(
      `Refusing to use ${file}: it exists but is not valid JSON (${cause instanceof Error ? cause.message : String(cause)}). ` +
        'Nothing was overwritten. Restore it from a backup (or move it aside to start empty) and restart.',
    );
    this.name = 'StoreCorruptError';
    this.file = file;
  }
}

/** Parse a JSON file. Missing -> null. Present but unparseable -> throws StoreCorruptError. */
export function readJsonFile<T>(file: string): T | null {
  if (!existsSync(file)) return null;
  const raw = readFileSync(file, 'utf8');
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    throw new StoreCorruptError(file, err);
  }
}

/** Write JSON atomically: temp file + fsync + rename over the target. */
export function writeJsonFileAtomic(file: string, value: unknown): void {
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  const fd = openSync(tmp, 'w', 0o600);
  try {
    writeSync(fd, JSON.stringify(value, null, 2));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    renameSync(tmp, file);
  } catch (err) {
    try { unlinkSync(tmp); } catch { /* already gone */ }
    throw err;
  }
}

const sleeper = new Int32Array(new SharedArrayBuffer(4));
function sleepSync(ms: number): void {
  Atomics.wait(sleeper, 0, 0, ms);
}

/** A lock older than this is assumed to belong to a crashed process. */
const STALE_LOCK_MS = 30_000;
const LOCK_TIMEOUT_MS = 10_000;

// Re-entrancy: a withDb() nested inside another in the same process must
// not deadlock on its own lock.
const held = new Map<string, number>();

/**
 * Run fn while holding an exclusive lock on `file` (via `file.lock`,
 * created with O_EXCL). Synchronous on purpose so callers keep their
 * synchronous withDb() contract.
 */
export function withFileLock<T>(file: string, fn: () => T): T {
  const lock = `${file}.lock`;
  const depth = held.get(lock) ?? 0;
  if (depth > 0) {
    held.set(lock, depth + 1);
    try { return fn(); } finally { held.set(lock, depth); }
  }

  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  let fd: number | null = null;
  let wait = 2;
  while (fd === null) {
    try {
      fd = openSync(lock, 'wx', 0o600);
      writeSync(fd, `${process.pid} ${new Date().toISOString()}\n`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      try {
        if (Date.now() - statSync(lock).mtimeMs > STALE_LOCK_MS) {
          unlinkSync(lock);
          continue;
        }
      } catch { /* released between our open and stat: just retry */ }
      if (Date.now() > deadline) throw new Error(`Timed out waiting for the store lock ${lock}.`);
      sleepSync(wait);
      wait = Math.min(wait * 2, 50);
    }
  }

  held.set(lock, 1);
  try {
    return fn();
  } finally {
    held.delete(lock);
    closeSync(fd);
    try { unlinkSync(lock); } catch { /* removed as stale by another process */ }
  }
}

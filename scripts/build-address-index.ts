import { DatabaseSync } from 'node:sqlite';
import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { spawn, spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { INDEX_FORMAT, OPENADDRESSES_REGIONS, openAddressesRegionUrl, parseOpenAddressesLine, toMicro } from './address-index-lib.ts';

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
 * node:sqlite is a Node 22+ built-in, so this adds no npm dependency. Python
 * is used only as a zip reader (Node has no built-in zip).
 *
 *   node scripts/build-address-index.ts [--states MI,PA,HI] [--download] [--keep] [--append]
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

const BATCH_ROWS = 50_000;

interface Args {
  states: Set<string> | null;
  append: boolean;
  download: boolean;
  keep: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--states');
  return {
    states: i !== -1 && argv[i + 1] ? new Set(argv[i + 1].split(',').map((s) => s.trim().toLowerCase())) : null,
    append: argv.includes('--append'),
    download: argv.includes('--download'),
    keep: argv.includes('--keep'),
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
  const existing = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='meta'").get();
  if (!fresh && !existing && db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='points'").get()) {
    throw new Error(`${path} is an older format-1 index; rebuild it instead of appending (drop --append).`);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sources (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS points (
      cell   INTEGER NOT NULL,
      lat    INTEGER NOT NULL,
      lon    INTEGER NOT NULL,
      number TEXT,
      street TEXT,
      unit   TEXT,
      city   TEXT,
      state  TEXT NOT NULL,
      source INTEGER NOT NULL
    );
  `);
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('format', ?)").run(String(INDEX_FORMAT));
  return db;
}

/** source name -> id, creating the row the first time a county file is seen. */
function sourceIdFor(db: DatabaseSync, cache: Map<string, number>, name: string): number {
  const hit = cache.get(name);
  if (hit !== undefined) return hit;
  db.prepare('INSERT OR IGNORE INTO sources (name) VALUES (?)').run(name);
  const row = db.prepare('SELECT id FROM sources WHERE name = ?').get(name) as { id: number };
  cache.set(name, row.id);
  return row.id;
}

/** Stream one CSV out of a zip, line by line, without unpacking the archive or holding it in memory. */
async function ingestEntry(
  db: DatabaseSync,
  sourceCache: Map<string, number>,
  zipPath: string,
  entry: string,
  state: string,
  insert: ReturnType<DatabaseSync['prepare']>,
): Promise<number> {
  const child = spawn(
    PYTHON,
    ['-c', 'import zipfile,sys,shutil\nz=zipfile.ZipFile(sys.argv[1])\nshutil.copyfileobj(z.open(sys.argv[2]), sys.stdout.buffer)', zipPath, entry],
    { stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const sourceId = sourceIdFor(db, sourceCache, `OpenAddresses ${entry.replace(/^us\//, '').replace(/\.csv$/, '')}`);
  const stateCode = state.toUpperCase();
  let n = 0;
  let first = true;
  let inTx = false;
  for await (const line of lines) {
    if (first) {
      first = false;
      continue;
    }
    const row = parseOpenAddressesLine(line);
    if (!row) continue;
    if (!inTx) {
      db.exec('BEGIN');
      inTx = true;
    }
    insert.run(row.cell, toMicro(row.lat), toMicro(row.lon), row.number, row.street, row.unit, row.city, stateCode, sourceId);
    n++;
    if (n % BATCH_ROWS === 0) {
      db.exec('COMMIT');
      inTx = false;
    }
  }
  if (inTx) db.exec('COMMIT');
  return n;
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
  const insert = db.prepare(
    'INSERT INTO points (cell,lat,lon,number,street,unit,city,state,source) VALUES (?,?,?,?,?,?,?,?,?)',
  );
  const sourceCache = new Map<string, number>();
  let grand = 0;
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
      console.error(`  ${(err as Error).message}; skipped`);
      continue;
    }
    console.log(`  ${Math.round(statSync(zipPath).size / 1024 / 1024)} MB`);
    const listed = listZipEntries(zipPath);
    if (listed === null) {
      console.log('  unreadable; skipped');
      continue;
    }
    for (const entry of listed.filter((e) => e.startsWith('us/') && e.endsWith('.csv') && !e.startsWith('summary/'))) {
      const state = entry.split('/')[1];
      if (args.states && !args.states.has(state)) continue;
      const n = await ingestEntry(db, sourceCache, zipPath, entry, state, insert);
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

  if (grand === 0 && !args.append) {
    rmSync(outPath, { force: true });
    console.error('no points were ingested; nothing was written');
    process.exit(1);
  }
  if (!args.append) {
    for (const f of [`${outPath}-wal`, `${outPath}-shm`]) rmSync(f, { force: true });
    renameSync(outPath, DB_PATH);
  }

  console.log('\n--- points per state ---');
  for (const [st, n] of Object.entries(perState).sort((a, b) => b[1] - a[1])) console.log(`  ${st}  ${n.toLocaleString()}`);
  console.log(`\ntotal: ${grand.toLocaleString()} points -> ${DB_PATH}`);
  console.log(`db size: ${Math.round(statSync(DB_PATH).size / 1024 / 1024)} MB`);
}

await main();

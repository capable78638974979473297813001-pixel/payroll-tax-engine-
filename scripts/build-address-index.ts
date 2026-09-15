import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { spawn, spawnSync } from 'node:child_process';

/**
 * Turn the OpenAddresses bulk extracts into a local, queryable address
 * index — the thing that makes rooftop precision possible in the states
 * the National Address Database never received.
 *
 * WHY THIS EXISTS, measured rather than assumed. NAD is aggregated from
 * states that volunteer, and a 5km-box probe over each city (this
 * session) found ZERO NAD points in Detroit, Grand Rapids, Pittsburgh,
 * Honolulu, Las Vegas, Manchester, Charleston, Boise, Jackson and Miami.
 * Philadelphia and Hartford are dense. So contribution is county-by-
 * county even within one state, and no amount of retrying the NAD service
 * fixes a county that never sent its data.
 *
 * OpenAddresses aggregates the SAME kind of authoritative local address
 * files, but directly from the counties, so it carries what NAD is
 * missing: Allegheny County alone (Pittsburgh, zero NAD points) has
 * 623,653 points here, including 600 GRANT ST.
 *
 * SHAPE OF THE DATA: each regional zip holds us/<state>/<county>.csv with
 * a fixed header — LON,LAT,NUMBER,STREET,UNIT,CITY,DISTRICT,REGION,
 * POSTCODE,ID,HASH.
 *
 * SHAPE OF THE INDEX: one SQLite file, keyed by a rounded coordinate
 * CELL, not by address text. The database's only job is to narrow ~100M
 * points to the ~200 in a neighbourhood; deciding which of those 200 IS
 * the address is rooftop.ts's matchAddressPoint(), which already has the
 * directional/street-type/unit guards and should stay the single place
 * that judgement lives.
 *
 * node:sqlite is a Node 22+ BUILT-IN, so this adds no npm dependency —
 * this project has none and should keep it that way.
 *
 *   node scripts/build-address-index.ts [--states MI,PA,HI] [--all]
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = join(HERE, '..', 'data', 'address-points', 'raw');
const DB_PATH = join(HERE, '..', 'data', 'address-points', 'address-points.db');

/**
 * Cell size in degrees. 0.01 deg is ~1.1km of latitude — comfortably
 * larger than rooftop.ts's own 300m search radius, so a query needs at
 * most the 3x3 block of cells around a point, and small enough that a
 * dense downtown cell stays a few thousand rows rather than a million.
 */
const CELL = 0.01;

export function cellKey(lat: number, lon: number): string {
  return `${Math.floor(lat / CELL)}:${Math.floor(lon / CELL)}`;
}

interface Args { states: Set<string> | null; append: boolean; }

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const all = argv.includes('--all');
  const append = argv.includes('--append');
  const i = argv.indexOf('--states');
  if (!all && i !== -1 && argv[i + 1]) {
    return { states: new Set(argv[i + 1].split(',').map((s) => s.trim().toLowerCase())), append };
  }
  return { states: null, append };
}

/**
 * Stream one CSV out of a zip WITHOUT unpacking the whole archive.
 * Python is used purely as a zip reader here: Node has no built-in zip,
 * and adding an npm dependency for it would break this project's own
 * zero-dependency rule. Everything downstream is Node.
 */
function listZipEntries(zipPath: string): string[] | null {
  const out = spawnSync('python', ['-c',
    `import zipfile,sys\nfor n in zipfile.ZipFile(sys.argv[1]).namelist():\n  print(n)`,
    zipPath], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  // A still-downloading archive has no readable central directory yet.
  // That is a "come back later", not a failure worth aborting the whole
  // build over — the other regions are independent of it.
  if (out.status !== 0) return null;
  return out.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
}

function openDb(append: boolean): DatabaseSync {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  // Bulk-load settings. This file is a derived artifact rebuilt from the
  // extracts on demand, so full durability buys nothing -- but journal_mode
  // OFF does NOT: an interrupted build then leaves a database that cannot
  // even be OPENED read-only, because SQLite needs write access to roll the
  // partial transaction back. Hit exactly that. WAL keeps the build fast,
  // stays recoverable, and lets a reader in while a build is running.
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = OFF');
  db.exec('PRAGMA cache_size = -200000');
  // Rebuild from scratch by default. Appending silently doubles the table
  // on a re-run -- caught exactly that way on the first test -- so
  // --append is opt-in, for topping up states a previous run missed.
  if (!append) db.exec('DROP TABLE IF EXISTS points');
  db.exec(`
    CREATE TABLE IF NOT EXISTS points (
      cell   TEXT NOT NULL,
      lat    REAL NOT NULL,
      lon    REAL NOT NULL,
      number TEXT,
      street TEXT,
      unit   TEXT,
      city   TEXT,
      state  TEXT NOT NULL,
      source TEXT NOT NULL
    )
  `);
  return db;
}

/**
 * Commit every this-many rows rather than one giant transaction spanning
 * the whole file — a few OpenAddresses county files run past a million
 * rows (Harris County, TX alone is 1.29M), and this keeps memory bounded
 * and progress visible the same way build-nad-index.ts's own BATCH_SIZE
 * does for its far larger single file.
 */
const BATCH_SIZE = 50_000;

/**
 * Stream one CSV entry's bytes out of the zip via a PIPED python process
 * and read it line-by-line, rather than buffering the whole entry into one
 * JS string via spawnSync + toString(). This is not an optimization — it
 * fixes a real crash: several OpenAddresses county/state files exceed
 * Node's ~512MB (0x1fffffe8 character) string limit on toString(),
 * confirmed live: us/fl/statewide.csv (932MB), us/fl/statewide2.csv
 * (678MB), us/fl/_loveland.csv (735MB), and us/ny/statewide.csv (511MB)
 * all crashed the earlier spawnSync-based version outright with
 * "Cannot create a string longer than 0x1fffffe8 characters" — which
 * doesn't just skip that one file, it kills the ENTIRE build process, so
 * every county queued after the first oversized file (in practice: most of
 * Florida and New York, then everything alphabetically after) never got
 * indexed at all. A streaming readline interface, the same approach
 * build-nad-index.ts already uses successfully for a single 41GB file, has
 * no such limit — peak memory is O(batch size), not O(file size).
 */
async function ingestCsv(
  db: DatabaseSync,
  zipPath: string,
  entry: string,
  state: string,
  insert: ReturnType<DatabaseSync['prepare']>,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const py = spawn('python', ['-u', '-c', `
import sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
f = z.open(sys.argv[2])
out = sys.stdout.buffer
for line in f:
    out.write(line)
`, zipPath, entry], { stdio: ['ignore', 'pipe', 'inherit'] });

    const rl = createInterface({ input: py.stdout });
    const source = entry.replace(/^us\//, '').replace(/\.csv$/, '');
    let n = 0;
    let first = true;
    let inTxn = false;
    let settled = false;

    rl.on('line', (line) => {
      if (first) { first = false; return; }
      if (!line) return;
      // OpenAddresses CSVs are simple: no embedded commas in these columns
      // in practice, and a split is ~20x faster than a full CSV parser over
      // 100M rows. A malformed row is skipped, not guessed at.
      const f = line.split(',');
      if (f.length < 6) return;
      const lon = Number(f[0]);
      const lat = Number(f[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return;
      const number = f[2]?.trim();
      const street = f[3]?.trim();
      if (!number && !street) return;
      if (!inTxn) { db.exec('BEGIN'); inTxn = true; }
      insert.run(cellKey(lat, lon), lat, lon, number || null, street || null,
        f[4]?.trim() || null, f[5]?.trim() || null, state.toUpperCase(), `OpenAddresses ${source}`);
      n++;
      if (n % BATCH_SIZE === 0) { db.exec('COMMIT'); inTxn = false; }
    });

    rl.on('close', () => {
      if (inTxn) db.exec('COMMIT');
      if (!settled) { settled = true; resolve(n); }
    });
    py.on('error', (err) => {
      if (!settled) { settled = true; reject(err); }
    });
  });
}

const args = parseArgs();
if (!existsSync(RAW_DIR)) {
  console.error(`No extracts at ${RAW_DIR}. Download them first:\n` +
    `  curl -L -o data/address-points/raw/us_northeast.zip https://data.openaddresses.io/openaddr-collected-us_northeast.zip`);
  process.exit(1);
}

const zips = readdirSync(RAW_DIR).filter((f) => f.endsWith('.zip'));
if (zips.length === 0) { console.error(`No .zip files in ${RAW_DIR}`); process.exit(1); }

const db = openDb(args.append);
const insert = db.prepare(
  'INSERT INTO points (cell,lat,lon,number,street,unit,city,state,source) VALUES (?,?,?,?,?,?,?,?,?)',
);

let grand = 0;
const perState: Record<string, number> = {};

for (const zip of zips) {
  const zipPath = join(RAW_DIR, zip);
  const sizeMb = Math.round(statSync(zipPath).size / 1024 / 1024);
  console.log(`\n=== ${zip} (${sizeMb} MB)`);
  const listed = listZipEntries(zipPath);
  if (listed === null) {
    console.log('  still downloading or unreadable — skipped');
    continue;
  }
  const entries = listed.filter(
    (e) => e.startsWith('us/') && e.endsWith('.csv') && !e.startsWith('summary/'),
  );

  for (const entry of entries) {
    const state = entry.split('/')[1];
    if (args.states && !args.states.has(state)) continue;
    // One bad entry (a genuinely corrupt zip member, or python itself
    // failing to spawn) must not take down a build that is otherwise
    // hours into 90M+ rows — reported and skipped, same "note it and move
    // on" discipline this project uses for every other live-data source.
    let n = 0;
    try {
      n = await ingestCsv(db, zipPath, entry, state, insert);
    } catch (err) {
      console.log(`\n  ${entry}: FAILED (${err instanceof Error ? err.message : String(err)}) — skipped`);
      continue;
    }
    if (n > 0) {
      grand += n;
      perState[state.toUpperCase()] = (perState[state.toUpperCase()] ?? 0) + n;
      process.stdout.write(`\r  ${entry.padEnd(46)} ${n.toLocaleString().padStart(10)}  (total ${grand.toLocaleString()})   `);
    }
  }
  console.log();
}

console.log('\nindexing…');
db.exec('CREATE INDEX IF NOT EXISTS idx_points_cell ON points(cell)');
db.exec('PRAGMA optimize');
db.close();

console.log('\n--- points per state ---');
for (const [st, n] of Object.entries(perState).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${st}  ${n.toLocaleString()}`);
}
console.log(`\ntotal: ${grand.toLocaleString()} points -> ${DB_PATH}`);
console.log(`db size: ${Math.round(statSync(DB_PATH).size / 1024 / 1024)} MB`);

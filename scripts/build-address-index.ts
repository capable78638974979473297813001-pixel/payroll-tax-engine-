import { DatabaseSync } from 'node:sqlite';
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { spawnSync } from 'node:child_process';

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

async function ingestCsv(
  db: DatabaseSync,
  zipPath: string,
  entry: string,
  state: string,
  insert: ReturnType<DatabaseSync['prepare']>,
): Promise<number> {
  const py = spawnSync('python', ['-c',
    `import zipfile,sys\nz=zipfile.ZipFile(sys.argv[1])\nsys.stdout.buffer.write(z.read(sys.argv[2]))`,
    zipPath, entry], { maxBuffer: 1024 * 1024 * 1024 });
  if (py.status !== 0) return 0;

  const text = py.stdout.toString('utf8');
  let n = 0;
  let first = true;
  const source = entry.replace(/^us\//, '').replace(/\.csv$/, '');

  db.exec('BEGIN');
  for (const line of text.split('\n')) {
    if (first) { first = false; continue; }
    if (!line) continue;
    // OpenAddresses CSVs are simple: no embedded commas in these columns
    // in practice, and a split is ~20x faster than a full CSV parser over
    // 100M rows. A malformed row is skipped, not guessed at.
    const f = line.split(',');
    if (f.length < 6) continue;
    const lon = Number(f[0]);
    const lat = Number(f[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) continue;
    const number = f[2]?.trim();
    const street = f[3]?.trim();
    if (!number && !street) continue;
    insert.run(cellKey(lat, lon), lat, lon, number || null, street || null,
      f[4]?.trim() || null, f[5]?.trim() || null, state.toUpperCase(), `OpenAddresses ${source}`);
    n++;
  }
  db.exec('COMMIT');
  return n;
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
    const n = await ingestCsv(db, zipPath, entry, state, insert);
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

import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

/**
 * Loads the National Address Database's own BULK export into the same
 * local index scripts/build-address-index.ts builds from OpenAddresses —
 * same `points` table, same cell scheme, so local-address-index.ts's
 * localAddressPointsNear() picks up both with no changes.
 *
 * WHY THIS EXISTS ALONGSIDE THE LIVE NAD QUERY IN rooftop.ts: that query
 * only ever asks the ArcGIS FeatureServer for a 300m (or 600m) box around
 * ONE address at a time. That's fine for resolving one paycheck, but it
 * means NAD's own ~80-98M points were never actually stored anywhere in
 * this project — every run re-fetches, and an outage on DOT's service
 * costs this tier entirely for that run. DOT also publishes the whole
 * database as a flat text file (transportation.gov/gis/national-address-
 * database), so this script downloads that once and gives NAD the same
 * standing OpenAddresses already has: a local, offline copy.
 *
 * SHAPE OF THE SOURCE: one ~41GB CSV (TXT/NAD_r23.txt inside the zip at
 * data/address-points/nad-raw/), comma-separated, unquoted, with a State
 * column and a pre-composed StNam_Full street name — so unlike NAD's own
 * live ArcGIS response (rooftop.ts's composeStreet(), built from five
 * separate directional/type/name columns), no recomposition is needed
 * here; StNam_Full already reads "3RD Avenue" the way an address is
 * written.
 *
 * WHY A STREAMING PIPE, NOT spawnSync + one big buffer (build-address-
 * index.ts's own approach for OpenAddresses' per-COUNTY csvs): those
 * files run tens of MB; this one is one file, 41GB uncompressed. Reading
 * it whole would mean a 41GB Node string. Python instead streams the zip
 * entry (ZipFile.open() decompresses incrementally, never materializing
 * the whole thing) line by line to its own stdout; Node reads that
 * through readline and commits in batches, so peak memory here is O(batch
 * size), not O(file size).
 *
 *   node scripts/build-nad-index.ts
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ZIP_PATH = join(HERE, '..', 'data', 'address-points', 'nad-raw', 'NAD_r23.zip');
const DB_PATH = join(HERE, '..', 'data', 'address-points', 'address-points.db');
const ZIP_ENTRY = 'TXT/NAD_r23.txt';

/** Must match build-address-index.ts's own CELL and local-address-index.ts's CELL — a mismatch silently returns nothing at read time. */
const CELL = 0.01;

function cellKey(lat: number, lon: number): string {
  return `${Math.floor(lat / CELL)}:${Math.floor(lon / CELL)}`;
}

/** Commit every this-many rows rather than once per row (way too slow over ~80-98M rows) or once for the whole file (a crash partway loses everything already inserted). */
const BATCH_SIZE = 50_000;

if (!existsSync(ZIP_PATH)) {
  console.error(`No NAD extract at ${ZIP_PATH}. Download it first:\n` +
    `  curl -L -o "${ZIP_PATH}" https://data.transportation.gov/download/fc2s-wawr/application/x-zip-compressed`);
  process.exit(1);
}

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA synchronous = OFF');
db.exec('PRAGMA cache_size = -200000');
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
const insert = db.prepare(
  'INSERT INTO points (cell,lat,lon,number,street,unit,city,state,source) VALUES (?,?,?,?,?,?,?,?,?)',
);

// Column indices in TXT/NAD_r23.txt's own header — verified by reading it
// directly (python -c "...z.open(entry).read(4000)..."), not assumed:
//   OID_,AddNum_Pre,Add_Number,AddNum_Suf,AddNo_Full,St_PreMod,St_PreDir,
//   St_PreTyp,St_PreSep,St_Name,St_PosTyp,St_PosDir,St_PosMod,StNam_Full,
//   Building,Floor,Unit,Room,Seat,Addtl_Loc,SubAddress,LandmkName,County,
//   Inc_Muni,Post_City,Census_Plc,Uninc_Comm,Nbrhd_Comm,NatAmArea,NatAmSub,
//   Urbnztn_PR,PlaceOther,PlaceNmTyp,State,Zip_Code,Plus_4,UUID,AddAuth,
//   AddrRefSys,Longitude,Latitude,NatGrid,Elevation,Placement,AddrPoint,
//   Related_ID,RelateType,ParcelSrc,Parcel_ID,AddrClass,Lifecycle,
//   Effective,Expire,DateUpdate,AnomStatus,LocatnDesc,Addr_Type,DeliverTyp,
//   NAD_Source,DataSet_ID
const COL = {
  addNoFull: 4,
  stNamFull: 13,
  unit: 16,
  county: 22,
  incMuni: 23,
  postCity: 24,
  state: 33,
  longitude: 39,
  latitude: 40,
  nadSource: 58,
};

const py = spawn('python', ['-u', '-c', `
import sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
f = z.open(sys.argv[2])
out = sys.stdout.buffer
for line in f:
    out.write(line)
`, ZIP_PATH, ZIP_ENTRY], { stdio: ['ignore', 'pipe', 'inherit'] });

const rl = createInterface({ input: py.stdout });

let n = 0;
let skipped = 0;
let first = true;
let inTxn = false;
const perState: Record<string, number> = {};
const startedAt = Date.now();

rl.on('line', (line) => {
  if (first) { first = false; return; } // header
  if (!line) return;

  // Same trade-off build-address-index.ts already makes: a naive split is
  // ~20x faster than a real CSV parser over ~80-98M rows, and a malformed
  // row (an embedded comma in a landmark/place name field, chiefly) is
  // skipped rather than guessed at. Verified against a sample of this
  // file's own rows: none of the columns this script actually reads
  // (house number, composed street, unit, city names, state, zip/plus-4
  // separated fields, lat/lon) carry a comma in practice.
  const f = line.split(',');
  // Need every column up through NAD_Source (index 58); a shorter row is
  // truncated/malformed and skipped rather than read out of bounds.
  if (f.length < 59) { skipped++; return; }

  const lon = Number(f[COL.longitude]);
  const lat = Number(f[COL.latitude]);
  // lon === 0 alone (not just both zero) is the real tell for a shifted
  // row: found live in this file — a Warren County, OH "Village"-type
  // place record where one of the rarely-populated optional columns
  // between StNam_Full and PlaceNmTyp was OMITTED rather than left empty,
  // shifting every later column left by one and landing PlaceNmTyp's own
  // "VILLAGE" text in the State column, State's own text in Longitude, and
  // Longitude's real value in Latitude (Cincinnati-area -84.3 masquerading
  // as a latitude). No legitimate US or territory address sits on the
  // prime meridian, so lon === 0 alone is suf­ficient to reject it without
  // an expensive full re-parse of every column for a drift check.
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lon === 0) { skipped++; return; }

  const number = f[COL.addNoFull]?.trim();
  const street = f[COL.stNamFull]?.trim();
  if (!number && !street) { skipped++; return; }

  const state = f[COL.state]?.trim().toUpperCase();
  // A 2-letter USPS/territory code only — the same shift bug that produces
  // lon === 0 can also (rarely) land a non-numeric field in State without
  // zeroing longitude; length is a cheap second guard against that.
  if (!state || state.length !== 2) { skipped++; return; }

  const city = f[COL.incMuni]?.trim() || f[COL.postCity]?.trim() || null;
  const nadSource = f[COL.nadSource]?.trim() || f[COL.county]?.trim() || 'Unknown';

  if (!inTxn) { db.exec('BEGIN'); inTxn = true; }
  insert.run(cellKey(lat, lon), lat, lon, number || null, street || null,
    f[COL.unit]?.trim() || null, city, state, `NAD ${nadSource}`);
  n++;
  perState[state] = (perState[state] ?? 0) + 1;

  if (n % BATCH_SIZE === 0) {
    db.exec('COMMIT');
    inTxn = false;
    const elapsed = (Date.now() - startedAt) / 1000;
    process.stdout.write(`\r  ${n.toLocaleString().padStart(12)} rows (${skipped.toLocaleString()} skipped) — ${(n / elapsed).toFixed(0)}/s   `);
  }
});

rl.on('close', () => {
  if (inTxn) db.exec('COMMIT');
  console.log('\n\nindexing…');
  db.exec('CREATE INDEX IF NOT EXISTS idx_points_cell ON points(cell)');
  db.exec('PRAGMA optimize');
  db.close();

  console.log('\n--- NAD points per state (this run only) ---');
  for (const [st, c] of Object.entries(perState).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${st}  ${c.toLocaleString()}`);
  }
  console.log(`\ntotal: ${n.toLocaleString()} points, ${skipped.toLocaleString()} skipped -> ${DB_PATH}`);
  console.log(`db size: ${Math.round(statSync(DB_PATH).size / 1024 / 1024)} MB`);
});

py.on('error', (err) => {
  console.error('python process failed:', err);
  process.exit(1);
});

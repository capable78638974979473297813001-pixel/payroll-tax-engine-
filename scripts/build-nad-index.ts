import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';

import { INSERT_POINT_SQL, cellId, ensureIndexSchema, sourceFor, splitCsvLine, toMicro, zip5 } from './address-index-lib.ts';

/**
 * Loads the National Address Database's own BULK export into the same
 * local index scripts/build-address-index.ts builds from OpenAddresses —
 * the same format-2 `points` table, cell scheme and `sources` table (both
 * scripts use address-index-lib.ts), so local-address-index.ts's
 * localAddressPointsNear() picks up both with no changes.
 *
 * Run the OpenAddresses build FIRST, then this: that build publishes a fresh
 * file, which would replace an index this had already written to. This script
 * appends to whatever format-2 index is at ADDRESS_INDEX_PATH (creating one if
 * none), and refuses a format-1 file instead of mixing encodings.
 *
 * Re-running is safe: a finished import is recorded in the index's `meta`
 * table and a second run does nothing. A run that was interrupted is reported,
 * and `--restart` removes its partial rows and starts over.
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
 *   node scripts/build-nad-index.ts [--restart]
 *
 * ADDRESS_INDEX_PATH sets the index file; NAD_ZIP_PATH the extract.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ZIP_PATH = process.env.NAD_ZIP_PATH ?? join(HERE, '..', 'data', 'address-points', 'nad-raw', 'NAD_r23.zip');
const DB_PATH = process.env.ADDRESS_INDEX_PATH ?? join(HERE, '..', 'data', 'address-points', 'address-points.db');
const ZIP_ENTRY = process.env.NAD_ZIP_ENTRY ?? 'TXT/NAD_r23.txt';
const IMPORT_KEY = `nad_import:${ZIP_ENTRY}`;

/** Commit every this-many rows rather than once per row (way too slow over ~80-98M rows) or once for the whole file (a crash partway loses everything already inserted). */
const BATCH_SIZE = 50_000;

function pythonBinary(): string {
  for (const candidate of ['python3', 'python']) {
    if (spawnSync(candidate, ['--version']).status === 0) return candidate;
  }
  throw new Error('Python is needed to read the zip extract, and neither python3 nor python is on PATH.');
}

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
try {
  ensureIndexSchema(db, DB_PATH);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

const state = db.prepare('SELECT value FROM meta WHERE key = ?').get(IMPORT_KEY) as { value: string } | undefined;
if (process.argv.includes('--restart')) {
  // A full scan, once, to take out whatever an interrupted run left behind.
  db.exec("DELETE FROM points WHERE source IN (SELECT id FROM sources WHERE name LIKE 'NAD %')");
  db.exec("DELETE FROM sources WHERE name LIKE 'NAD %'");
  db.prepare('DELETE FROM meta WHERE key = ?').run(IMPORT_KEY);
} else if (state?.value === 'done') {
  console.log(`${ZIP_ENTRY} is already in ${DB_PATH}; nothing to do (use --restart to reload it).`);
  db.close();
  process.exit(0);
} else if (state?.value === 'running') {
  console.error(`An earlier import of ${ZIP_ENTRY} did not finish, so ${DB_PATH} holds part of it. Rerun with --restart to remove that and start over.`);
  db.close();
  process.exit(1);
}
db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, 'running')").run(IMPORT_KEY);

const insert = db.prepare(INSERT_POINT_SQL);

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
  zip: 34,
  longitude: 39,
  latitude: 40,
  nadSource: 58,
};

const py = spawn(pythonBinary(), ['-u', '-c', `
import sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
f = z.open(sys.argv[2])
out = sys.stdout.buffer
for line in f:
    out.write(line)
`, ZIP_PATH, ZIP_ENTRY], { stdio: ['ignore', 'pipe', 'inherit'] });
const exited = new Promise<number | null>((resolve) => {
  py.on('error', () => resolve(-1));
  py.on('close', (code) => resolve(code));
});

const rl = createInterface({ input: py.stdout });

let n = 0;
let skipped = 0;
let first = true;
let inTxn = false;
const perState: Record<string, number> = {};
const perSource = new Map<number, number>();
const sourceIds = new Map<string, number>();
const startedAt = Date.now();

for await (const line of rl) {
  if (first) { first = false; continue; } // header
  if (!line) continue;

  // A plain split when the line has no quote character (all but a handful of
  // rows), a real CSV split when it does, so a quoted field is one field.
  // A malformed row is skipped rather than guessed at.
  const f = splitCsvLine(line);
  // Need every column up through NAD_Source (index 58); a shorter row is
  // truncated/malformed and skipped rather than read out of bounds.
  if (!f || f.length < 59) { skipped++; continue; }

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
  // prime meridian, so lon === 0 alone is sufficient to reject it without
  // an expensive full re-parse of every column for a drift check.
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lon === 0 || lat < -90 || lat > 90 || lon < -180 || lon > 180) { skipped++; continue; }

  const number = f[COL.addNoFull]?.trim();
  const street = f[COL.stNamFull]?.trim();
  if (!number && !street) { skipped++; continue; }

  const stateCode = f[COL.state]?.trim().toUpperCase();
  // A 2-letter USPS/territory code only — the same shift bug that produces
  // lon === 0 can also (rarely) land a non-numeric field in State without
  // zeroing longitude; length is a cheap second guard against that.
  if (!stateCode || stateCode.length !== 2) { skipped++; continue; }

  const city = f[COL.incMuni]?.trim() || f[COL.postCity]?.trim() || null;
  const nadSource = `NAD ${f[COL.nadSource]?.trim() || f[COL.county]?.trim() || 'Unknown'}`;

  if (!inTxn) { db.exec('BEGIN'); inTxn = true; }
  let sourceId = sourceIds.get(nadSource);
  if (sourceId === undefined) {
    sourceId = sourceFor(db, nadSource).id;
    sourceIds.set(nadSource, sourceId);
  }
  insert.run(cellId(lat, lon), toMicro(lat), toMicro(lon), number || null, street || null,
    f[COL.unit]?.trim() || null, city, stateCode, sourceId, zip5(f[COL.zip]));
  n++;
  perSource.set(sourceId, (perSource.get(sourceId) ?? 0) + 1);
  perState[stateCode] = (perState[stateCode] ?? 0) + 1;

  if (n % BATCH_SIZE === 0) {
    db.exec('COMMIT');
    inTxn = false;
    const elapsed = (Date.now() - startedAt) / 1000;
    process.stdout.write(`\r  ${n.toLocaleString().padStart(12)} rows (${skipped.toLocaleString()} skipped) — ${(n / elapsed).toFixed(0)}/s   `);
  }
}

if (inTxn) db.exec('COMMIT');
const code = await exited;
if (code !== 0) {
  // The marker stays 'running': this index holds a prefix of the file and must not be taken for a finished import.
  console.error(`\nreading ${ZIP_ENTRY} from ${ZIP_PATH} failed (exit ${code}); the import is incomplete. Rerun with --restart.`);
  db.close();
  process.exit(1);
}

db.exec('BEGIN');
const mark = db.prepare('UPDATE sources SET rows = ? WHERE id = ?');
for (const [id, count] of perSource) mark.run(count, id);
db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, 'done')").run(IMPORT_KEY);
db.exec('COMMIT');

console.log('\n\nindexing…');
db.exec('CREATE INDEX IF NOT EXISTS idx_points_cell ON points(cell)');
db.exec('PRAGMA optimize');
db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
db.close();

console.log('\n--- NAD points per state (this run only) ---');
for (const [st, c] of Object.entries(perState).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${st}  ${c.toLocaleString()}`);
}
console.log(`\ntotal: ${n.toLocaleString()} points, ${skipped.toLocaleString()} skipped -> ${DB_PATH}`);
console.log(`db size: ${Math.round(statSync(DB_PATH).size / 1024 / 1024)} MB`);

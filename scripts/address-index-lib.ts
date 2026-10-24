/**
 * Shared by scripts/build-address-index.ts and (as the single definition of
 * the cell scheme) geocode/local-address-index.ts, which keeps its own copy of
 * CELL and must stay equal to this one.
 */

import type { DatabaseSync } from 'node:sqlite';

/**
 * Cell size in degrees. 0.01 deg is ~1.1km of latitude: comfortably larger
 * than rooftop.ts's own 300m search radius, so a query needs at most the 3x3
 * block of cells around a point, and small enough that a dense downtown cell
 * stays a few thousand rows rather than a million.
 */
export const CELL = 0.01;

/** Format 1 (the original layout; the reader still opens it, but no builder writes it any more): the cell as text. */
export function cellKey(lat: number, lon: number): string {
  return `${Math.floor(lat / CELL)}:${Math.floor(lon / CELL)}`;
}

/**
 * INDEX FORMAT 2: the same cell, packed into one integer, with coordinates as
 * integer micro-degrees (about 11 cm) and the source as a small id into a
 * `sources` table. Measured on the real build: format 1 came to about 95 bytes
 * a row, roughly 21 GB for the ~220M points OpenAddresses publishes, plus a
 * second copy's worth of scratch space to build the index. Format 2 is
 * about a third smaller and its index is far smaller, which is what lets it
 * fit a 30 GB disk. Format 1 files still read fine.
 *
 * A latitude cell is -9000..8999 and a longitude cell -18000..17999, so the
 * packed value is below 1.8 billion and stays a 4-byte integer.
 */
export const INDEX_FORMAT = 2;
export const MICRO = 1_000_000;

export function cellId(lat: number, lon: number): number {
  return (Math.floor(lat / CELL) + 9000) * 100_000 + (Math.floor(lon / CELL) + 18_000);
}

export const toMicro = (degrees: number): number => Math.round(degrees * MICRO);
export const fromMicro = (micro: number): number => micro / MICRO;

export interface IndexRow {
  /** Format 2 packed cell id. */
  cell: number;
  /** Degrees; the builder stores them as micro-degrees. */
  lat: number;
  lon: number;
  number: string | null;
  street: string | null;
  unit: string | null;
  city: string | null;
  /** Five-digit ZIP as an integer, or null when the source has none. */
  zip: number | null;
}

/** A ZIP or ZIP+4 string to its five-digit integer, or null for anything else. */
export function zip5(raw: string | null | undefined): number | null {
  const m = /^\s*(\d{5})(?:-?\d{4})?\s*$/.exec(raw ?? '');
  return m ? Number(m[1]) : null;
}

/**
 * Split one CSV line into fields, honouring RFC 4180 quoting: a quoted field
 * may contain commas and doubled quotes ("\"MAIN ST, EAST\""). A line with no
 * quote character at all takes the plain split, which is the overwhelming
 * majority and ~20x faster than a parser over 100M rows. Returns null for a
 * line whose quoting never closes, so a malformed row is skipped, not guessed at.
 */
export function splitCsvLine(line: string): string[] | null {
  if (!line.includes('"')) return line.split(',');
  const fields: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"' && field === '') {
      inQuotes = true;
    } else if (c === ',') {
      fields.push(field);
      field = '';
    } else {
      field += c;
    }
  }
  if (inQuotes) return null;
  fields.push(field);
  return fields;
}

/**
 * One OpenAddresses CSV line (LON,LAT,NUMBER,STREET,UNIT,CITY,DISTRICT,
 * REGION,POSTCODE,ID,HASH) to a row, or null for anything that is not a usable
 * point. Quoted fields (a street like "MAIN ST, EAST") are honoured; a line
 * with no quotes takes the fast plain split. A malformed row is skipped,
 * never guessed at.
 */
export function parseOpenAddressesLine(line: string): IndexRow | null {
  if (!line) return null;
  const f = splitCsvLine(line);
  if (!f || f.length < 6) return null;
  const lon = Number(f[0]);
  const lat = Number(f[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  const number = f[2]?.trim();
  const street = f[3]?.trim();
  if (!number && !street) return null;
  return {
    cell: cellId(lat, lon),
    lat,
    lon,
    number: number || null,
    street: street || null,
    unit: f[4]?.trim() || null,
    city: f[5]?.trim() || null,
    zip: zip5(f[8]),
  };
}

/** The bulk extracts OpenAddresses publishes, one zip per US region. */
export const OPENADDRESSES_REGIONS = ['northeast', 'south', 'midwest', 'west'] as const;

export function openAddressesRegionUrl(region: string): string {
  return `https://data.openaddresses.io/openaddr-collected-us_${region}.zip`;
}

// ---------------------------------------------------------------------------
// The format-2 schema, shared by both builders so they write one index.
// ---------------------------------------------------------------------------

/**
 * Create the format-2 tables if they are missing, add the `zip` column to a
 * format-2 file built before it existed, and stamp the format. Refuses a
 * format-1 file: its cells and coordinates are a different encoding, so rows
 * in the new layout would be unreadable next to them.
 */
export function ensureIndexSchema(db: DatabaseSync, label = 'this file'): void {
  const hasTable = (name: string) =>
    Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name));
  if (!hasTable('meta') && hasTable('points')) {
    throw new Error(`${label} is an older format-1 index; rebuild it with scripts/build-address-index.ts instead of appending to it.`);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    -- rows is NULL until a source has been imported in full; it is how a repeat import is recognised.
    CREATE TABLE IF NOT EXISTS sources (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, rows INTEGER);
    CREATE TABLE IF NOT EXISTS points (
      cell   INTEGER NOT NULL,
      lat    INTEGER NOT NULL,
      lon    INTEGER NOT NULL,
      number TEXT,
      street TEXT,
      unit   TEXT,
      city   TEXT,
      state  TEXT NOT NULL,
      source INTEGER NOT NULL,
      zip    INTEGER
    );
  `);
  const sourceCols = db.prepare('PRAGMA table_info(sources)').all() as { name: string }[];
  if (!sourceCols.some((c) => c.name === 'rows')) db.exec('ALTER TABLE sources ADD COLUMN rows INTEGER');
  const pointCols = db.prepare('PRAGMA table_info(points)').all() as { name: string }[];
  if (!pointCols.some((c) => c.name === 'zip')) db.exec('ALTER TABLE points ADD COLUMN zip INTEGER');
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('format', ?)").run(String(INDEX_FORMAT));
}

/** The INSERT every builder uses for one point. */
export const INSERT_POINT_SQL =
  'INSERT INTO points (cell,lat,lon,number,street,unit,city,state,source,zip) VALUES (?,?,?,?,?,?,?,?,?,?)';

/** Name of a source row's id, creating the row on first sight. `imported` is true when that source was already loaded in full. */
export function sourceFor(db: DatabaseSync, name: string): { id: number; imported: boolean } {
  db.prepare('INSERT OR IGNORE INTO sources (name) VALUES (?)').run(name);
  const row = db.prepare('SELECT id, rows FROM sources WHERE name = ?').get(name) as { id: number; rows: number | null };
  return { id: row.id, imported: row.rows !== null };
}

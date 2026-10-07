/**
 * Shared by scripts/build-address-index.ts and (as the single definition of
 * the cell scheme) geocode/local-address-index.ts, which keeps its own copy of
 * CELL and must stay equal to this one.
 */

/**
 * Cell size in degrees. 0.01 deg is ~1.1km of latitude: comfortably larger
 * than rooftop.ts's own 300m search radius, so a query needs at most the 3x3
 * block of cells around a point, and small enough that a dense downtown cell
 * stays a few thousand rows rather than a million.
 */
export const CELL = 0.01;

/** Format 1 (the original, and what build-nad-index.ts still writes): the cell as text. */
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
}

/**
 * One OpenAddresses CSV line (LON,LAT,NUMBER,STREET,UNIT,CITY,DISTRICT,
 * REGION,POSTCODE,ID,HASH) to a row, or null for anything that is not a usable
 * point. These columns carry no embedded commas in practice, and a split is
 * ~20x faster than a CSV parser over 100M rows; a malformed row is skipped,
 * never guessed at.
 */
export function parseOpenAddressesLine(line: string): IndexRow | null {
  if (!line) return null;
  const f = line.split(',');
  if (f.length < 6) return null;
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
  };
}

/** The bulk extracts OpenAddresses publishes, one zip per US region. */
export const OPENADDRESSES_REGIONS = ['northeast', 'south', 'midwest', 'west'] as const;

export function openAddressesRegionUrl(region: string): string {
  return `https://data.openaddresses.io/openaddr-collected-us_${region}.zip`;
}

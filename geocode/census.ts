/**
 * Live network calls to the Census Bureau's own free, public geocoding
 * services. Deliberately kept thin — everything that can be tested without
 * a live HTTP round-trip lives in resolve.ts/normalize.ts instead, the same
 * split harvester/harvest.ts uses (fetch is a parameter there; here, fetch
 * is confined to exactly these two functions and nothing else in this
 * project ever calls them at paycheck-calculation time).
 *
 * Two SEPARATE Census services are needed, not one:
 *   1. geocoding.geo.census.gov/geocoder — address string -> lat/lon plus
 *      States/Counties/Incorporated Places/County Subdivisions. This is
 *      the ordinary "geocoder" most integrations mean by the word.
 *   2. tigerweb.geo.census.gov/.../tigerWMS_Current/MapServer/identify —
 *      school district boundaries are NOT included in service #1's
 *      response at any benchmark/vintage tried (confirmed empirically this
 *      session — Unified/Elementary/Secondary School District layers came
 *      back empty even on vintages that documented them). TIGERweb's
 *      generic identify operation, queried at the coordinates service #1
 *      already returned, is what actually has them (layers 14/16/18).
 */
import type { CensusGeographies } from './resolve.ts';

const GEOCODER_BASE = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress';
const TIGERWEB_IDENTIFY =
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/identify';

export interface AddressGeocodeResult {
  matched: boolean;
  coordinates: { x: number; y: number } | null;
  geographies: CensusGeographies | null;
}

function namesFrom(layer: unknown): string[] {
  if (!Array.isArray(layer)) return [];
  return layer.map((entry) => (entry as { NAME?: string }).NAME).filter((n): n is string => !!n);
}

/**
 * Geocode one address to coordinates plus the Census geography layers this
 * project's resolve.ts knows how to match against. Returns matched: false
 * (not a thrown error) when Census has no address match — an unmatched
 * address is an expected, common outcome (typos, new construction, PO
 * boxes), not a bug.
 */
export async function geocodeAddress(
  oneLineAddress: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AddressGeocodeResult> {
  const url = new URL(GEOCODER_BASE);
  url.searchParams.set('address', oneLineAddress);
  url.searchParams.set('benchmark', 'Public_AR_Current');
  url.searchParams.set('vintage', 'Current_Current');
  url.searchParams.set('format', 'json');

  const res = await fetchImpl(url.toString());
  if (!res.ok) {
    throw new Error(`Census geocoder returned HTTP ${res.status} for "${oneLineAddress}"`);
  }
  const body = (await res.json()) as {
    result: {
      addressMatches: {
        coordinates: { x: number; y: number };
        geographies: Record<string, unknown>;
      }[];
    };
  };

  const match = body.result.addressMatches[0];
  if (!match) return { matched: false, coordinates: null, geographies: null };

  const geo = match.geographies;
  const statesLayer = geo['States'];
  const stateAbbrev =
    (Array.isArray(statesLayer) && (statesLayer[0] as { STUSAB?: string } | undefined)?.STUSAB) ||
    '';

  return {
    matched: true,
    coordinates: match.coordinates,
    geographies: {
      state: stateAbbrev,
      incorporatedPlaces: namesFrom(geo['Incorporated Places']),
      countySubdivisions: namesFrom(geo['County Subdivisions']),
      counties: namesFrom(geo['Counties']),
    },
  };
}

/**
 * Look up the Unified/Secondary/Elementary school district at a resolved
 * coordinate pair. Returns null when no district layer covers the point —
 * the correct outcome for most of the country, which has no school
 * district income tax concept at all (Ohio is the only state this project
 * models that does).
 */
export async function fetchSchoolDistrictAtPoint(
  x: number,
  y: number,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const url = new URL(TIGERWEB_IDENTIFY);
  url.searchParams.set('geometry', JSON.stringify({ x, y }));
  url.searchParams.set('geometryType', 'esriGeometryPoint');
  url.searchParams.set('sr', '4326');
  url.searchParams.set('layers', 'all:14,16,18'); // Unified, Secondary, Elementary School Districts
  url.searchParams.set('tolerance', '0');
  url.searchParams.set('mapExtent', `${x - 1},${y - 1},${x + 1},${y + 1}`);
  url.searchParams.set('imageDisplay', '600,550,96');
  url.searchParams.set('returnGeometry', 'false');
  url.searchParams.set('f', 'json');

  const res = await fetchImpl(url.toString());
  if (!res.ok) {
    throw new Error(`TIGERweb identify returned HTTP ${res.status} for (${x}, ${y})`);
  }
  const body = (await res.json()) as { results?: { value?: string }[] };
  return body.results?.[0]?.value ?? null;
}

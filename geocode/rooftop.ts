/**
 * ROOFTOP PRECISION — the thing census.ts's own doc comment said this
 * project could only flag, never fix.
 *
 * Census's geocoder INTERPOLATES: it finds the street segment whose
 * address range contains the number and places a point proportionally
 * along it, at the curb. For "90 W Broad St, Columbus, OH" that lands 58m
 * from the building the address actually names (City Hall) and 23m from a
 * completely different one (LeVeque Tower). Near a municipal or school
 * district line, that error is the difference between withholding the
 * right local tax and the wrong one.
 *
 * What a paid geocoder has that this project didn't: authoritative
 * ADDRESS POINTS — one surveyed coordinate per real address, produced by
 * the county or state that assigns the addresses in the first place
 * (usually for E911 dispatch, where sending the ambulance to the curb
 * two doors down is a real problem). Those points are not proprietary.
 * The US DOT aggregates them into the NATIONAL ADDRESS DATABASE, ~98
 * MILLION address points contributed by state, local, and tribal
 * governments, published free and queryable point-by-point through a
 * public ArcGIS feature service. No key, no license, no bulk download.
 *
 * On the same Columbus address, live: NAD returns 39.962431,-83.003328 —
 * which sits 3.9m from City Hall's own traced building footprint, versus
 * Census's interpolated point 58m away next to the wrong tower. That is
 * rooftop precision, on free public data, in one HTTP call.
 *
 * IMAGERY closes the loop. OSM's building footprints (buildings.ts) are
 * polygons traced from satellite imagery — many of them machine-detected
 * by Microsoft's and Esri's computer-vision models and imported
 * wholesale; the Columbus footprints this was tested against literally
 * carry `source=esri/Franklin_County_OH_Buildings` tags. So an address
 * point can be checked against a building detected from imagery: if the
 * authoritative point lands ON a mapped structure, that is two
 * independent systems — one surveyed, one seen from orbit — agreeing on
 * where the building is. `confirmedOnBuilding` below is exactly that
 * check, and it is the automated form of the satellite-photo inspection
 * that started this whole line of work.
 *
 * HONEST LIMITS, measured rather than assumed (see the coverage numbers
 * in this project's own commit for this module):
 *   - COVERAGE IS NOT UNIVERSAL. NAD is voluntary: states and counties
 *     contribute what they have, so some areas are dense with points and
 *     others have none at all. Where there's no point, this returns
 *     `found: false` and the caller keeps Census's interpolated result —
 *     the precision is address-by-address, not a blanket upgrade.
 *   - A point is only as good as the government that submitted it. Most
 *     are structure-placed; some are parcel centroids or driveway access
 *     points. NAD's own `Placement` field says which, when the submitter
 *     populated it (Ohio's, for one, ships "Unknown").
 *   - This is positional precision, not address VALIDATION. A typo'd or
 *     nonexistent address doesn't become valid because no point matched.
 */
import { streetKey, streetKeyWithoutDirectionals } from './buildings.ts';
import type { FetchOptions } from './census.ts';

/**
 * The National Address Database, published by the US Department of
 * Transportation and hosted as a public ArcGIS feature service. Queried
 * by bounding box; ~98M points nationally.
 *
 * NOTE for anyone editing the query: this service rejects (HTTP 400,
 * with an empty message) several parameters that look perfectly legal —
 * `resultRecordCount`, `outSR`, and attribute-only `where` clauses on
 * fields like Zip_Code all failed against it. A bounding-box geometry
 * filter with `outFields=*` is what actually works, so that is what this
 * uses. Don't "tidy" it into a where-clause lookup without re-testing.
 */
const NAD_QUERY =
  'https://services.arcgis.com/xOi1kZaI0eWDREZv/ArcGIS/rest/services/Address_Points_from_National_Address_Database_view/FeatureServer/0/query';

/** How far around the interpolated point to look for the authoritative one. Interpolation error is a block-scale error — 300m covers it generously while keeping the response small enough to stay under the service's 2000-record cap even in a dense downtown (the Columbus test box returns ~227). */
const SEARCH_RADIUS_METERS = 300;

/** A NAD point this far from the rest of its own match group means the group isn't one building — most likely the same house number on the same street name in two different places inside the search box. Reported rather than silently averaged. */
const IMPLAUSIBLE_SPREAD_METERS = 120;

interface NadAttributes {
  AddNo_Full?: string | null;
  St_PreDir?: string | null;
  St_PreTyp?: string | null;
  St_Name?: string | null;
  St_PosTyp?: string | null;
  St_PosDir?: string | null;
  Unit?: string | null;
  Inc_Muni?: string | null;
  Post_City?: string | null;
  Zip_Code?: string | null;
  Placement?: string | null;
  NAD_Source?: string | null;
  Latitude?: number | null;
  Longitude?: number | null;
}

export interface AddressPoint {
  houseNumber: string | null;
  street: string | null;
  unit: string | null;
  city: string | null;
  zip: string | null;
  /** NAD's own description of what the coordinate points at ("Structure", "Parcel", "Unknown"...) — populated by the submitting government, and frequently "Unknown". */
  placement: string | null;
  /** Which government submitted the point. Worth surfacing: it's the actual provenance of the coordinate. */
  source: string | null;
  lat: number;
  lon: number;
}

/** Compose the street name the way an address is written, out of NAD's separate directional/type/name columns: "West" + "BROAD" + "Street" -> "West BROAD Street". */
function composeStreet(a: NadAttributes): string | null {
  const parts = [a.St_PreDir, a.St_PreTyp, a.St_Name, a.St_PosTyp, a.St_PosDir]
    .map((p) => (p ?? '').trim())
    .filter((p) => p.length > 0);
  return parts.length > 0 ? parts.join(' ') : null;
}

function toAddressPoint(a: NadAttributes): AddressPoint | null {
  // The service returns geometry in Web Mercator, but every record also
  // carries plain WGS84 Latitude/Longitude columns. Using those keeps this
  // module free of a projection conversion whose only purpose would be to
  // undo one the service already did.
  if (typeof a.Latitude !== 'number' || typeof a.Longitude !== 'number') return null;
  if (!Number.isFinite(a.Latitude) || !Number.isFinite(a.Longitude)) return null;
  return {
    houseNumber: (a.AddNo_Full ?? '').trim() || null,
    street: composeStreet(a),
    unit: (a.Unit ?? '').trim() || null,
    city: (a.Inc_Muni ?? a.Post_City ?? '').trim() || null,
    zip: (a.Zip_Code ?? '').trim() || null,
    placement: (a.Placement ?? '').trim() || null,
    source: (a.NAD_Source ?? '').trim() || null,
    lat: a.Latitude,
    lon: a.Longitude,
  };
}

/**
 * TWO retries, not one: the feature service does hiccup under a run of
 * back-to-back queries — this project's own geocode demo, which resolves
 * eighteen addresses in a row, hit a transient failure on one of them and
 * fell back to the interpolated point for that address alone. A retry
 * budget is the difference between "this address has no published point"
 * and "the service blinked", and those two must never look alike.
 */
const NAD_RETRIES = 2;

async function fetchWithRetry(
  url: string,
  fetchImpl: typeof fetch,
  { retries = NAD_RETRIES, timeoutMs = 30_000, baseBackoffMs = 400 }: FetchOptions = {},
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) return res;
      if (res.status < 500 && res.status !== 429) return res;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
    }
    if (attempt < retries && baseBackoffMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, baseBackoffMs * 2 ** attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** True when a street name carries a leading or trailing directional at all ("W Broad St" yes, "Holliday Street" no) — the fallback below is only safe between a name that has one and a name that doesn't. */
function hasDirectional(street: string): boolean {
  return streetKey(street) !== streetKeyWithoutDirectionals(street);
}

function metersBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Fetch every authoritative address point within roughly `radiusMeters`
 * of a coordinate. Returns a result object rather than throwing, and
 * keeps "the service answered and there are no points here" (ok, empty —
 * the normal outcome wherever NAD has no contributing government)
 * distinct from "the request failed", for the same reason buildings.ts
 * does: an outage must never read as evidence about an address.
 */
export async function fetchAddressPointsNear(
  lat: number,
  lon: number,
  radiusMeters: number = SEARCH_RADIUS_METERS,
  fetchImpl: typeof fetch = fetch,
  retryOptions: FetchOptions = {},
): Promise<{ ok: true; points: AddressPoint[] } | { ok: false; error: string }> {
  const dLat = radiusMeters / 111_320;
  const dLon = radiusMeters / (111_320 * Math.cos((lat * Math.PI) / 180));
  const url = new URL(NAD_QUERY);
  url.searchParams.set('geometry', `${lon - dLon},${lat - dLat},${lon + dLon},${lat + dLat}`);
  url.searchParams.set('geometryType', 'esriGeometryEnvelope');
  url.searchParams.set('inSR', '4326');
  url.searchParams.set('outFields', '*');
  url.searchParams.set('returnGeometry', 'false');
  url.searchParams.set('f', 'json');

  try {
    const res = await fetchWithRetry(url.toString(), fetchImpl, retryOptions);
    if (!res.ok) return { ok: false, error: `National Address Database returned HTTP ${res.status}` };
    const body = (await res.json()) as { error?: { message?: string }; features?: { attributes?: NadAttributes }[] };
    if (body.error) return { ok: false, error: body.error.message || 'National Address Database rejected the query' };
    const points = (body.features ?? [])
      .map((f) => (f.attributes ? toAddressPoint(f.attributes) : null))
      .filter((p): p is AddressPoint => p !== null);
    return { ok: true, points };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** The unit designator written into a one-line address ("123 Main St Apt 4B" -> "4B"), used to pick between per-unit points when a building has one point per unit. Null when the address names no unit. */
export function extractUnit(oneLineAddress: string): string | null {
  const m = /\b(?:apt|apartment|unit|ste|suite|rm|room|#)\.?\s*([A-Za-z0-9-]+)/i.exec(oneLineAddress);
  return m ? m[1] : null;
}

export interface RooftopMatch {
  point: { lat: number; lon: number };
  /** How many NAD points matched the address. More than one is normal and not a problem: a tower publishes one point per unit, all within the same building. */
  matchCount: number;
  /** Farthest matched point from the group's own centre. Small means one building; large means the search box caught two different places sharing a street name and number. */
  spreadMeters: number;
  /** The specific point chosen, with its provenance — which government published it, and what NAD says the coordinate refers to. */
  chosen: AddressPoint;
  /** True when the address named a unit and a point for that exact unit was found — the most precise case available. */
  matchedUnit: boolean;
  /** True when the street names only matched after setting directionals aside (Maryland publishes Baltimore's "N Holliday St" as plain "Holliday Street"). Still a real match — but a looser one, and only ever accepted when every candidate it produced sits in one tight cluster. */
  directionalFallback: boolean;
}

/**
 * Pure — pick the authoritative point for an address out of a fetched
 * batch. Matching is on house number plus street, with the street
 * normalized through buildings.ts's own streetKey() so NAD's
 * "West BROAD Street" and a written "W Broad St" compare equal.
 *
 * When several points match (a tower with one point per unit), the
 * address's own unit wins if it names one; otherwise the group's centre
 * is used, which for a set of unit points inside one building is a point
 * inside that building. `spreadMeters` is reported so a caller can tell a
 * tight cluster from a group that isn't one place at all.
 */
export function matchAddressPoint(oneLineAddress: string, points: AddressPoint[]): RooftopMatch | null {
  const targetNumber = /^\s*(\d+)/.exec(oneLineAddress)?.[1] ?? null;
  const firstSegment = oneLineAddress.split(',')[0] ?? '';
  const targetStreetRaw = firstSegment.replace(/^\s*\d+\s*/, '').trim();
  if (!targetNumber || targetStreetRaw.length === 0) return null;

  // The written street may still carry a unit designator ("Main St Apt 4B");
  // NAD keeps units in their own column, so compare street names without it.
  const targetStreet = streetKey(
    targetStreetRaw.replace(/\s*\b(?:apt|apartment|unit|ste|suite|fl|floor|rm|room|#)\.?\s*[A-Za-z0-9-]+\s*$/i, ''),
  );

  const sameNumber = points.filter((p) => p.houseNumber === targetNumber && p.street !== null);
  let matches = sameNumber.filter((p) => streetKey(p.street!) === targetStreet);
  let directionalFallback = false;

  if (matches.length === 0) {
    // Second pass, deliberately looser: address authorities disagree about
    // whether a directional belongs in the name at all — Maryland
    // publishes Baltimore's "N Holliday St" as plain "Holliday Street".
    //
    // Two guards keep that from becoming a wrong answer. First, one side
    // must have NO directional: a target on "W Broad" may match a
    // candidate on plain "Broad", but never one on "E Broad" — those are
    // opposite sides of a real street, and downtown Columbus has both at
    // the same numbers. Second, every surviving candidate must land in one
    // tight cluster, since averaging two genuinely different places would
    // invent a point in the middle of the road.
    const targetCore = streetKeyWithoutDirectionals(targetStreetRaw);
    const targetHasDirectional = hasDirectional(targetStreetRaw);
    const loose = sameNumber.filter(
      (p) =>
        streetKeyWithoutDirectionals(p.street!) === targetCore &&
        (!targetHasDirectional || !hasDirectional(p.street!)),
    );
    if (loose.length === 0) return null;
    const looseCentre = {
      lat: loose.reduce((sum, p) => sum + p.lat, 0) / loose.length,
      lon: loose.reduce((sum, p) => sum + p.lon, 0) / loose.length,
    };
    if (Math.max(...loose.map((p) => metersBetween(looseCentre, p))) > IMPLAUSIBLE_SPREAD_METERS) return null;
    matches = loose;
    directionalFallback = true;
  }

  const targetUnit = extractUnit(oneLineAddress);
  const unitMatch = targetUnit
    ? matches.find((p) => p.unit !== null && p.unit.toLowerCase() === targetUnit.toLowerCase())
    : undefined;

  const centroid = {
    lat: matches.reduce((sum, p) => sum + p.lat, 0) / matches.length,
    lon: matches.reduce((sum, p) => sum + p.lon, 0) / matches.length,
  };
  const spreadMeters = Math.max(...matches.map((p) => metersBetween(centroid, p)));

  const chosen = unitMatch ?? matches.find((p) => p.unit === null) ?? matches[0];
  const point = unitMatch ? { lat: unitMatch.lat, lon: unitMatch.lon } : centroid;

  return {
    point,
    matchCount: matches.length,
    spreadMeters,
    chosen,
    matchedUnit: Boolean(unitMatch),
    directionalFallback,
  };
}

export interface RooftopResult {
  /** false when the National Address Database couldn't be reached — no evidence either way, exactly like the other cross-checks here. */
  attempted: boolean;
  /** true when an authoritative point for THIS address was found. false with attempted: true means NAD answered and has no point for it — the honest, common outcome in areas whose county hasn't contributed. */
  found: boolean;
  /** The rooftop-grade coordinate, when found. */
  point: { lat: number; lon: number } | null;
  match: RooftopMatch | null;
  /** How far the authoritative point sits from Census's interpolated one — the size of the error being corrected. */
  metersFromInterpolated: number | null;
  /** True when the match group is too spread out to be one building; the point is still returned, but a caller should treat it as suspect. */
  ambiguous: boolean;
}

/**
 * Resolve one address to an authoritative rooftop coordinate, given
 * Census's interpolated point to search around. Never throws.
 */
export async function resolveRooftop(
  oneLineAddress: string,
  interpolated: { lat: number; lon: number },
  fetchImpl: typeof fetch = fetch,
  retryOptions: FetchOptions = {},
  radiusMeters: number = SEARCH_RADIUS_METERS,
): Promise<RooftopResult> {
  const fetched = await fetchAddressPointsNear(
    interpolated.lat,
    interpolated.lon,
    radiusMeters,
    fetchImpl,
    retryOptions,
  );
  if (!fetched.ok) {
    return { attempted: false, found: false, point: null, match: null, metersFromInterpolated: null, ambiguous: false };
  }

  const match = matchAddressPoint(oneLineAddress, fetched.points);
  if (!match) {
    return { attempted: true, found: false, point: null, match: null, metersFromInterpolated: null, ambiguous: false };
  }

  return {
    attempted: true,
    found: true,
    point: match.point,
    match,
    metersFromInterpolated: metersBetween(interpolated, match.point),
    ambiguous: match.spreadMeters > IMPLAUSIBLE_SPREAD_METERS,
  };
}

export { IMPLAUSIBLE_SPREAD_METERS, SEARCH_RADIUS_METERS };

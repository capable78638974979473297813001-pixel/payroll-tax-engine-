/**
 * Taxing districts that are NOT Census geographies.
 *
 * Everything else in this module resolves jurisdictions out of Census
 * data — states, counties, county subdivisions, incorporated places,
 * school districts. That works because most local payroll taxes are
 * levied by exactly those bodies. Some are not. A regional government or
 * a transit district draws its own boundary, files it nowhere Census
 * publishes, and taxes wages inside it anyway. For those, a correct
 * address point and a perfect Census lookup still produce the wrong
 * answer — not because the geocoding failed, but because the boundary
 * isn't in the data being searched.
 *
 * This module holds point-in-district checks against the boundaries
 * those governments publish themselves. Each entry names the service it
 * queries, because provenance is the whole argument for trusting it: an
 * arbitrary polygon from a third party would be worse than admitting the
 * boundary is unknown.
 *
 * COVERED HERE:
 *   - Portland Metro's district, which is what Metro's Supportive
 *     Housing Services personal income tax is levied inside. Published
 *     by Metro itself as part of RLIS, its regional GIS.
 *   - Ohio's JEDDs and JEDZs — joint economic development districts and
 *     zones, the contractual arrangement that lets a municipality tax
 *     income earned on adjoining UNINCORPORATED township land without
 *     annexing it. There is no municipality at that address, so no
 *     amount of Census place matching will ever find the tax. Ohio
 *     publishes all 142 boundaries as a statewide service on its own
 *     ArcGIS server, keyed by the same jedd_id that
 *     data/local/OH-jedd-jedz-2026.json (downloaded from Ohio's Finder
 *     rate database) uses — so the boundary lookup and the rate table
 *     join on an ID rather than on a name, exactly.
 *
 *   - Lane Transit District. Not published by LTD itself, but by RLID
 *     (the Lane County regional GIS consortium, run by LCOG) as a live
 *     queryable layer — found where TriMet's own boundary was NOT: RLID's
 *     Regional/Boundaries service carries a named "LTD Service Area"
 *     layer (id 4) alongside county-run boundary layers for ambulance,
 *     fire, and school districts. Verified live: LTD's own headquarters
 *     (3500 E 17th Ave, Eugene) intersects it; a downtown Portland point,
 *     nowhere near Lane County, does not.
 *   - TriMet's district. Unlike LTD, checked and confirmed NOT to exist
 *     as a queryable service anywhere: Metro's own RLIS boundary service
 *     carries City Limits, County Boundaries, Metro Boundary, UGB and
 *     more, but no transit-district layer, and PortlandMaps' transit
 *     service publishes routes and stops rather than the district. TriMet
 *     publishes the boundary itself only as a downloadable KML/shapefile
 *     (developer.trimet.org/gis) — so this one genuinely is vendored:
 *     data/local/OR-trimet-boundary-2026.json holds the polygon fetched
 *     from that file, and isInsideTriMetDistrict() below does the
 *     point-in-polygon test locally rather than querying a live service.
 *     A refresh commitment, not a live lookup — see that data file's own
 *     $comment for why the boundary is expected to be stable but not
 *     assumed permanent.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FetchOptions } from './census.ts';

/**
 * Loaded once at module init, not per-call: this is a static boundary
 * file (see its own $comment for the refresh commitment that implies),
 * not a rules file re-read per request the way src/registry.ts's data
 * loader is. geocode/ is never bundled into the Supabase Edge Function
 * (checked: nothing under supabase/functions imports from here, only
 * mentions this path in comments), so plain node:fs is safe here — no
 * swappable-reader indirection needed the way src/registry.ts has for
 * the Deno/no-filesystem deployment target.
 */
const trimetBoundary = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'data', 'local', 'OR-trimet-boundary-2026.json'), 'utf8'),
) as { geometry: { type: 'Polygon'; coordinates: [number, number][][] } };

/**
 * Metro's own regional GIS (RLIS), layer 3 of its public boundary
 * service. Verified live against three points: downtown Portland and
 * Beaverton both fall inside; Salem, an hour south, does not.
 */
const METRO_BOUNDARY_LAYER =
  'https://gis.oregonmetro.gov/arcgis/rest/services/OpenData/BoundaryDataWebMerc/MapServer/3/query';

/**
 * RLID's (Lane County's regional GIS consortium) own boundary service —
 * layer 4, "LTD Service Area", found inside its "Service Districts Group"
 * alongside county-run ambulance/fire/school-district layers. Verified
 * live against two points: LTD's own headquarters (3500 E 17th Ave,
 * Eugene) intersects it; downtown Portland, nowhere near Lane County,
 * does not.
 */
const LTD_BOUNDARY_LAYER = 'https://gateway.maps.rlid.org/maps1/rest/services/Regional/Boundaries/MapServer/4/query';

/**
 * Ohio's own JEDD/JEDZ boundary service, published by the state on
 * maps.ohio.gov. 142 polygons, each carrying the `jedd_id` that Ohio's
 * Finder rate database uses as its key. Verified live: a point taken
 * inside the Bath-Akron-Fairlawn JEDD's own published geometry comes back
 * as jedd_id 9004, the same id its rate row carries.
 */
const OHIO_JEDD_LAYER = 'https://maps.ohio.gov/arcgis/rest/services/Tax/JEDDJEDZ/MapServer/0/query';

export interface JeddDistrict {
  name: string;
  /** Ohio's own id for the zone — the exact join key into data/local/OH-jedd-jedz-YYYY.json. */
  jeddId: string;
  active: boolean;
}

export interface JeddCheck {
  /** false when Ohio's boundary service couldn't be reached — NOT a claim that the address is outside every JEDD. */
  attempted: boolean;
  jedd: JeddDistrict | null;
}

export interface DistrictCheck {
  /** false when the publishing government's service couldn't be reached — NOT a claim that the address is outside the district. A caller must treat this as "unknown", the same convention every other optional lookup here uses. */
  attempted: boolean;
  inside: boolean;
}

async function fetchWithRetry(
  url: string,
  fetchImpl: typeof fetch,
  { retries = 1, timeoutMs = 20_000, baseBackoffMs = 400 }: FetchOptions = {},
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

/**
 * Ask an ArcGIS layer whether a point falls inside any of its polygons.
 * Deliberately asks for no attributes and no geometry: the only thing
 * this needs is whether the intersection returned anything, and a
 * boundary layer's own field names are nobody else's business.
 */
async function pointIsInsideLayer(
  layerQueryUrl: string,
  lat: number,
  lon: number,
  fetchImpl: typeof fetch,
  retryOptions: FetchOptions,
): Promise<DistrictCheck> {
  const url = new URL(layerQueryUrl);
  url.searchParams.set('geometry', JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }));
  url.searchParams.set('geometryType', 'esriGeometryPoint');
  url.searchParams.set('inSR', '4326');
  url.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
  url.searchParams.set('returnGeometry', 'false');
  url.searchParams.set('returnIdsOnly', 'true');
  url.searchParams.set('f', 'json');

  try {
    const res = await fetchWithRetry(url.toString(), fetchImpl, retryOptions);
    if (!res.ok) return { attempted: false, inside: false };
    const body = (await res.json()) as {
      error?: unknown;
      objectIds?: number[] | null;
      features?: unknown[];
    };
    if (body.error) return { attempted: false, inside: false };
    // returnIdsOnly answers with objectIds; some servers ignore it and
    // answer with features anyway, so both shapes count.
    const hits = body.objectIds?.length ?? body.features?.length ?? 0;
    return { attempted: true, inside: hits > 0 };
  } catch {
    return { attempted: false, inside: false };
  }
}

/**
 * Is this point inside Portland Metro's district — i.e. does Metro's
 * Supportive Housing Services tax apply to work performed here?
 *
 * Metro's district is not a county, not a city, and not a Census place:
 * it covers the urban parts of Clackamas, Multnomah and Washington
 * counties and stops well short of each county's full extent, which is
 * why no combination of Census layers can stand in for it. Never throws.
 */
export async function isInsidePortlandMetro(
  lat: number,
  lon: number,
  fetchImpl: typeof fetch = fetch,
  retryOptions: FetchOptions = {},
): Promise<DistrictCheck> {
  return pointIsInsideLayer(METRO_BOUNDARY_LAYER, lat, lon, fetchImpl, retryOptions);
}

/**
 * Is this point inside Lane Transit District — i.e. does LTD's transit
 * payroll excise (certificate.locality = 'LTD', src/taxes/state.ts's
 * oregonTransitTax()) apply to work performed here?
 *
 * Not published by LTD itself but by RLID, Lane County's regional GIS
 * consortium — see this file's own top comment for how that was found.
 * Never throws.
 */
export async function isInsideLaneTransitDistrict(
  lat: number,
  lon: number,
  fetchImpl: typeof fetch = fetch,
  retryOptions: FetchOptions = {},
): Promise<DistrictCheck> {
  return pointIsInsideLayer(LTD_BOUNDARY_LAYER, lat, lon, fetchImpl, retryOptions);
}

/**
 * Ray-casting point-in-polygon, single ring, no holes — exactly what
 * TriMet's own boundary file is (verified when it was converted; see
 * data/local/OR-trimet-boundary-2026.json's own $comment). Deliberately
 * NOT a general-purpose multi-ring/hole-aware implementation: this
 * project's zero-dependency stance means writing this by hand rather than
 * pulling in a geometry library, and the honest scope of what's actually
 * needed is "one simple polygon", not a general GIS engine. If a second
 * vendored boundary ever needs holes or multiple rings, extend this then,
 * with a real fixture proving the extension — not preemptively now.
 */
function pointInRing(lat: number, lon: number, ring: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crossesRay = yi > lat !== yj > lat;
    if (!crossesRay) continue;
    const xIntersect = ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (lon < xIntersect) inside = !inside;
  }
  return inside;
}

/**
 * Is this point inside TriMet's district — i.e. does TriMet's transit
 * payroll excise (certificate.locality = 'TriMet', src/taxes/state.ts's
 * oregonTransitTax()) apply to work performed here?
 *
 * Unlike every other check in this file, this is NOT a live query —
 * TriMet's boundary is vendored locally (see this file's own top comment
 * for why, and data/local/OR-trimet-boundary-2026.json's $comment for the
 * source and the refresh commitment that implies). Pure and synchronous,
 * unlike its siblings, because there's no network call to make: the data
 * is already loaded. Kept async-shaped (returns a resolved DistrictCheck)
 * so callers don't need to special-case it against isInsidePortlandMetro()
 * and isInsideLaneTransitDistrict(), which do need the network.
 */
export function isInsideTriMetDistrict(lat: number, lon: number): DistrictCheck {
  // The stored ring is already [lon, lat] pairs (KML's own order, kept
  // as-is by the conversion — see the data file's own $comment), which is
  // exactly the [x, y] order pointInRing() expects. No remapping needed.
  const ring = trimetBoundary.geometry.coordinates[0];
  return { attempted: true, inside: pointInRing(lat, lon, ring) };
}

/**
 * Which Ohio JEDD/JEDZ, if any, contains this point.
 *
 * This is the lookup that makes the JEDD rate table usable at all: the
 * zones cover unincorporated township land, so an address inside one
 * resolves to NO incorporated place, and every municipality-name match in
 * resolve.ts correctly finds nothing. The tax is real regardless — a JEDD
 * levies at a municipal rate on income earned inside it. Never throws.
 */
export async function jeddAtPoint(
  lat: number,
  lon: number,
  fetchImpl: typeof fetch = fetch,
  retryOptions: FetchOptions = {},
): Promise<JeddCheck> {
  const url = new URL(OHIO_JEDD_LAYER);
  url.searchParams.set('geometry', JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }));
  url.searchParams.set('geometryType', 'esriGeometryPoint');
  url.searchParams.set('inSR', '4326');
  url.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
  url.searchParams.set('outFields', 'name,jedd_id,active');
  url.searchParams.set('returnGeometry', 'false');
  url.searchParams.set('f', 'json');

  try {
    const res = await fetchWithRetry(url.toString(), fetchImpl, retryOptions);
    if (!res.ok) return { attempted: false, jedd: null };
    const body = (await res.json()) as {
      error?: unknown;
      features?: { attributes?: { name?: string; jedd_id?: number | string; active?: string } }[];
    };
    if (body.error) return { attempted: false, jedd: null };

    const hit = body.features?.[0]?.attributes;
    if (!hit || hit.jedd_id === undefined || hit.jedd_id === null) return { attempted: true, jedd: null };
    return {
      attempted: true,
      jedd: {
        name: (hit.name ?? '').trim(),
        jeddId: String(hit.jedd_id),
        // Ohio ships this as a "Y"/"N" flag; an inactive zone stays
        // reported rather than hidden, so a caller can see WHY no tax
        // applies instead of seeing nothing at all.
        active: (hit.active ?? '').toUpperCase() === 'Y',
      },
    };
  } catch {
    return { attempted: false, jedd: null };
  }
}

export { METRO_BOUNDARY_LAYER, OHIO_JEDD_LAYER, LTD_BOUNDARY_LAYER };

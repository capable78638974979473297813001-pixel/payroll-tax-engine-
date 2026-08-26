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
 * DELIBERATELY NOT COVERED, and why — this is the honest remainder,
 * not an oversight:
 *   - TriMet and Lane Transit District. Both levy real transit payroll
 *     taxes, and both publish their district boundaries only as
 *     downloadable shapefiles/KML (developer.trimet.org/gis), not as a
 *     queryable service. Checked: Metro's own RLIS boundary service
 *     carries City Limits, County Boundaries, Metro Boundary, UGB and
 *     more, but no transit-district layer, and PortlandMaps' transit
 *     service publishes routes and stops rather than the district. Using
 *     these would mean vendoring and refreshing a boundary file, which is
 *     a different kind of commitment than a live lookup.
 */
import type { FetchOptions } from './census.ts';

/**
 * Metro's own regional GIS (RLIS), layer 3 of its public boundary
 * service. Verified live against three points: downtown Portland and
 * Beaverton both fall inside; Salem, an hour south, does not.
 */
const METRO_BOUNDARY_LAYER =
  'https://gis.oregonmetro.gov/arcgis/rest/services/OpenData/BoundaryDataWebMerc/MapServer/3/query';

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

export { METRO_BOUNDARY_LAYER, OHIO_JEDD_LAYER };

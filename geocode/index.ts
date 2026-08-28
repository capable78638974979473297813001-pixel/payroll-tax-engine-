/**
 * Public entry point: street address(es) in, resolved certificate fields
 * out. Ties together census.ts's live fetches and resolve.ts's pure
 * matching — kept as a thin orchestrator so each half stays independently
 * testable (resolve.ts's tests use captured fixture JSON; this file itself
 * is exercised only by examples/geocode-demo.ts against the live services).
 *
 * This is explicitly an ONBOARDING/ADDRESS-CHANGE step, not something
 * calculatePaycheck() ever calls — see resolve.ts's own doc comment for
 * why. Call it once when an employee's work or home address is entered or
 * changes, review anything below 'matched' confidence, then store the
 * resulting certificate fields on the employee record for
 * calculatePaycheck() to read on every subsequent paycheck without ever
 * touching the network.
 *
 * Two entry points:
 *   - resolveAddress() — ONE address, ONE role. Fine for the common case
 *     (MI/OH/PA/IN local taxes, all keyed purely off that single address).
 *   - resolveEmployee() — BOTH addresses together. Required whenever a tax
 *     is keyed off something that isn't simply "this one address's own
 *     role": Yonkers' resident/nonresident-worker taxes are mutually
 *     exclusive and need to compare both addresses to know which one (if
 *     either) fires; Missouri's Kansas City/St. Louis earnings tax fires
 *     from EITHER address; NYC's resident tax and Maryland's/Multnomah's
 *     taxes are role-specific in a way a single generic 'work'/'residence'
 *     label doesn't capture without the state-specific knowledge encoded
 *     below (verified against each tax's own doc comment in
 *     taxes/state.ts, not assumed).
 */
import {
  fetchGeographiesAtPointSafe,
  fetchSchoolDistrictAtPointSafe,
  geocodeAddress,
  tigerwebServiceForDate,
  type MatchQuality,
} from './census.ts';
import { isInsidePortlandMetro, jeddAtPoint, type JeddDistrict } from './districts.ts';
import { resolveRooftop, type AddressPointTier, type RooftopResult } from './rooftop.ts';
import { checkNearestBuilding, LARGE_HOUSE_NUMBER_GAP, type BuildingCheckResult } from './buildings.ts';
import { crossCheckSafe, milesBetween, type NominatimResult } from './nominatim.ts';
import { namesEqual, stripCountySuffix, stripPlaceTypeSuffix } from './normalize.ts';
import { resolveJurisdiction, toCertificateFields, type ResolvedJurisdiction } from './resolve.ts';

export type {
  CensusGeographies,
  FieldMatch,
  MatchConfidence,
  ResolvedJurisdiction,
} from './resolve.ts';
export { resolveJurisdiction, toCertificateFields } from './resolve.ts';
export {
  fetchSchoolDistrictAtPoint,
  geocodeAddress,
  normalizeAddress,
  type FetchOptions,
  type MatchQuality,
} from './census.ts';
export { crossCheckAddress, type NominatimResult } from './nominatim.ts';
export { isInsidePortlandMetro, jeddAtPoint, type DistrictCheck, type JeddCheck, type JeddDistrict } from './districts.ts';
export { checkNearestBuilding, LARGE_HOUSE_NUMBER_GAP, type BuildingCheckResult, type NearbyBuilding } from './buildings.ts';
export {
  fetchAddressPointsNear,
  matchAddressPoint,
  neighborBracket,
  parseAddressParts,
  resolveRooftop,
  type AddressPoint,
  type AddressPointTier,
  type NeighborBracket,
  type RooftopMatch,
  type RooftopResult,
} from './rooftop.ts';

/**
 * A LARGE disagreement in resolved COORDINATES between Census and
 * Nominatim is a stronger signal than a place-name mismatch — it usually
 * means one geocoder resolved a genuinely different location (a common
 * street name in another part of town, a stale OSM node), not just a
 * naming-convention difference. 0.5 miles is deliberately conservative:
 * ordinary interpolation slop between two independent geocoders on the
 * SAME address is normally much smaller than this.
 */
const LARGE_DISTANCE_DISAGREEMENT_MILES = 0.5;

/**
 * A WIDE interpolation range is the honest signal available for addresses
 * that are still resolved by interpolation — i.e. the ones rooftop.ts
 * could not find an authoritative address point for. 20 is not a
 * scientific threshold — it's a deliberately conservative "worth a second
 * look before this address goes live near a boundary" line, picked to
 * flag block faces with many addressable lots rather than ordinary short
 * suburban blocks. It is deliberately NOT raised on a rooftop-resolved
 * address: it describes a coordinate that resolution didn't use.
 */
const WIDE_ADDRESS_RANGE_THRESHOLD = 20;

export interface CrossCheckResult {
  /** false when Nominatim's own result couldn't be obtained at all (network/rate-limit/no-match) — a missing cross-check is NOT evidence against the Census result, it just means no second opinion was available this call. */
  attempted: boolean;
  nominatim: NominatimResult | null;
  /** true when Nominatim's place/county names disagree with what Census resolved (case-insensitive, suffix-normalized) — two independently-maintained datasets giving different answers, not necessarily either one being wrong. */
  placeDisagreement: boolean;
  /** true when the two geocoders' coordinates are more than LARGE_DISTANCE_DISAGREEMENT_MILES apart. */
  distanceDisagreementMiles: number | null;
  /**
   * A THIRD, independent signal — see buildings.ts's own doc comment for
   * the full story: OpenStreetMap's traced building-footprint data (a
   * different subsystem from Nominatim's own address search) found a
   * genuine real-world error this way — Nominatim and Census had both
   * "matched" 90 W Broad St, Columbus, but Nominatim's point sat next to a
   * building tagged "500 W Broad Street", a 410-number gap, while Census's
   * point sat next to one tagged "50 W Broad Street", a 40-number gap.
   */
  building: BuildingCheckResult;
}

export interface AddressResolution {
  address: string;
  matched: boolean;
  resolved: ResolvedJurisdiction | null;
  certificateFields: Record<string, unknown>;
  matchQuality: MatchQuality | null;
  crossCheck: CrossCheckResult | null;
  /**
   * How the coordinate these jurisdictions were resolved at was obtained,
   * best first (see rooftop.ts for each tier's own reasoning):
   *   'rooftop'      — a point published for this exact address by the
   *                    government that assigns addresses.
   *   'rooftop-osm'  — OpenStreetMap holds a house-level point for this
   *                    address and it agrees with Census's own position.
   *                    Crowd-sourced and corroborated, not authoritative.
   *   'neighbor'     — interpolated between the two nearest published
   *                    points on the same street. Block-level.
   *   'interpolated' — Census's own position along a TIGER address range,
   *                    which is what this project had before any of the
   *                    above existed.
   */
  precision: 'rooftop' | 'rooftop-osm' | 'neighbor' | 'interpolated';
  /** The coordinate the jurisdictions were actually resolved at. */
  coordinates: { lat: number; lon: number } | null;
  /** The authoritative-address-point lookup, whatever its outcome — including the distance between the two points, which is the size of the interpolation error this corrected. */
  rooftop: RooftopResult | null;
  /** The Ohio JEDD/JEDZ containing this address, if any — a tax that exists on unincorporated land where no municipality does. Null everywhere outside Ohio, and wherever Ohio's boundary service couldn't be reached. */
  jedd: JeddDistrict | null;
  /** True when every field the address could plausibly need was 'matched' AND the geocode itself was high-confidence (narrow interpolation range, no fallback retry needed, no cross-check disagreement) — false means a human should look before this address goes live in certificate data. */
  fullyResolved: boolean;
  /** Plain-language reasons fullyResolved is false, if it is — empty when fullyResolved is true. */
  lowConfidenceReasons: string[];
}

function attemptedMatches(resolved: ResolvedJurisdiction) {
  return [
    resolved.miCity,
    resolved.ohMunicipality,
    resolved.ohSchoolDistrict,
    resolved.county,
    resolved.paJurisdiction,
    resolved.mdCounty,
    resolved.alMunicipality,
    resolved.kyCity,
    resolved.kyCounty,
  ].filter((m) => m !== null);
}

/**
 * Geocode one address and resolve it against every registry this module
 * knows how to match. Returns matched: false, not a throw, when Census has
 * no match even after census.ts's own secondary-unit-stripping retry — an
 * unmatched address is a common, expected outcome.
 *
 * The school-district lookup (Ohio only) uses the "Safe" variant that
 * catches its own network failures rather than letting one flaky
 * secondary call take down a resolution that otherwise succeeded — a
 * caller still gets the municipality/county match, plus an explicit note
 * that the school-district half needs a retry.
 */
/** The tier names rooftop.ts reports, in the vocabulary a caller of this module reads. */
function precisionForTier(tier: AddressPointTier): 'rooftop' | 'rooftop-osm' | 'neighbor' {
  switch (tier) {
    case 'authoritative':
      return 'rooftop';
    case 'osm-corroborated':
      return 'rooftop-osm';
    case 'authoritative-neighbors':
      return 'neighbor';
  }
}

/** How the point that replaced the interpolated one was obtained, in a sentence a reviewer can act on. */
function describePoint(rooftop: RooftopResult): string {
  switch (rooftop.tier) {
    case 'authoritative':
      return `its authoritative address point, published by ${rooftop.match!.chosen.source ?? 'the local address authority'}`;
    case 'osm-corroborated':
      return "OpenStreetMap's own house-level point for it, which agrees with Census's position";
    case 'authoritative-neighbors':
      return `a position interpolated between the authoritative points for ${rooftop.neighbors!.below.houseNumber} and ${rooftop.neighbors!.above.houseNumber} on the same street`;
    default:
      return 'a corrected point';
  }
}

/** Human-readable list of every geography that came out DIFFERENT at the authoritative point than at the interpolated one. Empty is the normal, reassuring case; non-empty means the corrected coordinate changed the tax answer. */
function geographyDifferences(
  interpolated: { incorporatedPlaces: string[]; counties: string[]; countySubdivisions: string[]; state: string },
  rooftop: { incorporatedPlaces: string[]; counties: string[]; countySubdivisions: string[]; state: string },
): string[] {
  const differences: string[] = [];
  const compare = (label: string, a: string[], b: string[]) => {
    const left = [...a].sort().join(', ') || 'none';
    const right = [...b].sort().join(', ') || 'none';
    if (left !== right) differences.push(`${label}: "${left}" -> "${right}"`);
  };
  if (interpolated.state !== rooftop.state) differences.push(`state: "${interpolated.state}" -> "${rooftop.state}"`);
  compare('place', interpolated.incorporatedPlaces, rooftop.incorporatedPlaces);
  compare('county subdivision', interpolated.countySubdivisions, rooftop.countySubdivisions);
  compare('county', interpolated.counties, rooftop.counties);
  return differences;
}

async function geocodeAndResolve(address: string, checkDate: string): Promise<{
  resolved: ResolvedJurisdiction;
  matched: true;
  matchQuality: MatchQuality;
  schoolDistrictLookupFailed: boolean;
  coordinates: { x: number; y: number };
  geographies: { incorporatedPlaces: string[]; counties: string[] };
  precision: 'rooftop' | 'rooftop-osm' | 'neighbor' | 'interpolated';
  point: { lat: number; lon: number };
  rooftop: RooftopResult;
  rooftopJurisdictionChanges: string[];
} | {
  resolved: null;
  matched: false;
  matchQuality: null;
  schoolDistrictLookupFailed: false;
  coordinates: null;
  geographies: null;
  precision: 'interpolated';
  point: null;
  rooftop: null;
  rooftopJurisdictionChanges: never[];
}> {
  const geocoded = await geocodeAddress(address);
  if (!geocoded.matched || !geocoded.geographies || !geocoded.coordinates || !geocoded.matchQuality) {
    return {
      resolved: null,
      matched: false,
      matchQuality: null,
      schoolDistrictLookupFailed: false,
      coordinates: null,
      geographies: null,
      precision: 'interpolated',
      point: null,
      rooftop: null,
      rooftopJurisdictionChanges: [],
    };
  }

  const interpolated = { lat: geocoded.coordinates.y, lon: geocoded.coordinates.x };
  const rooftop = await resolveRooftop(address, interpolated);

  let geographies = geocoded.geographies;
  let point = interpolated;
  let precision: 'rooftop' | 'rooftop-osm' | 'neighbor' | 'interpolated' = 'interpolated';
  let rooftopJurisdictionChanges: string[] = [];
  let schoolDistrictName: string | undefined;
  let schoolDistrictLookupFailed = false;
  let historicalVintage = false;

  // An authoritative point is only worth having if the jurisdictions get
  // re-asked AT it — the geocoder's own geographies describe the curb
  // position it chose, not this address's actual parcel. An ambiguous
  // match (see rooftop.ts) is deliberately NOT used: a point averaged
  // across two places that share a street name is worse than the honest
  // interpolation.
  if (rooftop.found && rooftop.point && !rooftop.ambiguous) {
    const at = await fetchGeographiesAtPointSafe(rooftop.point.lon, rooftop.point.lat, undefined, {}, checkDate);
    if (at.ok && at.result) {
      rooftopJurisdictionChanges = geographyDifferences(geocoded.geographies, at.result.geographies);
      geographies = at.result.geographies;
      schoolDistrictName = at.result.schoolDistrict ?? undefined;
      point = rooftop.point;
      precision = precisionForTier(rooftop.tier!);
    }
  }

  // The geocoder's own geographies describe TODAY's boundaries. For a
  // check date in a year with its own published TIGERweb vintage, the
  // boundaries that were in force then are the ones that decide the tax —
  // cities annex land, districts merge — so re-resolve at the same point
  // against that vintage. Skipped when the vintage IS the current one,
  // where the extra request would return what Census already said.
  if (precision === 'interpolated' && tigerwebServiceForDate(checkDate) !== 'tigerWMS_Current') {
    const at = await fetchGeographiesAtPointSafe(point.lon, point.lat, undefined, {}, checkDate);
    if (at.ok && at.result) {
      geographies = at.result.geographies;
      schoolDistrictName = at.result.schoolDistrict ?? undefined;
      historicalVintage = true;
    }
  }

  // Only needed on the interpolated path, and only when the identify call
  // above didn't already run: the rooftop lookup returns the school
  // district from the SAME identify call, so this would be a duplicate.
  if (precision === 'interpolated' && !historicalVintage && geographies.state === 'OH') {
    const sd = await fetchSchoolDistrictAtPointSafe(point.lon, point.lat, undefined, {}, checkDate);
    if (sd.ok) {
      schoolDistrictName = sd.district ?? undefined;
    } else {
      schoolDistrictLookupFailed = true;
    }
  }

  return {
    resolved: resolveJurisdiction(geographies, checkDate, schoolDistrictName),
    matched: true,
    matchQuality: geocoded.matchQuality,
    schoolDistrictLookupFailed,
    coordinates: geocoded.coordinates,
    geographies: {
      incorporatedPlaces: geographies.incorporatedPlaces,
      counties: geographies.counties,
    },
    precision,
    point,
    rooftop,
    rooftopJurisdictionChanges,
  };
}

/**
 * Compare Census's resolved place/county names and coordinates against
 * Nominatim's own independent result for the SAME address. Never throws
 * and never blocks the primary resolution — a cross-check that couldn't
 * run (Nominatim down, rate-limited, no match) comes back as
 * `attempted: false`, treated as "no second opinion", not as evidence
 * against Census.
 */
async function runCrossCheck(
  address: string,
  census: { incorporatedPlaces: string[]; counties: string[] },
  censusCoordinates: { x: number; y: number },
): Promise<CrossCheckResult> {
  // Concurrent on purpose: these are two independent services (Nominatim's
  // address search and Overpass's footprint data), and the building check
  // is run against CENSUS's own point regardless of whether Nominatim
  // answers at all — the two signals are not conditional on each other.
  const [outcome, building] = await Promise.all([
    crossCheckSafe(address),
    checkNearestBuilding(address, { lat: censusCoordinates.y, lon: censusCoordinates.x }),
  ]);

  if (!outcome.ok || !outcome.result.matched) {
    return { attempted: false, nominatim: null, placeDisagreement: false, distanceDisagreementMiles: null, building };
  }

  const nominatim = outcome.result;
  const placeMatches =
    !nominatim.place ||
    census.incorporatedPlaces.some((p) => namesEqual(stripPlaceTypeSuffix(p), nominatim.place!));
  const countyMatches =
    !nominatim.county ||
    census.counties.some((c) => namesEqual(stripCountySuffix(c), stripCountySuffix(nominatim.county!)));

  const distanceDisagreementMiles = nominatim.coordinates
    ? milesBetween({ lat: censusCoordinates.y, lon: censusCoordinates.x }, nominatim.coordinates)
    : null;

  return {
    attempted: true,
    nominatim,
    placeDisagreement: !placeMatches || !countyMatches,
    distanceDisagreementMiles,
    building,
  };
}

/**
 * Resolve a full street address (e.g. "2 Woodward Ave, Detroit, MI 48226")
 * into the certificate fields taxes/state.ts already knows how to read.
 * `role` controls whether MI/OH/MD/AL/KY-city local fields land as
 * workCity/residenceCity and PA's PSD lands as workPSD/residencePSD.
 * Kentucky's county half (certificate.workCounty, for the KRS 68.197
 * city-vs-county credit) is only ever populated on a 'work'-role call —
 * kentuckyLocalTax() has no residence-county concept.
 *
 * Sufficient on its own for MI, OH, IN, PA, MD, AL, and KY
 * (single-address-scoped taxes, though KY's credit needs a caller to
 * resolve the SAME work address for both city and county context — one
 * resolveAddress('work', ...) call already returns both fields together).
 * Use resolveEmployee() instead for NY/MO/NJ/OR/CO/WV, whose taxes are
 * keyed off a comparison between BOTH addresses, or a WORK-only locality
 * flag not captured by a plain workCity/residenceCity field — see this
 * module's own doc comment above.
 */
export async function resolveAddress(
  address: string,
  role: 'work' | 'residence',
  checkDate: string,
): Promise<AddressResolution> {
  const {
    resolved,
    matched,
    matchQuality,
    schoolDistrictLookupFailed,
    coordinates,
    geographies,
    precision,
    point,
    rooftop,
    rooftopJurisdictionChanges,
  } = await geocodeAndResolve(address, checkDate);
  if (!matched) {
    return {
      address,
      matched: false,
      resolved: null,
      certificateFields: {},
      matchQuality: null,
      crossCheck: null,
      precision: 'interpolated',
      coordinates: null,
      rooftop: null,
      jedd: null,
      fullyResolved: false,
      lowConfidenceReasons: ['Census could not match this address at all, even after retrying with any apartment/suite/unit designator stripped.'],
    };
  }

  const certificateFields = toCertificateFields(resolved, role);

  // Ohio only, and only for a WORK address: a JEDD taxes income earned
  // inside it, on land that belongs to no municipality. Asked at the
  // resolved point, which is exactly why the rooftop work matters here —
  // a JEDD boundary follows parcel lines around a development, and a
  // curb-interpolated point can easily sit on the wrong side of one.
  let jedd: JeddDistrict | null = null;
  if (resolved.state === 'OH' && role === 'work') {
    const found = await jeddAtPoint(point.lat, point.lon);
    if (found.attempted && found.jedd?.active) {
      jedd = found.jedd;
      certificateFields.workJEDDId = found.jedd.jeddId;
    }
  }
  // Cross-checked at the point actually used, not at the one Census
  // guessed: when a rooftop point replaced it, that is the coordinate
  // whose plausibility a caller needs confirmed.
  const crossCheck = await runCrossCheck(address, geographies, { x: point.lon, y: point.lat });

  const lowConfidenceReasons: string[] = [];
  const anyFieldAmbiguous = attemptedMatches(resolved).some((m) => m!.confidence === 'ambiguous');
  if (anyFieldAmbiguous) {
    lowConfidenceReasons.push('One or more jurisdiction fields matched more than one candidate — see the ambiguous FieldMatch(es) in `resolved` for the candidate list.');
  }
  if (matchQuality.matchedViaFallback) {
    lowConfidenceReasons.push('Only matched after stripping an apartment/suite/unit designator — the interpolated position is for the base street address, not the specific unit.');
  }
  // Only meaningful while the interpolated point is the one being used:
  // a wide address range describes how loosely CENSUS positioned this
  // address, and says nothing about an authoritative point that replaced
  // it. Warning about it anyway would be describing a coordinate this
  // resolution didn't use.
  if (
    precision === 'interpolated' &&
    matchQuality.addressRangeWidth !== null &&
    matchQuality.addressRangeWidth > WIDE_ADDRESS_RANGE_THRESHOLD
  ) {
    lowConfidenceReasons.push(`Census interpolated this address within a wide address range (${matchQuality.addressRangeWidth} addresses on this block face) — less positionally precise than a narrow range, worth a second look if this address is near a jurisdiction boundary.`);
  }
  if (schoolDistrictLookupFailed) {
    lowConfidenceReasons.push('The Ohio school-district lookup (a separate Census service from the main geocoder) failed after retries — municipality/county resolution above is unaffected, but schoolDistrictCode was not attempted this call. Retry resolveAddress() to try again.');
  }
  if (crossCheck.placeDisagreement) {
    lowConfidenceReasons.push(`OpenStreetMap's independent geocoder resolved this address to a different place/county than Census did (Nominatim: ${crossCheck.nominatim?.place ?? '?'}, ${crossCheck.nominatim?.county ?? '?'}) — two independently-maintained datasets disagree, worth a second look before trusting either one.`);
  }
  if (crossCheck.distanceDisagreementMiles !== null && crossCheck.distanceDisagreementMiles > LARGE_DISTANCE_DISAGREEMENT_MILES) {
    lowConfidenceReasons.push(`OpenStreetMap's independent geocoder placed this address ${crossCheck.distanceDisagreementMiles.toFixed(2)} miles from Census's own coordinates — larger than ordinary interpolation slop, suggesting one of the two geocoders resolved a genuinely different location.`);
  }
  if (rooftopJurisdictionChanges.length > 0) {
    lowConfidenceReasons.push(
      `This address sits near a jurisdiction line: resolving it at ${describePoint(rooftop!)} (${rooftop!.metersFromInterpolated!.toFixed(0)}m from Census's interpolated position) produced DIFFERENT geographies — ${rooftopJurisdictionChanges.join('; ')}. The better point's answer is what's returned above; the interpolated answer is recorded here because a difference of this kind changes which local tax applies and deserves a human's eyes once.`,
    );
  }
  if (rooftop?.ambiguous) {
    lowConfidenceReasons.push(
      `The National Address Database has several points for this house number and street that are too far apart to be one building (${rooftop.match!.spreadMeters.toFixed(0)}m apart) — most likely the same address exists twice inside the search area. Census's interpolated position was kept rather than picking one of them.`,
    );
  }
  if (crossCheck.building.houseNumberGap !== null && crossCheck.building.houseNumberGap > LARGE_HOUSE_NUMBER_GAP) {
    const onStreet = crossCheck.building.onStreet!;
    lowConfidenceReasons.push(
      `The resolved point sits ${Math.round(onStreet.distanceMeters)}m from a mapped building tagged "${onStreet.houseNumber} ${onStreet.street}"` +
        (onStreet.name ? ` (${onStreet.name})` : '') +
        ` — ${crossCheck.building.houseNumberGap} house numbers from this address on the same street, which is numerically implausible for that distance. This is the check that caught a real Nominatim error on 90 W Broad St, Columbus (see buildings.ts); worth confirming the point landed on the right block before this address goes live.`,
    );
  }

  return {
    address,
    matched: true,
    resolved,
    certificateFields,
    matchQuality,
    crossCheck,
    precision,
    coordinates: point,
    rooftop,
    jedd,
    fullyResolved: lowConfidenceReasons.length === 0,
    lowConfidenceReasons,
  };
}

export interface EmployeeResolution {
  work: AddressResolution | null;
  residence: AddressResolution | null;
  /** The merged certificate object — everything from resolveAddress() for each role, PLUS the cross-address flags below. Feed this straight into PaycheckInput.workState.certificate. */
  certificateFields: Record<string, unknown>;
  /** Taxes this session confirmed CANNOT be resolved from Census/TIGERweb data at all (not a match failure — no boundary data exists for these). Surfaced so a caller doesn't mistake silence for "not applicable". */
  notResolvable: string[];
  /** Merged from both addresses' own AddressResolution.lowConfidenceReasons, each prefixed with which address it came from — empty when both addresses (that were supplied) resolved with full confidence. */
  lowConfidenceReasons: string[];
}

/**
 * Resolve an employee's work AND residence addresses together, applying
 * the cross-address business rules a single resolveAddress() call can't:
 *
 *   - New York City / Yonkers resident tax: RESIDENCE address only
 *     (nycLocalTax()/yonkersLocalTax()'s own doc comments — "applies to
 *     residents only").
 *   - Yonkers nonresident-worker tax: WORK address, and only when the
 *     residence address is NOT also Yonkers (the two are mutually
 *     exclusive per yonkersLocalTax()'s own doc comment).
 *   - Missouri Kansas City / St. Louis earnings tax, and Delaware's
 *     Wilmington Wage Tax: EITHER address (missouriLocalEarningsTax()'s/
 *     wilmingtonWageTax()'s own doc comments — "certificate.locality (the
 *     caller's own resolution of 'does this employee's residence OR work
 *     location put them in scope')").
 *   - Newark payroll tax: WORK address (an employer tax on services
 *     performed there).
 *   - Multnomah County Preschool For All tax: WORK address (Portland's own
 *     withholding guidance: "employees that work within Multnomah
 *     County" — confirmed directly, not assumed, since Metro's own
 *     guidance for the SHS tax uses the same "work within" framing).
 *   - West Virginia's Municipal Service Fee: WORK address (duty-station
 *     based, westVirginiaMunicipalServiceFee()'s own doc comment).
 *   - Denver's Occupational Privilege Tax: WORK address sets
 *     certificate.locality = 'Denver', but denverOccupationalPrivilegeTax()
 *     ALSO needs certificate.denverMonthlyCompensation and
 *     certificate.denverOPTWithheldThisMonth — genuine payroll-history
 *     facts no address can supply, surfaced via notResolvable below
 *     rather than silently left unset with no explanation.
 *
 * Either address may be omitted (e.g. an employee who lives out of state
 * and whose residence-state taxes aren't modelled here) — every rule above
 * degrades gracefully to "that flag stays false" rather than throwing.
 */
export async function resolveEmployee(
  addresses: { work?: string; residence?: string },
  checkDate: string,
): Promise<EmployeeResolution> {
  const [work, residence] = await Promise.all([
    addresses.work ? resolveAddress(addresses.work, 'work', checkDate) : Promise.resolve(null),
    addresses.residence
      ? resolveAddress(addresses.residence, 'residence', checkDate)
      : Promise.resolve(null),
  ]);

  const fields: Record<string, unknown> = {
    ...(work?.certificateFields ?? {}),
    ...(residence?.certificateFields ?? {}),
  };

  const workFlags = work?.resolved?.flags;
  const residenceFlags = residence?.resolved?.flags;

  if (residenceFlags?.newYorkCity) fields.nycResident = true;

  if (residenceFlags?.yonkers) {
    fields.yonkersResident = true;
  } else if (workFlags?.yonkers) {
    fields.yonkersNonresidentWorker = true;
  }

  if (workFlags?.newark) {
    fields.locality = 'Newark';
  } else if (workFlags?.kansasCity || residenceFlags?.kansasCity) {
    fields.locality = 'Kansas City';
  } else if (workFlags?.stLouis || residenceFlags?.stLouis) {
    fields.locality = 'St. Louis';
  } else if (workFlags?.wilmington || residenceFlags?.wilmington) {
    fields.locality = 'Wilmington';
  }

  if (workFlags?.multnomahCounty) fields.multnomahCounty = true;

  // Seattle's JumpStart payroll expense tax. Employer-paid, and banded by
  // BOTH the employer's prior-year Seattle payroll and the employee's own
  // annual compensation — neither of which an address can supply. Setting
  // the locality is what makes seattlePayrollExpenseTax() reachable at
  // all; the two figures it still needs are reported in notResolvable
  // below, the same way Denver's are.
  if (workFlags?.seattle) fields.locality = 'Seattle';

  if (work?.resolved?.wvServiceFeeCity) {
    fields.locality = work.resolved.wvServiceFeeCity;
  }

  const notResolvable: string[] = [];
  const workState = work?.resolved?.state ?? residence?.resolved?.state;
  if (workState === 'OR') {
    // Metro's district is not a Census geography — it covers the urban
    // parts of three counties and stops short of each one's full extent —
    // so it's resolved against the boundary Metro itself publishes. The
    // WORK address decides it: Metro's own withholding guidance keys the
    // SHS tax off where the work is performed, the same framing
    // multnomahCounty already uses above.
    const metroPoint = work?.coordinates ?? null;
    if (metroPoint) {
      const metro = await isInsidePortlandMetro(metroPoint.lat, metroPoint.lon);
      if (metro.attempted) {
        if (metro.inside) fields.metroDistrict = true;
      } else {
        notResolvable.push(
          "Portland Metro's Supportive Housing Services district (certificate.metroDistrict) — Metro's own boundary service could not be reached this call, so this was NOT determined either way. Retry before treating its absence as 'outside the district'.",
        );
      }
    }
    notResolvable.push(
      "Oregon's TriMet and Lane Transit District boundaries (certificate.locality = 'TriMet'/'LTD') — both districts publish their boundaries only as downloadable files (developer.trimet.org/gis), not as a service this can query per address; must be supplied manually. See geocode/districts.ts.",
    );
  }
  if (workFlags?.seattle) {
    notResolvable.push(
      "Seattle's JumpStart payroll expense tax needs input.employer.seattlePriorYearPayrollExpense (which rate tier " +
        "the employer falls in) and input.ytd.seattleCompensation (this employee's Seattle pay so far this year). " +
        "Both are payroll facts no address can answer. certificate.locality was set to 'Seattle'; those two still need caller input.",
    );
  }
  if (workFlags?.denver) {
    fields.locality = 'Denver';
    notResolvable.push(
      "Denver's Occupational Privilege Tax needs certificate.denverMonthlyCompensation (this month's cumulative Denver-sourced pay so far) and certificate.denverOPTWithheldThisMonth — real payroll-history facts, not something any address can supply. certificate.locality was set to 'Denver'; those two fields still need caller input.",
    );
  }

  const lowConfidenceReasons = [
    ...(work?.lowConfidenceReasons ?? []).map((r) => `Work address: ${r}`),
    ...(residence?.lowConfidenceReasons ?? []).map((r) => `Residence address: ${r}`),
  ];

  return { work, residence, certificateFields: fields, notResolvable, lowConfidenceReasons };
}

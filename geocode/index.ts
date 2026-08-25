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
import { fetchSchoolDistrictAtPointSafe, geocodeAddress, type MatchQuality } from './census.ts';
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
 * A WIDE interpolation range is the honest signal this project can offer
 * in place of true rooftop precision (see census.ts's own doc comment for
 * why it can't do better without a paid geocoder). 20 is not a scientific
 * threshold — it's a deliberately conservative "worth a second look before
 * this address goes live near a boundary" line, picked to flag block faces
 * with many addressable lots rather than ordinary short suburban blocks.
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
}

export interface AddressResolution {
  address: string;
  matched: boolean;
  resolved: ResolvedJurisdiction | null;
  certificateFields: Record<string, unknown>;
  matchQuality: MatchQuality | null;
  crossCheck: CrossCheckResult | null;
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
async function geocodeAndResolve(address: string, checkDate: string): Promise<{
  resolved: ResolvedJurisdiction;
  matched: true;
  matchQuality: MatchQuality;
  schoolDistrictLookupFailed: boolean;
  coordinates: { x: number; y: number };
  geographies: { incorporatedPlaces: string[]; counties: string[] };
} | {
  resolved: null;
  matched: false;
  matchQuality: null;
  schoolDistrictLookupFailed: false;
  coordinates: null;
  geographies: null;
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
    };
  }

  let schoolDistrictName: string | undefined;
  let schoolDistrictLookupFailed = false;
  if (geocoded.geographies.state === 'OH') {
    const sd = await fetchSchoolDistrictAtPointSafe(geocoded.coordinates.x, geocoded.coordinates.y);
    if (sd.ok) {
      schoolDistrictName = sd.district ?? undefined;
    } else {
      schoolDistrictLookupFailed = true;
    }
  }

  return {
    resolved: resolveJurisdiction(geocoded.geographies, checkDate, schoolDistrictName),
    matched: true,
    matchQuality: geocoded.matchQuality,
    schoolDistrictLookupFailed,
    coordinates: geocoded.coordinates,
    geographies: {
      incorporatedPlaces: geocoded.geographies.incorporatedPlaces,
      counties: geocoded.geographies.counties,
    },
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
  const outcome = await crossCheckSafe(address);
  if (!outcome.ok || !outcome.result.matched) {
    return { attempted: false, nominatim: null, placeDisagreement: false, distanceDisagreementMiles: null };
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
  const { resolved, matched, matchQuality, schoolDistrictLookupFailed, coordinates, geographies } =
    await geocodeAndResolve(address, checkDate);
  if (!matched) {
    return {
      address,
      matched: false,
      resolved: null,
      certificateFields: {},
      matchQuality: null,
      crossCheck: null,
      fullyResolved: false,
      lowConfidenceReasons: ['Census could not match this address at all, even after retrying with any apartment/suite/unit designator stripped.'],
    };
  }

  const certificateFields = toCertificateFields(resolved, role);
  const crossCheck = await runCrossCheck(address, geographies, coordinates);

  const lowConfidenceReasons: string[] = [];
  const anyFieldAmbiguous = attemptedMatches(resolved).some((m) => m!.confidence === 'ambiguous');
  if (anyFieldAmbiguous) {
    lowConfidenceReasons.push('One or more jurisdiction fields matched more than one candidate — see the ambiguous FieldMatch(es) in `resolved` for the candidate list.');
  }
  if (matchQuality.matchedViaFallback) {
    lowConfidenceReasons.push('Only matched after stripping an apartment/suite/unit designator — the interpolated position is for the base street address, not the specific unit.');
  }
  if (matchQuality.addressRangeWidth !== null && matchQuality.addressRangeWidth > WIDE_ADDRESS_RANGE_THRESHOLD) {
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

  return {
    address,
    matched: true,
    resolved,
    certificateFields,
    matchQuality,
    crossCheck,
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

  if (work?.resolved?.wvServiceFeeCity) {
    fields.locality = work.resolved.wvServiceFeeCity;
  }

  const notResolvable: string[] = [];
  const workState = work?.resolved?.state ?? residence?.resolved?.state;
  if (workState === 'OR') {
    notResolvable.push(
      "Portland Metro's Supportive Housing Services district (certificate.metroDistrict) — no Census/TIGERweb boundary data exists for this regional-government special district; must be supplied manually.",
      "Oregon's TriMet and Lane Transit District boundaries (certificate.locality = 'TriMet'/'LTD') — same reason, no boundary data available via Census.",
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

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
import { fetchSchoolDistrictAtPoint, geocodeAddress } from './census.ts';
import { resolveJurisdiction, toCertificateFields, type ResolvedJurisdiction } from './resolve.ts';

export type {
  CensusGeographies,
  FieldMatch,
  MatchConfidence,
  ResolvedJurisdiction,
} from './resolve.ts';
export { resolveJurisdiction, toCertificateFields } from './resolve.ts';
export { geocodeAddress, fetchSchoolDistrictAtPoint } from './census.ts';

export interface AddressResolution {
  address: string;
  matched: boolean;
  resolved: ResolvedJurisdiction | null;
  certificateFields: Record<string, unknown>;
  /** True when every field the address could plausibly need was 'matched' — false means a human should look before this address goes live in certificate data. */
  fullyResolved: boolean;
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

/** Geocode one address and resolve it against every registry this module knows how to match. Returns matched: false, not a throw, when Census has no match — an unmatched address is a common, expected outcome. */
async function geocodeAndResolve(
  address: string,
  checkDate: string,
): Promise<{ resolved: ResolvedJurisdiction; matched: true } | { resolved: null; matched: false }> {
  const geocoded = await geocodeAddress(address);
  if (!geocoded.matched || !geocoded.geographies || !geocoded.coordinates) {
    return { resolved: null, matched: false };
  }

  let schoolDistrictName: string | undefined;
  if (geocoded.geographies.state === 'OH') {
    schoolDistrictName =
      (await fetchSchoolDistrictAtPoint(geocoded.coordinates.x, geocoded.coordinates.y)) ??
      undefined;
  }

  return {
    resolved: resolveJurisdiction(geocoded.geographies, checkDate, schoolDistrictName),
    matched: true,
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
  const { resolved, matched } = await geocodeAndResolve(address, checkDate);
  if (!matched) {
    return { address, matched: false, resolved: null, certificateFields: {}, fullyResolved: false };
  }

  const certificateFields = toCertificateFields(resolved, role);
  const fullyResolved = attemptedMatches(resolved).every((m) => m!.confidence !== 'ambiguous');

  return { address, matched: true, resolved, certificateFields, fullyResolved };
}

export interface EmployeeResolution {
  work: AddressResolution | null;
  residence: AddressResolution | null;
  /** The merged certificate object — everything from resolveAddress() for each role, PLUS the cross-address flags below. Feed this straight into PaycheckInput.workState.certificate. */
  certificateFields: Record<string, unknown>;
  /** Taxes this session confirmed CANNOT be resolved from Census/TIGERweb data at all (not a match failure — no boundary data exists for these). Surfaced so a caller doesn't mistake silence for "not applicable". */
  notResolvable: string[];
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
 *   - Missouri Kansas City / St. Louis earnings tax: EITHER address
 *     (missouriLocalEarningsTax()'s own doc comment — "certificate.locality
 *     (the caller's own resolution of 'does this employee's residence OR
 *     work location put them in scope')").
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

  return { work, residence, certificateFields: fields, notResolvable };
}

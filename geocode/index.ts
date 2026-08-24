/**
 * Public entry point: one street address in, resolved certificate fields
 * out. Ties together census.ts's live fetches and resolve.ts's pure
 * matching — kept as a thin orchestrator so each half stays independently
 * testable (resolve.ts's tests use captured fixture JSON; this file itself
 * is exercised only by examples/geocode-demo.ts against the live services).
 *
 * This is explicitly an ONBOARDING/ADDRESS-CHANGE step, not something
 * calculatePaycheck() ever calls — see this module's own README section
 * for why. Call it once when an employee's work or home address is entered
 * or changes, review anything below 'matched' confidence, then store the
 * resulting certificate fields on the employee record for calculatePaycheck()
 * to read on every subsequent paycheck without ever touching the network.
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

/**
 * Resolve a full street address (e.g. "2 Woodward Ave, Detroit, MI 48226")
 * into the certificate fields taxes/state.ts already knows how to read.
 * `role` controls whether MI/OH local fields land as workCity/residenceCity
 * and PA's PSD lands as workPSD/residencePSD — the same employee's home and
 * work addresses are typically resolved as two separate calls.
 */
export async function resolveAddress(
  address: string,
  role: 'work' | 'residence',
  checkDate: string,
): Promise<AddressResolution> {
  const geocoded = await geocodeAddress(address);
  if (!geocoded.matched || !geocoded.geographies || !geocoded.coordinates) {
    return { address, matched: false, resolved: null, certificateFields: {}, fullyResolved: false };
  }

  let schoolDistrictName: string | undefined;
  if (geocoded.geographies.state === 'OH') {
    schoolDistrictName =
      (await fetchSchoolDistrictAtPoint(geocoded.coordinates.x, geocoded.coordinates.y)) ??
      undefined;
  }

  const resolved = resolveJurisdiction(geocoded.geographies, checkDate, schoolDistrictName);
  const certificateFields = toCertificateFields(resolved, role);

  const attempted = [
    resolved.miCity,
    resolved.ohMunicipality,
    resolved.ohSchoolDistrict,
    resolved.county,
    resolved.paJurisdiction,
  ].filter((m) => m !== null);
  const fullyResolved = attempted.every((m) => m!.confidence !== 'ambiguous');

  return { address, matched: true, resolved, certificateFields, fullyResolved };
}

/**
 * Address -> jurisdiction resolution, pure half.
 *
 * This module never touches the network — it takes ALREADY-FETCHED Census
 * geography data (the same "fetch is a parameter, not a side effect"
 * separation harvester/harvest.ts uses for harvestSource()) and matches it
 * against this project's own name-keyed local tax registries. That split
 * is what makes this deterministically unit-testable with a captured JSON
 * fixture instead of a live HTTP call, and it's also what keeps a resolved
 * address from becoming a silent moving target: the resolution step runs
 * ONCE per employee address (like the harvester's review gate), not once
 * per paycheck. calculatePaycheck() itself still never touches the network
 * — this module only ever produces the certificate fields it already
 * accepts (workCity, county, schoolDistrictCode, workPSD, ...), it doesn't
 * change how paychecks are computed.
 */
import {
  allCounties,
  allMICities,
  allOHMunicipalities,
  allOHSchoolDistricts,
  allPALocalJurisdictions,
  type CountyEntry,
  type MICityEntry,
  type OHMunicipalityEntry,
  type OHSchoolDistrictEntry,
  type PALocalEntry,
} from '../src/registry.ts';
import {
  namesEqual,
  schoolDistrictKeyFromCensusName,
  schoolDistrictKeyFromDataFileName,
  schoolDistrictKeysMatch,
  stripCountySuffix,
  stripPlaceTypeSuffix,
  toPAMunicipalityForm,
} from './normalize.ts';

/** A confidence tier for one resolved field — the same disclosed-tier ethos this project's data files already use (source_verified / modelled / etc.), applied to a MATCH instead of a rate. */
export type MatchConfidence = 'matched' | 'no_match' | 'ambiguous';

export interface FieldMatch<T> {
  confidence: MatchConfidence;
  entry: T | null;
  /** All candidates found when confidence is 'ambiguous' — surfaced for a human to pick, never guessed at. */
  candidates?: T[];
}

/**
 * The subset of a Census geocoder "geographies" response this module reads.
 * Mirrors the real API's field names (NAME, STUSAB) directly rather than
 * inventing new ones, so a caller can pass a real response's `geographies`
 * object through with minimal reshaping — see census.ts's fetch wrapper.
 */
export interface CensusGeographies {
  state: string; // 2-letter USPS code, e.g. "OH"
  incorporatedPlaces: string[];
  countySubdivisions: string[];
  counties: string[]; // e.g. "Franklin County" — Census's own suffixed form
}

function matchMICityByName(places: string[], checkDate: string): FieldMatch<MICityEntry> {
  const all = allMICities(checkDate);
  const candidates: MICityEntry[] = [];
  for (const place of places) {
    const stripped = stripPlaceTypeSuffix(place);
    const hit = all.find((c) => namesEqual(c.name, stripped));
    if (hit && !candidates.includes(hit)) candidates.push(hit);
  }
  if (candidates.length === 1) return { confidence: 'matched', entry: candidates[0] };
  if (candidates.length > 1) return { confidence: 'ambiguous', entry: null, candidates };
  return { confidence: 'no_match', entry: null };
}

function matchOHMunicipalityByName(
  places: string[],
  countySubdivisions: string[],
  checkDate: string,
): FieldMatch<OHMunicipalityEntry> {
  const all = allOHMunicipalities(checkDate);
  const candidateNames = [...places, ...countySubdivisions].map(stripPlaceTypeSuffix);
  const candidates: OHMunicipalityEntry[] = [];
  for (const name of candidateNames) {
    const hit = all.find((m) => namesEqual(m.name, name));
    if (hit && !candidates.includes(hit)) candidates.push(hit);
  }
  if (candidates.length === 1) return { confidence: 'matched', entry: candidates[0] };
  if (candidates.length > 1) return { confidence: 'ambiguous', entry: null, candidates };
  // Genuinely correct outcome for most Ohio addresses, not a failure: only
  // ~679 of Ohio's thousands of townships/unincorporated areas tax income.
  return { confidence: 'no_match', entry: null };
}

function matchCountyByName(
  stateCode: string,
  censusCounties: string[],
  checkDate: string,
): FieldMatch<CountyEntry> {
  const all = allCounties(stateCode, checkDate);
  const candidates: CountyEntry[] = [];
  for (const c of censusCounties) {
    const stripped = stripCountySuffix(c);
    const hit = all.find((e) => namesEqual(e.name, stripped));
    if (hit && !candidates.includes(hit)) candidates.push(hit);
  }
  if (candidates.length === 1) return { confidence: 'matched', entry: candidates[0] };
  if (candidates.length > 1) return { confidence: 'ambiguous', entry: null, candidates };
  return { confidence: 'no_match', entry: null };
}

/**
 * Pennsylvania's PSD codes are keyed by (county, municipality) together —
 * Census's "Abington township" alone isn't unique across PA's 67 counties,
 * so this requires BOTH a county match (against the county Census already
 * resolved from the same geocode) and a municipality-name match against
 * the PA-form-converted county-subdivision name.
 */
function matchPAJurisdiction(
  censusCounties: string[],
  countySubdivisions: string[],
  checkDate: string,
): FieldMatch<PALocalEntry> {
  const all = allPALocalJurisdictions(checkDate);
  const countyNames = censusCounties.map((c) => stripCountySuffix(c).toUpperCase());
  const municipalityForms = countySubdivisions.map(toPAMunicipalityForm);

  const candidates: PALocalEntry[] = [];
  for (const entry of all) {
    const countyOk = countyNames.some((c) => namesEqual(c, entry.county));
    const muniOk = municipalityForms.some((m) => namesEqual(m, entry.municipality));
    if (countyOk && muniOk && !candidates.includes(entry)) candidates.push(entry);
  }
  if (candidates.length === 1) return { confidence: 'matched', entry: candidates[0] };
  if (candidates.length > 1) return { confidence: 'ambiguous', entry: null, candidates };
  return { confidence: 'no_match', entry: null };
}

/**
 * Ohio school district matching, given the district name TIGERweb's
 * identify operation returned at the resolved coordinates (see census.ts's
 * fetchSchoolDistrictAtPoint() — a SEPARATE Census service from the
 * geocoder, since school district boundaries aren't in the geocoder's own
 * "geographies" response). A non-match here is the common, CORRECT case:
 * only 214 of Ohio's 600+ school districts currently levy SDIT at all.
 */
function matchOHSchoolDistrictByName(
  censusSchoolDistrictName: string,
  checkDate: string,
): FieldMatch<OHSchoolDistrictEntry> {
  const key = schoolDistrictKeyFromCensusName(censusSchoolDistrictName);
  const all = allOHSchoolDistricts(checkDate);
  const candidates = all.filter((d) =>
    schoolDistrictKeysMatch(key, schoolDistrictKeyFromDataFileName(d.name)),
  );
  if (candidates.length === 1) return { confidence: 'matched', entry: candidates[0] };
  if (candidates.length > 1) return { confidence: 'ambiguous', entry: null, candidates };
  return { confidence: 'no_match', entry: null };
}

export interface ResolvedJurisdiction {
  state: string;
  miCity: FieldMatch<MICityEntry> | null;
  ohMunicipality: FieldMatch<OHMunicipalityEntry> | null;
  ohSchoolDistrict: FieldMatch<OHSchoolDistrictEntry> | null;
  county: FieldMatch<CountyEntry> | null;
  paJurisdiction: FieldMatch<PALocalEntry> | null;
}

/**
 * Resolve one address's geography (already fetched) against every local
 * registry this project currently has wired to calc code. Only attempts
 * the match(es) relevant to the resolved state — e.g. a Texas address
 * never runs the Ohio municipality matcher — since every other state's
 * "local" concept doesn't exist here and running it would just produce a
 * meaningless no_match rather than an informative skip.
 */
export function resolveJurisdiction(
  geo: CensusGeographies,
  checkDate: string,
  ohSchoolDistrictName?: string,
): ResolvedJurisdiction {
  const state = geo.state.toUpperCase();
  const result: ResolvedJurisdiction = {
    state,
    miCity: null,
    ohMunicipality: null,
    ohSchoolDistrict: null,
    county: null,
    paJurisdiction: null,
  };

  if (state === 'MI') {
    result.miCity = matchMICityByName(geo.incorporatedPlaces, checkDate);
  }
  if (state === 'OH') {
    result.ohMunicipality = matchOHMunicipalityByName(
      geo.incorporatedPlaces,
      geo.countySubdivisions,
      checkDate,
    );
    if (ohSchoolDistrictName) {
      result.ohSchoolDistrict = matchOHSchoolDistrictByName(ohSchoolDistrictName, checkDate);
    }
  }
  if (state === 'IN') {
    result.county = matchCountyByName('IN', geo.counties, checkDate);
  }
  if (state === 'PA') {
    result.paJurisdiction = matchPAJurisdiction(geo.counties, geo.countySubdivisions, checkDate);
  }

  return result;
}

/**
 * Convert a resolved jurisdiction into the exact certificate field names
 * taxes/state.ts already reads (certificate.workCity, .county, .workPSD,
 * .schoolDistrictCode — see ohioLocalTax(), michiganLocalTax(),
 * flatRateMultiExemption() for Indiana, pennsylvaniaLocalTax()). Only
 * includes a field when its match was unambiguous ('matched') — an
 * 'ambiguous' or 'no_match' result is surfaced by the caller (see
 * ResolvedJurisdiction itself) for a human to resolve, never silently
 * guessed into a certificate field that would then silently drive real
 * withholding.
 */
export function toCertificateFields(
  resolved: ResolvedJurisdiction,
  role: 'work' | 'residence',
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  if (resolved.miCity?.confidence === 'matched' && resolved.miCity.entry) {
    fields[role === 'work' ? 'workCity' : 'residenceCity'] = resolved.miCity.entry.name;
  }
  if (resolved.ohMunicipality?.confidence === 'matched' && resolved.ohMunicipality.entry) {
    fields[role === 'work' ? 'workCity' : 'residenceCity'] = resolved.ohMunicipality.entry.name;
  }
  if (resolved.ohSchoolDistrict?.confidence === 'matched' && resolved.ohSchoolDistrict.entry) {
    fields.schoolDistrictCode = resolved.ohSchoolDistrict.entry.sdNumber;
  }
  if (resolved.county?.confidence === 'matched' && resolved.county.entry) {
    fields.county = resolved.county.entry.name;
  }
  if (resolved.paJurisdiction?.confidence === 'matched' && resolved.paJurisdiction.entry) {
    fields[role === 'work' ? 'workPSD' : 'residencePSD'] = resolved.paJurisdiction.entry.psdCode;
  }

  return fields;
}

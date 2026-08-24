import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DATA_ROOT = join(import.meta.dirname, '..', 'data');

const cache = new Map<string, unknown>();

function loadJson<T>(relPath: string): T {
  const cached = cache.get(relPath);
  if (cached !== undefined) return cached as T;

  const full = join(DATA_ROOT, relPath);
  if (!existsSync(full)) {
    throw new RulesetNotFoundError(relPath);
  }
  const parsed = JSON.parse(readFileSync(full, 'utf8')) as T;
  cache.set(relPath, parsed);
  return parsed;
}

export class RulesetNotFoundError extends Error {
  readonly relPath: string;

  constructor(relPath: string) {
    super(
      `No ruleset at data/${relPath}. Rates are data, not code: add the file ` +
        `(with its source URL and verifiedOn date) rather than hardcoding a rate.`,
    );
    this.name = 'RulesetNotFoundError';
    this.relPath = relPath;
  }
}

/**
 * Resolve the tax year from a check date.
 *
 * Deliberately derived from the check date and never from the clock: a
 * correction run in March for a December check must use December's rules.
 */
export function yearOf(checkDate: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(checkDate);
  if (!m) throw new Error(`checkDate must be ISO yyyy-mm-dd, got: ${checkDate}`);
  return Number(m[1]);
}

export interface Bracket {
  from: number;
  to: number | null;
  base: number;
  rate: number;
}

export interface FederalRuleset {
  year: number;
  sources: { id: string; title: string; url: string; verifiedOn: string }[];
  incomeTax: {
    step1StandardAdjustment: { married_joint: number; other: number };
    supplementalRate: number;
    supplementalMandatoryRate: number;
    supplementalMandatoryThreshold: number;
    standardSchedules: Record<string, Bracket[]>;
    multipleJobsSchedules: Record<string, Bracket[]>;
    exemptPretax: string[];
    nonresidentAlienAdjustment: Record<string, number>;
  };
  socialSecurity: {
    employeeRate: number;
    employerRate: number;
    wageBase: number;
    exemptPretax: string[];
  };
  medicare: {
    employeeRate: number;
    employerRate: number;
    wageBase: number | null;
    additional: { rate: number; threshold: number; employeeOnly: boolean };
    exemptPretax: string[];
  };
  futa: {
    netRate: number;
    wageBase: number;
    exemptPretax: string[];
  };
}

export function federalRuleset(checkDate: string): FederalRuleset {
  return loadJson<FederalRuleset>(join('federal', `${yearOf(checkDate)}.json`));
}

export interface StateRuleset {
  code: string;
  name: string;
  year: number;
  method: string;
  sources: { title: string; url: string; verifiedOn: string }[];
  [key: string]: unknown;
}

export function stateRuleset(code: string, checkDate: string): StateRuleset {
  return loadJson<StateRuleset>(
    join('states', `${code.toUpperCase()}-${yearOf(checkDate)}.json`),
  );
}

export function hasStateRuleset(code: string, checkDate: string): boolean {
  return existsSync(
    join(DATA_ROOT, 'states', `${code.toUpperCase()}-${yearOf(checkDate)}.json`),
  );
}

export interface CountyEntry {
  name: string;
  countyCode: string;
  rate: number;
  changedSinceOct2025?: boolean;
}

interface CountyRegistryFile {
  year: number;
  counties: CountyEntry[];
}

/**
 * Whether a mandatory county-level registry exists for this state/year — e.g.
 * Indiana, where every address falls inside exactly one of 92 counties (no
 * closed-list-with-a-zero-case the way Michigan's 24 cities work).
 */
export function hasCountyRuleset(stateCode: string, checkDate: string): boolean {
  return existsSync(
    join(DATA_ROOT, 'local', `${stateCode.toUpperCase()}-counties-${yearOf(checkDate)}.json`),
  );
}

/**
 * Look up one county's rate by name (case-insensitive). Returns undefined
 * for an unrecognised name rather than throwing — the caller decides how to
 * surface that (see taxes/state.ts's handling of a missing/unknown county).
 */
export function countyRuleset(
  stateCode: string,
  countyName: string,
  checkDate: string,
): CountyEntry | undefined {
  const file = loadJson<CountyRegistryFile>(
    join('local', `${stateCode.toUpperCase()}-counties-${yearOf(checkDate)}.json`),
  );
  return file.counties.find(
    (c) => c.name.toLowerCase() === countyName.toLowerCase(),
  );
}

/**
 * Every county in one state's registry — for a caller that needs to search
 * (e.g. geocode/'s fuzzy name matching) rather than look up an exact known
 * name the way countyRuleset() does.
 */
export function allCounties(stateCode: string, checkDate: string): CountyEntry[] {
  const file = loadJson<CountyRegistryFile>(
    join('local', `${stateCode.toUpperCase()}-counties-${yearOf(checkDate)}.json`),
  );
  return file.counties;
}

export interface PALocalEntry {
  psdCode: string;
  county: string;
  municipality: string;
  schoolDistrict: string;
  residentEIT: number;
  nonresidentEIT: number;
  schoolDistrictEIT: number;
  totalResidentEIT: number;
  lst?: {
    municipal: number;
    schoolDistrict: number;
    total: number;
    lowIncomeExemption?: { municipal: number; schoolDistrict: number };
  };
}

interface PALocalRegistryFile {
  year: number;
  jurisdictions: PALocalEntry[];
}

/** Whether a PA Act 32 local (EIT/LST) registry exists for this check date. */
export function hasPALocalRuleset(checkDate: string): boolean {
  return existsSync(join(DATA_ROOT, 'local', `PA-EIT-LST-${yearOf(checkDate)}.json`));
}

/**
 * Look up one PSD (Political Subdivision) code's EIT/LST rates. Returns
 * undefined for an unrecognised code — same convention as countyRuleset(),
 * the caller (taxes/state.ts) decides how to surface that.
 */
export function paLocalRuleset(
  psdCode: string,
  checkDate: string,
): PALocalEntry | undefined {
  const file = loadJson<PALocalRegistryFile>(
    join('local', `PA-EIT-LST-${yearOf(checkDate)}.json`),
  );
  return file.jurisdictions.find((j) => j.psdCode === psdCode);
}

/** Every PA Act 32 jurisdiction — for geocode/'s county+municipality search. */
export function allPALocalJurisdictions(checkDate: string): PALocalEntry[] {
  const file = loadJson<PALocalRegistryFile>(
    join('local', `PA-EIT-LST-${yearOf(checkDate)}.json`),
  );
  return file.jurisdictions;
}

export interface MICityEntry {
  name: string;
  residentRate: number;
  nonresidentRate: number;
  exemptionAmount: number;
}

interface MICityRegistryFile {
  year: number;
  cities: MICityEntry[];
}

/** Whether a Michigan local city-income-tax registry exists for this check date. */
export function hasMICityRuleset(checkDate: string): boolean {
  return existsSync(join(DATA_ROOT, 'local', `MI-cities-${yearOf(checkDate)}.json`));
}

/**
 * Look up one Michigan city's rates by name (case-insensitive) — same
 * "closed list, undefined for an unrecognised name" convention as
 * countyRuleset()/paLocalRuleset(). An undefined return here is the
 * CORRECT signal for "not one of the 24 taxing cities," not a data gap —
 * see MI-cities-2026.json's own localTaxScope: any address not in the
 * list owes $0 by the same closed-list authority (Act 284).
 */
export function miCityRuleset(
  cityName: string,
  checkDate: string,
): MICityEntry | undefined {
  const file = loadJson<MICityRegistryFile>(
    join('local', `MI-cities-${yearOf(checkDate)}.json`),
  );
  return file.cities.find((c) => c.name.toLowerCase() === cityName.toLowerCase());
}

/** Every Michigan taxing city — for geocode/'s fuzzy name matching. */
export function allMICities(checkDate: string): MICityEntry[] {
  const file = loadJson<MICityRegistryFile>(
    join('local', `MI-cities-${yearOf(checkDate)}.json`),
  );
  return file.cities;
}

export interface OHMunicipalityEntry {
  name: string;
  municode: string;
  rate: number;
  effectiveFrom: string;
  administeredBy: string;
}

interface OHMunicipalityRegistryFile {
  year: number;
  municipalities: OHMunicipalityEntry[];
}

/** Whether an Ohio municipal income tax registry exists for this check date. */
export function hasOHMunicipalityRuleset(checkDate: string): boolean {
  return existsSync(join(DATA_ROOT, 'local', `OH-municipalities-${yearOf(checkDate)}.json`));
}

/**
 * Look up one Ohio municipality's rate by name (case-insensitive) — same
 * "closed list, undefined for an unrecognised name" convention as
 * miCityRuleset()/countyRuleset(). Unlike Michigan's file, there is only
 * ONE rate per municipality (not a resident/nonresident split) — see
 * OH-municipalities-2026.json's own residencyNote: this rate applies to
 * income earned within the municipality regardless of who earned it, and
 * separately to a RESIDENT's total income if their home municipality is
 * also on this list. taxes/state.ts's ohioLocalTax() is what combines the
 * two roles and applies the ORC 718.121 inter-municipal credit.
 */
export function ohMunicipalityRuleset(
  name: string,
  checkDate: string,
): OHMunicipalityEntry | undefined {
  const file = loadJson<OHMunicipalityRegistryFile>(
    join('local', `OH-municipalities-${yearOf(checkDate)}.json`),
  );
  return file.municipalities.find((m) => m.name.toLowerCase() === name.toLowerCase());
}

/** Every Ohio taxing municipality — for geocode/'s fuzzy name matching. */
export function allOHMunicipalities(checkDate: string): OHMunicipalityEntry[] {
  const file = loadJson<OHMunicipalityRegistryFile>(
    join('local', `OH-municipalities-${yearOf(checkDate)}.json`),
  );
  return file.municipalities;
}

export interface OHSchoolDistrictEntry {
  county: string;
  sdNumber: string;
  irn: string;
  name: string;
  rate2026: number;
  earnedIncomeOnlyBase: boolean;
  firstYearEffective: number;
}

interface OHSchoolDistrictRegistryFile {
  year: number;
  districts: OHSchoolDistrictEntry[];
}

/** Whether an Ohio School District Income Tax (SDIT) registry exists for this check date. */
export function hasOHSchoolDistrictRuleset(checkDate: string): boolean {
  return existsSync(join(DATA_ROOT, 'local', `OH-school-districts-${yearOf(checkDate)}.json`));
}

/**
 * Look up one Ohio school district's SDIT rate by its 4-digit sdNumber —
 * not by name, since Ohio's own published names carry embedded annotations
 * (e.g. "Bluffton EVSD (expires 2028)") that make an exact-string caller
 * input unreliable; sdNumber is the stable, unambiguous key Ohio's own SD 100
 * withholding forms use. Same "closed list, undefined for an unrecognised
 * code" convention as every other local lookup in this file.
 */
export function ohSchoolDistrictRuleset(
  sdNumber: string,
  checkDate: string,
): OHSchoolDistrictEntry | undefined {
  const file = loadJson<OHSchoolDistrictRegistryFile>(
    join('local', `OH-school-districts-${yearOf(checkDate)}.json`),
  );
  return file.districts.find((d) => d.sdNumber === sdNumber);
}

/** Every Ohio school district that levies SDIT — for geocode/'s fuzzy name matching. */
export function allOHSchoolDistricts(checkDate: string): OHSchoolDistrictEntry[] {
  const file = loadJson<OHSchoolDistrictRegistryFile>(
    join('local', `OH-school-districts-${yearOf(checkDate)}.json`),
  );
  return file.districts;
}

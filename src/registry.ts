import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DATA_ROOT = join(import.meta.dirname, '..', 'data');

const cache = new Map<string, unknown>();

/**
 * Reads one data file's raw text, or returns undefined if it doesn't
 * exist. Defaults to real Node filesystem access (every existing
 * consumer — the test suite, examples/, the CLI tools). Swappable via
 * setDataReader() for runtimes with no filesystem at all, e.g. a
 * Supabase Edge Function (Deno, sandboxed) serving this engine as an API:
 * there, main.ts calls setDataReader() once at startup with a reader
 * backed by a build-time-bundled object instead of node:fs, and every
 * other file in src/ — already written with explicit .ts import
 * extensions throughout, which happens to be exactly what Deno's own
 * module resolution requires — runs completely unmodified.
 */
export type DataReader = (relPath: string) => string | undefined;

let dataReader: DataReader = (relPath) => {
  const full = join(DATA_ROOT, relPath);
  return existsSync(full) ? readFileSync(full, 'utf8') : undefined;
};

export function setDataReader(reader: DataReader): void {
  dataReader = reader;
  cache.clear();
}

/**
 * Whether a data file exists, routed through the SAME swappable dataReader
 * loadJson() uses — every hasXRuleset() below used to call node:fs's
 * existsSync() directly against DATA_ROOT instead, which happened to work
 * under the real filesystem but always returned false under a swapped
 * reader (e.g. the Edge Function's build-time bundled object, which has no
 * filesystem at all): the file was genuinely present in the bundle, but
 * the existence CHECK never looked there, so callers like calculatePaycheck
 * silently believed a state's own ruleset didn't exist. Routing through
 * the same reader as the actual load guarantees the two can never disagree
 * again.
 */
function dataFileExists(relPath: string): boolean {
  return dataReader(relPath.replace(/\\/g, '/')) !== undefined;
}

function loadJson<T>(relPath: string): T {
  const cached = cache.get(relPath);
  if (cached !== undefined) return cached as T;

  // Normalized to forward slashes regardless of host OS (join() on
  // Windows produces backslashes) so a bundled-object reader keyed by a
  // fixed forward-slash convention matches reliably on every platform.
  const key = relPath.replace(/\\/g, '/');
  const raw = dataReader(key);
  if (raw === undefined) {
    throw new RulesetNotFoundError(relPath);
  }
  const parsed = JSON.parse(raw) as T;
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
  return dataFileExists(join('states', `${code.toUpperCase()}-${yearOf(checkDate)}.json`));
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
  return dataFileExists(
    join('local', `${stateCode.toUpperCase()}-counties-${yearOf(checkDate)}.json`),
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
  return dataFileExists(join('local', `PA-EIT-LST-${yearOf(checkDate)}.json`));
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
  return dataFileExists(join('local', `MI-cities-${yearOf(checkDate)}.json`));
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

export interface KYJurisdictionEntry {
  name: string;
  /** Flat rate applying regardless of residency. Null when this jurisdiction instead uses a resident/nonresident split (see the two fields below). */
  wageRateDecimal: number | null;
  wageRateResidentDecimal: number | null;
  wageRateNonresidentDecimal: number | null;
  /** KRS 68.197(10)(c)'s SS-wage-base-cap variant — Walton and Florence are the two confirmed real-world users. When true, this jurisdiction's taxable base stops accruing once YTD wages reach the federal Social Security wage base, the same cap FICA itself uses. */
  capAtSSWageBase: boolean;
}

interface KYOccupationalRegistryFile {
  jurisdictions: {
    scraped: Record<
      string,
      {
        name: string;
        wageRateDecimal?: number | null;
        wageRateResidentDecimal?: number | null;
        wageRateNonresidentDecimal?: number | null;
        capAtSSWageBase?: boolean;
      }
    >;
    louisvilleMetro: { residentRate: number; nonresidentRate: number };
    lexingtonFayette: { rate: number };
  };
}

/** Whether a Kentucky occupational tax registry exists for this check date. */
export function hasKYOccupationalRuleset(checkDate: string): boolean {
  return dataFileExists(join('local', `KY-occupational-${yearOf(checkDate)}.json`));
}

/**
 * Every Kentucky city/county/consolidated-government jurisdiction that has
 * a CONFIRMED wage-withholding rate — as of 2026-08-31, 250 entries (248
 * from the scraped 250 + Louisville Metro + Lexington-Fayette), the
 * overwhelming majority cross-checked against the Kentucky League of
 * Cities' own official statewide FY2023 occupational tax survey (a
 * dedicated Payroll Tax Rate column — see that file's own knownGaps for
 * the corrections it caught). Only 2 scraped entries are deliberately
 * EXCLUDED, and both are understood rather than unresolved — see
 * data/local/KY-occupational-<year>.json's own jurisdictions.coverage
 * field for which two and why. This count has moved several times before
 * settling here — verify against that file and allKYJurisdictions()'s own
 * runtime output before citing it again regardless.
 */
export function allKYJurisdictions(checkDate: string): KYJurisdictionEntry[] {
  const file = loadJson<KYOccupationalRegistryFile>(
    join('local', `KY-occupational-${yearOf(checkDate)}.json`),
  );
  const entries: KYJurisdictionEntry[] = [];

  for (const raw of Object.values(file.jurisdictions.scraped)) {
    const hasFlat = raw.wageRateDecimal !== null && raw.wageRateDecimal !== undefined;
    const hasSplit =
      raw.wageRateResidentDecimal !== null &&
      raw.wageRateResidentDecimal !== undefined &&
      raw.wageRateNonresidentDecimal !== null &&
      raw.wageRateNonresidentDecimal !== undefined;
    if (!hasFlat && !hasSplit) continue;
    entries.push({
      name: raw.name,
      wageRateDecimal: hasFlat ? (raw.wageRateDecimal as number) : null,
      wageRateResidentDecimal: hasSplit ? (raw.wageRateResidentDecimal as number) : null,
      wageRateNonresidentDecimal: hasSplit ? (raw.wageRateNonresidentDecimal as number) : null,
      capAtSSWageBase: raw.capAtSSWageBase ?? false,
    });
  }

  entries.push({
    name: 'Louisville',
    wageRateDecimal: null,
    wageRateResidentDecimal: file.jurisdictions.louisvilleMetro.residentRate,
    wageRateNonresidentDecimal: file.jurisdictions.louisvilleMetro.nonresidentRate,
    capAtSSWageBase: false,
  });
  entries.push({
    name: 'Lexington',
    wageRateDecimal: file.jurisdictions.lexingtonFayette.rate,
    wageRateResidentDecimal: null,
    wageRateNonresidentDecimal: null,
    capAtSSWageBase: false,
  });

  return entries;
}

/** Look up one Kentucky jurisdiction by name (case-insensitive) among the confirmed-rate set — see allKYJurisdictions()'s own doc comment for what "confirmed" means here. */
export function kyJurisdictionRuleset(
  name: string,
  checkDate: string,
): KYJurisdictionEntry | undefined {
  return allKYJurisdictions(checkDate).find((e) => e.name.toLowerCase() === name.toLowerCase());
}

export interface ALMunicipalityEntry {
  name: string;
  rate: number;
  /**
   * Other spellings that resolve to this same municipality. Exists because
   * the source list is a survey and a survey can misspell its own members:
   * ALM prints "Hacklebug" for what is certainly Hackleburg, the Marion
   * County town sitting among the other Marion County entries on the same
   * list. The entry keeps the source's spelling as its canonical name — this
   * project quotes ALM rather than silently correcting it — and carries the
   * real one here, so a caller who spells the town the way the world spells
   * it still gets the 1% instead of a silent no-tax result.
   */
  aliases?: string[];
}

interface ALMunicipalityRegistryFile {
  year: number;
  municipalities: ALMunicipalityEntry[];
}

/** Whether an Alabama municipal occupational tax registry exists for this check date. */
export function hasALMunicipalityRuleset(checkDate: string): boolean {
  return dataFileExists(join('local', `AL-municipalities-${yearOf(checkDate)}.json`));
}

/**
 * Look up one Alabama municipality's occupational tax rate by name
 * (case-insensitive) — same closed-list convention as every other local
 * lookup in this file. Unlike Ohio, Alabama's occupational tax is
 * WORK-location-only (no confirmed residence-based component was found),
 * so there is only ever one role to resolve, not a resident/nonresident
 * or home/work pair.
 */
export function alMunicipalityRuleset(
  name: string,
  checkDate: string,
): ALMunicipalityEntry | undefined {
  const file = loadJson<ALMunicipalityRegistryFile>(
    join('local', `AL-municipalities-${yearOf(checkDate)}.json`),
  );
  const wanted = name.trim().toLowerCase();
  return file.municipalities.find(
    (m) =>
      m.name.toLowerCase() === wanted ||
      (m.aliases ?? []).some((alias) => alias.toLowerCase() === wanted),
  );
}

/** Every Alabama taxing municipality — for geocode/'s fuzzy name matching. */
export function allALMunicipalities(checkDate: string): ALMunicipalityEntry[] {
  const file = loadJson<ALMunicipalityRegistryFile>(
    join('local', `AL-municipalities-${yearOf(checkDate)}.json`),
  );
  return file.municipalities;
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
  return dataFileExists(join('local', `OH-municipalities-${yearOf(checkDate)}.json`));
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
  return dataFileExists(join('local', `OH-school-districts-${yearOf(checkDate)}.json`));
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

export interface OHJEDDEntry {
  name: string;
  jeddId: string;
  rate: number;
  effectiveFrom: string;
}

interface OHJEDDRegistryFile {
  year: number;
  zones: OHJEDDEntry[];
}

/** Whether an Ohio JEDD/JEDZ rate registry exists for this check date. */
export function hasOHJEDDRuleset(checkDate: string): boolean {
  return dataFileExists(join('local', `OH-jedd-jedz-${yearOf(checkDate)}.json`));
}

/**
 * Look up one Ohio JEDD/JEDZ's rate by Ohio's own jeddId — never by name.
 * The id is what makes this safe to automate: geocode/districts.ts reads
 * the containing zone's `jedd_id` straight off Ohio's published boundary
 * layer, and the two datasets are keyed the same way, so no string
 * matching sits between the boundary and the rate. Same closed-list,
 * undefined-for-an-unknown-id convention as every other local lookup here.
 */
export function ohJEDDRuleset(jeddId: string, checkDate: string): OHJEDDEntry | undefined {
  const file = loadJson<OHJEDDRegistryFile>(join('local', `OH-jedd-jedz-${yearOf(checkDate)}.json`));
  return file.zones.find((z) => z.jeddId === jeddId);
}

/** Every Ohio JEDD/JEDZ on file. */
export function allOHJEDDs(checkDate: string): OHJEDDEntry[] {
  return loadJson<OHJEDDRegistryFile>(join('local', `OH-jedd-jedz-${yearOf(checkDate)}.json`)).zones;
}

/** Every Ohio school district that levies SDIT — for geocode/'s fuzzy name matching. */
export function allOHSchoolDistricts(checkDate: string): OHSchoolDistrictEntry[] {
  const file = loadJson<OHSchoolDistrictRegistryFile>(
    join('local', `OH-school-districts-${yearOf(checkDate)}.json`),
  );
  return file.districts;
}

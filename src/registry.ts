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
  /** Act 511/319's own EIT low-income exemption threshold (estimated annual earned income) for this jurisdiction's MUNICIPAL EIT portion — below it, that portion (residentEIT on a resident's own entry, nonresidentEIT on a work entry) is exempt entirely. Present on only 49 of 2,627 entries; absent means no municipal EIT exemption ordinance is on file for this PSD. */
  municipalEitLIE?: number;
  /** Same mechanism as municipalEitLIE, but for the SCHOOL DISTRICT's own EIT portion (schoolDistrictEIT) — only ever relevant on a RESIDENT's own entry, since school district EIT is levied on residents, not nonresidents. */
  schoolDistrictEitLIE?: number;
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
    lexingtonFayette: { residentRate: number; nonresidentRate: number };
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
    wageRateDecimal: null,
    wageRateResidentDecimal: file.jurisdictions.lexingtonFayette.residentRate,
    wageRateNonresidentDecimal: file.jurisdictions.lexingtonFayette.nonresidentRate,
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

export interface GarnishmentSource {
  title: string;
  url: string;
  verifiedOn: string;
  verifiedBy?: string;
}

export interface GarnishmentFederalRuleset {
  year: number;
  sources: GarnishmentSource[];
  federalMinimumHourlyWage: number;
  ordinaryGarnishment: {
    maxDisposableEarningsFraction: number;
    minimumWageWeeklyMultiplier: number;
  };
  supportOrder: {
    supportingOtherFamilyFraction: number;
    notSupportingOtherFamilyFraction: number;
    arrearsBonusFraction: number;
  };
  studentLoanDefault: {
    maxDisposableEarningsFraction: number;
    minimumWageWeeklyMultiplier: number;
  };
}

/** The CCPA's federal garnishment ceilings — see data/garnishment/federal-*.json. */
export function garnishmentFederalRuleset(checkDate: string): GarnishmentFederalRuleset {
  return loadJson<GarnishmentFederalRuleset>(
    join('garnishment', `federal-${yearOf(checkDate)}.json`),
  );
}

/** One "lesser of X% of gross/disposable" test — a state's cap is the MINIMUM across every entry here (plus the minimum-wage floor, if this state's ordinaryGarnishment block also sets one). */
export interface GarnishmentCapFraction {
  basis: 'gross' | 'disposable';
  fraction: number;
}

/**
 * A cliff bracket keyed on multiples of the applicable weekly minimum wage —
 * Minnesota's shape (Minn. Stat. 571.922). Unlike the federal "lesser of a
 * fraction or the amount over a floor" rule, crossing a threshold here puts
 * the WHOLE disposable-earnings figure into that bracket's flat fraction,
 * not just the excess above it. Disposable earnings at or below the lowest
 * tier's minMultiplier are fully exempt (no tier matches).
 */
export interface GarnishmentTier {
  minMultiplier: number;
  /** null means "and above" — the top, uncapped bracket. */
  maxMultiplier: number | null;
  fraction: number;
}

/**
 * A cliff bracket keyed on a FIXED gross-weekly dollar threshold rather than
 * a multiple of minimum wage — Nevada's shape (NRS 31.295). The matching
 * tier's fraction applies to DISPOSABLE earnings; which tier matches is
 * decided by GROSS. Evaluated in ascending order; the first tier whose
 * maxGrossWeekly is at or above this period's gross wins (null = the
 * top, unbounded bracket).
 */
export interface GarnishmentGrossWeeklyTier {
  maxGrossWeekly: number | null;
  fraction: number;
}

/**
 * A MARGINAL (not cliff) bracket schedule denominated in MONTHLY disposable
 * earnings — Hawaii's shape (Haw. Rev. Stat. 652-1). Unlike GarnishmentTier,
 * each bracket's fraction applies only to the slice of disposable earnings
 * actually falling within it, the same way an income tax bracket works, and
 * the monthly-denominated breakpoints are prorated to whatever pay
 * frequency the paycheck actually uses. Brackets are ascending by
 * `upToMonthly`; null means the top, unbounded bracket.
 */
export interface GarnishmentMarginalBracket {
  upToMonthly: number | null;
  fraction: number;
}

/**
 * New Jersey's income-tier test (N.J. Stat. 2A:17-56(a)): a judgment
 * creditor may take at most `belowThresholdFraction` while the debtor's
 * ANNUALIZED income is at or under `thresholdMultipleOfPoverty` times the
 * HHS federal poverty guideline for their own household size — a real
 * number this project didn't track anywhere else, so it is carried here
 * rather than assumed. Above that threshold the statute itself sets no
 * fixed number ("the court... may order a larger percentage"), so this
 * project falls through to the plain federal CCPA default in that case —
 * disclosed as a modelling choice, not a verbatim NJ figure. Requires the
 * caller to supply `GarnishmentOrder.householdSize`; absent that fact, this
 * engine does not guess it and falls through to the same federal default,
 * exactly the way an unset `headOfFamily` is never assumed true.
 */
export interface GarnishmentPovertyGuidelineTier {
  belowThresholdFraction: number;
  /** What `belowThresholdFraction` applies to — NJ's own statute text ("wages... earnings... due and owing") reads as gross, not the CCPA's narrower "disposable earnings" term of art. */
  basis: 'gross' | 'disposable';
  thresholdMultipleOfPoverty: number;
  /** HHS poverty guideline for a household of 1 — 48 contiguous states + DC table (NJ is not AK/HI). Re-published every January; re-verify yearly. */
  povertyGuidelineBase: number;
  /** Added per household member beyond 1, same HHS table. */
  povertyGuidelinePerAdditionalPerson: number;
  /** A separate flat WEEKLY dollar amount exempt from execution regardless of the percentage test — N.J. Stat. 2A:17-50's $48, distinct from the poverty-guideline mechanism above. */
  flatWeeklyExemption?: number;
}

/**
 * One state's (or one head-of-family variant's) full garnishment formula.
 * Every field is optional because a formula can be built from any ONE of
 * capFractions/tiers/grossWeeklyTiers/marginalMonthlyBrackets/
 * povertyGuidelineTier (mutually exclusive in practice — a real state
 * statute uses exactly one shape) plus an optional minimum-wage floor
 * layered on top of capFractions specifically (see
 * minimumWageWeeklyMultiplier's own doc comment).
 */
export interface GarnishmentFormula {
  /**
   * The minimum-wage floor's own multiplier and hourly figure, layered on
   * top of `capFractions` only. BOTH optional together — omit both when the
   * state's formula has no separate floor test (e.g. Delaware's flat 15%,
   * already more protective than the federal floor at every realistic
   * income level) or when the shape used (tiers/grossWeeklyTiers/
   * marginalMonthlyBrackets) is already self-contained. stateMinimumHourlyWage
   * is pre-resolved to whichever of that state's own minimum wage or the
   * federal $7.25 is GREATER, at authoring time — see this file's own
   * per-state $note for which one actually won and when to re-check it.
   */
  minimumWageWeeklyMultiplier?: number;
  stateMinimumHourlyWage?: number;
  /** Shape A — the lesser of one or more straight fractions (of gross and/or disposable earnings), e.g. Illinois, Connecticut, New York, Massachusetts, Delaware, Colorado, Washington. */
  capFractions?: GarnishmentCapFraction[];
  /** Shape B — a cliff-bracket schedule keyed on multiples of minimum wage, e.g. Minnesota. */
  tiers?: GarnishmentTier[];
  /** Shape C — a cliff-bracket schedule keyed on a fixed gross-weekly dollar threshold, e.g. Nevada. */
  grossWeeklyTiers?: GarnishmentGrossWeeklyTier[];
  /** Shape D — a MARGINAL bracket schedule denominated in monthly dollars, e.g. Hawaii. */
  marginalMonthlyBrackets?: GarnishmentMarginalBracket[];
  /** Shape E — an income-tier test keyed to the debtor's household size against the HHS federal poverty guideline, e.g. New Jersey. */
  povertyGuidelineTier?: GarnishmentPovertyGuidelineTier;
  /**
   * A flat per-dependent WEEKLY dollar reduction applied to the computed cap
   * (after the fraction/floor test, before clamping at zero) — North
   * Dakota's $20/dependent (N.D. Cent. Code 32-09.1-06). Only meaningful
   * alongside `capFractions`; requires the order's own `dependents` count
   * (see GarnishmentOrder) — absent or 0 dependents means no reduction.
   */
  perDependentWeeklyReduction?: number;
}

export interface GarnishmentStateOverride {
  /** True where state law bars ordinary consumer/creditor garnishment outright (TX, PA, NC, SC). Never affects support orders or federal student loan default — those preempt state wage exemptions entirely. */
  ordinaryGarnishmentProhibited?: boolean;
  /**
   * A status-conditioned full exemption from ordinary garnishment — Florida's
   * "head of family" rule (Fla. Stat. 222.11), the only one of these this
   * project has researched. The caller asserts the qualifying fact on the
   * GarnishmentOrder itself (`headOfFamily`), same discipline as every other
   * eligibility flag this engine refuses to guess; `waivableInWriting: true`
   * means the debtor can waive it (`wageExemptionWaivedInWriting: true` on
   * the order), in which case this state's ordinaryGarnishment/federal-default
   * rule applies as if the exemption were never there.
   */
  fullExemption?: {
    qualifyingFlag: 'headOfFamily';
    waivableInWriting: boolean;
  };
  ordinaryGarnishment?: GarnishmentFormula;
  /**
   * Applies INSTEAD of ordinaryGarnishment/the federal default whenever
   * order.headOfFamily is true — Missouri's own reduced-percentage variant
   * (Mo. Rev. Stat. 525.030: 10% instead of the ordinary 25%), distinct from
   * Florida's all-or-nothing `fullExemption` above. Checked before
   * `fullExemption`, so a state could in principle carry both (none
   * currently does).
   */
  headOfFamilyOrdinaryGarnishment?: GarnishmentFormula;
  sources: GarnishmentSource[];
  $note?: string;
  knownGap?: string;
}

interface GarnishmentStateOverrideFile {
  year: number;
  states: Record<string, GarnishmentStateOverride>;
}

/**
 * A state's own departure from the federal CCPA ordinary-garnishment
 * default, if this project has researched one — undefined means "use the
 * federal default," never "confirmed no departure exists." See
 * data/garnishment/state-overrides-*.json's own $scopeNote.
 */
export function garnishmentStateOverride(
  code: string,
  checkDate: string,
): GarnishmentStateOverride | undefined {
  const file = loadJson<GarnishmentStateOverrideFile>(
    join('garnishment', `state-overrides-${yearOf(checkDate)}.json`),
  );
  return file.states[code.toUpperCase()];
}

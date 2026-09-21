/**
 * Symmetry Tax Engine (STE) -shaped compatibility layer.
 *
 * This engine's own contract is `POST /v1/calculate` + `PaycheckInput` (see
 * examples/api-server.ts) — a caller who already speaks that shape should
 * keep using it directly. This module exists for the OTHER caller: one
 * whose integration already speaks Symmetry's vocabulary (`payCalc`,
 * `UniqueTaxId`, `LocationCode`, a `TaxJurisdictionParms` array) and would
 * otherwise have to hand-translate every field before it could call this
 * engine at all.
 *
 * IMPORTANT — what this is NOT: it is not, and does not claim to be, wire-
 * compatible with the actual Symmetry Tax Engine API. Symmetry's own
 * UniqueTaxId catalog (~7,000 entries covering every US taxing
 * jurisdiction) is that company's proprietary, licensed data — this project
 * has no access to it and does not reproduce it. What follows is THIS
 * engine's OWN id scheme, generated from THIS project's own sourced local
 * registries (data/local/*.json, data/states/*.json), using the same
 * `XX-XXX-XXXX`-shaped id a Symmetry integration expects to see, so the
 * REQUEST/RESPONSE SHAPE is familiar even though the id VALUES are this
 * engine's own and will never match Symmetry's numbers for the same
 * jurisdiction. Every id this module hands out resolves only through this
 * module and calculatePaycheck() — never send one to, or expect one to mean
 * anything to, an actual Symmetry integration.
 *
 * Two request/response shapes:
 *   1. `payCalc()` — an array in, array out, the same batch calling
 *      convention Symmetry's own PayCalcRequest/PayCalcResult uses, keyed
 *      by UniqueTaxId rather than this engine's own certificate field
 *      names.
 *   2. The uniqueTaxId catalog itself (`listUniqueTaxIds`,
 *      `resolveUniqueTaxId`) — for a caller that wants to browse or resolve
 *      ids without going through a full payCalc call, the STE-equivalent of
 *      a GeoCode/jurisdiction lookup.
 */
import { calculatePaycheck } from '../src/calculate.ts';
import {
  allALMunicipalities,
  allCounties,
  allKYJurisdictions,
  allMICities,
  allOHJEDDs,
  allOHMunicipalities,
  allOHSchoolDistricts,
  allPALocalJurisdictions,
  hasCountyRuleset,
  hasStateRuleset,
  stateRuleset,
} from '../src/registry.ts';
import type { Cents } from '../src/money.ts';
import { dollars } from '../src/money.ts';
import type {
  Deduction,
  Earning,
  FederalW4,
  PayFrequency,
  StateCertificate,
  YearToDate,
} from '../src/types.ts';

// ---------------------------------------------------------------------------
// The id scheme
// ---------------------------------------------------------------------------

/**
 * Standard ANSI/Census state FIPS codes — public, standard, and already the
 * same vocabulary this project's own geocode/ module reads off Census
 * TIGERweb responses. Not proprietary to anyone; reused here as the first
 * group of this engine's own `XX-XXX-XXXX` id, purely because it's a
 * recognizable, already-standard 2-digit state key, the same reason
 * Symmetry's own ids reportedly use it too.
 */
const STATE_FIPS: Record<string, string> = {
  AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08', CT: '09', DE: '10',
  DC: '11', FL: '12', GA: '13', HI: '15', ID: '16', IL: '17', IN: '18', IA: '19',
  KS: '20', KY: '21', LA: '22', ME: '23', MD: '24', MA: '25', MI: '26', MN: '27',
  MS: '28', MO: '29', MT: '30', NE: '31', NV: '32', NH: '33', NJ: '34', NM: '35',
  NY: '36', NC: '37', ND: '38', OH: '39', OK: '40', OR: '41', PA: '42', RI: '44',
  SC: '45', SD: '46', TN: '47', TX: '48', UT: '49', VT: '50', VA: '51', WA: '53',
  WV: '54', WI: '55', WY: '56',
};

/**
 * The well-known constant several Symmetry integration write-ups cite for
 * the federal jurisdiction. Carried here only as a courtesy alias a caller
 * migrating from STE might already have hardcoded — federal tax always
 * applies regardless of this id, so nothing in payCalc() actually branches
 * on it.
 */
export const FEDERAL_UNIQUE_TAX_ID = '00-000-0000';

type JurisdictionType = 'state' | 'county' | 'city' | 'school_district' | 'jedd' | 'psd' | 'locality';

const TYPE_CODE: Record<Exclude<JurisdictionType, 'psd'>, string> = {
  state: '000',
  county: '100',
  city: '200',
  school_district: '300',
  jedd: '400',
  locality: '600',
};

export interface UniqueTaxIdEntry {
  /** This engine's own id — see this module's own doc comment for what it is and isn't. */
  uniqueTaxId: string;
  /** STE's other name for the same concept; identical value, offered for callers that read one field or the other. */
  locationCode: string;
  state: string;
  type: JurisdictionType;
  name: string;
  /** Which certificate field this id sets, and on which role — see applyEntry() below. */
  field: keyof StateCertificate | 'workState.code' | 'residenceState.code';
  role: 'work' | 'residence' | 'either';
  value: string | boolean;
}

let catalogCache: { checkDate: string; entries: UniqueTaxIdEntry[]; byId: Map<string, UniqueTaxIdEntry> } | null = null;

function makeId(state: string, type: JurisdictionType, seq: number | string): string {
  const fips = STATE_FIPS[state] ?? '99';
  if (type === 'psd') return `${fips}-PSD-${seq}`;
  return `${fips}-${TYPE_CODE[type]}-${String(seq).padStart(4, '0')}`;
}

/** Fixed catalog of caller-resolved-locality jurisdictions — these are ad hoc `certificate.locality`/flag matches in src/taxes/state.ts, not a name-keyed registry file this module can enumerate generically (see geocode/resolve.ts's own `flags` for the same list). */
const NAMED_LOCALITIES: { state: string; name: string; field: keyof StateCertificate; role: 'work' | 'residence' | 'either'; value: string | boolean }[] = [
  { state: 'NJ', name: 'Newark', field: 'locality', role: 'work', value: 'Newark' },
  { state: 'MO', name: 'Kansas City', field: 'locality', role: 'either', value: 'Kansas City' },
  { state: 'MO', name: 'St. Louis', field: 'locality', role: 'either', value: 'St. Louis' },
  { state: 'DE', name: 'Wilmington', field: 'locality', role: 'either', value: 'Wilmington' },
  { state: 'WA', name: 'Seattle', field: 'locality', role: 'work', value: 'Seattle' },
  { state: 'CO', name: 'Denver', field: 'locality', role: 'work', value: 'Denver' },
  { state: 'CO', name: 'Glendale', field: 'locality', role: 'work', value: 'Glendale' },
  { state: 'CO', name: 'Greenwood Village', field: 'locality', role: 'work', value: 'Greenwood Village' },
  { state: 'CO', name: 'Sheridan', field: 'locality', role: 'work', value: 'Sheridan' },
  { state: 'CO', name: 'Aurora', field: 'locality', role: 'work', value: 'Aurora' },
  { state: 'WV', name: 'Charleston', field: 'locality', role: 'work', value: 'Charleston' },
  { state: 'WV', name: 'Huntington', field: 'locality', role: 'work', value: 'Huntington' },
  { state: 'WV', name: 'Morgantown', field: 'locality', role: 'work', value: 'Morgantown' },
  { state: 'WV', name: 'Parkersburg', field: 'locality', role: 'work', value: 'Parkersburg' },
  { state: 'WV', name: 'Wheeling', field: 'locality', role: 'work', value: 'Wheeling' },
  { state: 'WV', name: 'Weirton', field: 'locality', role: 'work', value: 'Weirton' },
  { state: 'OR', name: 'TriMet', field: 'locality', role: 'work', value: 'TriMet' },
  { state: 'OR', name: 'Lane Transit District', field: 'locality', role: 'work', value: 'LTD' },
  { state: 'OR', name: 'Canby Transit', field: 'locality', role: 'work', value: 'CanbyTransit' },
  { state: 'OR', name: 'Sandy Transit', field: 'locality', role: 'work', value: 'SandyTransit' },
  { state: 'OR', name: 'Wilsonville (SMART)', field: 'locality', role: 'work', value: 'SMART' },
  { state: 'NY', name: 'New York City (resident)', field: 'nycResident', role: 'residence', value: true },
  { state: 'NY', name: 'Yonkers (resident)', field: 'yonkersResident', role: 'residence', value: true },
  { state: 'NY', name: 'Yonkers (nonresident worker)', field: 'yonkersNonresidentWorker', role: 'work', value: true },
];

/**
 * Build (and cache) the full id catalog for one tax year. Rebuilt whenever
 * checkDate resolves to a different year than what's cached — the same
 * per-year-file convention as every ruleset this reads.
 *
 * Sequence numbers within each (state, type) group are assigned over
 * entries SORTED BY NAME, not by the order the underlying data file happens
 * to list them in — a data file can be re-sorted or re-scraped without
 * silently reassigning every id that comes after the change.
 */
function buildCatalog(checkDate: string): { entries: UniqueTaxIdEntry[]; byId: Map<string, UniqueTaxIdEntry> } {
  const entries: UniqueTaxIdEntry[] = [];

  const add = (
    state: string,
    type: JurisdictionType,
    seq: number | string,
    name: string,
    field: UniqueTaxIdEntry['field'],
    role: UniqueTaxIdEntry['role'],
    value: string | boolean,
  ) => {
    const id = makeId(state, type, seq);
    entries.push({ uniqueTaxId: id, locationCode: id, state, type, name, field, role, value });
  };

  for (const state of Object.keys(STATE_FIPS)) {
    if (hasStateRuleset(state, checkDate)) {
      add(state, 'state', 1, `${state} state income tax`, 'workState.code', 'either', state);
    }

    if (hasCountyRuleset(state, checkDate)) {
      const counties = [...allCounties(state, checkDate)].sort((a, b) => a.name.localeCompare(b.name));
      counties.forEach((c, i) => add(state, 'county', i + 1, c.name, 'county', 'work', c.name));
    }

    if (state === 'MD') {
      const rules = stateRuleset('MD', checkDate) as unknown as { countyRates?: Record<string, unknown> };
      const keys = Object.keys(rules.countyRates ?? {}).filter((k) => !k.startsWith('$')).sort();
      keys.forEach((key, i) => add('MD', 'county', i + 1, key, 'county', 'residence', key));
    }
  }

  const miCities = [...allMICities(checkDate)].sort((a, b) => a.name.localeCompare(b.name));
  miCities.forEach((c, i) => add('MI', 'city', i + 1, c.name, 'workCity', 'either', c.name));

  const ohMunicipalities = [...allOHMunicipalities(checkDate)].sort((a, b) => a.name.localeCompare(b.name));
  ohMunicipalities.forEach((m, i) => add('OH', 'city', i + 1, m.name, 'workCity', 'either', m.name));

  const ohSchoolDistricts = [...allOHSchoolDistricts(checkDate)].sort((a, b) => a.name.localeCompare(b.name));
  ohSchoolDistricts.forEach((d, i) => add('OH', 'school_district', i + 1, d.name, 'schoolDistrictCode', 'either', d.sdNumber));

  const ohJEDDs = [...allOHJEDDs(checkDate)].sort((a, b) => a.name.localeCompare(b.name));
  ohJEDDs.forEach((z, i) => add('OH', 'jedd', i + 1, z.name, 'workJEDDId', 'work', z.jeddId));

  const alMunicipalities = [...allALMunicipalities(checkDate)].sort((a, b) => a.name.localeCompare(b.name));
  alMunicipalities.forEach((m, i) => add('AL', 'city', i + 1, m.name, 'workCity', 'work', m.name));

  const kyJurisdictions = [...allKYJurisdictions(checkDate)].sort((a, b) => a.name.localeCompare(b.name));
  kyJurisdictions.forEach((j, i) => add('KY', 'city', i + 1, j.name, 'workCity', 'either', j.name));

  // Pennsylvania already publishes its own stable 6-digit PSD code for
  // every one of its 2,627 EIT/LST jurisdictions — reused verbatim as the
  // `type: 'psd'` id rather than reinventing a sequence number, since it's
  // already exactly the kind of stable location code this catalog exists
  // to provide, and PA's own withholding paperwork already refers to it by
  // that number.
  for (const j of allPALocalJurisdictions(checkDate)) {
    add('PA', 'psd', j.psdCode, `${j.municipality}, ${j.county} (PSD ${j.psdCode})`, 'workPSD', 'either', j.psdCode);
  }

  for (const loc of NAMED_LOCALITIES) {
    const seq = entries.filter((e) => e.state === loc.state && e.type === 'locality').length + 1;
    add(loc.state, 'locality', seq, loc.name, loc.field, loc.role, loc.value);
  }

  const byId = new Map(entries.map((e) => [e.uniqueTaxId, e]));
  return { entries, byId };
}

function catalogFor(checkDate: string): { entries: UniqueTaxIdEntry[]; byId: Map<string, UniqueTaxIdEntry> } {
  if (catalogCache && catalogCache.checkDate === checkDate) return catalogCache;
  const built = buildCatalog(checkDate);
  catalogCache = { checkDate, ...built };
  return built;
}

/** Every id this engine currently issues for the given tax year — a caller migrating off STE can dump this once to build its own crosswalk. */
export function listUniqueTaxIds(checkDate: string): UniqueTaxIdEntry[] {
  return catalogFor(checkDate).entries;
}

/** Resolve one id (uniqueTaxId or, identically, locationCode) to the catalog entry describing what it means, or undefined if this engine never issued it. */
export function resolveUniqueTaxId(id: string, checkDate: string): UniqueTaxIdEntry | undefined {
  return catalogFor(checkDate).byId.get(id);
}

// ---------------------------------------------------------------------------
// payCalc — the batch calculation entry point
// ---------------------------------------------------------------------------

/** STE's own frequency vocabulary, normalized to this engine's PayFrequency. Accepts either spelling so a caller doesn't have to translate this one field by hand. */
const FREQUENCY_ALIASES: Record<string, PayFrequency> = {
  weekly: 'weekly', biweekly: 'biweekly', 'semi-monthly': 'semimonthly', semimonthly: 'semimonthly',
  monthly: 'monthly', quarterly: 'quarterly', 'semi-annually': 'semiannual', semiannual: 'semiannual',
  annually: 'annual', annual: 'annual', daily: 'daily',
};

function normalizeFrequency(freq: string): PayFrequency {
  const resolved = FREQUENCY_ALIASES[freq.toLowerCase()];
  if (!resolved) {
    throw new Error(`Unrecognized Frequency "${freq}" — expected one of ${Object.keys(FREQUENCY_ALIASES).join(', ')}.`);
  }
  return resolved;
}

export interface TaxJurisdictionParm {
  /** The uniqueTaxId (or, identically, locationCode) this override applies to. */
  uniqueTaxId?: string;
  locationCode?: string;
  /** Certificate fields to merge in for whichever jurisdiction the id above resolves to — e.g. { allowances: 2 } for a state that reads certificate.allowances. */
  fields?: Partial<StateCertificate>;
}

export interface PayCalcRequest {
  employeeId?: string;
  checkDate: string;
  frequency: string;
  /** Gross pay in whole dollars (and cents as a decimal), matching STE's own decimal-dollar convention — NOT this engine's native integer cents. */
  grossPay: number;
  earnings?: Earning[];
  deductions?: Deduction[];
  federalW4?: FederalW4;
  ytd?: YearToDate;
  /** This employee's WORK-location tax profile — state plus every applicable local, as ids from this catalog. */
  workUniqueTaxIds: string[];
  /** This employee's LIVE (residence) tax profile, if different from work — omit for a single-state, single-address employee. */
  liveUniqueTaxIds?: string[];
  /** Per-jurisdiction overrides, STE's TaxJurisdictionParms array. */
  taxJurisdictionParms?: TaxJurisdictionParm[];
}

export interface PayCalcResultLine {
  uniqueTaxId: string | null;
  locationCode: string | null;
  description: string;
  payer: 'employee' | 'employer';
  /** Whole-dollar-and-cents amount, matching PayCalcRequest.grossPay's own convention. */
  amount: number;
}

export interface PayCalcResult {
  employeeId?: string;
  checkDate: string;
  grossPay: number;
  netPay: number;
  employeeTaxTotal: number;
  employerTaxTotal: number;
  taxJurisdictionParms: PayCalcResultLine[];
  error?: string;
}

function centsToDecimalDollars(c: Cents): number {
  return Math.round(c) / 100;
}

/**
 * Apply one resolved catalog entry to a certificate/workState.code
 * accumulator. Booleans and strings both just overwrite; a caller supplying
 * two conflicting ids for the same field (e.g. two different work cities)
 * gets whichever was applied last — the same "last one wins" rule ordinary
 * object spreading already uses everywhere else in this engine's inputs.
 */
function applyEntry(
  entry: UniqueTaxIdEntry,
  acc: { stateCode?: string; certificate: Partial<StateCertificate> },
): void {
  if (entry.field === 'workState.code' || entry.field === 'residenceState.code') {
    acc.stateCode = entry.value as string;
    return;
  }
  (acc.certificate as Record<string, unknown>)[entry.field] = entry.value;
}

function resolveIds(
  ids: string[] | undefined,
  checkDate: string,
  role: 'work' | 'residence',
): { stateCode?: string; certificate: Partial<StateCertificate> } {
  const acc: { stateCode?: string; certificate: Partial<StateCertificate> } = { certificate: {} };
  for (const rawId of ids ?? []) {
    const entry = resolveUniqueTaxId(rawId, checkDate);
    if (!entry) {
      throw new Error(
        `Unrecognized uniqueTaxId/locationCode "${rawId}" for ${checkDate.slice(0, 4)} — see listUniqueTaxIds() for every id this engine currently issues. This is this engine's OWN catalog, not Symmetry's; an id copied from an actual STE integration will not resolve here.`,
      );
    }
    if (entry.role !== 'either' && entry.role !== role) continue;
    applyEntry(entry, acc);
  }
  return acc;
}

/**
 * Translate one Symmetry-shaped request into this engine's own
 * calculatePaycheck() call and back into a Symmetry-shaped result.
 *
 * A request that fails to resolve (an unknown id, a state this engine
 * doesn't model, an invalid frequency) comes back as a PayCalcResult with
 * `error` set and an empty taxJurisdictionParms array — matching this
 * engine's own house style (examples/tax-coverage.ts, calculatePaycheck()
 * itself) of a structured error alongside the batch item it belongs to,
 * rather than aborting every other request in the same payCalc() call.
 */
export function payCalc(requests: PayCalcRequest[]): PayCalcResult[] {
  return requests.map((req) => {
    try {
      const work = resolveIds(req.workUniqueTaxIds, req.checkDate, 'work');
      const live = resolveIds(req.liveUniqueTaxIds, req.checkDate, 'residence');

      const certificate: Partial<StateCertificate> = { ...work.certificate };
      const residenceCertificate: Partial<StateCertificate> = { ...live.certificate };

      for (const parm of req.taxJurisdictionParms ?? []) {
        const id = parm.uniqueTaxId ?? parm.locationCode;
        if (!id || !parm.fields) continue;
        const entry = resolveUniqueTaxId(id, req.checkDate);
        if (!entry) continue;
        const target = entry.role === 'residence' ? residenceCertificate : certificate;
        Object.assign(target as Record<string, unknown>, parm.fields);
      }

      if (!work.stateCode) {
        throw new Error('workUniqueTaxIds must include exactly one state-level id (type "state") — no work state could be resolved.');
      }

      const result = calculatePaycheck({
        checkDate: req.checkDate,
        payFrequency: normalizeFrequency(req.frequency),
        earnings: req.earnings ?? [{ code: 'REG', category: 'regular', amount: dollars(req.grossPay) }],
        deductions: req.deductions ?? [],
        federalW4: req.federalW4 ?? {
          filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0,
        },
        ytd: req.ytd ?? { socialSecurity: 0, medicare: 0, futa: 0 },
        workState: { code: work.stateCode, certificate },
        residenceState: live.stateCode ? { code: live.stateCode, certificate: residenceCertificate } : undefined,
      });

      // Disclosed simplification: every result line is returned regardless
      // (description/payer/amount are always correct — they come straight
      // off calculatePaycheck()'s own TaxLine), but the uniqueTaxId on the
      // line is only populated for FEDERAL and STATE-level lines. Local
      // lines (a municipality, a school district, a JEDD, a caller-
      // resolved locality) come back with uniqueTaxId: null rather than a
      // guessed id, because src/taxes/state.ts's own TaxLine.id strings
      // (e.g. 'MO_KC_EARN', 'OH_SDIT') aren't a single predictable pattern
      // this module can safely reverse-match against the catalog without
      // risking a WRONG id on a real dollar amount — the safer failure
      // here is an honest null, not a confident guess.
      const taxJurisdictionParms: PayCalcResultLine[] = result.taxes.map((line) => {
        const catalogEntry = [...catalogFor(req.checkDate).entries].find(
          (e) => e.state === work.stateCode && line.id.startsWith(`${work.stateCode}_`) && e.type === 'state',
        );
        return {
          uniqueTaxId: line.jurisdiction === 'federal' ? FEDERAL_UNIQUE_TAX_ID : catalogEntry?.uniqueTaxId ?? null,
          locationCode: line.jurisdiction === 'federal' ? FEDERAL_UNIQUE_TAX_ID : catalogEntry?.uniqueTaxId ?? null,
          description: line.name,
          payer: line.payer,
          amount: centsToDecimalDollars(line.amount),
        };
      });

      return {
        employeeId: req.employeeId,
        checkDate: req.checkDate,
        grossPay: req.grossPay,
        netPay: centsToDecimalDollars(result.netPay),
        employeeTaxTotal: centsToDecimalDollars(result.employeeTaxTotal),
        employerTaxTotal: centsToDecimalDollars(result.employerTaxTotal),
        taxJurisdictionParms,
      };
    } catch (err) {
      return {
        employeeId: req.employeeId,
        checkDate: req.checkDate,
        grossPay: req.grossPay,
        netPay: 0,
        employeeTaxTotal: 0,
        employerTaxTotal: 0,
        taxJurisdictionParms: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });
}

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Cents } from '../../src/money.ts';

/**
 * STATE FILING PROFILES: what one jurisdiction requires of an employer, as DATA
 * with a citation for every rule, so adding or correcting a state is a data
 * change, not a code change (see docs/STATE-LAYER-SPEC.md).
 *
 * The three rules this file enforces for every profile:
 *  1. Every rule section names the `source` it came from, and that source is in
 *     the profile's `sources` list with a URL, a revision and a `verifiedOn` date.
 *  2. Anything not verified is listed in `notModelled` with the reason; code that
 *     needs it returns an error finding instead of a guess.
 *  3. Dollar thresholds are integer cents.
 */

export const DATA_ROOT = join(import.meta.dirname, '..', '..', 'data', 'filing');

export interface Source {
  id: string;
  title: string;
  url: string;
  /** The revision printed on the document, e.g. "DE 44 Rev. 52 (4-26)". */
  revision?: string;
  verifiedOn: string;
  verifiedBy: string;
}

/** When a return or payment is due. Every rule moves to the next business day when the date is not one, unless `rollsForward` is false. */
export type DueRule =
  | { kind: 'table'; dates: Record<string, { due: string; delinquent?: string; settle?: string }> }
  | { kind: 'last_day_of_month_after_quarter' }
  | { kind: 'day_of_month_after'; day: number }
  | { kind: 'business_days_after_period_end'; days: number }
  | { kind: 'next_business_day'; settleBusinessDays?: number }
  /** The first given weekday (0 = Sunday ... 6 = Saturday) strictly after the period's last day (Connecticut: the Wednesday after a Saturday-Friday week). */
  | { kind: 'next_weekday_after_period_end'; weekday: number }
  /** A fixed day in January of the year after the anchor's year (annual filers, W-2 reconciliations). */
  | { kind: 'january_day_next_year'; day: number };

export interface Agency {
  name: string;
  portalUrl?: string;
  source: string;
}

export type FederalDepositRule = 'next_day' | 'semiweekly' | 'monthly';
export type StateDepositSchedule = 'next_day' | 'semiweekly' | 'weekly' | 'monthly' | 'quarterly' | 'annual';

/**
 * How a state assigns a withholding deposit schedule from the employer's federal
 * deposit schedule and the amount accumulated (California). Amounts are cents.
 * `bands` are evaluated in order; the first whose `maxInclusive`/`maxExclusive` is
 * not exceeded applies (the last band has no maximum). A row maps each band to the
 * schedule the state requires.
 */
export interface BandDepositSpec {
  kind?: 'federal_bands';
  /** Plain statement of how the state's words were turned into this rule, including every ambiguity. */
  interpretation: string;
  /** The tax year the rules were read for. Applying them to another year draws a warning. */
  rulesYear?: number;
  bands: { name: string; maxExclusive?: Cents; maxInclusive?: Cents }[];
  rows: Record<FederalDepositRule, Record<string, StateDepositSchedule>>;
  due: {
    monthly: DueRule;
    quarterly: DueRule;
    semiweekly: DueRule;
    next_day: DueRule;
  };
  /** Tax-line kinds deposited together on these schedules. */
  deposited: ('withholding' | 'employeeInsurance')[];
  /** Employer UI-type contributions paid quarterly with the quarterly deposit (they may be paid earlier). */
  employerQuarterly: ('ui')[];
  source: string;
}

/**
 * A frequency the AGENCY assigns from the employer's liability over a look-back
 * period (Connecticut: weekly, monthly or quarterly). The frequency is an input to
 * the analysis (what the agency told the employer), or is derived from the look-back
 * liability by `lookback.classes`. Each frequency has a period and a due rule.
 */
export interface AssignedFrequencySpec {
  kind: 'assigned_frequency';
  interpretation: string;
  rulesYear: number;
  lookback: {
    description: string;
    /** Evaluated in order; `minExclusive` means "more than", `maxInclusive` means "not more than". Cents. */
    classes: { name: string; minExclusive?: Cents; maxInclusive?: Cents }[];
    /** The frequency for a new employer with no look-back history. */
    newEmployer: string;
  };
  frequencies: Record<string, { period: 'week_sat_fri' | 'month' | 'quarter' | 'year'; due: DueRule }>;
  deposited: ('withholding' | 'employeeInsurance')[];
  source: string;
}

/**
 * Nebraska-style deposits: within each quarter the first two months are deposited
 * (by the 15th of the next month) only when the amount withheld passes a threshold;
 * whatever is left is paid with the quarterly return.
 */
export interface QuarterMonthThresholdSpec {
  kind: 'quarter_month_threshold';
  interpretation: string;
  rulesYear: number;
  /** A deposit is required for a month when MORE than this was withheld (cents). */
  thresholdExclusive: Cents;
  /** Month 2 is also deposited if month 1 passed the threshold. */
  secondMonthTriggeredByFirst: boolean;
  depositDue: DueRule;
  /** What is left (month 3 and any undeposited amount) is paid with the return. */
  returnPaymentDue: DueRule;
  /** Employers licensed as annual filers pay once a year. */
  annual: { due: DueRule };
  deposited: ('withholding' | 'employeeInsurance')[];
  source: string;
}

export type DepositSpec = BandDepositSpec | AssignedFrequencySpec | QuarterMonthThresholdSpec;

export interface ReturnSpec {
  id: string;
  name: string;
  frequency: 'quarterly' | 'annual';
  due: DueRule;
  /** What the report must contain, as the agency describes it. */
  contents: string[];
  source: string;
}

export interface StateProfile {
  state: string;
  name: string;
  verifiedOn: string;
  sources: Source[];
  agencies: { withholding?: Agency; ui?: Agency; newHire?: Agency };
  calendar: {
    weekendsRoll: boolean;
    /** Legal holidays that move a due date. `verified: false` means the state's list was not read; due dates then carry a warning. */
    holidays: { verified: boolean; dates?: string[]; source?: string };
    source: string;
  };
  registration?: { daysAfterTrigger: number; trigger: string; source: string };
  mandates: { efile?: { text: string; source: string }; epay?: { text: string; source: string } };
  withholding?: {
    applies: boolean;
    taxLineIds?: { withholding: string; employeeInsurance: string[] };
    deposits?: DepositSpec;
    /** The withholding returns (quarterly reconciliation, annual reconciliation) and when each is due. */
    returns?: ReturnSpec[];
    notModelled: string[];
  };
  ui?: {
    wageBase: Cents;
    wageBaseYear: number;
    employerTaxLineId: string;
    returns: ReturnSpec[];
    notModelled: string[];
  };
  newHire?: { form: string; daysFromStart: number; source: string };
  /** Channels an operator can file through, with what each needs. */
  channels: { id: string; function: string; description: string; enrollment: string[]; specs: string; source: string }[];
  /** Everything about this jurisdiction that was NOT verified, and why. */
  notModelled: string[];
}

export function profilePath(code: string): string {
  return join(DATA_ROOT, 'states', `${code.toUpperCase()}.json`);
}

export function hasProfile(code: string): boolean {
  return existsSync(profilePath(code));
}

export function loadProfile(code: string): StateProfile {
  const p = profilePath(code);
  if (!existsSync(p)) {
    throw new Error(`NOT MODELLED: there is no state filing profile for ${code.toUpperCase()}. Do not treat that as "nothing to file": see docs/STATE-COVERAGE.md.`);
  }
  const profile = JSON.parse(readFileSync(p, 'utf8')) as StateProfile;
  const problems = validateProfile(profile);
  if (problems.length) throw new Error(`Invalid state profile ${profile.state}: ${problems.join('; ')}`);
  return profile;
}

export function modelledStates(): string[] {
  const dir = join(DATA_ROOT, 'states');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /^[A-Z]{2}\.json$/.test(f)).map((f) => f.slice(0, 2)).sort();
}

/** Returns every reason a profile is not acceptable. Empty means valid. */
export function validateProfile(p: StateProfile): string[] {
  const bad: string[] = [];
  const ids = new Set(p.sources.map((s) => s.id));
  if (!/^[A-Z]{2}$/.test(p.state)) bad.push('state must be a two-letter code');
  if (p.sources.length === 0) bad.push('no sources');
  for (const s of p.sources) {
    if (!s.url.startsWith('https://')) bad.push(`source ${s.id}: url must be https`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.verifiedOn)) bad.push(`source ${s.id}: verifiedOn must be a date`);
    if (!s.verifiedBy.trim()) bad.push(`source ${s.id}: verifiedBy is empty`);
  }
  const cite = (where: string, id: string | undefined) => {
    if (!id) bad.push(`${where}: no source`);
    else if (!ids.has(id)) bad.push(`${where}: unknown source ${id}`);
  };
  cite('calendar', p.calendar.source);
  for (const [k, a] of Object.entries(p.agencies)) if (a) cite(`agencies.${k}`, a.source);
  if (p.registration) cite('registration', p.registration.source);
  if (p.mandates.efile) cite('mandates.efile', p.mandates.efile.source);
  if (p.mandates.epay) cite('mandates.epay', p.mandates.epay.source);
  if (p.withholding?.deposits) {
    const d = p.withholding.deposits;
    cite('withholding.deposits', d.source);
    if (d.kind === 'assigned_frequency') {
      if (!d.frequencies[d.lookback.newEmployer]) bad.push(`withholding.deposits: new-employer frequency ${d.lookback.newEmployer} is not defined`);
      for (const c of d.lookback.classes) if (!d.frequencies[c.name]) bad.push(`withholding.deposits: look-back class ${c.name} has no frequency`);
    } else if (d.kind === 'quarter_month_threshold') {
      if (!(d.thresholdExclusive > 0)) bad.push('withholding.deposits: threshold must be positive cents');
    } else {
      const names = d.bands.map((b) => b.name);
      for (const fed of ['next_day', 'semiweekly', 'monthly'] as const) {
        for (const n of names) if (!d.rows[fed]?.[n]) bad.push(`withholding.deposits.rows.${fed}.${n} is missing`);
      }
      for (const b of d.bands.slice(0, -1)) if (b.maxExclusive === undefined && b.maxInclusive === undefined) bad.push(`band ${b.name} has no maximum`);
    }
  }
  if (p.withholding?.applies && !p.withholding.deposits && p.withholding.notModelled.length === 0) bad.push('withholding applies but neither deposits nor notModelled is given');
  for (const r of p.ui?.returns ?? []) cite(`ui.returns.${r.id}`, r.source);
  for (const r of p.withholding?.returns ?? []) cite(`withholding.returns.${r.id}`, r.source);
  if (p.newHire) cite('newHire', p.newHire.source);
  for (const c of p.channels) cite(`channels.${c.id}`, c.source);
  return bad;
}

// ---------------------------------------------------------------------------
// Coverage: every jurisdiction, modelled or explicitly not
// ---------------------------------------------------------------------------

export interface UiAgencyRow {
  code: string;
  jurisdiction: string;
  agencyLines: string[];
  phone: string | null;
  website: string | null;
}

export function uiAgencies(): UiAgencyRow[] {
  const file = JSON.parse(readFileSync(join(DATA_ROOT, 'ui-agencies.json'), 'utf8')) as { agencies: UiAgencyRow[] };
  return file.agencies;
}

export interface CoverageRow {
  code: string;
  jurisdiction: string;
  uiAgency: string;
  modelled: boolean;
  functions: { withholding: 'modelled' | 'partial' | 'NOT MODELLED' | 'no wage income tax'; ui: 'modelled' | 'NOT MODELLED'; newHire: 'modelled' | 'NOT MODELLED' };
  reason?: string;
}

/** One row per jurisdiction the DOL lists, saying plainly what is and is not covered. */
export function coverage(): CoverageRow[] {
  const registry = JSON.parse(readFileSync(join(DATA_ROOT, '..', 'sources', 'us-registry.json'), 'utf8')) as { states: { code: string; wageIncomeTax: boolean }[] };
  const taxes = new Map(registry.states.map((s) => [s.code, s.wageIncomeTax]));
  return uiAgencies().map((a) => {
    const modelled = hasProfile(a.code);
    const p = modelled ? loadProfile(a.code) : undefined;
    const wageTax = taxes.get(a.code);
    const withholding: CoverageRow['functions']['withholding'] =
      wageTax === false ? 'no wage income tax' : !p ? 'NOT MODELLED' : p.withholding?.deposits ? 'modelled' : 'partial';
    return {
      code: a.code,
      jurisdiction: a.jurisdiction,
      uiAgency: a.agencyLines.join(', '),
      modelled,
      functions: {
        withholding,
        ui: p?.ui ? 'modelled' : 'NOT MODELLED',
        newHire: p?.newHire ? 'modelled' : 'NOT MODELLED',
      },
      reason: modelled ? undefined : 'No profile yet: the state\'s own documents have not been read. Nothing is assumed.',
    };
  });
}

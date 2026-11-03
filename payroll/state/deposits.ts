import { fmt, type Cents } from '../../src/money.ts';
import { addDays, quarterOf, semiweeklyPeriodEnd, weekday } from '../federal/calendar.ts';
import type { DepositAnalysis, DepositObligation } from '../federal/deposits.ts';
import type { Finding } from '../federal/form941.ts';
import { holidayFinding, resolveDue } from './calendar.ts';
import type { StateDay } from './ledger.ts';
import type { AssignedFrequencySpec, BandDepositSpec, FederalDepositRule, QuarterMonthThresholdSpec, StateDepositSchedule, StateProfile } from './profile.ts';

/**
 * STATE WITHHOLDING DEPOSITS: when the state's income-tax and employee-insurance
 * withholding must be deposited, worked out from the employer's FEDERAL deposit
 * schedule and the amount accumulated, using the state's own rule table as data
 * (see `DepositSpec` in profile.ts).
 *
 * The first state modelled is California, whose Employer's Guide (DE 44, Rev. 52,
 * 4-26) publishes the table. Its rule: the schedule depends on the federal one and
 * on how much California PIT was withheld in the deposit period; more than $400 is
 * the federal-style schedule, $350 to $400 is monthly, under $350 is quarterly. The
 * guide does not say exactly how amounts accumulate across periods, so the
 * interpretation applied is written into the profile and repeated in every result.
 * A state whose profile has no deposit table returns an ERROR finding, never a guess.
 */

export type Quarter = 1 | 2 | 3 | 4;

export interface StateDepositObligation {
  id: string;
  state: string;
  schedule: StateDepositSchedule;
  /** The amount band that put these pay dates on this schedule, when the state uses bands. */
  band?: string;
  federalRule?: FederalDepositRule;
  payDates: string[];
  year: number;
  quarter: Quarter;
  withholding: Cents;
  employeeInsurance: Cents;
  /** Employer unemployment contributions paid with a quarterly deposit. */
  employerUi: Cents;
  amount: Cents;
  dueDate: string;
  /** Last date the state treats a quarterly payment as timely, when stated. */
  delinquentAfter?: string;
  /** When an electronic payment must settle, when the state states it. */
  settleBy?: string;
  notes: string[];
}

export interface StateDepositAnalysis {
  obligations: StateDepositObligation[];
  findings: Finding[];
}

interface Item {
  dates: string[];
  withholding: Cents;
  employeeInsurance: Cents;
  band: string;
  federalRule: FederalDepositRule;
}

function bandFor(spec: BandDepositSpec, pit: Cents): string {
  for (const b of spec.bands) {
    if (b.maxExclusive !== undefined && pit < b.maxExclusive) return b.name;
    if (b.maxInclusive !== undefined && pit <= b.maxInclusive) return b.name;
    if (b.maxExclusive === undefined && b.maxInclusive === undefined) return b.name;
  }
  return spec.bands[spec.bands.length - 1].name;
}

const sum = (xs: readonly StateDay[], k: 'withholding' | 'employeeInsurance' | 'employerUi'): Cents => xs.reduce((s, d) => s + d[k], 0);

function analyzeBandDeposits(
  profile: StateProfile,
  days: readonly StateDay[],
  federal: DepositAnalysis,
  extraHolidays: readonly string[] = [],
): StateDepositAnalysis {
  const findings: Finding[] = [];
  const hf = holidayFinding(profile);
  if (hf) findings.push(hf);

  const spec = profile.withholding?.deposits as BandDepositSpec | undefined;
  if (!profile.withholding?.applies || !spec) {
    findings.push({
      severity: 'error',
      code: 'state_deposits_not_modelled',
      message: `${profile.state}: the withholding deposit rules are not modelled${profile.withholding?.notModelled?.length ? ` (${profile.withholding.notModelled.join('; ')})` : ''}. Nothing is assumed; read the state's own deposit instructions.`,
    });
    return { obligations: [], findings };
  }
  findings.push({ severity: 'info', code: 'state_deposit_interpretation', message: spec.interpretation });

  const dayByDate = new Map(days.map((d) => [d.date, d]));
  const groupOfDate = new Map<string, DepositObligation>();
  for (const g of federal.obligations) for (const d of g.payDates) groupOfDate.set(d, g);

  const obligations: StateDepositObligation[] = [];
  const monthly = new Map<string, Item[]>();
  const quarterly = new Map<string, Item[]>();

  // Pay dates the federal analysis did not group (no federal liability that day): treat as the monthly rule and say so.
  const orphanDates = days.filter((d) => !groupOfDate.has(d.date) && (d.withholding !== 0 || d.employeeInsurance !== 0)).map((d) => d.date);
  if (orphanDates.length) {
    findings.push({ severity: 'warning', code: 'state_pay_date_without_federal_group', message: `${profile.state}: ${orphanDates.join(', ')} have state withholding but no federal deposit group; the monthly rule was used.` });
  }

  type Group = { rule: FederalDepositRule; dates: string[] };
  const groups: Group[] = [];
  const seen = new Set<DepositObligation>();
  for (const d of days) {
    const g = groupOfDate.get(d.date);
    if (g) {
      if (!seen.has(g)) {
        seen.add(g);
        groups.push({ rule: g.rule === 'next_day' ? 'next_day' : g.schedule === 'semiweekly' ? 'semiweekly' : 'monthly', dates: g.payDates });
      }
    }
  }
  if (orphanDates.length) groups.push({ rule: 'monthly', dates: orphanDates });

  for (const g of groups) {
    const gdays = g.dates.map((d) => dayByDate.get(d)).filter((x): x is StateDay => Boolean(x));
    const withholding = sum(gdays, 'withholding');
    const insurance = sum(gdays, 'employeeInsurance');
    if (withholding === 0 && insurance === 0) continue;
    const band = bandFor(spec, withholding);
    const schedule = spec.rows[g.rule][band];
    const dates = gdays.map((d) => d.date);
    const year = Number(dates[0].slice(0, 4));
    const q = quarterOf(dates[0]);

    if (schedule === 'next_day') {
      const last = dates[dates.length - 1];
      const due = resolveDue(spec.due.next_day, last, profile, extraHolidays);
      obligations.push({
        id: `${profile.state}-next_day-${dates[0]}`, state: profile.state, schedule, band, federalRule: g.rule, payDates: dates, year, quarter: q,
        withholding, employeeInsurance: insurance, employerUi: 0, amount: withholding + insurance, dueDate: due.dueDate, settleBy: due.settleBy,
        notes: [`${fmt(withholding)} of ${profile.state} withholding in one federal next-day group (band ${band}).`],
      });
    } else if (schedule === 'semiweekly') {
      const due = resolveDue(spec.due.semiweekly, semiweeklyPeriodEnd(dates[0]), profile, extraHolidays);
      obligations.push({
        id: `${profile.state}-semiweekly-${dates[0]}`, state: profile.state, schedule, band, federalRule: g.rule, payDates: dates, year, quarter: q,
        withholding, employeeInsurance: insurance, employerUi: 0, amount: withholding + insurance, dueDate: due.dueDate,
        notes: [`${fmt(withholding)} withheld in the deposit period (band ${band}).`],
      });
    } else {
      const item: Item = { dates, withholding, employeeInsurance: insurance, band, federalRule: g.rule };
      const key = schedule === 'monthly' ? dates[0].slice(0, 7) : `${year}-Q${q}`;
      const pool = schedule === 'monthly' ? monthly : quarterly;
      pool.set(key, [...(pool.get(key) ?? []), item]);
    }
  }

  for (const [month, items] of monthly) {
    const dates = items.flatMap((i) => i.dates).sort();
    const w = items.reduce((s, i) => s + i.withholding, 0);
    const ins = items.reduce((s, i) => s + i.employeeInsurance, 0);
    const due = resolveDue(spec.due.monthly, `${month}-01`, profile, extraHolidays);
    obligations.push({
      id: `${profile.state}-monthly-${month}`, state: profile.state, schedule: 'monthly', band: items[0].band, federalRule: items[0].federalRule, payDates: dates,
      year: Number(month.slice(0, 4)), quarter: quarterOf(`${month}-01`), withholding: w, employeeInsurance: ins, employerUi: 0, amount: w + ins, dueDate: due.dueDate,
      notes: [`Monthly deposit for ${month}.`],
    });
  }

  // Quarterly deposits carry the employer's UI contribution for the whole quarter, whatever schedule the withholding is on.
  const quartersWithUi = new Map<string, { year: number; q: Quarter; ui: Cents; dates: string[] }>();
  for (const d of days) {
    if (d.employerUi === 0) continue;
    const q = quarterOf(d.date);
    const key = `${d.date.slice(0, 4)}-Q${q}`;
    const e = quartersWithUi.get(key) ?? { year: Number(d.date.slice(0, 4)), q, ui: 0, dates: [] };
    e.ui += d.employerUi;
    e.dates.push(d.date);
    quartersWithUi.set(key, e);
  }
  const quarterKeys = new Set([...quarterly.keys(), ...quartersWithUi.keys()]);
  for (const key of quarterKeys) {
    const items = quarterly.get(key) ?? [];
    const ui = quartersWithUi.get(key);
    const dates = [...new Set([...items.flatMap((i) => i.dates), ...(ui?.dates ?? [])])].sort();
    const w = items.reduce((s, i) => s + i.withholding, 0);
    const ins = items.reduce((s, i) => s + i.employeeInsurance, 0);
    const employerUi = spec.employerQuarterly.includes('ui') ? (ui?.ui ?? 0) : 0;
    if (w + ins + employerUi === 0) continue;
    const year = Number(key.slice(0, 4));
    const q = Number(key.slice(6)) as Quarter;
    const due = resolveDue(spec.due.quarterly, dates[0], profile, extraHolidays);
    obligations.push({
      id: `${profile.state}-quarterly-${key}`, state: profile.state, schedule: 'quarterly', band: items[0]?.band, federalRule: items[0]?.federalRule, payDates: dates, year, quarter: q,
      withholding: w, employeeInsurance: ins, employerUi, amount: w + ins + employerUi, dueDate: due.dueDate, delinquentAfter: due.delinquentAfter, settleBy: due.settleBy,
      notes: [`Quarterly payment for ${key}: ${fmt(w + ins)} withheld${employerUi ? ` plus ${fmt(employerUi)} employer UI` : ''}.`],
    });
  }

  obligations.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
  return { obligations, findings };
}

// ---------------------------------------------------------------------------
// Other rule shapes, and the dispatcher
// ---------------------------------------------------------------------------

export interface StateDepositOptions {
  extraHolidays?: readonly string[];
  /** The frequency the agency assigned (assigned-frequency states), e.g. 'weekly', 'monthly', 'quarterly'. */
  assignedFrequency?: string;
  /** The employer's liability over the look-back period, cents; used to derive the frequency when none is given. */
  lookbackLiability?: Cents;
  /** An employer licensed to file annually (Nebraska). */
  annualFiler?: boolean;
}

/** The Friday that ends the Saturday-to-Friday week containing `date`. */
function weekEndFriday(date: string): string {
  return addDays(date, (5 - weekday(date) + 7) % 7);
}

function rulesYearFinding(profile: StateProfile, rulesYear: number | undefined, days: readonly StateDay[]): Finding | undefined {
  if (rulesYear === undefined) return undefined;
  const other = [...new Set(days.map((d) => Number(d.date.slice(0, 4))).filter((y) => y !== rulesYear))];
  if (other.length === 0) return undefined;
  return {
    severity: 'warning',
    code: 'state_rules_year_mismatch',
    message: `${profile.state}: these deposit rules were read from the ${rulesYear} edition of the state's guide but pay dates fall in ${other.join(', ')}. Thresholds and dates may have changed; read that year's guide.`,
  };
}

function periodKey(period: 'week_sat_fri' | 'month' | 'quarter' | 'year', date: string): { key: string; anchor: string } {
  const q = quarterOf(date);
  switch (period) {
    case 'week_sat_fri': {
      const end = weekEndFriday(date);
      // a week that spans two quarters needs separate payments (the guide says so)
      return { key: `${end}|Q${q}`, anchor: end };
    }
    case 'month':
      return { key: date.slice(0, 7), anchor: `${date.slice(0, 7)}-01` };
    case 'quarter':
      return { key: `${date.slice(0, 4)}-Q${q}`, anchor: date };
    case 'year':
      return { key: date.slice(0, 4), anchor: date };
  }
}

function analyzeAssignedFrequency(profile: StateProfile, spec: AssignedFrequencySpec, days: readonly StateDay[], opts: StateDepositOptions): StateDepositAnalysis {
  const findings: Finding[] = [];
  const hf = holidayFinding(profile);
  if (hf) findings.push(hf);
  const ry = rulesYearFinding(profile, spec.rulesYear, days);
  if (ry) findings.push(ry);
  findings.push({ severity: 'info', code: 'state_deposit_interpretation', message: spec.interpretation });

  let frequency = opts.assignedFrequency;
  if (frequency === undefined && opts.lookbackLiability !== undefined) {
    const l = opts.lookbackLiability;
    frequency = spec.lookback.classes.find((c) => (c.minExclusive === undefined || l > c.minExclusive) && (c.maxInclusive === undefined || l <= c.maxInclusive))?.name;
  }
  if (frequency === undefined) {
    frequency = spec.lookback.newEmployer;
    findings.push({ severity: 'warning', code: 'state_frequency_assumed_new_employer', message: `${profile.state}: no assigned frequency or look-back liability was given, so the new-employer frequency (${frequency}) was used. The agency tells each employer its frequency by mail; supply it.` });
  }
  const f = spec.frequencies[frequency];
  if (!f) {
    findings.push({ severity: 'error', code: 'state_unknown_frequency', message: `${profile.state}: "${frequency}" is not a frequency in the profile (${Object.keys(spec.frequencies).join(', ')}).` });
    return { obligations: [], findings };
  }

  const groups = new Map<string, { anchor: string; days: StateDay[] }>();
  for (const d of days) {
    if (d.withholding === 0 && d.employeeInsurance === 0) continue;
    const { key, anchor } = periodKey(f.period, d.date);
    const g = groups.get(key) ?? { anchor, days: [] };
    g.days.push(d);
    groups.set(key, g);
  }
  const obligations: StateDepositObligation[] = [];
  const extra = opts.extraHolidays ?? [];
  for (const [key, g] of groups) {
    const dates = g.days.map((d) => d.date);
    const withholding = sum(g.days, 'withholding');
    const insurance = sum(g.days, 'employeeInsurance');
    const due = resolveDue(f.due, g.anchor, profile, extra);
    const sched: StateDepositSchedule = f.period === 'week_sat_fri' ? 'weekly' : f.period === 'month' ? 'monthly' : f.period === 'quarter' ? 'quarterly' : 'annual';
    obligations.push({
      id: `${profile.state}-${sched}-${key.replace('|', '-')}`, state: profile.state, schedule: sched, payDates: dates,
      year: Number(dates[0].slice(0, 4)), quarter: quarterOf(dates[0]), withholding, employeeInsurance: insurance, employerUi: 0,
      amount: withholding + insurance, dueDate: due.dueDate, settleBy: due.settleBy,
      notes: [`${frequency} remitter: ${fmt(withholding + insurance)} for period ${key.replace('|', ' ')}.`],
    });
  }
  obligations.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
  return { obligations, findings };
}

function analyzeQuarterMonthThreshold(profile: StateProfile, spec: QuarterMonthThresholdSpec, days: readonly StateDay[], opts: StateDepositOptions): StateDepositAnalysis {
  const findings: Finding[] = [];
  const hf = holidayFinding(profile);
  if (hf) findings.push(hf);
  const ry = rulesYearFinding(profile, spec.rulesYear, days);
  if (ry) findings.push(ry);
  findings.push({ severity: 'info', code: 'state_deposit_interpretation', message: spec.interpretation });
  const extra = opts.extraHolidays ?? [];
  const obligations: StateDepositObligation[] = [];
  const live = days.filter((d) => d.withholding !== 0 || d.employeeInsurance !== 0);
  const amountOf = (xs: readonly StateDay[]) => sum(xs, 'withholding') + sum(xs, 'employeeInsurance');

  if (opts.annualFiler) {
    const byYear = new Map<string, StateDay[]>();
    for (const d of live) byYear.set(d.date.slice(0, 4), [...(byYear.get(d.date.slice(0, 4)) ?? []), d]);
    for (const [year, ds] of byYear) {
      const due = resolveDue(spec.annual.due, `${year}-06-01`, profile, extra);
      obligations.push({
        id: `${profile.state}-annual-${year}`, state: profile.state, schedule: 'annual', payDates: ds.map((d) => d.date), year: Number(year), quarter: 4,
        withholding: sum(ds, 'withholding'), employeeInsurance: sum(ds, 'employeeInsurance'), employerUi: 0, amount: amountOf(ds), dueDate: due.dueDate,
        notes: ['Annual filer: one return and payment for the calendar year.'],
      });
    }
    return { obligations, findings };
  }

  const byQuarter = new Map<string, StateDay[]>();
  for (const d of live) {
    const key = `${d.date.slice(0, 4)}-Q${quarterOf(d.date)}`;
    byQuarter.set(key, [...(byQuarter.get(key) ?? []), d]);
  }
  for (const [key, ds] of byQuarter) {
    const year = Number(key.slice(0, 4));
    const q = Number(key.slice(6)) as Quarter;
    const monthOf = (d: StateDay) => ((Number(d.date.slice(5, 7)) - 1) % 3) + 1;
    const m = [1, 2, 3].map((n) => ds.filter((d) => monthOf(d) === n));
    const amounts = m.map(amountOf);
    const T = spec.thresholdExclusive;
    const dep: Cents[] = [0, 0, 0];
    if (amounts[0] > T) dep[0] = amounts[0];
    if (amounts[1] > T || (spec.secondMonthTriggeredByFirst && amounts[0] > T)) dep[1] = amounts[1];
    for (const n of [0, 1]) {
      if (dep[n] === 0) continue;
      const due = resolveDue(spec.depositDue, m[n][0].date, profile, extra);
      obligations.push({
        id: `${profile.state}-monthly-${m[n][0].date.slice(0, 7)}`, state: profile.state, schedule: 'monthly', payDates: m[n].map((d) => d.date), year, quarter: q,
        withholding: sum(m[n], 'withholding'), employeeInsurance: sum(m[n], 'employeeInsurance'), employerUi: 0, amount: dep[n], dueDate: due.dueDate,
        notes: [`Month ${n + 1} of the quarter: more than ${fmt(T)} was withheld${n === 1 && amounts[1] <= T ? ' in month 1, which also requires the month 2 deposit' : ''}.`],
      });
    }
    const remaining = amounts.reduce((a, b) => a + b, 0) - dep.reduce((a, b) => a + b, 0);
    if (remaining > 0) {
      const rest = ds.filter((d) => (monthOf(d) === 3) || (monthOf(d) === 1 && dep[0] === 0) || (monthOf(d) === 2 && dep[1] === 0));
      const due = resolveDue(spec.returnPaymentDue, ds[0].date, profile, extra);
      obligations.push({
        id: `${profile.state}-quarterly-${key}`, state: profile.state, schedule: 'quarterly', payDates: rest.map((d) => d.date), year, quarter: q,
        withholding: sum(rest, 'withholding'), employeeInsurance: sum(rest, 'employeeInsurance'), employerUi: 0, amount: remaining, dueDate: due.dueDate,
        notes: [`Paid with the quarterly return: month 3 and any month not deposited.`],
      });
    }
  }
  obligations.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
  return { obligations, findings };
}

/**
 * The entry point. Chooses the analyzer from the profile's rule shape: a table keyed
 * by the federal schedule (California), an agency-assigned frequency (Connecticut),
 * or month thresholds within the quarter (Nebraska). A state with no deposit rules
 * returns an error finding. The second form of the last argument (an array of dates)
 * is kept for the earlier signature.
 */
export function analyzeStateDeposits(
  profile: StateProfile,
  days: readonly StateDay[],
  federal: DepositAnalysis | undefined,
  options: StateDepositOptions | readonly string[] = {},
): StateDepositAnalysis {
  const opts: StateDepositOptions = Array.isArray(options) ? { extraHolidays: options } : (options as StateDepositOptions);
  const spec = profile.withholding?.deposits;
  if (!profile.withholding?.applies || !spec) {
    return analyzeBandDeposits(profile, days, federal as DepositAnalysis, opts.extraHolidays ?? []);
  }
  if (spec.kind === 'assigned_frequency') return analyzeAssignedFrequency(profile, spec, days, opts);
  if (spec.kind === 'quarter_month_threshold') return analyzeQuarterMonthThreshold(profile, spec, days, opts);
  if (!federal) {
    return { obligations: [], findings: [{ severity: 'error', code: 'state_needs_federal_schedule', message: `${profile.state}'s deposit schedule depends on the federal one; supply the federal deposit analysis.` }] };
  }
  const result = analyzeBandDeposits(profile, days, federal, opts.extraHolidays ?? []);
  const ry = rulesYearFinding(profile, spec.rulesYear, days);
  if (ry) result.findings.push(ry);
  return result;
}

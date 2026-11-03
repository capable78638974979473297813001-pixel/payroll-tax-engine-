import { fmt, type Cents } from '../../src/money.ts';
import { quarterOf, semiweeklyPeriodEnd } from '../federal/calendar.ts';
import type { DepositAnalysis, DepositObligation } from '../federal/deposits.ts';
import type { Finding } from '../federal/form941.ts';
import { holidayFinding, resolveDue } from './calendar.ts';
import type { StateDay } from './ledger.ts';
import type { FederalDepositRule, StateDepositSchedule, StateProfile } from './profile.ts';

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

function bandFor(spec: NonNullable<NonNullable<StateProfile['withholding']>['deposits']>, pit: Cents): string {
  for (const b of spec.bands) {
    if (b.maxExclusive !== undefined && pit < b.maxExclusive) return b.name;
    if (b.maxInclusive !== undefined && pit <= b.maxInclusive) return b.name;
    if (b.maxExclusive === undefined && b.maxInclusive === undefined) return b.name;
  }
  return spec.bands[spec.bands.length - 1].name;
}

const sum = (xs: readonly StateDay[], k: 'withholding' | 'employeeInsurance' | 'employerUi'): Cents => xs.reduce((s, d) => s + d[k], 0);

export function analyzeStateDeposits(
  profile: StateProfile,
  days: readonly StateDay[],
  federal: DepositAnalysis,
  extraHolidays: readonly string[] = [],
): StateDepositAnalysis {
  const findings: Finding[] = [];
  const hf = holidayFinding(profile);
  if (hf) findings.push(hf);

  const spec = profile.withholding?.deposits;
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

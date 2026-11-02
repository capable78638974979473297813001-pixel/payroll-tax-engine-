import { dollars, type Cents } from '../../src/money.ts';
import {
  addDays,
  depositDue,
  form941Due,
  nextDayDepositDue,
  quarterOf,
  semiweeklyPeriodEnd,
  weekday,
  type DepositSchedule,
} from './calendar.ts';
import type { DayLiability } from './ledger.ts';

/**
 * Federal tax DEPOSITS: how much must be deposited, when, whether it was, and
 * what being late costs.
 *
 * Rules implemented, each from IRS Publication 15 (2026) section 11 as read for
 * this module:
 *  - Lookback period and the $50,000 line (monthly vs semiweekly).
 *  - Deposit periods: a calendar month for monthly depositors; Wed-Fri and
 *    Sat-Tue for semiweekly depositors.
 *  - The $100,000 next-day rule, determined BEFORE any reduction for credits;
 *    "once you accumulate at least $100,000 in a deposit period, stop
 *    accumulating at the end of that day and begin to accumulate anew on the
 *    next day" (Fir Co. example); "don't continue accumulating a tax liability
 *    after the end of a deposit period" ($95,000 then $10,000 example); a monthly
 *    depositor "becomes a semiweekly schedule depositor on the next day"
 *    (Elm, Inc. example).
 *  - Semiweekly periods that span two quarters need separate deposits.
 *  - Deposits are applied to the MOST RECENT liability in the quarter first
 *    (Cedar, Inc. example).
 *  - The accuracy-of-deposits rule and its makeup dates (both Pub. 15 examples).
 *  - Failure-to-deposit penalty tiers: 2% (1-5 days late), 5% (6-15), 10% (16+).
 *
 * NOT modelled, and reported as such rather than guessed: the 15% tier (it needs
 * the date of an IRS notice, which only the IRS has), interest, the first-time
 * penalty abatement and reasonable-cause relief (those are the IRS's judgement
 * calls), and a deposit designation under Rev. Proc. 2001-58.
 */

export const NEXT_DAY_THRESHOLD: Cents = dollars(100_000);
export const LOOKBACK_THRESHOLD: Cents = dollars(50_000);
export const DE_MINIMIS_THRESHOLD: Cents = dollars(2_500);

export type Quarter = 1 | 2 | 3 | 4;

export type DepositRule = 'monthly' | 'semiweekly' | 'next_day';

export interface DepositObligation {
  id: string;
  year: number;
  quarter: Quarter;
  /** Pay dates whose liability this deposit covers, in order. */
  payDates: string[];
  /** The liability before any credit. The $100,000 test is applied to this. */
  liability: Cents;
  /** Research-credit reduction taken against these pay dates (Form 941 line 11). */
  creditApplied: Cents;
  /** What must actually be deposited: liability - creditApplied. */
  amountDue: Cents;
  dueDate: string;
  rule: DepositRule;
  /** The schedule the depositor was on when this liability accrued. */
  schedule: DepositSchedule;
}

export interface DepositAnalysis {
  startingSchedule: DepositSchedule;
  endingSchedule: DepositSchedule;
  /** The first day the depositor is semiweekly because of the $100,000 rule, if it happened. */
  becameSemiweeklyOn?: string;
  /** Pay dates on which $100,000 or more accumulated in a deposit period. */
  nextDayTriggerDates: string[];
  obligations: DepositObligation[];
}

/** Lookback: more than $50,000 of Form 941 line 12 taxes is semiweekly; $50,000 or less (or no history) is monthly. */
export function scheduleFromLookback(lookbackTotalLine12: Cents | undefined): DepositSchedule {
  if (lookbackTotalLine12 === undefined) return 'monthly';
  return lookbackTotalLine12 > LOOKBACK_THRESHOLD ? 'semiweekly' : 'monthly';
}

function periodId(schedule: DepositSchedule, date: string): string {
  return schedule === 'monthly' ? `m:${date.slice(0, 7)}` : `s:${semiweeklyPeriodEnd(date)}`;
}

interface Segment {
  schedule: DepositSchedule;
  rule: DepositRule;
  days: DayLiability[];
  dueDate: string;
}

/**
 * Turn a chronological list of pay-date liabilities into the deposits they
 * require. `startingSchedule` is the depositor's status on the first day (from
 * the lookback period, or semiweekly if a $100,000 accumulation already made it
 * so earlier in the year or in the prior year).
 *
 * `creditByDate` is the research-credit reduction already allocated to each pay
 * date (see form941.ts); it lowers the amount deposited but not the amount
 * tested against $100,000.
 */
export function analyzeDeposits(
  days: readonly DayLiability[],
  options: { startingSchedule: DepositSchedule; creditByDate?: Readonly<Record<string, Cents>> },
): DepositAnalysis {
  let schedule = options.startingSchedule;
  const segments: Segment[] = [];
  const triggers: string[] = [];
  let becameSemiweeklyOn: string | undefined;

  let currentPeriod = '';
  let running = 0;
  let open: DayLiability[] = [];

  const closeOpenSegment = () => {
    if (open.length === 0) return;
    const last = open[open.length - 1].date;
    segments.push({
      schedule,
      rule: schedule,
      days: open,
      dueDate: depositDue(schedule, last),
    });
    open = [];
  };

  for (const day of days) {
    const id = periodId(schedule, day.date);
    if (id !== currentPeriod) {
      closeOpenSegment();
      currentPeriod = id;
      running = 0;
    }
    open.push(day);
    running += day.total;
    if (running >= NEXT_DAY_THRESHOLD) {
      segments.push({
        schedule,
        rule: 'next_day',
        days: open,
        dueDate: nextDayDepositDue(day.date),
      });
      open = [];
      running = 0;
      triggers.push(day.date);
      if (schedule === 'monthly') {
        schedule = 'semiweekly';
        becameSemiweeklyOn = addDays(day.date, 1);
        currentPeriod = '';
      }
    }
  }
  closeOpenSegment();

  const obligations: DepositObligation[] = [];
  for (const seg of segments) {
    // "If you have more than 1 pay date during a semiweekly period and the pay
    // dates fall in different calendar quarters, you'll need to make separate
    // deposits for the separate liabilities."
    const byQuarter = new Map<string, DayLiability[]>();
    for (const d of seg.days) {
      const key = `${d.date.slice(0, 4)}-${quarterOf(d.date)}`;
      byQuarter.set(key, [...(byQuarter.get(key) ?? []), d]);
    }
    for (const [key, group] of byQuarter) {
      const liability = group.reduce((s, d) => s + d.total, 0);
      const creditApplied = group.reduce((s, d) => s + (options.creditByDate?.[d.date] ?? 0), 0);
      const [year, quarter] = key.split('-').map(Number);
      obligations.push({
        id: `${year}-Q${quarter}-${group[0].date}-${seg.rule}`,
        year,
        quarter: quarter as Quarter,
        payDates: group.map((d) => d.date),
        liability,
        creditApplied,
        amountDue: Math.max(0, liability - creditApplied),
        dueDate: seg.dueDate,
        rule: seg.rule,
        schedule: seg.schedule,
      });
    }
  }
  obligations.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.payDates[0].localeCompare(b.payDates[0]));

  return {
    startingSchedule: options.startingSchedule,
    endingSchedule: schedule,
    becameSemiweeklyOn,
    nextDayTriggerDates: triggers,
    obligations,
  };
}

/**
 * The de minimis exception: pay with the timely return instead of depositing if
 * line 12 of this return OR the prior quarter's is under $2,500 and no
 * $100,000 next-day obligation arose this quarter (Form 941 line 16, first box).
 */
export function qualifiesForDeMinimis(
  currentLine12: Cents,
  priorQuarterLine12: Cents | undefined,
  hadNextDayObligation: boolean,
): boolean {
  if (hadNextDayObligation) return false;
  if (currentLine12 < DE_MINIMIS_THRESHOLD) return true;
  return priorQuarterLine12 !== undefined && priorQuarterLine12 < DE_MINIMIS_THRESHOLD;
}

// ---------------------------------------------------------------------------
// Recorded deposits, and what they did or did not satisfy
// ---------------------------------------------------------------------------

export interface TaxDeposit {
  id: string;
  /** The date the payment settled with the Treasury (the deposit date for lateness). */
  date: string;
  amount: Cents;
  /** The tax period the payment was designated to (EFTPS asks for the quarter). */
  year: number;
  quarter: Quarter;
  /** EFTPS "EFT Trace Number" / acknowledgement number - Pub. 15: "an EFT Trace Number will be provided with each successful payment". */
  traceNumber?: string;
  method?: 'eftps' | 'direct_pay' | 'business_tax_account' | 'same_day_wire' | 'third_party';
}

export type ObligationState = 'not_due' | 'paid_on_time' | 'paid_late' | 'short' | 'unpaid';

export interface DepositApplication {
  depositId: string;
  amount: Cents;
  date: string;
}

export interface ObligationStatus {
  obligation: DepositObligation;
  state: ObligationState;
  applications: DepositApplication[];
  deposited: Cents;
  /** Still unpaid as of `asOf`. */
  shortfall: Cents;
  /** Calendar days the (latest) payment, or `asOf` if unpaid, is past the due date. */
  daysLate: number;
  /** 0, 0.02, 0.05 or 0.10 - see the header for the 15% tier that cannot be computed here. */
  penaltyRate: number;
  /** The IRS's de minimis rule: a shortfall within max($100, 2%) made up by the makeup date draws no penalty. */
  withinAccuracyRule: boolean;
  makeupDate?: string;
  /** Estimate only: rate x amount paid late or still unpaid. Excludes interest and the 15% tier. */
  estimatedPenalty: Cents;
}

export interface DepositReconciliation {
  statuses: ObligationStatus[];
  /** Payments that exceeded every liability accrued when they were made - a prepayment or an overpayment. */
  unapplied: { depositId: string; amount: Cents }[];
  totalDue: Cents;
  totalDeposited: Cents;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Pub. 15: 2% for 1-5 days late, 5% for 6-15, 10% for 16 or more. */
export function penaltyRateForDaysLate(daysLate: number): number {
  if (daysLate <= 0) return 0;
  if (daysLate <= 5) return 0.02;
  if (daysLate <= 15) return 0.05;
  return 0.1;
}

function firstWedOrFriOnOrAfter(date: string): string {
  let d = date;
  while (weekday(d) !== 3 && weekday(d) !== 5) d = addDays(d, 1);
  return d;
}

/**
 * Accuracy-of-deposits makeup date (Pub. 15). Monthly depositors: the due date
 * of the return for the period. Semiweekly depositors: the earlier of the first
 * Wednesday or Friday on or after the 15th of the month AFTER the month the
 * shortfall occurred, and the return's due date. Both Pub. 15 examples are
 * tests: a shortfall in April 2026 -> Friday May 15; one at the July 1, 2026
 * deposit due date -> July 31 (the return date comes first), not Aug 19.
 */
export function shortfallMakeupDate(schedule: DepositSchedule, obligation: DepositObligation): string {
  const returnDue = form941Due(obligation.year, obligation.quarter).dueDate;
  if (schedule === 'monthly') return returnDue;
  const [y, m] = obligation.dueDate.split('-').map(Number);
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear = m === 12 ? y + 1 : y;
  const fifteenth = `${nextYear}-${String(nextMonth).padStart(2, '0')}-15`;
  const candidate = firstWedOrFriOnOrAfter(fifteenth);
  return candidate < returnDue ? candidate : returnDue;
}

/**
 * Apply recorded deposits to the obligations and report what is paid, late,
 * short or unpaid as of `asOf`.
 *
 * Application order. Pub. 15: "Deposits are generally applied to the most
 * recent tax liability within the quarter" (Cedar, Inc.: a $2,000 deposit on
 * May 15 covers the $1,500 due May 15 first, then $500 of the $1,000 due Apr
 * 15 - a test). Read literally against liabilities that have merely ACCRUED, a
 * Wednesday deposit meant for last Wednesday's payroll would land on the
 * payroll paid that same Wednesday and a perfectly timely deposit would show a
 * penalty. So the order used here is: liabilities already DUE, most recently
 * due first (which is what the Cedar example shows); then any remainder goes to
 * accrued liabilities not yet due, earliest first, as an early payment;
 * anything beyond that is reported as unapplied rather than guessed onto a
 * liability that has not happened. A taxpayer can redesignate a deposit within
 * 90 days of a penalty notice (Rev. Proc. 2001-58); that is not modelled.
 */
export function reconcileDeposits(
  obligations: readonly DepositObligation[],
  deposits: readonly TaxDeposit[],
  asOf: string,
): DepositReconciliation {
  const remaining = new Map<string, Cents>(obligations.map((o) => [o.id, o.amountDue]));
  const applications = new Map<string, DepositApplication[]>(obligations.map((o) => [o.id, []]));
  const unapplied: DepositReconciliation['unapplied'] = [];

  const ordered = [...deposits].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  for (const dep of ordered) {
    let left = dep.amount;
    const open = obligations
      .filter((o) => o.year === dep.year && o.quarter === dep.quarter)
      .filter((o) => (remaining.get(o.id) ?? 0) > 0);
    // 1. Liabilities already DUE, most recently due first (Cedar, Inc.).
    const due = open
      .filter((o) => o.dueDate <= dep.date)
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate) || b.payDates[0].localeCompare(a.payDates[0]));
    // 2. Whatever is left is an early payment toward liabilities that have
    //    accrued but are not yet due, earliest due date first.
    const upcoming = open
      .filter((o) => o.dueDate > dep.date && o.payDates[o.payDates.length - 1] <= dep.date)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.payDates[0].localeCompare(b.payDates[0]));
    for (const o of [...due, ...upcoming]) {
      if (left <= 0) break;
      const take = Math.min(left, remaining.get(o.id) ?? 0);
      remaining.set(o.id, (remaining.get(o.id) ?? 0) - take);
      applications.get(o.id)!.push({ depositId: dep.id, amount: take, date: dep.date });
      left -= take;
    }
    if (left > 0) unapplied.push({ depositId: dep.id, amount: left });
  }

  const statuses: ObligationStatus[] = obligations.map((o) => {
    const apps = applications.get(o.id)!;
    const deposited = apps.reduce((s, a) => s + a.amount, 0);
    const shortfall = remaining.get(o.id) ?? 0;
    const paidLate = apps.filter((a) => a.date > o.dueDate);
    const onTime = apps.filter((a) => a.date <= o.dueDate).reduce((s, a) => s + a.amount, 0);
    const makeupDate = shortfallMakeupDate(o.schedule, o);

    let penalty = 0;
    for (const a of paidLate) penalty += Math.round(a.amount * penaltyRateForDaysLate(daysBetween(o.dueDate, a.date)));
    const unpaidDaysLate = shortfall > 0 && asOf > o.dueDate ? daysBetween(o.dueDate, asOf) : 0;
    penalty += Math.round(shortfall * penaltyRateForDaysLate(unpaidDaysLate));

    // Accuracy-of-deposits rule: the amount not deposited by the due date is
    // excused if it does not exceed the greater of $100 or 2% of the required
    // deposit and is made up by the makeup date.
    const notOnTime = o.amountDue - onTime;
    const allowance = Math.max(dollars(100), Math.round(o.amountDue * 0.02));
    const madeUpBy = [...paidLate].every((a) => a.date <= makeupDate);
    const withinAccuracyRule =
      notOnTime > 0 && notOnTime <= allowance && shortfall === 0 && madeUpBy && paidLate.length > 0;
    if (withinAccuracyRule) penalty = 0;

    const lastPaid = apps.length ? apps[apps.length - 1].date : undefined;
    const daysLate = shortfall > 0 ? unpaidDaysLate : lastPaid && lastPaid > o.dueDate ? daysBetween(o.dueDate, lastPaid) : 0;

    let state: ObligationState;
    if (o.amountDue === 0) state = 'paid_on_time';
    else if (shortfall > 0) state = asOf <= o.dueDate ? 'not_due' : deposited > 0 ? 'short' : 'unpaid';
    else state = paidLate.length > 0 ? 'paid_late' : 'paid_on_time';

    return {
      obligation: o,
      state,
      applications: apps,
      deposited,
      shortfall,
      daysLate,
      penaltyRate: penaltyRateForDaysLate(daysLate),
      withinAccuracyRule,
      makeupDate,
      estimatedPenalty: state === 'not_due' ? 0 : penalty,
    };
  });

  return {
    statuses,
    unapplied,
    totalDue: obligations.reduce((s, o) => s + o.amountDue, 0),
    totalDeposited: deposits.reduce((s, d) => s + d.amount, 0),
  };
}

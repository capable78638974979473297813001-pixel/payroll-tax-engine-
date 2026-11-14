import { calculatePaycheckWithGarnishments } from '../src/net-pay-floor.ts';
import { applyRate } from '../src/money.ts';
import { accumulateYtd, freshYearToDate } from './ytd.ts';
import type { Cents } from '../src/money.ts';
import type { GarnishmentOrder } from '../src/garnishment.ts';
import type { PaycheckWithGarnishmentsResult } from '../src/net-pay-floor.ts';
import type { Deduction, PaycheckInput, PretaxCategory } from '../src/types.ts';
import type { ExtendedYearToDate } from './types.ts';

/**
 * Iterators over paychecks. calculatePaycheck() is deliberately stateless, so
 * anything that runs more than one check has to carry the year-to-date ledger
 * forward itself; these generators do that, one check at a time and lazily,
 * so a year of checks or a very large batch never sits in memory at once.
 *
 *   payPeriods()  one employee, every pay date in a calendar year, YTD carried
 *   paychecks()   many independent checks, one result (or error) each
 *
 * Every check goes through calculatePaycheckWithGarnishments(), so garnishment
 * orders are applied each period and voluntary deductions are cut when needed
 * so net pay never lands below $0.00 (see src/net-pay-floor.ts). With no
 * orders and enough pay that is exactly calculatePaycheck().
 */

export type IteratedFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseIso(iso: string): Date {
  const m = ISO.exec(iso);
  if (!m) throw new Error(`Date must be YYYY-MM-DD, got "${iso}".`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.toISOString().slice(0, 10) !== iso) throw new Error(`"${iso}" is not a real calendar date.`);
  return d;
}

const toIso = (d: Date): string => d.toISOString().slice(0, 10);

function endOfMonth(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex + 1, 0));
}

/**
 * Every pay date in `year` on or after `first`, in order.
 *
 *   weekly, biweekly: `first` and every 7 / 14 days after it.
 *   semimonthly: the 15th and the last day of each month.
 *   monthly: the last day of each month.
 *
 * A company that pays on other days can loop over its own dates and call
 * calculatePaycheckWithGarnishments() directly, carrying accumulateYtd() itself.
 */
export function* payDates(first: string, frequency: IteratedFrequency, year?: number): Generator<string, void, undefined> {
  const start = parseIso(first);
  const y = year ?? start.getUTCFullYear();
  if (frequency === 'weekly' || frequency === 'biweekly') {
    const step = frequency === 'weekly' ? 7 : 14;
    for (let d = start; d.getUTCFullYear() <= y; d = new Date(d.getTime() + step * 86_400_000)) {
      if (d.getUTCFullYear() === y) yield toIso(d);
    }
    return;
  }
  if (frequency !== 'semimonthly' && frequency !== 'monthly') {
    throw new Error(`Unsupported pay frequency for iteration: "${frequency}".`);
  }
  for (let m = 0; m < 12; m++) {
    const candidates = frequency === 'semimonthly' ? [new Date(Date.UTC(y, m, 15)), endOfMonth(y, m)] : [endOfMonth(y, m)];
    for (const c of candidates) if (c >= start) yield toIso(c);
  }
}

/**
 * A deduction as an employee elects it: a fixed dollar amount, or a percentage
 * of this check's pay ("6% to the 401(k)"). The percentage is worked out per
 * check, so it follows pay that changes from one period to the next.
 */
export type DeductionSpec =
  | Deduction
  | {
      code: string;
      category: PretaxCategory | null;
      /** A fraction: 0.06 is 6%. Of the check's regular and supplemental earnings. */
      percentOfGross: number;
    };

/** Pay the percentage applies to: regular and supplemental earnings, the pay a deferral election is normally written against. Reimbursements and imputed income are not pay. */
export function electionBase(earnings: PaycheckInput['earnings']): number {
  return earnings.filter((e) => e.category === 'regular' || e.category === 'supplemental').reduce((sum, e) => sum + e.amount, 0);
}

/** Turn percentage elections into dollar amounts for one check. */
export function resolveDeductions(specs: readonly DeductionSpec[], earnings: PaycheckInput['earnings']): Deduction[] {
  const base = electionBase(earnings);
  return specs.map((d) => {
    if (!('percentOfGross' in d)) return d;
    const f = d.percentOfGross;
    if (!Number.isFinite(f) || f < 0 || f > 1) {
      throw new Error(`Deduction ${d.code}: percentOfGross must be between 0 and 1 (0.06 means 6%), got ${f}.`);
    }
    return { code: d.code, category: d.category, amount: applyRate(base, f) };
  });
}

/** Everything about one check except its date, frequency and YTD, which the iterator supplies. */
export type PeriodTemplate = Omit<PaycheckInput, 'checkDate' | 'payFrequency' | 'ytd' | 'deductions'> & {
  deductions: readonly DeductionSpec[];
};

export interface PayPeriodsInput {
  /** First pay date. For weekly and biweekly it anchors the whole calendar. */
  firstCheckDate: string;
  payFrequency: IteratedFrequency;
  /** Calendar year to run. Defaults to the year of firstCheckDate. */
  year?: number;
  /** Stop after this many checks, e.g. to run just the next few. */
  maxChecks?: number;
  /**
   * The check's earnings, deductions, W-4 and state facts. A function is
   * called once per period, so pay can vary (a bonus in December, different
   * hours, a deduction that starts mid-year).
   */
  template: PeriodTemplate | ((period: { index: number; checkDate: string }) => PeriodTemplate);
  /** Garnishment orders applied to every check. */
  orders?: GarnishmentOrder[];
  protectedDeductionCodes?: string[];
  reductionOrder?: string[];
  /** YTD going in. Omit for a first check of the year. */
  startingYtd?: ExtendedYearToDate;
}

export interface PayPeriod {
  /** 0-based position in the year's run. */
  index: number;
  checkDate: string;
  result: PaycheckWithGarnishmentsResult;
  /** The year-to-date ledger AFTER this check: what the next check is calculated against. */
  ytd: ExtendedYearToDate;
}

/**
 * One employee's pay dates for a calendar year, one calculated check at a
 * time, with the year-to-date ledger carried forward between them (Social
 * Security and FUTA wage bases, 401(k) deferral limits, state unemployment
 * and every other tracker accumulateYtd() keeps). Lazy: nothing is calculated
 * until the next value is asked for, and `break`ing out stops the work.
 */
export function* payPeriods(input: PayPeriodsInput): Generator<PayPeriod, void, undefined> {
  let ytd = input.startingYtd ?? freshYearToDate();
  let index = 0;
  for (const checkDate of payDates(input.firstCheckDate, input.payFrequency, input.year)) {
    if (input.maxChecks !== undefined && index >= input.maxChecks) return;
    const template = typeof input.template === 'function' ? input.template({ index, checkDate }) : input.template;
    const result = calculatePaycheckWithGarnishments({
      paycheck: { ...template, deductions: resolveDeductions(template.deductions, template.earnings), checkDate, payFrequency: input.payFrequency, ytd },
      orders: input.orders ?? [],
      protectedDeductionCodes: input.protectedDeductionCodes,
      reductionOrder: input.reductionOrder,
    });
    // The ledger advances by what was actually taken, including any cut deduction.
    ytd = accumulateYtd(ytd, {
      checkDate,
      employmentCategory: template.employmentCategory,
      grossPay: result.paycheck.grossPay,
      taxLines: result.paycheck.taxes,
      electiveDeferrals: result.paycheck.electiveDeferrals,
      ytdAccruals: result.paycheck.ytdAccruals,
    });
    yield { index, checkDate, result, ytd };
    index++;
  }
}

export interface BatchItem {
  /** Caller's own identifier, echoed on the result. */
  id?: string;
  /** A full check; its deductions may be dollar amounts or percentage elections. */
  paycheck: Omit<PaycheckInput, 'deductions'> & { deductions: readonly DeductionSpec[] };
  orders?: GarnishmentOrder[];
  protectedDeductionCodes?: string[];
  reductionOrder?: string[];
}

export type BatchOutcome =
  | { index: number; id?: string; ok: true; result: PaycheckWithGarnishmentsResult }
  | { index: number; id?: string; ok: false; error: string };

/**
 * Many independent checks, calculated lazily in input order. The source can
 * itself be a generator (rows streamed from a file or a database cursor), and
 * only the item being worked on is held. One bad check yields an `ok: false`
 * outcome with the engine's own message and the run carries on, so a single
 * unsupported state or impossible date does not lose the rest of the batch.
 */
export function* paychecks(items: Iterable<BatchItem>): Generator<BatchOutcome, void, undefined> {
  let index = 0;
  for (const item of items) {
    try {
      const result = calculatePaycheckWithGarnishments({
        paycheck: { ...item.paycheck, deductions: resolveDeductions(item.paycheck.deductions, item.paycheck.earnings) },
        orders: item.orders ?? [],
        protectedDeductionCodes: item.protectedDeductionCodes,
        reductionOrder: item.reductionOrder,
      });
      yield { index, id: item.id, ok: true, result };
    } catch (err) {
      yield { index, id: item.id, ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    index++;
  }
}

/** Total of one tax line id across a run, in cents. Handy for "what was Social Security over the year". */
export function sumTaxLine(periods: Iterable<PayPeriod>, taxId: string): Cents {
  let total = 0;
  for (const p of periods) for (const t of p.result.paycheck.taxes) if (t.id === taxId) total += t.amount;
  return total;
}

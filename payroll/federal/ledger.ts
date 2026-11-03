import type { Cents } from '../../src/money.ts';
import type { PayRun, PayRunLine } from '../types.ts';

/**
 * The federal employment-tax LEDGER: what was withheld and owed, by the DATE
 * WAGES WERE PAID. Every federal return and deposit rule is expressed in these
 * terms - Form 941 Part 2 and Schedule B both say "enter your tax liability in
 * the [day] that corresponds to the dates you paid wages to your employees, not
 * the date payroll liabilities were accrued or deposits were made" - so this is
 * the single place pay runs are turned into federal figures and every other
 * federal module reads from it.
 *
 * Only APPROVED runs count. The check date is the date wages were paid.
 *
 * The tax-line ids are the ones src/taxes/federal.ts emits. Railroad Retirement
 * (US_RRTA_*, US_RUIA_ER) is a different return (Form CT-1) and is deliberately
 * not part of the Form 941 ledger.
 */

export interface DayLiability {
  /** ISO pay date (the run's check date). */
  date: string;
  /** Federal income tax withheld, including the flat supplemental-rate line. */
  federalIncomeTax: Cents;
  socialSecurityEmployee: Cents;
  socialSecurityEmployer: Cents;
  medicareEmployee: Cents;
  medicareEmployer: Cents;
  /** Additional Medicare Tax withheld - employee only, there is no employer share. */
  additionalMedicare: Cents;
  /** Everything above: the day's total federal employment-tax liability (Schedule B's daily figure). */
  total: Cents;
  /** Form 941 line 2 base: wages subject to federal income tax withholding. */
  wagesSubjectToIncomeTax: Cents;
  /** Line 5a/5b column 1 base: wages (and tips) subject to social security tax. */
  socialSecurityWages: Cents;
  /** Line 5c column 1 base. */
  medicareWages: Cents;
  /** Line 5d column 1 base. */
  additionalMedicareWages: Cents;
  /** Employees paid on this date. */
  employeeIds: string[];
}

function amountOf(line: PayRunLine, id: string): Cents {
  return line.taxLines.find((t) => t.id === id)?.amount ?? 0;
}

function wagesOf(line: PayRunLine, id: string): Cents {
  return line.taxLines.find((t) => t.id === id)?.taxableWages ?? 0;
}

function emptyDay(date: string): DayLiability {
  return {
    date,
    federalIncomeTax: 0,
    socialSecurityEmployee: 0,
    socialSecurityEmployer: 0,
    medicareEmployee: 0,
    medicareEmployer: 0,
    additionalMedicare: 0,
    total: 0,
    wagesSubjectToIncomeTax: 0,
    socialSecurityWages: 0,
    medicareWages: 0,
    additionalMedicareWages: 0,
    employeeIds: [],
  };
}

/**
 * Daily liabilities for one company between `start` and `end` (inclusive ISO
 * dates), one entry per pay date that had any, in date order. Several runs on
 * the same date (a regular run and an off-cycle bonus run) merge into one day,
 * because the IRS's unit is the day wages were paid.
 */
export function buildLedger(
  companyId: string,
  runs: readonly PayRun[],
  range: { start: string; end: string },
): DayLiability[] {
  const byDate = new Map<string, DayLiability>();
  for (const run of runs) {
    if (run.companyId !== companyId || run.status !== 'approved') continue;
    if (run.checkDate < range.start || run.checkDate > range.end) continue;
    const day = byDate.get(run.checkDate) ?? emptyDay(run.checkDate);
    for (const line of run.lines) {
      day.federalIncomeTax += amountOf(line, 'US_FIT') + amountOf(line, 'US_FIT_SUPP');
      day.socialSecurityEmployee += amountOf(line, 'US_SS_EE');
      day.socialSecurityEmployer += amountOf(line, 'US_SS_ER');
      day.medicareEmployee += amountOf(line, 'US_MED_EE');
      day.medicareEmployer += amountOf(line, 'US_MED_ER');
      day.additionalMedicare += amountOf(line, 'US_MED_ADDL');
      day.wagesSubjectToIncomeTax += wagesOf(line, 'US_FIT') + wagesOf(line, 'US_FIT_SUPP');
      // Social security / Medicare wages are read off the EMPLOYEE line only: the
      // employer line reports the identical figure and reading both would double it
      // (the same rule payroll/ytd.ts and filings.ts apply).
      day.socialSecurityWages += wagesOf(line, 'US_SS_EE');
      day.medicareWages += wagesOf(line, 'US_MED_EE');
      day.additionalMedicareWages += wagesOf(line, 'US_MED_ADDL');
      if (!day.employeeIds.includes(line.employeeId)) day.employeeIds.push(line.employeeId);
    }
    byDate.set(run.checkDate, day);
  }
  const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  for (const d of days) {
    d.total =
      d.federalIncomeTax +
      d.socialSecurityEmployee +
      d.socialSecurityEmployer +
      d.medicareEmployee +
      d.medicareEmployer +
      d.additionalMedicare;
  }
  return days;
}

export function sumDays<K extends keyof DayLiability>(days: readonly DayLiability[], key: K): Cents {
  let total = 0;
  for (const d of days) total += d[key] as unknown as number;
  return total;
}

/**
 * Fold dated adjustments (Form 941 lines 5f, 8, 9) into the daily ledger so
 * deposits are analysed on what is really owed. A Section 3121(q) notice "is
 * treated as accumulated by the employer on the 'Date of Notice and Demand'";
 * sick-pay and tip adjustments belong to the day they relate to. A date with
 * only an adjustment becomes a day with no wages. Returns a new, sorted list.
 */
export function mergeAdjustments(
  days: readonly DayLiability[],
  adjustments: readonly { date: string; amount: Cents }[],
): DayLiability[] {
  const byDate = new Map<string, DayLiability>(days.map((d) => [d.date, { ...d, employeeIds: [...d.employeeIds] }]));
  for (const a of adjustments) {
    const day = byDate.get(a.date) ?? emptyDay(a.date);
    day.total += a.amount;
    byDate.set(a.date, day);
  }
  return [...byDate.values()].sort((x, y) => x.date.localeCompare(y.date));
}

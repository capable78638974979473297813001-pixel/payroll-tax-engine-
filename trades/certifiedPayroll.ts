import type { Cents } from '../src/money.ts';
import type { PaycheckResult } from '../src/types.ts';
import type { ResolvedWorkedHours } from './prevailingWage.ts';
import type { Job } from './types.ts';

/**
 * Certified payroll (federal form WH-347) — the weekly report a contractor is
 * legally required to submit for every public-works contract, certifying
 * under the Copeland Act that each worker was paid the prevailing wage. This
 * is the single most valuable trades-specific artifact a self-serve payroll
 * product can produce: it is owed every week, it is where non-compliance
 * penalties come from, and assembling it by hand from timecards is the exact
 * drudgery the product exists to remove.
 *
 * This module ASSEMBLES the report structure from data the rest of the layer
 * already produced — the resolved, priced hours (trades/prevailingWage.ts)
 * and the week's paycheck (the tax engine's PaycheckResult) — it computes no
 * new wage or tax numbers. WH-347's own columns map cleanly onto what those
 * two already hold: per-day hours split straight/overtime, the classification
 * and rate of pay, gross earned on THIS project vs. all projects, the
 * deductions, and net wages paid.
 *
 * WEEKLY BY CONSTRUCTION. WH-347 is a weekly form and CWHSSA overtime is a
 * weekly quantity, so this takes ONE workweek. The deductions and net come
 * from a paycheck that covers that same week — exact for a weekly-frequency
 * employer (the common case in the trades). For a longer pay frequency the
 * caller is responsible for supplying a week-scoped paycheck; splitting a
 * biweekly cheque's per-period withholding back into two weeks is a real
 * computation this module does NOT fake, and that limitation is stated rather
 * than papered over.
 */

export interface CertifiedPayrollDayHours {
  date: string;
  straightHours: number;
  overtimeHours: number;
  /** Double-time hours (California and other daily-double-time states); 0 on a plain federal WH-347. */
  doubleTimeHours: number;
}

export interface CertifiedPayrollDeductions {
  /** Employee-side Social Security + Medicare (+ Additional Medicare). */
  ficaCents: Cents;
  federalWithholdingCents: Cents;
  stateTaxCents: Cents;
  localTaxCents: Cents;
  /** Everything else withheld from gross to net — benefit premiums, retirement deferrals, garnishments, other state employee levies. Computed as the residual of gross − net minus the named tax buckets, so the breakdown always reconciles to the paycheck exactly. */
  otherCents: Cents;
  totalCents: Cents;
}

export interface CertifiedPayrollRow {
  employeeId: string;
  classificationCode: string;
  dayHours: CertifiedPayrollDayHours[];
  totalStraightHours: number;
  totalOvertimeHours: number;
  totalDoubleTimeHours: number;
  /** The basic hourly rate paid (max of shop and prevailing) — the "rate of pay" the form lists. */
  baseHourlyRateCents: Cents;
  /** The hourly fringe listed alongside the base rate. */
  fringePerHourCents: Cents;
  /** Gross earned on THIS project this week — WH-347's split for a worker who was on several projects. */
  grossThisProjectCents: Cents;
  /**
   * Gross earned across ALL projects this week, from the week's paycheck.
   * Repeated on each of an employee's rows the way the form repeats it; the
   * deductions and net below are likewise the employee's whole-week figures,
   * shown once per employee on the rendered form.
   */
  grossAllProjectsCents: Cents;
  deductions: CertifiedPayrollDeductions;
  netPayCents: Cents;
}

export interface StatementOfCompliance {
  /** Section 4(a): fringe benefits paid to approved plans, funds, or programs. */
  fringePaidToPlans: boolean;
  /** Section 4(b)/(c): fringe benefits paid in cash. */
  fringePaidInCash: boolean;
  /** Classifications where any fringe was paid in cash rather than into a plan — the exceptions a filer lists in 4(c). */
  exceptions: string[];
}

export interface CertifiedPayrollReport {
  jobId: string;
  projectName?: string;
  contractNumber?: string;
  workLocality?: string;
  workState: string;
  weekStart: string;
  /** The week-ending date WH-347 is headed with (weekStart + 6 days). */
  weekEndingDate: string;
  rows: CertifiedPayrollRow[];
  statementOfCompliance: StatementOfCompliance;
}

/** One employee's inputs for a certified-payroll week: their resolved entries for the week (all jobs — filtered to this report's job inside) and the paycheck covering the week (for deductions and net). */
export interface CertifiedPayrollEmployeeInput {
  employeeId: string;
  entries: readonly ResolvedWorkedHours[];
  weeklyPaycheck: PaycheckResult;
}

function isFica(id: string): boolean {
  return /SS|MED/i.test(id);
}

function isIncomeTax(id: string, name: string): boolean {
  return /FIT|SIT|_IT\b|income tax/i.test(id) || /income tax/i.test(name);
}

/** Break a week's paycheck into the WH-347 deduction buckets. `other` is the residual so the buckets always sum to the paycheck's real gross-to-net delta, even for a tax line this mapping doesn't recognize. */
function deductionsFromPaycheck(paycheck: PaycheckResult): CertifiedPayrollDeductions {
  let fica = 0;
  let federalWithholding = 0;
  let stateTax = 0;
  let localTax = 0;
  for (const t of paycheck.taxes) {
    if (t.payer !== 'employee') continue;
    if (t.jurisdiction === 'federal') {
      if (isFica(t.id)) fica += t.amount;
      else federalWithholding += t.amount;
    } else if (t.jurisdiction === 'state') {
      if (isIncomeTax(t.id, t.name)) stateTax += t.amount;
      // non-income state employee levies (SDI/PFL/…) fall into `other` via the residual
    } else if (t.jurisdiction === 'local') {
      localTax += t.amount;
    }
  }
  const total = paycheck.grossPay - paycheck.netPay;
  const other = total - fica - federalWithholding - stateTax - localTax;
  return {
    ficaCents: fica,
    federalWithholdingCents: federalWithholding,
    stateTaxCents: stateTax,
    localTaxCents: localTax,
    otherCents: other,
    totalCents: total,
  };
}

function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Build the WH-347 report for one job and one workweek. Rows are per
 * (employee, classification) — a worker who performed two classifications on
 * the job gets a line for each, as the form requires. An employee with no
 * hours on this job in the week is skipped.
 */
export function buildCertifiedPayroll(
  job: Job,
  weekStart: string,
  employeeInputs: readonly CertifiedPayrollEmployeeInput[],
): CertifiedPayrollReport {
  const rows: CertifiedPayrollRow[] = [];
  let anyToPlans = false;
  let anyInCash = false;
  const exceptions = new Set<string>();

  for (const emp of employeeInputs) {
    const onThisJob = emp.entries.filter((e) => e.jobId === job.id);
    if (onThisJob.length === 0) continue;

    const deductions = deductionsFromPaycheck(emp.weeklyPaycheck);

    // One row per classification the worker performed on this job.
    const byClassification = new Map<string, ResolvedWorkedHours[]>();
    for (const e of onThisJob) {
      const list = byClassification.get(e.classificationCode);
      if (list) list.push(e);
      else byClassification.set(e.classificationCode, [e]);
    }

    for (const [classificationCode, list] of byClassification) {
      const byDate = new Map<string, CertifiedPayrollDayHours>();
      for (const e of list) {
        const d = byDate.get(e.date) ?? { date: e.date, straightHours: 0, overtimeHours: 0, doubleTimeHours: 0 };
        d.straightHours += e.straightHours;
        d.overtimeHours += e.overtimeHours;
        d.doubleTimeHours += e.doubleTimeHours;
        byDate.set(e.date, d);
      }
      const dayHours = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      const totalStraightHours = list.reduce((s, e) => s + e.straightHours, 0);
      const totalOvertimeHours = list.reduce((s, e) => s + e.overtimeHours, 0);
      const totalDoubleTimeHours = list.reduce((s, e) => s + e.doubleTimeHours, 0);
      const grossThisProject = list.reduce((s, e) => s + e.grossCashCents, 0);
      // Representative rate: the entry carrying the most hours (rates are
      // uniform within a classification-week except across an effective-date
      // change, where the majority rate is the fair one to print).
      const representative = list.reduce((best, e) =>
        e.straightHours + e.overtimeHours + e.doubleTimeHours >
        best.straightHours + best.overtimeHours + best.doubleTimeHours
          ? e
          : best,
      );

      if (list.some((e) => e.creditedFringePerHourCents > 0)) anyToPlans = true;
      if (list.some((e) => e.cashFringePerHourCents > 0)) {
        anyInCash = true;
        exceptions.add(classificationCode);
      }

      rows.push({
        employeeId: emp.employeeId,
        classificationCode,
        dayHours,
        totalStraightHours,
        totalOvertimeHours,
        totalDoubleTimeHours,
        baseHourlyRateCents: representative.effectiveBaseRateCents,
        fringePerHourCents: representative.fringeObligationPerHourCents,
        grossThisProjectCents: grossThisProject,
        grossAllProjectsCents: emp.weeklyPaycheck.grossPay,
        deductions,
        netPayCents: emp.weeklyPaycheck.netPay,
      });
    }
  }

  return {
    jobId: job.id,
    projectName: job.prevailingWage?.projectName,
    contractNumber: job.prevailingWage?.contractNumber,
    workLocality: job.workLocality,
    workState: job.workState,
    weekStart,
    weekEndingDate: addDays(weekStart, 6),
    rows,
    statementOfCompliance: {
      fringePaidToPlans: anyToPlans,
      fringePaidInCash: anyInCash,
      exceptions: [...exceptions].sort(),
    },
  };
}

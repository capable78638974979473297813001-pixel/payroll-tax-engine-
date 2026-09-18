import type { Cents } from '../src/money.ts';
import type { PaycheckResult } from '../src/types.ts';
import {
  deductionsFromPaycheck,
  type CertifiedPayrollDayHours,
  type CertifiedPayrollDeductions,
} from './certifiedPayroll.ts';
import type { ResolvedWorkedHours } from './prevailingWage.ts';
import type { FringeCredit, Job } from './types.ts';

/**
 * California DIR certified payroll — the state counterpart to the federal
 * WH-347 (trades/certifiedPayroll.ts). A public-works contractor in
 * California files with the Department of Industrial Relations, not just the
 * federal awarding agency, and the DIR record (form A-1-131 / the eCPR
 * system) differs from WH-347 in three ways this module captures:
 *
 *  1. DAILY DOUBLE TIME is a first-class column. California pays double time
 *     past 12 hours in a day and on the 7th consecutive day, so the report
 *     must show straight / overtime / double-time hours per day — which the
 *     resolved entries now carry (see the California overlay in
 *     trades/prevailingWage.ts).
 *  2. FRINGE IS ITEMIZED PER PLAN. Where WH-347 asks only whether fringe was
 *     paid to plans or in cash, the DIR form wants the employer's hourly
 *     contribution to EACH plan (Health & Welfare, Pension, Vacation/Holiday,
 *     Training, …) listed separately.
 *  3. DIR HEADER FIELDS. The record is keyed to the contractor's DIR
 *     registration number and the awarding body / DIR project id — all
 *     caller-supplied identifiers, opaque to this layer, never guessed.
 *
 * Like the WH-347 builder, this ASSEMBLES the report from data already
 * computed (resolved hours + the week's paycheck); it produces the eCPR's
 * STRUCTURE, not its XML wire format, the same boundary the federal report
 * draws against the printed PDF. And it carries the same weekly requirement:
 * the deductions and net are one workweek's, exact for a weekly-frequency
 * employer.
 */

/** The employer's hourly contribution to one named fringe plan, as the DIR form itemizes it. */
export interface CaliforniaFringeContribution {
  plan: string;
  ratePerHourCents: Cents;
}

export interface CaliforniaCertifiedPayrollRow {
  employeeId: string;
  classificationCode: string;
  dayHours: CertifiedPayrollDayHours[];
  totalStraightHours: number;
  totalOvertimeHours: number;
  totalDoubleTimeHours: number;
  baseHourlyRateCents: Cents;
  /** Employer plan contributions itemized per plan (empty when the worker has no plan contributions and fringe was paid entirely in cash). */
  fringeContributions: CaliforniaFringeContribution[];
  /** Fringe paid to the worker as cash rather than into a plan, per hour. */
  cashFringePerHourCents: Cents;
  grossThisProjectCents: Cents;
  grossAllProjectsCents: Cents;
  deductions: CertifiedPayrollDeductions;
  netPayCents: Cents;
}

/** DIR-specific identifiers for the report header — all caller-supplied. */
export interface CaliforniaCertifiedPayrollHeader {
  /** The contractor's DIR public-works contractor registration number. */
  contractorDirRegistrationNumber?: string;
  /** The DIR project id (from the awarding body's PWC-100 registration). */
  dirProjectId?: string;
  awardingBody?: string;
}

export interface CaliforniaCertifiedPayrollReport {
  jobId: string;
  projectName?: string;
  contractNumber?: string;
  contractorDirRegistrationNumber?: string;
  dirProjectId?: string;
  awardingBody?: string;
  workLocality?: string;
  workState: string;
  weekStart: string;
  weekEndingDate: string;
  rows: CaliforniaCertifiedPayrollRow[];
}

export interface CaliforniaCertifiedPayrollEmployeeInput {
  employeeId: string;
  entries: readonly ResolvedWorkedHours[];
  weeklyPaycheck: PaycheckResult;
  /**
   * The employer's per-plan fringe contributions for this worker (a
   * TradeWorkerProfile's fringeCredits). Used to itemize the fringe column;
   * when omitted, the report shows the total plan contribution from the
   * resolved entries as a single unnamed line rather than a per-plan split.
   */
  fringeContributions?: readonly FringeCredit[];
}

function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Build the California DIR certified-payroll report for one job and one
 * workweek. Rows are per (employee, classification), same as the federal
 * form; an employee with no hours on the job that week is skipped.
 */
export function buildCaliforniaCertifiedPayroll(
  job: Job,
  weekStart: string,
  employeeInputs: readonly CaliforniaCertifiedPayrollEmployeeInput[],
  header: CaliforniaCertifiedPayrollHeader = {},
): CaliforniaCertifiedPayrollReport {
  const rows: CaliforniaCertifiedPayrollRow[] = [];

  for (const emp of employeeInputs) {
    const onThisJob = emp.entries.filter((e) => e.jobId === job.id);
    if (onThisJob.length === 0) continue;

    const deductions = deductionsFromPaycheck(emp.weeklyPaycheck);

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
      const representative = list.reduce((best, e) =>
        e.straightHours + e.overtimeHours + e.doubleTimeHours >
        best.straightHours + best.overtimeHours + best.doubleTimeHours
          ? e
          : best,
      );

      const fringeContributions: CaliforniaFringeContribution[] = emp.fringeContributions
        ? emp.fringeContributions.map((c) => ({ plan: c.plan, ratePerHourCents: c.ratePerHourCents }))
        : representative.creditedFringePerHourCents > 0
          ? [{ plan: 'Fringe (plan)', ratePerHourCents: representative.creditedFringePerHourCents }]
          : [];

      rows.push({
        employeeId: emp.employeeId,
        classificationCode,
        dayHours,
        totalStraightHours: list.reduce((s, e) => s + e.straightHours, 0),
        totalOvertimeHours: list.reduce((s, e) => s + e.overtimeHours, 0),
        totalDoubleTimeHours: list.reduce((s, e) => s + e.doubleTimeHours, 0),
        baseHourlyRateCents: representative.effectiveBaseRateCents,
        fringeContributions,
        cashFringePerHourCents: representative.cashFringePerHourCents,
        grossThisProjectCents: list.reduce((s, e) => s + e.grossCashCents, 0),
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
    contractorDirRegistrationNumber: header.contractorDirRegistrationNumber,
    dirProjectId: header.dirProjectId,
    awardingBody: header.awardingBody,
    workLocality: job.workLocality,
    workState: job.workState,
    weekStart,
    weekEndingDate: addDays(weekStart, 6),
    rows,
  };
}

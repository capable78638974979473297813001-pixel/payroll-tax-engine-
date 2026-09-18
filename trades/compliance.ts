import { roundHalfUp, type Cents } from '../src/money.ts';
import type { PayRun } from '../payroll/types.ts';
import {
  checkApprenticeRatio,
  type ApprenticeRatioDayFinding,
  type ApprenticeshipProgram,
} from './apprenticeRatio.ts';
import {
  checkFringeAnnualization,
  type FringeAnnualizationFinding,
  type FringePlanContribution,
} from './fringeAnnualization.ts';
import type { PrevailingWageAdjustment, ResolvedWorkedHours } from './prevailingWage.ts';
import type { TradesPayRunResult } from './payRun.ts';

/**
 * The consolidated compliance report for one trades pay run — the capstone
 * that runs every wage-compliance check the layer offers and aggregates them
 * into a single object a contractor (or an auditor) reads in one place.
 *
 * It draws a deliberate line between two kinds of number:
 *
 *  - AMOUNTS ALREADY PAID. The prevailing-wage adjustments are what the run
 *    ALREADY paid the crew to stay compliant (the resolver made them whole);
 *    they are reported for cost visibility, not as a liability.
 *  - UNCORRECTED EXPOSURE. Apprentice-ratio make-up, fringe over-claim, and
 *    minimum-wage shortfalls are underpayments the run did NOT self-correct —
 *    real back-wage liability. Only these roll into totalBackWageExposure.
 *
 * Conflating the two is exactly the mistake this report exists to prevent: a
 * contractor who reads "compliance adjustments: $800" as a liability panics
 * over money already in the workers' cheques, while the $150 of apprentice-
 * ratio underpayment that IS a liability hides in the noise.
 *
 * The apprentice-ratio and fringe-annualization checks need facts the pay run
 * itself doesn't carry (a registered program's ratio, a plan's underlying
 * contributions and the worker's total annual hours), so those are supplied
 * per report; a report requested with neither still returns the prevailing-
 * wage and minimum-wage picture the run always has.
 */

export interface TradesComplianceProgramInput {
  program: ApprenticeshipProgram;
  /** The journeyworker prevailing total (base + fringe) per hour, from the determination — needed to price over-ratio make-up. */
  journeyworkerRateCents: Cents;
  /** Restrict the ratio check to these jobs; defaults to every job the program's classifications appear on in this run. */
  jobIds?: string[];
}

export interface TradesComplianceFringeAudit {
  employeeId: string;
  contributions: FringePlanContribution[];
  /** The worker's TOTAL annual hours (public + private) — the annualization divisor. */
  totalAnnualHoursWorked: number;
}

export interface TradesComplianceInput {
  run: TradesPayRunResult;
  apprenticePrograms?: TradesComplianceProgramInput[];
  fringeAudits?: TradesComplianceFringeAudit[];
}

export interface EmployeePrevailingWageAdjustment extends PrevailingWageAdjustment {
  employeeId: string;
}

export interface EmployeeFringeAnnualizationFinding extends FringeAnnualizationFinding {
  employeeId: string;
  /** The worker's Davis-Bacon (public-job) hours this run — what the per-hour over-claim is owed on. */
  davisBaconHours: number;
  /** overClaimedPerHour × davisBaconHours — the dollar back-wage exposure for this plan this run. */
  dollarExposureCents: Cents;
}

export interface TradesComplianceReport {
  companyId: string;
  periodStart: string;
  periodEnd: string;
  checkDate: string;
  /** Already-paid prevailing-wage make-up, per employee — cost visibility, NOT a liability. */
  prevailingWageAdjustments: EmployeePrevailingWageAdjustment[];
  apprenticeRatioFindings: ApprenticeRatioDayFinding[];
  fringeAnnualizationFindings: EmployeeFringeAnnualizationFinding[];
  minimumWageIssues: PayRun['minimumWageIssues'];
  /** Uncorrected underpayment only: apprentice-ratio make-up + fringe over-claim dollars + minimum-wage shortfalls. Prevailing-wage adjustments are excluded (already paid). */
  totalBackWageExposureCents: Cents;
}

/** All resolved entries across the crew — the crew-wide view the apprentice-ratio check groups by job and day. */
function allResolvedEntries(run: TradesPayRunResult): ResolvedWorkedHours[] {
  return run.employees.flatMap((er) => er.prevailingWage?.weeks.flatMap((w) => w.entries) ?? []);
}

/** An employee's Davis-Bacon (prevailing-wage) hours this run — the hours a fringe over-claim is owed on. */
function davisBaconHoursFor(run: TradesPayRunResult, employeeId: string): number {
  const er = run.employees.find((e) => e.employee.id === employeeId);
  if (!er?.prevailingWage) return 0;
  let hours = 0;
  for (const week of er.prevailingWage.weeks) {
    for (const e of week.entries) {
      if (e.isPrevailingWage) hours += e.straightHours + e.overtimeHours + e.doubleTimeHours;
    }
  }
  return hours;
}

export function buildTradesComplianceReport(input: TradesComplianceInput): TradesComplianceReport {
  const { run } = input;

  const prevailingWageAdjustments: EmployeePrevailingWageAdjustment[] = run.employees.flatMap((er) =>
    (er.prevailingWage?.adjustments ?? []).map((a) => ({ ...a, employeeId: er.employee.id })),
  );

  // Apprentice ratio, per supplied program, per covered job.
  const entries = allResolvedEntries(run);
  const apprenticeRatioFindings: ApprenticeRatioDayFinding[] = [];
  for (const p of input.apprenticePrograms ?? []) {
    const relevantCodes = new Set([p.program.journeyworkerClassificationCode, ...p.program.apprenticeClassificationCodes]);
    const jobIds =
      p.jobIds ?? [...new Set(entries.filter((e) => relevantCodes.has(e.classificationCode)).map((e) => e.jobId))];
    for (const jobId of jobIds) {
      apprenticeRatioFindings.push(...checkApprenticeRatio(jobId, entries, p.program, p.journeyworkerRateCents));
    }
  }

  // Fringe annualization, per supplied audit, against the worker's own claimed credits.
  const fringeAnnualizationFindings: EmployeeFringeAnnualizationFinding[] = [];
  for (const audit of input.fringeAudits ?? []) {
    const er = run.employees.find((e) => e.employee.id === audit.employeeId);
    const claimed = er?.profile?.fringeCredits ?? [];
    const dbaHours = davisBaconHoursFor(run, audit.employeeId);
    for (const finding of checkFringeAnnualization(claimed, audit.contributions, audit.totalAnnualHoursWorked)) {
      fringeAnnualizationFindings.push({
        ...finding,
        employeeId: audit.employeeId,
        davisBaconHours: dbaHours,
        dollarExposureCents: roundHalfUp(finding.overClaimedPerHourCents * dbaHours),
      });
    }
  }

  const minimumWageIssues = run.run.minimumWageIssues;

  const totalBackWageExposureCents =
    apprenticeRatioFindings.reduce((s, f) => s + f.additionalWagesOwedCents, 0) +
    fringeAnnualizationFindings.reduce((s, f) => s + f.dollarExposureCents, 0) +
    minimumWageIssues.reduce((s, m) => s + m.shortfallCents, 0);

  return {
    companyId: run.run.companyId,
    periodStart: run.run.periodStart,
    periodEnd: run.run.periodEnd,
    checkDate: run.run.checkDate,
    prevailingWageAdjustments,
    apprenticeRatioFindings,
    fringeAnnualizationFindings,
    minimumWageIssues,
    totalBackWageExposureCents,
  };
}

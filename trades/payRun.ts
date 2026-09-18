import { randomUUID } from 'node:crypto';
import { computeEmployeePaycheck, type EmployeePaycheckComputation } from '../payroll/engine.ts';
import { checkMinimumWageComplianceForCompany } from '../payroll/compliance.ts';
import { activeEmployeesFor, voidPayRun } from '../payroll/run.ts';
import type { Company, Employee, PayRun, PayRunLine } from '../payroll/types.ts';
import { buildCertifiedPayroll, type CertifiedPayrollEmployeeInput, type CertifiedPayrollReport } from './certifiedPayroll.ts';
import { computeJobCosts, type EmployeeJobCostInput, type JobCost, type WorkersCompRating } from './jobCosting.ts';
import { workweekStart } from './prevailingWage.ts';
import { runTradesPayPeriod, type TradesPayPeriodResult } from './run.ts';
import type { Job, TradeWorkerProfile, WageDetermination, WorkedHours } from './types.ts';

/**
 * The whole-crew pay run for a trades company — the "run payroll" button for
 * a plumbing shop with a field crew on job sites and, usually, a salaried
 * person or two in the office. It is the trades counterpart to
 * payroll/run.ts's draftPayRun: it decides who is paid how, computes every
 * line, and produces a PayRun that flows through the SAME approve/void/YTD
 * lifecycle — approvePayRun() only ever reads line.grossPay and line.taxLines
 * (see its own doc comment), both of which a prevailing-wage line carries
 * exactly like an ordinary one, so nothing downstream needs to know a line
 * came from a wage determination.
 *
 * Mixed crews are the point. A worker with reported hours is priced through
 * the prevailing-wage resolver (trades/run.ts); an employee with no hours in
 * the period — the salaried office manager — is paid by the ordinary engine
 * path, unchanged. One run covers both.
 *
 * The run also hands back the per-employee prevailing-wage detail, so the two
 * artifacts a public-works contractor owes — burdened job cost and the weekly
 * WH-347 — are built from the same computation the cheques came from, never a
 * re-derivation that could drift from what was actually paid.
 */

export interface TradesPayRunInput {
  company: Company;
  employees: readonly Employee[];
  /** Trades profiles by employee; an employee without one falls back to their payType rate and makes no fringe-plan contributions. */
  profiles?: readonly TradeWorkerProfile[];
  periodStart: string;
  periodEnd: string;
  checkDate: string;
  /** Every reported hour for the period, all employees — filtered to the period window and grouped per employee here. */
  workedHours: readonly WorkedHours[];
  jobs: readonly Job[];
  determinations: readonly WageDetermination[];
  /** ISO weekday the workweek starts on (0 = Sunday default) — the boundary weekly overtime is counted against. */
  weekStartsOn?: number;
}

export interface TradesEmployeeRun {
  employee: Employee;
  profile?: TradeWorkerProfile;
  /** The prevailing-wage detail for an employee paid off reported hours; null for one paid by the ordinary path (salaried, or no hours this period). */
  prevailingWage: TradesPayPeriodResult | null;
  computation: EmployeePaycheckComputation;
}

export interface TradesPayRunResult {
  run: PayRun;
  employees: TradesEmployeeRun[];
  /** The company this run was drafted for — carried so the period rollups can resolve the fallback work state and the weekly-frequency requirement without being handed it again. */
  company: Company;
  /** The jobs in play this run — carried so job costing and certified payroll can resolve each job's class code, name, and header without a second lookup. */
  jobs: readonly Job[];
}

/**
 * Draft a crew-wide trades pay run. DRAFT, exactly like payroll/run.ts —
 * nothing is committed to YTD until the returned PayRun is passed to
 * approvePayRun(); drafting and re-drafting after a corrected timecard is
 * free.
 */
export function draftTradesPayRun(input: TradesPayRunInput): TradesPayRunResult {
  const { company, employees, periodStart, periodEnd, checkDate } = input;
  const active = activeEmployeesFor(company, employees, checkDate);
  const profilesById = new Map((input.profiles ?? []).map((p) => [p.employeeId, p]));

  // Reported hours grouped per employee, defensively clamped to the period
  // window so a stray out-of-period row can never leak into a run.
  const hoursByEmployee = new Map<string, WorkedHours[]>();
  for (const w of input.workedHours) {
    if (w.date < periodStart || w.date > periodEnd) continue;
    const list = hoursByEmployee.get(w.employeeId);
    if (list) list.push(w);
    else hoursByEmployee.set(w.employeeId, [w]);
  }

  const employeeRuns: TradesEmployeeRun[] = [];
  const lines: PayRunLine[] = [];

  for (const employee of active) {
    const profile = profilesById.get(employee.id);
    const hours = hoursByEmployee.get(employee.id) ?? [];

    if (hours.length > 0) {
      const result = runTradesPayPeriod({
        company,
        employee,
        profile,
        checkDate,
        workedHours: hours,
        jobs: input.jobs,
        determinations: input.determinations,
        weekStartsOn: input.weekStartsOn,
      });
      employeeRuns.push({ employee, profile, prevailingWage: result, computation: result.computation });
      lines.push(result.computation.line);
    } else {
      // No reported hours → the ordinary engine path (a salaried employee is
      // paid their period slice; an hourly one with no hours is a $0 line).
      const computation = computeEmployeePaycheck(company, employee, checkDate);
      employeeRuns.push({ employee, profile, prevailingWage: null, computation });
      lines.push(computation.line);
    }
  }

  const run: PayRun = {
    id: randomUUID(),
    companyId: company.id,
    periodStart,
    periodEnd,
    checkDate,
    status: 'draft',
    lines,
    createdAt: new Date().toISOString(),
    minimumWageIssues: checkMinimumWageComplianceForCompany(company, active, checkDate),
  };

  return { run, employees: employeeRuns, company, jobs: input.jobs };
}

/**
 * Recompute a DRAFT trades run in place from fresh input — a corrected
 * timecard came in, a determination was updated — keeping the run's id and
 * createdAt. Mirrors payroll/run.ts's recalculatePayRun and its guard: a run
 * that is already approved or voided is what got signed off, and its numbers
 * never change under it, so this throws rather than silently recompute one.
 */
export function recalculateTradesPayRun(run: PayRun, input: TradesPayRunInput): TradesPayRunResult {
  if (run.status !== 'draft') {
    throw new Error(`Cannot recalculate a ${run.status} trades pay run — only a draft run's numbers may change.`);
  }
  const fresh = draftTradesPayRun(input);
  return { ...fresh, run: { ...fresh.run, id: run.id, createdAt: run.createdAt } };
}

/**
 * Discard a draft trades run. Re-exported from payroll/run.ts unchanged — a
 * trades run IS a PayRun, and voiding is a pure status flip that never touched
 * YTD (nothing was committed until approval), so there is nothing trades-
 * specific to add. Approving is likewise the ordinary approvePayRun().
 */
export { voidPayRun };

/**
 * Burdened cost per job across the whole run, from the crew's resolved hours.
 * Only employees who actually worked a job contribute; the salaried office
 * line is not job labor and is left out (its cost belongs to overhead, not to
 * a job's direct cost).
 */
export function jobCostsForPeriod(
  result: TradesPayRunResult,
  wcRatingsByClassCode: ReadonlyMap<string, WorkersCompRating>,
): JobCost[] {
  const jobsById = new Map(result.jobs.map((j) => [j.id, j]));
  const inputs: EmployeeJobCostInput[] = [];

  for (const er of result.employees) {
    if (!er.prevailingWage) continue;
    const entries = er.prevailingWage.weeks.flatMap((w) => w.entries);
    if (entries.length === 0) continue;
    inputs.push({
      employeeId: er.employee.id,
      entries,
      employerTaxTotalCents: er.computation.result.employerTaxTotal,
      defaultWorkersCompClassCode: er.employee.workersCompClassCode,
      // The company home state is the fallback work state, so the overtime-
      // premium exclusion resolves against a concrete state.
      workState: er.employee.workState?.code ?? result.company.homeState,
    });
  }
  return computeJobCosts(inputs, jobsById, wcRatingsByClassCode);
}

/**
 * The weekly WH-347 certified-payroll reports the run owes — one per public
 * job per workweek. REQUIRES a weekly pay frequency: WH-347 is a weekly form
 * and its deductions/net must be a single week's, which only equals the run's
 * paycheck when the pay period IS one workweek. Rather than emit a report with
 * a longer period's withholding mislabelled as a week's — a false compliance
 * document — this refuses a non-weekly frequency and says why.
 */
export function certifiedPayrollForPeriod(
  result: TradesPayRunResult,
  weekStartsOn = 0,
): CertifiedPayrollReport[] {
  if (result.company.paySchedule.frequency !== 'weekly') {
    throw new Error(
      `Certified payroll requires a weekly pay frequency (this company is ${result.company.paySchedule.frequency}). ` +
        `WH-347 deductions and net are a single workweek's; on a longer frequency they cannot be taken from the ` +
        `period paycheck without misstating them. Run public-works payroll weekly, or supply per-week paychecks.`,
    );
  }

  const jobsByWeek = new Map<string, Map<string, CertifiedPayrollEmployeeInput[]>>();
  const publicJobs = new Map<string, Job>();

  for (const er of result.employees) {
    if (!er.prevailingWage) continue;
    for (const week of er.prevailingWage.weeks) {
      if (week.entries.length === 0) continue;
      const canonicalWeekStart = workweekStart(week.entries[0].date, weekStartsOn);
      // Which public jobs this employee touched this week.
      const jobsThisWeek = new Set(week.entries.filter((e) => e.isPrevailingWage).map((e) => e.jobId));
      if (jobsThisWeek.size === 0) continue;

      let byJob = jobsByWeek.get(canonicalWeekStart);
      if (!byJob) {
        byJob = new Map();
        jobsByWeek.set(canonicalWeekStart, byJob);
      }
      for (const jobId of jobsThisWeek) {
        const list = byJob.get(jobId);
        const empInput: CertifiedPayrollEmployeeInput = {
          employeeId: er.employee.id,
          entries: week.entries,
          weeklyPaycheck: er.computation.result,
        };
        if (list) list.push(empInput);
        else byJob.set(jobId, [empInput]);
      }
    }
  }

  const jobDefs = new Map(result.jobs.map((j) => [j.id, j]));
  const reports: CertifiedPayrollReport[] = [];
  for (const [weekStart, byJob] of [...jobsByWeek.entries()].sort()) {
    for (const [jobId, empInputs] of byJob) {
      const job = jobDefs.get(jobId);
      if (!job) continue;
      reports.push(buildCertifiedPayroll(job, weekStart, empInputs));
    }
  }
  return reports;
}

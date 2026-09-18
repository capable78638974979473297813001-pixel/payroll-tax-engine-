import { computeEmployeePaycheck, type EmployeePaycheckComputation } from '../payroll/engine.ts';
import { overtimeRuleForState, type OvertimeRule } from '../payroll/timeAndAttendance.ts';
import type { Company, Employee } from '../payroll/types.ts';
import type { Earning } from '../src/types.ts';
import {
  combineWeeklyEarnings,
  groupIntoWorkweeks,
  resolvePrevailingWageWeek,
  type PrevailingWageAdjustment,
  type PrevailingWageWeek,
} from './prevailingWage.ts';
import { indexDeterminations } from './wageDetermination.ts';
import type { Job, TradeWorkerProfile, WageDetermination, WorkedHours } from './types.ts';

/**
 * The self-serve entry point: one call takes everything a trades employer
 * knows about a worker's pay period — who they are, the jobs they worked, the
 * hours by classification, and the determinations in play — and returns the
 * finished paycheck plus the compliance picture.
 *
 * It is deliberately thin: it groups the period into workweeks (overtime is
 * weekly), prices each week (trades/prevailingWage.ts), combines the weeks'
 * earnings, and hands them to the SAME payroll engine every other pay run
 * uses via its earningsOverride seam — so tax withholding, garnishments and
 * direct-deposit splitting all run once, in one place, on prevailing-wage
 * earnings they never had to be taught about. Everything trades-specific
 * lives in the layer below this; this function just wires it to the engine.
 */

export interface TradesPayPeriodInput {
  company: Company;
  employee: Employee;
  profile?: TradeWorkerProfile;
  checkDate: string;
  /** The whole pay period's hours (any number of workweeks) — grouped into weeks here. */
  workedHours: readonly WorkedHours[];
  jobs: readonly Job[];
  determinations: readonly WageDetermination[];
  /** The ISO weekday the employer's workweek starts on (0 = Sunday default). */
  weekStartsOn?: number;
  /**
   * The overtime rule to classify hours under. Defaults to the rule for the
   * worker's work state (California's daily 8/12-hour and 7th-consecutive-day
   * double time; the federal weekly-40 rule everywhere else), so a California
   * crew gets daily overtime automatically. Pass one explicitly to override.
   */
  overtimeRule?: OvertimeRule;
}

export interface TradesPayPeriodResult {
  /** Each priced workweek in the period, ordered by week start — the detail certified payroll and job costing build on. */
  weeks: PrevailingWageWeek[];
  /** The combined earnings fed to the tax engine for the whole period. */
  earnings: Earning[];
  /** The full paycheck: tax engine result, garnishments, direct-deposit allocations, and the PayRunLine — exactly what payroll/engine.ts returns for any employee. */
  computation: EmployeePaycheckComputation;
  /** Every prevailing-wage adjustment across the period, flattened — what each public job cost above the worker's shop rate. */
  adjustments: PrevailingWageAdjustment[];
}

export function runTradesPayPeriod(input: TradesPayPeriodInput): TradesPayPeriodResult {
  const jobsById = new Map(input.jobs.map((j) => [j.id, j]));
  const determinationsById = indexDeterminations(input.determinations);
  // The base rate for a classification the worker profile doesn't price. For a
  // salaried worker this is their hourly-equivalent (annual ÷ 2080 = 40h×52wk)
  // rather than zero — so a salaried foreman who logs covered hours is priced
  // at a real rate (and, on a public job, still bumped up to prevailing), never
  // silently paid nothing.
  const fallbackBaseRateCents =
    input.employee.payType.kind === 'hourly'
      ? input.employee.payType.hourlyRate
      : Math.round(input.employee.payType.annualSalary / 2080);
  const workState = input.employee.workState?.code ?? input.company.homeState;
  const overtimeRule = input.overtimeRule ?? overtimeRuleForState(workState);

  const workweeks = groupIntoWorkweeks(input.workedHours, input.weekStartsOn ?? 0);
  const weeks: PrevailingWageWeek[] = [...workweeks.keys()]
    .sort()
    .map((weekKey) =>
      resolvePrevailingWageWeek({
        employeeId: input.employee.id,
        workedHours: workweeks.get(weekKey)!,
        jobsById,
        determinationsById,
        profile: input.profile,
        fallbackBaseRateCents,
        overtimeRule,
      }),
    );

  const earnings = combineWeeklyEarnings(weeks);
  const computation = computeEmployeePaycheck(input.company, input.employee, input.checkDate, undefined, earnings);
  const adjustments = weeks.flatMap((w) => w.adjustments);

  return { weeks, earnings, computation, adjustments };
}

/**
 * Trades payroll — a self-serve payroll layer for the specialized
 * construction trades (plumbing, electrical, HVAC, sheet metal, pipefitting),
 * built ON TOP of the tax engine (src/) and the general payroll layer
 * (payroll/), not beside them.
 *
 * What it adds is the thing those trades live and die on and that ordinary
 * payroll has no concept of: PREVAILING WAGE and CERTIFIED PAYROLL for
 * public-works contracts. Given a worker's week of hours across several jobs
 * and classifications, it prices them against the governing wage
 * determinations (effective-dated, cash-or-plan fringe, weekly CWHSSA
 * overtime on a weighted-average regular rate), feeds the result through the
 * existing engine's earningsOverride seam so tax/garnishment/direct-deposit
 * run unchanged, then produces the two artifacts a trades contractor actually
 * needs: burdened cost per job (to bid and to know if a job made money) and
 * the weekly WH-347 certified-payroll report (which is legally owed).
 *
 * See each module's own header for the rules and sourcing; the wage-
 * determination and workers'-comp-rate datasets are caller-supplied, never
 * guessed, the same discipline the rest of this project holds to.
 */

export type {
  ConstructionType,
  FringeCredit,
  Job,
  TradeClassification,
  TradeWorkerProfile,
  WageDetermination,
  WageDeterminationRate,
  WorkedHours,
} from './types.ts';

export {
  MissingWageDeterminationRateError,
  findRateOnDate,
  indexDeterminations,
  resolveRate,
} from './wageDetermination.ts';

export {
  combineWeeklyEarnings,
  groupIntoWorkweeks,
  resolvePrevailingWageWeek,
  workweekStart,
} from './prevailingWage.ts';
export type {
  PrevailingWageAdjustment,
  PrevailingWageWeek,
  ResolvePrevailingWageArgs,
  ResolvedWorkedHours,
} from './prevailingWage.ts';

export { MissingWorkersCompRatingError, computeJobCosts } from './jobCosting.ts';
export type { EmployeeJobCostInput, JobCost, WorkersCompRating } from './jobCosting.ts';

export {
  InvalidAnnualHoursError,
  annualizeFringeCredits,
  checkFringeAnnualization,
  fringeCreditsFromContributions,
  totalAnnualizedCreditPerHour,
} from './fringeAnnualization.ts';
export type {
  AnnualizedFringeCredit,
  FringeAnnualizationFinding,
  FringeContributionBasis,
  FringePlanContribution,
} from './fringeAnnualization.ts';

export { buildCertifiedPayroll, deductionsFromPaycheck } from './certifiedPayroll.ts';
export type {
  CertifiedPayrollDayHours,
  CertifiedPayrollDeductions,
  CertifiedPayrollEmployeeInput,
  CertifiedPayrollReport,
  CertifiedPayrollRow,
  StatementOfCompliance,
} from './certifiedPayroll.ts';

export { buildCaliforniaCertifiedPayroll } from './californiaCertifiedPayroll.ts';
export type {
  CaliforniaCertifiedPayrollEmployeeInput,
  CaliforniaCertifiedPayrollHeader,
  CaliforniaCertifiedPayrollReport,
  CaliforniaCertifiedPayrollRow,
  CaliforniaFringeContribution,
} from './californiaCertifiedPayroll.ts';

export { runTradesPayPeriod } from './run.ts';
export type { TradesPayPeriodInput, TradesPayPeriodResult } from './run.ts';

export {
  certifiedPayrollForPeriod,
  draftTradesPayRun,
  jobCostsForPeriod,
  recalculateTradesPayRun,
  voidPayRun,
} from './payRun.ts';
export type { TradesEmployeeRun, TradesPayRunInput, TradesPayRunResult } from './payRun.ts';

export {
  addWorkedHours,
  allWageDeterminations,
  getJob,
  getWageDetermination,
  getWorkerProfile,
  jobsForCompany,
  readTradesDb,
  saveJob,
  saveWageDetermination,
  saveWorkerProfile,
  withTradesDb,
  workedHoursForCompanyInRange,
  workedHoursForEmployeeInRange,
} from './store.ts';

export {
  UnknownCompanyError,
  approveRunById,
  draftWeeklyTradesRun,
  loadTradesPayRunInput,
  weeklyCertifiedPayroll,
  weeklyJobCosts,
} from './service.ts';
export type { TradesRunRequest } from './service.ts';

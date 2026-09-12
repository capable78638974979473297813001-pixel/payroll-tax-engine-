import type { Cents } from '../src/money.ts';
import type {
  Deduction,
  EmployerContext,
  EmploymentCategory,
  FederalW4,
  PayFrequency,
  PretaxCategory,
  StateWithholding,
  YearToDate,
} from '../src/types.ts';
import type { GarnishmentOrder } from '../src/garnishment.ts';

/**
 * The payroll domain model — everything a payroll run needs that the tax
 * engine (src/) deliberately does NOT know about: who the company and its
 * employees are, what they're paid, where their money goes, and what
 * happened the last time payroll ran. The engine stays a pure per-cheque
 * function (`calculatePaycheck(input) -> result`, no state, no employee
 * records — see src/types.ts's own PaycheckInput); this module is the layer
 * a real payroll company runs on top of it: employee/company records, a pay
 * schedule, YTD accumulation ACROSS pay runs, direct deposit, and paystubs.
 *
 * This is where "which state's rules apply" (src/registry.ts) stops and
 * "whose money is this and where does it go" starts.
 */

/** A legal employer running payroll through this system. */
export interface Company {
  id: string;
  legalName: string;
  ein: string; // XX-XXXXXXX
  /** Two-letter state code of the company's principal place of business — the default work state for employees who don't override it. */
  homeState: string;
  paySchedule: PayScheduleConfig;
  /** Facts the tax engine needs about the EMPLOYER side and can't derive — see EmployerContext's own doc comments. Applies to every employee's paycheck unless a specific run input overrides it. */
  employerContext?: EmployerContext;
}

export type PayScheduleFrequency = Extract<PayFrequency, 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'>;

/**
 * How often, and on what date, this company pays. Deliberately restricted to
 * the four frequencies real payroll companies actually run on a calendar
 * (quarterly/semiannual/annual exist in the tax engine only to support
 * supplemental/bonus-only cheques run alongside a real schedule, never as a
 * company's OWN cadence) — see PayScheduleFrequency.
 */
export interface PayScheduleConfig {
  frequency: PayScheduleFrequency;
  /**
   * Weekly/biweekly: the FIRST period's start date (a Sunday or Monday,
   * caller's convention) — every later period is computed forward from it
   * in fixed 7- or 14-day increments, never re-derived from a weekday name,
   * so a payroll calendar can't drift.
   */
  anchorPeriodStart?: string; // ISO yyyy-mm-dd, required for weekly/biweekly
  /** Semimonthly: the two days of the month periods split on — almost always [1, 16], covering 1-15 and 16-end. */
  semimonthlySplitDays?: [number, number];
  /** How many days after a period ends the check is dated — the ordinary processing lag (e.g. 5 for "period ends Friday, paid the following Friday"). */
  checkDateLagDays: number;
}

export interface DirectDepositAccount {
  id: string;
  /** ABA routing number — validated by its own checksum digit before this account is ever used, see directDeposit.ts's own validateRoutingNumber(). */
  routingNumber: string;
  /** Never a full account number in a real system beyond this demo boundary — see this module's own header note on what a production build must not do differently. */
  accountNumber: string;
  accountType: 'checking' | 'savings';
  /**
   * How this account's slice of net pay is sized. 'remainder' takes
   * whatever is left after every fixed/percent account on the same
   * employee is funded — exactly one account per employee may be
   * 'remainder', and it is always funded LAST, so a shortfall lands on it
   * rather than on a fixed-dollar account silently paying less than
   * promised.
   */
  allocation: { kind: 'remainder' } | { kind: 'percent'; percentOfNet: number } | { kind: 'flatAmount'; amount: Cents };
  /** Split order among an employee's own accounts when more than one is 'flatAmount' or 'percent' — lower draws first. Irrelevant to 'remainder'. */
  priority?: number;
}

/** A recurring deduction an employee has standing (benefits premium, 401(k) %, garnishment aside — garnishments are tracked separately, see GarnishmentOrder). */
export interface DeductionPlan {
  id: string;
  code: string;
  category: PretaxCategory | null; // null = post-tax, same convention as Deduction.category
  /** Fixed dollar amount per pay period, OR a percentage of gross cash earnings (e.g. a 401(k) election) — exactly one is set. */
  amount: { kind: 'flat'; cents: Cents } | { kind: 'percentOfGross'; percent: number };
  /** false suspends the deduction without deleting the election (a 401(k) contribution paused, not cancelled). */
  active: boolean;
}

/**
 * Extra bookkeeping this module layers onto the engine's own YearToDate:
 * the two trackers ytd.ts's accumulator cannot safely derive from a
 * PaycheckResult alone (see ytd.ts's own header comment for why), plus the
 * month key railroadMonthlyCompensation needs to know when to reset.
 */
export interface ExtendedYearToDate extends YearToDate {
  /** Which calendar month (YYYY-MM) railroadMonthlyCompensation currently reflects — a new month zeroes it before this period's compensation is added. */
  railroadMonthlyCompensationMonth?: string;
}

export interface Employee {
  id: string;
  companyId: string;
  firstName: string;
  lastName: string;
  hireDate: string; // ISO yyyy-mm-dd
  terminationDate?: string;
  employmentCategory: EmploymentCategory;
  payType: { kind: 'hourly'; hourlyRate: Cents } | { kind: 'salary'; annualSalary: Cents };
  /** Where the employee lives — drives residence-based rules; see PaycheckInput.residenceState's own doc comment. */
  residenceState: StateWithholding;
  /** Where the employee works, if different from the company's home state (e.g. a remote hire). Defaults to the company's homeState. */
  workState?: StateWithholding;
  residenceStateWithholding?: { nexus?: boolean; voluntary?: boolean };
  federalW4: FederalW4;
  deductionPlans: DeductionPlan[];
  directDepositAccounts: DirectDepositAccount[];
  garnishmentOrders: GarnishmentOrder[];
  ytd: ExtendedYearToDate;
  /** The calendar year `ytd` reflects — a check date landing in a new year resets every accumulator to zero before that cheque runs, the same "one calendar year, then start over" rule the tax engine's own wage bases assume. */
  ytdYear: number;
}

/** Hours reported for one employee for one pay period — irrelevant to salaried employees, who are paid the same regardless of hours logged. */
export interface TimeEntry {
  employeeId: string;
  regularHours: number;
  overtimeHours: number;
  /** Cash paid outside the regular hourly/salary formula this period — a bonus, commission, or reimbursement, tagged with the same EarningCategory the engine uses to decide taxability. */
  extraEarnings?: { category: 'supplemental' | 'reimbursement' | 'imputed'; code: string; amount: Cents }[];
}

export type PayRunStatus = 'draft' | 'approved' | 'voided';

export interface PayRunLine {
  employeeId: string;
  grossPay: Cents;
  netPay: Cents;
  employeeTaxTotal: Cents;
  employerTaxTotal: Cents;
  pretaxDeductions: Cents;
  posttaxDeductions: Cents;
  garnishmentTotal: Cents;
  /** Net pay after garnishments are withheld — what direct deposit actually moves. */
  netPayAfterGarnishment: Cents;
  /** taxableWages is carried alongside amount (not just for display) so an approved run can be rolled into YTD later purely from this persisted line — see ytd.ts's own accumulateYtd(), which reads exactly these two fields. */
  taxLines: { id: string; name: string; payer: 'employee' | 'employer'; taxableWages: Cents; amount: Cents }[];
  garnishmentLines: { orderId: string; withheld: Cents; detail: string }[];
  depositAllocations: { accountId: string; amount: Cents }[];
}

export interface PayRun {
  id: string;
  companyId: string;
  periodStart: string;
  periodEnd: string;
  checkDate: string;
  status: PayRunStatus;
  lines: PayRunLine[];
  createdAt: string;
  approvedAt?: string;
}

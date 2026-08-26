import type { Cents } from './money.ts';

export type FilingStatus =
  | 'single'
  | 'married_joint'
  | 'married_separate'
  | 'head_of_household';

export type PayFrequency =
  | 'weekly'
  | 'biweekly'
  | 'semimonthly'
  | 'monthly'
  | 'quarterly'
  | 'semiannual'
  | 'annual'
  | 'daily';

export const PERIODS_PER_YEAR: Record<PayFrequency, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
  quarterly: 4,
  semiannual: 2,
  annual: 1,
  daily: 260,
};

/**
 * Categories of pre-tax deduction.
 *
 * This enumeration is the spine of the whole engine. Every tax declares which
 * of these categories actually reduce ITS taxable base, because the same
 * dollar of deferral is exempt from one tax and fully taxable under another.
 * Getting this table wrong is the single most common defect in home-grown
 * payroll systems — the gross-to-net arithmetic is trivial by comparison.
 */
export type PretaxCategory =
  | 'section125' // cafeteria plan: medical/dental/vision premiums
  | 'hsa' // health savings account (via cafeteria plan)
  | 'fsa' // health flexible spending
  | 'dependent_care' // dependent care assistance
  | 'deferral_401k'
  | 'deferral_403b'
  | 'deferral_457'
  | 'deferral_simple'
  | 'commuter'; // qualified transportation fringe

export type EarningCategory =
  | 'regular'
  | 'supplemental' // bonus, commission — may use flat supplemental rate
  | 'imputed' // taxable but not paid in cash (e.g. group term life > $50k)
  | 'reimbursement' // paid in cash but not taxable
  /**
   * A minister's designated housing (parsonage) allowance: paid in cash and
   * excluded from income tax, but included in the minister's own
   * self-employment tax base. Only excluded from tax when the worker is
   * employmentCategory 'clergy' — a housing allowance paid to anyone else
   * is ordinary taxable pay, and treating it otherwise would be a way to
   * make wages disappear.
   */
  | 'housing_allowance';

export interface Earning {
  code: string;
  category: EarningCategory;
  amount: Cents;
}

export interface Deduction {
  code: string;
  /** `null` means post-tax — reduces net pay but no taxable base. */
  category: PretaxCategory | null;
  amount: Cents;
}

/** Employee's Form W-4 (2020 or later revision). */
export interface FederalW4 {
  filingStatus: FilingStatus;
  /** Step 2 checkbox: two jobs / spouse works. */
  multipleJobs: boolean;
  /** Step 3: annual credit amount in dollars, as entered by employee. */
  dependentCredit: Cents;
  /** Step 4(a): other annual income. */
  otherIncome: Cents;
  /** Step 4(b): annual deductions beyond the standard deduction. */
  deductions: Cents;
  /** Step 4(c): additional withholding per pay period. */
  extraWithholding: Cents;
  /** Employee claimed exempt from federal withholding. */
  exempt?: boolean;
  /**
   * Employee is a nonresident alien performing services within the US —
   * triggers Pub 15-T's "Withholding Adjustment for Nonresident Alien
   * Employees" procedure (add a fixed per-period dollar amount to wages
   * before the ordinary percentage-method calculation runs). Does NOT apply
   * to nonresident alien students/business apprentices from India, who Pub
   * 15-T explicitly carves out of this procedure — the caller is
   * responsible for that carve-out, same as every other eligibility
   * determination this engine trusts the input for.
   */
  nonresidentAlien?: boolean;
  /**
   * A voluntary income tax withholding agreement, the one way a minister's
   * pay carries federal income tax withholding at all (IRS: an employer and
   * minister MAY agree to withhold, reported in box 2 of the W-2). Ignored
   * for every other employment category.
   */
  voluntaryWithholdingAgreement?: boolean;
}

/** Year-to-date wages, needed for every wage-base-capped tax. */
export interface YearToDate {
  /** YTD wages subject to Social Security. */
  socialSecurity: Cents;
  /** YTD wages subject to Medicare (also drives Additional Medicare). */
  medicare: Cents;
  /** YTD wages subject to FUTA. */
  futa: Cents;
  /**
   * YTD supplemental wages paid this calendar year. Drives the mandatory 37%
   * federal rate once cumulative supplemental wages pass $1,000,000. Optional;
   * absent means none so far this year.
   */
  supplemental?: Cents;
  /** YTD wages per state unemployment, keyed by state code. */
  stateUnemployment?: Record<string, Cents>;
  /**
   * Cash wages paid to THIS household or agricultural worker so far this
   * year, which is what the coverage tests measure. Not the same as the
   * social security YTD figure above: that one counts wages already
   * subjected to the tax, while this counts wages paid whether or not they
   * were taxable yet — the whole question being when they become taxable.
   */
  categoryCashWages?: Cents;
  /**
   * YTD compensation already counted toward the railroad retirement Tier II
   * wage base. A separate tracker from socialSecurity because Tier II caps
   * far lower ($137,100 for 2026 against $184,500), so the two run out at
   * different points in the year.
   */
  tier2Compensation?: Cents;
  /**
   * Compensation already counted toward the railroad unemployment (RUIA)
   * base THIS CALENDAR MONTH. RUIA caps monthly rather than annually
   * ($2,150 a month for 2026), so unlike every other tracker here it
   * resets twelve times a year and the caller keeps it.
   */
  railroadMonthlyCompensation?: Cents;
  /**
   * This employee's Seattle compensation so far this year. Seattle's
   * payroll expense tax bands by ANNUAL compensation, so a cheque cannot be
   * placed in a band without knowing what came before it.
   */
  seattleCompensation?: Cents;
  /**
   * YTD wages already counted toward a state Paid Family & Medical Leave
   * wage-base cap, keyed by state code (e.g. Minnesota Paid Leave). Separate
   * tracker from stateUnemployment even where a state has both, since the
   * two levies cap at different wage bases under different statutes.
   */
  statePaidLeave?: Record<string, Cents>;
  /**
   * YTD wages already counted toward a state disability insurance wage-base
   * cap, keyed by state code (e.g. New Jersey TDI). Only used by the
   * annual-wage-base variant of stateDisabilityEmployeeTax() — New York's DBL
   * uses a per-period dollar cap instead and never reads this.
   */
  stateDisabilityEmployee?: Record<string, Cents>;
  /**
   * YTD wages already counted toward a state long-term-care insurance
   * wage-base cap, keyed by state code (e.g. Washington's WA Cares Fund).
   * Separate tracker from statePaidLeave even where a state has both (WA
   * does — Paid Leave and WA Cares are different statutes with different
   * caps, WA Cares uncapped and Paid Leave sharing the SS wage base).
   */
  stateLongTermCare?: Record<string, Cents>;
  /**
   * YTD wages already counted toward a LOCAL income tax's withholding
   * TRIGGER (not a wage-base cap — these are threshold-based: no tax at
   * all below the threshold, then a flat rate on wages above it, forever,
   * not just the first dollar past the line). Keyed by an arbitrary
   * per-locality id chosen by that locality's own dispatch function (e.g.
   * 'OR_METRO', 'OR_MULTNOMAH' for Portland's Metro Supportive Housing
   * Services and Multnomah County Preschool For All taxes) rather than by
   * state code, since a single state can have multiple independent local
   * triggers active at once.
   */
  localIncomeTax?: Record<string, Cents>;
}

export interface StateWithholding {
  /** Two-letter code, e.g. 'PA'. */
  code: string;
  /** State-specific certificate fields; shape varies by state. */
  certificate?: Record<string, unknown>;
}

/**
 * Facts about the EMPLOYER rather than the employee. Payroll taxes on the
 * employer side are mostly experience-rated: the state assigns each
 * employer its own rate every year based on its own layoff history, so no
 * jurisdiction file can hold it and no engine can derive it. This is where
 * a caller supplies what only it knows.
 */
export interface EmployerContext {
  /**
   * The employer's own assigned state unemployment (SUI/SUTA) contribution
   * rate, keyed by state code — 0.031 for 3.1%. When absent, the engine
   * falls back to that state's published NEW-EMPLOYER rate and says so in
   * the line's detail, because a new employer genuinely pays that rate;
   * where a state publishes no single new-employer figure (industry- or
   * schedule-assigned), no line is produced rather than a guessed one.
   */
  stateUnemploymentRate?: Record<string, number>;
  /**
   * Several states offer a flat supplemental-wage rate as an EMPLOYER
   * OPTION rather than a mandate — Missouri's 4.7%, Nebraska's 3.5%,
   * Oregon's 8%, Maine's 5%, North Carolina's 4.09% — the alternative
   * always being to aggregate the bonus with regular wages and run the
   * normal formula. Which one an employer uses is a payroll policy
   * decision, not a fact about the employee, so it lives here. Keyed by
   * state code; absent or false means aggregate, which is what the engine
   * does by default.
   */
  supplementalFlatRateElection?: Record<string, boolean>;
  /**
   * Cash wages paid to ALL household employees in the current calendar
   * quarter — the FUTA test for domestic employment ($1,000 in any
   * quarter). An employer-wide figure, so only the employer has it.
   */
  householdQuarterlyCashWages?: Cents;
  /**
   * Wages paid to ALL farmworkers this year — the $2,500 test, which makes
   * every farmworker's pay taxable regardless of how little any one of them
   * earned.
   */
  agriculturalTotalWages?: Cents;
  /**
   * Whether this employer meets the agricultural FUTA test ($20,000 of farm
   * wages in a calendar quarter, or 10 or more farmworkers on 20 days in
   * 20 different weeks). Both halves are employer-wide facts across a year,
   * so the caller asserts the conclusion.
   */
  agriculturalFutaLiable?: boolean;
  /**
   * This railroad employer's own experience-rated RUIA contribution rate.
   * The published range for 2026 runs from 0.65% — which 91% of covered
   * employers pay — to 12.0%. Absent, the new-employer rate is used.
   */
  railroadUnemploymentRate?: number;
  /**
   * This employer's total PRIOR-YEAR Seattle payroll expense, which decides
   * both whether Seattle's payroll expense tax (JumpStart) applies at all
   * and which rate tier it applies at. An employer-wide, prior-year figure:
   * nothing in a single paycheck can imply it, so the tax computes nothing
   * without it.
   */
  seattlePriorYearPayrollExpense?: Cents;
  /**
   * How much of a paid-leave premium this employer passes on to employees,
   * as a fraction of the TOTAL premium, keyed by state code. Delaware funds
   * its programme entirely from the employer by statute but lets the
   * employer recover up to half from employees — a genuine election with a
   * ceiling, not a fixed rate, so no jurisdiction file can hold it. Values
   * above the state's own ceiling are clamped to it.
   */
  paidLeaveEmployeeShareFraction?: Record<string, number>;
  /**
   * Which paid-leave coverage tier this employer falls in, keyed by state
   * code. Delaware's premium depends on headcount: 1-9 employees are exempt
   * from the Act entirely, 10-24 owe the parental component only, 25+ owe
   * all three. Headcount is an employer fact, so the caller names the tier
   * ('exempt', 'parentalOnly', 'full') and a state whose config requires one
   * computes nothing until it arrives.
   */
  paidLeaveTier?: Record<string, string>;
}

/**
 * Which body of employment-tax rules this worker falls under. Most people
 * are 'standard'; the others are real categories the Internal Revenue Code
 * treats differently, and getting them wrong means withholding taxes that
 * are not owed or missing ones that are.
 *
 *   'clergy'            — a duly ordained, commissioned or licensed
 *                         minister performing services in the exercise of
 *                         their ministry. Not subject to income tax, social
 *                         security or Medicare WITHHOLDING (they pay
 *                         self-employment tax instead under SECA), and the
 *                         services are excluded from FUTA employment.
 *   'statutory_employee'— not a common-law employee, but an employee by
 *                         statute for FICA: social security and Medicare
 *                         ARE withheld, federal income tax is NOT.
 *
 * State treatment is a separate question this flag does NOT answer — see
 * the federal ruleset's own employmentCategories block.
 */
/**
 *   'household'         — a domestic worker in a private home. FICA applies
 *                         only once cash wages to that worker reach the
 *                         year's coverage threshold ($3,000 for 2026), and
 *                         FUTA only once household cash wages reach $1,000
 *                         in a calendar quarter. Income tax withholding is
 *                         not required at all.
 *   'agricultural'      — a farmworker. FICA and income tax withholding
 *                         apply only if the worker is paid $150 or more in
 *                         the year, OR the employer pays $2,500 or more to
 *                         all farmworkers.
 */
/**
 *   'railroad'          — covered rail employment, taxed under the Railroad
 *                         Retirement Tax Act instead of FICA. Tier I is
 *                         arithmetically identical to social security and
 *                         Medicare but is a different tax reported on a
 *                         different return; Tier II is an additional tax
 *                         with its own rate and its own wage base. Railroad
 *                         employers pay unemployment contributions under the
 *                         RUIA, not FUTA.
 */
/**
 *   'election_worker'   — a poll worker or election official paid by a
 *                         state or local government. FICA applies only once
 *                         payments reach the year's threshold ($2,500 for
 *                         2026); the work is government employment, so it
 *                         is outside FUTA entirely, and income tax is not
 *                         withheld unless the worker asks for it.
 */
export type EmploymentCategory =
  | 'standard'
  | 'clergy'
  | 'statutory_employee'
  | 'household'
  | 'agricultural'
  | 'railroad'
  | 'election_worker';

export interface PaycheckInput {
  /**
   * Check date. Determines WHICH ruleset applies — never "today".
   * A recalculation of a prior period must reproduce that period's rules.
   */
  checkDate: string; // ISO yyyy-mm-dd
  payFrequency: PayFrequency;
  earnings: Earning[];
  deductions: Deduction[];
  federalW4: FederalW4;
  ytd: YearToDate;
  /** Employer-side facts the engine cannot derive — see EmployerContext. */
  employer?: EmployerContext;
  /** Which employment-tax rules apply to this worker. Defaults to 'standard'. */
  employmentCategory?: EmploymentCategory;
  /**
   * The employee's most recent REGULAR payment, for states whose rule for a
   * bonus paid on its own cheque is "aggregate it with the last regular
   * payment, compute tax on the total, and subtract the tax already
   * withheld then". That instruction reaches backwards across paychecks,
   * which a single calculatePaycheck() call cannot do on its own — so the
   * caller, who has the payroll history, supplies it.
   *
   * Omitted (the normal case) means the bonus is taxed on its own, exactly
   * as before.
   */
  priorRegularPayment?: {
    /** Taxable wages of that prior regular payment. */
    taxableWages: Cents;
    /** State income tax actually withheld from it. */
    stateIncomeTaxWithheld?: Cents;
  };
  /** Work state (and eventually residence state for reciprocity). */
  workState?: StateWithholding;
  residenceState?: StateWithholding;
  /** Round withholding to whole dollars, as IRS permits. */
  roundToWholeDollars?: boolean;
}

export interface TaxLine {
  /** Stable identifier, e.g. 'US_FIT', 'US_SS_EE', 'PA_SIT'. */
  id: string;
  name: string;
  /** Who pays: withheld from employee, or employer-borne. */
  payer: 'employee' | 'employer';
  jurisdiction: 'federal' | 'state' | 'local';
  /** The base this tax was actually computed on, after its own exemptions. */
  taxableWages: Cents;
  amount: Cents;
  /** Human-readable trace of how the number was reached. */
  detail?: string;
}

export interface PaycheckResult {
  checkDate: string;
  /** Cash earnings (excludes imputed income). */
  grossPay: Cents;
  /** Sum of all pre-tax deductions. */
  pretaxDeductions: Cents;
  /** Sum of all post-tax deductions. */
  posttaxDeductions: Cents;
  taxes: TaxLine[];
  employeeTaxTotal: Cents;
  employerTaxTotal: Cents;
  netPay: Cents;
}

/**
 * A tax rule. Each returns zero or more lines.
 *
 * Rules are discovered from the registry at calculation time rather than
 * hardcoded into the caller, so adding a jurisdiction is a data + module
 * change, never a change to the calculation driver.
 */
export interface TaxRule {
  id: string;
  compute(input: PaycheckInput, ctx: ComputeContext): TaxLine[];
}

export interface ComputeContext {
  year: number;
  periodsPerYear: number;
  /** Resolve the taxable base for a given tax's exemption profile. */
  taxableWagesFor(exempt: readonly PretaxCategory[]): Cents;
}

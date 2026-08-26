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
  | 'reimbursement'; // paid in cash but not taxable

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

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
}

export interface StateWithholding {
  /** Two-letter code, e.g. 'PA'. */
  code: string;
  /** State-specific certificate fields; shape varies by state. */
  certificate?: Record<string, unknown>;
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

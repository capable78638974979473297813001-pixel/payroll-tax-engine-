import type { Cents } from '../src/money.ts';
import type { PretaxCategory } from '../src/types.ts';
import type { DeductionPlan } from './types.ts';

/**
 * Benefits administration: define a plan once, let every employee's own
 * election and coverage tier drive their payroll deduction automatically —
 * the piece isolved's own materials describe as "set up your benefit
 * plans once, driving enrollment and deductions throughout the system."
 *
 * SCOPE: this is plan definition, election, and the arithmetic that turns
 * an election into a payroll deduction. It does NOT talk to a carrier
 * (EDI 834 enrollment files, eligibility verification, ACA 1095-C
 * reporting) — those are real, separate integrations a full benefits
 * subsystem needs, not modelled here, the same "disclosed, not built"
 * choice this project makes for e-filing and bank-linking elsewhere (see
 * payroll/directDeposit.ts and payroll/filings.ts's own header comments).
 */

export type CoverageTier = 'employee_only' | 'employee_spouse' | 'employee_children' | 'family';

export interface BenefitPlan {
  id: string;
  companyId: string;
  name: string;
  /** null = a post-tax benefit (e.g. supplemental life insurance the employee pays for with after-tax dollars) — same convention as DeductionPlan.category. */
  category: PretaxCategory | null;
  /**
   * The FULL monthly premium for each tier this plan offers — set directly
   * by the plan/carrier, never derived from a generic multiplier: real
   * benefit plans price employee+spouse, employee+children and family
   * tiers independently, not as a fixed ratio of the employee-only rate.
   */
  monthlyPremiumByTier: Partial<Record<CoverageTier, Cents>>;
  /** What fraction of the tier's own premium the EMPLOYER covers, 0-1. The rest is the employee's own payroll deduction. */
  employerContributionFraction: number;
}

export interface BenefitElection {
  id: string;
  employeeId: string;
  planId: string;
  coverageTier: CoverageTier;
  effectiveDate: string;
  /** Set once a later election supersedes this one, or coverage otherwise ends (termination, dropping the plan). Open-ended (undefined) means currently active. */
  endDate?: string;
}

/** The employee's own MONTHLY cost for the tier they elected — the plan's full premium for that tier, less the employer's contribution. */
export function employeeMonthlyPremium(plan: BenefitPlan, tier: CoverageTier): Cents {
  const fullPremium = plan.monthlyPremiumByTier[tier];
  if (fullPremium === undefined) {
    throw new Error(`Plan ${plan.id} ("${plan.name}") has no premium defined for coverage tier "${tier}"`);
  }
  return Math.round(fullPremium * (1 - plan.employerContributionFraction));
}

/**
 * Converts a MONTHLY employee cost into a PER-PAYCHECK deduction: annualize
 * first (x12), then divide by this schedule's own periods per year — never
 * a shortcut like "divide by 2" for semimonthly, which would only
 * coincidentally match monthly x 12 / 24. This is the same
 * annual-figure-to-period-slice approach a salaried employee's own pay
 * already uses (payroll/engine.ts's baseEarnings()).
 */
export function perPeriodDeductionAmount(monthlyEmployeeCost: Cents, periodsPerYear: number): Cents {
  return Math.round((monthlyEmployeeCost * 12) / periodsPerYear);
}

/** Turns one active election into the DeductionPlan payroll/engine.ts actually reads — the point where "an employee is enrolled in a plan" becomes "a payroll deduction happens every period." */
export function deductionPlanFromElection(plan: BenefitPlan, election: BenefitElection, periodsPerYear: number): DeductionPlan {
  const monthlyEmployeeCost = employeeMonthlyPremium(plan, election.coverageTier);
  return {
    id: `benefit-${election.id}`,
    code: plan.name,
    category: plan.category,
    amount: { kind: 'flat', cents: perPeriodDeductionAmount(monthlyEmployeeCost, periodsPerYear) },
    active: election.endDate === undefined,
  };
}

/**
 * Whether an employee may CHANGE their election on `requestDate` — outside
 * the employer's own annual open-enrollment window, federal rules (IRC
 * § 125's own cafeteria-plan regulations) restrict a mid-year change to a
 * genuine qualifying life event (marriage, birth/adoption, divorce, loss
 * of other coverage, ...). This function only enforces the WINDOW; it
 * trusts the caller's own `hasQualifyingLifeEvent` assertion the same way
 * the tax engine trusts a caller-supplied eligibility fact rather than
 * verifying it — this is not a place to invent a rule that decides
 * whether a claimed life event is genuine.
 */
export function isElectionChangeAllowed(
  requestDate: string,
  openEnrollmentWindow: { start: string; end: string },
  hasQualifyingLifeEvent: boolean,
): boolean {
  const inWindow = requestDate >= openEnrollmentWindow.start && requestDate <= openEnrollmentWindow.end;
  return inWindow || hasQualifyingLifeEvent;
}

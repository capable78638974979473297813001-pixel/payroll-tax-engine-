/**
 * SECURE 2.0 Act § 101 — the mandatory automatic-enrollment requirement
 * for new 401(k) and 403(b) plans — LIVE-VERIFIED against multiple
 * independent benefits/retirement-plan-administrator sources describing
 * the same rate bounds, exemption list, and effective date, not assumed
 * from trained memory. Fetched/cross-checked 2026-09-14.
 *
 * TWO DATES MATTER, NOT ONE: a plan is subject to this mandate only if
 * it was "established" on or after December 29, 2022 (the Act's own
 * enactment date — every plan that existed before that date is
 * grandfathered permanently, regardless of size); AND, for a subject
 * plan, the mandatory feature itself first had to be in place for the
 * first plan year beginning after December 31, 2024 (January 1, 2025
 * for a calendar-year plan). `isSecureAutoEnrollmentMandatory()` checks
 * both dates plus every other exemption at once, rather than treating
 * "established after the enactment date" as sufficient on its own.
 *
 * THE ESCALATING-RATE RULE IS A RANGE, NOT A SINGLE NUMBER: the
 * statute fixes the FLOOR of the initial rate (at least 3%) and a CAP on
 * it (not more than 10%), and separately fixes a floor on where annual
 * escalation must eventually reach (at least 10%) and an absolute
 * ceiling it may never exceed (15%) — but leaves the plan sponsor free
 * to choose the exact initial rate and exact ceiling within those
 * bounds. `secureAutoEnrollmentRateForPlanYear()` therefore takes the
 * sponsor's own chosen initial rate and chosen ceiling as inputs (each
 * separately validated by `isSecureAutoEnrollmentInitialRateValid()` and
 * `isSecureAutoEnrollmentCeilingValid()`) rather than assuming a single
 * "the" rate exists to compute.
 *
 * SCOPE: does not model the 401(k)/403(b) contribution LIMITS themselves
 * (already `payroll/retirementLimits.ts`'s own scope) or the mandatory
 * Roth catch-up rule that module already covers — this module is only
 * the auto-enrollment MANDATE: who must have it, what rate range is
 * allowed, and the 90-day permissible-withdrawal window. Does not model
 * a Qualified Default Investment Alternative (QDIA) selection, an
 * investment-menu question with no payroll-side calculation to get
 * right or wrong.
 */

/** The Act's own enactment date: only plans established on or after this date are ever subject to the mandate — everything before it is permanently grandfathered. */
export const SECURE_AUTO_ENROLLMENT_ACT_ENACTMENT_DATE = '2022-12-29';

/** The mandate itself first applies to plan years beginning on or after this date, even for a plan established well before it. */
export const SECURE_AUTO_ENROLLMENT_FIRST_MANDATORY_PLAN_YEAR_START = '2025-01-01';

/** The employer is exempt if it has fewer than this many employees. */
export const SECURE_AUTO_ENROLLMENT_SMALL_EMPLOYER_THRESHOLD = 10;

/** The employer is exempt if it has been in existence fewer than this many years. */
export const SECURE_AUTO_ENROLLMENT_NEW_BUSINESS_MIN_YEARS = 3;

/** The lowest allowed INITIAL default contribution rate. */
export const SECURE_AUTO_ENROLLMENT_MIN_INITIAL_RATE = 0.03;

/** The highest allowed INITIAL default contribution rate — the initial rate may not start above this even though the eventual ceiling may go higher. */
export const SECURE_AUTO_ENROLLMENT_MAX_INITIAL_RATE = 0.1;

/** The minimum required annual escalation increment. */
export const SECURE_AUTO_ENROLLMENT_MIN_ANNUAL_ESCALATION = 0.01;

/** Escalation must continue until reaching at least this rate... */
export const SECURE_AUTO_ENROLLMENT_MIN_ESCALATION_CEILING = 0.1;

/** ...but the sponsor's chosen ceiling may never exceed this absolute cap. */
export const SECURE_AUTO_ENROLLMENT_MAX_RATE = 0.15;

/** The permissible-withdrawal window: an automatically-enrolled participant may unwind their default contributions, penalty-free, within this many days of the first default contribution. */
export const SECURE_AUTO_ENROLLMENT_WITHDRAWAL_WINDOW_DAYS = 90;

export interface SecureAutoEnrollmentExemptionInput {
  planEstablishedDate: string;
  employeeCount: number;
  yearsInExistence: number;
  isGovernmentalPlan: boolean;
  isChurchPlan: boolean;
  isSimple401kPlan: boolean;
}

/**
 * True if ANY of the statute's own exemptions applies: the plan predates
 * the Act's own enactment date, the employer has fewer than 10
 * employees, the employer has existed fewer than 3 years, or the plan is
 * a governmental plan, a church plan, or a SIMPLE 401(k) plan.
 */
export function isSecureAutoEnrollmentExempt(input: SecureAutoEnrollmentExemptionInput): boolean {
  return (
    input.planEstablishedDate < SECURE_AUTO_ENROLLMENT_ACT_ENACTMENT_DATE ||
    input.employeeCount < SECURE_AUTO_ENROLLMENT_SMALL_EMPLOYER_THRESHOLD ||
    input.yearsInExistence < SECURE_AUTO_ENROLLMENT_NEW_BUSINESS_MIN_YEARS ||
    input.isGovernmentalPlan ||
    input.isChurchPlan ||
    input.isSimple401kPlan
  );
}

/**
 * True only once the plan year itself is subject to the mandate (begins
 * on or after 2025-01-01) AND none of the statute's own exemptions
 * apply — a plan established the day after enactment is still exempt if
 * it's run by a 5-employee startup founded last year.
 */
export function isSecureAutoEnrollmentMandatory(exemption: SecureAutoEnrollmentExemptionInput, planYearStartDate: string): boolean {
  if (planYearStartDate < SECURE_AUTO_ENROLLMENT_FIRST_MANDATORY_PLAN_YEAR_START) return false;
  return !isSecureAutoEnrollmentExempt(exemption);
}

/** Whether a sponsor's chosen INITIAL default rate falls within the statute's own 3%-10% range. */
export function isSecureAutoEnrollmentInitialRateValid(initialRate: number): boolean {
  return initialRate >= SECURE_AUTO_ENROLLMENT_MIN_INITIAL_RATE && initialRate <= SECURE_AUTO_ENROLLMENT_MAX_INITIAL_RATE;
}

/** Whether a sponsor's chosen escalation CEILING falls within the statute's own 10%-15% range. */
export function isSecureAutoEnrollmentCeilingValid(ceiling: number): boolean {
  return ceiling >= SECURE_AUTO_ENROLLMENT_MIN_ESCALATION_CEILING && ceiling <= SECURE_AUTO_ENROLLMENT_MAX_RATE;
}

/**
 * The default contribution rate for a given plan year, escalating by at
 * least 1 percentage point per full plan year elapsed since the first
 * mandatory plan year, capped at the sponsor's own chosen ceiling.
 */
export function secureAutoEnrollmentRateForPlanYear(initialRate: number, ceiling: number, fullPlanYearsElapsed: number): number {
  const escalated = initialRate + Math.max(0, fullPlanYearsElapsed) * SECURE_AUTO_ENROLLMENT_MIN_ANNUAL_ESCALATION;
  return Math.min(escalated, ceiling);
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/** The last date an automatically-enrolled participant may request a penalty-free withdrawal of their default contributions. */
export function secureAutoEnrollmentWithdrawalDeadline(firstDefaultContributionDate: string): string {
  return addDays(firstDefaultContributionDate, SECURE_AUTO_ENROLLMENT_WITHDRAWAL_WINDOW_DAYS);
}

/** True if a withdrawal request still falls within the 90-day permissible-withdrawal window. */
export function isWithinSecureAutoEnrollmentWithdrawalWindow(firstDefaultContributionDate: string, withdrawalRequestDate: string): boolean {
  return withdrawalRequestDate <= secureAutoEnrollmentWithdrawalDeadline(firstDefaultContributionDate);
}

import type { Cents } from '../src/money.ts';
import type { TerminationReason } from './termination.ts';

/**
 * COBRA continuation coverage (Consolidated Omnibus Budget
 * Reconciliation Act of 1985, 29 U.S.C. § 1161 et seq.) — the federal
 * requirement that a group health plan let someone who loses coverage
 * from a qualifying event keep it, at their own (marked-up) cost, for a
 * fixed continuation period. LIVE-VERIFIED against the U.S. Department
 * of Labor's own "An Employer's Guide to Group Health Continuation
 * Coverage Under COBRA" and its FAQ for workers, not assumed from
 * trained memory.
 *
 * SCOPE: this module answers the four questions a real termination
 * workflow actually needs — does COBRA even apply here, how long is the
 * continuation period, when is the election notice/election/first
 * premium each due, and what's the maximum premium — as pure functions
 * over dates and a qualifying-event reason. It does NOT generate the
 * election notice document itself (a real, separate compliance document
 * with its own required content, the same "disclosed, not built"
 * boundary this project draws around e-filing and carrier EDI elsewhere)
 * and does not track a beneficiary's actual election or premium payment
 * history — those are a genuinely separate persistence concern from the
 * dates and dollar figures this module computes.
 *
 * SMALL-EMPLOYER EXEMPTION: COBRA itself only binds an employer with 20
 * or more employees on a typical business day in the PRECEDING calendar
 * year (a "full-time equivalent" count, not distinct headcount — a
 * detail this module doesn't attempt, since this project already has a
 * more rigorous FTE calculation for a different purpose, ACA's own
 * Applicable Large Employer test in payroll/aca.ts; wiring COBRA's own
 * count to that one would conflate two different statutes' own
 * definitions of "employee count" without a source confirming they're
 * measured identically). isCobraApplicable() takes a plain headcount the
 * caller supplies, not a derived FTE figure.
 */

/** DOL: an employer with a headcount at or above this figure, on a typical business day in the prior calendar year, is subject to COBRA. Below it, exempt entirely. */
export const COBRA_SMALL_EMPLOYER_THRESHOLD = 20;

export function isCobraApplicable(typicalEmployeeCountPriorYear: number): boolean {
  return typicalEmployeeCountPriorYear >= COBRA_SMALL_EMPLOYER_THRESHOLD;
}

/**
 * The two continuation-period lengths COBRA sets, keyed by WHY coverage
 * would otherwise end. 'gross_misconduct' is deliberately excluded here,
 * not mapped to either duration — DOL's own guidance is that termination
 * for gross misconduct is NOT a qualifying event at all, so no COBRA
 * right arises; see qualifyingEventDurationMonths()'s own doc comment
 * for how that's surfaced rather than silently defaulted to a duration.
 */
export type CobraQualifyingEventReason =
  | 'termination'
  | 'reduced_hours'
  | 'divorce_or_legal_separation'
  | 'employee_medicare_entitlement'
  | 'dependent_aging_out'
  | 'employee_death';

const EIGHTEEN_MONTH_REASONS: readonly CobraQualifyingEventReason[] = ['termination', 'reduced_hours'];

/** 18 months for termination/reduced-hours events, 36 months for every other qualifying event DOL recognizes (divorce/separation, the employee's own Medicare entitlement, a dependent aging out, or the employee's death). */
export function qualifyingEventDurationMonths(reason: CobraQualifyingEventReason): 18 | 36 {
  return EIGHTEEN_MONTH_REASONS.includes(reason) ? 18 : 36;
}

/** Maps this project's own TerminationReason to whether an ordinary employment termination is a COBRA qualifying event at all — every reason IS one except 'gross_misconduct', which DOL's own guidance excludes entirely (no COBRA right arises, not even at $0 continuation). */
export function isQualifyingTermination(reason: TerminationReason): boolean {
  return reason !== 'gross_misconduct';
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + months, d));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/** DOL: the plan has 44 days after the qualifying event (the combined 30-day employer-to-plan-administrator plus 14-day plan-administrator-to-beneficiary notice deadlines this project doesn't model as two separate steps, since it has no plan-administrator role distinct from the employer) to provide the election notice. */
export const ELECTION_NOTICE_DEADLINE_DAYS = 44;

export function electionNoticeDeadline(qualifyingEventDate: string): string {
  return addDays(qualifyingEventDate, ELECTION_NOTICE_DEADLINE_DAYS);
}

/** DOL: 60 days from the LATER of the coverage-loss date or the date the election notice was actually provided. */
export const ELECTION_PERIOD_DAYS = 60;

export function electionDeadline(coverageLossDate: string, noticeProvidedDate: string): string {
  const later = coverageLossDate > noticeProvidedDate ? coverageLossDate : noticeProvidedDate;
  return addDays(later, ELECTION_PERIOD_DAYS);
}

/** DOL: 45 days from the date COBRA was elected to make the first premium payment. */
export const INITIAL_PREMIUM_DEADLINE_DAYS = 45;

export function initialPremiumDeadline(electionDate: string): string {
  return addDays(electionDate, INITIAL_PREMIUM_DEADLINE_DAYS);
}

/** DOL: the maximum a plan may charge is 102% of the plan's own full cost of coverage (employee + employer share), the extra 2% being the allowed administrative load. */
export const PREMIUM_CAP_FRACTION = 1.02;

export function maximumMonthlyPremium(fullMonthlyCostOfCoverage: Cents): Cents {
  return Math.round(fullMonthlyCostOfCoverage * PREMIUM_CAP_FRACTION);
}

/** The last day continuation coverage may run, given when the qualifying event happened and which duration applies. */
export function continuationCoverageEndDate(qualifyingEventDate: string, reason: CobraQualifyingEventReason): string {
  return addMonths(qualifyingEventDate, qualifyingEventDurationMonths(reason));
}

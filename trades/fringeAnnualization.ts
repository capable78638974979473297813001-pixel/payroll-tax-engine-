import { roundDownToCent, type Cents } from '../src/money.ts';
import type { FringeCredit } from './types.ts';

/**
 * Davis-Bacon fringe-benefit ANNUALIZATION — the rule that decides how much
 * hourly fringe credit an employer may actually claim against the prevailing-
 * wage obligation, and the source of one of the most common (and expensive)
 * Davis-Bacon violations.
 *
 * THE RULE (29 CFR 5.25): when an employer discharges part of the fringe
 * obligation through a bona-fide benefit plan, the creditable hourly rate is
 * the plan's EFFECTIVE annual rate of contribution — the total the employer
 * contributes in a year divided by the TOTAL hours the worker worked that
 * year, PUBLIC (Davis-Bacon) AND PRIVATE together. An employer may not fund a
 * benefit out of private-job hours and then take full hourly credit for it on
 * the Davis-Bacon job.
 *
 * WHY IT BITES: a $5,200/year pension contribution looks like $5.00/hr if you
 * divide by 1,040 Davis-Bacon hours, but if the worker also worked 1,040
 * private hours the real creditable rate is $5,200 ÷ 2,080 = $2.50/hr. An
 * employer who claims the $5.00 has under-paid $2.50/hr of cash fringe on
 * every Davis-Bacon hour — a back-wage liability found on audit.
 *
 * THE EXCEPTION: a benefit already provided on an HOURLY basis for ALL hours
 * worked (a CBA that funds "$X per hour worked" into a fund) is inherently
 * annualized and is credited at its stated rate — no division needed. (DOL's
 * 2023 final rule reaffirmed annualization and added a narrow exception-
 * request path for certain defined-contribution pension plans; that
 * application process is administrative and out of scope here — this models
 * the general rule and the hourly-basis exception, which cover the ordinary
 * cases.)
 *
 * DISCLOSED SOURCING: the annualization rule, the total-hours (not DBA-hours)
 * divisor, and the hourly-basis exception are corroborated across DOL Wage
 * and Hour Division guidance (WHD Field Operations Handbook ch. 15, the
 * Davis-Bacon regulations at 29 CFR 5.25, and the 2023 rulemaking preamble) —
 * the same "sourced, not remembered" standard the rest of this project holds.
 *
 * ROUNDING: the creditable rate is rounded DOWN to the cent. Over-stating the
 * credit is exactly the violation this module exists to prevent, so the
 * conservative direction protects the worker — the same reason
 * src/money.ts's roundDownToCent exists for Pennsylvania's LST.
 */

/** How an employer's contribution to one fringe plan is expressed, which decides whether it must be annualized. */
export type FringeContributionBasis =
  /** Already funded per hour worked, for ALL hours — the exception; credited at this rate with no division. */
  | { kind: 'hourly-all-hours'; ratePerHourCents: Cents }
  /** A fixed yearly contribution (a defined pension contribution, a yearly HSA deposit) — must be annualized. */
  | { kind: 'annual'; annualAmountCents: Cents }
  /** A recurring monthly cost (a health-insurance premium) — annualized as 12 months ÷ total annual hours. */
  | { kind: 'monthly'; monthlyAmountCents: Cents };

export interface FringePlanContribution {
  plan: string;
  basis: FringeContributionBasis;
}

export interface AnnualizedFringeCredit {
  plan: string;
  /** The employer's total contribution to this plan for the year (12× a monthly premium; the stated amount for an annual one; for an hourly-basis plan this is left null, since it isn't derived from an annual figure). */
  annualContributionCents: Cents | null;
  /** The hourly fringe credit the employer may actually claim on a Davis-Bacon hour. */
  annualizedRatePerHourCents: Cents;
  /** false only for the hourly-all-hours basis, which is exempt from annualization. */
  requiredAnnualization: boolean;
}

/** Thrown when a plan that must be annualized is given zero (or negative) total annual hours — the divisor is undefined, and silently crediting $0 or dividing by zero would hide a data error. */
export class InvalidAnnualHoursError extends Error {
  readonly plan: string;
  readonly totalAnnualHours: number;
  constructor(plan: string, totalAnnualHours: number) {
    super(
      `Cannot annualize fringe plan "${plan}" over ${totalAnnualHours} total annual hours — ` +
        `a plan funded on an annual or monthly basis needs the worker's real total hours (public + private) ` +
        `to compute a creditable rate. Supply the hours, or express the plan on an hourly basis if it is one.`,
    );
    this.name = 'InvalidAnnualHoursError';
    this.plan = plan;
    this.totalAnnualHours = totalAnnualHours;
  }
}

/** The annual contribution figure a basis implies (null for an hourly-basis plan, which has no annual figure to divide). */
function annualContributionOf(basis: FringeContributionBasis): Cents | null {
  switch (basis.kind) {
    case 'annual':
      return basis.annualAmountCents;
    case 'monthly':
      return basis.monthlyAmountCents * 12;
    case 'hourly-all-hours':
      return null;
  }
}

/**
 * Annualize each plan's contribution over the worker's TOTAL annual hours
 * (public + private), returning the hourly fringe credit actually claimable
 * on a Davis-Bacon hour. Pure. An hourly-basis plan passes through at its
 * stated rate; every other basis is divided by `totalAnnualHoursWorked`.
 */
export function annualizeFringeCredits(
  contributions: readonly FringePlanContribution[],
  totalAnnualHoursWorked: number,
): AnnualizedFringeCredit[] {
  return contributions.map((c) => {
    if (c.basis.kind === 'hourly-all-hours') {
      return {
        plan: c.plan,
        annualContributionCents: null,
        annualizedRatePerHourCents: c.basis.ratePerHourCents,
        requiredAnnualization: false,
      };
    }
    if (totalAnnualHoursWorked <= 0) throw new InvalidAnnualHoursError(c.plan, totalAnnualHoursWorked);
    const annual = annualContributionOf(c.basis)!;
    return {
      plan: c.plan,
      annualContributionCents: annual,
      annualizedRatePerHourCents: roundDownToCent(annual / totalAnnualHoursWorked),
      requiredAnnualization: true,
    };
  });
}

/** Turn contributions into the FringeCredit[] a TradeWorkerProfile carries — the correctly annualized per-hour rates ready to feed the prevailing-wage resolver. */
export function fringeCreditsFromContributions(
  contributions: readonly FringePlanContribution[],
  totalAnnualHoursWorked: number,
): FringeCredit[] {
  return annualizeFringeCredits(contributions, totalAnnualHoursWorked).map((a) => ({
    plan: a.plan,
    ratePerHourCents: a.annualizedRatePerHourCents,
  }));
}

/** Total creditable fringe per hour across all plans, correctly annualized — what actually offsets the determination's fringe obligation. */
export function totalAnnualizedCreditPerHour(
  contributions: readonly FringePlanContribution[],
  totalAnnualHoursWorked: number,
): Cents {
  return annualizeFringeCredits(contributions, totalAnnualHoursWorked).reduce((sum, a) => sum + a.annualizedRatePerHourCents, 0);
}

export interface FringeAnnualizationFinding {
  plan: string;
  claimedPerHourCents: Cents;
  annualizedRatePerHourCents: Cents;
  /** claimed − annualized, when positive: the per-hour credit the employer over-claimed, i.e. the extra cash fringe actually owed on each Davis-Bacon hour. */
  overClaimedPerHourCents: Cents;
  message: string;
}

/**
 * Compare what an employer CLAIMED as an hourly fringe credit per plan against
 * the correctly annualized rate, and flag every plan where the claim is too
 * high. Each finding's overClaimedPerHourCents is real back-wage exposure:
 * cash fringe the worker should have received on every Davis-Bacon hour and
 * didn't. A claim at or below the annualized rate is compliant and produces no
 * finding.
 */
export function checkFringeAnnualization(
  claimed: readonly FringeCredit[],
  contributions: readonly FringePlanContribution[],
  totalAnnualHoursWorked: number,
): FringeAnnualizationFinding[] {
  const annualizedByPlan = new Map(
    annualizeFringeCredits(contributions, totalAnnualHoursWorked).map((a) => [a.plan, a.annualizedRatePerHourCents]),
  );

  const findings: FringeAnnualizationFinding[] = [];
  for (const c of claimed) {
    const annualized = annualizedByPlan.get(c.plan);
    if (annualized === undefined) continue; // nothing to compare against for this plan
    const overClaimed = c.ratePerHourCents - annualized;
    if (overClaimed <= 0) continue;
    findings.push({
      plan: c.plan,
      claimedPerHourCents: c.ratePerHourCents,
      annualizedRatePerHourCents: annualized,
      overClaimedPerHourCents: overClaimed,
      message:
        `Fringe plan "${c.plan}": claimed ${c.ratePerHourCents}¢/hr credit but the annualized rate is ` +
        `${annualized}¢/hr — ${overClaimed}¢/hr of cash fringe is owed on every Davis-Bacon hour.`,
    });
  }
  return findings;
}

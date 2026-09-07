/**
 * Omnia's pricing model, in one place.
 *
 * Usage-based, not tiered plans: every jurisdiction is included for
 * everyone, and you pay for the calculations you actually make. The
 * graduated bands below mean a bigger book pays less per call, not more
 * in total per client -- the thing the "per-employee-per-month" model
 * this project keeps criticising gets backwards.
 *
 * Calibrated so the archetype this site is written for -- roughly 400
 * clients averaging 20 employees, paid biweekly, ~208,000 calls a year --
 * lands near $19-20k/year. Change a band and that moves; the estimator on
 * index.html and the console's billing panel both read these numbers, so
 * they can't drift apart.
 *
 * NOTE: index.html's estimator script carries a copy of these constants
 * for its live client-side preview (there is no bundler in this project).
 * Change one, change the other -- server-side is the authority, and every
 * figure the customer is actually quoted or billed comes from here.
 */

export interface CallTier {
  /** Upper bound of this band, in calls per year. */
  upTo: number;
  /** Price per call within this band, in US dollars. */
  rate: number;
}

export const CALL_TIERS: CallTier[] = [
  { upTo: 25_000, rate: 0.12 },
  { upTo: 200_000, rate: 0.09 },
  { upTo: 1_000_000, rate: 0.06 },
  { upTo: Infinity, rate: 0.04 },
];

/** Rooftop address resolution, billed once per address -- not per pay run. */
export const ROOFTOP_RATE = 0.3;

/** Free evaluation window, in days, before a card is needed. */
export const TRIAL_DAYS = 14;

export const PERIODS_PER_YEAR: Record<string, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
};

/** Graduated cost of `calls` calculations over a year, in dollars. */
export function costForCalls(calls: number): number {
  let remaining = Math.max(0, calls);
  let previousBound = 0;
  let total = 0;
  for (const tier of CALL_TIERS) {
    const band = Math.min(remaining, tier.upTo - previousBound);
    if (band > 0) {
      total += band * tier.rate;
      remaining -= band;
    }
    previousBound = tier.upTo;
    if (remaining <= 0) break;
  }
  return total;
}

/** The marginal rate the next call would be billed at. */
export function marginalRate(calls: number): number {
  let previousBound = 0;
  for (const tier of CALL_TIERS) {
    if (calls < tier.upTo) return tier.rate;
    previousBound = tier.upTo;
  }
  return CALL_TIERS[CALL_TIERS.length - 1].rate;
}

export interface EstimateInput {
  employees: number;
  payFrequency: string;
  rooftop: boolean;
}

export interface EstimateBreakdown {
  employees: number;
  payFrequency: string;
  periodsPerYear: number;
  callsPerYear: number;
  calculationCost: number;
  rooftopCost: number;
  total: number;
  effectivePerCall: number;
}

export function estimate(input: EstimateInput): EstimateBreakdown {
  const periodsPerYear = PERIODS_PER_YEAR[input.payFrequency] ?? 26;
  const employees = Math.max(0, Math.round(input.employees));
  const callsPerYear = employees * periodsPerYear;
  const calculationCost = costForCalls(callsPerYear);
  // One resolution per employee address, not one per pay run -- see the
  // pricing copy on index.html, which makes the same promise.
  const rooftopCost = input.rooftop ? employees * ROOFTOP_RATE : 0;
  const total = calculationCost + rooftopCost;
  return {
    employees,
    payFrequency: input.payFrequency,
    periodsPerYear,
    callsPerYear,
    calculationCost: round2(calculationCost),
    rooftopCost: round2(rooftopCost),
    total: round2(total),
    effectivePerCall: callsPerYear > 0 ? round4(total / callsPerYear) : 0,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

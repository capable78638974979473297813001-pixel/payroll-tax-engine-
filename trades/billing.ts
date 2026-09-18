import type { Cents } from '../src/money.ts';

/**
 * Crewtally's price: $5 per active employee per month. Flat, legible, and the
 * kind of number a shop owner can hold in their head — no per-run fees, no
 * per-cheque metering, no tier that hides the local-tax states behind a
 * paywall. You pay for the people on your crew this month; a seasonal helper
 * who rolls off stops counting the month they leave.
 *
 * "Active" is the same test payroll uses for who gets paid (hired on or before
 * the date, not yet terminated) — see payroll/run.ts's activeEmployeesFor —
 * so the bill can never drift from the roster that actually ran payroll.
 */

export const PER_EMPLOYEE_CENTS: Cents = 500;

export interface Bill {
  headcount: number;
  perEmployeeCents: Cents;
  totalCents: Cents;
}

/** The monthly bill for a given active headcount. */
export function monthlyBill(activeHeadcount: number, perEmployeeCents: Cents = PER_EMPLOYEE_CENTS): Bill {
  const headcount = Math.max(0, Math.trunc(activeHeadcount));
  return { headcount, perEmployeeCents, totalCents: headcount * perEmployeeCents };
}

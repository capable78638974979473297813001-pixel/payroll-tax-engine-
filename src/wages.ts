import type { Cents } from './money.ts';
import { atLeastZero } from './money.ts';
import type { Deduction, Earning, PretaxCategory } from './types.ts';

/**
 * Earnings that enter a taxable base at all.
 *
 * Imputed income (group term life over $50k, personal use of a company car)
 * is taxable even though no cash changes hands. Reimbursements are the
 * mirror case: cash moves, nothing is taxable.
 */
export function taxableEarnings(earnings: readonly Earning[]): Cents {
  return earnings
    .filter((e) => e.category !== 'reimbursement')
    .reduce((sum, e) => sum + e.amount, 0);
}

/**
 * Supplemental earnings (bonus, commission) taxed for federal income tax at the
 * flat supplemental rate rather than through the annualize→bracket path.
 */
export function supplementalEarnings(earnings: readonly Earning[]): Cents {
  return earnings
    .filter((e) => e.category === 'supplemental')
    .reduce((sum, e) => sum + e.amount, 0);
}

/** Earnings actually paid in cash this period — the basis for net pay. */
export function cashEarnings(earnings: readonly Earning[]): Cents {
  return earnings
    .filter((e) => e.category !== 'imputed')
    .reduce((sum, e) => sum + e.amount, 0);
}

export function pretaxTotal(deductions: readonly Deduction[]): Cents {
  return deductions
    .filter((d) => d.category !== null)
    .reduce((sum, d) => sum + d.amount, 0);
}

export function posttaxTotal(deductions: readonly Deduction[]): Cents {
  return deductions
    .filter((d) => d.category === null)
    .reduce((sum, d) => sum + d.amount, 0);
}

/**
 * Build the taxable-wage resolver for one paycheck.
 *
 * Returns a function that, given the set of pre-tax categories a particular
 * tax exempts, produces that tax's own base. Two taxes on the same paycheck
 * routinely see different numbers here — that is the point, not a bug.
 */
export function makeTaxableWagesFn(
  earnings: readonly Earning[],
  deductions: readonly Deduction[],
): (exempt: readonly PretaxCategory[]) => Cents {
  const gross = taxableEarnings(earnings);

  return (exempt) => {
    const exemptSet = new Set(exempt);
    const reduction = deductions
      .filter((d) => d.category !== null && exemptSet.has(d.category))
      .reduce((sum, d) => sum + d.amount, 0);
    return atLeastZero(gross - reduction);
  };
}

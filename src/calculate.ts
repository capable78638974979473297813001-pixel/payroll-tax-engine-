import { toWholeDollars } from './money.ts';
import { PERIODS_PER_YEAR } from './types.ts';
import type {
  ComputeContext,
  PaycheckInput,
  PaycheckResult,
  TaxLine,
} from './types.ts';
import { yearOf } from './registry.ts';
import { federalTaxes } from './taxes/federal.ts';
import { stateIncomeTax } from './taxes/state.ts';
import {
  cashEarnings,
  makeTaxableWagesFn,
  posttaxTotal,
  pretaxTotal,
} from './wages.ts';

/**
 * Gross-to-net for a single paycheck.
 *
 * The driver knows nothing about specific taxes. It builds the context —
 * notably the per-tax taxable-wage resolver — and lets each rule declare its
 * own base, so a new jurisdiction never requires editing this function.
 */
export function calculatePaycheck(input: PaycheckInput): PaycheckResult {
  const periodsPerYear = PERIODS_PER_YEAR[input.payFrequency];
  if (!periodsPerYear) {
    throw new Error(`Unknown pay frequency: ${input.payFrequency}`);
  }

  const ctx: ComputeContext = {
    year: yearOf(input.checkDate),
    periodsPerYear,
    taxableWagesFor: makeTaxableWagesFn(input.earnings, input.deductions, {
      // A designated housing allowance leaves the tax base only for a
      // minister — see EarningCategory's own doc comment.
      housingAllowanceExcluded: input.employmentCategory === 'clergy',
    }),
  };

  let taxes: TaxLine[] = [
    ...federalTaxes(input, ctx),
    ...stateIncomeTax(input, ctx),
  ];

  if (input.roundToWholeDollars) {
    taxes = taxes.map((t) => ({ ...t, amount: toWholeDollars(t.amount) }));
  }

  const employeeTaxTotal = taxes
    .filter((t) => t.payer === 'employee')
    .reduce((sum, t) => sum + t.amount, 0);
  const employerTaxTotal = taxes
    .filter((t) => t.payer === 'employer')
    .reduce((sum, t) => sum + t.amount, 0);

  const gross = cashEarnings(input.earnings);
  const pretax = pretaxTotal(input.deductions);
  const posttax = posttaxTotal(input.deductions);

  return {
    checkDate: input.checkDate,
    grossPay: gross,
    pretaxDeductions: pretax,
    posttaxDeductions: posttax,
    taxes,
    employeeTaxTotal,
    employerTaxTotal,
    // Employer taxes are a cost to the employer, never a reduction of net pay.
    netPay: gross - pretax - posttax - employeeTaxTotal,
  };
}

import { toWholeDollars } from './money.ts';
import { PERIODS_PER_YEAR } from './types.ts';
import type {
  ComputeContext,
  PaycheckInput,
  PaycheckResult,
  TaxLine,
} from './types.ts';
import { federalRuleset, yearOf } from './registry.ts';
import { federalTaxes } from './taxes/federal.ts';
import { stateIncomeTax } from './taxes/state.ts';
import {
  capElectiveDeferrals,
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

  // Cap 401(k)/403(b)/457/SIMPLE deductions at their IRC annual elective-
  // deferral limits before ANY tax reads the deduction list — see
  // capElectiveDeferrals()'s own doc comment in wages.ts. Net pay is
  // unaffected (the same total dollar amount still leaves the paycheck);
  // this only changes which taxes see an over-limit amount as taxable.
  const effectiveDeductions = capElectiveDeferrals(
    input.deductions,
    input.ytd.electiveDeferrals,
    federalRuleset(input.checkDate).electiveDeferralLimits,
  );

  const ctx: ComputeContext = {
    year: yearOf(input.checkDate),
    periodsPerYear,
    taxableWagesFor: makeTaxableWagesFn(input.earnings, effectiveDeductions, {
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
  const pretax = pretaxTotal(effectiveDeductions);
  const posttax = posttaxTotal(effectiveDeductions);

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

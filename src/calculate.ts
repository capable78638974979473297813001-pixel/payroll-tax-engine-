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
    taxes = taxes.map((t) => (isIncomeTaxWithholding(t) ? { ...t, amount: toWholeDollars(t.amount) } : t));
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

/**
 * Local taxes that are income taxes on wages. Occupational license fees
 * (AL_LOCAL, KY_LOCAL) and flat head taxes (PA_LST, WV_LOCAL_FEE) are not.
 */
const LOCAL_INCOME_TAX_IDS = new Set([
  'OH_LOCAL', 'OH_JEDD', 'OH_SDIT', 'PA_EIT', 'MI_LOCAL', 'OR_METRO_SHS', 'OR_MULTNOMAH_PFA', 'WILMINGTON_WAGE',
]);

/**
 * Whether a line is withheld income tax, the only kind the whole-dollar
 * option may round (docs/rounding-and-precision.md rule 7). FICA, RRTA,
 * unemployment, disability, paid leave and employer taxes stay in cents so
 * Form 941 and the state wage reports tie to the cent.
 */
export function isIncomeTaxWithholding(line: TaxLine): boolean {
  if (line.payer !== 'employee') return false;
  return (
    line.id === 'US_FIT' ||
    line.id === 'US_FIT_SUPP' ||
    /_SIT(_|$)/.test(line.id) ||
    /^[A-Z]{2}_COUNTY(_|$)/.test(line.id) ||
    LOCAL_INCOME_TAX_IDS.has(line.id)
  );
}

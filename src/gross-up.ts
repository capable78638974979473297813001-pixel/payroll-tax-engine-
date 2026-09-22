import { calculatePaycheck } from './calculate.ts';
import type { Cents } from './money.ts';
import type { Earning, PaycheckInput, PaycheckResult } from './types.ts';

/**
 * Net-to-gross. Given a target take-home pay, find the cash earning that
 * produces it under the same paycheck the caller would have passed to
 * calculatePaycheck() — federal, state, and local taxes included, because
 * the search calls that function rather than reimplementing a tax.
 *
 * The solved earning is one line (REG / regular, unless variableEarning
 * names another). Every other earning and every deduction stays at the
 * amount the caller supplied.
 *
 * The search treats net pay as non-decreasing in that earning. That holds
 * for ordinary wages. It does not hold for a coverage-threshold category
 * (household, agricultural, election worker), where one extra dollar can
 * pull an entire year of wages into FICA at once and net pay can fall.
 * Those categories throw if the search cannot land on the target.
 */
export interface GrossUpInput {
  /** Desired employee net pay, in cents. */
  targetNetPay: Cents;
  /**
   * The paycheck to solve. `earnings` may be omitted. A line matching
   * variableEarning is replaced; every other line is held fixed.
   */
  paycheck: Omit<PaycheckInput, 'earnings'> & { earnings?: Earning[] };
  /** Which earning is solved for. Defaults to code REG, category regular. */
  variableEarning?: { code: string; category: Earning['category'] };
}

export interface GrossUpResult {
  /** The solved earning, in cents. */
  variableEarningAmount: Cents;
  paycheck: PaycheckInput;
  result: PaycheckResult;
  iterations: number;
}

const MAX_ITERATIONS = 48;

function withVariable(
  paycheck: GrossUpInput['paycheck'],
  amount: Cents,
  spec: { code: string; category: Earning['category'] },
): PaycheckInput {
  const others = (paycheck.earnings ?? []).filter(
    (e) => !(e.code === spec.code && e.category === spec.category),
  );
  return {
    ...paycheck,
    earnings: [...others, { code: spec.code, category: spec.category, amount }],
  };
}

/**
 * Smallest variable earning whose net pay is at least the target.
 * Returns null when the amount cannot reach the target inside the cap,
 * which is how a non-monotonic coverage threshold reports failure.
 */
function solve(input: GrossUpInput, spec: { code: string; category: Earning['category'] }): {
  amount: Cents;
  iterations: number;
} | null {
  const netAt = (amount: Cents) => calculatePaycheck(withVariable(input.paycheck, amount, spec)).netPay;

  let iterations = 0;
  let lo = 0;
  let hi = Math.max(input.targetNetPay, 1);
  let hiNet = netAt(hi);
  iterations++;
  const ceiling = Math.max(input.targetNetPay * 4, input.targetNetPay + 50_000_000);
  while (hiNet < input.targetNetPay && hi < ceiling) {
    lo = hi;
    hi = Math.min(hi * 2, ceiling);
    hiNet = netAt(hi);
    iterations++;
    if (iterations > MAX_ITERATIONS) return null;
  }
  if (hiNet < input.targetNetPay) return null;

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    iterations++;
    if (iterations > MAX_ITERATIONS) return null;
    if (netAt(mid) >= input.targetNetPay) hi = mid;
    else lo = mid + 1;
  }

  if (netAt(lo) < input.targetNetPay) return null;
  return { amount: lo, iterations };
}

export function grossUp(input: GrossUpInput): GrossUpResult {
  if (!Number.isInteger(input.targetNetPay) || input.targetNetPay < 0) {
    throw new Error(`targetNetPay must be a non-negative integer number of cents, got ${String(input.targetNetPay)}.`);
  }
  const spec = input.variableEarning ?? { code: 'REG', category: 'regular' as const };
  const solved = solve(input, spec);
  if (!solved) {
    throw new Error(
      `No earning amount produces a net pay of ${input.targetNetPay} cents. ` +
        `Gross-up assumes net pay rises with the solved earning, which is true for ordinary wages ` +
        `and false when a coverage threshold (household, agricultural, election worker) taxes a prior amount all at once.`,
    );
  }
  const paycheck = withVariable(input.paycheck, solved.amount, spec);
  return {
    variableEarningAmount: solved.amount,
    paycheck,
    result: calculatePaycheck(paycheck),
    iterations: solved.iterations,
  };
}

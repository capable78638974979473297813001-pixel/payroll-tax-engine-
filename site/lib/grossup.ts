import type { PaycheckInput, PaycheckResult } from '../../src/types.ts';

/**
 * Net-to-gross: find the amount of one earning that leaves the employee a
 * given take-home pay. The engine only goes forward (gross to net), so this
 * searches: it runs the real engine on candidate amounts, in whole cents,
 * and keeps the smallest amount whose net pay reaches the target. Every
 * number returned is an engine result, not an estimate.
 *
 * Net pay does not always land on every cent. Where a tax step or a
 * rounding rule makes a one-cent change in gross move net by two cents, the
 * target can be skipped. Then the answer is the smallest amount that gets
 * at least the target, and `exact` is false with the shortfall/overage shown.
 */

export class GrossUpRefusal extends Error {
  code: 'cannot_gross_up';
  constructor(message: string, code: 'cannot_gross_up') {
    super(message);
    this.code = code;
  }
}

export interface GrossUp {
  targetNetPay: number;
  /** The earning that was solved for, and the amount found. */
  earningIndex: number;
  amount: number;
  /** Net pay at that amount. Equal to the target when exact. */
  netPay: number;
  /** netPay - targetNetPay: 0 when exact, otherwise the cents over. */
  overTarget: number;
  exact: boolean;
  /** Cents of net pay the largest amount below the answer produces, when the target was skipped. */
  netPayOneCentLess: number | null;
  /** The extra gross, over the net asked for, that tax and deductions take. */
  grossPay: number;
  iterations: number;
  input: PaycheckInput;
  result: PaycheckResult;
}

const MAX_AMOUNT = 100_000_000_00; // $100M of a single earning: well past any real payroll
const MAX_RUNS = 120;

export function solveGrossUp(
  base: PaycheckInput,
  earningIndex: number,
  targetNetPay: number,
  run: (input: PaycheckInput) => PaycheckResult,
): GrossUp {
  const earning = base.earnings[earningIndex];
  if (!earning) throw new GrossUpRefusal(`earnings[${earningIndex}] does not exist.`, 'cannot_gross_up');
  if (earning.category === 'imputed') {
    throw new GrossUpRefusal('An imputed earning adds tax and no cash, so no amount of it can reach a take-home target. Pick a cash earning.', 'cannot_gross_up');
  }

  let runs = 0;
  const at = (amount: number): { input: PaycheckInput; result: PaycheckResult | null } => {
    runs += 1;
    if (runs > MAX_RUNS) throw new GrossUpRefusal('The search did not settle. Net pay does not rise steadily with this earning for this input.', 'cannot_gross_up');
    const input: PaycheckInput = { ...base, earnings: base.earnings.map((e, i) => (i === earningIndex ? { ...e, amount } : e)) };
    try {
      return { input, result: run(input) };
    } catch {
      // Too little pay for the deductions, or an input the engine cannot run at this amount.
      return { input, result: null };
    }
  };
  const net = (r: { result: PaycheckResult | null }) => (r.result ? r.result.netPay : -Infinity);

  // Find an amount that reaches the target by doubling, then bisect down.
  let lo = 0; // known to be below the target (or unrunnable)
  let hi = Math.max(targetNetPay, 100);
  let hiRun = at(hi);
  while (net(hiRun) < targetNetPay) {
    lo = hi;
    hi *= 2;
    if (hi > MAX_AMOUNT) throw new GrossUpRefusal('No amount of this earning reaches that take-home pay with these deductions and withholdings.', 'cannot_gross_up');
    hiRun = at(hi);
  }
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    const m = at(mid);
    if (net(m) >= targetNetPay) { hi = mid; hiRun = m; } else lo = mid;
  }
  // lo may itself reach the target when hi - lo started at 1 with lo = 0.
  const loRun = lo === 0 ? at(0) : null;
  if (loRun && net(loRun) >= targetNetPay) { hi = 0; hiRun = loRun; }

  const result = hiRun.result!;
  const overTarget = result.netPay - targetNetPay;
  let netPayOneCentLess: number | null = null;
  if (overTarget !== 0 && hi > 0) {
    const below = at(hi - 1);
    netPayOneCentLess = below.result ? below.result.netPay : null;
  }
  return {
    targetNetPay,
    earningIndex,
    amount: hi,
    netPay: result.netPay,
    overTarget,
    exact: overTarget === 0,
    netPayOneCentLess,
    grossPay: result.grossPay,
    iterations: runs,
    input: hiRun.input,
    result,
  };
}

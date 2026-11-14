/**
 * Net pay that cannot go below zero once a garnishment is taken.
 *
 * calculatePaycheck() deliberately never drops a withholding on its own: when
 * taxes and deductions exceed the pay it returns a negative netPay and a
 * warning (see the `warnings` doc on PaycheckResult). That is the right
 * default for a calculator, but a real payroll cannot pay a negative cheque.
 * This module is the opt-in layer that decides what gives.
 *
 * The order of priority it applies is the one payroll practice and the law
 * agree on:
 *
 *   1. Employee taxes. Social Security and Medicare are owed on a 401(k)
 *      deferral too, so they stay even when the deferral takes all the cash.
 *   2. Court-ordered garnishments, up to the CCPA ceiling (see garnishment.ts).
 *   3. Voluntary deductions, cut back only as far as needed so the cheque
 *      lands on exactly $0.00 instead of below it. They are not all equal, so
 *      they are cut in tiers (see cutTier()): post-tax first, then retirement
 *      deferrals, then commuter and dependent-care benefits, and last of all
 *      the cafeteria-plan elections (section 125 premiums, HSA, FSA), which
 *      a plan generally locks for the year, so cutting one is flagged.
 *
 * Cutting a voluntary PRE-tax deduction raises taxable wages, which can raise
 * income tax, which lowers disposable earnings, which can lower the
 * garnishment. So the cut cannot be worked out in one step. net-after-garnishment
 * only ever rises as more is cut, which makes the smallest sufficient cut
 * findable by binary search, and the answer is verified by running the real
 * engine on it, never estimated.
 */

import { calculatePaycheck } from './calculate.ts';
import { calculateGarnishments } from './garnishment.ts';
import { fmt } from './money.ts';
import type { Cents } from './money.ts';
import type { GarnishmentOrder, GarnishmentResult } from './garnishment.ts';
import type { Deduction, PaycheckInput, PaycheckResult, PretaxCategory } from './types.ts';

export interface DeductionReduction {
  code: string;
  /** What the employee elected. */
  requested: Cents;
  /** What could be taken without taking the cheque below $0.00. */
  applied: Cents;
}

export interface PretaxTaxSaving {
  code: string;
  category: PretaxCategory;
  /** The amount taken on this check. */
  amount: Cents;
  /** Employee tax (federal, state, local, FICA) that amount avoided. */
  taxSaved: Cents;
}

export interface PaycheckWithGarnishmentsInput {
  paycheck: PaycheckInput;
  orders: GarnishmentOrder[];
  /**
   * Codes of deductions that must NOT be cut (a court-ordered post-tax item
   * the caller models as a deduction, a union dues check-off the employer has
   * agreed to protect). Every other deduction on the paycheck is treated as
   * voluntary.
   */
  protectedDeductionCodes?: string[];
  /**
   * The order voluntary deductions are cut in, first cut first, by code.
   * Codes not listed follow, in the default order: by cutTier() (post-tax,
   * then retirement deferrals, then commuter/dependent care, then cafeteria
   * plan elections), and within a tier the one listed LAST first.
   */
  reductionOrder?: string[];
}

export interface PaycheckWithGarnishmentsResult {
  /** The paycheck as calculated with the deductions actually taken. */
  paycheck: PaycheckResult;
  garnishments: GarnishmentResult;
  /** The deductions actually taken, in the input's order. */
  deductions: Deduction[];
  /** Only the deductions that were cut. Empty when everything fit. */
  reductions: DeductionReduction[];
  /** paycheck.netPay less every garnishment withheld. Never below zero unless warnings say why. */
  netPayAfterGarnishments: Cents;
  /**
   * What each pre-tax deduction actually taken saves in employee tax on this
   * check, worked out by running the engine again with that one deduction
   * removed and the others left alone. Because the taxes interact (a bracket
   * boundary, a wage-base cap), the per-deduction figures need not add up to
   * `totalPretaxTaxSavings`.
   */
  taxSavings: PretaxTaxSaving[];
  /** The same measure for all pre-tax deductions removed together. */
  totalPretaxTaxSavings: Cents;
  warnings: string[];
}

/**
 * Default cut priority, lowest first.
 *
 *   0  post-tax deductions: cutting one changes no tax.
 *   1  retirement deferrals (401(k), 403(b), 457(b), SIMPLE): an employee can
 *      change or stop these at any time.
 *   2  commuter and dependent-care benefits.
 *   3  section 125 premiums, HSA and FSA: cafeteria-plan elections are
 *      generally irrevocable for the plan year outside a qualifying event, so
 *      they go last and a cut is flagged for the employer to confirm.
 */
export function cutTier(category: PretaxCategory | null): 0 | 1 | 2 | 3 {
  switch (category) {
    case null:
      return 0;
    case 'deferral_401k':
    case 'deferral_403b':
    case 'deferral_457':
    case 'deferral_simple':
      return 1;
    case 'commuter':
    case 'dependent_care':
      return 2;
    default:
      return 3; // section125, hsa, fsa
  }
}

const CAFETERIA: ReadonlySet<PretaxCategory> = new Set(['section125', 'hsa', 'fsa']);

function run(input: PaycheckWithGarnishmentsInput, deductions: Deduction[]) {
  const paycheck = calculatePaycheck({ ...input.paycheck, deductions });
  const garnishments = calculateGarnishments({
    checkDate: input.paycheck.checkDate,
    payFrequency: input.paycheck.payFrequency,
    workState: input.paycheck.workState?.code ?? '',
    paycheck,
    orders: input.orders,
  });
  return { paycheck, garnishments, net: paycheck.netPay - garnishments.totalWithheld };
}

/** One trial of the cut search: what the cheque looks like if `cut` cents come off the voluntary deductions. */
export interface NetPayFloorStep {
  /**
   * `elected`: nothing cut. `all-cut`: every voluntary deduction cut, to see
   * whether any cut can work. `search`: one probe of the binary search.
   * `final`: the answer the search settled on.
   */
  phase: 'elected' | 'all-cut' | 'search' | 'final';
  cut: Cents;
  deductions: Deduction[];
  employeeTaxes: Cents;
  garnished: Cents;
  /** Net pay after taxes, deductions and garnishments. */
  net: Cents;
  /** net >= 0: this cut is enough. */
  fits: boolean;
}

type Trial = ReturnType<typeof run>;

function stepOf(phase: NetPayFloorStep['phase'], cut: Cents, deductions: Deduction[], t: Trial): NetPayFloorStep {
  return { phase, cut, deductions, employeeTaxes: t.paycheck.employeeTaxTotal, garnished: t.garnishments.totalWithheld, net: t.net, fits: t.net >= 0 };
}

/**
 * The same calculation as calculatePaycheckWithGarnishments(), as a
 * generator: it yields every trial it runs, in order, and RETURNS the final
 * result. Use it to show how the engine reached $0.00, or to debug a cut that
 * looks wrong. `for...of` sees only the steps; call .next() until `done` to
 * get the return value, or just call calculatePaycheckWithGarnishments().
 */
export function* netPayFloorSteps(
  input: PaycheckWithGarnishmentsInput,
): Generator<NetPayFloorStep, PaycheckWithGarnishmentsResult, undefined> {
  const original = input.paycheck.deductions;
  const protectedCodes = new Set(input.protectedDeductionCodes ?? []);
  const explicit = input.reductionOrder ?? [];

  // Indices of cuttable deductions, first cut first.
  const rank = (i: number): [number, number] => {
    const e = explicit.indexOf(original[i].code);
    return [e === -1 ? 1 : 0, e === -1 ? 0 : e];
  };
  const cuttable = original
    .map((_, i) => i)
    .filter((i) => !protectedCodes.has(original[i].code) && original[i].amount > 0)
    .sort((a, b) => {
      const [ea, oa] = rank(a);
      const [eb, ob] = rank(b);
      if (ea !== eb) return ea - eb;
      if (ea === 0) return oa - ob;
      const ta = cutTier(original[a].category);
      const tb = cutTier(original[b].category);
      if (ta !== tb) return ta - tb;
      return b - a;
    });
  const totalCuttable = cuttable.reduce((sum, i) => sum + original[i].amount, 0);

  // `cut` cents taken off the deductions, in priority order.
  const withCut = (cut: Cents): Deduction[] => {
    const out = original.map((d) => ({ ...d }));
    let left = cut;
    for (const i of cuttable) {
      const take = Math.min(left, out[i].amount);
      out[i].amount -= take;
      left -= take;
      if (left === 0) break;
    }
    return out;
  };

  const warnings: string[] = [];
  let best = run(input, original);
  yield stepOf('elected', 0, original, best);
  let cut = 0;

  if (best.net < 0) {
    const atMax = run(input, withCut(totalCuttable));
    yield stepOf('all-cut', totalCuttable, withCut(totalCuttable), atMax);
    if (atMax.net < 0) {
      // Even with every voluntary deduction gone the cheque cannot cover what
      // the caller marked as protected. Say so rather than pretend.
      cut = totalCuttable;
      best = atMax;
      warnings.push(
        `Even with every voluntary deduction cut, taxes, garnishments and protected deductions are ` +
          `${fmt(-atMax.net)} more than this paycheck. Net pay is negative; nothing protected was reduced.`,
      );
    } else {
      // Smallest cut with net >= 0. Net after garnishment never falls as the cut grows.
      let lo = 0;
      let hi = totalCuttable;
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        const probe = run(input, withCut(mid));
        yield stepOf('search', mid, withCut(mid), probe);
        if (probe.net >= 0) hi = mid;
        else lo = mid + 1;
      }
      cut = lo;
      best = run(input, withCut(cut));
    }
  }

  const deductions = withCut(cut);
  yield stepOf('final', cut, deductions, best);
  const reductions: DeductionReduction[] = original
    .map((d, i) => ({ code: d.code, requested: d.amount, applied: deductions[i].amount }))
    .filter((r) => r.applied !== r.requested);
  for (const r of reductions) {
    warnings.push(
      `Deduction ${r.code} was cut from ${fmt(r.requested)} to ${fmt(r.applied)} so net pay after ` +
        `taxes and garnishments is not below $0.00.`,
    );
    const cat = original.find((d) => d.code === r.code)?.category;
    if (cat && CAFETERIA.has(cat)) {
      warnings.push(
        `${r.code} is a cafeteria-plan election (${cat}). Plans generally lock these for the plan year ` +
          `outside a qualifying event, so confirm the plan allows this reduction before paying the cheque.`,
      );
    }
  }

  // Tax each pre-tax deduction saved: the engine again, minus that deduction.
  const employeeTaxes = (ds: Deduction[]) => calculatePaycheck({ ...input.paycheck, deductions: ds }).employeeTaxTotal;
  const actualTaxes = best.paycheck.employeeTaxTotal;
  const taxSavings: PretaxTaxSaving[] = [];
  for (let i = 0; i < deductions.length; i++) {
    const d = deductions[i];
    if (d.category === null || d.amount <= 0) continue;
    taxSavings.push({ code: d.code, category: d.category, amount: d.amount, taxSaved: employeeTaxes(deductions.filter((_, j) => j !== i)) - actualTaxes });
  }
  const totalPretaxTaxSavings = taxSavings.length
    ? employeeTaxes(deductions.filter((d) => d.category === null)) - actualTaxes
    : 0;

  return {
    paycheck: best.paycheck,
    garnishments: best.garnishments,
    deductions,
    reductions,
    netPayAfterGarnishments: best.net,
    taxSavings,
    totalPretaxTaxSavings,
    warnings,
  };
}

export function calculatePaycheckWithGarnishments(
  input: PaycheckWithGarnishmentsInput,
): PaycheckWithGarnishmentsResult {
  const steps = netPayFloorSteps(input);
  let next = steps.next();
  while (!next.done) next = steps.next();
  return next.value;
}

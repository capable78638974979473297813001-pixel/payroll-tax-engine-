/**
 * Court-ordered and administrative wage garnishments.
 *
 * A garnishment answers a different question than every other tax in this
 * engine: not "how much is owed," but "how much of THIS paycheck can
 * lawfully be taken toward a debt that already exists." The Consumer Credit
 * Protection Act (CCPA), Title III, sets a federal ceiling that applies in
 * every state; a handful of states set a LOWER ceiling — or none at all —
 * for ORDINARY consumer/creditor debt specifically. That state-level
 * variation never touches support orders or a federal student loan
 * default: both are federal law and preempt a state's own wage-exemption
 * statute entirely, the same footing a federal tax levy would sit on (see
 * data/garnishment/federal-2026.json's $scopeNote for why a tax levy isn't
 * modelled here at all — its exempt amount comes from an IRS table keyed to
 * filing status and dependents, not a fixed CCPA fraction).
 *
 * This module deliberately runs AFTER calculatePaycheck(), never inside it.
 * A garnishment cap is computed from DISPOSABLE EARNINGS, which the CCPA
 * defines as gross pay less only the taxes actually withheld — NOT pretax
 * deductions like a 401(k) deferral or a section 125 premium. That is the
 * single most common mistake in home-grown garnishment code: a pretax
 * deduction lowers what an employee is TAXED on, but the CCPA still counts
 * it as part of disposable earnings, because it's the employee's own money
 * redirected by choice, not a legally required withholding. See
 * disposableEarnings() below.
 *
 * Multiple simultaneous orders share ONE aggregate ceiling, not several
 * stacked ones:
 *   - A support order (or several) draws first, capped in aggregate at the
 *     CCPA support ceiling (50/55/60/65% of disposable earnings).
 *   - Every other order — ordinary consumer/creditor garnishment, federal
 *     student loan default — draws afterward from whatever room remains
 *     under that SAME ceiling (25% when no support order exists at all),
 *     each ALSO bound by its own individual statutory cap: a student loan
 *     default can never take more than 15% no matter how much room a 55%
 *     support ceiling would otherwise leave, and an ordinary garnishment
 *     already at its own 25% leaves nothing for anything junior to it. This
 *     mirrors real payroll practice: a second consumer garnishment queues
 *     behind the first rather than stacking on top of it.
 */

import { applyRate, atLeastZero, dollars, fmt, roundHalfUp } from './money.ts';
import { PERIODS_PER_YEAR } from './types.ts';
import type { Cents } from './money.ts';
import type { PayFrequency, PaycheckResult } from './types.ts';
import type { GarnishmentFederalRuleset, GarnishmentStateOverride } from './registry.ts';
import { garnishmentFederalRuleset, garnishmentStateOverride } from './registry.ts';

export type GarnishmentOrderType =
  | 'consumer_creditor'
  | 'child_support'
  | 'federal_student_loan_default';

export interface GarnishmentOrder {
  /** Caller's own identifier for this order — echoed back on its result line. */
  id: string;
  type: GarnishmentOrderType;
  /**
   * The amount the underlying order actually demands THIS pay period. The
   * engine withholds the LESSER of this and the statutory ceiling — never
   * more than the order itself asks for, even where the law would allow
   * more. Pass Number.MAX_SAFE_INTEGER to mean "withhold the maximum the
   * law allows" rather than a fixed dollar figure.
   */
  amountOrdered: Cents;
  /**
   * child_support only: is the employee ALSO currently supporting a spouse
   * or child not covered by this particular order? Decides the 50%/55%
   * ceiling (true) vs. 60%/65% (false) — never defaulted, same discipline
   * as every other eligibility fact this engine refuses to guess.
   */
  supportingOtherFamily?: boolean;
  /** child_support only: is any part of this order more than 12 weeks in arrears? Adds 5 points to whichever ceiling applies. */
  arrearsOver12Weeks?: boolean;
  /**
   * Among orders that are NOT child_support, the lower number draws first
   * when they compete for room under the aggregate ceiling. child_support
   * orders always draw first regardless of this field. Ties keep array
   * order (stable sort).
   */
  priority?: number;
}

export interface GarnishmentLine {
  orderId: string;
  type: GarnishmentOrderType;
  withheld: Cents;
  detail: string;
}

export interface GarnishmentResult {
  /** Gross pay less every employee-paid tax line — see disposableEarnings(). */
  disposableEarnings: Cents;
  /** The combined ceiling every order on this paycheck draws from — 25% of disposable earnings absent a support order, or the applicable support-order fraction when one exists. */
  aggregateCeiling: Cents;
  lines: GarnishmentLine[];
  totalWithheld: Cents;
}

export interface GarnishmentInput {
  checkDate: string;
  payFrequency: PayFrequency;
  /** Two-letter work-state code — decides whether a state override applies. Only ever consulted for consumer_creditor orders; see this module's own header comment. */
  workState: string;
  /** The already-computed paycheck this garnishment run is layered onto. */
  paycheck: PaycheckResult;
  orders: GarnishmentOrder[];
}

/**
 * Disposable earnings per the CCPA: gross pay less only what's actually
 * withheld for federal, state and local taxes and the employee's share of
 * Social Security/Medicare/state unemployment or disability — i.e. every
 * `payer: 'employee'` tax line calculatePaycheck() already produced.
 * Pretax deductions are deliberately NOT subtracted here — see this
 * module's own header comment for why that's correct, not an oversight.
 */
export function disposableEarnings(paycheck: PaycheckResult): Cents {
  const mandatoryTax = paycheck.taxes
    .filter((t) => t.payer === 'employee')
    .reduce((sum, t) => sum + t.amount, 0);
  return atLeastZero(paycheck.grossPay - mandatoryTax);
}

/**
 * 29 CFR 870.10 names 30/60/65/130 for weekly/biweekly/semimonthly/monthly.
 * Every other frequency this engine supports is this project's own
 * consistent extension of that same ratio — see federal-2026.json's $note.
 */
function multiplierForPeriod(payFrequency: PayFrequency, weeklyMultiplier: number): number {
  const periodsPerYear = PERIODS_PER_YEAR[payFrequency];
  return weeklyMultiplier * (52 / periodsPerYear);
}

function minimumWageFloor(
  hourlyWage: number,
  payFrequency: PayFrequency,
  weeklyMultiplier: number,
): Cents {
  return roundHalfUp(dollars(hourlyWage) * multiplierForPeriod(payFrequency, weeklyMultiplier));
}

interface CapResult {
  cap: Cents;
  detail: string;
}

/** null return means the state prohibits ordinary garnishment outright. */
function ordinaryGarnishmentCap(
  disposable: Cents,
  gross: Cents,
  workState: string,
  payFrequency: PayFrequency,
  fed: GarnishmentFederalRuleset,
  override: GarnishmentStateOverride | undefined,
): CapResult | null {
  if (override?.ordinaryGarnishmentProhibited) return null;

  if (override?.ordinaryGarnishment) {
    const cfg = override.ordinaryGarnishment;
    const floor = minimumWageFloor(cfg.stateMinimumHourlyWage, payFrequency, cfg.minimumWageWeeklyMultiplier);
    const byFloor = atLeastZero(disposable - floor);
    const byFraction =
      cfg.maxGrossEarningsFraction != null
        ? applyRate(gross, cfg.maxGrossEarningsFraction)
        : applyRate(disposable, cfg.maxDisposableEarningsFraction ?? 0.25);
    const basis = cfg.maxGrossEarningsFraction != null ? 'gross' : 'disposable';
    const fraction = cfg.maxGrossEarningsFraction ?? cfg.maxDisposableEarningsFraction ?? 0.25;
    return {
      cap: Math.min(byFloor, byFraction),
      detail:
        `${workState} ordinary-garnishment cap (state override): lesser of ` +
        `${(fraction * 100).toFixed(0)}% of ${basis} and ${fmt(disposable)} disposable over ` +
        `${cfg.minimumWageWeeklyMultiplier}x $${cfg.stateMinimumHourlyWage.toFixed(2)}/hr min wage (${fmt(floor)})`,
    };
  }

  const rule = fed.ordinaryGarnishment;
  const floor = minimumWageFloor(fed.federalMinimumHourlyWage, payFrequency, rule.minimumWageWeeklyMultiplier);
  const byFloor = atLeastZero(disposable - floor);
  const byFraction = applyRate(disposable, rule.maxDisposableEarningsFraction);
  return {
    cap: Math.min(byFloor, byFraction),
    detail:
      `federal CCPA ordinary-garnishment cap: lesser of 25% of ${fmt(disposable)} disposable and ` +
      `disposable over ${rule.minimumWageWeeklyMultiplier}x $${fed.federalMinimumHourlyWage}/hr federal min wage (${fmt(floor)})`,
  };
}

function studentLoanCap(
  disposable: Cents,
  payFrequency: PayFrequency,
  fed: GarnishmentFederalRuleset,
): CapResult {
  const rule = fed.studentLoanDefault;
  const floor = minimumWageFloor(fed.federalMinimumHourlyWage, payFrequency, rule.minimumWageWeeklyMultiplier);
  const byFloor = atLeastZero(disposable - floor);
  const byFraction = applyRate(disposable, rule.maxDisposableEarningsFraction);
  return {
    cap: Math.min(byFloor, byFraction),
    detail:
      `federal student-loan default cap (34 CFR 34.19): lesser of 15% of ${fmt(disposable)} disposable ` +
      `and disposable over ${rule.minimumWageWeeklyMultiplier}x $${fed.federalMinimumHourlyWage}/hr federal min wage (${fmt(floor)}), ` +
      `also bound by the paycheck's aggregate CCPA ceiling`,
  };
}

/**
 * Compute what may lawfully be withheld from ONE paycheck across every
 * garnishment order in effect, applying the CCPA ceilings (federal, plus
 * any researched state override for ordinary garnishment) and the
 * aggregate-room accounting this module's header comment describes.
 *
 * Runs after calculatePaycheck() — feed its PaycheckResult in as
 * `input.paycheck`. The returned totalWithheld is a post-tax deduction the
 * caller applies exactly like any other (category: null); this function
 * only decides how much CAN be withheld, never mutates the paycheck.
 */
export function calculateGarnishments(input: GarnishmentInput): GarnishmentResult {
  const { checkDate, payFrequency, workState, paycheck, orders } = input;
  const disposable = disposableEarnings(paycheck);
  const gross = paycheck.grossPay;
  const fed = garnishmentFederalRuleset(checkDate);
  const override = garnishmentStateOverride(workState, checkDate);

  const supportOrders = orders.filter((o) => o.type === 'child_support');
  const otherOrders = orders
    .filter((o) => o.type !== 'child_support')
    .slice()
    .sort((a, b) => (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER));

  const lines: GarnishmentLine[] = [];

  // No support order: the aggregate ceiling every other order shares is the
  // plain 25% ordinary-garnishment fraction. A support order, if present,
  // replaces this with its own (higher) fraction below.
  let aggregateCeiling = applyRate(disposable, fed.ordinaryGarnishment.maxDisposableEarningsFraction);

  if (supportOrders.length > 0) {
    const supportingOtherFamily = supportOrders.some((o) => o.supportingOtherFamily);
    const inArrears = supportOrders.some((o) => o.arrearsOver12Weeks);
    let fraction = supportingOtherFamily
      ? fed.supportOrder.supportingOtherFamilyFraction
      : fed.supportOrder.notSupportingOtherFamilyFraction;
    if (inArrears) fraction += fed.supportOrder.arrearsBonusFraction;
    aggregateCeiling = applyRate(disposable, fraction);

    const demandedTotal = supportOrders.reduce((s, o) => s + o.amountOrdered, 0);
    const withheldTotal = Math.min(demandedTotal, aggregateCeiling);
    const ceilingDetail =
      `${(fraction * 100).toFixed(0)}% CCPA support-order ceiling ` +
      `(${supportingOtherFamily ? 'supporting another spouse/child' : 'not supporting another spouse/child'}` +
      `${inArrears ? ', 12+ weeks in arrears' : ''}) on ${fmt(disposable)} disposable`;

    for (const order of supportOrders) {
      const share =
        demandedTotal > 0 ? roundHalfUp((order.amountOrdered / demandedTotal) * withheldTotal) : 0;
      lines.push({
        orderId: order.id,
        type: 'child_support',
        withheld: share,
        detail:
          supportOrders.length > 1
            ? `${ceilingDetail}, prorated across ${supportOrders.length} support orders by each order's own demanded amount`
            : ceilingDetail,
      });
    }
  }

  let room = atLeastZero(aggregateCeiling - lines.reduce((s, l) => s + l.withheld, 0));

  for (const order of otherOrders) {
    const individualCap =
      order.type === 'consumer_creditor'
        ? ordinaryGarnishmentCap(disposable, gross, workState, payFrequency, fed, override)
        : studentLoanCap(disposable, payFrequency, fed);

    if (individualCap === null) {
      lines.push({
        orderId: order.id,
        type: order.type,
        withheld: 0,
        detail: `ordinary wage garnishment for consumer debt is prohibited in ${workState}`,
      });
      continue;
    }

    const withheld = Math.max(0, Math.min(order.amountOrdered, individualCap.cap, room));
    room -= withheld;
    lines.push({ orderId: order.id, type: order.type, withheld, detail: individualCap.detail });
  }

  return {
    disposableEarnings: disposable,
    aggregateCeiling,
    lines,
    totalWithheld: lines.reduce((s, l) => s + l.withheld, 0),
  };
}

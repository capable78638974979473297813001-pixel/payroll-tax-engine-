import { roundHalfUp, type Cents } from '../src/money.ts';
import type { Earning } from '../src/types.ts';
import { FEDERAL_OVERTIME_RULE, type OvertimeRule } from '../payroll/timeAndAttendance.ts';
import { resolveRate } from './wageDetermination.ts';
import type { Job, TradeWorkerProfile, WageDetermination, WorkedHours } from './types.ts';

/**
 * The core of the trades layer: turn one worker's week of job-and-
 * classification hours into the exact, prevailing-wage-compliant cash they
 * are owed, and the earnings that flow into the tax engine.
 *
 * Three rules do the real work here, and each is a place a naive
 * implementation gets prevailing wage wrong:
 *
 *  1. OVERTIME IS WEEKLY, NOT PER-JOB. Federal contract overtime (the
 *     Contract Work Hours and Safety Standards Act, CWHSSA) and the FLSA
 *     both count overtime at over 40 hours in the WORKWEEK across everything
 *     the worker did — you cannot decide a Wednesday entry is overtime until
 *     you have counted Monday and Tuesday. So hours are split into straight
 *     time and overtime at the 40-hour line CHRONOLOGICALLY across the whole
 *     week (the last hours of the week are the overtime hours), not within
 *     any single job or day.
 *
 *  2. THE OVERTIME PREMIUM IS ON THE BASIC RATE, FRINGE EXCLUDED. When a
 *     worker earns several different basic hourly rates in one week, the
 *     regular rate for the overtime premium is the WEIGHTED AVERAGE of those
 *     basic rates (FLSA 29 CFR 778.115), and the fringe obligation — whether
 *     paid in cash or into a plan — is EXCLUDED from it (DOL WHD; fringe is
 *     paid at straight value on all hours and never multiplied by the
 *     premium). So an overtime hour is paid: its own job's basic rate for
 *     the hour, plus a half-time premium of 0.5 × the week's weighted-average
 *     basic rate, plus the straight fringe.
 *
 *  3. THE FRINGE OBLIGATION IS SATISFIED CASH-OR-PLAN, AND THE CASH PART IS
 *     TAXABLE WAGES. The determination's hourly fringe may be discharged by
 *     bona-fide plan contributions the employer already makes; only the
 *     SHORTFALL (obligation minus creditable contributions) must be paid as
 *     cash, and that cash is ordinary taxable W-2 wages, so it flows into the
 *     engine as a 'regular' earning alongside the base pay.
 *
 * DISCLOSED SOURCING: the CWHSSA 40-hour rule, the FLSA weighted-average
 * regular rate (29 CFR 778.115), and the fringe-excluded-from-regular-rate
 * treatment are corroborated across DOL Wage and Hour Division guidance and
 * the WH-347 instructions, consistent with how this project sources its tax
 * rules — not asserted from memory. The one genuine judgment call is
 * attributing WHICH specific hours are the overtime hours when a worker
 * splits a week across jobs at different rates: DOL permits either the
 * weighted-average method (used here) or, by agreement, the rate in effect
 * during the overtime hours. This module implements the weighted-average
 * method, the more conservative and more common default, and the choice is
 * called out here rather than buried.
 *
 * STATE DAILY OVERTIME. By default this applies the federal weekly-40 rule.
 * Pass an `overtimeRule` (California's 8/12-hour-day and seventh-consecutive-
 * day rule, from payroll/timeAndAttendance.ts, is the built-in one) and the
 * split honours it: each day's hours are classified by the daily thresholds
 * first, attributed back to that day's job/classification entries, and only
 * the day's straight-time portion feeds the weekly-40 test — the same daily-
 * then-weekly interaction payroll/timeAndAttendance.ts's classifyWeeklyHours
 * implements, here carried down to the per-entry level so each job gets the
 * right hours. Double-time hours are paid the basic rate plus a FULL-time
 * premium (fringe still excluded), overtime hours the half-time premium.
 */

const OVERTIME_PREMIUM_MULTIPLIER = 0.5; // half-time premium; the base hour is already paid at the basic rate
const DOUBLE_TIME_PREMIUM_MULTIPLIER = 1; // full-time premium on top of the base hour → 2x the regular rate

/** One input WorkedHours entry after pricing — a single job/classification/day with its straight/overtime split and every rate and dollar figure it produced. The atomic row certified payroll (WH-347) and job costing both build on. */
export interface ResolvedWorkedHours {
  employeeId: string;
  jobId: string;
  date: string;
  classificationCode: string;
  isPrevailingWage: boolean;
  straightHours: number;
  overtimeHours: number;
  /** Hours at double time — only ever non-zero under a daily rule that defines a double-time threshold (California's 12-hour day, the 7th consecutive day). Always 0 under the federal weekly rule. */
  doubleTimeHours: number;
  /** The basic hourly rate actually used — max(worker's shop rate, prevailing basic rate) on a public job; the shop rate on a private one. */
  effectiveBaseRateCents: Cents;
  workerBaseRateCents: Cents;
  /** The determination's basic hourly rate; 0 on a private job. */
  prevailingBaseRateCents: Cents;
  /** The determination's hourly fringe obligation; 0 on a private job. */
  fringeObligationPerHourCents: Cents;
  /** Employer plan contributions applied TOWARD the obligation (never more than the obligation). */
  creditedFringePerHourCents: Cents;
  /** Employer plan contributions actually made, per hour — a real cost even when it exceeds the obligation or the job is private. */
  employerFringeCostPerHourCents: Cents;
  /** The fringe shortfall paid to the worker as cash: max(0, obligation − credit). */
  cashFringePerHourCents: Cents;
  straightPayCents: Cents;
  overtimeBasePayCents: Cents;
  overtimePremiumCents: Cents;
  doubleTimeBasePayCents: Cents;
  doubleTimePremiumCents: Cents;
  cashFringeCents: Cents;
  /** Employer plan contributions for this row's hours — a burden cost, NOT paid to the worker (so not part of grossCashCents). */
  employerFringeCostCents: Cents;
  /** Everything the worker is actually paid for this row: straight + overtime (base + premium) + double time (base + premium) + cash fringe. */
  grossCashCents: Cents;
}

/**
 * A required prevailing-wage adjustment, summarized per job × classification
 * for the week — the answer to "what did paying prevailing wage on this
 * public job cost me above my own shop rate?", which is exactly what a
 * self-serve trades contractor needs to bid and to see. Emitted only for
 * prevailing-wage work where some adjustment was actually required (the
 * worker's shop rate was below prevailing, or fringe was owed in cash).
 */
export interface PrevailingWageAdjustment {
  jobId: string;
  classificationCode: string;
  hours: number;
  workerBaseRateCents: Cents;
  prevailingBaseRateCents: Cents;
  /** max(0, prevailing basic rate − worker's shop rate) — the per-hour raise the job forced on the base wage. */
  baseMakeUpPerHourCents: Cents;
  fringeObligationPerHourCents: Cents;
  creditedFringePerHourCents: Cents;
  cashFringePerHourCents: Cents;
  /** Total extra cash this job cost above paying the worker's own shop rate for the same hours (base make-up + cash fringe), excluding the overtime premium, which would exist regardless. */
  extraCostVsShopRateCents: Cents;
  message: string;
}

export interface PrevailingWageWeek {
  employeeId: string;
  /** Earliest and latest work dates present — the resolved week's own span, not a calendar assumption. */
  weekStart: string;
  weekEnd: string;
  entries: ResolvedWorkedHours[];
  totalHours: number;
  totalStraightHours: number;
  totalOvertimeHours: number;
  totalDoubleTimeHours: number;
  /** Weighted-average basic rate across all hours — the FLSA regular rate the overtime premium is charged on. */
  regularRateCents: Cents;
  overtimePremiumPerHourCents: Cents;
  /** Full-time premium per double-time hour (= the regular rate); 0 unless a daily rule produced double-time hours. */
  doubleTimePremiumPerHourCents: Cents;
  /** Total cash the worker is owed for the week (sum of every entry's grossCash) — should reconcile to the engine's grossPay for the period once weeks are combined. */
  grossCashCents: Cents;
  /** Employer fringe-plan contributions for the week — a burden cost carried for job costing, never paid to the worker. */
  employerFringeCostCents: Cents;
  /** The earnings to feed the tax engine (via computeEmployeePaycheck's earningsOverride) for this week's pay. All 'regular': prevailing-wage cash, including cash fringe, is ordinary taxable wages. */
  earnings: Earning[];
  adjustments: PrevailingWageAdjustment[];
}

export interface ResolvePrevailingWageArgs {
  employeeId: string;
  /** One workweek of this worker's hours. Group a longer pay period into weeks first (see groupIntoWorkweeks) — overtime is a weekly quantity and mixing weeks would miscount it. */
  workedHours: readonly WorkedHours[];
  jobsById: ReadonlyMap<string, Job>;
  determinationsById: ReadonlyMap<string, WageDetermination>;
  /** The worker's trades profile (per-classification shop rates and fringe-plan contributions). Absent means no per-classification overrides and no plan contributions — every classification falls back to `fallbackBaseRateCents`. */
  profile?: TradeWorkerProfile;
  /** The worker's default hourly rate (their payroll Employee.payType hourlyRate), used for any classification the profile does not price. */
  fallbackBaseRateCents: Cents;
  /** The overtime rule to classify hours under. Defaults to the federal weekly-40 rule; pass overtimeRuleForState(workState) (payroll/timeAndAttendance.ts) to apply a state's daily rule (California's 8/12-hour day and 7th-consecutive-day double time). */
  overtimeRule?: OvertimeRule;
}

function workerBaseRateFor(args: ResolvePrevailingWageArgs, classificationCode: string): Cents {
  const override = args.profile?.classificationRates.find((r) => r.classificationCode === classificationCode);
  return override ? override.baseRateCents : args.fallbackBaseRateCents;
}

function totalFringeCreditPerHour(profile: TradeWorkerProfile | undefined): Cents {
  if (!profile) return 0;
  return profile.fringeCredits.reduce((sum, c) => sum + c.ratePerHourCents, 0);
}

interface EntryHourSplit {
  straightHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
}

/** One day's TOTAL hours split by the daily thresholds alone (weekly-40 is layered on afterward). Mirrors payroll/timeAndAttendance.ts's own splitByDailyThresholds so the daily math stays identical; kept local because that helper is private there. */
function dailySplit(hours: number, rule: OvertimeRule): EntryHourSplit {
  if (rule.dailyOvertimeThresholdHours === undefined) {
    return { straightHours: hours, overtimeHours: 0, doubleTimeHours: 0 };
  }
  const straight = Math.min(hours, rule.dailyOvertimeThresholdHours);
  const above = Math.max(0, hours - rule.dailyOvertimeThresholdHours);
  const dtThreshold = rule.dailyDoubleTimeThresholdHours;
  if (dtThreshold === undefined || hours <= dtThreshold) {
    return { straightHours: straight, overtimeHours: above, doubleTimeHours: 0 };
  }
  return {
    straightHours: straight,
    overtimeHours: dtThreshold - rule.dailyOvertimeThresholdHours,
    doubleTimeHours: hours - dtThreshold,
  };
}

/**
 * Split every entry into straight/overtime/double-time under `rule`,
 * attributing each day's daily-classified pools back to that day's entries in
 * order, then applying the weekly-40 test to the straight-time pool. The
 * federal rule (no daily thresholds) collapses this to the plain chronological
 * 40-hour split — every hour starts as straight, and the last hours over 40 in
 * the week become overtime. Under California's rule the daily 8/12-hour split
 * runs first, only each day's straight portion counts toward the weekly 40,
 * and the 7th consecutive day is paid overtime/double-time throughout.
 */
function splitHoursByRule(workedHours: readonly WorkedHours[], rule: OvertimeRule): EntryHourSplit[] {
  const out: EntryHourSplit[] = workedHours.map(() => ({ straightHours: 0, overtimeHours: 0, doubleTimeHours: 0 }));

  const byDate = new Map<string, number[]>();
  for (let i = 0; i < workedHours.length; i++) {
    const list = byDate.get(workedHours[i].date);
    if (list) list.push(i);
    else byDate.set(workedHours[i].date, [i]);
  }
  const dates = [...byDate.keys()].sort();
  const isSeventhConsecutiveDay = rule.seventhConsecutiveDayRule === true && dates.length === 7;

  // Straight-hour chunks recorded in chronological order, so the weekly-40
  // overflow can convert the LAST straight hours of the week into overtime.
  const straightChunks: { idx: number; hours: number }[] = [];

  dates.forEach((date, dayIndex) => {
    const idxs = byDate.get(date)!;
    const dayTotal = idxs.reduce((sum, i) => sum + workedHours[i].hours, 0);
    const split =
      isSeventhConsecutiveDay && dayIndex === dates.length - 1
        ? // The 7th consecutive day: first 8 hours overtime, the rest double time.
          { straightHours: 0, overtimeHours: Math.min(dayTotal, 8), doubleTimeHours: Math.max(0, dayTotal - 8) }
        : dailySplit(dayTotal, rule);

    let remStraight = split.straightHours;
    let remOvertime = split.overtimeHours;
    let remDouble = split.doubleTimeHours;
    for (const i of idxs) {
      let h = workedHours[i].hours;
      const s = Math.min(h, remStraight);
      remStraight -= s;
      h -= s;
      out[i].straightHours += s;
      if (s > 0) straightChunks.push({ idx: i, hours: s });
      const o = Math.min(h, remOvertime);
      remOvertime -= o;
      h -= o;
      out[i].overtimeHours += o;
      const d = Math.min(h, remDouble);
      remDouble -= d;
      out[i].doubleTimeHours += d;
    }
  });

  // Weekly-40: the amount of straight time past 40 is reclassified up to
  // overtime, taken from the last straight hours of the week.
  let overflow = Math.max(0, out.reduce((sum, o) => sum + o.straightHours, 0) - rule.weeklyThresholdHours);
  for (let k = straightChunks.length - 1; k >= 0 && overflow > 0; k--) {
    const chunk = straightChunks[k];
    const convert = Math.min(chunk.hours, overflow);
    out[chunk.idx].straightHours -= convert;
    out[chunk.idx].overtimeHours += convert;
    overflow -= convert;
  }
  return out;
}

/**
 * Price one worker's workweek. Pure: no I/O, no stored state — the same
 * discipline as the tax engine's own calculatePaycheck. Throws (via
 * resolveRate) if a public job references a determination not supplied, or a
 * classification with no rate in force on a work date — a missing prevailing
 * rate stops the run rather than silently pricing at the shop rate.
 */
export function resolvePrevailingWageWeek(args: ResolvePrevailingWageArgs): PrevailingWageWeek {
  const { workedHours, jobsById, determinationsById, profile, employeeId } = args;
  const rule = args.overtimeRule ?? FEDERAL_OVERTIME_RULE;

  const splits = splitHoursByRule(workedHours, rule);
  const totalHours = workedHours.reduce((sum, w) => sum + w.hours, 0);
  const totalStraightHours = splits.reduce((sum, s) => sum + s.straightHours, 0);
  const totalOvertimeHours = splits.reduce((sum, s) => sum + s.overtimeHours, 0);
  const totalDoubleTimeHours = splits.reduce((sum, s) => sum + s.doubleTimeHours, 0);

  // First pass: resolve each entry's rates (independent of overtime), so the
  // weighted-average regular rate can be computed before pay is assigned.
  const resolved = workedHours.map((w, idx) => {
    const job = jobsById.get(w.jobId);
    if (!job) throw new Error(`WorkedHours references unknown job "${w.jobId}" for employee ${employeeId}.`);

    const workerBase = workerBaseRateFor(args, w.classificationCode);
    const employerFringeCostPerHour = totalFringeCreditPerHour(profile);

    let isPrevailingWage = false;
    let prevailingBase = 0;
    let fringeObligation = 0;
    let effectiveBase = workerBase;

    if (job.prevailingWage) {
      const determination = determinationsById.get(job.prevailingWage.determinationId);
      if (!determination) {
        throw new Error(
          `Job "${job.id}" is a prevailing-wage job under determination ` +
            `"${job.prevailingWage.determinationId}", but that determination was not supplied to the resolver.`,
        );
      }
      const rate = resolveRate(determination, w.classificationCode, w.date);
      isPrevailingWage = true;
      prevailingBase = rate.baseHourlyRateCents;
      fringeObligation = rate.fringePerHourCents;
      effectiveBase = Math.max(workerBase, prevailingBase);
    }

    // Credit applied toward the obligation is capped at the obligation; any
    // excess plan contribution is still a real cost but cannot drive cash
    // fringe negative.
    const creditedFringe = Math.min(employerFringeCostPerHour, fringeObligation);
    const cashFringePerHour = Math.max(0, fringeObligation - employerFringeCostPerHour);

    return {
      w,
      split: splits[idx],
      workerBase,
      isPrevailingWage,
      prevailingBase,
      fringeObligation,
      effectiveBase,
      creditedFringe,
      employerFringeCostPerHour,
      cashFringePerHour,
    };
  });

  // Weighted-average basic rate across all hours — the FLSA regular rate.
  const weightedBaseCentHours = resolved.reduce((sum, r) => sum + r.effectiveBase * r.w.hours, 0);
  const regularRateCents = totalHours > 0 ? roundHalfUp(weightedBaseCentHours / totalHours) : 0;
  const overtimePremiumPerHourCents = roundHalfUp(regularRateCents * OVERTIME_PREMIUM_MULTIPLIER);
  const doubleTimePremiumPerHourCents = roundHalfUp(regularRateCents * DOUBLE_TIME_PREMIUM_MULTIPLIER);

  // Second pass: assign pay now that the premium rates are known.
  const entries: ResolvedWorkedHours[] = resolved.map((r) => {
    const { straightHours, overtimeHours, doubleTimeHours } = r.split;
    const hours = straightHours + overtimeHours + doubleTimeHours;
    const straightPay = roundHalfUp(straightHours * r.effectiveBase);
    const overtimeBasePay = roundHalfUp(overtimeHours * r.effectiveBase);
    const overtimePremium = roundHalfUp(overtimeHours * overtimePremiumPerHourCents);
    const doubleTimeBasePay = roundHalfUp(doubleTimeHours * r.effectiveBase);
    const doubleTimePremium = roundHalfUp(doubleTimeHours * doubleTimePremiumPerHourCents);
    const cashFringe = roundHalfUp(hours * r.cashFringePerHour);
    const employerFringeCost = roundHalfUp(hours * r.employerFringeCostPerHour);
    const grossCash = straightPay + overtimeBasePay + overtimePremium + doubleTimeBasePay + doubleTimePremium + cashFringe;

    return {
      employeeId,
      jobId: r.w.jobId,
      date: r.w.date,
      classificationCode: r.w.classificationCode,
      isPrevailingWage: r.isPrevailingWage,
      straightHours,
      overtimeHours,
      doubleTimeHours,
      effectiveBaseRateCents: r.effectiveBase,
      workerBaseRateCents: r.workerBase,
      prevailingBaseRateCents: r.prevailingBase,
      fringeObligationPerHourCents: r.fringeObligation,
      creditedFringePerHourCents: r.creditedFringe,
      employerFringeCostPerHourCents: r.employerFringeCostPerHour,
      cashFringePerHourCents: r.cashFringePerHour,
      straightPayCents: straightPay,
      overtimeBasePayCents: overtimeBasePay,
      overtimePremiumCents: overtimePremium,
      doubleTimeBasePayCents: doubleTimeBasePay,
      doubleTimePremiumCents: doubleTimePremium,
      cashFringeCents: cashFringe,
      employerFringeCostCents: employerFringeCost,
      grossCashCents: grossCash,
    };
  });

  const dates = workedHours.map((w) => w.date).sort();
  const grossCashCents = entries.reduce((sum, e) => sum + e.grossCashCents, 0);
  const employerFringeCostCents = entries.reduce((sum, e) => sum + e.employerFringeCostCents, 0);

  return {
    employeeId,
    weekStart: dates[0] ?? '',
    weekEnd: dates[dates.length - 1] ?? '',
    entries,
    totalHours,
    totalStraightHours,
    totalOvertimeHours,
    totalDoubleTimeHours,
    regularRateCents,
    overtimePremiumPerHourCents,
    doubleTimePremiumPerHourCents,
    grossCashCents,
    employerFringeCostCents,
    earnings: weekEarnings(entries),
    adjustments: weekAdjustments(entries),
  };
}

/** The tax-engine earnings for a resolved week: regular pay (straight + overtime base + double-time base), the overtime and double-time premiums, and cash fringe — all 'regular', since every dollar here is ordinary taxable wages. Zero components are omitted, so a week with no overtime carries no OTP line and no double time carries no DTP line. */
function weekEarnings(entries: readonly ResolvedWorkedHours[]): Earning[] {
  let regular = 0;
  let overtimePremium = 0;
  let doubleTimePremium = 0;
  let fringe = 0;
  for (const e of entries) {
    regular += e.straightPayCents + e.overtimeBasePayCents + e.doubleTimeBasePayCents;
    overtimePremium += e.overtimePremiumCents;
    doubleTimePremium += e.doubleTimePremiumCents;
    fringe += e.cashFringeCents;
  }
  const earnings: Earning[] = [];
  if (regular !== 0) earnings.push({ code: 'REG', category: 'regular', amount: regular });
  if (overtimePremium !== 0) earnings.push({ code: 'OTP', category: 'regular', amount: overtimePremium });
  if (doubleTimePremium !== 0) earnings.push({ code: 'DTP', category: 'regular', amount: doubleTimePremium });
  if (fringe !== 0) earnings.push({ code: 'FRNG', category: 'regular', amount: fringe });
  return earnings;
}

/** Roll the resolved entries up per job × classification and emit an adjustment wherever prevailing wage forced pay above the worker's shop rate (base make-up) or owed fringe in cash. */
function weekAdjustments(entries: readonly ResolvedWorkedHours[]): PrevailingWageAdjustment[] {
  const groups = new Map<string, ResolvedWorkedHours[]>();
  for (const e of entries) {
    if (!e.isPrevailingWage) continue;
    const key = `${e.jobId} ${e.classificationCode}`;
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }

  const adjustments: PrevailingWageAdjustment[] = [];
  for (const list of groups.values()) {
    const first = list[0];
    const hours = list.reduce((sum, e) => sum + e.straightHours + e.overtimeHours + e.doubleTimeHours, 0);
    const baseMakeUpPerHour = Math.max(0, first.prevailingBaseRateCents - first.workerBaseRateCents);
    const cashFringePerHour = first.cashFringePerHourCents;
    if (baseMakeUpPerHour === 0 && cashFringePerHour === 0) continue;

    const extraCost = roundHalfUp(hours * (baseMakeUpPerHour + cashFringePerHour));
    adjustments.push({
      jobId: first.jobId,
      classificationCode: first.classificationCode,
      hours,
      workerBaseRateCents: first.workerBaseRateCents,
      prevailingBaseRateCents: first.prevailingBaseRateCents,
      baseMakeUpPerHourCents: baseMakeUpPerHour,
      fringeObligationPerHourCents: first.fringeObligationPerHourCents,
      creditedFringePerHourCents: first.creditedFringePerHourCents,
      cashFringePerHourCents: cashFringePerHour,
      extraCostVsShopRateCents: extraCost,
      message:
        `Prevailing wage on job ${first.jobId} (${first.classificationCode}): ` +
        (baseMakeUpPerHour > 0
          ? `basic rate raised from shop rate to prevailing (+${baseMakeUpPerHour}¢/hr); `
          : '') +
        (cashFringePerHour > 0 ? `${cashFringePerHour}¢/hr fringe owed in cash; ` : '') +
        `${extraCost}¢ extra over ${hours} hours.`,
    });
  }
  return adjustments;
}

/**
 * Combine several resolved weeks' earnings into one set for a pay period that
 * spans them (a biweekly period is two workweeks). Same three 'regular'
 * codes, summed — this is what a caller hands to computeEmployeePaycheck's
 * earningsOverride so the tax engine runs once on the whole period's pay.
 */
export function combineWeeklyEarnings(weeks: readonly PrevailingWageWeek[]): Earning[] {
  let regular = 0;
  let overtimePremium = 0;
  let doubleTimePremium = 0;
  let fringe = 0;
  for (const week of weeks) {
    for (const e of week.earnings) {
      if (e.code === 'REG') regular += e.amount;
      else if (e.code === 'OTP') overtimePremium += e.amount;
      else if (e.code === 'DTP') doubleTimePremium += e.amount;
      else if (e.code === 'FRNG') fringe += e.amount;
    }
  }
  const earnings: Earning[] = [];
  if (regular !== 0) earnings.push({ code: 'REG', category: 'regular', amount: regular });
  if (overtimePremium !== 0) earnings.push({ code: 'OTP', category: 'regular', amount: overtimePremium });
  if (doubleTimePremium !== 0) earnings.push({ code: 'DTP', category: 'regular', amount: doubleTimePremium });
  if (fringe !== 0) earnings.push({ code: 'FRNG', category: 'regular', amount: fringe });
  return earnings;
}

/**
 * Bucket a span of WorkedHours into workweeks, keyed by each week's start
 * date. `weekStartsOn` is the ISO weekday the employer's workweek begins on
 * (0 = Sunday, the federal default; 1 = Monday), a fixed 7-day cadence — the
 * same "a payroll calendar is computed from an anchor, never re-derived from
 * a weekday name each time" discipline payroll/schedule.ts uses. Overtime is
 * a per-workweek quantity, so this MUST run before resolvePrevailingWageWeek.
 */
export function groupIntoWorkweeks(
  workedHours: readonly WorkedHours[],
  weekStartsOn = 0,
): Map<string, WorkedHours[]> {
  const byWeek = new Map<string, WorkedHours[]>();
  for (const w of workedHours) {
    const key = workweekStart(w.date, weekStartsOn);
    const list = byWeek.get(key);
    if (list) list.push(w);
    else byWeek.set(key, [w]);
  }
  return byWeek;
}

/** ISO date of the workweek start containing `isoDate`, for a week beginning on weekday `weekStartsOn`. */
export function workweekStart(isoDate: string, weekStartsOn = 0): string {
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  const day = new Date(ms).getUTCDay();
  const back = (day - weekStartsOn + 7) % 7;
  const startMs = ms - back * 86_400_000;
  return new Date(startMs).toISOString().slice(0, 10);
}

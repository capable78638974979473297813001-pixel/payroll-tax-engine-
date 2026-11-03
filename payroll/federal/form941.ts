import { dollars, fmt, type Cents } from '../../src/money.ts';
import type { PayRun } from '../types.ts';
import { form941Due, quarterBounds, type DepositSchedule, type ReturnDue } from './calendar.ts';
import {
  analyzeDeposits,
  qualifiesForDeMinimis,
  reconcileDeposits,
  scheduleFromLookback,
  type DepositAnalysis,
  type DepositReconciliation,
  type Quarter,
  type TaxDeposit,
} from './deposits.ts';
import { buildLedger, mergeAdjustments, sumDays, type DayLiability } from './ledger.ts';

/**
 * FORM 941, Employer's QUARTERLY Federal Tax Return (Rev. March 2026), with
 * its Part 2 liability record and Schedule B (Form 941).
 *
 * Built line by line from the form and the Instructions for Form 941
 * (Rev. 3-2026), read in full for this module. Every line below carries the
 * instruction's own rule; the rules that are easy to get wrong are:
 *
 *  - Lines 5a-5d column 2 are COLUMN 1 x the combined rate (0.124, 0.124,
 *    0.029, 0.009) - not the sum of what was withheld. The difference between
 *    the two (fractions of cents on the employee and employer shares) is
 *    reported on LINE 7, so line 10 lands on what was really withheld and owed.
 *  - Tips are carved out of 5a into 5b ("Don't include tips on this line").
 *  - Line 12 "can't be less than zero".
 *  - Never an entry on both line 14 and line 15a.
 *  - The Part 2 / Schedule B total must equal line 12, and daily or monthly
 *    figures are never reduced below zero (a negative net adjustment in a month
 *    is entered as -0- and carried to the next month).
 *  - The line 11 research credit is applied to the EMPLOYER social security
 *    share first (up to $250,000 a quarter), then the employer Medicare share,
 *    starting with the first payroll of the quarter.
 *
 * What a pay run cannot know, and the caller must supply (all optional, all
 * dated so they land in the right month of Part 2 / day of Schedule B):
 * tip-reported wages (5b), a Section 3121(q) notice (5f), sick-pay (8) and
 * tip/group-term-life (9) adjustments, and the Form 8974 credit (11). Nothing is
 * defaulted to a guess: an absent input is zero and the form says so.
 *
 * The Form 941 PDF/XML itself is not produced here. IRS e-file schemas for 94x
 * forms are distributed only to registered software developers through
 * e-Services, so the e-file mapping lives behind the transport port in
 * agency.ts; this module produces the exact line values that mapping fills in.
 */

export const SS_RATE = { numerator: 124, denominator: 1000 } as const;
export const MEDICARE_RATE = { numerator: 29, denominator: 1000 } as const;
export const ADDITIONAL_MEDICARE_RATE = { numerator: 9, denominator: 1000 } as const;
/** "...up to $250,000 of credit against the employer share of social security tax" per quarter. */
export const RESEARCH_CREDIT_SS_CAP: Cents = dollars(250_000);

/** base x (numerator / denominator), rounded half up, in exact integer arithmetic (a float 0.124 can misround a .5 cent). */
export function timesRate(base: Cents, rate: { numerator: number; denominator: number }): Cents {
  const sign = base < 0 ? -1 : 1;
  const abs = Math.abs(base);
  return sign * Math.floor((2 * abs * rate.numerator + rate.denominator) / (2 * rate.denominator));
}

export type AdjustmentLine = '5f' | '8' | '9';

export interface DatedAdjustment {
  /** The date it belongs to for Part 2 / Schedule B: when the wages were paid, or for 5f the "Date of Notice and Demand". */
  date: string;
  amount: Cents;
  line: AdjustmentLine;
  note?: string;
}

export interface EmployerIdentity {
  /** Nine digits, no hyphen. */
  ein: string;
  legalName: string;
  tradeName?: string;
  address: { street: string; suite?: string; city: string; state: string; zip: string };
}

export interface Form941Input {
  employer: EmployerIdentity;
  year: number;
  quarter: Quarter;
  /** Every pay run for the company; those outside the quarter are ignored. Year-to-date runs let the $100,000 rule be tracked from January. */
  runs: readonly PayRun[];
  /** Tips reported by employees that are subject to social security tax (5b, column 1). Taken out of 5a. */
  socialSecurityTips?: Cents;
  adjustments?: readonly DatedAdjustment[];
  /** Line 11: the amount from Form 8974 (line 12, or line 17 when it applies). */
  researchCredit?: Cents;
  /** Every deposit made, any quarter; the ones designated to this quarter count toward line 13. */
  deposits?: readonly TaxDeposit[];
  /** Overpayment from a prior quarter or from a 941-X/944-X filed this quarter that was applied here (added to line 13). */
  overpaymentApplied?: Cents;
  /** Line 12 of the prior quarter's return, for the de minimis exception. */
  priorQuarterLine12?: Cents;
  /** Total of line 12 over the four lookback quarters. Undefined for a new employer = monthly. */
  lookbackTotalLine12?: Cents;
  /** True when the $100,000 rule made the employer semiweekly in the prior calendar year (it stays so "for the following calendar year"). */
  semiweeklyFromPriorYear?: boolean;
  /** Line 4: no wages are subject to social security or Medicare tax. */
  noWagesSubjectToSocialSecurityOrMedicare?: boolean;
  /** Line 17: the business closed or stopped paying wages; the final date wages were paid. */
  finalWageDate?: string;
  /** Line 18: seasonal employer that does not file every quarter. */
  seasonalEmployer?: boolean;
  /** Lines 15b-15e. Direct deposit of a refund is available as of the 2026 form. */
  overpaymentElection?: { kind: 'apply_to_next_return' } | { kind: 'refund'; routingNumber?: string; accountType?: 'checking' | 'savings'; accountNumber?: string };
  /** Today, for lateness estimates on deposits. Defaults to the last day of the quarter's filing window. */
  asOf?: string;
}

export interface TaxColumns {
  column1: Cents;
  rate: number;
  column2: Cents;
}

export type FindingSeverity = 'error' | 'warning' | 'info';

export interface Finding {
  severity: FindingSeverity;
  code: string;
  message: string;
}

export interface ScheduleBDay {
  /** Day of month 1-31 (Schedule B's numbered spaces). */
  day: number;
  date: string;
  /** The liability to report: the day's taxes after adjustments and after the line 11 credit, never below zero. */
  liability: Cents;
}

export interface ScheduleB {
  year: number;
  quarter: Quarter;
  ein: string;
  /** Three months, each with its dated entries and total. */
  months: { month: 1 | 2 | 3; calendarMonth: number; days: ScheduleBDay[]; total: Cents }[];
  totalLiabilityForQuarter: Cents;
}

export type Part2Choice = 'de_minimis' | 'monthly' | 'semiweekly';

export interface Part2 {
  /** Line 16: which of the three boxes. */
  choice: Part2Choice;
  /** Filled only for the monthly box. Their sum equals line 12. */
  monthlyLiability?: { month1: Cents; month2: Cents; month3: Cents; total: Cents };
}

export interface Form941 {
  employer: EmployerIdentity;
  year: number;
  quarter: Quarter;
  line1_numberOfEmployees: number | null;
  line2_wagesTipsOtherCompensation: Cents;
  line3_federalIncomeTaxWithheld: Cents;
  line4_noWagesSubjectToSocialSecurityOrMedicare: boolean;
  line5a_socialSecurityWages: TaxColumns;
  line5b_socialSecurityTips: TaxColumns;
  line5c_medicareWagesAndTips: TaxColumns;
  line5d_additionalMedicare: TaxColumns;
  line5e_totalSocialSecurityAndMedicare: Cents;
  line5f_section3121qNoticeAndDemand: Cents;
  line6_totalTaxesBeforeAdjustments: Cents;
  line7_fractionsOfCents: Cents;
  line8_sickPayAdjustment: Cents;
  line9_tipsAndGroupTermLifeAdjustment: Cents;
  line10_totalTaxesAfterAdjustments: Cents;
  line11_researchCredit: Cents;
  line12_totalAfterAdjustmentsAndCredits: Cents;
  line13_totalDeposits: Cents;
  line14_balanceDue: Cents;
  line15a_overpayment: Cents;
  line15b_overpaymentElection?: Input['overpaymentElection'];
  part2: Part2;
  line17_finalWageDate?: string;
  line18_seasonalEmployer: boolean;
  scheduleB?: ScheduleB;
  due: ReturnDue;
  deposits: { analysis: DepositAnalysis; reconciliation: DepositReconciliation };
  /** The same figures a Form 941 e-file mapping fills in, keyed by the form's own line labels. */
  fields: Record<string, string | number | boolean | null>;
  findings: Finding[];
  /** True only when there is no error-severity finding. */
  readyToSign: boolean;
  /**
   * Counts the W-3 reconciliation needs: every paycheck rounds each tax by up
   * to half a cent, and those roundings add up (they do not cancel when the
   * checks are alike), so the bound on how far a sum of paychecks can drift
   * from a total computed once is the number of paychecks.
   */
  statistics: { paychecks: number; payDates: number };
}

type Input = Form941Input;

function inMonth(date: string, year: number, quarter: Quarter): 1 | 2 | 3 {
  const m = Number(date.slice(5, 7));
  return (m - (quarter - 1) * 3) as 1 | 2 | 3;
}

/**
 * Spread the line 11 credit over the quarter's pay dates exactly as the
 * instructions describe, returning the reduction taken on each pay date and
 * what could not be used (which carries to the next quarter).
 */
export function allocateResearchCredit(
  days: readonly DayLiability[],
  credit: Cents,
): { byDate: Record<string, Cents>; unused: Cents } {
  const byDate: Record<string, Cents> = {};
  let ssBudget = Math.min(credit, RESEARCH_CREDIT_SS_CAP);
  let used = 0;
  for (const d of days) {
    const take = Math.min(ssBudget, d.socialSecurityEmployer);
    if (take > 0) {
      byDate[d.date] = (byDate[d.date] ?? 0) + take;
      ssBudget -= take;
      used += take;
    }
  }
  let medicareBudget = credit - used;
  for (const d of days) {
    if (medicareBudget <= 0) break;
    const take = Math.min(medicareBudget, d.medicareEmployer);
    if (take > 0) {
      byDate[d.date] = (byDate[d.date] ?? 0) + take;
      medicareBudget -= take;
      used += take;
    }
  }
  return { byDate, unused: credit - used };
}

/**
 * Per-pay-date liability after dated adjustments and the research credit.
 * A day with no wages but a dated adjustment (a 3121(q) notice) still appears.
 */
function netDailyLiability(
  days: readonly DayLiability[],
  adjustments: readonly DatedAdjustment[],
  creditByDate: Readonly<Record<string, Cents>>,
): { date: string; amount: Cents }[] {
  const byDate = new Map<string, Cents>();
  for (const d of days) byDate.set(d.date, d.total);
  for (const a of adjustments) byDate.set(a.date, (byDate.get(a.date) ?? 0) + a.amount);
  for (const [date, c] of Object.entries(creditByDate)) byDate.set(date, (byDate.get(date) ?? 0) - c);
  return [...byDate.entries()].map(([date, amount]) => ({ date, amount })).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Monthly liabilities for line 16 / Schedule B totals. A month's net can go
 * negative only because of a negative adjustment; the instructions say to
 * enter -0- and carry the unused portion to the next month. Returns the
 * entered values and any carry that remained at the end of the quarter.
 */
function monthlyFromDaily(
  daily: readonly { date: string; amount: Cents }[],
  year: number,
  quarter: Quarter,
): { month1: Cents; month2: Cents; month3: Cents; carryOut: Cents } {
  const raw: Record<1 | 2 | 3, Cents> = { 1: 0, 2: 0, 3: 0 };
  for (const d of daily) raw[inMonth(d.date, year, quarter)] += d.amount;
  const out: Record<1 | 2 | 3, Cents> = { 1: 0, 2: 0, 3: 0 };
  let carry = 0;
  for (const m of [1, 2, 3] as const) {
    const net = raw[m] + carry;
    if (net < 0) {
      out[m] = 0;
      carry = net;
    } else {
      out[m] = net;
      carry = 0;
    }
  }
  return { month1: out[1], month2: out[2], month3: out[3], carryOut: carry };
}

function buildScheduleB(
  employer: EmployerIdentity,
  year: number,
  quarter: Quarter,
  daily: readonly { date: string; amount: Cents }[],
): { scheduleB: ScheduleB; carryOut: Cents } {
  // Schedule B never shows a day below zero, but its total must still equal
  // line 12. A negative day (an adjustment on a date with little or no
  // liability) therefore reduces the NEXT day with liability, the same carry the
  // instructions prescribe month to month for line 16.
  let carry = 0;
  const entries: { date: string; amount: Cents }[] = [];
  for (const d of daily) {
    const net = d.amount + carry;
    if (net < 0) {
      carry = net;
      continue;
    }
    carry = 0;
    if (net > 0) entries.push({ date: d.date, amount: net });
  }
  const startMonth = (quarter - 1) * 3 + 1;
  const months = ([1, 2, 3] as const).map((month) => {
    const days: ScheduleBDay[] = entries
      .filter((d) => inMonth(d.date, year, quarter) === month)
      .map((d) => ({ day: Number(d.date.slice(8, 10)), date: d.date, liability: d.amount }));
    return { month, calendarMonth: startMonth + month - 1, days, total: days.reduce((s, d) => s + d.liability, 0) };
  });
  return {
    scheduleB: { year, quarter, ein: employer.ein, months, totalLiabilityForQuarter: months.reduce((s, m) => s + m.total, 0) },
    carryOut: carry,
  };
}

function columns(column1: Cents, rate: { numerator: number; denominator: number }): TaxColumns {
  return { column1, rate: rate.numerator / rate.denominator, column2: timesRate(column1, rate) };
}

/** The pay periods that include the 12th of the quarter's last month (Form 941 line 1). */
function employeesOnTwelfth(runs: readonly PayRun[], companyId: string, year: number, quarter: Quarter): number | null {
  const lastMonth = quarter * 3;
  const twelfth = `${year}-${String(lastMonth).padStart(2, '0')}-12`;
  const covering = runs.filter(
    (r) => r.companyId === companyId && r.status === 'approved' && r.periodStart <= twelfth && twelfth <= r.periodEnd,
  );
  if (covering.length === 0) return null;
  const ids = new Set<string>();
  for (const run of covering) for (const line of run.lines) if (line.grossPay > 0) ids.add(line.employeeId);
  return ids.size;
}

export function computeForm941(input: Form941Input, companyId: string): Form941 {
  const { year, quarter, employer } = input;
  const findings: Finding[] = [];
  const bounds = quarterBounds(year, quarter);
  const yearStart = `${year}-01-01`;

  // One ledger from January 1 so the $100,000 rule and a mid-year change of
  // schedule are seen even when they happened in an earlier quarter.
  const ytd = buildLedger(companyId, input.runs, { start: yearStart, end: bounds.end });
  const days = ytd.filter((d) => d.date >= bounds.start);

  const adjustments = (input.adjustments ?? []).filter((a) => a.date >= bounds.start && a.date <= bounds.end);
  const adjusted = (line: AdjustmentLine) => adjustments.filter((a) => a.line === line).reduce((s, a) => s + a.amount, 0);

  // ---- Part 1 -------------------------------------------------------------
  const ssWagesAll = sumDays(days, 'socialSecurityWages');
  const tips = input.socialSecurityTips ?? 0;
  if (tips < 0) findings.push({ severity: 'error', code: 'negative_tips', message: 'Social security tips cannot be negative.' });
  if (tips > ssWagesAll) {
    findings.push({
      severity: 'error',
      code: 'tips_exceed_social_security_wages',
      message: `Line 5b tips (${fmt(tips)}) exceed the quarter's social security wages (${fmt(ssWagesAll)}); tips are part of those wages and are removed from line 5a.`,
    });
  }
  const line5a = columns(Math.max(0, ssWagesAll - Math.min(tips, ssWagesAll)), SS_RATE);
  const line5b = columns(Math.min(Math.max(0, tips), ssWagesAll), SS_RATE);
  const line5c = columns(sumDays(days, 'medicareWages'), MEDICARE_RATE);
  const line5d = columns(sumDays(days, 'additionalMedicareWages'), ADDITIONAL_MEDICARE_RATE);
  const line5e = line5a.column2 + line5b.column2 + line5c.column2 + line5d.column2;

  const line2 = sumDays(days, 'wagesSubjectToIncomeTax');
  const line3 = sumDays(days, 'federalIncomeTax');
  const line5f = adjusted('5f');
  const line6 = line3 + line5e + line5f;

  // Line 7: what was actually withheld (employee) and owed (employer) for social
  // security and Medicare, less what columns 1 x rate give.
  const actualSsMed =
    sumDays(days, 'socialSecurityEmployee') +
    sumDays(days, 'socialSecurityEmployer') +
    sumDays(days, 'medicareEmployee') +
    sumDays(days, 'medicareEmployer') +
    sumDays(days, 'additionalMedicare');
  const line7 = actualSsMed - line5e;
  const paychecks = days.reduce((s, d) => s + d.employeeIds.length, 0);
  // Each paycheck can round four amounts by up to half a cent either way, and the
  // four column-2 products round once more: more than this means a wage or rate is wrong.
  const fractionBound = paychecks * 2 + 4;
  if (Math.abs(line7) > fractionBound) {
    findings.push({
      severity: 'error',
      code: 'line7_not_fractions_of_cents',
      message: `Line 7 is ${fmt(line7)} but fractions of cents across ${paychecks} paychecks cannot exceed ${fmt(fractionBound)}. The social security / Medicare taxes withheld do not match wages x the statutory rates - a wage figure, a rate or the wage base is wrong in a pay run.`,
    });
  }

  const line8 = adjusted('8');
  const line9 = adjusted('9');
  const line10 = line6 + line7 + line8 + line9;

  const credit = input.researchCredit ?? 0;
  const creditAlloc = allocateResearchCredit(days, credit);
  if (creditAlloc.unused > 0) {
    findings.push({
      severity: 'error',
      code: 'research_credit_exceeds_employer_shares',
      message: `Line 11 (${fmt(credit)}) is more than the employer social security and Medicare shares for the quarter by ${fmt(creditAlloc.unused)}. The credit can only reduce the employer shares (and up to $250,000 of social security); the excess carries to the next quarter and is not claimed here.`,
    });
  }
  const line11 = credit - creditAlloc.unused;
  const line12 = Math.max(0, line10 - line11);

  const quarterDeposits = (input.deposits ?? []).filter((d) => d.year === year && d.quarter === quarter);
  const line13 = quarterDeposits.reduce((s, d) => s + d.amount, 0) + (input.overpaymentApplied ?? 0);
  const line14 = line12 > line13 ? line12 - line13 : 0;
  const line15a = line13 > line12 ? line13 - line12 : 0;

  // ---- Part 2 / Schedule B ------------------------------------------------
  const startingSchedule: DepositSchedule =
    input.semiweeklyFromPriorYear || scheduleFromLookback(input.lookbackTotalLine12) === 'semiweekly' ? 'semiweekly' : 'monthly';
  // Deposits are analysed on what is really owed: wages' taxes plus the dated
  // adjustments (a 3121(q) notice accumulates on its notice date), from January 1.
  const ytdAdjustments = (input.adjustments ?? []).filter((a) => a.date >= yearStart && a.date <= bounds.end);
  const analysis = analyzeDeposits(mergeAdjustments(ytd, ytdAdjustments), { startingSchedule, creditByDate: creditAlloc.byDate });
  const quarterObligations = analysis.obligations.filter((o) => o.year === year && o.quarter === quarter);
  const scheduleAtQuarterStart: DepositSchedule =
    analysis.becameSemiweeklyOn !== undefined && analysis.becameSemiweeklyOn < bounds.start ? 'semiweekly' : startingSchedule;
  const semiweeklyDuringQuarter =
    scheduleAtQuarterStart === 'semiweekly' ||
    (analysis.becameSemiweeklyOn !== undefined && analysis.becameSemiweeklyOn >= bounds.start && analysis.becameSemiweeklyOn <= bounds.end);
  const hadNextDay = quarterObligations.some((o) => o.rule === 'next_day');

  const daily = netDailyLiability(days, adjustments, creditAlloc.byDate);
  const monthly = monthlyFromDaily(daily, year, quarter);
  const monthlyTotal = monthly.month1 + monthly.month2 + monthly.month3;

  let choice: Part2Choice;
  if (qualifiesForDeMinimis(line12, input.priorQuarterLine12, hadNextDay) && line12 < dollars(100_000)) choice = 'de_minimis';
  else if (semiweeklyDuringQuarter) choice = 'semiweekly';
  else choice = 'monthly';

  const part2: Part2 = { choice };
  let scheduleB: ScheduleB | undefined;
  let scheduleBCarryOut = 0;
  if (choice === 'monthly') {
    part2.monthlyLiability = { month1: monthly.month1, month2: monthly.month2, month3: monthly.month3, total: monthlyTotal };
  } else if (choice === 'semiweekly') {
    const built = buildScheduleB(employer, year, quarter, daily);
    scheduleB = built.scheduleB;
    scheduleBCarryOut = built.carryOut;
  }
  const recordedTotal = choice === 'monthly' ? monthlyTotal : scheduleB?.totalLiabilityForQuarter;
  if (recordedTotal !== undefined && recordedTotal !== line12) {
    findings.push({
      severity: 'error',
      code: 'liability_record_does_not_equal_line12',
      message: `The ${choice === 'monthly' ? 'line 16 monthly liability' : 'Schedule B'} total (${fmt(recordedTotal)}) must equal line 12 (${fmt(line12)}). A negative adjustment larger than the period's liability cannot be spread without going below zero, or a dated adjustment falls outside the quarter.`,
    });
  }
  const depositCarryOut = analysis.unabsorbedNegative.find((u) => u.year === year && u.quarter === quarter)?.amount ?? 0;
  const leftover = Math.max(choice === 'monthly' ? -monthly.carryOut : 0, -scheduleBCarryOut, depositCarryOut);
  if (leftover > 0) {
    findings.push({
      severity: 'warning',
      code: 'negative_adjustment_carried_out',
      message: `A negative adjustment of ${fmt(leftover)} is larger than the liability left in the quarter to absorb it. It cannot reduce a deposit or a liability entry below zero, so the deposits already made will show as an overpayment on line 15a and the liability record may exceed line 12 by that amount.`,
    });
  }

  // ---- Deposits -----------------------------------------------------------
  const asOf = input.asOf ?? form941Due(year, quarter).dueDate;
  const reconciliation = reconcileDeposits(
    analysis.obligations.filter((o) => o.year === year && o.quarter === quarter),
    quarterDeposits,
    asOf,
  );
  if (choice !== 'de_minimis') {
    for (const s of reconciliation.statuses) {
      if (s.state === 'paid_late' || s.state === 'short' || s.state === 'unpaid') {
        findings.push({
          severity: 'warning',
          code: `deposit_${s.state}`,
          message: `Deposit due ${s.obligation.dueDate} for ${s.obligation.payDates.join(', ')} (${fmt(s.obligation.amountDue)}): ${s.state.replace('_', ' ')}${s.shortfall ? `, ${fmt(s.shortfall)} outstanding` : ''}, ${s.daysLate} day(s) late; estimated failure-to-deposit penalty ${fmt(s.estimatedPenalty)}${s.withinAccuracyRule ? ' (excused by the accuracy-of-deposits rule)' : ''}.`,
        });
      }
    }
  }
  for (const u of reconciliation.unapplied) {
    findings.push({ severity: 'info', code: 'unapplied_deposit', message: `Deposit ${u.depositId}: ${fmt(u.amount)} exceeded every liability accrued by its date; it counts on line 13 and shows as an overpayment if not needed.` });
  }
  if (choice !== 'de_minimis' && line14 >= dollars(1) && line12 >= dollars(2_500) && (input.priorQuarterLine12 ?? 0) >= dollars(2_500)) {
    findings.push({
      severity: 'warning',
      code: 'balance_due_despite_deposit_rules',
      message: `Line 14 is ${fmt(line14)}. When line 12 is $2,500 or more in both this and the prior quarter and every deposit was made on time, the balance due should be zero; the shortfall means deposits are missing or short (see the deposit findings).`,
    });
  }
  if (line14 > 0 && line14 < dollars(1)) {
    findings.push({ severity: 'info', code: 'balance_under_one_dollar', message: 'You do not have to pay if line 14 is under $1.' });
  }

  // ---- Data hygiene -------------------------------------------------------
  if (!/^\d{9}$/.test(employer.ein)) findings.push({ severity: 'error', code: 'invalid_ein', message: 'The EIN must be nine digits (no hyphen).' });
  if (!employer.legalName.trim()) findings.push({ severity: 'error', code: 'missing_name', message: 'The business name is required.' });
  const line1 = employeesOnTwelfth(input.runs, companyId, year, quarter);
  if (line1 === null && line2 > 0) {
    findings.push({ severity: 'warning', code: 'line1_unknown', message: `No approved pay period includes ${year}-${String(quarter * 3).padStart(2, '0')}-12, so line 1 cannot be counted from payroll; enter it by hand.` });
  }
  if (days.length === 0 && !input.seasonalEmployer && !input.finalWageDate) {
    findings.push({ severity: 'info', code: 'no_wages', message: 'No wages were paid this quarter. A Form 941 is still required for every quarter unless you are a seasonal employer or have filed a final return.' });
  }
  if (input.finalWageDate && (input.finalWageDate < bounds.start || input.finalWageDate > bounds.end)) {
    findings.push({ severity: 'warning', code: 'final_date_outside_quarter', message: 'The final wage date on line 17 is not in this quarter.' });
  }
  const election = input.overpaymentElection;
  if (line15a > 0 && !election) {
    findings.push({ severity: 'info', code: 'no_overpayment_election', message: 'Overpayment with no choice on line 15b: the IRS will generally apply it to the next return.' });
  }
  if (election?.kind === 'refund' && (!election.routingNumber || !election.accountNumber || !election.accountType)) {
    findings.push({ severity: 'warning', code: 'refund_without_direct_deposit', message: 'A refund was chosen without lines 15c-15e (routing number, account type, account number); the IRS says the refund may be delayed.' });
  }
  if (line14 > 0 && line14 >= dollars(1)) {
    findings.push({ severity: 'info', code: 'pay_balance_electronically', message: `Pay the ${fmt(line14)} balance by EFT (EFTPS, IRS Direct Pay or the IRS business tax account); for 2026 the IRS asks that balance-due payments be made electronically.` });
  }

  const fields: Form941['fields'] = {
    EIN: employer.ein,
    Name: employer.legalName,
    TradeName: employer.tradeName ?? null,
    Year: year,
    Quarter: quarter,
    Line1: line1,
    Line2: line2,
    Line3: line3,
    Line4: input.noWagesSubjectToSocialSecurityOrMedicare ?? false,
    Line5a_Col1: line5a.column1,
    Line5a_Col2: line5a.column2,
    Line5b_Col1: line5b.column1,
    Line5b_Col2: line5b.column2,
    Line5c_Col1: line5c.column1,
    Line5c_Col2: line5c.column2,
    Line5d_Col1: line5d.column1,
    Line5d_Col2: line5d.column2,
    Line5e: line5e,
    Line5f: line5f,
    Line6: line6,
    Line7: line7,
    Line8: line8,
    Line9: line9,
    Line10: line10,
    Line11: line11,
    Line12: line12,
    Line13: line13,
    Line14: line14,
    Line15a: line15a,
    Line16: choice,
    Line16_Month1: part2.monthlyLiability?.month1 ?? null,
    Line16_Month2: part2.monthlyLiability?.month2 ?? null,
    Line16_Month3: part2.monthlyLiability?.month3 ?? null,
    Line16_Total: part2.monthlyLiability?.total ?? null,
    Line17: input.finalWageDate ?? null,
    Line18: input.seasonalEmployer ?? false,
  };

  return {
    employer,
    year,
    quarter,
    line1_numberOfEmployees: line1,
    line2_wagesTipsOtherCompensation: line2,
    line3_federalIncomeTaxWithheld: line3,
    line4_noWagesSubjectToSocialSecurityOrMedicare: input.noWagesSubjectToSocialSecurityOrMedicare ?? false,
    line5a_socialSecurityWages: line5a,
    line5b_socialSecurityTips: line5b,
    line5c_medicareWagesAndTips: line5c,
    line5d_additionalMedicare: line5d,
    line5e_totalSocialSecurityAndMedicare: line5e,
    line5f_section3121qNoticeAndDemand: line5f,
    line6_totalTaxesBeforeAdjustments: line6,
    line7_fractionsOfCents: line7,
    line8_sickPayAdjustment: line8,
    line9_tipsAndGroupTermLifeAdjustment: line9,
    line10_totalTaxesAfterAdjustments: line10,
    line11_researchCredit: line11,
    line12_totalAfterAdjustmentsAndCredits: line12,
    line13_totalDeposits: line13,
    line14_balanceDue: line14,
    line15a_overpayment: line15a,
    line15b_overpaymentElection: election,
    part2,
    line17_finalWageDate: input.finalWageDate,
    line18_seasonalEmployer: input.seasonalEmployer ?? false,
    scheduleB,
    due: form941Due(year, quarter),
    deposits: { analysis, reconciliation },
    fields,
    findings,
    readyToSign: !findings.some((f) => f.severity === 'error'),
    statistics: { paychecks, payDates: days.length },
  };
}

/** A plain-text rendering laid out like the form, for review before signing. */
export function renderForm941(f: Form941): string {
  const m = (c: Cents) => fmt(c).replace('$', '').padStart(14);
  const row = (line: string, label: string, value: string) => `${line.padEnd(5)}${label.padEnd(58)}${value}`;
  const cols = (line: string, label: string, c: TaxColumns) => row(line, `${label} (${m(c.column1).trim()} x ${c.rate})`, m(c.column2));
  const out: string[] = [
    `Form 941 for ${f.year}, Quarter ${f.quarter} - Employer's QUARTERLY Federal Tax Return (Rev. March 2026)`,
    `${f.employer.legalName}   EIN ${f.employer.ein.slice(0, 2)}-${f.employer.ein.slice(2)}`,
    `Due ${f.due.dueDate}${f.due.extendedDueDate ? ` (${f.due.extendedDueDate} if every deposit was made on time)` : ''}`,
    '',
    row('1', 'Employees for the pay period including the 12th of the last month', String(f.line1_numberOfEmployees ?? '(enter by hand)').padStart(14)),
    row('2', 'Wages, tips, and other compensation', m(f.line2_wagesTipsOtherCompensation)),
    row('3', 'Federal income tax withheld', m(f.line3_federalIncomeTaxWithheld)),
    row('4', 'No wages subject to social security or Medicare tax', f.line4_noWagesSubjectToSocialSecurityOrMedicare ? '[X]'.padStart(14) : ''.padStart(14)),
    cols('5a', 'Taxable social security wages', f.line5a_socialSecurityWages),
    cols('5b', 'Taxable social security tips', f.line5b_socialSecurityTips),
    cols('5c', 'Taxable Medicare wages & tips', f.line5c_medicareWagesAndTips),
    cols('5d', 'Wages & tips subject to Additional Medicare Tax', f.line5d_additionalMedicare),
    row('5e', 'Total social security and Medicare taxes', m(f.line5e_totalSocialSecurityAndMedicare)),
    row('5f', 'Section 3121(q) Notice and Demand', m(f.line5f_section3121qNoticeAndDemand)),
    row('6', 'Total taxes before adjustments (3 + 5e + 5f)', m(f.line6_totalTaxesBeforeAdjustments)),
    row('7', "Current quarter's adjustment for fractions of cents", m(f.line7_fractionsOfCents)),
    row('8', "Current quarter's adjustment for sick pay", m(f.line8_sickPayAdjustment)),
    row('9', "Current quarter's adjustments for tips and group-term life", m(f.line9_tipsAndGroupTermLifeAdjustment)),
    row('10', 'Total taxes after adjustments', m(f.line10_totalTaxesAfterAdjustments)),
    row('11', 'Qualified small business payroll tax credit (Form 8974)', m(f.line11_researchCredit)),
    row('12', 'Total taxes after adjustments and nonrefundable credits', m(f.line12_totalAfterAdjustmentsAndCredits)),
    row('13', 'Total deposits for this quarter', m(f.line13_totalDeposits)),
    row('14', 'Balance due', m(f.line14_balanceDue)),
    row('15a', 'Overpayment', m(f.line15a_overpayment)),
    '',
    `Part 2, line 16: ${{ de_minimis: 'line 12 under $2,500 (de minimis) - no liability record', monthly: 'monthly schedule depositor for the entire quarter', semiweekly: 'semiweekly schedule depositor for any part of the quarter - attach Schedule B' }[f.part2.choice]}`,
  ];
  if (f.part2.monthlyLiability) {
    const l = f.part2.monthlyLiability;
    out.push(row('', 'Month 1', m(l.month1)), row('', 'Month 2', m(l.month2)), row('', 'Month 3', m(l.month3)), row('', 'Total liability for quarter (= line 12)', m(l.total)));
  }
  if (f.scheduleB) {
    out.push('', 'Schedule B (Form 941) - tax liability by date wages were paid:');
    for (const mo of f.scheduleB.months) {
      out.push(`  Month ${mo.month}: ${mo.days.map((d) => `${d.day}: ${fmt(d.liability)}`).join('   ') || '(none)'}   total ${fmt(mo.total)}`);
    }
    out.push(`  Total liability for the quarter: ${fmt(f.scheduleB.totalLiabilityForQuarter)}`);
  }
  if (f.findings.length) {
    out.push('', 'Review:');
    for (const x of f.findings) out.push(`  [${x.severity}] ${x.code}: ${x.message}`);
  }
  out.push('', f.readyToSign ? 'No errors: ready for a responsible person to review and sign.' : 'NOT READY TO SIGN: resolve the errors above.');
  return out.join('\n');
}

/**
 * Federal employment-tax CALENDAR: which days are business days for the IRS,
 * and every deposit and filing deadline that follows from them.
 *
 * Sources, all read in full for this module (not recalled from memory):
 *  - IRS Publication 15 (2026), "Calendar" and section 11 ("Deposits Due on
 *    Business Days Only", "Legal holiday", Tables 1-2, the $100,000 rule).
 *  - Instructions for Form 941 (Rev. 3-2026), "When To File Form 941".
 *  - Instructions for Form 940 (2025), "When Must You Deposit Your FUTA Tax?".
 *  - General Instructions for Forms W-2 and W-3 (2026), "Due date for filing".
 *
 * WHAT COUNTS AS A "LEGAL HOLIDAY". Pub. 15: "the term 'legal holiday' means
 * any legal holiday in the District of Columbia. For purposes of the deposit
 * rules, the term 'legal holiday' doesn't include other statewide legal
 * holidays." Its 2026 list is the test oracle for dcLegalHolidays(): New
 * Year's Day, MLK Day, Washington's Birthday, DC Emancipation Day (Apr 16),
 * Memorial Day, Juneteenth, Independence Day (observed Fri Jul 3 in 2026,
 * because Jul 4 is a Saturday), Labor Day, Indigenous Peoples' Day, Veterans
 * Day, Thanksgiving, Christmas.
 *
 * Two rules are applied that Pub. 15 does not spell out, and are therefore the
 * only judgement calls in this file:
 *  - A fixed-date holiday on a Saturday is observed on the Friday before and
 *    one on a Sunday on the Monday after (5 U.S.C. 6103(b); Pub. 15's
 *    "July 3 - Independence Day (observed)" is exactly this rule). The
 *    observed day can fall in the neighbouring year, so the year before and
 *    after are always consulted.
 *  - Inauguration Day (January 20 following a presidential election, i.e.
 *    2029, 2033, ...) is a DC legal holiday; when it falls on a Sunday, Monday
 *    the 21st is the holiday. It does not occur in any year Pub. 15 lists.
 */

export interface Holiday {
  /** ISO date the holiday is observed (the day the IRS treats as closed). */
  date: string;
  name: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function utc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function fromUtc(d: Date): string {
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekday(date: string): number {
  return utc(date).getUTCDay();
}

export function addDays(date: string, days: number): string {
  const d = utc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/** The nth (1-based) given weekday of a month, e.g. the 3rd Monday of January. */
function nthWeekday(year: number, month: number, dow: number, n: number): string {
  const first = weekday(iso(year, month, 1));
  const offset = (dow - first + 7) % 7;
  return iso(year, month, 1 + offset + (n - 1) * 7);
}

function lastWeekday(year: number, month: number, dow: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = weekday(iso(year, month, lastDay));
  return iso(year, month, lastDay - ((last - dow + 7) % 7));
}

/** Saturday -> the Friday before; Sunday -> the Monday after; otherwise unchanged. */
function observed(date: string): string {
  const dow = weekday(date);
  if (dow === 6) return addDays(date, -1);
  if (dow === 0) return addDays(date, 1);
  return date;
}

const holidayCache = new Map<number, Holiday[]>();

/**
 * DC legal holidays that FALL IN `year` once observed-day shifts are applied
 * (so Jan 1, 2028 - a Saturday - contributes Dec 31, 2027 to 2027's list).
 */
export function dcLegalHolidays(year: number): Holiday[] {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const all: Holiday[] = [];
  for (const y of [year - 1, year, year + 1]) {
    all.push(
      { date: observed(iso(y, 1, 1)), name: "New Year's Day" },
      { date: nthWeekday(y, 1, 1, 3), name: 'Birthday of Martin Luther King, Jr.' },
      { date: nthWeekday(y, 2, 1, 3), name: "Washington's Birthday" },
      { date: observed(iso(y, 4, 16)), name: 'District of Columbia Emancipation Day' },
      { date: lastWeekday(y, 5, 1), name: 'Memorial Day' },
      { date: observed(iso(y, 6, 19)), name: 'Juneteenth National Independence Day' },
      { date: observed(iso(y, 7, 4)), name: 'Independence Day' },
      { date: nthWeekday(y, 9, 1, 1), name: 'Labor Day' },
      { date: nthWeekday(y, 10, 1, 2), name: "Indigenous Peoples' Day (Columbus Day)" },
      { date: observed(iso(y, 11, 11)), name: 'Veterans Day' },
      { date: nthWeekday(y, 11, 4, 4), name: 'Thanksgiving Day' },
      { date: observed(iso(y, 12, 25)), name: 'Christmas Day' },
    );
    if (y % 4 === 1) {
      const inauguration = iso(y, 1, 20);
      all.push({ date: weekday(inauguration) === 0 ? addDays(inauguration, 1) : inauguration, name: 'Inauguration Day' });
    }
  }
  const list = all.filter((h) => h.date.startsWith(`${year}-`)).sort((a, b) => a.date.localeCompare(b.date));
  holidayCache.set(year, list);
  return list;
}

export function isLegalHoliday(date: string): boolean {
  const year = Number(date.slice(0, 4));
  return dcLegalHolidays(year).some((h) => h.date === date);
}

/** Pub. 15: "A business day is any day other than a Saturday, Sunday, or legal holiday." */
export function isBusinessDay(date: string): boolean {
  const dow = weekday(date);
  return dow !== 0 && dow !== 6 && !isLegalHoliday(date);
}

/** `date` itself if it is a business day, otherwise the next one. */
export function onOrNextBusinessDay(date: string): string {
  let d = date;
  while (!isBusinessDay(d)) d = addDays(d, 1);
  return d;
}

/** The first business day strictly after `date`. */
export function nextBusinessDay(date: string): string {
  return onOrNextBusinessDay(addDays(date, 1));
}

/** The nth business day strictly after `date` (n >= 1). */
export function nthBusinessDayAfter(date: string, n: number): string {
  let d = date;
  for (let i = 0; i < n; i += 1) d = nextBusinessDay(d);
  return d;
}

// ---------------------------------------------------------------------------
// Deposits
// ---------------------------------------------------------------------------

export type DepositSchedule = 'monthly' | 'semiweekly';

/** Monthly depositors: "deposit employment taxes on payments made during a month by the 15th day of the following month." */
export function monthlyDepositDue(payDate: string): string {
  const [y, m] = payDate.split('-').map(Number);
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear = m === 12 ? y + 1 : y;
  return onOrNextBusinessDay(iso(nextYear, nextMonth, 15));
}

/**
 * The last day of the semiweekly deposit period a pay date belongs to:
 * Wednesday-Friday pay dates close on the Friday; Saturday-Tuesday pay dates
 * close on the Tuesday (Pub. 15, "Deposit period").
 */
export function semiweeklyPeriodEnd(payDate: string): string {
  const dow = weekday(payDate);
  if (dow >= 3 && dow <= 5) return addDays(payDate, 5 - dow); // Wed..Fri -> Fri
  if (dow === 6) return addDays(payDate, 3); // Sat -> Tue
  if (dow === 0) return addDays(payDate, 2); // Sun -> Tue
  return addDays(payDate, 2 - dow); // Mon, Tue -> Tue
}

/**
 * Semiweekly depositors "have at least 3 business days following the close of
 * the semiweekly period to make a deposit. If any of the 3 weekdays after the
 * end of a semiweekly period is a legal holiday, you'll have an additional day
 * for each day that is a legal holiday." That is, the due date is the third
 * BUSINESS day after the period closes - Wednesday after a Friday close and
 * Friday after a Tuesday close when no holiday intervenes (Table 2).
 */
export function semiweeklyDepositDue(payDate: string): string {
  return nthBusinessDayAfter(semiweeklyPeriodEnd(payDate), 3);
}

/** The $100,000 next-day rule: "deposit the tax by the next business day." */
export function nextDayDepositDue(accumulationDate: string): string {
  return nextBusinessDay(accumulationDate);
}

export function depositDue(schedule: DepositSchedule, payDate: string): string {
  return schedule === 'monthly' ? monthlyDepositDue(payDate) : semiweeklyDepositDue(payDate);
}

/**
 * Form 940: when FUTA tax accumulated through the end of a quarter exceeds
 * $500 it is deposited "by the last day of the month after the end of the
 * quarter" (Apr 30, Jul 31, Oct 31, Jan 31), moved to the next business day
 * when that is not one.
 */
export function futaDepositDue(year: number, quarter: 1 | 2 | 3 | 4): string {
  const dueByQuarter: Record<number, string> = {
    1: iso(year, 4, 30),
    2: iso(year, 7, 31),
    3: iso(year, 10, 31),
    4: iso(year + 1, 1, 31),
  };
  return onOrNextBusinessDay(dueByQuarter[quarter]);
}

// ---------------------------------------------------------------------------
// Returns
// ---------------------------------------------------------------------------

export interface ReturnDue {
  /** The ordinary due date, already moved off weekends and legal holidays. */
  dueDate: string;
  /**
   * The later date available when every deposit for the period was made in
   * full and on time ("you may file Form 941 by May 10 if you made timely
   * deposits in full payment of your taxes for the 1st quarter"). Absent for
   * returns with no such extension.
   */
  extendedDueDate?: string;
}

/**
 * Form 941 is "due by the last day of the month that follows the end of the
 * quarter"; timely, full deposits extend it to the 10th day of the 2nd month
 * that follows the quarter. Either date that lands on a weekend or legal
 * holiday moves to the next business day.
 */
export function form941Due(year: number, quarter: 1 | 2 | 3 | 4): ReturnDue {
  const last = { 1: iso(year, 4, 30), 2: iso(year, 7, 31), 3: iso(year, 10, 31), 4: iso(year + 1, 1, 31) }[quarter];
  const tenth = { 1: iso(year, 5, 10), 2: iso(year, 8, 10), 3: iso(year, 11, 10), 4: iso(year + 1, 2, 10) }[quarter];
  return { dueDate: onOrNextBusinessDay(last), extendedDueDate: onOrNextBusinessDay(tenth) };
}

/** Form 940 is due January 31 after the year; February 10 when all FUTA tax was deposited on time. */
export function form940Due(year: number): ReturnDue {
  return {
    dueDate: onOrNextBusinessDay(iso(year + 1, 1, 31)),
    extendedDueDate: onOrNextBusinessDay(iso(year + 1, 2, 10)),
  };
}

/**
 * Forms W-2 and W-3 to the SSA, and W-2 copies to employees: January 31 after
 * the year, or the next business day (the 2026 forms are due February 1, 2027
 * because January 31, 2027 is a Sunday - stated in the W-2/W-3 instructions
 * and asserted in the tests).
 */
export function formW2Due(year: number): string {
  return onOrNextBusinessDay(iso(year + 1, 1, 31));
}

export function quarterOf(date: string): 1 | 2 | 3 | 4 {
  const m = Number(date.slice(5, 7));
  return (Math.floor((m - 1) / 3) + 1) as 1 | 2 | 3 | 4;
}

/** First and last day of a quarter. */
export function quarterBounds(year: number, quarter: 1 | 2 | 3 | 4): { start: string; end: string } {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const lastDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
  return { start: iso(year, startMonth, 1), end: iso(year, endMonth, lastDay) };
}

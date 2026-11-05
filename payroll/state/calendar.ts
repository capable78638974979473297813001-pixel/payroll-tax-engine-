import { addDays, quarterOf, weekday } from '../federal/calendar.ts';
import type { Finding } from '../federal/form941.ts';
import type { DueRule, StateProfile } from './profile.ts';

/**
 * A state's business days and due dates, driven by its profile.
 *
 * State due dates move off weekends and "legal holidays" (the wording the agencies
 * use). A state's holiday list is its own, not the federal one, so a profile says
 * whether the list was actually read (`calendar.holidays.verified`). When it was
 * not, weekends alone are skipped and every result carries the finding
 * `state_holidays_not_modelled` rather than silently trusting the federal list.
 */

export const HOLIDAYS_NOT_MODELLED = 'state_holidays_not_modelled';

function isHoliday(date: string, p: StateProfile, extra: readonly string[]): boolean {
  return (p.calendar.holidays.dates ?? []).includes(date) || extra.includes(date);
}

export function isStateBusinessDay(date: string, p: StateProfile, extraHolidays: readonly string[] = []): boolean {
  const dow = weekday(date);
  if (p.calendar.weekendsRoll && (dow === 0 || dow === 6)) return false;
  return !isHoliday(date, p, extraHolidays);
}

export function onOrNextStateBusinessDay(date: string, p: StateProfile, extraHolidays: readonly string[] = []): string {
  let d = date;
  while (!isStateBusinessDay(d, p, extraHolidays)) d = addDays(d, 1);
  return d;
}

export function nextStateBusinessDay(date: string, p: StateProfile, extraHolidays: readonly string[] = []): string {
  return onOrNextStateBusinessDay(addDays(date, 1), p, extraHolidays);
}

export function nthStateBusinessDayAfter(date: string, n: number, p: StateProfile, extraHolidays: readonly string[] = []): string {
  let d = date;
  for (let i = 0; i < n; i += 1) d = nextStateBusinessDay(d, p, extraHolidays);
  return d;
}

/** The warning every date computed from an unverified holiday list must carry. */
export function holidayFinding(p: StateProfile): Finding | undefined {
  if (p.calendar.holidays.verified) return undefined;
  return {
    severity: 'warning',
    code: HOLIDAYS_NOT_MODELLED,
    message: `${p.state}: the state's legal-holiday list has not been read, so due dates skip weekends only. A date that falls on a state holiday may really be due the next business day; check it against the agency's calendar.`,
  };
}

export interface ResolvedDue {
  dueDate: string;
  /** The date after which the state treats it as late, when it differs from the due date (California's "last timely date"). */
  delinquentAfter?: string;
  /** When an electronic payment must settle, when the state states it separately from the initiation date. */
  settleBy?: string;
}

function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Resolve a due rule for a period. `anchor` is the date the rule starts from: for a
 * quarterly rule any date in the quarter; for `day_of_month_after` any date in the
 * month; for the business-day rules the pay date or period end.
 */
export function resolveDue(rule: DueRule, anchor: string, p: StateProfile, extraHolidays: readonly string[] = []): ResolvedDue {
  const roll = (d: string) => onOrNextStateBusinessDay(d, p, extraHolidays);
  const year = Number(anchor.slice(0, 4));
  const month = Number(anchor.slice(5, 7));
  switch (rule.kind) {
    case 'table': {
      const key = `${year}-Q${quarterOf(anchor)}`;
      const row = rule.dates[key];
      if (!row) throw new Error(`NOT MODELLED: ${p.state} has no published due dates for ${key}; add them from the agency's table.`);
      return { dueDate: row.due, delinquentAfter: row.delinquent, settleBy: row.settle };
    }
    case 'last_day_of_month_after_quarter': {
      const q = quarterOf(anchor);
      const endMonth = q * 3 + 1;
      const y = endMonth > 12 ? year + 1 : year;
      const m = endMonth > 12 ? 1 : endMonth;
      return { dueDate: roll(lastDayOfMonth(y, m)) };
    }
    case 'last_day_of_following_month': {
      const m = month === 12 ? 1 : month + 1;
      const y = month === 12 ? year + 1 : year;
      return { dueDate: roll(lastDayOfMonth(y, m)) };
    }
    case 'day_of_month_after': {
      const m = month === 12 ? 1 : month + 1;
      const y = month === 12 ? year + 1 : year;
      const dd = month === 12 && rule.decemberDay !== undefined ? rule.decemberDay : rule.day;
      return { dueDate: roll(`${y}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`) };
    }
    case 'business_days_after_period_end':
      return { dueDate: nthStateBusinessDayAfter(anchor, rule.days, p, extraHolidays) };
    case 'next_weekday_after_period_end': {
      let d = addDays(anchor, 1);
      while (weekday(d) !== rule.weekday) d = addDays(d, 1);
      return { dueDate: roll(d) };
    }
    case 'january_day_next_year':
      return { dueDate: roll(`${year + 1}-01-${String(rule.day).padStart(2, '0')}`) };
    case 'calendar_days_after_month_end':
      return { dueDate: roll(addDays(lastDayOfMonth(year, month), rule.days)) };
    case 'semimonthly_days': {
      const day = Number(anchor.slice(8, 10));
      if (day <= 15) return { dueDate: roll(`${anchor.slice(0, 7)}-${String(Math.min(rule.firstHalfDay, Number(lastDayOfMonth(year, month).slice(8, 10)))).padStart(2, '0')}`) };
      const m = month === 12 ? 1 : month + 1;
      const y = month === 12 ? year + 1 : year;
      return { dueDate: roll(`${y}-${String(m).padStart(2, '0')}-${String(rule.secondHalfDay).padStart(2, '0')}`) };
    }
    case 'day_of_month_after_quarter': {
      const endMonth = quarterOf(anchor) * 3 + 1;
      const y = endMonth > 12 ? year + 1 : year;
      const m = endMonth > 12 ? 1 : endMonth;
      return { dueDate: roll(`${y}-${String(m).padStart(2, '0')}-${String(rule.day).padStart(2, '0')}`) };
    }
    case 'semiweekly_following': {
      const want = weekday(anchor) === 5 ? rule.afterFriday : rule.afterTuesday;
      let d = addDays(anchor, 1);
      while (weekday(d) !== want) d = addDays(d, 1);
      return { dueDate: roll(d) };
    }
    case 'month_day_next_year':
      return { dueDate: roll(`${year + 1}-${String(rule.month).padStart(2, '0')}-${String(rule.day).padStart(2, '0')}`) };
    case 'next_business_day': {
      const due = nextStateBusinessDay(anchor, p, extraHolidays);
      return { dueDate: due, settleBy: rule.settleBusinessDays ? nthStateBusinessDayAfter(anchor, rule.settleBusinessDays, p, extraHolidays) : undefined };
    }
  }
}

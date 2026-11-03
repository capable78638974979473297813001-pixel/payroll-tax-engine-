import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  dcLegalHolidays,
  depositDue,
  form940Due,
  form941Due,
  formW2Due,
  futaDepositDue,
  isBusinessDay,
  isLegalHoliday,
  monthlyDepositDue,
  nextBusinessDay,
  nextDayDepositDue,
  quarterBounds,
  quarterOf,
  semiweeklyDepositDue,
  semiweeklyPeriodEnd,
} from '../payroll/federal/calendar.ts';

/**
 * Every expectation here is a date the IRS prints in Publication 15 (2026),
 * the Form 941 / Schedule B instructions or the W-2/W-3 instructions, not a
 * number worked out by the code under test.
 */
describe('federal calendar (payroll/federal/calendar.ts)', () => {
  test("matches Pub. 15 (2026)'s list of legal holidays exactly", () => {
    // Pub. 15 section 11, "Legal holiday", verbatim.
    const irs = [
      '2026-01-01', // New Year's Day
      '2026-01-19', // Birthday of Martin Luther King, Jr.
      '2026-02-16', // Washington's Birthday
      '2026-04-16', // District of Columbia Emancipation Day
      '2026-05-25', // Memorial Day
      '2026-06-19', // Juneteenth National Independence Day
      '2026-07-03', // Independence Day (observed)
      '2026-09-07', // Labor Day
      '2026-10-12', // Indigenous Peoples' Day (Columbus Day)
      '2026-11-11', // Veterans Day
      '2026-11-26', // Thanksgiving Day
      '2026-12-25', // Christmas Day
    ];
    assert.deepEqual(
      dcLegalHolidays(2026).map((h) => h.date),
      irs,
    );
  });

  test('a Saturday holiday is observed the Friday before, a Sunday one the Monday after', () => {
    // Jul 4, 2026 is a Saturday -> Fri Jul 3 (the IRS says so). Jul 4, 2027 is a Sunday -> Mon Jul 5.
    assert.equal(isLegalHoliday('2026-07-03'), true);
    assert.equal(isLegalHoliday('2026-07-04'), false);
    assert.equal(isLegalHoliday('2027-07-05'), true);
    // Jan 1, 2028 is a Saturday: the observed day is Dec 31, 2027, in the PREVIOUS year's list.
    assert.equal(isLegalHoliday('2027-12-31'), true);
    assert.equal(dcLegalHolidays(2028).some((h) => h.date === '2028-01-01'), false);
  });

  test('Inauguration Day is a holiday in the years that have one, and only those', () => {
    assert.equal(isLegalHoliday('2029-01-20'), true); // Saturday: stays on the 20th
    assert.equal(isLegalHoliday('2033-01-20'), true); // Thursday
    assert.equal(isLegalHoliday('2041-01-20'), false); // Sunday: the holiday is Monday the 21st instead
    assert.equal(isLegalHoliday('2041-01-21'), true);
    assert.equal(isLegalHoliday('2028-01-20'), false); // not an inauguration year
  });

  test('business days exclude weekends and DC holidays but not state holidays', () => {
    assert.equal(isBusinessDay('2026-05-25'), false); // Memorial Day
    assert.equal(isBusinessDay('2026-05-23'), false); // Saturday
    assert.equal(isBusinessDay('2026-05-26'), true);
    assert.equal(nextBusinessDay('2026-05-22'), '2026-05-26'); // Fri -> skips Sat, Sun, Memorial Day
  });

  describe('monthly deposits', () => {
    test('are due the 15th of the following month', () => {
      // Pub. 15: Spruce Co. deposits March paydays by April 15.
      assert.equal(monthlyDepositDue('2026-03-27'), '2026-04-15');
      assert.equal(monthlyDepositDue('2026-12-31'), '2027-01-15');
    });
    test('move to the next business day when the 15th is not one', () => {
      assert.equal(monthlyDepositDue('2026-01-09'), '2026-02-17'); // Feb 15 is Sunday, Feb 16 is a holiday
      assert.equal(monthlyDepositDue('2026-04-10'), '2026-05-15'); // Friday
      assert.equal(monthlyDepositDue('2026-09-04'), '2026-10-15'); // Thursday
    });
  });

  describe('semiweekly deposits (Pub. 15, Table 2)', () => {
    test('Wednesday-Friday paydays are due the following Wednesday', () => {
      for (const d of ['2026-06-03', '2026-06-04', '2026-06-05']) {
        assert.equal(semiweeklyPeriodEnd(d), '2026-06-05');
        assert.equal(semiweeklyDepositDue(d), '2026-06-10');
      }
    });
    test('Saturday-Tuesday paydays are due the following Friday', () => {
      for (const d of ['2026-06-06', '2026-06-07', '2026-06-08', '2026-06-09']) {
        assert.equal(semiweeklyPeriodEnd(d), '2026-06-09');
        assert.equal(semiweeklyDepositDue(d), '2026-06-12');
      }
    });
    test("Green, Inc.'s May 29, 2026 payday is deposited by Wednesday June 3 (Pub. 15 example)", () => {
      assert.equal(semiweeklyDepositDue('2026-05-29'), '2026-06-03');
    });
    test('pay dates in different quarters share one due date (Pub. 15: Sep 30 and Oct 2 -> Oct 7)', () => {
      assert.equal(semiweeklyDepositDue('2026-09-30'), '2026-10-07');
      assert.equal(semiweeklyDepositDue('2026-10-02'), '2026-10-07');
    });
    test('a legal holiday among the 3 days after the period adds a day (Friday payday, Monday holiday -> Thursday)', () => {
      // Pub. 15: "payments made on Friday and the following Monday is a legal holiday, the deposit normally due on Wednesday may be made on Thursday".
      assert.equal(semiweeklyDepositDue('2026-05-22'), '2026-05-28'); // Memorial Day Mon May 25
      assert.equal(semiweeklyDepositDue('2026-05-15'), '2026-05-20'); // no holiday: ordinary Wednesday
    });
    test('a holiday on the due day itself rolls to the next business day', () => {
      // Tue Jun 16 closes the period for Jun 13-16 pay; the 3rd business day after is Fri Jun 19, Juneteenth -> Mon Jun 22.
      assert.equal(semiweeklyDepositDue('2026-06-16'), '2026-06-22');
    });
  });

  test('the $100,000 rule is the next business day (Elm, Inc.: accumulated Fri May 8, 2026 -> Mon May 11)', () => {
    assert.equal(nextDayDepositDue('2026-05-08'), '2026-05-11');
    assert.equal(nextDayDepositDue('2026-07-02'), '2026-07-06'); // Jul 3 is the observed holiday
  });

  test('depositDue dispatches on the schedule', () => {
    assert.equal(depositDue('monthly', '2026-03-27'), '2026-04-15');
    assert.equal(depositDue('semiweekly', '2026-05-29'), '2026-06-03');
  });

  describe('return due dates', () => {
    test('Form 941: last day of the following month, or the 10th of the next one with timely deposits', () => {
      // Instructions for Form 941: Q1 -> Apr 30 (May 10 extended).
      assert.deepEqual(form941Due(2026, 1), { dueDate: '2026-04-30', extendedDueDate: '2026-05-11' }); // May 10 is a Sunday
      assert.deepEqual(form941Due(2026, 2), { dueDate: '2026-07-31', extendedDueDate: '2026-08-10' });
      assert.deepEqual(form941Due(2026, 3), { dueDate: '2026-11-02', extendedDueDate: '2026-11-10' }); // Oct 31 is a Saturday
    });
    test('the Q4 return crosses into the next year', () => {
      assert.deepEqual(form941Due(2026, 4), { dueDate: '2027-02-01', extendedDueDate: '2027-02-10' }); // Jan 31, 2027 is a Sunday
    });
    test('Form 940: Jan 31, or Feb 10 with timely FUTA deposits', () => {
      assert.deepEqual(form940Due(2025), { dueDate: '2026-02-02', extendedDueDate: '2026-02-10' }); // Instructions for Form 940 (2025) say Feb 2, 2026
      assert.deepEqual(form940Due(2026), { dueDate: '2027-02-01', extendedDueDate: '2027-02-10' });
    });
    test('Forms W-2/W-3: the 2026 forms are due February 1, 2027 (W-2/W-3 instructions)', () => {
      assert.equal(formW2Due(2026), '2027-02-01');
      assert.equal(formW2Due(2025), '2026-02-02'); // Jan 31, 2026 is a Saturday
    });
    test('FUTA deposits are due the last day of the month after the quarter', () => {
      assert.equal(futaDepositDue(2025, 1), '2025-04-30');
      assert.equal(futaDepositDue(2025, 3), '2025-10-31');
      assert.equal(futaDepositDue(2025, 4), '2026-02-02'); // Instructions for Form 940 (2025): "deposit the entire amount by February 2, 2026"
    });
  });

  test('quarter helpers', () => {
    assert.equal(quarterOf('2026-09-30'), 3);
    assert.equal(quarterOf('2026-10-01'), 4);
    assert.deepEqual(quarterBounds(2026, 2), { start: '2026-04-01', end: '2026-06-30' });
    assert.deepEqual(quarterBounds(2028, 1), { start: '2028-01-01', end: '2028-03-31' });
  });
});

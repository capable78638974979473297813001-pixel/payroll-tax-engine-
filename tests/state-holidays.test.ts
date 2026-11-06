import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { loadProfile, modelledStates, holidayFinding, isStateBusinessDay, onOrNextStateBusinessDay, validateProfile } from '../payroll/state/index.ts';

/**
 * Legal-holiday lists. Only an agency's own list counts: California's EDD publishes its observed legal holidays
 * and the next business day for each (2026 only); Delaware's Division of Revenue publishes a holiday table for
 * 2026-2029. Every other state still skips weekends only and says so. A state employee holiday schedule is NOT
 * used in place of the agency's list, because applying a holiday the agency does not observe could push a computed
 * due date later than the real one.
 */

const CA = loadProfile('CA');
const DE = loadProfile('DE');

describe('California (EDD observed legal holidays, 2026)', () => {
  test('the next business day for each holiday matches the EDD table', () => {
    const next: Record<string, string> = {
      '2026-01-01': '2026-01-02', '2026-01-19': '2026-01-20', '2026-02-12': '2026-02-13', '2026-02-16': '2026-02-17',
      '2026-03-31': '2026-04-01', '2026-04-03': '2026-04-06', '2026-04-24': '2026-04-27',
      '2026-05-25': '2026-05-26', '2026-06-19': '2026-06-22', '2026-07-03': '2026-07-06', '2026-09-07': '2026-09-08',
      '2026-09-09': '2026-09-10', '2026-09-25': '2026-09-28', '2026-10-12': '2026-10-13', '2026-11-11': '2026-11-12',
      '2026-11-26': '2026-11-30', '2026-11-27': '2026-11-30', '2026-12-25': '2026-12-28',
    };
    // February 17 (Lunar New Year) is left out of the dates: EDD's table also prints it as Presidents' Day's next business day.
    assert.equal(onOrNextStateBusinessDay('2026-02-17', CA), '2026-02-17');
    for (const [holiday, expected] of Object.entries(next)) assert.equal(onOrNextStateBusinessDay(holiday, CA), expected, holiday);
  });
  test('a year the page does not publish still carries the holiday warning', () => {
    assert.equal(CA.calendar.holidays.verified, false);
    assert.deepEqual(CA.calendar.holidays.years, [2026]);
    assert.match(holidayFinding(CA)!.message, /only the agency's 2026/);
  });
});

describe('Delaware (Division of Revenue holiday table, 2026-2027)', () => {
  test('Election Day, the day after Thanksgiving, Good Friday and the observed Christmas are closed', () => {
    for (const d of ['2026-11-03', '2026-11-27', '2026-04-03', '2027-12-24', '2027-12-31', '2026-07-03']) assert.equal(isStateBusinessDay(d, DE), false, d);
    assert.equal(isStateBusinessDay('2026-07-06', DE), true);
  });
  test('verified for the years it covers, so no warning', () => {
    assert.equal(DE.calendar.holidays.verified, true);
    assert.equal(holidayFinding(DE), undefined);
  });
});

describe('Minnesota (Department of Revenue withholding holiday schedule, 2026)', () => {
  const MN = loadProfile('MN');
  test('Emancipation Day is a holiday, July 3 is not, and Independence Day is observed July 6', () => {
    assert.equal(isStateBusinessDay('2026-04-16', MN), false);
    assert.equal(isStateBusinessDay('2026-07-03', MN), true);
    assert.equal(onOrNextStateBusinessDay('2026-07-06', MN), '2026-07-07');
  });
  test('2026 only, so the warning stays', () => {
    assert.deepEqual(MN.calendar.holidays.years, [2026]);
    assert.match(holidayFinding(MN)!.message, /only the agency's 2026/);
  });
});

describe('every other state still says its list was not read', () => {
  test('weekends only, with the warning', () => {
    for (const st of modelledStates().filter((s) => s !== 'CA' && s !== 'DE' && s !== 'MN')) {
      const p = loadProfile(st);
      assert.equal(p.calendar.holidays.verified, false, st);
      assert.equal(p.calendar.holidays.dates, undefined, st);
      assert.match(holidayFinding(p)!.message, /has not been read/, st);
    }
  });
  test('a holiday list without its years or source is rejected', () => {
    const p = JSON.parse(JSON.stringify(DE));
    delete p.calendar.holidays.years;
    assert.match(validateProfile(p).join(';'), /needs dates and the years/);
    const q = JSON.parse(JSON.stringify(DE));
    q.calendar.holidays.source = 'H9';
    assert.match(validateProfile(q).join(';'), /unknown source H9/);
  });
});

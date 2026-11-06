import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { loadProfile, modelledStates, newHireDeadline, newHireStatus, coverage } from '../payroll/state/index.ts';
import { deadlineDaysForState, FEDERAL_DEFAULT_DEADLINE_DAYS } from '../payroll/newHireReporting.ts';

/**
 * New-hire reporting for every state and DC. The timeframes are from the U.S. Department of Health and Human
 * Services' State New Hire Reporting matrix (each state's own entry, with its update date), which is why this
 * table is pinned here: a state that changes its number of days changes the matrix and then this test.
 */

const SHORTER: Record<string, number> = { AL: 7, ME: 7, GA: 10, VT: 10, MA: 14, RI: 14, WV: 14, IA: 15, MS: 15 };
const STATES = modelledStates().filter((s) => s !== 'PR' && s !== 'VI');

describe('new-hire reporting rules in the state profiles', () => {
  test('all fifty states and DC have one; Puerto Rico and the Virgin Islands do not', () => {
    assert.equal(STATES.length, 51);
    for (const st of STATES) assert.ok(loadProfile(st).newHire, st);
    for (const st of ['PR', 'VI']) assert.equal(loadProfile(st).newHire, undefined, st);
  });

  test('nine states are shorter than the federal 20 days and no state is longer', () => {
    for (const st of STATES) {
      const days = loadProfile(st).newHire!.daysFromStart;
      assert.equal(days, SHORTER[st] ?? 20, `${st}: ${days}`);
      assert.ok(days <= FEDERAL_DEFAULT_DEADLINE_DAYS, st);
    }
  });

  test('every rule cites a source that is in the profile, and the directory agency is named', () => {
    for (const st of STATES) {
      const p = loadProfile(st);
      assert.ok(p.sources.some((s) => s.id === p.newHire!.source), st);
      assert.equal(p.agencies.newHire?.source, p.newHire!.source, st);
      assert.match(p.agencies.newHire!.name, /Directory of New Hires|New Employee Registry/, st);
    }
  });

  test('calendar days from hire, with no weekend roll', () => {
    assert.equal(newHireDeadline(loadProfile('AL'), '2026-11-02').dueDate, '2026-11-09');
    assert.equal(newHireDeadline(loadProfile('GA'), '2026-11-02').dueDate, '2026-11-12');
    assert.equal(newHireDeadline(loadProfile('TX'), '2026-11-02').dueDate, '2026-11-22'); // a Sunday: not rolled
    assert.equal(newHireDeadline(loadProfile('MA'), '2026-12-20').dueDate, '2027-01-03');
    assert.equal(newHireStatus(loadProfile('ME'), '2026-11-02', '2026-11-10').state, 'overdue');
    assert.equal(newHireStatus(loadProfile('ME'), '2026-11-02', '2026-11-05').state, 'due_soon');
  });

  test('Maryland\'s days come from the Department of Human Services page because the federal matrix is silent', () => {
    const md = loadProfile('MD');
    assert.equal(md.newHire!.source, 'N2');
    assert.match(md.sources.find((s) => s.id === 'N2')!.url, /dhs\.maryland\.gov/);
  });
});

describe('the paycheck engine\'s new-hire worklist uses the state\'s own number of days', () => {
  test('deadlineDaysForState reads the profile and falls back to 20 only where no rule is recorded', () => {
    assert.deepEqual(['AL', 'ME', 'GA', 'VT', 'MA', 'IA', 'CA', 'TX', 'NY'].map(deadlineDaysForState), [7, 7, 10, 10, 14, 15, 20, 20, 20]);
    assert.equal(deadlineDaysForState('ga'), 10);
    assert.equal(deadlineDaysForState('PR'), 20);
    assert.equal(deadlineDaysForState('ZZ'), 20);
  });
});

describe('coverage', () => {
  test('new-hire reporting is modelled for 51 of 53; only the territories say NOT MODELLED', () => {
    const rows = coverage();
    assert.deepEqual(rows.filter((r) => r.functions.newHire !== 'modelled').map((r) => r.code).sort(), ['PR', 'VI']);
  });
});

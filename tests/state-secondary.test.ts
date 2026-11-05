import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { dollars } from '../src/money.ts';
import { analyzeStateDeposits, loadProfile, modelledStates, stateQuarterlyReport, type StateDay } from '../payroll/state/index.ts';

/**
 * A profile whose rules were taken from a search summary (the agency refused automated access) must say so in every
 * result. No profile is in that position now (Nevada, New Hampshire and Tennessee were read from the states' published
 * regulations and the U.S. Department of Labor instead), but the mechanism stays tested, and the pin below makes
 * re-introducing a secondary source a deliberate, reviewed change.
 */
const SECONDARY = modelledStates().filter((s) => loadProfile(s).sources.some((x) => x.secondary));
const day: StateDay = { date: '2026-08-07', withholding: dollars(100), withholdingWages: 0, employeeInsurance: 0, employerUi: 0, uiWages: 0, employeeIds: [] };

describe('secondary-sourced profiles', () => {
  test('no profile is secondary-sourced', () => {
    assert.deepEqual(SECONDARY, []);
  });
  test('a profile flagged secondary carries the warning in deposit analyses and unemployment reports', () => {
    const flagged = structuredClone(loadProfile('MS'));
    flagged.sources[0].secondary = true;
    const r = analyzeStateDeposits(flagged, [day], undefined, { assignedFrequency: 'monthly' });
    assert.equal(r.findings.some((f) => f.code === 'state_source_secondary' && f.severity === 'warning'), true);
    const u = structuredClone(loadProfile('FL'));
    u.sources[0].secondary = true;
    assert.equal(stateQuarterlyReport(u, 'c', [], 2026, 3).findings.some((f) => f.code === 'state_source_secondary'), true);
  });
  test('an unflagged profile has no such warning', () => {
    const r = analyzeStateDeposits(loadProfile('OH'), [day], undefined, { assignedFrequency: 'monthly' });
    assert.equal(r.findings.some((f) => f.code === 'state_source_secondary'), false);
    assert.equal(stateQuarterlyReport(loadProfile('NV'), 'c', [], 2026, 3).findings.some((f) => f.code === 'state_source_secondary'), false);
  });
});

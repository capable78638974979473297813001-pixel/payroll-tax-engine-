import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { dollars } from '../src/money.ts';
import { analyzeStateDeposits, loadProfile, modelledStates, type StateDay } from '../payroll/state/index.ts';

/**
 * A profile whose rules were taken from a search summary (the agency refused automated access) must say so in every
 * result. These tests pin which states are in that position, so clearing a flag is a deliberate, reviewed change.
 */
const SECONDARY = modelledStates().filter((s) => loadProfile(s).sources.some((x) => x.secondary));

describe('secondary-sourced profiles', () => {
  test('exactly Massachusetts, Nevada and New Hampshire, each with a source that says what was not read', () => {
    assert.deepEqual(SECONDARY, ['MA', 'NH', 'NV']);
    for (const st of SECONDARY) for (const s of loadProfile(st).sources.filter((x) => x.secondary)) assert.match(s.verifiedBy, /NOT READ FROM THE AGENCY/);
  });
  test('every deposit analysis for one carries the state_source_secondary warning', () => {
    const day: StateDay = { date: '2026-08-07', withholding: dollars(100), withholdingWages: 0, employeeInsurance: 0, employerUi: 0, uiWages: 0, employeeIds: [] };
    const r = analyzeStateDeposits(loadProfile('MA'), [day], undefined, { assignedFrequency: 'monthly' });
    assert.equal(r.findings.some((f) => f.code === 'state_source_secondary' && f.severity === 'warning'), true);
  });
  test('a profile read from the agency has no such warning', () => {
    const day: StateDay = { date: '2026-08-07', withholding: dollars(100), withholdingWages: 0, employeeInsurance: 0, employerUi: 0, uiWages: 0, employeeIds: [] };
    const r = analyzeStateDeposits(loadProfile('OH'), [day], undefined, { assignedFrequency: 'monthly' });
    assert.equal(r.findings.some((f) => f.code === 'state_source_secondary'), false);
  });
});

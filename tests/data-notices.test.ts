import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { calculatePaycheck } from '../src/calculate.ts';
import { allKYJurisdictions } from '../src/registry.ts';
import type { PaycheckInput } from '../src/types.ts';

/**
 * Lower-confidence rates and unmodelled elections are disclosed in the
 * data files; these tests pin that a calculation touching one also says
 * so in its result, where an API caller will actually see it.
 */

const base = (state: string, certificate: Record<string, unknown> = {}): PaycheckInput => ({
  checkDate: '2026-06-15',
  payFrequency: 'biweekly',
  earnings: [{ code: 'REG', category: 'regular', amount: 250000 }],
  deductions: [],
  federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
  ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
  workState: { code: state, certificate } as PaycheckInput['workState'],
});

describe('data-quality notices on the paycheck result', () => {
  test('a primary-sourced paycheck carries no notices', () => {
    const r = calculatePaycheck(base('PA'));
    assert.equal(r.notices, undefined);
  });

  test('an Alabama municipal occupational tax line is marked as survey-sourced', () => {
    const r = calculatePaycheck(base('AL', { workCity: 'Birmingham', exemptions: 'S', dependents: 0 }));
    const line = r.taxes.find((t) => t.id === 'AL_LOCAL')!;
    assert.ok(line, 'expected an AL_LOCAL line');
    assert.equal(line.dataQuality?.tier, 'secondary_source');
    assert.deepEqual(r.notices?.map((n) => n.taxId), ['AL_LOCAL']);
  });

  test('a Kentucky line with an inferred rate is marked inferred', () => {
    const inferred = allKYJurisdictions('2026-06-15').find((e) => e.wageRateStatus?.startsWith('inferred'))!;
    assert.ok(inferred, 'expected at least one inferred KY entry');
    const r = calculatePaycheck(base('KY', { workCity: inferred.name }));
    const line = r.taxes.find((t) => t.id === 'KY_LOCAL')!;
    assert.equal(line.dataQuality?.tier, 'inferred');
    assert.match(r.notices![0].note, new RegExp(inferred.name));
  });

  test('an Arkansas low-income election is reported as not modelled, not silently ignored', () => {
    const plain = calculatePaycheck(base('AR', { exemptions: 1 }));
    assert.equal(plain.notices, undefined);
    const elected = calculatePaycheck(base('AR', { exemptions: 1, lowIncomeElection: true }));
    const n = elected.notices!.find((x) => x.taxId === 'AR_SIT')!;
    assert.equal(n.tier, 'not_modelled');
    assert.match(n.note, /AR4EC Line 5/);
    // Same (standard-formula) amount either way — the notice is the difference.
    assert.equal(
      elected.taxes.find((t) => t.id === 'AR_SIT')!.amount,
      plain.taxes.find((t) => t.id === 'AR_SIT')!.amount,
    );
  });
});

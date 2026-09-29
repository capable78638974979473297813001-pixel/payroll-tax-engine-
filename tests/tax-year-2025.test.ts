import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { calculatePaycheck } from '../src/calculate.ts';
import { UnsupportedTaxYearError, statesWithRuleset } from '../src/registry.ts';
import { validatePaycheckInput } from '../site/lib/validate.ts';
import type { PaycheckInput } from '../src/types.ts';

/**
 * Tax year 2025: federal rules from Pub 15-T (2025) and the nine states
 * with no wage income tax. A 2025 check for any other state is refused,
 * never computed federal-only.
 */

const pay = (checkDate: string, state: string, residence?: string): PaycheckInput => ({
  checkDate,
  payFrequency: 'biweekly',
  earnings: [{ code: 'REG', category: 'regular', amount: 300000 }], // $3,000
  deductions: [],
  federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
  ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
  workState: { code: state } as PaycheckInput['workState'],
  ...(residence ? { residenceState: { code: residence } as PaycheckInput['residenceState'] } : {}),
});
const amount = (r: ReturnType<typeof calculatePaycheck>, id: string) => r.taxes.find((t) => t.id === id)?.amount;

describe('tax year 2025', () => {
  test('covers federal and exactly the nine no-wage-tax states', () => {
    assert.deepEqual(statesWithRuleset('2025-06-13').sort(), ['AK', 'FL', 'NH', 'NV', 'SD', 'TN', 'TX', 'WA', 'WY']);
  });

  test('federal income tax uses the 2025 tables ($3,000 biweekly single: $337.46)', () => {
    // 78,000 - 8,600 = 69,400; 5,578.50 + 22% x (69,400 - 54,875) = 8,774 / 26
    assert.equal(amount(calculatePaycheck(pay('2025-06-13', 'TX')), 'US_FIT'), 33746);
    // same cheque in 2026 uses the 2026 tables
    assert.equal(amount(calculatePaycheck(pay('2026-06-12', 'TX')), 'US_FIT'), 32038);
  });

  test('social security stops at the 2025 base of $176,100', () => {
    const r = calculatePaycheck({ ...pay('2025-12-19', 'FL'), ytd: { socialSecurity: 17500000, medicare: 17500000, futa: 700000 } });
    assert.equal(r.taxes.find((t) => t.id === 'US_SS_EE')?.taxableWages, 110000);
  });

  test('Washington 2025 paid leave: 0.92% x 71.52% employee share', () => {
    assert.equal(amount(calculatePaycheck(pay('2025-06-13', 'WA')), 'WA_PFML_EE'), 1974);
  });

  test('Alaska 2025 employee unemployment 0.5%, employer 1.5% on $51,700', () => {
    const r = calculatePaycheck(pay('2025-06-13', 'AK'));
    assert.equal(amount(r, 'AK_UC_EE'), 1500);
    assert.equal(amount(r, 'AK_SUI_ER'), 4500);
  });

  test('a 2025 check in a state without 2025 rules is refused, not computed federal-only', () => {
    assert.throws(() => calculatePaycheck(pay('2025-06-13', 'OH')), (e: unknown) => e instanceof UnsupportedTaxYearError && /OH/.test(e.message));
  });

  test('a 2025 check where only the residence state lacks 2025 rules is refused too', () => {
    assert.throws(() => calculatePaycheck(pay('2025-06-13', 'WA', 'OR')), UnsupportedTaxYearError);
  });

  test('the API validator names the state and year', () => {
    const out = validatePaycheckInput(
      { checkDate: '2025-06-13', payFrequency: 'biweekly', earnings: [{ code: 'REG', category: 'regular', amount: 300000 }], workState: { code: 'OH' } },
      { supportedYears: [2025, 2026], stateHasYear: (code, year) => year === 2026 || ['TX', 'WA'].includes(code) },
    );
    assert.equal(out.ok, false);
    assert.ok(!out.ok && out.errors.some((e) => e.path === 'workState.code' && /2025/.test(e.message)));
  });
});

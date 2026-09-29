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
  test('covers federal and the states with a 2025 file', () => {
    const covered = statesWithRuleset('2025-06-13');
    for (const st of ['AK', 'FL', 'NH', 'NV', 'SD', 'TN', 'TX', 'WA', 'WY', 'AZ', 'CO', 'GA', 'IA', 'ID', 'IL', 'IN', 'KY', 'LA', 'MA', 'MI', 'MS', 'NC', 'UT']) assert.ok(covered.includes(st), st);
  });

  test("Illinois 2025: IL-700-T's own example ($800 weekly, 2 + 2 allowances) withholds $32.27", () => {
    const r = calculatePaycheck({ ...pay('2025-06-13', 'IL'), payFrequency: 'weekly', earnings: [{ code: 'REG', category: 'regular', amount: 80000 }],
      workState: { code: 'IL', certificate: { basicAllowances: 2, additionalAllowances: 2 } } as PaycheckInput['workState'] });
    assert.equal(amount(r, 'IL_SIT'), 3227);
  });

  test('Georgia 2025 switches from 5.39% to 5.19% for checks from 1 July 2025', () => {
    const ga = (checkDate: string) => amount(calculatePaycheck({ ...pay(checkDate, 'GA'), payFrequency: 'semimonthly', earnings: [{ code: 'REG', category: 'regular', amount: 147083 }],
      workState: { code: 'GA', certificate: { filingStatus: 'C', dependents: 1 } } as PaycheckInput['workState'] }), 'GA_SIT');
    assert.equal(ga('2025-06-13'), 4334);
    assert.equal(ga('2025-08-15'), 4174);
  });

  const st = (checkDate: string, code: string, certificate: Record<string, unknown> = {}, payFrequency: PaycheckInput['payFrequency'] = 'biweekly', gross = 300000) =>
    calculatePaycheck({ ...pay(checkDate, code), payFrequency, earnings: [{ code: 'REG', category: 'regular', amount: gross }], workState: { code, certificate } as PaycheckInput['workState'] });

  test('Kentucky 2025: 4% after the $3,270 standard deduction ((78,000 - 3,270) x 4% / 26 = $114.97)', () => {
    assert.equal(amount(st('2025-06-13', 'KY'), 'KY_SIT'), 11497);
  });

  test("Iowa 2025: the formula's own Example 1 ($2,100 biweekly, Other, $40 allowance) withholds $60.72", () => {
    assert.equal(amount(st('2025-06-13', 'IA', { iaMaritalStatus: 'other', totalAllowanceAmount: 4000 }, 'biweekly', 210000), 'IA_SIT'), 6072);
  });

  test("Louisiana 2025: R-1306's own Example 1 ($700 weekly, Block A '1') withholds $14.20", () => {
    assert.equal(amount(st('2025-06-13', 'LA', { louisianaBlockA: 1 }, 'weekly', 70000), 'LA_SIT'), 1420);
  });

  test("Idaho 2025: its own example ($1,212 biweekly, 4 allowances) is $5 on the old table and $2 from 1 May", () => {
    assert.equal(amount(st('2025-03-14', 'ID', { allowances: 4 }, 'biweekly', 121200), 'ID_SIT'), 500);
    assert.equal(amount(st('2025-06-13', 'ID', { allowances: 4 }, 'biweekly', 121200), 'ID_SIT'), 200);
  });

  test('Utah 2025: 4.55% table before 1 June, 4.5% from then ($1,000 weekly single: $46, then $45)', () => {
    assert.equal(amount(st('2025-03-14', 'UT', {}, 'weekly', 100000), 'UT_SIT'), 4600);
    assert.equal(amount(st('2025-06-13', 'UT', {}, 'weekly', 100000), 'UT_SIT'), 4500);
  });

  test("Indiana 2025: Departmental Notice #1's own example ($800 weekly) withholds $14.19 state at 3%", () => {
    const r = st('2025-06-13', 'IN', { personalExemptions: 5, dependentExemptions: 3, firstTimeDependentExemptions: 1, adoptedChildExemptions: 2, county: 'Adams' }, 'weekly', 80000);
    assert.equal(amount(r, 'IN_SIT'), 1419);
    assert.equal(amount(r, 'IN_COUNTY'), 757); // Adams 1.6% x 473.08
  });

  test('North Carolina 2025 withholds at 4.35% ((3,000 - 12,750/26) x 4.35% = $109.17 -> $109)', () => {
    assert.equal(amount(st('2025-06-13', 'NC'), 'NC_SIT'), 10900);
  });

  test('Colorado 2025: $5,000 allowance at 4.4%, FAMLI 0.45% from the employee', () => {
    const r = st('2025-06-13', 'CO');
    assert.equal(amount(r, 'CO_SIT'), 12354); // (78,000 - 5,000) x 4.4% / 26
    assert.equal(amount(r, 'CO_PFML_EE'), 1350);
  });

  test('Mississippi 2025 taxes above $10,000 at 4.4%, 2026 at 4.0%', () => {
    assert.ok(amount(st('2025-06-13', 'MS'), 'MS_SIT')! > amount(st('2026-06-12', 'MS'), 'MS_SIT')!);
  });

  test('Michigan 2025: 4.25% after $5,800 per exemption', () => {
    // 3,000 - 5,800/26 = 2,776.92 x 4.25%
    const r = calculatePaycheck({ ...pay('2025-06-13', 'MI'), workState: { code: 'MI', certificate: { allowances: 1 } } as PaycheckInput['workState'] });
    assert.equal(amount(r, 'MI_SIT'), 11802);
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

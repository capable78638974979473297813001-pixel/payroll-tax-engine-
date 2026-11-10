import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { calculatePaycheck } from '../src/calculate.ts';
import type { PaycheckInput } from '../src/types.ts';

/**
 * Eugene's Community Safety Payroll Tax, employee side: 0.44% of wages for an
 * employee paid more than the Oregon standard minimum wage x 2,080 hours
 * ($31,304 from 2025-07-01, $32,344 from 2026-07-01), compared per pay period
 * on wages less overtime. The employer's physical location must be in the city
 * (certificate.locality 'Eugene').
 */
const or = (checkDate: string, cents: number, over: Partial<PaycheckInput> = {}, certificate: Record<string, unknown> = { locality: 'Eugene' }): PaycheckInput => ({
  checkDate,
  payFrequency: 'weekly',
  earnings: [{ code: 'REG', category: 'regular', amount: cents }],
  deductions: [],
  federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
  ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
  workState: { code: 'OR', certificate } as PaycheckInput['workState'],
  ...over,
});
const eug = (r: ReturnType<typeof calculatePaycheck>) => r.taxes.find((t) => t.id === 'OR_EUGENE_CSPT');

describe('Eugene Community Safety Payroll Tax (employee)', () => {
  test('0.44% on a $1,000 week; $32,344 / 52 = $622 a week is the line', () => {
    assert.equal(eug(calculatePaycheck(or('2026-11-09', 100000)))?.amount, 440);
    assert.equal(eug(calculatePaycheck(or('2026-11-09', 62200)))?.amount, 0);
    assert.equal(eug(calculatePaycheck(or('2026-11-09', 62300)))?.amount, 274);
  });
  test("the chart's whole-dollar pay-period cutoffs decide the boundary: 0% at the cutoff, tax one cent above", () => {
    // 2026-27 chart: monthly $2,695, twice-monthly $1,348, biweekly $1,244, weekly $622, daily $124. (The chart's twice-annual
    // $16,172 is in the data but cannot be exercised here: Oregon's own withholding formula has no semiannual multiplier.)
    const cutoffs: [PaycheckInput['payFrequency'], number][] = [
      ['monthly', 2695],
      ['semimonthly', 1348],
      ['biweekly', 1244],
      ['weekly', 622],
      ['daily', 124],
    ];
    for (const [payFrequency, dollarsCutoff] of cutoffs) {
      const at = eug(calculatePaycheck(or('2026-11-09', dollarsCutoff * 100, { payFrequency })));
      const above = eug(calculatePaycheck(or('2026-11-09', dollarsCutoff * 100 + 1, { payFrequency })));
      assert.equal(at?.amount, 0, payFrequency + ' at the cutoff');
      assert.ok((above?.amount ?? 0) > 0, payFrequency + ' one cent above the cutoff');
    }
  });
  test('twice-monthly pay of $1,347.80 is below the chart cutoff of $1,348 (annualising would have taxed it)', () => {
    assert.equal(eug(calculatePaycheck(or('2026-11-09', 134780, { payFrequency: 'semimonthly' })))?.amount, 0);
  });
  test('the threshold resets on July 1: $31,304 / 52 = $602 a week before, $622 after', () => {
    assert.equal(eug(calculatePaycheck(or('2026-06-30', 61000)))?.amount, 268);
    assert.equal(eug(calculatePaycheck(or('2026-07-01', 61000)))?.amount, 0);
  });
  test('overtime is left out of the comparison but the tax is taken on all wages', () => {
    const r = calculatePaycheck(or('2026-11-09', 0, { earnings: [{ code: 'REG', category: 'regular', amount: 60000 }, { code: 'OT', category: 'regular', amount: 30000, overtime: true }] }));
    assert.equal(eug(r)?.amount, 0);
    const r2 = calculatePaycheck(or('2026-11-09', 0, { earnings: [{ code: 'REG', category: 'regular', amount: 70000 }, { code: 'OT', category: 'regular', amount: 30000, overtime: true }] }));
    assert.equal(eug(r2)?.amount, 440);
  });
  test('only when the employer is in Eugene, always as an employee line with a secondary-source notice, ', () => {
    assert.equal(eug(calculatePaycheck(or('2026-11-09', 100000, {}, {}))), undefined);
    const r = calculatePaycheck(or('2026-11-09', 100000));
    assert.equal(eug(r)?.payer, 'employee');
    assert.ok(r.notices?.some((n) => n.taxId === 'OR_EUGENE_CSPT' && n.tier === 'secondary_source'));
  });
});

describe('Eugene employer side and Springfield, Oregon', () => {
  test('Eugene employer payroll tax is 0.21% of wages and never reduces net pay', () => {
    const r = calculatePaycheck(or('2026-11-09', 100000));
    const er = r.taxes.find((t) => t.id === 'OR_EUGENE_CSPT_ER');
    assert.equal(er?.amount, 210);
    assert.equal(er?.payer, 'employer');
    assert.equal(r.netPay, calculatePaycheck(or('2026-11-09', 100000, {}, {})).netPay - 440);
  });
  test('Springfield: nothing before 2027, then 0.1% employee and 0.1% employer on the locality', () => {
    const sp = (d: string) => calculatePaycheck(or(d, 100000, {}, { locality: 'Springfield' }));
    assert.equal(sp('2026-12-31').taxes.some((t) => t.id.startsWith('OR_SPRINGFIELD')), false);
    const r = sp('2027-01-15');
    assert.equal(r.taxes.find((t) => t.id === 'OR_SPRINGFIELD_PT')?.amount, 100);
    assert.equal(r.taxes.find((t) => t.id === 'OR_SPRINGFIELD_PT')?.payer, 'employee');
    assert.equal(r.taxes.find((t) => t.id === 'OR_SPRINGFIELD_PT_ER')?.amount, 100);
    assert.equal(calculatePaycheck(or('2027-01-15', 100000, {}, {})).taxes.some((t) => t.id.startsWith('OR_SPRINGFIELD')), false);
  });
});

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { calculatePaycheck } from '../src/calculate.ts';
import type { PaycheckInput } from '../src/types.ts';

/**
 * Two local jurisdictions the daily source watch (2026-10-25) found missing:
 * Whitesville KY (new 1.15% occupational tax from the first full pay period of
 * 2026-10-01, per the city's signed Ordinance 25.07) and Chester WV ($2/week user fee on non-resident workers
 * employed 30+ days a year, per WVU Shared Services' ordinance list).
 */

const base = (checkDate: string, payFrequency: PaycheckInput['payFrequency'], amount: number, workState: PaycheckInput['workState']): PaycheckInput => ({
  checkDate,
  payFrequency,
  earnings: [{ code: 'REG', category: 'regular', amount }],
  deductions: [],
  federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
  ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
  workState,
});

describe('Whitesville, Kentucky (Daviess County)', () => {
  const ky = (checkDate: string, certificate: Record<string, unknown> = {}, amount = 300_000) =>
    calculatePaycheck(base(checkDate, 'monthly', amount, { code: 'KY', certificate: { workCity: 'Whitesville', ...certificate } } as PaycheckInput['workState']));
  const local = (r: ReturnType<typeof calculatePaycheck>) => r.taxes.find((t) => t.id === 'KY_LOCAL');

  // Ordinance No. 25.07, adopted 2026-07-07: 1.15% of pay for work done in the city, effective commencing
  // upon the first full pay period of October 1, 2026 (Section 14).
  test('no city occupational tax before the ordinance starts on 2026-10-01', () => {
    assert.equal(local(ky('2026-09-30'))?.amount ?? 0, 0);
  });

  test('1.15% from 2026-10-01 ($34.50 on $3,000), and still in 2027', () => {
    assert.equal(local(ky('2026-10-01'))?.amount, 3_450);
    assert.equal(local(ky('2026-11-10'))?.amount, 3_450);
    assert.equal(local(ky('2027-01-15'))?.amount, 3_450);
  });

  test('pay for work done partly outside the city is taxed only on the in-city share (Section 3)', () => {
    // 60% of $3,000 = $1,800 x 1.15% = $20.70
    assert.equal(local(ky('2026-11-10', { workCityWageShare: 0.6 }))?.amount, 2_070);
    assert.match(local(ky('2026-11-10', { workCityWageShare: 0.6 }))!.detail, /60\.0% of the pay is for work done inside Whitesville/);
    assert.equal(local(ky('2026-11-10', { workCityWageShare: 0 }))?.amount, 0);
    // an out-of-range share is ignored, not trusted
    assert.equal(local(ky('2026-11-10', { workCityWageShare: 1.5 }))?.amount, 3_450);
  });

  test('pretax deferrals are added back: the 1.15% is on gross pay', () => {
    const r = calculatePaycheck({
      ...base('2026-11-10', 'monthly', 300_000, { code: 'KY', certificate: { workCity: 'Whitesville' } } as PaycheckInput['workState']),
      deductions: [{ code: '401K', category: 'pretax_401k', amount: 30_000 }],
    } as PaycheckInput);
    assert.equal(local(r)?.amount, 3_450);
  });
});

describe('Chester, West Virginia user fee', () => {
  const wv = (certificate: Record<string, unknown>, year = '2026-10-16') =>
    calculatePaycheck(base(year, 'weekly', 80_000, { code: 'WV', certificate } as PaycheckInput['workState']));
  const fee = (r: ReturnType<typeof calculatePaycheck>) => r.taxes.find((t) => t.id === 'WV_LOCAL_FEE')?.amount;

  test('a non-resident working there is charged $2.00 a week', () => {
    assert.equal(fee(wv({ locality: 'Chester' })), 200);
    assert.equal(fee(wv({ locality: 'Chester', residenceCity: 'Weirton' })), 200);
  });

  test('a Chester resident is not charged', () => {
    assert.equal(fee(wv({ locality: 'Chester', residenceCity: 'Chester' })), undefined);
  });

  test('the fee attaches only after 30 days worked in the year', () => {
    assert.equal(fee(wv({ locality: 'Chester', daysWorkedInLocality: 29 })), undefined);
    assert.equal(fee(wv({ locality: 'Chester', daysWorkedInLocality: 30 })), 200);
  });

  test('2025 and 2027 files carry the same fee', () => {
    assert.equal(fee(wv({ locality: 'Chester' }, '2025-10-16')), 200);
    assert.equal(fee(wv({ locality: 'Chester' }, '2027-02-16')), 200);
  });
});

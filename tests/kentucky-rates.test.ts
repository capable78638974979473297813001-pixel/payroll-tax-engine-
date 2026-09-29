import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { calculatePaycheck } from '../src/calculate.ts';
import type { PaycheckInput } from '../src/types.ts';

/**
 * The 2026-09-28 pass on data/local/KY-occupational-2026.json: rates
 * corrected from the jurisdiction's own source or KACo's January 2026
 * county table, and mid-year changes that now depend on the check date.
 * $2,000 biweekly, so 1% = 2000 cents.
 */

const ky = (checkDate: string, certificate: Record<string, unknown>): PaycheckInput => ({
  checkDate,
  payFrequency: 'biweekly',
  earnings: [{ code: 'REG', category: 'regular', amount: 200000 }],
  deductions: [],
  federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
  ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
  workState: { code: 'KY', certificate } as PaycheckInput['workState'],
});

const local = (r: ReturnType<typeof calculatePaycheck>) => r.taxes.find((t) => t.id === 'KY_LOCAL');

describe('Kentucky corrections', () => {
  for (const [where, cents] of [
    [{ workCity: 'Winchester' }, 4300], // 2.15% since 2024-10-01, not 2%
    [{ workCity: 'Middlesboro' }, 4900], // 2.45% since 2024-04-01, not 2%
    [{ workCity: 'Marion' }, 3000], // 1.5% since 2025-07-01, not 0.75%
    [{ workCounty: 'Simpson County' }, 2500], // 1.25% since 2026-01-01, not 1%
    [{ workCounty: 'Powell County' }, 3500], // 1.75% since 2025-07-01, not 1.25%
    [{ workCounty: 'Crittenden County' }, 3000], // 1.5% since 2025-07-01, not 0.5%
  ] as const) {
    test(`${Object.values(where)[0]}: ${cents} cents`, () => {
      assert.equal(local(calculatePaycheck(ky('2026-06-15', where)))?.amount, cents);
    });
  }

  test('a rate read from the city itself carries no notice (Paducah 2%)', () => {
    const r = calculatePaycheck(ky('2026-06-15', { workCity: 'Paducah' }));
    assert.equal(local(r)?.amount, 4000);
    assert.equal(r.notices, undefined);
  });

  test('a rate still unconfirmed keeps its notice (Vanceburg, inferred)', () => {
    const r = calculatePaycheck(ky('2026-06-15', { workCity: 'Vanceburg' }));
    assert.equal(r.notices?.[0].tier, 'inferred');
  });
});

describe('Kentucky rates that change on 2026-07-01', () => {
  test('Grant County: 2.5% through June, 2.0% from July', () => {
    assert.equal(local(calculatePaycheck(ky('2026-06-30', { workCounty: 'Grant County' })))?.amount, 5000);
    assert.equal(local(calculatePaycheck(ky('2026-07-01', { workCounty: 'Grant County' })))?.amount, 4000);
  });

  test('Elsmere: 1.25% through June, 1.75% from July', () => {
    assert.equal(local(calculatePaycheck(ky('2026-06-15', { workCity: 'Elsmere' })))?.amount, 2500);
    assert.equal(local(calculatePaycheck(ky('2026-08-15', { workCity: 'Elsmere' })))?.amount, 3500);
  });

  test('Falmouth: no wage tax before July, 1.5% from July', () => {
    assert.equal(local(calculatePaycheck(ky('2026-06-15', { workCity: 'Falmouth' }))), undefined);
    assert.equal(local(calculatePaycheck(ky('2026-07-15', { workCity: 'Falmouth' })))?.amount, 3000);
  });
});

describe('Kentucky cities the SOS scrape lacked', () => {
  test('Williamstown 1%, with a notice (news and payroll-vendor sources)', () => {
    const r = calculatePaycheck(ky('2026-06-15', { workCity: 'Williamstown' }));
    assert.equal(local(r)?.amount, 2000);
    assert.equal(r.notices?.[0].tier, 'secondary_source');
  });
});

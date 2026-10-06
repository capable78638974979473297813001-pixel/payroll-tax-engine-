import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { calculatePaycheck } from '../src/calculate.ts';
import type { PaycheckInput } from '../src/types.ts';

/**
 * The 2026-10-06 verification pass on state employer-side numbers: AR
 * new-employer rate, WV SB 1053 (from 2026-07-01), MA's COVID-19 Recovery
 * Assessment, plus the MN backup-withholding and SD range data. Wages are a
 * $1,000 weekly check, so 1% = 1000 cents.
 */

const pay = (state: string, checkDate: string, employer?: PaycheckInput['employer'], ytdSui = 0): PaycheckInput => ({
  checkDate,
  payFrequency: 'weekly',
  earnings: [{ code: 'REG', category: 'regular', amount: 100000 }],
  deductions: [],
  federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
  ytd: { socialSecurity: 0, medicare: 0, futa: 0, ...(ytdSui ? { stateUnemployment: { [state]: ytdSui } } : {}) },
  workState: { code: state },
  ...(employer ? { employer } : {}),
});
const line = (r: ReturnType<typeof calculatePaycheck>, id: string) => r.taxes.find((t) => t.id === id);
const json = (f: string) => JSON.parse(readFileSync(new URL(`../data/states/${f}`, import.meta.url), 'utf8'));

describe('Arkansas new-employer rate', () => {
  test('2.0% all-in for 2026 (stabilization rate included), not 2.2%', () => {
    assert.equal(line(calculatePaycheck(pay('AR', '2026-06-15')), 'AR_SUI_ER')?.amount, 2000);
  });
});

describe('West Virginia SB 1053 (2026-07-01)', () => {
  test('before the effective date: 2.7%, no fee notice', () => {
    const r = calculatePaycheck(pay('WV', '2026-06-26'));
    assert.equal(line(r, 'WV_SUI_ER')?.amount, 2700);
    assert.equal(r.notices, undefined);
  });

  test('from 2026-07-01 the new-employer rate is 2.7% x 0.93 = 2.511%', () => {
    assert.equal(line(calculatePaycheck(pay('WV', '2026-07-01')), 'WV_SUI_ER')?.amount, 2511);
    assert.equal(line(calculatePaycheck(pay('WV', '2026-10-05')), 'WV_SUI_ER')?.amount, 2511);
  });

  test('the annual automation fee is disclosed on the line, not guessed into an amount', () => {
    const r = calculatePaycheck(pay('WV', '2026-07-15'));
    assert.equal(r.notices?.[0].tier, 'not_modelled');
    assert.match(r.notices![0].note, /automation and administration fee/);
    assert.match(r.notices![0].note, /billed to the employer once a year/);
  });

  test("an employer's own supplied rate is used as given", () => {
    assert.equal(line(calculatePaycheck(pay('WV', '2026-07-15', { stateUnemploymentRate: { WV: 0.02 } })), 'WV_SUI_ER')?.amount, 2000);
  });
});

describe('Massachusetts unemployment and COVID-19 Recovery Assessment', () => {
  test('a new employer pays 2.42% and no assessment, with no notice', () => {
    const r = calculatePaycheck(pay('MA', '2026-06-15'));
    assert.equal(line(r, 'MA_SUI_ER')?.amount, 2420);
    assert.equal(line(r, 'MA_SUI_ASSESSMENT_ER'), undefined);
    assert.equal(r.notices, undefined);
  });

  test('a new construction employer pays 6.08%', () => {
    const r = calculatePaycheck(pay('MA', '2026-06-15', { suiIndustry: { MA: 'construction' } }));
    assert.equal(line(r, 'MA_SUI_ER')?.amount, 6080);
  });

  test('an experience-rated employer with its assessment rate gets its own line on the same $15,000 base', () => {
    const r = calculatePaycheck(
      pay('MA', '2026-06-15', { stateUnemploymentRate: { MA: 0.03 }, stateUnemploymentAssessmentRate: { MA: 0.01 } }),
    );
    assert.equal(line(r, 'MA_SUI_ER')?.amount, 3000);
    assert.equal(line(r, 'MA_SUI_ASSESSMENT_ER')?.amount, 1000);
    assert.equal(r.notices, undefined);
  });

  test('the assessment stops at the wage base', () => {
    const r = calculatePaycheck(
      pay('MA', '2026-06-15', { stateUnemploymentRate: { MA: 0.03 }, stateUnemploymentAssessmentRate: { MA: 0.01 } }, 14_500_00),
    );
    assert.equal(line(r, 'MA_SUI_ASSESSMENT_ER')?.amount, 500); // only $500 of the $1,000 is under $15,000
  });

  test('an experience rate with no assessment rate is flagged, not silently short', () => {
    const r = calculatePaycheck(pay('MA', '2026-06-15', { stateUnemploymentRate: { MA: 0.03 } }));
    assert.equal(line(r, 'MA_SUI_ASSESSMENT_ER'), undefined);
    assert.equal(r.notices?.[0].tier, 'not_modelled');
    assert.match(r.notices![0].note, /COVID-19 Recovery Assessment/);
  });

  test('an assessment rate outside the published 0.178%-2.716% range is flagged', () => {
    const r = calculatePaycheck(
      pay('MA', '2026-06-15', { stateUnemploymentRate: { MA: 0.03 }, stateUnemploymentAssessmentRate: { MA: 0.05 } }),
    );
    assert.equal(line(r, 'MA_SUI_ASSESSMENT_ER')?.amount, 5000);
    assert.equal(r.notices?.[0].tier, 'conflicting_sources');
  });
});

describe('data corrections that no engine path reads yet', () => {
  test("Minnesota backup withholding is the state's own 9.85% in both years", () => {
    assert.equal(json('MN-2026.json').otherMinnesotaWithholdingTypes.backupWithholding.rate, 0.0985);
    assert.equal(json('MN-2025.json').otherMinnesotaWithholdingTypes.backupWithholding.rate, 0.0985);
  });

  test('South Dakota 2026 experience maximum: 9.39% schedule top + 0.08% fee = 9.47%', () => {
    assert.equal(json('SD-2026.json').suiEmployer.experienceRange.max, 0.0947);
  });
});

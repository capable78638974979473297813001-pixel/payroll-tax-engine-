import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { calculatePaycheck } from '../src/calculate.ts';
import type { PaycheckInput } from '../src/types.ts';

/** Resident vs nonresident: what residenceState alone must decide. $3,000 biweekly checks. */
const pay = (
  state: string,
  certificate: Record<string, unknown>,
  residence?: string,
  w4: Partial<PaycheckInput['federalW4']> = {},
): PaycheckInput => ({
  checkDate: '2026-09-26',
  payFrequency: 'biweekly',
  earnings: [{ code: 'REG', category: 'regular', amount: 300000 }],
  deductions: [],
  federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0, ...w4 },
  ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
  workState: { code: state, certificate } as PaycheckInput['workState'],
  ...(residence ? { residenceState: { code: residence } } : {}),
});
const line = (r: ReturnType<typeof calculatePaycheck>, id: string) => r.taxes.find((t) => t.id === id);

describe('DC taxes only DC residents', () => {
  test('a Virginia resident owes no DC income tax without any certificate flag', () => {
    assert.equal(line(calculatePaycheck(pay('DC', { allowances: 1 }, 'VA')), 'DC_SIT')?.amount, 0);
  });
  test('a DC resident is taxed', () => {
    assert.ok(line(calculatePaycheck(pay('DC', { allowances: 1 }, 'DC')), 'DC_SIT')!.amount > 0);
  });
});

describe('Maryland nonresidents pay the special nonresident rate', () => {
  test('a New Jersey resident working in Montgomery County gets 2.25%, not the county rate', () => {
    const viaResidence = line(calculatePaycheck(pay('MD', { county: 'Montgomery' }, 'NJ')), 'MD_SIT')!;
    const viaFlag = line(calculatePaycheck(pay('MD', { county: 'Montgomery', nonresident: true })), 'MD_SIT');
    const resident = line(calculatePaycheck(pay('MD', { county: 'Montgomery' }, 'MD')), 'MD_SIT')!;
    assert.equal(viaResidence.amount, viaFlag?.amount);
    assert.ok(viaResidence.amount < resident.amount);
    assert.match(viaResidence.detail!, /Special 2\.25% rate/);
  });
});

describe('federal withholding for a nonresident alien', () => {
  const fit = (w4: Partial<PaycheckInput['federalW4']>) => line(calculatePaycheck(pay('TX', {}, undefined, w4)), 'US_FIT')!;
  test('married_joint and head_of_household run on the Single schedule', () => {
    const single = fit({ nonresidentAlien: true });
    assert.equal(fit({ nonresidentAlien: true, filingStatus: 'married_joint' }).amount, single.amount);
    assert.equal(fit({ nonresidentAlien: true, filingStatus: 'head_of_household' }).amount, single.amount);
    assert.match(fit({ nonresidentAlien: true, filingStatus: 'married_joint' }).detail!, /treated as single/);
  });
  test('a resident married_joint filer is unaffected', () => {
    assert.ok(fit({ filingStatus: 'married_joint' }).amount < fit({}).amount);
  });
});

describe('residence-only local taxes skip a nonresident of the work state', () => {
  test('Ohio school district tax is not withheld from a Kentucky resident', () => {
    const cert = { schoolDistrictCode: '0203', workCity: 'Cincinnati' };
    const nonres = calculatePaycheck(pay('OH', cert, 'KY'));
    assert.equal(line(nonres, 'OH_SDIT'), undefined);
    assert.ok(nonres.warnings?.some((w) => /schoolDistrictCode/.test(w)));
    assert.ok(line(calculatePaycheck(pay('OH', cert, 'OH')), 'OH_SDIT')!.amount > 0);
  });
  test('a resident city rate is not charged to an Indiana resident working in Ohio', () => {
    const r = calculatePaycheck(pay('OH', { workCity: 'Cincinnati', residenceCity: 'Columbus' }, 'IN'));
    assert.match(line(r, 'OH_LOCAL')!.detail!, /Cincinnati/);
    assert.doesNotMatch(line(r, 'OH_LOCAL')!.detail!, /Columbus/);
  });
});

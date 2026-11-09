import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { calculatePaycheck } from '../src/calculate.ts';
import type { PaycheckInput } from '../src/types.ts';

/**
 * Jersey City Ordinance 18-133 (effective 2019-01-01): an EMPLOYER-paid 1% of
 * payroll for non-Jersey-City-resident employees. Never withheld from the
 * employee (section 304-21), so net pay does not move.
 */
const nj = (certificate: Record<string, unknown>, cents = 100000, checkDate = '2026-11-09'): PaycheckInput => ({
  checkDate,
  payFrequency: 'weekly',
  earnings: [{ code: 'REG', category: 'regular', amount: cents }],
  deductions: [],
  federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
  ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
  workState: { code: 'NJ', certificate } as PaycheckInput['workState'],
});
const jc = (r: ReturnType<typeof calculatePaycheck>) => r.taxes.find((t) => t.id === 'JERSEYCITY_PAYROLL_ER');

describe('Jersey City payroll tax (employer)', () => {
  test('1% of a non-resident employee’s wages, employer only', () => {
    const r = calculatePaycheck(nj({ locality: 'Jersey City' }));
    assert.equal(jc(r)?.amount, 1000);
    assert.equal(jc(r)?.payer, 'employer');
    const without = calculatePaycheck(nj({}));
    assert.equal(r.netPay, without.netPay);
  });
  test('a Jersey City resident’s wages are exempt, and the line says why', () => {
    const r = calculatePaycheck(nj({ locality: 'Jersey City', jerseyCityResident: true }));
    assert.equal(jc(r)?.amount, 0);
    assert.match(jc(r)?.detail ?? '', /lives in Jersey City/);
  });
  test('nothing off the Jersey City locality, and nothing before the 2019 effective date is reachable for 2025-2027 files', () => {
    assert.equal(jc(calculatePaycheck(nj({}))), undefined);
    assert.equal(jc(calculatePaycheck(nj({ locality: 'Newark' }))), undefined);
    assert.equal(jc(calculatePaycheck(nj({ locality: 'Jersey City' }, 100000, '2025-06-15')))?.amount, 1000);
    assert.equal(jc(calculatePaycheck(nj({ locality: 'Jersey City' }, 100000, '2027-03-15')))?.amount, 1000);
  });
  test('Newark and Jersey City do not touch each other', () => {
    const r = calculatePaycheck(nj({ localities: ['Newark', 'Jersey City'] }));
    assert.equal(r.taxes.some((t) => t.id === 'NEWARK_PAYROLL_ER'), true);
    assert.equal(jc(r)?.amount, 1000);
  });
  test('a New Jersey resident already taxed by another state\'s employer payroll tax is exempt from both cities (S.B. 4219, February 2026)', () => {
    const both = { localities: ['Newark', 'Jersey City'], njOutOfStateEmployerPayrollTaxExempt: true };
    const r = calculatePaycheck(nj(both));
    assert.equal(jc(r)?.amount, 0);
    assert.equal(r.taxes.find((t) => t.id === 'NEWARK_PAYROLL_ER')?.amount, 0);
    assert.match(jc(r)?.detail ?? '', /S\.B\. 4219/);
  });
});

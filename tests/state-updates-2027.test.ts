import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { calculatePaycheck } from '../src/calculate.ts';
import type { PaycheckInput } from '../src/types.ts';

/**
 * 2027 figures published by the states' own agencies, read 2026-11-06 (each data file records its source in
 * provisional.updatedFor2027). Hand calculations from the sources' own formulas and worked examples.
 */

const pay = (checkDate: string, state: string, payFrequency: PaycheckInput['payFrequency'], amount: number, certificate: Record<string, unknown> = {}): PaycheckInput => ({
  checkDate,
  payFrequency,
  earnings: [{ code: 'REG', category: 'regular', amount }],
  deductions: [],
  federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
  ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
  workState: { code: state, certificate } as PaycheckInput['workState'],
});
const line = (r: ReturnType<typeof calculatePaycheck>, id: string) => r.taxes.find((t) => t.id === id)?.amount;
const file = (name: string) => JSON.parse(readFileSync(new URL(`../data/states/${name}.json`, import.meta.url), 'utf8'));
const updated = (f: { provisional: { updatedFor2027?: unknown[] } }, re: RegExp) => assert.match(JSON.stringify(f.provisional.updatedFor2027), re);

describe('California 2027 (EDD)', () => {
  test('SDI is 1.4% of all wages with no cap', () => {
    // $3,000 biweekly x 1.4% = 42.00; 2026 stays 1.3% = 39.00
    assert.equal(line(calculatePaycheck(pay('2027-01-15', 'CA', 'biweekly', 300_000)), 'CA_DBL_EE'), 4_200);
    assert.equal(line(calculatePaycheck(pay('2026-12-15', 'CA', 'biweekly', 300_000)), 'CA_DBL_EE'), 3_900);
    updated(file('CA-2027'), /1\.4 percent/);
  });

  test("Method B reproduces the 2027 schedule's own worked examples (the 2026 tables would not)", () => {
    // Example B: biweekly $1,600, married, 2 regular + 1 estimated-deduction allowance -> $1.33
    assert.equal(line(calculatePaycheck(pay('2027-02-05', 'CA', 'biweekly', 160_000, { filingStatus: 'married_one_income', regularAllowances: 2, estimatedDeductionAllowances: 1 })), 'CA_SIT'), 133);
    // Example C: monthly $5,500, married, 5 allowances -> $5.97
    assert.equal(line(calculatePaycheck(pay('2027-02-05', 'CA', 'monthly', 550_000, { filingStatus: 'married_one_income', regularAllowances: 5 })), 'CA_SIT'), 597);
    // Example D: weekly $950, unmarried head of household, 3 allowances -> $1.02
    assert.equal(line(calculatePaycheck(pay('2027-02-05', 'CA', 'weekly', 95_000, { filingStatus: 'hoh', regularAllowances: 3 })), 'CA_SIT'), 102);
  });

  test('annual standard deduction $5,900 / $11,800 and low-income exemption $19,528 / $39,056', () => {
    const b = file('CA-2027').bracketPerPeriodThreeStatus;
    assert.deepEqual([b.standardDeduction.lower.annual, b.standardDeduction.higher.annual], [5_900, 11_800]);
    assert.deepEqual([b.lowIncomeExemption.lower.annual, b.lowIncomeExemption.higher.annual], [19_528, 39_056]);
    assert.equal(['singleOrMarriedTwoIncomes', 'marriedOneIncome', 'hoh'].reduce((n, k) => n + Object.keys(b.brackets[k]).length, 0), 24);
  });
});

describe('New Jersey 2027 (Division of Employer Accounts)', () => {
  test('worker disability and family leave are each 0.24% up to $177,100', () => {
    const r = calculatePaycheck(pay('2027-01-15', 'NJ', 'biweekly', 300_000));
    assert.equal(line(r, 'NJ_DBL_EE'), 720); // 3,000 x 0.24%
    assert.equal(line(r, 'NJ_PFML_EE'), 720);
    assert.equal(line(calculatePaycheck(pay('2026-12-15', 'NJ', 'biweekly', 300_000)), 'NJ_DBL_EE'), 570); // 0.19%
  });
});

describe('Colorado FAMLI 2027 (0.86% total, 0.43% each)', () => {
  test('0.43% employee and 0.43% employer', () => {
    const r = calculatePaycheck(pay('2027-01-15', 'CO', 'biweekly', 300_000, { employerLiableForPaidLeaveShare: true }));
    assert.equal(line(r, 'CO_PFML_EE'), 1_290);
    assert.equal(line(r, 'CO_PFML_ER'), 1_290);
    assert.equal(line(calculatePaycheck(pay('2026-12-15', 'CO', 'biweekly', 300_000)), 'CO_PFML_EE'), 1_320); // 0.44%
  });
});

describe('Maryland FAMLI 2027 (0.9% total, 0.45% each, employers under 15 owe only the employee share)', () => {
  test('employee 0.45% from January 1, 2027; nothing in 2026', () => {
    assert.equal(line(calculatePaycheck(pay('2027-01-15', 'MD', 'biweekly', 300_000)), 'MD_PFML_EE'), 1_350);
    assert.equal(line(calculatePaycheck(pay('2026-12-15', 'MD', 'biweekly', 300_000)), 'MD_PFML_EE'), undefined);
  });
  test('the employer share needs the caller to assert 15 or more employees', () => {
    assert.equal(line(calculatePaycheck(pay('2027-01-15', 'MD', 'biweekly', 300_000)), 'MD_PFML_ER'), undefined);
    assert.equal(line(calculatePaycheck(pay('2027-01-15', 'MD', 'biweekly', 300_000, { employerLiableForPaidLeaveShare: true })), 'MD_PFML_ER'), 1_350);
  });
});

describe('employer unemployment 2027 (employer cost only)', () => {
  test('Missouri taxable wage base falls to $8,500 (2026 stays $9,000)', () => {
    assert.equal(file('MO-2027').suiEmployer.wageBase, 8_500);
    assert.equal(file('MO-2026').suiEmployer.wageBase, 9_000);
    updated(file('MO-2027'), /\$8,500/);
  });
  test('Oklahoma experience range is 0.1% to 5.5% (2026: 0.2% to 5.8%)', () => {
    assert.deepEqual(file('OK-2027').suiEmployer.experienceRange, { min: 0.001, max: 0.055 });
    assert.deepEqual(file('OK-2026').suiEmployer.experienceRange, { min: 0.002, max: 0.058 });
  });
});

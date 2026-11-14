import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { calculatePaycheck } from '../src/calculate.ts';
import { calculateGarnishments } from '../src/garnishment.ts';
import { calculatePaycheckWithGarnishments } from '../src/net-pay-floor.ts';
import { dollars } from '../src/money.ts';
import type { Deduction, PaycheckInput } from '../src/types.ts';

/**
 * Every expected figure below was worked out by hand before the code ran.
 * Michigan flat rate 4.25%, weekly, check date 2026-11-13. Employee FICA is
 * 6.20% + 1.45% of the $100.00 gross = $6.20 + $1.45 = $7.65 whatever the
 * 401(k) does, because a deferral does not reduce FICA wages. Federal income
 * tax is $0 at these wages (annualised under the standard deduction).
 */
function paycheck(gross: number, deductions: Deduction[], allowances?: number): PaycheckInput {
  return {
    checkDate: '2026-11-13',
    payFrequency: 'weekly',
    earnings: [{ code: 'REG', category: 'regular', amount: dollars(gross) }],
    deductions,
    federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
    ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
    workState: { code: 'MI', certificate: { workCity: 'Birmingham', residenceCity: 'Birmingham', ...(allowances === undefined ? {} : { allowances }) } },
  };
}
const k401 = (amount: number): Deduction => ({ code: '401K', category: 'deferral_401k', amount: dollars(amount) });
const support = {
  id: 'MI-CS',
  type: 'child_support' as const,
  amountOrdered: dollars(50),
  supportingOtherFamily: false,
  maxDisposableEarningsFraction: 0.5,
};

describe('an order that says "the lesser of $X or Y% of disposable earnings"', () => {
  test('is limited to the lower of the two', () => {
    // No 401(k): MI wages $100.00, MI tax = round(10000 x 0.0425) = 425 (no exemptions given).
    // Disposable = 10000 - 765 FICA - 425 = 8810. 50% = 4405 < 5000, so 4405.
    const pc = calculatePaycheck(paycheck(100, []));
    const g = calculateGarnishments({ checkDate: '2026-11-13', payFrequency: 'weekly', workState: 'MI', paycheck: pc, orders: [support] });
    assert.equal(g.disposableEarnings, 8810);
    assert.equal(g.totalWithheld, 4405);
  });

  test('is limited to the dollar figure when that is lower', () => {
    const pc = calculatePaycheck(paycheck(100, []));
    const g = calculateGarnishments({
      checkDate: '2026-11-13', payFrequency: 'weekly', workState: 'MI', paycheck: pc,
      orders: [{ ...support, amountOrdered: dollars(20) }],
    });
    assert.equal(g.totalWithheld, 2000);
  });

  test('a fraction outside 0 to 1 is refused rather than read as a percentage', () => {
    const pc = calculatePaycheck(paycheck(100, []));
    assert.throws(
      () => calculateGarnishments({ checkDate: '2026-11-13', payFrequency: 'weekly', workState: 'MI', paycheck: pc, orders: [{ ...support, maxDisposableEarningsFraction: 50 }] }),
      /between 0 and 1/,
    );
  });
});

describe('net pay after garnishments is floored at $0.00 by cutting voluntary deductions', () => {
  test('$100 gross, $100 401(k), Michigan support order: the 401(k) is cut to $45.00 and net is exactly $0.00', () => {
    // d = 401(k). MI wages = 10000 - d. FICA = 765.
    // d = 4500: MI = round(5500 x 0.0425) = round(233.75) = 234. Disposable = 10000 - 765 - 234 = 9001.
    //   Support = min(5000, round-half-up(9001 x 0.5 = 4500.5)) = 4501.
    //   Net = 10000 - 4500 - (765 + 234) - 4501 = 0.
    // d = 4501: MI = round(5499 x 0.0425) = round(233.71) = 234; support 4501; net = -1. So 4500 is the most the 401(k) can be.
    const r = calculatePaycheckWithGarnishments({ paycheck: paycheck(100, [k401(100)]), orders: [support] });
    assert.equal(r.deductions[0].amount, 4500);
    assert.deepEqual(r.reductions, [{ code: '401K', requested: 10000, applied: 4500 }]);
    assert.equal(r.paycheck.employeeTaxTotal, 999);
    assert.equal(r.garnishments.totalWithheld, 4501);
    assert.equal(r.netPayAfterGarnishments, 0);
  });

  test('with one Michigan exemption ($5,900 a year) there is no state tax, so the 401(k) is cut to $46.17', () => {
    // Taxes are FICA only: 765. Disposable = 9235. Support = round-half-up(4617.5) = 4618.
    // 401(k) = 10000 - 765 - 4618 = 4617. Net = 0.
    const r = calculatePaycheckWithGarnishments({ paycheck: paycheck(100, [k401(100)], 1), orders: [support] });
    assert.equal(r.deductions[0].amount, 4617);
    assert.equal(r.paycheck.employeeTaxTotal, 765);
    assert.equal(r.garnishments.totalWithheld, 4618);
    assert.equal(r.netPayAfterGarnishments, 0);
  });

  test('nothing is cut when the check already covers everything', () => {
    // $1,000 gross, $100 401(k): plenty of cash.
    const r = calculatePaycheckWithGarnishments({ paycheck: paycheck(1000, [k401(100)], 1), orders: [support] });
    assert.deepEqual(r.reductions, []);
    assert.equal(r.deductions[0].amount, 10000);
    assert.ok(r.netPayAfterGarnishments > 0);
    assert.deepEqual(r.warnings, []);
  });

  test('post-tax deductions are cut before pre-tax ones, and taxes do not move when they are', () => {
    // 401(k) $20.00 pre-tax, loan $100.00 post-tax, no garnishment.
    // MI wages = 10000 - 2000 = 8000; MI = 8000 x 0.0425 = 340; FICA 765.
    // Net = 10000 - 2000 - 765 - 340 - loan = 0 -> loan = 6895.
    const loan: Deduction = { code: 'LOAN', category: null, amount: dollars(100) };
    const r = calculatePaycheckWithGarnishments({ paycheck: paycheck(100, [k401(20), loan]), orders: [] });
    assert.deepEqual(r.deductions.map((d) => [d.code, d.amount]), [['401K', 2000], ['LOAN', 6895]]);
    assert.equal(r.netPayAfterGarnishments, 0);
  });

  test('reductionOrder overrides the default order', () => {
    // Cut the 401(k) first instead: the loan stays whole at $100 until the 401(k) is gone.
    const loan: Deduction = { code: 'LOAN', category: null, amount: dollars(10) };
    const r = calculatePaycheckWithGarnishments({
      paycheck: paycheck(100, [k401(95), loan], 1), orders: [], reductionOrder: ['401K'],
    });
    // FICA 765, no MI tax (1 exemption). Net = 10000 - 765 - 1000 loan - d = 0 -> d = 8235.
    assert.deepEqual(r.deductions.map((d) => [d.code, d.amount]), [['401K', 8235], ['LOAN', 1000]]);
    assert.equal(r.netPayAfterGarnishments, 0);
  });

  test('a protected deduction is never cut; if it cannot fit the result says so and stays negative', () => {
    const dues: Deduction = { code: 'DUES', category: null, amount: dollars(100) };
    const r = calculatePaycheckWithGarnishments({
      paycheck: paycheck(100, [k401(10), dues], 1), orders: [], protectedDeductionCodes: ['DUES'],
    });
    assert.equal(r.deductions.find((d) => d.code === 'DUES')!.amount, 10000);
    assert.equal(r.deductions.find((d) => d.code === '401K')!.amount, 0);
    assert.ok(r.netPayAfterGarnishments < 0);
    assert.ok(r.warnings.some((w) => /nothing protected was reduced/.test(w)), r.warnings.join(' | '));
  });

  test('calculatePaycheck itself is unchanged: it still returns negative net with a warning', () => {
    const r = calculatePaycheck(paycheck(100, [k401(100)]));
    assert.equal(r.netPay, -765);
    assert.ok(r.warnings!.some((w) => /Net pay is negative/.test(w)));
  });
});

describe('pre-tax deductions are cut in tiers', () => {
  const hsa = (amount: number): Deduction => ({ code: 'HSA', category: 'hsa', amount: dollars(amount) });
  const loan = (amount: number): Deduction => ({ code: 'LOAN', category: null, amount: dollars(amount) });
  const amountOf = (r: ReturnType<typeof calculatePaycheckWithGarnishments>, code: string) => r.deductions.find((d) => d.code === code)!.amount;
  // Texas has no income tax, so only FICA is in play.
  const tx = (deductions: Deduction[]): PaycheckInput => ({ ...paycheck(100, deductions), workState: { code: 'TX' } });

  test('post-tax first: a loan is cut before a 401(k) or an HSA, and the 401(k) and HSA stay whole', () => {
    // $100 gross against HSA $10 + 401(k) $60 + loan $40.
    const r = calculatePaycheckWithGarnishments({ paycheck: tx([hsa(10), k401(60), loan(40)]), orders: [] });
    assert.equal(amountOf(r, 'HSA'), 1000);
    assert.equal(amountOf(r, '401K'), 6000);
    assert.ok(amountOf(r, 'LOAN') > 0 && amountOf(r, 'LOAN') < 4000);
    assert.equal(r.netPayAfterGarnishments, 0);
  });

  test('then retirement deferrals: with the loan gone, the 401(k) is cut and the HSA is still whole', () => {
    const r = calculatePaycheckWithGarnishments({ paycheck: tx([hsa(30), k401(70), loan(10)]), orders: [] });
    assert.equal(amountOf(r, 'LOAN'), 0);
    assert.equal(amountOf(r, 'HSA'), 3000);
    assert.ok(amountOf(r, '401K') < 7000);
    assert.equal(r.netPayAfterGarnishments, 0);
    assert.ok(!r.warnings.some((w) => /cafeteria/.test(w)), r.warnings.join(' | '));
  });

  test('a cafeteria-plan election is cut only as a last resort, and the cut is flagged', () => {
    // $100 gross, protected $50 dues, section 125 premium $60: the premium is the only thing that can give.
    const dues: Deduction = { code: 'DUES', category: null, amount: dollars(50) };
    const prem: Deduction = { code: 'MED', category: 'section125', amount: dollars(60) };
    const r = calculatePaycheckWithGarnishments({ paycheck: tx([prem, dues]), orders: [], protectedDeductionCodes: ['DUES'] });
    assert.equal(amountOf(r, 'DUES'), 5000);
    assert.ok(amountOf(r, 'MED') < 6000);
    assert.equal(r.netPayAfterGarnishments, 0);
    assert.ok(r.warnings.some((w) => /cafeteria-plan election \(section125\)/.test(w)), r.warnings.join(' | '));
  });
});

describe('what each pre-tax deduction saved in tax', () => {
  test('a $20 401(k) on $100 saves the Michigan tax on $20: round(100 x 4.25%) - round(80 x 4.25%) = 425 - 340 = 85 cents', () => {
    // Federal income tax is $0 either way (annualised wages are under the standard deduction)
    // and a 401(k) does not reduce FICA wages, so the whole saving is Michigan's.
    const r = calculatePaycheckWithGarnishments({ paycheck: paycheck(100, [k401(20)]), orders: [] });
    assert.deepEqual(r.taxSavings, [{ code: '401K', category: 'deferral_401k', amount: 2000, taxSaved: 85 }]);
    assert.equal(r.totalPretaxTaxSavings, 85);
  });

  test('post-tax deductions save nothing and are not listed', () => {
    const loan: Deduction = { code: 'LOAN', category: null, amount: dollars(20) };
    const r = calculatePaycheckWithGarnishments({ paycheck: paycheck(100, [loan]), orders: [] });
    assert.deepEqual(r.taxSavings, []);
    assert.equal(r.totalPretaxTaxSavings, 0);
  });

  test('the saving is measured on the deduction actually taken, after any cut', () => {
    // The audio case: 401(k) cut from $100.00 to $45.00. MI wages $55.00 -> round(55 x 4.25%) = 234 against
    // round(100 x 4.25%) = 425, so the saving is 191 cents (not the $100.00 elected).
    const r = calculatePaycheckWithGarnishments({ paycheck: paycheck(100, [k401(100)]), orders: [support] });
    assert.equal(r.taxSavings[0].amount, 4500);
    assert.equal(r.taxSavings[0].taxSaved, 191);
  });
});


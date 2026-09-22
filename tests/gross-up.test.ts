import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { calculatePaycheck } from '../src/calculate.ts';
import { grossUp } from '../src/gross-up.ts';
import type { PaycheckInput } from '../src/types.ts';

const CHECK_DATE = '2026-08-15';

function base(over: Partial<PaycheckInput> = {}): PaycheckInput {
  return {
    checkDate: CHECK_DATE,
    payFrequency: 'biweekly',
    earnings: [{ code: 'REG', category: 'regular', amount: 250_000 }],
    deductions: [],
    federalW4: {
      filingStatus: 'single',
      multipleJobs: false,
      dependentCredit: 0,
      otherIncome: 0,
      deductions: 0,
      extraWithholding: 0,
    },
    ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
    workState: { code: 'TX' },
    ...over,
  };
}

describe('grossUp()', () => {
  test('recovers the earning that produced a known net, Texas federal-only', () => {
    const known = calculatePaycheck(base());
    const solved = grossUp({
      targetNetPay: known.netPay,
      paycheck: { ...base(), earnings: [] },
    });
    assert.equal(solved.variableEarningAmount, 250_000);
    assert.equal(solved.result.netPay, known.netPay);
  });

  test('recovers an Ohio municipal paycheck, city tax included', () => {
    const known = calculatePaycheck(base({
      earnings: [{ code: 'REG', category: 'regular', amount: 300_000 }],
      workState: { code: 'OH', certificate: { workCity: 'Columbus' } },
    }));
    const solved = grossUp({
      targetNetPay: known.netPay,
      paycheck: {
        ...base({ workState: { code: 'OH', certificate: { workCity: 'Columbus' } } }),
        earnings: [],
      },
    });
    assert.equal(solved.variableEarningAmount, 300_000);
    assert.equal(solved.result.netPay, known.netPay);
    assert.ok(solved.result.taxes.some((t) => t.id === 'OH_LOCAL' && t.amount > 0));
  });

  test('holds a fixed pretax deduction and still recovers the regular earning', () => {
    const known = calculatePaycheck(base({
      deductions: [{ code: '401K', category: 'deferral_401k', amount: 20_000 }],
    }));
    const solved = grossUp({
      targetNetPay: known.netPay,
      paycheck: {
        ...base({ deductions: [{ code: '401K', category: 'deferral_401k', amount: 20_000 }] }),
        earnings: [],
      },
    });
    assert.equal(solved.variableEarningAmount, 250_000);
    assert.equal(solved.result.pretaxDeductions, 20_000);
    assert.equal(solved.result.netPay, known.netPay);
  });

  test('rejects a negative target', () => {
    assert.throws(() => grossUp({ targetNetPay: -1, paycheck: base() }), /non-negative integer/);
  });
});

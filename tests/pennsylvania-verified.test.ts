import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { calculatePaycheck } from '../src/calculate.ts';
import { dollars, roundHalfUp } from '../src/money.ts';
import type { Deduction, Earning, PaycheckInput } from '../src/types.ts';

/**
 * Pennsylvania paycheck lines checked against figures derived by hand from
 * official sources, never from this repo's data or code. Sources:
 *
 *  - PA Revenue, Employer Withholding: flat 3.07% of compensation; reciprocity with
 *    IN, MD, NJ, OH, VA, WV (the employee files a nonwithholding certificate).
 *  - 72 P.S. 7301(d)(vi); 61 Pa. Code 101.6; PIT-06-005: Section 125 premiums, HSA and
 *    health FSA contributions made through a cafeteria plan are not compensation.
 *  - Act 34 of 2023 (PA Revenue, Dependent Care Assistance): IRC 129 dependent care
 *    assistance is not compensation.
 *  - REV-415 (SU) 01-23: 401(k)/403(b)/457/SIMPLE deferrals ARE compensation; qualified
 *    transportation is nontaxable only when the employee does not reduce salary for it.
 *  - PA L&I: employee UC contribution 0.07% of gross wages, no cap; newly liable
 *    employer rate 3.822% on a $10,000 wage base (43 P.S. 753(x)).
 *  - DCED Act 32 and LST pages: LST is prorated over the employer's pay periods and
 *    rounded down; the $12,000 low-income exemption applies only when the employee
 *    files an exemption certificate.
 *  - phila.gov Wage Tax rates: from 2026-07-01 resident 3.735%, nonresident 3.425%.
 *  - pittsburghpa.gov: resident EIT 3%, nonresident 1%, LST $52 a year.
 */

function pa(
  gross: number,
  deductions: Deduction[] = [],
  extra: Partial<PaycheckInput> = {},
  certificate: Record<string, unknown> = {},
): PaycheckInput {
  const earnings: Earning[] = [{ code: 'REG', category: 'regular', amount: dollars(gross) }];
  return {
    checkDate: '2026-06-12',
    payFrequency: 'biweekly',
    earnings,
    deductions,
    federalW4: {
      filingStatus: 'single',
      multipleJobs: false,
      dependentCredit: 0,
      otherIncome: 0,
      deductions: 0,
      extraWithholding: 0,
    },
    ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
    workState: { code: 'PA', certificate } as PaycheckInput['workState'],
    ...extra,
  };
}

const line = (input: PaycheckInput, id: string) =>
  calculatePaycheck(input).taxes.find((t) => t.id === id)?.amount ?? 0;

const ded = (category: Deduction['category'], amount: number): Deduction => ({ code: 'D', category, amount: dollars(amount) });

describe('PA state income tax', () => {
  test('3.07% of compensation, rounded once (1234.56 x 3.07% = 37.900992)', () => {
    assert.equal(line(pa(1234.56), 'PA_SIT'), dollars(37.9));
  });

  test('half a cent rounds up (2750 x 3.07% = 84.425)', () => {
    assert.equal(line(pa(3000, [ded('section125', 250)]), 'PA_SIT'), dollars(84.43));
  });

  test('tiny pay (0.99 x 3.07% = 0.030393)', () => {
    assert.equal(line(pa(0.99), 'PA_SIT'), dollars(0.03));
  });

  test('is not annualized: weekly, biweekly and monthly all take 3.07% of the period', () => {
    assert.equal(line(pa(12345.67, [], { payFrequency: 'weekly' }), 'PA_SIT'), dollars(379.01)); // 379.0123...
    assert.equal(line(pa(6250, [], { payFrequency: 'monthly' }), 'PA_SIT'), dollars(191.88)); // 191.875
  });

  test('Section 125, HSA, health FSA and dependent care are not compensation', () => {
    for (const cat of ['section125', 'hsa', 'fsa', 'dependent_care'] as const) {
      assert.equal(line(pa(3000, [ded(cat, 100)]), 'PA_SIT'), dollars(89.03), cat); // 2900 x 3.07%
    }
  });

  test('401(k), 403(b), 457 and SIMPLE deferrals and commuter salary reductions are still compensation', () => {
    for (const cat of ['deferral_401k', 'deferral_403b', 'deferral_457', 'deferral_simple', 'commuter'] as const) {
      assert.equal(line(pa(3000, [ded(cat, 100)]), 'PA_SIT'), dollars(92.1), cat); // 3000 x 3.07%
    }
  });

  test('residents of reciprocal states are not withheld', () => {
    for (const st of ['IN', 'MD', 'NJ', 'OH', 'VA', 'WV']) {
      assert.equal(line(pa(3000, [], { residenceState: { code: st } }), 'PA_SIT'), 0, st);
    }
    assert.equal(line(pa(3000, [], { residenceState: { code: 'NY' } }), 'PA_SIT'), dollars(92.1));
  });
});

describe('PA unemployment contributions', () => {
  test('employee 0.07% is uncapped', () => {
    assert.equal(line(pa(3000), 'PA_UC_EE'), dollars(2.1));
    assert.equal(line(pa(250000), 'PA_UC_EE'), dollars(175));
  });

  test('employer 3.822% stops at the $10,000 wage base', () => {
    assert.equal(line(pa(3000), 'PA_SUI_ER'), dollars(114.66));
    const nearCap = pa(3000, [], { ytd: { socialSecurity: 0, medicare: 0, futa: 0, stateUnemployment: { PA: dollars(9500) } } });
    assert.equal(line(nearCap, 'PA_SUI_ER'), dollars(19.11)); // 500 x 3.822%
    const atCap = pa(3000, [], { ytd: { socialSecurity: 0, medicare: 0, futa: 0, stateUnemployment: { PA: dollars(10000) } } });
    assert.equal(line(atCap, 'PA_SUI_ER'), 0);
  });
});

describe('PA local taxes', () => {
  test('Philadelphia rates change on 2026-07-01', () => {
    const res = (checkDate: string) =>
      pa(3000, [], { checkDate, residenceState: { code: 'PA' } }, { workPSD: '510101', residencePSD: '510101' });
    assert.equal(line(res('2026-06-12'), 'PA_EIT'), dollars(112.2)); // 3.74%
    assert.equal(line(res('2026-07-10'), 'PA_EIT'), dollars(112.05)); // 3.735%
    const non = (checkDate: string) => pa(3000, [], { checkDate, residenceState: { code: 'NJ' } }, { workPSD: '510101' });
    assert.equal(line(non('2026-06-12'), 'PA_EIT'), dollars(102.9)); // 3.43%
    assert.equal(line(non('2026-07-10'), 'PA_EIT'), dollars(102.75)); // 3.425%
  });

  test('Pittsburgh: resident 3%, nonresident 1%, LST $52 a year prorated and rounded down', () => {
    const res = { workPSD: '700102', residencePSD: '700102' };
    assert.equal(line(pa(3000, [], { residenceState: { code: 'PA' } }, res), 'PA_EIT'), dollars(90));
    assert.equal(line(pa(3000, [], { residenceState: { code: 'NJ' } }, { workPSD: '700102' }), 'PA_EIT'), dollars(30));
    assert.equal(line(pa(3000, [], {}, res), 'PA_LST'), dollars(2));
    assert.equal(line(pa(1500, [], { payFrequency: 'weekly' }, res), 'PA_LST'), dollars(1));
    assert.equal(line(pa(3000, [], { payFrequency: 'semimonthly' }, res), 'PA_LST'), dollars(2.16)); // 52/24 = 2.1666
    assert.equal(line(pa(6000, [], { payFrequency: 'monthly' }, res), 'PA_LST'), dollars(4.33)); // 52/12 = 4.3333
  });

  test('the low-income LST exemption needs the employee certificate, not just low wages', () => {
    const res = { workPSD: '700102', residencePSD: '700102' };
    assert.equal(line(pa(300, [], {}, res), 'PA_LST'), dollars(2), 'no certificate: still withheld');
    assert.equal(line(pa(300, [], {}, { ...res, lstExemptionCertificate: true }), 'PA_LST'), 0);
    assert.equal(line(pa(3000, [], {}, { ...res, lstExemptionCertificate: true }), 'PA_LST'), dollars(2), 'certificate does not exempt $78,000 a year');
  });
});

describe('rounding and caps', () => {
  test('half-cent results round up despite floating point (9035.00 x 0.9% = 81.315)', () => {
    assert.equal(roundHalfUp(9035 * 100 * 0.009), dollars(81.32));
    assert.equal(roundHalfUp(-9035 * 100 * 0.009), -dollars(81.32));
  });

  test('a 401(k) deferral crossing the 2026 limit leaves PA tax and FICA unchanged', () => {
    // 2026 402(g) limit is $24,500 (IRS Newsroom). With $24,400 already deferred, only $100 of a $300 deferral is pretax.
    // PA taxes deferrals anyway, so the PA base is unchanged; FICA wages include deferrals too.
    const input = pa(3000, [ded('deferral_401k', 300)], {
      ytd: { socialSecurity: 0, medicare: 0, futa: 0, electiveDeferrals: dollars(24400) },
    });
    assert.equal(line(input, 'PA_SIT'), dollars(92.1));
    // Medicare is 1.45% of the full 3000.
    assert.equal(line(input, 'US_MED_EE'), dollars(43.5));
  });

  test('dependent care over the IRC 129 limit ($7,500 in 2026) becomes taxable', () => {
    // $7,300 already taken; of a $400 deduction only $200 fits. Taxable PA wages 3000 - 200 = 2800 x 3.07% = 85.96.
    const over = pa(3000, [ded('dependent_care', 400)], {
      ytd: { socialSecurity: 0, medicare: 0, futa: 0, dependentCare: dollars(7300) },
    });
    assert.equal(line(over, 'PA_SIT'), dollars(85.96));
    assert.equal(line(over, 'US_MED_EE'), dollars(40.6)); // 2800 x 1.45%
    // Within the limit nothing changes: 3000 - 400 = 2600 x 3.07% = 79.82.
    assert.equal(line(pa(3000, [ded('dependent_care', 400)]), 'PA_SIT'), dollars(79.82));
    // In 2025 the limit was $5,000: $4,900 taken, $400 deduction, $100 fits -> 2900 base x 3.07% = 89.03.
    const y2025 = pa(3000, [ded('dependent_care', 400)], {
      checkDate: '2025-06-13',
      ytd: { socialSecurity: 0, medicare: 0, futa: 0, dependentCare: dollars(4900) },
    });
    assert.equal(line(y2025, 'PA_SIT'), dollars(89.03));
  });
});

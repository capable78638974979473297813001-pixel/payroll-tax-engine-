import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { calculatePaycheck } from '../src/calculate.ts';
import { dollars, overThreshold, underCap } from '../src/money.ts';
import { makeTaxableWagesFn } from '../src/wages.ts';
import type { Deduction, Earning, PaycheckInput } from '../src/types.ts';

/**
 * Every expected value below was computed by hand from the published
 * worksheet before the code was run, not captured from the implementation.
 * A golden file regenerated from its own engine proves nothing.
 */

function input(overrides: Partial<PaycheckInput> = {}): PaycheckInput {
  return {
    checkDate: '2026-06-15',
    payFrequency: 'biweekly',
    earnings: [{ code: 'REG', category: 'regular', amount: dollars(3000) }],
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
    ...overrides,
  };
}

function amountOf(result: ReturnType<typeof calculatePaycheck>, id: string) {
  const line = result.taxes.find((t) => t.id === id);
  assert.ok(line, `expected a tax line with id ${id}`);
  return line.amount;
}

describe('money primitives', () => {
  test('underCap stops at the wage base', () => {
    // $180,000 YTD against a $184,500 base leaves $4,500 of room.
    assert.equal(
      underCap(dollars(10_000), dollars(180_000), dollars(184_500)),
      dollars(4_500),
    );
  });

  test('underCap returns zero once the base is exhausted', () => {
    assert.equal(underCap(dollars(10_000), dollars(200_000), dollars(184_500)), 0);
  });

  test('overThreshold isolates only the portion above the trigger', () => {
    // $195k YTD + $10k this cheque = $205k; $5k sits above $200k.
    assert.equal(
      overThreshold(dollars(10_000), dollars(195_000), dollars(200_000)),
      dollars(5_000),
    );
  });
});

describe('taxable wage bases diverge per tax', () => {
  const earnings: Earning[] = [
    { code: 'REG', category: 'regular', amount: dollars(3000) },
  ];
  const deductions: Deduction[] = [
    { code: 'MED', category: 'section125', amount: dollars(100) },
    { code: '401K', category: 'deferral_401k', amount: dollars(200) },
    { code: 'UNION', category: null, amount: dollars(25) },
  ];

  const wagesFor = makeTaxableWagesFn(earnings, deductions);

  test('federal income tax excludes both the cafeteria plan and the deferral', () => {
    assert.equal(
      wagesFor(['section125', 'deferral_401k']),
      dollars(2700),
    );
  });

  test('FICA excludes the cafeteria plan but taxes the deferral', () => {
    assert.equal(wagesFor(['section125']), dollars(2900));
  });

  test('post-tax deductions never reduce any base', () => {
    assert.equal(wagesFor([]), dollars(3000));
  });
});

describe('federal income tax — Pub 15-T Worksheet 1A', () => {
  test('single, biweekly, $3,000, no adjustments', () => {
    // annual 78,000 − 8,600 = 69,400 → 22% bracket over 57,900, base 5,800
    // 5,800 + 0.22 × 11,500 = 8,330/yr ÷ 26 = 320.38
    const r = calculatePaycheck(input());
    assert.equal(amountOf(r, 'US_FIT'), dollars(320.38));
  });

  test('Step 2 checkbox switches to the multiple-jobs schedule', () => {
    // No 8,600 adjustment; 78,000 → 24% bracket over 60,900, base 8,983
    // 8,983 + 0.24 × 17,100 = 13,087/yr ÷ 26 = 503.35
    const r = calculatePaycheck(
      input({
        federalW4: { ...input().federalW4, multipleJobs: true },
      }),
    );
    assert.equal(amountOf(r, 'US_FIT'), dollars(503.35));
  });

  test('dependent credit reduces withholding per period', () => {
    // 320.38 − (2,200 ÷ 26 = 84.62) = 235.76
    const r = calculatePaycheck(
      input({
        federalW4: { ...input().federalW4, dependentCredit: dollars(2200) },
      }),
    );
    assert.equal(amountOf(r, 'US_FIT'), dollars(235.76));
  });

  test('credits cannot drive withholding negative', () => {
    const r = calculatePaycheck(
      input({
        federalW4: { ...input().federalW4, dependentCredit: dollars(99_000) },
      }),
    );
    assert.equal(amountOf(r, 'US_FIT'), 0);
  });

  test('extra withholding is added after credits', () => {
    const r = calculatePaycheck(
      input({
        federalW4: { ...input().federalW4, extraWithholding: dollars(50) },
      }),
    );
    assert.equal(amountOf(r, 'US_FIT'), dollars(370.38));
  });

  test('exempt W-4 withholds nothing for income tax but FICA still applies', () => {
    const r = calculatePaycheck(
      input({ federalW4: { ...input().federalW4, exempt: true } }),
    );
    assert.equal(amountOf(r, 'US_FIT'), 0);
    assert.equal(amountOf(r, 'US_SS_EE'), dollars(186));
  });

  test('low wages land in the 0% bracket', () => {
    const r = calculatePaycheck(
      input({
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(200) }],
      }),
    );
    // 200 × 26 = 5,200 annual, below the 8,600 adjustment → base of 0
    assert.equal(amountOf(r, 'US_FIT'), 0);
  });

  test('married filing separately uses the single schedule', () => {
    const single = calculatePaycheck(input());
    const mfs = calculatePaycheck(
      input({
        federalW4: { ...input().federalW4, filingStatus: 'married_separate' },
      }),
    );
    assert.equal(amountOf(mfs, 'US_FIT'), amountOf(single, 'US_FIT'));
  });
});

describe('FICA', () => {
  test('Social Security and Medicare on an uncapped cheque', () => {
    const r = calculatePaycheck(input());
    assert.equal(amountOf(r, 'US_SS_EE'), dollars(186)); // 3,000 × 6.2%
    assert.equal(amountOf(r, 'US_MED_EE'), dollars(43.5)); // 3,000 × 1.45%
    assert.equal(amountOf(r, 'US_SS_ER'), dollars(186)); // employer matches
  });

  test('Social Security stops at the 2026 wage base', () => {
    // 180,000 YTD leaves 4,500 of room → 4,500 × 6.2% = 279.00
    const r = calculatePaycheck(
      input({
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(10_000) }],
        ytd: { socialSecurity: dollars(180_000), medicare: dollars(180_000), futa: dollars(7000) },
      }),
    );
    assert.equal(amountOf(r, 'US_SS_EE'), dollars(279));
    // Medicare has no cap, so it keeps running on the full 10,000.
    assert.equal(amountOf(r, 'US_MED_EE'), dollars(145));
  });

  test('Additional Medicare applies only above $200,000', () => {
    const r = calculatePaycheck(
      input({
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(10_000) }],
        ytd: { socialSecurity: dollars(184_500), medicare: dollars(195_000), futa: dollars(7000) },
      }),
    );
    assert.equal(amountOf(r, 'US_MED_ADDL'), dollars(45)); // 5,000 × 0.9%
    // Employer never matches the surtax.
    assert.equal(
      r.taxes.filter((t) => t.id === 'US_MED_ADDL' && t.payer === 'employer').length,
      0,
    );
  });

  test('no Additional Medicare line below the threshold', () => {
    const r = calculatePaycheck(input());
    assert.equal(r.taxes.some((t) => t.id === 'US_MED_ADDL'), false);
  });

  test('401(k) deferral does not reduce the FICA base', () => {
    const r = calculatePaycheck(
      input({
        deductions: [
          { code: '401K', category: 'deferral_401k', amount: dollars(500) },
        ],
      }),
    );
    // Still 3,000 × 6.2%, unchanged by the deferral.
    assert.equal(amountOf(r, 'US_SS_EE'), dollars(186));
    // But federal income tax does drop.
    assert.ok(amountOf(r, 'US_FIT') < dollars(320.38));
  });
});

describe('FUTA', () => {
  test('charged on the first $7,000 only', () => {
    const r = calculatePaycheck(input());
    assert.equal(amountOf(r, 'US_FUTA'), dollars(18)); // 3,000 × 0.6%
  });

  test('zero once the wage base is met', () => {
    const r = calculatePaycheck(
      input({ ytd: { socialSecurity: 0, medicare: 0, futa: dollars(7000) } }),
    );
    assert.equal(amountOf(r, 'US_FUTA'), 0);
  });

  test('partial on the cheque that crosses the base', () => {
    // 6,500 YTD leaves 500 → 500 × 0.6% = 3.00
    const r = calculatePaycheck(
      input({ ytd: { socialSecurity: 0, medicare: 0, futa: dollars(6500) } }),
    );
    assert.equal(amountOf(r, 'US_FUTA'), dollars(3));
  });
});

describe('supplemental wages — Pub 15 flat-rate method', () => {
  const bonus = (amount: number) => ({
    code: 'BONUS',
    category: 'supplemental' as const,
    amount: dollars(amount),
  });

  test('a separate bonus check withholds a flat 22% and no bracket tax', () => {
    const r = calculatePaycheck(input({ earnings: [bonus(5000)] }));
    assert.equal(amountOf(r, 'US_FIT_SUPP'), dollars(1100)); // 5,000 × 22%
    // No regular wages, so the annualize/bracket line is zero.
    assert.equal(amountOf(r, 'US_FIT'), 0);
    // Supplemental wages are still ordinary wages for FICA.
    assert.equal(amountOf(r, 'US_SS_EE'), dollars(310)); // 5,000 × 6.2%
  });

  test('regular and supplemental wages on one cheque are taxed on separate paths', () => {
    const r = calculatePaycheck(
      input({
        earnings: [
          { code: 'REG', category: 'regular', amount: dollars(3000) },
          bonus(2000),
        ],
      }),
    );
    // Regular path unchanged: 3,000 biweekly → 320.38 (as in the base fixture).
    assert.equal(amountOf(r, 'US_FIT'), dollars(320.38));
    assert.equal(amountOf(r, 'US_FIT_SUPP'), dollars(440)); // 2,000 × 22%
    // Both federal lines plus FICA on the full 5,000 flow into the total.
    // 320.38 + 440.00 + SS 310.00 + Medicare 72.50 = 1,142.88
    assert.equal(r.employeeTaxTotal, dollars(1142.88));
  });

  test('a bonus that crosses the Social Security wage base — the first fixture', () => {
    // $180,000 YTD leaves $4,500 of SS room; a $10,000 bonus is taxed for SS
    // on that $4,500 only, while supplemental FIT applies to the whole bonus.
    const r = calculatePaycheck(
      input({
        earnings: [bonus(10_000)],
        ytd: {
          socialSecurity: dollars(180_000),
          medicare: dollars(180_000),
          futa: dollars(7000),
        },
      }),
    );
    assert.equal(amountOf(r, 'US_SS_EE'), dollars(279)); // 4,500 × 6.2%
    assert.equal(amountOf(r, 'US_MED_EE'), dollars(145)); // 10,000 × 1.45%, uncapped
    assert.equal(amountOf(r, 'US_FIT_SUPP'), dollars(2200)); // 10,000 × 22%
  });

  test('cumulative supplemental wages above $1M trigger the mandatory 37%', () => {
    // $995,000 supplemental YTD + a $10,000 bonus: $5,000 sits below the $1M
    // line (22%) and $5,000 above it (37%).
    const r = calculatePaycheck(
      input({
        earnings: [bonus(10_000)],
        ytd: {
          socialSecurity: dollars(184_500),
          medicare: dollars(995_000),
          futa: dollars(7000),
          supplemental: dollars(995_000),
        },
      }),
    );
    // 5,000 × 22% + 5,000 × 37% = 1,100 + 1,850 = 2,950.00
    assert.equal(amountOf(r, 'US_FIT_SUPP'), dollars(2950));
  });

  test('no supplemental earnings means no supplemental line at all', () => {
    const r = calculatePaycheck(input());
    assert.equal(r.taxes.some((t) => t.id === 'US_FIT_SUPP'), false);
  });

  test('an exempt W-4 withholds nothing on supplemental wages either', () => {
    const r = calculatePaycheck(
      input({
        earnings: [bonus(5000)],
        federalW4: { ...input().federalW4, exempt: true },
      }),
    );
    assert.equal(amountOf(r, 'US_FIT_SUPP'), 0);
  });
});

describe('Pennsylvania', () => {
  const pa = { workState: { code: 'PA' } };

  test('flat 3.07% with no allowances', () => {
    const r = calculatePaycheck(input(pa));
    assert.equal(amountOf(r, 'PA_SIT'), dollars(92.1)); // 3,000 × 3.07%
  });

  test('Section 125 reduces the PA base', () => {
    const r = calculatePaycheck(
      input({
        ...pa,
        deductions: [
          { code: 'MED', category: 'section125', amount: dollars(100) },
        ],
      }),
    );
    assert.equal(amountOf(r, 'PA_SIT'), dollars(89.03)); // 2,900 × 3.07%
  });

  test('401(k) deferral does NOT reduce the PA base, unlike federal', () => {
    const r = calculatePaycheck(
      input({
        ...pa,
        deductions: [
          { code: '401K', category: 'deferral_401k', amount: dollars(500) },
        ],
      }),
    );
    // PA still taxes the full 3,000 — this is the rule a single shared
    // "taxable wages" figure would silently get wrong.
    assert.equal(amountOf(r, 'PA_SIT'), dollars(92.1));
  });

  test('three different taxable bases on one cheque', () => {
    const r = calculatePaycheck(
      input({
        ...pa,
        deductions: [
          { code: 'MED', category: 'section125', amount: dollars(100) },
          { code: '401K', category: 'deferral_401k', amount: dollars(200) },
        ],
      }),
    );
    const baseOf = (id: string) => r.taxes.find((t) => t.id === id)!.taxableWages;
    assert.equal(baseOf('US_FIT'), dollars(2700)); // both excluded
    assert.equal(baseOf('US_SS_EE'), dollars(2900)); // deferral taxed
    assert.equal(baseOf('PA_SIT'), dollars(2900)); // deferral taxed
  });

  test('an unmodelled state is flagged, never silently zero', () => {
    const r = calculatePaycheck(input({ workState: { code: 'CA' } }));
    const line = r.taxes.find((t) => t.id === 'CA_SIT');
    assert.ok(line);
    assert.match(line.detail ?? '', /NOT MODELLED/);
  });
});

describe('Michigan', () => {
  // Expected values hand-derived from Form 446 (Rev. 02-26): annualize, less
  // (personal exemption amount x exemptions claimed), x 4.25%, de-annualize.
  // Independently computed before running the engine, same discipline as PA.
  const mi = (allowances = 1) => ({
    workState: { code: 'MI', certificate: { allowances } },
  });

  test('single, biweekly, $3,000, 1 exemption', () => {
    // annual 78,000 − 5,900 = 72,100 × 4.25% = 3,064.25/yr ÷ 26 = 117.86
    const r = calculatePaycheck(input(mi(1)));
    assert.equal(amountOf(r, 'MI_SIT'), dollars(117.86));
  });

  test('zero exemptions claimed withholds more', () => {
    // annual 78,000 × 4.25% = 3,315.00/yr ÷ 26 = 127.50, no allowance subtracted
    const r = calculatePaycheck(input(mi(0)));
    assert.equal(amountOf(r, 'MI_SIT'), dollars(127.5));
  });

  test('401(k) deferral REDUCES the Michigan base — opposite of Pennsylvania', () => {
    // MCL 206.30(l) ties MI tax to federal AGI, so the deferral drops the base
    // to 2,500: annual 65,000 − 5,900 = 59,100 × 4.25% = 2,511.75 ÷ 26 = 96.61
    const r = calculatePaycheck(
      input({
        ...mi(1),
        deductions: [
          { code: '401K', category: 'deferral_401k', amount: dollars(500) },
        ],
      }),
    );
    assert.equal(amountOf(r, 'MI_SIT'), dollars(96.61));

    // The same deduction on the same wages does NOT move the PA number —
    // proves the per-tax taxable-wage architecture holds across two states,
    // not just within one.
    const pa = calculatePaycheck(
      input({
        workState: { code: 'PA' },
        deductions: [
          { code: '401K', category: 'deferral_401k', amount: dollars(500) },
        ],
      }),
    );
    assert.equal(amountOf(pa, 'PA_SIT'), dollars(92.1));
  });

  test('Section 125 also reduces the Michigan base', () => {
    // annual 75,400 − 5,900 = 69,500 × 4.25% = 2,953.75 ÷ 26 = 113.61
    const r = calculatePaycheck(
      input({
        ...mi(1),
        deductions: [
          { code: 'MED', category: 'section125', amount: dollars(100) },
        ],
      }),
    );
    assert.equal(amountOf(r, 'MI_SIT'), dollars(113.61));
  });
});

describe('gross-to-net', () => {
  test('net pay reconciles and excludes employer taxes', () => {
    const r = calculatePaycheck(input());
    assert.equal(r.grossPay, dollars(3000));
    // FIT 320.38 + SS 186.00 + Medicare 43.50 = 549.88
    assert.equal(r.employeeTaxTotal, dollars(549.88));
    // SS 186.00 + Medicare 43.50 + FUTA 18.00 = 247.50
    assert.equal(r.employerTaxTotal, dollars(247.5));
    assert.equal(r.netPay, dollars(2450.12));
    assert.equal(
      r.netPay,
      r.grossPay - r.pretaxDeductions - r.posttaxDeductions - r.employeeTaxTotal,
    );
  });

  test('imputed income is taxed but not paid; reimbursements are paid but not taxed', () => {
    const r = calculatePaycheck(
      input({
        earnings: [
          { code: 'REG', category: 'regular', amount: dollars(2000) },
          { code: 'GTL', category: 'imputed', amount: dollars(50) },
          { code: 'MILEAGE', category: 'reimbursement', amount: dollars(100) },
        ],
      }),
    );
    // Cash out the door: 2,000 + 100 reimbursement.
    assert.equal(r.grossPay, dollars(2100));
    // Medicare base: 2,000 + 50 imputed, reimbursement excluded.
    assert.equal(
      r.taxes.find((t) => t.id === 'US_MED_EE')!.taxableWages,
      dollars(2050),
    );
  });

  test('post-tax deductions reduce net but no taxable base', () => {
    const r = calculatePaycheck(
      input({
        deductions: [{ code: 'GARNISH', category: null, amount: dollars(150) }],
      }),
    );
    assert.equal(amountOf(r, 'US_FIT'), dollars(320.38)); // unchanged
    assert.equal(r.netPay, dollars(2450.12) - dollars(150));
  });

  test('whole-dollar rounding is opt-in', () => {
    const r = calculatePaycheck(input({ roundToWholeDollars: true }));
    assert.equal(amountOf(r, 'US_FIT'), dollars(320));
  });
});

describe('effective dating', () => {
  test('the ruleset is chosen by check date, not by the clock', () => {
    assert.throws(
      () => calculatePaycheck(input({ checkDate: '2019-06-15' })),
      /No ruleset at data[\\/]federal[\\/]2019\.json/,
    );
  });

  test('a malformed check date is rejected outright', () => {
    assert.throws(
      () => calculatePaycheck(input({ checkDate: '06/15/2026' })),
      /ISO yyyy-mm-dd/,
    );
  });
});

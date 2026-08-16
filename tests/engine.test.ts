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

  test('nonresident alien: Pub 15-T Table 2 adds a fixed amount to wages before annualizing', () => {
    // Same $3,000 biweekly base as above, plus w4.nonresidentAlien:true.
    // Table 2 biweekly = $619.20. Adjusted per-period wages: 3,000+619.20=
    // 3,619.20 -> annual 3,619.20x26=94,099.20 - 8,600 standard adj =
    // 85,499.20 -> 22% bracket over 57,900, base 5,800: 5,800 + 0.22 x
    // 27,599.20 = 5,800+6,071.824 = 11,871.824/yr -> /26 = 456.6086... ->
    // $456.61 (vs. $320.38 for the same wages without the adjustment).
    const r = calculatePaycheck(
      input({
        federalW4: {
          filingStatus: 'single',
          multipleJobs: false,
          dependentCredit: 0,
          otherIncome: 0,
          deductions: 0,
          extraWithholding: 0,
          nonresidentAlien: true,
        },
      }),
    );
    assert.equal(amountOf(r, 'US_FIT'), dollars(456.61));
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

  // PA is the first state in this project where the EMPLOYEE (not just the
  // employer) pays a UC/SUTA contribution — confirmed from two independent
  // PA Dept. of Labor & Industry pages: 0.07% of gross wages, no wage cap.
  test('employee UC withholding: 0.07% of gross wages, uncapped', () => {
    const r = calculatePaycheck(input(pa));
    assert.equal(amountOf(r, 'PA_UC_EE'), dollars(2.1)); // 3,000 × 0.07%
  });

  test('401(k) deferral does NOT reduce the PA UC base either — same taxable-wages rule as PA_SIT', () => {
    const r = calculatePaycheck(
      input({
        ...pa,
        deductions: [
          { code: '401K', category: 'deferral_401k', amount: dollars(500) },
        ],
      }),
    );
    assert.equal(amountOf(r, 'PA_UC_EE'), dollars(2.1)); // still 3,000 × 0.07%
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

  test('certificate.exempt and certificate.additionalWithholding are GENERIC — proven here via flatRate(), not just Minnesota\'s bracket method', () => {
    // Same base case as 'single, biweekly, $3,000, 1 exemption' ($117.86).
    // state.ts's applyStateWithholdingExemption()/applyAdditionalStateWithholding()
    // wrap EVERY income-tax method's output (matched by the shared
    // `${code}_SIT` id prefix, not hardcoded to bracket_flat_allowance), so
    // Michigan's flat_rate method gets both for free.
    const exempt = calculatePaycheck(input({ ...mi(1), workState: { code: 'MI', certificate: { allowances: 1, exempt: true } } }));
    assert.equal(amountOf(exempt, 'MI_SIT'), 0);

    const withExtra = calculatePaycheck(
      input({ workState: { code: 'MI', certificate: { allowances: 1, additionalWithholding: dollars(15) } } }),
    );
    assert.equal(amountOf(withExtra, 'MI_SIT'), dollars(117.86 + 15));
  });

  test('reciprocity is also generic — an Ohio resident working in Michigan owes $0 MI income tax', () => {
    // Ohio is one of MI's reciprocalStates (data/states/MI-2026.json).
    const r = calculatePaycheck(
      input({ residenceState: { code: 'OH' }, ...mi(1) }),
    );
    assert.equal(amountOf(r, 'MI_SIT'), 0);
  });
});

describe('Indiana', () => {
  // Expected values hand-derived from Departmental Notice #1 (R46 / 01-26)
  // before the code was run, same discipline as PA/MI. Indiana is the first
  // state modelled here with a MANDATORY county add-on sharing the state's
  // own reduced base, and a four-tier exemption schedule instead of one.
  const inState = (certificate: Record<string, unknown>) => ({
    workState: { code: 'IN', certificate },
  });

  test("reproduces Departmental Notice #1's own worked example to the cent", () => {
    // Weekly $800; 5 personal + 3 dependent + 1 first-time-dependent + 2
    // adopted-child exemptions. Each tier's per-period constant, rounded
    // independently: 1,000×5/52=96.15, 1,500×3/52=86.54, 1,500×1/52=28.85,
    // 3,000×2/52=115.38 → total deduction constant $326.92 (matches the
    // notice's own total). Taxable = 800.00 − 326.92 = 473.08 (matches).
    // Harrison County is a real 1% county — the notice's own example rate.
    // State: 473.08 × 2.95% = 13.96. County: 473.08 × 1% = 4.73. Both match
    // Departmental Notice #1's own worked answer exactly.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(800) }],
        ...inState({
          county: 'Harrison',
          personalExemptions: 5,
          dependentExemptions: 3,
          firstTimeDependentExemptions: 1,
          adoptedChildExemptions: 2,
        }),
      }),
    );
    assert.equal(amountOf(r, 'IN_SIT'), dollars(13.96));
    assert.equal(amountOf(r, 'IN_COUNTY'), dollars(4.73));
    const baseOf = (id: string) => r.taxes.find((t) => t.id === id)!.taxableWages;
    assert.equal(baseOf('IN_SIT'), dollars(473.08));
    assert.equal(baseOf('IN_COUNTY'), dollars(473.08)); // same shared base
  });

  test('zero exemptions taxes the full wage; state and county share one base', () => {
    // Weekly $800, no exemptions, Marion County (2.02%).
    // State: 800 × 2.95% = 23.60. County: 800 × 2.02% = 16.16.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(800) }],
        ...inState({ county: 'Marion' }),
      }),
    );
    assert.equal(amountOf(r, 'IN_SIT'), dollars(23.6));
    assert.equal(amountOf(r, 'IN_COUNTY'), dollars(16.16));
  });

  test('reciprocity exempts STATE tax only — county tax still applies (WH-47\'s own critical gotcha)', () => {
    // Same $800/wk, Marion County case as above, but residenceState:KY —
    // one of Indiana's reciprocalStates. Per data/states/IN-2026.json's own
    // reciprocity.rule ('this exemption does NOT extend to Indiana COUNTY
    // tax'), IN_SIT must drop to $0 while IN_COUNTY stays at $16.16,
    // completely unaffected. This is the case a naive whole-line-array
    // reciprocity implementation would get wrong — state.ts's
    // zeroStateIncomeTaxLines() only zeroes IN_SIT-prefixed lines.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(800) }],
        residenceState: { code: 'KY' },
        ...inState({ county: 'Marion' }),
      }),
    );
    assert.equal(amountOf(r, 'IN_SIT'), 0);
    assert.equal(amountOf(r, 'IN_COUNTY'), dollars(16.16));
  });

  test('401(k) deferral reduces BOTH the state and county base — federal-AGI conformity', () => {
    // Biweekly $3,000, 1 personal exemption, Allen County (1.59%), $500 401(k).
    // Deduction constant: 1,000/26 = 38.46. Taxable = 3,000 − 500 − 38.46 = 2,461.54.
    // State: 2,461.54 × 2.95% = 72.615… → 72.62. County: 2,461.54 × 1.59% = 39.138… → 39.14.
    const r = calculatePaycheck(
      input({
        deductions: [
          { code: '401K', category: 'deferral_401k', amount: dollars(500) },
        ],
        ...inState({ county: 'Allen', personalExemptions: 1 }),
      }),
    );
    assert.equal(amountOf(r, 'IN_SIT'), dollars(72.62));
    assert.equal(amountOf(r, 'IN_COUNTY'), dollars(39.14));
  });

  test('a missing county is flagged, never silently zero', () => {
    // Biweekly $3,000, 1 personal exemption, no county on the certificate.
    // Deduction constant 1,000/26 = 38.46 → taxable 2,961.54 × 2.95% = 87.37.
    const r = calculatePaycheck(input(inState({ personalExemptions: 1 })));
    assert.equal(amountOf(r, 'IN_SIT'), dollars(87.37)); // state unaffected
    const county = r.taxes.find((t) => t.id === 'IN_COUNTY');
    assert.ok(county);
    assert.equal(county.amount, 0);
    assert.match(county.detail ?? '', /NOT MODELLED/);
  });

  test('an unrecognised county name is flagged, never silently zero', () => {
    const r = calculatePaycheck(
      input(inState({ county: 'Not A Real County', personalExemptions: 1 })),
    );
    assert.equal(amountOf(r, 'IN_SIT'), dollars(87.37)); // state still computes
    const county = r.taxes.find((t) => t.id === 'IN_COUNTY');
    assert.ok(county);
    assert.equal(county.amount, 0);
    assert.match(county.detail ?? '', /NOT MODELLED/);
  });
});

describe('Illinois', () => {
  // Expected values hand-derived from the 2026 IL-700-T formula and the
  // Illinois Comptroller's 2026 payroll bulletin before the code was run,
  // same discipline as PA/MI/Indiana. Illinois has TWO exemption tiers (like
  // Indiana) but NO local income tax at all (unlike Indiana) — the state
  // line should be the ONLY line these fixtures ever produce.
  const ilState = (certificate: Record<string, unknown>) => ({
    workState: { code: 'IL', certificate },
  });

  test('one basic allowance reproduces the Comptroller-confirmed bi-weekly exemption exactly', () => {
    // Biweekly $3,000, 1 basic allowance, 0 additional.
    // Deduction: 2,925/26 = 112.50 (matches the Comptroller's 2026 bulletin's
    // own stated bi-weekly exemption figure exactly — an independent check
    // on the per-period rounding, not just the formula).
    // Taxable: 3,000 - 112.50 = 2,887.50. Tax: 2,887.50 x 4.95% = 142.93 (rounds down from .125).
    const r = calculatePaycheck(input(ilState({ basicAllowances: 1 })));
    assert.equal(amountOf(r, 'IL_SIT'), dollars(142.93));
    const baseOf = (id: string) => r.taxes.find((t) => t.id === id)!.taxableWages;
    assert.equal(baseOf('IL_SIT'), dollars(2887.5));
  });

  test('zero allowances taxes the full wage', () => {
    // Weekly $800, no allowances. 800 x 4.95% = 39.60 exactly.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(800) }],
        ...ilState({}),
      }),
    );
    assert.equal(amountOf(r, 'IL_SIT'), dollars(39.6));
  });

  test('reciprocity: a Wisconsin resident working in Illinois owes $0 IL income tax', () => {
    // Same $800/wk, zero-allowance case as above. Wisconsin is one of
    // Illinois's reciprocalStates (data/states/IL-2026.json) — and unlike
    // Indiana, Illinois has no local tax for the exemption to carve around,
    // so this should be a clean $0, full stop.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(800) }],
        residenceState: { code: 'WI' },
        ...ilState({}),
      }),
    );
    assert.equal(amountOf(r, 'IL_SIT'), 0);
  });

  test('401(k) deferral reduces the Illinois base — federal-AGI conformity', () => {
    // Biweekly $3,000, 2 basic + 1 additional allowance, $500 401(k).
    // Deduction constant: 2,925x2/26 = 225.00, plus 1,000x1/26 = 38.46
    // (rounds down from 38.4615...) = 263.46 total.
    // Taxable: 3,000 - 500 - 263.46 = 2,236.54. Tax: 2,236.54 x 4.95% = 110.71 (rounds up from .873).
    const r = calculatePaycheck(
      input({
        deductions: [
          { code: '401K', category: 'deferral_401k', amount: dollars(500) },
        ],
        ...ilState({ basicAllowances: 2, additionalAllowances: 1 }),
      }),
    );
    assert.equal(amountOf(r, 'IL_SIT'), dollars(110.71));
  });

  test("IL-700-T's own worked example, recomputed — pins a known stale-example discrepancy", () => {
    // Weekly $300, 2 basic + 1 additional allowance — the exact inputs of
    // the IL-700-T page's own "Mary" narrative example, which states the
    // answer as $8.38. Recomputing from that SAME page's own formula and the
    // Comptroller-confirmed $2,925/$1,000 exemption amounts gives $8.33, not
    // $8.38 — see data/states/IL-2026.json's knownGaps for the full
    // disclosure. This fixture pins the formula-correct answer rather than
    // silently matching stale prose.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(300) }],
        ...ilState({ basicAllowances: 2, additionalAllowances: 1 }),
      }),
    );
    assert.equal(amountOf(r, 'IL_SIT'), dollars(8.33));
  });

  test('no local tax line is ever produced — Illinois genuinely has none', () => {
    const r = calculatePaycheck(input(ilState({ basicAllowances: 1 })));
    assert.equal(
      r.taxes.some((t) => t.jurisdiction === 'local'),
      false,
    );
  });
});

describe('Wisconsin', () => {
  // Expected values hand-derived from Publication W-166's own "Alternate
  // Method of Withholding" formula and worked examples, same discipline as
  // every other state. Wisconsin is the first state in this project with a
  // genuine progressive bracket schedule PLUS an income-phased-out standard
  // deduction (not a flat allowance) — three of these five fixtures reproduce
  // W-166's own published examples to the cent, not values computed only by
  // this engine.
  const wiState = (certificate: Record<string, unknown>) => ({
    workState: { code: 'WI', certificate },
  });

  test("Publication W-166 Example 1: single, weekly $350, 1 exemption", () => {
    // Annual 350x52=18,200. Deduction: 6,702 - 12%x(18,200-17,780) = 6,702 -
    // 50.40 = 6,651.60. Less: 18,200 - 6,651.60 = 11,548.40. Less 1 exemption
    // ($400): 11,148.40 net. Bracket 1 (0-12,760 @ 3.54%): 11,148.40 x
    // 3.54% = 394.65. ÷52 = 7.59 (W-166's own stated answer).
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(350) }],
        ...wiState({ maritalStatus: 'single', exemptions: 1 }),
      }),
    );
    assert.equal(amountOf(r, 'WI_SIT'), dollars(7.59));
  });

  test("Publication W-166 Example 2: single, weekly $500, 3 exemptions", () => {
    // Annual 500x52=26,000. Deduction: 6,702 - 12%x(26,000-17,780) = 6,702 -
    // 986.40 = 5,715.60. Less: 26,000 - 5,715.60 = 20,284.40. Less 3
    // exemptions ($1,200): 19,084.40 net. Bracket 2 (12,760-25,520 @ 4.65%,
    // base 451.70): 451.70 + 4.65%x6,324.40 = 451.70 + 294.08 = 745.78.
    // ÷52 = 14.34 (W-166's own stated answer).
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(500) }],
        ...wiState({ maritalStatus: 'single', exemptions: 3 }),
      }),
    );
    assert.equal(amountOf(r, 'WI_SIT'), dollars(14.34));
  });

  test("Publication W-166 Example 3: married, biweekly $1,000, 3 exemptions", () => {
    // Annual 1,000x26=26,000. Deduction (married): 9,461 - 20%x(26,000-
    // 25,727) = 9,461 - 54.60 = 9,406.40. Less: 26,000 - 9,406.40 =
    // 16,593.60. Less 3 exemptions ($1,200): 15,393.60 net. Bracket 2: 451.70
    // + 4.65%x2,633.60 = 451.70 + 122.46 = 574.16. ÷26 = 22.08 (W-166's own
    // stated answer). Proves the SAME bracket schedule applies regardless of
    // marital status — only the deduction phase-out differs.
    const r = calculatePaycheck(
      input({
        payFrequency: 'biweekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...wiState({ maritalStatus: 'married', exemptions: 3 }),
      }),
    );
    assert.equal(amountOf(r, 'WI_SIT'), dollars(22.08));
  });

  test('low income keeps the FULL standard deduction (below the phase-out start)', () => {
    // Weekly $200, single, 0 exemptions. Annual 200x52=10,400 — below
    // single's $17,780 phase-out start, so the deduction stays at the full
    // $6,702. Net: 10,400 - 6,702 = 3,698. Bracket 1: 3,698 x 3.54% = 130.91.
    // ÷52 = 2.52.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(200) }],
        ...wiState({ maritalStatus: 'single', exemptions: 0 }),
      }),
    );
    assert.equal(amountOf(r, 'WI_SIT'), dollars(2.52));
  });

  test('high income phases the standard deduction all the way to $0', () => {
    // Weekly $1,500, single, 0 exemptions. Annual 1,500x52=78,000 — above
    // single's $73,630 phase-out end, so the deduction is $0. Net wage equals
    // annual wages: 78,000. Bracket 3 (25,520-280,950 @ 5.30%, base
    // 1,045.04): 1,045.04 + 5.30%x52,480 = 1,045.04 + 2,781.44 = 3,826.48.
    // ÷52 = 73.59.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1500) }],
        ...wiState({ maritalStatus: 'single', exemptions: 0 }),
      }),
    );
    assert.equal(amountOf(r, 'WI_SIT'), dollars(73.59));
  });

  test('supplemental (bonus) wages use a flat bracket-dependent rate, separate from regular wages', () => {
    // Biweekly $500 regular + $1,000 bonus, single, 0 exemptions.
    // Regular line excludes the bonus from its own base: annual 500x26=13,000
    // — below single's $17,780 phase-out start, so the FULL $6,702 deduction
    // applies. Net: 13,000 - 6,702 = 6,298. Bracket 1 (0-12,760 @ 3.54%):
    // 6,298 x 3.54% = 222.95. ÷26 = 8.58.
    // Supplemental line: estimated annual GROSS salary uses the REGULAR wages
    // only (500x26=13,000), which falls in the SECOND bracket (12,760-25,520
    // @ 4.65%) — a genuinely different bracket than the regular line landed
    // in after its own deduction, because this lookup uses gross, not net.
    // The bonus is taxed flatly at that bracket's rate: 1,000 x 4.65% = 46.50.
    const r = calculatePaycheck(
      input({
        payFrequency: 'biweekly',
        earnings: [
          { code: 'REG', category: 'regular', amount: dollars(500) },
          { code: 'BONUS', category: 'supplemental', amount: dollars(1000) },
        ],
        ...wiState({ maritalStatus: 'single', exemptions: 0 }),
      }),
    );
    assert.equal(amountOf(r, 'WI_SIT'), dollars(8.58));
    assert.equal(amountOf(r, 'WI_SIT_SUPP'), dollars(46.5));
  });

  test('no supplemental line at all when there is no supplemental income', () => {
    const r = calculatePaycheck(input(wiState({ maritalStatus: 'single', exemptions: 1 })));
    assert.equal(r.taxes.some((t) => t.id === 'WI_SIT_SUPP'), false);
  });
});

describe('Kentucky', () => {
  // Expected values hand-derived from the DOR's own 2026 Withholding Tax
  // Formula (42A003 TCF) before the code was run, same discipline as
  // PA/MI/IN/IL/WI. Kentucky has NO exemption-count concept at all (Form K-4
  // has no personal/dependent count field) — the $3,360 standard deduction
  // is a single flat annual amount, unconditional, which is why Kentucky got
  // its own flatRateFixedDeduction() method instead of reusing flatRate().
  const kyState = () => ({ workState: { code: 'KY' } });

  test("reproduces the DOR's own monthly worked example to the cent", () => {
    // Monthly $3,270: annual 3,270×12=39,240 − 3,360 deduction = 35,880
    // taxable × 3.5% = 1,255.80/yr ÷ 12 = 104.65. Matches 42A003 TCF exactly,
    // including its intermediate figures — no correction needed for this one.
    const r = calculatePaycheck(
      input({
        payFrequency: 'monthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(3270) }],
        ...kyState(),
      }),
    );
    assert.equal(amountOf(r, 'KY_SIT'), dollars(104.65));
  });

  test('certificate.exempt and certificate.additionalWithholding work generically via flatRateFixedDeduction() too', () => {
    // Same $3,270/month base case as above ($104.65).
    const exempt = calculatePaycheck(
      input({
        payFrequency: 'monthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(3270) }],
        workState: { code: 'KY', certificate: { exempt: true } },
      }),
    );
    assert.equal(amountOf(exempt, 'KY_SIT'), 0);

    const withExtra = calculatePaycheck(
      input({
        payFrequency: 'monthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(3270) }],
        workState: { code: 'KY', certificate: { additionalWithholding: dollars(20) } },
      }),
    );
    assert.equal(amountOf(withExtra, 'KY_SIT'), dollars(104.65 + 20));
  });

  test('reciprocity: a resident of a KY-reciprocal state owes $0 KY income tax', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'monthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(3270) }],
        residenceState: { code: 'OH' },
        ...kyState(),
      }),
    );
    assert.equal(amountOf(r, 'KY_SIT'), 0);
  });

  test("reproduces the DOR's own biweekly example, CORRECTED for its own arithmetic error", () => {
    // Biweekly $1,500: annual 1,500×26=39,000 − 3,360 = 35,640 taxable ×
    // 3.5% = 1,247.40/yr ÷ 26 = 47.9769... → 47.98.
    // The source document's own step 3 multiplies a typo'd $35,730 instead
    // of the $35,640 its own step 2 just computed (off by $90), AND its
    // final answer is truncated to a flat "$47" instead of $47.98. Both are
    // flaws in the PRIMARY SOURCE'S own printed example, not in this
    // formula: reproducing the source's typo would require deliberately
    // reimplementing its arithmetic error, so this fixture asserts the
    // value the formula, and the source's own uncorrected step 2, actually
    // imply — $47.98, not $47.
    const r = calculatePaycheck(
      input({
        payFrequency: 'biweekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1500) }],
        ...kyState(),
      }),
    );
    assert.equal(amountOf(r, 'KY_SIT'), dollars(47.98));
  });

  test('wages entirely below the standard deduction withhold zero, not negative', () => {
    // Weekly $50: annual 50×52=2,600, below the $3,360 deduction entirely —
    // atLeastZero() clamps the taxable base to 0 before the rate is applied.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(50) }],
        ...kyState(),
      }),
    );
    assert.equal(amountOf(r, 'KY_SIT'), 0);
  });

  test('supplemental wages on the SAME cheque are AGGREGATED, not taxed on a separate line — 103 KAR 18:070', () => {
    // Biweekly $1,500 regular + $500 supplemental in ONE cheque. 103 KAR
    // 18:070 Section 3(1) requires treating same-cheque supplemental wages
    // "as if the aggregate of the supplemental and regular wages were a
    // single wage payment" — the opposite of Wisconsin's bracketSupplementalTax()
    // pattern, which carves supplemental OUT into its own flat-rate line.
    // Combined base 2,000/period: annual 2,000×26=52,000 − 3,360 = 48,640
    // taxable × 3.5% = 1,702.40/yr ÷ 26 = 65.4769... → 65.48.
    // Asserts there is exactly ONE Kentucky state-tax line (no KY_SIT_SUPP),
    // and that its taxableWages figure is the FULL combined base — proof
    // this is genuine aggregation, not a coincidentally-matching total.
    const r = calculatePaycheck(
      input({
        payFrequency: 'biweekly',
        earnings: [
          { code: 'REG', category: 'regular', amount: dollars(1500) },
          { code: 'BONUS', category: 'supplemental', amount: dollars(500) },
        ],
        ...kyState(),
      }),
    );
    assert.equal(amountOf(r, 'KY_SIT'), dollars(65.48));
    assert.equal(r.taxes.some((t) => t.id === 'KY_SIT_SUPP'), false);
    const line = r.taxes.find((t) => t.id === 'KY_SIT');
    assert.equal(line?.taxableWages, dollars(2000));
  });

  test('401(k) deferral reduces the Kentucky base — federal-AGI conformity, confirmed by a full read of KRS 141.019', () => {
    // Monthly $3,270 with a $270 401(k) deferral: taxable wages drop to
    // 3,000/mo. Annual 36,000 − 3,360 = 32,640 × 3.5% = 1,142.40/yr ÷ 12 = 95.20.
    const r = calculatePaycheck(
      input({
        payFrequency: 'monthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(3270) }],
        deductions: [
          { code: '401K', category: 'deferral_401k', amount: dollars(270) },
        ],
        ...kyState(),
      }),
    );
    assert.equal(amountOf(r, 'KY_SIT'), dollars(95.2));
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

describe('Minnesota', () => {
  // Expected values hand-derived from wh-inst-26's "Computer Formula" (p.34)
  // before the code was run, same discipline as every other state. Unlike
  // Wisconsin's single shared bracket schedule, Minnesota publishes TWO
  // different schedules (single vs. married) — these fixtures deliberately
  // exercise both. Minnesota's own tables round to the WHOLE dollar; these
  // fixtures compute to the CENT via the underlying formula instead (the
  // tables are just a rounded presentation of the same formula, not a
  // separately authoritative source — wh-inst-26 itself says rounding to
  // the whole dollar is optional, "You may round...").
  const mnState = (certificate: Record<string, unknown>) => ({
    workState: { code: 'MN', certificate },
  });

  test('single, weekly $605, 0 allowances', () => {
    // Annual 605x52=31,460. No allowance. Net wage 31,460 falls in the
    // 4,700-38,010 bracket (5.35%, base $0). Excess: 31,460-4,700=26,760.
    // Tax: 5.35% x 26,760 = 1,431.66/yr ÷ 52 = 27.5319... → $27.53.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(605) }],
        ...mnState({ maritalStatus: 'single', allowances: 0 }),
      }),
    );
    assert.equal(amountOf(r, 'MN_SIT'), dollars(27.53));
  });

  test('single, weekly $605, 2 allowances — same bracket, allowance lowers the base', () => {
    // Annual 31,460. Allowance: 2x$5,300=$10,600. Net: 31,460-10,600=20,860
    // — still the 4,700-38,010 bracket. Excess: 20,860-4,700=16,160.
    // Tax: 5.35% x 16,160 = 864.56/yr ÷ 52 = 16.6262... → $16.63.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(605) }],
        ...mnState({ maritalStatus: 'single', allowances: 2 }),
      }),
    );
    assert.equal(amountOf(r, 'MN_SIT'), dollars(16.63));
  });

  test('married, weekly $905, 3 allowances — uses the MARRIED bracket schedule', () => {
    // Annual 905x52=47,060. Allowance: 3x$5,300=$15,900. Net: 47,060-15,900
    // =31,160 — married's 14,700-63,400 bracket (5.35%, base $0), a
    // DIFFERENT threshold than single's, proving the two schedules are
    // genuinely distinct, not the same table reused. Excess: 31,160-14,700
    // =16,460. Tax: 5.35% x 16,460 = 880.61/yr ÷ 52 = 16.9348... → $16.93.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(905) }],
        ...mnState({ maritalStatus: 'married', allowances: 3 }),
      }),
    );
    assert.equal(amountOf(r, 'MN_SIT'), dollars(16.93));
  });

  test('zero or negative net wage after allowances withholds nothing', () => {
    // Weekly $80, 1 allowance. Annual 80x52=4,160. Allowance $5,300 exceeds
    // annual wages entirely — net wage clamps to $0, landing in the 0%
    // band (0-4,700). No tax withheld, not a crash or negative amount.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(80) }],
        ...mnState({ maritalStatus: 'single', allowances: 1 }),
      }),
    );
    assert.equal(amountOf(r, 'MN_SIT'), 0);
  });

  test('supplemental (bonus) wages use ONE flat 6.25% rate, unlike Wisconsin\'s bracket-dependent rate', () => {
    // Biweekly $2,000 regular + $500 bonus, single, 1 allowance.
    // Regular line excludes the bonus from its own base: annual 2,000x26=
    // 52,000. Allowance $5,300. Net: 46,700 — the 38,010-114,130 bracket
    // (6.80%, base $1,782.09). Excess: 46,700-38,010=8,690.
    // Tax: 1,782.09 + 6.80% x 8,690 = 1,782.09+590.92 = 2,373.01/yr ÷ 26 =
    // 91.269615... → $91.27 (9126.96 cents rounds to 9127).
    // Supplemental line: flat 6.25% of $500 = $31.25 — no bracket lookup at
    // all, unlike Wisconsin's bracketSupplementalTax().
    const r = calculatePaycheck(
      input({
        payFrequency: 'biweekly',
        earnings: [
          { code: 'REG', category: 'regular', amount: dollars(2000) },
          { code: 'BONUS', category: 'supplemental', amount: dollars(500) },
        ],
        ...mnState({ maritalStatus: 'single', allowances: 1 }),
      }),
    );
    assert.equal(amountOf(r, 'MN_SIT'), dollars(91.27));
    assert.equal(amountOf(r, 'MN_SIT_SUPP'), dollars(31.25));
  });

  test('no supplemental line at all when there is no supplemental income', () => {
    const r = calculatePaycheck(input(mnState({ maritalStatus: 'single', allowances: 1 })));
    assert.equal(r.taxes.some((t) => t.id === 'MN_SIT_SUPP'), false);
  });

  test('certificate.exempt zeroes BOTH the regular and supplemental lines (Form W-4MN Section 2)', () => {
    // Biweekly $2,000 regular + $500 bonus, single, 1 allowance — same
    // wages as the earlier supplemental fixture, which produced MN_SIT
    // $91.27 and MN_SIT_SUPP $31.25 with exempt unset. With exempt:true,
    // both lines must be $0 instead — Section 2 covers all MN wages, not
    // just regular pay. Lines stay PRESENT (zeroed), not removed, so a
    // caller inspecting result.taxes always finds the same set of ids.
    const r = calculatePaycheck(
      input({
        payFrequency: 'biweekly',
        earnings: [
          { code: 'REG', category: 'regular', amount: dollars(2000) },
          { code: 'BONUS', category: 'supplemental', amount: dollars(500) },
        ],
        ...mnState({ maritalStatus: 'single', allowances: 1, exempt: true }),
      }),
    );
    assert.equal(amountOf(r, 'MN_SIT'), 0);
    assert.equal(amountOf(r, 'MN_SIT_SUPP'), 0);
  });

  test('certificate.additionalWithholding adds a flat per-period amount on top of the formula (W-4MN Section 1 Line 2)', () => {
    // Same base case as 'single, weekly $605, 0 allowances' ($27.53),
    // plus a $10.00 additional withholding request. Expect $37.53 —
    // added to MN_SIT only, not duplicated onto a supplemental line.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(605) }],
        ...mnState({ maritalStatus: 'single', allowances: 0, additionalWithholding: dollars(10) }),
      }),
    );
    assert.equal(amountOf(r, 'MN_SIT'), dollars(37.53));
  });

  test('additionalWithholding is skipped entirely when the employee is also exempt', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(605) }],
        ...mnState({ maritalStatus: 'single', allowances: 0, exempt: true, additionalWithholding: dollars(10) }),
      }),
    );
    assert.equal(amountOf(r, 'MN_SIT'), 0);
  });

  test('reciprocity: a Michigan resident working in Minnesota owes $0 MN income tax', () => {
    // Same wages as the base fixture ($605/wk, single, 0 allowances,
    // which normally withholds $27.53) but residenceState:MI — one of
    // MN's two active reciprocal states (data/states/MN-2026.json
    // reciprocity.reciprocalStates). Expect MN_SIT to drop to $0 purely
    // from residence, with no change to the earnings themselves.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(605) }],
        residenceState: { code: 'MI' },
        ...mnState({ maritalStatus: 'single', allowances: 0 }),
      }),
    );
    assert.equal(amountOf(r, 'MN_SIT'), 0);
  });

  test('reciprocity does NOT apply when residenceState equals the work state', () => {
    // Guards against a degenerate case: a Minnesota resident working in
    // Minnesota must NOT match its own state code in reciprocalStates
    // (which it isn't in anyway) — normal $27.53 withholding applies.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(605) }],
        residenceState: { code: 'MN' },
        ...mnState({ maritalStatus: 'single', allowances: 0 }),
      }),
    );
    assert.equal(amountOf(r, 'MN_SIT'), dollars(27.53));
  });

  test('reciprocity does NOT apply to a non-reciprocal-state resident (Wisconsin\'s agreement is not currently active)', () => {
    // Wisconsin is named in Rule 8002.0200 but its actual agreement is
    // terminated (see reciprocity.reciprocalStatesEligibleButNotCurrentlyActive
    // in the data file) — MN-2026.json's reciprocalStates deliberately
    // excludes WI, so a Wisconsin resident still owes ordinary MN tax.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(605) }],
        residenceState: { code: 'WI' },
        ...mnState({ maritalStatus: 'single', allowances: 0 }),
      }),
    );
    assert.equal(amountOf(r, 'MN_SIT'), dollars(27.53));
  });

  test('nonresident de minimis: low annual wages waive MN withholding even without reciprocity', () => {
    // Weekly $200, single, residenceState CA (not a reciprocal state).
    // Annual estimate: 200x52=10,400 — below MN's $15,300 nonresident
    // de minimis threshold (wh-inst-26 p.4) — so MN_SIT is $0 even though
    // CA has no reciprocal agreement with MN at all.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(200) }],
        residenceState: { code: 'CA' },
        ...mnState({ maritalStatus: 'single', allowances: 0 }),
      }),
    );
    assert.equal(amountOf(r, 'MN_SIT'), 0);
  });

  test('nonresident de minimis does NOT waive withholding once estimated annual wages reach the threshold', () => {
    // Weekly $300, residenceState CA. Annual estimate: 300x52=15,600 —
    // AT/ABOVE the $15,300 threshold, so ordinary withholding applies:
    // net wage 15,600 falls in the 4,700-38,010 bracket. Excess:
    // 15,600-4,700=10,900. Tax: 5.35% x 10,900 = 583.15/yr ÷ 52 =
    // 11.2144... → $11.21.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(300) }],
        residenceState: { code: 'CA' },
        ...mnState({ maritalStatus: 'single', allowances: 0 }),
      }),
    );
    assert.equal(amountOf(r, 'MN_SIT'), dollars(11.21));
  });

  test('nonresident alien: Form W-4MN routes to Pub 15-T Table 2, reusing the SAME federal table as US_FIT', () => {
    // Same $605/wk, single, 0-allowance base as 'single, weekly $605, 0
    // allowances' ($27.53), plus certificate.nonresidentAlien:true. Table 2
    // weekly = $309.60. Adjusted per-period wages: 605+309.60=914.60 ->
    // annual 914.60x52=47,559.20 (no allowance to subtract) -> falls in
    // the 38,010-114,130 bracket (6.80%, base $1,782.09), NOT the
    // 4,700-38,010 bracket the unadjusted $605/wk wage falls in. Excess:
    // 47,559.20-38,010=9,549.20. Tax: 1,782.09+6.80%x9,549.20=1,782.09+
    // 649.3456=2,431.4356/yr -> /52 = 46.758... -> $46.76.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(605) }],
        ...mnState({ maritalStatus: 'single', allowances: 0, nonresidentAlien: true }),
      }),
    );
    assert.equal(amountOf(r, 'MN_SIT'), dollars(46.76));
  });

  test('an unrecognized certificate.maritalStatus throws instead of silently defaulting to single', () => {
    // A caller passing the raw W-4MN checkbox label, or any typo, must fail
    // loudly rather than produce a plausible-looking wrong number by
    // silently falling through to 'single'.
    assert.throws(
      () =>
        calculatePaycheck(
          input({
            payFrequency: 'weekly',
            earnings: [{ code: 'REG', category: 'regular', amount: dollars(605) }],
            ...mnState({ maritalStatus: 'divorced', allowances: 0 }),
          }),
        ),
      /Unrecognized MN certificate\.maritalStatus/,
    );
  });

  test("the third checkbox ('married_withhold_as_single') resolves to the SINGLE schedule, not married", () => {
    // Married, weekly $905, 3 allowances, but withholding at the higher
    // single rate — same wages as the earlier 'married, weekly $905, 3
    // allowances' fixture, which used the MARRIED schedule and got $16.93.
    // With this checkbox, the SAME wages must land on the SINGLE schedule
    // instead: annual 47,060 - 15,900 allowance = 31,160 net -> single's
    // 4,700-38,010 bracket (5.35%, base $0), not married's 14,700-63,400
    // bracket. Excess: 31,160-4,700=26,460. Tax: 5.35% x 26,460 = 1,415.61/yr
    // -> /52 = 27.223... -> $27.22 — a DIFFERENT number than $16.93,
    // proving this really did switch schedules, not just relabel the same one.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(905) }],
        ...mnState({ maritalStatus: 'married_withhold_as_single', allowances: 3 }),
      }),
    );
    assert.equal(amountOf(r, 'MN_SIT'), dollars(27.22));
  });

  describe('Minnesota Paid Leave (employee)', () => {
    test('0.44% of wages, no cap in play', () => {
      // Weekly $605 — same wages as the base income-tax fixture.
      // 605 x 0.44% = 2.662 -> rounds to $2.66.
      const r = calculatePaycheck(
        input({
          payFrequency: 'weekly',
          earnings: [{ code: 'REG', category: 'regular', amount: dollars(605) }],
          ...mnState({ maritalStatus: 'single', allowances: 0 }),
        }),
      );
      assert.equal(amountOf(r, 'MN_PFML_EE'), dollars(2.66));
    });

    test('runs even when MN income tax is $0 via reciprocity — separate statute, separate levy', () => {
      const r = calculatePaycheck(
        input({
          payFrequency: 'weekly',
          earnings: [{ code: 'REG', category: 'regular', amount: dollars(605) }],
          residenceState: { code: 'MI' },
          ...mnState({ maritalStatus: 'single', allowances: 0 }),
        }),
      );
      assert.equal(amountOf(r, 'MN_SIT'), 0);
      assert.equal(amountOf(r, 'MN_PFML_EE'), dollars(2.66));
    });

    test('caps at the wage base using YTD, not just the current cheque', () => {
      // $184,900 already counted YTD toward MN's Paid Leave cap ($185,000).
      // Only $100 of this week's $605 is still under the cap.
      // 100 x 0.44% = 0.44 -> $0.44.
      const r = calculatePaycheck(
        input({
          payFrequency: 'weekly',
          earnings: [{ code: 'REG', category: 'regular', amount: dollars(605) }],
          ytd: {
            socialSecurity: 0,
            medicare: 0,
            futa: 0,
            statePaidLeave: { MN: dollars(184900) },
          },
          ...mnState({ maritalStatus: 'single', allowances: 0 }),
        }),
      );
      assert.equal(amountOf(r, 'MN_PFML_EE'), dollars(0.44));
    });
  });
});

describe('Montana', () => {
  // Expected values reproduce the Employer and Information Agent Guide's OWN
  // worked examples exactly — not values computed only by this engine. This
  // is the strongest verification tier available: Montana's guide gives its
  // own answer for each example, so these fixtures prove the engine agrees
  // with the primary source's own arithmetic, not just with itself.
  const mtState = (certificate: Record<string, unknown>) => ({
    workState: { code: 'MT', certificate },
  });

  test('Guide Example: single/MFS, semi-monthly $1,375 -> $33', () => {
    // $0 + 4.7% x ($1,375-$671) = $33.088 -> $33 (nearest dollar, not $34 —
    // proves this engine follows the guide's own examples, not its prose).
    const r = calculatePaycheck(
      input({
        payFrequency: 'semimonthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1375) }],
        ...mtState({ filingStatus: 'single' }),
      }),
    );
    assert.equal(amountOf(r, 'MT_SIT'), dollars(33));
  });

  test('Guide Example: single/MFS, biweekly $2,950 -> $114', () => {
    // $86 + 5.65% x ($2,950-$2,446) = $114.476 -> $114.
    const r = calculatePaycheck(
      input({
        payFrequency: 'biweekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2950) }],
        ...mtState({ filingStatus: 'mfs' }),
      }),
    );
    assert.equal(amountOf(r, 'MT_SIT'), dollars(114));
  });

  test('Guide Example: single/MFS, weekly $475 -> $8', () => {
    // $0 + 4.7% x ($475-$310) = $7.755 -> $8.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(475) }],
        ...mtState({ filingStatus: 'single' }),
      }),
    );
    assert.equal(amountOf(r, 'MT_SIT'), dollars(8));
  });

  test('Guide Example: MFJ/QSS, semi-monthly $1,375 -> $2', () => {
    // $0 + 4.7% x ($1,375-$1,342) = $1.551 -> $2.
    const r = calculatePaycheck(
      input({
        payFrequency: 'semimonthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1375) }],
        ...mtState({ filingStatus: 'mfj' }),
      }),
    );
    assert.equal(amountOf(r, 'MT_SIT'), dollars(2));
  });

  test('Guide Example: MFJ/QSS, biweekly $5,950 -> $232', () => {
    // $172 + 5.65% x ($5,950-$4,892) = $231.777 -> $232.
    const r = calculatePaycheck(
      input({
        payFrequency: 'biweekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(5950) }],
        ...mtState({ filingStatus: 'qss' }),
      }),
    );
    assert.equal(amountOf(r, 'MT_SIT'), dollars(232));
  });

  test('Guide Example: MFJ/QSS, weekly $725 -> $5', () => {
    // $0 + 4.7% x ($725-$619) = $4.982 -> $5.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(725) }],
        ...mtState({ filingStatus: 'mfj' }),
      }),
    );
    assert.equal(amountOf(r, 'MT_SIT'), dollars(5));
  });

  test('Guide Example: Head of Household, semi-monthly $1,375 -> $17', () => {
    // $0 + 4.7% x ($1,375-$1,006) = $17.343 -> $17.
    const r = calculatePaycheck(
      input({
        payFrequency: 'semimonthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1375) }],
        ...mtState({ filingStatus: 'hoh' }),
      }),
    );
    assert.equal(amountOf(r, 'MT_SIT'), dollars(17));
  });

  test('both-spouses-working reuses the single/MFS table, not a fourth schedule', () => {
    // MFJ + bothSpousesWorking, semi-monthly $1,375 — MUST match the
    // single/MFS example ($33), NOT the MFJ/QSS example ($2), proving
    // resolveMTSchedule() actually redirects to single_mfs_bothWorking
    // rather than just relabeling the MFJ table.
    const r = calculatePaycheck(
      input({
        payFrequency: 'semimonthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1375) }],
        ...mtState({ filingStatus: 'mfj', bothSpousesWorking: true }),
      }),
    );
    assert.equal(amountOf(r, 'MT_SIT'), dollars(33));
  });

  test('no certificate defaults to single, matching Form MW-4\'s own stated fallback', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'semimonthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1375) }],
        workState: { code: 'MT' },
      }),
    );
    assert.equal(amountOf(r, 'MT_SIT'), dollars(33));
  });

  test('an unrecognized certificate.filingStatus throws', () => {
    assert.throws(
      () =>
        calculatePaycheck(
          input({
            payFrequency: 'weekly',
            earnings: [{ code: 'REG', category: 'regular', amount: dollars(475) }],
            ...mtState({ filingStatus: 'divorced' }),
          }),
        ),
      /Unrecognized MT certificate\.filingStatus/,
    );
  });

  test('MW-4 line 4 (specified withholding) fully replaces the bracket calculation', () => {
    // Same wages as the $33 example, but specifiedWithholding overrides it —
    // must produce $75, NOT $33, and must suppress the supplemental line too.
    const r = calculatePaycheck(
      input({
        payFrequency: 'semimonthly',
        earnings: [
          { code: 'REG', category: 'regular', amount: dollars(1375) },
          { code: 'BONUS', category: 'supplemental', amount: dollars(500) },
        ],
        ...mtState({ filingStatus: 'single', specifiedWithholding: dollars(75) }),
      }),
    );
    assert.equal(amountOf(r, 'MT_SIT'), dollars(75));
    assert.equal(r.taxes.some((t) => t.id === 'MT_SIT_SUPP'), false);
  });

  test('supplemental wages use flat 5% (Method 3), separate from the regular bracket line', () => {
    // Regular $1,375 semi-monthly (single) -> $33, same as the base example
    // since the regular line carves supplemental out of its own base.
    // Supplemental $500 x 5% = $25.
    const r = calculatePaycheck(
      input({
        payFrequency: 'semimonthly',
        earnings: [
          { code: 'REG', category: 'regular', amount: dollars(1375) },
          { code: 'BONUS', category: 'supplemental', amount: dollars(500) },
        ],
        ...mtState({ filingStatus: 'single' }),
      }),
    );
    assert.equal(amountOf(r, 'MT_SIT'), dollars(33));
    assert.equal(amountOf(r, 'MT_SIT_SUPP'), dollars(25));
  });

  test('reciprocity: a North Dakota resident working in Montana owes $0 MT income tax', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'semimonthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1375) }],
        residenceState: { code: 'ND' },
        ...mtState({ filingStatus: 'single' }),
      }),
    );
    assert.equal(amountOf(r, 'MT_SIT'), 0);
  });

  test('certificate.exempt (MW-4 line 5) zeroes MT_SIT generically, same mechanism as every other state', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(475) }],
        ...mtState({ filingStatus: 'single', exempt: true }),
      }),
    );
    assert.equal(amountOf(r, 'MT_SIT'), 0);
  });

  test('a quarterly pay frequency, which Montana does not publish a table for, throws rather than guessing', () => {
    assert.throws(
      () =>
        calculatePaycheck(
          input({
            payFrequency: 'quarterly',
            earnings: [{ code: 'REG', category: 'regular', amount: dollars(4000) }],
            ...mtState({ filingStatus: 'single' }),
          }),
        ),
      /don't publish a "quarterly" schedule/,
    );
  });
});

describe('New York', () => {
  // Expected values hand-derived from NYS-50-T-NYS's own worked examples and
  // published tables, same discipline as every other state. New York is the
  // first state in this project where the deduction/exemption allowance is a
  // single precomputed per-period/per-status/per-count lookup (Table A)
  // rather than a flat per-exemption multiplier, AND where the bracket table
  // itself is published separately per pay frequency with no annualization
  // step for ordinary earners — Method III (a flat rate on ANNUALIZED net
  // wages) only kicks in for very high earners.
  const nyState = (certificate: Record<string, unknown>) => ({
    workState: { code: 'NY', certificate },
  });

  test('NYS-50-T-NYS Example 1: weekly $400, single, 3 exemptions', () => {
    // Table A: $200.05. Net: 400-200.05=199.95. Weekly single bracket
    // 163-267 has TWO rows in the published table for that span (225 is a
    // sub-boundary) -- 199.95 falls in [163,225): base $0, rate 4.40%,
    // subtract $163. (199.95-163)*0.0440=1.6258 -> +6.38 base = $8.0058
    // -> $8.01 (the source's own stated answer).
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(400) }],
        ...nyState({ maritalStatus: 'single', exemptions: 3 }),
      }),
    );
    assert.equal(amountOf(r, 'NY_SIT'), dollars(8.01));
  });

  test('NYS-50-T-NYS Example 2: semimonthly $5,000, single, 1 exemption', () => {
    // Table A: $350.00. Net: 5,000-350=4,650. Falls in [4,485,6,569): base
    // $246.08, rate 7.53%, subtract $4,485. (4,650-4,485)*0.0753=12.4245 ->
    // nearest-cent rounds to $12.42, not $12.43 (12.4245 is below the
    // 12.425 halfway point) -> +246.08 = $258.50.
    //
    // NYS-50-T-NYS's OWN printed example states $12.43 and a final $258.51
    // -- a genuine $0.01 rounding slip in the SOURCE's own worked example
    // (165.00 x 0.0753 = 12.4245 rounds to 12.42 under ordinary nearest-cent
    // rounding, not 12.43), the same category of source imprecision already
    // documented and corrected for in this project (Kentucky's biweekly
    // example: 'corrected to $47.98 from the source's own truncated $47').
    // Verified two independent ways this session: by hand, and by NOT
    // rounding the intermediate step at all (165x0.0753=12.4245, +246.08=
    // 258.5045, which itself rounds to $258.50, not $258.51 either way).
    // This engine computes the mathematically correct $258.50.
    const r = calculatePaycheck(
      input({
        payFrequency: 'semimonthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(5000) }],
        ...nyState({ maritalStatus: 'single', exemptions: 1 }),
      }),
    );
    assert.equal(amountOf(r, 'NY_SIT'), dollars(258.50));
  });

  test('NYS-50-T-NYS Example 3: monthly $50,000, single, 3 exemptions', () => {
    // Table A: $866.60. Net: 50,000-866.60=49,133.40. Falls in
    // [22,117,89,796): base $1,590.92, rate 7.35%, subtract $22,117.
    // (49,133.40-22,117)*0.0735=1,985.7057 -> +1,590.92 = $3,576.6257 ->
    // $3,576.63 (the source's own stated answer).
    const r = calculatePaycheck(
      input({
        payFrequency: 'monthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(50000) }],
        ...nyState({ maritalStatus: 'single', exemptions: 3 }),
      }),
    );
    assert.equal(amountOf(r, 'NY_SIT'), dollars(3576.63));
  });

  test('NYS-50-T-NYS Example 4: daily $750, single, 2 exemptions', () => {
    // Table A: $36.15. Net: 750-36.15=713.85. Falls in [606,828): base
    // $37.20, rate 6.40%, subtract $606. (713.85-606)*0.0640=6.9024 ->
    // +37.20 = $44.1024 -> $44.10 (the source's own stated answer).
    const r = calculatePaycheck(
      input({
        payFrequency: 'daily',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(750) }],
        ...nyState({ maritalStatus: 'single', exemptions: 2 }),
      }),
    );
    assert.equal(amountOf(r, 'NY_SIT'), dollars(44.10));
  });

  test('married uses a genuinely different schedule than single, not just a relabeled one', () => {
    // Weekly $2,000, married, 2 exemptions. Table A (married, weekly, 2
    // exemptions): $191.40. Net: 2,000-191.40=1,808.60. Married weekly
    // bracket [1,551,1,862): base $80.58, rate 5.90%, subtract $1,551.
    // (1,808.60-1,551)*0.0590=15.1994 -> +80.58 = $95.7794 -> $95.78.
    // (The SINGLE schedule's [1,551,1,862) row has the same rate/base by
    // coincidence at this particular bracket, so this fixture deliberately
    // does NOT prove schedule divergence by itself -- see the next test for
    // that proof instead, at a bracket where the two schedules genuinely
    // differ.)
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2000) }],
        ...nyState({ maritalStatus: 'married', exemptions: 2 }),
      }),
    );
    assert.equal(amountOf(r, 'NY_SIT'), dollars(95.78));
  });

  test('married and single schedules genuinely diverge at a higher bracket', () => {
    // Weekly $4,500, single vs married, 0 exemptions each -- picked
    // specifically because single's [4,142,5,104) bracket (11.44% off a
    // $257.10 base) and married's [4,068,6,215) bracket (6.40% off a
    // $263.62 base) cover this wage differently.
    // Single: Table A(single,weekly,0)=$142.30. Net=4,500-142.30=4,357.70.
    // Falls in single's [4,142,5,104): base $257.10, rate 11.44%, subtract
    // $4,142. Excess=$215.70; 21570 cents x 0.1144=2467.608 cents, rounds to
    // 2468 cents ($24.68) at THIS step (the engine rounds each applyRate()
    // call, not just the final sum) -> +$257.10 = $281.78.
    // Married: Table A(married,weekly,0)=$152.90. Net=4,500-152.90=4,347.10.
    // Falls in married's [4,068,6,215): base $263.62, rate 6.40%, subtract
    // $4,068. Excess=$279.10; 27910 cents x 0.0640=1786.24, rounds to 1786
    // cents ($17.86) -> +$263.62 = $281.48. Genuinely different from
    // single's $281.78, proving the two schedules are not the same table
    // under a different label.
    const rSingle = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(4500) }],
        ...nyState({ maritalStatus: 'single', exemptions: 0 }),
      }),
    );
    const rMarried = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(4500) }],
        ...nyState({ maritalStatus: 'married', exemptions: 0 }),
      }),
    );
    assert.equal(amountOf(rSingle, 'NY_SIT'), dollars(281.78));
    assert.equal(amountOf(rMarried, 'NY_SIT'), dollars(281.48));
  });

  test("third checkbox ('married_withhold_at_higher_single_rate' via 'married_withhold_as_single') resolves to the SINGLE schedule", () => {
    // Same $4,500/week, 0 exemptions as the single case above -- proves the
    // third checkbox maps correctly, not a NEW number.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(4500) }],
        ...nyState({ maritalStatus: 'married_withhold_as_single', exemptions: 0 }),
      }),
    );
    assert.equal(amountOf(r, 'NY_SIT'), dollars(281.78));
  });

  test('an unrecognized certificate.maritalStatus throws instead of silently defaulting to single', () => {
    assert.throws(
      () =>
        calculatePaycheck(
          input({
            earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
            ...nyState({ maritalStatus: 'divorced', exemptions: 0 }),
          }),
        ),
      /Unrecognized NY certificate\.maritalStatus/,
    );
  });

  test('more than 10 exemptions extrapolates linearly from Table A, per NY\'s own Table B+C method', () => {
    // Weekly $400, single, 11 exemptions. Table A only publishes 0-10;
    // index 10 is $334.80, index 9 is $315.55, a $19.25 per-exemption
    // increment confirmed constant across the whole published table.
    // Allowance(11) = 334.80 + 19.25*(11-10) = $354.05. Net = 400-354.05=
    // $45.95 -> falls in [0,163): base $0, rate 3.90%. 45.95*0.039=1.79205
    // -> $1.79.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(400) }],
        ...nyState({ maritalStatus: 'single', exemptions: 11 }),
      }),
    );
    assert.equal(amountOf(r, 'NY_SIT'), dollars(1.79));
  });

  test('a negative exemptions count throws rather than silently reading a nonsense index', () => {
    assert.throws(
      () =>
        calculatePaycheck(
          input({
            earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
            ...nyState({ maritalStatus: 'single', exemptions: -1 }),
          }),
        ),
      /non-negative integer/,
    );
  });

  test('nonresidentAlien flag has NO effect on NY -- unlike Minnesota, NY has no sourced NRA instruction to apply', () => {
    // Same $605/wk single 0-exemption base as the ordinary case, WITH
    // certificate.nonresidentAlien:true set. Deliberately proves this flag
    // is a no-op for New York: neither NYS-50-T-NYS nor IT-2104 mentions
    // nonresident aliens anywhere, so this engine does NOT apply Minnesota's
    // Pub 15-T Table 2 adjustment here — doing so without an NY-specific
    // source would risk a confidently-wrong number. Ordinary calculation:
    // Table A (single,weekly,0)=$142.30. Net=605-142.30=462.70 -> falls in
    // [267,1551): base $11.27, rate 5.40%. (462.70-267)*0.0540=10.5678 ->
    // +11.27 = $21.8378 -> $21.84.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(605) }],
        ...nyState({ maritalStatus: 'single', exemptions: 0, nonresidentAlien: true }),
      }),
    );
    assert.equal(amountOf(r, 'NY_SIT'), dollars(21.84));
  });

  test('Method III: a very high weekly wage triggers the flat-rate-on-annualized-wages fallback', () => {
    // Weekly $21,000, single, 0 exemptions. Table A: $142.30. Net:
    // 21,000-142.30=20,857.70 -- ABOVE single's top bounded bracket
    // ($20,722), so Method III applies. Annualized: 20,857.70*52=
    // 1,084,600.40 -- falls in Method III's first single tier
    // ($1,077,550-$5,000,000 @ 10.45%). Annual tax: 1,084,600.40*0.1045=
    // 113,340.7418 -> $113,340.74. Per-week: 113,340.74/52=2,179.6296...
    // -> $2,179.63.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(21000) }],
        ...nyState({ maritalStatus: 'single', exemptions: 0 }),
      }),
    );
    assert.equal(amountOf(r, 'NY_SIT'), dollars(2179.63));
  });

  test('supplemental wages use New York\'s flat 11.70% rate, separate from the regular-wages bracket lookup', () => {
    // Biweekly $2,000 regular + $1,000 bonus, single, 2 exemptions.
    // Regular line excludes the bonus from its own base: Table A
    // (single,biweekly,2)=$361.60. Net=2,000-361.60=1,638.40. Falls in
    // [535,3,102): base $22.54, rate 5.40%, subtract $535.
    // (1,638.40-535)*0.0540=59.5836 -> +22.54 = $82.1236 -> $82.12.
    // Supplemental line: 1,000*11.70%=$117.00 flat, no bracket lookup.
    const r = calculatePaycheck(
      input({
        payFrequency: 'biweekly',
        earnings: [
          { code: 'REG', category: 'regular', amount: dollars(2000) },
          { code: 'BONUS', category: 'supplemental', amount: dollars(1000) },
        ],
        ...nyState({ maritalStatus: 'single', exemptions: 2 }),
      }),
    );
    assert.equal(amountOf(r, 'NY_SIT'), dollars(82.12));
    assert.equal(amountOf(r, 'NY_SIT_SUPP'), dollars(117.00));
  });

  test('no supplemental line at all when there is no supplemental income', () => {
    const r = calculatePaycheck(
      input(nyState({ maritalStatus: 'single', exemptions: 0 })),
    );
    assert.equal(r.taxes.some((t) => t.id === 'NY_SIT_SUPP'), false);
  });

  test('zero wages after the allowance is subtracted withholds $0, not negative', () => {
    // Weekly $100, single, 5 exemptions. Table A (single,weekly,5)=$238.55,
    // which exceeds the $100 gross wage entirely.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(100) }],
        ...nyState({ maritalStatus: 'single', exemptions: 5 }),
      }),
    );
    assert.equal(amountOf(r, 'NY_SIT'), 0);
  });
});

describe('New York City', () => {
  // Expected values reproduce NYS-50-T-NYC's own 8 worked examples (4
  // single, 4 married) exactly, same discipline as every other state. NYC
  // is a genuine LOCAL tax (jurisdiction:'local') layered on NY_SIT, only
  // computed for certificate.nycResident:true.
  const nycState = (certificate: Record<string, unknown>) => ({
    workState: { code: 'NY', certificate: { ...certificate, nycResident: true } },
  });

  test('NYS-50-T-NYC Example 1 (single): weekly $400, single, 3 exemptions', () => {
    // Table A: $153.90. Net: 400-153.90=246.10. Falls in [167,288): base
    // $3.54, rate 3.25%, subtract $167. (246.10-167)*0.0325=2.57 -> +3.54
    // = $6.11 (the source's own stated answer).
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(400) }],
        ...nycState({ maritalStatus: 'single', exemptions: 3 }),
      }),
    );
    assert.equal(amountOf(r, 'NY_NYC_SIT'), dollars(6.11));
  });

  test('NYS-50-T-NYC Example 2 (single): semimonthly $5,000, single, 1 exemption', () => {
    // Table A: $250.00. Net: 5,000-250=4,750. Falls in [2,500,null): base
    // $93.17, rate 4.25%, subtract $2,500. (4,750-2,500)*0.0425=95.625 ->
    // rounds to $95.63 -> +93.17 = $188.80 (the source's own stated answer).
    const r = calculatePaycheck(
      input({
        payFrequency: 'semimonthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(5000) }],
        ...nycState({ maritalStatus: 'single', exemptions: 1 }),
      }),
    );
    assert.equal(amountOf(r, 'NY_NYC_SIT'), dollars(188.80));
  });

  test('NYS-50-T-NYC Example 3 (single): monthly $50,000, single, 3 exemptions', () => {
    // Table A: $666.60. Net: 50,000-666.60=49,333.40. Falls in [5,000,null):
    // base $186.33, rate 4.25%, subtract $5,000.
    // (49,333.40-5,000)*0.0425=1,884.169 -> $1,884.17 -> +186.33 = $2,070.50
    // (the source's own stated answer).
    const r = calculatePaycheck(
      input({
        payFrequency: 'monthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(50000) }],
        ...nycState({ maritalStatus: 'single', exemptions: 3 }),
      }),
    );
    assert.equal(amountOf(r, 'NY_NYC_SIT'), dollars(2070.50));
  });

  test('NYS-50-T-NYC Example 4 (single): daily $750, single, 2 exemptions', () => {
    // Table A: $26.95. Net: 750-26.95=723.05. Falls in [231,null): base
    // $8.60, rate 4.25%, subtract $231. (723.05-231)*0.0425=20.9096 ->
    // rounds to $20.91 -> +8.60 = $29.51 (the source's own stated answer).
    const r = calculatePaycheck(
      input({
        payFrequency: 'daily',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(750) }],
        ...nycState({ maritalStatus: 'single', exemptions: 2 }),
      }),
    );
    assert.equal(amountOf(r, 'NY_NYC_SIT'), dollars(29.51));
  });

  test('NYS-50-T-NYC Example 1 (married): weekly $400, married, 4 exemptions', () => {
    // Table A: $182.75. Net: 400-182.75=217.25. Falls in [167,288): base
    // $3.54, rate 3.25%, subtract $167. (217.25-167)*0.0325=1.633125 ->
    // rounds to $1.63 -> +3.54 = $5.17 (the source's own stated answer).
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(400) }],
        ...nycState({ maritalStatus: 'married', exemptions: 4 }),
      }),
    );
    assert.equal(amountOf(r, 'NY_NYC_SIT'), dollars(5.17));
  });

  test('NYS-50-T-NYC Example 2 (married): semimonthly $5,000, married, 3 exemptions', () => {
    // Table A: $354.10. Net: 5,000-354.10=4,645.90. Falls in [2,500,null):
    // base $93.17, rate 4.25%, subtract $2,500.
    // (4,645.90-2,500)*0.0425=91.19075 -> rounds to $91.20 (source's own
    // rounding) -> +93.17 = $184.37 (the source's own stated answer).
    const r = calculatePaycheck(
      input({
        payFrequency: 'semimonthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(5000) }],
        ...nycState({ maritalStatus: 'married', exemptions: 3 }),
      }),
    );
    assert.equal(amountOf(r, 'NY_NYC_SIT'), dollars(184.37));
  });

  test('NYS-50-T-NYC Example 3 (married): monthly $50,000, married, 3 exemptions', () => {
    // Table A: $708.20. Net: 50,000-708.20=49,291.80. Falls in [5,000,null):
    // base $186.33, rate 4.25%, subtract $5,000.
    // (49,291.80-5,000)*0.0425=1,882.4015 -> rounds to $1,882.40 -> +186.33
    // = $2,068.73 (the source's own stated answer).
    const r = calculatePaycheck(
      input({
        payFrequency: 'monthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(50000) }],
        ...nycState({ maritalStatus: 'married', exemptions: 3 }),
      }),
    );
    assert.equal(amountOf(r, 'NY_NYC_SIT'), dollars(2068.73));
  });

  test('NYS-50-T-NYC Example 4 (married): daily $750, married, 2 exemptions', () => {
    // Table A: $28.85. Net: 750-28.85=721.15. Falls in [231,null): base
    // $8.60, rate 4.25%, subtract $231. (721.15-231)*0.0425=20.83375 ->
    // rounds to $20.83 -> +8.60 = $29.43 (the source's own stated answer).
    const r = calculatePaycheck(
      input({
        payFrequency: 'daily',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(750) }],
        ...nycState({ maritalStatus: 'married', exemptions: 2 }),
      }),
    );
    assert.equal(amountOf(r, 'NY_NYC_SIT'), dollars(29.43));
  });

  test('NYC brackets are shared between single and married -- proof, not assumption', () => {
    // Same $2,000 weekly wage and 0 exemptions for both statuses, but
    // DIFFERENT Table A allowances (single $96.15 vs married $105.75), so
    // the two lines land on genuinely different net wages while running
    // through the exact same bracket table. Single: net=2,000-96.15=
    // 1,903.85 -> [1,154,null): base $43.00, rate 4.25%.
    // (1,903.85-1,154)*0.0425=31.867625 -> $31.87 -> +43.00=$74.87.
    // Married: net=2,000-105.75=1,894.25 -> SAME bracket [1,154,null).
    // (1,894.25-1,154)*0.0425=31.455625 -> $31.46 -> +43.00=$74.46.
    const rSingle = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2000) }],
        ...nycState({ maritalStatus: 'single', exemptions: 0 }),
      }),
    );
    const rMarried = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2000) }],
        ...nycState({ maritalStatus: 'married', exemptions: 0 }),
      }),
    );
    assert.equal(amountOf(rSingle, 'NY_NYC_SIT'), dollars(74.87));
    assert.equal(amountOf(rMarried, 'NY_NYC_SIT'), dollars(74.46));
  });

  test('no NY_NYC_SIT line at all when certificate.nycResident is not set', () => {
    const r = calculatePaycheck(
      input({
        workState: { code: 'NY', certificate: { maritalStatus: 'single', exemptions: 0 } },
      }),
    );
    assert.equal(r.taxes.some((t) => t.id === 'NY_NYC_SIT'), false);
    assert.equal(r.taxes.some((t) => t.id === 'NY_NYC_SIT_SUPP'), false);
  });

  test('supplemental wages use NYC\'s flat 4.25% rate, separate from the regular-wages bracket lookup', () => {
    // Biweekly $2,000 regular + $1,000 bonus, single, 2 exemptions.
    // Regular line excludes the bonus: Table A (single,biweekly,2)=
    // $269.30. Net=2,000-269.30=1,730.70 -> falls in [962,2308): base
    // $30.12, rate 4.15%, subtract $962. (1,730.70-962)*0.0415=31.90105 ->
    // rounds to $31.90 -> +30.12 = $62.02.
    // Supplemental line: 1,000*4.25%=$42.50 flat.
    const r = calculatePaycheck(
      input({
        payFrequency: 'biweekly',
        earnings: [
          { code: 'REG', category: 'regular', amount: dollars(2000) },
          { code: 'BONUS', category: 'supplemental', amount: dollars(1000) },
        ],
        ...nycState({ maritalStatus: 'single', exemptions: 2 }),
      }),
    );
    assert.equal(amountOf(r, 'NY_NYC_SIT'), dollars(62.02));
    assert.equal(amountOf(r, 'NY_NYC_SIT_SUPP'), dollars(42.50));
  });

  test('nycExemptions overrides the shared exemptions count when the two genuinely differ', () => {
    // Weekly $400, single, certificate.exemptions:3 (NYS/Yonkers) but
    // certificate.nycExemptions:1 (a genuinely different Line-2 count).
    // NY_SIT should use 3 (from Example 1: $8.01 — already proven above),
    // NY_NYC_SIT should use 1: Table A (single,weekly,1)=$115.40.
    // Net=400-115.40=284.60 -> falls in [167,288): base $3.54, rate 3.25%.
    // (284.60-167)*0.0325=3.8220 -> $3.82 -> +3.54=$7.36.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(400) }],
        ...nycState({ maritalStatus: 'single', exemptions: 3, nycExemptions: 1 }),
      }),
    );
    assert.equal(amountOf(r, 'NY_SIT'), dollars(8.01));
    assert.equal(amountOf(r, 'NY_NYC_SIT'), dollars(7.36));
  });

  test('additionalWithholdingNYC (IT-2104 Line 4) adds a flat per-period amount, distinct from NYS Line 3', () => {
    // Same wages as Example 1 (weekly $400, single, 3 exemptions -> $6.11
    // base), with certificate.additionalWithholdingNYC:dollars(10) AND
    // certificate.additionalWithholding:dollars(5) (NYS's own Line 3) set
    // simultaneously, proving the two amounts land on the correct SEPARATE
    // lines rather than one overwriting or double-applying to the other.
    // NY_SIT: $8.01 (single/weekly/3-exemptions base) + $5.00 = $13.01.
    // NY_NYC_SIT: $6.11 (Example 1 base) + $10.00 = $16.11.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(400) }],
        ...nycState({
          maritalStatus: 'single',
          exemptions: 3,
          additionalWithholding: dollars(5),
          additionalWithholdingNYC: dollars(10),
        }),
      }),
    );
    assert.equal(amountOf(r, 'NY_SIT'), dollars(13.01));
    assert.equal(amountOf(r, 'NY_NYC_SIT'), dollars(16.11));
  });

  test('no additionalWithholdingNYC applied when unset -- no silent phantom charge', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(400) }],
        ...nycState({ maritalStatus: 'single', exemptions: 3 }),
      }),
    );
    assert.equal(amountOf(r, 'NY_NYC_SIT'), dollars(6.11));
  });
});

describe('Yonkers', () => {
  // Resident surcharge examples reproduce NYS-50-T-Y's own 4 worked
  // examples, each literally "take NYS's own example answer and multiply by
  // 16.75%". Nonresident examples reproduce NYS-50-T-Y's own 3 worked
  // examples for that separate, structurally different tax.
  const residentState = (certificate: Record<string, unknown>) => ({
    workState: { code: 'NY', certificate: { ...certificate, yonkersResident: true } },
  });
  const nonresidentWorkerState = (certificate: Record<string, unknown>) => ({
    workState: { code: 'NY', certificate: { ...certificate, yonkersNonresidentWorker: true } },
  });

  test('resident surcharge Example 1: weekly $400, single, 3 exemptions', () => {
    // NYS base tax (proven elsewhere) = $8.01. x 16.75% = $1.34155 -> $1.34
    // (the source's own stated answer).
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(400) }],
        ...residentState({ maritalStatus: 'single', exemptions: 3 }),
      }),
    );
    assert.equal(amountOf(r, 'NY_YONKERS_SIT'), dollars(1.34));
  });

  test('resident surcharge Example 2: semimonthly $5,000, single, 1 exemption', () => {
    // NYS base tax (this engine's OWN corrected value, $258.50, not the
    // source's slightly-off $258.51 -- see the New York describe block's
    // Example 2 note) x 16.75% = $43.30375 -> $43.30, which happens to
    // match the source's own stated Yonkers answer exactly regardless of
    // the 1-cent NYS-level difference.
    const r = calculatePaycheck(
      input({
        payFrequency: 'semimonthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(5000) }],
        ...residentState({ maritalStatus: 'single', exemptions: 1 }),
      }),
    );
    assert.equal(amountOf(r, 'NY_YONKERS_SIT'), dollars(43.30));
  });

  test('resident surcharge Example 3: monthly $50,000, single, 3 exemptions -- corrects a SECOND source arithmetic slip', () => {
    // NYS base tax (proven elsewhere) = $3,576.63 exactly, matching the
    // source's own NYS example precisely. $3,576.63 x 0.1675 = 599.085525
    // precisely -- which rounds to $599.09 under ordinary nearest-cent
    // rounding (599.0855... is past the 599.085 halfway point), NOT the
    // source's own stated $599.08. This is a SECOND independent arithmetic
    // slip found in New York's own published examples this project
    // (alongside NYS-50-T-NYS's own Example 2, $258.51 vs the correct
    // $258.50) -- verified by hand before trusting the engine's answer over
    // the printed one, same discipline both times.
    const r = calculatePaycheck(
      input({
        payFrequency: 'monthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(50000) }],
        ...residentState({ maritalStatus: 'single', exemptions: 3 }),
      }),
    );
    assert.equal(amountOf(r, 'NY_YONKERS_SIT'), dollars(599.09));
  });

  test('resident surcharge Example 4: daily $750, single, 2 exemptions', () => {
    // NYS base tax (proven elsewhere) = $44.10. x 16.75% = $7.38675 ->
    // $7.39 (the source's own stated answer).
    const r = calculatePaycheck(
      input({
        payFrequency: 'daily',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(750) }],
        ...residentState({ maritalStatus: 'single', exemptions: 2 }),
      }),
    );
    assert.equal(amountOf(r, 'NY_YONKERS_SIT'), dollars(7.39));
  });

  test('resident supplemental wages use 1.95975% flat, confirmed equal to 11.70% x 16.75%', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [
          { code: 'REG', category: 'regular', amount: dollars(400) },
          { code: 'BONUS', category: 'supplemental', amount: dollars(1000) },
        ],
        ...residentState({ maritalStatus: 'single', exemptions: 3 }),
      }),
    );
    // 1,000 x 0.0195975 = 19.5975 -> $19.60.
    assert.equal(amountOf(r, 'NY_YONKERS_SIT_SUPP'), dollars(19.60));
  });

  test('nonresident worker Example 1: weekly $75 -- below the no-withholding threshold', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(75) }],
        ...nonresidentWorkerState({}),
      }),
    );
    assert.equal(amountOf(r, 'NY_YONKERS_SIT'), 0);
  });

  test('nonresident worker Example 2: weekly $200', () => {
    // Falls in [192,385): exemption $38. (200-38)*0.0050=$0.81 (the
    // source's own stated answer).
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(200) }],
        ...nonresidentWorkerState({}),
      }),
    );
    assert.equal(amountOf(r, 'NY_YONKERS_SIT'), dollars(0.81));
  });

  test('nonresident worker Example 3: semimonthly $400', () => {
    // Falls in [167,417): exemption $125. (400-125)*0.0050=$1.375 -> $1.38
    // (the source's own stated answer -- exact half-cent, rounds up).
    const r = calculatePaycheck(
      input({
        payFrequency: 'semimonthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(400) }],
        ...nonresidentWorkerState({}),
      }),
    );
    assert.equal(amountOf(r, 'NY_YONKERS_SIT'), dollars(1.38));
  });

  test('nonresident worker: wages at/above the top tier get zero exemption', () => {
    // Weekly $1,000 -- above the $577 top-tier threshold, exemption=$0.
    // 1,000 x 0.0050 = $5.00 exactly.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...nonresidentWorkerState({}),
      }),
    );
    assert.equal(amountOf(r, 'NY_YONKERS_SIT'), dollars(5.00));
  });

  test('nonresident worker supplemental wages use the same flat 0.50% as regular wages', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [
          { code: 'REG', category: 'regular', amount: dollars(1000) },
          { code: 'BONUS', category: 'supplemental', amount: dollars(1000) },
        ],
        ...nonresidentWorkerState({}),
      }),
    );
    assert.equal(amountOf(r, 'NY_YONKERS_SIT'), dollars(5.00));
    assert.equal(amountOf(r, 'NY_YONKERS_SIT_SUPP'), dollars(5.00));
  });

  test('no Yonkers line at all when neither yonkersResident nor yonkersNonresidentWorker is set', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(400) }],
        workState: { code: 'NY', certificate: { maritalStatus: 'single', exemptions: 3 } },
      }),
    );
    assert.equal(r.taxes.some((t) => t.id === 'NY_YONKERS_SIT'), false);
    assert.equal(r.taxes.some((t) => t.id === 'NY_YONKERS_SIT_SUPP'), false);
  });

  test('resident status wins if a caller somehow sets both flags at once', () => {
    // Same wages as resident Example 1 ($1.34) -- if nonresident logic won
    // instead, this would compute a completely different flat-0.50%-based
    // number.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(400) }],
        workState: {
          code: 'NY',
          certificate: {
            maritalStatus: 'single',
            exemptions: 3,
            yonkersResident: true,
            yonkersNonresidentWorker: true,
          },
        },
      }),
    );
    assert.equal(amountOf(r, 'NY_YONKERS_SIT'), dollars(1.34));
  });

  test('additionalWithholdingYonkers (IT-2104 Line 5) adds a flat amount for RESIDENTS, distinct from Lines 3/4', () => {
    // Same wages as resident Example 1 ($1.34 base), plus
    // certificate.additionalWithholdingYonkers:dollars(5) AND
    // certificate.additionalWithholding:dollars(2) (NYS's own Line 3) set
    // simultaneously, proving the two land on separate lines.
    // NY_SIT: $8.01 + $2.00 = $10.01. NY_YONKERS_SIT: $1.34 + $5.00 = $6.34.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(400) }],
        ...residentState({
          maritalStatus: 'single',
          exemptions: 3,
          additionalWithholding: dollars(2),
          additionalWithholdingYonkers: dollars(5),
        }),
      }),
    );
    assert.equal(amountOf(r, 'NY_SIT'), dollars(10.01));
    assert.equal(amountOf(r, 'NY_YONKERS_SIT'), dollars(6.34));
  });

  test('additionalWithholdingYonkers applies for NONRESIDENT WORKERS too, including when wages are below the threshold', () => {
    // Weekly $75 -- normally $0 (below the no-withholding floor) -- plus
    // $2.00 requested extra should still show up: Line 5 is an employee
    // request, not conditioned on the formula's own result.
    const rBelowThreshold = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(75) }],
        ...nonresidentWorkerState({ additionalWithholdingYonkers: dollars(2) }),
      }),
    );
    assert.equal(amountOf(rBelowThreshold, 'NY_YONKERS_SIT'), dollars(2.00));

    // Weekly $200 -- normally $0.81 (Example 2) -- plus $3.00 requested
    // extra = $3.81.
    const rTaxable = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(200) }],
        ...nonresidentWorkerState({ additionalWithholdingYonkers: dollars(3) }),
      }),
    );
    assert.equal(amountOf(rTaxable, 'NY_YONKERS_SIT'), dollars(3.81));
  });
});

describe('New York Paid Family Leave (employee)', () => {
  test('0.432% of wages, no cap in play', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'NY', certificate: { maritalStatus: 'single', exemptions: 0 } },
      }),
    );
    // 1,000 x 0.00432 = $4.32.
    assert.equal(amountOf(r, 'NY_PFML_EE'), dollars(4.32));
  });

  test('caps at the annual wage base ($95,348.76 = 52 x 2026 NYSAWW) using YTD, not just the current cheque', () => {
    // $95,000 already counted YTD, $1,000 more this week -- only $348.76 of
    // room remains under the cap.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'NY', certificate: { maritalStatus: 'single', exemptions: 0 } },
        ytd: {
          socialSecurity: 0,
          medicare: 0,
          futa: 0,
          statePaidLeave: { NY: dollars(95000) },
        },
      }),
    );
    // Room: 95,348.76 - 95,000 = 348.76. 348.76 x 0.00432 = 1.5066432 -> $1.51.
    assert.equal(amountOf(r, 'NY_PFML_EE'), dollars(1.51));
  });

  test('runs even when NY income tax is $0 via reciprocity -- separate statute, separate levy', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        residenceState: { code: 'CA' },
        workState: { code: 'NY', certificate: { maritalStatus: 'single', exemptions: 0 } },
      }),
    );
    // NY has no reciprocity with any state (confirmed elsewhere), so this
    // doesn't actually zero NY_SIT -- included anyway as a structural check
    // that PFL is dispatched unconditionally, matching every other state's
    // employee-paid program in this project.
    assert.equal(amountOf(r, 'NY_PFML_EE'), dollars(4.32));
  });

  test('computed on GROSS wages -- a section125 pretax deduction does NOT reduce the PFL base, unlike NY_SIT', () => {
    // Weekly $1,000 regular wages, $200 section125 deduction. NY_SIT's own
    // base excludes the $200 (NYS income tax's exemptPretax list includes
    // section125), but PFL's cfg.exemptPretax override is an EMPTY array --
    // per Notice N-17-12 ('after-tax wages') and paidfamilyleave.ny.gov's
    // own 'gross wages' framing -- so PFL is computed on the FULL $1,000,
    // not the $800 net-of-cafeteria-plan figure. 1,000 x 0.00432 = $4.32,
    // the SAME answer as the no-deduction case above, proving the deduction
    // had zero effect on this specific line.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        deductions: [{ code: 'MED', category: 'section125', amount: dollars(200) }],
        workState: { code: 'NY', certificate: { maritalStatus: 'single', exemptions: 0 } },
      }),
    );
    assert.equal(amountOf(r, 'NY_PFML_EE'), dollars(4.32));
  });
});

describe('New York Disability Benefits Law (employee)', () => {
  test('0.5% of wages, below the weekly cap', () => {
    // Weekly $100 -- 0.5% = $0.50, below the $0.60/week cap.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(100) }],
        workState: { code: 'NY', certificate: { maritalStatus: 'single', exemptions: 0 } },
      }),
    );
    assert.equal(amountOf(r, 'NY_DBL_EE'), dollars(0.50));
  });

  test('caps at $0.60/week once wages exceed the implicit $120/week threshold', () => {
    // Weekly $1,000 -- 0.5% would be $5.00, but the weekly cap holds it at
    // $0.60 (0.5% x $120 = $0.60 is where the cap threshold sits).
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'NY', certificate: { maritalStatus: 'single', exemptions: 0 } },
      }),
    );
    assert.equal(amountOf(r, 'NY_DBL_EE'), dollars(0.60));
  });

  test('the weekly cap scales by pay frequency -- biweekly gets $1.20, not $0.60', () => {
    // A per-period cap that resets each period, unlike PFL's annual YTD
    // cap above -- proving this genuinely different cap shape works.
    // Biweekly $2,000: 0.5% = $10.00, capped at 2 weeks x $0.60 = $1.20.
    const r = calculatePaycheck(
      input({
        payFrequency: 'biweekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2000) }],
        workState: { code: 'NY', certificate: { maritalStatus: 'single', exemptions: 0 } },
      }),
    );
    assert.equal(amountOf(r, 'NY_DBL_EE'), dollars(1.20));
  });

  test('the monthly cap scales to roughly 4.33 weeks, not a round dollar figure', () => {
    // Monthly $10,000: 0.5% = $50.00, capped at (52/12) x $0.60 =
    // 4.333... x $0.60 = $2.6 (2.60 exactly: 52/12*60=260 cents).
    const r = calculatePaycheck(
      input({
        payFrequency: 'monthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(10000) }],
        workState: { code: 'NY', certificate: { maritalStatus: 'single', exemptions: 0 } },
      }),
    );
    assert.equal(amountOf(r, 'NY_DBL_EE'), dollars(2.60));
  });

  test('also computed on GROSS wages -- a 401(k) deferral does not reduce the DBL base either', () => {
    // Weekly $100 regular wages, $30 401(k) deferral. If DBL read the net-
    // of-deferral $70 base, 0.5% would be $0.35 -- instead it stays $0.50
    // (0.5% of the full $100), proving the same gross-wages override
    // applies to DBL as PFL.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(100) }],
        deductions: [{ code: '401K', category: 'deferral_401k', amount: dollars(30) }],
        workState: { code: 'NY', certificate: { maritalStatus: 'single', exemptions: 0 } },
      }),
    );
    assert.equal(amountOf(r, 'NY_DBL_EE'), dollars(0.50));
  });
});

describe('New Jersey', () => {
  // Expected values hand-derived from NJ-WT's own Rate Table A/B weekly and
  // biweekly schedules (see data/states/NJ-2026.json's $extractionNote for
  // how those tables were reconstructed and cross-checked against NJ-WT's
  // own published per-period base figures) BEFORE the code was run, same
  // discipline as every other state file. No official worked example exists
  // in NJ-WT itself (that section of the PDF is an unextractable image), so
  // these are hand bracket-lookups, not reproductions of a published example
  // — disclosed here rather than presented as matching a source's own
  // worked arithmetic the way Kentucky/Wisconsin/Minnesota's tests do.

  test('Rate A (default, no certificate), weekly $1,000, 0 exemptions', () => {
    // $1,000 falls in the $769-$1,442 bracket: base $15.29 + 6.1% of
    // ($1,000-$769=$231) = $15.29 + $14.091 = $29.381 -> $29.38.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'NJ' },
      }),
    );
    assert.equal(amountOf(r, 'NJ_SIT'), dollars(29.38));
  });

  test('exemptions reduce the base before the SAME bracket lookup', () => {
    // 2 exemptions x $19.20/week = $38.40 allowance. $1,000 - $38.40 =
    // $961.60, still in the $769-$1,442 bracket: $15.29 + 6.1% of
    // ($961.60-$769=$192.60) = $15.29 + $11.7486 = $27.0386 -> $27.04.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'NJ', certificate: { exemptions: 2 } },
      }),
    );
    assert.equal(amountOf(r, 'NJ_SIT'), dollars(27.04));
  });

  test('filingStatus mfj/hoh/qw selects Rate Table B, not A', () => {
    // $1,000 falls in Rate B's $962-$1,346 bracket: base $17.31 + 2.7% of
    // ($1,000-$962=$38) = $17.31 + $1.026 = $18.336 -> $18.34.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'NJ', certificate: { filingStatus: 'mfj' } },
      }),
    );
    assert.equal(amountOf(r, 'NJ_SIT'), dollars(18.34));
  });

  test('certificate.rateTableOverride (NJ-W4 Line 3) picks a specific table directly', () => {
    // Same $1,000 weekly wage, but the employee selected Rate B on Line 3
    // despite an otherwise Rate-A-selecting single filing status.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'NJ', certificate: { filingStatus: 'single', rateTableOverride: 'B' } },
      }),
    );
    assert.equal(amountOf(r, 'NJ_SIT'), dollars(18.34));
  });

  test('biweekly $3,000 (the shared default paycheck), Rate A, 0 exemptions', () => {
    // $3,000 falls in Rate A biweekly's $2,885-$19,231 bracket: base
    // $112.69 + 7.0% of ($3,000-$2,885=$115) = $112.69 + $8.05 = $120.74.
    const r = calculatePaycheck(input({ workState: { code: 'NJ' } }));
    assert.equal(amountOf(r, 'NJ_SIT'), dollars(120.74));
  });

  test('reciprocity: a Pennsylvania resident working in NJ owes $0 NJ income tax', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        residenceState: { code: 'PA' },
        workState: { code: 'NJ' },
      }),
    );
    assert.equal(amountOf(r, 'NJ_SIT'), 0);
  });

  test('supplemental wages aggregate with regular wages, no separate rate', () => {
    // NJ-WT: paid at the same time, total and withhold at the combined rate
    // — so a $1,000 supplemental-only "paycheck" (no regular earnings) is
    // computed exactly like the plain-regular-wages case above.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'BONUS', category: 'supplemental', amount: dollars(1000) }],
        workState: { code: 'NJ' },
      }),
    );
    assert.equal(amountOf(r, 'NJ_SIT'), dollars(29.38));
  });

  test('an unrecognized filingStatus throws rather than guessing a rate table', () => {
    assert.throws(() =>
      calculatePaycheck(
        input({ workState: { code: 'NJ', certificate: { filingStatus: 'bogus' } } }),
      ),
    );
  });
});

describe('New Jersey Unemployment/Workforce, TDI, and FLI (employee)', () => {
  test('combined UI/WF/SWF: 0.425% of wages, well under the $44,800 wage base', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'NJ' },
      }),
    );
    assert.equal(amountOf(r, 'NJ_UC_EE'), dollars(4.25));
  });

  test('UI/WF/SWF caps at the $44,800 annual wage base using YTD, not just the current cheque', () => {
    // $44,750 YTD leaves only $50 of room this cheque, even though the
    // cheque itself is $1,000: $50 x 0.425% = $0.2125 -> $0.21.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'NJ' },
        ytd: { socialSecurity: 0, medicare: 0, futa: 0, stateUnemployment: { NJ: dollars(44_750) } },
      }),
    );
    assert.equal(amountOf(r, 'NJ_UC_EE'), dollars(0.21));
  });

  test('TDI: 0.19% of wages, capped at the $171,100 wage base via YTD', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'NJ' },
      }),
    );
    assert.equal(amountOf(r, 'NJ_DBL_EE'), dollars(1.90));

    // $171,050 YTD leaves $50 of room: $50 x 0.19% = $0.095 -> $0.10 (round-half-up).
    const capped = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'NJ' },
        ytd: { socialSecurity: 0, medicare: 0, futa: 0, stateDisabilityEmployee: { NJ: dollars(171_050) } },
      }),
    );
    assert.equal(amountOf(capped, 'NJ_DBL_EE'), dollars(0.10));
  });

  test('FLI: 0.23% of wages, capped at the $171,100 wage base via YTD, separate tracker from TDI', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'NJ' },
      }),
    );
    assert.equal(amountOf(r, 'NJ_PFML_EE'), dollars(2.30));
  });

  test('UI/WF/SWF, TDI, and FLI all run even when NJ income tax is $0 via PA reciprocity', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        residenceState: { code: 'PA' },
        workState: { code: 'NJ' },
      }),
    );
    assert.equal(amountOf(r, 'NJ_SIT'), 0);
    assert.equal(amountOf(r, 'NJ_UC_EE'), dollars(4.25));
    assert.equal(amountOf(r, 'NJ_DBL_EE'), dollars(1.90));
    assert.equal(amountOf(r, 'NJ_PFML_EE'), dollars(2.30));
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

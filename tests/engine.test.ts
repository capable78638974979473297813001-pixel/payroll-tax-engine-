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
    // Was CA before this project built California — updated to TX (a state
    // this project has genuinely never built a ruleset for) once that
    // stopped being true, rather than leave a stale example that would
    // silently start testing the WRONG thing (California's real $0-below-
    // threshold Low Income Exemption line, not the no-ruleset-at-all flag
    // this test actually means to exercise).
    const r = calculatePaycheck(input({ workState: { code: 'TX' } }));
    const line = r.taxes.find((t) => t.id === 'TX_SIT');
    assert.ok(line);
    assert.match(line.detail ?? '', /NOT MODELLED/);
  });

  test("reciprocity SWAP (REV-419): a New Jersey resident working in PA gets $0 PA tax AND a real NJ tax line instead", () => {
    // Biweekly $3,000, no certificate on either side — the SAME default
    // fixture NJ's own 'Rate A, 0 exemptions' test already proved computes
    // to $120.74 when NJ is the WORK state. Here PA is the work state and
    // NJ is only the RESIDENCE state, so this proves the swap mechanism
    // reproduces that exact figure via the virtual-input path, not a
    // coincidence — reciprocitySwapWithholdingLine() runs incomeTaxLines()
    // against NJ's own ruleset on the same wages.
    const r = calculatePaycheck(
      input({
        workState: { code: 'PA' },
        residenceState: { code: 'NJ' },
      }),
    );
    assert.equal(amountOf(r, 'PA_SIT'), 0);
    assert.equal(amountOf(r, 'NJ_SIT_RECIPROCITY_SWAP'), dollars(120.74));
  });

  test('reciprocity SWAP does not over-apply: a New York resident working in PA owes full PA tax and gets no swap line at all', () => {
    const r = calculatePaycheck(
      input({
        workState: { code: 'PA' },
        residenceState: { code: 'NY' },
      }),
    );
    assert.equal(amountOf(r, 'PA_SIT'), dollars(92.1)); // full 3.07%, no exemption — NY isn't reciprocal
    assert.equal(r.taxes.some((t) => t.id === 'NY_SIT_RECIPROCITY_SWAP'), false);
  });

  // Act 32 local EIT + LST, wired to calc-code this pass — reads the real
  // 2,627-jurisdiction data/local/PA-EIT-LST-2026.json registry. Fixtures
  // use Pittsburgh's own two real PSD codes (700102 = Pittsburgh City /
  // Pittsburgh SD, totalResidentEIT 3.0%, nonresidentEIT 1.0%; 730105 =
  // Pittsburgh City / Baldwin-Whitehall SD, totalResidentEIT 1.5%) rather
  // than invented numbers, so these tests double as a sanity check on the
  // underlying data file too.
  test('EIT withholds at the RESIDENT rate when it is higher: lives and works at PSD 700102 (3.0% vs 1.0% nonresident)', () => {
    const r = calculatePaycheck(
      input({
        workState: { code: 'PA', certificate: { workPSD: '700102', residencePSD: '700102' } },
      }),
    );
    assert.equal(amountOf(r, 'PA_EIT'), dollars(90.0)); // 3,000 × 3.0%
  });

  test('EIT withholds at the NONRESIDENT rate when it is higher: out-of-state resident working at PSD 700102', () => {
    const r = calculatePaycheck(
      input({
        workState: { code: 'PA', certificate: { workPSD: '700102' } }, // no residencePSD = out-of-state
      }),
    );
    assert.equal(amountOf(r, 'PA_EIT'), dollars(30.0)); // 3,000 × 1.0% nonresident (0% resident, out-of-state)
  });

  test('EIT compares TWO DIFFERENT PSDs correctly: resident of 730105 (1.5%) working at 700102 (1.0% nonresident)', () => {
    const r = calculatePaycheck(
      input({
        workState: { code: 'PA', certificate: { workPSD: '700102', residencePSD: '730105' } },
      }),
    );
    assert.equal(amountOf(r, 'PA_EIT'), dollars(45.0)); // 3,000 × 1.5% resident (higher than 1.0% nonresident)
  });

  test('LST prorates the $52/yr combined total across biweekly periods: $2.00/period', () => {
    const r = calculatePaycheck(
      input({
        workState: { code: 'PA', certificate: { workPSD: '700102', residencePSD: '700102' } },
      }),
    );
    assert.equal(amountOf(r, 'PA_LST'), dollars(2.0)); // 52 / 26 periods = exactly $2.00
  });

  test('LST low-income exemption: biweekly $400 (annualized $10,400) is below the $12,000 threshold', () => {
    const r = calculatePaycheck(
      input({
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(400) }],
        workState: { code: 'PA', certificate: { workPSD: '700102', residencePSD: '700102' } },
      }),
    );
    assert.equal(amountOf(r, 'PA_LST'), 0);
  });

  test('missing certificate.workPSD is flagged NOT MODELLED, never silently zero', () => {
    const r = calculatePaycheck(input({ workState: { code: 'PA' } }));
    const line = r.taxes.find((t) => t.id === 'PA_EIT');
    assert.ok(line);
    assert.equal(line.amount, 0);
    assert.match(line.detail ?? '', /NOT MODELLED/);
  });

  test('an unrecognised PSD code is flagged NOT MODELLED, never silently zero', () => {
    const r = calculatePaycheck(
      input({ workState: { code: 'PA', certificate: { workPSD: '999999' } } }),
    );
    const line = r.taxes.find((t) => t.id === 'PA_EIT');
    assert.ok(line);
    assert.equal(line.amount, 0);
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

  test('reciprocity is generic across states too — a Pennsylvania resident working in Indiana gets the same state/county split as Kentucky above', () => {
    // Same fixture as the KY test immediately above, residenceState swapped
    // to PA — proving WH-47's state-only exemption isn't accidentally
    // KY-specific plumbing. IN-2026.json's reciprocalStates lists PA with
    // no per-state carve-out (unlike Virginia's daily-commute condition on
    // Kentucky's own reciprocalStates), so this is expected to match KY's
    // result exactly, and does.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(800) }],
        residenceState: { code: 'PA' },
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

  test('reciprocity BUG FIX: a Virginia resident who does NOT commute daily owes full KY tax, not $0', () => {
    // Found on an audit pass: 103 KAR 17:140 exempts Virginia residents
    // from Kentucky withholding ONLY if they commute daily — a narrower
    // condition than the other 6 reciprocal states, which are unconditional
    // on residence alone. The engine previously had no way to represent
    // this and granted every one of the 7 states the same blanket
    // exemption. Monthly $3,270, no certificate: reproduces the DOR's own
    // worked example ($104.65) — proof the VA residence, on its own,
    // changes NOTHING when certificate.dailyCommuter isn't set.
    const r = calculatePaycheck(
      input({
        payFrequency: 'monthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(3270) }],
        workState: { code: 'KY' },
        residenceState: { code: 'VA' },
      }),
    );
    assert.equal(amountOf(r, 'KY_SIT'), dollars(104.65));
  });

  test('a Virginia resident who DOES commute daily gets the reciprocity exemption', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'monthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(3270) }],
        workState: { code: 'KY' },
        residenceState: { code: 'VA', certificate: { dailyCommuter: true } },
      }),
    );
    assert.equal(amountOf(r, 'KY_SIT'), 0);
  });

  test('the other 6 reciprocal states remain UNCONDITIONAL — no dailyCommuter flag needed', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'monthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(3270) }],
        workState: { code: 'KY' },
        residenceState: { code: 'OH' },
      }),
    );
    assert.equal(amountOf(r, 'KY_SIT'), 0);
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

  test('reciprocity: a Pennsylvania resident working in NJ owes $0 NJ income tax, AND gets a PA swap line instead (NJ-165)', () => {
    // NJ-165's own text ("...authorize my employer to withhold Pennsylvania
    // personal income taxes on my behalf") confirms this isn't just a plain
    // exemption -- it's the same withholding SWAP mechanism PA's own
    // REV-419 describes from its side, now independently confirmed from
    // NJ's side too. reciprocitySwapWithholdingLine() (generic, gated by
    // NJ-2026.json's own reciprocity.swapWithholdsResidenceState) computes
    // PA's flat 3.07% on the same wages: 1,000 × 3.07% = $30.70.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        residenceState: { code: 'PA' },
        workState: { code: 'NJ' },
      }),
    );
    assert.equal(amountOf(r, 'NJ_SIT'), 0);
    assert.equal(amountOf(r, 'PA_SIT_RECIPROCITY_SWAP'), dollars(30.7));
  });

  test('supplemental wages paid AT THE SAME TIME as regular wages aggregate, allowance applies once', () => {
    // NJ-WT: "Total the employee's regular wage and supplemental wages and
    // withhold at the appropriate rate based on the combined payment." A
    // $700 regular + $300 supplemental cheque, 2 exemptions, is identical
    // to a single $1,000 regular cheque with 2 exemptions ($27.04, see
    // above) — the allowance is subtracted once from the combined total,
    // not once per earning line.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [
          { code: 'REG', category: 'regular', amount: dollars(700) },
          { code: 'BONUS', category: 'supplemental', amount: dollars(300) },
        ],
        workState: { code: 'NJ', certificate: { exemptions: 2 } },
      }),
    );
    assert.equal(amountOf(r, 'NJ_SIT'), dollars(27.04));
  });

  test('supplemental wages on a SEPARATE cheque (no regular wages this period) are withheld WITHOUT the exemption allowance', () => {
    // NJ-WT: "If the supplemental wages are paid at a different time [than
    // regular wages]: Withhold from the supplemental wages without any
    // exemption allowances." Detected structurally — no 'regular' earning
    // on this cheque at all. 2 exemptions would normally subtract $38.40
    // ($19.20 x 2); here it must NOT be subtracted, so this differs from
    // the plain-regular-wages 2-exemptions case above ($27.04) even though
    // the gross dollar amount is identical.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'BONUS', category: 'supplemental', amount: dollars(1000) }],
        workState: { code: 'NJ', certificate: { exemptions: 2 } },
      }),
    );
    // Full $1,000 (no allowance subtracted) falls in the same $769-$1,442
    // bracket as the very first test above: base $15.29 + 6.1% of
    // ($1,000-$769=$231) = $29.381 -> $29.38, NOT $27.04.
    assert.equal(amountOf(r, 'NJ_SIT'), dollars(29.38));
    assert.notEqual(amountOf(r, 'NJ_SIT'), dollars(27.04));
  });

  test('an unrecognized filingStatus throws rather than guessing a rate table', () => {
    assert.throws(() =>
      calculatePaycheck(
        input({ workState: { code: 'NJ', certificate: { filingStatus: 'bogus' } } }),
      ),
    );
  });

  test('quarterly and semiannual periods, derived from the annual table, are wired up', () => {
    // Rate A quarterly: $18,750-$125,000 bracket, base $732.50 + 7.0% of
    // ($20,000-$18,750=$1,250) = $732.50 + $87.50 = $820.00.
    const q = calculatePaycheck(
      input({
        payFrequency: 'quarterly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(20000) }],
        workState: { code: 'NJ' },
      }),
    );
    assert.equal(amountOf(q, 'NJ_SIT'), dollars(820.0));

    // Rate A semiannual: $37,500-$250,000 bracket (over the $10,000
    // threshold "and up" — no allowance claimed), base $1,465.00 + 7.0% of
    // ($40,000-$37,500=$2,500) = $1,465.00 + $175.00 = $1,640.00.
    const s = calculatePaycheck(
      input({
        payFrequency: 'semiannual',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(40000) }],
        workState: { code: 'NJ' },
      }),
    );
    assert.equal(amountOf(s, 'NJ_SIT'), dollars(1640.0));
  });

  test("daily period uses NJ-WT's own 365-based divisor, not this engine's usual 260-day convention", () => {
    // Rate A daily: $205-$1,370 bracket, base $8.03 + 7.0% of
    // ($300-$205=$95) = $8.03 + $6.65 = $14.68.
    const r = calculatePaycheck(
      input({
        payFrequency: 'daily',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(300) }],
        workState: { code: 'NJ' },
      }),
    );
    assert.equal(amountOf(r, 'NJ_SIT'), dollars(14.68));
  });

  test("Newark's payroll tax: 1% employer-paid, does NOT reduce employee net pay", () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'NJ', certificate: { locality: 'Newark' } },
      }),
    );
    const line = r.taxes.find((t) => t.id === 'NEWARK_PAYROLL_ER');
    assert.ok(line);
    assert.equal(line.payer, 'employer');
    assert.equal(line.jurisdiction, 'local');
    assert.equal(line.amount, dollars(10.0)); // 1% of $1,000

    // Employer-paid lines never reduce net pay — compare against an
    // otherwise-identical paycheck with no Newark locality.
    const noLocality = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'NJ' },
      }),
    );
    assert.equal(r.netPay, noLocality.netPay);
  });

  test('no Newark payroll tax line when the employee is not linked to a Newark locality', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'NJ' },
      }),
    );
    assert.equal(r.taxes.some((t) => t.id === 'NEWARK_PAYROLL_ER'), false);

    const otherCity = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'NJ', certificate: { locality: 'Jersey City' } },
      }),
    );
    assert.equal(otherCity.taxes.some((t) => t.id === 'NEWARK_PAYROLL_ER'), false);
  });

  test("certificate.newarkResidentApportionmentExcluded zeroes this employee's contribution, not the whole employer's liability", () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: {
          code: 'NJ',
          certificate: { locality: 'Newark', newarkResidentApportionmentExcluded: true },
        },
      }),
    );
    const line = r.taxes.find((t) => t.id === 'NEWARK_PAYROLL_ER');
    assert.ok(line);
    assert.equal(line.amount, 0);
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

describe('Idaho', () => {
  // Expected values hand-derived from EPB00744's own Table for Percentage
  // Computation Method (single weekly threshold $310, married $619; 5.3%
  // flat above it) before the code was run, same discipline as every other
  // state in this project.
  const idState = (certificate: Record<string, unknown> = {}) => ({
    workState: { code: 'ID', certificate },
  });

  test('weekly $1,000 single: (1,000 − 310) × 5.3% = $36.57', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...idState(),
      }),
    );
    assert.equal(amountOf(r, 'ID_SIT'), dollars(36.57));
  });

  test("married's threshold is exactly double single's: (1,000 − 619) × 5.3% = $20.19", () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...idState({ maritalStatus: 'married' }),
      }),
    );
    assert.equal(amountOf(r, 'ID_SIT'), dollars(20.19));
  });

  test('head of household folds into the single schedule — same $36.57 as plain single', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...idState({ maritalStatus: 'hoh' }),
      }),
    );
    assert.equal(amountOf(r, 'ID_SIT'), dollars(36.57));
  });

  test('wages at or below the threshold owe $0, not a negative bracket', () => {
    const below = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(300) }],
        ...idState(),
      }),
    );
    assert.equal(amountOf(below, 'ID_SIT'), 0);

    const atThreshold = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(310) }],
        ...idState(),
      }),
    );
    assert.equal(amountOf(atThreshold, 'ID_SIT'), 0);
  });

  test('Idaho conforms to federal pretax treatment — a 401(k) deferral REDUCES the Idaho base (unlike Pennsylvania)', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        deductions: [{ code: '401K', category: 'deferral_401k', amount: dollars(200) }],
        ...idState(),
      }),
    );
    // (800 − 310) × 5.3% = $25.97, not $36.57.
    assert.equal(amountOf(r, 'ID_SIT'), dollars(25.97));
  });

  test('no reciprocity exemption exists — Idaho has none, confirmed structurally empty rather than omitted', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        residenceState: { code: 'OR' },
        ...idState(),
      }),
    );
    assert.equal(amountOf(r, 'ID_SIT'), dollars(36.57));
  });

  test("Form ID W-4's Box C (married, but withhold at Single rate) uses the single schedule — same $36.57", () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...idState({ maritalStatus: 'married_withhold_as_single' }),
      }),
    );
    assert.equal(amountOf(r, 'ID_SIT'), dollars(36.57));
  });

  test("nonresident alien: forced to the single schedule plus Form ID W-4's own Pay Period table add-on", () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        // maritalStatus: 'married' deliberately included to prove the NRA
        // instruction ("check Box A regardless of your marital status")
        // overrides it, not just supplements a default.
        ...idState({ nonresidentAlien: true, maritalStatus: 'married' }),
      }),
    );
    // (1,000 − 310) × 5.3% = $36.57, plus the weekly $15 NRA add-on = $51.57.
    assert.equal(amountOf(r, 'ID_SIT'), dollars(51.57));
  });

  test('nonresident alien on a pay frequency outside the Pay Period table falls back to $0 add-on, not an error', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'annual',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(50000) }],
        ...idState({ nonresidentAlien: true }),
      }),
    );
    // (50,000 − 16,100) × 5.3% = $1,796.70, no annual row in the Pay Period
    // table so the add-on is $0, not a thrown error or a guessed figure.
    assert.equal(amountOf(r, 'ID_SIT'), dollars(1796.70));
  });

  test('an unrecognized marital status throws rather than silently defaulting', () => {
    assert.throws(
      () =>
        calculatePaycheck(
          input({
            payFrequency: 'weekly',
            earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
            ...idState({ maritalStatus: 'mfs' }),
          }),
        ),
      /Unrecognized ID certificate\.maritalStatus/,
    );
  });

  test('no employee-paid unemployment, disability, or paid-leave lines exist for Idaho', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...idState(),
      }),
    );
    assert.equal(r.taxes.some((t) => t.id === 'ID_UC_EE'), false);
    assert.equal(r.taxes.some((t) => t.id === 'ID_DBL_EE'), false);
    assert.equal(r.taxes.some((t) => t.id === 'ID_PFML_EE'), false);
  });
});

describe('Connecticut', () => {
  // Expected values independently hand-derived from Circular CT's own
  // 16-step Withholding Calculation Rules BEFORE running any of these —
  // computed via a standalone re-implementation of Steps 1-13 against
  // CT-2026.json's transcribed tables (kept out of engine.test.ts itself),
  // then cross-checked against calculatePaycheck()'s actual output. Two
  // independent implementations of the same source document agreeing is
  // the strongest verification available here, since Circular CT publishes
  // no to-the-cent worked examples the way PA/KY/WI do.
  const ctState = (certificate: Record<string, unknown> = {}) => ({
    workState: { code: 'CT', certificate },
  });

  test('weekly $1,000, Code A: no exemption left at this income, 2% phase-out add-back applies, no credit', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...ctState({ withholdingCode: 'A' }),
      }),
    );
    // Annualized $52,000: exemption $0 (Code A phases to $0 at $35,000);
    // initial tax (Table B) $2,110; 2% phase-out add-back (Table C) $25;
    // recapture (Table D) $0; credit (Table E) 0% (phased to $0 by $25,000).
    // ($2,110+$25) ÷ 52 = $41.0577 → $41.06.
    assert.equal(amountOf(r, 'CT_SIT'), dollars(41.06));
  });

  test('Code D always gets $0 exemption and $0 credit regardless of income — same result as Code A here', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...ctState({ withholdingCode: 'D' }),
      }),
    );
    assert.equal(amountOf(r, 'CT_SIT'), dollars(41.06));
  });

  test('Code F, annual $30,000: exemption phase-down and Table E credit both apply', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'annual',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(30000) }],
        ...ctState({ withholdingCode: 'F' }),
      }),
    );
    // Exemption at $30,000 (Code F): $14,000 → taxable $16,000. Table B
    // (A/D/F schedule): $200 + 4.5% × $6,000 = $470. Table C: $0 (below
    // $56,500). Table D: $0. Table E credit at $30,000: 1% (the
    // $26,500-$31,300 band). $470 × 0.99 = $465.30.
    assert.equal(amountOf(r, 'CT_SIT'), dollars(465.3));
  });

  test('Code C, annual $600,000: high enough to trigger the Table D tax recapture', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'annual',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(600000) }],
        ...ctState({ withholdingCode: 'C' }),
      }),
    );
    // No exemption left. Table B: $28,000 + 6.9% × $100,000 = $34,900.
    // Table C phase-out add-back at $600,000: $500 (past $145,500, flat).
    // Table D recapture at $600,000 (Code C schedule): $4,280 ($600,000
    // falls in the $600,000-$610,000 row). Sum $34,900+$500+$4,280 =
    // $39,680. Credit is 0% by this income. Total $39,680.00.
    assert.equal(amountOf(r, 'CT_SIT'), dollars(39680));
  });

  test('wages fully absorbed by the Code A exemption owe $0, not a negative bracket', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(200) }],
        ...ctState({ withholdingCode: 'A' }),
      }),
    );
    // Annualized $10,400 is inside Code A's $0-$24,000 full-exemption band
    // ($12,000 exemption) — $10,400 < $12,000, so taxable income is
    // negative, clamped to $0 per Step 6's own instruction.
    assert.equal(amountOf(r, 'CT_SIT'), 0);
  });

  test('no Form CT-W4 on file: flat 6.99%, no exemption, no credit — NOT the usual "default single" convention', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...ctState({}),
      }),
    );
    assert.equal(amountOf(r, 'CT_SIT'), dollars(69.9));
  });

  test('certificate.exempt (Form CT-W4 Code E) zeroes withholding, generically', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...ctState({ exempt: true }),
      }),
    );
    assert.equal(amountOf(r, 'CT_SIT'), 0);
  });

  test("Form CT-W4 Line 2 (additional withholding) adds, Line 3 (reduced withholding) subtracts and floors at $0", () => {
    const base = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...ctState({ withholdingCode: 'A' }),
      }),
    );
    assert.equal(amountOf(base, 'CT_SIT'), dollars(41.06));

    const withLine2 = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...ctState({ withholdingCode: 'A', additionalWithholding: dollars(10) }),
      }),
    );
    assert.equal(amountOf(withLine2, 'CT_SIT'), dollars(51.06));

    const withLine3 = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...ctState({ withholdingCode: 'A', reducedWithholding: dollars(10) }),
      }),
    );
    assert.equal(amountOf(withLine3, 'CT_SIT'), dollars(31.06));

    const line3ExceedsTax = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...ctState({ withholdingCode: 'A', reducedWithholding: dollars(1000) }),
      }),
    );
    assert.equal(amountOf(line3ExceedsTax, 'CT_SIT'), 0);
  });

  test('an unrecognized withholding code throws rather than silently defaulting', () => {
    assert.throws(
      () =>
        calculatePaycheck(
          input({
            payFrequency: 'weekly',
            earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
            ...ctState({ withholdingCode: 'Z' }),
          }),
        ),
      /Unrecognized CT certificate\.withholdingCode/,
    );
  });

  test('no reciprocity exemption exists — Connecticut has none', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        residenceState: { code: 'NY' },
        ...ctState({ withholdingCode: 'A' }),
      }),
    );
    assert.equal(amountOf(r, 'CT_SIT'), dollars(41.06));
  });

  test('CT Paid Leave: 0.5%, capped at the same wage base as federal Social Security', () => {
    const under = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...ctState({ withholdingCode: 'A' }),
      }),
    );
    assert.equal(amountOf(under, 'CT_PFML_EE'), dollars(5));

    const overCap = calculatePaycheck(
      input({
        payFrequency: 'annual',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(600000) }],
        ...ctState({ withholdingCode: 'C' }),
      }),
    );
    // Capped at $184,500 × 0.5% = $922.50, not $600,000 × 0.5% = $3,000.
    assert.equal(amountOf(overCap, 'CT_PFML_EE'), dollars(922.5));
  });

  test('Idaho-style 401(k) conformity check: a deferral reduces the CT base (unlike Pennsylvania)', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        deductions: [{ code: '401K', category: 'deferral_401k', amount: dollars(200) }],
        ...ctState({ withholdingCode: 'A' }),
      }),
    );
    // Annualized $41,600 taxable (down from $52,000): Table B $200+4.5%×
    // $31,600=$1,622; Table C at $41,600: $0 (below $50,250); Table D: $0;
    // credit 0%. $1,622 ÷ 52 = $31.19230... → $31.19.
    assert.equal(amountOf(r, 'CT_SIT'), dollars(31.19));
  });
});

describe('Iowa', () => {
  // All 10 examples reproduced verbatim from Iowa's own 2026 Withholding
  // Formula document (revenue.iowa.gov) — expected values transcribed from
  // the source's own worked arithmetic before running, same discipline as
  // every other state in this project.
  const iaState = (certificate: Record<string, unknown>) => ({
    workState: { code: 'IA', certificate },
  });

  test('Example 1: biweekly $2,100, 2026 IA W-4 "Other", $40 allowance → $59.26', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'biweekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2100) }],
        ...iaState({ maritalStatus: 'other', totalAllowanceAmount: dollars(40) }),
      }),
    );
    assert.equal(amountOf(r, 'IA_SIT'), dollars(59.26));
  });

  test('Example 2: biweekly $2,100, MFJ/QSS spouse not earning, $80 allowance → $38.72', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'biweekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2100) }],
        ...iaState({ maritalStatus: 'mfj', spouseHasEarnedIncome: false, totalAllowanceAmount: dollars(80) }),
      }),
    );
    assert.equal(amountOf(r, 'IA_SIT'), dollars(38.72));
  });

  test('Example 3: biweekly $2,100, Head of Household, $160 allowance → $45.15', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'biweekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2100) }],
        ...iaState({ maritalStatus: 'hoh', totalAllowanceAmount: dollars(160) }),
      }),
    );
    assert.equal(amountOf(r, 'IA_SIT'), dollars(45.15));
  });

  test('Example 4: monthly $5,000, "Other", $40 allowance → $145.50', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'monthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(5000) }],
        ...iaState({ maritalStatus: 'other', totalAllowanceAmount: dollars(40) }),
      }),
    );
    assert.equal(amountOf(r, 'IA_SIT'), dollars(145.50));
  });

  test('Example 5: monthly $5,000, MFJ/QSS spouse not earning, $80 allowance → $101.00', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'monthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(5000) }],
        ...iaState({ maritalStatus: 'mfj', spouseHasEarnedIncome: false, totalAllowanceAmount: dollars(80) }),
      }),
    );
    assert.equal(amountOf(r, 'IA_SIT'), dollars(101.00));
  });

  test('Example 6: monthly $5,000, Head of Household, $160 allowance → $114.92', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'monthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(5000) }],
        ...iaState({ maritalStatus: 'hoh', totalAllowanceAmount: dollars(160) }),
      }),
    );
    assert.equal(amountOf(r, 'IA_SIT'), dollars(114.92));
  });

  test('Example 7: biweekly $2,100, LEGACY (pre-2024) Single, 1 allowance → $59.26', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'biweekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2100) }],
        ...iaState({ formVintage: 'pre_2024', maritalStatus: 'single', allowances: 1 }),
      }),
    );
    assert.equal(amountOf(r, 'IA_SIT'), dollars(59.26));
  });

  test('Example 8: biweekly $2,100, LEGACY Married, 2 allowances → $38.72', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'biweekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2100) }],
        ...iaState({ formVintage: 'pre_2024', maritalStatus: 'married', allowances: 2 }),
      }),
    );
    assert.equal(amountOf(r, 'IA_SIT'), dollars(38.72));
  });

  test('Example 9: monthly $5,000, LEGACY Single, 1 allowance → $145.50', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'monthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(5000) }],
        ...iaState({ formVintage: 'pre_2024', maritalStatus: 'single', allowances: 1 }),
      }),
    );
    assert.equal(amountOf(r, 'IA_SIT'), dollars(145.50));
  });

  test('Example 10: monthly $5,000, LEGACY Married, 2 allowances → $101.00', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'monthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(5000) }],
        ...iaState({ formVintage: 'pre_2024', maritalStatus: 'married', allowances: 2 }),
      }),
    );
    assert.equal(amountOf(r, 'IA_SIT'), dollars(101.00));
  });

  test('no IA W-4 on file defaults to "Other" with $0 allowance, per the source\'s own fallback rule', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'biweekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2100) }],
        workState: { code: 'IA' },
      }),
    );
    // Same $1,600 taxable base as Example 1 (D=$500/period either way), but
    // NO $40 allowance this time: T2=$60.80, T3=$60.80-$0=$60.80.
    assert.equal(amountOf(r, 'IA_SIT'), dollars(60.80));
  });

  test('certificate.exempt and certificate.additionalWithholding work generically', () => {
    const exempt = calculatePaycheck(
      input({
        payFrequency: 'biweekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2100) }],
        ...iaState({ exempt: true }),
      }),
    );
    assert.equal(amountOf(exempt, 'IA_SIT'), 0);

    const withExtra = calculatePaycheck(
      input({
        payFrequency: 'biweekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2100) }],
        ...iaState({ maritalStatus: 'other', totalAllowanceAmount: dollars(40), additionalWithholding: dollars(25) }),
      }),
    );
    assert.equal(amountOf(withExtra, 'IA_SIT'), dollars(59.26 + 25));
  });

  test('reciprocity: an Illinois resident working in Iowa owes $0 Iowa income tax', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'biweekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2100) }],
        residenceState: { code: 'IL' },
        ...iaState({ maritalStatus: 'other', totalAllowanceAmount: dollars(40) }),
      }),
    );
    assert.equal(amountOf(r, 'IA_SIT'), 0);
  });

  test('quarterly pay period uses the annualize-then-divide fallback and reproduces the biweekly-equivalent rate', () => {
    // 4x Example 1's biweekly wages annualized to a quarterly-equivalent
    // check: $2,100/biweekly x 26 periods/yr = $54,600/yr = $13,650/quarter.
    const r = calculatePaycheck(
      input({
        payFrequency: 'quarterly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(13650) }],
        ...iaState({ maritalStatus: 'other', totalAllowanceAmount: dollars(40) }),
      }),
    );
    // Annual wages = 13,650 x 4 = 54,600. T1 = 54,600 - 13,000 = 41,600.
    // T2 = 41,600 x 3.8% = 1,580.80. T3 = 1,580.80 - 40 = 1,540.80/yr,
    // ÷ 4 quarters = $385.20/quarter.
    assert.equal(amountOf(r, 'IA_SIT'), dollars(385.20));
  });

  test('an unrecognized marital status throws for both W-4 vintages', () => {
    assert.throws(
      () =>
        calculatePaycheck(
          input({
            payFrequency: 'biweekly',
            earnings: [{ code: 'REG', category: 'regular', amount: dollars(2100) }],
            ...iaState({ maritalStatus: 'qss' }),
          }),
        ),
      /Unrecognized IA certificate\.maritalStatus/,
    );
    assert.throws(
      () =>
        calculatePaycheck(
          input({
            payFrequency: 'biweekly',
            earnings: [{ code: 'REG', category: 'regular', amount: dollars(2100) }],
            ...iaState({ formVintage: 'pre_2024', maritalStatus: 'hoh' }),
          }),
        ),
      /Unrecognized IA certificate\.maritalStatus/,
    );
  });

  test('no local income tax and no employee-paid unemployment/disability/paid-leave lines exist for Iowa', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'biweekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2100) }],
        ...iaState({ maritalStatus: 'other', totalAllowanceAmount: dollars(40) }),
      }),
    );
    assert.equal(r.taxes.some((t) => t.jurisdiction === 'local'), false);
    assert.equal(r.taxes.some((t) => t.id === 'IA_UC_EE'), false);
    assert.equal(r.taxes.some((t) => t.id === 'IA_DBL_EE'), false);
    assert.equal(r.taxes.some((t) => t.id === 'IA_PFML_EE'), false);
  });
});

describe('Vermont', () => {
  const vtState = (certificate: Record<string, unknown>) => ({
    workState: { code: 'VT', certificate },
  });

  test("reproduces GB-1210-2026's own worked example: weekly $1,800, married, 2 allowances → $45.77", () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1800) }],
        ...vtState({ maritalStatus: 'mfj', allowances: 2 }),
      }),
    );
    assert.equal(amountOf(r, 'VT_SIT'), dollars(45.77));
  });

  test('weekly $1,000 single, 0 allowances: (1,000 − 75) × 3.35% = $30.99', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...vtState({ maritalStatus: 'single' }),
      }),
    );
    assert.equal(amountOf(r, 'VT_SIT'), dollars(30.99));
  });

  test("Form W-4VT's 'married, but withhold at higher Single rate' and MFS both use the single schedule", () => {
    const higherSingle = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...vtState({ maritalStatus: 'married_withhold_as_single' }),
      }),
    );
    assert.equal(amountOf(higherSingle, 'VT_SIT'), dollars(30.99));

    const mfs = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...vtState({ maritalStatus: 'mfs' }),
      }),
    );
    assert.equal(amountOf(mfs, 'VT_SIT'), dollars(30.99));
  });

  test('wages below the threshold owe $0', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(70) }],
        ...vtState({ maritalStatus: 'single' }),
      }),
    );
    assert.equal(amountOf(r, 'VT_SIT'), 0);
  });

  test('certificate.exempt and certificate.additionalWithholding work generically', () => {
    const exempt = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...vtState({ exempt: true }),
      }),
    );
    assert.equal(amountOf(exempt, 'VT_SIT'), 0);

    const withExtra = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...vtState({ maritalStatus: 'single', additionalWithholding: dollars(10) }),
      }),
    );
    assert.equal(amountOf(withExtra, 'VT_SIT'), dollars(30.99 + 10));
  });

  test('an unrecognized marital status throws rather than silently defaulting', () => {
    assert.throws(
      () =>
        calculatePaycheck(
          input({
            payFrequency: 'weekly',
            earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
            ...vtState({ maritalStatus: 'hoh' }),
          }),
        ),
      // resolveMFJMaritalStatus() is now shared with Nebraska, so its error
      // message dropped the VT-specific wording — updated here to match.
      /Unrecognized certificate\.maritalStatus/,
    );
  });

  test('an unsupported pay frequency (semiannual) throws rather than guessing', () => {
    assert.throws(
      () =>
        calculatePaycheck(
          input({
            payFrequency: 'semiannual',
            earnings: [{ code: 'REG', category: 'regular', amount: dollars(9000) }],
            ...vtState({ maritalStatus: 'single' }),
          }),
        ),
      /doesn't publish a "semiannual" figure/,
    );
  });

  test('no local income tax and no employee-paid unemployment/disability/paid-leave lines exist for Vermont', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...vtState({ maritalStatus: 'single' }),
      }),
    );
    assert.equal(r.taxes.some((t) => t.jurisdiction === 'local'), false);
    assert.equal(r.taxes.some((t) => t.id === 'VT_UC_EE'), false);
    assert.equal(r.taxes.some((t) => t.id === 'VT_DBL_EE'), false);
    assert.equal(r.taxes.some((t) => t.id === 'VT_PFML_EE'), false);
  });
});

describe('Kansas', () => {
  const ksState = (certificate: Record<string, unknown>) => ({
    workState: { code: 'KS', certificate },
  });

  test("reproduces KW-100's own worked example: semimonthly $2,000, married/spouse not working, 1 dependent → $41.44", () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'semimonthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2000) }],
        ...ksState({ allowanceRate: 'joint', personalAllowances: 2, dependents: 1 }),
      }),
    );
    assert.equal(amountOf(r, 'KS_SIT'), dollars(41.44));
  });

  test('weekly $400 single, 1 personal allowance: (400 − 176.15) × 5.2% = $8.05', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(400) }],
        ...ksState({ allowanceRate: 'single', personalAllowances: 1 }),
      }),
    );
    // Annual exemption $9,160 ÷ 52 = $176.1538..., net = $223.8462...
    // Falls in [69, 512): 5.2% of (223.8462 − 69) = 5.2% × 154.8462 = $8.05.
    assert.equal(amountOf(r, 'KS_SIT'), dollars(8.05));
  });

  test('no K-4 on file: withheld at Single rate with $0 exemption, per KW-100\'s own explicit instruction', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(400) }],
        workState: { code: 'KS' },
      }),
    );
    // No allowance subtracted: 400 falls in [69,512): 5.2% × (400-69) = $17.21.
    assert.equal(amountOf(r, 'KS_SIT'), dollars(17.21));
  });

  test('Head of Household uses the single/HOH bracket table but gets the extra $2,320 allowance', () => {
    const withoutHoh = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(400) }],
        ...ksState({ allowanceRate: 'single', personalAllowances: 1 }),
      }),
    );
    const withHoh = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(400) }],
        ...ksState({ allowanceRate: 'single', personalAllowances: 1, headOfHousehold: true }),
      }),
    );
    assert.ok(amountOf(withHoh, 'KS_SIT') < amountOf(withoutHoh, 'KS_SIT'));
  });

  test('certificate.exempt and certificate.additionalWithholding work generically', () => {
    const exempt = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(400) }],
        ...ksState({ exempt: true }),
      }),
    );
    assert.equal(amountOf(exempt, 'KS_SIT'), 0);

    const withExtra = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(400) }],
        ...ksState({ allowanceRate: 'single', personalAllowances: 1, additionalWithholding: dollars(15) }),
      }),
    );
    assert.equal(amountOf(withExtra, 'KS_SIT'), dollars(8.05 + 15));
  });

  test('an unrecognized allowance rate throws rather than silently defaulting', () => {
    assert.throws(
      () =>
        calculatePaycheck(
          input({
            payFrequency: 'weekly',
            earnings: [{ code: 'REG', category: 'regular', amount: dollars(400) }],
            ...ksState({ allowanceRate: 'married' }),
          }),
        ),
      /Unrecognized KS certificate\.allowanceRate/,
    );
  });

  test('resident-working-elsewhere credit: KS resident working in MI owes the KS/MI shortfall', () => {
    // Weekly $2,000. MI: flat 4.25%, no allowances claimed = $85.00.
    // KS: single, 1 personal allowance ($9,160/yr ÷ 52) net wages land in
    // the 5.58% bracket = $96.20 due. Credit = $96.20 − $85.00 = $11.20.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2000) }],
        workState: { code: 'MI' },
        residenceState: { code: 'KS', certificate: { allowanceRate: 'single', personalAllowances: 1 } },
      }),
    );
    assert.equal(amountOf(r, 'MI_SIT'), dollars(85.0));
    assert.equal(amountOf(r, 'KS_SIT_CREDIT'), dollars(11.2));
  });

  test('resident-working-elsewhere credit floors at $0 when the work state already withheld more', () => {
    // Weekly $1,000: MI flat 4.25% = $42.50, KS single/1-allowance = $40.40.
    // MI already withheld more than KS would have required, per KW-100's
    // own rule ("no Kansas withholding tax is due") — not simply absent.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'MI' },
        residenceState: { code: 'KS', certificate: { allowanceRate: 'single', personalAllowances: 1 } },
      }),
    );
    assert.equal(amountOf(r, 'MI_SIT'), dollars(42.5));
    assert.equal(amountOf(r, 'KS_SIT_CREDIT'), 0);
    assert.ok(r.taxes.some((t) => t.id === 'KS_SIT_CREDIT'));
  });

  test('no resident-working-elsewhere credit line when residence and work state are the same, or residenceState is unset', () => {
    const sameState = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'KS', certificate: { allowanceRate: 'single', personalAllowances: 1 } },
        residenceState: { code: 'KS', certificate: { allowanceRate: 'single', personalAllowances: 1 } },
      }),
    );
    assert.equal(sameState.taxes.some((t) => t.id === 'KS_SIT_CREDIT'), false);

    const noResidence = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'MI' },
      }),
    );
    assert.equal(noResidence.taxes.some((t) => t.id === 'KS_SIT_CREDIT'), false);
  });

  test('no local income tax and no employee-paid unemployment/disability/paid-leave lines exist for Kansas', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(400) }],
        ...ksState({ allowanceRate: 'single', personalAllowances: 1 }),
      }),
    );
    assert.equal(r.taxes.some((t) => t.jurisdiction === 'local'), false);
    assert.equal(r.taxes.some((t) => t.id === 'KS_UC_EE'), false);
    assert.equal(r.taxes.some((t) => t.id === 'KS_DBL_EE'), false);
    assert.equal(r.taxes.some((t) => t.id === 'KS_PFML_EE'), false);
  });
});

describe('New Hampshire', () => {
  // New Hampshire has no income tax of any kind for 2026 (the Interest &
  // Dividends Tax fully repealed 2025-01-01) — the simplest state file in
  // this project, using the existing no_income_tax method with zero new
  // calc code.
  test('no state income tax line at all — zero, not merely unmodelled', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2000) }],
        workState: { code: 'NH' },
      }),
    );
    assert.equal(r.taxes.some((t) => t.id === 'NH_SIT'), false);
  });

  test('no local income tax and no employee-paid unemployment/disability/paid-leave lines exist for New Hampshire', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2000) }],
        workState: { code: 'NH' },
      }),
    );
    assert.equal(r.taxes.some((t) => t.jurisdiction === 'local'), false);
    assert.equal(r.taxes.some((t) => t.id === 'NH_UC_EE'), false);
    assert.equal(r.taxes.some((t) => t.id === 'NH_DBL_EE'), false);
    assert.equal(r.taxes.some((t) => t.id === 'NH_PFML_EE'), false);
  });
});

describe('Washington', () => {
  // Expected values hand-derived from Washington's own Employer Wage
  // Reporting and Premiums Toolkit formula before running: PFML employee
  // share = wages x 0.0113 x 0.7143; WA Cares = wages x 0.0058, uncapped.
  const waState = (certificate: Record<string, unknown> = {}) => ({
    workState: { code: 'WA', certificate },
  });

  test('no state or local income tax line exists for Washington', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...waState(),
      }),
    );
    assert.equal(r.taxes.some((t) => t.id === 'WA_SIT'), false);
    assert.equal(r.taxes.some((t) => t.jurisdiction === 'local'), false);
  });

  test('PFML employee share: $1,000 x 0.0113 x 0.7143 = $8.07', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...waState(),
      }),
    );
    assert.equal(amountOf(r, 'WA_PFML_EE'), dollars(8.07));
  });

  test('WA Cares Fund: $1,000 x 0.58% = $5.80', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...waState(),
      }),
    );
    assert.equal(amountOf(r, 'WA_LTC_EE'), dollars(5.8));
  });

  test('no PFML employer-share line by default (small-employer assumption)', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...waState(),
      }),
    );
    assert.equal(r.taxes.some((t) => t.id === 'WA_PFML_ER'), false);
  });

  test('PFML employer share, once certified 50+ employees: total premium less employee share = $3.23', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...waState({ employerLiableForPaidLeaveShare: true }),
      }),
    );
    // Total premium $11.30, employee share $8.07, employer share $3.23.
    assert.equal(amountOf(r, 'WA_PFML_ER'), dollars(3.23));
    const employerLine = r.taxes.find((t) => t.id === 'WA_PFML_ER');
    assert.equal(employerLine?.payer, 'employer');
  });

  test('PFML shares the Social Security wage cap; WA Cares does not', () => {
    // Employee already at the $184,500 SS cap for the year — PFML employee
    // share is now $0, but WA Cares keeps taxing the full new wages since
    // it has no cap at all ("The Social Security cap does not apply").
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ytd: {
          socialSecurity: 0,
          medicare: 0,
          futa: 0,
          statePaidLeave: { WA: dollars(184500) },
        },
        ...waState(),
      }),
    );
    assert.equal(amountOf(r, 'WA_PFML_EE'), 0);
    assert.equal(amountOf(r, 'WA_LTC_EE'), dollars(5.8));
  });

  test('no reciprocity exemption exists — not applicable, since Washington has no income tax at all', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        residenceState: { code: 'OR' },
        ...waState(),
      }),
    );
    // Both payroll levies still apply regardless of residence — they are
    // not income-tax reciprocity-exemptable levies.
    assert.equal(amountOf(r, 'WA_PFML_EE'), dollars(8.07));
    assert.equal(amountOf(r, 'WA_LTC_EE'), dollars(5.8));
  });

  test('WA Cares Fund exemption (certificate.wacaresExempt) zeroes only WA Cares, not PFML', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...waState({ wacaresExempt: true }),
      }),
    );
    assert.equal(amountOf(r, 'WA_LTC_EE'), 0);
    assert.ok(r.taxes.some((t) => t.id === 'WA_LTC_EE'));
    // PFML is a genuinely separate levy under a separate exemption scheme —
    // a WA Cares exemption does not imply a PFML exemption.
    assert.equal(amountOf(r, 'WA_PFML_EE'), dollars(8.07));
  });

  test('Paid Leave exemption (certificate.paidLeaveExempt) zeroes both employee and employer PFML shares', () => {
    const employeeSide = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...waState({ paidLeaveExempt: true }),
      }),
    );
    assert.equal(amountOf(employeeSide, 'WA_PFML_EE'), 0);
    // WA Cares is unaffected — separate exemption scheme.
    assert.equal(amountOf(employeeSide, 'WA_LTC_EE'), dollars(5.8));

    const employerSide = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...waState({ paidLeaveExempt: true, employerLiableForPaidLeaveShare: true }),
      }),
    );
    assert.equal(employerSide.taxes.some((t) => t.id === 'WA_PFML_ER'), false);
  });
});

describe('Massachusetts', () => {
  // Expected values computed via the live engine and independently
  // hand-verified against Circular M's own known figures before being
  // written here as assertions (Circular M itself was unreachable — see
  // MA-2026.json's $extractionNote — so this project's usual "reproduce
  // the source's own worked example" discipline isn't available; this is
  // the fallback discipline instead).
  const maState = (certificate: Record<string, unknown> = {}) => ({
    workState: { code: 'MA', certificate },
  });

  test("no certificate filed: Form M-4's own instruction is withholding \"without exemptions\" — full $100.00, not the $95.77 a filed certificate would give", () => {
    // Verification-pass finding: an earlier version of this file defaulted
    // the unset personal-exemption code to 1 (the full $4,400 exemption),
    // silently granting a benefit the source explicitly says a no-form
    // employee does NOT get. (2,000 − $0 exemption) × 5% = $100.00.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2000) }],
        ...maState(),
      }),
    );
    assert.equal(amountOf(r, 'MA_SIT'), dollars(100));
  });

  test('single, personal exemption claimed (Form M-4 Line 1 = "1"): (2,000 − 84.62 exemption) × 5% = $95.77', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2000) }],
        ...maState({ personalExemptionCode: 1 }),
      }),
    );
    assert.equal(amountOf(r, 'MA_SIT'), dollars(95.77));
  });

  test("Form M-4 Line 4 is a literal SUM of the raw codes, not a per-category total: personal(1)+spouse(4)+2 dependents = 7 → $1,000×7+$3,400 = $10,400/yr exemption → $90.00", () => {
    // Verification-pass correction: an earlier version of this test
    // asserted $89.62, built on a WRONG per-category model (personal
    // $4,400 + spouse $4,400 + 2×$1,000 dependents = $10,800/yr). The USDA
    // National Finance Center's own MA withholding bulletin, cross-checked
    // against Form M-4's own Line 4 instruction ("Add the number of
    // exemptions which you have claimed above"), confirms Line 4 = 1+4+2 =
    // 7, and the real formula is $1,000 × 7 + $3,400 = $10,400/yr (÷52 =
    // $200.00/week exactly). (2,000 − 200) × 5% = $90.00.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2000) }],
        ...maState({ personalExemptionCode: 1, spouseExemptionCode: 4, dependents: 2 }),
      }),
    );
    assert.equal(amountOf(r, 'MA_SIT'), dollars(90));
  });

  test('personal exemption code "2" (age 65+): Line 4 = 2 → $1,000×2+$3,400 = $5,400/yr exemption → $94.81', () => {
    // Also corrected: the old per-category model computed $5,100/yr
    // ($4,400 personal + a separately-tallied $700 age-65 addition), not
    // the real $5,400 the Line-4-sum formula gives at Line4=2.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2000) }],
        ...maState({ personalExemptionCode: 2 }),
      }),
    );
    assert.equal(amountOf(r, 'MA_SIT'), dollars(94.81));
  });

  test('Head of Household credit ($120/yr) and blindness credit ($110/yr) subtract from the computed TAX, not from wages', () => {
    const hoh = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2000) }],
        ...maState({ personalExemptionCode: 1, headOfHousehold: true }),
      }),
    );
    assert.equal(amountOf(hoh, 'MA_SIT'), dollars(93.46));

    const blind = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2000) }],
        ...maState({ personalExemptionCode: 1, blind: true }),
      }),
    );
    assert.equal(amountOf(blind, 'MA_SIT'), dollars(93.65));
  });

  test('Fair Share Amendment 4% surtax applies to annualized net wages above $1,107,750', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(30000) }],
        ...maState({ personalExemptionCode: 1 }),
      }),
    );
    // Annualized net wages $1,555,600 → $55,387.50 base (5% up to threshold)
    // + 9% of the $447,850 excess = $95,694.00/yr ÷ 52 = $1,840.27.
    assert.equal(amountOf(r, 'MA_SIT'), dollars(1840.27));
  });

  test('additional withholding (Form M-4 Line 5) works generically: $95.77 + $25.00 = $120.77', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2000) }],
        ...maState({ personalExemptionCode: 1, additionalWithholding: dollars(25) }),
      }),
    );
    assert.equal(amountOf(r, 'MA_SIT'), dollars(120.77));
  });

  test('an unrecognized exemption code throws rather than silently defaulting', () => {
    assert.throws(
      () =>
        calculatePaycheck(
          input({
            payFrequency: 'weekly',
            earnings: [{ code: 'REG', category: 'regular', amount: dollars(2000) }],
            ...maState({ personalExemptionCode: 3 }),
          }),
        ),
      /Unrecognized MA certificate\.personalExemptionCode/,
    );
  });

  test('PFML: employee flat 0.46% regardless of employer size; employer share (25+ employees) is total minus employee', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2000) }],
        ...maState(),
      }),
    );
    assert.equal(amountOf(r, 'MA_PFML_EE'), dollars(9.2));
    assert.equal(r.taxes.some((t) => t.id === 'MA_PFML_ER'), false);

    const withEmployer = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2000) }],
        ...maState({ employerLiableForPaidLeaveShare: true }),
      }),
    );
    // Total $17.60 (0.88%) − employee $9.20 (0.46%) = $8.40.
    assert.equal(amountOf(withEmployer, 'MA_PFML_ER'), dollars(8.4));
  });

  test('no reciprocity exemption exists — Massachusetts has none, confirmed structurally empty rather than omitted', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2000) }],
        residenceState: { code: 'RI' },
        ...maState({ personalExemptionCode: 1 }),
      }),
    );
    assert.equal(amountOf(r, 'MA_SIT'), dollars(95.77));
  });

  test('no local income tax exists for Massachusetts', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2000) }],
        ...maState(),
      }),
    );
    assert.equal(r.taxes.some((t) => t.jurisdiction === 'local'), false);
  });
});

describe('Maine', () => {
  // All 3 examples reproduced verbatim from Maine Revenue Services' own
  // 2026 Withholding Tables booklet — expected values transcribed from the
  // source's own worked arithmetic (including its multi-step whole-dollar
  // rounding) before running, same discipline as every other state.
  const meState = (certificate: Record<string, unknown> = {}) => ({
    workState: { code: 'ME', certificate },
  });

  test('Example 1: single $300/week, 2 allowances → annualized income is negative, so $0 withheld', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(300) }],
        ...meState({ maritalStatus: 'single', allowances: 2 }),
      }),
    );
    assert.equal(amountOf(r, 'ME_SIT'), 0);
  });

  test('Example 2: single $1,000/week, 2 allowances → $33 (annualized $1,694 ÷ 52, rounded)', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...meState({ maritalStatus: 'single', allowances: 2 }),
      }),
    );
    assert.equal(amountOf(r, 'ME_SIT'), dollars(33));
  });

  test('Example 3: married $4,500/week, 2 allowances, in the standard-deduction phase-out band → $257', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(4500) }],
        ...meState({ maritalStatus: 'married', allowances: 2 }),
      }),
    );
    assert.equal(amountOf(r, 'ME_SIT'), dollars(257));
  });

  test('no Form W-4ME on file defaults to single, zero allowances → $46', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'ME' },
      }),
    );
    assert.equal(amountOf(r, 'ME_SIT'), dollars(46));
  });

  test('certificate.exempt and certificate.additionalWithholding work generically', () => {
    const exempt = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...meState({ exempt: true }),
      }),
    );
    assert.equal(amountOf(exempt, 'ME_SIT'), 0);

    const withExtra = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...meState({ maritalStatus: 'single', allowances: 2, additionalWithholding: dollars(10) }),
      }),
    );
    assert.equal(amountOf(withExtra, 'ME_SIT'), dollars(33 + 10));
  });

  test("USDA NFC's own instruction — round AGAIN to the nearest dollar after adding Line 5 — holds even for a non-whole-dollar additional amount", () => {
    // $33 base + $10.60 additional = $43.60, which Maine's own formula
    // rounds to $44, not left at $43.60 the way every cent-rounding
    // state's own additionalWithholding line would be.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...meState({ maritalStatus: 'single', allowances: 2, additionalWithholding: dollars(10.6) }),
      }),
    );
    assert.equal(amountOf(r, 'ME_SIT'), dollars(44));
  });

  test("Married, but withholding at higher Single rate' uses the single schedule", () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...meState({ maritalStatus: 'married_withhold_as_single', allowances: 2 }),
      }),
    );
    assert.equal(amountOf(r, 'ME_SIT'), dollars(33));
  });

  test('an unrecognized marital status throws rather than silently defaulting', () => {
    assert.throws(
      () =>
        calculatePaycheck(
          input({
            payFrequency: 'weekly',
            earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
            ...meState({ maritalStatus: 'hoh' }),
          }),
        ),
      /Unrecognized ME certificate\.maritalStatus/,
    );
  });

  test('PFML: employee flat 0.5%; employer share (15+ employees) is the other 0.5%', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'ME' },
      }),
    );
    assert.equal(amountOf(r, 'ME_PFML_EE'), dollars(5));
    assert.equal(r.taxes.some((t) => t.id === 'ME_PFML_ER'), false);

    const withEmployer = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...meState({ employerLiableForPaidLeaveShare: true }),
      }),
    );
    assert.equal(amountOf(withEmployer, 'ME_PFML_ER'), dollars(5));
  });

  test('no reciprocity exemption exists — Maine has none, confirmed structurally empty rather than omitted', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        residenceState: { code: 'NH' },
        ...meState({ maritalStatus: 'single', allowances: 2 }),
      }),
    );
    assert.equal(amountOf(r, 'ME_SIT'), dollars(33));
  });

  test('no local income tax line exists for Maine', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...meState({ maritalStatus: 'single', allowances: 2 }),
      }),
    );
    assert.equal(r.taxes.some((t) => t.jurisdiction === 'local'), false);
  });

  test('PFML rate override lets a caller supply a specific small employer\'s own chosen rate: $1,000 × 0.20% = $2.00', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...meState({ paidLeaveEmployeeRateOverride: 0.002 }),
      }),
    );
    assert.equal(amountOf(r, 'ME_PFML_EE'), dollars(2));
  });

  test('tribal exemption (certificate.exemptWages) excludes just the tribal-land-sourced portion of wages, not the whole cheque', () => {
    // $1,000 wages, $400 earned on tribal land and exempt under Form
    // W-4ME Line 7 -- only $600/week is Maine-taxable.
    const partial = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...meState({ maritalStatus: 'single', allowances: 2, exemptWages: dollars(400) }),
      }),
    );
    // $600 × 52 = $31,200/yr − $10,600 allowances − $12,450 standard
    // deduction = $8,150 annualized income × 5.8% = $472.70 → $473,
    // ÷ 52 = $9.096... → $9.
    assert.equal(amountOf(partial, 'ME_SIT'), dollars(9));

    // If ALL wages are tribal-land-sourced, this reproduces the same $0
    // result the all-or-nothing certificate.exempt flag already gives.
    const full = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...meState({ maritalStatus: 'single', allowances: 2, exemptWages: dollars(1000) }),
      }),
    );
    assert.equal(amountOf(full, 'ME_SIT'), 0);
  });
});

describe('Ohio', () => {
  // Expected values hand-derived from OH-2026.json's own periodTables
  // (transcribed verbatim from the Ohio Department of Taxation's own
  // withholding tables in an earlier session) before running, then
  // confirmed against the live engine — this describe block closes the
  // long-standing gap where OH's 'bracket_per_period' method had no
  // dispatch case at all, so calculatePaycheck() threw for any Ohio input.
  // checkDate is set explicitly to on/after 2026-08-01 in every test below
  // (the engine test suite's own global default, '2026-06-15', is BEFORE
  // Ohio's HB96 rate change — see the dedicated mid-year-dating tests
  // further down for that boundary specifically) so each test's intent
  // (testing the CURRENT table) doesn't depend on a shared default that
  // has nothing to do with Ohio.
  const ohState = (certificate: Record<string, unknown> = {}) => ({
    checkDate: '2026-08-15',
    workState: { code: 'OH', certificate },
  });

  test('weekly $1,000, 1 exemption: (1,000 − 12.50) × bracket = $22.57', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...ohState({ exemptions: 1 }),
      }),
    );
    assert.equal(amountOf(r, 'OH_SIT'), dollars(22.57));
  });

  test('no IT-4 on file defaults to 0 exemptions: weekly $1,000 → $22.94', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        checkDate: '2026-08-15',
        workState: { code: 'OH' },
      }),
    );
    assert.equal(amountOf(r, 'OH_SIT'), dollars(22.94));
  });

  test('certificate.additionalWithholding (IT-4 Section II Line 5) works generically', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...ohState({ exemptions: 1, additionalWithholding: dollars(15) }),
      }),
    );
    assert.equal(amountOf(r, 'OH_SIT'), dollars(22.57 + 15));
  });

  test('reciprocity (the actual fix): an Indiana resident working in Ohio owes $0 Ohio income tax', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        residenceState: { code: 'IN' },
        ...ohState({ exemptions: 1 }),
      }),
    );
    assert.equal(amountOf(r, 'OH_SIT'), 0);
  });

  test('reciprocity does not over-apply: a New York resident working in Ohio still owes full Ohio tax', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        residenceState: { code: 'NY' },
        ...ohState({ exemptions: 1 }),
      }),
    );
    assert.equal(amountOf(r, 'OH_SIT'), dollars(22.57));
  });

  test('all 5 reciprocal states (IN/KY/MI/PA/WV) zero Ohio tax the same way', () => {
    for (const code of ['IN', 'KY', 'MI', 'PA', 'WV']) {
      const r = calculatePaycheck(
        input({
          payFrequency: 'weekly',
          earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
          residenceState: { code },
          ...ohState({ exemptions: 1 }),
        }),
      );
      assert.equal(amountOf(r, 'OH_SIT'), 0, `expected $0 OH tax for a ${code} resident`);
    }
  });

  test("mid-year effective dating (the gap just closed): HB96's rate cut applies to checks on/after 2026-08-01, not before", () => {
    // Same $1,000/week, 1 exemption as the first test above, but priced on
    // the PRIOR (Oct 2025) table: base $8.89 not $8.02, top bracket 3.64%
    // vs 3.40% — (987.50 − 500.96) × 2.99% + 8.89 = $23.44.
    const beforeCutoff = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        checkDate: '2026-01-15',
        workState: { code: 'OH', certificate: { exemptions: 1 } },
      }),
    );
    assert.equal(amountOf(beforeCutoff, 'OH_SIT'), dollars(23.44));

    // The day before the cutover still uses the prior table...
    const dayBefore = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        checkDate: '2026-07-31',
        workState: { code: 'OH', certificate: { exemptions: 1 } },
      }),
    );
    assert.equal(amountOf(dayBefore, 'OH_SIT'), dollars(23.44));

    // ...and the cutover date itself already uses the new, lower table.
    const cutoverDay = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        checkDate: '2026-08-01',
        workState: { code: 'OH', certificate: { exemptions: 1 } },
      }),
    );
    assert.equal(amountOf(cutoverDay, 'OH_SIT'), dollars(22.57));
  });
});

describe('Delaware', () => {
  // Expected values hand-derived from the Employer's Guide's own three
  // worked examples (Section 17), before the code was run, same discipline
  // as every other state. All three share the same $25,000 annualized-wage
  // starting point, isolating the standard-deduction and exemption-credit
  // differences between filing statuses while proving the shared bracket
  // lookup and annualization steps once. Delaware is the first state in
  // this project where the exemption amount is a CREDIT subtracted from
  // computed tax, not a deduction subtracted from wages before the bracket
  // lookup.
  const deState = (certificate: Record<string, unknown>) => ({
    workState: { code: 'DE', certificate },
  });

  test('Guide Example 1: single, 1 exemption, weekly (annualized $25,000)', () => {
    // $480.7692.../wk x52 = $25,000/yr. Less $3,250 standard deduction =
    // $21,750 taxable. Bracket 20,000-25,000 @ 5.20%, base $741: 741 +
    // 5.20%x1,750 = 741+91 = $832.00 tax. Less 1x$110 credit = $722.00
    // liability. ÷52 = $13.88 (Guide's own stated answer).
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: Math.round(dollars(25000) / 52) }],
        ...deState({ maritalStatus: 'single', exemptions: 1 }),
      }),
    );
    assert.equal(amountOf(r, 'DE_SIT'), dollars(13.88));
  });

  test('Guide Example 1, same $25,000/yr: biweekly/semi-monthly/monthly all match the Guide', () => {
    const annual = dollars(25000);
    const cases: [string, number, number][] = [
      ['biweekly', 26, 27.77],
      ['semimonthly', 24, 30.08],
      ['monthly', 12, 60.17],
    ];
    for (const [payFrequency, periods, expected] of cases) {
      const r = calculatePaycheck(
        input({
          payFrequency: payFrequency as PaycheckInput['payFrequency'],
          earnings: [{ code: 'REG', category: 'regular', amount: Math.round(annual / periods) }],
          ...deState({ maritalStatus: 'single', exemptions: 1 }),
        }),
      );
      assert.equal(amountOf(r, 'DE_SIT'), dollars(expected), `${payFrequency} should be ${expected}`);
    }
  });

  test('Guide Example 2: MFJ, 3 exemptions, same $25,000/yr — bigger deduction, bigger credit', () => {
    // $25,000/yr less $6,500 MFJ standard deduction = $18,500 taxable.
    // Bracket 10,000-20,000 @ 4.80%, base $261: 261 + 4.80%x8,500 =
    // 261+408 = $669.00 tax. Less 3x$110 credit = $339.00 liability.
    const annual = dollars(25000);
    const cases: [string, number, number][] = [
      ['weekly', 52, 6.52],
      ['biweekly', 26, 13.04],
      ['semimonthly', 24, 14.13],
      ['monthly', 12, 28.25],
    ];
    for (const [payFrequency, periods, expected] of cases) {
      const r = calculatePaycheck(
        input({
          payFrequency: payFrequency as PaycheckInput['payFrequency'],
          earnings: [{ code: 'REG', category: 'regular', amount: Math.round(annual / periods) }],
          ...deState({ maritalStatus: 'mfj', exemptions: 3 }),
        }),
      );
      assert.equal(amountOf(r, 'DE_SIT'), dollars(expected), `${payFrequency} should be ${expected}`);
    }
  });

  test('Guide Example 3: Married Filing Separately, 2 exemptions — uses the SINGLE standard deduction, not half of MFJ', () => {
    // $25,000/yr less $3,250 (single/MFS figure, NOT $3,250 = half of
    // $6,500 by coincidence of Delaware's own numbers) = $21,750 taxable,
    // same bracket math as Example 1 ($832.00 tax). Less 2x$110 credit =
    // $612.00 liability — proves MFS is NOT dispatched to the married
    // standard-deduction bucket.
    const annual = dollars(25000);
    const cases: [string, number, number][] = [
      ['weekly', 52, 11.77],
      ['biweekly', 26, 23.54],
      ['semimonthly', 24, 25.5],
      ['monthly', 12, 51.0],
    ];
    for (const [payFrequency, periods, expected] of cases) {
      const r = calculatePaycheck(
        input({
          payFrequency: payFrequency as PaycheckInput['payFrequency'],
          earnings: [{ code: 'REG', category: 'regular', amount: Math.round(annual / periods) }],
          ...deState({ maritalStatus: 'mfs', exemptions: 2 }),
        }),
      );
      assert.equal(amountOf(r, 'DE_SIT'), dollars(expected), `${payFrequency} should be ${expected}`);
    }
  });

  test("no certificate on file defaults to single, 0 exemptions (Guide Section 15(a)'s own default)", () => {
    // Same $25,000/yr, no certificate at all: single standard deduction,
    // same $832.00 tax as Example 1, but $0 credit (0 exemptions) instead
    // of Example 1's $110 — proving the no-certificate default is genuinely
    // "single, no allowances," not silently reusing whatever the last test
    // configured.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: Math.round(dollars(25000) / 52) }],
        workState: { code: 'DE' },
      }),
    );
    assert.equal(amountOf(r, 'DE_SIT'), dollars(16.0));
  });

  test('401(k) deferral reduces the DE base (federal-conformity state, unlike Pennsylvania)', () => {
    // $1,000/wk regular with a $200 401(k) deferral: DE taxable wages are
    // $800/wk = $41,600/yr (below the $60,000 floor, so a real bracket
    // shift versus the undeferred $52,000/yr would land in a lower band).
    // Annual $41,600 less $3,250 standard deduction = $38,350 taxable.
    // Bracket 25,000-60,000 @ 5.55%, base $1,001: 1,001 + 5.55%x13,350 =
    // 1,001+740.93 = $1,741.93 tax. Less 1x$110 credit = $1,631.93 liability
    // ÷52 = $31.38 (weekly, rounds from 31.3833).
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        deductions: [{ code: '401K', category: 'deferral_401k', amount: dollars(200) }],
        ...deState({ maritalStatus: 'single', exemptions: 1 }),
      }),
    );
    assert.equal(amountOf(r, 'DE_SIT'), dollars(31.38));
  });

  test('no DE reciprocity: a Delaware resident working in Pennsylvania still owes full DE tax if DE is the work state', () => {
    // Confirms reciprocityExemptionReason() finds no match for DE (its own
    // reciprocalStates is empty) even when a residenceState is supplied —
    // Delaware's own Employer's Guide states directly it has no reciprocal
    // agreements with any state.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: Math.round(dollars(25000) / 52) }],
        workState: { code: 'DE', certificate: { maritalStatus: 'single', exemptions: 1 } },
        residenceState: { code: 'PA' },
      }),
    );
    assert.equal(amountOf(r, 'DE_SIT'), dollars(13.88));
  });
});

describe('Arizona', () => {
  // Arizona's own mechanism, not a bracket table: the employee elects a flat
  // percentage of gross taxable wages on Form A-4 (2026), or elects zero. No
  // certificate on file defaults to a flat 2.0% per the form's own words.
  const azState = (certificate?: Record<string, unknown>) => ({
    workState: { code: 'AZ', ...(certificate ? { certificate } : {}) },
  });

  test('elected 2.5% on Form A-4', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'biweekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(3000) }],
        ...azState({ electedRate: 0.025 }),
      }),
    );
    assert.equal(amountOf(r, 'AZ_SIT'), dollars(75));
  });

  test('no Form A-4 on file defaults to the flat 2.0% HB 2119 rate', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'biweekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(3000) }],
        ...azState(),
      }),
    );
    assert.equal(amountOf(r, 'AZ_SIT'), dollars(60));
  });

  test('zero-withholding election on Form A-4 produces $0, not the default rate', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'biweekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(3000) }],
        ...azState({ zeroElection: true }),
      }),
    );
    assert.equal(amountOf(r, 'AZ_SIT'), 0);
  });

  test('an elected rate outside Form A-4\'s 7 published options throws rather than silently applying it', () => {
    // Found during an audit pass: the original implementation cast
    // certificate.electedRate straight to a number and applied it via
    // applyRate() with no check against Arizona's own closed list of legal
    // rates (0.5/1.0/1.5/2.0/2.5/3.0/3.5%) — a caller-supplied 12% (a
    // plausible typo for '1.2%', or a copy-paste from a different state's
    // rate) would have silently withheld 6x too much with no error at all.
    // Every other state's own enum-like certificate field in this project
    // (marital status codes, withholding codes, filing statuses) throws on
    // an unrecognized value; Arizona's rate election is exactly that kind
    // of closed-list field and was the one exception.
    assert.throws(
      () =>
        calculatePaycheck(
          input({
            payFrequency: 'biweekly',
            earnings: [{ code: 'REG', category: 'regular', amount: dollars(3000) }],
            ...azState({ electedRate: 0.12 }),
          }),
        ),
      /Unrecognized AZ certificate\.electedRate/,
    );
  });
});

describe('Missouri', () => {
  // Expected values reproduce the 2026 Missouri Withholding Tax Formula's
  // OWN worked example (married, spouse works, $35,000 annual, monthly
  // $59) — monthly wages chosen as $2,916.67 so that x12 lands within 4
  // cents of the source's stated $35,000 annual figure; verified by hand
  // that the 4-cent difference doesn't shift the bracket or the rounded
  // answer. roundFinalToWholeDollar (the same generic mechanism built for
  // Maine) is what turns the raw $58.98 into the source's stated $59.
  test("reproduces the DOR's own worked example: married/spouse-works, monthly $2,916.67", () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'monthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2916.67) }],
        workState: { code: 'MO' },
      }),
    );
    assert.equal(amountOf(r, 'MO_SIT'), dollars(59));
  });

  test('married, spouse does not work gets DOUBLE the standard deduction', () => {
    // Annual $35,000.04 (2,916.67 x 12), deduction $32,200 (2x $16,100) ->
    // taxable $2,800.04 -> falls in the 3rd bracket ($2,696-$4,044, base
    // $27, rate 2.5%), NOT the 2nd: 27.00 + (2,800.04-2,696) x 2.5% =
    // 27.00 + 2.60 = 29.60/yr -> /12 = 2.4667 -> raw $2.47, rounds to the
    // nearest WHOLE DOLLAR (Missouri's final-rounding rule) = $2.
    const r = calculatePaycheck(
      input({
        payFrequency: 'monthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2916.67) }],
        workState: { code: 'MO', certificate: { filingStatus: 'married_spouse_does_not_work' } },
      }),
    );
    assert.equal(amountOf(r, 'MO_SIT'), dollars(2));
  });

  test('Kansas City earnings tax: 1% via certificate.locality, not tied to residence vs. work-location logic', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'monthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2916.67) }],
        workState: { code: 'MO', certificate: { locality: 'Kansas City' } },
      }),
    );
    assert.equal(amountOf(r, 'KC_EARN'), dollars(29.17));
    assert.equal(r.taxes.some((t) => t.id === 'STL_EARN' || t.id === 'STL_PAYROLL_ER'), false);
  });

  test('St. Louis: BOTH the 1% employee earnings tax AND the separate 0.5% employer payroll expense tax fire', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'monthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2916.67) }],
        workState: { code: 'MO', certificate: { locality: 'St. Louis' } },
      }),
    );
    assert.equal(amountOf(r, 'STL_EARN'), dollars(29.17));
    assert.equal(amountOf(r, 'STL_PAYROLL_ER'), dollars(14.58));
  });

  test('no certificate.locality at all means neither city tax fires', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'monthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2916.67) }],
        workState: { code: 'MO' },
      }),
    );
    assert.equal(r.taxes.some((t) => t.id === 'KC_EARN' || t.id === 'STL_EARN'), false);
  });
});

describe('Nebraska', () => {
  // Hand-derived from Circular EN's own verified ANNUAL bracket table (no
  // official per-period worked example was available in the source —
  // Circular EN's per-period tables extracted garbled and were not
  // transcribed; this exercises the annualize-then-divide approximation
  // disclosed in NE-2026.json rather than reproducing a published cell).
  test('single, weekly $500, 0 allowances', () => {
    // Annual net = 500 x 52 = 26,000 (0 allowances, no subtraction).
    // Bracket [21,810-31,610, base 560.35, rate 4.21%]: 560.35 +
    // (26,000-21,810) x 4.21% = 560.35 + 176.40 = 736.75 (fees applyRate's
    // own rounding: 4,190 x 0.0421 = 176.399 -> rounds to 176.40).
    // /52 = 14.168... -> rounds to 14.17.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(500) }],
        workState: { code: 'NE', certificate: { maritalStatus: 'single', allowances: 0 } },
      }),
    );
    assert.equal(amountOf(r, 'NE_SIT'), dollars(14.17));
  });

  test('allowances reduce the base before the PER-PERIOD bracket lookup (real table, not annualize-and-divide)', () => {
    // Same $500/week, 2 allowances: 2 x $46.92 = $93.84 subtracted PER
    // PERIOD first (WEEKLY table's own allowance value, not annualized).
    // Net = 500 - 93.84 = 406.16/wk, which falls in the weekly SINGLE
    // table's own [$129-$419, base $1.42, rate 3.22%] bracket directly (no
    // annualizing involved): 1.42 + (406.16-129) x 3.22% = 1.42 + 277.16 x
    // 0.0322 = 1.42 + 8.92 (277.16 x 0.0322 = 8.924552, rounds DOWN to
    // 8.92, not 8.93) = $10.34.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(500) }],
        workState: { code: 'NE', certificate: { maritalStatus: 'single', allowances: 2 } },
      }),
    );
    assert.equal(amountOf(r, 'NE_SIT'), dollars(10.34));
  });

  test('quarterly $9,000 proves the REAL per-period table is in use, not the old annualize-then-divide approximation', () => {
    // Real quarterly table, bracket [$7,903-$10,033, base $243.24, rate
    // 4.35%]: 243.24 + (9,000-7,903) x 4.35% = 243.24 + 1,097 x 0.0435 =
    // 243.24 + 47.72 (1,097 x 0.0435 = 47.7195, rounds to 47.72) = $290.96.
    // The OLD annualize-then-divide approximation this file used before the
    // real per-period tables were recovered would instead have annualized
    // to $36,000, used the ANNUAL bracket [$31,610-$40,130, base $972.93,
    // rate 4.35%] -> 972.93 + 4,390 x 4.35% = 1,163.90/yr -> /4 = $290.975,
    // rounding HALF UP to $290.98 — a real 2-cent difference from the
    // correct $290.96, verified independently before writing this fixture,
    // that this test exists specifically to catch if the wiring ever
    // regresses back to the approximation.
    const r = calculatePaycheck(
      input({
        payFrequency: 'quarterly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(9000) }],
        workState: { code: 'NE', certificate: { maritalStatus: 'single', allowances: 0 } },
      }),
    );
    assert.equal(amountOf(r, 'NE_SIT'), dollars(290.96));
  });
});

describe('Oregon', () => {
  // Oregon is the first state in this project whose formula depends on the
  // employee's own COMPUTED FEDERAL WITHHOLDING, not just federally-defined
  // wage categories. These fixtures were verified two ways: (1) an
  // independent standalone reimplementation of the formula (deliberately
  // separate from state.ts, the same discipline used for Connecticut, since
  // Oregon publishes no cent-exact worked example using REAL federal
  // withholding — its own Example 1 assumes an illustrative $1,000 federal
  // figure that doesn't correspond to any real 2026 federal computation);
  // (2) reading the actual engine's own detail string for the same inputs
  // and confirming every intermediate figure matches by hand.
  test('single, weekly $1,000, 0 allowances — real federal withholding as input', () => {
    // Engine computes US_FIT = $78.08/wk (annualized $4,060.16). Annual OR
    // wages = $52,000 (>= $50,000, so the phase-out-cap table applies, but
    // $4,060.16 is under the $8,750 cap so the full federal figure is
    // subtracted, uncapped in practice). BASE = 52,000 - 4,060.16 - 2,910
    // (single, <3 allowances) = 45,029.84. Bracket [11,400-125,000, base
    // 678, rate 8.75%]: 678 + (45,029.84-11,400) x 8.75% = 678 + 2,942.61
    // = 3,620.61. No exemption credit (0 allowances). /52 = 69.628... ->
    // 69.63.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'OR', certificate: { maritalStatus: 'single', allowances: 0 } },
      }),
    );
    assert.equal(amountOf(r, 'OR_SIT'), dollars(69.63));
  });

  test('married, 2 allowances, monthly $10,000, federal-exempt — promoted bracket + exemption credit', () => {
    // federalW4.exempt=true isolates the OR-specific arithmetic from
    // federal's own formula for this fixture. Annual wages $120,000 (>=
    // $50,000, married schedule). BASE = 120,000 - 0 (federal) - 5,820
    // (married deduction) = 114,180. Bracket [22,800-250,000, base
    // 1,357, rate 8.75%]: 1,357 + (114,180-22,800) x 8.75% = 1,357 +
    // 7,995.75 = 9,352.75. Less 2 x $263 = $526 exemption credit =
    // 8,826.75. /12 = 735.5625 -> rounds to 735.56.
    const r = calculatePaycheck(
      input({
        payFrequency: 'monthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(10000) }],
        federalW4: {
          filingStatus: 'single',
          multipleJobs: false,
          dependentCredit: 0,
          otherIncome: 0,
          deductions: 0,
          extraWithholding: 0,
          exempt: true,
        },
        workState: { code: 'OR', certificate: { maritalStatus: 'married', allowances: 2 } },
      }),
    );
    assert.equal(amountOf(r, 'OR_SIT'), dollars(735.56));
  });

  test('high earner: the federal-subtraction cap phases all the way down to $0, using REAL computed federal withholding', () => {
    // Weekly $3,000 (annual $156,000), single, 0 allowances. This is the
    // fixture that actually exercises the phase-out CAP TABLE — every
    // other Oregon fixture either used federal-exempt (cap logic runs but
    // multiplies against $0 either way) or stayed under the cap ceiling
    // entirely. At $156,000, real federal withholding is a substantial
    // $503.35/wk ($26,174.20/yr annualized) — but Oregon's own phase-out
    // schedule's LAST tier (wages >= $145,000, single) caps the federal
    // subtraction at exactly $0, so none of that real federal withholding
    // reduces the Oregon base at all. BASE = 156,000 - 0 - 2,910 (single
    // deduction) = 153,090. Bracket [125,000+, base 10,618, rate 9.9%]:
    // 10,618 + (153,090-125,000) x 9.9% = 10,618 + 2,780.91 = 13,398.91/yr
    // -> /52 = 257.6714... -> $257.67. Verified first by running the real
    // engine and reading its own detail string ("less $0.00 federal
    // (capped $0.00)"), then independently re-deriving every intermediate
    // figure by hand before trusting it.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(3000) }],
        workState: { code: 'OR', certificate: { maritalStatus: 'single', allowances: 0 } },
      }),
    );
    assert.equal(amountOf(r, 'OR_SIT'), dollars(257.67));
  });

  test('no Form OR-W-4 on file defaults to a flat 8% (HB 2119), skipping the whole formula', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'OR' },
      }),
    );
    assert.equal(amountOf(r, 'OR_SIT'), dollars(80));
  });

  test('Statewide Transit Tax: flat 0.1%, uncapped, on top of OR_SIT', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'OR' },
      }),
    );
    assert.equal(amountOf(r, 'OR_STT'), dollars(1));
  });

  test('Paid Leave Oregon: employee share fires generically via statePaidLeaveEmployeeTax()', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'OR' },
      }),
    );
    assert.equal(amountOf(r, 'OR_PFML_EE'), dollars(6));
  });

  test('Paid Leave Oregon: employer share only fires when the caller sets certificate.employerLiableForPaidLeaveShare', () => {
    const withoutFlag = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'OR' },
      }),
    );
    assert.equal(withoutFlag.taxes.some((t) => t.id === 'OR_PFML_ER'), false);

    const withFlag = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'OR', certificate: { employerLiableForPaidLeaveShare: true } },
      }),
    );
    assert.equal(amountOf(withFlag, 'OR_PFML_ER'), dollars(4));
  });

  test('TriMet transit district tax (employer-paid) rounds DOWN, not half-up', () => {
    // 1,000 x 0.008237 = 8.237 -> rounds down to $8.23, NOT $8.24.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'OR', certificate: { locality: 'TriMet' } },
      }),
    );
    assert.equal(amountOf(r, 'TRIMET_ER'), dollars(8.23));
    assert.equal(r.taxes.some((t) => t.id === 'LTD_ER'), false);
  });

  test('Lane Transit District tax fires instead of TriMet when certificate.locality is LTD', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'OR', certificate: { locality: 'LTD' } },
      }),
    );
    assert.equal(amountOf(r, 'LTD_ER'), dollars(8));
  });

  test('Metro Supportive Housing Services Tax: nothing below the $200k YTD trigger, taxed above it', () => {
    // $5,000 this week, $199,000 already YTD -> crosses $200,000 mid-cheque:
    // only the $4,000 above the trigger is taxed, at 1% = $40.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(5000) }],
        workState: { code: 'OR', certificate: { metroDistrict: true } },
        ytd: {
          socialSecurity: 0,
          medicare: 0,
          futa: 0,
          localIncomeTax: { OR_METRO: dollars(199000) },
        },
      }),
    );
    assert.equal(amountOf(r, 'OR_METRO_SHS'), dollars(40));
  });

  test('Multnomah PFA: two-tier threshold, both tiers taxed at 1.5% independently once both are crossed', () => {
    // $5,000 this week, $399,000 already YTD -> the FULL $5,000 sits above
    // the $200k tier (1.5%) AND $4,000 of it sits above the $400k tier (an
    // ADDITIONAL 1.5%): 5,000 x 1.5% + 4,000 x 1.5% = 75 + 60 = $135.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(5000) }],
        workState: { code: 'OR', certificate: { multnomahCounty: true } },
        ytd: {
          socialSecurity: 0,
          medicare: 0,
          futa: 0,
          localIncomeTax: { OR_MULTNOMAH: dollars(399000) },
        },
      }),
    );
    assert.equal(amountOf(r, 'OR_MULTNOMAH_PFA'), dollars(135));
  });

  test('an employee inside BOTH the Metro district and Multnomah County gets both local lines', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(5000) }],
        workState: { code: 'OR', certificate: { metroDistrict: true, multnomahCounty: true } },
        ytd: {
          socialSecurity: 0,
          medicare: 0,
          futa: 0,
          localIncomeTax: { OR_METRO: dollars(199000), OR_MULTNOMAH: dollars(399000) },
        },
      }),
    );
    assert.equal(amountOf(r, 'OR_METRO_SHS'), dollars(40));
    assert.equal(amountOf(r, 'OR_MULTNOMAH_PFA'), dollars(135));
  });

  test('below both Portland-area thresholds, neither local line appears at all', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'OR', certificate: { metroDistrict: true, multnomahCounty: true } },
      }),
    );
    assert.equal(r.taxes.some((t) => t.id === 'OR_METRO_SHS'), true);
    assert.equal(amountOf(r, 'OR_METRO_SHS'), 0);
    assert.equal(amountOf(r, 'OR_MULTNOMAH_PFA'), 0);
  });
});

describe('California', () => {
  // Reproduces ALL SIX of EDD's own published worked examples (2026
  // Withholding Schedules, Method B) — a rarer luxury than most states in
  // this project get. Examples A-D use the SAME direct per-period Tables
  // 5-28 this engine implements and match to the cent exactly. Examples E
  // and F use a DIFFERENT valid method EDD itself offers (annualize gross
  // wages and the ANNUAL standard deduction, compute on the annual table,
  // divide back down) — genuinely NOT the same arithmetic path, and EDD's
  // own per-period standard-deduction figures are independently rounded
  // rather than pure annual/N division, so the two methods land a cent or
  // two apart on the same inputs. E/F below assert the CORRECT answer for
  // THIS function's own (primary, per-period-table) method, not EDD's
  // published annualized-method answer — see californiaWithholding()'s own
  // doc comment for the full arithmetic showing both paths.
  const caState = (certificate: Record<string, unknown> = {}) => ({
    workState: { code: 'CA', certificate },
  });

  test('Example A: weekly $210, single, 1 allowance — below the Low Income Exemption threshold, $0', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(210) }],
        ...caState({ filingStatus: 'single_or_married_two_incomes', regularAllowances: 1 }),
      }),
    );
    assert.equal(amountOf(r, 'CA_SIT'), 0);
  });

  test('Example B: biweekly $1,600, married, 2 regular + 1 estimated-deduction allowance -> $2.38', () => {
    // The estimated-deduction allowance is NOT counted toward the Table 4
    // exemption credit (Method B's own footnote 1) — only the 2 regular
    // ones are. $1,600 - $38 (Table 2, 1 allowance) = $1,562 - $439
    // (Table 3, married/2+ allowances) = $1,123 taxable -> Table 27 bracket
    // [$852-$2,020, base $9.37, 2.2%]: $9.37 + 2.2%x$271 = $15.33 - $12.95
    // (Table 4, 2 allowances) = $2.38.
    const r = calculatePaycheck(
      input({
        payFrequency: 'biweekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1600) }],
        ...caState({ filingStatus: 'married_one_income', regularAllowances: 2, estimatedDeductionAllowances: 1 }),
      }),
    );
    assert.equal(amountOf(r, 'CA_SIT'), dollars(2.38));
  });

  test('Example C: monthly $5,100, married, 5 allowances -> $0.82', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'monthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(5100) }],
        ...caState({ filingStatus: 'married_one_income', regularAllowances: 5 }),
      }),
    );
    assert.equal(amountOf(r, 'CA_SIT'), dollars(0.82));
  });

  test('Example D: weekly $950, head of household, 3 allowances -> $1.69', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(950) }],
        ...caState({ filingStatus: 'hoh', regularAllowances: 3 }),
      }),
    );
    assert.equal(amountOf(r, 'CA_SIT'), dollars(1.69));
  });

  test('Example E scenario (semi-monthly $2,400, married, 4 allowances): $4.11 via this method, NOT EDD\'s own $4.13 annualized-method answer', () => {
    // Direct per-period path (this function): $2,400 - $476 (Table 3,
    // married/2+, semimonthly) = $1,924 taxable -> Table 18 bracket
    // [$924-$2,188, base $10.16, 2.2%]: $10.16 + 2.2%x$1,000 = $32.16 -
    // $28.05 (Table 4, 4 allowances) = $4.11. EDD's OWN example computes
    // this via annualizing first ($57,600 - $11,412 = $46,188 taxable,
    // $772.40 computed, -$673.20 credit = $99.20/yr / 24 = $4.13) — a
    // genuinely different, EDD-sanctioned method this engine doesn't
    // implement, landing 2 cents apart due to the semimonthly Table 3
    // figure ($476) not being pure annual-divided-by-24 ($475.50).
    const r = calculatePaycheck(
      input({
        payFrequency: 'semimonthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2400) }],
        ...caState({ filingStatus: 'married_one_income', regularAllowances: 4 }),
      }),
    );
    assert.equal(amountOf(r, 'CA_SIT'), dollars(4.11));
  });

  test('Example F scenario (monthly $4,750, married, 4 allowances): $7.15 via this method, NOT EDD\'s own $7.17 annualized-method answer', () => {
    // Same divergence class as Example E, for the same disclosed reason.
    const r = calculatePaycheck(
      input({
        payFrequency: 'monthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(4750) }],
        ...caState({ filingStatus: 'married_one_income', regularAllowances: 4 }),
      }),
    );
    assert.equal(amountOf(r, 'CA_SIT'), dollars(7.15));
  });

  test('no DE 4 on file defaults to Single with zero allowances', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(950) }],
        workState: { code: 'CA' },
      }),
    );
    // Same $950 weekly wage as Example D, but single/0-allowances instead
    // of HOH/3-allowances: threshold $363 (lower bucket) crossed, std
    // deduction $110 (lower), taxable $840 -> Table 23 bracket
    // [$797-$1,107, base $21.61, 6.6%]: $21.61 + 6.6%x$43 = $24.45, no
    // credit (0 allowances) = $24.45.
    assert.equal(amountOf(r, 'CA_SIT'), dollars(24.45));
  });

  test('SDI: $1,000 x 1.3%, uncapped', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'CA' },
      }),
    );
    assert.equal(amountOf(r, 'CA_DBL_EE'), dollars(13));
  });
});

describe('Colorado', () => {
  // DR 1098 publishes no full worked example with a stated dollar answer
  // the way California/Utah's guides do, so these are hand-derived from
  // the worksheet's own formula, independently verified before running.
  const coState = (certificate: Record<string, unknown> = {}) => ({
    workState: { code: 'CO', certificate },
  });

  test('single/other filing status, weekly $1,000: $5,500 deduction, 4.40% flat', () => {
    // Annual 52,000 - 5,500 = 46,500 x 4.40% = 2,046.00/yr / 52 = 39.346... -> $39.35.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...coState({ filingStatus: 'single' }),
      }),
    );
    assert.equal(amountOf(r, 'CO_SIT'), dollars(39.35));
  });

  test('MFJ gets the $11,000 deduction, not $5,500', () => {
    // Annual 52,000 - 11,000 = 41,000 x 4.40% = 1,804.00/yr / 52 = 34.6923... -> $34.69.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...coState({ filingStatus: 'mfj' }),
      }),
    );
    assert.equal(amountOf(r, 'CO_SIT'), dollars(34.69));
  });

  test('DR 0004 Line 2 REPLACES the flat deduction, not adds to it', () => {
    // Same wages/status as the first test, but an $8,000 DR 0004 override
    // instead of the $5,500 default: 52,000 - 8,000 = 44,000 x 4.40% =
    // 1,936.00/yr / 52 = 37.2307... -> $37.23 (not $39.35).
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...coState({ filingStatus: 'single', dr0004Line2Amount: 8000 }),
      }),
    );
    assert.equal(amountOf(r, 'CO_SIT'), dollars(37.23));
  });

  test('no W-4/DR 0004 on file defaults to single ($5,500 deduction)', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'CO' },
      }),
    );
    assert.equal(amountOf(r, 'CO_SIT'), dollars(39.35));
  });

  test('FAMLI employee share: $1,000 x 0.44%', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'CO' },
      }),
    );
    assert.equal(amountOf(r, 'CO_PFML_EE'), dollars(4.4));
  });

  test('FAMLI employer share (10+ employees): total premium less employee share', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'CO', certificate: { employerLiableForPaidLeaveShare: true } },
      }),
    );
    // Total premium 1,000 x 0.88% = 8.80, less employee share (4.40) = 4.40.
    assert.equal(amountOf(r, 'CO_PFML_ER'), dollars(4.4));
  });

  test('no FAMLI employer-share line by default (under-10-employee assumption)', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'CO' },
      }),
    );
    assert.equal(r.taxes.some((t) => t.id === 'CO_PFML_ER'), false);
  });
});

describe('Utah', () => {
  // Reproduces ALL SIX of Publication 14's own worked examples exactly —
  // see utahWithholding()'s own doc comment for why the whole-dollar
  // rounding at lines 2 and 5 specifically (not just the final answer) is
  // what makes these match.
  const utState = (certificate: Record<string, unknown> = {}) => ({
    workState: { code: 'UT', certificate },
  });

  test('Example 1: weekly $400, single -> $12', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(400) }],
        ...utState({ maritalStatus: 'single' }),
      }),
    );
    assert.equal(amountOf(r, 'UT_SIT'), dollars(12));
  });

  test('Example 2: biweekly $2,600, single -> $116 (allowance fully phased out to $0)', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'biweekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2600) }],
        ...utState({ maritalStatus: 'single' }),
      }),
    );
    assert.equal(amountOf(r, 'UT_SIT'), dollars(116));
  });

  test('Example 3: semimonthly $1,200, married -> $18', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'semimonthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1200) }],
        ...utState({ maritalStatus: 'married' }),
      }),
    );
    assert.equal(amountOf(r, 'UT_SIT'), dollars(18));
  });

  test('Example 4: monthly $7,800, married -> $347 (allowance fully phased out to $0)', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'monthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(7800) }],
        ...utState({ maritalStatus: 'married' }),
      }),
    );
    assert.equal(amountOf(r, 'UT_SIT'), dollars(347));
  });

  test('Example 5: quarterly $9,000, single -> $367 (line 2 rounds $400.50 up to $401)', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'quarterly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(9000) }],
        ...utState({ maritalStatus: 'single' }),
      }),
    );
    assert.equal(amountOf(r, 'UT_SIT'), dollars(367));
  });

  test('Example 6: daily $175, married -> $5', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'daily',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(175) }],
        ...utState({ maritalStatus: 'married' }),
      }),
    );
    assert.equal(amountOf(r, 'UT_SIT'), dollars(5));
  });

  test('head of household folds into the single schedule, per Publication 14\'s own note', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(400) }],
        ...utState({ maritalStatus: 'hoh' }),
      }),
    );
    assert.equal(amountOf(r, 'UT_SIT'), dollars(12));
  });
});

describe('Maryland', () => {
  // No official worked example with a stated dollar answer was found in
  // the 2026 guide the way California/Rhode Island's own sources
  // provided, so these fixtures are hand-derived from the guide's own
  // formula (state bracket + county rate, both on the same taxable
  // income) — but the STATE+LOCAL COMBINATION logic itself was verified
  // separately first: reconstructing state brackets 4-10 (4.75/5.00/5.25/
  // 5.50/5.75/6.25/6.50%) each plus the guide's own published "2.25%
  // local" table reproduces its stated combined rates (7.00/7.25/7.50/
  // 7.75/8.00/8.50/8.75%) exactly, 7-for-7, before any of this was
  // written into a test.
  const mdState = (certificate: Record<string, unknown> = {}) => ({
    workState: { code: 'MD', certificate },
  });

  test('Worcester County (flat 2.25%), single, 0 exemptions, annual $80,000', () => {
    // Taxable: 80,000 - 3,400 = 76,600. State (single, bracket [3,000-
    // 100,000], base $90, 4.75%): 90 + 4.75%x73,600 = 90+3,496=3,586.00.
    // Local (Worcester 2.25% flat): 76,600 x 2.25% = 1,723.50. Combined:
    // 3,586.00 + 1,723.50 = 5,309.50.
    const r = calculatePaycheck(
      input({
        payFrequency: 'annual',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(80000) }],
        ...mdState({ filingStatus: 'single', exemptions: 0, county: 'Worcester' }),
      }),
    );
    assert.equal(amountOf(r, 'MD_SIT'), dollars(5309.5));
  });

  test('Anne Arundel County (TIERED local rate), MFJ/HOH, 2 exemptions, annual $120,000', () => {
    // Taxable: 120,000 - 3,400 - 2x3,200 = 110,200. State (mfjHoh, bracket
    // [3,000-150,000], base $90, 4.75%): 90+4.75%x107,200=90+5,092=5,182.00.
    // Local (Anne Arundel mfjHoh tiered, [75,000-480,000], base $2,025,
    // 2.94%): 2,025+2.94%x35,200=2,025+1,034.88=3,059.88. Combined:
    // 5,182.00+3,059.88=8,241.88.
    const r = calculatePaycheck(
      input({
        payFrequency: 'annual',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(120000) }],
        ...mdState({ filingStatus: 'mfjHoh', exemptions: 2, county: 'AnneArundel' }),
      }),
    );
    assert.equal(amountOf(r, 'MD_SIT'), dollars(8241.88));
  });

  test('Frederick County (TIERED local rate), single, 1 exemption, annual $60,000', () => {
    // Taxable: 60,000-3,400-3,200=53,400. State: same bracket as above,
    // 90+4.75%x50,400=90+2,394=2,484.00. Local (Frederick single tiered,
    // [50,000-150,000], base $1,250, 2.96%): 1,250+2.96%x3,400=1,250+
    // 100.64=1,350.64. Combined: 2,484.00+1,350.64=3,834.64.
    const r = calculatePaycheck(
      input({
        payFrequency: 'annual',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(60000) }],
        ...mdState({ filingStatus: 'single', exemptions: 1, county: 'Frederick' }),
      }),
    );
    assert.equal(amountOf(r, 'MD_SIT'), dollars(3834.64));
  });

  test('no certificate at all defaults to the maximum 3.30% local rate', () => {
    // Same $80,000/single/0-exemption base as the Worcester test, but the
    // no-cert default local rate (3.30%) instead of Worcester's 2.25%:
    // 76,600 x 3.30% = 2,527.80. Combined: 3,586.00+2,527.80=6,113.80.
    const r = calculatePaycheck(
      input({
        payFrequency: 'annual',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(80000) }],
        workState: { code: 'MD' },
      }),
    );
    assert.equal(amountOf(r, 'MD_SIT'), dollars(6113.8));
  });

  test('nonresident uses the flat 2.25% Special Nonresident Rate, not a county lookup', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'annual',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(80000) }],
        ...mdState({ filingStatus: 'single', exemptions: 0, nonresident: true }),
      }),
    );
    // Same figure as the Worcester test (2.25% happens to match Worcester's
    // own flat rate) -- confirms the nonresident PATH itself is exercised
    // and produces the correct combined amount, not that the two are
    // indistinguishable in general.
    assert.equal(amountOf(r, 'MD_SIT'), dollars(5309.5));
  });

  test('reciprocity: a Pennsylvania resident working in Maryland owes $0 MD tax', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'annual',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(80000) }],
        ...mdState({ filingStatus: 'single', exemptions: 0, county: 'Worcester' }),
        residenceState: { code: 'PA' },
      }),
    );
    assert.equal(amountOf(r, 'MD_SIT'), 0);
  });
});

describe('Rhode Island', () => {
  const riState = (certificate: Record<string, unknown> = {}) => ({
    workState: { code: 'RI', certificate },
  });

  test("reproduces the booklet's own worked example: weekly $2,195, 1 exemption -> $87.57", () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2195) }],
        ...riState({ exemptions: 1 }),
      }),
    );
    assert.equal(amountOf(r, 'RI_SIT'), dollars(87.57));
  });

  test('exemption phases out entirely (a cliff) once weekly wages exceed $5,592.31', () => {
    // Weekly $6,000, 2 exemptions -- wages exceed the $5,592.31 weekly
    // threshold, so the exemption is $0 despite 2 being claimed. Net =
    // $6,000, bracket [3,586-inf, base $154.56, 5.99%]: 154.56 +
    // 5.99%x2,414 = 154.56+144.60=299.16.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(6000) }],
        ...riState({ exemptions: 2 }),
      }),
    );
    assert.equal(amountOf(r, 'RI_SIT'), dollars(299.16));
  });

  test('TDI: $1,000 x 1.1%', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'RI' },
      }),
    );
    assert.equal(amountOf(r, 'RI_DBL_EE'), dollars(11));
  });

  test('no reciprocity: a Massachusetts resident working in RI still owes ordinary RI withholding', () => {
    const withMA = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2195) }],
        ...riState({ exemptions: 1 }),
        residenceState: { code: 'MA' },
      }),
    );
    assert.equal(amountOf(withMA, 'RI_SIT'), dollars(87.57));
  });
});

describe('District of Columbia', () => {
  const dcState = (certificate: Record<string, unknown> = {}) => ({
    workState: { code: 'DC', certificate },
  });

  test('annual $50,000, 1 allowance', () => {
    // Taxable: 50,000-4,300=45,700. Bracket [40,000-60,000, base $2,200,
    // 6.5%]: 2,200+6.5%x5,700=2,200+370.50=2,570.50.
    const r = calculatePaycheck(
      input({
        payFrequency: 'annual',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(50000) }],
        ...dcState({ allowances: 1 }),
      }),
    );
    assert.equal(amountOf(r, 'DC_SIT'), dollars(2570.5));
  });

  test('biweekly $2,000, 0 allowances', () => {
    // Annual 2,000x26=52,000. Bracket [40,000-60,000, base $2,200, 6.5%]:
    // 2,200+6.5%x12,000=2,200+780=2,980.00/yr / 26 = 114.6153... -> $114.62.
    const r = calculatePaycheck(
      input({
        payFrequency: 'biweekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2000) }],
        workState: { code: 'DC' },
      }),
    );
    assert.equal(amountOf(r, 'DC_SIT'), dollars(114.62));
  });

  test('DC does not tax nonresident wages at all (Home Rule Act), regardless of residence state', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'annual',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(200000) }],
        ...dcState({ nonresident: true }),
      }),
    );
    assert.equal(amountOf(r, 'DC_SIT'), 0);
  });
});

describe('Virginia', () => {
  // VA was built to calc-code specifically to unblock proving PA
  // reciprocity's outbound direction through the real engine (VA-2026.json
  // was previously data-only). Expected values hand-derived from the
  // Income Tax Withholding Guide's own formula before running, same
  // discipline as every other state here.
  const vaState = (certificate: Record<string, unknown> = {}) => ({
    workState: { code: 'VA', certificate },
  });

  test("reproduces the Guide's own worked example to the cent: semimonthly $2,649, 5 personal exemptions", () => {
    // A = 2,649 x 24 = 63,576. T = 63,576 - [8,750 + 5x930] = 50,176.
    // Over $17,000: 720 + 5.75%x(50,176-17,000=33,176) = 720 + 1,907.62,
    // rounded to the nearest WHOLE DOLLAR before adding (the Guide's own
    // non-obvious step) = 720 + 1,908 = 2,628/yr / 24 = $109.50/period.
    const r = calculatePaycheck(
      input({
        payFrequency: 'semimonthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2649) }],
        ...vaState({ personalExemptions: 5 }),
      }),
    );
    assert.equal(amountOf(r, 'VA_SIT'), dollars(109.5));
  });

  test('the age/blind exemption (E2, $800) is tracked separately from the personal exemption (E1, $930)', () => {
    // Annual $50,000, 0 personal + 1 age/blind exemption.
    // T = 50,000 - [8,750 + 0 + 1x800] = 40,450. Over $17,000: 720 +
    // 5.75%x(40,450-17,000=23,450) = 720 + 1,348.375 -> rounds to 1,348
    // = $2,068.00/yr (annual frequency, no further division).
    const r = calculatePaycheck(
      input({
        payFrequency: 'annual',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(50000) }],
        ...vaState({ ageOrBlindExemptions: 1 }),
      }),
    );
    assert.equal(amountOf(r, 'VA_SIT'), dollars(2068.0));
  });

  test('reciprocity: PA/MD/WV residents owe $0 VA tax unconditionally', () => {
    for (const code of ['PA', 'MD', 'WV']) {
      const r = calculatePaycheck(
        input({
          payFrequency: 'semimonthly',
          earnings: [{ code: 'REG', category: 'regular', amount: dollars(2649) }],
          residenceState: { code },
          ...vaState({ personalExemptions: 5 }),
        }),
      );
      assert.equal(amountOf(r, 'VA_SIT'), 0, `expected $0 VA tax for a ${code} resident`);
    }
  });

  test("reciprocity's KY/DC commuter gate: a daily commuter owes $0, a non-commuter owes full VA tax", () => {
    // This is the bug VA-4's own narrowerCommuterException field already
    // documented — before this pass, KY/DC weren't even in VA's own
    // reciprocalStates array, so the commuter gate could never fire at all
    // (reciprocityExemptionReason() checks reciprocalStates FIRST). Now
    // wired end-to-end.
    const commuter = calculatePaycheck(
      input({
        payFrequency: 'semimonthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2649) }],
        residenceState: { code: 'KY', certificate: { dailyCommuter: true } },
        ...vaState({ personalExemptions: 5 }),
      }),
    );
    assert.equal(amountOf(commuter, 'VA_SIT'), 0);

    const nonCommuter = calculatePaycheck(
      input({
        payFrequency: 'semimonthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2649) }],
        residenceState: { code: 'KY' },
        ...vaState({ personalExemptions: 5 }),
      }),
    );
    assert.equal(amountOf(nonCommuter, 'VA_SIT'), dollars(109.5));
  });
});

describe('West Virginia', () => {
  // WV was built to calc-code alongside VA, same motivation. Uses genuine
  // per-period tables (no annualize/divide) — hand-derived independently
  // from IT-100.2A's own weekly table before running.
  const wvState = (certificate: Record<string, unknown> = {}) => ({
    workState: { code: 'WV', certificate },
  });

  test('weekly $800, 1 exemption, default Two Earner table: $23.74', () => {
    // Taxable = 800 - 38.46 = 761.54. Bracket [577-866, base 15.95, 4.22%]:
    // 15.95 + 4.22%x(761.54-577=184.54) = 15.95 + 7.79 = $23.74.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(800) }],
        ...wvState({ exemptions: 1 }),
      }),
    );
    assert.equal(amountOf(r, 'WV_SIT'), dollars(23.74));
  });

  test('weekly $800, 1 exemption, One Earner/One Job elected (IT-104 Line 5): $21.04', () => {
    // Same taxable $761.54, but the ONE-EARNER table's bracket [481-769,
    // base 12.17, 3.16%] applies instead: 12.17 + 3.16%x(761.54-481=280.54)
    // = 12.17 + 8.87 = $21.04 — less withheld than the default table, as
    // expected (opting in is only available to single filers/one-job
    // households, and produces LOWER withholding, per IT-104's own design).
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(800) }],
        ...wvState({ exemptions: 1, oneEarnerElection: true }),
      }),
    );
    assert.equal(amountOf(r, 'WV_SIT'), dollars(21.04));
  });

  test('no certificate on file defaults to 0 exemptions and the (higher-withholding) Two Earner table: $25.36', () => {
    // Taxable = 800 - 0 = 800. Bracket [577-866, base 15.95, 4.22%]:
    // 15.95 + 4.22%x(800-577=223) = 15.95 + 9.41 = $25.36.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(800) }],
        workState: { code: 'WV' },
      }),
    );
    assert.equal(amountOf(r, 'WV_SIT'), dollars(25.36));
  });

  test('reciprocity: a Pennsylvania resident working in West Virginia owes $0 WV tax', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(800) }],
        residenceState: { code: 'PA' },
        ...wvState({ exemptions: 1 }),
      }),
    );
    assert.equal(amountOf(r, 'WV_SIT'), 0);
  });
});

describe('North Carolina', () => {
  const ncState = (certificate: Record<string, unknown> = {}) => ({
    workState: { code: 'NC', certificate },
  });

  test('weekly $1,000, Single/Married, 1 allowance: $29', () => {
    // Annual 1,000x52=52,000. Less $12,750 standard deduction, less
    // 1x$2,500 allowance = $36,750 taxable. x4.09% = $1,503.08/yr (cent-
    // rounded) / 52 = $28.91 -> rounds to the nearest WHOLE DOLLAR ($29),
    // per NC-30's own explicit rounding instruction.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...ncState({ allowances: 1 }),
      }),
    );
    assert.equal(amountOf(r, 'NC_SIT'), dollars(29));
  });

  test('weekly $1,000, Head of Household, 0 allowances: $26', () => {
    // Annual 52,000 less the HIGHER $19,125 HoH standard deduction (no
    // separate Married table exists in NC's formula -- this is the ONLY
    // status split) = $32,875 taxable. x4.09% = $1,344.59/yr / 52 =
    // $25.86 -> rounds to $26.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        ...ncState({ filingStatus: 'head_of_household' }),
      }),
    );
    assert.equal(amountOf(r, 'NC_SIT'), dollars(26));
  });

  test('no reciprocity with any state', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        residenceState: { code: 'VA' },
        ...ncState({ allowances: 1 }),
      }),
    );
    assert.equal(amountOf(r, 'NC_SIT'), dollars(29));
  });
});

describe('South Carolina', () => {
  const scState = (certificate: Record<string, unknown> = {}) => ({
    workState: { code: 'SC', certificate },
  });

  test("reproduces WH-1603F's own worked example exactly: weekly $750, 3 allowances -> $10.58", () => {
    // Annual 750x52=39,000. Personal allowance 3x$5,000=$15,000. Standard
    // deduction 10%x39,000=$3,900 (under the $7,500 cap). Taxable
    // $20,100. Bracket 3 (>=$18,230): $437.70 + 6%x($20,100-18,230=1,870
    // =$112.20) = $549.90/yr / 52 = $10.5750 -> $10.58/week. No
    // whole-dollar rounding in South Carolina, unlike NC/VA.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(750) }],
        ...scState({ allowances: 3 }),
      }),
    );
    assert.equal(amountOf(r, 'SC_SIT'), dollars(10.58));
  });

  test('0 allowances forfeits BOTH the personal allowance AND the standard deduction at once', () => {
    // Annual 500x52=26,000, NO deductions at all (the all-or-nothing
    // quirk WH-1603F's own text confirms). Bracket 3: $437.70 +
    // 6%x(26,000-18,230=7,770=$466.20) = $903.90/yr / 52 = $17.3827 ->
    // $17.38/week.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(500) }],
        workState: { code: 'SC' },
      }),
    );
    assert.equal(amountOf(r, 'SC_SIT'), dollars(17.38));
  });

  test('no reciprocity with any state', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(750) }],
        residenceState: { code: 'NC' },
        ...scState({ allowances: 3 }),
      }),
    );
    assert.equal(amountOf(r, 'SC_SIT'), dollars(10.58));
  });
});

describe('Arkansas', () => {
  const arState = (certificate: Record<string, unknown> = {}) => ({
    workState: { code: 'AR', certificate },
  });

  test("reproduces the Formula Method's own worked example exactly: monthly $2,127, 2 exemptions -> $36.50", () => {
    // Annual 2,127x12=25,524, less $2,470 standard deduction = $23,054
    // net taxable. Midrange-rounded to $23,050 (nearest $50 of the
    // $23,000-$23,100 band). Bracket [$16,000-$26,400, 3.4%, adjustment
    // $287.97]: 23,050x3.4%=$783.70, less $287.97 = $495.73, ROUNDED to
    // $496.00 (a genuine mid-formula whole-dollar step). Less $58.00
    // credit (2x$29) = $438.00 annual net tax / 12 = $36.50.
    const r = calculatePaycheck(
      input({
        payFrequency: 'monthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2127) }],
        ...arState({ exemptions: 2 }),
      }),
    );
    assert.equal(amountOf(r, 'AR_SIT'), dollars(36.5));
  });

  test('$50-midrange rounding applies at low income too, not just the top phase-in zone: weekly $200, 0 exemptions -> $0.90', () => {
    // Annual 200x52=10,400, less $2,470 = $7,930 net taxable. Midrange-
    // rounded to $7,950. Bracket [$5,600-$11,200, 2%, adjustment
    // $111.98]: 7,950x2%=$159.00, less $111.98 = $47.02, rounds to
    // $47.00. No exemptions, so annual net tax stays $47.00 / 52 = $0.90.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(200) }],
        workState: { code: 'AR' },
      }),
    );
    assert.equal(amountOf(r, 'AR_SIT'), dollars(0.9));
  });

  test('no reciprocity with any state', () => {
    const r = calculatePaycheck(
      input({
        payFrequency: 'monthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2127) }],
        residenceState: { code: 'TN' },
        ...arState({ exemptions: 2 }),
      }),
    );
    assert.equal(amountOf(r, 'AR_SIT'), dollars(36.5));
  });
});

describe('Alabama', () => {
  // Alabama's own formula subtracts the employee's ANNUAL FEDERAL
  // WITHHOLDING as a deduction component -- this describe block isolates
  // the AL-only math with a federal-exempt certificate first, then proves
  // the cross-tax dependency actually wires through separately.
  test("reproduces the withholding booklet's own worked example structure: weekly $850, 'M-2', federal exempt -> $31.35", () => {
    // GI = 850x52 = $44,200. Standard deduction (MFJ, GI >= $35,500
    // ceiling): floor $5,000. Personal exemption (M): $3,000. 2
    // dependents x $1,000 (GI <= $50,000 tier) = $2,000. Federal
    // withholding = $0 (exempt, isolating AL-only math from the booklet's
    // own stale example federal figure). Total deductions = $10,000.
    // Taxable = $34,200. Married bracket [$6,000+, base $220, 5%]:
    // 220 + 5%x(34,200-6,000=28,200=$1,410) = $1,630.00/yr / 52 = $31.35.
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(850) }],
        workState: { code: 'AL', certificate: { alabamaExemptionCode: 'M', dependents: 2 } },
        federalW4: {
          filingStatus: 'married_joint',
          multipleJobs: false,
          dependentCredit: 0,
          otherIncome: 0,
          deductions: 0,
          extraWithholding: 0,
          exempt: true,
        },
      }),
    );
    assert.equal(amountOf(r, 'AL_SIT'), dollars(31.35));
  });

  test('federal withholding actually reduces the AL taxable base (cross-tax dependency wired through)', () => {
    const fixture = {
      payFrequency: 'weekly' as const,
      earnings: [{ code: 'REG', category: 'regular', amount: dollars(850) }],
      workState: {
        code: 'AL',
        certificate: { alabamaExemptionCode: 'M', dependents: 2 },
      },
    };
    const withFederalExempt = calculatePaycheck(
      input({
        ...fixture,
        federalW4: {
          filingStatus: 'married_joint',
          multipleJobs: false,
          dependentCredit: 0,
          otherIncome: 0,
          deductions: 0,
          extraWithholding: 0,
          exempt: true,
        },
      }),
    );
    const withRealFederal = calculatePaycheck(input(fixture)); // default federalW4, not exempt
    const federalWithheld = amountOf(withRealFederal, 'US_FIT');
    assert.ok(federalWithheld > 0, 'fixture must actually produce nonzero federal withholding to test this');
    assert.ok(
      amountOf(withRealFederal, 'AL_SIT') < amountOf(withFederalExempt, 'AL_SIT'),
      'more federal withholding should mean less AL taxable income, and therefore less AL tax',
    );
  });

  test('the standard deduction step function matches the booklet\'s own Schedule table for Single status', () => {
    // Single/"0", GI = $26,000 (weekly $500 x 52) -- $1 above the $25,999
    // threshold, which the booklet's own table shows still rounds UP to
    // ONE full $500 increment: $3,000 - $25 = $2,975 standard deduction.
    // Personal exemption $0 ("0" code). No dependents, no federal
    // withholding (exempt).
    const r = calculatePaycheck(
      input({
        payFrequency: 'weekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(500) }],
        workState: { code: 'AL', certificate: { alabamaExemptionCode: '0' } },
        federalW4: {
          filingStatus: 'single',
          multipleJobs: false,
          dependentCredit: 0,
          otherIncome: 0,
          deductions: 0,
          extraWithholding: 0,
          exempt: true,
        },
      }),
    );
    // Taxable = 26,000 - 2,975 = 23,025. Non-married bracket
    // [$3,000+, base $110, 5%]: 110 + 5%x(23,025-3,000=20,025=$1,001.25)
    // = $1,111.25/yr / 52 = $21.37 (roundHalfUp of 21.370192...).
    assert.equal(amountOf(r, 'AL_SIT'), dollars(21.37));
  });
});

describe('Georgia', () => {
  const gaState = (certificate: Record<string, unknown> = {}) => ({
    workState: { code: 'GA', certificate },
  });

  test("reproduces the guide's own POST-2026-05-11 Table E example exactly: semimonthly $2,000, MFJ, 1 dependent -> $27.03", () => {
    const r = calculatePaycheck(
      input({
        checkDate: '2026-06-15',
        payFrequency: 'semimonthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2000) }],
        ...gaState({ filingStatus: 'married_filing_joint', dependents: 1 }),
      }),
    );
    assert.equal(amountOf(r, 'GA_SIT'), dollars(27.03));
  });

  test("reproduces the guide's own POST-2026-05-11 Table F example exactly: biweekly $935, Head of Household, 2 dependents -> $0.00", () => {
    const r = calculatePaycheck(
      input({
        checkDate: '2026-06-15',
        payFrequency: 'biweekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(935) }],
        ...gaState({ dependents: 2 }),
      }),
    );
    assert.equal(amountOf(r, 'GA_SIT'), 0);
  });

  test("reproduces the guide's own PRE-2026-05-11 Table E example exactly: semimonthly $1,470.83, MFJ, 1 dependent -> $15.79 (5.19% rate, old deduction)", () => {
    // Confirms the mid-year HB463 transition actually dispatches on
    // checkDate: a payroll BEFORE 2026-05-11 must still use the old
    // 5.19%/$24,000/$4,000 table, not the new one.
    const r = calculatePaycheck(
      input({
        checkDate: '2026-03-15',
        payFrequency: 'semimonthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1470.83) }],
        ...gaState({ filingStatus: 'married_filing_joint', dependents: 1 }),
      }),
    );
    assert.equal(amountOf(r, 'GA_SIT'), dollars(15.79));
  });

  test("reproduces the guide's own PRE-2026-05-11 Table F example exactly: biweekly $730.77, Head of Household, 2 dependents -> $0.00", () => {
    const r = calculatePaycheck(
      input({
        checkDate: '2026-03-15',
        payFrequency: 'biweekly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(730.77) }],
        ...gaState({ dependents: 2 }),
      }),
    );
    assert.equal(amountOf(r, 'GA_SIT'), 0);
  });

  test('no reciprocity with any state', () => {
    const r = calculatePaycheck(
      input({
        checkDate: '2026-06-15',
        payFrequency: 'semimonthly',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2000) }],
        residenceState: { code: 'AL' },
        ...gaState({ filingStatus: 'married_filing_joint', dependents: 1 }),
      }),
    );
    assert.equal(amountOf(r, 'GA_SIT'), dollars(27.03));
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

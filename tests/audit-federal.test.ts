import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { calculatePaycheck } from '../src/calculate.ts';
import { dollars } from '../src/money.ts';
import type { PaycheckInput } from '../src/types.ts';

/**
 * federal-verifier audit, 2026-09-26.
 *
 * Every expected value here was taken from, or hand-computed from, the
 * primary source re-read on 2026-09-26 — never captured from the engine:
 *   - IRS Publication 15-T (2026), https://www.irs.gov/pub/irs-pdf/p15t.pdf
 *     (Worksheet 1A p.10, Annual Percentage Method tables p.12, NRA Table 2
 *     p.7, BIWEEKLY Wage Bracket Method tables pp.17-19)
 *   - IRS Publication 15 (2026), https://www.irs.gov/pub/irs-pdf/p15.pdf
 *   - IRS Notice 2025-67, https://www.irs.gov/pub/irs-drop/n-25-67.pdf
 *   - RRB, Railroad Retirement and Unemployment Insurance Taxes in 2026,
 *     https://www.rrb.gov/Newsroom/NewsReleases/RetirementUnemploymentInsuranceTaxes
 *
 * Pub 15-T (2026) prints no worked Worksheet 1A example, so each schedule is
 * proven two ways: (1) against a figure the IRS itself printed — the
 * BIWEEKLY wage-bracket table, whose every cell (178 rows x 6 columns, all
 * checked offline) equals the Worksheet 1A result at the row's midpoint,
 * rounded to whole dollars; and (2) a hand-computed top-bracket case.
 */

const fed = JSON.parse(
  readFileSync(new URL('../data/federal/2026.json', import.meta.url), 'utf8'),
);

type Status = 'single' | 'married_joint' | 'head_of_household';

function paycheck(
  gross: number,
  opts: {
    freq?: PaycheckInput['payFrequency'];
    status?: Status;
    multipleJobs?: boolean;
    nra?: boolean;
    category?: 'regular' | 'supplemental';
    ytd?: Partial<PaycheckInput['ytd']>;
    employmentCategory?: PaycheckInput['employmentCategory'];
  } = {},
) {
  return calculatePaycheck({
    checkDate: '2026-06-15',
    payFrequency: opts.freq ?? 'biweekly',
    earnings: [{ code: 'E', category: opts.category ?? 'regular', amount: dollars(gross) }],
    deductions: [],
    federalW4: {
      filingStatus: opts.status ?? 'single',
      multipleJobs: opts.multipleJobs ?? false,
      dependentCredit: 0,
      otherIncome: 0,
      deductions: 0,
      extraWithholding: 0,
      ...(opts.nra ? { nonresidentAlien: true } : {}),
    },
    ytd: { socialSecurity: 0, medicare: 0, futa: 0, ...opts.ytd },
    ...(opts.employmentCategory ? { employmentCategory: opts.employmentCategory } : {}),
  } as PaycheckInput);
}

function amt(r: ReturnType<typeof calculatePaycheck>, id: string): number {
  const line = r.taxes.find((t) => t.id === id);
  assert.ok(line, `expected tax line ${id}`);
  return line.amount;
}

// ---------------------------------------------------------------------------
// Data: every figure, straight from the printed source.
// ---------------------------------------------------------------------------

// Pub 15-T (2026) p.12, columns A / B / C / D, transcribed row by row.
const PUB15T_ANNUAL: Record<string, Record<Status, [number, number | null, number, number][]>> = {
  standardSchedules: {
    married_joint: [
      [0, 19300, 0, 0], [19300, 44100, 0, 0.1], [44100, 120100, 2480, 0.12],
      [120100, 230700, 11600, 0.22], [230700, 422850, 35932, 0.24],
      [422850, 531750, 82048, 0.32], [531750, 788000, 116896, 0.35], [788000, null, 206583.5, 0.37],
    ],
    single: [
      [0, 7500, 0, 0], [7500, 19900, 0, 0.1], [19900, 57900, 1240, 0.12],
      [57900, 113200, 5800, 0.22], [113200, 209275, 17966, 0.24],
      [209275, 263725, 41024, 0.32], [263725, 648100, 58448, 0.35], [648100, null, 192979.25, 0.37],
    ],
    head_of_household: [
      [0, 15550, 0, 0], [15550, 33250, 0, 0.1], [33250, 83000, 1770, 0.12],
      [83000, 121250, 7740, 0.22], [121250, 217300, 16155, 0.24],
      [217300, 271750, 39207, 0.32], [271750, 656150, 56631, 0.35], [656150, null, 191171, 0.37],
    ],
  },
  multipleJobsSchedules: {
    married_joint: [
      [0, 16100, 0, 0], [16100, 28500, 0, 0.1], [28500, 66500, 1240, 0.12],
      [66500, 121800, 5800, 0.22], [121800, 217875, 17966, 0.24],
      [217875, 272325, 41024, 0.32], [272325, 400450, 58448, 0.35], [400450, null, 103291.75, 0.37],
    ],
    single: [
      [0, 8050, 0, 0], [8050, 14250, 0, 0.1], [14250, 33250, 620, 0.12],
      [33250, 60900, 2900, 0.22], [60900, 108938, 8983, 0.24],
      [108938, 136163, 20512, 0.32], [136163, 328350, 29224, 0.35], [328350, null, 96489.63, 0.37],
    ],
    head_of_household: [
      [0, 12075, 0, 0], [12075, 20925, 0, 0.1], [20925, 45800, 885, 0.12],
      [45800, 64925, 3870, 0.22], [64925, 112950, 8077.5, 0.24],
      [112950, 140175, 19603.5, 0.32], [140175, 332375, 28315.5, 0.35], [332375, null, 95585.5, 0.37],
    ],
  },
};

describe('audit: data/federal/2026.json matches the printed 2026 sources', () => {
  for (const [set, byStatus] of Object.entries(PUB15T_ANNUAL)) {
    for (const [status, rows] of Object.entries(byStatus)) {
      test(`Pub 15-T annual table: ${set}.${status} (8 rows, columns A-D)`, () => {
        const got = fed.incomeTax[set][status].map(
          (b: { from: number; to: number | null; base: number; rate: number }) => [b.from, b.to, b.base, b.rate],
        );
        assert.deepEqual(got, rows);
      });
    }
  }

  test('Worksheet 1A line 1g: $12,900 MFJ / $8,600 otherwise', () => {
    assert.equal(fed.incomeTax.step1StandardAdjustment.married_joint, 12900);
    assert.equal(fed.incomeTax.step1StandardAdjustment.other, 8600);
  });

  test('NRA Table 2 (Forms W-4 2020+), exactly as Pub 15-T prints it — daily and annual are separate printed entries', () => {
    const t = fed.incomeTax.nonresidentAlienAdjustment;
    assert.deepEqual(
      [t.weekly, t.biweekly, t.semimonthly, t.monthly, t.quarterly, t.semiannual, t.annual, t.daily],
      [309.6, 619.2, 670.8, 1341.7, 4025.0, 8050.0, 16100.0, 61.9],
    );
    // 61.90 x 260 = 16,094 != 16,100: the IRS rounds each printed entry on
    // its own, so the file must NOT "correct" one from the other.
    assert.notEqual(Math.round(t.daily * 260), t.annual);
  });

  test('Pub 15: supplemental 22% / 37% over $1M, backup 24%', () => {
    assert.equal(fed.incomeTax.supplementalRate, 0.22);
    assert.equal(fed.incomeTax.supplementalMandatoryRate, 0.37);
    assert.equal(fed.incomeTax.supplementalMandatoryThreshold, 1_000_000);
    assert.equal(fed.incomeTax.backupWithholdingRate, 0.24);
  });

  test('Pub 15 / RRB: SS 6.2% to $184,500; Medicare 1.45% uncapped; Additional 0.9% over $200,000', () => {
    assert.equal(fed.socialSecurity.employeeRate, 0.062);
    assert.equal(fed.socialSecurity.employerRate, 0.062);
    assert.equal(fed.socialSecurity.wageBase, 184_500);
    assert.equal(fed.medicare.employeeRate, 0.0145);
    assert.equal(fed.medicare.employerRate, 0.0145);
    assert.equal(fed.medicare.wageBase, null);
    assert.equal(fed.medicare.additional.rate, 0.009);
    assert.equal(fed.medicare.additional.threshold, 200_000);
    assert.equal(fed.medicare.additional.employeeOnly, true);
  });

  test('Pub 15 / 26 USC 3301-3306: FUTA 6.0% gross, 5.4% credit, 0.6% net, $7,000 base; 2025 credit reductions CA 1.2%, VI 4.5%', () => {
    assert.equal(fed.futa.grossRate, 0.06);
    assert.equal(fed.futa.standardCredit, 0.054);
    assert.equal(fed.futa.netRate, 0.006);
    assert.equal(fed.futa.wageBase, 7000);
    assert.deepEqual(fed.futa.creditReduction.states, {});
    assert.deepEqual(fed.futa.creditReduction.priorYear.states, { CA: 0.012, VI: 0.045 });
  });

  test('Notice 2025-67: 402(g) $24,500, 457(e)(15) $24,500, SIMPLE $17,000', () => {
    assert.equal(fed.electiveDeferralLimits.section402gAggregate, 24_500);
    assert.equal(fed.electiveDeferralLimits.deferral457, 24_500);
    assert.equal(fed.electiveDeferralLimits.simple, 17_000);
  });

  test('RRB 2026: Tier II 4.9% / 13.1% to $137,100; RUIA 0.65%-12.0%, new employer 5.58%, $2,150/month', () => {
    const rr = fed.railroadRetirement;
    assert.deepEqual(rr.tier2, { employeeRate: 0.049, employerRate: 0.131, wageBase: 137_100 });
    assert.equal(rr.ruia.newEmployerRate, 0.0558);
    assert.equal(rr.ruia.monthlyCompensationBase, 2150);
    assert.deepEqual(rr.ruia.experienceRange, { min: 0.0065, max: 0.12 });
  });

  test('Pub 15 / Pub 926: coverage thresholds (household $3,000 & $1,000/qtr FUTA, election $2,500, farm $150 / $2,500)', () => {
    const c = fed.employmentCategories.coverageThresholds;
    assert.equal(c.household.annualCashWages, 3000);
    assert.equal(c.household.futaQuarterlyCashWages, 1000);
    assert.equal(c.electionWorker.annualCashWages, 2500);
    assert.equal(c.agricultural.annualCashWagesPerWorker, 150);
    assert.equal(c.agricultural.annualWagesAllFarmworkers, 2500);
  });
});

// ---------------------------------------------------------------------------
// Engine: the figures above, run through calculatePaycheck.
// ---------------------------------------------------------------------------

describe('audit: Pub 15-T BIWEEKLY wage-bracket table cells reproduced by the engine', () => {
  // Pub 15-T (2026) BIWEEKLY table, row "$3,845 / $3,875", printed cells:
  //   MFJ std 296 | MFJ chk 510 | HoH std 372 | HoH chk 638 | Single std 510 | Single chk 710
  // Worksheet 1A at the row midpoint $3,860 (x26 = $100,360/yr), by hand:
  const cases: [Status, boolean, number, number, string][] = [
    // 100,360 - 12,900 = 87,460; 2,480 + 12% x 43,360 = 7,683.20; /26 = 295.51
    ['married_joint', false, 295.51, 296, 'standard'],
    // 100,360; 5,800 + 22% x 33,860 = 13,249.20; /26 = 509.58
    ['married_joint', true, 509.58, 510, 'Step 2 checkbox'],
    // 100,360 - 8,600 = 91,760; 7,740 + 22% x 8,760 = 9,667.20; /26 = 371.82
    ['head_of_household', false, 371.82, 372, 'standard'],
    // 100,360; 8,077.50 + 24% x 35,435 = 16,581.90; /26 = 637.77
    ['head_of_household', true, 637.77, 638, 'Step 2 checkbox'],
    // 91,760; 5,800 + 22% x 33,860 = 13,249.20; /26 = 509.58
    ['single', false, 509.58, 510, 'standard'],
    // 100,360; 8,983 + 24% x 39,460 = 18,453.40; /26 = 709.75
    ['single', true, 709.75, 710, 'Step 2 checkbox'],
  ];
  for (const [status, mj, exact, printed, label] of cases) {
    test(`${status} ${label}: $3,860 biweekly -> $${exact} (table prints $${printed})`, () => {
      const fit = amt(paycheck(3860, { status, multipleJobs: mj }), 'US_FIT');
      assert.equal(fit, dollars(exact));
      assert.equal(Math.round(fit / 100), printed);
    });
  }
});

describe('audit: top-bracket Worksheet 1A cases, annual pay period (hand-computed)', () => {
  const cases: [Status, boolean, number, number, string][] = [
    // 1,000,000 - 12,900 = 987,100; 206,583.50 + 37% x 199,100 = 280,250.50
    ['married_joint', false, 1_000_000, 280_250.5, 'standard'],
    // 500,000; 103,291.75 + 37% x 99,550 = 140,125.25
    ['married_joint', true, 500_000, 140_125.25, 'Step 2 checkbox'],
    // 700,000 - 8,600 = 691,400; 191,171 + 37% x 35,250 = 204,213.50
    ['head_of_household', false, 700_000, 204_213.5, 'standard'],
    // 350,000; 95,585.50 + 37% x 17,625 = 102,106.75
    ['head_of_household', true, 350_000, 102_106.75, 'Step 2 checkbox'],
    // 691,400; 192,979.25 + 37% x 43,300 = 209,000.25
    ['single', false, 700_000, 209_000.25, 'standard'],
    // 350,000; 96,489.63 + 37% x 21,650 = 104,500.13
    ['single', true, 350_000, 104_500.13, 'Step 2 checkbox'],
  ];
  for (const [status, mj, wage, expected, label] of cases) {
    test(`${status} ${label}: $${wage} annual -> $${expected}`, () => {
      assert.equal(amt(paycheck(wage, { freq: 'annual', status, multipleJobs: mj }), 'US_FIT'), dollars(expected));
    });
  }
});

describe('audit: Single Step 2 checkbox rows 5-7 use the printed whole-dollar breakpoints', () => {
  // Pub 15-T (2026) prints "$108,938 $136,163 $20,512.00 32% $108,938" and
  // "$136,163 $328,350 $29,224.00 35% $136,163". The file previously held
  // 108,937.50 / 136,162.50, which gives a different answer for every wage
  // in those brackets.
  test('$120,000 annual: 20,512 + 32% x (120,000 - 108,938) = 24,051.84 (old data: 24,052.00)', () => {
    assert.equal(amt(paycheck(120_000, { freq: 'annual', multipleJobs: true }), 'US_FIT'), dollars(24_051.84));
  });
  test('$200,000 annual: 29,224 + 35% x (200,000 - 136,163) = 51,566.95 (old data: 51,567.13)', () => {
    assert.equal(amt(paycheck(200_000, { freq: 'annual', multipleJobs: true }), 'US_FIT'), dollars(51_566.95));
  });
  test('$108,937.75 annual sits in the 24% row: 8,983 + 24% x 48,037.75 = 20,512.06', () => {
    assert.equal(amt(paycheck(108_937.75, { freq: 'annual', multipleJobs: true }), 'US_FIT'), dollars(20_512.06));
  });
});

describe('audit: nonresident alien Table 2 through the engine', () => {
  test('biweekly $3,000 single: (3,000 + 619.20) x 26 - 8,600 = 85,499.20; 5,800 + 22% x 27,599.20 = 11,871.82; /26 = 456.61', () => {
    assert.equal(amt(paycheck(3000, { nra: true }), 'US_FIT'), dollars(456.61));
  });
  test('daily $200 single uses the printed 61.90: (261.90 x 260) - 8,600 = 59,494; 5,800 + 22% x 1,594 = 6,150.68; /260 = 23.66', () => {
    assert.equal(amt(paycheck(200, { freq: 'daily', nra: true }), 'US_FIT'), dollars(23.66));
  });
  test('annual $50,000 single uses the printed 16,100: 66,100 - 8,600 = 57,500; 1,240 + 12% x 37,600 = 5,752.00', () => {
    assert.equal(amt(paycheck(50_000, { freq: 'annual', nra: true }), 'US_FIT'), dollars(5752));
  });
});

describe('audit: supplemental, FICA, FUTA, railroad through the engine', () => {
  test('supplemental $10,000 bonus at 22% = $2,200', () => {
    assert.equal(amt(paycheck(10_000, { category: 'supplemental' }), 'US_FIT_SUPP'), dollars(2200));
  });
  test('supplemental crossing $1M: 5,000 x 22% + 5,000 x 37% = $2,950', () => {
    const r = paycheck(10_000, { category: 'supplemental', ytd: { supplemental: dollars(995_000) } });
    assert.equal(amt(r, 'US_FIT_SUPP'), dollars(2950));
  });
  test('SS caps at $184,500; Medicare 1.45% uncapped; Additional 0.9% only above $200,000', () => {
    const r = paycheck(10_000, {
      ytd: { socialSecurity: dollars(180_000), medicare: dollars(195_000), futa: dollars(7000) },
    });
    assert.equal(amt(r, 'US_SS_EE'), dollars(279)); // 4,500 x 6.2%
    assert.equal(amt(r, 'US_SS_ER'), dollars(279));
    assert.equal(amt(r, 'US_MED_EE'), dollars(145)); // 10,000 x 1.45%
    assert.equal(amt(r, 'US_MED_ER'), dollars(145));
    assert.equal(amt(r, 'US_MED_ADDL'), dollars(45)); // 5,000 x 0.9%
  });
  test('FUTA 0.6% on the first $7,000: $6,000 YTD + $3,000 -> $1,000 x 0.6% = $6.00', () => {
    const r = paycheck(3000, { ytd: { futa: dollars(6000) } });
    assert.equal(amt(r, 'US_FUTA'), dollars(6));
  });
  test('RRTA Tier II to $137,100 and RUIA new-employer 5.58% on $2,150/month', () => {
    const r = paycheck(10_000, {
      employmentCategory: 'railroad',
      ytd: { tier2Compensation: dollars(130_000) },
    });
    assert.equal(amt(r, 'US_RRTA_TIER2_EE'), dollars(347.9)); // 7,100 x 4.9%
    assert.equal(amt(r, 'US_RRTA_TIER2_ER'), dollars(930.1)); // 7,100 x 13.1%
    assert.equal(amt(r, 'US_RUIA_ER'), dollars(119.97)); // 2,150 x 5.58%
    assert.equal(amt(r, 'US_RRTA_TIER1_EE'), dollars(620)); // 10,000 x 6.2%
  });
});

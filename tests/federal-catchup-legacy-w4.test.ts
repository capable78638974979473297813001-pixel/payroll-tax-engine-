import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { calculatePaycheck } from '../src/calculate.ts';
import { validatePaycheckInput } from '../site/lib/validate.ts';

const w4 = (o: Record<string, unknown> = {}) => ({
  filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0, ...o,
});
const input = (o: Record<string, unknown> = {}) => ({
  checkDate: '2026-06-15',
  payFrequency: 'biweekly',
  earnings: [{ code: 'REG', category: 'regular', amount: 300000 }],
  deductions: [],
  federalW4: w4(),
  ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
  workState: { code: 'TX' },
  ...o,
}) as never;
const fit = (r: ReturnType<typeof calculatePaycheck>) => r.taxes.find((t) => t.id === 'US_FIT')!.amount;

// Hand-worked from Pub 15-T (2026) Worksheet 1A lines 1j-1l and the STANDARD schedules.
describe('pre-2020 Form W-4 (allowances)', () => {
  test('single, 2 allowances, biweekly $3,000: $78,000 - 2 x $4,300 = $69,400 -> $5,800 + 22% of $11,500, / 26', () => {
    const r = calculatePaycheck(input({ federalW4: w4({ legacyAllowances: 2 }) }));
    assert.equal(fit(r), 32038); // 8,330.00 / 26 = 320.38
  });

  test('married, 0 allowances, biweekly $3,000: $2,480 + 12% of $33,900, / 26', () => {
    const r = calculatePaycheck(input({ federalW4: w4({ filingStatus: 'married_joint', legacyAllowances: 0 }) }));
    assert.equal(fit(r), 25185); // 6,548.00 / 26 = 251.85
  });

  test('3 allowances, monthly $4,000, single', () => {
    const r = calculatePaycheck(input({ payFrequency: 'monthly', earnings: [{ code: 'REG', category: 'regular', amount: 400000 }], federalW4: w4({ legacyAllowances: 3 }) }));
    assert.equal(fit(r), 25533); // (48,000 - 12,900 = 35,100 -> 1,240 + 12% of 15,200 = 3,064) / 12
  });

  test('the old form gets no standard-deduction adjustment: 0 allowances taxes more than the new form with the same status', () => {
    const old = fit(calculatePaycheck(input({ federalW4: w4({ legacyAllowances: 0 }) })));
    const current = fit(calculatePaycheck(input({ federalW4: w4() })));
    assert.ok(old > current, `${old} should exceed ${current}`);
  });

  test('line 6 additional withholding is added', () => {
    const base = fit(calculatePaycheck(input({ federalW4: w4({ legacyAllowances: 2 }) })));
    const more = fit(calculatePaycheck(input({ federalW4: w4({ legacyAllowances: 2, extraWithholding: 1000 }) })));
    assert.equal(more - base, 1000);
  });

  test('allowances that wipe out the wages withhold nothing', () => {
    assert.equal(fit(calculatePaycheck(input({ federalW4: w4({ legacyAllowances: 40 }) }))), 0);
  });

  test('a nonresident alien on the old form gets Table 1 ($226.90 weekly), not Table 2 ($309.60)', () => {
    const weekly = (extra: Record<string, unknown>) => fit(calculatePaycheck(input({
      payFrequency: 'weekly', earnings: [{ code: 'REG', category: 'regular', amount: 100000 }], federalW4: w4({ nonresidentAlien: true, ...extra }),
    })));
    // (1,000.00 + 226.90) x 52 = 63,798.80 -> 5,800 + 22% of 5,898.80 = 7,097.74, / 52
    assert.equal(weekly({ legacyAllowances: 0 }), 13650);
    assert.notEqual(weekly({ legacyAllowances: 0 }), weekly({}));
  });

  test('works for 2027 (carried forward from 2026) and 2025 (its own schedule)', () => {
    assert.equal(fit(calculatePaycheck(input({ checkDate: '2027-03-12', federalW4: w4({ legacyAllowances: 2 }) }))), 32038);
    assert.equal(fit(calculatePaycheck(input({ checkDate: '2025-06-13', federalW4: w4({ legacyAllowances: 2 }) }))), 33746); // 2025 schedule: $69,400 -> $5,578.50 + 22% of $14,525 = $8,774.00, / 26
  });

  test('Head of Household is refused: the old form had no such status', () => {
    assert.throws(() => calculatePaycheck(input({ federalW4: w4({ filingStatus: 'head_of_household', legacyAllowances: 1 }) })), /Head of Household/);
  });

  test('new-form fields alongside legacyAllowances are refused rather than ignored', () => {
    for (const bad of [{ multipleJobs: true }, { dependentCredit: 200000 }, { otherIncome: 100000 }, { deductions: 100000 }]) {
      assert.throws(() => calculatePaycheck(input({ federalW4: w4({ legacyAllowances: 1, ...bad }) })), /2019-or-earlier Form W-4/);
    }
  });

  test('allowances must be a whole number', () => {
    for (const n of [-1, 1.5, 100]) {
      assert.throws(() => calculatePaycheck(input({ federalW4: w4({ legacyAllowances: n }) })), /whole number of allowances/);
    }
  });

  test('without legacyAllowances nothing changes', () => {
    assert.equal(fit(calculatePaycheck(input())), fit(calculatePaycheck(input({ federalW4: w4({ legacyAllowances: undefined }) }))));
  });
});

const deferral = (category: string, amount: number) => [{ code: 'D', category, amount }];
const ytdOf = (o: Record<string, number>) => ({ socialSecurity: 0, medicare: 0, futa: 0, electiveDeferrals: o });
const pretax = (o: Record<string, unknown>) => calculatePaycheck(input(o)).pretaxDeductions;

describe('catch-up contributions', () => {
  // 2026: $24,500 standard; +$8,000 at 50 ($32,500); +$11,250 at 60-63 ($35,750).
  const base = (age: number | undefined, ytd = 3100000) => ({
    deductions: deferral('deferral_401k', 300000),
    ytd: ytdOf({ section402gAggregate: ytd }),
    ...(age === undefined ? {} : { employee: { ageAtYearEnd: age } }),
  });

  test('no age: only the $1,500 of room left under $24,500 is pretax', () => {
    assert.equal(pretax(base(undefined, 2300000)), 150000);
  });
  test('under 50: same as no age', () => {
    assert.equal(pretax(base(49, 2300000)), 150000);
  });
  test('50 to 59: room up to $32,500', () => {
    assert.equal(pretax(base(50)), 150000); // $31,000 already in, $1,500 left
    assert.equal(pretax(base(59, 2900000)), 300000); // $3,600 left, all $3,000 fits
  });
  test('60 to 63: room up to $35,750', () => {
    assert.equal(pretax(base(60, 3300000)), 275000); // $35,750 - $33,000 = $2,750 of the $3,000 fits
  });
  test('64 and over: back to the ordinary catch-up', () => {
    assert.equal(pretax(base(64)), 150000);
    assert.equal(pretax(base(75)), 150000);
  });
  test('the ages 60 and 63 are inside the enhanced band, 59 and 64 outside', () => {
    const y = 3300000;
    assert.equal(pretax(base(59, y)), 0); // $32,500 is already used up
    assert.equal(pretax(base(60, y)), 275000);
    assert.equal(pretax(base(63, y)), 275000);
    assert.equal(pretax(base(64, y)), 0);
  });
  test('the part over the limit still leaves the paycheck, as a post-tax deduction', () => {
    const r = calculatePaycheck(input({ ...base(undefined, 2300000) }));
    assert.equal(r.pretaxDeductions, 150000);
    assert.equal(r.posttaxDeductions, 150000);
  });
  test('457(b) is its own bucket and gets the same catch-up', () => {
    const o = (age: number) => ({ deductions: deferral('deferral_457', 300000), ytd: ytdOf({ deferral457: 3100000 }), employee: { ageAtYearEnd: age } });
    assert.equal(pretax(o(49)), 0);
    assert.equal(pretax(o(55)), 150000);
  });
  test('SIMPLE: $17,000 standard, +$4,000 at 50, +$5,250 at 60-63, and the 402(g) total still applies', () => {
    const o = (age: number | undefined, simple: number, agg: number) => ({
      deductions: deferral('deferral_simple', 200000),
      ytd: ytdOf({ simple, section402gAggregate: agg }),
      ...(age === undefined ? {} : { employee: { ageAtYearEnd: age } }),
    });
    assert.equal(pretax(o(40, 1600000, 1600000)), 100000); // $1,000 left of $17,000
    assert.equal(pretax(o(50, 1600000, 1600000)), 200000); // $21,000 limit
    assert.equal(pretax(o(61, 2000000, 2000000)), 200000); // $22,250 limit, $2,250 left
    assert.equal(pretax(o(61, 2100000, 2100000)), 125000); // $1,250 left
  });
  test('a catch-up never lifts the deduction above what the employee actually elected', () => {
    assert.equal(pretax({ deductions: deferral('deferral_401k', 50000), employee: { ageAtYearEnd: 55 } }), 50000);
  });
  test('2025 limits use the 2025 catch-up of $7,500', () => {
    const o = (age: number) => ({ checkDate: '2025-06-13', deductions: deferral('deferral_401k', 300000), ytd: ytdOf({ section402gAggregate: 3000000 }), employee: { ageAtYearEnd: age } });
    assert.equal(pretax(o(50)), 100000); // $23,500 + $7,500 = $31,000 limit, $30,000 in, $1,000 left
    assert.equal(pretax(o(62)), 300000); // $34,750 limit
  });

  test('a capped deferral with no age says how to apply the catch-up; with an age it does not', () => {
    const capped = calculatePaycheck(input(base(undefined, 2300000)));
    assert.match(capped.warnings?.join(' ') ?? '', /employee\.ageAtYearEnd/);
    const aware = calculatePaycheck(input(base(45, 2300000)));
    assert.equal(aware.warnings?.some((w) => /ageAtYearEnd/.test(w)) ?? false, false);
    const fine = calculatePaycheck(input({ deductions: deferral('deferral_401k', 10000) }));
    assert.equal(fine.warnings, undefined);
  });

  test('an impossible age is refused', () => {
    for (const age of [-1, 49.5, 121, Number.NaN]) {
      assert.throws(() => calculatePaycheck(input({ employee: { ageAtYearEnd: age } })), /ageAtYearEnd/);
    }
  });
});

describe('the API accepts and checks the new fields', () => {
  const body = (o: Record<string, unknown> = {}) => ({
    checkDate: '2026-06-15',
    payFrequency: 'biweekly',
    earnings: [{ code: 'REG', category: 'regular', amount: 300000 }],
    deductions: [],
    federalW4: w4(),
    ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
    workState: { code: 'OH' },
    ...o,
  });
  const paths = (r: ReturnType<typeof validatePaycheckInput>) => (r.ok ? [] : r.errors.map((e) => e.path));

  test('a legacy W-4, an age and year-to-date deferrals pass', () => {
    const r = validatePaycheckInput(body({
      federalW4: w4({ legacyAllowances: 2 }),
      employee: { ageAtYearEnd: 61 },
      ytd: { socialSecurity: 0, medicare: 0, futa: 0, electiveDeferrals: { section402gAggregate: 2300000, deferral457: 0 } },
    }));
    assert.equal(r.ok, true);
  });
  test('bad allowances, a mixed-up W-4, a bad age and non-integer deferral cents are field errors', () => {
    assert.deepEqual(paths(validatePaycheckInput(body({ federalW4: w4({ legacyAllowances: 1.5 }) }))), ['federalW4.legacyAllowances']);
    assert.deepEqual(paths(validatePaycheckInput(body({ federalW4: w4({ legacyAllowances: 1, multipleJobs: true }) }))), ['federalW4.legacyAllowances']);
    assert.deepEqual(paths(validatePaycheckInput(body({ federalW4: w4({ legacyAllowances: 1, filingStatus: 'head_of_household' }) }))), ['federalW4.filingStatus']);
    assert.deepEqual(paths(validatePaycheckInput(body({ employee: { ageAtYearEnd: 61.5 } }))), ['employee.ageAtYearEnd']);
    assert.deepEqual(paths(validatePaycheckInput(body({ employee: 'sixty' }))), ['employee']);
    assert.ok(paths(validatePaycheckInput(body({ ytd: { socialSecurity: 0, medicare: 0, futa: 0, electiveDeferrals: { simple: 12.5 } } }))).includes('ytd.electiveDeferrals.simple'));
  });
});

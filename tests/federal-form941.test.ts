import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { dollars } from '../src/money.ts';
import { approvePayRun, draftPayRun, freshYearToDate, generatePayPeriods } from '../payroll/index.ts';
import type { Company, Employee, PayRun, PayRunLine } from '../payroll/types.ts';
import { allocateResearchCredit, computeForm941, renderForm941, timesRate, SS_RATE, type EmployerIdentity } from '../payroll/federal/form941.ts';
import { buildLedger } from '../payroll/federal/ledger.ts';
import type { TaxDeposit } from '../payroll/federal/deposits.ts';

const employer: EmployerIdentity = {
  ein: '123456789',
  legalName: 'Rooter Bros LLC',
  address: { street: '1 Main St', city: 'Columbus', state: 'OH', zip: '43215' },
};

/** A pay run with one line whose federal taxes are exactly what the arguments say. */
function syntheticRun(
  date: string,
  opts: { fit?: number; ssWages?: number; medWages?: number; addlWages?: number; employees?: number; period?: [string, string] },
): PayRun {
  const n = opts.employees ?? 1;
  const ssWages = dollars(opts.ssWages ?? 0);
  const medWages = dollars(opts.medWages ?? opts.ssWages ?? 0);
  const addlWages = dollars(opts.addlWages ?? 0);
  const lines: PayRunLine[] = Array.from({ length: n }, (_, i) => ({
    employeeId: `e${i + 1}`,
    grossPay: medWages,
    netPay: 0,
    employeeTaxTotal: 0,
    employerTaxTotal: 0,
    pretaxDeductions: 0,
    posttaxDeductions: 0,
    garnishmentTotal: 0,
    netPayAfterGarnishment: 0,
    garnishmentLines: [],
    depositAllocations: [],
    taxLines: [
      { id: 'US_FIT', name: 'FIT', payer: 'employee', jurisdiction: 'federal', taxableWages: medWages, amount: dollars(opts.fit ?? 0) },
      { id: 'US_SS_EE', name: 'SS', payer: 'employee', jurisdiction: 'federal', taxableWages: ssWages, amount: timesRate(ssWages, { numerator: 62, denominator: 1000 }) },
      { id: 'US_SS_ER', name: 'SS ER', payer: 'employer', jurisdiction: 'federal', taxableWages: ssWages, amount: timesRate(ssWages, { numerator: 62, denominator: 1000 }) },
      { id: 'US_MED_EE', name: 'Med', payer: 'employee', jurisdiction: 'federal', taxableWages: medWages, amount: timesRate(medWages, { numerator: 145, denominator: 10000 }) },
      { id: 'US_MED_ER', name: 'Med ER', payer: 'employer', jurisdiction: 'federal', taxableWages: medWages, amount: timesRate(medWages, { numerator: 145, denominator: 10000 }) },
      ...(addlWages > 0
        ? [{ id: 'US_MED_ADDL', name: 'Addl Med', payer: 'employee' as const, jurisdiction: 'federal' as const, taxableWages: addlWages, amount: timesRate(addlWages, { numerator: 9, denominator: 1000 }) }]
        : []),
    ],
  }));
  return {
    id: `run-${date}`,
    companyId: 'co-1',
    periodStart: opts.period?.[0] ?? date,
    periodEnd: opts.period?.[1] ?? date,
    checkDate: date,
    status: 'approved',
    lines,
    createdAt: `${date}T00:00:00Z`,
    minimumWageIssues: [],
  };
}

describe('integer rate arithmetic (Form 941 column 2)', () => {
  test('rounds half up exactly where floating point would not', () => {
    // 0.124 x 4.0 cents ... find a base whose product ends in exactly .5 cent: 12.4% of 125 cents = 15.5.
    assert.equal(timesRate(125, SS_RATE), 16);
    assert.equal(timesRate(124, SS_RATE), 15); // 15.376
    assert.equal(timesRate(0, SS_RATE), 0);
    assert.equal(timesRate(100_000, SS_RATE), 12_400);
    assert.equal(timesRate(-125, SS_RATE), -16); // symmetric for negatives
  });
});

describe('Form 941 lines (Rev. 3-2026)', () => {
  test('column 2 is column 1 x rate; 5e adds the columns; 6 = 3 + 5e + 5f; 10 = 6 + 7 + 8 + 9; 12 = 10 - 11', () => {
    const runs = [syntheticRun('2026-03-27', { fit: 1_000, ssWages: 10_000, employees: 2 })];
    const f = computeForm941({ employer, year: 2026, quarter: 1, runs }, 'co-1');
    // 2 employees x $10,000.
    assert.equal(f.line5a_socialSecurityWages.column1, dollars(20_000));
    assert.equal(f.line5a_socialSecurityWages.column2, dollars(2_480)); // 12.4%
    assert.equal(f.line5c_medicareWagesAndTips.column2, dollars(580)); // 2.9%
    assert.equal(f.line5d_additionalMedicare.column2, 0);
    assert.equal(f.line5e_totalSocialSecurityAndMedicare, dollars(2_480 + 580));
    assert.equal(f.line3_federalIncomeTaxWithheld, dollars(2_000));
    assert.equal(f.line6_totalTaxesBeforeAdjustments, dollars(2_000 + 2_480 + 580));
    assert.equal(f.line7_fractionsOfCents, 0);
    assert.equal(f.line10_totalTaxesAfterAdjustments, f.line6_totalTaxesBeforeAdjustments);
    assert.equal(f.line12_totalAfterAdjustmentsAndCredits, f.line10_totalTaxesAfterAdjustments);
    assert.equal(f.line2_wagesTipsOtherCompensation, dollars(20_000));
  });

  test('line 7 captures the cents between column 1 x rate and what was really withheld', () => {
    // $1,234.57 of wages: employee 6.2% = 76.54 (76.5463), employer 76.54, Medicare 17.90 each (17.9012).
    // Column 2 from the column-1 wage: 12.4% = 153.09 (153.0927), 2.9% = 35.80 (35.8035).
    // Actual: 76.54 + 76.54 + 17.90 + 17.90 = 188.88; column 2 total: 153.09 + 35.80 = 188.89; line 7 = -0.01.
    const runs = [syntheticRun('2026-02-06', { fit: 0, ssWages: 1_234.57 })];
    const f = computeForm941({ employer, year: 2026, quarter: 1, runs }, 'co-1');
    assert.equal(f.line5e_totalSocialSecurityAndMedicare, dollars(188.89));
    assert.equal(f.line7_fractionsOfCents, -1);
    assert.equal(f.line10_totalTaxesAfterAdjustments, dollars(188.88), 'line 10 ends on what was actually withheld and owed');
    assert.equal(f.findings.find((x) => x.code === 'line7_not_fractions_of_cents'), undefined);
  });

  test('a large line 7 is an error: it means taxes do not match wages x statutory rates', () => {
    const run = syntheticRun('2026-02-06', { ssWages: 1_000 });
    run.lines[0].taxLines.find((t) => t.id === 'US_SS_EE')!.amount = dollars(30); // withheld $30 instead of $62
    const f = computeForm941({ employer, year: 2026, quarter: 1, runs: [run] }, 'co-1');
    assert.ok(Math.abs(f.line7_fractionsOfCents) > 100);
    assert.equal(f.findings.some((x) => x.code === 'line7_not_fractions_of_cents' && x.severity === 'error'), true);
    assert.equal(f.readyToSign, false);
  });

  test('tips come out of line 5a and into 5b, and may not exceed social security wages', () => {
    const runs = [syntheticRun('2026-02-06', { ssWages: 10_000 })];
    const f = computeForm941({ employer, year: 2026, quarter: 1, runs, socialSecurityTips: dollars(1_500) }, 'co-1');
    assert.equal(f.line5a_socialSecurityWages.column1, dollars(8_500));
    assert.equal(f.line5b_socialSecurityTips.column1, dollars(1_500));
    assert.equal(f.line5a_socialSecurityWages.column2 + f.line5b_socialSecurityTips.column2, dollars(1_240));
    assert.equal(f.line5c_medicareWagesAndTips.column1, dollars(10_000), 'Medicare wages & tips are one line');
    const bad = computeForm941({ employer, year: 2026, quarter: 1, runs, socialSecurityTips: dollars(20_000) }, 'co-1');
    assert.equal(bad.findings.some((x) => x.code === 'tips_exceed_social_security_wages'), true);
  });

  test('Additional Medicare Tax is employee-only and sits on its own line (5d at 0.9%)', () => {
    const runs = [syntheticRun('2026-12-18', { ssWages: 0, medWages: 50_000, addlWages: 50_000 })];
    const f = computeForm941({ employer, year: 2026, quarter: 4, runs }, 'co-1');
    assert.equal(f.line5d_additionalMedicare.column2, dollars(450));
    assert.equal(f.line5e_totalSocialSecurityAndMedicare, timesRate(dollars(50_000), { numerator: 29, denominator: 1000 }) + dollars(450));
  });

  test('adjustments land on lines 5f, 8, 9 and flow into 10; a Section 3121(q) notice goes through line 6', () => {
    const runs = [syntheticRun('2026-02-06', { fit: 500, ssWages: 10_000 })];
    const f = computeForm941({
      employer, year: 2026, quarter: 1, runs,
      adjustments: [
        { date: '2026-02-20', amount: dollars(120), line: '5f' },
        { date: '2026-02-06', amount: -dollars(40), line: '8' },
        { date: '2026-02-06', amount: -dollars(10.59), line: '9' },
      ],
    }, 'co-1');
    assert.equal(f.line5f_section3121qNoticeAndDemand, dollars(120));
    assert.equal(f.line6_totalTaxesBeforeAdjustments, dollars(500) + f.line5e_totalSocialSecurityAndMedicare + dollars(120));
    assert.equal(f.line8_sickPayAdjustment, -dollars(40));
    assert.equal(f.line9_tipsAndGroupTermLifeAdjustment, -dollars(10.59));
    assert.equal(f.line10_totalTaxesAfterAdjustments, f.line6_totalTaxesBeforeAdjustments + f.line7_fractionsOfCents - dollars(40) - dollars(10.59));
  });

  test('adjustments dated outside the quarter are ignored', () => {
    const runs = [syntheticRun('2026-02-06', { ssWages: 10_000 })];
    const f = computeForm941({ employer, year: 2026, quarter: 1, runs, adjustments: [{ date: '2026-07-01', amount: dollars(99), line: '8' }] }, 'co-1');
    assert.equal(f.line8_sickPayAdjustment, 0);
  });

  test('line 12 is never below zero', () => {
    const runs = [syntheticRun('2026-02-06', { ssWages: 1_000 })];
    const f = computeForm941({ employer, year: 2026, quarter: 1, runs, adjustments: [{ date: '2026-02-06', amount: -dollars(50_000), line: '9' }] }, 'co-1');
    assert.ok(f.line10_totalTaxesAfterAdjustments < 0);
    assert.equal(f.line12_totalAfterAdjustmentsAndCredits, 0);
  });

  test('lines 14 and 15a are never both filled', () => {
    const runs = [syntheticRun('2026-03-27', { fit: 100, ssWages: 1_000 })];
    const line12 = computeForm941({ employer, year: 2026, quarter: 1, runs }, 'co-1').line12_totalAfterAdjustmentsAndCredits;
    const dep = (amount: number): TaxDeposit => ({ id: 'd', date: '2026-04-15', amount, year: 2026, quarter: 1 });
    const under = computeForm941({ employer, year: 2026, quarter: 1, runs, deposits: [dep(line12 - 500)] }, 'co-1');
    assert.equal(under.line14_balanceDue, 500);
    assert.equal(under.line15a_overpayment, 0);
    const over = computeForm941({ employer, year: 2026, quarter: 1, runs, deposits: [dep(line12 + 700)] }, 'co-1');
    assert.equal(over.line14_balanceDue, 0);
    assert.equal(over.line15a_overpayment, 700);
    const exact = computeForm941({ employer, year: 2026, quarter: 1, runs, deposits: [dep(line12)] }, 'co-1');
    assert.equal(exact.line14_balanceDue + exact.line15a_overpayment, 0);
  });

  test('line 13 counts only deposits designated to this quarter, plus applied overpayments', () => {
    const runs = [syntheticRun('2026-03-27', { fit: 100, ssWages: 1_000 })];
    const f = computeForm941({
      employer, year: 2026, quarter: 1, runs, overpaymentApplied: dollars(25),
      deposits: [
        { id: 'a', date: '2026-04-15', amount: dollars(100), year: 2026, quarter: 1 },
        { id: 'b', date: '2026-07-15', amount: dollars(900), year: 2026, quarter: 2 },
      ],
    }, 'co-1');
    assert.equal(f.line13_totalDeposits, dollars(125));
  });

  test('line 1 counts the employees paid in the period that includes the 12th of the last month', () => {
    const runs = [syntheticRun('2026-03-20', { ssWages: 1_000, employees: 3, period: ['2026-03-08', '2026-03-14'] })];
    const f = computeForm941({ employer, year: 2026, quarter: 1, runs }, 'co-1');
    assert.equal(f.line1_numberOfEmployees, 3);
    const none = computeForm941({ employer, year: 2026, quarter: 1, runs: [syntheticRun('2026-03-20', { ssWages: 1_000, period: ['2026-03-15', '2026-03-21'] })] }, 'co-1');
    assert.equal(none.line1_numberOfEmployees, null);
    assert.equal(none.findings.some((x) => x.code === 'line1_unknown'), true);
  });

  test('only approved runs count', () => {
    const draft = syntheticRun('2026-03-20', { fit: 9_999, ssWages: 1_000 });
    draft.status = 'draft';
    const f = computeForm941({ employer, year: 2026, quarter: 1, runs: [draft] }, 'co-1');
    assert.equal(f.line3_federalIncomeTaxWithheld, 0);
  });
});

describe('Form 941 Part 2 and Schedule B', () => {
  test('a small quarter under $2,500 takes the de minimis box and has no liability record', () => {
    const f = computeForm941({ employer, year: 2026, quarter: 1, runs: [syntheticRun('2026-03-27', { fit: 100, ssWages: 1_000 })] }, 'co-1');
    assert.ok(f.line12_totalAfterAdjustmentsAndCredits < dollars(2_500));
    assert.equal(f.part2.choice, 'de_minimis');
    assert.equal(f.part2.monthlyLiability, undefined);
    assert.equal(f.scheduleB, undefined);
  });

  test('a monthly depositor reports liability by the month wages were PAID, and the months total line 12', () => {
    // Paid Jan 9, Feb 6, Mar 27; each liability ~ $4,000+ so the quarter is well over $2,500 and the prior quarter is too.
    const runs = [
      syntheticRun('2026-01-09', { fit: 2_000, ssWages: 20_000 }),
      syntheticRun('2026-02-06', { fit: 2_000, ssWages: 20_000 }),
      syntheticRun('2026-03-27', { fit: 2_000, ssWages: 20_000 }),
    ];
    const f = computeForm941({ employer, year: 2026, quarter: 1, runs, priorQuarterLine12: dollars(10_000), lookbackTotalLine12: dollars(30_000) }, 'co-1');
    assert.equal(f.part2.choice, 'monthly');
    const l = f.part2.monthlyLiability!;
    assert.equal(l.month1, l.month2);
    assert.equal(l.month2, l.month3);
    assert.equal(l.total, f.line12_totalAfterAdjustmentsAndCredits);
    assert.equal(f.scheduleB, undefined);
    assert.equal(f.findings.some((x) => x.code === 'liability_record_does_not_equal_line12'), false);
  });

  test("Schedule B's Cedar Co.: monthly paydays on the last day, plus a Dec 24 bonus -> lines 31, 30, 24 and 31", () => {
    // Instructions for Schedule B, Example 1 (a semiweekly depositor). Quarter 4.
    const runs = [
      syntheticRun('2025-10-31', { fit: 3_000, ssWages: 30_000 }),
      syntheticRun('2025-11-28', { fit: 3_000, ssWages: 30_000 }), // the IRS example says line 30; Nov 30, 2025 is a Sunday, so use the paid-on date it implies
      syntheticRun('2025-12-24', { fit: 1_000, ssWages: 10_000 }),
      syntheticRun('2025-12-31', { fit: 3_000, ssWages: 30_000 }),
    ];
    runs[1] = syntheticRun('2025-11-30', { fit: 3_000, ssWages: 30_000 });
    const f = computeForm941({ employer, year: 2025, quarter: 4, runs, lookbackTotalLine12: dollars(80_000), priorQuarterLine12: dollars(20_000) }, 'co-1');
    assert.equal(f.part2.choice, 'semiweekly');
    const sb = f.scheduleB!;
    assert.deepEqual(sb.months.map((m) => m.days.map((d) => d.day)), [[31], [30], [24, 31]]);
    assert.equal(sb.totalLiabilityForQuarter, f.line12_totalAfterAdjustmentsAndCredits);
  });

  test("Schedule B's Fir Co.: every other Friday -> April lines 4 and 18, May 2, 16 and 30, June 13 and 27", () => {
    // Instructions for Schedule B, Example 2 (2025): $20,000 liability on each of those dates.
    const dates = ['2025-04-04', '2025-04-18', '2025-05-02', '2025-05-16', '2025-05-30', '2025-06-13', '2025-06-27'];
    // Wages chosen so each date's total is exactly $20,000: fit 5,000 + 15,000 of employment taxes (15.3% of x).
    const x = 15_000 / 0.153; // ~98,039.22
    const runs = dates.map((d) => syntheticRun(d, { fit: 5_000, ssWages: Math.round(x * 100) / 100 }));
    const f = computeForm941({ employer, year: 2025, quarter: 2, runs, lookbackTotalLine12: dollars(150_000) }, 'co-1');
    assert.equal(f.part2.choice, 'semiweekly');
    assert.deepEqual(f.scheduleB!.months.map((m) => m.days.map((d) => d.day)), [[4, 18], [2, 16, 30], [13, 27]]);
    assert.equal(f.deposits.analysis.nextDayTriggerDates.length, 0);
  });

  test("Schedule B's Elm Co.: monthly until a $110,000 day trips the rule on Apr 25 -> third box, whole quarter on Schedule B", () => {
    // Instructions for Schedule B, Example 3 (2025): $2,000 on Apr 18; $110,000 on Apr 25 and every later Friday.
    const x2 = (t: number, fit: number) => ({ fit, ssWages: Math.round(((t - fit) / 0.153) * 100) / 100 });
    const fridays = ['2025-05-02', '2025-05-09', '2025-05-16', '2025-05-23', '2025-05-30', '2025-06-06', '2025-06-13', '2025-06-20', '2025-06-27'];
    const runs = [
      syntheticRun('2025-04-18', x2(2_000, 500)),
      syntheticRun('2025-04-25', x2(110_000, 30_000)),
      ...fridays.map((d) => syntheticRun(d, x2(110_000, 30_000))),
    ];
    const f = computeForm941({ employer, year: 2025, quarter: 2, runs, lookbackTotalLine12: dollars(10_000) }, 'co-1');
    assert.equal(f.deposits.analysis.becameSemiweeklyOn, '2025-04-26');
    assert.equal(f.part2.choice, 'semiweekly'); // "Elm Co. won't check the second box ... must check the third box"
    assert.deepEqual(f.scheduleB!.months[0].days.map((d) => d.day), [18, 25]);
    assert.deepEqual(f.scheduleB!.months[1].days.map((d) => d.day), [2, 9, 16, 23, 30]);
    assert.deepEqual(f.scheduleB!.months[2].days.map((d) => d.day), [6, 13, 20, 27]);
  });

  test('prior-year $100,000 trigger keeps the employer semiweekly even with a tiny lookback', () => {
    const f = computeForm941({
      employer, year: 2026, quarter: 1, semiweeklyFromPriorYear: true, lookbackTotalLine12: dollars(1_000), priorQuarterLine12: dollars(9_000),
      runs: [syntheticRun('2026-02-06', { fit: 2_000, ssWages: 20_000 })],
    }, 'co-1');
    assert.equal(f.part2.choice, 'semiweekly');
  });
});

describe('line 11: the research payroll tax credit', () => {
  const days = (rows: [string, number, number][]) =>
    buildLedger('co-1', rows.map(([date, ss, med]) => syntheticRun(date, { ssWages: ss, medWages: med })), { start: '2026-01-01', end: '2026-12-31' });

  test('reduces the employer social security share first, from the first payroll of the quarter', () => {
    // Employer SS share is 6.2% of wages: $620 on Jul 10, $620 on Jul 24.
    const d = days([['2026-07-10', 10_000, 10_000], ['2026-07-24', 10_000, 10_000]]);
    const r = allocateResearchCredit(d, dollars(800));
    assert.deepEqual(r.byDate, { '2026-07-10': dollars(620), '2026-07-24': dollars(180) });
    assert.equal(r.unused, 0);
  });

  test('then the employer Medicare share', () => {
    // Employer SS share total $1,240; Medicare $290. A $1,400 credit: $1,240 to SS, $160 to Medicare.
    const d = days([['2026-07-10', 10_000, 10_000], ['2026-07-24', 10_000, 10_000]]);
    const r = allocateResearchCredit(d, dollars(1_400));
    assert.equal(Object.values(r.byDate).reduce((a, b) => a + b, 0), dollars(1_400));
    assert.equal(r.unused, 0);
    // Medicare ($145 per payroll) starts with the first payroll: first payroll gets 620 + 145, second gets 620 + 15.
    assert.deepEqual(r.byDate, { '2026-07-10': dollars(620 + 145), '2026-07-24': dollars(620 + 15) });
  });

  test('only $250,000 of the credit can go against social security in a quarter', () => {
    const d = days([['2026-07-10', 5_000_000, 5_000_000]]); // employer SS share $310,000, Medicare $72,500
    const r = allocateResearchCredit(d, dollars(300_000));
    // $250,000 against SS, the remaining $50,000 against Medicare.
    assert.equal(r.byDate['2026-07-10'], dollars(300_000));
    assert.equal(r.unused, 0);
  });

  test('a credit larger than both employer shares cannot all be used', () => {
    const d = days([['2026-07-10', 10_000, 10_000]]); // employer shares: 620 + 145 = 765
    const r = allocateResearchCredit(d, dollars(1_000));
    assert.equal(r.unused, dollars(235));
  });

  test('on the return: line 11 lowers line 12 and the liability record, and Schedule B never goes below zero', () => {
    // $50,000 of wages per payroll keeps line 12 far above the $2,500 de minimis line even after the credit.
    const runs = [syntheticRun('2026-07-10', { fit: 500, ssWages: 50_000 }), syntheticRun('2026-07-24', { fit: 500, ssWages: 50_000 })];
    const f = computeForm941({ employer, year: 2026, quarter: 3, runs, researchCredit: dollars(800), lookbackTotalLine12: dollars(90_000) }, 'co-1');
    assert.equal(f.line11_researchCredit, dollars(800));
    assert.equal(f.line12_totalAfterAdjustmentsAndCredits, f.line10_totalTaxesAfterAdjustments - dollars(800));
    assert.equal(f.part2.choice, 'semiweekly');
    assert.equal(f.scheduleB!.totalLiabilityForQuarter, f.line12_totalAfterAdjustmentsAndCredits);
    for (const m of f.scheduleB!.months) for (const dd of m.days) assert.ok(dd.liability >= 0);
    // the credit is not part of the $100,000 test but does reduce the amount deposited
    assert.equal(f.deposits.analysis.obligations.reduce((s, o) => s + o.amountDue, 0), f.line12_totalAfterAdjustmentsAndCredits);
  });

  test('a credit larger than the employer shares is an error on the return, not silently clipped', () => {
    const runs = [syntheticRun('2026-07-10', { fit: 100, ssWages: 10_000 })];
    const f = computeForm941({ employer, year: 2026, quarter: 3, runs, researchCredit: dollars(5_000) }, 'co-1');
    assert.equal(f.findings.some((x) => x.code === 'research_credit_exceeds_employer_shares' && x.severity === 'error'), true);
    assert.equal(f.readyToSign, false);
  });
});

describe('a negative adjustment larger than the month: enter -0- and carry it (instructions, line 16)', () => {
  test('the unused portion reduces the next month and the total still equals line 12', () => {
    const runs = [
      syntheticRun('2026-01-09', { fit: 1_000, ssWages: 10_000 }), // ~ $2,530 in January
      syntheticRun('2026-03-27', { fit: 6_000, ssWages: 20_000 }),
    ];
    const f = computeForm941({
      employer, year: 2026, quarter: 1, runs, priorQuarterLine12: dollars(10_000), lookbackTotalLine12: dollars(20_000),
      adjustments: [{ date: '2026-02-13', amount: -dollars(900), line: '9' }], // February has no wages: net is -900
    }, 'co-1');
    const l = f.part2.monthlyLiability!;
    assert.equal(l.month2, 0);
    assert.equal(l.total, f.line12_totalAfterAdjustmentsAndCredits);
    assert.equal(l.month3, f.line12_totalAfterAdjustmentsAndCredits - l.month1, 'the -900 reduced March, not February');
  });
});

describe('rendering', () => {
  test('lays the return out like the form and says whether it is ready to sign', () => {
    const f = computeForm941({ employer, year: 2026, quarter: 1, runs: [syntheticRun('2026-03-27', { fit: 100, ssWages: 1_000 })] }, 'co-1');
    const text = renderForm941(f);
    assert.match(text, /Form 941 for 2026, Quarter 1/);
    assert.match(text, /EIN 12-3456789/);
    assert.match(text, /Total taxes after adjustments and nonrefundable credits/);
    assert.match(text, /Due 2026-04-30 \(2026-05-11 if every deposit was made on time\)/);
    assert.match(text, /ready for a responsible person|NOT READY TO SIGN/);
  });
});

describe('integration: a full year of REAL engine pay runs', () => {
  const company: Company = {
    id: 'co-1',
    legalName: 'Integration Co',
    ein: '12-3456789',
    homeState: 'TX',
    paySchedule: { frequency: 'biweekly', anchorPeriodStart: '2026-01-04', checkDateLagDays: 5 },
  };
  const mk = (id: string, annualSalary: number): Employee => ({
    id,
    companyId: company.id,
    firstName: id,
    lastName: 'Test',
    hireDate: '2020-01-01',
    employmentCategory: 'standard',
    payType: { kind: 'salary', annualSalary: dollars(annualSalary) },
    residenceState: { code: 'TX' },
    federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
    deductionPlans: [],
    directDepositAccounts: [],
    garnishmentOrders: [],
    ytd: freshYearToDate(),
    ytdYear: 2026,
  });

  function yearOfRuns(): PayRun[] {
    let employees = [mk('low', 52_000), mk('mid', 98_500), mk('high', 330_000)];
    const out: PayRun[] = [];
    for (const period of generatePayPeriods(company.paySchedule, 2026)) {
      const drafted = draftPayRun(company, employees, period.periodStart, period.periodEnd, period.checkDate);
      const { run, updatedEmployees } = approvePayRun(drafted, employees);
      employees = updatedEmployees;
      out.push(run);
    }
    return out;
  }

  test('every quarter: line 7 is only fractions of cents, Part 2 / Schedule B equals line 12, and it is ready to sign', () => {
    const runs = yearOfRuns();
    const quarters = ([1, 2, 3, 4] as const).map((quarter) =>
      computeForm941({ employer: { ...employer, ein: '123456789' }, year: 2026, quarter, runs, lookbackTotalLine12: dollars(10_000), priorQuarterLine12: dollars(50_000) }, company.id),
    );
    for (const f of quarters) {
      assert.ok(Math.abs(f.line7_fractionsOfCents) <= 30, `Q${f.quarter} line 7 = ${f.line7_fractionsOfCents}`);
      const recorded = f.part2.monthlyLiability?.total ?? f.scheduleB?.totalLiabilityForQuarter;
      if (f.part2.choice !== 'de_minimis') assert.equal(recorded, f.line12_totalAfterAdjustmentsAndCredits);
      assert.equal(f.findings.filter((x) => x.severity === 'error').length, 0, JSON.stringify(f.findings));
      // line 10 is exactly the federal liability the ledger recorded - the form ties to the payroll register
      const ledgerTotal = buildLedger(company.id, runs, { start: `2026-${String((f.quarter - 1) * 3 + 1).padStart(2, '0')}-01`, end: `2026-${String(f.quarter * 3).padStart(2, '0')}-31` }).reduce((s, d) => s + d.total, 0);
      assert.equal(f.line10_totalTaxesAfterAdjustments, ledgerTotal);
    }
  });

  test('the high earner crosses the social security wage base and the $200,000 Additional Medicare threshold during the year', () => {
    const runs = yearOfRuns();
    const q = ([1, 2, 3, 4] as const).map((quarter) => computeForm941({ employer, year: 2026, quarter, runs }, company.id));
    const annualSs = q.reduce((s, f) => s + f.line5a_socialSecurityWages.column1, 0);
    // low 52,000 + mid 98,500 + high capped at the 2026 wage base 184,500, each paid on however many periods the schedule yields.
    const periods = generatePayPeriods(company.paySchedule, 2026).length;
    const each = (annual: number) => Math.round(dollars(annual) / 26) * periods;
    assert.equal(annualSs, each(52_000) + each(98_500) + Math.min(each(330_000), dollars(184_500)));
    const annualAddl = q.reduce((s, f) => s + f.line5d_additionalMedicare.column1, 0);
    assert.equal(annualAddl, each(330_000) - dollars(200_000));
    assert.ok(q[0].line5d_additionalMedicare.column1 === 0, 'no Additional Medicare Tax in the first quarter');
  });
});

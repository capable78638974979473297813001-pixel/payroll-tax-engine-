import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { dollars } from '../src/money.ts';
import { buildPaycheckInput } from '../payroll/engine.ts';
import { freshYearToDate } from '../payroll/ytd.ts';
import type { Company, Employee } from '../payroll/types.ts';

import {
  buildCertifiedPayroll,
  combineWeeklyEarnings,
  computeJobCosts,
  findRateOnDate,
  groupIntoWorkweeks,
  resolvePrevailingWageWeek,
  resolveRate,
  runTradesPayPeriod,
  workweekStart,
  type EmployeeJobCostInput,
  type Job,
  type TradeWorkerProfile,
  type WageDetermination,
  type WorkersCompRating,
  type WorkedHours,
} from '../trades/index.ts';

// ============================================================================
// Fixtures — a weekly-paid Texas plumbing shop (TX has no state income tax, so
// a paycheck's gross ties cleanly to the earnings we compute here).
// ============================================================================

function weeklyShop(): Company {
  return {
    id: 'shop-1',
    legalName: 'Rooter Bros LLC',
    ein: '74-1234567',
    homeState: 'TX',
    paySchedule: { frequency: 'weekly', anchorPeriodStart: '2026-01-04', checkDateLagDays: 5 },
  };
}

function plumber(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'joe',
    companyId: 'shop-1',
    firstName: 'Joe',
    lastName: 'Pipe',
    hireDate: '2025-01-01',
    employmentCategory: 'standard',
    payType: { kind: 'hourly', hourlyRate: dollars(30) }, // shop rate for un-profiled work
    workersCompClassCode: '5183',
    residenceState: { code: 'TX' },
    federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
    deductionPlans: [],
    directDepositAccounts: [],
    garnishmentOrders: [],
    ytd: freshYearToDate(),
    ytdYear: 2026,
    ...overrides,
  };
}

const profile: TradeWorkerProfile = {
  employeeId: 'joe',
  classificationRates: [{ classificationCode: 'PLUMBER', baseRateCents: dollars(40) }], // shop rate for plumbing work
  fringeCredits: [{ plan: 'Health & Welfare', ratePerHourCents: dollars(5) }],
};

const determination: WageDetermination = {
  id: 'TX20260001',
  authority: 'davis-bacon',
  state: 'TX',
  locality: 'Travis County',
  constructionType: 'building',
  rates: [
    { classificationCode: 'PLUMBER', baseHourlyRateCents: dollars(50), fringePerHourCents: dollars(15), effectiveDate: '2026-01-01' },
  ],
};

const publicJob: Job = {
  id: 'J1',
  companyId: 'shop-1',
  name: 'Travis County School — building',
  workState: 'TX',
  workLocality: 'Travis County',
  prevailingWage: { determinationId: 'TX20260001', contractNumber: 'DBA-778', projectName: 'Travis County School' },
  workersCompClassCode: '5183',
  glCostCode: '01-100',
};

const privateJob: Job = {
  id: 'J2',
  companyId: 'shop-1',
  name: 'Elm St residential service call',
  workState: 'TX',
  workersCompClassCode: '5183',
  glCostCode: '02-200',
};

// Mon–Thu 10h/day plumbing on the public job (40h), then Fri 8h service on the
// private job. Total 48h → 40 straight, 8 overtime; the 8 OT hours are the
// last-in-the-week (Friday, private) hours.
function weekOfHours(): WorkedHours[] {
  return [
    { employeeId: 'joe', jobId: 'J1', date: '2026-01-05', classificationCode: 'PLUMBER', hours: 10 },
    { employeeId: 'joe', jobId: 'J1', date: '2026-01-06', classificationCode: 'PLUMBER', hours: 10 },
    { employeeId: 'joe', jobId: 'J1', date: '2026-01-07', classificationCode: 'PLUMBER', hours: 10 },
    { employeeId: 'joe', jobId: 'J1', date: '2026-01-08', classificationCode: 'PLUMBER', hours: 10 },
    { employeeId: 'joe', jobId: 'J2', date: '2026-01-09', classificationCode: 'SERVICE', hours: 8 },
  ];
}

function resolveWeek() {
  return resolvePrevailingWageWeek({
    employeeId: 'joe',
    workedHours: weekOfHours(),
    jobsById: new Map([[publicJob.id, publicJob], [privateJob.id, privateJob]]),
    determinationsById: new Map([[determination.id, determination]]),
    profile,
    fallbackBaseRateCents: dollars(30),
  });
}

// ============================================================================
// Wage determination resolution (effective-dated, raise-don't-default)
// ============================================================================

describe('wage determination lookup (trades/wageDetermination.ts)', () => {
  test('selects the rate line in force on the work date, superseded by a later modification', () => {
    const det: WageDetermination = {
      ...determination,
      rates: [
        { classificationCode: 'PLUMBER', baseHourlyRateCents: dollars(50), fringePerHourCents: dollars(15), effectiveDate: '2026-01-01' },
        { classificationCode: 'PLUMBER', baseHourlyRateCents: dollars(52), fringePerHourCents: dollars(16), effectiveDate: '2026-07-01' },
      ],
    };
    assert.equal(findRateOnDate(det, 'PLUMBER', '2026-03-01')?.baseHourlyRateCents, dollars(50));
    assert.equal(findRateOnDate(det, 'PLUMBER', '2026-08-01')?.baseHourlyRateCents, dollars(52));
    // A modification published later never rewrites a cheque dated before it.
    assert.equal(findRateOnDate(det, 'PLUMBER', '2026-06-30')?.baseHourlyRateCents, dollars(50));
  });

  test('a classification with no rate in force raises rather than defaulting to zero', () => {
    assert.throws(() => resolveRate(determination, 'ELECTRICIAN', '2026-03-01'), /no rate for classification/i);
  });
});

// ============================================================================
// Prevailing-wage weekly resolution — the core
// ============================================================================

describe('prevailing-wage weekly resolution (trades/prevailingWage.ts)', () => {
  test('weekly 40-hour overtime split lands on the last hours of the week', () => {
    const week = resolveWeek();
    assert.equal(week.totalHours, 48);
    assert.equal(week.totalStraightHours, 40);
    assert.equal(week.totalOvertimeHours, 8);
    // The 8 OT hours are the Friday private-job hours; every public-job hour is straight.
    const friday = week.entries.find((e) => e.date === '2026-01-09')!;
    assert.equal(friday.overtimeHours, 8);
    assert.equal(friday.straightHours, 0);
    for (const e of week.entries.filter((x) => x.jobId === 'J1')) assert.equal(e.overtimeHours, 0);
  });

  test('overtime premium uses the weighted-average basic rate across all hours, fringe excluded', () => {
    const week = resolveWeek();
    // (5000¢×40h + 3000¢×8h) / 48h = 224000/48 = 4666.67 → 4667¢
    assert.equal(week.regularRateCents, 4667);
    // half-time premium: round(4667 × 0.5) = 2334¢
    assert.equal(week.overtimePremiumPerHourCents, 2334);
  });

  test('effective base rate is the higher of shop and prevailing, and fringe is satisfied cash-over-credit', () => {
    const week = resolveWeek();
    const plumbing = week.entries.find((e) => e.jobId === 'J1')!;
    assert.equal(plumbing.effectiveBaseRateCents, dollars(50)); // max($40 shop, $50 prevailing)
    assert.equal(plumbing.fringeObligationPerHourCents, dollars(15));
    assert.equal(plumbing.creditedFringePerHourCents, dollars(5)); // plan contribution applied
    assert.equal(plumbing.cashFringePerHourCents, dollars(10)); // $15 obligation − $5 credit, paid as cash
    // Private-job work: no prevailing obligation, priced at the fallback shop rate.
    const service = week.entries.find((e) => e.jobId === 'J2')!;
    assert.equal(service.effectiveBaseRateCents, dollars(30));
    assert.equal(service.cashFringePerHourCents, 0);
  });

  test('earnings for the tax engine split into regular, overtime premium, and cash fringe — all taxable', () => {
    const week = resolveWeek();
    const byCode = Object.fromEntries(week.earnings.map((e) => [e.code, e]));
    assert.equal(byCode['REG'].amount, dollars(2240)); // $2000 plumbing straight + $240 service OT base
    assert.equal(byCode['OTP'].amount, 18672); // 8h × 2334¢
    assert.equal(byCode['FRNG'].amount, dollars(400)); // 40h × $10 cash fringe
    for (const e of week.earnings) assert.equal(e.category, 'regular');
    assert.equal(week.grossCashCents, dollars(2240) + 18672 + dollars(400));
  });

  test('reports what prevailing wage cost above the shop rate, per job × classification', () => {
    const week = resolveWeek();
    assert.equal(week.adjustments.length, 1); // only the public plumbing job
    const adj = week.adjustments[0];
    assert.equal(adj.jobId, 'J1');
    assert.equal(adj.baseMakeUpPerHourCents, dollars(10)); // $50 − $40
    assert.equal(adj.cashFringePerHourCents, dollars(10));
    // 40 hours × ($10 make-up + $10 cash fringe) = $800 the public job cost over shop rate.
    assert.equal(adj.extraCostVsShopRateCents, dollars(800));
  });

  test('a public job referencing a determination that was not supplied is a hard error', () => {
    assert.throws(
      () =>
        resolvePrevailingWageWeek({
          employeeId: 'joe',
          workedHours: [{ employeeId: 'joe', jobId: 'J1', date: '2026-01-05', classificationCode: 'PLUMBER', hours: 8 }],
          jobsById: new Map([[publicJob.id, publicJob]]),
          determinationsById: new Map(), // determination missing
          profile,
          fallbackBaseRateCents: dollars(30),
        }),
      /determination.*was not supplied/i,
    );
  });
});

// ============================================================================
// Workweek bucketing
// ============================================================================

describe('workweek bucketing (trades/prevailingWage.ts)', () => {
  test('groups hours into Sunday-start workweeks by a fixed 7-day cadence', () => {
    assert.equal(workweekStart('2026-01-09', 0), '2026-01-04'); // Fri → prior Sunday
    assert.equal(workweekStart('2026-01-11', 0), '2026-01-11'); // Sunday itself
    assert.equal(workweekStart('2026-01-08', 1), '2026-01-05'); // Monday-start week
    const twoWeeks: WorkedHours[] = [
      { employeeId: 'joe', jobId: 'J1', date: '2026-01-06', classificationCode: 'PLUMBER', hours: 8 },
      { employeeId: 'joe', jobId: 'J1', date: '2026-01-13', classificationCode: 'PLUMBER', hours: 8 },
    ];
    const weeks = groupIntoWorkweeks(twoWeeks, 0);
    assert.equal(weeks.size, 2);
    assert.ok(weeks.has('2026-01-04'));
    assert.ok(weeks.has('2026-01-11'));
  });
});

// ============================================================================
// End-to-end pay period through the existing tax engine
// ============================================================================

describe('a trades pay period through the payroll engine (trades/run.ts)', () => {
  test('prevailing-wage earnings flow through the tax engine, garnishments, and direct deposit unchanged', () => {
    const result = runTradesPayPeriod({
      company: weeklyShop(),
      employee: plumber(),
      profile,
      checkDate: '2026-01-14',
      workedHours: weekOfHours(),
      jobs: [publicJob, privateJob],
      determinations: [determination],
    });

    // The engine's gross ties exactly to the cash the prevailing-wage layer computed.
    const expectedGross = dollars(2240) + 18672 + dollars(400);
    assert.equal(result.computation.result.grossPay, expectedGross);
    assert.equal(result.weeks.length, 1);
    // FICA is withheld on the whole prevailing-wage gross, cash fringe included.
    assert.ok(result.computation.result.employeeTaxTotal > 0);
    assert.equal(result.adjustments.length, 1);
  });

  test('the earnings override drives percent-of-gross deductions off the supplied earnings', () => {
    const employee = plumber({
      deductionPlans: [{ id: 'd1', code: '401K', category: 'deferral_401k', amount: { kind: 'percentOfGross', percent: 10 }, active: true }],
    });
    const input = buildPaycheckInput(weeklyShop(), employee, '2026-01-14', undefined, [
      { code: 'REG', category: 'regular', amount: dollars(1000) },
    ]);
    // 10% of the overridden $1000 gross, not of the employee's payType formula.
    const deferral = input.deductions.find((d) => d.code === '401K')!;
    assert.equal(deferral.amount, dollars(100));
  });
});

// ============================================================================
// Job costing — burdened labor per job
// ============================================================================

describe('job costing (trades/jobCosting.ts)', () => {
  function costInputs(): { employees: EmployeeJobCostInput[]; jobsById: Map<string, Job>; ratings: Map<string, WorkersCompRating> } {
    const run = runTradesPayPeriod({
      company: weeklyShop(),
      employee: plumber(),
      profile,
      checkDate: '2026-01-14',
      workedHours: weekOfHours(),
      jobs: [publicJob, privateJob],
      determinations: [determination],
    });
    const employees: EmployeeJobCostInput[] = [
      {
        employeeId: 'joe',
        entries: run.weeks.flatMap((w) => w.entries),
        employerTaxTotalCents: run.computation.result.employerTaxTotal,
        defaultWorkersCompClassCode: '5183',
        workState: 'TX',
      },
    ];
    const jobsById = new Map([[publicJob.id, publicJob], [privateJob.id, privateJob]]);
    const ratings = new Map<string, WorkersCompRating>([
      ['5183', { classCode: '5183', ratePerHundredOfPayrollCents: dollars(3.5), experienceModificationFactor: 1 }],
    ]);
    return { employees, jobsById, ratings };
  }

  test('workers-comp premium is per class code with the overtime premium excluded from subject payroll', () => {
    const { employees, jobsById, ratings } = costInputs();
    const costs = computeJobCosts(employees, jobsById, ratings);
    const j1 = costs.find((c) => c.jobId === 'J1')!;
    const j2 = costs.find((c) => c.jobId === 'J2')!;

    // J1: $2400 subject (all straight), rate $3.50/$100 → $84.00
    assert.equal(j1.grossCashCents, dollars(2400));
    assert.equal(j1.workersCompPremiumCents, dollars(84));
    assert.equal(j1.employerFringePlanCents, dollars(200)); // 40h × $5 plan contribution
    // J2: $426.72 cash − $186.72 OT premium = $240 subject → $8.40
    assert.equal(j2.grossCashCents, dollars(426.72));
    assert.equal(j2.workersCompPremiumCents, dollars(8.4));
  });

  test('allocated employer taxes reconcile exactly to the paycheck total', () => {
    const { employees, jobsById, ratings } = costInputs();
    const costs = computeJobCosts(employees, jobsById, ratings);
    const allocated = costs.reduce((sum, c) => sum + c.employerTaxesCents, 0);
    assert.equal(allocated, employees[0].employerTaxTotalCents);
    // Burdened cost is wages + taxes + fringe plan + comp.
    for (const c of costs) {
      assert.equal(
        c.totalBurdenedCostCents,
        c.grossCashCents + c.employerTaxesCents + c.employerFringePlanCents + c.workersCompPremiumCents,
      );
    }
  });

  test('a class code with no rating supplied is an error, never a $0 premium', () => {
    const { employees, jobsById } = costInputs();
    assert.throws(() => computeJobCosts(employees, jobsById, new Map()), /no workers'-comp rating/i);
  });
});

// ============================================================================
// Certified payroll (WH-347)
// ============================================================================

describe('certified payroll WH-347 (trades/certifiedPayroll.ts)', () => {
  test('assembles per-employee/classification rows with this-project vs all-projects gross and reconciled deductions', () => {
    const run = runTradesPayPeriod({
      company: weeklyShop(),
      employee: plumber(),
      profile,
      checkDate: '2026-01-14',
      workedHours: weekOfHours(),
      jobs: [publicJob, privateJob],
      determinations: [determination],
    });

    const report = buildCertifiedPayroll(publicJob, '2026-01-04', [
      { employeeId: 'joe', entries: run.weeks.flatMap((w) => w.entries), weeklyPaycheck: run.computation.result },
    ]);

    assert.equal(report.weekEndingDate, '2026-01-10');
    assert.equal(report.contractNumber, 'DBA-778');
    assert.equal(report.rows.length, 1); // only PLUMBER worked J1
    const row = report.rows[0];
    assert.equal(row.classificationCode, 'PLUMBER');
    assert.equal(row.totalStraightHours, 40);
    assert.equal(row.totalOvertimeHours, 0);
    assert.equal(row.dayHours.length, 4); // Mon–Thu
    assert.equal(row.baseHourlyRateCents, dollars(50));
    assert.equal(row.fringePerHourCents, dollars(15));
    assert.equal(row.grossThisProjectCents, dollars(2400)); // plumbing straight + cash fringe
    assert.equal(row.grossAllProjectsCents, run.computation.result.grossPay); // both jobs

    // Deduction buckets reconcile to the paycheck's real gross-to-net delta.
    assert.equal(row.deductions.totalCents, run.computation.result.grossPay - run.computation.result.netPay);
    assert.equal(
      row.deductions.ficaCents + row.deductions.federalWithholdingCents + row.deductions.stateTaxCents + row.deductions.localTaxCents + row.deductions.otherCents,
      row.deductions.totalCents,
    );
    assert.ok(row.deductions.ficaCents > 0);
    assert.equal(row.netPayCents, run.computation.result.netPay);
  });

  test('statement of compliance flags fringe paid both to a plan and in cash, and lists the cash exception', () => {
    const run = runTradesPayPeriod({
      company: weeklyShop(),
      employee: plumber(),
      profile,
      checkDate: '2026-01-14',
      workedHours: weekOfHours(),
      jobs: [publicJob, privateJob],
      determinations: [determination],
    });
    const report = buildCertifiedPayroll(publicJob, '2026-01-04', [
      { employeeId: 'joe', entries: run.weeks.flatMap((w) => w.entries), weeklyPaycheck: run.computation.result },
    ]);
    assert.equal(report.statementOfCompliance.fringePaidToPlans, true);
    assert.equal(report.statementOfCompliance.fringePaidInCash, true);
    assert.deepEqual(report.statementOfCompliance.exceptions, ['PLUMBER']);
  });
});

// ============================================================================
// combineWeeklyEarnings across a multi-week period
// ============================================================================

describe('combining weeks into a pay period (trades/prevailingWage.ts)', () => {
  test('sums each earning code across the weeks of a longer pay period', () => {
    const w1 = resolveWeek();
    const w2 = resolveWeek();
    const combined = combineWeeklyEarnings([w1, w2]);
    const byCode = Object.fromEntries(combined.map((e) => [e.code, e.amount]));
    assert.equal(byCode['REG'], dollars(2240) * 2);
    assert.equal(byCode['OTP'], 18672 * 2);
    assert.equal(byCode['FRNG'], dollars(400) * 2);
  });
});

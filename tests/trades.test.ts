import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { dollars } from '../src/money.ts';
import { buildPaycheckInput } from '../payroll/engine.ts';
import { approvePayRun } from '../payroll/run.ts';
import { getEmployee, getPayRun, saveCompany, saveEmployees } from '../payroll/store.ts';
import { overtimeRuleForState } from '../payroll/timeAndAttendance.ts';
import { freshYearToDate } from '../payroll/ytd.ts';
import type { Company, Employee } from '../payroll/types.ts';

import {
  addWorkedHours,
  annualizeFringeCredits,
  approveRunById,
  buildCaliforniaCertifiedPayroll,
  buildCertifiedPayroll,
  buildTradesComplianceReport,
  certifiedPayrollForPeriod,
  checkApprenticeRatio,
  checkFringeAnnualization,
  DeterminationImportError,
  draftWeeklyTradesRun,
  fringeCreditsFromContributions,
  normalizeDetermination,
  slugifyClassification,
  combineWeeklyEarnings,
  computeJobCosts,
  draftTradesPayRun,
  findRateOnDate,
  getJob,
  getWageDetermination,
  getWorkerProfile,
  groupIntoWorkweeks,
  jobCostsForPeriod,
  InvalidAnnualHoursError,
  InvalidApprenticeRatioError,
  jobsForCompany,
  loadTradesPayRunInput,
  recalculateTradesPayRun,
  resolvePrevailingWageWeek,
  resolveRate,
  runTradesPayPeriod,
  saveJob,
  saveWageDetermination,
  saveWorkerProfile,
  totalApprenticeRatioExposure,
  UnknownCompanyError,
  voidPayRun,
  weeklyCertifiedPayroll,
  weeklyJobCosts,
  workedHoursForCompanyInRange,
  workedHoursForEmployeeInRange,
  workweekStart,
  type ApprenticeshipProgram,
  type EmployeeJobCostInput,
  type Job,
  type TradesRunRequest,
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

// A California public-works determination + job, for the daily-OT overlay and
// the DIR certified-payroll report.
const caDetermination: WageDetermination = {
  id: 'CA20260001',
  authority: 'davis-bacon',
  state: 'CA',
  locality: 'Los Angeles County',
  constructionType: 'building',
  // Zero fringe here keeps the daily-OT/double-time math clean; the DIR
  // report's fringe itemization is exercised via an explicit contributions
  // input instead.
  rates: [{ classificationCode: 'PLUMBER', baseHourlyRateCents: dollars(50), fringePerHourCents: 0, effectiveDate: '2026-01-01' }],
};
const caJob: Job = {
  id: 'CAJ1',
  companyId: 'shop-1',
  name: 'LA County building',
  workState: 'CA',
  workLocality: 'Los Angeles County',
  prevailingWage: { determinationId: 'CA20260001', projectName: 'LA County Facility' },
  workersCompClassCode: '5183',
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
// California daily overtime / double time overlay
// ============================================================================

describe('California daily overtime overlay (trades/prevailingWage.ts)', () => {
  // One 13-hour day on the California public job: 8h straight, 4h OT (8→12),
  // 1h double time (>12) under Cal. Labor Code § 510.
  function resolveCa() {
    return resolvePrevailingWageWeek({
      employeeId: 'joe',
      workedHours: [{ employeeId: 'joe', jobId: 'CAJ1', date: '2026-01-05', classificationCode: 'PLUMBER', hours: 13 }],
      jobsById: new Map([[caJob.id, caJob]]),
      determinationsById: new Map([[caDetermination.id, caDetermination]]),
      fallbackBaseRateCents: dollars(50),
      overtimeRule: overtimeRuleForState('CA'),
    });
  }

  test('splits a 13-hour day into 8 straight / 4 overtime / 1 double time', () => {
    const week = resolveCa();
    assert.equal(week.totalStraightHours, 8);
    assert.equal(week.totalOvertimeHours, 4);
    assert.equal(week.totalDoubleTimeHours, 1);
  });

  test('double time is paid the basic rate plus a full-time premium (2x), overtime the half-time premium', () => {
    const week = resolveCa();
    assert.equal(week.regularRateCents, dollars(50)); // single rate
    assert.equal(week.overtimePremiumPerHourCents, dollars(25));
    assert.equal(week.doubleTimePremiumPerHourCents, dollars(50));
    const byCode = Object.fromEntries(week.earnings.map((e) => [e.code, e.amount]));
    // REG: (8+4+1) base hours × $50 = $650
    assert.equal(byCode['REG'], dollars(650));
    // OTP: 4h × $25 = $100 ; DTP: 1h × $50 = $50
    assert.equal(byCode['OTP'], dollars(100));
    assert.equal(byCode['DTP'], dollars(50));
    // total cash: 8×50 + 4×75 + 1×100 = 400 + 300 + 100 = $800
    assert.equal(week.grossCashCents, dollars(800));
  });

  test('the federal weekly rule is unchanged — a 13-hour Monday is all straight until the week passes 40', () => {
    const week = resolvePrevailingWageWeek({
      employeeId: 'joe',
      workedHours: [{ employeeId: 'joe', jobId: 'CAJ1', date: '2026-01-05', classificationCode: 'PLUMBER', hours: 13 }],
      jobsById: new Map([[caJob.id, caJob]]),
      determinationsById: new Map([[caDetermination.id, caDetermination]]),
      fallbackBaseRateCents: dollars(50),
      // no overtimeRule → federal weekly-40
    });
    assert.equal(week.totalStraightHours, 13);
    assert.equal(week.totalOvertimeHours, 0);
    assert.equal(week.totalDoubleTimeHours, 0);
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

  test('a salaried worker who logs trades hours is priced at their hourly-equivalent, never $0', () => {
    // $104,000 / 2,080 = $50/hr equivalent, used where no per-classification rate is set.
    const foreman = plumber({ id: 'boss', payType: { kind: 'salary', annualSalary: dollars(104_000) } });
    const run = runTradesPayPeriod({
      company: weeklyShop(),
      employee: foreman,
      checkDate: '2026-01-14',
      workedHours: [{ employeeId: 'boss', jobId: 'J2', date: '2026-01-05', classificationCode: 'SERVICE', hours: 8 }],
      jobs: [privateJob],
      determinations: [],
    });
    const entry = run.weeks[0].entries[0];
    assert.equal(entry.effectiveBaseRateCents, dollars(50));
    assert.equal(entry.grossCashCents, dollars(400)); // 8h × $50, no fringe on a private job
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

// ============================================================================
// Crew-wide pay run + period rollups (trades/payRun.ts)
// ============================================================================

function officeManager(): Employee {
  return plumber({
    id: 'pat',
    firstName: 'Pat',
    lastName: 'Ledger',
    jobTitle: 'Office Manager',
    payType: { kind: 'salary', annualSalary: dollars(78_000) },
    workersCompClassCode: undefined,
  });
}

describe('crew-wide trades pay run (trades/payRun.ts)', () => {
  function draft(company = weeklyShop()) {
    return draftTradesPayRun({
      company,
      employees: [plumber(), officeManager()],
      profiles: [profile],
      periodStart: '2026-01-04',
      periodEnd: '2026-01-10',
      checkDate: '2026-01-14',
      workedHours: weekOfHours(),
      jobs: [publicJob, privateJob],
      determinations: [determination],
    });
  }

  test('mixes a prevailing-wage field worker and a salaried office worker in one draft run', () => {
    const result = draft();
    assert.equal(result.run.status, 'draft');
    assert.equal(result.run.lines.length, 2);

    const joeLine = result.run.lines.find((l) => l.employeeId === 'joe')!;
    const patLine = result.run.lines.find((l) => l.employeeId === 'pat')!;
    assert.equal(joeLine.grossPay, dollars(2240) + 18672 + dollars(400)); // prevailing-wage gross
    assert.equal(patLine.grossPay, Math.round(dollars(78_000) / 52)); // weekly salary slice

    const joe = result.employees.find((e) => e.employee.id === 'joe')!;
    const pat = result.employees.find((e) => e.employee.id === 'pat')!;
    assert.notEqual(joe.prevailingWage, null);
    assert.equal(pat.prevailingWage, null); // paid the ordinary way
  });

  test('the drafted run flows through the ordinary approve/YTD lifecycle unchanged', () => {
    const result = draft();
    const approved = approvePayRun(result.run, [plumber(), officeManager()]);
    assert.equal(approved.run.status, 'approved');
    assert.equal(approved.updatedEmployees.length, 2);
    // Joe's Social Security YTD picked up his prevailing-wage gross.
    const joe = approved.updatedEmployees.find((e) => e.id === 'joe')!;
    assert.ok(joe.ytd.socialSecurity > 0);
  });

  test('job costs roll up across the run from the crew’s resolved hours', () => {
    const result = draft();
    const ratings = new Map<string, WorkersCompRating>([
      ['5183', { classCode: '5183', ratePerHundredOfPayrollCents: dollars(3.5), experienceModificationFactor: 1 }],
    ]);
    const costs = jobCostsForPeriod(result, ratings);
    const j1 = costs.find((c) => c.jobId === 'J1')!;
    assert.equal(j1.grossCashCents, dollars(2400));
    assert.equal(j1.workersCompPremiumCents, dollars(84));
    // The salaried office line is overhead, not job labor — no phantom job for it.
    assert.equal(costs.some((c) => c.jobId === undefined), false);
  });

  test('certified payroll for the period yields one WH-347 per public job for the week', () => {
    const reports = certifiedPayrollForPeriod(draft(), 0);
    assert.equal(reports.length, 1); // only the public job J1
    assert.equal(reports[0].jobId, 'J1');
    assert.equal(reports[0].weekEndingDate, '2026-01-10');
    assert.equal(reports[0].rows[0].employeeId, 'joe');
    assert.equal(reports[0].rows[0].grossThisProjectCents, dollars(2400));
  });

  test('certified payroll refuses a non-weekly frequency rather than misstating a week’s deductions', () => {
    const biweekly: Company = { ...weeklyShop(), paySchedule: { frequency: 'biweekly', anchorPeriodStart: '2026-01-04', checkDateLagDays: 5 } };
    assert.throws(() => certifiedPayrollForPeriod(draft(biweekly), 0), /weekly pay frequency/i);
  });
});

// ============================================================================
// File-backed store (trades/store.ts) — isolated in a temp dir
// ============================================================================

describe('trades store (trades/store.ts)', () => {
  let dir: string;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'trades-store-'));
    process.env.TRADES_DB_DIR = dir;
  });
  after(() => {
    delete process.env.TRADES_DB_DIR;
    rmSync(dir, { recursive: true, force: true });
  });

  test('round-trips jobs, determinations, and worker profiles', () => {
    saveJob(publicJob);
    saveWageDetermination(determination);
    saveWorkerProfile(profile);
    assert.deepEqual(getJob('J1'), publicJob);
    assert.deepEqual(getWageDetermination('TX20260001'), determination);
    assert.deepEqual(getWorkerProfile('joe'), profile);
    assert.equal(jobsForCompany('shop-1').length, 1);
    assert.equal(getJob('nope'), null);
  });

  test('queries worked hours by employee and by company within a date range', () => {
    saveJob(publicJob);
    saveJob(privateJob);
    addWorkedHours(weekOfHours());
    assert.equal(workedHoursForEmployeeInRange('joe', '2026-01-04', '2026-01-10').length, 5);
    assert.equal(workedHoursForEmployeeInRange('joe', '2026-01-04', '2026-01-07').length, 3); // Mon–Wed only
    assert.equal(workedHoursForCompanyInRange('shop-1', '2026-01-01', '2026-01-31').length, 5);
    assert.equal(workedHoursForCompanyInRange('shop-1', '2026-02-01', '2026-02-28').length, 0);
  });
});

// ============================================================================
// Application service — stores + engine end to end (trades/service.ts)
// ============================================================================

describe('trades application service (trades/service.ts)', () => {
  let payrollDir: string;
  let tradesDir: string;
  const req: TradesRunRequest = { companyId: 'shop-1', periodStart: '2026-01-04', periodEnd: '2026-01-10', checkDate: '2026-01-14' };
  const ratings = new Map<string, WorkersCompRating>([
    ['5183', { classCode: '5183', ratePerHundredOfPayrollCents: dollars(3.5), experienceModificationFactor: 1 }],
  ]);

  before(() => {
    payrollDir = mkdtempSync(join(tmpdir(), 'payroll-store-'));
    tradesDir = mkdtempSync(join(tmpdir(), 'trades-svc-'));
    process.env.PAYROLL_DB_DIR = payrollDir;
    process.env.TRADES_DB_DIR = tradesDir;
    // Seed the payroll store (company + crew) and the trades store (jobs,
    // determination, profile, reported hours).
    saveCompany(weeklyShop());
    saveEmployees([plumber(), officeManager()]);
    saveWageDetermination(determination);
    saveJob(publicJob);
    saveJob(privateJob);
    saveWorkerProfile(profile);
    addWorkedHours(weekOfHours());
  });
  after(() => {
    delete process.env.PAYROLL_DB_DIR;
    delete process.env.TRADES_DB_DIR;
    rmSync(payrollDir, { recursive: true, force: true });
    rmSync(tradesDir, { recursive: true, force: true });
  });

  test('loads only the determinations this company’s jobs reference', () => {
    // An unrelated determination on file for nobody's job must not leak in.
    saveWageDetermination({ ...determination, id: 'OTHER-CO-DET' });
    const input = loadTradesPayRunInput(req);
    assert.deepEqual(input.determinations.map((d) => d.id), ['TX20260001']);
    assert.equal(input.employees.length, 2);
    assert.equal(input.workedHours.length, 5);
  });

  test('drafts a week from the stores, persists it, and approves by id into YTD', () => {
    const drafted = draftWeeklyTradesRun(req);
    assert.equal(drafted.run.lines.length, 2);
    // The draft was persisted and is retrievable for approval.
    assert.notEqual(getPayRun(drafted.run.id), null);

    const approved = approveRunById(drafted.run.id);
    assert.equal(approved.run.status, 'approved');
    // Joe's YTD was committed to the payroll store.
    const joe = getEmployee('joe')!;
    assert.ok(joe.ytd.socialSecurity > 0);
    assert.equal(joe.ytdYear, 2026);
  });

  test('produces the weekly certified payroll and job costs for the company', () => {
    const reports = weeklyCertifiedPayroll(req);
    assert.equal(reports.length, 1);
    assert.equal(reports[0].jobId, 'J1');

    const costs = weeklyJobCosts(req, ratings);
    const j1 = costs.find((c) => c.jobId === 'J1')!;
    assert.equal(j1.grossCashCents, dollars(2400));
    assert.equal(j1.workersCompPremiumCents, dollars(84));
  });

  test('an unknown company id is a typed error', () => {
    assert.throws(() => loadTradesPayRunInput({ ...req, companyId: 'ghost' }), UnknownCompanyError);
  });
});

// ============================================================================
// Davis-Bacon fringe annualization (trades/fringeAnnualization.ts)
// ============================================================================

describe('fringe annualization (trades/fringeAnnualization.ts)', () => {
  test('annualizes an annual contribution over TOTAL hours, not just Davis-Bacon hours', () => {
    // $5,200/yr over 2,080 total hours = $2.50/hr (not $5.00 over 1,040 DBA hours).
    const [pension] = annualizeFringeCredits([{ plan: 'Pension', basis: { kind: 'annual', annualAmountCents: dollars(5200) } }], 2080);
    assert.equal(pension.annualizedRatePerHourCents, dollars(2.5));
    assert.equal(pension.annualContributionCents, dollars(5200));
    assert.equal(pension.requiredAnnualization, true);
  });

  test('annualizes a monthly premium as 12 months over total hours', () => {
    // $650/mo × 12 = $7,800/yr over 2,080 = $3.75/hr.
    const [health] = annualizeFringeCredits([{ plan: 'Health', basis: { kind: 'monthly', monthlyAmountCents: dollars(650) } }], 2080);
    assert.equal(health.annualizedRatePerHourCents, dollars(3.75));
    assert.equal(health.annualContributionCents, dollars(7800));
  });

  test('rounds the creditable rate DOWN — over-crediting is the violation to avoid', () => {
    // $5,000 / 2,080 = 240.38¢ → floored to 240¢.
    const [p] = annualizeFringeCredits([{ plan: 'Pension', basis: { kind: 'annual', annualAmountCents: dollars(5000) } }], 2080);
    assert.equal(p.annualizedRatePerHourCents, 240);
  });

  test('an hourly-basis plan is exempt from annualization and passes through', () => {
    const [training] = annualizeFringeCredits([{ plan: 'Training', basis: { kind: 'hourly-all-hours', ratePerHourCents: dollars(1.5) } }], 2080);
    assert.equal(training.annualizedRatePerHourCents, dollars(1.5));
    assert.equal(training.requiredAnnualization, false);
    assert.equal(training.annualContributionCents, null);
  });

  test('a plan that must be annualized over zero hours is a typed error', () => {
    assert.throws(
      () => annualizeFringeCredits([{ plan: 'Pension', basis: { kind: 'annual', annualAmountCents: dollars(5200) } }], 0),
      InvalidAnnualHoursError,
    );
    // …but an hourly-basis plan needs no hours and does not throw.
    assert.doesNotThrow(() => annualizeFringeCredits([{ plan: 'Training', basis: { kind: 'hourly-all-hours', ratePerHourCents: dollars(1) } }], 0));
  });

  test('flags an over-claimed credit as back-wage exposure', () => {
    const findings = checkFringeAnnualization(
      [{ plan: 'Pension', ratePerHourCents: dollars(5) }], // employer claimed $5/hr
      [{ plan: 'Pension', basis: { kind: 'annual', annualAmountCents: dollars(5200) } }], // really $2.50/hr annualized
      2080,
    );
    assert.equal(findings.length, 1);
    assert.equal(findings[0].overClaimedPerHourCents, dollars(2.5));
    // A claim at or below the annualized rate is compliant.
    assert.equal(
      checkFringeAnnualization([{ plan: 'Pension', ratePerHourCents: dollars(2.5) }], [{ plan: 'Pension', basis: { kind: 'annual', annualAmountCents: dollars(5200) } }], 2080).length,
      0,
    );
  });

  test('annualized credits plug into the resolver and raise the cash fringe owed', () => {
    // Determination fringe is $15/hr; an annualized pension credit of $2.50/hr
    // leaves $12.50/hr owed as cash, not the $10 a naive $5 credit would leave.
    const annualizedProfile: TradeWorkerProfile = {
      employeeId: 'joe',
      classificationRates: [{ classificationCode: 'PLUMBER', baseRateCents: dollars(40) }],
      fringeCredits: fringeCreditsFromContributions([{ plan: 'Pension', basis: { kind: 'annual', annualAmountCents: dollars(5200) } }], 2080),
    };
    const week = resolvePrevailingWageWeek({
      employeeId: 'joe',
      workedHours: [{ employeeId: 'joe', jobId: 'J1', date: '2026-01-05', classificationCode: 'PLUMBER', hours: 8 }],
      jobsById: new Map([[publicJob.id, publicJob]]),
      determinationsById: new Map([[determination.id, determination]]),
      profile: annualizedProfile,
      fallbackBaseRateCents: dollars(30),
    });
    const entry = week.entries[0];
    assert.equal(entry.creditedFringePerHourCents, dollars(2.5));
    assert.equal(entry.cashFringePerHourCents, dollars(12.5));
  });
});

// ============================================================================
// Davis-Bacon apprentice ratio compliance (trades/apprenticeRatio.ts)
// ============================================================================

describe('apprentice ratio compliance (trades/apprenticeRatio.ts)', () => {
  const ratioDetermination: WageDetermination = {
    id: 'TXRATIO',
    authority: 'davis-bacon',
    state: 'TX',
    locality: 'Travis County',
    constructionType: 'building',
    rates: [
      { classificationCode: 'PLUMBER', baseHourlyRateCents: dollars(50), fringePerHourCents: dollars(15), effectiveDate: '2026-01-01' },
      { classificationCode: 'PLUMBER_APPRENTICE', baseHourlyRateCents: dollars(30), fringePerHourCents: dollars(9), effectiveDate: '2026-01-01' },
    ],
  };
  const ratioJob: Job = { id: 'JR', companyId: 'shop-1', name: 'Ratio job', workState: 'TX', prevailingWage: { determinationId: 'TXRATIO' }, workersCompClassCode: '5183' };
  const program: ApprenticeshipProgram = {
    id: 'P1',
    trade: 'Plumbing',
    journeyworkerClassificationCode: 'PLUMBER',
    apprenticeClassificationCodes: ['PLUMBER_APPRENTICE'],
    ratio: { apprentices: 1, journeyworkers: 3 }, // one apprentice per three journeyworkers
  };
  const dets = new Map([[ratioDetermination.id, ratioDetermination]]);
  const jobs = new Map([[ratioJob.id, ratioJob]]);
  const JW_TOTAL = dollars(65); // $50 base + $15 fringe

  function entriesFor(worked: WorkedHours[], employeeId: string) {
    return resolvePrevailingWageWeek({ employeeId, workedHours: worked, jobsById: jobs, determinationsById: dets, fallbackBaseRateCents: dollars(20) }).entries;
  }

  test('apprentice hours within the ratio produce no finding', () => {
    // 9h journeyworker allows 3h apprentice at 1:3; exactly 3h is within.
    const jw = entriesFor([{ employeeId: 'jw', jobId: 'JR', date: '2026-01-05', classificationCode: 'PLUMBER', hours: 9 }], 'jw');
    const appr = entriesFor([{ employeeId: 'a', jobId: 'JR', date: '2026-01-05', classificationCode: 'PLUMBER_APPRENTICE', hours: 3 }], 'a');
    assert.equal(checkApprenticeRatio('JR', [...jw, ...appr], program, JW_TOTAL).length, 0);
  });

  test('apprentice hours over the ratio owe the journeyworker rate on the excess', () => {
    const jw = entriesFor([{ employeeId: 'jw', jobId: 'JR', date: '2026-01-05', classificationCode: 'PLUMBER', hours: 8 }], 'jw');
    const appr = entriesFor([{ employeeId: 'a', jobId: 'JR', date: '2026-01-05', classificationCode: 'PLUMBER_APPRENTICE', hours: 8 }], 'a');
    const findings = checkApprenticeRatio('JR', [...jw, ...appr], program, JW_TOTAL);
    assert.equal(findings.length, 1);
    const f = findings[0];
    assert.equal(f.journeyworkerHours, 8);
    assert.equal(f.apprenticeHours, 8);
    assert.ok(Math.abs(f.allowableApprenticeHours - 8 / 3) < 1e-9); // 2.67h allowed
    assert.ok(Math.abs(f.overRatioApprenticeHours - 16 / 3) < 1e-9); // 5.33h over
    // 16/3 h × ($65 − $39 apprentice total) = 16/3 × 2600¢ = 13866.67 → 13867
    assert.equal(f.additionalWagesOwedCents, 13867);
  });

  test('with no journeyworker on site, every apprentice hour is over the ratio', () => {
    const appr = entriesFor([{ employeeId: 'a', jobId: 'JR', date: '2026-01-05', classificationCode: 'PLUMBER_APPRENTICE', hours: 6 }], 'a');
    const findings = checkApprenticeRatio('JR', appr, program, JW_TOTAL);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].overRatioApprenticeHours, 6);
    assert.equal(findings[0].additionalWagesOwedCents, dollars(156)); // 6h × ($65 − $39)
    assert.equal(totalApprenticeRatioExposure(findings), dollars(156));
  });

  test('an invalid ratio denominator is a typed error', () => {
    assert.throws(
      () => checkApprenticeRatio('JR', [], { ...program, ratio: { apprentices: 1, journeyworkers: 0 } }, JW_TOTAL),
      InvalidApprenticeRatioError,
    );
  });
});

// ============================================================================
// Additional state daily-OT rules (Alaska, Colorado)
// ============================================================================

describe('Alaska and Colorado daily overtime (payroll/timeAndAttendance.ts via the overlay)', () => {
  function oneDay(state: 'AK' | 'CO', hours: number) {
    const job: Job = { id: `${state}J`, companyId: 'shop-1', name: `${state} job`, workState: state, workersCompClassCode: '5183' };
    return resolvePrevailingWageWeek({
      employeeId: 'joe',
      workedHours: [{ employeeId: 'joe', jobId: job.id, date: '2026-01-05', classificationCode: 'PLUMBER', hours }],
      jobsById: new Map([[job.id, job]]),
      determinationsById: new Map(),
      fallbackBaseRateCents: dollars(40),
      overtimeRule: overtimeRuleForState(state),
    });
  }

  test('Alaska: overtime after 8 hours a day, no double time', () => {
    const week = oneDay('AK', 10);
    assert.equal(week.totalStraightHours, 8);
    assert.equal(week.totalOvertimeHours, 2);
    assert.equal(week.totalDoubleTimeHours, 0);
  });

  test('Colorado: overtime after 12 hours a day, no double time', () => {
    const week = oneDay('CO', 13);
    assert.equal(week.totalStraightHours, 12);
    assert.equal(week.totalOvertimeHours, 1);
    assert.equal(week.totalDoubleTimeHours, 0);
  });
});

// ============================================================================
// Recalculate / void a draft trades run (trades/payRun.ts)
// ============================================================================

describe('recalculating and voiding a draft trades run (trades/payRun.ts)', () => {
  function input(workedHours = weekOfHours()) {
    return {
      company: weeklyShop(),
      employees: [plumber()],
      profiles: [profile],
      periodStart: '2026-01-04',
      periodEnd: '2026-01-10',
      checkDate: '2026-01-14',
      workedHours,
      jobs: [publicJob, privateJob],
      determinations: [determination],
    };
  }

  test('recalculating a draft keeps its id but updates the numbers from corrected hours', () => {
    const first = draftTradesPayRun(input());
    // Corrected timecard: only Mon–Wed on the public job, 30h, no overtime.
    const corrected = recalculateTradesPayRun(
      first.run,
      input([
        { employeeId: 'joe', jobId: 'J1', date: '2026-01-05', classificationCode: 'PLUMBER', hours: 10 },
        { employeeId: 'joe', jobId: 'J1', date: '2026-01-06', classificationCode: 'PLUMBER', hours: 10 },
        { employeeId: 'joe', jobId: 'J1', date: '2026-01-07', classificationCode: 'PLUMBER', hours: 10 },
      ]),
    );
    assert.equal(corrected.run.id, first.run.id);
    assert.equal(corrected.run.createdAt, first.run.createdAt);
    const before = first.run.lines.find((l) => l.employeeId === 'joe')!.grossPay;
    const after = corrected.run.lines.find((l) => l.employeeId === 'joe')!.grossPay;
    assert.ok(after < before, 'fewer hours → lower gross');
    // 30h plumbing: 30 × $50 + 30 × $10 cash fringe = $1500 + $300 = $1800, no OT.
    assert.equal(after, dollars(1800));
  });

  test('voiding a draft flips its status; recalculating a non-draft run throws', () => {
    const drafted = draftTradesPayRun(input());
    assert.equal(voidPayRun(drafted.run).status, 'voided');
    assert.throws(() => recalculateTradesPayRun(voidPayRun(drafted.run), input()), /Cannot recalculate a voided/i);
  });
});

// ============================================================================
// California DIR certified payroll (trades/californiaCertifiedPayroll.ts)
// ============================================================================

describe('California DIR certified payroll (trades/californiaCertifiedPayroll.ts)', () => {
  function caRun() {
    return runTradesPayPeriod({
      company: weeklyShop(),
      employee: plumber({ residenceState: { code: 'CA' }, workState: { code: 'CA' } }),
      profile,
      checkDate: '2026-01-14',
      workedHours: [{ employeeId: 'joe', jobId: 'CAJ1', date: '2026-01-05', classificationCode: 'PLUMBER', hours: 13 }],
      jobs: [caJob],
      determinations: [caDetermination],
    });
  }

  test('produces a DIR report with daily ST/OT/DT hours, itemized fringe, and DIR header fields', () => {
    const run = caRun();
    const report = buildCaliforniaCertifiedPayroll(
      caJob,
      '2026-01-04',
      [
        {
          employeeId: 'joe',
          entries: run.weeks.flatMap((w) => w.entries),
          weeklyPaycheck: run.computation.result,
          fringeContributions: [{ plan: 'Health & Welfare', ratePerHourCents: dollars(5) }],
        },
      ],
      { contractorDirRegistrationNumber: '1000001234', dirProjectId: 'DIR-42', awardingBody: 'Los Angeles County' },
    );

    assert.equal(report.workState, 'CA');
    assert.equal(report.weekEndingDate, '2026-01-10');
    assert.equal(report.contractorDirRegistrationNumber, '1000001234');
    assert.equal(report.dirProjectId, 'DIR-42');
    assert.equal(report.rows.length, 1);

    const row = report.rows[0];
    assert.equal(row.totalStraightHours, 8);
    assert.equal(row.totalOvertimeHours, 4);
    assert.equal(row.totalDoubleTimeHours, 1); // the daily overlay carried through to the DIR form
    assert.equal(row.baseHourlyRateCents, dollars(50));
    assert.deepEqual(row.fringeContributions, [{ plan: 'Health & Welfare', ratePerHourCents: dollars(5) }]);
    assert.equal(row.grossThisProjectCents, dollars(800)); // 8×50 + 4×75 + 1×100
    // Deductions reconcile to the paycheck even with California state tax present.
    assert.equal(row.deductions.totalCents, run.computation.result.grossPay - run.computation.result.netPay);
    assert.ok(row.deductions.stateTaxCents > 0, 'California income tax withheld');
  });
});

// ============================================================================
// Determination import / normalization (trades/importDetermination.ts)
// ============================================================================

describe('determination import (trades/importDetermination.ts)', () => {
  const goodExport = {
    determinationId: 'TX20260099',
    authority: 'davis-bacon' as const,
    state: 'TX',
    locality: 'Travis County',
    constructionType: 'building' as const,
    rows: [
      { classification: 'Plumber', baseHourlyRate: 50, fringeRate: 15, effectiveDate: '2026-01-01' },
      { classification: 'Plumber, Apprentice (1st period)', baseHourlyRate: 30, fringeRate: 9, effectiveDate: '2026-01-01' },
    ],
  };

  test('normalizes dollars to cents and derives classification codes from titles', () => {
    const det = normalizeDetermination(goodExport);
    assert.equal(det.id, 'TX20260099');
    assert.equal(det.rates[0].classificationCode, 'PLUMBER');
    assert.equal(det.rates[0].baseHourlyRateCents, dollars(50));
    assert.equal(det.rates[0].fringePerHourCents, dollars(15));
    assert.equal(det.rates[1].classificationCode, 'PLUMBER_APPRENTICE_1ST_PERIOD');
  });

  test('an explicit classification code is preferred over the derived one', () => {
    const det = normalizeDetermination({ ...goodExport, rows: [{ ...goodExport.rows[0], classificationCode: 'PLUMB_JW' }] });
    assert.equal(det.rates[0].classificationCode, 'PLUMB_JW');
  });

  test('slugify collapses punctuation and spacing', () => {
    assert.equal(slugifyClassification('Plumber, Apprentice (1st period)'), 'PLUMBER_APPRENTICE_1ST_PERIOD');
  });

  test('malformed input raises rather than importing a wrong rate', () => {
    assert.throws(() => normalizeDetermination({ ...goodExport, state: 'Texas' }), DeterminationImportError);
    assert.throws(() => normalizeDetermination({ ...goodExport, constructionType: 'skyscraper' }), DeterminationImportError);
    assert.throws(() => normalizeDetermination({ ...goodExport, rows: [{ ...goodExport.rows[0], effectiveDate: '01/01/2026' }] }), DeterminationImportError);
    // Right shape, impossible date — rejected at the boundary, not left to corrupt date resolution downstream.
    assert.throws(() => normalizeDetermination({ ...goodExport, rows: [{ ...goodExport.rows[0], effectiveDate: '2026-13-45' }] }), DeterminationImportError);
    assert.throws(() => normalizeDetermination({ ...goodExport, rows: [{ ...goodExport.rows[0], baseHourlyRate: -1 }] }), DeterminationImportError);
    assert.throws(() => normalizeDetermination({ ...goodExport, rows: [] }), DeterminationImportError);
  });

  test('a normalized determination resolves rates by date like any other', () => {
    const det = normalizeDetermination(goodExport);
    assert.equal(findRateOnDate(det, 'PLUMBER', '2026-06-01')?.baseHourlyRateCents, dollars(50));
  });
});

// ============================================================================
// Consolidated compliance report (trades/compliance.ts)
// ============================================================================

describe('consolidated compliance report (trades/compliance.ts)', () => {
  function baseRun() {
    return draftTradesPayRun({
      company: weeklyShop(),
      employees: [plumber()],
      profiles: [profile],
      periodStart: '2026-01-04',
      periodEnd: '2026-01-10',
      checkDate: '2026-01-14',
      workedHours: weekOfHours(),
      jobs: [publicJob, privateJob],
      determinations: [determination],
    });
  }

  test('lists already-paid prevailing-wage adjustments but counts zero exposure without audits', () => {
    const report = buildTradesComplianceReport({ run: baseRun() });
    assert.ok(report.prevailingWageAdjustments.some((a) => a.employeeId === 'joe' && a.jobId === 'J1'));
    assert.equal(report.totalBackWageExposureCents, 0);
  });

  test('a fringe over-claim becomes dollar exposure over the worker Davis-Bacon hours', () => {
    // joe claims $5/hr (his profile); $6,240/yr over 2,080h annualizes to $3/hr → $2/hr over-claim.
    const report = buildTradesComplianceReport({
      run: baseRun(),
      fringeAudits: [{ employeeId: 'joe', contributions: [{ plan: 'Health & Welfare', basis: { kind: 'annual', annualAmountCents: dollars(6240) } }], totalAnnualHoursWorked: 2080 }],
    });
    assert.equal(report.fringeAnnualizationFindings.length, 1);
    const f = report.fringeAnnualizationFindings[0];
    assert.equal(f.overClaimedPerHourCents, dollars(2));
    assert.equal(f.davisBaconHours, 40); // joe's public plumbing hours (J2 Friday is private)
    assert.equal(f.dollarExposureCents, dollars(80)); // $2/hr × 40h
    assert.equal(report.totalBackWageExposureCents, dollars(80));
  });

  test('apprentice-ratio findings from a program roll into total exposure', () => {
    const apprDet: WageDetermination = {
      id: 'TXAPP', authority: 'davis-bacon', state: 'TX', locality: 'Travis County', constructionType: 'building',
      rates: [
        { classificationCode: 'PLUMBER', baseHourlyRateCents: dollars(50), fringePerHourCents: dollars(15), effectiveDate: '2026-01-01' },
        { classificationCode: 'PLUMBER_APPRENTICE', baseHourlyRateCents: dollars(30), fringePerHourCents: dollars(9), effectiveDate: '2026-01-01' },
      ],
    };
    const apprJob: Job = { id: 'JA', companyId: 'shop-1', name: 'Apprentice job', workState: 'TX', prevailingWage: { determinationId: 'TXAPP' }, workersCompClassCode: '5183' };
    const prog: ApprenticeshipProgram = { id: 'P', trade: 'Plumbing', journeyworkerClassificationCode: 'PLUMBER', apprenticeClassificationCodes: ['PLUMBER_APPRENTICE'], ratio: { apprentices: 1, journeyworkers: 3 } };

    const run = draftTradesPayRun({
      company: weeklyShop(),
      employees: [plumber({ id: 'jw' }), plumber({ id: 'appr', payType: { kind: 'hourly', hourlyRate: dollars(20) } })],
      profiles: [],
      periodStart: '2026-01-04', periodEnd: '2026-01-10', checkDate: '2026-01-14',
      workedHours: [
        { employeeId: 'jw', jobId: 'JA', date: '2026-01-05', classificationCode: 'PLUMBER', hours: 8 },
        { employeeId: 'appr', jobId: 'JA', date: '2026-01-05', classificationCode: 'PLUMBER_APPRENTICE', hours: 8 },
      ],
      jobs: [apprJob],
      determinations: [apprDet],
    });

    const report = buildTradesComplianceReport({ run, apprenticePrograms: [{ program: prog, journeyworkerRateCents: dollars(65) }] });
    assert.equal(report.apprenticeRatioFindings.length, 1);
    assert.equal(report.apprenticeRatioFindings[0].additionalWagesOwedCents, 13867);
    assert.equal(report.totalBackWageExposureCents, 13867);
  });

  test('a minimum-wage rate gap is surfaced but never summed into the dollar exposure (different unit)', () => {
    // shortfallCents is cents-per-HOUR, not a period total; summing it would be a units error.
    const underpaid = plumber({ id: 'low', payType: { kind: 'hourly', hourlyRate: dollars(5) } }); // below the $7.25 federal floor
    const run = draftTradesPayRun({
      company: weeklyShop(),
      employees: [underpaid],
      profiles: [],
      periodStart: '2026-01-04', periodEnd: '2026-01-10', checkDate: '2026-01-14',
      workedHours: [],
      jobs: [],
      determinations: [],
    });
    const report = buildTradesComplianceReport({ run });
    assert.ok(report.minimumWageIssues.length >= 1); // surfaced
    assert.equal(report.totalBackWageExposureCents, 0); // but not summed
  });
});

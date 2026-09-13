import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { dollars } from '../src/money.ts';
import { computeCompanyReport } from '../payroll/reports.ts';
import { freshYearToDate } from '../payroll/ytd.ts';
import type { Company, Employee, PayRun, PayRunLine } from '../payroll/types.ts';

function company(): Company {
  return {
    id: 'co-1',
    legalName: 'Test Co',
    ein: '12-3456789',
    homeState: 'TX',
    paySchedule: { frequency: 'biweekly', anchorPeriodStart: '2026-01-04', checkDateLagDays: 5 },
  };
}

function employee(overrides: Partial<Employee> & { id: string }): Employee {
  return {
    companyId: 'co-1',
    firstName: 'Test',
    lastName: 'Employee',
    hireDate: '2024-01-01',
    employmentCategory: 'standard',
    payType: { kind: 'hourly', hourlyRate: dollars(20) },
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

function line(employeeId: string, grossPay: number, employeeTaxTotal: number, employerTaxTotal: number): PayRunLine {
  return {
    employeeId,
    grossPay,
    netPay: grossPay - employeeTaxTotal,
    employeeTaxTotal,
    employerTaxTotal,
    pretaxDeductions: 0,
    posttaxDeductions: 0,
    garnishmentTotal: 0,
    netPayAfterGarnishment: grossPay - employeeTaxTotal,
    taxLines: [],
    garnishmentLines: [],
    depositAllocations: [],
  };
}

function run(overrides: Partial<PayRun> & { id: string; checkDate: string; lines: PayRunLine[] }): PayRun {
  return { companyId: 'co-1', periodStart: '2026-01-01', periodEnd: '2026-01-14', status: 'approved', createdAt: '2026-01-01T00:00:00Z', minimumWageIssues: [], ...overrides };
}

describe('company reports (payroll/reports.ts)', () => {
  test('headcount matches activeEmployeesFor exactly — a future hire and a past termination are both excluded', () => {
    const employees = [
      employee({ id: 'e1', hireDate: '2024-01-01' }),
      employee({ id: 'future', hireDate: '2027-01-01' }),
      employee({ id: 'gone', hireDate: '2020-01-01', terminationDate: '2025-12-31' }),
    ];
    const report = computeCompanyReport(company(), employees, [], '2026-06-15');
    assert.equal(report.headcount, 1);
  });

  test('department breakdown groups active employees by department, unassigned ones under a clear label, sorted by headcount', () => {
    const employees = [
      employee({ id: 'e1', department: 'Engineering' }),
      employee({ id: 'e2', department: 'Engineering' }),
      employee({ id: 'e3', department: 'Sales' }),
      employee({ id: 'e4' }), // no department at all
    ];
    const report = computeCompanyReport(company(), employees, [], '2026-06-15');
    assert.deepEqual(report.byDepartment, [
      { department: 'Engineering', headcount: 2 },
      { department: 'Sales', headcount: 1 },
      { department: '(unassigned)', headcount: 1 },
    ]);
  });

  test('YTD payroll cost sums gross pay and both tax totals across approved runs in the requested year only', () => {
    const runs: PayRun[] = [
      run({ id: 'r1', checkDate: '2026-01-22', lines: [line('e1', dollars(3_000), dollars(500), dollars(400))] }),
      run({ id: 'r2', checkDate: '2026-02-05', lines: [line('e1', dollars(3_000), dollars(500), dollars(400))] }),
      run({ id: 'r3', checkDate: '2027-01-22', lines: [line('e1', dollars(999_999), dollars(1), dollars(1))] }), // different year, must not count
      run({ id: 'r4', checkDate: '2026-03-01', status: 'draft', lines: [line('e1', dollars(999_999), dollars(1), dollars(1))] }), // draft, must not count
    ];
    const report = computeCompanyReport(company(), [employee({ id: 'e1' })], runs, '2026-06-15');
    assert.equal(report.ytdGrossPay, dollars(6_000));
    assert.equal(report.ytdEmployeeTaxes, dollars(1_000));
    assert.equal(report.ytdEmployerTaxes, dollars(800));
    assert.equal(report.ytdTotalPayrollCost, dollars(6_800), 'total cost is gross pay PLUS employer taxes, not just gross pay');
    assert.equal(report.payRunCount, 2);
  });

  test('a company with no runs at all reports clean zeros, not undefined or a crash', () => {
    const report = computeCompanyReport(company(), [employee({ id: 'e1' })], [], '2026-06-15');
    assert.equal(report.ytdGrossPay, 0);
    assert.equal(report.payRunCount, 0);
  });

  test('a run belonging to a different company is never counted', () => {
    const runs: PayRun[] = [run({ id: 'r1', companyId: 'co-OTHER', checkDate: '2026-01-22', lines: [line('e1', dollars(50_000), 0, 0)] })];
    const report = computeCompanyReport(company(), [employee({ id: 'e1' })], runs, '2026-06-15');
    assert.equal(report.ytdGrossPay, 0);
  });
});

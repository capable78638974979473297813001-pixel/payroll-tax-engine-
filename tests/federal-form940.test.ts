import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { dollars } from '../src/money.ts';
import { approvePayRun, draftPayRun, freshYearToDate, generatePayPeriods } from '../payroll/index.ts';
import type { Company, Employee, PayRun } from '../payroll/types.ts';
import {
  computeForm940,
  futaDepositPlan,
  paymentsOverWageBase,
  renderForm940,
  scheduleA,
} from '../payroll/federal/form940.ts';
import type { EmployerIdentity } from '../payroll/federal/form941.ts';

const employer: EmployerIdentity = {
  ein: '123456789',
  legalName: 'Rooter Bros LLC',
  address: { street: '1 Main St', city: 'Sacramento', state: 'CA', zip: '95814' },
};

describe('Form 940 lines 3-7 (Instructions for Form 940, 2025: Joan, Sara and John)', () => {
  test('payments $44,000 / $8,000 / $16,000 with $2,000 / $500 / $2,000 exempt -> line 5 is $42,500', () => {
    const r = paymentsOverWageBase([
      { payments: dollars(44_000), exempt: dollars(2_000) },
      { payments: dollars(8_000), exempt: dollars(500) },
      { payments: dollars(16_000), exempt: dollars(2_000) },
    ]);
    assert.equal(r.overBase, dollars(42_500)); // 35,000 + 500 + 7,000
    assert.equal(r.exempt, dollars(4_500));
    // line 3 = 68,000; line 6 = 4,500 + 42,500 = 47,000; line 7 = 21,000 = 3 x 7,000
    assert.equal(dollars(68_000) - (r.exempt + r.overBase), dollars(21_000));
  });
  test('an employee under the base contributes nothing to line 5', () => {
    assert.equal(paymentsOverWageBase([{ payments: dollars(6_000), exempt: 0 }]).overBase, 0);
  });
});

describe('Form 940 deposits (Instructions: $200 on Mar 28, $400 on Jun 28)', () => {
  test('tax accumulates until it exceeds $500; then $600 is deposited by July 31', () => {
    const plan = futaDepositPlan(2025, [dollars(200), dollars(400), 0, 0]);
    assert.equal(plan[0].depositDue, undefined, '"You weren\'t required to make a deposit for the 1st quarter"');
    assert.deepEqual(plan[1].depositDue, { amount: dollars(600), dueDate: '2025-07-31' });
    assert.equal(plan[2].depositDue, undefined);
    assert.equal(plan[3].depositDue, undefined);
  });
  test('exactly $500 is not over the threshold and carries', () => {
    const plan = futaDepositPlan(2025, [dollars(500), 0, 0, 0]);
    assert.equal(plan[0].depositDue, undefined);
    const over = futaDepositPlan(2025, [dollars(500) + 1, 0, 0, 0]);
    assert.deepEqual(over[0].depositDue, { amount: dollars(500) + 1, dueDate: '2025-04-30' });
  });
  test('a cumulative amount over $500 at year end is due Feb 2, 2026 (Jan 31 is a Saturday)', () => {
    const plan = futaDepositPlan(2025, [0, 0, 0, dollars(900)]);
    assert.deepEqual(plan[3].depositDue, { amount: dollars(900), dueDate: '2026-02-02' });
  });
});

describe('Schedule A: credit reduction', () => {
  test('wages x the state rate; states with no reduction are left out', () => {
    const r = scheduleA({ CA: dollars(50_000), TX: dollars(20_000), VI: dollars(7_000) }, { CA: 0.012, VI: 0.045 });
    assert.deepEqual(r.rows.map((x) => [x.state, x.creditReduction]), [['CA', dollars(600)], ['VI', dollars(315)]]);
    assert.equal(r.total, dollars(915));
  });
});

describe('Form 940 from a REAL year of engine pay runs (California, 2025 credit reduction of 1.2%)', () => {
  const BIG = 10; // ten employees at the $7,000 base, plus one earning under it
  const company: Company = {
    id: 'co-ca',
    legalName: 'Rooter Bros LLC',
    ein: '12-3456789',
    homeState: 'CA',
    paySchedule: { frequency: 'biweekly', anchorPeriodStart: '2026-01-04', checkDateLagDays: 5 },
  };
  const mk = (id: string, salary: number): Employee => ({
    id,
    companyId: company.id,
    firstName: id,
    lastName: 'Test',
    hireDate: '2020-01-01',
    employmentCategory: 'standard',
    payType: { kind: 'salary', annualSalary: dollars(salary) },
    residenceState: { code: 'CA' },
    federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
    deductionPlans: [],
    directDepositAccounts: [],
    garnishmentOrders: [],
    ytd: freshYearToDate(),
    ytdYear: 2026,
  });
  function yearOfRuns(): PayRun[] {
    let employees = [mk('a', 3_900), ...Array.from({ length: BIG }, (_, i) => mk(`b${i}`, 52_000))];
    const out: PayRun[] = [];
    for (const period of generatePayPeriods(company.paySchedule, 2026)) {
      const drafted = draftPayRun(company, employees, period.periodStart, period.periodEnd, period.checkDate);
      const { run, updatedEmployees } = approvePayRun(drafted, employees);
      employees = updatedEmployees;
      out.push(run);
    }
    return out;
  }

  test('lines 3-8 tie out; the cap applies per employee; the net rate is 0.6%', () => {
    const runs = yearOfRuns();
    const periods = generatePayPeriods(company.paySchedule, 2026).length;
    const each = (annual: number) => Math.round(dollars(annual) / 26) * periods;
    const f = computeForm940({ employer, year: 2026, runs, creditReduction: { states: {}, determined: true } }, company.id);
    assert.equal(f.line3_totalPayments, each(3_900) + BIG * each(52_000));
    // 'a' earns $3,900 a year (under $7,000): fully taxable. Each 'b' is capped at $7,000.
    assert.equal(f.line7_totalTaxableFutaWages, each(3_900) + BIG * dollars(7_000));
    assert.equal(f.line6_subtotal, f.line3_totalPayments - f.line7_totalTaxableFutaWages);
    assert.equal(f.line8_futaTaxBeforeAdjustments, Math.round((f.line7_totalTaxableFutaWages * 6) / 1000));
    assert.equal(f.line12_totalFutaTax, f.line8_futaTaxBeforeAdjustments);
    assert.equal(f.line1a_singleState, 'CA');
    assert.equal(f.line2_creditReductionState, false);
  });

  test('a credit-reduction state adds Schedule A tax to line 11 and to the FOURTH quarter only', () => {
    const runs = yearOfRuns();
    const f = computeForm940({ employer, year: 2026, runs, creditReduction: { states: { CA: 0.012 }, determined: true } }, company.id);
    assert.equal(f.line2_creditReductionState, true);
    assert.equal(f.line11_creditReduction, Math.round((f.line7_totalTaxableFutaWages * 12) / 1000));
    assert.equal(f.line12_totalFutaTax, f.line8_futaTaxBeforeAdjustments + f.line11_creditReduction);
    const q = f.quarters.map((x) => x.liability);
    assert.equal(q[0] + q[1] + q[2] + q[3], f.line12_totalFutaTax, 'lines 16a-16d total line 12 (= line 17)');
    // Q1-Q3 carry only the 0.6% on their own wages; the reduction is recorded in Q4.
    assert.ok(q[3] >= f.line11_creditReduction);
    assert.equal(f.scheduleA!.rows[0].state, 'CA');
    assert.equal(f.scheduleA!.rows[0].futaTaxableWages, f.line7_totalTaxableFutaWages);
  });

  test('a year whose credit-reduction list is not final is flagged, not silently treated as 0.6%', () => {
    const f = computeForm940({ employer, year: 2026, runs: yearOfRuns() }, company.id);
    assert.equal(f.findings.some((x) => x.code === 'credit_reduction_not_determined'), true);
    assert.match(renderForm940(f), /Form 940 for 2026/);
  });

  test('line 9 and lines 10/11 are mutually exclusive', () => {
    const f = computeForm940(
      { employer, year: 2026, runs: yearOfRuns(), allWagesExcludedFromStateUnemployment: true, worksheetCredit: dollars(100), creditReduction: { states: { CA: 0.012 }, determined: true } },
      company.id,
    );
    assert.equal(f.line9_allWagesExcluded, Math.round((f.line7_totalTaxableFutaWages * 54) / 1000));
    assert.equal(f.line10_worksheet, 0);
    assert.equal(f.line11_creditReduction, 0);
  });

  test('balance due and overpayment are never both filled; over $500 must have been deposited', () => {
    const runs = yearOfRuns();
    const base = computeForm940({ employer, year: 2026, runs, creditReduction: { states: { CA: 0.012 }, determined: true } }, company.id);
    assert.ok(base.line12_totalFutaTax > dollars(500));
    assert.equal(base.balanceMustHaveBeenDeposited, true);
    const paid = computeForm940({
      employer, year: 2026, runs, creditReduction: { states: { CA: 0.012 }, determined: true },
      deposits: [{ id: 'd', date: '2027-01-29', amount: base.line12_totalFutaTax + 1_000, quarter: 4 }],
    }, company.id);
    assert.equal(paid.line14_balanceDue, 0);
    assert.equal(paid.line15a_overpayment, 1_000);
  });
});

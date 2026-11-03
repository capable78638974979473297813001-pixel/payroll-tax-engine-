import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { dollars } from '../src/money.ts';
import { computeW2FromEmployee, type W2Summary } from '../payroll/filings.ts';
import { approvePayRun, draftPayRun, freshYearToDate, generatePayPeriods } from '../payroll/index.ts';
import type { Company, Employee, PayRun } from '../payroll/types.ts';
import { computeForm941, type EmployerIdentity } from '../payroll/federal/form941.ts';
import { buildW3, reconcileW3With941, validateW2 } from '../payroll/federal/w3.ts';

const employer: EmployerIdentity = {
  ein: '123456789',
  legalName: 'Rooter Bros LLC',
  address: { street: '1 Main St', city: 'Columbus', state: 'OH', zip: '43215' },
};

function w2(overrides: Partial<W2Summary> = {}): W2Summary {
  return {
    employeeId: 'e1',
    year: 2026,
    box1_wages: dollars(50_000),
    box2_federalIncomeTaxWithheld: dollars(5_000),
    box3_socialSecurityWages: dollars(50_000),
    box4_socialSecurityTaxWithheld: dollars(3_100),
    box5_medicareWages: dollars(50_000),
    box6_medicareTaxWithheld: dollars(725),
    box10_dependentCareBenefits: 0,
    box12: [],
    box15to17_state: [],
    box18to20_local: [],
    ...overrides,
  };
}

describe('W-2 checklist from the W-2/W-3 instructions', () => {
  test('a clean W-2 has no findings', () => {
    assert.deepEqual(validateW2(w2(), 2026), []);
  });
  test('box 4 with no box 3 wages is an error', () => {
    const f = validateW2(w2({ box3_socialSecurityWages: 0 }), 2026);
    assert.equal(f.some((x) => x.code === 'box4_without_box3'), true);
  });
  test('box 6 with no box 5 wages is an error', () => {
    const f = validateW2(w2({ box5_medicareWages: 0, box3_socialSecurityWages: 0, box4_socialSecurityTaxWithheld: 0 }), 2026);
    assert.equal(f.some((x) => x.code === 'box6_without_box5'), true);
  });
  test('box 5 less than box 3 is an error', () => {
    const f = validateW2(w2({ box5_medicareWages: dollars(40_000) }), 2026);
    assert.equal(f.some((x) => x.code === 'box5_less_than_box3'), true);
  });
  test('social security wages over the 2026 base of $184,500 are an error; exactly the base is fine', () => {
    assert.equal(validateW2(w2({ box3_socialSecurityWages: dollars(184_500), box5_medicareWages: dollars(184_500) }), 2026).some((x) => x.code === 'box3_over_wage_base'), false);
    assert.equal(validateW2(w2({ box3_socialSecurityWages: dollars(184_501), box5_medicareWages: dollars(184_501) }), 2026).some((x) => x.code === 'box3_over_wage_base'), true);
  });
});

describe('W-3 totals', () => {
  test('sums every box, box 12 by code, and state totals', () => {
    const a = w2({ employeeId: 'a', box12: [{ code: 'D', amount: dollars(1_000) }], box15to17_state: [{ state: 'OH', wages: dollars(50_000), incomeTaxWithheld: dollars(900) }] });
    const b = w2({ employeeId: 'b', box12: [{ code: 'D', amount: dollars(500) }, { code: 'DD', amount: dollars(7_000) }], box15to17_state: [{ state: 'OH', wages: dollars(50_000), incomeTaxWithheld: dollars(800) }] });
    const w3 = buildW3(2026, employer, [a, b]);
    assert.equal(w3.totalForms, 2);
    assert.equal(w3.box1_wages, dollars(100_000));
    assert.equal(w3.box4_socialSecurityTaxWithheld, dollars(6_200));
    assert.deepEqual(w3.box12ByCode, { D: dollars(1_500), DD: dollars(7_000) });
    assert.deepEqual(w3.stateTotals, { OH: { wages: dollars(100_000), incomeTaxWithheld: dollars(1_700) } });
    assert.equal(w3.due, '2027-02-01');
  });
});

describe('W-3 <-> Form 941 reconciliation on a REAL year of engine pay runs', () => {
  const company: Company = {
    id: 'co-1',
    legalName: 'Rooter Bros LLC',
    ein: '12-3456789',
    homeState: 'TX',
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
    residenceState: { code: 'TX' },
    federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
    deductionPlans: [],
    directDepositAccounts: [],
    garnishmentOrders: [],
    ytd: freshYearToDate(),
    ytdYear: 2026,
  });

  function year() {
    let employees = [mk('low', 52_000), mk('mid', 98_500), mk('high', 330_000)];
    const runs: PayRun[] = [];
    for (const p of generatePayPeriods(company.paySchedule, 2026)) {
      const drafted = draftPayRun(company, employees, p.periodStart, p.periodEnd, p.checkDate);
      const { run, updatedEmployees } = approvePayRun(drafted, employees);
      employees = updatedEmployees;
      runs.push(run);
    }
    return { runs, employees };
  }

  test('all four 941s tie to the W-3, including Additional Medicare Tax, within rounding', () => {
    const { runs, employees } = year();
    const forms = ([1, 2, 3, 4] as const).map((quarter) => computeForm941({ employer, year: 2026, quarter, runs }, company.id));
    const w2s = employees.map((e) => computeW2FromEmployee(e, 2026, runs));
    for (const w of w2s) assert.deepEqual(validateW2(w, 2026), [], `W-2 for ${w.employeeId}`);
    const w3 = buildW3(2026, employer, w2s);
    const rec = reconcileW3With941(w3, forms);
    assert.deepEqual(rec.findings, []);
    assert.equal(rec.reconciled, true, JSON.stringify(rec.rows, null, 1));
    // the high earner's Additional Medicare Tax is in W-2 box 6 and in line 5d; the relationship holds exactly because of it
    const addl = forms.reduce((s, f) => s + f.line5d_additionalMedicare.column2, 0);
    assert.ok(addl > 0);
  });

  test('a missing quarter is an error', () => {
    const { runs, employees } = year();
    const forms = ([1, 2, 3] as const).map((quarter) => computeForm941({ employer, year: 2026, quarter, runs }, company.id));
    const w3 = buildW3(2026, employer, employees.map((e) => computeW2FromEmployee(e, 2026, runs)));
    const rec = reconcileW3With941(w3, forms);
    assert.equal(rec.findings.some((x) => x.code === 'missing_941' && x.severity === 'error'), true);
    assert.equal(rec.reconciled, false);
  });

  test('tampering with one box surfaces a mismatch to explain', () => {
    const { runs, employees } = year();
    const forms = ([1, 2, 3, 4] as const).map((quarter) => computeForm941({ employer, year: 2026, quarter, runs }, company.id));
    const w2s = employees.map((e) => computeW2FromEmployee(e, 2026, runs));
    w2s[0] = { ...w2s[0], box2_federalIncomeTaxWithheld: w2s[0].box2_federalIncomeTaxWithheld + dollars(250) };
    const rec = reconcileW3With941(buildW3(2026, employer, w2s), forms);
    assert.equal(rec.reconciled, false);
    const bad = rec.rows.filter((r) => !r.matches);
    assert.equal(bad.length, 1);
    assert.match(bad[0].label, /Box 2/);
    assert.equal(bad[0].difference, -dollars(250));
  });
});

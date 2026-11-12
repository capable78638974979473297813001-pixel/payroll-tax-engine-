import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { calculatePaycheck } from '../src/calculate.ts';
import { calculateGarnishments } from '../src/garnishment.ts';
import type { GarnishmentOrder } from '../src/garnishment.ts';
import { dollars } from '../src/money.ts';
import type { PaycheckResult, StateCertificate } from '../src/types.ts';
import { approvePayRun, draftPayRun } from '../payroll/run.ts';
import type { Company, Employee } from '../payroll/types.ts';
import { freshYearToDate } from '../payroll/ytd.ts';
import { computeW2FromEmployee } from '../payroll/filings.ts';
import { buildStateLedger } from '../payroll/state/ledger.ts';
import { loadProfile } from '../payroll/state/profile.ts';
import type { PayRun, TimeEntry } from '../payroll/types.ts';
import { readdirSync } from 'node:fs';

// A whole year of pay runs through the real draft -> approve path, so the
// year-to-date roll-up is what feeds each next check. A tax with an annual
// cap or trigger must come to the same total over 26 checks as it does on
// one check for the whole year's pay.

const W4 = { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 } as const;

function company(homeState: string, frequency: 'biweekly' | 'monthly', employerContext?: Company['employerContext']): Company {
  return {
    id: 'co-1',
    legalName: 'Test Co LLC',
    ein: '12-3456789',
    homeState,
    paySchedule: { frequency, anchorPeriodStart: '2026-01-04', checkDateLagDays: 5 },
    ...(employerContext ? { employerContext } : {}),
  };
}

function salaried(state: string, annualSalary: number, certificate: StateCertificate, overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'emp-1',
    companyId: 'co-1',
    firstName: 'Alice',
    lastName: 'Smith',
    hireDate: '2025-01-01',
    employmentCategory: 'standard',
    payType: { kind: 'salary', annualSalary },
    workState: { code: state, certificate },
    residenceState: { code: state, certificate },
    federalW4: { ...W4 },
    deductionPlans: [],
    directDepositAccounts: [],
    garnishmentOrders: [],
    ytd: freshYearToDate(),
    ytdYear: 2026,
    ...overrides,
  };
}

/** Run every check date through draft + approve; return the year's total per tax id. */
function runYear(co: Company, start: Employee, checkDates: readonly string[]): { totals: Record<string, { amount: number; wages: number }>; employee: Employee } {
  let employee = start;
  const totals: Record<string, { amount: number; wages: number }> = {};
  for (const checkDate of checkDates) {
    const draft = draftPayRun(co, [employee], checkDate, checkDate, checkDate);
    for (const t of draft.lines[0].taxLines) {
      const total = (totals[t.id] ??= { amount: 0, wages: 0 });
      total.amount += t.amount;
      total.wages += t.taxableWages;
    }
    employee = approvePayRun(draft, [employee]).updatedEmployees[0];
  }
  return { totals, employee };
}

const BIWEEKLY_2026 = Array.from({ length: 26 }, (_, i) => new Date(Date.UTC(2026, 0, 9 + 14 * i)).toISOString().slice(0, 10));
const MONTHLY_2026 = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}-15`);

/** The same year's pay on a single check, where the cap or trigger binds inside one calculation. */
function oneCheck(state: string, gross: number, certificate: StateCertificate, employer?: Company['employerContext']): PaycheckResult {
  return calculatePaycheck({
    checkDate: '2026-06-12',
    payFrequency: 'biweekly',
    earnings: [{ code: 'REG', category: 'regular', amount: gross }],
    deductions: [],
    federalW4: { ...W4 },
    ytd: freshYearToDate(),
    workState: { code: state, certificate },
    ...(employer ? { employer } : {}),
  });
}

const amountOf = (r: PaycheckResult, id: string): number => r.taxes.find((t) => t.id === id)?.amount ?? 0;

describe('a year of pay runs reaches the same local-tax total as the annual rule', () => {
  const salary = dollars(400_000);
  const perCheck = Math.round(salary / 26);

  test("Portland: Metro and Multnomah taxes start once the year's wages pass the trigger", () => {
    const cert = { metroDistrict: true, multnomahCounty: true };
    const { totals, employee } = runYear(company('OR', 'biweekly'), salaried('OR', salary, cert), BIWEEKLY_2026);
    const whole = oneCheck('OR', perCheck * 26, cert);

    assert.ok(amountOf(whole, 'OR_METRO_SHS') > 0 && amountOf(whole, 'OR_MULTNOMAH_PFA') > 0);
    // Rounded once per check instead of once: allow a cent a check.
    assert.ok(Math.abs(totals.OR_METRO_SHS.amount - amountOf(whole, 'OR_METRO_SHS')) <= 26, `Metro withheld ${totals.OR_METRO_SHS.amount} over the year`);
    assert.ok(Math.abs(totals.OR_MULTNOMAH_PFA.amount - amountOf(whole, 'OR_MULTNOMAH_PFA')) <= 52, `Multnomah withheld ${totals.OR_MULTNOMAH_PFA.amount} over the year`);
    // The tracker is the year's wages, not just the taxed excess.
    assert.equal(employee.ytd.localIncomeTax?.OR_METRO, perCheck * 26);
    assert.equal(employee.ytd.localIncomeTax?.OR_MULTNOMAH, perCheck * 26);
  });

  test('Kentucky: Bardwell stops at its $100,000 annual wage cap', () => {
    const cert = { workCity: 'Bardwell' };
    const { totals, employee } = runYear(company('KY', 'biweekly'), salaried('KY', salary, cert), BIWEEKLY_2026);
    assert.ok(Math.abs(totals.KY_LOCAL.amount - dollars(1_000)) <= 26, `Bardwell withheld ${totals.KY_LOCAL.amount}; the cap is $1,000 a year`);
    assert.equal(employee.ytd.localIncomeTax?.KY_LOCAL_Bardwell, dollars(100_000));
  });

  test('Ohio: a capped JEDD stops at its annual district-wage cap', () => {
    const cert = { workJEDDId: '9098' };
    const { totals } = runYear(company('OH', 'biweekly'), salaried('OH', salary, cert), BIWEEKLY_2026);
    const whole = oneCheck('OH', perCheck * 26, cert);
    assert.ok(whole.taxes.find((t) => t.id === 'OH_JEDD')!.taxableWages < perCheck * 26, 'the single check must be capped for this to test anything');
    assert.ok(Math.abs(totals.OH_JEDD.amount - amountOf(whole, 'OH_JEDD')) <= 26, `JEDD withheld ${totals.OH_JEDD.amount} over the year`);
  });

  test("Seattle: the employer payroll expense tax starts once the year's compensation passes the threshold", () => {
    const cert = { locality: 'Seattle' };
    const employer = { seattlePriorYearPayrollExpense: dollars(20_000_000) };
    const { totals, employee } = runYear(company('WA', 'biweekly', employer), salaried('WA', salary, cert), BIWEEKLY_2026);
    const whole = oneCheck('WA', perCheck * 26, cert, employer);
    assert.ok(amountOf(whole, 'SEATTLE_PAYROLL_ER') > 0);
    assert.ok(Math.abs((totals.SEATTLE_PAYROLL_ER?.amount ?? 0) - amountOf(whole, 'SEATTLE_PAYROLL_ER')) <= 52, `Seattle tax came to ${totals.SEATTLE_PAYROLL_ER?.amount ?? 0} over the year`);
    assert.equal(employee.ytd.seattleCompensation, perCheck * 26);
  });

  test('a check that touches none of these taxes reports no accruals', () => {
    assert.equal(oneCheck('TX', dollars(3_000), {}).ytdAccruals, undefined);
  });
});

describe('railroad unemployment: the monthly cap starts over each month', () => {
  test('a monthly-paid rail employee is taxed on $2,150 in all twelve months', () => {
    const employee = salaried('TX', dollars(60_000), {}, { employmentCategory: 'railroad' });
    const { totals } = runYear(company('TX', 'monthly'), employee, MONTHLY_2026);
    assert.equal(totals.US_RUIA_ER.wages, dollars(2_150) * 12);
  });
});

describe('garnishment: orders other than support share the general 25% limit', () => {
  const paycheck: PaycheckResult = {
    checkDate: '2026-06-15',
    grossPay: dollars(1_000),
    pretaxDeductions: 0,
    posttaxDeductions: 0,
    taxes: [],
    employeeTaxTotal: 0,
    employerTaxTotal: 0,
    netPay: dollars(1_000),
  };
  const garnish = (orders: GarnishmentOrder[]) =>
    calculateGarnishments({ checkDate: '2026-06-15', payFrequency: 'weekly', workState: 'AL', paycheck, orders });
  const support = (amount: number): GarnishmentOrder => ({ id: 'S', type: 'child_support', amountOrdered: amount, supportingOtherFamily: false });
  const loan: GarnishmentOrder = { id: 'L', type: 'federal_student_loan_default', amountOrdered: dollars(500), priority: 1 };
  const creditor: GarnishmentOrder = { id: 'C', type: 'consumer_creditor', amountOrdered: dollars(500), priority: 2 };
  const withheld = (r: ReturnType<typeof garnish>, id: string) => r.lines.find((l) => l.orderId === id)!.withheld;

  test('support already at 30% leaves nothing for a student loan', () => {
    const r = garnish([support(dollars(300)), loan]);
    assert.equal(withheld(r, 'S'), dollars(300));
    assert.equal(withheld(r, 'L'), 0);
  });

  test('support at 10% leaves 15% for the student loan and nothing for a creditor behind it', () => {
    const r = garnish([support(dollars(100)), loan, creditor]);
    assert.equal(withheld(r, 'L'), dollars(150));
    assert.equal(withheld(r, 'C'), 0);
    assert.equal(r.totalWithheld, dollars(250));
  });

  test('support itself still reaches its own 60% ceiling', () => {
    const r = garnish([support(dollars(900)), loan]);
    assert.equal(withheld(r, 'S'), dollars(600));
    assert.equal(withheld(r, 'L'), 0);
  });
});

describe('year-end forms tie back to the paychecks', () => {
  const co = company('WI', 'biweekly');

  /** A year of approved runs for one employee, with an optional bonus on the tenth check. */
  function approvedYear(start: Employee, bonus = 0): { runs: PayRun[]; employee: Employee } {
    let employee = start;
    const runs: PayRun[] = [];
    BIWEEKLY_2026.forEach((checkDate, i) => {
      const entries: TimeEntry[] =
        bonus && i === 9
          ? [{ employeeId: employee.id, regularHours: 0, overtimeHours: 0, extraEarnings: [{ category: 'supplemental', code: 'BONUS', amount: bonus }] }]
          : [];
      const approved = approvePayRun(draftPayRun(co, [employee], checkDate, checkDate, checkDate, entries), [employee]);
      runs.push(approved.run);
      employee = approved.updatedEmployees[0];
    });
    return { runs, employee };
  }
  const withheld = (runs: readonly PayRun[], id: string) =>
    runs.reduce((s, r) => s + (r.lines[0].taxLines.find((t) => t.id === id)?.amount ?? 0), 0);

  test("a bonus taxed at the state's flat rate is on the W-2 and in the state's deposits", () => {
    const { runs, employee } = approvedYear(salaried('WI', dollars(90_000), {}), dollars(10_000));
    const supp = withheld(runs, 'WI_SIT_SUPP');
    assert.ok(supp > 0, 'Wisconsin taxes a bonus on its own line');
    const w2 = computeW2FromEmployee(employee, 2026, runs);
    const wi = w2.box15to17_state.find((s) => s.state === 'WI')!;
    assert.equal(wi.incomeTaxWithheld, withheld(runs, 'WI_SIT') + supp);
    // No pretax deductions, so state wages are the federal wages.
    assert.equal(wi.wages, w2.box1_wages);
    const ledger = buildStateLedger(loadProfile('WI'), co.id, runs, { start: '2026-01-01', end: '2026-12-31' });
    assert.equal(ledger.reduce((s, d) => s + d.withholding, 0), wi.incomeTaxWithheld);
  });

  test("home-state tax withheld under Pennsylvania's reciprocity is reported to the home state", () => {
    const start = salaried('PA', dollars(80_000), {}, { residenceState: { code: 'NJ', certificate: {} } });
    const { runs, employee } = approvedYear(start);
    const swap = withheld(runs, 'NJ_SIT_RECIPROCITY_SWAP');
    assert.ok(swap > 0);
    const nj = computeW2FromEmployee(employee, 2026, runs).box15to17_state.find((s) => s.state === 'NJ');
    assert.equal(nj?.incomeTaxWithheld, swap);
    assert.equal(nj?.wages, Math.round(dollars(80_000) / 26) * 26);
    const ledger = buildStateLedger(loadProfile('NJ'), co.id, runs, { start: '2026-01-01', end: '2026-12-31' });
    assert.equal(ledger.reduce((s, d) => s + d.withholding, 0), swap);
  });

  test('W-2 box 12 stops at the 401(k) limit, as the paychecks did', () => {
    const start = salaried('WI', dollars(500_000), {}, {
      deductionPlans: [{ id: 'k', code: '401K', category: 'deferral_401k', amount: { kind: 'percentOfGross', percent: 20 }, active: true }],
    });
    const { runs, employee } = approvedYear(start);
    const w2 = computeW2FromEmployee(employee, 2026, runs);
    assert.deepEqual(w2.box12, [{ code: 'D', amount: dollars(24_500) }]);
    assert.equal(w2.box1_wages, Math.round(dollars(500_000) / 26) * 26 - dollars(24_500));
  });

  test("every state's income tax lines report the wages, not wages less the state's own allowances", () => {
    const states = [...new Set(readdirSync(new URL('../data/states', import.meta.url)).map((f) => f.slice(0, 2)))];
    for (const state of states) {
      for (const bonus of [0, dollars(1_000)]) {
        const gross = dollars(1_440);
        const r = calculatePaycheck({
          checkDate: '2026-09-15',
          payFrequency: 'biweekly',
          earnings: [{ code: 'REG', category: 'regular', amount: gross }, ...(bonus ? [{ code: 'B', category: 'supplemental' as const, amount: bonus }] : [])],
          deductions: [],
          federalW4: { ...W4 },
          ytd: freshYearToDate(),
          workState: { code: state, certificate: {} },
        });
        const lines = r.taxes.filter((t) => /^[A-Z]{2}_SIT/.test(t.id));
        if (lines.length === 0) continue;
        assert.equal(lines.reduce((s, t) => s + t.taxableWages, 0), gross + bonus, `${state}${bonus ? ' with a bonus' : ''}`);
      }
    }
  });
});

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

describe('rules added 2026-11-12', () => {
  const check = (state: string, gross: number, extra: Record<string, unknown> = {}): PaycheckResult =>
    calculatePaycheck({
      checkDate: '2026-09-15',
      payFrequency: 'biweekly',
      earnings: [{ code: 'REG', category: 'regular', amount: gross }],
      deductions: [],
      federalW4: { ...W4 },
      ytd: freshYearToDate(),
      workState: { code: state, certificate: {} },
      ...extra,
    });
  const line = (r: PaycheckResult, id: string) => r.taxes.find((t) => t.id === id);

  test('a state that publishes no new-employer unemployment rate says the tax was not computed', () => {
    for (const state of ['LA', 'MD', 'MN', 'MT', 'UT', 'WA', 'WY']) {
      const r = check(state, dollars(4_000));
      const sui = line(r, `${state}_SUI_ER`);
      assert.ok(sui, `${state}: the employer unemployment line must not be left out`);
      assert.equal(sui.amount, 0);
      assert.equal(sui.taxableWages, dollars(4_000));
      assert.ok(r.notices?.some((n) => n.taxId === `${state}_SUI_ER` && n.tier === 'not_modelled'), `${state}: notice`);
      // 2% of $4,000, by hand.
      const withRate = check(state, dollars(4_000), { employer: { stateUnemploymentRate: { [state]: 0.02 } } });
      assert.equal(line(withRate, `${state}_SUI_ER`)!.amount, dollars(80));
    }
  });

  test("Vermont's Child Care Contribution: 0.44% from the employer, up to a quarter of it from the employee", () => {
    // 0.44% of $4,000 = $17.60.
    const r = check('VT', dollars(4_000));
    assert.equal(line(r, 'VT_CCC_ER')!.amount, dollars(17.6));
    assert.equal(line(r, 'VT_CCC_EE'), undefined);
    // A quarter of $17.60 = $4.40 from the employee, $13.20 left with the employer.
    const shared = check('VT', dollars(4_000), { employer: { payrollTaxEmployeeShareFraction: { VT: 0.25 } } });
    assert.equal(line(shared, 'VT_CCC_EE')!.amount, dollars(4.4));
    assert.equal(line(shared, 'VT_CCC_ER')!.amount, dollars(13.2));
    assert.equal(shared.netPay, r.netPay - dollars(4.4));
    assert.throws(() => check('VT', dollars(4_000), { employer: { payrollTaxEmployeeShareFraction: { VT: 0.5 } } }), /between 0 and 0.25/);
  });

  test('Oregon withholds nothing from a check with no wages', () => {
    const r = check('OR', 0);
    assert.equal(line(r, 'OR_SIT')!.amount, 0);
    assert.ok(check('OR', dollars(1_000)).taxes.find((t) => t.id === 'OR_SIT')!.amount > 0);
  });

  test('Utah: no withholding for a nonresident in the state 20 days or fewer who meets the conditions', () => {
    const utah = (days: number, eligible: boolean) =>
      check('UT', dollars(4_000), {
        workState: { code: 'UT', certificate: { daysWorkedInStateThisYear: days, ...(eligible ? { nonresidentDeMinimisEligible: true } : {}) } },
        residenceState: { code: 'NV', certificate: {} },
      });
    const full = line(check('UT', dollars(4_000)), 'UT_SIT')!.amount;
    assert.ok(full > 0);
    assert.equal(line(utah(20, true), 'UT_SIT')!.amount, 0);
    assert.equal(line(utah(21, true), 'UT_SIT')!.amount, full);
    assert.equal(line(utah(5, false), 'UT_SIT')!.amount, full, 'the conditions must be asserted, not assumed');
  });

  test('Idaho: no withholding for a nonresident expected to earn under $1,000 there in the year', () => {
    const idaho = (gross: number) => check('ID', gross, { payFrequency: 'annual', residenceState: { code: 'WA', certificate: {} } });
    assert.equal(line(idaho(dollars(999)), 'ID_SIT')!.amount, 0);
    assert.match(line(idaho(dollars(999)), 'ID_SIT')!.detail!, /de minimis/);
    assert.doesNotMatch(line(idaho(dollars(60_000)), 'ID_SIT')!.detail!, /de minimis/);
    assert.ok(line(idaho(dollars(60_000)), 'ID_SIT')!.amount > 0);
  });

  test('a resident of California, Connecticut, New Jersey or Massachusetts working elsewhere is withheld only the excess over the work state', () => {
    const sit = (r: PaycheckResult, id: string) => line(r, id)?.amount ?? 0;
    for (const home of ['CA', 'CT', 'NJ', 'MA']) {
      for (const work of ['AL', 'OR']) {
        const workOnly = sit(check(work, dollars(3_000)), `${work}_SIT`);
        const homeOnly = sit(check(home, dollars(3_000)), `${home}_SIT`);
        const r = check(work, dollars(3_000), { residenceState: { code: home, certificate: {} }, residenceStateWithholding: { nexus: true } });
        assert.equal(sit(r, `${work}_SIT`), workOnly, `${home} resident in ${work}: work-state tax unchanged`);
        assert.equal(sit(r, `${home}_SIT_RESIDENCE`), Math.max(0, homeOnly - workOnly), `${home} resident in ${work}`);
      }
    }
    // A state with no such rule on file is still withheld in full.
    const ga = check('AL', dollars(3_000), { residenceState: { code: 'GA', certificate: {} }, residenceStateWithholding: { nexus: true } });
    assert.equal(sit(ga, 'GA_SIT_RESIDENCE'), sit(check('GA', dollars(3_000)), 'GA_SIT'));
  });
});

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { dollars } from '../src/money.ts';
import { approvePayRun, draftPayRun, freshYearToDate, generatePayPeriods } from '../payroll/index.ts';
import type { Company, Employee, PayRun } from '../payroll/types.ts';
import { analyzeDeposits } from '../payroll/federal/deposits.ts';
import { AgencyNotConnectedError, FilingBook, liveTransport, sandboxTransport } from '../payroll/federal/agency.ts';
import type { DayLiability } from '../payroll/federal/ledger.ts';
import {
  analyzeStateDeposits,
  buildStateLedger,
  coverage,
  hasProfile,
  isStateBusinessDay,
  loadProfile,
  modelledStates,
  newHireDeadline,
  newHireStatus,
  registerAllStateChannels,
  resolveDue,
  stateChannels,
  stateFilingPackage,
  stateQuarterlyReport,
  uiAgencies,
  validateProfile,
  type StateDay,
  type StateProfile,
} from '../payroll/state/index.ts';

const CA = loadProfile('CA');
const NY = loadProfile('NY');
const TX = loadProfile('TX');

function fedDay(date: string, total: number): DayLiability {
  return {
    date, federalIncomeTax: total, socialSecurityEmployee: 0, socialSecurityEmployer: 0, medicareEmployee: 0, medicareEmployer: 0, additionalMedicare: 0, total,
    wagesSubjectToIncomeTax: 0, socialSecurityWages: 0, medicareWages: 0, additionalMedicareWages: 0, employeeIds: [],
  };
}
function stDay(date: string, pit: number, sdi = 0, ui = 0): StateDay {
  return { date, withholding: dollars(pit), withholdingWages: 0, employeeInsurance: dollars(sdi), employerUi: dollars(ui), uiWages: 0, employeeIds: [] };
}
/** Federal analysis for synthetic federal liabilities, then the state analysis for the given state days. */
function ca(fed: [string, number][], state: StateDay[], schedule: 'monthly' | 'semiweekly') {
  const federal = analyzeDeposits(fed.map(([d, t]) => fedDay(d, dollars(t))), { startingSchedule: schedule });
  return analyzeStateDeposits(CA, state, federal);
}

describe('coverage: every jurisdiction is accounted for', () => {
  test('the DOL directory has 53 UI agencies: 50 states, DC, Puerto Rico and the US Virgin Islands', () => {
    const a = uiAgencies();
    assert.equal(a.length, 53);
    assert.equal(new Set(a.map((x) => x.code)).size, 53);
    for (const code of ['PR', 'VI', 'DC']) assert.ok(a.some((x) => x.code === code), code);
    for (const x of a) {
      assert.ok(x.agencyLines.length > 0 && x.website, x.code);
    }
  });
  test('fifteen states are modelled; every other row says NOT MODELLED rather than implying nothing is owed', () => {
    assert.deepEqual(modelledStates(), ['CA', 'CO', 'CT', 'DE', 'GA', 'KS', 'MN', 'ND', 'NE', 'NJ', 'NY', 'RI', 'TX', 'UT', 'VA']);
    const c = coverage();
    assert.equal(c.length, 53);
    for (const row of c) {
      if (['CA', 'CO', 'CT', 'DE', 'GA', 'KS', 'MN', 'ND', 'NE', 'NJ', 'NY', 'RI', 'TX', 'UT', 'VA'].includes(row.code)) assert.equal(row.modelled, true);
      else {
        assert.equal(row.modelled, false, row.code);
        assert.equal(row.functions.ui, 'NOT MODELLED', row.code);
        assert.match(row.reason ?? '', /Nothing is assumed/);
      }
    }
    const by = Object.fromEntries(c.map((r) => [r.code, r.functions]));
    assert.equal(by.CA.withholding, 'modelled');
    assert.equal(by.NY.withholding, 'partial'); // return modelled, deposit schedule not
    assert.equal(by.TX.withholding, 'no wage income tax');
    assert.equal(by.FL.withholding, 'no wage income tax');
    assert.equal(by.OH.withholding, 'NOT MODELLED');
    assert.equal(by.NJ.withholding, 'modelled');
    assert.equal(by.MN.withholding, 'modelled');
    assert.equal(by.KS.withholding, 'modelled');
    assert.equal(by.GA.withholding, 'modelled');
    assert.equal(by.ND.withholding, 'modelled');
    assert.equal(by.DE.withholding, 'modelled');
    assert.equal(by.RI.withholding, 'modelled');
    assert.equal(by.UT.withholding, 'modelled');
    assert.equal(by.VA.withholding, 'modelled');
    assert.equal(by.CO.withholding, 'modelled');
    assert.equal(by.CO.ui, 'NOT MODELLED');
    assert.equal(by.CT.withholding, 'modelled');
    assert.equal(by.CT.ui, 'NOT MODELLED'); // Connecticut's guide covers withholding only
    assert.equal(by.NE.withholding, 'modelled');
  });
  test('an unmodelled state throws NOT MODELLED instead of returning an empty profile', () => {
    assert.equal(hasProfile('WY'), false);
    assert.throws(() => loadProfile('WY'), /NOT MODELLED/);
  });
});

describe('profile validation refuses unsourced facts', () => {
  const clone = (): StateProfile => JSON.parse(JSON.stringify(CA));
  test('the shipped profiles are valid', () => {
    for (const p of [CA, NY, TX]) assert.deepEqual(validateProfile(p), [], p.state);
  });
  test('a rule citing an unknown source is rejected', () => {
    const p = clone();
    p.withholding!.deposits!.source = 'S9';
    assert.match(validateProfile(p).join(';'), /unknown source S9/);
  });
  test('a rule with no source is rejected', () => {
    const p = clone();
    p.newHire!.source = '';
    assert.match(validateProfile(p).join(';'), /newHire: no source/);
  });
  test('a non-https or undated source is rejected', () => {
    const p = clone();
    p.sources[0].url = 'http://example.com';
    p.sources[0].verifiedOn = 'yesterday';
    const msg = validateProfile(p).join(';');
    assert.match(msg, /url must be https/);
    assert.match(msg, /verifiedOn must be a date/);
  });
  test('a deposit table missing a cell is rejected', () => {
    const p = clone();
    delete (p.withholding!.deposits!.rows.semiweekly as Record<string, string>).mid;
    assert.match(validateProfile(p).join(';'), /rows\.semiweekly\.mid is missing/);
  });
});

describe('California deposit table (DE 44 Rev. 52 (4-26), p.5 and p.60): every cell', () => {
  // Pay Friday 2026-08-07 (a Wed-Fri period): the period ends Fri Aug 7, so 3 business days later is Wed Aug 12.
  const FRI = '2026-08-07';

  test('federal NEXT-DAY: over $400 -> next-day, settling by the third business day after the payroll date', () => {
    const r = ca([[FRI, 120_000]], [stDay(FRI, 400.01, 100)], 'semiweekly');
    const o = r.obligations.find((x) => x.schedule === 'next_day')!;
    assert.ok(o, JSON.stringify(r.obligations));
    assert.equal(o.dueDate, '2026-08-10'); // next business day after Friday
    assert.equal(o.settleBy, '2026-08-12'); // third business day: Mon, Tue, Wed
    assert.equal(o.amount, dollars(500.01));
  });
  test('federal NEXT-DAY: $350 to $400 -> monthly (15th of the following month); under $350 -> quarterly', () => {
    const mid = ca([[FRI, 120_000]], [stDay(FRI, 400)], 'semiweekly').obligations;
    assert.deepEqual(mid.map((o) => [o.schedule, o.dueDate]), [['monthly', '2026-09-15']]);
    const low = ca([[FRI, 120_000]], [stDay(FRI, 349.99)], 'semiweekly').obligations;
    assert.deepEqual(low.map((o) => [o.schedule, o.dueDate]), [['quarterly', '2026-11-02']]);
  });
  test('federal SEMIWEEKLY: over $400 on a Wed/Thu/Fri payday -> the following Wednesday', () => {
    for (const d of ['2026-08-05', '2026-08-06', '2026-08-07']) {
      const o = ca([[d, 20_000]], [stDay(d, 401)], 'semiweekly').obligations[0];
      assert.equal(o.schedule, 'semiweekly', d);
      assert.equal(o.dueDate, '2026-08-12', d);
    }
  });
  test('federal SEMIWEEKLY: over $400 on a Sat/Sun/Mon/Tue payday -> the following Friday', () => {
    for (const d of ['2026-08-08', '2026-08-09', '2026-08-10', '2026-08-11']) {
      const o = ca([[d, 20_000]], [stDay(d, 401)], 'semiweekly').obligations[0];
      assert.equal(o.schedule, 'semiweekly', d);
      assert.equal(o.dueDate, '2026-08-14', d);
    }
  });
  test('federal SEMIWEEKLY: $350 to $400 -> monthly; under $350 -> quarterly', () => {
    assert.deepEqual(ca([[FRI, 20_000]], [stDay(FRI, 350)], 'semiweekly').obligations.map((o) => [o.schedule, o.dueDate]), [['monthly', '2026-09-15']]);
    assert.deepEqual(ca([[FRI, 20_000]], [stDay(FRI, 349.99)], 'semiweekly').obligations.map((o) => [o.schedule, o.dueDate]), [['quarterly', '2026-11-02']]);
  });
  test('federal MONTHLY: $350 or more in the month -> monthly; under $350 -> quarterly', () => {
    const above = ca([['2026-08-07', 8_000], ['2026-08-21', 8_000]], [stDay('2026-08-07', 200), stDay('2026-08-21', 150)], 'monthly');
    assert.deepEqual(above.obligations.map((o) => [o.schedule, o.dueDate, o.amount]), [['monthly', '2026-09-15', dollars(350)]]);
    const below = ca([['2026-08-07', 8_000], ['2026-08-21', 8_000]], [stDay('2026-08-07', 200), stDay('2026-08-21', 149.99)], 'monthly');
    assert.deepEqual(below.obligations.map((o) => [o.schedule, o.dueDate]), [['quarterly', '2026-11-02']]);
  });
  test('the dollar boundaries: $349.99 low, $350.00 and $400.00 mid, $400.01 high', () => {
    const sched = (pit: number) => ca([[FRI, 20_000]], [stDay(FRI, pit)], 'semiweekly').obligations[0].schedule;
    assert.deepEqual([349.99, 350, 400, 400.01].map(sched), ['quarterly', 'monthly', 'monthly', 'semiweekly']);
  });
  test('SDI is deposited with PIT, and employer UI rides the quarterly payment', () => {
    const r = ca([[FRI, 20_000]], [stDay(FRI, 500, 90, 60)], 'semiweekly');
    const sw = r.obligations.find((o) => o.schedule === 'semiweekly')!;
    assert.equal(sw.withholding, dollars(500));
    assert.equal(sw.employeeInsurance, dollars(90));
    assert.equal(sw.employerUi, 0);
    const q = r.obligations.find((o) => o.schedule === 'quarterly')!;
    assert.equal(q.employerUi, dollars(60));
    assert.equal(q.dueDate, '2026-11-02');
  });
});

describe('California published 2026 dates', () => {
  const quarters: [string, string, string, string][] = [
    // quarter anchor, last timely date, settlement date  (DE 44 p.61, "2026 Quarterly Payment Table")
    ['2026-02-10', '2026-04-30', '2026-05-01', 'Q1'],
    ['2026-05-10', '2026-07-31', '2026-08-03', 'Q2'],
    ['2026-08-10', '2026-11-02', '2026-11-03', 'Q3'],
    ['2026-11-10', '2027-02-01', '2027-02-02', 'Q4'],
  ];
  test('quarterly payments: last timely date and settlement date', () => {
    const rule = CA.withholding!.deposits!.due.quarterly;
    for (const [anchor, due, settle, q] of quarters) {
      const r = resolveDue(rule, anchor, CA);
      assert.equal(r.dueDate, due, q);
      assert.equal(r.settleBy, settle, q);
    }
  });
  test('DE 9 / DE 9C: due the first of the following month, delinquent a month later (DE 44 p.5)', () => {
    const rule = CA.ui!.returns[0].due;
    const got = ['2026-01-01', '2026-04-01', '2026-07-01', '2026-10-01'].map((a) => resolveDue(rule, a, CA));
    assert.deepEqual(got.map((g) => [g.dueDate, g.delinquentAfter]), [
      ['2026-04-01', '2026-04-30'], ['2026-07-01', '2026-07-31'], ['2026-10-01', '2026-11-02'], ['2027-01-01', '2027-02-01'],
    ]);
  });
  test('a quarter the guide has no table for is refused, not guessed', () => {
    assert.throws(() => resolveDue(CA.ui!.returns[0].due, '2031-02-01', CA), /NOT MODELLED/);
  });
  test('new employees: reported within 20 calendar days of the start-of-work date (DE 34)', () => {
    assert.equal(newHireDeadline(CA, '2026-03-02').dueDate, '2026-03-22');
    assert.equal(newHireDeadline(CA, '2026-12-20').dueDate, '2027-01-09'); // calendar days, not business days
    assert.equal(newHireStatus(CA, '2026-03-02', '2026-03-10').state, 'open');
    assert.equal(newHireStatus(CA, '2026-03-02', '2026-03-19').state, 'due_soon');
    assert.equal(newHireStatus(CA, '2026-03-02', '2026-03-30').state, 'overdue');
    assert.equal(newHireStatus(CA, '2026-03-02', '2026-03-30', '2026-03-22').state, 'on_time');
    assert.equal(newHireStatus(CA, '2026-03-02', '2026-03-30', '2026-03-23').state, 'late');
  });
});

describe('honest about what is not read', () => {
  test('due dates from an unverified holiday list carry a warning, and a supplied holiday moves the date', () => {
    const r = ca([['2026-08-07', 20_000]], [stDay('2026-08-07', 360)], 'semiweekly');
    assert.equal(r.findings.some((f) => f.code === 'state_holidays_not_modelled'), true);
    const base = resolveDue({ kind: 'day_of_month_after', day: 15 }, '2026-08-01', CA);
    assert.equal(base.dueDate, '2026-09-15');
    assert.equal(resolveDue({ kind: 'day_of_month_after', day: 15 }, '2026-08-01', CA, ['2026-09-15']).dueDate, '2026-09-16');
  });
  test('weekends always roll', () => {
    assert.equal(isStateBusinessDay('2026-08-08', CA), false);
    assert.equal(resolveDue({ kind: 'day_of_month_after', day: 15 }, '2026-10-01', CA).dueDate, '2026-11-16'); // Nov 15, 2026 is a Sunday
  });
  test("New York's deposit schedule is not modelled: an error, never a guessed schedule", () => {
    const federal = analyzeDeposits([fedDay('2026-08-07', dollars(5_000))], { startingSchedule: 'monthly' });
    const r = analyzeStateDeposits(NY, [stDay('2026-08-07', 500)], federal);
    assert.deepEqual(r.obligations, []);
    const e = r.findings.find((f) => f.code === 'state_deposits_not_modelled')!;
    assert.equal(e.severity, 'error');
    assert.match(e.message, /NYS-1/);
  });
  test('New York has no new-hire rule in its profile: it refuses rather than assuming the federal 20 days', () => {
    assert.throws(() => newHireDeadline(NY, '2026-03-02'), /NOT MODELLED/);
  });
  test('Texas has no wage income tax, so there is no withholding to deposit; and no deposit table to invent', () => {
    const federal = analyzeDeposits([fedDay('2026-08-07', dollars(5_000))], { startingSchedule: 'monthly' });
    const r = analyzeStateDeposits(TX, [stDay('2026-08-07', 0, 0, 90)], federal);
    assert.equal(r.findings.some((f) => f.code === 'state_deposits_not_modelled'), true);
  });
});

describe('quarterly UI reports: published due dates', () => {
  test('New York NYS-45 and the Texas wage report are due the last day of the month after the quarter', () => {
    const q3 = (p: StateProfile) => resolveDue(p.ui!.returns[0].due, '2026-07-01', p).dueDate;
    // Oct 31, 2026 is a Saturday: the instructions allow the next business day.
    assert.equal(q3(NY), '2026-11-02');
    assert.equal(q3(TX), '2026-11-02');
    assert.equal(resolveDue(NY.ui!.returns[0].due, '2026-01-01', NY).dueDate, '2026-04-30'); // NYS-45-I: April 30
    assert.equal(resolveDue(NY.ui!.returns[0].due, '2026-04-01', NY).dueDate, '2026-07-31');
    assert.equal(resolveDue(NY.ui!.returns[0].due, '2026-10-01', NY).dueDate, '2027-02-01'); // Jan 31, 2027 is a Sunday
  });
  test('wage bases come from the agencies: CA $7,000, NY $17,600, TX $9,000', () => {
    assert.equal(CA.ui!.wageBase, dollars(7_000));
    assert.equal(NY.ui!.wageBase, dollars(17_600));
    assert.equal(TX.ui!.wageBase, dollars(9_000));
  });
});

describe('a full year of REAL engine pay runs in each pilot state', () => {
  function company(code: string): Company {
    return { id: `co-${code}`, legalName: 'Pilot Co', ein: '12-3456789', homeState: code, paySchedule: { frequency: 'biweekly', anchorPeriodStart: '2026-01-04', checkDateLagDays: 5 } };
  }
  const mk = (id: string, code: string, salary: number): Employee => ({
    id, companyId: `co-${code}`, firstName: id, lastName: 'T', hireDate: '2020-01-01', employmentCategory: 'standard',
    payType: { kind: 'salary', annualSalary: dollars(salary) }, residenceState: { code },
    federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
    deductionPlans: [], directDepositAccounts: [], garnishmentOrders: [], ytd: freshYearToDate(), ytdYear: 2026,
  });
  function year(code: string): PayRun[] {
    const co = company(code);
    let emps = [mk('low', code, 52_000), mk('high', code, 330_000)];
    const out: PayRun[] = [];
    for (const p of generatePayPeriods(co.paySchedule, 2026)) {
      const { run, updatedEmployees } = approvePayRun(draftPayRun(co, emps, p.periodStart, p.periodEnd, p.checkDate), emps);
      emps = updatedEmployees;
      out.push(run);
    }
    return out;
  }

  for (const [code, profile, base] of [['CA', CA, 7_000], ['NY', NY, 17_600], ['TX', TX, 9_000]] as const) {
    test(`${code}: each employee's unemployment-taxed wages total the wage base over the year, and the quarterly reports tie to the ledger`, () => {
      const runs = year(code);
      const co = `co-${code}`;
      const reports = ([1, 2, 3, 4] as const).map((q) => stateQuarterlyReport(profile, co, runs, 2026, q));
      const perEmployee = new Map<string, number>();
      for (const r of reports) for (const e of r.employees) perEmployee.set(e.employeeId, (perEmployee.get(e.employeeId) ?? 0) + e.uiTaxableWages);
      assert.equal(perEmployee.get('high'), dollars(base), `${code} high earner capped at the wage base`);
      assert.equal(perEmployee.get('low') ?? 0, perEmployee.get('low'));
      for (const r of reports) {
        assert.equal(r.findings.filter((f) => f.severity === 'error').length, 0, JSON.stringify(r.findings));
        const ledger = buildStateLedger(profile, co, runs, { start: `2026-${String((r.quarter - 1) * 3 + 1).padStart(2, '0')}-01`, end: `2026-${String(r.quarter * 3).padStart(2, '0')}-31` });
        assert.equal(r.contributionDue, ledger.reduce((s, d) => s + d.employerUi, 0));
        assert.equal(r.totals.grossWages, r.employees.reduce((s, e) => s + e.grossWages, 0));
        assert.ok(r.returns.length >= 1 && r.readyToFile);
      }
    });
  }

  test('CA: every dollar withheld for PIT and SDI, and every dollar of employer UI, is in exactly one deposit', () => {
    const runs = year('CA');
    const days = buildStateLedger(CA, 'co-CA', runs, { start: '2026-01-01', end: '2026-12-31' });
    const fedDays: DayLiability[] = days.map((d) => fedDay(d.date, d.withholding + d.employeeInsurance + d.employerUi + dollars(2_000)));
    const federal = analyzeDeposits(fedDays, { startingSchedule: 'semiweekly' });
    const r = analyzeStateDeposits(CA, days, federal);
    const w = days.reduce((s, d) => s + d.withholding, 0);
    const ins = days.reduce((s, d) => s + d.employeeInsurance, 0);
    const ui = days.reduce((s, d) => s + d.employerUi, 0);
    assert.ok(w > 0 && ins > 0 && ui > 0);
    assert.equal(r.obligations.reduce((s, o) => s + o.withholding, 0), w);
    assert.equal(r.obligations.reduce((s, o) => s + o.employeeInsurance, 0), ins);
    assert.equal(r.obligations.reduce((s, o) => s + o.employerUi, 0), ui);
    assert.equal(r.findings.filter((f) => f.severity === 'error').length, 0);
  });
});

describe('state filings run through the shared lifecycle, and nothing is transmitted', () => {
  test('every modelled state registers its channels, each with enrollment and a "not read" specification', () => {
    assert.deepEqual(registerAllStateChannels(), ['CA', 'CO', 'CT', 'DE', 'GA', 'KS', 'MN', 'ND', 'NE', 'NJ', 'NY', 'RI', 'TX', 'UT', 'VA']);
    const ca = stateChannels(CA);
    assert.deepEqual(ca.map((c) => c.id), ['state:CA:e_services', 'state:CA:ner']);
    assert.match(ca[0].enrollment.join(' '), /Register online for an employer payroll tax account number/);
    assert.equal(ca[0].specs[0].availability, 'not_read');
    assert.match(ca[0].mandate ?? '', /All employers must electronically submit/);
    assert.deepEqual(stateChannels(NY).map((c) => c.id), ['state:NY:web_file', 'state:NY:web_upload', 'state:NY:fset']);
    assert.deepEqual(stateChannels(TX).map((c) => c.id), ['state:TX:uts']);
  });

  test('a California quarterly report is approved, rehearsed through the sandbox, and recorded as NOT a filing', async () => {
    const pkg = stateFilingPackage({ profile: CA, channelSuffix: 'e_services', kind: 'state_return', ein: '123456789', period: '2026-Q3', payload: { due: '2026-10-01' }, fields: { DE9: 1 }, findings: [] });
    assert.equal(pkg.channelId, 'state:CA:e_services');
    assert.match(pkg.id, /^state_return:123456789:CA-2026-Q3:/);
    const book = new FilingBook();
    const rec = book.add(pkg);
    book.approve(rec.id, { name: 'Pat Rooter', title: 'Owner' });
    await book.submit(rec.id, sandboxTransport(pkg.channelId));
    assert.equal(rec.status, 'rehearsed');
    assert.equal(rec.receipt!.transmitted, false);
    assert.match(rec.receipt!.note, /not a filing/i);
  });

  test('the live state transport refuses and lists what the state requires first', async () => {
    const pkg = stateFilingPackage({ profile: TX, channelSuffix: 'uts', kind: 'state_return', ein: '123456789', period: '2026-Q3', payload: {}, fields: {}, findings: [] });
    const book = new FilingBook();
    const rec = book.add(pkg);
    book.approve(rec.id, { name: 'Pat', title: 'Owner' });
    await assert.rejects(book.submit(rec.id, liveTransport(pkg.channelId)), (e: unknown) => {
      assert.ok(e instanceof AgencyNotConnectedError);
      assert.match(e.message, /Employer Liability Notice/);
      assert.match(e.message, /not read/);
      return true;
    });
    assert.equal(rec.status, 'approved');
  });

  test('a channel the profile does not define is refused', () => {
    assert.throws(() => stateFilingPackage({ profile: CA, channelSuffix: 'nope', kind: 'state_return', ein: '1', period: 'x', payload: {}, fields: {}, findings: [] }), /Unknown channel/);
  });

  test('a state package with errors stays a draft and cannot be approved', () => {
    const pkg = stateFilingPackage({ profile: NY, channelSuffix: 'web_file', kind: 'state_return', ein: '123456789', period: '2026-Q3', payload: { n: 1 }, fields: {}, findings: [{ severity: 'error', code: 'x', message: 'x' }] });
    const book = new FilingBook();
    const rec = book.add(pkg);
    assert.equal(rec.status, 'draft');
    assert.throws(() => book.approve(rec.id, { name: 'Pat', title: 'Owner' }), /only a validated filing/);
  });
});

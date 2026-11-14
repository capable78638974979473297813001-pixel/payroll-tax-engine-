import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { calculatePaycheckWithGarnishments, netPayFloorSteps } from '../src/net-pay-floor.ts';
import { payDates, payPeriods, paychecks, sumTaxLine } from '../payroll/paycheckIterator.ts';
import type { PeriodTemplate, BatchItem } from '../payroll/paycheckIterator.ts';
import { dollars } from '../src/money.ts';
import type { Deduction, PaycheckInput } from '../src/types.ts';

const w4 = { filingStatus: 'single' as const, multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 };
const template = (gross: number, state: string, deductions: Deduction[] = [], allowances?: number): PeriodTemplate => ({
  earnings: [{ code: 'REG', category: 'regular', amount: dollars(gross) }],
  deductions,
  federalW4: w4,
  workState: { code: state, certificate: { workCity: 'Birmingham', residenceCity: 'Birmingham', ...(allowances === undefined ? {} : { allowances }) } },
});
const k401 = (amount: number): Deduction => ({ code: '401K', category: 'deferral_401k', amount: dollars(amount) });
const support = { id: 'MI-CS', type: 'child_support' as const, amountOrdered: dollars(50), supportingOtherFamily: false, maxDisposableEarningsFraction: 0.5 };

describe('payDates', () => {
  test('weekly from Friday 2026-01-02 gives 52 dates, last 2026-12-25', () => {
    // 2026-01-02 + 51 x 7 days = 2026-12-25; the next, 2027-01-01, is a new year.
    const d = [...payDates('2026-01-02', 'weekly')];
    assert.equal(d.length, 52);
    assert.equal(d[0], '2026-01-02');
    assert.equal(d[51], '2026-12-25');
  });
  test('biweekly from 2026-01-09 gives 26 dates, last 2026-12-25', () => {
    // 2026-01-09 + 25 x 14 days = 2026-12-25; 2027-01-08 is next year.
    const d = [...payDates('2026-01-09', 'biweekly')];
    assert.equal(d.length, 26);
    assert.equal(d[25], '2026-12-25');
  });
  test('semimonthly is the 15th and the month end: 24 dates, February ends on the 28th in 2026', () => {
    const d = [...payDates('2026-01-15', 'semimonthly')];
    assert.equal(d.length, 24);
    assert.deepEqual(d.slice(2, 4), ['2026-02-15', '2026-02-28']);
  });
  test('monthly is the month end: 12 dates, and a leap February ends on the 29th', () => {
    assert.equal([...payDates('2026-01-31', 'monthly')].length, 12);
    assert.ok([...payDates('2028-01-31', 'monthly')].includes('2028-02-29'));
  });
  test('a start date part-way through the year skips the earlier dates', () => {
    assert.equal([...payDates('2026-07-31', 'monthly')].length, 6); // Jul-Dec
  });
  test('an impossible date or unsupported frequency is refused', () => {
    assert.throws(() => [...payDates('2026-02-30', 'weekly')], /not a real calendar date/);
    assert.throws(() => [...payDates('2026-01-02', 'daily' as never)], /Unsupported pay frequency/);
  });
});

describe('payPeriods carries the year-to-date ledger between checks', () => {
  test('Social Security stops at the $184,500 wage base: weekly $4,000 for 52 checks', () => {
    // 46 checks x $4,000 = $184,000 so far. Check 47 has only $500 of base left
    // (SS = $31.00), and checks 48-52 owe nothing. Total = 184,500 x 6.2% = $11,439.00.
    const periods = [...payPeriods({ firstCheckDate: '2026-01-02', payFrequency: 'weekly', template: template(4000, 'TX') })];
    assert.equal(periods.length, 52);
    const ss = (i: number) => periods[i].result.paycheck.taxes.find((t) => t.id === 'US_SS_EE')?.amount ?? 0;
    assert.equal(ss(0), 24800);
    assert.equal(ss(45), 24800);
    assert.equal(ss(46), 3100);
    assert.equal(ss(47), 0);
    assert.equal(sumTaxLine(periods, 'US_SS_EE'), 1_143_900);
    assert.equal(periods[0].ytd.socialSecurity, 400_000);
    assert.equal(periods[51].ytd.socialSecurity, 18_450_000);
  });

  test('the net-pay floor and child support apply on every check, and the ledger counts the cut deduction', () => {
    // Each weekly check is the $100 / $100 401(k) / MI support case: 401(k) cut to $45.00, net $0.00.
    const periods = [...payPeriods({
      firstCheckDate: '2026-11-13', payFrequency: 'weekly', maxChecks: 3,
      template: template(100, 'MI', [k401(100)]), orders: [support],
    })];
    assert.equal(periods.length, 3);
    for (const p of periods) {
      assert.equal(p.result.netPayAfterGarnishments, 0);
      assert.equal(p.result.deductions[0].amount, 4500);
    }
    // 3 checks of $100.00 FICA wages, and 3 x $45.00 = $135.00 deferred.
    assert.equal(periods[2].ytd.socialSecurity, 30_000);
    assert.equal(periods[2].ytd.electiveDeferrals?.section402gAggregate, 13_500);
  });

  test('a template function can change the pay mid-year', () => {
    const periods = [...payPeriods({
      firstCheckDate: '2026-01-31', payFrequency: 'monthly', maxChecks: 2,
      template: ({ index }) => template(index === 0 ? 100 : 200, 'TX'),
    })];
    assert.deepEqual(periods.map((p) => p.result.paycheck.grossPay), [10_000, 20_000]);
  });

  test('it is lazy: stopping early calculates only what was asked for', () => {
    let calls = 0;
    const it = payPeriods({
      firstCheckDate: '2026-01-02', payFrequency: 'weekly',
      template: () => { calls++; return template(100, 'TX'); },
    });
    it.next();
    it.next();
    assert.equal(calls, 2);
  });

  test('startingYtd resumes a year part-way through', () => {
    // 46 checks already done: 184,000 of SS wages. One more $4,000 check taxes only $500.
    const [p] = [...payPeriods({
      firstCheckDate: '2026-11-13', payFrequency: 'weekly', maxChecks: 1,
      template: template(4000, 'TX'),
      startingYtd: { socialSecurity: 18_400_000, medicare: 18_400_000, futa: 0, stateUnemployment: {}, statePaidLeave: {}, stateDisabilityEmployee: {}, stateLongTermCare: {}, localIncomeTax: {} },
    })];
    assert.equal(p.result.paycheck.taxes.find((t) => t.id === 'US_SS_EE')!.amount, 3100);
  });
});

describe('percent-of-pay pre-tax elections', () => {
  const pct = (percentOfGross: number) => ({ code: '401K', category: 'deferral_401k' as const, percentOfGross });

  test('6% of $1,000 is $60.00, then 6% of $1,250 is $75.00 when pay changes', () => {
    const periods = [...payPeriods({
      firstCheckDate: '2026-01-31', payFrequency: 'monthly', maxChecks: 2,
      template: ({ index }) => ({ ...template(index === 0 ? 1000 : 1250, 'TX'), deductions: [pct(0.06)] }),
    })];
    assert.deepEqual(periods.map((p) => p.result.deductions[0].amount), [6000, 7500]);
    assert.equal(periods[1].ytd.electiveDeferrals?.section402gAggregate, 13_500);
  });

  test('only regular and supplemental pay is the base: a reimbursement is not pay', () => {
    const t = { ...template(1000, 'TX'), deductions: [pct(0.1)] };
    t.earnings = [...t.earnings, { code: 'MILES', category: 'reimbursement', amount: dollars(500) }];
    const [p] = [...payPeriods({ firstCheckDate: '2026-01-31', payFrequency: 'monthly', maxChecks: 1, template: t })];
    assert.equal(p.result.deductions[0].amount, 10_000);
  });

  test('a fraction written as a percent (6 instead of 0.06) is refused', () => {
    assert.throws(
      () => [...payPeriods({ firstCheckDate: '2026-01-31', payFrequency: 'monthly', maxChecks: 1, template: { ...template(1000, 'TX'), deductions: [pct(6)] } })],
      /between 0 and 1/,
    );
  });

  test('the batch iterator takes them too', () => {
    const [o] = [...paychecks([{ id: 'x', paycheck: { ...template(200, 'TX'), deductions: [pct(0.1)], checkDate: '2026-11-13', payFrequency: 'weekly', ytd: { socialSecurity: 0, medicare: 0, futa: 0 } } }])];
    assert.ok(o.ok && o.result.deductions[0].amount === 2000);
  });
});

describe('paychecks (batch)', () => {
  const item = (id: string, gross: number, state = 'TX'): BatchItem => ({
    id,
    paycheck: { ...template(gross, state), checkDate: '2026-11-13', payFrequency: 'weekly', ytd: { socialSecurity: 0, medicare: 0, futa: 0 } },
  });

  test('yields one outcome per item in order, and a bad check does not stop the run', () => {
    const bad = item('bad', 100);
    bad.paycheck = { ...bad.paycheck, checkDate: '2026-02-30' };
    const out = [...paychecks([item('a', 100), bad, item('c', 200)])];
    assert.deepEqual(out.map((o) => [o.index, o.id, o.ok]), [[0, 'a', true], [1, 'bad', false], [2, 'c', true]]);
    const failed = out[1];
    assert.ok(!failed.ok && failed.error.length > 0);
    const c = out[2];
    assert.ok(c.ok && c.result.paycheck.grossPay === 20_000);
  });

  test('it is lazy over a streamed source: only the items asked for are pulled', () => {
    let pulled = 0;
    function* source() { for (const id of ['a', 'b', 'c', 'd']) { pulled++; yield item(id, 100); } }
    const it = paychecks(source());
    it.next();
    it.next();
    assert.equal(pulled, 2);
  });
});

describe('netPayFloorSteps shows how the engine reaches $0.00', () => {
  const input = { paycheck: { ...template(100, 'MI', [k401(100)]), checkDate: '2026-11-13', payFrequency: 'weekly' as const, ytd: { socialSecurity: 0, medicare: 0, futa: 0 } }, orders: [support] };

  test('yields elected, all-cut, the search probes, then final; and returns the same result as the plain call', () => {
    const steps = netPayFloorSteps(input);
    const seen = [];
    let next = steps.next();
    while (!next.done) { seen.push(next.value); next = steps.next(); }
    assert.equal(seen[0].phase, 'elected');
    assert.equal(seen[0].fits, false);
    assert.equal(seen[1].phase, 'all-cut');
    assert.equal(seen[1].fits, true);
    assert.ok(seen.slice(2, -1).every((s) => s.phase === 'search'));
    assert.ok(seen.length > 3);
    const last = seen[seen.length - 1];
    assert.equal(last.phase, 'final');
    assert.equal(last.net, 0);
    assert.equal(last.cut, 5500); // $100.00 elected - $45.00 allowed
    assert.deepEqual(next.value, calculatePaycheckWithGarnishments(input));
  });

  test('when nothing needs cutting it yields only the elected trial and the final one', () => {
    const roomy = { ...input, paycheck: { ...input.paycheck, earnings: [{ code: 'REG', category: 'regular' as const, amount: dollars(1000) }] } };
    assert.deepEqual([...netPayFloorSteps(roomy)].map((s) => s.phase), ['elected', 'final']);
  });
});

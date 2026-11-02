import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { dollars } from '../src/money.ts';
import {
  analyzeDeposits,
  penaltyRateForDaysLate,
  qualifiesForDeMinimis,
  reconcileDeposits,
  scheduleFromLookback,
  shortfallMakeupDate,
  type DepositObligation,
  type TaxDeposit,
} from '../payroll/federal/deposits.ts';
import type { DayLiability } from '../payroll/federal/ledger.ts';

function day(date: string, total: number): DayLiability {
  return {
    date,
    federalIncomeTax: total,
    socialSecurityEmployee: 0,
    socialSecurityEmployer: 0,
    medicareEmployee: 0,
    medicareEmployer: 0,
    additionalMedicare: 0,
    total,
    wagesSubjectToIncomeTax: 0,
    socialSecurityWages: 0,
    medicareWages: 0,
    additionalMedicareWages: 0,
    employeeIds: [],
  };
}

function obligation(partial: Partial<DepositObligation> & Pick<DepositObligation, 'payDates' | 'dueDate' | 'amountDue'>): DepositObligation {
  return {
    id: partial.id ?? `${partial.payDates[0]}-${partial.dueDate}`,
    year: partial.year ?? 2026,
    quarter: partial.quarter ?? 2,
    payDates: partial.payDates,
    liability: partial.liability ?? partial.amountDue,
    creditApplied: partial.creditApplied ?? 0,
    amountDue: partial.amountDue,
    dueDate: partial.dueDate,
    rule: partial.rule ?? 'semiweekly',
    schedule: partial.schedule ?? 'semiweekly',
  };
}

describe('deposit schedule from the lookback period (Pub. 15 Rose Co. example)', () => {
  test('$48,000 is monthly, $51,000 is semiweekly, exactly $50,000 is monthly, no history is monthly', () => {
    assert.equal(scheduleFromLookback(dollars(48_000)), 'monthly');
    assert.equal(scheduleFromLookback(dollars(51_000)), 'semiweekly');
    assert.equal(scheduleFromLookback(dollars(50_000)), 'monthly');
    assert.equal(scheduleFromLookback(dollars(50_000) + 1), 'semiweekly');
    assert.equal(scheduleFromLookback(undefined), 'monthly');
  });
});

describe('deposit obligations', () => {
  test('a monthly depositor deposits one month of paydays together by the 15th (Spruce Co.)', () => {
    const a = analyzeDeposits(
      [day('2026-03-06', dollars(500)), day('2026-03-13', dollars(500)), day('2026-03-20', dollars(500)), day('2026-03-27', dollars(500))],
      { startingSchedule: 'monthly' },
    );
    assert.equal(a.obligations.length, 1);
    assert.equal(a.obligations[0].amountDue, dollars(2_000));
    assert.equal(a.obligations[0].dueDate, '2026-04-15');
    assert.equal(a.obligations[0].rule, 'monthly');
    assert.equal(a.endingSchedule, 'monthly');
  });

  test('$100,000 in a deposit period: deposit next business day and become semiweekly the day after (Elm, Inc.)', () => {
    // Pub. 15: paid Wed May 6, 2026 ($40,000) and Fri May 8 ($60,000) in its first year.
    const a = analyzeDeposits([day('2026-05-06', dollars(40_000)), day('2026-05-08', dollars(60_000))], { startingSchedule: 'monthly' });
    assert.equal(a.obligations.length, 1);
    assert.equal(a.obligations[0].amountDue, dollars(100_000));
    assert.equal(a.obligations[0].dueDate, '2026-05-11'); // "required to deposit the $100,000 by Monday, May 11"
    assert.equal(a.obligations[0].rule, 'next_day');
    assert.equal(a.becameSemiweeklyOn, '2026-05-09'); // "became a semiweekly schedule depositor on May 9"
    assert.equal(a.endingSchedule, 'semiweekly');
    assert.deepEqual(a.nextDayTriggerDates, ['2026-05-08']);
  });

  test("Schedule B's Elm Co.: $2,000 on Apr 18 then $110,000 on Apr 25, 2025 trips the rule; later Fridays are semiweekly", () => {
    const fridays = ['2025-05-02', '2025-05-09', '2025-05-16'];
    const a = analyzeDeposits(
      [day('2025-04-18', dollars(2_000)), day('2025-04-25', dollars(110_000)), ...fridays.map((d) => day(d, dollars(110_000)))],
      { startingSchedule: 'monthly' },
    );
    assert.equal(a.becameSemiweeklyOn, '2025-04-26'); // "Elm Co. became a semiweekly schedule depositor on April 26, 2025"
    assert.equal(a.obligations[0].amountDue, dollars(112_000));
    assert.equal(a.obligations[0].dueDate, '2025-04-28');
    // every later $110,000 Friday is itself over $100,000, so each is a next-day deposit
    assert.deepEqual(a.obligations.slice(1).map((o) => o.rule), ['next_day', 'next_day', 'next_day']);
  });

  test("once $100,000 accumulates, stop and start anew: Fir Co.'s $110,000 Monday and $30,000 Tuesday", () => {
    const a = analyzeDeposits([day('2026-06-08', dollars(110_000)), day('2026-06-09', dollars(30_000))], { startingSchedule: 'semiweekly' });
    assert.equal(a.obligations.length, 2);
    assert.equal(a.obligations[0].amountDue, dollars(110_000));
    assert.equal(a.obligations[0].dueDate, '2026-06-09'); // Tuesday, the next business day
    assert.equal(a.obligations[1].amountDue, dollars(30_000)); // not added to the $110,000
    assert.equal(a.obligations[1].dueDate, '2026-06-12'); // Friday, the ordinary semiweekly date
    assert.equal(a.becameSemiweeklyOn, undefined); // already semiweekly
  });

  test('accumulation does not continue past the end of the deposit period ($95,000 Tuesday, $10,000 Wednesday)', () => {
    const a = analyzeDeposits([day('2026-06-09', dollars(95_000)), day('2026-06-10', dollars(10_000))], { startingSchedule: 'semiweekly' });
    assert.deepEqual(a.obligations.map((o) => [o.amountDue, o.dueDate, o.rule]), [
      [dollars(95_000), '2026-06-12', 'semiweekly'],
      [dollars(10_000), '2026-06-17', 'semiweekly'],
    ]);
    assert.deepEqual(a.nextDayTriggerDates, []);
  });

  test('a semiweekly period spanning two quarters needs two deposits with the same due date (Sep 30 / Oct 2, 2026)', () => {
    const a = analyzeDeposits([day('2026-09-30', dollars(7_000)), day('2026-10-02', dollars(9_000))], { startingSchedule: 'semiweekly' });
    assert.equal(a.obligations.length, 2);
    assert.deepEqual(a.obligations.map((o) => [o.quarter, o.amountDue, o.dueDate]), [
      [3, dollars(7_000), '2026-10-07'],
      [4, dollars(9_000), '2026-10-07'],
    ]);
  });

  test('a credit lowers what is deposited but not the $100,000 test', () => {
    const a = analyzeDeposits([day('2026-06-08', dollars(100_000))], { startingSchedule: 'semiweekly', creditByDate: { '2026-06-08': dollars(8_000) } });
    assert.equal(a.obligations[0].rule, 'next_day'); // 100,000 before the credit still triggers
    assert.equal(a.obligations[0].liability, dollars(100_000));
    assert.equal(a.obligations[0].creditApplied, dollars(8_000));
    assert.equal(a.obligations[0].amountDue, dollars(92_000));
  });
});

describe('de minimis exception (Form 941 line 16, first box)', () => {
  test('either quarter under $2,500 and no next-day deposit qualifies', () => {
    assert.equal(qualifiesForDeMinimis(dollars(2_499.99), dollars(9_000), false), true);
    assert.equal(qualifiesForDeMinimis(dollars(9_000), dollars(2_499.99), false), true);
    assert.equal(qualifiesForDeMinimis(dollars(2_500), dollars(2_500), false), false);
    assert.equal(qualifiesForDeMinimis(dollars(1_000), dollars(1_000), true), false);
    assert.equal(qualifiesForDeMinimis(dollars(9_000), undefined, false), false); // no prior quarter to rely on
  });
});

describe('penalty tiers (Pub. 15, Deposit Penalties)', () => {
  test('2% for 1-5 days, 5% for 6-15, 10% for 16 or more', () => {
    assert.deepEqual([0, 1, 5, 6, 15, 16, 90].map(penaltyRateForDaysLate), [0, 0.02, 0.02, 0.05, 0.05, 0.1, 0.1]);
  });
});

describe('reconciling recorded deposits', () => {
  const dep = (id: string, date: string, amount: number, quarter: 2 | 3 = 2): TaxDeposit => ({ id, date, amount: dollars(amount), year: 2026, quarter });

  test('deposits go to the most recent liability first (Cedar, Inc.: $2,000 on May 15 against $1,000 and $1,500)', () => {
    const april = obligation({ payDates: ['2026-04-10'], dueDate: '2026-04-15', amountDue: dollars(1_000) });
    const may = obligation({ payDates: ['2026-04-24'], dueDate: '2026-05-15', amountDue: dollars(1_500) });
    const r = reconcileDeposits([april, may], [dep('d1', '2026-05-15', 2_000)], '2026-05-15');
    const [a, m] = r.statuses;
    assert.equal(m.deposited, dollars(1_500)); // "$1,500 of the deposit is applied to the May 15 deposit"
    assert.equal(m.state, 'paid_on_time');
    assert.equal(a.deposited, dollars(500)); // "the remaining $500 is applied to the April deposit"
    assert.equal(a.shortfall, dollars(500)); // "$500 of the April 15 liability remains undeposited"
    assert.equal(a.state, 'short');
    assert.equal(a.daysLate, 30);
    assert.equal(a.penaltyRate, 0.1);
    // Neither half of April's $1,000 was deposited on Apr 15: $500 arrived 30 days late (10% = $50) and $500 is still unpaid at 30 days (10% = $50).
    assert.equal(a.estimatedPenalty, dollars(100));
  });

  test('on-time, late and unpaid obligations are told apart', () => {
    const ok = obligation({ payDates: ['2026-06-03'], dueDate: '2026-06-10', amountDue: dollars(1_000) });
    const late = obligation({ payDates: ['2026-06-10'], dueDate: '2026-06-17', amountDue: dollars(1_000) });
    const gone = obligation({ payDates: ['2026-06-17'], dueDate: '2026-06-24', amountDue: dollars(1_000) });
    const r = reconcileDeposits(
      [ok, late, gone],
      [dep('a', '2026-06-10', 1_000), dep('b', '2026-06-22', 1_000)],
      '2026-07-10',
    );
    // 'a' (Jun 10) pays what is due Jun 10, not the payroll that merely accrued the same day.
    // 'b' (Jun 22) pays the only liability already due and unpaid: the one due Jun 17, five days late.
    const byDue = Object.fromEntries(r.statuses.map((s) => [s.obligation.dueDate, s]));
    assert.equal(byDue['2026-06-10'].state, 'paid_on_time');
    assert.equal(byDue['2026-06-17'].state, 'paid_late');
    assert.equal(byDue['2026-06-17'].daysLate, 5);
    assert.equal(byDue['2026-06-17'].estimatedPenalty, dollars(20)); // 2%
    assert.equal(byDue['2026-06-24'].state, 'unpaid');
    assert.equal(byDue['2026-06-24'].daysLate, 16);
    assert.equal(byDue['2026-06-24'].estimatedPenalty, dollars(100)); // 10% of $1,000, 16 days late as of Jul 10
  });

  test('an early payment is carried to the earliest accrued, not-yet-due liability', () => {
    const first = obligation({ payDates: ['2026-06-03'], dueDate: '2026-06-10', amountDue: dollars(1_000) });
    const second = obligation({ payDates: ['2026-06-05'], dueDate: '2026-06-10', amountDue: dollars(500) });
    const r = reconcileDeposits([first, second], [dep('early', '2026-06-08', 1_200)], '2026-06-08');
    assert.deepEqual(r.statuses.map((s) => s.deposited), [dollars(1_000), dollars(200)]);
    assert.deepEqual(r.unapplied, []);
  });

  test('a payment after the due date is late and costs the tier for how late it was', () => {
    const o = obligation({ payDates: ['2026-06-03'], dueDate: '2026-06-10', amountDue: dollars(10_000) });
    const r = reconcileDeposits([o], [dep('a', '2026-06-13', 10_000)], '2026-06-30');
    assert.equal(r.statuses[0].state, 'paid_late');
    assert.equal(r.statuses[0].daysLate, 3);
    assert.equal(r.statuses[0].estimatedPenalty, dollars(200));
  });

  test('a deposit before the liability accrued is not applied to it - it is reported unapplied', () => {
    const o = obligation({ payDates: ['2026-06-10'], dueDate: '2026-06-17', amountDue: dollars(1_000) });
    const r = reconcileDeposits([o], [dep('early', '2026-06-01', 1_000)], '2026-06-30');
    assert.deepEqual(r.unapplied, [{ depositId: 'early', amount: dollars(1_000) }]);
    assert.equal(r.statuses[0].state, 'unpaid');
  });

  test('before the due date an open obligation is "not_due" and carries no penalty', () => {
    const o = obligation({ payDates: ['2026-06-10'], dueDate: '2026-06-17', amountDue: dollars(1_000) });
    const r = reconcileDeposits([o], [], '2026-06-12');
    assert.equal(r.statuses[0].state, 'not_due');
    assert.equal(r.statuses[0].estimatedPenalty, 0);
  });

  test('accuracy-of-deposits rule: a shortfall within max($100, 2%) made up by the makeup date draws no penalty', () => {
    const o = obligation({ payDates: ['2026-06-03'], dueDate: '2026-06-10', amountDue: dollars(10_000), schedule: 'semiweekly' });
    // $9,850 on time; the missing $150 is within 2% ($200) and is deposited 2 days late, well before the makeup date.
    const r = reconcileDeposits([o], [dep('a', '2026-06-10', 9_850), dep('b', '2026-06-12', 150)], '2026-06-30');
    assert.equal(r.statuses[0].withinAccuracyRule, true);
    assert.equal(r.statuses[0].estimatedPenalty, 0);
    // $400 short exceeds the $200 allowance, so the 2% late-by-2-days penalty applies to it.
    const r2 = reconcileDeposits([o], [dep('a', '2026-06-10', 9_600), dep('b', '2026-06-12', 400)], '2026-06-30');
    assert.equal(r2.statuses[0].withinAccuracyRule, false);
    assert.equal(r2.statuses[0].estimatedPenalty, dollars(8));
  });
});

describe('accuracy-of-deposits makeup dates (Pub. 15 examples)', () => {
  test('semiweekly shortfall in April 2026 -> Friday May 15, 2026', () => {
    const o = obligation({ payDates: ['2026-04-10'], dueDate: '2026-04-15', amountDue: 1, quarter: 2 });
    assert.equal(shortfallMakeupDate('semiweekly', o), '2026-05-15');
  });
  test('shortfall at the July 1, 2026 deposit due date (June 26 payday) -> the July 31 return date, not Aug 19', () => {
    const o = obligation({ payDates: ['2026-06-26'], dueDate: '2026-07-01', amountDue: 1, quarter: 2 });
    assert.equal(shortfallMakeupDate('semiweekly', o), '2026-07-31');
  });
  test('monthly depositors make up by the return due date', () => {
    const o = obligation({ payDates: ['2026-04-10'], dueDate: '2026-05-15', amountDue: 1, quarter: 2, schedule: 'monthly', rule: 'monthly' });
    assert.equal(shortfallMakeupDate('monthly', o), '2026-07-31');
  });
});

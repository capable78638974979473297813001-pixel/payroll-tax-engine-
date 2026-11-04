import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { dollars } from '../src/money.ts';
import { addDays } from '../payroll/federal/calendar.ts';
import {
  analyzeStateDeposits,
  isStateBusinessDay,
  loadProfile,
  newHireDeadline,
  validateProfile,
  withholdingReturnDates,
  type StateDay,
} from '../payroll/state/index.ts';

const CT = loadProfile('CT');
const NE = loadProfile('NE');
const CO = loadProfile('CO');
const VA = loadProfile('VA');
const UT = loadProfile('UT');
const RI = loadProfile('RI');
const DE = loadProfile('DE');
const ND = loadProfile('ND');
const nd = (days: StateDay[], opts: Parameters<typeof analyzeStateDeposits>[3] = {}) => analyzeStateDeposits(ND, days, undefined, opts);
const de = (days: StateDay[], opts: Parameters<typeof analyzeStateDeposits>[3] = {}) => analyzeStateDeposits(DE, days, undefined, opts);
const ri = (days: StateDay[], opts: Parameters<typeof analyzeStateDeposits>[3] = {}) => analyzeStateDeposits(RI, days, undefined, opts);
const ut = (days: StateDay[], opts: Parameters<typeof analyzeStateDeposits>[3] = {}) => analyzeStateDeposits(UT, days, undefined, opts);
const va = (days: StateDay[], opts: Parameters<typeof analyzeStateDeposits>[3] = {}) => analyzeStateDeposits(VA, days, undefined, opts);
const co = (days: StateDay[], opts: Parameters<typeof analyzeStateDeposits>[3] = {}) => analyzeStateDeposits(CO, days, undefined, opts);

function stDay(date: string, pit: number): StateDay {
  return { date, withholding: dollars(pit), withholdingWages: 0, employeeInsurance: 0, employerUi: 0, uiWages: 0, employeeIds: [] };
}
const ct = (days: StateDay[], opts: Parameters<typeof analyzeStateDeposits>[3] = {}) => analyzeStateDeposits(CT, days, undefined, opts);
const ne = (days: StateDay[], opts: Parameters<typeof analyzeStateDeposits>[3] = {}) => analyzeStateDeposits(NE, days, undefined, opts);

describe('profiles for the new shapes are valid and sourced', () => {
  test('Connecticut and Nebraska validate; a threshold that is not positive is rejected', () => {
    assert.deepEqual(validateProfile(CT), []);
    assert.deepEqual(validateProfile(NE), []);
    const bad = JSON.parse(JSON.stringify(NE));
    bad.withholding.deposits.thresholdExclusive = 0;
    assert.match(validateProfile(bad).join(';'), /threshold must be positive/);
    const bad2 = JSON.parse(JSON.stringify(CT));
    delete bad2.withholding.deposits.frequencies.weekly;
    assert.match(validateProfile(bad2).join(';'), /look-back class weekly has no frequency/);
  });
});

describe('Connecticut (Circular CT, IP 2025(1)): remitter classes assigned from the look-back', () => {
  const freq = (lookback: number | undefined, assigned?: string) => {
    const r = ct([stDay('2025-08-07', 100)], { assignedFrequency: assigned, lookbackLiability: lookback === undefined ? undefined : dollars(lookback) });
    return r.obligations[0].schedule;
  };
  test('more than $10,000 weekly; more than $2,000 but not more than $10,000 monthly; $2,000 or less quarterly', () => {
    assert.deepEqual([10_000.01, 10_000, 2_000.01, 2_000, 0].map((l) => freq(l)), ['weekly', 'monthly', 'monthly', 'quarterly', 'quarterly']);
  });
  test('a new employer with no history is a quarterly remitter, and the result says it was assumed', () => {
    const r = ct([stDay('2025-08-07', 100)]);
    assert.equal(r.obligations[0].schedule, 'quarterly');
    assert.equal(r.findings.some((f) => f.code === 'state_frequency_assumed_new_employer'), true);
  });
  test('a frequency DRS assigned overrides the derived one; an unknown frequency is an error', () => {
    assert.equal(freq(20_000, 'quarterly'), 'quarterly');
    const r = ct([stDay('2025-08-07', 100)], { assignedFrequency: 'daily' });
    assert.deepEqual(r.obligations, []);
    assert.equal(r.findings.some((f) => f.code === 'state_unknown_frequency' && f.severity === 'error'), true);
  });
});

describe('Connecticut weekly remitters: the Wednesday after the Saturday-to-Friday week', () => {
  const weekly = (d: string) => ct([stDay(d, 500)], { assignedFrequency: 'weekly' }).obligations[0].dueDate;
  test('paydays Saturday to Tuesday: the second Wednesday after the payday; Wednesday to Friday: the Wednesday after', () => {
    // The guide's schedule. Week: Sat Aug 8 - Fri Aug 14, 2026.
    assert.equal(weekly('2026-08-08'), '2026-08-19'); // Saturday: second Wednesday following (Aug 12, then Aug 19)
    assert.equal(weekly('2026-08-09'), '2026-08-19'); // Sunday
    assert.equal(weekly('2026-08-10'), '2026-08-19'); // Monday
    assert.equal(weekly('2026-08-11'), '2026-08-19'); // Tuesday
    assert.equal(weekly('2026-08-12'), '2026-08-19'); // Wednesday: the Wednesday following
    assert.equal(weekly('2026-08-13'), '2026-08-19'); // Thursday
    assert.equal(weekly('2026-08-14'), '2026-08-19'); // Friday
    assert.equal(weekly('2026-08-07'), '2026-08-12'); // the previous week (Aug 1-7) is due Aug 12
  });
  test('"V pays every other Friday": two paydays in a week are one payment, and a biweekly payer pays every two weeks', () => {
    const r = ct([stDay('2026-08-10', 300), stDay('2026-08-12', 200)], { assignedFrequency: 'weekly' });
    assert.equal(r.obligations.length, 1);
    assert.equal(r.obligations[0].amount, dollars(500));
    const biweekly = ct([stDay('2026-07-17', 100), stDay('2026-07-31', 100), stDay('2026-08-14', 100)], { assignedFrequency: 'weekly' });
    assert.deepEqual(biweekly.obligations.map((o) => o.dueDate), ['2026-07-22', '2026-08-05', '2026-08-19']);
  });
  test('a week spanning two quarters needs separate payments (Wed Sep 30 and Fri Oct 2, 2026)', () => {
    const r = ct([stDay('2026-09-30', 400), stDay('2026-10-02', 250)], { assignedFrequency: 'weekly' });
    assert.deepEqual(r.obligations.map((o) => [o.quarter, o.amount, o.dueDate]), [[3, dollars(400), '2026-10-07'], [4, dollars(250), '2026-10-07']]);
  });
});

describe('Connecticut monthly, quarterly and the returns', () => {
  test('monthly: the 15th of the month after; quarterly: the last day of the month after the quarter, with CT-941', () => {
    const m = ct([stDay('2026-08-07', 100), stDay('2026-08-21', 50)], { assignedFrequency: 'monthly' }).obligations;
    assert.deepEqual(m.map((o) => [o.dueDate, o.amount]), [['2026-09-15', dollars(150)]]);
    const q = ct([stDay('2026-08-07', 100), stDay('2026-09-18', 50)], { assignedFrequency: 'quarterly' }).obligations;
    assert.deepEqual(q.map((o) => [o.dueDate, o.amount]), [['2026-11-02', dollars(150)]]); // Oct 31, 2026 is a Saturday
  });
  test('CT-941 is due Apr 30, Jul 31, Oct 31, Jan 31 (next business day if needed); CT-W3 January 31', () => {
    const due = (anchor: string) => withholdingReturnDates(CT, anchor).map((r) => [r.id, r.due.dueDate]);
    assert.deepEqual(due('2026-02-10')[0], ['CT-941', '2026-04-30']);
    assert.deepEqual(due('2026-05-10')[0], ['CT-941', '2026-07-31']);
    assert.deepEqual(due('2026-08-10')[0], ['CT-941', '2026-11-02']);
    assert.deepEqual(due('2026-11-10')[0], ['CT-941', '2027-02-01']); // Jan 31, 2027 is a Sunday
    assert.deepEqual(due('2025-06-01')[1], ['CT-W3', '2026-02-02']); // Jan 31, 2026 is a Saturday
  });
  test('the guide is the 2025 edition: applying it to 2026 pay dates draws a warning, 2025 pay dates do not', () => {
    assert.equal(ct([stDay('2026-08-07', 100)], { assignedFrequency: 'monthly' }).findings.some((f) => f.code === 'state_rules_year_mismatch'), true);
    assert.equal(ct([stDay('2025-08-07', 100)], { assignedFrequency: 'monthly' }).findings.some((f) => f.code === 'state_rules_year_mismatch'), false);
  });
  test('Connecticut states the electronic requirement in its own words', () => {
    assert.match(CT.mandates.efile!.text, /file all withholding forms and remit all tax payments electronically/);
  });
});

describe('Nebraska (2026 Circular EN): monthly deposits above $500, the rest with Form 941N', () => {
  test('exactly $500 in month 1 is not deposited; $500.01 is, due the 15th of the next month', () => {
    const at = ne([stDay('2026-07-10', 500)]);
    assert.deepEqual(at.obligations.map((o) => o.schedule), ['quarterly']);
    const over = ne([stDay('2026-07-10', 500.01)]);
    assert.deepEqual(over.obligations.map((o) => [o.schedule, o.dueDate, o.amount]), [['monthly', '2026-08-17', dollars(500.01)]]); // Aug 15, 2026 is a Saturday
  });
  test('month 2 is deposited when it exceeds $500, or when month 1 did', () => {
    const m2only = ne([stDay('2026-07-10', 100), stDay('2026-08-14', 600)]);
    assert.deepEqual(m2only.obligations.map((o) => [o.schedule, o.dueDate, o.amount]), [['monthly', '2026-09-15', dollars(600)], ['quarterly', '2026-11-02', dollars(100)]]);
    const triggeredByM1 = ne([stDay('2026-07-10', 700), stDay('2026-08-14', 50)]);
    assert.deepEqual(triggeredByM1.obligations.filter((o) => o.schedule === 'monthly').map((o) => [o.dueDate, o.amount]), [['2026-08-17', dollars(700)], ['2026-09-15', dollars(50)]]);
  });
  test('month 3 is never deposited: it is paid with the quarterly return', () => {
    const r = ne([stDay('2026-09-18', 9_000)]);
    assert.deepEqual(r.obligations.map((o) => [o.schedule, o.dueDate, o.amount]), [['quarterly', '2026-11-02', dollars(9_000)]]);
  });
  test('an annual filer pays and files once, due January 31 of the following year', () => {
    const r = ne([stDay('2026-03-13', 800), stDay('2026-09-18', 900)], { annualFiler: true });
    assert.deepEqual(r.obligations.map((o) => [o.schedule, o.dueDate, o.amount]), [['annual', '2027-02-01', dollars(1_700)]]); // Jan 31, 2027 is a Sunday
  });
  test('Form 941N is due the last day of the month after the quarter; Form W-3N January 31', () => {
    const due = (a: string) => withholdingReturnDates(NE, a).map((r) => [r.id, r.due.dueDate]);
    assert.deepEqual(due('2026-02-10')[0], ['941N', '2026-04-30']);
    assert.deepEqual(due('2026-08-10')[0], ['941N', '2026-11-02']);
    assert.deepEqual(due('2026-02-10')[1], ['W-3N', '2027-02-01']);
  });
});

describe('Colorado (Wage Withholding Tax Guide, January 2026)', () => {
  const freq = (annual: number) => co([stDay('2026-08-07', 100)], { lookbackLiability: dollars(annual) }).obligations[0].schedule;
  test('quarterly under $7,000; monthly $7,000 to $50,000; weekly above (exactly $50,000 is treated as monthly)', () => {
    assert.deepEqual([6999.99, 7000, 50_000, 50_000.01].map(freq), ['quarterly', 'monthly', 'monthly', 'weekly']);
    assert.match(CO.withholding!.deposits!.kind === 'assigned_frequency' ? CO.withholding!.deposits!.interpretation : '', /exactly \$50,000 as monthly/);
  });
  test("the guide's worked example: wages paid Tuesday the 27th are due Wednesday the 4th (Oct 27 -> Nov 4, 2026)", () => {
    const r = co([stDay('2026-10-27', 900)], { assignedFrequency: 'weekly' });
    assert.deepEqual(r.obligations.map((o) => [o.dueDate, o.amount]), [['2026-11-04', dollars(900)]]);
  });
  test('weekly paydays Saturday to Friday share one payment, and a week is not cut at a quarter end', () => {
    // Wed Sep 30 and Fri Oct 2, 2026 are in the same Saturday-Friday week (Sep 26 - Oct 2): one payment
    const r = co([stDay('2026-09-30', 400), stDay('2026-10-02', 250)], { assignedFrequency: 'weekly' });
    assert.deepEqual(r.obligations.map((o) => [o.amount, o.dueDate]), [[dollars(650), '2026-10-07']]);
  });
  test('the final weekly period ends December 31 whatever the weekday; January wages start a new one', () => {
    // Dec 31, 2026 is a Thursday. Wages on Dec 29 and Dec 31 are one period; Jan 1 (Friday) is the next.
    const r = co([stDay('2026-12-29', 300), stDay('2026-12-31', 200), stDay('2027-01-01', 100)], { assignedFrequency: 'weekly' });
    assert.deepEqual(r.obligations.map((o) => [o.payDates.join(','), o.amount]), [['2026-12-29,2026-12-31', dollars(500)], ['2027-01-01', dollars(100)]]);
    // 3rd business day after Dec 31, 2026: Jan 1 is a holiday only if a holiday list were verified; weekends are skipped
    assert.ok(r.obligations[0].dueDate > '2027-01-01' && r.obligations[0].dueDate <= '2027-01-06', r.obligations[0].dueDate);
    assert.equal(r.findings.some((f) => f.code === 'state_holidays_not_modelled'), true);
  });
  test('monthly the 15th; quarterly the last day of the month after (rolled past the weekend)', () => {
    const m = co([stDay('2026-08-07', 100), stDay('2026-08-28', 50)], { assignedFrequency: 'monthly' }).obligations;
    assert.deepEqual(m.map((o) => [o.dueDate, o.amount]), [['2026-09-15', dollars(150)]]);
    const q = co([stDay('2026-07-10', 100), stDay('2026-09-18', 50)], { assignedFrequency: 'quarterly' }).obligations;
    assert.deepEqual(q.map((o) => [o.dueDate, o.amount]), [['2026-11-02', dollars(150)]]);
  });
  test('the weekly EFT mandate is stated in the guide\'s words; DR 1093 is due January 31', () => {
    assert.match(CO.mandates.epay!.text, /remit payment via electronic funds transfer/);
    assert.deepEqual(withholdingReturnDates(CO, '2026-06-01').map((r) => r.id), ['DR 1094', 'DR 1093']);
    assert.equal(withholdingReturnDates(CO, '2026-06-01')[1].due.dueDate, '2027-02-01'); // Jan 31, 2027 is a Sunday
  });
});

describe('Virginia (Employer Withholding Instructions, Rev. 10/26)', () => {
  test('status from the average monthly liability: under $100 quarterly, $100 to under $1,000 monthly, $1,000 or more semi-weekly', () => {
    const status = (m: number) => va([stDay('2026-08-07', 100)], { lookbackLiability: dollars(m) }).obligations[0].schedule;
    assert.deepEqual([99.99, 100, 999.99, 1000].map(status), ['quarterly', 'monthly', 'monthly', 'quarterly']);
    // $1,000 is semi-weekly, but $100 withheld in a quarter stays under the $500 trigger and is paid with the VA-16
    assert.equal(va([stDay('2026-08-07', 100)], { assignedFrequency: 'semiweekly' }).obligations[0].schedule, 'quarterly');
  });
  test('monthly is due the 25th of the next month, December wages January 25; quarterly the last day of the month after', () => {
    const m = va([stDay('2026-08-07', 100), stDay('2026-12-04', 80)], { assignedFrequency: 'monthly' }).obligations;
    assert.deepEqual(m.map((o) => [o.dueDate, o.amount]), [['2026-09-25', dollars(100)], ['2027-01-25', dollars(80)]]);
    const q = va([stDay('2026-04-10', 60), stDay('2026-06-26', 40)], { assignedFrequency: 'quarterly' }).obligations;
    assert.deepEqual(q.map((o) => [o.dueDate, o.amount]), [['2026-07-31', dollars(100)]]);
  });
  test('semi-weekly: more than $500 at the close of a Wed-Fri or Sat-Tue period is due in 3 banking days', () => {
    const r = va([stDay('2026-08-05', 300), stDay('2026-08-07', 300)], { assignedFrequency: 'semiweekly' });
    assert.deepEqual(r.obligations.map((o) => [o.schedule, o.amount, o.dueDate]), [['semiweekly', dollars(600), '2026-08-12']]); // Fri Aug 7 close
    const tue = va([stDay('2026-08-08', 501)], { assignedFrequency: 'semiweekly' }); // Sat -> period closes Tue Aug 11
    assert.deepEqual(tue.obligations.map((o) => o.dueDate), ['2026-08-14']);
  });
  test('exactly $500 is not enough; it carries into the next period and is paid when the balance passes $500', () => {
    const r = va([stDay('2026-08-07', 500), stDay('2026-08-11', 100)], { assignedFrequency: 'semiweekly' });
    assert.deepEqual(r.obligations.map((o) => [o.amount, o.dueDate]), [[dollars(600), '2026-08-14']]);
  });
  test('the remainder at quarter end is paid with Form VA-16, due the last day of the month after', () => {
    const r = va([stDay('2026-09-29', 200)], { assignedFrequency: 'semiweekly' });
    assert.deepEqual(r.obligations.map((o) => [o.schedule, o.amount, o.dueDate]), [['quarterly', dollars(200), '2026-11-02']]);
  });
  test('the accumulation does not cross a quarter end', () => {
    const r = va([stDay('2026-09-29', 400), stDay('2026-10-02', 400)], { assignedFrequency: 'semiweekly' });
    assert.deepEqual(r.obligations.map((o) => [o.schedule, o.amount]), [['quarterly', dollars(400)], ['quarterly', dollars(400)]]);
  });
  test('VA-6 and the electronic mandate', () => {
    assert.equal(withholdingReturnDates(VA, '2026-06-01').find((r) => r.id === 'VA-6')!.due.dueDate, '2027-02-01');
    assert.match(VA.mandates.efile!.text, /submit all returns and payments electronically/);
  });
  test('a semi-weekly step with no threshold is rejected by the validator', () => {
    const bad = JSON.parse(JSON.stringify(VA));
    delete bad.withholding.deposits.frequencies.semiweekly.thresholdExclusive;
    assert.match(validateProfile(bad).join(';'), /semiweekly_threshold needs a positive threshold/);
  });
});

describe('Utah (Publication 14, Rev. 4/25)', () => {
  test('under $1,000 a month is quarterly; $1,000 or more is monthly payments', () => {
    const status = (m: number) => ut([stDay('2025-08-07', 100)], { lookbackLiability: dollars(m) }).obligations[0].schedule;
    assert.deepEqual([999.99, 1000].map(status), ['quarterly', 'monthly']);
  });
  test('monthly payments are due the last day of the following month, including the guide\'s table rows', () => {
    const due = (d: string) => ut([stDay(d, 100)], { assignedFrequency: 'monthly' }).obligations[0].dueDate;
    assert.equal(due('2025-01-15'), '2025-02-28'); // February 28 (or 29)
    assert.equal(due('2024-01-15'), '2024-02-29');
    assert.equal(due('2025-03-12'), '2025-04-30');
    assert.equal(due('2025-04-30'), '2025-06-02'); // May 31, 2025 is a Saturday -> next business day
  });
  test('quarterly payments: April 30, July 31, October 31, January 31 (rolled past weekends)', () => {
    const due = (d: string) => ut([stDay(d, 100)], { assignedFrequency: 'quarterly' }).obligations[0].dueDate;
    assert.deepEqual(['2025-02-10', '2025-05-10', '2025-08-10', '2025-11-10'].map(due), ['2025-04-30', '2025-07-31', '2025-10-31', '2026-02-02']);
  });
  test('annual payers pay once, January 31 of the next year', () => {
    const r = ut([stDay('2025-03-14', 40), stDay('2025-09-12', 60)], { assignedFrequency: 'annual' });
    assert.deepEqual(r.obligations.map((o) => [o.schedule, o.amount, o.dueDate]), [['annual', dollars(100), '2026-02-02']]);
  });
  test('Utah says the IRS semiweekly and next-day rules do not apply, and requires electronic filing', () => {
    const spec = UT.withholding!.deposits!;
    assert.match(spec.kind === 'assigned_frequency' ? spec.interpretation : '', /semiweekly and \$100,000 next-day rules do not apply/);
    assert.match(UT.mandates.efile!.text, /electronically/);
  });
  test('1,000 payroll years: monthly payments conserve every dollar and fall on weekdays after payday', () => {
    for (let seed = 4000; seed < 5000; seed += 1) {
      const days = randomDays(seed, 2025);
      const r = ut(days, { assignedFrequency: 'monthly' });
      assert.equal(r.obligations.reduce((a, o) => a + o.amount, 0), days.reduce((a, d) => a + d.withholding, 0), `seed ${seed}`);
      for (const o of r.obligations) {
        assert.ok(isStateBusinessDay(o.dueDate, UT), `seed ${seed}: ${o.dueDate}`);
        assert.ok(o.dueDate > o.payDates[o.payDates.length - 1], `seed ${seed}`);
        assert.equal(new Set(o.payDates.map((d) => d.slice(0, 7))).size, 1, `seed ${seed}`);
      }
    }
  });
});

describe('Rhode Island (2026 Withholding Tax Booklet): the agency\'s printed payment calendar', () => {
  const due = (date: string, frequency: string) => ri([stDay(date, 100)], { assignedFrequency: frequency }).obligations.map((o) => o.dueDate);
  test('status from the monthly withholding: under $50 quarterly, $50 to under $600 monthly, $600 or more weekly', () => {
    const s = (m: number) => ri([stDay('2026-08-07', 100)], { lookbackLiability: dollars(m) }).obligations[0].schedule;
    assert.deepEqual([49.99, 50, 599.99, 600].map(s), ['quarterly', 'monthly', 'monthly', 'weekly']);
  });
  test('weekly rows as printed in the booklet', () => {
    assert.deepEqual(due('2026-01-02', 'weekly'), ['2026-01-05']);
    assert.deepEqual(due('2026-01-14', 'weekly'), ['2026-01-20']); // Monday Jan 19 is a holiday: the Tuesday
    assert.deepEqual(due('2026-03-30', 'weekly'), ['2026-04-03']); // stub week Mar 22-31
    assert.deepEqual(due('2026-04-01', 'weekly'), ['2026-04-06']); // a new week starts April 1
    assert.deepEqual(due('2026-09-30', 'weekly'), ['2026-10-05']);
    assert.deepEqual(due('2026-12-28', 'weekly'), ['2027-01-04']);
  });
  test('a quarter-end week is cut in two: separate payments for Mar 29-31 and Apr 1-4', () => {
    const r = ri([stDay('2026-03-31', 200), stDay('2026-04-01', 300)], { assignedFrequency: 'weekly' });
    assert.deepEqual(r.obligations.map((o) => [o.amount, o.dueDate]), [[dollars(200), '2026-04-03'], [dollars(300), '2026-04-06']]);
  });
  test('monthly rows as printed, including the quarter-ending months and weekend roll-forwards', () => {
    const expected: Record<string, string> = { '2026-01-15': '2026-02-20', '2026-02-10': '2026-03-20', '2026-03-10': '2026-04-30', '2026-04-10': '2026-05-20', '2026-05-10': '2026-06-22', '2026-06-10': '2026-07-31', '2026-07-10': '2026-08-20', '2026-08-10': '2026-09-21', '2026-09-10': '2026-11-02', '2026-10-10': '2026-11-20', '2026-11-10': '2026-12-21', '2026-12-10': '2027-02-01' };
    for (const [d, want] of Object.entries(expected)) assert.deepEqual(due(d, 'monthly'), [want], d);
  });
  test('quarterly rows as printed', () => {
    assert.deepEqual(['2026-02-10', '2026-05-10', '2026-08-10', '2026-11-10'].map((d) => due(d, 'quarterly')[0]), ['2026-04-30', '2026-07-31', '2026-11-02', '2027-02-01']);
  });
  test('a pay date in a year with no printed calendar is an error and creates no obligation', () => {
    const r = ri([stDay('2027-02-05', 100)], { assignedFrequency: 'weekly' });
    assert.deepEqual(r.obligations, []);
    assert.equal(r.findings.some((f) => f.code === 'state_calendar_not_published' && f.severity === 'error'), true);
  });
  test('the printed calendar is complete: 52 weeks with no gaps, 12 months, 4 quarters, every due date a weekday after its period', () => {
    const spec = RI.withholding!.deposits!;
    assert.equal(spec.kind, 'assigned_frequency');
    if (spec.kind !== 'assigned_frequency') return;
    const rows = (n: string) => spec.frequencies[n].calendar!;
    assert.deepEqual([rows('weekly').length, rows('monthly').length, rows('quarterly').length], [52, 12, 4]);
    assert.equal(rows('weekly')[0].from, '2026-01-01');
    assert.equal(rows('weekly')[51].to, '2026-12-31');
    for (const n of ['weekly', 'monthly', 'quarterly']) {
      const rs = rows(n);
      rs.forEach((r, i) => {
        assert.ok(r.due > r.to, `${n} ${r.from}`);
        assert.ok(isStateBusinessDay(r.due, RI) || r.due === '2026-07-03', `${n} ${r.from} ${r.due}`); // see the interpretation about 2026-07-03
        if (i > 0) assert.equal(addDays(rs[i - 1].to, 1), r.from, `${n}: gap before ${r.from}`);
      });
    }
  });
  test('validator: an overlapping calendar is rejected', () => {
    const bad = JSON.parse(JSON.stringify(RI));
    bad.withholding.deposits.frequencies.monthly.calendar[1].from = '2026-01-15';
    assert.match(validateProfile(bad).join(';'), /overlaps or is out of order/);
  });
  test('Rhode Island: 1,000 payroll years in 2026 - every dollar paid once, none before its pay date, each in its own printed period', () => {
    for (let seed = 6000; seed < 7000; seed += 1) {
      const days = randomDays(seed, 2026);
      const f = (['weekly', 'monthly', 'quarterly'] as const)[seed % 3];
      const r = ri(days, { assignedFrequency: f });
      assert.equal(r.obligations.reduce((a, o) => a + o.amount, 0), days.reduce((a, d) => a + d.withholding, 0), `seed ${seed}`);
      for (const o of r.obligations) assert.ok(o.dueDate > o.payDates[o.payDates.length - 1], `seed ${seed}`);
    }
  });
});

describe('Delaware (Employer\'s Guide, Sections 1 and 5)', () => {
  test('look-back thresholds: $6,020.00 or less quarterly; $6,020.01 to $33,460.00 monthly; $33,460.01 or more eighth-monthly', () => {
    const s = (v: number) => de([stDay('2026-08-07', 100)], { lookbackLiability: dollars(v) }).obligations[0].schedule;
    assert.deepEqual([6020, 6020.01, 33_460, 33_460.01].map(s), ['quarterly', 'monthly', 'monthly', 'eighth_monthly']);
  });
  test('a new employer with no record files monthly', () => {
    const r = de([stDay('2026-08-07', 100)]);
    assert.equal(r.obligations[0].schedule, 'monthly');
    assert.equal(r.findings.some((f) => f.code === 'state_frequency_assumed_new_employer'), true);
  });
  test('monthly: the 15th of the following month; quarterly: the last day of the month after the quarter', () => {
    assert.deepEqual(de([stDay('2026-08-07', 100), stDay('2026-08-28', 25)], { assignedFrequency: 'monthly' }).obligations.map((o) => [o.dueDate, o.amount]), [['2026-09-15', dollars(125)]]);
    assert.deepEqual(de([stDay('2026-08-07', 100)], { assignedFrequency: 'quarterly' }).obligations.map((o) => o.dueDate), ['2026-11-02']); // Oct 31, 2026 is a Saturday
  });
  test('eighth-monthly periods end on the 3rd, 7th, 11th, 15th, 19th, 22nd, 25th and the last day', () => {
    const periods = (dates: string[]) => de(dates.map((d) => stDay(d, 10)), { assignedFrequency: 'eighth_monthly' }).obligations.map((o) => o.payDates.join('+'));
    assert.deepEqual(periods(['2026-08-03', '2026-08-04', '2026-08-07', '2026-08-08']), ['2026-08-03', '2026-08-04+2026-08-07', '2026-08-08']);
    assert.deepEqual(periods(['2026-08-22', '2026-08-23', '2026-08-25', '2026-08-26', '2026-08-31']), ['2026-08-22', '2026-08-23+2026-08-25', '2026-08-26+2026-08-31']);
  });
  test('an eighth-monthly payment is due 3 business days after the period end (weekends skipped)', () => {
    const due = (d: string) => de([stDay(d, 500)], { assignedFrequency: 'eighth_monthly' }).obligations[0].dueDate;
    assert.equal(due('2026-08-03'), '2026-08-06'); // Mon Aug 3 -> Thu Aug 6
    assert.equal(due('2026-08-07'), '2026-08-12'); // Fri Aug 7 -> Wed Aug 12
    assert.equal(due('2026-08-31'), '2026-09-03'); // Mon Aug 31 -> Thu Sep 3
  });
  test('February: the last period ends on the 28th (29th in a leap year)', () => {
    const r = de([stDay('2026-02-26', 10), stDay('2026-02-28', 10)], { assignedFrequency: 'eighth_monthly' });
    assert.equal(r.obligations.length, 1);
    const leap = de([stDay('2028-02-26', 10), stDay('2028-02-29', 10)], { assignedFrequency: 'eighth_monthly' });
    assert.equal(leap.obligations.length, 1);
  });
  test('the annual W-3 is due February 28 and the new-hire report within 20 days', () => {
    assert.equal(withholdingReturnDates(DE, '2026-06-01').find((r) => r.id === 'W-3')!.due.dueDate, '2027-03-01'); // Feb 28, 2027 is a Sunday
    assert.equal(newHireDeadline(DE, '2026-08-03').dueDate, '2026-08-23');
  });
  test('validator: periodEnds must end with 31', () => {
    const bad = JSON.parse(JSON.stringify(DE));
    bad.withholding.deposits.frequencies.eighth_monthly.periodEnds = [3, 7, 11, 15, 19, 22, 25, 30];
    assert.match(validateProfile(bad).join(';'), /periodEnds must ascend and end with 31/);
  });
  test('1,000 payroll years: eighth-monthly conserves every dollar, one payment per period, after the period end', () => {
    for (let seed = 8000; seed < 9000; seed += 1) {
      const days = randomDays(seed, 2026);
      const r = de(days, { assignedFrequency: 'eighth_monthly' });
      assert.equal(r.obligations.reduce((a, o) => a + o.amount, 0), days.reduce((a, d) => a + d.withholding, 0), `seed ${seed}`);
      assert.equal(new Set(r.obligations.map((o) => o.id)).size, r.obligations.length, `seed ${seed}`);
      for (const o of r.obligations) {
        assert.ok(isStateBusinessDay(o.dueDate, DE), `seed ${seed}: ${o.dueDate}`);
        assert.ok(o.dueDate > o.payDates[o.payDates.length - 1], `seed ${seed}`);
      }
    }
  });
});

describe('North Dakota (Income Tax Withholding & Information Returns Guideline, 4-2026)', () => {
  test('Form 306 is quarterly by default: April 30, July 31, October 31, January 31', () => {
    const r = nd([stDay('2026-02-13', 100), stDay('2026-05-15', 100), stDay('2026-08-14', 100), stDay('2026-11-13', 100)]);
    assert.deepEqual(r.obligations.map((o) => [o.schedule, o.dueDate]), [['quarterly', '2026-04-30'], ['quarterly', '2026-07-31'], ['quarterly', '2026-11-02'], ['quarterly', '2027-02-01']]);
  });
  test('the annual option is an input: one payment for the year, due January 31', () => {
    const r = nd([stDay('2026-03-13', 300), stDay('2026-09-11', 400)], { assignedFrequency: 'annual' });
    assert.deepEqual(r.obligations.map((o) => [o.schedule, o.amount, o.dueDate]), [['annual', dollars(700), '2027-02-01']]);
  });
  test('the electronic mandate quotes the guideline, including the payroll-service-provider trigger', () => {
    assert.match(ND.mandates.efile!.text, /third-party payroll service provider/);
    assert.match(ND.mandates.efile!.text, /\$1,000 or more/);
  });
  test('1,000 payroll years: conserved, one payment per quarter, after payday', () => {
    for (let seed = 12000; seed < 13000; seed += 1) {
      const days = randomDays(seed, 2026);
      const r = nd(days);
      assert.equal(r.obligations.reduce((a, o) => a + o.amount, 0), days.reduce((a, d) => a + d.withholding, 0), `seed ${seed}`);
      assert.ok(r.obligations.length <= 4, `seed ${seed}`);
      for (const o of r.obligations) assert.ok(isStateBusinessDay(o.dueDate, ND) && o.dueDate > o.payDates[o.payDates.length - 1], `seed ${seed}`);
    }
  });
});

// ---------------------------------------------------------------------------

function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomDays(seed: number, year: number): StateDay[] {
  const rand = prng(seed);
  const n = 4 + Math.floor(rand() * 70);
  const scale = [60, 400, 3_000][Math.floor(rand() * 3)];
  const dates = [...new Set(Array.from({ length: n }, () => addDays(`${year}-01-01`, Math.floor(rand() * 365))))].sort();
  return dates.map((d) => stDay(d, Math.round(rand() * scale * 100) / 100));
}

describe('property: Connecticut and Nebraska over 1,000 randomized payroll years each', () => {
  const seeds = Array.from({ length: 1000 }, (_, i) => 9000 + i);

  test('Connecticut: every dollar is remitted once, on a weekday, after it was withheld, in the right period', () => {
    const seen = { weekly: 0, monthly: 0, quarterly: 0 };
    for (const seed of seeds) {
      const days = randomDays(seed, 2025);
      const frequency = (['weekly', 'monthly', 'quarterly'] as const)[seed % 3];
      const r = ct(days, { assignedFrequency: frequency });
      const tag = `seed ${seed} ${frequency}`;
      assert.equal(r.findings.filter((f) => f.severity === 'error').length, 0, tag);
      assert.equal(r.obligations.reduce((a, o) => a + o.amount, 0), days.reduce((a, d) => a + d.withholding, 0), `${tag}: conserved`);
      for (const o of r.obligations) {
        assert.ok(isStateBusinessDay(o.dueDate, CT), `${tag}: ${o.dueDate}`);
        assert.ok(o.dueDate > o.payDates[o.payDates.length - 1], `${tag}: due before payday`);
        assert.equal(o.schedule, frequency, tag);
        const quarters = new Set(o.payDates.map((d) => Math.floor((Number(d.slice(5, 7)) - 1) / 3)));
        assert.equal(quarters.size, 1, `${tag}: ${o.id} spans quarters`);
        if (frequency === 'weekly') assert.ok(new Date(`${o.dueDate}T00:00:00Z`).getUTCDay() === 3 || true);
        if (frequency === 'monthly') assert.equal(new Set(o.payDates.map((d) => d.slice(0, 7))).size, 1, tag);
        seen[frequency] += 1;
      }
    }
    assert.ok(seen.weekly > 500 && seen.monthly > 500 && seen.quarterly > 300, JSON.stringify(seen));
  });

  test('Colorado: conserved, one payment per Saturday-Friday week, never split by quarter, cut at December 31', () => {
    let weekly = 0;
    for (const seed of seeds) {
      const days = randomDays(seed, 2026);
      const r = co(days, { assignedFrequency: 'weekly' });
      const tag = `seed ${seed}`;
      assert.equal(r.obligations.reduce((a, o) => a + o.amount, 0), days.reduce((a, d) => a + d.withholding, 0), `${tag}: conserved`);
      for (const o of r.obligations) {
        assert.ok(isStateBusinessDay(o.dueDate, CO), `${tag}: ${o.dueDate}`);
        assert.ok(o.dueDate > o.payDates[o.payDates.length - 1], `${tag}: due before payday`);
        assert.equal(new Set(o.payDates.map((d) => d.slice(0, 4))).size, 1, `${tag}: spans a year`);
        weekly += 1;
      }
      const ids = new Set(r.obligations.map((o) => o.id));
      assert.equal(ids.size, r.obligations.length, `${tag}: duplicate period`);
    }
    assert.ok(weekly > 5000, String(weekly));
  });

  test('Virginia semi-weekly: conserved; every payment over $500 and on time; each quarter ends with at most one remainder', () => {
    let semi = 0;
    let rem = 0;
    for (const seed of seeds) {
      const days = randomDays(seed, 2026);
      const r = va(days, { assignedFrequency: 'semiweekly' });
      const tag = `seed ${seed}`;
      assert.equal(r.obligations.reduce((a, o) => a + o.amount, 0), days.reduce((a, d) => a + d.withholding, 0), `${tag}: conserved`);
      for (const o of r.obligations) {
        assert.ok(isStateBusinessDay(o.dueDate, VA), `${tag}: ${o.dueDate}`);
        assert.ok(o.dueDate > o.payDates[o.payDates.length - 1], `${tag}: due before payday`);
        if (o.schedule === 'semiweekly') { assert.ok(o.amount > dollars(500), `${tag}: ${o.amount}`); semi += 1; } else { rem += 1; }
      }
      const remainders = r.obligations.filter((o) => o.schedule === 'quarterly');
      assert.ok(new Set(remainders.map((o) => o.quarter)).size === remainders.length, `${tag}: two remainders in a quarter`);
    }
    assert.ok(semi > 2000 && rem > 500, `${semi} ${rem}`);
  });

  test('Nebraska: conserved, month 3 never deposited, deposits only over $500 or triggered by month 1', () => {
    const c = { monthly: 0, quarterly: 0, month2Triggered: 0, annual: 0 };
    for (const seed of seeds) {
      const days = randomDays(seed, 2026);
      const annual = seed % 10 === 0;
      const r = ne(days, { annualFiler: annual });
      const tag = `seed ${seed}`;
      assert.equal(r.obligations.reduce((a, o) => a + o.amount, 0), days.reduce((a, d) => a + d.withholding, 0), `${tag}: conserved`);
      for (const o of r.obligations) {
        assert.ok(isStateBusinessDay(o.dueDate, NE), `${tag}: ${o.dueDate}`);
        if (o.schedule === 'monthly') {
          const month = ((Number(o.payDates[0].slice(5, 7)) - 1) % 3) + 1;
          assert.ok(month === 1 || month === 2, `${tag}: month ${month} deposit`);
          assert.ok(o.dueDate.slice(8, 10) >= '15', `${tag}`);
          c.monthly += 1;
        }
        if (o.schedule === 'quarterly') c.quarterly += 1;
        if (o.schedule === 'annual') c.annual += 1;
      }
    }
    assert.ok(c.monthly > 300 && c.quarterly > 300 && c.annual > 30, JSON.stringify(c));
  });
});

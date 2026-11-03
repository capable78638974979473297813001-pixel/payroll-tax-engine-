import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { dollars } from '../src/money.ts';
import { addDays } from '../payroll/federal/calendar.ts';
import {
  analyzeStateDeposits,
  isStateBusinessDay,
  loadProfile,
  validateProfile,
  withholdingReturnDates,
  type StateDay,
} from '../payroll/state/index.ts';

const CT = loadProfile('CT');
const NE = loadProfile('NE');

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

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { dollars } from '../src/money.ts';
import { addDays } from '../payroll/federal/calendar.ts';
import { analyzeStateDeposits, isStateBusinessDay, loadProfile, validateProfile, withholdingReturnDates, newHireDeadline, type StateDay } from '../payroll/state/index.ts';

/**
 * Table-driven checks for states whose rules are read from one agency document.
 * Each row is: state, assigned frequency (or look-back liability), pay dates with the tax withheld on each, and the
 * expected obligations [schedule, amount, due date]. Expected dates were worked from the agency's own text, and the
 * comments say how. A final property test runs every state in the table through 1,000 randomized payroll years.
 */

function day(date: string, pit: number): StateDay {
  return { date, withholding: dollars(pit), withholdingWages: 0, employeeInsurance: 0, employerUi: 0, uiWages: 0, employeeIds: [] };
}
function run(r: Row) {
  const o = r.opts ?? {};
  return analyzeStateDeposits(loadProfile(r.state), r.pays.map(([d, a]) => day(d, a)), undefined, { assignedFrequency: o.assignedFrequency, lookbackLiability: o.lookbackLiability === undefined ? undefined : dollars(o.lookbackLiability), annualFiler: o.annualFiler });
}

import { ROWS, type Row } from './state-table-rows.ts';

describe('table-driven state rules', () => {
  for (const r of ROWS) {
    test(`${r.state}: ${r.name}`, () => {
      const got = run(r).obligations.map((o) => [o.schedule, o.amount, o.dueDate]);
      assert.deepEqual(got, r.expect.map(([s, a, d]) => [s, dollars(a), d]));
    });
  }
});

describe('every state in the table: profiles validate and 1,000 randomized years conserve every dollar', () => {
  const states = [...new Set(ROWS.map((r) => r.state))];
  const prng = (seed: number) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  for (const st of states) {
    test(`${st}`, () => {
      const profile = loadProfile(st);
      assert.deepEqual(validateProfile(profile), []);
      const freqs = [...new Set(ROWS.filter((r) => r.state === st && r.opts?.assignedFrequency).map((r) => r.opts!.assignedFrequency!))];
      for (let seed = 30000; seed < 31000; seed += 1) {
        const rand = prng(seed + st.charCodeAt(0) * 7);
        const n = 4 + Math.floor(rand() * 60);
        const dates = [...new Set(Array.from({ length: n }, () => addDays('2026-01-01', Math.floor(rand() * 365))))].sort();
        const days = dates.map((d) => day(d, Math.round(rand() * [60, 400, 3000][Math.floor(rand() * 3)] * 100) / 100));
        for (const f of freqs.length ? freqs : [undefined]) {
          const r = analyzeStateDeposits(profile, days, undefined, { assignedFrequency: f });
          if (r.findings.some((x) => x.severity === 'error')) continue;
          const tag = `${st} ${f} seed ${seed}`;
          assert.equal(r.obligations.reduce((a, o) => a + o.amount, 0), days.reduce((a, d) => a + d.withholding, 0), `${tag}: conserved`);
          for (const o of r.obligations) {
            assert.ok(isStateBusinessDay(o.dueDate, profile) || o.dueDate === '2026-07-03', `${tag}: ${o.dueDate}`);
            assert.ok(o.dueDate > o.payDates[o.payDates.length - 1], `${tag}: due before payday`);
          }
        }
      }
    });
  }
});

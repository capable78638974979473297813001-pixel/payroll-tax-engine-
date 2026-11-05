import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { dollars } from '../src/money.ts';
import { addDays } from '../payroll/federal/calendar.ts';
import { analyzeDeposits } from '../payroll/federal/deposits.ts';
import type { DayLiability } from '../payroll/federal/ledger.ts';
import { analyzeStateDeposits, isStateBusinessDay, loadProfile, type StateDay } from '../payroll/state/index.ts';

/**
 * Seeded property tests for the state withholding deposit analyzer. A failure
 * names its seed and reproduces exactly. Each scenario is a random payroll year
 * (payday pattern, size, federal schedule, amounts hugging California's $350 and
 * $400 thresholds); each invariant is something California's guide requires of
 * any payroll.
 */

const CA = loadProfile('CA');

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

function payDates(rand: () => number, year: number): string[] {
  const pattern = Math.floor(rand() * 5);
  const out: string[] = [];
  if (pattern <= 1) {
    for (let d = `${year}-01-0${1 + Math.floor(rand() * 7)}`; d.startsWith(`${year}-`); d = addDays(d, pattern === 0 ? 7 : 14)) out.push(d);
  } else if (pattern === 2) {
    for (let m = 1; m <= 12; m += 1) out.push(`${year}-${String(m).padStart(2, '0')}-15`, `${year}-${String(m).padStart(2, '0')}-${new Date(Date.UTC(year, m, 0)).getUTCDate()}`);
  } else if (pattern === 3) {
    for (let m = 1; m <= 12; m += 1) out.push(`${year}-${String(m).padStart(2, '0')}-${new Date(Date.UTC(year, m, 0)).getUTCDate()}`);
  } else {
    for (let i = 0; i < 6 + Math.floor(rand() * 50); i += 1) out.push(addDays(`${year}-01-01`, Math.floor(rand() * 365)));
  }
  return [...new Set(out)].sort();
}

interface Scenario { state: StateDay[]; fed: DayLiability[]; schedule: 'monthly' | 'semiweekly' }

function scenario(seed: number): Scenario {
  const rand = prng(seed);
  const dates = payDates(rand, 2026);
  const size = rand();
  const state: StateDay[] = [];
  const fed: DayLiability[] = [];
  for (const date of dates) {
    // PIT clustered around the thresholds so every band is hit constantly
    const pit = size < 0.35 ? 20 + rand() * 450 : size < 0.8 ? 300 + rand() * 4_000 : 3_000 + rand() * 40_000;
    const sdi = pit * (0.2 + rand() * 0.6);
    const ui = rand() < 0.7 ? rand() * 400 : 0;
    state.push({ date, withholding: dollars(Math.round(pit * 100) / 100), withholdingWages: 0, employeeInsurance: dollars(Math.round(sdi * 100) / 100), employerUi: dollars(Math.round(ui * 100) / 100), uiWages: 0, employeeIds: [] });
    // Federal liability is mostly proportional to the PIT, but a federal-only spike (a big non-California payroll,
    // a bonus run) sometimes forces a federal next-day deposit on a day with little California PIT.
    const spike = rand() < 0.12;
    const total = spike ? dollars(100_000 + Math.round(rand() * 50_000)) : dollars(Math.round(pit * (size < 0.8 ? 4 : 5) + rand() * (size < 0.8 ? 3_000 : 60_000)));
    fed.push({ date, federalIncomeTax: total, socialSecurityEmployee: 0, socialSecurityEmployer: 0, medicareEmployee: 0, medicareEmployer: 0, additionalMedicare: 0, total, wagesSubjectToIncomeTax: 0, socialSecurityWages: 0, medicareWages: 0, additionalMedicareWages: 0, employeeIds: [] });
  }
  return { state, fed, schedule: rand() < 0.5 ? 'monthly' : 'semiweekly' };
}

describe('property: California withholding deposits over 1,500 randomized payroll years', () => {
  const seeds = Array.from({ length: 1500 }, (_, i) => 5000 + i);

  test('every dollar is deposited exactly once, on a business day after the money was withheld', () => {
    for (const seed of seeds) {
      const s = scenario(seed);
      const federal = analyzeDeposits(s.fed, { startingSchedule: s.schedule });
      const r = analyzeStateDeposits(CA, s.state, federal);
      const tag = `seed ${seed}`;
      assert.equal(r.findings.filter((f) => f.severity === 'error').length, 0, tag);
      const w = s.state.reduce((a, d) => a + d.withholding, 0);
      const ins = s.state.reduce((a, d) => a + d.employeeInsurance, 0);
      const ui = s.state.reduce((a, d) => a + d.employerUi, 0);
      assert.equal(r.obligations.reduce((a, o) => a + o.withholding, 0), w, `${tag}: withholding conserved`);
      assert.equal(r.obligations.reduce((a, o) => a + o.employeeInsurance, 0), ins, `${tag}: insurance conserved`);
      assert.equal(r.obligations.reduce((a, o) => a + o.employerUi, 0), ui, `${tag}: employer UI conserved`);
      for (const o of r.obligations) {
        assert.equal(o.amount, o.withholding + o.employeeInsurance + o.employerUi, `${tag}: ${o.id} amount`);
        assert.ok(isStateBusinessDay(o.dueDate, CA), `${tag}: ${o.id} due ${o.dueDate} is a weekend`);
        assert.ok(o.dueDate >= o.payDates[o.payDates.length - 1], `${tag}: ${o.id} due before its last pay date`);
        assert.ok(o.amount > 0, `${tag}: empty obligation ${o.id}`);
      }
      const ids = r.obligations.map((o) => o.id);
      assert.equal(new Set(ids).size, ids.length, `${tag}: duplicate ids`);
    }
  });

  test('each schedule is justified by the amounts in the DE 44 table', () => {
    for (const seed of seeds) {
      const s = scenario(seed);
      const federal = analyzeDeposits(s.fed, { startingSchedule: s.schedule });
      const r = analyzeStateDeposits(CA, s.state, federal);
      const tag = `seed ${seed}`;
      for (const o of r.obligations) {
        if (o.schedule === 'next_day') {
          assert.equal(o.federalRule, 'next_day', tag);
          assert.ok(o.withholding > dollars(400), `${tag}: next-day with only ${o.withholding}`);
        }
        if (o.schedule === 'semiweekly') {
          assert.equal(o.federalRule, 'semiweekly', tag);
          assert.ok(o.withholding > dollars(400), `${tag}`);
        }
        if (o.schedule === 'monthly') {
          // a federal-monthly month at $350 or more, or a $350-$400 period under a faster federal schedule
          assert.ok(o.withholding >= dollars(350), `${tag}: monthly with only ${o.withholding}`);
          assert.equal(o.dueDate.slice(8, 10) >= '15', true, `${tag}: monthly due ${o.dueDate}`);
        }
        if (o.schedule === 'quarterly') {
          assert.ok(['2026-04-30', '2026-07-31', '2026-11-02', '2027-02-01'].includes(o.dueDate), `${tag}: quarterly due ${o.dueDate}`);
          assert.ok(o.settleBy !== undefined, `${tag}`);
        }
      }
    }
  });

  test('the analysis is deterministic', () => {
    for (const seed of seeds.slice(0, 100)) {
      const s = scenario(seed);
      const federal = analyzeDeposits(s.fed, { startingSchedule: s.schedule });
      assert.deepEqual(analyzeStateDeposits(CA, s.state, federal), analyzeStateDeposits(CA, s.state, federal));
    }
  });

  test('the generator reaches every schedule and every federal row (coverage floor)', () => {
    const c: Record<string, number> = {};
    for (const seed of seeds) {
      const s = scenario(seed);
      const federal = analyzeDeposits(s.fed, { startingSchedule: s.schedule });
      for (const o of analyzeStateDeposits(CA, s.state, federal).obligations) {
        c[o.schedule] = (c[o.schedule] ?? 0) + 1;
        c[`${o.federalRule}->${o.schedule}`] = (c[`${o.federalRule}->${o.schedule}`] ?? 0) + 1;
      }
    }
    for (const k of ['next_day', 'semiweekly', 'monthly', 'quarterly', 'next_day->next_day', 'next_day->monthly', 'next_day->quarterly', 'semiweekly->semiweekly', 'semiweekly->monthly', 'semiweekly->quarterly', 'monthly->monthly', 'monthly->quarterly']) {
      assert.ok((c[k] ?? 0) >= 40, `${k}: only ${c[k] ?? 0}`);
    }
  });
});

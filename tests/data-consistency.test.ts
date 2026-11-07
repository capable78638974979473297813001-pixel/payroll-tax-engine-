import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

import { minimumWage } from '../src/minimum-wage.ts';

/**
 * Invariants that hold across the whole data set, so a figure that is updated in one field but not
 * in its twin (a rate and its cents, a rate and its tipped cash wage, the research block and the
 * normalized block) fails here instead of reaching a paycheck.
 */

const root = new URL('../data/', import.meta.url);
const jsonFiles = (dir: string): string[] =>
  readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? jsonFiles(`${dir}${e.name}/`) : e.name.endsWith('.json') ? [`${dir}${e.name}`] : [],
  );
const read = (p: string) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function walk(o: unknown, path: string, visit: (o: Record<string, unknown>, path: string) => void): void {
  if (Array.isArray(o)) o.forEach((v, i) => walk(v, `${path}[${i}]`, visit));
  else if (o && typeof o === 'object') {
    visit(o as Record<string, unknown>, path);
    for (const [k, v] of Object.entries(o)) walk(v, `${path}/${k}`, visit);
  }
}

describe('dollar fields agree with their cents twins in every data file', () => {
  for (const f of jsonFiles('')) {
    test(f, () => {
      const bad: string[] = [];
      walk(read(f), '', (o, path) => {
        for (const [k, v] of Object.entries(o)) {
          if (!k.endsWith('Cents') || !num(v)) continue;
          const base = o[k.slice(0, -5)];
          // South Dakota's $5.925 tipped wage is the one documented half-cent figure.
          if (num(base) && Math.abs(Math.round(base * 100) - v) > 1e-6 && Math.abs(base * 100 - v) > 1e-6) bad.push(`${path}: ${k.slice(0, -5)}=${base} ${k}=${v}`);
        }
      });
      assert.deepEqual(bad, []);
    });
  }
});

describe('minimum-wage tip fields are consistent', () => {
  const files = jsonFiles('minimum-wage/').filter((f) => /\/(states|local)\//.test(f));
  for (const f of files) {
    test(f, () => {
      const d = read(f);
      const items: Array<[string, { hourly?: number } | undefined, any]> = f.includes('/states/')
        ? [['state', d.standard, d.tipped]]
        : (d.jurisdictions ?? []).map((j: any) => [j.id, j, j.tipped]);
      for (const [id, rate, t] of items) {
        if (!t || !num(rate?.hourly)) continue;
        if (t.tipCreditAllowed === false) {
          assert.ok(Math.abs(t.cashWage - rate.hourly) < 0.0051, `${f} ${id}: no tip credit but cash wage ${t.cashWage} != rate ${rate.hourly}`);
        } else if (num(t.cashWage) && num(t.maxTipCredit)) {
          assert.ok(Math.abs(t.cashWage + t.maxTipCredit - rate.hourly) < 0.0051, `${f} ${id}: cash wage ${t.cashWage} + credit ${t.maxTipCredit} != rate ${rate.hourly}`);
        }
      }
    });
  }

  test('a tipped answer never exceeds the standard answer, in any 2026 or 2027 local jurisdiction, for any employer size', () => {
    const bad: string[] = [];
    for (const f of jsonFiles('minimum-wage/local/')) {
      const st = f.split('/').pop()!.slice(0, 2);
      const year = f.includes('2027') ? '2027' : '2026';
      for (const j of read(f).jurisdictions) {
        for (const date of [`${year}-01-01`, `${year}-07-01`, `${year}-12-31`]) {
          for (const employeeCount of [undefined, 3, 12, 30, 150, 600]) {
            const a = minimumWage({ checkDate: date, state: st, locality: j.id, employeeCount });
            const b = minimumWage({ checkDate: date, state: st, locality: j.id, employeeCount, tipped: true });
            if (b.cents > a.cents) bad.push(`${st} ${j.id} ${date} n=${employeeCount}: tipped ${b.cents} > standard ${a.cents}`);
          }
        }
      }
    }
    assert.deepEqual(bad, []);
  });
});

describe('state files: the research block and the normalized unemployment block agree', () => {
  for (const f of jsonFiles('states/').filter((n) => /-20\d\d\.json$/.test(n))) {
    test(f, () => {
      const d = read(f);
      const ui = d.unemploymentInsurance ?? {};
      const sui = d.suiEmployer ?? {};
      for (const k of ['wageBase', 'newEmployerRate']) {
        if (num(ui[k]) && num(sui[k])) assert.equal(ui[k], sui[k], `${f}: unemploymentInsurance.${k} != suiEmployer.${k}`);
      }
      const year = Number(f.match(/-(\d{4})\.json$/)![1]);
      assert.equal(d.year, year, `${f}: year field`);
    });
  }
});

describe('new-employer rates against the Department of Labor January 2026 table', () => {
  // DOL, Significant Provisions of State UI Laws, January 2026: the new-employer BASE rate.
  const dol: Record<string, number> = { CO: 0.0153, ME: 0.0223, WI: 0.025, ND: 0.01, PA: 0.03822, TN: 0.027, VT: 0.01, KS: 0.0175, MI: 0.027, MA: 0.0242, NV: 0.0295, NJ: 0.028 };
  for (const [st, base] of Object.entries(dol)) {
    test(`${st}: the rate carried is at least DOL's base ${base}`, () => {
      const rate = read(`states/${st}-2026.json`).suiEmployer.newEmployerRate as number;
      assert.ok(rate >= base - 1e-9, `${st} carries ${rate}, below DOL's base rate ${base}`);
    });
  }
  test("Colorado and Wisconsin are confirmed from the states' own pages (read 2026-11-07)", () => {
    // CDLE Introductory Rates: non-construction 2026 0.0153 + 0.0017 + 0.0135 = 0.0305; 2027 0.0153 + 0.0017 + 0 = 0.0170.
    assert.equal(read('states/CO-2026.json').suiEmployer.newEmployerRate, 0.0305);
    assert.equal(read('states/CO-2027.json').suiEmployer.newEmployerRate, 0.017);
    assert.equal(read('states/CO-2026.json').suiEmployer.wageBase, 30600);
    assert.equal(read('states/CO-2027.json').suiEmployer.wageBase, 32100);
    // DWD: new employer, payroll under $500,000, all others: 3.05% in 2026 and 2027; wage base $14,000.
    for (const y of [2026, 2027]) {
      assert.equal(read(`states/WI-${y}.json`).suiEmployer.newEmployerRate, 0.0305);
      assert.equal(read(`states/WI-${y}.json`).suiEmployer.wageBase, 14000);
    }
    assert.equal(read('states/CO-2026.json').suiEmployer.confidence, 'primary_source_confirmed');
    assert.equal(read('states/WI-2026.json').suiEmployer.confidence, 'primary_source_confirmed');
  });
  test('Maine carries a secondary all-in figure above the DOL base and says it is unconfirmed', () => {
    const s = read('states/ME-2026.json').suiEmployer;
    assert.ok(s.newEmployerRate > dol.ME);
    assert.match(s.newEmployerRateSource, /January2026\.pdf/);
    assert.match(s.newEmployerRateSource, /Treat as an estimate/);
    assert.match(s.newEmployerRateSource, /stays unconfirmed/);
  });
});

describe('Ohio school district identifiers (Finder feed, 2026-11-07)', () => {
  test('James A. Garfield LSD (district 6704) carries its own IRN 49205, not Rootstown LSD\'s 49213, in every year', () => {
    for (const y of [2025, 2026, 2027]) {
      const d = read(`local/OH-school-districts-${y}.json`).districts.find((x: { sdNumber: string }) => x.sdNumber === '6704');
      assert.equal(d.irn, '49205', String(y));
    }
  });
  test('no two Ohio school districts share an IRN', () => {
    const irns = read('local/OH-school-districts-2026.json').districts.map((x: { irn: string }) => x.irn);
    assert.equal(new Set(irns).size, irns.length);
  });
});

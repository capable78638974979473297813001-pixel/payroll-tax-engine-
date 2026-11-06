import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

import { loadProfile, modelledStates, resolveDue } from '../payroll/state/index.ts';

/**
 * Unemployment-insurance sections of the state profiles. Each wage base was read from the agency, and is
 * cross-checked here against the paycheck engine's own, separately researched wage base for 2026: two
 * independent sources have to agree.
 */

const ENGINE_HAS_NO_DATA = new Set(['PR', 'VI']);
const WITH_UI = modelledStates().filter((s) => loadProfile(s).ui);

describe('every state profile with an unemployment section', () => {
  test('there are some, and the wage base agrees with the engine\'s own 2026 figure', () => {
    assert.ok(WITH_UI.length >= 5, WITH_UI.join(','));
    for (const st of WITH_UI) {
      const ui = loadProfile(st).ui!;
      const file = `data/states/${st}-${ui.wageBaseYear}.json`;
      // Puerto Rico and the Virgin Islands: the paycheck engine has no tax data for them, so there is nothing to compare with.
      if (ENGINE_HAS_NO_DATA.has(st)) { assert.ok(!existsSync(file), `${st} now has engine data: compare it`); continue; }
      assert.ok(existsSync(file), `${st}: no engine data file ${file}`);
      const engine = JSON.parse(readFileSync(file, 'utf8')).suiEmployer?.wageBase;
      if (typeof engine === 'number') assert.equal(ui.wageBase, Math.round(engine * 100), `${st}: profile ${ui.wageBase} vs engine ${engine * 100}`);
    }
  });

  test('the employer tax line id is the engine\'s own', () => {
    for (const st of WITH_UI) assert.equal(loadProfile(st).ui!.employerTaxLineId, `${st}_SUI_ER`);
  });

  test('every quarterly report names what it must contain and rolls weekends forward', () => {
    for (const st of WITH_UI) {
      for (const r of loadProfile(st).ui!.returns) {
        assert.ok(r.contents.length > 0, `${st} ${r.id}`);
        if (r.frequency === 'quarterly' && r.due.kind !== 'table') {
          const d = resolveDue(r.due, '2026-09-15', loadProfile(st)).dueDate;
          assert.ok(new Date(`${d}T00:00:00Z`).getUTCDay() % 6 !== 0, `${st} ${r.id}: ${d} is a weekend`);
        }
      }
    }
  });
});

describe('Florida (Reemployment Tax return and payment page)', () => {
  const FL = loadProfile('FL');
  test('RT-6: April 30, July 31, October 31 (Saturday -> Monday Nov 2), January 31 (Sunday -> Monday)', () => {
    const r = FL.ui!.returns[0];
    const due = (d: string) => resolveDue(r.due, d, FL).dueDate;
    assert.deepEqual(['2026-02-10', '2026-05-10', '2026-08-10', '2026-11-10'].map(due), ['2026-04-30', '2026-07-31', '2026-11-02', '2027-02-01']);
  });
  test('$7,000 wage base and no wage withholding', () => {
    assert.equal(FL.ui!.wageBase, 700000);
    assert.equal(FL.withholding!.applies, false);
  });
});

describe('Nevada, New Hampshire and Tennessee (read from the states\' regulations)', () => {
  const due = (st: string, d: string) => { const p = loadProfile(st); return resolveDue(p.ui!.returns[0].due, d, p).dueDate; };
  test('quarterly reports: the last day of the month following the quarter, rolled past weekends', () => {
    for (const st of ['NV', 'NH', 'TN']) {
      assert.deepEqual(['2026-02-10', '2026-05-10', '2026-08-10', '2026-11-10'].map((d) => due(st, d)), ['2026-04-30', '2026-07-31', '2026-11-02', '2027-02-01'], st);
    }
  });
  test('wage bases: Nevada $43,700, New Hampshire $14,000, Tennessee $7,000 (U.S. Department of Labor, January 2026)', () => {
    assert.deepEqual(['NV', 'NH', 'TN'].map((s) => loadProfile(s).ui!.wageBase), [4370000, 1400000, 700000]);
  });
  test('Nevada requires electronic filing with a waiver of at most one year (NAC 612.035)', () => {
    assert.match(loadProfile('NV').mandates.efile!.text, /waiver of not more than 1 year/);
  });
});

describe('unemployment sections added for the withholding states (batch 8)', () => {
  const BATCH = ['AL', 'AR', 'AZ', 'CO', 'CT', 'DC', 'DE', 'GA', 'HI', 'IA', 'ID', 'IL', 'IN', 'KY', 'LA', 'MA', 'MD', 'ME', 'MI', 'MN', 'MO', 'MS', 'MT', 'NC', 'ND', 'NE', 'NJ', 'NM', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'UT', 'VA', 'VT', 'WI', 'WV'];
  const ANCHORS = ['2026-02-10', '2026-05-10', '2026-08-10', '2026-11-10'];
  const dates = (st: string) => { const p = loadProfile(st); return ANCHORS.map((d) => resolveDue(p.ui!.returns[0].due, d, p).dueDate); };

  test('every one has an unemployment section, one quarterly return, and Kansas, whose contributing-employer due date could not be read, has none', () => {
    for (const st of BATCH) {
      const ui = loadProfile(st).ui;
      assert.ok(ui, st);
      assert.equal(ui!.returns.length, 1, st);
      assert.equal(ui!.returns[0].frequency, 'quarterly', st);
    }
    assert.equal(loadProfile('KS').ui, undefined);
    assert.match(loadProfile('KS').notModelled.join(' '), /Unemployment: NOT MODELLED/);
  });

  test('the last day of the month after the quarter, rolled past weekends (Oct 31, 2026 is a Saturday; Jan 31, 2027 a Sunday)', () => {
    const special = new Set(['NJ', 'MI']);
    for (const st of BATCH.filter((s) => !special.has(s))) assert.deepEqual(dates(st), ['2026-04-30', '2026-07-31', '2026-11-02', '2027-02-01'], st);
  });

  test('New Jersey: the 30th, and the Department says a weekend or holiday gives no extension', () => {
    assert.deepEqual(dates('NJ'), ['2026-04-30', '2026-07-30', '2026-10-30', '2027-01-30']); // Jan 30, 2027 is a Saturday: not rolled
  });

  test('Michigan: the 25th (April 25 and July 25, 2026 are Saturdays, October 25 a Sunday)', () => {
    assert.deepEqual(dates('MI'), ['2026-04-27', '2026-07-27', '2026-10-26', '2027-01-25']);
  });

  test('wage bases agree with the U.S. Department of Labor compilation of January 2026', () => {
    const DOL: Record<string, number> = { AL: 8000, AR: 7000, AZ: 8000, MA: 15000, CO: 30600, CT: 27000, DE: 14500, DC: 9000, GA: 9500, HI: 64500, ID: 58300, IL: 14250, IN: 9500, IA: 20400, KY: 12000, LA: 7000, ME: 12000, MD: 8500, MN: 44000, MS: 14000, MO: 9000, MT: 47300, NJ: 44800, NM: 34800, NC: 34200, ND: 46600, OH: 9000, OK: 25000, OR: 56700, PA: 10000, RI: 30800, SC: 14000, UT: 50700, VA: 8000, VT: 15400, WI: 14000, WV: 9500 };
    for (const [st, dollarsBase] of Object.entries(DOL)) assert.equal(loadProfile(st).ui!.wageBase, dollarsBase * 100, st);
  });

  test('each return cites the agency source, and the wage base cites the federal compilation', () => {
    for (const st of BATCH) {
      const p = loadProfile(st);
      const ids = p.sources.map((s) => s.id);
      assert.ok(ids.includes('U1') && ids.includes('U2'), st);
      assert.equal(p.ui!.returns[0].source, 'U1', st);
      assert.equal(p.agencies.ui?.source, 'U1', st);
      assert.ok(p.sources.some((s) => /Significant Provisions of State Unemployment Insurance Laws/.test(s.title)), st);
    }
  });

  test('every unread item is recorded, never filled in', () => {
    for (const st of BATCH) assert.ok(loadProfile(st).ui!.notModelled.length >= 2, st);
  });
});

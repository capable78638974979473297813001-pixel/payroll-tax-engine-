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

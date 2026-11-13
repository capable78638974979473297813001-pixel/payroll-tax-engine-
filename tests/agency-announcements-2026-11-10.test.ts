import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const json = (p: string) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));

describe('agency announcements read on 2026-11-10', () => {
  test('South Carolina 2027: $14,000 wage base and 1.06% new-employer rate (DEW 2027 table, class 30)', () => {
    const sc = json('data/states/SC-2027.json');
    assert.equal(sc.suiEmployer.wageBase, 14000);
    assert.equal(sc.suiEmployer.newEmployerRate, 0.0106);
  });

  test('Connecticut Paid Leave stays at 0.5% for 2027 (CT Paid Leave Board vote)', () => {
    assert.equal(json('data/states/CT-2027.json').statePaidLeaveEmployee.rate, 0.005);
  });

  test('Oakwood (Paulding) is CCA at 1.00% and Oakwood (Cuyahoga) is RITA at 2.5% in every year file; the Montgomery Oakwood is city-collected', () => {
    for (const y of [2025, 2026, 2027]) {
      const rows = json(`data/local/OH-municipalities-${y}.json`).municipalities as { name: string; rate: number; administeredBy: string }[];
      const by = (n: string) => rows.find((r) => r.name === n)!;
      assert.equal(by('Oakwood (Paulding)').administeredBy, 'CCA');
      assert.equal(by('Oakwood (Paulding)').rate, 0.01);
      assert.equal(by('Oakwood (Cuyahoga)').administeredBy, 'RITA'); // RITA's own member page, read 2026-11-10
      assert.equal(by('Oakwood (Cuyahoga)').rate, 0.025);
      assert.equal(by('Waynesfield').administeredBy, 'RITA');
      assert.equal(by('Oakwood (Montgomery)').administeredBy, 'self_or_other'); // the city's own site, read 2026-11-12
    }
  });

  test('Alabama: only Bear Creek, Brilliant and Lynn rest on the League survey alone, in every year file, and 2025 and 2027 carry the same rates and sources as 2026', () => {
    type M = { name: string; rate: number; confirmation?: { tier: string } };
    const file = (y: number) => (json(`data/local/AL-municipalities-${y}.json`).municipalities as M[]);
    for (const y of [2025, 2026, 2027]) {
      const only = file(y).filter((m) => m.confirmation?.tier === 'league_survey_only').map((m) => m.name).sort();
      assert.deepEqual(only, ['Bear Creek', 'Brilliant', 'Lynn'], String(y));
    }
    const base = new Map(file(2026).map((m) => [m.name, m]));
    for (const y of [2025, 2027]) {
      for (const m of file(y)) {
        const b = base.get(m.name)!;
        assert.equal(m.rate, b.rate, `${y} ${m.name} rate`);
        assert.deepEqual(m.confirmation, b.confirmation, `${y} ${m.name} confirmation`);
      }
    }
  });
});

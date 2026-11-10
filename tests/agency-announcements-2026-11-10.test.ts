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

  test('Oakwood (Paulding) is CCA at 1.00% and Oakwood (Cuyahoga) is RITA at 2.5% in every year file; the Montgomery Oakwood stays unresolved', () => {
    for (const y of [2025, 2026, 2027]) {
      const rows = json(`data/local/OH-municipalities-${y}.json`).municipalities as { name: string; rate: number; administeredBy: string }[];
      const by = (n: string) => rows.find((r) => r.name === n)!;
      assert.equal(by('Oakwood (Paulding)').administeredBy, 'CCA');
      assert.equal(by('Oakwood (Paulding)').rate, 0.01);
      assert.equal(by('Oakwood (Cuyahoga)').administeredBy, 'RITA'); // RITA's own member page, read 2026-11-10
      assert.equal(by('Oakwood (Cuyahoga)').rate, 0.025);
      assert.equal(by('Waynesfield').administeredBy, 'RITA');
      assert.equal(by('Oakwood (Montgomery)').administeredBy, 'unknown_ambiguous_name');
    }
  });
});

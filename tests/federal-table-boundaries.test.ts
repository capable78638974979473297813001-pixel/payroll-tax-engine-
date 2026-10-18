import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Pub 15-T prints the Step-2-checkbox Single/MFS bracket edges as whole
 * dollars ($108,938 and $136,163), not the half-dollar halves of the MFJ
 * edges. The 2026 file once carried 108937.5 / 136162.5, which put a
 * paycheck whose annualised wage landed on those dollars in the wrong row.
 */
const federal = (year: number) => JSON.parse(readFileSync(new URL(`../data/federal/${year}.json`, import.meta.url), 'utf8'));
const south = JSON.parse(readFileSync(new URL('../data/states/SC-2026.json', import.meta.url), 'utf8'));
const scope = JSON.parse(readFileSync(new URL('../watcher/scope.json', import.meta.url), 'utf8'));

describe('federal checkbox single schedule edges', () => {
  for (const year of [2026, 2027]) {
    test(`${year}: whole-dollar edges, contiguous rows`, () => {
      const rows = federal(year).incomeTax.multipleJobsSchedules.single;
      const edges = rows.flatMap((r: { from: number; to: number | null }) => [r.from, r.to]);
      assert.ok(edges.includes(108938) && edges.includes(136163));
      assert.ok(!edges.includes(108937.5) && !edges.includes(136162.5));
      for (let i = 1; i < rows.length; i++) assert.equal(rows[i].from, rows[i - 1].to);
    });
  }
});

describe('South Carolina Act 110 is documented and watched', () => {
  test('IL26-20 is a cited source and the withholding gap is recorded', () => {
    assert.ok(south.sources.some((s: { url: string }) => s.url.endsWith('/IL26-20.pdf')));
    assert.ok(south.knownGaps.some((g: string) => g.includes('ACT 110')));
  });
  test('SC is kept in the watcher scope', () => {
    assert.ok(scope.keep.SC);
    assert.equal(scope.excluded.SC, undefined);
  });
});

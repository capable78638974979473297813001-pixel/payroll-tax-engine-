import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { coverage, searchLocal } from '../site/lib/coverage.ts';

/** The coverage page is computed from the data files, so it cannot claim what the build lacks. */
const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const json = (p: string) => JSON.parse(readFileSync(join(DATA, p), 'utf8'));

describe('coverage index', () => {
  const cov = coverage();

  test('every state and DC with a ruleset is listed once', () => {
    const files = readdirSync(join(DATA, 'states')).filter((f) => f.endsWith(`-${cov.year}.json`));
    assert.equal(cov.states.length, files.length);
    assert.equal(new Set(cov.states.map((s) => s.code)).size, cov.states.length);
    assert.ok(cov.states.some((s) => s.code === 'DC'));
    assert.equal(cov.states.length, 51);
  });

  test('local counts equal the rows in the data files', () => {
    const byState = cov.summary.localByState;
    assert.equal(json(`local/IN-counties-${cov.year}.json`).counties.length, byState.IN);
    assert.equal(json(`local/PA-EIT-LST-${cov.year}.json`).jurisdictions.length, byState.PA);
    const oh = json(`local/OH-municipalities-${cov.year}.json`).municipalities.length
      + json(`local/OH-school-districts-${cov.year}.json`).districts.length
      + json(`local/OH-jedd-jedz-${cov.year}.json`).zones.length;
    assert.equal(byState.OH, oh);
    assert.equal(json(`local/MI-cities-${cov.year}.json`).cities.length, byState.MI);
    assert.equal(cov.summary.localJurisdictions, Object.values(byState).reduce((a, b) => a + b, 0));
  });

  test('states with no income tax on wages say so', () => {
    for (const code of ['TX', 'FL', 'WA', 'NV']) assert.equal(cov.states.find((s) => s.code === code)!.incomeTax, 'none', code);
    assert.equal(cov.states.find((s) => s.code === 'OH')!.incomeTax, 'withholding');
  });

  test('a state whose data says its local list is partial is marked partial, not complete', () => {
    for (const code of ['AL', 'WV']) assert.equal(cov.states.find((s) => s.code === code)!.localStatus, 'partial', code);
    assert.equal(cov.states.find((s) => s.code === 'CO')!.localStatus, 'listed');
    assert.equal(cov.states.find((s) => s.code === 'PA')!.localStatus, 'listed');
    assert.equal(cov.states.find((s) => s.code === 'TX')!.localStatus, 'none');
  });

  test('search finds real counties and pages through a state', () => {
    const marion = searchLocal({ q: 'marion county', state: 'IN' });
    assert.equal(marion.total, 1);
    assert.equal(marion.items[0].name, 'Marion County');
    assert.ok(marion.items[0].rate! > 0.01);
    const kentucky = searchLocal({ state: 'KY', size: 100 });
    assert.equal(kentucky.items.length, 100);
    assert.equal(searchLocal({ state: 'KY', size: 100, page: 2 }).items.length, kentucky.total - 200);
    assert.equal(searchLocal({ q: 'zzzz-not-a-place' }).total, 0);
  });

  test('minimum-wage rows are kept apart from tax rows', () => {
    const tax = searchLocal({ kind: 'tax', size: 1 }).total;
    const wage = searchLocal({ kind: 'wage', size: 1 }).total;
    assert.equal(tax, cov.summary.localJurisdictions);
    assert.equal(wage, cov.summary.localMinimumWage);
    assert.equal(searchLocal({ kind: 'wage', state: 'CA', size: 1 }).total, json('minimum-wage/local/CA-local-2026.json').jurisdictions.length);
  });

  test('flat fees and hourly wages carry their own display value, and expiry notes leave the name', () => {
    const wv = searchLocal({ state: 'WV', kind: 'tax', size: 100 }).items;
    assert.ok(wv.length >= 11 && wv.every((r) => r.rate === null && /^\$\d+\.\d\d\/wk$/.test(r.value ?? '')));
    const ca = searchLocal({ kind: 'wage', state: 'CA', q: 'alameda' }).items[0];
    assert.match(ca.value ?? '', /^\$\d+\.\d\d\/hr$/);
    const oh = searchLocal({ state: 'OH', q: 'expires', size: 100 });
    assert.ok(oh.items.every((r) => !r.name.includes('(') && /expires \d{4}/.test(r.detail)), 'rate notes moved from the name to the detail');
    const triad = searchLocal({ state: 'OH', q: 'triad lsd' }).items[0];
    assert.equal(triad.name, 'Triad LSD');
    assert.match(triad.detail, /Champaign County\. 0\.50% expires 2030; 1\.00% CPT/);
    assert.ok(oh.total > 0);
  });

  test('search matches a state by name and reports which states a search touches', () => {
    const ohio = searchLocal({ q: 'ohio', kind: 'tax', size: 1 });
    assert.ok(ohio.stateCounts.OH >= 1054, 'every Ohio row matches its state name');
    const marion = searchLocal({ q: 'marion', kind: 'tax' });
    assert.deepEqual(Object.keys(marion.stateCounts).sort(), ['IN', 'KY', 'OH', 'PA']);
    assert.equal(Object.values(marion.stateCounts).reduce((a, b) => a + b, 0), marion.total);
    // The state filter narrows the list but not the per-state counts.
    const inOnly = searchLocal({ q: 'marion', state: 'IN', kind: 'tax' });
    assert.equal(inOnly.total, marion.stateCounts.IN);
    assert.deepEqual(inOnly.stateCounts, marion.stateCounts);
  });
});

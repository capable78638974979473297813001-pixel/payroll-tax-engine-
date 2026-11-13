import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (rel: string) => JSON.parse(readFileSync(join(import.meta.dirname, '..', rel), 'utf8'));

// IRS Newsroom IR-2026-136 (2026-11-12) and Vermont DOL's 2027 wage base release, both read directly 2026-11-13.
describe('2027 elective-deferral limits (IRS IR-2026-136)', () => {
  const lim = read('data/federal/2027.json').electiveDeferralLimits;
  test('401(k)/403(b)/457 are $25,500 and SIMPLE is $17,500', () => {
    assert.equal(lim.section402gAggregate, 25500);
    assert.equal(lim.deferral457, 25500);
    assert.equal(lim.simple, 17500);
  });
  test('catch-ups: $8,500 at 50, $11,750 at 60-63; the SIMPLE catch-ups did not move', () => {
    assert.equal(lim.catchUp.age50, 8500);
    assert.equal(lim.catchUp.age60to63, 11750);
    assert.equal(lim.catchUp.simpleAge50, 4000);
    assert.equal(lim.catchUp.simpleAge60to63, 5250);
  });
  test('2026 limits are untouched', () => {
    const l26 = read('data/federal/2026.json').electiveDeferralLimits;
    assert.equal(l26.section402gAggregate, 24500);
    assert.equal(l26.simple, 17000);
    assert.equal(l26.catchUp.age50, 8000);
    assert.equal(l26.catchUp.age60to63, 11250);
  });
  test('each change is recorded in provisional.updatedFor2027', () => {
    const paths = read('data/federal/2027.json').provisional.updatedFor2027.map((x: { path: string }) => x.path);
    for (const p of ['electiveDeferralLimits.section402gAggregate', 'electiveDeferralLimits.deferral457', 'electiveDeferralLimits.simple', 'electiveDeferralLimits.catchUp.age50', 'electiveDeferralLimits.catchUp.age60to63']) {
      assert.ok(paths.includes(p), p);
    }
  });
});

describe('Vermont 2027 unemployment wage base (Vermont DOL)', () => {
  test('2027 is $16,100 and 2026 stays $15,400', () => {
    assert.equal(read('data/states/VT-2027.json').suiEmployer.wageBase, 16100);
    assert.equal(read('data/states/VT-2026.json').suiEmployer.wageBase, 15400);
  });
  test('the change is recorded with its source', () => {
    const u = read('data/states/VT-2027.json').provisional.updatedFor2027[0];
    assert.equal(u.path, 'suiEmployer.wageBase');
    assert.equal(u.from, 15400);
    assert.equal(u.to, 16100);
    assert.match(u.source, /labor\.vermont\.gov/);
  });
});

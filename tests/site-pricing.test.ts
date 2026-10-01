import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CALL_TIERS, costForCalls, marginalRate, estimate } from '../site/lib/pricing.ts';

test('pricing is a flat $0.90 per call at any volume', () => {
  assert.deepEqual(CALL_TIERS, [{ upTo: Infinity, rate: 0.9 }]);
  for (const calls of [1, 25_000, 200_001, 1_000_001, 5_000_000]) {
    assert.equal(marginalRate(calls), 0.9);
    assert.ok(Math.abs(costForCalls(calls) - calls * 0.9) < 1e-6, `${calls} calls`);
  }
});

test('estimate: 400 employees biweekly is 10,400 calls at $0.90', () => {
  const e = estimate({ employees: 400, payFrequency: 'biweekly', rooftop: false });
  assert.equal(e.callsPerYear, 10_400);
  assert.equal(e.total, 9360);
  assert.equal(e.effectivePerCall, 0.9);
});

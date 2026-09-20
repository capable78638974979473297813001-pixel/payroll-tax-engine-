import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { RateLimiter } from '../site/lib/ratelimit.ts';

describe('RateLimiter (fixed window per key)', () => {
  test('allows up to the limit, then blocks, with correct remaining counts', () => {
    const rl = new RateLimiter({ limit: 3, windowMs: 60_000 });
    const t0 = 1_000_000;
    assert.deepEqual(pick(rl.hit('k', t0)), { allowed: true, remaining: 2 });
    assert.deepEqual(pick(rl.hit('k', t0 + 1)), { allowed: true, remaining: 1 });
    assert.deepEqual(pick(rl.hit('k', t0 + 2)), { allowed: true, remaining: 0 });
    const blocked = rl.hit('k', t0 + 3);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 0);
    assert.ok(blocked.retryAfterSec > 0 && blocked.retryAfterSec <= 60);
  });

  test('keys are independent', () => {
    const rl = new RateLimiter({ limit: 1, windowMs: 60_000 });
    assert.equal(rl.hit('a', 0).allowed, true);
    assert.equal(rl.hit('a', 1).allowed, false);
    assert.equal(rl.hit('b', 1).allowed, true); // different key, own budget
  });

  test('the window resets after windowMs', () => {
    const rl = new RateLimiter({ limit: 2, windowMs: 60_000 });
    assert.equal(rl.hit('k', 0).allowed, true);
    assert.equal(rl.hit('k', 10).allowed, true);
    assert.equal(rl.hit('k', 20).allowed, false); // exhausted
    assert.equal(rl.hit('k', 60_001).allowed, true); // new window
    assert.equal(rl.hit('k', 60_002).remaining, 0);
  });

  test('reset() clears all state', () => {
    const rl = new RateLimiter({ limit: 1, windowMs: 60_000 });
    rl.hit('k', 0);
    assert.equal(rl.hit('k', 1).allowed, false);
    rl.reset();
    assert.equal(rl.hit('k', 2).allowed, true);
  });
});

function pick(r: { allowed: boolean; remaining: number }) {
  return { allowed: r.allowed, remaining: r.remaining };
}

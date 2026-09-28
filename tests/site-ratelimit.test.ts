import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { hitStoredLimit, type DB } from '../site/lib/store.ts';

/**
 * The site's rate limits (signup, sign-in, code guesses and per-key
 * /api/paycheck) are fixed windows kept in the store, so they survive a
 * restart and are shared by every instance on the same volume. These pin
 * the window arithmetic on a plain in-memory DB object.
 */

const emptyDb = (): DB => ({
  accounts: {}, acceptances: [], paymentMethods: {}, subscriptions: {}, keys: {},
  usage: [], estimates: [], termsQuotes: {}, meterQueue: [], rateLimits: {},
});

describe('hitStoredLimit (fixed window per key, kept in the store)', () => {
  test('allows up to the limit, then blocks, with correct remaining counts', () => {
    const db = emptyDb();
    const t0 = 1_000_000;
    assert.deepEqual(pick(hitStoredLimit(db, 'k', 3, 60_000, t0)), { allowed: true, remaining: 2 });
    assert.deepEqual(pick(hitStoredLimit(db, 'k', 3, 60_000, t0 + 1)), { allowed: true, remaining: 1 });
    assert.deepEqual(pick(hitStoredLimit(db, 'k', 3, 60_000, t0 + 2)), { allowed: true, remaining: 0 });
    const blocked = hitStoredLimit(db, 'k', 3, 60_000, t0 + 3);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 0);
    assert.equal(blocked.limit, 3);
    assert.ok(blocked.retryAfterSec > 0 && blocked.retryAfterSec <= 60);
    assert.equal(blocked.resetAt, Math.ceil((t0 + 60_000) / 1000));
  });

  test('keys are independent', () => {
    const db = emptyDb();
    assert.equal(hitStoredLimit(db, 'a', 1, 60_000, 0).allowed, true);
    assert.equal(hitStoredLimit(db, 'a', 1, 60_000, 1).allowed, false);
    assert.equal(hitStoredLimit(db, 'b', 1, 60_000, 1).allowed, true);
  });

  test('the window resets after windowMs, and elapsed windows are swept', () => {
    const db = emptyDb();
    assert.equal(hitStoredLimit(db, 'k', 2, 60_000, 0).allowed, true);
    assert.equal(hitStoredLimit(db, 'k', 2, 60_000, 10).allowed, true);
    assert.equal(hitStoredLimit(db, 'k', 2, 60_000, 20).allowed, false);
    hitStoredLimit(db, 'other', 5, 1_000, 30);
    assert.equal(hitStoredLimit(db, 'k', 2, 60_000, 60_001).allowed, true); // new window
    assert.equal(db.rateLimits.other, undefined); // swept
    assert.equal(hitStoredLimit(db, 'k', 2, 60_000, 60_002).remaining, 0);
  });

  test('state lives in the store object, so a fresh process sees it', () => {
    const db = emptyDb();
    hitStoredLimit(db, 'k', 1, 60_000, 0);
    const reloaded = JSON.parse(JSON.stringify(db)) as DB; // what the next load() returns
    assert.equal(hitStoredLimit(reloaded, 'k', 1, 60_000, 1).allowed, false);
  });
});

function pick(r: { allowed: boolean; remaining: number }) {
  return { allowed: r.allowed, remaining: r.remaining };
}

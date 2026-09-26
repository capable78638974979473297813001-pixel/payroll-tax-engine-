import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  graduatedRateCents,
  listApiKeys,
  mintApiKey,
  publicApiKey,
  recordUsage,
  revokeApiKey,
  settleBalance,
  usageForKey,
  verifyApiKey,
} from '../api/keys.ts';

let dir: string;
before(() => {
  dir = mkdtempSync(join(tmpdir(), 'api-keys-'));
  process.env.API_DB_DIR = dir;
});
after(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('API keys + metering (api/keys.ts)', () => {
  test('a minted key is usable, prefixed, and stored only as a hash', () => {
    const { key, record } = mintApiKey('Acme Payroll', { plan: 'pro' });
    assert.match(key, /^sk_live_[A-Za-z0-9_-]{20,}$/);
    assert.equal(record.plan, 'pro');
    assert.equal(record.pricePerCallCents, 12); // pro plan default: the published first-tier rate ($0.12/call)
    assert.equal(record.calls, 0);
    assert.equal(record.balanceDueCents, 0);
    assert.ok(key.startsWith(record.prefix)); // prefix is a non-secret slice of the key
    // the plaintext must never be recoverable from what's stored
    const full = verifyApiKey(key);
    assert.ok(full);
    assert.notEqual(full!.keyHash, key);
    assert.equal(Object.prototype.hasOwnProperty.call(publicApiKey(full!), 'keyHash'), false);
  });

  test('verification accepts the real key and rejects everything else', () => {
    const { key } = mintApiKey('Verify Co');
    assert.ok(verifyApiKey(key));
    assert.equal(verifyApiKey(key + 'x'), null);
    assert.equal(verifyApiKey('sk_live_not_a_real_key'), null);
    assert.equal(verifyApiKey('garbage'), null);
    assert.equal(verifyApiKey(''), null);
  });

  test('a revoked key stops verifying but is not deleted', () => {
    const { key, record } = mintApiKey('Revoke Co');
    assert.ok(verifyApiKey(key));
    assert.equal(revokeApiKey(record.prefix), true); // revoke by prefix
    assert.equal(verifyApiKey(key), null);
    assert.equal(revokeApiKey('sk_live_nope'), false);
    // still listed, just inactive
    assert.equal(listApiKeys().find((k) => k.id === record.id)?.active, false);
  });

  test('metering counts calls, stamps last-used, and keeps a bounded recent window', () => {
    const { key, record } = mintApiKey('Meter Co');
    const id = verifyApiKey(key)!.id;
    assert.equal(record.calls, 0);
    recordUsage(id, { stateCode: 'OH', statusCode: 200 });
    recordUsage(id, { stateCode: 'TX', statusCode: 200 });
    recordUsage(id, { stateCode: 'CA', statusCode: 422, error: 'bad input' });
    const u = usageForKey(id)!;
    assert.equal(u.calls, 3);
    assert.ok(u.lastUsedAt);
    assert.equal(u.recent[0].stateCode, 'CA'); // newest first
    assert.equal(u.recent[0].error, 'bad input');
    // rolling window stays bounded
    for (let i = 0; i < 40; i++) recordUsage(id, { stateCode: 'OH', statusCode: 200 });
    assert.ok(usageForKey(id)!.recent.length <= 25);
    assert.equal(usageForKey(id)!.calls, 43);
  });

  test('each billable call charges the per-call price into the balance; failures do not', () => {
    const { key } = mintApiKey('Bill Co', { pricePerCallCents: 5 }); // 5 cents/call
    const id = verifyApiKey(key)!.id;
    assert.equal(recordUsage(id, { statusCode: 200 }), 5); // returns what it charged
    assert.equal(recordUsage(id, { statusCode: 200 }), 5);
    assert.equal(recordUsage(id, { statusCode: 400, error: 'bad', billable: false }), 0); // not charged
    const u = usageForKey(id)!;
    assert.equal(u.pricePerCallCents, 5);
    assert.equal(u.balanceDueCents, 10); // 2 billable × 5c
    assert.equal(u.lifetimeBilledCents, 10);
    assert.equal(u.recent.find((c) => c.statusCode === 400)!.chargedCents, 0);
  });

  test('settling charges the outstanding balance and resets it, keeping the lifetime total', () => {
    const { key, record } = mintApiKey('Settle Co', { pricePerCallCents: 3 });
    const id = verifyApiKey(key)!.id;
    recordUsage(id, { statusCode: 200 });
    recordUsage(id, { statusCode: 200 });
    assert.equal(usageForKey(id)!.balanceDueCents, 6);
    const out = settleBalance(record.prefix); // settle by prefix
    assert.equal(out.ok, true);
    assert.equal(out.chargedCents, 6);
    assert.equal(usageForKey(id)!.balanceDueCents, 0); // reset
    assert.equal(usageForKey(id)!.lifetimeBilledCents, 6); // survives settlement
    // more calls accrue again from zero
    recordUsage(id, { statusCode: 200 });
    assert.equal(usageForKey(id)!.balanceDueCents, 3);
    assert.equal(settleBalance('sk_live_nope').ok, false);
  });

  test('listing never leaks a hash', () => {
    mintApiKey('List Co');
    for (const k of listApiKeys()) {
      assert.equal(Object.prototype.hasOwnProperty.call(k, 'keyHash'), false);
    }
  });

  test('a default-priced key is charged the published graduated rate, falling with yearly volume', () => {
    assert.equal(graduatedRateCents(0), 12);
    assert.equal(graduatedRateCents(24_999), 12);
    assert.equal(graduatedRateCents(25_000), 9); // the 25,001st call
    assert.equal(graduatedRateCents(200_000), 6);
    assert.equal(graduatedRateCents(1_000_000), 4);
    const { record } = mintApiKey('Graduated Co');
    assert.equal(recordUsage(record.id, { statusCode: 200 }), 12);
    assert.equal(usageForKey(record.id)!.balanceDueCents, 12);
  });

  test('a call billed by Stripe\'s meter is logged but never added to the ledger balance', () => {
    const { record } = mintApiKey('Metered Co', { pricePerCallCents: 5 });
    assert.equal(recordUsage(record.id, { statusCode: 200, meteredByStripe: true }), 0);
    const u = usageForKey(record.id)!;
    assert.equal(u.calls, 1);
    assert.equal(u.balanceDueCents, 0);
  });
});

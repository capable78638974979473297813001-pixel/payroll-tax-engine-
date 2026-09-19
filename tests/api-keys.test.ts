import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  listApiKeys,
  mintApiKey,
  publicApiKey,
  recordUsage,
  revokeApiKey,
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
    const { key, record } = mintApiKey('Acme Payroll', 'pro');
    assert.match(key, /^sk_live_[A-Za-z0-9_-]{20,}$/);
    assert.equal(record.plan, 'pro');
    assert.equal(record.calls, 0);
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

  test('listing never leaks a hash', () => {
    mintApiKey('List Co');
    for (const k of listApiKeys()) {
      assert.equal(Object.prototype.hasOwnProperty.call(k, 'keyHash'), false);
    }
  });
});

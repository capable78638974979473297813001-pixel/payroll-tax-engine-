import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { mintApiKey, recordUsage, settleBalance, usageForKey, verifyApiKey, setStripeCustomer, setCardOnFile } from '../api/keys.ts';
import { chargeOutstanding } from '../api/billing.ts';

/**
 * Settling a balance takes off what Stripe collected and nothing else:
 * usage recorded while the charge is in flight, or by a second concurrent
 * settlement of the same balance, stays owed.
 */

let dir: string;
let intents: Array<{ id: string; amount: number }> = [];
let onCharge: (() => Promise<void> | void) | null = null;
const realFetch = globalThis.fetch;

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'api-settle-'));
  process.env.API_DB_DIR = dir;
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
  globalThis.fetch = (async (url: string, opts?: { method?: string; body?: string; headers?: Record<string, string> }) => {
    const u = String(url);
    if (opts?.method === 'POST' && /\/v1\/payment_intents$/.test(u)) {
      const params = new URLSearchParams(opts.body ?? '');
      const key = (opts.headers ?? {})['Idempotency-Key'] ?? '';
      if (onCharge) await onCharge();
      // Stripe returns the same intent for the same idempotency key.
      let intent = intents.find((i) => i.id === 'pi_' + key);
      if (!intent) { intent = { id: 'pi_' + key, amount: Number(params.get('amount')) }; intents.push(intent); }
      return { ok: true, status: 200, json: async () => ({ id: intent!.id, status: 'succeeded', amount: intent!.amount }) } as Response;
    }
    throw new Error(`no stub for ${opts?.method ?? 'GET'} ${u}`);
  }) as unknown as typeof fetch;
});
after(() => {
  globalThis.fetch = realFetch;
  delete process.env.STRIPE_SECRET_KEY;
  rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => { intents = []; onCharge = null; });

function keyWithCard(name: string, cents = 8) {
  const { key } = mintApiKey(name, { pricePerCallCents: cents });
  const id = verifyApiKey(key)!.id;
  setStripeCustomer(id, 'cus_' + id);
  setCardOnFile(id, { paymentMethodId: 'pm_' + id, brand: 'visa', last4: '4242' });
  return id;
}

describe('settling a balance', () => {
  test('a call recorded while the charge is in flight stays owed', async () => {
    const id = keyWithCard('InFlight Co');
    recordUsage(id, { statusCode: 200 }); // 8c
    onCharge = () => { recordUsage(id, { statusCode: 200 }); }; // 8c more, mid-charge
    const out = await chargeOutstanding(id);
    assert.equal(out.ok, true);
    assert.equal(out.chargedCents, 8);
    assert.equal(usageForKey(id)!.balanceDueCents, 8, 'the second call is still owed');
  });

  test('two concurrent settlements of one balance collect it once and leave later usage owed', async () => {
    const id = keyWithCard('Concurrent Co');
    recordUsage(id, { statusCode: 200 }); // 8c
    let calls = 0;
    onCharge = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 20));
      if (calls === 1) recordUsage(id, { statusCode: 200 }); // a new call lands while both are waiting
    };
    const [a, b] = await Promise.all([chargeOutstanding(id), chargeOutstanding(id)]);
    assert.equal(a.ok && b.ok, true);
    assert.equal(a.chargedCents + b.chargedCents, 8, 'the 8c is collected once between them');
    assert.equal(usageForKey(id)!.balanceDueCents, 8, 'the call recorded meanwhile is still owed');
  });

  test('replaying a settled payment intent takes off nothing more', async () => {
    const id = keyWithCard('Replay Co');
    recordUsage(id, { statusCode: 200 });
    assert.equal((await chargeOutstanding(id)).chargedCents, 8);
    recordUsage(id, { statusCode: 200 });
    const first = intents[0]!;
    assert.equal(settleBalance(id, 8, first.id).duplicate, true);
    assert.equal(usageForKey(id)!.balanceDueCents, 8);
  });
});

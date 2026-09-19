import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { mintApiKey, recordUsage, usageForKey, getApiKey, verifyApiKey } from '../api/keys.ts';
import { chargeOutstanding, completeCardSetup, startCardSetup } from '../api/billing.ts';

// A fake Stripe: route requests by method + path to canned responses.
type Handler = (body: string) => { ok?: boolean; json: unknown };
let routes: Array<{ method: string; match: RegExp; handler: Handler }> = [];
const realFetch = globalThis.fetch;
function stub(method: string, match: RegExp, handler: Handler) {
  routes.push({ method, match, handler });
}

let dir: string;
before(() => {
  dir = mkdtempSync(join(tmpdir(), 'api-billing-'));
  process.env.API_DB_DIR = dir;
  globalThis.fetch = (async (url: string, opts?: { method?: string; body?: string }) => {
    const method = opts?.method ?? 'GET';
    const r = routes.find((x) => x.method === method && x.match.test(String(url)));
    if (!r) throw new Error(`no stub for ${method} ${url}`);
    const out = r.handler(opts?.body ?? '');
    return { ok: out.ok ?? true, status: out.ok === false ? 402 : 200, json: async () => out.json } as Response;
  }) as unknown as typeof fetch;
});
after(() => {
  globalThis.fetch = realFetch;
  delete process.env.STRIPE_SECRET_KEY;
  rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => {
  routes = [];
});

describe('Stripe billing (api/billing.ts)', () => {
  test('with no STRIPE_SECRET_KEY, charging is a safe no-op that never touches the balance', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const { key } = mintApiKey('Nokey Co', { pricePerCallCents: 5 });
    const id = verifyApiKey(key)!.id;
    recordUsage(id, { statusCode: 200 });
    recordUsage(id, { statusCode: 200 });
    const out = await chargeOutstanding(id);
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'stripe_not_configured');
    assert.equal(usageForKey(id)!.balanceDueCents, 10); // untouched
  });

  test('full self-serve flow: save a card, then charge the outstanding balance', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
    const { key } = mintApiKey('Flow Co', { pricePerCallCents: 5 });
    const id = verifyApiKey(key)!.id;
    recordUsage(id, { statusCode: 200 });
    recordUsage(id, { statusCode: 200 }); // balance = 10c

    // charging before a card exists is refused, balance intact
    assert.equal((await chargeOutstanding(id)).reason, 'no_card_on_file');
    assert.equal(usageForKey(id)!.balanceDueCents, 10);

    // start card setup -> creates a customer + a hosted checkout session
    stub('POST', /\/v1\/customers$/, () => ({ json: { id: 'cus_1' } }));
    stub('POST', /\/v1\/checkout\/sessions$/, () => ({ json: { id: 'cs_1', url: 'https://checkout.stripe.test/cs_1' } }));
    const setup = await startCardSetup(id, 'https://api.example.com');
    assert.equal(setup.ok, true);
    assert.match(setup.url!, /checkout\.stripe\.test/);
    assert.equal(getApiKey(id)!.stripeCustomerId, 'cus_1');

    // customer finishes checkout -> we read the session and store the card
    stub('GET', /\/v1\/checkout\/sessions\/cs_1/, () => ({
      json: { id: 'cs_1', customer: 'cus_1', metadata: { apiKeyId: id }, setup_intent: { id: 'seti_1', payment_method: 'pm_1' } },
    }));
    stub('GET', /\/v1\/payment_methods\/pm_1$/, () => ({ json: { id: 'pm_1', card: { brand: 'visa', last4: '4242' } } }));
    const done = await completeCardSetup('cs_1');
    assert.equal(done.ok, true);
    assert.equal(done.last4, '4242');
    assert.equal(getApiKey(id)!.stripePaymentMethodId, 'pm_1');
    assert.equal(getApiKey(id)!.cardLast4, '4242');

    // now the charge succeeds and the balance settles to zero
    let chargedAmount = 0;
    stub('POST', /\/v1\/payment_intents$/, (body) => {
      chargedAmount = Number(new URLSearchParams(body).get('amount'));
      return { json: { id: 'pi_1', status: 'succeeded', amount: chargedAmount } };
    });
    const charge = await chargeOutstanding(id);
    assert.equal(charge.ok, true);
    assert.equal(charge.chargedCents, 10);
    assert.equal(chargedAmount, 10); // exactly the balance was sent to Stripe
    assert.equal(usageForKey(id)!.balanceDueCents, 0); // settled
    assert.equal(usageForKey(id)!.lifetimeBilledCents, 10);
  });

  test('a declined charge leaves the balance intact (we never settle on failure)', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
    const { key } = mintApiKey('Decline Co', { pricePerCallCents: 7 });
    const id = verifyApiKey(key)!.id;
    recordUsage(id, { statusCode: 200 }); // balance = 7c
    // pretend a saved card exists
    stub('POST', /\/v1\/customers$/, () => ({ json: { id: 'cus_2' } }));
    stub('POST', /\/v1\/checkout\/sessions$/, () => ({ json: { id: 'cs_2', url: 'https://checkout.stripe.test/cs_2' } }));
    await startCardSetup(id, 'https://api.example.com');
    stub('GET', /\/v1\/checkout\/sessions\/cs_2/, () => ({ json: { customer: 'cus_2', metadata: { apiKeyId: id }, setup_intent: { payment_method: 'pm_2' } } }));
    stub('GET', /\/v1\/payment_methods\/pm_2$/, () => ({ json: { id: 'pm_2', card: { brand: 'visa', last4: '0002' } } }));
    await completeCardSetup('cs_2');

    stub('POST', /\/v1\/payment_intents$/, () => ({ ok: false, json: { error: { message: 'Your card was declined.', type: 'card_error', code: 'card_declined' } } }));
    const charge = await chargeOutstanding(id);
    assert.equal(charge.ok, false);
    assert.equal(charge.reason, 'charge_failed');
    assert.match(charge.error!, /declined/);
    assert.equal(usageForKey(id)!.balanceDueCents, 7); // NOT settled
  });
});

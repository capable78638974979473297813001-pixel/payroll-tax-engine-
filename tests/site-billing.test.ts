import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import {
  METER_EVENT, billingConfigured, meteringConfigured,
  reportCall, startMeteredCheckout, completeMeteredCheckout, interpretWebhook,
} from '../site/lib/billing.ts';

// A fake Stripe: route by method + path to canned responses.
type Handler = (body: string) => { ok?: boolean; json: unknown };
let routes: Array<{ method: string; match: RegExp; handler: Handler }> = [];
const realFetch = globalThis.fetch;
const stub = (method: string, match: RegExp, handler: Handler) => routes.push({ method, match, handler });

before(() => {
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
  delete process.env.STRIPE_PRICE_ID;
  delete process.env.STRIPE_WEBHOOK_SECRET;
});
beforeEach(() => { routes = []; });

describe('site billing (site/lib/billing.ts)', () => {
  test('configuration flags follow the environment', () => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_PRICE_ID;
    assert.equal(billingConfigured(), false);
    assert.equal(meteringConfigured(), false);
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    assert.equal(meteringConfigured(), true);
    assert.equal(billingConfigured(), false); // still no price
    process.env.STRIPE_PRICE_ID = 'price_metered';
    assert.equal(billingConfigured(), true);
  });

  test('reportCall is a safe no-op without Stripe or a customer, and never throws', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    assert.deepEqual(await reportCall('cus_1', 'req_1'), { ok: false, reason: 'stripe_not_configured' });
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    assert.deepEqual(await reportCall(null, 'req_1'), { ok: false, reason: 'no_customer' });
  });

  test('reportCall reports exactly one unit for the customer', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    let seen: Record<string, string> = {};
    stub('POST', /\/v1\/billing\/meter_events$/, (body) => {
      seen = Object.fromEntries(new URLSearchParams(body));
      return { json: { identifier: 'evt_1' } };
    });
    const out = await reportCall('cus_42', 'req_abc');
    assert.equal(out.ok, true);
    assert.equal(seen.event_name, METER_EVENT);
    assert.equal(seen['payload[stripe_customer_id]'], 'cus_42');
    assert.equal(seen['payload[value]'], '1');
    assert.equal(seen.identifier, 'req_abc'); // dedupe key
  });

  test('a Stripe failure surfaces as a reason, never a throw', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    stub('POST', /\/v1\/billing\/meter_events$/, () => ({ ok: false, json: { error: { message: 'meter gone' } } }));
    const out = await reportCall('cus_1', 'req_1');
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'stripe_error');
    assert.match(out.error!, /meter gone/);
  });

  test('startMeteredCheckout creates a subscription session with the trial', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.STRIPE_PRICE_ID = 'price_metered';
    let body = '';
    stub('POST', /\/v1\/checkout\/sessions$/, (b) => { body = b; return { json: { id: 'cs_1', url: 'https://checkout.test/cs_1' } }; });
    const out = await startMeteredCheckout({ customerId: 'cus_1', email: 'a@b.co', successUrl: 'https://x/ok', cancelUrl: 'https://x/no', trialDays: 14 });
    assert.equal(out.ok, true);
    assert.match(out.url!, /checkout\.test/);
    const params = new URLSearchParams(body);
    assert.equal(params.get('mode'), 'subscription');
    assert.equal(params.get('customer'), 'cus_1');
    assert.equal(params.get('subscription_data[trial_period_days]'), '14');
  });

  test('startMeteredCheckout refuses without a configured price', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    delete process.env.STRIPE_PRICE_ID;
    const out = await startMeteredCheckout({ customerId: 'cus_1', email: 'a@b.co', successUrl: 'x', cancelUrl: 'y', trialDays: 14 });
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'no_price_configured');
  });

  test('completeMeteredCheckout reads back the customer + subscription ids', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    stub('GET', /\/v1\/checkout\/sessions\/cs_1/, () => ({
      json: { id: 'cs_1', customer: 'cus_9', subscription: 'sub_9', metadata: { omnia_email: 'a@b.co' } },
    }));
    const out = await completeMeteredCheckout('cs_1');
    assert.equal(out.ok, true);
    assert.equal(out.customerId, 'cus_9');
    assert.equal(out.subscriptionId, 'sub_9');
    assert.equal(out.email, 'a@b.co');
  });

  test('interpretWebhook verifies the signature and classifies the event', () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    const sign = (body: string) => {
      const t = Math.floor(Date.now() / 1000);
      const v1 = createHmac('sha256', 'whsec_test').update(`${t}.${body}`).digest('hex');
      return `t=${t},v1=${v1}`;
    };
    const evt = (type: string) => JSON.stringify({ type, data: { object: { customer: 'cus_1' } } });

    let out = interpretWebhook(evt('invoice.payment_failed'), sign(evt('invoice.payment_failed')));
    assert.deepEqual(out, { ok: true, action: 'suspend', customerId: 'cus_1' });

    out = interpretWebhook(evt('invoice.paid'), sign(evt('invoice.paid')));
    assert.equal(out.ok && out.action, 'reactivate');

    out = interpretWebhook(evt('customer.subscription.deleted'), sign(evt('customer.subscription.deleted')));
    assert.equal(out.ok && out.action, 'cancel');

    out = interpretWebhook(evt('charge.refunded'), sign(evt('charge.refunded')));
    assert.equal(out.ok && out.action, 'ignore');
  });

  test('a forged or unconfigured webhook changes nothing', () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    const body = JSON.stringify({ type: 'invoice.paid', data: { object: { customer: 'cus_1' } } });
    const forged = interpretWebhook(body, 't=' + Math.floor(Date.now() / 1000) + ',v1=deadbeef');
    assert.deepEqual(forged, { ok: false, reason: 'bad_signature' });

    delete process.env.STRIPE_WEBHOOK_SECRET;
    assert.deepEqual(interpretWebhook(body, 'whatever'), { ok: false, reason: 'webhook_not_configured' });
  });
});

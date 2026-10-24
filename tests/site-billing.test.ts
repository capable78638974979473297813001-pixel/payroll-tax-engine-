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
  delete process.env.STRIPE_METER_EVENT;
  delete process.env.STRIPE_METER_EVENT_NAME;
  delete process.env.STRIPE_ALLOW_LIVE;
});
beforeEach(() => { routes = []; });

describe('site billing (site/lib/billing.ts)', () => {
  test('configuration flags follow the environment', () => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_PRICE_ID;
    delete process.env.STRIPE_METER_EVENT;
    delete process.env.STRIPE_METER_EVENT_NAME;
    delete process.env.STRIPE_ALLOW_LIVE;
    assert.equal(billingConfigured(), false);
    assert.equal(meteringConfigured(), false);
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    // A secret key alone is not metering: no metered price to bill against.
    assert.equal(meteringConfigured(), false);
    assert.equal(billingConfigured(), false); // still no price
    process.env.STRIPE_PRICE_ID = 'price_metered';
    assert.equal(billingConfigured(), true);
    // A price without an explicit meter event name still isn't metering.
    assert.equal(meteringConfigured(), false);
    process.env.STRIPE_METER_EVENT = 'omnia_api_call';
    assert.equal(meteringConfigured(), true);
    delete process.env.STRIPE_METER_EVENT;
    process.env.STRIPE_METER_EVENT_NAME = 'paycheck_calculated';
    assert.equal(meteringConfigured(), true);
    delete process.env.STRIPE_METER_EVENT_NAME;
  });

  test('reportCall is a safe no-op without Stripe or a customer, and never throws', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    assert.deepEqual(await reportCall('cus_1', 'req_1'), { ok: false, reason: 'stripe_not_configured' });
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    assert.deepEqual(await reportCall(null, 'req_1'), { ok: false, reason: 'no_customer' });
  });

  test('reportCall reports exactly one unit for the customer', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    delete process.env.STRIPE_METER_EVENT_NAME;
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
    stub('GET', /\/v1\/prices\/price_metered$/, () => ({ json: { id: 'price_metered', recurring: { usage_type: 'metered' } } }));
    stub('POST', /\/v1\/checkout\/sessions$/, (b) => { body = b; return { json: { id: 'cs_1', url: 'https://checkout.test/cs_1' } }; });
    const out = await startMeteredCheckout({ customerId: 'cus_1', email: 'a@b.co', successUrl: 'https://x/ok', cancelUrl: 'https://x/no', trialDays: 14 });
    assert.equal(out.ok, true);
    assert.match(out.url!, /checkout\.test/);
    const params = new URLSearchParams(body);
    assert.equal(params.get('mode'), 'subscription');
    assert.equal(params.get('customer'), 'cus_1');
    assert.equal(params.get('subscription_data[trial_period_days]'), '14');
    assert.equal(params.get('payment_method_collection'), 'always');
    assert.equal(params.get('line_items[0][price]'), 'price_metered');
    assert.equal(params.get('line_items[0][quantity]'), null);
    assert.equal(body.includes('payment_method_types'), false);
    for (const key of params.keys()) {
      assert.equal(key === 'payment_method_types' || key.startsWith('payment_method_types['), false);
    }
  });

  test('checkout does not send payment_method_types even if the old env var is set', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.STRIPE_PRICE_ID = 'price_metered';
    process.env.STRIPE_PAYMENT_METHOD_TYPES = 'card,us_bank_account';
    let calls = 0;
    let body = '';
    stub('GET', /\/v1\/prices\/price_metered$/, () => ({ json: { id: 'price_metered', recurring: { usage_type: 'metered' } } }));
    stub('POST', /\/v1\/checkout\/sessions$/, (b) => {
      calls += 1;
      body = b;
      return { json: { id: 'cs_2', url: 'https://checkout.test/cs_2' } };
    });
    const out = await startMeteredCheckout({ customerId: 'cus_1', email: 'a@b.co', successUrl: 'https://x/ok', cancelUrl: 'https://x/no', trialDays: 14 });
    assert.equal(out.ok, true);
    assert.equal(calls, 1, 'Dashboard dynamic payment methods: one session, no type retry');
    assert.equal(body.includes('payment_method_types'), false);
    const params = new URLSearchParams(body);
    for (const key of params.keys()) {
      assert.equal(key === 'payment_method_types' || key.startsWith('payment_method_types['), false);
    }
    delete process.env.STRIPE_PAYMENT_METHOD_TYPES;
  });

  test('a metered price omits quantity and is retrieved once per process', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.STRIPE_PRICE_ID = 'price_metered_cached';
    let gets = 0;
    const bodies: string[] = [];
    stub('GET', /\/v1\/prices\/price_metered_cached$/, () => {
      gets += 1;
      return { json: { id: 'price_metered_cached', unit_amount: 9, recurring: { usage_type: 'metered' } } };
    });
    stub('POST', /\/v1\/checkout\/sessions$/, (b) => {
      bodies.push(b);
      return { json: { id: 'cs_m', url: 'https://checkout.test/cs_m' } };
    });
    const input = { customerId: 'cus_1', email: 'a@b.co', successUrl: 'https://x/ok', cancelUrl: 'https://x/no', trialDays: 14 };
    assert.equal((await startMeteredCheckout(input)).ok, true);
    assert.equal((await startMeteredCheckout(input)).ok, true);
    assert.equal(gets, 1);
    assert.equal(bodies.length, 2);
    for (const body of bodies) {
      const params = new URLSearchParams(body);
      assert.equal(params.get('line_items[0][quantity]'), null);
      assert.equal(body.includes('unit_amount'), false);
    }
  });

  test('a licensed price sends quantity 1 and warns that usage will not bill', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.STRIPE_PRICE_ID = 'price_licensed_checkout';
    let gets = 0;
    let body = '';
    stub('GET', /\/v1\/prices\/price_licensed_checkout$/, () => {
      gets += 1;
      return { json: { id: 'price_licensed_checkout', unit_amount: 2500, unit_amount_decimal: '2500', recurring: { usage_type: 'licensed' } } };
    });
    stub('POST', /\/v1\/checkout\/sessions$/, (b) => { body = b; return { json: { id: 'cs_lic', url: 'https://checkout.test/cs_lic' } }; });
    const warnings: string[] = [];
    const orig = console.warn;
    console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(' ')); };
    try {
      const input = { customerId: 'cus_1', email: 'a@b.co', successUrl: 'https://x/ok', cancelUrl: 'https://x/no', trialDays: 14 };
      assert.equal((await startMeteredCheckout(input)).ok, true);
      assert.equal((await startMeteredCheckout(input)).ok, true);
    } finally {
      console.warn = orig;
    }
    assert.equal(gets, 1, 'the price lookup is cached for the process');
    const params = new URLSearchParams(body);
    assert.equal(params.get('line_items[0][price]'), 'price_licensed_checkout');
    assert.equal(params.get('line_items[0][quantity]'), '1');
    assert.equal(body.includes('unit_amount'), false);
    assert.equal(body.includes('2500'), false);
    assert.ok(warnings.length >= 1);
    for (const warning of warnings) {
      assert.match(warning, /STRIPE_PRICE_ID price_licensed_checkout is not metered/);
      assert.match(warning, /usage won't bill/);
      assert.equal(warning.includes('2500'), false);
    }
  });

  test('a price retrieve failure is a clear error and does not create Checkout', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.STRIPE_PRICE_ID = 'price_missing_checkout';
    let gets = 0;
    let posts = 0;
    stub('GET', /\/v1\/prices\/price_missing_checkout$/, () => {
      gets += 1;
      return { ok: false, json: { error: { message: 'No such price: price_missing_checkout' } } };
    });
    stub('POST', /\/v1\/checkout\/sessions$/, () => { posts += 1; return { json: { id: 'cs', url: 'https://checkout.test/no' } }; });
    const input = { customerId: 'cus_1', email: 'a@b.co', successUrl: 'x', cancelUrl: 'y', trialDays: 14 };
    const out = await startMeteredCheckout(input);
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'stripe_error');
    assert.match(out.error!, /Could not read STRIPE_PRICE_ID price_missing_checkout/);
    assert.match(out.error!, /No such price/);
    const again = await startMeteredCheckout(input);
    assert.equal(again.ok, false);
    assert.match(again.error!, /Could not read STRIPE_PRICE_ID price_missing_checkout/);
    assert.equal(gets, 2, 'a failed lookup is not cached');
    assert.equal(posts, 0);
  });

  test('other Stripe refusals are not retried, and the reason reaches the caller', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.STRIPE_PRICE_ID = 'price_metered';
    let calls = 0;
    stub('GET', /\/v1\/prices\/price_metered$/, () => ({ json: { id: 'price_metered', recurring: { usage_type: 'metered' } } }));
    stub('POST', /\/v1\/checkout\/sessions$/, () => { calls++; return { ok: false, json: { error: { message: 'No such price: price_metered' } } }; });
    const out = await startMeteredCheckout({ customerId: 'cus_1', email: 'a@b.co', successUrl: 'x', cancelUrl: 'y', trialDays: 14 });
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'stripe_error');
    assert.match(out.error!, /No such price/);
    assert.equal(calls, 1);
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
      json: {
        id: 'cs_1', status: 'complete', customer: 'cus_9', metadata: { omnia_email: 'a@b.co' },
        subscription: { id: 'sub_9', status: 'active', default_payment_method: { id: 'pm_9', type: 'card', card: { brand: 'visa', last4: '4242' } } },
      },
    }));
    const out = await completeMeteredCheckout('cs_1');
    assert.equal(out.ok, true);
    assert.equal(out.customerId, 'cus_9');
    assert.equal(out.subscriptionId, 'sub_9');
    assert.equal(out.email, 'a@b.co');
    assert.deepEqual(out.paymentMethod, { id: 'pm_9', kind: 'card', brand: 'visa', last4: '4242' });
  });

  test('completeMeteredCheckout refuses a session whose subscription has since ended (expanded or bare id)', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    stub('GET', /\/v1\/checkout\/sessions\/cs_old1/, () => ({
      json: { id: 'cs_old1', status: 'complete', customer: 'cus_9', metadata: { omnia_email: 'a@b.co' }, subscription: { id: 'sub_old', status: 'canceled' } },
    }));
    const expanded = await completeMeteredCheckout('cs_old1');
    assert.deepEqual([expanded.ok, expanded.reason], [false, 'subscription_not_active']);

    stub('GET', /\/v1\/checkout\/sessions\/cs_old2/, () => ({
      json: { id: 'cs_old2', status: 'complete', customer: 'cus_9', metadata: { omnia_email: 'a@b.co' }, subscription: 'sub_old2' },
    }));
    stub('GET', /\/v1\/subscriptions\/sub_old2/, () => ({ json: { id: 'sub_old2', status: 'incomplete_expired' } }));
    const bare = await completeMeteredCheckout('cs_old2');
    assert.deepEqual([bare.ok, bare.reason], [false, 'subscription_not_active']);

    // A lookup that fails is a retryable error, not a guess either way.
    stub('GET', /\/v1\/checkout\/sessions\/cs_old3/, () => ({
      json: { id: 'cs_old3', status: 'complete', customer: 'cus_9', metadata: { omnia_email: 'a@b.co' }, subscription: 'sub_gone' },
    }));
    stub('GET', /\/v1\/subscriptions\/sub_gone/, () => ({ ok: false, json: { error: { message: 'No such subscription' } } }));
    const failed = await completeMeteredCheckout('cs_old3');
    assert.deepEqual([failed.ok, failed.reason], [false, 'stripe_error']);
  });

  test('completeMeteredCheckout reads a bank account saved in setup mode', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    stub('GET', /\/v1\/checkout\/sessions\/cs_3/, () => ({
      json: {
        id: 'cs_3', status: 'complete', customer: null, metadata: { omnia_email: 'a@b.co' },
        setup_intent: { id: 'seti_3', payment_method: { id: 'pm_3', type: 'us_bank_account', us_bank_account: { bank_name: 'Chase', last4: '6789' } } },
      },
    }));
    const out = await completeMeteredCheckout('cs_3');
    assert.equal(out.ok, true);
    assert.equal(out.subscriptionId, null);
    assert.deepEqual(out.paymentMethod, { id: 'pm_3', kind: 'us_bank_account', brand: 'Chase', last4: '6789' });
  });

  test('completeMeteredCheckout refuses a checkout that was not completed', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    stub('GET', /\/v1\/checkout\/sessions\/cs_4/, () => ({
      json: { id: 'cs_4', status: 'open', customer: 'cus_4', metadata: { omnia_email: 'a@b.co' } },
    }));
    const out = await completeMeteredCheckout('cs_4');
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'checkout_not_complete');
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

  test('interpretWebhook names the subscription each event is about', () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    const sign = (body: string) => {
      const t = Math.floor(Date.now() / 1000);
      return `t=${t},v1=${createHmac('sha256', 'whsec_test').update(`${t}.${body}`).digest('hex')}`;
    };
    const read = (type: string, object: Record<string, unknown>) => {
      const body = JSON.stringify({ id: 'evt_x', type, data: { object: { customer: 'cus_1', ...object } } });
      const out = interpretWebhook(body, sign(body));
      assert.equal(out.ok, true);
      return out.ok ? out.subscriptionId : undefined;
    };
    assert.equal(read('customer.subscription.deleted', { id: 'sub_a' }), 'sub_a');
    assert.equal(read('customer.subscription.paused', { id: 'sub_b' }), 'sub_b');
    assert.equal(read('customer.subscription.resumed', { id: 'sub_c' }), 'sub_c');
    assert.equal(read('invoice.payment_failed', { subscription: 'sub_d' }), 'sub_d');
    assert.equal(read('invoice.paid', { subscription: 'sub_e' }), 'sub_e');
    assert.equal(read('invoice.paid', {}), undefined);
  });

  test('reportCall uses STRIPE_METER_EVENT_NAME when it is set', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.STRIPE_METER_EVENT = 'legacy_name';
    process.env.STRIPE_METER_EVENT_NAME = 'paycheck_calculated';
    let seen: Record<string, string> = {};
    stub('POST', /\/v1\/billing\/meter_events$/, (body) => {
      seen = Object.fromEntries(new URLSearchParams(body));
      return { json: { identifier: 'evt_1' } };
    });
    const out = await reportCall('cus_42', 'calc_1');
    assert.equal(out.ok, true);
    assert.equal(seen.event_name, 'paycheck_calculated');
    assert.equal(seen['payload[stripe_customer_id]'], 'cus_42');
    assert.equal(seen['payload[value]'], '1');
    assert.equal(seen.identifier, 'calc_1');
    delete process.env.STRIPE_METER_EVENT_NAME;
    delete process.env.STRIPE_METER_EVENT;
  });

  test('a live Stripe secret is refused unless STRIPE_ALLOW_LIVE=1', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_refused';
    process.env.STRIPE_PRICE_ID = 'price_metered';
    process.env.STRIPE_METER_EVENT_NAME = 'paycheck_calculated';
    delete process.env.STRIPE_ALLOW_LIVE;
    assert.equal(billingConfigured(), false);
    assert.equal(meteringConfigured(), false);
    const refused = await startMeteredCheckout({ customerId: 'cus_1', email: 'a@b.co', successUrl: 'https://x/ok', cancelUrl: 'https://x/no', trialDays: 14 });
    assert.equal(refused.ok, false);
    assert.equal(refused.reason, 'stripe_not_configured');
    process.env.STRIPE_ALLOW_LIVE = '1';
    assert.equal(billingConfigured(), true);
    delete process.env.STRIPE_ALLOW_LIVE;
    delete process.env.STRIPE_METER_EVENT_NAME;
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  });

  test('checkout.session.completed and subscription.updated are classified', () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    const sign = (body: string) => {
      const t = Math.floor(Date.now() / 1000);
      const v1 = createHmac('sha256', 'whsec_test').update(`${t}.${body}`).digest('hex');
      return `t=${t},v1=${v1}`;
    };
    const checkout = JSON.stringify({
      id: 'evt_cs',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', status: 'complete', mode: 'subscription', customer: 'cus_1', subscription: 'sub_1', metadata: { omnia_email: 'a@b.co' } } },
    });
    const done = interpretWebhook(checkout, sign(checkout));
    assert.equal(done.ok && done.action, 'checkout_completed');
    if (done.ok) {
      assert.equal(done.eventId, 'evt_cs');
      assert.equal(done.sessionId, 'cs_1');
      assert.equal(done.subscriptionId, 'sub_1');
      assert.equal(done.email, 'a@b.co');
      assert.equal(done.customerId, 'cus_1');
    }
    const pastDue = JSON.stringify({ id: 'evt_pd', type: 'customer.subscription.updated', data: { object: { id: 'sub_1', customer: 'cus_1', status: 'past_due' } } });
    assert.equal(interpretWebhook(pastDue, sign(pastDue)).ok && interpretWebhook(pastDue, sign(pastDue)).action, 'suspend');
    const active = JSON.stringify({ type: 'customer.subscription.updated', data: { object: { id: 'sub_1', customer: 'cus_1', status: 'active' } } });
    assert.equal(interpretWebhook(active, sign(active)).ok && interpretWebhook(active, sign(active)).action, 'reactivate');
    const canceled = JSON.stringify({ type: 'customer.subscription.updated', data: { object: { id: 'sub_1', customer: 'cus_1', status: 'canceled' } } });
    assert.equal(interpretWebhook(canceled, sign(canceled)).ok && interpretWebhook(canceled, sign(canceled)).action, 'cancel');
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

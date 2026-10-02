import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkoutPaymentMethodTypes } from '../api/stripe.ts';

/**
 * scripts/check-stripe.ts against a stand-in Stripe: a correct setup passes,
 * and a setup with the usual first-time mistakes names each one.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://omniatax.io';
const goodPrice = {
  id: 'price_good', active: true, livemode: false, currency: 'usd', billing_scheme: 'per_unit', tiers_mode: null,
  unit_amount: 9, unit_amount_decimal: '9',
  recurring: { interval: 'month', interval_count: 1, usage_type: 'metered', meter: 'mtr_good' },
};
const goodMeter = {
  id: 'mtr_good', status: 'active', event_name: 'omnia_api_call',
  default_aggregation: { formula: 'sum' },
  customer_mapping: { event_payload_key: 'stripe_customer_id', type: 'by_id' },
  value_settings: { event_payload_key: 'value' },
};
const goodHook = {
  url: `${BASE}/api/billing/webhook`, status: 'enabled',
  enabled_events: ['invoice.payment_failed', 'invoice.paid', 'customer.subscription.deleted'],
};

const prices: Record<string, unknown> = {
  price_good: goodPrice,
  price_tiered: { ...goodPrice, id: 'price_tiered', billing_scheme: 'tiered', tiers_mode: 'graduated', unit_amount: null, unit_amount_decimal: null },
  price_licensed: { ...goodPrice, id: 'price_licensed', recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' } },
  price_wrongamt: { ...goodPrice, id: 'price_wrongamt', unit_amount: 15, unit_amount_decimal: '15' },
  price_badmeter: { ...goodPrice, id: 'price_badmeter', recurring: { ...goodPrice.recurring, meter: 'mtr_bad' } },
};
const meters: Record<string, unknown> = {
  mtr_good: goodMeter,
  mtr_bad: { ...goodMeter, id: 'mtr_bad', event_name: 'payroll_api_call', default_aggregation: { formula: 'count' } },
};
let hooks: unknown[] = [goodHook];

let server: Server;
let port = 0;
before(async () => {
  server = createServer((req, res) => {
    const u = req.url ?? '';
    let body: unknown = { error: { message: 'No such resource' } };
    let status = 404;
    const price = /^\/v1\/prices\/([^?]+)/.exec(u);
    const meter = /^\/v1\/billing\/meters\/([^?]+)/.exec(u);
    if (u.startsWith('/v1/balance')) { status = 200; body = { object: 'balance' }; }
    else if (price && prices[price[1]!]) { status = 200; body = prices[price[1]!]; }
    else if (meter && meters[meter[1]!]) { status = 200; body = meters[meter[1]!]; }
    else if (u.startsWith('/v1/webhook_endpoints')) { status = 200; body = { data: hooks }; }
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as { port: number }).port;
});
after(() => server.close());

function run(env: Record<string, string>): Promise<{ code: number | null; out: string }> {
  // Async on purpose: the stand-in Stripe lives in this process and must keep answering.
  return new Promise((resolve) => {
    const child = spawn('node', ['scripts/check-stripe.ts'], {
      cwd: REPO,
      env: {
        PATH: process.env.PATH ?? '',
        STRIPE_API_BASE: `http://127.0.0.1:${port}`,
        STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_PRICE_ID: 'price_good', STRIPE_METER_EVENT: 'omnia_api_call',
        STRIPE_WEBHOOK_SECRET: 'whsec_x', PUBLIC_BASE_URL: BASE,
        ...env,
      },
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => resolve({ code, out }));
  });
}

test('a correct setup passes', async () => {
  const r = await run({});
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /All checks passed/);
});

test('the usual mistakes are each named', async () => {
  const tiered = await run({ STRIPE_PRICE_ID: 'price_tiered' });
  assert.equal(tiered.code, 1);
  assert.match(tiered.out, /FAIL .*tiers/);

  const licensed = await run({ STRIPE_PRICE_ID: 'price_licensed' });
  assert.match(licensed.out, /FAIL .*not usage-based/);

  const amount = await run({ STRIPE_PRICE_ID: 'price_wrongamt' });
  assert.match(amount.out, /FAIL .*15 cents, expected 9/);

  const meter = await run({ STRIPE_PRICE_ID: 'price_badmeter' });
  assert.match(meter.out, /FAIL .*payroll_api_call.*STRIPE_METER_EVENT/);
  assert.match(meter.out, /FAIL .*aggregation is count/);

  const event = await run({ STRIPE_METER_EVENT: 'something_else' });
  assert.match(event.out, /FAIL .*STRIPE_METER_EVENT is "something_else"/);

  const missing = await run({ STRIPE_PRICE_ID: '', STRIPE_WEBHOOK_SECRET: '' });
  assert.match(missing.out, /FAIL .*STRIPE_PRICE_ID is not set/);
  assert.match(missing.out, /FAIL .*STRIPE_WEBHOOK_SECRET is not set/);
});

test('a webhook endpoint with the wrong URL or missing events fails', async () => {
  hooks = [{ ...goodHook, url: 'https://old.example/api/billing/webhook' }];
  assert.match((await run({})).out, /FAIL .*no webhook endpoint for https:\/\/omniatax\.io\/api\/billing\/webhook/);
  hooks = [{ ...goodHook, enabled_events: ['invoice.paid'] }];
  const r = await run({});
  assert.match(r.out, /FAIL .*missing event invoice\.payment_failed/);
  assert.match(r.out, /FAIL .*missing event customer\.subscription\.deleted/);
  hooks = [goodHook];
});

test('a live key against a test-mode price is called out', async () => {
  assert.match((await run({ STRIPE_SECRET_KEY: 'sk_live_x' })).out, /FAIL .*price is test mode but the key is live mode/);
});

test('checkout payment methods default to card + bank and can be narrowed', () => {
  const saved = process.env.STRIPE_PAYMENT_METHOD_TYPES;
  try {
    delete process.env.STRIPE_PAYMENT_METHOD_TYPES;
    assert.deepEqual(checkoutPaymentMethodTypes(), ['card', 'us_bank_account']);
    process.env.STRIPE_PAYMENT_METHOD_TYPES = 'card';
    assert.deepEqual(checkoutPaymentMethodTypes(), ['card']);
    process.env.STRIPE_PAYMENT_METHOD_TYPES = 'card, paypal, bogus';
    assert.deepEqual(checkoutPaymentMethodTypes(), ['card']);
    process.env.STRIPE_PAYMENT_METHOD_TYPES = 'nonsense';
    assert.deepEqual(checkoutPaymentMethodTypes(), ['card', 'us_bank_account']);
  } finally {
    if (saved === undefined) delete process.env.STRIPE_PAYMENT_METHOD_TYPES; else process.env.STRIPE_PAYMENT_METHOD_TYPES = saved;
  }
});

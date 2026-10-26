import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Stripe metered billing on the site, against a fake Stripe:
 * subscription Checkout from STRIPE_PRICE_ID, one meter event per
 * successful /api/paycheck and /v1/paycheck, rejection of a stored
 * sk_test_ key, no meter for a failed calculation, a Stripe outage that does not fail the
 * response, and webhook signature pass/fail plus event-id idempotency.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const freePort = () => new Promise<number>((resolve) => {
  const srv = createNetServer();
  srv.listen(0, '127.0.0.1', () => { const { port } = srv.address() as { port: number }; srv.close(() => resolve(port)); });
});

const LIVE_EMAIL = 'live@wire.test';
const PENDING_EMAIL = 'pending@wire.test';
const SESSION = 'sess_wire_token';
const PENDING_SESSION = 'sess_pending_token';
const LIVE_KEY = 'sk_live_' + randomBytes(18).toString('base64url');
const TEST_KEY = 'sk_test_' + randomBytes(18).toString('base64url');
const WEBHOOK_SECRET = 'whsec_wire';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

const paycheckBody = {
  checkDate: '2026-06-15', payFrequency: 'biweekly',
  earnings: [{ code: 'REG', category: 'regular', amount: 300000 }], deductions: [],
  federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
  ytd: { socialSecurity: 0, medicare: 0, futa: 0 }, workState: { code: 'OH' },
};

let PORT = 0;
let BASE = '';
let dir = '';
let child: ChildProcess;
let fakes: Server;
let output = '';
let meterDown = false;
let checkoutBody = '';
const meterEvents: Array<Record<string, string>> = [];

const db = () => JSON.parse(readFileSync(join(dir, 'db.json'), 'utf8'));
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

function account(email: string, stage: string) {
  const now = new Date().toISOString();
  return {
    name: 'Live Wire', email, company: 'Wire LLC', phone: '555-0100',
    code: null, codeExpiresAt: null, codeRequestedAt: null, emailVerifiedAt: now,
    sessionToken: email === LIVE_EMAIL ? SESSION : PENDING_SESSION,
    sessionExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    stage, createdAt: now,
  };
}

function subscription(email: string, status: string, stripeCustomerId: string | null, stripeSubscriptionId: string | null) {
  const now = new Date().toISOString();
  return {
    email, legalName: 'Wire LLC', billingContact: 'Live Wire', billingEmail: email, address: '1 Main St',
    expectedEmployees: 2, payFrequency: 'biweekly', rooftop: false, estimatedAnnual: 0,
    status, trialStartsAt: status === 'payment_pending' ? null : now, trialEndsAt: status === 'payment_pending' ? null : now, termMonths: 12, termEndsAt: status === 'payment_pending' ? null : now,
    createdAt: now, activatedAt: now, stripeCustomerId, stripeSubscriptionId, suspended: false, suspendedReason: null,
  };
}

function keyRecord(plaintext: string, email: string) {
  const prefix = plaintext.slice(0, plaintext.startsWith('sk_live_') ? 14 : 14);
  return {
    keyHash: sha(plaintext), keyPrefix: prefix, ownerEmail: email, ownerName: 'Live Wire', company: 'Wire LLC',
    plan: 'trial', createdAt: new Date().toISOString(), expiresAt: '2099-01-01T00:00:00.000Z',
    isActive: true, lastUsedAt: null, totalCalls: 0,
  };
}

before(async () => {
  PORT = await freePort();
  BASE = `http://127.0.0.1:${PORT}`;
  dir = mkdtempSync(join(tmpdir(), 'site-stripe-wire-'));
  const liveHash = sha(LIVE_KEY);
  const testHash = sha(TEST_KEY);
  writeFileSync(join(dir, 'db.json'), JSON.stringify({
    accounts: { [LIVE_EMAIL]: account(LIVE_EMAIL, 'trialing'), [PENDING_EMAIL]: account(PENDING_EMAIL, 'payment_pending') },
    scenarios: {}, acceptances: [],
    paymentMethods: {
      [LIVE_EMAIL]: { email: LIVE_EMAIL, kind: 'card', processorRef: 'pm_live', last4: '4242', brand: 'visa', attachedAt: new Date().toISOString() },
    },
    subscriptions: {
      [LIVE_EMAIL]: subscription(LIVE_EMAIL, 'trialing', 'cus_live', 'sub_live'),
      [PENDING_EMAIL]: subscription(PENDING_EMAIL, 'payment_pending', 'cus_pending', null),
    },
    keys: { [liveHash]: keyRecord(LIVE_KEY, LIVE_EMAIL), [testHash]: keyRecord(TEST_KEY, LIVE_EMAIL) },
    usage: [], estimates: [], termsQuotes: {}, meterQueue: [], rateLimits: {}, processedStripeEvents: [],
  }));

  fakes = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const url = req.url ?? '';
      const send = (status: number, body: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (req.method === 'GET' && url.startsWith('/v1/prices/')) {
        return send(200, { id: 'price_wire', recurring: { usage_type: 'metered' } });
      }
      if (url === '/v1/checkout/sessions' && req.method === 'POST') {
        checkoutBody = raw;
        return send(200, { id: 'cs_new', url: 'https://checkout.test/cs_new' });
      }
      if (url.startsWith('/v1/checkout/sessions/cs_pending')) {
        return send(200, {
          id: 'cs_pending', status: 'complete', customer: 'cus_pending',
          metadata: { omnia_email: PENDING_EMAIL },
          subscription: { id: 'sub_pending', status: 'trialing', default_payment_method: { id: 'pm_pending', type: 'card', card: { brand: 'visa', last4: '1111' } } },
        });
      }
      if (url.startsWith('/v1/checkout/sessions/cs_old')) {
        return send(200, {
          id: 'cs_old', status: 'complete', customer: 'cus_live',
          metadata: { omnia_email: LIVE_EMAIL },
          subscription: { id: 'sub_old', status: 'canceled', default_payment_method: { id: 'pm_old', type: 'card', card: { brand: 'visa', last4: '0001' } } },
        });
      }
      if (url === '/v1/billing/meter_events' && req.method === 'POST') {
        meterEvents.push(Object.fromEntries(new URLSearchParams(raw)));
        return meterDown
          ? send(500, { error: { message: 'stripe down' } })
          : send(200, { identifier: 'ok' });
      }
      send(404, { error: { message: 'no such route ' + url } });
    });
  });
  await new Promise<void>((r) => fakes.listen(0, '127.0.0.1', r));
  const fakeBase = `http://127.0.0.1:${(fakes.address() as { port: number }).port}`;

  child = spawn('node', ['site/server.ts'], {
    cwd: REPO,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_DB_DIR: dir,
      RATE_LIMIT_PER_MIN: '1000',
      TRUST_PROXY: '',
      PUBLIC_BASE_URL: 'https://omniatax.io',
      STRIPE_SECRET_KEY: 'sk_test_fake',
      STRIPE_API_BASE: fakeBase,
      STRIPE_PRICE_ID: 'price_wire',
      STRIPE_METER_EVENT_NAME: 'paycheck_calculated',
      STRIPE_METER_EVENT: '',
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
      STRIPE_ALLOW_LIVE: '',
      RESEND_API_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (d) => { output += d; });
  child.stderr?.on('data', (d) => { output += d; });
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${BASE}/v1/health`)).ok) return; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('server did not become healthy\n' + output);
});

after(() => {
  child?.kill('SIGKILL');
  fakes?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function sign(body: string): string {
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', WEBHOOK_SECRET).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

const until = async (cond: () => boolean) => {
  for (let i = 0; i < 40 && !cond(); i++) await new Promise((r) => setTimeout(r, 50));
};

test('checkout, meter events, and the webhook', async () => {
  // An account that already has a subscription cannot open another Checkout.
  const dup = await fetch(`${BASE}/api/payment-setup`, { method: 'POST', headers: bearer(SESSION) });
  assert.equal(dup.status, 409);
  assert.equal((await dup.json() as { code?: string }).code, 'already_subscribed');
  assert.equal(checkoutBody, '', 'no Checkout session was created for it');

  const setup = await fetch(`${BASE}/api/payment-setup`, { method: 'POST', headers: bearer(PENDING_SESSION) });
  assert.equal(setup.status, 200, await setup.clone().text());
  const setupBody = await setup.json() as { checkoutUrl?: string; metered?: boolean };
  assert.equal(setupBody.metered, true);
  assert.match(setupBody.checkoutUrl ?? '', /checkout\.test/);
  const params = new URLSearchParams(checkoutBody);
  assert.equal(params.get('mode'), 'subscription');
  assert.equal(params.get('customer'), 'cus_pending');
  assert.equal(params.get('line_items[0][price]'), 'price_wire');
  assert.equal(params.get('line_items[0][quantity]'), null);
  assert.equal(params.get('subscription_data[trial_period_days]'), '14');
  assert.equal(params.get('payment_method_collection'), 'always');
  assert.equal(params.get('success_url'), 'https://omniatax.io/signup/payment?setup=ok&session_id={CHECKOUT_SESSION_ID}');
  assert.equal(params.get('cancel_url'), 'https://omniatax.io/signup/payment?setup=cancelled');
  assert.equal(checkoutBody.includes('payment_method_types'), false);
  for (const key of params.keys()) {
    assert.equal(key === 'payment_method_types' || key.startsWith('payment_method_types['), false);
  }

  const postCalc = (path: string, key: string, body: unknown = paycheckBody) =>
    fetch(`${BASE}${path}`, { method: 'POST', headers: { ...bearer(key), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  const apiCalc = await postCalc('/api/paycheck', LIVE_KEY);
  assert.equal(apiCalc.status, 200);
  const apiId = apiCalc.headers.get('x-request-id');
  await until(() => meterEvents.some((e) => e.identifier === apiId));
  const v1Calc = await postCalc('/v1/paycheck', LIVE_KEY);
  assert.equal(v1Calc.status, 200);
  const v1Id = v1Calc.headers.get('x-request-id');
  await until(() => meterEvents.some((e) => e.identifier === v1Id));
  const ids = [apiId, v1Id];
  assert.equal(meterEvents.length, 2);
  for (const e of meterEvents) {
    assert.equal(e.event_name, 'paycheck_calculated');
    assert.equal(e['payload[stripe_customer_id]'], 'cus_live');
    assert.equal(e['payload[value]'], '1');
  }
  assert.equal(new Set(meterEvents.map((e) => e.identifier)).size, 2);
  assert.deepEqual(meterEvents.map((e) => e.identifier).sort(), ids.slice().sort());

  const bad = await postCalc('/v1/paycheck', LIVE_KEY, { checkDate: 'nope' });
  assert.equal(bad.status, 422);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(meterEvents.length, 2, 'a failed calculation is not metered');

  const retired = await postCalc('/api/paycheck', TEST_KEY);
  assert.equal(retired.status, 401);
  const retiredBody = await retired.json() as { code?: string; error?: string };
  assert.equal(retiredBody.code, 'key_not_accepted');
  assert.match(retiredBody.error ?? '', /no longer accepted/);
  assert.equal((retiredBody.error ?? '').includes(TEST_KEY), false);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(meterEvents.length, 2, 'a retired key is not metered');
  assert.equal(db().meterQueue.length, 0);

  meterDown = true;
  const duringOutage = await postCalc('/v1/paycheck', LIVE_KEY);
  assert.equal(duringOutage.status, 200, 'Stripe being down must not fail the calculation');
  const outageId = duringOutage.headers.get('x-request-id');
  await until(() => db().meterQueue.some((q: { identifier: string; attempts: number }) => q.identifier === outageId && q.attempts >= 1));
  const queued = db().meterQueue.find((q: { identifier: string }) => q.identifier === outageId);
  assert.ok(queued, 'the meter event stays queued');
  assert.match(queued.lastError, /stripe down/);
  meterDown = false;

  const forgedBody = JSON.stringify({ id: 'evt_forged', type: 'invoice.payment_failed', data: { object: { customer: 'cus_live' } } });
  const forged = await fetch(`${BASE}/api/billing/webhook`, {
    method: 'POST',
    headers: { 'Stripe-Signature': 't=' + Math.floor(Date.now() / 1000) + ',v1=deadbeef' },
    body: forgedBody,
  });
  assert.equal(forged.status, 400);
  assert.equal(db().subscriptions[LIVE_EMAIL].suspended, false);

  const failBody = JSON.stringify({ id: 'evt_fail', type: 'invoice.payment_failed', data: { object: { customer: 'cus_live' } } });
  const failed = await fetch(`${BASE}/api/billing/webhook`, { method: 'POST', headers: { 'Stripe-Signature': sign(failBody) }, body: failBody });
  assert.equal(failed.status, 200);
  assert.equal((await failed.json()).action, 'suspend');
  assert.equal(db().subscriptions[LIVE_EMAIL].suspended, true);
  const blocked = await postCalc('/v1/paycheck', LIVE_KEY);
  assert.equal(blocked.status, 402);

  const paidBody = JSON.stringify({ id: 'evt_paid', type: 'invoice.paid', data: { object: { customer: 'cus_live' } } });
  const paid = await fetch(`${BASE}/api/billing/webhook`, { method: 'POST', headers: { 'Stripe-Signature': sign(paidBody) }, body: paidBody });
  assert.equal(paid.status, 200);
  assert.equal(db().subscriptions[LIVE_EMAIL].suspended, false);

  const replay = await fetch(`${BASE}/api/billing/webhook`, { method: 'POST', headers: { 'Stripe-Signature': sign(failBody) }, body: failBody });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).duplicate, true);
  assert.equal(db().subscriptions[LIVE_EMAIL].suspended, false, 'a replayed event id does not suspend again');

  const updated = JSON.stringify({ id: 'evt_upd', type: 'customer.subscription.updated', data: { object: { id: 'sub_live', customer: 'cus_live', status: 'past_due' } } });
  const upd = await fetch(`${BASE}/api/billing/webhook`, { method: 'POST', headers: { 'Stripe-Signature': sign(updated) }, body: updated });
  assert.equal(upd.status, 200);
  assert.equal(db().subscriptions[LIVE_EMAIL].suspended, true);
  const clear = JSON.stringify({ id: 'evt_clear', type: 'customer.subscription.updated', data: { object: { id: 'sub_live', customer: 'cus_live', status: 'active' } } });
  await fetch(`${BASE}/api/billing/webhook`, { method: 'POST', headers: { 'Stripe-Signature': sign(clear) }, body: clear });
  assert.equal(db().subscriptions[LIVE_EMAIL].suspended, false);

  // Late events for a subscription this account no longer holds change nothing.
  const post = (obj: unknown) => {
    const body = JSON.stringify(obj);
    return fetch(`${BASE}/api/billing/webhook`, { method: 'POST', headers: { 'Stripe-Signature': sign(body) }, body });
  };
  const staleCancel = await post({ id: 'evt_stale_del', type: 'customer.subscription.deleted', data: { object: { id: 'sub_old', customer: 'cus_live' } } });
  assert.equal((await staleCancel.json()).action, 'ignored_stale_subscription');
  const staleInvoice = await post({ id: 'evt_stale_inv', type: 'invoice.payment_failed', data: { object: { customer: 'cus_live', subscription: 'sub_old' } } });
  assert.equal((await staleInvoice.json()).action, 'ignored_stale_subscription');
  const staleActive = await post({ id: 'evt_stale_act', type: 'customer.subscription.updated', data: { object: { id: 'sub_old', customer: 'cus_live', status: 'active' } } });
  assert.equal((await staleActive.json()).action, 'ignored_stale_subscription');
  const live = db().subscriptions[LIVE_EMAIL];
  assert.equal(live.status, 'trialing');
  assert.equal(live.suspended, false);
  assert.equal(live.stripeSubscriptionId, 'sub_live');

  // Reopening an old Checkout return cannot swap in a cancelled subscription.
  const oldReturn = await fetch(`${BASE}/api/billing/return`, {
    method: 'POST', headers: { ...bearer(SESSION), 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'cs_old' }),
  });
  assert.equal(oldReturn.status, 502, await oldReturn.clone().text());
  assert.equal(db().subscriptions[LIVE_EMAIL].stripeSubscriptionId, 'sub_live');

  const checkoutEvt = JSON.stringify({
    id: 'evt_cs',
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_pending', mode: 'subscription', status: 'complete', customer: 'cus_pending', subscription: 'sub_pending', metadata: { omnia_email: PENDING_EMAIL } } },
  });
  const hooked = await fetch(`${BASE}/api/billing/webhook`, { method: 'POST', headers: { 'Stripe-Signature': sign(checkoutEvt) }, body: checkoutEvt });
  assert.equal(hooked.status, 200, await hooked.clone().text());
  const pending = db().subscriptions[PENDING_EMAIL];
  assert.equal(pending.stripeCustomerId, 'cus_pending');
  assert.equal(pending.stripeSubscriptionId, 'sub_pending');
  assert.equal(pending.status, 'trialing');
  assert.equal(db().paymentMethods[PENDING_EMAIL].processorRef, 'pm_pending');
  assert.equal(db().paymentMethods[PENDING_EMAIL].last4, '1111');

  const again = await fetch(`${BASE}/api/billing/webhook`, { method: 'POST', headers: { 'Stripe-Signature': sign(checkoutEvt) }, body: checkoutEvt });
  assert.equal((await again.json()).duplicate, true);
  assert.equal(db().subscriptions[PENDING_EMAIL].status, 'trialing');
});

test('setup-mode checkout omits payment_method_types form fields', async () => {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const setupDir = mkdtempSync(join(tmpdir(), 'site-setup-checkout-'));
  writeFileSync(join(setupDir, 'db.json'), JSON.stringify({
    accounts: { [LIVE_EMAIL]: account(LIVE_EMAIL, 'payment_pending') },
    scenarios: {}, acceptances: [], paymentMethods: {},
    subscriptions: { [LIVE_EMAIL]: subscription(LIVE_EMAIL, 'payment_pending', null, null) },
    keys: {}, usage: [], estimates: [], termsQuotes: {}, meterQueue: [], rateLimits: {}, processedStripeEvents: [],
  }));
  let posted = '';
  const fake = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      if ((req.url ?? '') === '/v1/checkout/sessions' && req.method === 'POST') posted = raw;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'cs_setup', url: 'https://checkout.test/cs_setup' }));
    });
  });
  await new Promise<void>((r) => fake.listen(0, '127.0.0.1', r));
  const fakeBase = `http://127.0.0.1:${(fake.address() as { port: number }).port}`;
  const proc = spawn('node', ['site/server.ts'], {
    cwd: REPO,
    env: {
      ...process.env,
      PORT: String(port),
      SITE_DB_DIR: setupDir,
      RATE_LIMIT_PER_MIN: '1000',
      TRUST_PROXY: '',
      PUBLIC_BASE_URL: 'https://omniatax.io',
      STRIPE_SECRET_KEY: 'sk_test_fake',
      STRIPE_API_BASE: fakeBase,
      STRIPE_PRICE_ID: '',
      STRIPE_METER_EVENT_NAME: '',
      STRIPE_METER_EVENT: '',
      STRIPE_PAYMENT_METHOD_TYPES: 'card,us_bank_account',
      STRIPE_WEBHOOK_SECRET: '',
      STRIPE_ALLOW_LIVE: '',
      RESEND_API_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  proc.stdout?.on('data', (d) => { log += d; });
  proc.stderr?.on('data', (d) => { log += d; });
  try {
    let up = false;
    for (let i = 0; i < 80; i++) {
      try { if ((await fetch(`${base}/v1/health`)).ok) { up = true; break; } } catch { /* not up */ }
      await new Promise((r) => setTimeout(r, 150));
    }
    assert.equal(up, true, 'setup server did not become healthy\n' + log);
    const setup = await fetch(`${base}/api/payment-setup`, { method: 'POST', headers: bearer(SESSION) });
    assert.equal(setup.status, 200, await setup.clone().text());
    const body = await setup.json() as { metered?: boolean; checkoutUrl?: string };
    assert.equal(body.metered, false);
    assert.match(body.checkoutUrl ?? '', /cs_setup/);
    const params = new URLSearchParams(posted);
    assert.equal(params.get('mode'), 'setup');
    assert.equal(posted.includes('payment_method_types'), false);
    for (const key of params.keys()) {
      assert.equal(key === 'payment_method_types' || key.startsWith('payment_method_types['), false);
    }
  } finally {
    proc.kill('SIGKILL');
    fake.close();
    rmSync(setupDir, { recursive: true, force: true });
  }
});

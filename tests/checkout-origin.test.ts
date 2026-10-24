import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertProductionCheckoutUrls,
  createSetupCheckoutSession,
  createSubscriptionCheckoutSession,
  resolveCheckoutOrigin,
} from '../api/stripe.ts';

/**
 * Production Checkout return URLs are never localhost. PUBLIC_BASE_URL wins
 * when it is public https; otherwise the request host is used. Development
 * still falls back to localhost.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 'sk_test_origin_fixture';
const PLANTED = 'supersecret-token';

const savedEnv: Record<string, string | undefined> = {};
const ENV_KEYS = ['NODE_ENV', 'RENDER', 'TRUST_PROXY', 'PUBLIC_BASE_URL', 'STRIPE_SECRET_KEY', 'STRIPE_PRICE_ID', 'STRIPE_METER_EVENT_NAME'];

before(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
});
after(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

function useEnv(vars: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function devEnv(): void {
  useEnv({ NODE_ENV: 'development', RENDER: undefined, TRUST_PROXY: undefined, PUBLIC_BASE_URL: undefined });
}

test('development keeps the localhost fallback', () => {
  devEnv();
  const none = resolveCheckoutOrigin(undefined, 4323);
  assert.equal(none.ok && none.origin, 'http://localhost:4323');
  useEnv({ PUBLIC_BASE_URL: 'http://localhost:9999/' });
  const local = resolveCheckoutOrigin({ headers: { host: 'omniatax.io' } }, 4323);
  assert.equal(local.ok && local.origin, 'http://localhost:9999');
});

test('production uses a public https PUBLIC_BASE_URL', () => {
  useEnv({ NODE_ENV: 'production', RENDER: undefined, TRUST_PROXY: undefined, PUBLIC_BASE_URL: 'https://omniatax.io/' });
  const fromNode = resolveCheckoutOrigin({ headers: { host: 'localhost:4323' } }, 4323);
  assert.equal(fromNode.ok && fromNode.origin, 'https://omniatax.io');

  useEnv({ NODE_ENV: 'development', RENDER: 'true', PUBLIC_BASE_URL: 'https://omniatax.io' });
  const fromRender = resolveCheckoutOrigin(undefined, 4323);
  assert.equal(fromRender.ok && fromRender.origin, 'https://omniatax.io');
});

test('production rejects a PUBLIC_BASE_URL that is not public https and does not echo it', () => {
  const bad = [
    'http://localhost:4323',
    'http://omniatax.io',
    'https://127.0.0.1',
    'https://localhost',
    `https://user:${PLANTED}@omniatax.io`,
  ];
  for (const value of bad) {
    useEnv({ NODE_ENV: 'production', RENDER: undefined, PUBLIC_BASE_URL: value });
    const out = resolveCheckoutOrigin({ headers: { host: 'omniatax.io', 'x-forwarded-proto': 'https' } }, 4323);
    assert.equal(out.ok, false);
    if (!out.ok) {
      assert.match(out.error, /PUBLIC_BASE_URL/);
      assert.match(out.error, /Render dashboard/);
      assert.match(out.error, /not applied automatically/);
      assert.equal(out.error.includes(PLANTED), false);
      assert.equal(out.error.includes(value), false);
      assert.equal(out.error.includes('sk_'), false);
    }
  }
});

test('production derives the origin from x-forwarded-proto and host on Render', () => {
  useEnv({ NODE_ENV: undefined, RENDER: 'true', TRUST_PROXY: undefined, PUBLIC_BASE_URL: undefined });
  const forwardedHost = resolveCheckoutOrigin({
    headers: { host: '127.0.0.1:10000', 'x-forwarded-proto': 'https', 'x-forwarded-host': 'omniatax.io' },
  }, 10000);
  assert.equal(forwardedHost.ok && forwardedHost.origin, 'https://omniatax.io');

  const hostHeader = resolveCheckoutOrigin({
    headers: { host: 'omniatax.io', 'x-forwarded-proto': 'https,http' },
  }, 10000);
  assert.equal(hostHeader.ok && hostHeader.origin, 'https://omniatax.io');
});

test('forwarded headers are ignored unless Render or TRUST_PROXY is set', () => {
  useEnv({ NODE_ENV: 'production', RENDER: undefined, TRUST_PROXY: undefined, PUBLIC_BASE_URL: undefined });
  const spoofed = resolveCheckoutOrigin({
    headers: { host: '127.0.0.1:4323', 'x-forwarded-proto': 'https', 'x-forwarded-host': 'omniatax.io' },
  }, 4323);
  assert.equal(spoofed.ok, false);

  useEnv({ TRUST_PROXY: '1' });
  const trusted = resolveCheckoutOrigin({
    headers: { host: '127.0.0.1:4323', 'x-forwarded-proto': 'https', 'x-forwarded-host': 'pay.example' },
  }, 4323);
  assert.equal(trusted.ok && trusted.origin, 'https://pay.example');
});

test('production fails loudly when neither PUBLIC_BASE_URL nor the request host is public https', () => {
  useEnv({ NODE_ENV: 'production', RENDER: 'true', TRUST_PROXY: undefined, PUBLIC_BASE_URL: undefined });
  const missing = resolveCheckoutOrigin(undefined, 4323);
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.match(missing.error, /cannot be localhost/);
    assert.match(missing.error, /Render dashboard/);
    assert.equal(missing.error.includes(SECRET), false);
  }
  const httpHost = resolveCheckoutOrigin({
    headers: { host: 'omniatax.io', 'x-forwarded-proto': 'http' },
  }, 4323);
  assert.equal(httpHost.ok, false);
  const localHost = resolveCheckoutOrigin({
    headers: { host: 'localhost:4323', 'x-forwarded-proto': 'https' },
  }, 4323);
  assert.equal(localHost.ok, false);
});

test('an encrypted request host is used when no forwarded headers are trusted', () => {
  useEnv({ NODE_ENV: 'production', RENDER: undefined, TRUST_PROXY: undefined, PUBLIC_BASE_URL: undefined });
  const out = resolveCheckoutOrigin({ headers: { host: 'omniatax.io' }, socket: { encrypted: true } }, 443);
  assert.equal(out.ok && out.origin, 'https://omniatax.io');
});

test('production Checkout is not created when the return URLs are localhost', async () => {
  useEnv({
    NODE_ENV: 'production', RENDER: undefined, PUBLIC_BASE_URL: undefined,
    STRIPE_SECRET_KEY: SECRET, STRIPE_PRICE_ID: 'price_origin',
  });
  let calls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => { calls += 1; throw new Error('stripe was called'); }) as typeof fetch;
  try {
    const refused = async (run: () => Promise<unknown>) => {
      try {
        await run();
      } catch (err) {
        assert.ok(err instanceof Error);
        assert.match(err.message, /must not be localhost/);
        assert.equal(err.message.includes(SECRET), false);
        return;
      }
      assert.fail('Checkout session was created');
    };
    await refused(() => createSubscriptionCheckoutSession({
      customerId: 'cus', apiKeyId: 'a@b.co', priceId: 'price_origin',
      successUrl: 'http://localhost:4323/ok?session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'http://localhost:4323/cancel',
    }));
    await refused(() => createSetupCheckoutSession({
      customerId: 'cus', apiKeyId: 'a@b.co',
      successUrl: 'https://127.0.0.1/ok', cancelUrl: 'https://omniatax.io/cancel',
    }));
    assert.equal(calls, 0);
    assert.throws(() => assertProductionCheckoutUrls('https://omniatax.io/ok', 'http://omniatax.io/cancel'), /must not be localhost/);
  } finally {
    globalThis.fetch = realFetch;
    useEnv({ NODE_ENV: 'development', STRIPE_SECRET_KEY: undefined, STRIPE_PRICE_ID: undefined });
  }
});

const freePort = () => new Promise<number>((resolve) => {
  const srv = createNetServer();
  srv.listen(0, '127.0.0.1', () => { const { port } = srv.address() as { port: number }; srv.close(() => resolve(port)); });
});

function seed(dir: string): void {
  const now = new Date().toISOString();
  const email = 'live@origin.test';
  writeFileSync(join(dir, 'db.json'), JSON.stringify({
    accounts: {
      [email]: {
        name: 'Origin', email, company: 'Origin LLC', phone: '555-0100',
        code: null, codeExpiresAt: null, codeRequestedAt: null, emailVerifiedAt: now,
        sessionToken: 'sess_origin', sessionExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        stage: 'payment_pending', createdAt: now,
      },
    },
    scenarios: {}, acceptances: [], paymentMethods: {},
    subscriptions: {
      [email]: {
        email, legalName: 'Origin LLC', billingContact: 'Origin', billingEmail: email, address: '1 Main St',
        expectedEmployees: 1, payFrequency: 'biweekly', rooftop: false, estimatedAnnual: 0,
        status: 'payment_pending', trialStartsAt: now, trialEndsAt: now, termMonths: 12, termEndsAt: now,
        createdAt: now, activatedAt: null, stripeCustomerId: null, stripeSubscriptionId: null, suspended: false, suspendedReason: null,
      },
    },
    keys: {}, usage: [], estimates: [], termsQuotes: {}, meterQueue: [], rateLimits: {}, processedStripeEvents: [],
  }));
}

async function boot(extra: Record<string, string>): Promise<{
  base: string;
  log: () => string;
  calls: () => string[];
  stop: () => void;
}> {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'checkout-origin-'));
  seed(dir);
  const calls: string[] = [];
  const fake: Server = createServer((req, res) => {
    const url = req.url ?? '';
    calls.push(`${req.method} ${url}`);
    const send = (body: unknown) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'GET' && url.startsWith('/v1/prices/')) return send({ id: 'price_origin', recurring: { usage_type: 'metered' } });
    if (req.method === 'POST' && url === '/v1/customers') return send({ id: 'cus_origin' });
    if (req.method === 'POST' && url === '/v1/checkout/sessions') {
      let raw = '';
      req.on('data', (c) => { raw += c; });
      req.on('end', () => {
        calls.push(raw);
        send({ id: 'cs_origin', url: 'https://checkout.test/cs_origin' });
      });
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end('{}');
  });
  await new Promise<void>((resolve) => fake.listen(0, '127.0.0.1', () => resolve()));
  const fakeBase = `http://127.0.0.1:${(fake.address() as { port: number }).port}`;
  let log = '';
  const child: ChildProcess = spawn('node', ['site/server.ts'], {
    cwd: REPO,
    env: {
      ...process.env,
      PORT: String(port),
      SITE_DB_DIR: dir,
      RATE_LIMIT_PER_MIN: '1000',
      TRUST_PROXY: '',
      RENDER: '',
      NODE_ENV: 'development',
      PUBLIC_BASE_URL: '',
      STRIPE_SECRET_KEY: SECRET,
      STRIPE_API_BASE: fakeBase,
      STRIPE_PRICE_ID: 'price_origin',
      STRIPE_METER_EVENT_NAME: 'paycheck_calculated',
      STRIPE_METER_EVENT: '',
      STRIPE_WEBHOOK_SECRET: '',
      STRIPE_ALLOW_LIVE: '',
      RESEND_API_KEY: '',
      ...extra,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (d) => { log += d; });
  child.stderr?.on('data', (d) => { log += d; });
  const base = `http://127.0.0.1:${port}`;
  let up = false;
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${base}/v1/health`)).ok) { up = true; break; } } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!up) {
    child.kill('SIGKILL');
    fake.close();
    throw new Error('server did not become healthy\n' + log);
  }
  return {
    base,
    log: () => log,
    calls: () => calls,
    stop: () => { child.kill('SIGKILL'); fake.close(); rmSync(dir, { recursive: true, force: true }); },
  };
}

async function paymentSetup(base: string, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${base}/api/payment-setup`, {
    method: 'POST',
    headers: { Authorization: 'Bearer sess_origin', ...headers },
  });
}

test('the site uses PUBLIC_BASE_URL for Checkout in production', async () => {
  const srv = await boot({ NODE_ENV: 'production', PUBLIC_BASE_URL: 'https://omniatax.io' });
  try {
    const res = await paymentSetup(srv.base);
    assert.equal(res.status, 200, await res.clone().text());
    const posted = srv.calls().find((c) => c.includes('success_url=')) ?? '';
    const params = new URLSearchParams(posted);
    assert.equal(params.get('success_url'), 'https://omniatax.io/signup/payment?setup=ok&session_id={CHECKOUT_SESSION_ID}');
    assert.equal(params.get('cancel_url'), 'https://omniatax.io/signup/payment?setup=cancelled');
    assert.equal(posted.includes(SECRET), false);
  } finally {
    srv.stop();
  }
});

test('the site refuses a localhost PUBLIC_BASE_URL in production and does not create a session', async () => {
  const srv = await boot({ NODE_ENV: 'production', PUBLIC_BASE_URL: `http://user:${PLANTED}@localhost:4323` });
  try {
    const res = await paymentSetup(srv.base);
    assert.equal(res.status, 500);
    const body = await res.json() as { error?: string; code?: string };
    assert.equal(body.code, 'checkout_origin_invalid');
    assert.match(body.error ?? '', /must not be localhost/);
    assert.match(body.error ?? '', /not applied automatically/);
    assert.equal((body.error ?? '').includes(PLANTED), false);
    assert.equal((body.error ?? '').includes(SECRET), false);
    assert.equal(srv.log().includes(SECRET), false);
    assert.equal(srv.log().includes(PLANTED), false);
    assert.equal(srv.calls().some((c) => c.startsWith('POST /v1/checkout')), false);
    assert.equal(srv.calls().some((c) => c.startsWith('POST /v1/customers')), false);
  } finally {
    srv.stop();
  }
});

test('the site derives Checkout URLs from forwarded host on Render', async () => {
  const srv = await boot({ NODE_ENV: 'production', RENDER: 'true', PUBLIC_BASE_URL: '' });
  try {
    const res = await paymentSetup(srv.base, { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'omniatax.io' });
    assert.equal(res.status, 200, await res.clone().text());
    const posted = srv.calls().find((c) => c.includes('success_url=')) ?? '';
    const params = new URLSearchParams(posted);
    assert.equal(params.get('success_url'), 'https://omniatax.io/signup/payment?setup=ok&session_id={CHECKOUT_SESSION_ID}');
    assert.equal(params.get('cancel_url'), 'https://omniatax.io/signup/payment?setup=cancelled');
    assert.equal(posted.includes('localhost'), false);
  } finally {
    srv.stop();
  }
});

test('the site does not create Checkout when production has no public origin', async () => {
  const srv = await boot({ NODE_ENV: 'production', PUBLIC_BASE_URL: '', RENDER: '' });
  try {
    const res = await paymentSetup(srv.base);
    assert.equal(res.status, 500);
    const body = await res.json() as { error?: string; code?: string };
    assert.equal(body.code, 'checkout_origin_invalid');
    assert.match(body.error ?? '', /cannot be localhost/);
    assert.equal((body.error ?? '').includes(SECRET), false);
    assert.equal(srv.calls().some((c) => c.startsWith('POST /v1/')), false);
  } finally {
    srv.stop();
  }
});

test('development still creates Checkout with a localhost return URL', async () => {
  const srv = await boot({ NODE_ENV: 'development', PUBLIC_BASE_URL: '', RENDER: '' });
  try {
    const res = await paymentSetup(srv.base);
    assert.equal(res.status, 200, await res.clone().text());
    const posted = srv.calls().find((c) => c.includes('success_url=')) ?? '';
    assert.match(posted, /success_url=http%3A%2F%2Flocalhost%3A\d+%2Fsignup%2Fpayment/);
  } finally {
    srv.stop();
  }
});

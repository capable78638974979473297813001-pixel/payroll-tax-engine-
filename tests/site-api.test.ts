import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * End-to-end test of the live Omnia API surface: it boots site/server.ts
 * as a real child process against an isolated data dir with a seeded API
 * key, and drives HTTP requests through the whole path — auth, rate
 * limiting, validation, calculation, and metering.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLAINTEXT_KEY = 'sk_test_e2e_integration_key_abcdef';
const KEY_HASH = createHash('sha256').update(PLAINTEXT_KEY).digest('hex');
// A second key whose account carries a Stripe subscription, for the
// suspend/reactivate (billing webhook) tests.
const BILL_KEY = 'sk_test_e2e_billing_key_ghijkl';
const BILL_HASH = createHash('sha256').update(BILL_KEY).digest('hex');
const BILL_CUSTOMER = 'cus_e2e_billing';
const WEBHOOK_SECRET = 'whsec_e2e_secret';
// A key whose account never saved a card or bank account.
const NOPAY_KEY = 'sk_test_e2e_nopay_key_mnopqr';
const NOPAY_HASH = createHash('sha256').update(NOPAY_KEY).digest('hex');
const PORT = 4600 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}`;
const RATE_LIMIT = 5;

let dir: string;
let child: ChildProcess;

function seedDb(dataDir: string): void {
  mkdirSync(dataDir, { recursive: true });
  const future = new Date(Date.now() + 7 * 864e5).toISOString();
  const mkKey = (hash: string, plain: string, email: string) => ({
    keyHash: hash, keyPrefix: plain.slice(0, 14),
    ownerEmail: email, ownerName: 'E2E', company: 'E2E Co',
    plan: 'evaluation', createdAt: new Date().toISOString(), expiresAt: future,
    isActive: true, lastUsedAt: null,
  });
  const db = {
    accounts: {}, acceptances: [],
    // Keys only work for accounts with a card or bank account on file.
    paymentMethods: Object.fromEntries(['e2e@example.com', 'bill@example.com'].map((email) => [email, {
      email, kind: 'card', processorRef: 'pm_e2e', last4: '4242', brand: 'visa', attachedAt: new Date().toISOString(),
    }])),
    subscriptions: {
      // The billing-key account is subscribed (customer on file), not suspended.
      'bill@example.com': {
        email: 'bill@example.com', legalName: 'Bill Co', billingContact: '', billingEmail: 'bill@example.com',
        address: '', expectedEmployees: 10, payFrequency: 'biweekly', rooftop: false, estimatedAnnual: 0,
        status: 'trialing', trialStartsAt: null, trialEndsAt: future, termMonths: 12, termEndsAt: future,
        createdAt: new Date().toISOString(), activatedAt: null,
        stripeCustomerId: BILL_CUSTOMER, stripeSubscriptionId: 'sub_e2e', suspended: false, suspendedReason: null,
      },
    },
    keys: {
      [KEY_HASH]: mkKey(KEY_HASH, PLAINTEXT_KEY, 'e2e@example.com'),
      [BILL_HASH]: mkKey(BILL_HASH, BILL_KEY, 'bill@example.com'),
      [NOPAY_HASH]: mkKey(NOPAY_HASH, NOPAY_KEY, 'nopay@example.com'),
    },
    usage: [], estimates: [],
  };
  writeFileSync(join(dataDir, 'db.json'), JSON.stringify(db), 'utf8');
}

async function waitForHealth(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('server did not become healthy in time');
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${BASE}/api/paycheck`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PLAINTEXT_KEY}`, 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

// Send a signed Stripe webhook to the site's endpoint.
const sendWebhook = (type: string, customer: string, sign = true) => {
  const body = JSON.stringify({ type, data: { object: { customer } } });
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', WEBHOOK_SECRET).update(`${t}.${body}`).digest('hex');
  return fetch(`${BASE}/api/billing/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sign ? `t=${t},v1=${v1}` : 't=1,v1=deadbeef' },
    body,
  });
};
const postWith = (key: string, body: unknown) =>
  fetch(`${BASE}/api/paycheck`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const validBody = () => ({
  checkDate: '2026-06-15',
  payFrequency: 'biweekly',
  earnings: [{ code: 'REG', category: 'regular', amount: 300000 }],
  deductions: [],
  federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
  ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
  workState: { code: 'OH' },
});

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'site-api-'));
  seedDb(dir);
  child = spawn('node', ['site/server.ts'], {
    cwd: REPO,
    env: {
      ...process.env, PORT: String(PORT), SITE_DB_DIR: dir,
      RATE_LIMIT_PER_MIN: String(RATE_LIMIT), STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    },
    stdio: 'ignore',
  });
  await waitForHealth();
});

after(() => {
  child?.kill('SIGKILL');
  rmSync(dir, { recursive: true, force: true });
});

describe('Omnia API (end to end)', () => {
  test('GET /api/health reports ok, a version, and jurisdiction count', async () => {
    const r = await fetch(`${BASE}/api/health`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('x-omnia-version'), '1.0.0');
    const j = await r.json();
    assert.equal(j.status, 'ok');
    assert.ok(j.states > 0);
  });

  test('a key for an account with no card or bank account on file is 402', async () => {
    const r = await postWith(NOPAY_KEY, validBody());
    assert.equal(r.status, 402);
    assert.equal((await r.json()).code, 'payment_method_required');
  });

  test('a missing key is 401 missing_key', async () => {
    const r = await fetch(`${BASE}/api/paycheck`, { method: 'POST', body: '{}' });
    assert.equal(r.status, 401);
    assert.equal((await r.json()).code, 'missing_key');
  });

  test('an unknown key is 401 invalid_key', async () => {
    const r = await post(validBody(), { Authorization: 'Bearer sk_test_not_a_real_key' });
    assert.equal(r.status, 401);
    assert.equal((await r.json()).code, 'invalid_key');
  });

  test('malformed JSON is 400 invalid_json', async () => {
    const r = await post('{ not json ');
    assert.equal(r.status, 400);
    assert.equal((await r.json()).code, 'invalid_json');
  });

  test('a request that fails validation is 422 invalid_input with field details', async () => {
    const r = await post({});
    assert.equal(r.status, 422);
    const j = await r.json();
    assert.equal(j.code, 'invalid_input');
    assert.ok(Array.isArray(j.details) && j.details.length > 0);
    assert.ok(j.requestId.startsWith('req_'));
  });

  test('an unknown state is caught as a validation error, not an engine crash', async () => {
    const body = validBody();
    body.workState = { code: 'ZZ' };
    const r = await post(body);
    assert.equal(r.status, 422);
    const j = await r.json();
    assert.equal(j.code, 'invalid_input');
    assert.ok(j.details.some((d: { path: string }) => d.path === 'workState.code'));
  });

  test('a valid request returns 200 with a real result and rate-limit headers', async () => {
    const r = await post(validBody());
    assert.equal(r.status, 200);
    assert.ok(r.headers.get('ratelimit-limit'));
    assert.ok(r.headers.get('x-request-id'));
    const j = await r.json();
    assert.equal(typeof j.result.netPay, 'number');
    assert.equal(j.result.grossPay, 300000);
    assert.ok(j.result.taxes.length > 0);
  });

  test('GET /api/states returns the computable jurisdictions', async () => {
    const r = await fetch(`${BASE}/api/states`);
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.ok(Array.isArray(j.states) && j.states.length > 0);
    assert.ok(j.states.every((s: { code: string; name: string }) => s.code && s.name));
  });

  test('a forged webhook signature is rejected and changes nothing', async () => {
    const r = await sendWebhook('invoice.payment_failed', BILL_CUSTOMER, /* sign */ false);
    assert.equal(r.status, 400);
    // the billing key still works
    const c = await postWith(BILL_KEY, validBody());
    assert.equal(c.status, 200);
    await c.arrayBuffer();
  });

  test('a signed payment_failed webhook suspends the account key (402), a paid webhook reactivates it', async () => {
    // suspend
    let w = await sendWebhook('invoice.payment_failed', BILL_CUSTOMER);
    assert.equal(w.status, 200);
    assert.equal((await w.json()).matched, true);

    const suspended = await postWith(BILL_KEY, validBody());
    assert.equal(suspended.status, 402);
    assert.equal((await suspended.json()).code, 'account_suspended');

    // reactivate
    w = await sendWebhook('invoice.paid', BILL_CUSTOMER);
    assert.equal(w.status, 200);
    const back = await postWith(BILL_KEY, validBody());
    assert.equal(back.status, 200);
    await back.arrayBuffer();
  });

  test('the per-key rate limit eventually returns 429 with Retry-After', async () => {
    let saw429 = false;
    let retryAfter = '';
    for (let i = 0; i < RATE_LIMIT + 8; i++) {
      const r = await post(validBody());
      if (r.status === 429) {
        saw429 = true;
        retryAfter = r.headers.get('retry-after') ?? '';
        assert.equal((await r.json()).code, 'rate_limited');
        break;
      }
      await r.arrayBuffer(); // drain
    }
    assert.equal(saw429, true, 'expected a 429 once the per-minute budget was spent');
    assert.ok(Number(retryAfter) > 0);
  });
});

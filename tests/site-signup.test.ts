import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Signup is the only way to a key, and a key needs a card or bank account
 * on file. Boots site/server.ts against a local stand-in for Stripe's
 * Checkout API and walks the real flow: signup, email code, terms,
 * payment, key, calls. Also covers sign-in for returning customers and
 * every example the API console ships.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4900 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}`;
const EMAIL = 'jordan@acmepayroll.test';

const examples: { id: string; request: unknown }[] =
  JSON.parse(readFileSync(join(REPO, 'site/sandbox-examples.json'), 'utf8')).examples;

// Checkout sessions the fake Stripe knows, by id.
const card = { id: 'pm_card', type: 'card', card: { brand: 'visa', last4: '4242' } };
const sessions: Record<string, unknown> = {
  cs_open: { id: 'cs_open', status: 'open', customer: 'cus_1', metadata: { omnia_email: EMAIL } },
  cs_other: { id: 'cs_other', status: 'complete', customer: 'cus_2', metadata: { omnia_email: 'someone@else.test' },
    subscription: { id: 'sub_2', default_payment_method: card } },
  cs_nopm: { id: 'cs_nopm', status: 'complete', customer: 'cus_1', metadata: { omnia_email: EMAIL }, subscription: { id: 'sub_1' } },
  cs_ok: { id: 'cs_ok', status: 'complete', customer: 'cus_1', metadata: { omnia_email: EMAIL },
    subscription: { id: 'sub_1', default_payment_method: card } },
};

let dir: string;
let child: ChildProcess;
let stripe: Server;

const db = () => JSON.parse(readFileSync(join(dir, 'db.json'), 'utf8'));
const post = (path: string, body: unknown, token?: string) =>
  fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'site-signup-'));
  stripe = createServer((req, res) => {
    const m = /^\/v1\/checkout\/sessions\/([^?]+)/.exec(req.url ?? '');
    const s = m && sessions[m[1]];
    res.writeHead(s ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(s ?? { error: { message: 'No such checkout session' } }));
  });
  await new Promise<void>((r) => stripe.listen(0, '127.0.0.1', r));
  const stripePort = (stripe.address() as { port: number }).port;

  child = spawn('node', ['site/server.ts'], {
    cwd: REPO,
    env: {
      ...process.env, PORT: String(PORT), SITE_DB_DIR: dir, RATE_LIMIT_PER_MIN: '1000',
      STRIPE_SECRET_KEY: 'sk_test_fake', STRIPE_API_BASE: `http://127.0.0.1:${stripePort}`,
      STRIPE_PRICE_ID: '', RESEND_API_KEY: '', TRUST_PROXY: '',
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/v1/health`)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('server did not become healthy in time');
});

after(() => {
  child?.kill('SIGKILL');
  stripe?.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('signup: a key needs a card or bank account on file', () => {
  let session = '';
  let key = '';

  test('there are no anonymous keys', async () => {
    assert.equal((await fetch(`${BASE}/v1/sandbox-keys`, { method: 'POST' })).status, 404);
    assert.equal((await fetch(`${BASE}/api/sandbox-key`, { method: 'POST' })).status, 404);
  });

  test('signup sends a code; the code verifies the email and signs in', async () => {
    const r = await post('/api/signup', { name: 'Jordan Casey', email: EMAIL, company: 'Acme Payroll', phone: '555-123-4567' });
    assert.equal(r.status, 200);
    const code = db().accounts[EMAIL].code;
    assert.match(code, /^\d{6}$/);
    const v = await post('/api/verify-email', { email: EMAIL, code });
    assert.equal(v.status, 200);
    session = (await v.json()).sessionToken;
    assert.ok(session);
  });

  test('a verified account without a payment method gets no key', async () => {
    const r = await post('/api/issue-key', {}, session);
    assert.equal(r.status, 402);
    assert.equal((await r.json()).code, 'payment_method_required');
  });

  test('terms are signed, and the trial still cannot start without a payment method', async () => {
    const t = await post('/api/accept-terms', {
      agreed: true, signedName: 'Jordan Casey', legalName: 'Acme Payroll LLC', billingEmail: EMAIL,
      address: '120 Main St, Columbus OH 43215', expectedEmployees: 200, payFrequency: 'biweekly',
    }, session);
    assert.equal(t.status, 200);
    const s = await post('/api/start-trial', {}, session);
    assert.equal(s.status, 402);
    assert.equal((await post('/api/issue-key', {}, session)).status, 402);
  });

  test('an unfinished, foreign or card-less checkout does not unlock a key', async () => {
    const open = await post('/api/billing/return', { sessionId: 'cs_open' }, session);
    assert.equal(open.status, 402);
    assert.equal((await open.json()).code, 'checkout_not_complete');
    const other = await post('/api/billing/return', { sessionId: 'cs_other' }, session);
    assert.equal(other.status, 403);
    const nopm = await post('/api/billing/return', { sessionId: 'cs_nopm' }, session);
    assert.equal(nopm.status, 402);
    assert.equal(db().paymentMethods[EMAIL], undefined);
    assert.equal((await post('/api/issue-key', {}, session)).status, 402);
  });

  test('a completed checkout records the card, starts the trial and allows a key', async () => {
    const r = await post('/api/billing/return', { sessionId: 'cs_ok' }, session);
    assert.equal(r.status, 200);
    const pm = db().paymentMethods[EMAIL];
    assert.equal(pm.processorRef, 'pm_card');
    assert.equal(pm.last4, '4242');
    assert.equal(db().subscriptions[EMAIL].status, 'trialing');

    const k = await post('/api/issue-key', {}, session);
    assert.equal(k.status, 200);
    key = (await k.json()).key;
    assert.match(key, /^sk_test_/);
  });

  test('every console example calculates with the new key', async () => {
    assert.ok(examples.length >= 8);
    for (const ex of examples) {
      const r = await fetch(`${BASE}/v1/paycheck`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(ex.request),
      });
      const body = await r.json();
      assert.equal(r.status, 200, `${ex.id}: ${JSON.stringify(body).slice(0, 300)}`);
      assert.equal(r.headers.get('omnia-mode'), 'test');
      assert.ok(body.result.netPay > 0, ex.id);
    }
  });

  test('GET /v1/me describes the key', async () => {
    const r = await fetch(`${BASE}/v1/me`, { headers: { Authorization: `Bearer ${key}` } });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.mode, 'test');
    assert.equal(j.callsToday, examples.length);
    assert.equal((await fetch(`${BASE}/v1/me`)).status, 401);
  });
});

describe('sign-in for returning customers', () => {
  test('an unknown email gets the same answer and no account', async () => {
    const r = await post('/api/signin', { email: 'nobody@nowhere.test' });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).ok, true);
    assert.equal(db().accounts['nobody@nowhere.test'], undefined);
  });

  test('a known email gets a new code that signs in', async () => {
    const before = db().accounts[EMAIL].sessionToken;
    assert.equal((await post('/api/signin', { email: EMAIL.toUpperCase() })).status, 200);
    const code = db().accounts[EMAIL].code;
    assert.match(code, /^\d{6}$/);
    const v = await post('/api/verify-email', { email: EMAIL, code });
    assert.equal(v.status, 200);
    const token = (await v.json()).sessionToken;
    assert.notEqual(token, before);
    const a = await fetch(`${BASE}/api/account`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal((await a.json()).stage, 'trialing');
  });

  test('wrong codes burn the code after a few tries', async () => {
    // Past the resend cooldown is not needed: the code from the last test
    // was used, so this request issues a fresh one.
    await post('/api/signin', { email: EMAIL });
    const code = db().accounts[EMAIL].code;
    const wrong = code === '000000' ? '111111' : '000000';
    let last: Response | undefined;
    for (let i = 0; i < 9; i++) last = await post('/api/verify-email', { email: EMAIL, code: wrong });
    assert.match((await last!.json()).error, /Too many wrong codes/);
    assert.equal((await post('/api/verify-email', { email: EMAIL, code })).status, 401);
  });

  test('the console and its examples are served', async () => {
    for (const path of ['/console', '/sandbox']) assert.equal((await fetch(BASE + path)).status, 200, path);
    assert.equal((await fetch(`${BASE}/sandbox-examples.json`)).status, 200);
  });
});

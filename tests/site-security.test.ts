import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Regression tests for the account-security and billing findings: codes
 * kept out of logs, signup rate limits, uniform verification errors,
 * HttpOnly sessions, terms bound to a server quote, one trial per
 * subscription, cancellation that a paid invoice can't undo, and meter
 * events that are queued rather than lost when Stripe fails.
 *
 * Boots site/server.ts with email and metered billing switched ON, against
 * local stand-ins for Resend and Stripe.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5300 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}`;
const EMAIL = 'casey@secure.test';
const WEBHOOK_SECRET = 'whsec_security';

const card = { id: 'pm_card', type: 'card', card: { brand: 'visa', last4: '4242' } };
const checkout = { id: 'cs_ok', status: 'complete', customer: 'cus_sec', metadata: { omnia_email: EMAIL },
  subscription: { id: 'sub_sec', default_payment_method: card } };

let dir: string;
let child: ChildProcess;
let fakes: Server;
let output = '';
const mailed: Array<{ to: string; subject: string }> = [];
const meterEvents: Array<Record<string, string>> = [];
let meterFails = true;

const db = () => JSON.parse(readFileSync(join(dir, 'db.json'), 'utf8'));
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const codeFor = (email: string) => {
  const m = [...mailed].reverse().find((x) => x.to === email);
  return m ? /^(\d{6}) /.exec(m.subject)![1] : '';
};
const sendWebhook = (type: string, customer: string) => {
  const body = JSON.stringify({ type, data: { object: { customer } } });
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', WEBHOOK_SECRET).update(`${t}.${body}`).digest('hex');
  return fetch(`${BASE}/api/billing/webhook`, { method: 'POST', headers: { 'Stripe-Signature': `t=${t},v1=${v1}` }, body });
};
const paycheckBody = {
  checkDate: '2026-06-15', payFrequency: 'biweekly',
  earnings: [{ code: 'REG', category: 'regular', amount: 300000 }], deductions: [],
  federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
  ytd: { socialSecurity: 0, medicare: 0, futa: 0 }, workState: { code: 'OH' },
};
const until = async (cond: () => boolean) => {
  for (let i = 0; i < 40 && !cond(); i++) await new Promise((r) => setTimeout(r, 50));
};

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'site-security-'));
  fakes = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const url = req.url ?? '';
      const send = (status: number, body: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (url === '/emails') {
        const b = JSON.parse(raw);
        mailed.push({ to: b.to[0], subject: b.subject });
        return send(200, { id: 'email_1' });
      }
      if (url.startsWith('/v1/checkout/sessions/cs_ok')) return send(200, checkout);
      if (url === '/v1/billing/meter_events') {
        meterEvents.push(Object.fromEntries(new URLSearchParams(raw)));
        return meterFails ? send(500, { error: { message: 'Stripe is having a moment' } }) : send(200, { identifier: 'ok' });
      }
      send(404, { error: { message: 'no such route' } });
    });
  });
  await new Promise<void>((r) => fakes.listen(0, '127.0.0.1', r));
  const fakeBase = `http://127.0.0.1:${(fakes.address() as { port: number }).port}`;

  child = spawn('node', ['site/server.ts'], {
    cwd: REPO,
    env: {
      ...process.env, PORT: String(PORT), SITE_DB_DIR: dir, RATE_LIMIT_PER_MIN: '1000', TRUST_PROXY: '',
      RESEND_API_KEY: 're_test', RESEND_API_BASE: fakeBase,
      STRIPE_SECRET_KEY: 'sk_test_fake', STRIPE_API_BASE: fakeBase, STRIPE_PRICE_ID: 'price_metered',
      STRIPE_METER_EVENT: 'omnia_api_call', STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, SIGNUP_PER_HOUR: '4',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout!.on('data', (d) => { output += d; });
  child.stderr!.on('data', (d) => { output += d; });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/v1/health`)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('server did not become healthy in time');
});

after(() => {
  child?.kill('SIGKILL');
  fakes?.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('account security', () => {
  let session = '';
  let cookie = '';

  test('the old standalone reference page is gone: its URLs redirect to the docs', async () => {
    for (const path of ['/reference', '/reference.html', '/api-reference']) {
      const r = await fetch(BASE + path, { redirect: 'manual' });
      assert.equal(r.status, 301, path);
      assert.equal(r.headers.get('location'), '/docs');
    }
    const home = await (await fetch(BASE + '/')).text();
    assert.match(home, /\/tokens\.css/); // the design B home page is the main site
    assert.doesNotMatch(home, /IBM Plex Mono/);
  });

  test('with email on, the code is emailed and never written to the logs', async () => {
    const r = await post('/api/signup', { name: 'Casey Rivers', email: EMAIL, company: 'Secure Payroll', phone: '555-000-1111' });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).emailSent, true);
    const code = codeFor(EMAIL);
    assert.match(code, /^\d{6}$/);
    assert.ok(!output.includes(code), 'code leaked to server output');
    assert.ok(!output.includes(EMAIL), 'email leaked to server output');
    assert.ok(!output.includes('Casey Rivers'), 'name leaked to server output');
  });

  test('verification failures look the same for unknown and known addresses', async () => {
    const unknown = await post('/api/verify-email', { email: 'ghost@nowhere.test', code: '123456' });
    const wrong = await post('/api/verify-email', { email: EMAIL, code: codeFor(EMAIL) === '000000' ? '111111' : '000000' });
    assert.equal(unknown.status, 401);
    assert.equal(wrong.status, 401);
    assert.deepEqual(await unknown.json(), await wrong.json());
    assert.equal(db().accounts['ghost@nowhere.test'], undefined);
  });

  test('verifying sets an HttpOnly session cookie that authenticates the console', async () => {
    const v = await post('/api/verify-email', { email: EMAIL, code: codeFor(EMAIL) });
    assert.equal(v.status, 200);
    session = (await v.json()).sessionToken;
    const setCookie = v.headers.get('set-cookie') ?? '';
    assert.match(setCookie, /omnia_session=/);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Lax/);
    cookie = setCookie.split(';')[0];
    const a = await fetch(`${BASE}/api/account`, { headers: { Cookie: cookie } });
    assert.equal(a.status, 200);
    assert.equal((await a.json()).email, EMAIL);
  });

  test('terms acceptance is bound to the server-issued quote', async () => {
    const signer = { agreed: true, signedName: 'Casey Rivers', legalName: 'Secure Payroll LLC', billingEmail: EMAIL, address: '1 Main St' };
    const missing = await post('/api/accept-terms', { ...signer, expectedEmployees: 5 }, bearer(session));
    assert.equal(missing.status, 400);
    assert.equal((await missing.json()).code, 'quote_required');
    const forged = await post('/api/accept-terms', { ...signer, quoteId: 'tq_forged' }, bearer(session));
    assert.equal((await forged.json()).code, 'quote_invalid');

    const terms = await (await fetch(`${BASE}/api/terms?employees=50&payFrequency=weekly&rooftop=false`, { headers: bearer(session) })).json();
    const tampered = await post('/api/accept-terms', { ...signer, quoteId: terms.quoteId, expectedEmployees: 1 }, bearer(session));
    assert.equal(tampered.status, 409);
    assert.equal((await tampered.json()).code, 'quote_mismatch');

    const ok = await post('/api/accept-terms', { ...signer, quoteId: terms.quoteId }, bearer(session));
    assert.equal(ok.status, 200);
    const acc = db().acceptances.at(-1);
    assert.equal(acc.disclosed.expectedEmployees, 50);
    assert.equal(acc.disclosed.payFrequency, 'weekly');
    assert.equal(acc.disclosed.trialEndsAt, terms.trialEndsAt);

    const replay = await post('/api/accept-terms', { ...signer, quoteId: terms.quoteId }, bearer(session));
    assert.equal((await replay.json()).code, 'quote_used');
  });

  test('terms quotes are bounded per account however often the terms reload', async () => {
    for (let i = 0; i < 30; i++) await fetch(`${BASE}/api/terms?employees=${i + 1}`, { headers: bearer(session) });
    const open = Object.values(db().termsQuotes as Record<string, { email: string; acceptedAt: string | null }>)
      .filter((q) => q.email === EMAIL && !q.acceptedAt);
    assert.equal(open.length, 20);
  });

  test('the trial starts once; calling start-trial again does not move its dates', async () => {
    const r = await post('/api/billing/return', { sessionId: 'cs_ok' }, bearer(session));
    assert.equal(r.status, 200);
    const before = db().subscriptions[EMAIL];
    assert.equal(before.status, 'trialing');
    await new Promise((res) => setTimeout(res, 20));
    for (let i = 0; i < 3; i++) assert.equal((await post('/api/start-trial', {}, bearer(session))).status, 200);
    const afterSub = db().subscriptions[EMAIL];
    assert.equal(afterSub.trialStartsAt, before.trialStartsAt);
    assert.equal(afterSub.trialEndsAt, before.trialEndsAt);
    assert.equal(afterSub.termEndsAt, before.termEndsAt);
    // Re-signing terms can't reset a subscription that already started.
    const terms = await (await fetch(`${BASE}/api/terms?employees=50&payFrequency=weekly`, { headers: bearer(session) })).json();
    const again = await post('/api/accept-terms', {
      agreed: true, signedName: 'Casey Rivers', legalName: 'Secure Payroll LLC', billingEmail: EMAIL, address: '1 Main St', quoteId: terms.quoteId,
    }, bearer(session));
    assert.equal((await again.json()).code, 'already_subscribed');
  });

  test('a failed Stripe meter report stays queued instead of being lost', async () => {
    const k = await post('/api/issue-key', {}, bearer(session));
    const key = (await k.json()).key;
    const r = await fetch(`${BASE}/v1/paycheck`, {
      method: 'POST', headers: { ...bearer(key), 'Content-Type': 'application/json' }, body: JSON.stringify(paycheckBody),
    });
    assert.equal(r.status, 200);
    const requestId = r.headers.get('x-request-id');
    await until(() => (db().meterQueue[0]?.attempts ?? 0) > 0);
    const q = db().meterQueue;
    assert.equal(q.length, 1);
    assert.equal(q[0].identifier, requestId);
    assert.equal(q[0].customerId, 'cus_sec');
    assert.ok(q[0].attempts >= 1);
    assert.match(q[0].lastError, /Stripe is having a moment/);
    // The attempt carried the idempotency identifier and original timestamp.
    assert.equal(meterEvents[0].identifier, requestId);
    assert.ok(Number(meterEvents[0].timestamp) > 0);
    // Stripe recovers: the next billable call drains the queue.
    meterFails = false;
    await new Promise((res) => setTimeout(res, 50));
    const again = await fetch(`${BASE}/v1/paycheck`, {
      method: 'POST', headers: { ...bearer(key), 'Content-Type': 'application/json' }, body: JSON.stringify(paycheckBody),
    });
    assert.equal(again.status, 200);
    await until(() => db().meterQueue.length <= 1 && meterEvents.some((e) => e.identifier === again.headers.get('x-request-id')));
    // The new call went through; the old one waits out its backoff, still queued.
    assert.deepEqual(db().meterQueue.map((x: { identifier: string }) => x.identifier), [requestId]);

    // A cancelled subscription is not revived by a later paid invoice.
    assert.equal((await sendWebhook('customer.subscription.deleted', 'cus_sec')).status, 200);
    const cancelled = await fetch(`${BASE}/v1/paycheck`, {
      method: 'POST', headers: { ...bearer(key), 'Content-Type': 'application/json' }, body: JSON.stringify(paycheckBody),
    });
    assert.equal(cancelled.status, 402);
    assert.equal((await cancelled.json()).code, 'subscription_cancelled');
    assert.equal((await sendWebhook('invoice.paid', 'cus_sec')).status, 200);
    const stillCancelled = await fetch(`${BASE}/v1/paycheck`, {
      method: 'POST', headers: { ...bearer(key), 'Content-Type': 'application/json' }, body: JSON.stringify(paycheckBody),
    });
    assert.equal(stillCancelled.status, 402);
    assert.equal(db().subscriptions[EMAIL].status, 'cancelled');
    assert.equal(db().subscriptions[EMAIL].suspended, true);
    // And start-trial can't restart it either.
    assert.equal((await post('/api/start-trial', {}, bearer(session))).status, 409);
  });

  test('sign-out ends the session server-side', async () => {
    const r = await post('/api/signout', {}, { Cookie: cookie });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('set-cookie') ?? '', /Max-Age=0/);
    assert.equal((await fetch(`${BASE}/api/account`, { headers: { Cookie: cookie } })).status, 401);
    assert.equal((await fetch(`${BASE}/api/account`, { headers: bearer(session) })).status, 401);
  });

  test('a corrupt store is reported by health and never overwritten', async () => {
    const file = join(dir, 'db.json');
    const good = readFileSync(file, 'utf8');
    writeFileSync(file, good.slice(0, 100), 'utf8'); // a truncated write
    const h = await fetch(`${BASE}/api/health`);
    assert.equal(h.status, 503);
    assert.equal((await h.json()).store, 'unreadable');
    assert.equal((await post('/api/signin', { email: EMAIL })).status, 500);
    assert.equal(readFileSync(file, 'utf8'), good.slice(0, 100));
    writeFileSync(file, good, 'utf8');
    assert.equal((await fetch(`${BASE}/api/health`)).status, 200);
  });

  test('wrong guesses are capped per address per hour, across fresh codes', async () => {
    const victim = 'victim@secure.test';
    await post('/api/signup', { name: 'Vic', email: victim, company: 'V', phone: '1' });
    // Burn 24 guesses (3 codes' worth); the per-code burn alone would allow more.
    for (let i = 0; i < 24; i++) await post('/api/verify-email', { email: victim, code: '000000' });
    // As if a fresh code had just been issued: even that right code is refused.
    const state = db();
    Object.assign(state.accounts[victim], {
      code: '424242', codeAttempts: 0, codeExpiresAt: new Date(Date.now() + 600_000).toISOString(),
    });
    writeFileSync(join(dir, 'db.json'), JSON.stringify(state), 'utf8');
    const r = await post('/api/verify-email', { email: victim, code: '424242' });
    assert.equal(r.status, 401);
    assert.match((await r.json()).error, /Too many wrong codes/);
  });

  test('signup is rate limited per client address across different emails', async () => {
    // Two signups already happened above; the limit is 4 an hour.
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await post('/api/signup', { name: 'Flood', email: `flood${i}@spam.test`, company: 'Spam', phone: '1' });
      statuses.push(r.status);
    }
    assert.deepEqual(statuses, [200, 200, 429, 429]);
    assert.equal(db().accounts['flood2@spam.test'], undefined);
  });
});

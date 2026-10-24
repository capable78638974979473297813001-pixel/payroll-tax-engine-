import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Issued keys are sk_live_ and paycheck calculations are metered during the
 * trial. The usage endpoint the dashboard reads counts paychecks, not a
 * separate unbilled key mode.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
/** An unused port, so parallel test files can never collide. */
const freePort = () => new Promise<number>((resolve) => {
  const srv = createNetServer();
  srv.listen(0, '127.0.0.1', () => { const { port } = srv.address() as { port: number }; srv.close(() => resolve(port)); });
});
let PORT = 0;
let BASE = '';
const EMAIL = 'sandy@sandbox.test';

const card = { id: 'pm_card', type: 'card', card: { brand: 'visa', last4: '4242' } };
const checkout = { id: 'cs_ok', status: 'complete', customer: 'cus_sb', metadata: { omnia_email: EMAIL }, subscription: { id: 'sub_sb', default_payment_method: card } };
const mailed: Array<{ to: string; subject: string }> = [];
const meterEvents: unknown[] = [];

let dir: string;
let child: ChildProcess;
let fakes: Server;

const db = () => JSON.parse(readFileSync(join(dir, 'db.json'), 'utf8'));
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

const paycheckBody = {
  checkDate: '2026-06-15', payFrequency: 'biweekly',
  earnings: [{ code: 'REG', category: 'regular', amount: 300000 }], deductions: [],
  federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
  ytd: { socialSecurity: 0, medicare: 0, futa: 0 }, workState: { code: 'OH' },
};

before(async () => {
  PORT = await freePort();
  BASE = `http://127.0.0.1:${PORT}`;
  dir = mkdtempSync(join(tmpdir(), 'site-sandbox-'));
  fakes = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const url = req.url ?? '';
      const send = (status: number, body: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
      if (url === '/emails') { const b = JSON.parse(raw); mailed.push({ to: b.to[0], subject: b.subject }); return send(200, { id: 'e1' }); }
      if (url.startsWith('/v1/checkout/sessions/cs_ok')) return send(200, checkout);
      if (url === '/v1/billing/meter_events') { meterEvents.push(raw); return send(200, { identifier: 'ok' }); }
      send(404, { error: { message: 'no such route' } });
    });
  });
  await new Promise<void>((r) => fakes.listen(0, '127.0.0.1', r));
  const fakeBase = `http://127.0.0.1:${(fakes.address() as { port: number }).port}`;
  child = spawn('node', ['site/server.ts'], {
    cwd: REPO,
    env: {
      ...process.env, PORT: String(PORT), SITE_DB_DIR: dir, RATE_LIMIT_PER_MIN: '1000', TRUST_PROXY: '',
      RESEND_API_KEY: 're_test', RESEND_API_BASE: fakeBase, STRIPE_SECRET_KEY: 'sk_test_fake', STRIPE_API_BASE: fakeBase,
      STRIPE_PRICE_ID: 'price_metered', STRIPE_METER_EVENT: 'omnia_api_call', OMNIA_ISSUE_LIVE_KEYS: '',
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 200; i++) {
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

test('an issued key is sk_live_ and trial paycheck calculations are metered', async () => {
  await post('/api/signup', { name: 'Sandy Box', email: EMAIL, company: 'Sandbox Payroll', phone: '555-000-2222', agreeToTerms: true });
  const code = /^(\d{6}) /.exec(mailed.at(-1)!.subject)![1];
  const v = await post('/api/verify-email', { email: EMAIL, code });
  const session = (await v.json()).sessionToken as string;
  const terms = await (await fetch(`${BASE}/api/terms?payFrequency=biweekly&rooftop=false`, { headers: bearer(session) })).json();
  const acc = await post('/api/accept-terms', { agreed: true, signedName: 'Sandy Box', legalName: 'Sandbox Payroll LLC', billingEmail: EMAIL, address: '1 Main St', quoteId: terms.quoteId }, bearer(session));
  assert.equal(acc.status, 200);
  assert.equal((await post('/api/billing/return', { sessionId: 'cs_ok' }, bearer(session))).status, 200);
  const issued = await (await post('/api/issue-key', {}, bearer(session))).json();
  assert.match(issued.key, /^sk_live_/);
  assert.equal(String(issued.key).includes('sk_test_'), false);

  for (let i = 0; i < 2; i++) {
    const r = await fetch(`${BASE}/v1/paycheck`, { method: 'POST', headers: { ...bearer(issued.key), 'Content-Type': 'application/json' }, body: JSON.stringify(paycheckBody) });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('omnia-mode'), 'live');
  }
  for (let i = 0; i < 40 && meterEvents.length < 2; i++) await new Promise((r) => setTimeout(r, 50));
  assert.equal(meterEvents.length, 2, 'trial paycheck calculations are reported');
  assert.equal(db().meterQueue.length, 0, 'delivered events leave the queue');
  assert.equal(db().subscriptions[EMAIL].status, 'trialing');

  const usage = await (await fetch(`${BASE}/api/usage`, { headers: bearer(session) })).json();
  assert.equal(usage.callsLast30, 2);
  assert.equal(usage.callsTodayOk, 2);
  assert.equal(usage.billing.paycheckCalculations, 2);
  assert.equal(usage.billing.sandboxCalls, undefined);
  assert.equal(usage.daily.length, 30);
  assert.equal(usage.daily.at(-1).calls, 2);
  assert.equal(usage.keys.length, 1);
  assert.equal(usage.keys[0].mode, 'live');
  assert.equal(usage.keys[0].totalCalls, 2);
});

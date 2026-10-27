import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { calculatePaycheck } from '../src/calculate.ts';
import { readFileSync as readFile } from 'node:fs';

/** The console calculator for a signed-in visitor: no key to paste, same engine, never billed. */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const freePort = () => new Promise<number>((resolve) => {
  const srv = createServer();
  srv.listen(0, '127.0.0.1', () => { const { port } = srv.address() as { port: number }; srv.close(() => resolve(port)); });
});

const request = {
  checkDate: '2026-06-15', payFrequency: 'biweekly',
  earnings: [{ code: 'REG', category: 'regular', amount: 300000 }], deductions: [],
  federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
  ytd: { socialSecurity: 0, medicare: 0, futa: 0 }, workState: { code: 'OH' },
};

interface Srv { base: string; dir: string; child: ChildProcess; db: () => any; stop: () => void }
async function start(env: Record<string, string>, seed: (dir: string) => void): Promise<Srv> {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'test-keys-'));
  seed(dir);
  const child = spawn('node', ['site/server.ts'], {
    cwd: REPO,
    env: { ...process.env, PORT: String(port), SITE_DB_DIR: dir, RATE_LIMIT_PER_MIN: '10000', STRIPE_SECRET_KEY: '', RESEND_API_KEY: '', TRUST_PROXY: '', ...env },
    stdio: 'ignore',
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) break; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  return { base, dir, child, db: () => JSON.parse(readFileSync(join(dir, 'db.json'), 'utf8')), stop: () => { child.kill('SIGKILL'); rmSync(dir, { recursive: true, force: true }); } };
}

/** A verified account with the terms accepted and NO card, so a live key is refused. */
function seedAccount(opts: { subscription?: boolean; card?: boolean; suspended?: boolean; legacyTestKey?: string; liveKey?: string } = {}) {
  const email = 'tester@keys.test';
  return (dir: string) => {
    const now = new Date().toISOString();
    const later = new Date(Date.now() + 86_400_000).toISOString();
    const keys: Record<string, unknown> = {};
    if (opts.liveKey) {
      keys[sha(opts.liveKey)] = { keyHash: sha(opts.liveKey), keyPrefix: opts.liveKey.slice(0, 14), ownerEmail: email, ownerName: 'T', company: 'T', plan: 'trial', createdAt: now, expiresAt: '2099-01-01T00:00:00.000Z', isActive: true, lastUsedAt: null, totalCalls: 0 };
    }
    if (opts.legacyTestKey) {
      keys[sha(opts.legacyTestKey)] = { keyHash: sha(opts.legacyTestKey), keyPrefix: opts.legacyTestKey.slice(0, 14), ownerEmail: email, ownerName: 'T', company: 'T', plan: 'trial', createdAt: now, expiresAt: '2099-01-01T00:00:00.000Z', isActive: true, lastUsedAt: null, totalCalls: 0 };
    }
    writeFileSync(join(dir, 'db.json'), JSON.stringify({
      accounts: { [email]: { name: 'Tess Ter', email, company: 'Keys LLC', phone: '', code: null, codeExpiresAt: null, codeRequestedAt: null, emailVerifiedAt: now, sessionToken: null, sessionExpiresAt: null, stage: 'payment_pending', createdAt: now } },
      sessions: { sess_tok: { email, expiresAt: later, issuedAt: now, method: 'code', renewedAt: now } },
      scenarios: {}, acceptances: [],
      paymentMethods: opts.card ? { [email]: { email, kind: 'card', processorRef: 'pm_1', last4: '4242', brand: 'visa', attachedAt: now } } : {},
      subscriptions: opts.subscription === false ? {} : { [email]: { email, legalName: 'Keys LLC', billingContact: 'T', billingEmail: email, address: 'x', expectedEmployees: 1, payFrequency: 'biweekly', rooftop: false, estimatedAnnual: 0, status: opts.card ? 'trialing' : 'payment_pending', trialStartsAt: null, trialEndsAt: null, termMonths: 12, termEndsAt: null, createdAt: now, activatedAt: null, stripeCustomerId: null, stripeSubscriptionId: null, suspended: Boolean(opts.suspended), suspendedReason: opts.suspended ? 'payment_failed' : null } },
      keys, usage: [], estimates: [], termsQuotes: {}, meterQueue: [], rateLimits: {}, processedStripeEvents: [],
    }));
  };
}

const post = (base: string, path: string, body: unknown, token: string) =>
  fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
const get = (base: string, path: string, token: string) => fetch(base + path, { headers: { Authorization: `Bearer ${token}` } });


const COOKIE = 'omnia_session=sess_tok';
const page = (name: string) => readFile(join(REPO, name), 'utf8');

const send = (base: string, path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

describe('POST /api/console/paycheck', () => {
  let s: Srv;
  before(async () => { s = await start({}, seedAccount({ card: false })); });
  after(() => s.stop());

  test('needs a sign-in, and says so', async () => {
    const r = await send(s.base, '/api/console/paycheck', request);
    assert.equal(r.status, 401);
    assert.equal(((await r.json()) as { code: string }).code, 'sign_in_required');
    const bad = await send(s.base, '/api/console/paycheck', request, { Cookie: 'omnia_session=nope' });
    assert.equal(bad.status, 401);
  });

  test('a signed-in visitor gets the engine\'s own numbers with no key', async () => {
    const r = await send(s.base, '/api/console/paycheck', request, { Cookie: COOKIE });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('omnia-mode'), 'test');
    const body = await r.json() as { result: Record<string, unknown> };
    const direct = JSON.parse(JSON.stringify(calculatePaycheck(request as never)));
    assert.deepEqual(body.result.taxes, direct.taxes);
    assert.equal(body.result.netPay, direct.netPay);
  });

  test('refuses what POST /v1/paycheck refuses, with the same field paths', async () => {
    const r = await send(s.base, '/api/console/paycheck', { ...request, payFrequency: 'fortnightly' }, { Cookie: COOKIE });
    assert.equal(r.status, 422);
    const body = await r.json() as { code: string; details: Array<{ path: string }> };
    assert.equal(body.code, 'invalid_input');
    assert.ok(body.details.some((d) => d.path === 'payFrequency'));
  });

  test('is never billed, counted in usage, or turned into a key', async () => {
    for (let i = 0; i < 3; i++) await send(s.base, '/api/console/paycheck', request, { Cookie: COOKIE });
    const db = s.db();
    assert.deepEqual(db.usage, []);
    assert.deepEqual(db.meterQueue, []);
    assert.deepEqual(db.keys, {});
  });

  test('a browser post needs the CSRF token like every other cookie post', async () => {
    const r = await send(s.base, '/api/console/paycheck', request, { Cookie: COOKIE, Origin: s.base });
    assert.equal(r.status, 403);
    assert.equal(((await r.json()) as { code: string }).code, 'bad_csrf');
    const token = 'c'.repeat(40);
    const ok = await send(s.base, '/api/console/paycheck', request, { Cookie: `${COOKIE}; omnia_csrf=${token}`, Origin: s.base, 'X-CSRF-Token': token });
    assert.equal(ok.status, 200);
  });

  test('address lookup needs a sign-in and validates its input', async () => {
    assert.equal((await send(s.base, '/api/console/address', { workAddress: '1 Main St, Columbus, OH' })).status, 401);
    const r = await send(s.base, '/api/console/address', {}, { Cookie: COOKIE });
    assert.equal(r.status, 422);
    assert.equal(((await r.json()) as { code: string }).code, 'invalid_input');
  });
});

describe('the console is held to the test-key caps', () => {
  test('per minute', async () => {
    const s = await start({ TEST_RATE_LIMIT_PER_MIN: '2' }, seedAccount({ card: false }));
    try {
      const codes: number[] = [];
      for (let i = 0; i < 4; i++) codes.push((await send(s.base, '/api/console/paycheck', request, { Cookie: COOKIE })).status);
      assert.deepEqual(codes, [200, 200, 429, 429]);
    } finally { s.stop(); }
  });
  test('per day', async () => {
    const s = await start({ TEST_DAILY_LIMIT: '2' }, seedAccount({ card: false }));
    try {
      const codes: number[] = [];
      for (let i = 0; i < 3; i++) codes.push((await send(s.base, '/api/console/paycheck', request, { Cookie: COOKIE })).status);
      assert.deepEqual(codes, [200, 200, 429]);
    } finally { s.stop(); }
  });
});

describe('the calculator page and key hand-off', () => {
  const js = page('site/assets/sandbox.js');
  test('uses the session route when there is no key, and the key route when there is one', () => {
    assert.match(js, /\/api\/console\//);
    assert.match(js, /\/v1\//);
    assert.match(js, /fetch\('\/api\/account'/, 'asks the server, not per-tab storage, whether the visitor is signed in');
    assert.match(js, /Authorization/);
  });
  test('a new key goes straight to the console, from signup and from the dashboard', () => {
    assert.match(page('site/signup-payment.html'), /location\.href = '\/sandbox\?welcome=key'/);
    const dash = page('site/dashboard.html');
    assert.equal((dash.match(/\/sandbox\?welcome=key/g) ?? []).length, 2, 'live and test key');
    assert.match(js, /welcome/);
  });
  test('refuses to calculate a $0 paycheck, and starts with a real gross pay', () => {
    assert.match(js, /Enter a gross pay above \$0/);
    assert.match(page('site/sandbox.html'), /id="grossPay"[^>]*value="85000"/);
  });
});

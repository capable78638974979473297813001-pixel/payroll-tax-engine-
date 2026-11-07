import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Fixes from the 2026-11-07 security audit:
 *  - batch routes cap the paychecks one request may carry (MAX_BATCH_ITEMS), so one request cannot
 *    hold the single-threaded server;
 *  - /healthz shows operational detail (data path, backup counts, start time, integrations) only to
 *    loopback callers that did not come through a proxy, or to a HEALTH_TOKEN bearer.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const freePort = () => new Promise<number>((resolve) => {
  const srv = createNetServer();
  srv.listen(0, '127.0.0.1', () => { const { port } = srv.address() as { port: number }; srv.close(() => resolve(port)); });
});
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

const EMAIL = 'batch@audit.test';
const KEY = 'sk_live_' + randomBytes(18).toString('base64url');
const HEALTH_TOKEN = 'health-' + randomBytes(16).toString('hex');
const LIMIT = 3;

let BASE = '';
let dir = '';
let child: ChildProcess;

before(async () => {
  const port = await freePort();
  BASE = `http://127.0.0.1:${port}`;
  dir = mkdtempSync(join(tmpdir(), 'audit-1107-'));
  const now = new Date().toISOString();
  const later = new Date(Date.now() + 365 * 86_400_000).toISOString();
  writeFileSync(join(dir, 'db.json'), JSON.stringify({
    accounts: {
      [EMAIL]: {
        name: 'Batch Customer', email: EMAIL, company: 'Batch LLC', phone: '555-0100',
        code: null, codeExpiresAt: null, codeRequestedAt: null, emailVerifiedAt: now,
        sessionToken: null, sessionExpiresAt: null, stage: 'active', createdAt: now,
      },
    },
    scenarios: {}, acceptances: [],
    paymentMethods: { [EMAIL]: { email: EMAIL, kind: 'card', processorRef: 'pm_x', last4: '4242', brand: 'visa', attachedAt: now } },
    subscriptions: {
      [EMAIL]: {
        email: EMAIL, legalName: 'Batch LLC', billingContact: 'Batch Customer', billingEmail: EMAIL, address: '1 Main St',
        expectedEmployees: 4, payFrequency: 'biweekly', rooftop: false, estimatedAnnual: 0,
        status: 'active', trialStartsAt: now, trialEndsAt: now, termMonths: 12, termEndsAt: later,
        createdAt: now, activatedAt: now, stripeCustomerId: null, stripeSubscriptionId: null, suspended: false, suspendedReason: null,
      },
    },
    keys: {
      [sha(KEY)]: {
        keyHash: sha(KEY), keyPrefix: KEY.slice(0, 14), ownerEmail: EMAIL, ownerName: 'Batch Customer', company: 'Batch LLC',
        plan: 'active', createdAt: now, expiresAt: '2099-01-01T00:00:00.000Z', isActive: true, lastUsedAt: null, totalCalls: 0,
      },
    },
    usage: [], estimates: [], termsQuotes: {}, meterQueue: [], rateLimits: {}, processedStripeEvents: [], sessions: {},
  }));
  child = spawn('node', ['site/server.ts'], {
    cwd: REPO,
    env: {
      ...process.env,
      PORT: String(port), SITE_DB_DIR: dir, RATE_LIMIT_PER_MIN: '1000', TRUST_PROXY: '', PUBLIC_BASE_URL: '',
      STRIPE_SECRET_KEY: '', STRIPE_PRICE_ID: '', STRIPE_METER_EVENT_NAME: '', STRIPE_METER_EVENT: '', RESEND_API_KEY: '',
      MAX_BATCH_ITEMS: String(LIMIT), HEALTH_TOKEN,
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${BASE}/v1/health`)).ok) return; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('server did not become healthy');
});

after(() => {
  child?.kill('SIGKILL');
  if (dir) rmSync(dir, { recursive: true, force: true });
});

const post = (path: string, body: unknown) => fetch(BASE + path, {
  method: 'POST',
  headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

test('payCalc refuses a batch over MAX_BATCH_ITEMS and accepts one at the limit', async () => {
  const item = { checkDate: '2026-06-15', frequency: 'biweekly', grossPay: 3000, workUniqueTaxIds: ['39-000-0001'] };
  const over = await post('/v1/payCalc', Array.from({ length: LIMIT + 1 }, () => item));
  assert.equal(over.status, 413);
  const body = await over.json() as { code: string; limit: number };
  assert.equal(body.code, 'batch_too_large');
  assert.equal(body.limit, LIMIT);
  const at = await post('/v1/payCalc', { payCalc: Array.from({ length: LIMIT }, () => item) });
  assert.equal(at.status, 200);
  assert.equal(((await at.json()) as { payCalc: unknown[] }).payCalc.length, LIMIT);
});

test('payroll/run refuses more employees than MAX_BATCH_ITEMS', async () => {
  const employee = { id: 'e', earnings: [{ code: 'REG', category: 'regular', amount: 100000 }] };
  const over = await post('/v1/payroll/run', {
    checkDate: '2026-06-15', payFrequency: 'biweekly', employees: Array.from({ length: LIMIT + 1 }, (_, i) => ({ ...employee, id: `e${i}` })),
  });
  assert.equal(over.status, 413);
  assert.equal(((await over.json()) as { code: string }).code, 'batch_too_large');
});

const DETAIL = ['storageReason', 'startedAt', 'taxYears', 'payments', 'metering', 'email', 'mail'];

test('public /healthz carries liveness and coarse state only', async () => {
  for (const path of ['/healthz', '/v1/health', '/api/health']) {
    // A forwarded request is never treated as local, whatever socket it arrived on.
    const r = await fetch(BASE + path, { headers: { 'X-Forwarded-For': '203.0.113.9' } });
    assert.equal(r.status, 200);
    const body = await r.json() as Record<string, unknown> & { accountBackup: Record<string, unknown> };
    assert.equal(body.status, 'ok');
    assert.ok('storage' in body);
    assert.deepEqual(Object.keys(body.accountBackup), ['state']);
    for (const k of DETAIL) assert.equal(k in body, false, `${path} must not expose ${k} publicly`);
  }
  const wrong = await (await fetch(BASE + '/healthz', { headers: { 'X-Forwarded-For': '203.0.113.9', Authorization: 'Bearer nope' } })).json();
  for (const k of DETAIL) assert.equal(k in (wrong as object), false);
});

test('loopback callers and HEALTH_TOKEN holders see the detail', async () => {
  const local = await (await fetch(BASE + '/healthz')).json() as Record<string, unknown>;
  for (const k of DETAIL) assert.ok(k in local, `loopback sees ${k}`);
  const tokened = await (await fetch(BASE + '/healthz', { headers: { 'X-Forwarded-For': '203.0.113.9', Authorization: `Bearer ${HEALTH_TOKEN}` } })).json() as Record<string, unknown>;
  for (const k of DETAIL) assert.ok(k in tokened, `token holder sees ${k}`);
});

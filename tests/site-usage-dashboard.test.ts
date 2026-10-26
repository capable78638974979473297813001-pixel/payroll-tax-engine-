import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Dashboard usage is a local record in SITE_DB_DIR, written before Stripe
 * is called. Trial calls, skipped meter events, and a failed meter delivery
 * all show up on that account only. A payroll run of N paychecks counts N.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const freePort = () => new Promise<number>((resolve) => {
  const srv = createNetServer();
  srv.listen(0, '127.0.0.1', () => { const { port } = srv.address() as { port: number }; srv.close(() => resolve(port)); });
});

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const A = 'trial@usage.test';
const B = 'other@usage.test';
const C = 'unbilled@usage.test';
const SESSION_A = 'sess_usage_a';
const SESSION_B = 'sess_usage_b';
const SESSION_C = 'sess_usage_c';
const KEY_A = 'sk_live_' + randomBytes(18).toString('base64url');
const KEY_B = 'sk_live_' + randomBytes(18).toString('base64url');
const KEY_C = 'sk_live_' + randomBytes(18).toString('base64url');

const paycheckBody = {
  checkDate: '2026-06-15', payFrequency: 'biweekly',
  earnings: [{ code: 'REG', category: 'regular', amount: 300000 }], deductions: [],
  federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
  ytd: { socialSecurity: 0, medicare: 0, futa: 0 }, workState: { code: 'OH' },
};

const w4 = paycheckBody.federalW4;

let PORT = 0;
let BASE = '';
let dir = '';
let child: ChildProcess;
let fakes: Server;

const db = () => JSON.parse(readFileSync(join(dir, 'db.json'), 'utf8'));
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

function account(email: string, session: string, stage: string) {
  const now = new Date().toISOString();
  return {
    name: 'Usage Customer', email, company: email.split('@')[0], phone: '555-0100',
    code: null, codeExpiresAt: null, codeRequestedAt: null, emailVerifiedAt: now,
    sessionToken: session, sessionExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    stage, createdAt: now,
  };
}

function subscription(email: string, status: string, stripeCustomerId: string | null, stripeSubscriptionId: string | null, trialEndsAt: string) {
  const start = new Date(Date.now() - 2 * 86_400_000).toISOString();
  return {
    email, legalName: 'Usage LLC', billingContact: 'Usage Customer', billingEmail: email, address: '1 Main St',
    expectedEmployees: 4, payFrequency: 'biweekly', rooftop: false, estimatedAnnual: 0,
    status, trialStartsAt: start, trialEndsAt, termMonths: 12, termEndsAt: trialEndsAt,
    createdAt: start, activatedAt: status === 'active' ? start : null,
    stripeCustomerId, stripeSubscriptionId, suspended: false, suspendedReason: null,
  };
}

function keyRecord(plaintext: string, email: string, plan: string) {
  return {
    keyHash: sha(plaintext), keyPrefix: plaintext.slice(0, 14), ownerEmail: email, ownerName: 'Usage Customer', company: email,
    plan, createdAt: new Date().toISOString(), expiresAt: '2099-01-01T00:00:00.000Z',
    isActive: true, lastUsedAt: null, totalCalls: 0,
  };
}

function session(email: string, token: string) {
  const now = new Date().toISOString();
  return { email, expiresAt: new Date(Date.now() + 86_400_000).toISOString(), issuedAt: now, method: 'code', renewedAt: now, token };
}

before(async () => {
  PORT = await freePort();
  BASE = `http://127.0.0.1:${PORT}`;
  dir = mkdtempSync(join(tmpdir(), 'site-usage-dash-'));
  const trialEnd = new Date(Date.now() + 12 * 86_400_000).toISOString();
  const trialOver = new Date(Date.now() - 86_400_000).toISOString();
  const sessA = session(A, SESSION_A);
  const sessB = session(B, SESSION_B);
  const sessC = session(C, SESSION_C);
  writeFileSync(join(dir, 'db.json'), JSON.stringify({
    accounts: {
      [A]: account(A, SESSION_A, 'trialing'),
      [B]: account(B, SESSION_B, 'trialing'),
      [C]: account(C, SESSION_C, 'active'),
    },
    scenarios: {}, acceptances: [],
    paymentMethods: {
      [A]: { email: A, kind: 'card', processorRef: 'pm_a', last4: '4242', brand: 'visa', attachedAt: trialEnd },
      [B]: { email: B, kind: 'card', processorRef: 'pm_b', last4: '4242', brand: 'visa', attachedAt: trialEnd },
      [C]: { email: C, kind: 'card', processorRef: 'pm_c', last4: '1881', brand: 'visa', attachedAt: trialOver },
    },
    subscriptions: {
      [A]: subscription(A, 'trialing', 'cus_usage_a', 'sub_usage_a', trialEnd),
      [B]: subscription(B, 'trialing', 'cus_usage_b', 'sub_usage_b', trialEnd),
      [C]: subscription(C, 'active', null, null, trialOver),
    },
    keys: {
      [sha(KEY_A)]: keyRecord(KEY_A, A, 'trial'),
      [sha(KEY_B)]: keyRecord(KEY_B, B, 'trial'),
      [sha(KEY_C)]: keyRecord(KEY_C, C, 'active'),
    },
    usage: [], estimates: [], termsQuotes: {}, meterQueue: [], rateLimits: {}, processedStripeEvents: [],
    sessions: {
      [SESSION_A]: { email: sessA.email, expiresAt: sessA.expiresAt, issuedAt: sessA.issuedAt, method: 'code', renewedAt: sessA.renewedAt },
      [SESSION_B]: { email: sessB.email, expiresAt: sessB.expiresAt, issuedAt: sessB.issuedAt, method: 'code', renewedAt: sessB.renewedAt },
      [SESSION_C]: { email: sessC.email, expiresAt: sessC.expiresAt, issuedAt: sessC.issuedAt, method: 'code', renewedAt: sessC.renewedAt },
    },
  }));

  fakes = createServer((_req, res) => {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'stripe down' } }));
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
      PUBLIC_BASE_URL: '',
      STRIPE_SECRET_KEY: 'sk_test_fake',
      STRIPE_API_BASE: fakeBase,
      STRIPE_PRICE_ID: 'price_usage',
      STRIPE_METER_EVENT_NAME: 'paycheck_calculated',
      STRIPE_METER_EVENT: '',
      STRIPE_WEBHOOK_SECRET: '',
      STRIPE_ALLOW_LIVE: '',
      RESEND_API_KEY: '',
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
  fakes?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

const until = async (cond: () => boolean) => {
  for (let i = 0; i < 50 && !cond(); i++) await new Promise((r) => setTimeout(r, 50));
};

async function usage(session: string) {
  const res = await fetch(`${BASE}/api/usage`, { headers: bearer(session) });
  assert.equal(res.status, 200);
  return res.json() as Promise<{
    hasKey: boolean;
    lastUsedAt: string | null;
    today: { paychecks: number; requests: number };
    period: { trial: boolean; paychecks: number; requests: number; label: string };
    allTime: { paychecks: number; requests: number };
    billing: { paycheckCalculations: number; paychecksThisPeriod: number; trialPaychecks: number; unbilledPaychecks: number };
    keys: { keyMasked: string; lastUsedAt: string | null; totalCalls: number; totalPaychecks: number }[];
    recent: { endpoint: string; statusCode: number; paychecks: number; requests: number; billing: string; keyHash: string; at: string }[];
  }>;
}

const postCalc = (path: string, key: string, body: unknown, extra: Record<string, string> = {}) =>
  fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { ...bearer(key), 'Content-Type': 'application/json', ...extra },
    body: JSON.stringify(body),
  });

describe('dashboard usage records', { concurrency: 1 }, () => {
test('a trial call is on the dashboard even when Stripe rejects the meter event', async () => {
  const page = await fetch(`${BASE}/dashboard`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Paychecks today/);
  assert.match(html, /Recent calls/);
  assert.match(html, /\$0\.08/);

  const call = await postCalc('/v1/paycheck', KEY_A, paycheckBody);
  assert.equal(call.status, 200);
  const requestId = call.headers.get('x-request-id');
  assert.ok(requestId);

  await until(() => {
    const queued = db().meterQueue.find((item: { identifier: string; attempts: number }) => item.identifier === requestId);
    return Boolean(queued && queued.attempts >= 1);
  });
  const queued = db().meterQueue.find((item: { identifier: string }) => item.identifier === requestId);
  assert.ok(queued, 'the meter event stays queued after Stripe fails');
  assert.match(queued.lastError, /stripe down/);
  assert.equal(db().usage.length, 1, 'the local usage row was written before Stripe');

  const dash = await usage(SESSION_A);
  assert.equal(dash.today.paychecks, 1);
  assert.equal(dash.period.trial, true);
  assert.equal(dash.period.paychecks, 1);
  assert.match(dash.period.label, /Trial/);
  assert.match(dash.period.label, /not billed/);
  assert.equal(dash.allTime.paychecks, 1);
  assert.equal(dash.allTime.requests, 1);
  assert.equal(dash.billing.paycheckCalculations, 1);
  assert.equal(dash.billing.trialPaychecks, 1);
  assert.ok(dash.lastUsedAt);
  assert.equal(dash.keys[0].totalPaychecks, 1);
  assert.ok(dash.keys[0].lastUsedAt);
  assert.equal(dash.recent.length, 1);
  assert.equal(dash.recent[0].endpoint, 'POST /v1/paycheck');
  assert.equal(dash.recent[0].statusCode, 200);
  assert.equal(dash.recent[0].paychecks, 1);
  assert.equal(dash.recent[0].billing, 'trial');
  assert.equal(dash.recent[0].keyHash, sha(KEY_A));
});

test('an Idempotency-Key retry does not count the paycheck twice', async () => {
  const headers = { 'Idempotency-Key': 'paycheck-retry-1' };
  const first = await postCalc('/v1/paycheck', KEY_A, paycheckBody, headers);
  assert.equal(first.status, 200);
  const second = await postCalc('/v1/paycheck', KEY_A, paycheckBody, headers);
  assert.equal(second.status, 200);
  const dash = await usage(SESSION_A);
  assert.equal(dash.allTime.paychecks, 2);
  assert.equal(dash.allTime.requests, 2);
  assert.equal(db().usage.length, 2);
  assert.equal(db().meterQueue.length, 2);
});

test('a payroll run of N paychecks counts N, and another account does not see it', async () => {
  const beforeOther = await usage(SESSION_B);
  assert.equal(beforeOther.allTime.paychecks, 0);
  assert.equal(beforeOther.recent.length, 0);
  assert.equal(beforeOther.keys.length, 1);
  assert.notEqual(beforeOther.keys[0].keyMasked, (await usage(SESSION_A)).keys[0].keyMasked);

  const employees = ['a', 'b', 'c', 'd'].map((id) => ({
    employeeId: id, name: id, grossCents: 200_000, workStateCode: 'TX', federalW4: w4,
  }));
  const run = await postCalc('/v1/payroll/run', KEY_A, {
    companyId: 'co', checkDate: '2026-06-15', payFrequency: 'weekly', employees,
  });
  assert.equal(run.status, 200, await run.clone().text());
  const body = await run.json() as { run: { paychecks: unknown[] } };
  assert.equal(body.run.paychecks.length, 4);

  const dash = await usage(SESSION_A);
  assert.equal(dash.allTime.paychecks, 6);
  assert.equal(dash.today.paychecks, 6);
  assert.equal(dash.period.paychecks, 6);
  assert.equal(dash.recent[0].endpoint, 'POST /v1/payroll/run');
  assert.equal(dash.recent[0].paychecks, 4);
  assert.equal(dash.recent[0].requests, 1);
  assert.equal(dash.recent[0].statusCode, 200);
  assert.equal(dash.recent[0].billing, 'trial');
  assert.equal(dash.keys[0].totalPaychecks, 6);
  assert.equal(db().meterQueue.filter((item: { customerId: string }) => item.customerId === 'cus_usage_a').length, 6);
  assert.equal(new Set(db().meterQueue.map((item: { identifier: string }) => item.identifier)).size, db().meterQueue.length);

  const other = await usage(SESSION_B);
  assert.equal(other.allTime.paychecks, 0);
  assert.equal(other.recent.length, 0);
  assert.equal(other.keys.length, 1);
  assert.ok(other.recent.every((row) => row.keyHash === sha(KEY_B)));
  assert.equal(db().usage.filter((row: { keyHash: string }) => row.keyHash === sha(KEY_B)).length, 0);
});

test('a payCalc batch counts each success, and a skipped meter still records the call', async () => {
  const looked = await fetch(`${BASE}/v1/uniqueTaxIds/39-000-0001?checkDate=2026-06-15`, { headers: bearer(KEY_B) });
  assert.equal(looked.status, 200);
  const afterLookup = await usage(SESSION_B);
  assert.equal(afterLookup.allTime.paychecks, 0);
  assert.equal(afterLookup.allTime.requests, 1);
  assert.equal(afterLookup.recent[0].endpoint, 'GET /v1/uniqueTaxIds/39-000-0001');
  assert.equal(afterLookup.recent[0].billing, 'unbilled');

  const good = { checkDate: '2026-06-15', frequency: 'biweekly', grossPay: 3000, workUniqueTaxIds: ['39-000-0001'] };
  const bad = { checkDate: '2026-06-15', frequency: 'biweekly', grossPay: 3000 };
  const pay = await postCalc('/v1/payCalc', KEY_B, [good, good, bad]);
  assert.equal(pay.status, 200);
  const payBody = await pay.json() as { payCalc: Array<{ error?: string }> };
  assert.equal(payBody.payCalc.filter((row) => !row.error).length, 2);

  const dash = await usage(SESSION_B);
  assert.equal(dash.allTime.paychecks, 2);
  assert.equal(dash.today.paychecks, 2);
  assert.equal(dash.recent[0].endpoint, 'POST /v1/payCalc');
  assert.equal(dash.recent[0].paychecks, 2);
  assert.equal(dash.recent[0].billing, 'trial');
  assert.ok(dash.recent.every((row) => row.keyHash === sha(KEY_B)));

  const skipped = await postCalc('/v1/paycheck', KEY_C, paycheckBody);
  assert.equal(skipped.status, 200);
  const quiet = await usage(SESSION_C);
  assert.equal(quiet.allTime.paychecks, 1);
  assert.equal(quiet.period.trial, false);
  assert.equal(quiet.period.label, 'Unbilled');
  assert.equal(quiet.recent[0].billing, 'unbilled');
  assert.equal(quiet.billing.unbilledPaychecks, 1);
  assert.equal(db().meterQueue.some((item: { customerId: string }) => item.customerId == null), false);
  assert.equal(db().usage.filter((row: { keyHash: string; billing: string }) => row.keyHash === sha(KEY_C) && row.billing === 'unbilled').length, 1);

  const owner = await usage(SESSION_A);
  assert.equal(owner.allTime.paychecks, 6);
  assert.ok(owner.recent.every((row) => row.keyHash === sha(KEY_A)));
  const neighbor = await usage(SESSION_B);
  assert.equal(neighbor.allTime.paychecks, 2);
  assert.ok(neighbor.recent.every((row) => row.keyHash === sha(KEY_B)));
});
});

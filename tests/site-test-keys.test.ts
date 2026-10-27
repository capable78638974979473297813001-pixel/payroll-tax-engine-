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

/**
 * Test keys: the same engine and data as a live key, with no card, no billing
 * and no effect on the account's usage, held to a per-minute and a daily cap.
 */

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
function seedAccount(opts: { subscription?: boolean; card?: boolean; suspended?: boolean; legacyTestKey?: string } = {}) {
  const email = 'tester@keys.test';
  return (dir: string) => {
    const now = new Date().toISOString();
    const later = new Date(Date.now() + 86_400_000).toISOString();
    const keys: Record<string, unknown> = {};
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

describe('issuing a test key', () => {
  let s: Srv;
  before(async () => { s = await start({}, seedAccount()); });
  after(() => s.stop());

  test('needs no card, where a live key still does', async () => {
    const live = await post(s.base, '/api/issue-key', {}, 'sess_tok');
    assert.equal(live.status, 402);
    const t = await post(s.base, '/api/issue-key', { mode: 'test' }, 'sess_tok');
    assert.equal(t.status, 200);
    const body = await t.json() as { key: string; mode: string; plan: string; limits: { requestsPerMinute: number; requestsPerDay: number }; expiresAt: string };
    assert.match(body.key, /^sk_test_/);
    assert.equal(body.mode, 'test');
    assert.equal(body.plan, 'test');
    assert.equal(body.limits.requestsPerDay, 500);
    assert.ok(new Date(body.expiresAt).getTime() > Date.now() + 80 * 86_400_000);
  });

  test('a bad mode is refused', async () => {
    assert.equal((await post(s.base, '/api/issue-key', { mode: 'sandbox' }, 'sess_tok')).status, 400);
  });

  test('works the same as a live key: same engine, same numbers, header says test', async () => {
    const { key } = await (await post(s.base, '/api/issue-key', { mode: 'test' }, 'sess_tok')).json() as { key: string };
    const r = await post(s.base, '/v1/paycheck', request, key);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('omnia-mode'), 'test');
    const body = await r.json() as { result: Record<string, unknown> };
    const direct = JSON.parse(JSON.stringify(calculatePaycheck(request as never)));
    assert.deepEqual(body.result.taxes, direct.taxes);
    assert.equal(body.result.netPay, direct.netPay);
  });

  test('is never billed or counted in the account usage', async () => {
    const { key } = await (await post(s.base, '/api/issue-key', { mode: 'test' }, 'sess_tok')).json() as { key: string };
    for (let i = 0; i < 3; i++) assert.equal((await post(s.base, '/v1/paycheck', request, key)).status, 200);
    const db = s.db();
    assert.deepEqual(db.usage, [], 'no usage rows');
    assert.deepEqual(db.meterQueue, [], 'nothing queued for Stripe');
    const usage = await (await get(s.base, '/api/usage', 'sess_tok')).json() as { hasKey: boolean; testKey: { callsToday: number; limits: { requestsPerDay: number } } | null };
    assert.equal(usage.hasKey, false, 'a test key is not the account\'s live key');
    assert.equal(usage.testKey?.callsToday, 3);
    assert.equal(usage.testKey?.limits.requestsPerDay, 500);
  });

  test('/v1/me says it is a test key and not billed', async () => {
    const { key } = await (await post(s.base, '/api/issue-key', { mode: 'test' }, 'sess_tok')).json() as { key: string };
    const me = await (await get(s.base, '/v1/me', key)).json() as { mode: string; billed: boolean; limits: Record<string, number> };
    assert.equal(me.mode, 'test');
    assert.equal(me.billed, false);
    assert.equal(me.limits.requestsPerDay, 500);
  });
});

describe('replacing a test key', () => {
  test('the old test key stops and the new one works', async () => {
    const s = await start({}, seedAccount());
    try {
      const first = await (await post(s.base, '/api/issue-key', { mode: 'test' }, 'sess_tok')).json() as { key: string };
      const second = await (await post(s.base, '/api/issue-key', { mode: 'test' }, 'sess_tok')).json() as { key: string };
      assert.equal((await post(s.base, '/v1/paycheck', request, first.key)).status, 401);
      assert.equal((await post(s.base, '/v1/paycheck', request, second.key)).status, 200);
    } finally { s.stop(); }
  });
});

describe('a test key and a live key side by side', () => {
  let s: Srv;
  before(async () => { s = await start({}, seedAccount({ card: true })); });
  after(() => s.stop());

  test('issuing one does not revoke the other', async () => {
    const live = await (await post(s.base, '/api/issue-key', {}, 'sess_tok')).json() as { key: string; mode: string };
    assert.equal(live.mode, 'live');
    const test = await (await post(s.base, '/api/issue-key', { mode: 'test' }, 'sess_tok')).json() as { key: string };
    assert.equal((await post(s.base, '/v1/paycheck', request, live.key)).status, 200);
    assert.equal((await post(s.base, '/v1/paycheck', request, test.key)).status, 200);
    const again = await (await post(s.base, '/api/issue-key', {}, 'sess_tok')).json() as { key: string };
    assert.equal((await post(s.base, '/v1/paycheck', request, live.key)).status, 401, 'the old live key is replaced');
    assert.equal((await post(s.base, '/v1/paycheck', request, test.key)).status, 200, 'the test key is untouched');
    assert.equal((await post(s.base, '/v1/paycheck', request, again.key)).status, 200);
  });

  test('only the live key is the account\'s usage', async () => {
    const usage = await (await get(s.base, '/api/usage', 'sess_tok')).json() as { hasKey: boolean; keys: Array<{ mode: string }>; testKey: unknown };
    assert.equal(usage.hasKey, true);
    assert.ok(usage.keys.every((k) => k.mode === 'live'));
    assert.ok(usage.testKey);
  });
});

describe('the caps', () => {
  let s: Srv;
  before(async () => { s = await start({ TEST_DAILY_LIMIT: '3', TEST_RATE_LIMIT_PER_MIN: '1000' }, seedAccount()); });
  after(() => s.stop());

  test('the day\'s limit stops a test key with a code and a reset time', async () => {
    const { key } = await (await post(s.base, '/api/issue-key', { mode: 'test' }, 'sess_tok')).json() as { key: string };
    for (let i = 0; i < 3; i++) assert.equal((await post(s.base, '/v1/paycheck', request, key)).status, 200);
    const over = await post(s.base, '/v1/paycheck', request, key);
    assert.equal(over.status, 429);
    assert.equal(((await over.json()) as { code: string }).code, 'test_daily_limit');
    assert.ok(Number(over.headers.get('retry-after')) > 0);
  });
});

describe('the per-minute cap', () => {
  let s: Srv;
  before(async () => { s = await start({ TEST_RATE_LIMIT_PER_MIN: '2' }, seedAccount()); });
  after(() => s.stop());

  test('is lower for a test key', async () => {
    const { key } = await (await post(s.base, '/api/issue-key', { mode: 'test' }, 'sess_tok')).json() as { key: string };
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) codes.push((await post(s.base, '/v1/paycheck', request, key)).status);
    assert.deepEqual(codes, [200, 200, 429, 429]);
  });
});

describe('what a test key does not do', () => {
  test('it needs the terms accepted first', async () => {
    const s = await start({}, seedAccount({ subscription: false }));
    try {
      const r = await post(s.base, '/api/issue-key', { mode: 'test' }, 'sess_tok');
      assert.equal(r.status, 409);
      assert.equal(((await r.json()) as { code: string }).code, 'terms_required');
    } finally { s.stop(); }
  });

  test('a billing suspension stops a live key but not a test key', async () => {
    const s = await start({}, seedAccount({ card: true, suspended: true }));
    try {
      const live = await (await post(s.base, '/api/issue-key', {}, 'sess_tok')).json() as { key: string };
      const test = await (await post(s.base, '/api/issue-key', { mode: 'test' }, 'sess_tok')).json() as { key: string };
      assert.equal((await post(s.base, '/v1/paycheck', request, live.key)).status, 402);
      assert.equal((await post(s.base, '/v1/paycheck', request, test.key)).status, 200);
    } finally { s.stop(); }
  });

  test('the old retired sk_test_ keys stay retired', async () => {
    const legacy = 'sk_test_legacylegacylegacylegacy12';
    const s = await start({}, seedAccount({ legacyTestKey: legacy }));
    try {
      const r = await post(s.base, '/v1/paycheck', request, legacy);
      assert.equal(r.status, 401);
      assert.equal(((await r.json()) as { code: string }).code, 'key_not_accepted');
    } finally { s.stop(); }
  });
});

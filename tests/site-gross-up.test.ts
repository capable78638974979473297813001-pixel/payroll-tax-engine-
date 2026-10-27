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
import { solveGrossUp, GrossUpRefusal } from '../site/lib/grossup.ts';

/** POST /v1/paycheck/gross-up: net to gross, found by running the engine. */

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


const LIVE = 'sk_live_grossup_key_000000001';
const withState = (code: string, extra: Record<string, unknown> = {}) => ({ ...request, workState: { code }, ...extra }) as any;
const net = (input: unknown) => calculatePaycheck(input as never).netPay;

describe('solveGrossUp', () => {
  test('finds the smallest gross that reaches the target, across states and amounts', () => {
    let exact = 0;
    for (const state of ['TX', 'OH', 'PA', 'CA', 'NY', 'IL']) {
      for (const target of [50000, 123456, 250000, 987654, 2500000]) {
        const base = withState(state);
        const g = solveGrossUp(base, 0, target, calculatePaycheck);
        const at = (amount: number) => net({ ...base, earnings: [{ ...base.earnings[0], amount }] });
        assert.equal(at(g.amount), g.netPay, `${state} ${target}: reported net is the engine's`);
        assert.ok(g.netPay >= target, `${state} ${target}: reaches the target`);
        assert.ok(at(g.amount - 1) < target, `${state} ${target}: one cent less does not`);
        assert.equal(g.exact, g.netPay === target);
        if (g.exact) exact += 1;
      }
    }
    assert.ok(exact >= 20, `most targets land exactly (${exact}/30)`);
  });

  test('works on the second earning and leaves the others alone', () => {
    const base = withState('OH', { earnings: [{ code: 'REG', category: 'regular', amount: 200000 }, { code: 'BON', category: 'supplemental', amount: 1 }] });
    const g = solveGrossUp(base, 1, 300000, calculatePaycheck);
    assert.equal(g.input.earnings[0]!.amount, 200000);
    assert.equal(g.input.earnings[1]!.amount, g.amount);
    assert.ok(g.netPay >= 300000);
  });

  test('accounts for deductions that come out of the paycheck', () => {
    const base = withState('OH', { deductions: [{ code: '401K', category: '401k', amount: 20000 }, { code: 'INS', category: null, amount: 5000 }] });
    const g = solveGrossUp(base, 0, 150000, calculatePaycheck);
    assert.ok(g.netPay >= 150000);
    assert.ok(g.grossPay > 150000 + 25000, 'gross covers the deductions as well as the tax');
  });

  test('a zero target needs zero gross', () => {
    const g = solveGrossUp(withState('TX'), 0, 0, calculatePaycheck);
    assert.equal(g.amount, 0);
    assert.equal(g.exact, true);
  });

  test('refuses an earning that cannot raise take-home pay', () => {
    const base = withState('TX', { earnings: [{ code: 'GTL', category: 'imputed', amount: 1000 }] });
    assert.throws(() => solveGrossUp(base, 0, 100000, calculatePaycheck), GrossUpRefusal);
    assert.throws(() => solveGrossUp(withState('TX'), 5, 100000, calculatePaycheck), GrossUpRefusal);
  });

  test('refuses a target no amount reaches', () => {
    const never = () => ({ netPay: 0, grossPay: 0 }) as never;
    assert.throws(() => solveGrossUp(withState('TX'), 0, 100000, never), /No amount/);
  });

  test('reports a skipped target honestly', () => {
    // An engine whose net jumps by 2 cents per cent of gross above 1000 skips odd targets.
    const stepped = (input: any) => {
      const a = input.earnings[0].amount as number;
      const netPay = a <= 1000 ? a : 1000 + (a - 1000) * 2;
      return { netPay, grossPay: a } as never;
    };
    const g = solveGrossUp(withState('TX'), 0, 1501, stepped);
    assert.equal(g.exact, false);
    assert.equal(g.netPay, 1502);
    assert.equal(g.overTarget, 1);
    assert.equal(g.netPayOneCentLess, 1500);
  });
});

describe('POST /v1/paycheck/gross-up', () => {
  let s: Srv;
  before(async () => { s = await start({}, seedAccount({ card: true, liveKey: LIVE })); });
  after(() => s.stop());

  test('returns the solved request, and the paycheck matches POST /v1/paycheck on it', async () => {
    const r = await post(s.base, '/v1/paycheck/gross-up', { ...request, grossUp: { targetNetPay: 250000 } }, LIVE);
    assert.equal(r.status, 200);
    const body = await r.json() as any;
    assert.equal(body.grossUp.targetNetPay, 250000);
    assert.equal(body.grossUp.exact, true);
    assert.equal(body.result.netPay, 250000);
    assert.equal(body.request.earnings[0].amount, body.grossUp.amount);
    assert.equal(body.grossUp.input, undefined, 'the internal request is not echoed twice');
    const again = await (await post(s.base, '/v1/paycheck', body.request, LIVE)).json() as any;
    assert.deepEqual(again.result, body.result, 'the returned request reproduces the returned paycheck');
  });

  test('is billed as one paycheck', async () => {
    const before = s.db().usage.length;
    await post(s.base, '/v1/paycheck/gross-up', { ...request, grossUp: { targetNetPay: 100000 } }, LIVE);
    const rows = s.db().usage.slice(before);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].paychecks, 1);
    assert.equal(rows[0].endpoint, 'POST /v1/paycheck/gross-up');
  });

  test('refuses a bad grossUp, and is not billed', async () => {
    const before = s.db().usage.length;
    for (const grossUp of [undefined, {}, { targetNetPay: 12.5 }, { targetNetPay: -1 }, { targetNetPay: 1000, earningIndex: 3 }, { targetNetPay: 1000, extra: 1 }, 'x']) {
      const r = await post(s.base, '/v1/paycheck/gross-up', { ...request, ...(grossUp === undefined ? {} : { grossUp }) }, LIVE);
      assert.equal(r.status, 422, JSON.stringify(grossUp));
      assert.equal(((await r.json()) as any).code, 'invalid_input');
    }
    for (const row of s.db().usage.slice(before)) assert.equal(row.paychecks, 0);
  });

  test('a normal validation failure names the field', async () => {
    const r = await post(s.base, '/v1/paycheck/gross-up', { ...request, payFrequency: 'nope', grossUp: { targetNetPay: 1000 } }, LIVE);
    assert.equal(r.status, 422);
    assert.ok(((await r.json()) as any).details.some((d: any) => d.path === 'payFrequency'));
  });

  test('an imputed earning is refused with cannot_gross_up', async () => {
    const r = await post(s.base, '/v1/paycheck/gross-up', { ...request, earnings: [{ code: 'GTL', category: 'imputed', amount: 100 }], grossUp: { targetNetPay: 100000 } }, LIVE);
    assert.equal(r.status, 422);
    assert.equal(((await r.json()) as any).code, 'cannot_gross_up');
  });

  test('needs a key', async () => {
    const r = await fetch(s.base + '/v1/paycheck/gross-up', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...request, grossUp: { targetNetPay: 1000 } }) });
    assert.equal(r.status, 401);
  });

  test('works over MCP as gross_up, billed as one paycheck', async () => {
    const before = s.db().usage.length;
    const r = await fetch(s.base + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LIVE}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'gross_up', arguments: { ...request, grossUp: { targetNetPay: 180000 } } } }) });
    const body = await r.json() as any;
    assert.equal(body.result.isError, false);
    assert.equal(body.result.structuredContent.result.netPay, 180000);
    const rows = s.db().usage.slice(before);
    assert.deepEqual(rows.map((x: any) => [x.endpoint, x.paychecks]), [['POST /mcp gross_up', 1]]);
  });
});

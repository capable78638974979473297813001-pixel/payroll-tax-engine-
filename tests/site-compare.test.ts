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
import { diffInputs, mergePatch } from '../site/lib/compare.ts';

/** POST /v1/paycheck/compare: two paychecks, what moved, and why. */

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


const LIVE = 'sk_live_compare_key_000000000001';
const cents = (r: { netPay: number }) => r.netPay;

describe('unit: diff and merge patch', () => {
  test('diffInputs lists every changed leaf with array positions', () => {
    const d = diffInputs({ a: 1, b: { c: [1, 2] }, gone: 'x' }, { a: 2, b: { c: [1, 3, 4] }, added: true });
    const by = Object.fromEntries(d.map((c) => [c.path, c]));
    assert.deepEqual(Object.keys(by).sort(), ['a', 'added', 'b.c[1]', 'b.c[2]', 'gone']);
    assert.equal(by['a']!.before, 1);
    assert.equal(by['gone']!.after, undefined);
  });
  test('mergePatch merges objects, replaces arrays, null deletes', () => {
    assert.deepEqual(mergePatch({ a: { b: 1, c: 2 }, l: [1, 2] }, { a: { b: 9, c: null }, l: [3] }), { a: { b: 9 }, l: [3] });
  });
});

describe('POST /v1/paycheck/compare', () => {
  let s: Srv;
  before(async () => { s = await start({}, seedAccount({ card: true, liveKey: LIVE })); });
  after(() => s.stop());

  test('a raise explains the net-pay change tax by tax, and the steps add up', async () => {
    const after = { ...request, earnings: [{ code: 'REG', category: 'regular', amount: 360000 }] };
    const r = await post(s.base, '/v1/paycheck/compare', { before: request, after }, LIVE);
    assert.equal(r.status, 200);
    const body = await r.json() as any;
    const direct = {
      before: JSON.parse(JSON.stringify(calculatePaycheck(request as never))),
      after: JSON.parse(JSON.stringify(calculatePaycheck(after as never))),
    };
    assert.equal(body.before.netPay, direct.before.netPay, 'the engine ran both');
    assert.equal(body.after.netPay, direct.after.netPay);
    const c = body.comparison;
    assert.equal(c.totals.netPay.change, direct.after.netPay - direct.before.netPay);
    assert.equal(c.totals.grossPay.change, 60000);
    assert.deepEqual(c.inputChanges.map((x: any) => x.path), ['earnings[0].amount']);
    assert.equal(c.steps.length, 1);
    const stepSum = c.steps.reduce((n: number, st: any) => n + st.netPayChange, 0);
    assert.equal(stepSum, c.totals.netPay.change, 'steps telescope to the whole difference');
    const taxChange = c.taxes.reduce((n: number, t: any) => n + (t.payer === 'employee' ? t.change : 0), 0);
    assert.equal(c.totals.employeeTaxTotal.change, taxChange);
    assert.match(c.steps[0].narrative, /Net pay goes up/);
  });

  test('"change" is a merge patch onto before and gives the same answer as sending after', async () => {
    const patch = { workState: { code: 'CA' } };
    const viaChange = await (await post(s.base, '/v1/paycheck/compare', { before: request, change: patch }, LIVE)).json() as any;
    const viaAfter = await (await post(s.base, '/v1/paycheck/compare', { before: request, after: { ...request, ...patch } }, LIVE)).json() as any;
    assert.deepEqual(viaChange.comparison, viaAfter.comparison);
    assert.equal(viaChange.after.netPay, cents(JSON.parse(JSON.stringify(calculatePaycheck({ ...request, ...patch } as never)))));
  });

  test('several changes become ordered steps that still add up', async () => {
    const after = {
      ...request,
      workState: { code: 'CA' },
      earnings: [{ code: 'REG', category: 'regular', amount: 400000 }, { code: 'BON', category: 'supplemental', amount: 50000 }],
    };
    const body = await (await post(s.base, '/v1/paycheck/compare', { before: request, after }, LIVE)).json() as any;
    const c = body.comparison;
    assert.ok(c.steps.length >= 2, 'more than one step');
    assert.equal(c.steps.reduce((n: number, st: any) => n + st.netPayChange, 0), c.totals.netPay.change);
    assert.ok(c.steps.every((st: any) => typeof st.summary === 'string' && st.summary.length > 0));
  });

  test('identical paychecks compare as no change', async () => {
    const body = await (await post(s.base, '/v1/paycheck/compare', { before: request, after: request }, LIVE)).json() as any;
    assert.equal(body.comparison.totals.netPay.change, 0);
    assert.deepEqual(body.comparison.inputChanges, []);
    assert.deepEqual(body.comparison.taxes, []);
    assert.deepEqual(body.comparison.steps, []);
  });

  test('a bad paycheck is refused with the field path, and is not billed', async () => {
    const before = s.db().usage.length;
    const r = await post(s.base, '/v1/paycheck/compare', { before: request, after: { ...request, payFrequency: 'fortnightly' } }, LIVE);
    assert.equal(r.status, 422);
    const body = await r.json() as any;
    assert.equal(body.code, 'invalid_input');
    assert.ok(body.details.some((d: any) => String(d.path).startsWith('after.')), JSON.stringify(body.details));
    const rows = s.db().usage.slice(before);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].paychecks, 0);
  });

  test('needs exactly one of after or change, and an object for before', async () => {
    for (const body of [{ before: request }, { before: request, after: request, change: {} }, { after: request }, 'x', [request]]) {
      const r = await post(s.base, '/v1/paycheck/compare', body, LIVE);
      assert.equal(r.status, 422, JSON.stringify(body).slice(0, 60));
    }
  });

  test('is billed as two paychecks', async () => {
    const before = s.db().usage.length;
    const r = await post(s.base, '/v1/paycheck/compare', { before: request, change: { earnings: [{ code: 'REG', category: 'regular', amount: 310000 }] } }, LIVE);
    assert.equal(r.status, 200);
    const rows = s.db().usage.slice(before);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].paychecks, 2);
    assert.equal(rows[0].endpoint, 'POST /v1/paycheck/compare');
  });

  test('needs a key', async () => {
    const r = await fetch(s.base + '/v1/paycheck/compare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ before: request, after: request }) });
    assert.equal(r.status, 401);
  });

  test('a test key can compare, unbilled', async () => {
    const { key } = await (await post(s.base, '/api/issue-key', { mode: 'test' }, 'sess_tok')).json() as { key: string };
    const before = s.db().usage.length;
    const r = await post(s.base, '/v1/paycheck/compare', { before: request, change: { workState: { code: 'TX' } } }, key);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('omnia-mode'), 'test');
    assert.equal(s.db().usage.length, before);
  });
});

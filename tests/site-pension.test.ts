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

/** Pension, annuity and IRA payments through POST /v1/paycheck, the compare endpoint and the MCP tool. */

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


const LIVE = 'sk_live_pension_key_00000000001';
const pension = (extra: Record<string, unknown> = {}, p: Record<string, unknown> = { kind: 'periodic' }) => ({
  checkDate: '2026-06-15', payFrequency: 'monthly', earnings: [{ code: 'PENSION', category: 'regular', amount: 200_000 }], deductions: [], pension: p, ...extra,
});

describe('a pension payment through the API', () => {
  let s: Srv;
  before(async () => { s = await start({}, seedAccount({ card: true, liveKey: LIVE })); });
  after(() => s.stop());
  const send = (path: string, body: unknown) => post(s.base, path, body, LIVE);

  test('needs no federalW4 and no ytd, and returns the engine\'s one federal line', async () => {
    const r = await send('/v1/paycheck', pension());
    assert.equal(r.status, 200);
    const body = await r.json() as { result: { taxes: Array<{ id: string; amount: number; detail: string }>; netPay: number; warnings?: string[] } };
    assert.deepEqual(body.result.taxes.map((t) => t.id), ['US_FIT_PENSION']);
    assert.equal(body.result.taxes[0]!.amount, 6583);
    assert.equal(body.result.netPay, 200_000 - 6583);
    assert.match(body.result.warnings!.join(' '), /State and local income tax withholding on pension payments is not calculated/);
    assert.ok(!body.result.warnings!.some((w) => /pension/.test(w) && /ignored|unknown/i.test(w)), 'pension is a known field');
  });

  test('wages still need federalW4 and ytd', async () => {
    const wages = { checkDate: '2026-06-15', payFrequency: 'biweekly', earnings: [{ code: 'REG', category: 'regular', amount: 300_000 }], deductions: [] };
    const r = await send('/v1/paycheck', wages);
    assert.equal(r.status, 422);
    const paths = ((await r.json()) as { details: Array<{ path: string }> }).details.map((d) => d.path);
    assert.ok(paths.includes('federalW4') && paths.includes('ytd'));
  });

  test('W-4R rates, W-4P entries and the rollover floor come through', async () => {
    const rate = async (p: Record<string, unknown>, amount = 1_000_000) => {
      const r = await send('/v1/paycheck', pension({ earnings: [{ code: 'P', category: 'regular', amount }] }, p));
      return ((await r.json()) as { result: { taxes: Array<{ amount: number }> } }).result.taxes[0]!.amount;
    };
    assert.equal(await rate({ kind: 'nonperiodic' }), 100_000);
    assert.equal(await rate({ kind: 'nonperiodic', w4r: { withholdingRate: 0 } }), 0);
    assert.equal(await rate({ kind: 'eligible_rollover' }), 200_000);
    assert.equal(await rate({ kind: 'eligible_rollover', w4r: { withholdingRate: 5 } }), 200_000);
    assert.equal(await rate({ kind: 'periodic', w4p: { filingStatus: 'married_joint' } }, 200_000), 0);
  });

  test('refusals name the field', async () => {
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ['a bad kind', pension({}, { kind: 'lump' }), 'pension.kind'],
      ['a rate over 100', pension({}, { kind: 'nonperiodic', w4r: { withholdingRate: 150 } }), 'pension.w4r.withholdingRate'],
      ['a fractional rate', pension({}, { kind: 'nonperiodic', w4r: { withholdingRate: 12.5 } }), 'pension.w4r.withholdingRate'],
      ['W-4R on a periodic payment', pension({}, { kind: 'periodic', w4r: { withholdingRate: 10 } }), 'pension.w4r'],
      ['W-4P on a nonperiodic payment', pension({}, { kind: 'nonperiodic', w4p: { filingStatus: 'single' } }), 'pension.w4p'],
      ['a quarterly periodic payment', pension({ payFrequency: 'quarterly' }), 'payFrequency'],
      ['a pre-tax deduction', pension({ deductions: [{ code: '401K', category: 'deferral_401k', amount: 1000 }] }), 'deductions'],
      ['dollars instead of cents', pension({}, { kind: 'periodic', w4p: { credits: 1000.5 } }), 'pension.w4p.credits'],
      ['old-form fields on a new form', pension({}, { kind: 'periodic', w4p: { allowances: 2 } }), 'pension.w4p'],
      ['a pension in a clergy category', pension({ employmentCategory: 'clergy' }), 'employmentCategory'],
    ];
    for (const [label, body, path] of cases) {
      const r = await send('/v1/paycheck', body);
      assert.equal(r.status, 422, label);
      const details = ((await r.json()) as { details: Array<{ path: string }> }).details;
      assert.ok(details.some((d) => d.path === path), `${label}: ${JSON.stringify(details)}`);
    }
  });

  test('a year that has not been checked is a cannot_compute, not a wrong number', async () => {
    const r = await send('/v1/paycheck', pension({ checkDate: '2025-06-15' }));
    assert.equal(r.status, 422);
    assert.equal(((await r.json()) as { code: string }).code, 'cannot_compute');
  });

  test('billed as one paycheck, and a refusal is not billed', async () => {
    const before = s.db().usage.length;
    await send('/v1/paycheck', pension());
    await send('/v1/paycheck', pension({}, { kind: 'lump' }));
    const rows = s.db().usage.slice(before) as Array<{ paychecks: number; statusCode: number }>;
    assert.deepEqual(rows.map((r) => [r.statusCode, r.paychecks]), [[200, 1], [422, 0]]);
  });

  test('the compare endpoint and the MCP tool take it too', async () => {
    const c = await send('/v1/paycheck/compare', { before: pension(), change: { pension: { kind: 'periodic', w4p: { filingStatus: 'married_joint' } } } });
    assert.equal(c.status, 200);
    const cmp = await c.json() as { comparison: { totals: { employeeTaxTotal: { change: number } } } };
    assert.equal(cmp.comparison.totals.employeeTaxTotal.change, -6583);
    const m = await fetch(s.base + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LIVE}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'calculate_paycheck', arguments: pension() } }) });
    const out = await m.json() as { result: { isError: boolean; structuredContent: { result: { taxes: Array<{ id: string }> } } } };
    assert.equal(out.result.isError, false);
    assert.equal(out.result.structuredContent.result.taxes[0]!.id, 'US_FIT_PENSION');
  });

  test('the published schema describes pension and does not require a W-4 for it', async () => {
    const schema = await (await fetch(s.base + '/v1/schemas/paycheck-request.json')).json() as { required: string[]; properties: Record<string, unknown>; if: unknown; then: { required: string[] } };
    assert.ok('pension' in schema.properties);
    assert.deepEqual(schema.required, ['checkDate', 'payFrequency', 'earnings', 'deductions']);
    assert.deepEqual(schema.then.required, ['federalW4', 'ytd']);
    assert.deepEqual(schema.if, { not: { required: ['pension'] } });
  });
});

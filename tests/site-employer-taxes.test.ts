import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { employerTaxes, parseQuarter, validateEmployerTaxes, MCTMT_THRESHOLD, EmployerTaxRefusal } from '../site/lib/employer-taxes.ts';

/** POST /v1/employer-taxes: MCTMT and the Nevada MBT, taxes on a quarter's payroll. */

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


const LIVE = 'sk_live_employer_key_0000000001';
const q = (s: string) => parseQuarter(s)!;
const usd = (d: number) => Math.round(d * 100);
const NY = JSON.parse(readFileSync(join(REPO, 'data', 'states', 'NY-2026.json'), 'utf8'));
const NV = JSON.parse(readFileSync(join(REPO, 'data', 'states', 'NV-2026.json'), 'utf8'));

describe('the figures come from the data files', () => {
  test('the threshold constant matches the sourced text', () => {
    assert.match(NY.mctmt.threshold, /\$312,500/);
    assert.equal(MCTMT_THRESHOLD, usd(312_500));
  });
  test('the Nevada rates are the sourced ones', () => {
    assert.equal(NV.modifiedBusinessTax.generalBusiness.rate, 0.0117);
    assert.equal(NV.modifiedBusinessTax.generalBusiness.quarterlyExemption, 50_000);
    assert.equal(NV.modifiedBusinessTax.financialInstitutionsAndMining.quarterlyExemption, 0);
  });
});

describe('MCTMT', () => {
  test('reproduces the state\'s worked example: $450,000 Zone 1 + $200,000 Zone 2 = $2,810', () => {
    const r = employerTaxes(q('2026-Q2'), { mctmt: { zone1PayrollExpense: usd(450_000), zone2PayrollExpense: usd(200_000) } });
    assert.equal(r.lines[0]!.amount, usd(2810));
    assert.equal(r.total, usd(2810));
    assert.match(r.lines[0]!.detail, /Zone 1 \$450,000\.00 at 0\.6% = \$2,700\.00; Zone 2 \$200,000\.00 at 0\.055% = \$110\.00/);
  });
  test('nothing is due at or under the $312,500 threshold across both zones', () => {
    assert.equal(employerTaxes(q('2026-Q1'), { mctmt: { zone1PayrollExpense: usd(200_000), zone2PayrollExpense: usd(112_500) } }).lines.length, 0);
    const over = employerTaxes(q('2026-Q1'), { mctmt: { zone1PayrollExpense: usd(200_000), zone2PayrollExpense: usd(112_501) } });
    assert.equal(over.lines.length, 1);
    assert.equal(over.lines[0]!.amount, Math.round(usd(200_000) * 0.00055 + usd(112_501) * 0.00055));
  });
  test('each zone uses its own bracket', () => {
    const r = employerTaxes(q('2026-Q3'), { mctmt: { zone1PayrollExpense: usd(3_000_000), zone2PayrollExpense: usd(3_000_000) } });
    assert.equal(r.lines[0]!.amount, Math.round(usd(3_000_000) * 0.00895) + Math.round(usd(3_000_000) * 0.00635));
  });
  test('bracket edges: over X up to and including Y', () => {
    const at = (z1: number) => employerTaxes(q('2026-Q2'), { mctmt: { zone1PayrollExpense: usd(z1), zone2PayrollExpense: usd(300_000) } }).lines[0]!.amount - Math.round(usd(300_000) * 0.00055);
    assert.equal(at(375_000), Math.round(usd(375_000) * 0.00055));
    assert.equal(at(375_001), Math.round(usd(375_001) * 0.00115));
    assert.equal(at(437_500), Math.round(usd(437_500) * 0.00115));
    assert.equal(at(437_501), Math.round(usd(437_501) * 0.006));
  });
  test('quarters outside the verified range are refused', () => {
    for (const quarter of ['2025-Q2', '2027-Q1']) {
      assert.throws(() => employerTaxes(q(quarter), { mctmt: { zone1PayrollExpense: usd(500_000), zone2PayrollExpense: 0 } }), EmployerTaxRefusal);
    }
    assert.doesNotThrow(() => employerTaxes(q('2025-Q3'), { mctmt: { zone1PayrollExpense: usd(500_000), zone2PayrollExpense: 0 } }));
  });
});

describe('Nevada MBT', () => {
  test('general business: 1.17% of wages over the $50,000 quarterly exemption, after health benefits', () => {
    const r = employerTaxes(q('2026-Q2'), { nevadaMbt: { category: 'general', grossWages: usd(300_000), healthBenefitsPaid: usd(20_000) } });
    assert.equal(r.lines[0]!.basis, usd(230_000));
    assert.equal(r.lines[0]!.amount, Math.round(usd(230_000) * 0.0117));
  });
  test('wages under the exemption owe nothing, and the line still appears', () => {
    const r = employerTaxes(q('2026-Q2'), { nevadaMbt: { category: 'general', grossWages: usd(49_000), healthBenefitsPaid: 0 } });
    assert.equal(r.lines[0]!.amount, 0);
  });
  test('financial institutions and mining: no exemption', () => {
    const r = employerTaxes(q('2026-Q2'), { nevadaMbt: { category: 'financial', grossWages: usd(100_000), healthBenefitsPaid: 0 } });
    assert.equal(r.lines[0]!.amount, Math.round(usd(100_000) * 0.01554));
  });
  test('health benefits larger than wages do not make a negative tax', () => {
    const r = employerTaxes(q('2026-Q2'), { nevadaMbt: { category: 'general', grossWages: usd(10_000), healthBenefitsPaid: usd(20_000) } });
    assert.equal(r.lines[0]!.amount, 0);
  });
});

describe('validateEmployerTaxes', () => {
  const bad = (body: unknown) => { const v = validateEmployerTaxes(body); assert.equal(v.ok, false, JSON.stringify(body)); return (v as any).errors as Array<{ path: string; message: string }>; };
  test('refuses what it cannot read', () => {
    assert.ok(bad({}).some((e) => e.path === 'quarter'));
    assert.ok(bad({ quarter: '2026-Q5', mctmt: {} }).some((e) => e.path === 'quarter'));
    assert.ok(bad({ quarter: '2026-Q1' }).length > 0, 'needs a tax');
    assert.ok(bad({ quarter: '2026-Q1', mctmt: { zone1PayrollExpense: 1000.5 } }).some((e) => e.path === 'mctmt.zone1PayrollExpense'));
    assert.ok(bad({ quarter: '2026-Q1', mctmt: { zone1PayrollExpense: -1 } }).some((e) => e.path === 'mctmt.zone1PayrollExpense'));
    assert.ok(bad({ quarter: '2026-Q1', mctmt: {} }).some((e) => e.path === 'mctmt'));
    assert.ok(bad({ quarter: '2026-Q1', mctmt: { zone1PayrollExpense: 1, localGovernment: true } }).some((e) => /local government/.test(e.message)));
    assert.ok(bad({ quarter: '2026-Q1', nevadaMbt: { grossWages: 1 } }).some((e) => e.path === 'nevadaMbt.category'));
    assert.ok(bad({ quarter: '2026-Q1', nevadaMbt: { category: 'general' } }).some((e) => e.path === 'nevadaMbt.grossWages'));
    assert.ok(bad({ quarter: '2026-Q1', nonsense: 1, mctmt: { zone1PayrollExpense: 1 } }).some((e) => e.path === 'nonsense'));
    bad('x'); bad([]);
  });
});

describe('POST /v1/employer-taxes', () => {
  let s: Srv;
  before(async () => { s = await start({}, seedAccount({ card: true, liveKey: LIVE })); });
  after(() => s.stop());

  const body = { quarter: '2026-Q2', mctmt: { zone1PayrollExpense: usd(450_000), zone2PayrollExpense: usd(200_000) }, nevadaMbt: { category: 'general', grossWages: usd(300_000), healthBenefitsPaid: usd(20_000) } };

  test('returns both taxes and a total', async () => {
    const r = await post(s.base, '/v1/employer-taxes', body, LIVE);
    assert.equal(r.status, 200);
    const out = await r.json() as any;
    assert.deepEqual(out.result.lines.map((l: any) => [l.id, l.amount]), [['NY_MCTMT', usd(2810)], ['NV_MBT', Math.round(usd(230_000) * 0.0117)]]);
    assert.equal(out.result.total, out.result.lines.reduce((n: number, l: any) => n + l.amount, 0));
    assert.equal(out.result.quarter, '2026-Q2');
  });

  test('is recorded and not billed', async () => {
    const before = s.db().usage.length;
    await post(s.base, '/v1/employer-taxes', body, LIVE);
    const rows = s.db().usage.slice(before);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].paychecks, 0);
    assert.equal(rows[0].endpoint, 'POST /v1/employer-taxes');
  });

  test('refusals name the field; an unsupported quarter is its own code', async () => {
    const bad = await post(s.base, '/v1/employer-taxes', { quarter: '2026-Q2', mctmt: { zone1PayrollExpense: 1.5 } }, LIVE);
    assert.equal(bad.status, 422);
    const b = await bad.json() as any;
    assert.equal(b.code, 'invalid_input');
    assert.equal(b.details[0].path, 'mctmt.zone1PayrollExpense');
    const old = await post(s.base, '/v1/employer-taxes', { ...body, quarter: '2024-Q1' }, LIVE);
    assert.equal(old.status, 422);
    assert.equal(((await old.json()) as any).code, 'unsupported_quarter');
  });

  test('needs a key', async () => {
    const r = await fetch(s.base + '/v1/employer-taxes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(r.status, 401);
  });

  test('works over MCP as employer_taxes, not billed', async () => {
    const before = s.db().usage.length;
    const r = await fetch(s.base + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LIVE}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'employer_taxes', arguments: body } }) });
    const out = await r.json() as any;
    assert.equal(out.result.isError, false);
    assert.equal(out.result.structuredContent.result.lines[0].amount, usd(2810));
    assert.deepEqual(s.db().usage.slice(before).map((x: any) => [x.endpoint, x.paychecks]), [['POST /mcp employer_taxes', 0]]);
  });
});

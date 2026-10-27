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

/** POST /mcp: the Model Context Protocol endpoint, over the same engine and billing as the REST API. */

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


const LIVE = 'sk_live_mcp_key_00000000000001';

let rpcId = 0;
const rpc = (base: string, method: string, params: unknown, token: string | null = LIVE, extra: Record<string, string> = {}) =>
  fetch(base + '/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  });
const callTool = async (base: string, name: string, args: unknown, token: string | null = LIVE) => {
  const r = await rpc(base, 'tools/call', { name, arguments: args }, token);
  assert.equal(r.status, 200);
  return (await r.json()) as { result: { content: Array<{ type: string; text: string }>; structuredContent: any; isError: boolean } };
};

describe('POST /mcp', () => {
  let s: Srv;
  before(async () => { s = await start({}, seedAccount({ card: true, liveKey: LIVE })); });
  after(() => s.stop());

  test('initialize negotiates a version and advertises tools', async () => {
    const r = await rpc(s.base, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } });
    assert.equal(r.status, 200);
    const body = await r.json() as any;
    assert.equal(body.jsonrpc, '2.0');
    assert.equal(body.result.protocolVersion, '2025-03-26');
    assert.ok(body.result.capabilities.tools);
    assert.equal(body.result.serverInfo.name, 'omnia-tax');
    const unknown = await (await rpc(s.base, 'initialize', { protocolVersion: '1999-01-01' })).json() as any;
    assert.equal(unknown.result.protocolVersion, '2025-06-18', 'an unknown version gets the newest we speak');
  });

  test('tools/list names the six tools with input schemas', async () => {
    const body = await (await rpc(s.base, 'tools/list', {})).json() as any;
    assert.deepEqual(body.result.tools.map((t: any) => t.name), ['calculate_paycheck', 'compare_paychecks', 'gross_up', 'employer_taxes', 'lookup_address', 'coverage']);
    for (const t of body.result.tools) {
      assert.equal(t.inputSchema.type, 'object');
      assert.ok(t.description.length > 40);
    }
  });

  test('calculate_paycheck returns the engine result, as text and as structured content', async () => {
    const { result } = await callTool(s.base, 'calculate_paycheck', request);
    assert.equal(result.isError, false);
    const direct = JSON.parse(JSON.stringify(calculatePaycheck(request as never)));
    assert.equal(result.structuredContent.result.netPay, direct.netPay);
    assert.deepEqual(result.structuredContent.result.taxes, direct.taxes);
    assert.deepEqual(JSON.parse(result.content[0]!.text), result.structuredContent);
  });

  test('a refused paycheck is a tool error that names the field, not a protocol error', async () => {
    const { result } = await callTool(s.base, 'calculate_paycheck', { ...request, payFrequency: 'fortnightly' });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.code, 'invalid_input');
    assert.ok(result.structuredContent.details.some((d: any) => d.path === 'payFrequency'));
  });

  test('compare_paychecks explains a change', async () => {
    const { result } = await callTool(s.base, 'compare_paychecks', { before: request, change: { workState: { code: 'CA' } } });
    assert.equal(result.isError, false);
    const c = result.structuredContent.comparison;
    assert.equal(c.steps.reduce((n: number, st: any) => n + st.netPayChange, 0), c.totals.netPay.change);
    assert.match(c.steps[0].narrative, /Net pay/);
  });

  test('lookup_address validates its input and does not bill', async () => {
    const { result } = await callTool(s.base, 'lookup_address', {});
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.code, 'invalid_input');
  });

  test('coverage returns a state, and refuses one that is not there', async () => {
    const ok = (await callTool(s.base, 'coverage', { state: 'oh' })).result;
    assert.equal(ok.isError, false);
    assert.equal(ok.structuredContent.states.length, 1);
    assert.equal(ok.structuredContent.states[0].code, 'OH');
    const all = (await callTool(s.base, 'coverage', {})).result;
    assert.ok(all.structuredContent.states.length >= 50);
    assert.equal((await callTool(s.base, 'coverage', { state: 'ZZ' })).result.isError, true);
  });

  test('usage is recorded per tool, with the same billing as the REST endpoint', async () => {
    const start = s.db().usage.length;
    await callTool(s.base, 'calculate_paycheck', request);
    await callTool(s.base, 'compare_paychecks', { before: request, change: { workState: { code: 'TX' } } });
    await callTool(s.base, 'calculate_paycheck', { ...request, payFrequency: 'nope' });
    await callTool(s.base, 'coverage', {});
    await rpc(s.base, 'tools/list', {});
    const rows = s.db().usage.slice(start) as Array<{ endpoint: string; paychecks: number; statusCode: number }>;
    assert.deepEqual(rows.map((r) => [r.endpoint, r.paychecks, r.statusCode]), [
      ['POST /mcp calculate_paycheck', 1, 200],
      ['POST /mcp compare_paychecks', 2, 200],
      ['POST /mcp calculate_paycheck', 0, 422],
      ['POST /mcp coverage', 0, 200],
    ], 'the handshake and tool list are not usage; a refused call is not billed');
  });

  test('notifications get a 202 and no body; batches, bad JSON and bad shapes are refused', async () => {
    const note = await fetch(s.base + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LIVE}` }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
    assert.equal(note.status, 202);
    assert.equal(await note.text(), '');
    const batch = await fetch(s.base + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LIVE}` }, body: JSON.stringify([{ jsonrpc: '2.0', id: 1, method: 'ping' }]) });
    assert.equal(batch.status, 400);
    assert.equal(((await batch.json()) as any).error.code, -32600);
    const bad = await fetch(s.base + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LIVE}` }, body: '{nope' });
    assert.equal(bad.status, 400);
    assert.equal(((await bad.json()) as any).error.code, -32700);
    const notRpc = await fetch(s.base + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LIVE}` }, body: JSON.stringify({ hello: 1 }) });
    assert.equal(notRpc.status, 400);
  });

  test('unknown method and unknown tool are JSON-RPC errors; ping works', async () => {
    assert.equal(((await (await rpc(s.base, 'resources/list', {})).json()) as any).error.code, -32601);
    assert.equal(((await (await rpc(s.base, 'tools/call', { name: 'delete_everything', arguments: {} })).json()) as any).error.code, -32602);
    assert.equal(((await (await rpc(s.base, 'tools/call', { name: 'coverage', arguments: [] })).json()) as any).error.code, -32602);
    assert.deepEqual(((await (await rpc(s.base, 'ping', {})).json()) as any).result, {});
  });

  test('needs a key, refuses a foreign Origin, and has no GET stream', async () => {
    assert.equal((await rpc(s.base, 'ping', {}, null)).status, 401);
    assert.equal((await rpc(s.base, 'ping', {}, 'sk_live_not_a_real_key_000000')).status, 401);
    assert.equal((await rpc(s.base, 'ping', {}, LIVE, { Origin: 'https://evil.example' })).status, 403);
    const get = await fetch(s.base + '/mcp', { headers: { Authorization: `Bearer ${LIVE}`, Accept: 'text/event-stream' } });
    assert.equal(get.status, 405);
    assert.equal(get.headers.get('allow'), 'POST');
  });

  test('a test key works over MCP and stays unbilled', async () => {
    const { key } = await (await post(s.base, '/api/issue-key', { mode: 'test' }, 'sess_tok')).json() as { key: string };
    const before = s.db().usage.length;
    const { result } = await callTool(s.base, 'calculate_paycheck', request, key);
    assert.equal(result.isError, false);
    assert.equal(s.db().usage.length, before);
  });
});

describe('POST /mcp rate limit', () => {
  test('is held to the key\'s per-minute limit', async () => {
    const s = await start({ RATE_LIMIT_PER_MIN: '3' }, seedAccount({ card: true, liveKey: LIVE }));
    try {
      const codes: number[] = [];
      for (let i = 0; i < 5; i++) codes.push((await rpc(s.base, 'ping', {})).status);
      assert.deepEqual(codes, [200, 200, 200, 429, 429]);
    } finally { s.stop(); }
  });
});

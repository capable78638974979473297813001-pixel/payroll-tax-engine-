import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mintApiKey, setStripeCustomer, verifyApiKey } from '../api/keys.ts';

/**
 * Batch routes meter one value-1 event per successful paycheck, not one
 * event for the HTTP request. A paycheck that fails is not metered.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const freePort = () => new Promise<number>((resolve) => {
  const srv = createNetServer();
  srv.listen(0, '127.0.0.1', () => { const { port } = srv.address() as { port: number }; srv.close(() => resolve(port)); });
});

let dir = '';
let child: ChildProcess;
let fakes: Server;
let BASE = '';
let key = '';
const meterEvents: Array<Record<string, string>> = [];

const bearer = () => ({ Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'batch-meter-'));
  process.env.API_DB_DIR = dir;
  const minted = mintApiKey('Batch Co', { mode: 'live' });
  key = minted.key;
  const id = verifyApiKey(key)!.id;
  setStripeCustomer(id, 'cus_batch');

  const port = await freePort();
  BASE = `http://127.0.0.1:${port}`;
  fakes = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      if (req.method === 'POST' && (req.url ?? '').startsWith('/v1/billing/meter_events')) {
        meterEvents.push(Object.fromEntries(new URLSearchParams(raw)));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ identifier: 'ok' }));
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'no such route' } }));
    });
  });
  await new Promise<void>((r) => fakes.listen(0, '127.0.0.1', r));
  const fakeBase = `http://127.0.0.1:${(fakes.address() as { port: number }).port}`;
  child = spawn('node', ['examples/api-server.ts'], {
    cwd: REPO,
    env: {
      ...process.env,
      PORT: String(port),
      API_DB_DIR: dir,
      STRIPE_SECRET_KEY: 'sk_test_fake',
      STRIPE_API_BASE: fakeBase,
      STRIPE_PRICE_ID: 'price_batch',
      STRIPE_METER_EVENT_NAME: 'paycheck_calculated',
      STRIPE_ALLOW_LIVE: '',
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${BASE}/v1/health`)).ok) return; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('api server did not become healthy');
});

after(() => {
  child?.kill('SIGKILL');
  fakes?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

const until = async (n: number) => {
  for (let i = 0; i < 40 && meterEvents.length < n; i++) await new Promise((r) => setTimeout(r, 50));
};

test('payCalc and payroll/run meter each successful paycheck', async () => {
  const catalog = await (await fetch(`${BASE}/v1/uniqueTaxIds?checkDate=2026-06-15`, { headers: bearer() })).json() as {
    entries: Array<{ state: string; type: string; uniqueTaxId: string }>;
  };
  const oh = catalog.entries.find((e) => e.state === 'OH' && e.type === 'state');
  assert.ok(oh, 'Ohio state id');

  const good = { checkDate: '2026-06-15', frequency: 'biweekly', grossPay: 3000, workUniqueTaxIds: [oh!.uniqueTaxId] };
  const bad = { checkDate: '2026-06-15', frequency: 'biweekly', grossPay: 3000 };
  const pay = await fetch(`${BASE}/v1/payCalc`, { method: 'POST', headers: bearer(), body: JSON.stringify([good, good, bad]) });
  assert.equal(pay.status, 200);
  const payBody = await pay.json() as { payCalc: Array<{ error?: string }> };
  assert.equal(payBody.payCalc.length, 3);
  assert.equal(payBody.payCalc.filter((r) => !r.error).length, 2);
  assert.ok(payBody.payCalc[2].error);
  await until(2);
  assert.equal(meterEvents.length, 2, 'two successful paychecks, not one batch event');
  for (const e of meterEvents) {
    assert.equal(e['payload[value]'], '1');
    assert.equal(e['payload[stripe_customer_id]'], 'cus_batch');
    assert.equal(e.event_name, 'paycheck_calculated');
  }
  assert.equal(new Set(meterEvents.map((e) => e.identifier)).size, 2);

  const w4 = { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 };
  const employees = ['a', 'b', 'c'].map((id) => ({
    employeeId: id, name: id, grossCents: 200_000, workStateCode: 'TX', federalW4: w4,
  }));
  const run = await fetch(`${BASE}/v1/payroll/run`, {
    method: 'POST',
    headers: bearer(),
    body: JSON.stringify({ companyId: 'co', checkDate: '2026-06-15', payFrequency: 'weekly', employees }),
  });
  assert.equal(run.status, 200, await run.clone().text());
  const runBody = await run.json() as { run: { paychecks: unknown[] } };
  assert.equal(runBody.run.paychecks.length, 3);
  await until(5);
  assert.equal(meterEvents.length, 5, 'three more paycheck events');
  assert.equal(meterEvents.filter((e) => e['payload[value]'] !== '1').length, 0);
  assert.equal(new Set(meterEvents.map((e) => e.identifier)).size, 5);
});

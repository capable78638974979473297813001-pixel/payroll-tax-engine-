import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Accounts are saved: everything a customer creates (account, accepted
 * terms, card on file, subscription, API key, usage) is still there after
 * the server is killed and started again, a previous generation of the
 * store is kept as db.json.bak, no temp or lock files are left behind, and
 * a damaged store is refused rather than overwritten.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const EMAIL = 'persist@acmepayroll.test';
const card = { id: 'pm_card', type: 'card', card: { brand: 'visa', last4: '4242' } };
const session = { id: 'cs_ok', status: 'complete', customer: 'cus_1', metadata: { omnia_email: EMAIL },
  subscription: { id: 'sub_1', default_payment_method: card } };

let dir: string;
let stripe: Server;
let stripePort: number;
let child: ChildProcess | null = null;
let base = '';

const dbFile = () => join(dir, 'db.json');
const db = () => JSON.parse(readFileSync(dbFile(), 'utf8'));
const post = (path: string, body: unknown, token?: string) =>
  fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

async function freePort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  const p = (s.address() as { port: number }).port;
  await new Promise((r) => s.close(r));
  return p;
}

async function start() {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  child = spawn('node', ['site/server.ts'], {
    cwd: REPO,
    env: {
      ...process.env, PORT: String(port), SITE_DB_DIR: dir, RATE_LIMIT_PER_MIN: '1000',
      STRIPE_SECRET_KEY: 'sk_test_fake', STRIPE_API_BASE: `http://127.0.0.1:${stripePort}`,
      STRIPE_PRICE_ID: '', RESEND_API_KEY: '', TRUST_PROXY: '',
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/v1/health`)).status < 600) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('server did not start');
}
async function kill() {
  const c = child;
  if (!c) return;
  child = null;
  const exited = new Promise((r) => c.once('exit', r));
  c.kill('SIGKILL'); // no chance to flush anything on the way down
  await exited;
}

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'site-persist-'));
  stripe = createServer((req, res) => {
    const ok = (req.url ?? '').includes('/checkout/sessions/cs_ok');
    res.writeHead(ok ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(ok ? session : { error: { message: 'No such checkout session' } }));
  });
  await new Promise<void>((r) => stripe.listen(0, '127.0.0.1', r));
  stripePort = (stripe.address() as { port: number }).port;
  await start();
});

after(async () => {
  await kill();
  stripe?.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('accounts survive a restart', () => {
  let key = '';

  test('create an account end to end: signup, code, terms, card, key, a call', async () => {
    assert.equal((await post('/api/signup', { name: 'Pat Persist', email: EMAIL, company: 'Acme', phone: '555-123-4567', agreeToTerms: true })).status, 200);
    const v = await post('/api/verify-email', { email: EMAIL, code: db().accounts[EMAIL].code });
    const token = (await v.json()).sessionToken;
    const terms = await (await fetch(`${base}/api/terms?employees=50&payFrequency=biweekly&rooftop=false`, { headers: { Authorization: `Bearer ${token}` } })).json();
    assert.equal((await post('/api/accept-terms', {
      agreed: true, signedName: 'Pat Persist', legalName: 'Acme LLC', billingEmail: EMAIL,
      address: '1 Main St, Columbus OH 43215', quoteId: terms.quoteId, expectedEmployees: 50, payFrequency: 'biweekly',
    }, token)).status, 200);
    assert.equal((await post('/api/billing/return', { sessionId: 'cs_ok' }, token)).status, 200);
    const k = await post('/api/issue-key', {}, token);
    assert.equal(k.status, 200);
    key = (await k.json()).key;
    const ex = JSON.parse(readFileSync(join(REPO, 'site/sandbox-examples.json'), 'utf8')).examples[0].request;
    const call = await fetch(`${base}/v1/paycheck`, {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(ex),
    });
    assert.equal(call.status, 200);
  });

  test('every write is on disk before the response: nothing is lost to SIGKILL', async () => {
    await kill();
    const saved = db();
    assert.ok(saved.accounts[EMAIL], 'account');
    assert.ok(saved.accounts[EMAIL].termsAcceptedAt, 'terms acceptance on the account');
    assert.ok(saved.acceptances.length >= 1, 'signed terms');
    assert.equal(saved.paymentMethods[EMAIL].last4, '4242');
    assert.ok(saved.subscriptions[EMAIL], 'subscription');
    assert.equal(Object.keys(saved.keys).length, 1, 'api key');
    assert.ok(saved.usage.length >= 1, 'usage');
  });

  test('a restarted server still knows the account and the key', async () => {
    await start();
    const me = await fetch(`${base}/v1/me`, { headers: { Authorization: `Bearer ${key}` } });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).mode, 'live', 'site-issued keys are always live');
    // The returning customer can sign in again with an emailed code.
    assert.equal((await post('/api/signin', { email: EMAIL })).status, 200);
    const v = await post('/api/verify-email', { email: EMAIL, code: db().accounts[EMAIL].code });
    assert.equal(v.status, 200);
    const health = await (await fetch(`${base}/v1/health`)).json();
    assert.equal(health.store, 'ok');
  });

  test('the previous generation is kept as db.json.bak, and nothing stray is left in the directory', () => {
    const bak = JSON.parse(readFileSync(`${dbFile()}.bak`, 'utf8'));
    assert.ok(bak.accounts[EMAIL], 'backup holds the account');
    const stray = readdirSync(dir).filter((f) => f !== 'db.json' && f !== 'db.json.bak');
    assert.deepEqual(stray, []);
  });
});

describe('a damaged store is refused, never overwritten', () => {
  test('truncated db.json -> unhealthy, file untouched, backup still good', async () => {
    await kill();
    const good = readFileSync(dbFile(), 'utf8');
    const bakBefore = readFileSync(`${dbFile()}.bak`, 'utf8');
    writeFileSync(dbFile(), good.slice(0, Math.floor(good.length / 2)));
    const damaged = readFileSync(dbFile(), 'utf8');
    await start();
    const h = await fetch(`${base}/v1/health`);
    assert.equal(h.status, 503);
    assert.equal((await h.json()).store, 'unreadable');
    // Any account request fails instead of starting from an empty store.
    assert.notEqual((await post('/api/signup', { name: 'New', email: 'new@acmepayroll.test', company: 'X', phone: '555-000-0000', agreeToTerms: true })).status, 200);
    assert.equal(readFileSync(dbFile(), 'utf8'), damaged, 'the damaged file was not overwritten');
    assert.equal(readFileSync(`${dbFile()}.bak`, 'utf8'), bakBefore, 'the backup was not overwritten with the damaged file');
    // Restoring from the backup brings every account back.
    writeFileSync(dbFile(), bakBefore);
    assert.equal((await fetch(`${base}/v1/health`)).status, 200);
    assert.ok(db().accounts[EMAIL]);
    assert.ok(existsSync(`${dbFile()}.bak`));
  });
});

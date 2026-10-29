import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildBundles, decryptBundle, encryptBundle, fingerprint, fromMetadata, restoreBundle, toMetadata } from '../site/lib/mirror.ts';
import type { DB } from '../site/lib/store.ts';

/**
 * A host that throws the container's disk away on every restart loses every account, even though
 * sign-up and sign-in worked a minute earlier. The site keeps an encrypted copy of each verified
 * account in Stripe and restores it into an empty store when it starts. These run two real servers
 * against a stub Stripe: the first creates an account, is killed, and the second starts with an
 * empty folder and still knows the account, its password and its signed-in browser.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const EMAIL = 'stay@backup.test';
const PW = 'correct horse battery staple';

interface Customer { id: string; metadata: Record<string, string> }

/** Just enough of Stripe's customers API: create, update metadata (empty string removes a key), list. */
function stubStripe() {
  const customers: Customer[] = [];
  const calls: string[] = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://x');
      const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
      const send = (code: number, body: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
      calls.push(`${req.method} ${url.pathname}`);
      const metadataOf = () => {
        const md: Record<string, string> = {};
        for (const [k, v] of form) { const m = /^metadata\[(.+)\]$/.exec(k); if (m) md[m[1]!] = v; }
        return md;
      };
      if (req.method === 'POST' && url.pathname === '/v1/customers') {
        const c = { id: `cus_${customers.length + 1}`, metadata: metadataOf() };
        customers.push(c);
        return send(200, c);
      }
      const upd = /^\/v1\/customers\/([^/]+)$/.exec(url.pathname);
      if (req.method === 'POST' && upd) {
        const c = customers.find((x) => x.id === upd[1]);
        if (!c) return send(404, { error: { message: 'No such customer' } });
        for (const [k, v] of Object.entries(metadataOf())) { if (v === '') delete c.metadata[k]; else c.metadata[k] = v; }
        return send(200, c);
      }
      if (req.method === 'GET' && url.pathname === '/v1/customers') {
        const after = url.searchParams.get('starting_after');
        const limit = Number(url.searchParams.get('limit') ?? 10);
        const start = after ? customers.findIndex((c) => c.id === after) + 1 : 0;
        const data = customers.slice(start, start + limit);
        return send(200, { data, has_more: start + limit < customers.length });
      }
      send(404, { error: { message: `stub: ${req.method} ${url.pathname}` } });
    });
  });
  return { server, customers, calls };
}

let stripe: ReturnType<typeof stubStripe>;
let stripeBase = '';
const children: ChildProcess[] = [];
const dirs: string[] = [];

async function freePort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  const port = (s.address() as { port: number }).port;
  await new Promise((r) => s.close(r));
  return port;
}

async function startSite(extraEnv: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'site-backup-'));
  dirs.push(dir);
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn('node', ['site/server.ts'], {
    cwd: REPO,
    env: {
      ...process.env, PORT: String(port), SITE_DB_DIR: dir, RATE_LIMIT_PER_MIN: '1000', SIGNUP_PER_HOUR: '100', SIGNIN_PER_HOUR: '100',
      RESEND_API_KEY: '', TRUST_PROXY: '', COOKIE_SECURE: '1', PUBLIC_BASE_URL: '',
      STRIPE_SECRET_KEY: 'sk_test_backup_secret_for_tests', STRIPE_API_BASE: stripeBase, STORE_MIRROR: '1', STRIPE_PRICE_ID: '', STRIPE_METER_EVENT_NAME: '',
      ...extraEnv,
    },
    stdio: 'ignore',
  });
  children.push(child);
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  return { base, dir, child };
}

async function stop(child: ChildProcess) {
  const exited = new Promise((r) => child.once('exit', r));
  child.kill('SIGKILL');
  await exited;
}

const db = (dir: string) => JSON.parse(readFileSync(join(dir, 'db.json'), 'utf8'));
const post = (base: string, path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

async function waitFor(fn: () => boolean, ms = 12_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return; await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('timed out waiting for the backup');
}

before(async () => {
  stripe = stubStripe();
  await new Promise<void>((r) => stripe.server.listen(0, '127.0.0.1', r));
  stripeBase = `http://127.0.0.1:${(stripe.server.address() as { port: number }).port}`;
});
after(async () => {
  for (const c of children) { try { c.kill('SIGKILL'); } catch { /* gone */ } }
  stripe.server.close();
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe('an account survives its server being replaced with an empty one', () => {
  let cookie = '';

  test('sign up and verify on the first server: the account is backed up to Stripe, encrypted', async () => {
    const a = await startSite();
    const created = await post(a.base, '/api/signup', { name: 'Stay Backed', email: EMAIL, company: 'Backup LLC', phone: '555-0100', password: PW, agreeToTerms: true });
    assert.equal(created.status, 200);
    // Never verified: nothing is backed up yet.
    await new Promise((r) => setTimeout(r, 2800));
    assert.equal(stripe.customers.length, 0, 'an unverified signup is not backed up');

    const code = db(a.dir).accounts[EMAIL].code as string;
    const verified = await post(a.base, '/api/verify-email', { email: EMAIL, code, signupToken: created.headers.get('x-signup-token') });
    assert.equal(verified.status, 200);
    cookie = /omnia_session=[0-9a-f]+/.exec(verified.headers.get('set-cookie') ?? '')![0];

    await waitFor(() => stripe.customers.some((c) => c.metadata.omnia_store === '1' && Number(c.metadata.n) > 0 && c.metadata.b0));
    const customer = stripe.customers.find((c) => c.metadata.omnia_store === '1')!;
    const wire = JSON.stringify(customer.metadata);
    assert.ok(!wire.includes(EMAIL) && !wire.includes('Backup LLC') && !wire.includes(PW), 'the customer holds ciphertext, not the account');
    assert.ok(Object.keys(customer.metadata).length <= 50);
    assert.ok(Object.values(customer.metadata).every((v) => v.length <= 500));

    const health = await (await fetch(a.base + '/healthz')).json() as { accountBackup: { state: string } };
    assert.equal(health.accountBackup.state, 'ok');
    await stop(a.child);
  });

  test('a second server with an empty folder restores the account: the password works and the browser is still signed in', async () => {
    const b = await startSite();
    // The route waits for the restore, so the very first request already sees the account.
    const login = await post(b.base, '/api/signin-password', { email: EMAIL, password: PW }, await csrf(b.base));
    assert.equal(login.status, 200, 'password sign-in works on the replacement server');
    const me = await fetch(`${b.base}/api/account`, { headers: { Cookie: cookie } });
    assert.equal(me.status, 200, 'the cookie from before the replacement still signs the browser in');
    assert.equal(((await me.json()) as { email: string }).email, EMAIL);
    await stop(b.child);
  });

  test('a store that survived is never overwritten by the backup', async () => {
    const c = await startSite();
    await post(c.base, '/api/signin-password', { email: EMAIL, password: PW }, await csrf(c.base));
    // Change the local account's name, restart on the same folder: the local value stays.
    await stop(c.child);
    const path = join(c.dir, 'db.json');
    const d = JSON.parse(readFileSync(path, 'utf8')) as DB;
    d.accounts[EMAIL]!.name = 'Changed Locally';
    const { writeFileSync } = await import('node:fs');
    writeFileSync(path, JSON.stringify(d));
    const c2 = await restartOn(c.dir);
    const after2 = db(c.dir);
    assert.equal(after2.accounts[EMAIL].name, 'Changed Locally');
    await stop(c2.child);
  });

  test('a backup made under a different secret is skipped, and the server still starts', async () => {
    const e = await startSite({ STORE_MIRROR_SECRET: 'a-different-secret-entirely' });
    const health = await (await fetch(e.base + '/healthz')).json() as { accountBackup: { state: string } };
    assert.equal(health.accountBackup.state, 'ok');
    const login = await post(e.base, '/api/signin-password', { email: EMAIL, password: PW }, await csrf(e.base));
    assert.equal(login.status, 401, 'an account that cannot be decrypted is not restored');
    await stop(e.child);
  });
});

async function csrf(base: string): Promise<Record<string, string>> {
  const page = await fetch(base + '/signin');
  const rows = typeof page.headers.getSetCookie === 'function' ? page.headers.getSetCookie() : [page.headers.get('set-cookie') ?? ''];
  const row = rows.find((c) => c.startsWith('omnia_csrf=')) ?? '';
  const token = row.split(';')[0]?.slice('omnia_csrf='.length) ?? '';
  return { Cookie: `omnia_csrf=${token}`, Origin: base, 'X-CSRF-Token': token };
}

async function restartOn(dir: string) {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn('node', ['site/server.ts'], {
    cwd: REPO,
    env: { ...process.env, PORT: String(port), SITE_DB_DIR: dir, RESEND_API_KEY: '', COOKIE_SECURE: '1', PUBLIC_BASE_URL: '', STRIPE_SECRET_KEY: 'sk_test_backup_secret_for_tests', STRIPE_API_BASE: stripeBase, STORE_MIRROR: '1' },
    stdio: 'ignore',
  });
  children.push(child);
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  await fetch(`${base}/api/account`); // routes wait for the restore check
  return { base, child };
}

describe('the backup itself', () => {
  const sample = (): DB => ({
    accounts: {
      'a@x.test': { name: 'A', email: 'a@x.test', company: 'C', phone: '', code: '123456', codeExpiresAt: 'x', codeRequestedAt: null, emailVerifiedAt: '2026-01-01T00:00:00Z', sessionToken: null, sessionExpiresAt: null, passwordHash: 'scrypt$x', stage: 'verified', createdAt: '2026-01-01T00:00:00Z', termsAcceptedAt: '', termsVersion: 'v1' } as never,
      'u@x.test': { name: 'U', email: 'u@x.test', company: 'C', phone: '', code: '1', emailVerifiedAt: null } as never,
    },
    scenarios: { 'a@x.test': [{ id: 's1', name: 'N', createdAt: '2026', inputs: {} }] },
    acceptances: [{ email: 'a@x.test', termsVersion: 'v1', signedName: 'A', acceptedAt: '2026-01-02', ip: null, userAgent: null } as never],
    paymentMethods: {}, subscriptions: {},
    keys: { h1: { keyHash: 'h1', keyPrefix: 'sk_live_', ownerEmail: 'a@x.test', ownerName: 'A', company: 'C', plan: 'trial', createdAt: '2026', expiresAt: '2027', isActive: true, lastUsedAt: null, totalCalls: 1 } as never },
    usage: [], usageReceipts: [], estimates: [], termsQuotes: {}, meterQueue: [], rateLimits: {}, processedStripeEvents: [],
    sessions: { tok1: { email: 'a@x.test', expiresAt: '2027', issuedAt: '2026', method: 'password', renewedAt: '2026' } },
  });

  test('only verified accounts are bundled, with their sessions, keys and acceptances, and no sign-in code', () => {
    const b = buildBundles(sample());
    assert.deepEqual([...b.keys()], ['a@x.test']);
    const bundle = b.get('a@x.test')!;
    assert.equal(bundle.account.code, null);
    assert.deepEqual(Object.keys(bundle.sessions), ['tok1']);
    assert.equal(bundle.keys.length, 1);
    assert.equal(bundle.acceptances.length, 1);
    assert.equal(bundle.scenarios!.length, 1);
  });

  test('usage counters do not change the fingerprint; a real change does', () => {
    const d = sample();
    const before = fingerprint(buildBundles(d).get('a@x.test')!);
    d.keys.h1!.totalCalls = 999;
    d.keys.h1!.lastUsedAt = '2026-06-01';
    assert.equal(fingerprint(buildBundles(d).get('a@x.test')!), before);
    d.keys.h1!.isActive = false;
    assert.notEqual(fingerprint(buildBundles(d).get('a@x.test')!), before);
  });

  test('encryption round-trips, is bound to the address, and fails closed on tampering or the wrong key', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_unit';
    const bundle = buildBundles(sample()).get('a@x.test')!;
    const text = encryptBundle(bundle, 'hash-a');
    assert.equal(decryptBundle(text, 'hash-a').account.email, 'a@x.test');
    assert.throws(() => decryptBundle(text, 'hash-b'));
    const flipped = text.slice(0, 40) + (text[40] === 'A' ? 'B' : 'A') + text.slice(41);
    assert.throws(() => decryptBundle(flipped, 'hash-a'));
    process.env.STORE_MIRROR_SECRET = 'other';
    assert.throws(() => decryptBundle(text, 'hash-a'));
    delete process.env.STORE_MIRROR_SECRET;
  });

  test('metadata fits Stripe (50 keys of 500 characters) and survives the round trip', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_unit';
    const bundle = buildBundles(sample()).get('a@x.test')!;
    const md = toMetadata(bundle, 'hash-a', fingerprint(bundle))!;
    assert.ok(Object.keys(md).length <= 50);
    assert.ok(Object.values(md).every((v) => v.length <= 500));
    const live = Object.fromEntries(Object.entries(md).filter(([, v]) => v !== ''));
    assert.equal(fromMetadata(live).bundle.account.email, 'a@x.test');
  });

  test('restoring adds a missing account and leaves an existing one alone', () => {
    const bundle = buildBundles(sample()).get('a@x.test')!;
    const empty = sample(); empty.accounts = {}; empty.sessions = {}; empty.keys = {}; empty.acceptances = []; empty.scenarios = {};
    assert.equal(restoreBundle(empty, bundle), true);
    assert.equal(empty.accounts['a@x.test']!.name, 'A');
    assert.ok(empty.sessions.tok1 && empty.keys.h1 && empty.acceptances.length === 1);
    empty.accounts['a@x.test']!.name = 'Local';
    assert.equal(restoreBundle(empty, bundle), false);
    assert.equal(empty.accounts['a@x.test']!.name, 'Local');
  });
});

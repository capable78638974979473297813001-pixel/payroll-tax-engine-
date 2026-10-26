import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { createHmac, randomBytes, scrypt } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword, passwordNeedsRehash, verifyPassword } from '../site/lib/password.ts';
import { isAllowedCheckoutUrl, verifyWebhookSignature } from '../api/stripe.ts';

/**
 * Auth, authorization, webhook, CSRF, CORS, and input-hardening checks
 * for the site server. Stripe is never called: the webhook secret is local
 * and STRIPE_SECRET_KEY is empty.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 25000 + Math.floor(Math.random() * 20000);
const BASE = `http://127.0.0.1:${PORT}`;
const WEBHOOK = 'whsec_harden_test';
const PW = 'correct-horse-1';
const PW2 = 'correct-horse-2';

let dir = '';
let child: ChildProcess | undefined;

const db = () => JSON.parse(readFileSync(join(dir, 'db.json'), 'utf8'));
const saveDb = (value: unknown) => writeFileSync(join(dir, 'db.json'), JSON.stringify(value));

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function cookies(res: Response): string[] {
  return typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie') ?? ''];
}

function cookie(res: Response, name: string): string {
  const row = cookies(res).find((c) => c.startsWith(name + '='));
  return row ? row.split(';')[0]!.slice(name.length + 1) : '';
}

function sessionHeader(token: string): Record<string, string> {
  return { Cookie: `omnia_session=${token}` };
}

async function register(email: string): Promise<string> {
  const r = await post('/api/signup', { name: 'Harden User', email, company: 'Harden Co', agreeToTerms: true });
  assert.equal(r.status, 200, email);
  const body = await r.json() as Record<string, unknown>;
  assert.equal(body.alreadyVerified, undefined);
  assert.equal(Object.hasOwn(body, 'alreadyVerified'), false);
  const code = db().accounts[email].code as string;
  assert.match(code, /^\d{6}$/);
  const v = await post('/api/verify-email', { email, code });
  assert.equal(v.status, 200, email);
  const token = cookie(v, 'omnia_session');
  assert.ok(token, email);
  assert.match(cookies(v).find((c) => c.startsWith('omnia_session=')) ?? '', /HttpOnly/);
  assert.match(cookies(v).find((c) => c.startsWith('omnia_session=')) ?? '', /SameSite=Lax/);
  assert.match(cookies(v).find((c) => c.startsWith('omnia_session=')) ?? '', /Secure/);
  const again = await post('/api/verify-email', { email, code });
  assert.equal(again.status, 401);
  return token;
}

function oldHash(password: string): Promise<string> {
  const salt = randomBytes(16);
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, 32, { N: 16384, r: 8, p: 1, maxmem: 128 * 16384 * 8 * 2 }, (err, key) => {
      if (err) reject(err);
      else resolve(['scrypt', 16384, 8, 1, salt.toString('base64'), (key as Buffer).toString('base64')].join('$'));
    });
  });
}

function signed(body: string, t = Math.floor(Date.now() / 1000), secret = WEBHOOK) {
  const v1 = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'site-harden-'));
  child = spawn('node', ['site/server.ts'], {
    cwd: REPO,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_DB_DIR: dir,
      RATE_LIMIT_PER_MIN: '2',
      SIGNUP_PER_HOUR: '20',
      SIGNIN_PER_HOUR: '20',
      PUBLIC_BASE_URL: '',
      GOOGLE_SITE_VERIFICATION: '',
      TRUST_PROXY: '0',
      RENDER: '',
      NODE_ENV: 'development',
      COOKIE_SECURE: '1',
      STRIPE_SECRET_KEY: '',
      STRIPE_ALLOW_LIVE: '',
      STRIPE_API_BASE: '',
      RESEND_API_KEY: '',
      RESEND_FROM: '',
      VERIFIER_URL: '',
      VERIFIER_SECRET: '',
      STRIPE_WEBHOOK_SECRET: WEBHOOK,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout?.on('data', (d) => { output += d; });
  child.stderr?.on('data', (d) => { output += d; });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/healthz`)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`hardening site did not become healthy\n${output}`);
});

after(() => {
  child?.kill('SIGKILL');
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('password storage', () => {
  test('new hashes use the OWASP scrypt cost and old hashes still verify', async () => {
    const hash = await hashPassword(PW);
    assert.match(hash, /^scrypt\$131072\$8\$1\$/);
    assert.equal(passwordNeedsRehash(hash), false);
    assert.equal(await verifyPassword(PW, hash), true);
    assert.equal(await verifyPassword('not-the-password', hash), false);
    const previous = await oldHash(PW);
    assert.equal(passwordNeedsRehash(previous), true);
    assert.equal(await verifyPassword(PW, previous), true);
  });
});

describe('checkout and webhook primitives', () => {
  test('only Stripe hosted checkout URLs are handed to the browser', () => {
    const prev = process.env.STRIPE_API_BASE;
    try {
      delete process.env.STRIPE_API_BASE;
      assert.equal(isAllowedCheckoutUrl('https://checkout.stripe.com/c/pay/cs_test'), true);
      assert.equal(isAllowedCheckoutUrl('https://billing.stripe.com/p/session/test'), true);
      assert.equal(isAllowedCheckoutUrl('https://evil.example/checkout'), false);
      assert.equal(isAllowedCheckoutUrl('javascript:alert(1)'), false);
      assert.equal(isAllowedCheckoutUrl('https://checkout.stripe.com.evil.example/'), false);
      assert.equal(isAllowedCheckoutUrl('https://user:pass@checkout.stripe.com/c/pay/cs'), false);
      assert.equal(isAllowedCheckoutUrl('https://checkout.test/cs_ok'), false);
      process.env.STRIPE_API_BASE = 'http://127.0.0.1:9';
      assert.equal(isAllowedCheckoutUrl('https://checkout.test/cs_ok'), true);
      assert.equal(isAllowedCheckoutUrl('http://127.0.0.1:9/pay'), true);
    } finally {
      if (prev === undefined) delete process.env.STRIPE_API_BASE;
      else process.env.STRIPE_API_BASE = prev;
    }
  });

  test('every v1 signature is checked and a stale timestamp is refused', () => {
    const body = '{"id":"evt_unit"}';
    const t = Math.floor(Date.now() / 1000);
    const good = createHmac('sha256', WEBHOOK).update(`${t}.${body}`).digest('hex');
    const bad = 'ab'.repeat(32);
    assert.equal(verifyWebhookSignature(body, `t=${t},v1=${bad},v1=${good}`, WEBHOOK), true);
    assert.equal(verifyWebhookSignature(body, `t=${t},v1=${bad}`, WEBHOOK), false);
    assert.equal(verifyWebhookSignature(body, signed(body, t - 1000), WEBHOOK), false);
    assert.equal(verifyWebhookSignature(body, signed(body, t + 1000), WEBHOOK), false);
  });
});

describe('site server hardening', { concurrency: 1 }, () => {
  test('signup replies do not reveal an existing account, and sign-in replies match', async () => {
    const email = 'known@harden.test';
    await register(email);
    const again = await post('/api/signup', { name: 'Other', email, company: 'Other Co', agreeToTerms: true });
    const fresh = await post('/api/signup', { name: 'New', email: 'fresh@harden.test', company: 'New Co', agreeToTerms: true });
    assert.equal(again.status, 200);
    assert.equal(fresh.status, 200);
    const a = await again.json() as Record<string, unknown>;
    const b = await fresh.json() as Record<string, unknown>;
    assert.deepEqual(a, b);
    assert.equal(a.alreadyVerified, undefined);
    assert.equal(cookies(again).some((c) => c.startsWith('omnia_session=') && !c.includes('omnia_session=;')), false);

    const known = await post('/api/signin', { email });
    const unknown = await post('/api/signin', { email: 'nobody@harden.test' });
    assert.equal(known.status, 200);
    assert.equal(unknown.status, 200);
    assert.deepEqual(await known.json(), await unknown.json());
  });

  test('a password change revokes every device, and login rotates only the presented cookie', async () => {
    const email = 'devices@harden.test';
    const first = await register(email);
    const changed = await post('/api/password', { password: PW }, sessionHeader(first));
    assert.equal(changed.status, 200);
    const current = cookie(changed, 'omnia_session');
    assert.notEqual(current, first);
    assert.equal((await fetch(`${BASE}/api/account`, { headers: sessionHeader(first) })).status, 401);
    assert.equal((await fetch(`${BASE}/api/account`, { headers: sessionHeader(current) })).status, 200);

    const other = await post('/api/signin-password', { email, password: PW });
    assert.equal(other.status, 200);
    const second = cookie(other, 'omnia_session');
    assert.equal((await fetch(`${BASE}/api/account`, { headers: sessionHeader(current) })).status, 200);

    const rotated = await post('/api/signin-password', { email, password: PW }, sessionHeader(current));
    assert.equal(rotated.status, 200);
    const third = cookie(rotated, 'omnia_session');
    assert.equal((await fetch(`${BASE}/api/account`, { headers: sessionHeader(current) })).status, 401);
    assert.equal((await fetch(`${BASE}/api/account`, { headers: sessionHeader(second) })).status, 200);

    const reset = await post('/api/password', { password: PW2, currentPassword: PW }, sessionHeader(third));
    assert.equal(reset.status, 200);
    const latest = cookie(reset, 'omnia_session');
    assert.equal((await fetch(`${BASE}/api/account`, { headers: sessionHeader(second) })).status, 401);
    assert.equal((await fetch(`${BASE}/api/account`, { headers: sessionHeader(third) })).status, 401);
    assert.equal((await fetch(`${BASE}/api/account`, { headers: sessionHeader(latest) })).status, 200);

    const stored = db();
    stored.accounts[email].passwordHash = await oldHash(PW2);
    saveDb(stored);
    const upgraded = await post('/api/signin-password', { email, password: PW2 });
    assert.equal(upgraded.status, 200);
    assert.match(db().accounts[email].passwordHash as string, /^scrypt\$131072\$8\$1\$/);
  });

  test('one account cannot read or delete another account’s data', async () => {
    const a = await register('a@harden.test');
    const b = await register('b@harden.test');
    const saved = await post('/api/scenarios/save', {
      name: 'A only',
      inputs: { state: 'OH', payFrequency: 'biweekly', filingStatus: 'single', grossCents: 200000, pretaxCents: 0 },
    }, sessionHeader(a));
    assert.equal(saved.status, 200);
    const scenario = (await saved.json() as { scenario: { id: string } }).scenario;
    const listed = await (await fetch(`${BASE}/api/scenarios`, { headers: sessionHeader(b) })).json() as { scenarios: { id: string }[] };
    assert.equal(listed.scenarios.some((s) => s.id === scenario.id), false);
    const removed = await post('/api/scenarios/delete', { id: scenario.id, email: 'a@harden.test' }, sessionHeader(b));
    assert.equal(removed.status, 404);
    const still = await (await fetch(`${BASE}/api/scenarios`, { headers: sessionHeader(a) })).json() as { scenarios: { id: string }[] };
    assert.equal(still.scenarios.some((s) => s.id === scenario.id), true);

    const asB = await fetch(`${BASE}/api/account?email=${encodeURIComponent('a@harden.test')}`, { headers: sessionHeader(b) });
    assert.equal(asB.status, 200);
    assert.equal((await asB.json() as { email: string }).email, 'b@harden.test');

    const file = db();
    file.paymentMethods['a@harden.test'] = { email: 'a@harden.test', kind: 'card', processorRef: 'pm_a', last4: '4242', brand: 'visa', attachedAt: new Date().toISOString() };
    file.paymentMethods['b@harden.test'] = { email: 'b@harden.test', kind: 'card', processorRef: 'pm_b', last4: '1111', brand: 'visa', attachedAt: new Date().toISOString() };
    file.usage.push({ keyHash: 'hash_b_only', at: new Date().toISOString(), statusCode: 200, error: null, checkDate: '2099-01-01' });
    saveDb(file);

    const billing = await (await fetch(`${BASE}/api/billing?email=${encodeURIComponent('a@harden.test')}`, { headers: sessionHeader(b) })).json() as { paymentMethod: { last4: string } };
    assert.equal(billing.paymentMethod.last4, '1111');
    const usage = await (await fetch(`${BASE}/api/usage?email=${encodeURIComponent('a@harden.test')}`, { headers: sessionHeader(b) })).text();
    assert.equal(usage.includes('a@harden.test'), false);
    assert.equal(usage.includes('2099-01-01'), false);
  });

  test('keys are stored as hashes, a reissue revokes the old one, and rate limits are per key', async () => {
    const token = await register('keys@harden.test');
    const file = db();
    file.paymentMethods['keys@harden.test'] = { email: 'keys@harden.test', kind: 'card', processorRef: 'pm_k', last4: '4242', brand: 'visa', attachedAt: new Date().toISOString() };
    saveDb(file);
    const first = await post('/api/issue-key', {}, sessionHeader(token));
    assert.equal(first.status, 200);
    const key1 = (await first.json() as { key: string }).key;
    assert.match(key1, /^sk_live_/);
    const second = await post('/api/issue-key', { email: 'someone-else@harden.test' }, sessionHeader(token));
    assert.equal(second.status, 200);
    const key2 = (await second.json() as { key: string }).key;
    const stored = readFileSync(join(dir, 'db.json'), 'utf8');
    assert.equal(stored.includes(key1), false);
    assert.equal(stored.includes(key2), false);
    const rows = Object.values(db().keys) as Array<{ ownerEmail: string; isActive: boolean; keyHash: string }>;
    assert.equal(rows.filter((k) => k.ownerEmail === 'keys@harden.test' && k.isActive).length, 1);

    const dead = await post('/v1/paycheck', {}, { Authorization: `Bearer ${key1}` });
    assert.equal(dead.status, 401);
    assert.equal((await dead.json() as { code: string }).code, 'invalid_key');
    const live = await post('/v1/paycheck', {}, { Authorization: `Bearer ${key2}` });
    assert.notEqual(live.status, 401);
    const live2 = await post('/v1/paycheck', {}, { Authorization: `Bearer ${key2}` });
    assert.notEqual(live2.status, 429);
    const limited = await post('/v1/paycheck', {}, { Authorization: `Bearer ${key2}` });
    assert.equal(limited.status, 429);

    const other = await register('otherkey@harden.test');
    const file2 = db();
    file2.paymentMethods['otherkey@harden.test'] = { email: 'otherkey@harden.test', kind: 'card', processorRef: 'pm_o', last4: '9999', brand: 'visa', attachedAt: new Date().toISOString() };
    saveDb(file2);
    const issued = await post('/api/issue-key', {}, sessionHeader(other));
    assert.equal(issued.status, 200);
    const key3 = (await issued.json() as { key: string }).key;
    const separate = await post('/v1/paycheck', {}, { Authorization: `Bearer ${key3}` });
    assert.notEqual(separate.status, 429);
    assert.equal(readFileSync(join(dir, 'db.json'), 'utf8').includes(key3), false);
  });

  test('browser posts need a matching CSRF token and an allowed origin', async () => {
    const page = await fetch(`${BASE}/signin`);
    const token = cookie(page, 'omnia_csrf');
    assert.ok(token);
    assert.equal(/HttpOnly/i.test(cookies(page).find((c) => c.startsWith('omnia_csrf=')) ?? ''), false);
    const origin = `http://127.0.0.1:${PORT}`;
    const missing = await post('/api/signin', { email: 'x@harden.test' }, { Origin: origin });
    assert.equal(missing.status, 403);
    assert.equal((await missing.json() as { code: string }).code, 'bad_csrf');
    const wrong = await post('/api/signin', { email: 'x@harden.test' }, { Origin: origin, 'X-CSRF-Token': 'not-the-token' });
    assert.equal(wrong.status, 403);
    const evil = await post('/api/signin', { email: 'x@harden.test' }, { Origin: 'https://evil.example', 'X-CSRF-Token': token });
    assert.equal(evil.status, 403);
    assert.equal((await evil.json() as { code: string }).code, 'bad_origin');
    assert.equal(evil.headers.get('access-control-allow-origin'), null);
    const ok = await post('/api/signin', { email: 'not-an-email' }, { Origin: origin, 'X-CSRF-Token': token, Cookie: `omnia_csrf=${token}` });
    assert.equal(ok.status, 400);
    const noOrigin = await post('/api/signin', { email: 'plain@harden.test' });
    assert.equal(noOrigin.status, 200);

    const blocked = await fetch(`${BASE}/api/health`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.headers.get('access-control-allow-origin'), null);
    const allowed = await fetch(`${BASE}/api/health`, { method: 'OPTIONS', headers: { Origin: origin } });
    assert.equal(allowed.status, 204);
    assert.equal(allowed.headers.get('access-control-allow-origin'), origin);
  });

  test('oversized bodies, path traversal, and forged webhooks are refused', async () => {
    const huge = await post('/api/signup', 'x'.repeat(1_000_001));
    assert.equal(huge.status, 400);
    const hugeBody = await huge.text();
    assert.equal(hugeBody.includes('sk_'), false);
    assert.equal(hugeBody.includes('re_'), false);
    assert.match(hugeBody, /too large/i);

    const paths = ['/assets/../../package.json', '/assets/%2e%2e/%2e%2e/package.json', '/logo/%2e%2e%2fpackage.json', '/assets/..%5c..%5cpackage.json'];
    for (const path of paths) {
      const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
        const req = httpRequest({ hostname: '127.0.0.1', port: PORT, path, method: 'GET' }, (r) => {
          const chunks: Buffer[] = [];
          r.on('data', (c) => chunks.push(c));
          r.on('end', () => resolve({ status: r.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
        });
        req.on('error', reject);
        req.end();
      });
      assert.notEqual(res.status, 200, path);
      assert.equal(res.body.includes('"name": "payroll-tax-engine"'), false, path);
    }

    const payload = JSON.stringify({ id: 'evt_harden_1', type: 'customer.created', data: { object: {} } });
    const bad = await fetch(`${BASE}/api/billing/webhook`, { method: 'POST', headers: { 'Stripe-Signature': signed(payload, Math.floor(Date.now() / 1000), 'wrong') }, body: payload });
    assert.equal(bad.status, 400);
    const badText = await bad.text();
    assert.equal(badText.includes(WEBHOOK), false);
    assert.equal(badText.includes('sk_'), false);
    const stale = await fetch(`${BASE}/api/billing/webhook`, { method: 'POST', headers: { 'Stripe-Signature': signed(payload, Math.floor(Date.now() / 1000) - 1000) }, body: payload });
    assert.equal(stale.status, 400);
    const ok = await fetch(`${BASE}/api/billing/webhook`, { method: 'POST', headers: { 'Stripe-Signature': signed(payload) }, body: payload });
    assert.equal(ok.status, 200);
    const dup = await fetch(`${BASE}/api/billing/webhook`, { method: 'POST', headers: { 'Stripe-Signature': signed(payload) }, body: payload });
    assert.equal(dup.status, 200);
    assert.equal((await dup.json() as { duplicate?: boolean }).duplicate, true);

    const home = await fetch(`${BASE}/`);
    const csp = home.headers.get('content-security-policy') ?? '';
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /nonce-/);
    assert.equal(home.headers.get('x-frame-options'), 'DENY');
    assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(home.headers.get('referrer-policy'), 'no-referrer');
    assert.match(home.headers.get('permissions-policy') ?? '', /camera=\(\)/);
    assert.equal(home.headers.get('strict-transport-security'), null);
  });

  test('an emailed code expires and a burned code cannot be reused', async () => {
    const email = 'expire@harden.test';
    const r = await post('/api/signup', { name: 'Expire', email, company: 'Harden Co', agreeToTerms: true });
    assert.equal(r.status, 200);
    const file = db();
    file.accounts[email].codeExpiresAt = new Date(Date.now() - 1000).toISOString();
    const code = file.accounts[email].code as string;
    saveDb(file);
    const expired = await post('/api/verify-email', { email, code });
    assert.equal(expired.status, 401);
    const text = await expired.text();
    assert.equal(text.includes(code), false);
  });
});

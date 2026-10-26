import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { createHash, createHmac } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Regression tests for the 2026-10-27 server audit: unverified-account
 * takeover, sessions after a password change, replayed checkouts, double
 * subscriptions, stale webhooks, malformed bodies, and the .env storage path.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEBHOOK_SECRET = 'whsec_audit';
const freePort = () => new Promise<number>((resolve) => {
  const srv = createNetServer();
  srv.listen(0, '127.0.0.1', () => { const { port } = srv.address() as { port: number }; srv.close(() => resolve(port)); });
});
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

interface Running { base: string; dir: string; child: ChildProcess; stop: () => void; db: () => any }

let fakeStripe: Server;
let fakeBase = '';
let checkoutPosts = 0;
let checkoutBodies: string[] = [];
const sessions: Record<string, any> = {};

async function startServer(extraEnv: Record<string, string> = {}, seed?: (dir: string) => void, dir = mkdtempSync(join(tmpdir(), 'site-audit-'))): Promise<Running> {
  const port = await freePort();
  if (seed) seed(dir);
  const child = spawn('node', ['site/server.ts'], {
    cwd: REPO,
    env: {
      ...process.env,
      PORT: String(port),
      SITE_DB_DIR: dir,
      RATE_LIMIT_PER_MIN: '10000',
      SIGNUP_PER_HOUR: '1000',
      SIGNIN_PER_HOUR: '1000',
      TRUST_PROXY: '',
      PUBLIC_BASE_URL: '',
      RESEND_API_KEY: '',
      STRIPE_SECRET_KEY: 'sk_test_fake',
      STRIPE_API_BASE: fakeBase,
      STRIPE_PRICE_ID: 'price_audit',
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
      STRIPE_ALLOW_LIVE: '',
      ...extraEnv,
    },
    stdio: 'ignore',
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) break; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  return {
    base, dir, child,
    stop: () => { child.kill('SIGKILL'); },
    db: () => JSON.parse(readFileSync(join(dir, 'db.json'), 'utf8')),
  };
}

before(async () => {
  fakeStripe = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const url = req.url ?? '';
      const send = (status: number, body: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
      if (req.method === 'GET' && url.startsWith('/v1/prices/')) return send(200, { id: 'price_audit', recurring: { usage_type: 'metered' } });
      if (url === '/v1/checkout/sessions' && req.method === 'POST') {
        checkoutPosts += 1; checkoutBodies.push(raw);
        return send(200, { id: `cs_new_${checkoutPosts}`, url: `https://checkout.stripe.com/c/pay/cs_new_${checkoutPosts}` });
      }
      if (url === '/v1/customers' && req.method === 'POST') return send(200, { id: 'cus_made' });
      const m = /^\/v1\/checkout\/sessions\/([^?]+)/.exec(url);
      if (m && sessions[m[1]!]) return send(200, sessions[m[1]!]);
      send(404, { error: { message: 'no such route ' + url } });
    });
  });
  await new Promise<void>((r) => fakeStripe.listen(0, '127.0.0.1', r));
  fakeBase = `http://127.0.0.1:${(fakeStripe.address() as { port: number }).port}`;
});
after(() => { fakeStripe?.close(); });

const post = (base: string, path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const cookiesOf = (res: Response) => (typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie') ?? '']).map((c) => c.split(';')[0]!).join('; ');

// ---------------------------------------------------------------------
describe('1. an unverified signup cannot be taken over', () => {
  let srv: Running;
  before(async () => { srv = await startServer(); });
  after(() => srv.stop());

  const OWNER_PW = 'owner password is long enough';
  const ATTACKER_PW = 'attacker password is long enough';
  const form = (password: string) => ({ name: 'Owner', email: 'owner@takeover.test', company: 'Owner LLC', password, agreeToTerms: true });

  test('the attacker\'s password is not what the owner\'s verification activates', async () => {
    const owner = await post(srv.base, '/api/signup', form(OWNER_PW));
    assert.equal(owner.status, 200);
    const ownerCookies = cookiesOf(owner);
    const attacker = await post(srv.base, '/api/signup', form(ATTACKER_PW));
    assert.equal(attacker.status, 200);

    const code = srv.db().accounts['owner@takeover.test'].code as string;
    const verified = await post(srv.base, '/api/verify-email', { email: 'owner@takeover.test', code }, { Cookie: ownerCookies });
    assert.equal(verified.status, 200);

    const asAttacker = await post(srv.base, '/api/signin-password', { email: 'owner@takeover.test', password: ATTACKER_PW });
    assert.equal(asAttacker.status, 401, 'the attacker\'s password must not sign in');
    const asOwner = await post(srv.base, '/api/signin-password', { email: 'owner@takeover.test', password: OWNER_PW });
    assert.equal(asOwner.status, 200, 'the owner\'s own password is the one that activated');
  });

  test('the person who signed up from this browser keeps their own password when they verify', async () => {
    const email = 'honest@takeover.test';
    const first = await post(srv.base, '/api/signup', { ...form(OWNER_PW), email });
    const jar = cookiesOf(first);
    // They fix a typo in their name and submit again from the same browser.
    const again = await post(srv.base, '/api/signup', { ...form(OWNER_PW), email, name: 'Owner Fixed' }, { Cookie: jar });
    assert.equal(again.status, 200);
    const code = srv.db().accounts[email].code as string;
    const verified = await post(srv.base, '/api/verify-email', { email, code }, { Cookie: jar });
    assert.equal(verified.status, 200);
    assert.equal(srv.db().accounts[email].name, 'Owner Fixed');
    const login = await post(srv.base, '/api/signin-password', { email, password: OWNER_PW });
    assert.equal(login.status, 200);
  });

  test('an API client with no cookie jar can present the signupToken it was given', async () => {
    const email = 'api@takeover.test';
    const first = await post(srv.base, '/api/signup', { ...form(OWNER_PW), email });
    const signupToken = first.headers.get('x-signup-token');
    assert.ok(signupToken, 'signup returns the token that binds the password to this client');
    const code = srv.db().accounts[email].code as string;
    const verified = await post(srv.base, '/api/verify-email', { email, code, signupToken });
    assert.equal(verified.status, 200);
    assert.equal((await post(srv.base, '/api/signin-password', { email, password: OWNER_PW })).status, 200);
  });

  test('a second signup from elsewhere does not rewrite a live unverified profile', async () => {
    const email = 'profile@takeover.test';
    await post(srv.base, '/api/signup', { ...form(OWNER_PW), email });
    await post(srv.base, '/api/signup', { ...form(ATTACKER_PW), email, name: 'Mallory', company: 'Evil Inc' });
    const a = srv.db().accounts[email];
    assert.equal(a.name, 'Owner');
    assert.equal(a.company, 'Owner LLC');
  });

  test('a verified account\'s password still cannot be replaced by a signup', async () => {
    const email = 'honest@takeover.test';
    const r = await post(srv.base, '/api/signup', { ...form(ATTACKER_PW), email });
    assert.equal(r.status, 200);
    assert.equal((await post(srv.base, '/api/signin-password', { email, password: ATTACKER_PW })).status, 401);
    assert.equal((await post(srv.base, '/api/signin-password', { email, password: OWNER_PW })).status, 200);
  });
});

// ---------------------------------------------------------------------
describe('2. changing the password signs every other device out', () => {
  const email = 'pw@sessions.test';
  let srv: Running;
  before(async () => {
    srv = await startServer({}, (dir) => {
      const now = new Date().toISOString();
      const later = new Date(Date.now() + 86_400_000).toISOString();
      const mk = (t: string, method: string) => ({ email, expiresAt: later, issuedAt: now, method, renewedAt: now });
      writeFileSync(join(dir, 'db.json'), JSON.stringify({
        accounts: { [email]: { name: 'Pw', email, company: 'Pw LLC', phone: '', code: null, codeExpiresAt: null, codeRequestedAt: null, emailVerifiedAt: now, sessionToken: 'attacker_tok', sessionExpiresAt: later, sessionIssuedAt: now, sessionMethod: 'password', stage: 'verified', createdAt: now, passwordHash: null } },
        sessions: { owner_tok: mk('owner_tok', 'code'), attacker_tok: mk('attacker_tok', 'password') },
        scenarios: {}, acceptances: [], paymentMethods: {}, subscriptions: {}, keys: {}, usage: [], estimates: [], termsQuotes: {}, meterQueue: [], rateLimits: {}, processedStripeEvents: [],
      }));
    });
  });
  after(() => srv.stop());

  test('after the owner sets a new password the other session is refused, and the owner has a fresh one', async () => {
    assert.equal((await fetch(`${srv.base}/api/account`, { headers: bearer('attacker_tok') })).status, 200);
    const changed = await post(srv.base, '/api/password', { password: 'brand new password here' }, bearer('owner_tok'));
    assert.equal(changed.status, 200);
    const fresh = (await changed.json() as { sessionToken: string }).sessionToken;
    assert.equal((await fetch(`${srv.base}/api/account`, { headers: bearer('attacker_tok') })).status, 401);
    assert.equal((await fetch(`${srv.base}/api/account`, { headers: bearer('owner_tok') })).status, 401);
    assert.equal((await fetch(`${srv.base}/api/account`, { headers: bearer(fresh) })).status, 200);
  });
});

// ---------------------------------------------------------------------
function billingSeed(dir: string, over: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  const later = new Date(Date.now() + 86_400_000).toISOString();
  const email = 'bill@audit.test';
  writeFileSync(join(dir, 'db.json'), JSON.stringify({
    accounts: { [email]: { name: 'Bill', email, company: 'Bill LLC', phone: '', code: null, codeExpiresAt: null, codeRequestedAt: null, emailVerifiedAt: now, sessionToken: null, sessionExpiresAt: null, stage: 'trialing', createdAt: now } },
    sessions: { bill_tok: { email, expiresAt: later, issuedAt: now, method: 'code', renewedAt: now } },
    scenarios: {}, acceptances: [],
    paymentMethods: { [email]: { email, kind: 'card', processorRef: 'pm_1', last4: '4242', brand: 'visa', attachedAt: now } },
    subscriptions: {
      [email]: {
        email, legalName: 'Bill LLC', billingContact: 'Bill', billingEmail: email, address: '1 Main St', expectedEmployees: 2, payFrequency: 'biweekly', rooftop: false, estimatedAnnual: 0,
        status: 'trialing', trialStartsAt: now, trialEndsAt: later, termMonths: 12, termEndsAt: later, createdAt: now, activatedAt: now,
        stripeCustomerId: 'cus_bill', stripeSubscriptionId: 'sub_new', suspended: false, suspendedReason: null, ...over,
      },
    },
    keys: {}, usage: [], estimates: [], termsQuotes: {}, meterQueue: [], rateLimits: {}, processedStripeEvents: [],
  }));
}
const signedPost = (base: string, body: string) => {
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', WEBHOOK_SECRET).update(`${t}.${body}`).digest('hex');
  return fetch(`${base}/api/billing/webhook`, { method: 'POST', headers: { 'Stripe-Signature': `t=${t},v1=${v1}` }, body });
};

describe('3. a replayed checkout cannot lift a billing suspension', () => {
  let srv: Running;
  before(async () => { srv = await startServer({}, (d) => billingSeed(d, { status: 'active', suspended: true, suspendedReason: 'payment_failed' })); });
  after(() => srv.stop());

  test('Stripe still says past_due, so the account stays suspended and active', async () => {
    sessions['cs_replay'] = {
      id: 'cs_replay', status: 'complete', customer: 'cus_bill', metadata: { omnia_email: 'bill@audit.test' },
      subscription: { id: 'sub_new', status: 'past_due', default_payment_method: { id: 'pm_1', type: 'card', card: { brand: 'visa', last4: '4242' } } },
    };
    const r = await post(srv.base, '/api/billing/return', { sessionId: 'cs_replay' }, bearer('bill_tok'));
    assert.notEqual(r.status, 500);
    const sub = srv.db().subscriptions['bill@audit.test'];
    assert.equal(sub.suspended, true);
    assert.equal(sub.suspendedReason, 'payment_failed');
    assert.equal(sub.status, 'active', 'an active subscriber is not turned back into a trialing one');
  });

  test('a healthy replay does not move an active subscriber back to trialing either', async () => {
    sessions['cs_ok'] = {
      id: 'cs_ok', status: 'complete', customer: 'cus_bill', metadata: { omnia_email: 'bill@audit.test' },
      subscription: { id: 'sub_new', status: 'active', default_payment_method: { id: 'pm_1', type: 'card', card: { brand: 'visa', last4: '4242' } } },
    };
    await post(srv.base, '/api/billing/return', { sessionId: 'cs_ok' }, bearer('bill_tok'));
    assert.equal(srv.db().subscriptions['bill@audit.test'].status, 'active');
  });

  test('a checkout for a different subscription than the current one does not overwrite it', async () => {
    sessions['cs_other'] = {
      id: 'cs_other', status: 'complete', customer: 'cus_bill', metadata: { omnia_email: 'bill@audit.test' },
      subscription: { id: 'sub_stray', status: 'active', default_payment_method: { id: 'pm_2', type: 'card', card: { brand: 'visa', last4: '9999' } } },
    };
    const r = await post(srv.base, '/api/billing/return', { sessionId: 'cs_other' }, bearer('bill_tok'));
    assert.equal(r.status, 409);
    assert.equal(srv.db().subscriptions['bill@audit.test'].stripeSubscriptionId, 'sub_new');
  });
});

describe('4. an existing subscriber cannot open more checkouts or trials', () => {
  let srv: Running;
  before(async () => { srv = await startServer({}, (d) => billingSeed(d)); });
  after(() => srv.stop());

  test('two payment-setup requests create no checkout sessions', async () => {
    const before = checkoutPosts;
    const a = await post(srv.base, '/api/payment-setup', {}, bearer('bill_tok'));
    const b = await post(srv.base, '/api/payment-setup', {}, bearer('bill_tok'));
    assert.equal(a.status, 409);
    assert.equal(b.status, 409);
    assert.equal((await a.json() as { code: string }).code, 'already_subscribed');
    assert.equal(checkoutPosts, before);
  });
});

describe('4b. a cancelled customer can resubscribe, without a second free trial', () => {
  let srv: Running;
  before(async () => { srv = await startServer({}, (d) => billingSeed(d, { status: 'cancelled', suspended: true, suspendedReason: 'subscription_cancelled' })); });
  after(() => srv.stop());

  test('the new checkout carries no trial days', async () => {
    checkoutBodies = [];
    const r = await post(srv.base, '/api/payment-setup', {}, bearer('bill_tok'));
    assert.equal(r.status, 200);
    const params = new URLSearchParams(checkoutBodies.at(-1));
    assert.equal(params.get('subscription_data[trial_period_days]'), null);
  });
});

describe('5. a late event for an old subscription does not touch the current one', () => {
  let srv: Running;
  before(async () => { srv = await startServer({}, (d) => billingSeed(d)); });
  after(() => srv.stop());

  test('customer.subscription.deleted for sub_old leaves sub_new running', async () => {
    const body = JSON.stringify({ id: 'evt_old_cancel', type: 'customer.subscription.deleted', data: { object: { id: 'sub_old', customer: 'cus_bill', status: 'canceled' } } });
    const r = await signedPost(srv.base, body);
    assert.equal(r.status, 200);
    const sub = srv.db().subscriptions['bill@audit.test'];
    assert.equal(sub.status, 'trialing');
    assert.equal(sub.stripeSubscriptionId, 'sub_new');
    assert.equal(sub.suspended, false);
  });

  test('a failed invoice for the old subscription, in either API shape, does not suspend the new one', async () => {
    const legacy = JSON.stringify({ id: 'evt_old_inv', type: 'invoice.payment_failed', data: { object: { customer: 'cus_bill', subscription: 'sub_old' } } });
    const modern = JSON.stringify({ id: 'evt_old_inv2', type: 'invoice.payment_failed', data: { object: { customer: 'cus_bill', parent: { subscription_details: { subscription: 'sub_old' } } } } });
    for (const body of [legacy, modern]) assert.equal((await signedPost(srv.base, body)).status, 200);
    assert.equal(srv.db().subscriptions['bill@audit.test'].suspended, false);
  });

  test('the same event for the current subscription does suspend it', async () => {
    const body = JSON.stringify({ id: 'evt_new_inv', type: 'invoice.payment_failed', data: { object: { customer: 'cus_bill', parent: { subscription_details: { subscription: 'sub_new' } } } } });
    await signedPost(srv.base, body);
    assert.equal(srv.db().subscriptions['bill@audit.test'].suspended, true);
  });
});

// ---------------------------------------------------------------------
describe('6. malformed requests get a 4xx, not a 500', () => {
  let srv: Running;
  before(async () => { srv = await startServer(); });
  after(() => srv.stop());

  const endpoints = ['/api/signup', '/api/signin', '/api/verify-email', '/api/signin-password', '/api/password', '/api/contact', '/api/billing/return', '/api/terms/accept', '/api/payment-setup'];
  for (const path of endpoints) {
    for (const [label, body] of [['null', 'null'], ['a number', '42'], ['an array', '[1]'], ['a string', '"hi"'], ['numeric email', '{"email":123,"password":456,"code":789,"name":1,"company":2}'], ['object email', '{"email":{},"password":{},"code":{}}']] as const) {
      test(`${path} with ${label}`, async () => {
        const r = await post(srv.base, path, body, bearer('nobody'));
        assert.ok(r.status >= 400 && r.status < 500, `${path} ${label} -> ${r.status}`);
      });
    }
  }

  test('requesting the /assets/ directory is a 404, not a 500', async () => {
    for (const p of ['/assets/', '/assets', '/logo/', '/assets/../server.ts']) {
      const r = await fetch(srv.base + p);
      assert.ok(r.status === 404 || r.status === 301 || r.status === 400, `${p} -> ${r.status}`);
    }
  });
});

// ---------------------------------------------------------------------
describe('7. the .env storage location is honoured', () => {
  test('SITE_DB_DIR from the env file decides where the account is written', async () => {
    const target = mkdtempSync(join(tmpdir(), 'site-envdir-'));
    const envFile = join(mkdtempSync(join(tmpdir(), 'site-envfile-')), '.env');
    writeFileSync(envFile, `SITE_DB_DIR=${target}\n`);
    const fallback = mkdtempSync(join(tmpdir(), 'site-fallback-'));
    const port = await freePort();
    const env = { ...process.env, PORT: String(port), OMNIA_ENV_FILE: envFile, RESEND_API_KEY: '', TRUST_PROXY: '', PUBLIC_BASE_URL: '', STRIPE_SECRET_KEY: '' } as Record<string, string | undefined>;
    delete env.SITE_DB_DIR;
    const child = spawn('node', ['site/server.ts'], { cwd: REPO, env: env as NodeJS.ProcessEnv, stdio: 'ignore' });
    try {
      const base = `http://127.0.0.1:${port}`;
      for (let i = 0; i < 100; i++) { try { if ((await fetch(`${base}/healthz`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 150)); }
      const r = await post(base, '/api/signup', { name: 'E', email: 'env@dir.test', company: 'Env', agreeToTerms: true });
      assert.equal(r.status, 200);
      assert.ok(existsSync(join(target, 'db.json')), 'db.json is in the directory the env file names');
      assert.ok(JSON.parse(readFileSync(join(target, 'db.json'), 'utf8')).accounts['env@dir.test']);
    } finally {
      child.kill('SIGKILL');
      rmSync(target, { recursive: true, force: true });
      rmSync(fallback, { recursive: true, force: true });
    }
  });
});

describe('8. address lookups are described as free everywhere a page mentions billing them', () => {
  for (const f of ['site/product.html', 'site/docs.html', 'site/pricing.html', 'site/legal/terms.html']) {
    test(`${f} does not say a matched lookup is charged`, () => {
      const text = readFileSync(join(REPO, f), 'utf8');
      assert.doesNotMatch(text, /lookup that matches[^.]*(counted|counts)/i);
      assert.doesNotMatch(text, /address lookup that matches counts/i);
    });
  }
});

describe('9. the coverage headline does not promise every local jurisdiction', () => {
  for (const f of ['site/coverage.html', 'site/index.html']) {
    test(f, () => {
      const text = readFileSync(join(REPO, f), 'utf8');
      assert.doesNotMatch(text, /every local jurisdiction/i);
      assert.doesNotMatch(text, /whole USA, covered/i);
    });
  }
});

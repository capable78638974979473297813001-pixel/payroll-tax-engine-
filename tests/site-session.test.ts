import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A signed-in browser stays signed in until Sign out: the cookie is
 * persistent, the session is a row in the site store (so killing the
 * process does not drop it), signup verification and password login both
 * issue that cookie, and signing out deletes only that one session.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const EMAIL = 'stay@sessions.test';
const PW = 'correct horse battery staple';
const YEAR_SEC = 365 * 24 * 60 * 60;

let dir: string;
let child: ChildProcess | null = null;
let base = '';
let signupCookie = '';
let loginCookie = '';

const dbFile = () => join(dir, 'db.json');
const db = () => JSON.parse(readFileSync(dbFile(), 'utf8'));

/** A same-origin browser post carries the double-submit cookie and header. */
async function browserHeaders(cookie: string): Promise<Record<string, string>> {
  const page = await fetch(base + '/signin');
  const rows = typeof page.headers.getSetCookie === 'function' ? page.headers.getSetCookie() : [page.headers.get('set-cookie') ?? ''];
  const row = rows.find((c) => c.startsWith('omnia_csrf=')) ?? '';
  const token = row.split(';')[0]?.slice('omnia_csrf='.length) ?? '';
  return { Cookie: `${cookie}; omnia_csrf=${token}`, Origin: base, 'X-CSRF-Token': token };
}

async function freePort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  const port = (s.address() as { port: number }).port;
  await new Promise((r) => s.close(r));
  return port;
}

async function start() {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  child = spawn('node', ['site/server.ts'], {
    cwd: REPO,
    env: {
      ...process.env,
      PORT: String(port),
      SITE_DB_DIR: dir,
      RATE_LIMIT_PER_MIN: '1000',
      SIGNUP_PER_HOUR: '100',
      SIGNIN_PER_HOUR: '100',
      RESEND_API_KEY: '',
      TRUST_PROXY: '',
      COOKIE_SECURE: '1',
      PUBLIC_BASE_URL: '',
      STRIPE_SECRET_KEY: '',
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('server did not start');
}

async function kill() {
  const c = child;
  if (!c) return;
  child = null;
  const exited = new Promise((r) => c.once('exit', r));
  c.kill('SIGKILL');
  await exited;
}

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function cookiePair(res: Response): string {
  const raw = res.headers.get('set-cookie') ?? '';
  const m = /omnia_session=([0-9a-f]+)/.exec(raw);
  assert.ok(m, 'session cookie missing');
  return `omnia_session=${m[1]}`;
}

function tokenOf(cookie: string): string {
  return cookie.slice('omnia_session='.length);
}

function assertPersistentCookie(raw: string) {
  assert.match(raw, /omnia_session=[0-9a-f]+/);
  assert.match(raw, /HttpOnly/);
  assert.match(raw, /Secure/);
  assert.match(raw, /SameSite=Lax/);
  assert.match(raw, new RegExp(`(?:^|;\\s*)Max-Age=${YEAR_SEC}(?:;|$)`));
}

async function accountStatus(cookie: string): Promise<number> {
  const r = await fetch(`${base}/api/account`, { headers: { Cookie: cookie } });
  return r.status;
}

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'site-session-'));
  await start();
});

after(async () => {
  await kill();
  rmSync(dir, { recursive: true, force: true });
});

describe('sessions stay until Sign out', () => {
  test('signup verification signs the browser in; the next request is authenticated', async () => {
    const created = await post('/api/signup', {
      name: 'Stay Signed', email: EMAIL, company: 'Sessions LLC', phone: '555-0100', password: PW, agreeToTerms: true,
    });
    assert.equal(created.status, 200);
    // The account exists, but the address is not proved yet, so this response
    // must not authenticate the next request.
    assert.doesNotMatch(created.headers.get('set-cookie') ?? '', /omnia_session=[0-9a-f]/);
    assert.equal(await accountStatus('omnia_session=nope'), 401);

    const code = db().accounts[EMAIL].code as string;
    const verified = await post('/api/verify-email', { email: EMAIL, code });
    assert.equal(verified.status, 200);
    const raw = verified.headers.get('set-cookie') ?? '';
    assertPersistentCookie(raw);
    signupCookie = cookiePair(verified);

    const next = await fetch(`${base}/api/account`, { headers: { Cookie: signupCookie } });
    assert.equal(next.status, 200);
    assert.equal((await next.json()).email, EMAIL);
    assert.equal(Object.keys(db().sessions).length, 1);
  });

  test('the signup session is still valid after the server process is killed', async () => {
    await kill();
    const onDisk = db();
    assert.equal(onDisk.sessions[tokenOf(signupCookie)]?.email, EMAIL);
    await start();
    const next = await fetch(`${base}/api/account`, { headers: { Cookie: signupCookie } });
    assert.equal(next.status, 200);
    assert.equal((await next.json()).email, EMAIL);
  });

  test('a request after a quiet day renews the cookie and the stored expiry', async () => {
    const state = db();
    const row = state.sessions[tokenOf(signupCookie)];
    assert.ok(row, 'stored session missing');
    const quiet = new Date(Date.now() - 3 * 24 * 60 * 60_000).toISOString();
    row.renewedAt = quiet;
    row.expiresAt = new Date(Date.now() + 10 * 24 * 60 * 60_000).toISOString();
    writeFileSync(dbFile(), JSON.stringify(state));

    const next = await fetch(`${base}/api/account`, { headers: { Cookie: signupCookie } });
    assert.equal(next.status, 200);
    assertPersistentCookie(next.headers.get('set-cookie') ?? '');
    const renewed = db().sessions[tokenOf(signupCookie)];
    const left = new Date(renewed.expiresAt).getTime() - Date.now();
    assert.ok(left > 300 * 24 * 60 * 60_000, 'expiry was not extended');
    assert.ok(new Date(renewed.renewedAt).getTime() > Date.now() - 60_000);
  });

  test('password login issues the same cookie and leaves the signup session alive', async () => {
    const login = await post('/api/signin-password', { email: EMAIL, password: PW });
    assert.equal(login.status, 200);
    const raw = login.headers.get('set-cookie') ?? '';
    assertPersistentCookie(raw);
    loginCookie = cookiePair(login);
    assert.notEqual(loginCookie, signupCookie);

    const next = await fetch(`${base}/api/account`, { headers: { Cookie: loginCookie } });
    assert.equal(next.status, 200);
    assert.equal((await next.json()).email, EMAIL);
    assert.equal(await accountStatus(signupCookie), 200);
    assert.equal(Object.keys(db().sessions).length, 2);
  });

  test('both devices are still signed in after another restart', async () => {
    await kill();
    await start();
    assert.equal(await accountStatus(signupCookie), 200);
    assert.equal(await accountStatus(loginCookie), 200);
  });

  test('sign-out deletes that server session and clears the cookie, and the other device stays signed in', async () => {
    const out = await post('/api/signout', {}, await browserHeaders(signupCookie));
    assert.equal(out.status, 200);
    const cleared = out.headers.get('set-cookie') ?? '';
    assert.match(cleared, /omnia_session=;/);
    assert.match(cleared, /HttpOnly/);
    assert.match(cleared, /Secure/);
    assert.match(cleared, /SameSite=Lax/);
    assert.match(cleared, /Max-Age=0/);
    assert.equal(await accountStatus(signupCookie), 401);
    assert.equal((await fetch(`${base}/api/account`, { headers: { Authorization: `Bearer ${tokenOf(signupCookie)}` } })).status, 401);
    assert.equal(await accountStatus(loginCookie), 200);
    assert.equal(db().sessions[tokenOf(signupCookie)], undefined);
    assert.equal(db().sessions[tokenOf(loginCookie)]?.email, EMAIL);
  });

  test('a cross-origin sign-out is refused and does not end the session', async () => {
    const evil = await post('/api/signout', {}, { Cookie: loginCookie, Origin: 'https://evil.example' });
    assert.equal(evil.status, 403);
    assert.equal((await evil.json()).code, 'bad_origin');
    assert.equal(await accountStatus(loginCookie), 200);
  });

  test('signing out the remaining device ends it', async () => {
    const out = await post('/api/signout', {}, await browserHeaders(loginCookie));
    assert.equal(out.status, 200);
    assert.equal(await accountStatus(loginCookie), 401);
    assert.equal((await fetch(`${base}/api/account`, { headers: { Authorization: `Bearer ${tokenOf(loginCookie)}` } })).status, 401);
    assert.equal(db().sessions[tokenOf(loginCookie)], undefined);
  });
});

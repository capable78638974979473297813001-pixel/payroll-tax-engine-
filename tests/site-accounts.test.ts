import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Real accounts, end to end: the site delegates codes to the Python verifier,
 * which sends real HTTP mail through a stand-in Resend. Covers signup with a
 * password, the code in the email, signing back in with the password, wrong
 * passwords and lockout, forgot-password by emailed code, changing a password,
 * and that nothing secret is written to the site's store.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_PORT = 6100 + Math.floor(Math.random() * 300);
const VER_PORT = 6500 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${SITE_PORT}`;
const EMAIL = 'grace@accounts.test';
const PW = 'correct horse battery staple';
const PW2 = 'a brand new passphrase 42';
const havePython = spawnSync('python3', ['--version']).status === 0;

let dir: string;
let site: ChildProcess;
let verifier: ChildProcess;
let resend: Server;
const mail: { to: string[]; subject: string; html: string; text: string; from: string; auth: string; ua: string }[] = [];

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const cookieOf = (r: Response) => (r.headers.get('set-cookie') ?? '').split(';')[0]!;
const lastCode = () => /\b(\d{6})\b/.exec(mail.at(-1)!.text)![1]!;

async function waitFor(url: string) {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`${url} did not start`);
}
async function mailArrives(n: number) {
  for (let i = 0; i < 50 && mail.length < n; i++) await new Promise((r) => setTimeout(r, 50));
  assert.ok(mail.length >= n, `expected ${n} emails, saw ${mail.length}`);
}

describe('accounts you can log back into', { skip: !havePython }, () => {
  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'site-accounts-'));
    resend = createServer((req, res) => {
      let body = '';
      req.on('data', (d) => { body += d; });
      req.on('end', () => {
        const j = JSON.parse(body);
        mail.push({ ...j, auth: String(req.headers.authorization), ua: String(req.headers['user-agent']) });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'em_1' }));
      });
    });
    await new Promise<void>((r) => resend.listen(0, '127.0.0.1', r));
    const resendPort = (resend.address() as { port: number }).port;

    const env = { PATH: process.env.PATH ?? '', VERIFIER_SECRET: 's'.repeat(40), VERIFIER_PEPPER: 'p'.repeat(40) };
    verifier = spawn('python3', ['verifier/email_verifier.py', 'serve'], {
      cwd: REPO,
      env: { ...env, VERIFIER_COOLDOWN_SECONDS: '0', VERIFIER_PORT: String(VER_PORT), VERIFIER_DB: join(dir, 'v.sqlite3'),
        RESEND_API_KEY: 're_test_key', RESEND_API_BASE: `http://127.0.0.1:${resendPort}`, RESEND_FROM: 'Omnia.tax <verify@omniatax.io>' },
    });
    await waitFor(`http://127.0.0.1:${VER_PORT}/healthz`);
    site = spawn('node', ['site/server.ts'], {
      cwd: REPO,
      env: { ...env, PORT: String(SITE_PORT), SITE_DB_DIR: dir, VERIFIER_URL: `http://127.0.0.1:${VER_PORT}` },
      stdio: 'ignore',
    });
    await waitFor(`${BASE}/healthz`);
  });
  after(() => {
    site?.kill();
    verifier?.kill();
    resend?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test('signup sends a real email through the Python service, and the code in it verifies', async () => {
    const weak = await post('/api/signup', { name: 'Grace Hopper', email: EMAIL, company: 'Navy LLC', phone: '5555550101', password: 'short' });
    assert.equal(weak.status, 400);
    assert.equal((await weak.json()).field, 'password');
    assert.equal(mail.length, 0, 'a rejected signup sends nothing');

    const r = await post('/api/signup', { name: 'Grace Hopper', email: EMAIL, company: 'Navy LLC', phone: '5555550101', password: PW });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).emailSent, true);
    await mailArrives(1);
    const m = mail[0]!;
    assert.deepEqual(m.to, [EMAIL]);
    assert.equal(m.auth, 'Bearer re_test_key');
    assert.equal(m.ua, 'omniatax-verifier/1.0', 'Resend rejects the default Python-urllib User-Agent');
    assert.equal(m.from, 'Omnia.tax <verify@omniatax.io>');
    assert.match(m.subject, /^\d{6} is your Omnia verification code$/);
    assert.ok(m.html.includes(lastCode()) && m.text.includes(lastCode()));

    const bad = await post('/api/verify-email', { email: EMAIL, code: lastCode() === '000000' ? '111111' : '000000' });
    assert.equal(bad.status, 401);
    const ok = await post('/api/verify-email', { email: EMAIL, code: lastCode() });
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.hasPassword, true);
    assert.match(ok.headers.get('set-cookie') ?? '', /omnia_session=.*HttpOnly/);
  });

  test('nothing secret is written to the site store', () => {
    const stored = readFileSync(join(dir, 'db.json'), 'utf8');
    assert.ok(!stored.includes(PW), 'plaintext password in the store');
    assert.ok(!stored.includes(lastCode()), 'the emailed code in the store');
    assert.match(stored, /scrypt\$16384\$8\$1\$/);
  });

  test('log back in with the password; wrong and unknown look the same', async () => {
    const good = await post('/api/signin-password', { email: EMAIL.toUpperCase(), password: PW });
    assert.equal(good.status, 200);
    const cookie = cookieOf(good);
    assert.match(cookie, /^omnia_session=/);
    const acct = await (await fetch(`${BASE}/api/account`, { headers: { Cookie: cookie } })).json();
    assert.equal(acct.email, EMAIL);
    assert.equal(acct.hasPassword, true);

    const wrong = await post('/api/signin-password', { email: EMAIL, password: PW + 'x' });
    const unknown = await post('/api/signin-password', { email: 'nobody@accounts.test', password: PW });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.deepEqual(await wrong.json(), await unknown.json());
  });

  test('signing up again can not replace a verified account\'s password', async () => {
    const r = await post('/api/signup', { name: 'Mallory', email: EMAIL, company: 'Evil', phone: '1', password: 'mallory takes over now' });
    assert.equal(r.status, 200);
    assert.equal((await post('/api/signin-password', { email: EMAIL, password: 'mallory takes over now' })).status, 401);
    assert.equal((await post('/api/signin-password', { email: EMAIL, password: PW })).status, 200);
  });

  test('changing a password needs the current one; then only the new one works', async () => {
    const cookie = cookieOf(await post('/api/signin-password', { email: EMAIL, password: PW }));
    const h = { Cookie: cookie };
    assert.equal((await post('/api/password', { password: PW2 }, h)).status, 403);
    assert.equal((await post('/api/password', { password: PW2, currentPassword: 'not it at all!!' }, h)).status, 403);
    assert.equal((await post('/api/password', { password: 'tiny' , currentPassword: PW }, h)).status, 400);
    assert.equal((await post('/api/password', { password: PW2, currentPassword: PW }, h)).status, 200);
    assert.equal((await post('/api/signin-password', { email: EMAIL, password: PW })).status, 401);
    assert.equal((await post('/api/signin-password', { email: EMAIL, password: PW2 })).status, 200);
  });

  test('forgot password: an emailed code is enough to set a new one', async () => {
    const before = mail.length;
    const r = await post('/api/signin', { email: EMAIL });
    assert.equal(r.status, 200);
    await mailArrives(before + 1);
    const v = await post('/api/verify-email', { email: EMAIL, code: lastCode() });
    assert.equal(v.status, 200);
    const h = { Cookie: cookieOf(v) };
    const pw3 = 'third passphrase after reset';
    assert.equal((await post('/api/password', { password: pw3 }, h)).status, 200);
    assert.equal((await post('/api/signin-password', { email: EMAIL, password: pw3 })).status, 200);
  });

  test('repeated wrong passwords lock password sign-in; the emailed code still works', async () => {
    // Earlier tests already spent a few failures against this address.
    let locked = false;
    for (let i = 0; i < 12 && !locked; i++) {
      const r = await post('/api/signin-password', { email: EMAIL, password: `wrong guess number ${i}` });
      if (r.status === 429) { locked = true; assert.ok(r.headers.get('retry-after')); } else assert.equal(r.status, 401);
    }
    assert.ok(locked, 'sign-in was never locked');
    const stillLocked = await post('/api/signin-password', { email: EMAIL, password: 'third passphrase after reset' });
    assert.equal(stillLocked.status, 429, 'even the right password is refused while locked');

    const before = mail.length;
    assert.equal((await post('/api/signin', { email: EMAIL })).status, 200);
    await mailArrives(before + 1);
    assert.equal((await post('/api/verify-email', { email: EMAIL, code: lastCode() })).status, 200);
  });

  test('the calculator accepts looked-up address facts and rejects a bad lookup', async () => {
    const base = { state: 'OH', grossCents: 300000, payFrequency: 'biweekly', filingStatus: 'single' };
    const ok = await post('/api/demo/paycheck', { ...base, certificate: { ohMunicipality: 'Columbus', bogus: { nested: 1 }, 'bad key!': 'x' }, residenceState: 'KY' });
    assert.equal(ok.status, 200);
    const b = await ok.json();
    assert.equal(b.request.workState.certificate.ohMunicipality, 'Columbus');
    assert.equal(b.request.workState.certificate.bogus, undefined, 'nested values never reach the engine');
    assert.equal(b.request.residenceState.code, 'KY');
    assert.equal((await post('/api/demo/paycheck', { ...base, residenceState: 'ZZ' })).status, 422);
    assert.equal((await post('/api/demo/resolve-address', {})).status, 422);
    assert.equal((await post('/api/demo/resolve-address', { workAddress: 'x'.repeat(300) })).status, 422);
  });

  test('the home page calculator runs the real engine without a key', async () => {
    const r = await post('/api/demo/paycheck', { state: 'OH', grossCents: 300000, payFrequency: 'biweekly', filingStatus: 'single', pretaxCents: 24000 });
    assert.equal(r.status, 200);
    const b = await r.json();
    assert.equal(b.result.grossPay, 300000);
    assert.equal(b.result.netPay, b.result.grossPay - b.result.pretaxDeductions - b.result.employeeTaxTotal);
    assert.ok(b.result.taxes.some((t: { id: string }) => t.id === 'OH_SIT'));
    assert.equal(b.request.workState.code, 'OH');

    const nm = await (await post('/api/demo/paycheck', { state: 'IN', grossCents: 300000 })).json();
    assert.ok(nm.result.taxes.some((t: { detail: string }) => /^NOT MODELLED/.test(t.detail)), 'a missing county is said out loud');

    assert.equal((await post('/api/demo/paycheck', { state: 'ZZ', grossCents: 1 })).status, 422);
    assert.equal((await post('/api/demo/paycheck', { state: 'OH', grossCents: 12.5 })).status, 422);
    assert.equal((await post('/api/demo/paycheck', { state: 'OH', grossCents: 100, pretaxCents: 200 })).status, 422);
    assert.equal((await post('/api/demo/paycheck', { state: 'OH', grossCents: 99_999_999_999 })).status, 422);
  });
});

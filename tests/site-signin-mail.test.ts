import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { createServer as netServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Signing back in after signing out, and the emailed sign-in code, against a
 * stand-in for Resend. Covers both mail routes the site has: its own Resend
 * client, and the Python verifier that production runs beside it.
 *
 * What it pins: the code is emailed and says "sign-in", signing in with it
 * (or the password) after a sign-out works, a failing provider is reported
 * as failing rather than as sent and the answer is the same for every
 * address, a failed send does not block the retry, and a recovered provider
 * reads as healthy again.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const EMAIL = 'ada@signin-mail.test';
const PW = 'correct horse battery staple';
const SECRET = 's'.repeat(40);
const havePython = spawnSync('python3', ['--version']).status === 0;

const freePort = () => new Promise<number>((resolve) => {
  const s = netServer();
  s.listen(0, '127.0.0.1', () => { const { port } = s.address() as { port: number }; s.close(() => resolve(port)); });
});

interface Mail { from: string; to: string[]; subject: string; text: string; html: string }
type Mode = 'ok' | 'domain_unverified' | 'down';

async function fakeResend() {
  const mails: Mail[] = [];
  const state = { mode: 'ok' as Mode };
  const server: Server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const mail = JSON.parse(raw || '{}') as Mail;
      const reply = (status: number, body: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
      if (state.mode === 'down') return reply(401, { message: 'API key is invalid' });
      if (state.mode === 'domain_unverified' && !mail.from.includes('onboarding@resend.dev')) return reply(403, { message: 'The signin-mail.test domain is not verified.' });
      mails.push(mail);
      reply(200, { id: 'em_1' });
    });
  });
  const port = await freePort();
  await new Promise<void>((r) => server.listen(port, '127.0.0.1', r));
  return { mails, state, base: `http://127.0.0.1:${port}`, close: () => server.close() };
}

const codeOf = (m: Mail | undefined) => /\b(\d{6})\b/.exec(m?.subject ?? '')?.[1] ?? '';

async function waitFor(url: string) {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error(`${url} did not start`);
}

function suite(name: string, withVerifier: boolean) {
  describe(name, { skip: withVerifier && !havePython }, () => {
    let resend: Awaited<ReturnType<typeof fakeResend>>;
    let site: ChildProcess;
    let verifier: ChildProcess | null = null;
    let base = '';
    let dir = '';
    let signupCookie = '';

    const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
      fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    const health = async () => ((await (await fetch(base + '/healthz')).json()) as { mail: string }).mail;
    const cookieOf = (r: Response, name: string) => (r.headers.getSetCookie().find((c) => c.startsWith(name + '=')) ?? '').split(';')[0] ?? '';
    const me = async (cookie: string) => (await fetch(base + '/api/account', { headers: { Cookie: cookie } })).status;
    const lastMail = () => resend.mails.at(-1);

    before(async () => {
      resend = await fakeResend();
      dir = mkdtempSync(join(tmpdir(), 'signin-mail-'));
      const sitePort = await freePort();
      base = `http://127.0.0.1:${sitePort}`;
      const env: Record<string, string> = {
        ...process.env as Record<string, string>,
        PORT: String(sitePort), SITE_DB_DIR: dir, RESEND_API_KEY: 're_test_key', RESEND_API_BASE: resend.base,
        RESEND_FROM: 'verify@signin-mail.test', PUBLIC_BASE_URL: '', TRUST_PROXY: '', STRIPE_SECRET_KEY: '',
        SIGNIN_PER_HOUR: '1000', SIGNUP_PER_HOUR: '1000', NODE_ENV: 'production', VERIFIER_URL: '', VERIFIER_SECRET: '',
      };
      if (withVerifier) {
        const vPort = await freePort();
        verifier = spawn('python3', ['verifier/email_verifier.py', 'serve'], {
          cwd: REPO,
          env: { ...env, VERIFIER_SECRET: SECRET, VERIFIER_PEPPER: 'p'.repeat(40), VERIFIER_PORT: String(vPort), VERIFIER_DB: join(dir, 'v.sqlite3') },
          stdio: 'ignore',
        });
        await waitFor(`http://127.0.0.1:${vPort}/healthz`);
        env.VERIFIER_URL = `http://127.0.0.1:${vPort}`;
        env.VERIFIER_SECRET = SECRET;
      }
      site = spawn('node', ['site/server.ts'], { cwd: REPO, env, stdio: 'ignore' });
      await waitFor(`${base}/healthz`);
    });
    after(() => { site?.kill('SIGKILL'); verifier?.kill('SIGKILL'); resend?.close(); rmSync(dir, { recursive: true, force: true }); });

    test('an account is created and verified by the emailed code, with a password', async () => {
      assert.equal(await health(), 'untested');
      const r = await post('/api/signup', { name: 'Ada Lovelace', email: EMAIL, company: 'Ada LLC', phone: '', agreeToTerms: true, password: PW });
      assert.equal(r.status, 200);
      assert.equal(((await r.json()) as { emailSent: boolean }).emailSent, true);
      signupCookie = cookieOf(r, 'omnia_signup');
      assert.equal(await health(), 'ok');
      const v = await post('/api/verify-email', { email: EMAIL, code: codeOf(lastMail()) }, { Cookie: signupCookie });
      assert.equal(v.status, 200);
      assert.equal(((await v.json()) as { hasPassword: boolean }).hasPassword, true);
      assert.equal(await me(cookieOf(v, 'omnia_session')), 200);
    });

    test('after signing out, the password signs back in', async () => {
      const first = await post('/api/signin-password', { email: EMAIL, password: PW });
      assert.equal(first.status, 200);
      const cookie = cookieOf(first, 'omnia_session');
      assert.equal(await me(cookie), 200);
      const out = await post('/api/signout', {}, { Cookie: cookie });
      assert.equal(out.status, 200);
      assert.equal(await me(cookie), 401, 'signed out means signed out');
      const again = await post('/api/signin-password', { email: EMAIL, password: PW });
      assert.equal(again.status, 200);
      assert.equal(await me(cookieOf(again, 'omnia_session')), 200);
      assert.equal((await post('/api/signin-password', { email: EMAIL, password: 'wrong password here' })).status, 401);
    });

    test('after signing out, an emailed sign-in code signs back in, and the email says sign-in', async () => {
      const before = resend.mails.length;
      const r = await post('/api/signin', { email: EMAIL });
      assert.equal(r.status, 200);
      assert.equal(resend.mails.length, before + 1, 'the code was actually emailed');
      const mail = lastMail()!;
      assert.deepEqual(mail.to, [EMAIL]);
      assert.match(mail.subject, /^\d{6} is your Omnia sign-in code$/);
      assert.match(mail.html, /Your sign-in code/);
      assert.doesNotMatch(mail.html + mail.text, /signup/i);
      const v = await post('/api/verify-email', { email: EMAIL, code: codeOf(mail) });
      assert.equal(v.status, 200);
      const cookie = cookieOf(v, 'omnia_session');
      assert.equal(await me(cookie), 200);
      await post('/api/signout', {}, { Cookie: cookie });
      assert.equal(await me(cookie), 401);
      // And again, the same way: a second round trip after a sign-out.
      const r2 = await post('/api/signin', { email: EMAIL });
      assert.equal(r2.status, 200);
    });

    test('an address with no account gets the same reply and no email', async () => {
      const before = resend.mails.length;
      const known = await (await post('/api/signin', { email: EMAIL })).json();
      const unknown = await (await post('/api/signin', { email: 'nobody@signin-mail.test' })).json();
      assert.deepEqual(unknown, known);
      assert.ok(!resend.mails.some((m) => m.to.includes('nobody@signin-mail.test')));
      assert.ok(resend.mails.length >= before);
    });

    test('an unverified sending domain still reaches the owner from the test address', async () => {
      resend.state.mode = 'domain_unverified';
      const before = resend.mails.length;
      // A distinct account so the cooldown from the earlier sign-ins does not apply.
      const r = await post('/api/signup', { name: 'Grace Hopper', email: 'grace@signin-mail.test', company: 'G', phone: '', agreeToTerms: true });
      assert.equal(r.status, 200);
      assert.equal(((await r.json()) as { emailSent: boolean }).emailSent, true);
      assert.equal(resend.mails.length, before + 1);
      assert.match(lastMail()!.from, /onboarding@resend\.dev/);
      resend.state.mode = 'ok';
    });

    test('a failing provider reads as failing, for every address, and recovery reads as healthy', async () => {
      // A verified account with no code outstanding, so a sign-in request really attempts a send.
      const su = await post('/api/signup', { name: 'Edith Clarke', email: 'edith@signin-mail.test', company: 'E', phone: '', agreeToTerms: true });
      const verified = await post('/api/verify-email', { email: 'edith@signin-mail.test', code: codeOf(lastMail()) }, { Cookie: cookieOf(su, 'omnia_signup') });
      assert.equal(verified.status, 200);

      resend.state.mode = 'down';
      // The first request after the outage starts is the one that discovers it.
      await post('/api/signin', { email: 'edith@signin-mail.test' });
      assert.equal(await health(), 'failing');
      const known = await post('/api/signin', { email: 'edith@signin-mail.test' });
      const unknown = await post('/api/signin', { email: 'nobody2@signin-mail.test' });
      const k = await known.json() as { emailSent: boolean; emailConfigured: boolean };
      assert.equal(k.emailSent, false, 'does not claim a send that failed');
      assert.equal(k.emailConfigured, true);
      assert.deepEqual(await unknown.json(), k, 'same answer for an address with no account');

      resend.state.mode = 'ok';
      const before = resend.mails.length;
      await post('/api/signin', { email: 'edith@signin-mail.test' });
      assert.equal(resend.mails.length, before + 1, 'the retry goes straight out: a failed send did not start a cooldown');
      assert.equal(await health(), 'ok');
      assert.equal(((await (await post('/api/signin', { email: 'nobody3@signin-mail.test' })).json()) as { emailSent: boolean }).emailSent, true);
    });
  });
}

suite('sign-in through the site’s own Resend client', false);
suite('sign-in through the Python verifier (production)', true);

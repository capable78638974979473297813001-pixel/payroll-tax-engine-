import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resendFromAddress, scrubMailLog, sendVerificationEmail } from '../site/lib/mail.ts';

/**
 * Audit fixes: optional phone, honest verification-email results, Resend
 * From / User-Agent, scrubbed mail failures, the development-only code
 * hint, Render's proxy for client IP, and a Secure cookie on Render.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

type Site = {
  base: string;
  dir: string;
  child: ChildProcess;
  log: () => string;
};

const sites: Site[] = [];

function db(site: Site) {
  return JSON.parse(readFileSync(join(site.dir, 'db.json'), 'utf8'));
}

async function startSite(extra: Record<string, string>): Promise<Site> {
  const dir = mkdtempSync(join(tmpdir(), 'site-audit-'));
  const port = 20000 + Math.floor(Math.random() * 20000);
  let output = '';
  const child = spawn('node', ['site/server.ts'], {
    cwd: REPO,
    env: {
      ...process.env,
      PORT: String(port),
      SITE_DB_DIR: dir,
      RATE_LIMIT_PER_MIN: '1000',
      SIGNUP_PER_HOUR: '10',
      STRIPE_SECRET_KEY: '',
      STRIPE_ALLOW_LIVE: '',
      RESEND_API_KEY: '',
      RESEND_FROM: '',
      RESEND_API_BASE: '',
      VERIFIER_URL: '',
      VERIFIER_SECRET: '',
      PUBLIC_BASE_URL: '',
      RENDER: '',
      TRUST_PROXY: '',
      COOKIE_SECURE: '',
      NODE_ENV: 'development',
      ...extra,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (d) => { output += d; });
  child.stderr?.on('data', (d) => { output += d; });
  const site: Site = { base: `http://127.0.0.1:${port}`, dir, child, log: () => output };
  sites.push(site);
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${site.base}/healthz`)).ok) return site; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`site did not become healthy\n${output}`);
}

function post(site: Site, path: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(site.base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

after(() => {
  for (const site of sites) site.child.kill('SIGKILL');
  for (const site of sites) rmSync(site.dir, { recursive: true, force: true });
});

describe('verification email tells the truth', { concurrency: 1 }, () => {
  test('a bare RESEND_FROM is named, and the site sends a User-Agent Resend accepts', async () => {
    const seen: { from?: string; ua?: string; auth?: string }[] = [];
    const stub = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => { raw += c; });
      req.on('end', () => {
        const body = JSON.parse(raw || '{}');
        seen.push({ from: body.from, ua: String(req.headers['user-agent'] ?? ''), auth: String(req.headers.authorization ?? '') });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'em_1' }));
      });
    });
    await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));
    const port = (stub.address() as { port: number }).port;
    const prev = {
      key: process.env.RESEND_API_KEY,
      from: process.env.RESEND_FROM,
      base: process.env.RESEND_API_BASE,
      pub: process.env.PUBLIC_BASE_URL,
    };
    process.env.RESEND_API_KEY = 're_test_audit';
    process.env.RESEND_FROM = 'verify@omniatax.io';
    process.env.RESEND_API_BASE = `http://127.0.0.1:${port}`;
    delete process.env.PUBLIC_BASE_URL;
    try {
      assert.equal(resendFromAddress(), 'Omnia.tax <verify@omniatax.io>');
      const sent = await sendVerificationEmail({
        name: 'Ada Lovelace',
        email: 'ada@audit.test',
        code: '246810',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      assert.equal(sent.sent, true);
      assert.equal(seen[0]?.from, 'Omnia.tax <verify@omniatax.io>');
      assert.equal(seen[0]?.ua, 'omniatax-site/1.0');
      assert.equal(seen[0]?.auth, 'Bearer re_test_audit');

      process.env.RESEND_FROM = 'Omnia.tax <verify@omniatax.io>';
      assert.equal(resendFromAddress(), 'Omnia.tax <verify@omniatax.io>');
    } finally {
      const restore = (key: 'RESEND_API_KEY' | 'RESEND_FROM' | 'RESEND_API_BASE' | 'PUBLIC_BASE_URL', value: string | undefined) => {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      };
      restore('RESEND_API_KEY', prev.key);
      restore('RESEND_FROM', prev.from);
      restore('RESEND_API_BASE', prev.base);
      restore('PUBLIC_BASE_URL', prev.pub);
      stub.close();
    }
  });

  test('a Resend error is scrubbed before it can reach a log', () => {
    const dirty = 'Resend responded 403: {"message":"bad re_AbCdEf123456 code 654321"}';
    const clean = scrubMailLog(dirty);
    assert.equal(clean.includes('re_AbCdEf123456'), false);
    assert.equal(clean.includes('654321'), false);
    assert.match(clean, /\[redacted\]/);
    assert.match(clean, /\[code\]/);
  });

  test('development with no provider logs the code and says so', async () => {
    const site = await startSite({});
    const email = 'dev@audit.test';
    const r = await post(site, '/api/signup', { name: 'Dev User', email, company: 'Audit Co', agreeToTerms: true });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.emailSent, false);
    assert.equal(body.devCodeHint, true);
    const code = db(site).accounts[email].code as string;
    assert.match(code, /^\d{6}$/);
    assert.equal(db(site).accounts[email].phone, '');
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.ok(site.log().includes(code), 'development log should contain the code');
    assert.equal((await post(site, '/api/verify-email', { email, code })).status, 200);

    const known = await post(site, '/api/signin', { email });
    assert.equal(known.status, 200);
    const knownBody = await known.json();
    assert.equal(knownBody.ok, true);
    assert.equal(knownBody.devCodeHint, true);
  });

  test('production with no provider does not log the code or claim the log has it', async () => {
    const site = await startSite({ NODE_ENV: 'production' });
    const email = 'prod@audit.test';
    const r = await post(site, '/api/signup', { name: 'Prod User', email, company: 'Audit Co', agreeToTerms: true });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.emailSent, false);
    assert.equal(body.devCodeHint, false);
    const code = db(site).accounts[email].code as string;
    await new Promise((resolve) => setTimeout(resolve, 50));
    const log = site.log();
    assert.equal(log.includes(code), false);
    assert.equal(log.includes(email), false);
    assert.match(log, /no email provider is configured/);
  });

  test('a failed send is reported, and the log keeps the key and the code out', async () => {
    const seen: string[] = [];
    const stub = createServer((_req, res) => {
      seen.push('hit');
      const body = JSON.stringify({ message: 'refused re_AbCdEf123456 for code 654321' });
      res.writeHead(403, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
      res.end(body);
    });
    await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));
    const port = (stub.address() as { port: number }).port;
    const site = await startSite({
      RESEND_API_KEY: 're_test_audit',
      RESEND_FROM: 'verify@omniatax.io',
      RESEND_API_BASE: `http://127.0.0.1:${port}`,
    });
    const email = 'fail@audit.test';
    const r = await post(site, '/api/signup', { name: 'Fail User', email, company: 'Audit Co', phone: '', agreeToTerms: true });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.emailSent, false);
    assert.equal(body.devCodeHint, false);
    assert.equal(seen.length, 1);
    const code = db(site).accounts[email].code as string;
    await new Promise((resolve) => setTimeout(resolve, 50));
    const log = site.log();
    assert.equal(log.includes(code), false);
    assert.equal(log.includes('654321'), false);
    assert.equal(log.includes('re_AbCdEf123456'), false);
    assert.equal(log.includes('re_test_audit'), false);

    const unknown = await post(site, '/api/signin', { email: 'nobody@audit.test' });
    assert.equal(unknown.status, 200);
    const unknownBody = await unknown.json();
    assert.equal(unknownBody.emailSent, true);
    assert.equal(seen.length, 1, 'an unknown address must not send mail');

    const v = await post(site, '/api/verify-email', { email, code });
    assert.equal(v.status, 200);
    const again = await post(site, '/api/signin', { email });
    assert.equal(again.status, 200);
    const againBody = await again.json();
    assert.equal(againBody.emailSent, false);
    assert.equal(againBody.devCodeHint, false);
    assert.equal(seen.length, 2);
    stub.close();
  });

  test('phone is optional and still length-capped', async () => {
    const site = await startSite({});
    const missing = await post(site, '/api/signup', { name: 'No Phone', email: 'nophone@audit.test', company: 'Audit Co', agreeToTerms: true });
    assert.equal(missing.status, 200);
    assert.equal(db(site).accounts['nophone@audit.test'].phone, '');
    const long = await post(site, '/api/signup', {
      name: 'Long Phone', email: 'longphone@audit.test', company: 'Audit Co', phone: '1'.repeat(41), agreeToTerms: true,
    });
    assert.equal(long.status, 400);
  });
});

describe('Render proxy and cookies', { concurrency: 1 }, () => {
  test('RENDER trusts X-Forwarded-For unless TRUST_PROXY is explicitly off, and the cookie is Secure', async () => {
    const trusted = await startSite({ RENDER: 'true' });
    const spoof = { 'X-Forwarded-For': '203.0.113.50, 10.0.0.1' };
    const r = await post(trusted, '/api/signup', {
      name: 'Proxy User', email: 'proxy@audit.test', company: 'Audit Co', agreeToTerms: true,
    }, spoof);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type')?.includes('json'), true);
    const body = await r.json();
    assert.equal(body.devCodeHint, false, 'a Render process is production and must not point at the log');
    const keys = Object.keys(db(trusted).rateLimits);
    assert.ok(keys.includes('signup:203.0.113.50'), keys.join(','));
    const code = db(trusted).accounts['proxy@audit.test'].code as string;
    assert.equal(trusted.log().includes(code), false);
    const verified = await post(trusted, '/api/verify-email', { email: 'proxy@audit.test', code });
    assert.equal(verified.status, 200);
    assert.match(verified.headers.get('set-cookie') ?? '', /Secure/);

    const refused = await startSite({ RENDER: 'true', TRUST_PROXY: '0' });
    const r2 = await post(refused, '/api/signup', {
      name: 'Direct User', email: 'direct@audit.test', company: 'Audit Co', agreeToTerms: true,
    }, spoof);
    assert.equal(r2.status, 200);
    const keys2 = Object.keys(db(refused).rateLimits);
    assert.equal(keys2.some((k) => k.includes('203.0.113.50')), false, keys2.join(','));
    assert.ok(keys2.some((k) => k.startsWith('signup:')));
  });
});

describe('pages describe the three live-site findings', () => {
  const read = (name: string) => readFileSync(join(REPO, name), 'utf8');

  test('signup phone is optional, and verify shows a real send result', () => {
    const signup = read('site/signup.html');
    assert.match(signup, /Phone <span class="hint">\(optional\)<\/span>/);
    assert.match(signup, /We don’t text this number or use it for billing\./);
    assert.doesNotMatch(signup, /id="phone"[^>]*required/);
    const verify = read('site/signup-verify.html');
    assert.match(verify, /id="sendStatus"/);
    assert.match(verify, /emailSent/);
    assert.match(verify, /devCodeHint/);
    assert.match(verify, /We couldn’t send the email just now/);
    assert.doesNotMatch(verify, /On a development server the code is in the server log/);
  });

  test('the sandbox explains a missing key and does not mint one', () => {
    const js = read('site/assets/sandbox.js');
    assert.match(js, /Create an account/);
    assert.match(js, /Example output\. This is not your calculation\./);
    assert.match(js, /This page does not issue a key/);
    assert.doesNotMatch(js, /sandbox-key|OMNIA_SANDBOX_KEY/i);
    const html = read('site/sandbox.html');
    assert.doesNotMatch(html, /OMNIA_SANDBOX_KEY/);
  });
});

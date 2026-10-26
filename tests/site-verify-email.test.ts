import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

/**
 * Signup step 2 (/signup/verify): the development-server sentence stays off
 * in production, the Resend failure is logged without the API key or the code,
 * and Resend code is rate-limited.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const FAIL = "We couldn't send your code. Try again or contact support.";
const DEV = 'On a development server the code is in the server log.';
const API_KEY = 're_envkeyshouldnotappear';
const PLANTED = 're_supersecretkey999';

const freePort = () => new Promise<number>((resolve) => {
  const srv = createNetServer();
  srv.listen(0, '127.0.0.1', () => {
    const { port } = srv.address() as { port: number };
    srv.close(() => resolve(port));
  });
});

function leadFor(devHint: boolean, extra: Record<string, unknown> = {}) {
  const ctx = { window: {} as { OmniaVerifyLead?: (opts: Record<string, unknown>) => { html: string; devHintShown: boolean } } };
  runInContext(readFileSync(join(REPO, 'site/assets/verify-lead.js'), 'utf8'), createContext(ctx));
  return ctx.window.OmniaVerifyLead!({ email: 'jordan@acmepayroll.test', devHint, ...extra });
}

function omniaFrom(html: string): { devCodeHint: boolean } {
  const m = html.match(/window\.OMNIA=(\{.*?\})/);
  assert.ok(m, 'page did not inject window.OMNIA');
  return JSON.parse(m[1]);
}

type Site = { child: ChildProcess; log: () => string; port: number; dir: string };

function startSite(port: number, dir: string, env: Record<string, string>): Site {
  let buf = '';
  const child = spawn('node', ['site/server.ts'], {
    cwd: REPO,
    env: {
      ...process.env,
      PORT: String(port),
      SITE_DB_DIR: dir,
      RATE_LIMIT_PER_MIN: '1000',
      TRUST_PROXY: '',
      VERIFIER_URL: '',
      VERIFIER_SECRET: '',
      VERIFIER_DEV: '',
      OMNIA_DEV_CODE_HINT: '',
      RESEND_API_KEY: '',
      RESEND_FROM: '',
      RESEND_API_BASE: '',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout!.on('data', (d) => { buf += d; });
  child.stderr!.on('data', (d) => { buf += d; });
  return { child, log: () => buf, port, dir };
}

async function ready(port: number) {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`server on ${port} did not start`);
}

const signup = (port: number, email: string) =>
  fetch(`http://127.0.0.1:${port}/api/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Jordan Casey', email, company: 'Acme Payroll', phone: '555-123-4567', agreeToTerms: true }),
  });

let resend: Server;
let verifier: Server;
let prod: Site;
let dev: Site;
let flagged: Site;
let viaVerifier: Site;

describe('signup verify email', () => {
  before(async () => {
    const [prodPort, devPort, flagPort, verPort, resendPort, verifierPort] = await Promise.all([
      freePort(), freePort(), freePort(), freePort(), freePort(), freePort(),
    ]);
    resend = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => { raw += c; });
      req.on('end', () => {
        const body = JSON.stringify({
          statusCode: 403,
          message: 'The omniatax.io domain is not verified. Please, add and verify your domain.',
          echo: String(req.headers.authorization || ''),
        });
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(body);
        void raw;
      });
    });
    verifier = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => { raw += c; });
      req.on('end', () => {
        const body = JSON.parse(raw || '{}') as { email?: string };
        const payload = body.email === 'cool@payroll.test'
          ? { ok: true, sent: false, cooldown: true }
          : {
            ok: true,
            sent: false,
            error: `Resend answered 403: The omniatax.io domain is not verified. token ${PLANTED} ref 123456`,
          };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
      });
    });
    await Promise.all([
      new Promise<void>((r) => resend.listen(resendPort, '127.0.0.1', r)),
      new Promise<void>((r) => verifier.listen(verifierPort, '127.0.0.1', r)),
    ]);

    const prodDir = mkdtempSync(join(tmpdir(), 'verify-prod-'));
    const devDir = mkdtempSync(join(tmpdir(), 'verify-dev-'));
    const flagDir = mkdtempSync(join(tmpdir(), 'verify-flag-'));
    const verDir = mkdtempSync(join(tmpdir(), 'verify-remote-'));
    prod = startSite(prodPort, prodDir, {
      NODE_ENV: 'production',
      RESEND_API_KEY: API_KEY,
      RESEND_API_BASE: `http://127.0.0.1:${resendPort}`,
      RESEND_FROM: 'Omnia.tax <verify@omniatax.io>',
      SIGNUP_PER_HOUR: '2',
    });
    dev = startSite(devPort, devDir, { NODE_ENV: 'development' });
    flagged = startSite(flagPort, flagDir, { NODE_ENV: 'production', OMNIA_DEV_CODE_HINT: '1' });
    viaVerifier = startSite(verPort, verDir, {
      NODE_ENV: 'production',
      VERIFIER_URL: `http://127.0.0.1:${verifierPort}`,
      VERIFIER_SECRET: 's'.repeat(40),
      RESEND_API_KEY: API_KEY,
      RESEND_FROM: 'Omnia.tax <verify@omniatax.io>',
      SIGNUP_PER_HOUR: '20',
    });
    await Promise.all([ready(prodPort), ready(devPort), ready(flagPort), ready(verPort)]);
  });

  after(() => {
    for (const site of [prod, dev, flagged, viaVerifier]) site?.child.kill('SIGKILL');
    resend?.close();
    verifier?.close();
    for (const site of [prod, dev, flagged, viaVerifier]) {
      if (site?.dir) rmSync(site.dir, { recursive: true, force: true });
    }
  });

  test('production does not show the dev-server hint, and offers Resend code', async () => {
    const html = await (await fetch(`http://127.0.0.1:${prod.port}/signup/verify`)).text();
    const omnia = omniaFrom(html);
    assert.equal(omnia.devCodeHint, false);
    const lead = leadFor(omnia.devCodeHint, { emailSent: false });
    assert.equal(lead.html, FAIL);
    assert.equal(lead.devHintShown, false);
    assert.equal(lead.html.includes('development server'), false);
    assert.equal(lead.html.includes('server log'), false);
    assert.match(html, /id="resend"[^>]*>Resend code</);
    assert.match(html, /id="resendRow"/);
    assert.doesNotMatch(html, /id="resendRow"[^>]*\shidden/);
    assert.match(html, /assets\/verify-lead\.js/);
    // The page source itself no longer bakes the hint in unconditionally.
    assert.equal(html.includes(DEV), false);
  });

  test('development, and an explicit dev flag, show the hint', async () => {
    const devHtml = await (await fetch(`http://127.0.0.1:${dev.port}/signup/verify`)).text();
    const devOmnia = omniaFrom(devHtml);
    assert.equal(devOmnia.devCodeHint, true);
    const devLead = leadFor(devOmnia.devCodeHint, { emailSent: false });
    assert.equal(devLead.html, `${FAIL} ${DEV}`);
    assert.equal(devLead.devHintShown, true);

    const flagHtml = await (await fetch(`http://127.0.0.1:${flagged.port}/signup/verify`)).text();
    assert.equal(omniaFrom(flagHtml).devCodeHint, true);
    const flaggedLead = leadFor(true, { emailSent: false });
    assert.equal(flaggedLead.devHintShown, true);
    assert.match(flaggedLead.html, /development server/);

    const sent = leadFor(true, { emailSent: true });
    assert.equal(sent.devHintShown, false);
    assert.equal(sent.html.includes(DEV), false);
    assert.match(sent.html, /We sent a 6-digit code/);
  });

  test('a Resend rejection is logged without the key or the code, and Resend code is rate-limited', async () => {
    const email = 'jordan@acmepayroll.test';
    const r = await signup(prod.port, email);
    const text = await r.text();
    const body = JSON.parse(text);
    assert.equal(r.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.emailSent, false);
    assert.equal(body.cooldown, false);
    assert.equal(text.includes('not verified'), false);
    assert.equal(text.includes(API_KEY), false);
    assert.equal(text.includes(PLANTED), false);

    // The store keeps only a hash of the code, so there is no plaintext to look for: the log must hold
    // no six-digit number at all, and no stored hash.
    const stored = JSON.parse(readFileSync(join(prod.dir, 'db.json'), 'utf8')).accounts[email].code as string;
    assert.match(stored, /^sha256:/);
    for (let i = 0; i < 20 && !prod.log().includes('domain is not verified'); i++) {
      await new Promise((res) => setTimeout(res, 25));
    }
    const log = prod.log();
    assert.match(log, /\[mail\] verification email failed:/);
    assert.match(log, /domain is not verified/);
    assert.match(log, /\[redacted\]/);
    assert.equal(log.includes(API_KEY), false, 'log contained the API key');
    assert.doesNotMatch(log, /\b\d{6}\b/, 'log contained a six-digit code');
    assert.equal(log.includes(stored), false, 'log contained the stored code hash');
    assert.equal(log.includes('[code]'), false, 'a code was logged and then redacted');
    assert.equal(log.includes('CODE:'), false);

    const second = await signup(prod.port, 'second@acmepayroll.test');
    assert.equal(second.status, 200);
    const third = await signup(prod.port, 'third@acmepayroll.test');
    assert.equal(third.status, 429);
    assert.equal((await third.json()).code, 'rate_limited');
  });

  test('the verifier path logs the Resend error and does not treat a cooldown as a failure', async () => {
    const r = await signup(viaVerifier.port, 'ada@payroll.test');
    const text = await r.text();
    const body = JSON.parse(text);
    assert.equal(r.status, 200);
    assert.equal(body.emailSent, false);
    assert.equal(text.includes(PLANTED), false);
    assert.equal(text.includes('123456'), false);
    assert.equal(text.includes('not verified'), false);
    for (let i = 0; i < 20 && !viaVerifier.log().includes('domain is not verified'); i++) {
      await new Promise((res) => setTimeout(res, 25));
    }
    const log = viaVerifier.log();
    assert.match(log, /\[mail\] verification email failed:/);
    assert.match(log, /domain is not verified/);
    assert.match(log, /\[redacted\]/);
    assert.match(log, /\[code\]/);
    assert.equal(log.includes(PLANTED), false, 'log contained the planted API key');
    assert.equal(log.includes(API_KEY), false, 'log contained the env API key');
    assert.equal(log.includes('123456'), false, 'log contained the code');

    const mark = log.length;
    const cool = await signup(viaVerifier.port, 'cool@payroll.test');
    const coolBody = await cool.json();
    assert.equal(cool.status, 200);
    assert.equal(coolBody.cooldown, true);
    // A cooldown means a code was just sent, so the site reports it as delivered.
    assert.equal(coolBody.emailSent, true);
    await new Promise((res) => setTimeout(res, 50));
    assert.equal(viaVerifier.log().slice(mark).includes('verification email failed'), false);
    const coolLead = leadFor(false, { emailSent: false, cooldown: true });
    assert.equal(coolLead.devHintShown, false);
    assert.match(coolLead.html, /Resend code/);
    assert.equal(coolLead.html.includes(DEV), false);
  });
});

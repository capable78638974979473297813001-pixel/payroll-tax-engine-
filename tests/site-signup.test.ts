import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Signup is the only way to a key, and a key needs a card or bank account
 * on file. Boots site/server.ts against a local stand-in for Stripe's
 * Checkout API and walks the real flow: signup, email code, terms,
 * payment, key, calls. Also covers sign-in for returning customers and
 * every example the API console ships.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4900 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}`;
const EMAIL = 'jordan@acmepayroll.test';

const examples: { id: string; request: unknown }[] =
  JSON.parse(readFileSync(join(REPO, 'site/sandbox-examples.json'), 'utf8')).examples;

// Checkout sessions the fake Stripe knows, by id.
const card = { id: 'pm_card', type: 'card', card: { brand: 'visa', last4: '4242' } };
const sessions: Record<string, unknown> = {
  cs_open: { id: 'cs_open', status: 'open', customer: 'cus_1', metadata: { omnia_email: EMAIL } },
  cs_other: { id: 'cs_other', status: 'complete', customer: 'cus_2', metadata: { omnia_email: 'someone@else.test' },
    subscription: { id: 'sub_2', default_payment_method: card } },
  cs_nopm: { id: 'cs_nopm', status: 'complete', customer: 'cus_1', metadata: { omnia_email: EMAIL }, subscription: { id: 'sub_1' } },
  cs_ok: { id: 'cs_ok', status: 'complete', customer: 'cus_1', metadata: { omnia_email: EMAIL },
    subscription: { id: 'sub_1', default_payment_method: card } },
};

let dir: string;
let child: ChildProcess;
let stripe: Server;

const db = () => JSON.parse(readFileSync(join(dir, 'db.json'), 'utf8'));
const post = (path: string, body: unknown, token?: string) =>
  fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'site-signup-'));
  stripe = createServer((req, res) => {
    const m = /^\/v1\/checkout\/sessions\/([^?]+)/.exec(req.url ?? '');
    const s = m && sessions[m[1]];
    res.writeHead(s ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(s ?? { error: { message: 'No such checkout session' } }));
  });
  await new Promise<void>((r) => stripe.listen(0, '127.0.0.1', r));
  const stripePort = (stripe.address() as { port: number }).port;

  child = spawn('node', ['site/server.ts'], {
    cwd: REPO,
    env: {
      ...process.env, PORT: String(PORT), SITE_DB_DIR: dir, RATE_LIMIT_PER_MIN: '1000',
      STRIPE_SECRET_KEY: 'sk_test_fake', STRIPE_API_BASE: `http://127.0.0.1:${stripePort}`,
      STRIPE_PRICE_ID: '', RESEND_API_KEY: '', TRUST_PROXY: '',
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/v1/health`)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('server did not become healthy in time');
});

after(() => {
  child?.kill('SIGKILL');
  stripe?.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('signup: a key needs a card or bank account on file', () => {
  let session = '';
  let key = '';

  test('signup without the terms checkbox is refused', async () => {
    const r = await post('/api/signup', { name: 'No Terms', email: 'noterms@acmepayroll.test', company: 'Acme', phone: '555-000-0000' });
    assert.equal(r.status, 400);
    assert.equal((await r.json()).code, 'terms_required');
  });

  test('there are no anonymous keys', async () => {
    assert.equal((await fetch(`${BASE}/v1/sandbox-keys`, { method: 'POST' })).status, 404);
    assert.equal((await fetch(`${BASE}/api/sandbox-key`, { method: 'POST' })).status, 404);
  });

  test('signup sends a code; the code verifies the email and signs in', async () => {
    const r = await post('/api/signup', { name: 'Jordan Casey', email: EMAIL, company: 'Acme Payroll', phone: '555-123-4567', agreeToTerms: true });
    assert.equal(r.status, 200);
    const created = db().accounts[EMAIL];
    assert.ok(created.termsAcceptedAt);
    assert.equal(created.termsVersion, '2026-10-19.2');
    const code = created.code;
    assert.match(code, /^\d{6}$/);
    const v = await post('/api/verify-email', { email: EMAIL, code });
    assert.equal(v.status, 200);
    session = (await v.json()).sessionToken;
    assert.ok(session);
  });

  test('a verified account without a payment method gets no key', async () => {
    const r = await post('/api/issue-key', {}, session);
    assert.equal(r.status, 402);
    assert.equal((await r.json()).code, 'payment_method_required');
  });

  test('terms are signed, and the trial still cannot start without a payment method', async () => {
    const terms = await (await fetch(`${BASE}/api/terms?employees=200&payFrequency=biweekly&rooftop=false`, {
      headers: { Authorization: `Bearer ${session}` },
    })).json();
    assert.match(terms.quoteId, /^tq_/);
    const t = await post('/api/accept-terms', {
      agreed: true, signedName: 'Jordan Casey', legalName: 'Acme Payroll LLC', billingEmail: EMAIL,
      address: '120 Main St, Columbus OH 43215', quoteId: terms.quoteId,
      expectedEmployees: 200, payFrequency: 'biweekly',
    }, session);
    assert.equal(t.status, 200);
    // The stored evidence is the server's quote, bound by id and clause hash.
    const acceptance = db().acceptances.at(-1);
    assert.equal(acceptance.quoteId, terms.quoteId);
    assert.match(acceptance.clausesSha256, /^[0-9a-f]{64}$/);
    assert.equal(acceptance.disclosed.estimatedAnnual, terms.estimate.total);
    const s = await post('/api/start-trial', {}, session);
    assert.equal(s.status, 402);
    assert.equal((await post('/api/issue-key', {}, session)).status, 402);
  });

  test('an unfinished, foreign or card-less checkout does not unlock a key', async () => {
    const open = await post('/api/billing/return', { sessionId: 'cs_open' }, session);
    assert.equal(open.status, 402);
    assert.equal((await open.json()).code, 'checkout_not_complete');
    const other = await post('/api/billing/return', { sessionId: 'cs_other' }, session);
    assert.equal(other.status, 403);
    const nopm = await post('/api/billing/return', { sessionId: 'cs_nopm' }, session);
    assert.equal(nopm.status, 402);
    assert.equal(db().paymentMethods[EMAIL], undefined);
    assert.equal((await post('/api/issue-key', {}, session)).status, 402);
  });

  test('a completed checkout records the card, starts the trial and allows a key', async () => {
    const r = await post('/api/billing/return', { sessionId: 'cs_ok' }, session);
    assert.equal(r.status, 200);
    const pm = db().paymentMethods[EMAIL];
    assert.equal(pm.processorRef, 'pm_card');
    assert.equal(pm.last4, '4242');
    assert.equal(db().subscriptions[EMAIL].status, 'trialing');

    const k = await post('/api/issue-key', {}, session);
    assert.equal(k.status, 200);
    key = (await k.json()).key;
    assert.match(key, /^sk_test_/);
  });

  test('every console example calculates with the new key', async () => {
    assert.ok(examples.length >= 8);
    for (const ex of examples) {
      const r = await fetch(`${BASE}/v1/paycheck`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(ex.request),
      });
      const body = await r.json();
      assert.equal(r.status, 200, `${ex.id}: ${JSON.stringify(body).slice(0, 300)}`);
      assert.equal(r.headers.get('omnia-mode'), 'test');
      assert.ok(body.result.netPay > 0, ex.id);
    }
  });

  test('GET /v1/me describes the key', async () => {
    const r = await fetch(`${BASE}/v1/me`, { headers: { Authorization: `Bearer ${key}` } });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.mode, 'test');
    assert.equal(j.callsToday, examples.length);
    assert.equal((await fetch(`${BASE}/v1/me`)).status, 401);
  });
});

describe('sign-in for returning customers', () => {
  test('an unknown email gets the same answer and no account', async () => {
    const r = await post('/api/signin', { email: 'nobody@nowhere.test' });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).ok, true);
    assert.equal(db().accounts['nobody@nowhere.test'], undefined);
  });

  test('a known email gets a new code that signs in', async () => {
    const before = db().accounts[EMAIL].sessionToken;
    assert.equal((await post('/api/signin', { email: EMAIL.toUpperCase() })).status, 200);
    const code = db().accounts[EMAIL].code;
    assert.match(code, /^\d{6}$/);
    const v = await post('/api/verify-email', { email: EMAIL, code });
    assert.equal(v.status, 200);
    const token = (await v.json()).sessionToken;
    assert.notEqual(token, before);
    const a = await fetch(`${BASE}/api/account`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal((await a.json()).stage, 'trialing');
  });

  test('wrong codes burn the code after a few tries', async () => {
    // Past the resend cooldown is not needed: the code from the last test
    // was used, so this request issues a fresh one.
    await post('/api/signin', { email: EMAIL });
    const code = db().accounts[EMAIL].code;
    const wrong = code === '000000' ? '111111' : '000000';
    let last: Response | undefined;
    for (let i = 0; i < 9; i++) last = await post('/api/verify-email', { email: EMAIL, code: wrong });
    assert.match((await last!.json()).error, /Too many wrong codes/);
    assert.equal((await post('/api/verify-email', { email: EMAIL, code })).status, 401);
  });

  test('the console and its examples are served', async () => {
    for (const path of ['/console', '/sandbox']) assert.equal((await fetch(BASE + path)).status, 200, path);
    assert.equal((await fetch(`${BASE}/sandbox-examples.json`)).status, 200);
  });
});

describe('signup pages: contrast, labels, and step chrome', () => {
  const html = (name: string) => readFileSync(join(REPO, 'site', name), 'utf8');

  test('each step shows Step N of 5, a real submit, and no legacy stylesheet', () => {
    const signup = html('signup.html');
    const verify = html('signup-verify.html');
    const business = html('signup-business.html');
    const payment = html('signup-payment.html');
    const key = html('signup-key.html');
    const css = readFileSync(join(REPO, 'site/assets/v5.css'), 'utf8');
    for (const file of [signup, verify, business, payment, key]) {
      assert.doesNotMatch(file, /assets\/site\.css/);
      assert.doesNotMatch(file, /tokens\.css/);
      assert.match(file, /class="stepper"/);
      assert.match(file, /aria-current="step"/);
      assert.match(file, /class="actions"/);
      assert.doesNotMatch(file, /to be announced/i);
      assert.doesNotMatch(file, /\bTBA\b/);
    }
    assert.match(signup, /Step 1 of 5[\s\S]*Account/);
    assert.match(verify, /Step 2 of 5[\s\S]*Verify email/);
    assert.match(business, /Step 3 of 5[\s\S]*Business/);
    assert.match(payment, /Step 4 of 5[\s\S]*Payment/);
    assert.match(key, /Step 5 of 5[\s\S]*API key/);
    assert.match(signup, />Create account</);
    assert.match(verify, />Verify email</);
    assert.match(business, />Continue to payment</);
    assert.match(payment, />Go to Stripe</);
    assert.match(key, />Go to dashboard</);
    assert.doesNotMatch(signup, /btn-back/);
    assert.match(verify, /id="back"[^>]*href="\/signup"/);
    assert.doesNotMatch(business, /btn-back/);
    assert.match(payment, /href="\/signup\/business"/);
    assert.doesNotMatch(key, /btn-back/);
    const submit = signup.match(/<button[^>]*id="submit"[^>]*>/)?.[0] ?? '';
    assert.match(submit, /type="submit"/);
    assert.doesNotMatch(submit, /\sdisabled\b/);
    for (const file of [signup, business]) {
      const agree = file.match(/<input[^>]*id="agree"[^>]*>/)?.[0] ?? '';
      assert.ok(agree);
      assert.doesNotMatch(agree, /\schecked(\s|=|>|$)/);
    }
    for (const label of ['Work email', 'Password', 'Your name', 'Business name', 'Phone']) {
      assert.match(signup, new RegExp(`<label[^>]*>${label}</label>`));
    }
    assert.match(business, /<label[^>]*>Business address<\/label>/);
    assert.match(business, /<label[^>]*>Signature<\/label>/);
    assert.match(verify, /<label[^>]*>Code<\/label>/);
    assert.match(signup, /Enter an email like name@company.com\./);
    assert.match(signup, /Use at least 12 characters\./);
    assert.match(signup, /Enter your business name\./);
    assert.match(signup, /Check the box to accept the Terms\./);
    assert.match(business, /Enter a street address\./);
    assert.match(business, /Type your full name to sign\./);
    assert.match(payment, /<form id="payForm"/);
    assert.match(payment, /id="start"[^>]*type="submit"|type="submit"[^>]*id="start"/);
    assert.doesNotMatch(payment, /id="start2"/);
    assert.match(css, /--danger:\s*#B3261E/);
    assert.match(css, /box-shadow:\s*0 0 0 3px rgba\(22,\s*24,\s*26,\s*\.18\)/);
    assert.match(css, /\.btn\.is-loading/);
    assert.match(css, /position:\s*fixed/);
  });

  test('rendered steps keep a visible border and an on-screen primary', { timeout: 180_000 }, async () => {
    let shots = join(tmpdir(), 'signup-shots');
    try {
      mkdirSync('/opt/cursor/artifacts/signup', { recursive: true });
      shots = '/opt/cursor/artifacts/signup';
    } catch { /* artifacts dir is not writable here */ }
    mkdirSync(shots, { recursive: true });
    const userDir = mkdtempSync(join(tmpdir(), 'signup-chrome-'));
    const chrome = spawn('google-chrome', [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--remote-debugging-port=0', `--user-data-dir=${userDir}`,
      '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    let started = false;
    const wsUrl = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('chrome did not start\n' + buf)), 20_000);
      const on = (chunk: Buffer) => {
        buf += chunk.toString();
        const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
        if (m) { started = true; clearTimeout(timer); resolve(m[1]); }
      };
      chrome.stderr.on('data', on);
      chrome.stdout.on('data', on);
      chrome.on('exit', (code) => { if (!started) { clearTimeout(timer); reject(new Error('chrome exit ' + code + '\n' + buf)); } });
    });
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve());
      ws.addEventListener('error', () => reject(new Error('devtools socket failed')));
    });
    let seq = 0;
    const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
    const listeners: Array<(msg: any) => void> = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id && pending.has(msg.id)) {
        const waiter = pending.get(msg.id)!;
        pending.delete(msg.id);
        if (msg.error) waiter.reject(new Error(JSON.stringify(msg.error)));
        else waiter.resolve(msg.result);
      } else listeners.forEach((fn) => fn(msg));
    });
    const send = (method: string, params: Record<string, unknown> = {}, sessionId?: string) => new Promise<any>((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
    const waitEvent = (method: string, sessionId: string) => new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout waiting for ' + method)), 15_000);
      const fn = (msg: any) => {
        if (msg.method === method && msg.sessionId === sessionId) {
          clearTimeout(timer);
          const i = listeners.indexOf(fn);
          if (i >= 0) listeners.splice(i, 1);
          resolve();
        }
      };
      listeners.push(fn);
    });
    try {
      const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
      await send('Page.enable', {}, sessionId);
      await send('Runtime.enable', {}, sessionId);
      const evaluate = async (expression: string) => {
        const out = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
        if (out.exceptionDetails) throw new Error(out.exceptionDetails.text || 'evaluate failed');
        return out.result?.value;
      };
      const setSize = (width: number, height: number) => send('Emulation.setDeviceMetricsOverride', {
        width, height, deviceScaleFactor: 1, mobile: width < 600,
      }, sessionId);
      const paint = () => new Promise((r) => setTimeout(r, 180));
      const shot = async (name: string) => {
        await paint();
        const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
        writeFileSync(join(shots, name + '.png'), Buffer.from(data, 'base64'));
      };
      const goto = async (url: string) => {
        const loaded = waitEvent('Page.loadEventFired', sessionId);
        await send('Page.navigate', { url }, sessionId);
        await loaded;
        await evaluate('document.fonts && document.fonts.ready');
      };
      const measureExpr = `(() => {
        const input = document.querySelector('.field input:not([type="checkbox"]), .codes input');
        const btn = document.querySelector('.actions .btn.block');
        const actions = document.querySelector('.actions');
        const ics = input ? getComputedStyle(input) : null;
        const bcs = getComputedStyle(btn);
        const r = btn.getBoundingClientRect();
        return {
          hasInput: !!input,
          borderTopColor: ics && ics.borderTopColor,
          borderTopWidth: ics && ics.borderTopWidth,
          inputBg: ics && ics.backgroundColor,
          inputColor: ics && ics.color,
          bg: bcs.backgroundColor,
          disabled: btn.disabled,
          text: (btn.innerText || '').replace(/\\s+/g, ' ').trim(),
          top: r.top, bottom: r.bottom, height: r.height,
          innerHeight: window.innerHeight, scrollY: window.scrollY,
          actionsPosition: actions ? getComputedStyle(actions).position : '',
          boxShadow: input ? getComputedStyle(input).boxShadow : '',
        };
      })()`;
      const expectVisible = async (step: string, opts: { input?: boolean; text: string }) => {
        for (const [w, h] of [[1440, 900], [390, 844]] as const) {
          await setSize(w, h);
          await evaluate('window.scrollTo(0,0)');
          const m = await evaluate(measureExpr);
          assert.equal(m.text, opts.text, step + ' label');
          assert.equal(m.disabled, false, step + ' primary stays enabled');
          assert.equal(m.bg, 'rgb(22, 24, 26)', step + ' primary');
          assert.equal(m.scrollY, 0, step);
          assert.ok(m.top >= 0 && m.bottom <= m.innerHeight + 0.5 && m.height >= 40, `${step} ${w}x${h} button ${m.top}-${m.bottom} of ${m.innerHeight}`);
          assert.equal(m.actionsPosition, w < 600 ? 'fixed' : 'static', step + ' actions');
          if (opts.input !== false) {
            assert.equal(m.hasInput, true, step);
            assert.equal(m.borderTopWidth, '1px', step);
            assert.equal(m.borderTopColor, 'rgb(107, 112, 118)', step + ' border');
            assert.equal(m.inputBg, 'rgb(255, 255, 255)', step + ' fill');
            assert.equal(m.inputColor, 'rgb(22, 24, 26)', step + ' text');
          }
        }
        await setSize(1440, 900);
      };
      const capture = async (name: string) => {
        await setSize(1440, 900);
        await evaluate('window.scrollTo(0,0)');
        await shot(name + '-desktop');
        await setSize(390, 844);
        await evaluate('window.scrollTo(0,0)');
        await shot(name + '-mobile');
        await setSize(1440, 900);
      };
      const waitPath = async (part: string) => {
        const start = Date.now();
        let href = '';
        while (Date.now() - start < 12_000) {
          href = await evaluate('location.pathname');
          if (String(href).includes(part)) return;
          await new Promise((r) => setTimeout(r, 100));
        }
        const note = await evaluate(`(document.getElementById('formError') || {}).textContent || ''`);
        throw new Error('stuck on ' + href + ' waiting for ' + part + (note ? ' (' + note + ')' : ''));
      };

      const email = 'flow@acmepayroll.test';
      await setSize(1440, 900);
      await goto(`${BASE}/signup`);
      await expectVisible('account', { text: 'Create account' });
      await capture('01-account-default');
      await evaluate(`document.getElementById('email').focus()`);
      await paint();
      const focused = await evaluate(measureExpr);
      assert.match(focused.boxShadow, /22,\s*24,\s*26/, 'focus ring');
      await capture('01-account-focus');
      await evaluate(`document.getElementById('submit').click()`);
      await paint();
      const emailErr = await evaluate(`document.getElementById('emailError').textContent`);
      assert.equal(emailErr, 'Enter an email like name@company.com.');
      assert.equal(await evaluate(`document.getElementById('email').getAttribute('aria-invalid')`), 'true');
      assert.equal(await evaluate(`document.getElementById('agree').checked`), false);
      const erred = await evaluate(measureExpr);
      assert.equal(erred.borderTopColor, 'rgb(179, 38, 30)', 'error border');
      assert.equal(erred.disabled, false);
      await capture('01-account-error');
      await evaluate(`(() => {
        const set = (id, value) => {
          const el = document.getElementById(id);
          el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
        };
        set('email', ${JSON.stringify(email)});
        set('password', 'correct-horse-battery');
        set('name', 'Jordan Casey');
        set('company', 'Acme Payroll');
        set('phone', '555-010-0199');
        const agree = document.getElementById('agree');
        agree.checked = true;
        agree.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      assert.equal(await evaluate(`document.getElementById('email').getAttribute('aria-invalid')`), null);
      await capture('01-account-filled');
      await send('Target.activateTarget', { targetId });
      await evaluate(`document.getElementById('phone').focus()`);
      const enter = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' };
      await send('Input.dispatchKeyEvent', { type: 'keyDown', ...enter }, sessionId);
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...enter }, sessionId);
      await waitPath('/signup/verify');

      await expectVisible('verify', { text: 'Verify email' });
      await capture('02-verify-default');
      await evaluate(`document.getElementById('c0').focus()`);
      await capture('02-verify-focus');
      await evaluate(`document.getElementById('submit').click()`);
      assert.equal(await evaluate(`document.getElementById('codeError').textContent`), 'Enter the 6-digit code.');
      await capture('02-verify-error');
      const code = db().accounts[email].code as string;
      assert.match(code, /^\d{6}$/);
      await evaluate(`(() => {
        const code = ${JSON.stringify(code)};
        document.querySelectorAll('.code').forEach((el, i) => { el.value = code[i]; el.classList.add('filled'); });
      })()`);
      await capture('02-verify-filled');
      await evaluate(`document.getElementById('form').requestSubmit()`);
      await waitPath('/signup/business');
      await evaluate(`new Promise((resolve) => {
        const t = setInterval(() => {
          const el = document.getElementById('termsDoc');
          if (el && !/Loading/.test(el.textContent)) { clearInterval(t); resolve(true); }
        }, 50);
      })`);

      await expectVisible('business', { text: 'Continue to payment' });
      assert.equal(await evaluate(`document.getElementById('agree').checked`), false);
      await capture('03-business-default');
      await evaluate(`document.getElementById('address').focus()`);
      await capture('03-business-focus');
      await evaluate(`document.getElementById('address').value = ''; document.getElementById('submit').click()`);
      assert.equal(await evaluate(`document.getElementById('addressError').textContent`), 'Enter a street address.');
      await capture('03-business-error');
      await evaluate(`(() => {
        const address = document.getElementById('address');
        address.value = '120 Main St, Columbus OH 43215';
        address.dispatchEvent(new Event('input', { bubbles: true }));
        const agree = document.getElementById('agree');
        agree.checked = true;
        agree.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      await capture('03-business-filled');
      await evaluate(`document.getElementById('form').requestSubmit()`);
      await waitPath('/signup/payment');

      await expectVisible('payment', { text: 'Go to Stripe', input: false });
      await capture('04-payment-default');
      await evaluate(`document.getElementById('start').focus()`);
      await capture('04-payment-focus');
      await capture('04-payment-filled');
      await evaluate(`document.getElementById('payForm').requestSubmit()`);
      const payMsg = await evaluate(`new Promise((resolve) => {
        const t = setInterval(() => {
          const fb = document.getElementById('fallback');
          const err = document.getElementById('payError');
          const text = (fb && !fb.hidden && fb.textContent) || (err && !err.hidden && err.textContent) || '';
          if (text) { clearInterval(t); resolve(text); }
        }, 50);
      })`);
      assert.ok(String(payMsg).length > 8, 'payment error is shown inline');
      assert.equal(await evaluate('location.pathname'), '/signup/payment');
      await capture('04-payment-error');

      await goto(`${BASE}/signup/key`);
      await expectVisible('key', { text: 'Go to dashboard', input: false });
      await capture('05-key-default');
      await evaluate(`document.getElementById('docs').focus()`);
      await capture('05-key-focus');
      assert.equal(await evaluate(`document.getElementById('missing').hidden`), false);
      await capture('05-key-error');
      await evaluate(`sessionStorage.setItem('omnia_session_key', JSON.stringify({ key: 'sk_test_4242424242424242' }))`);
      await goto(`${BASE}/signup/key`);
      await evaluate(`document.getElementById('reveal').click()`);
      assert.match(String(await evaluate(`document.getElementById('keyText').textContent`)), /sk_test_4242424242424242/);
      await capture('05-key-filled');
    } finally {
      try { ws.close(); } catch { /* socket already closed */ }
      chrome.kill('SIGKILL');
      await new Promise((resolve) => {
        if (chrome.exitCode !== null) resolve(undefined);
        else {
          chrome.once('exit', () => resolve(undefined));
          setTimeout(() => resolve(undefined), 2000);
        }
      });
      for (let i = 0; i < 5; i++) {
        try { rmSync(userDir, { recursive: true, force: true }); break; } catch { await new Promise((r) => setTimeout(r, 150)); }
      }
    }
  });
});

import { findChrome } from './helpers/chrome.ts';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdtempSync, rmSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculatePaycheck } from '../src/calculate.ts';
import {
  createModel, loadRequest, serialize, parseRate, stepForPath, WAGE_BASES,
} from '../site/assets/sandbox-form.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const freePort = () => new Promise<number>((resolve) => {
  const srv = createNetServer();
  srv.listen(0, '127.0.0.1', () => {
    const { port } = srv.address() as { port: number };
    srv.close(() => resolve(port));
  });
});

let PORT = 0;
let BASE = '';
let dir = '';
let child: ChildProcess;

const examples = JSON.parse(readFileSync(join(REPO, 'site/sandbox-examples.json'), 'utf8')).examples as Array<{ id: string; request: Record<string, unknown> }>;

before(async () => {
  PORT = await freePort();
  BASE = `http://127.0.0.1:${PORT}`;
  dir = mkdtempSync(join(tmpdir(), 'site-sandbox-v2-'));
  child = spawn('node', ['site/server.ts'], {
    cwd: REPO,
    env: { ...process.env, PORT: String(PORT), SITE_DB_DIR: dir, RATE_LIMIT_PER_MIN: '1000', TRUST_PROXY: '' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 200; i++) {
    try { if ((await fetch(`${BASE}/v1/health`)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('server did not become healthy in time');
});

after(() => {
  child?.kill();
  rmSync(dir, { recursive: true, force: true });
});

test('every example round-trips through the form', () => {
  for (const ex of examples) {
    const model = createModel();
    loadRequest(model, ex.request);
    assert.deepEqual(serialize(model), ex.request, ex.id);
  }
});

test('unsupported values are left off the request', () => {
  const model = createModel();
  loadRequest(model, examples[0].request);
  model.earnings.push({ code: 'TIPS', category: 'tips', amount: 500, overtime: false });
  model.employerExtra.futaRate = 0.006;
  model.employerExtra.futa = 0.006;
  const out = serialize(model) as { earnings: Array<{ category: string; code: string }>; employer?: Record<string, unknown>; grossPay?: unknown; federalW4: { allowances?: unknown } };
  assert.equal(out.earnings.some((e) => e.category === 'tips' || e.code === 'TIPS'), false);
  assert.equal(out.employer, undefined);
  assert.equal(out.grossPay, undefined);
  assert.equal(out.federalW4.allowances, undefined);
  assert.equal(Array.isArray(out.earnings), true);
});

test('a federal W-4 path lands on step 3', () => {
  assert.equal(stepForPath('federalW4.filingStatus'), 3);
  assert.equal(stepForPath('earnings[0].amount'), 5);
  assert.equal(stepForPath('ytd.socialSecurity'), 6);
  assert.equal(stepForPath('employer.stateUnemploymentRate.PA'), 7);
  assert.equal(stepForPath('residenceState.code'), 4);
  assert.equal(stepForPath('workState.certificate.workPSD'), 4);
  assert.equal(stepForPath('workState.certificate.daysWorkedInStateThisYear'), 2);
  assert.equal(stepForPath('checkDate'), 1);
});

test('wage bases match the federal files', () => {
  for (const year of [2025, 2026, 2027]) {
    const file = JSON.parse(readFileSync(join(REPO, 'data/federal', `${year}.json`), 'utf8'));
    assert.equal(WAGE_BASES[year].socialSecurity, file.socialSecurity.wageBase, String(year));
    assert.equal(WAGE_BASES[year].futa, file.futa.wageBase, String(year));
  }
});

test('rate text is read from the detail and never invented', () => {
  const cases: Array<[string, string]> = [
    ['annualised $80548.00 → adjusted $67648.00; bracket 12% over $44100.00; tentative/yr $5305.76 ÷ 26; less credits $76.92', '12% bracket'],
    ['$500.00 @ 22% flat supplemental rate', '22% flat'],
    ['$3790.00 @ 6.2%', '6.2%'],
    ['$3790.00 @ 1.45%, no wage cap', '1.45%'],
    ['wage base $7000.00 already met', '—'],
    ['$0 — reciprocity exemption: employee resides in NJ, which has an active reciprocal agreement with PA. Assumes the required reciprocity certificate is on file.', '—'],
    ['$3790.00 @ 0.07%, no wage cap', '0.07%'],
    ["$0.00 @ 3.650% — this employer's own assigned rate, capped at $10000.00/yr", '3.650%'],
    ['$3790.00 @ 3.43% (the nonresident rate is higher) — resident 0.00% (PSD 88000) vs. work-location nonresident 3.43% (PSD 510101, PHILADELPHIA CITY)', '3.43%'],
    ["$110.02 NJ tax withheld by the PA employer instead of PA tax, per PA's reciprocity swap mechanism — the employer has agreed not to withhold PA tax.", '—'],
  ];
  for (const [detail, rate] of cases) assert.equal(parseRate(detail), rate, detail.slice(0, 40));
});

test('the page offers test keys honestly: real engine, not billed only when the key says so, no fake data', () => {
  const html = readFileSync(join(REPO, 'site/sandbox.html'), 'utf8');
  const js = readFileSync(join(REPO, 'site/assets/sandbox.js'), 'utf8');
  const css = readFileSync(join(REPO, 'site/assets/sandbox.css'), 'utf8');
  const blob = (html + js + css).toLowerCase();
  assert.equal(blob.includes('test mode'), false, 'there is no mode switch on the page');
  assert.equal(blob.includes('sk_test'), false, 'no key literal on the page');
  for (const word of ['mock', 'canned', 'simulated', 'fake', 'sample data', 'dummy']) assert.equal(blob.includes(word), false, word);
  // "not billed" is only ever said about a run the server itself marked as made with a test key.
  const lines = js.split('\n').filter((l) => /not billed/i.test(l));
  assert.ok(lines.every((l) => /lastMode === 'test'/.test(l)), 'not billed must depend on the Omnia-Mode header');
  assert.equal(html.includes('tokens.css'), false);
  assert.equal(html.includes('site.css'), false);
});

test('every certificate key is named, and every option passes the engine', () => {
  const types = readFileSync(join(REPO, 'src/types.ts'), 'utf8');
  const body = types.slice(types.indexOf('export interface StateCertificate'), types.indexOf('export interface StateWithholding'));
  const named = new Set([...body.matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]));
  const reg = JSON.parse(readFileSync(join(REPO, 'site/assets/state-cert-fields.json'), 'utf8')) as Record<string, Array<{ key: string; options?: Array<{ value: unknown }> }>>;
  for (const [state, fields] of Object.entries(reg)) {
    for (const field of fields) {
      assert.equal(named.has(field.key), true, `${state}.${field.key} is not a StateCertificate property`);
      for (const option of field.options || []) {
        try {
          calculatePaycheck({
            checkDate: '2026-09-15',
            payFrequency: 'weekly',
            earnings: [{ code: 'REG', category: 'regular', amount: 100000 }],
            deductions: [],
            federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
            ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
            workState: { code: state, certificate: { [field.key]: option.value } },
          });
        } catch (err) {
          const message = (err as Error).message;
          assert.equal(/unrecognized/i.test(message), false, `${state} ${field.key}=${JSON.stringify(option.value)} ${message}`);
        }
      }
    }
  }
});

test('every step keeps a visible field border and a near-black primary', { timeout: 180_000, skip: findChrome() ? false : 'no Chrome/Chromium found (set CHROME_BIN)' }, async () => {
  let shots = join(tmpdir(), 'sandbox-shots');
  try {
    mkdirSync('/opt/cursor/artifacts/sandbox', { recursive: true });
    shots = '/opt/cursor/artifacts/sandbox';
  } catch { /* artifacts dir is not writable here */ }
  mkdirSync(shots, { recursive: true });
  const userDir = mkdtempSync(join(tmpdir(), 'sandbox-chrome-'));
  const chrome = spawn(findChrome()!, [
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
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  const listeners: Array<(msg: { method?: string; sessionId?: string; id?: number; result?: unknown; error?: unknown }) => void> = [];
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
    const fn = (msg: { method?: string; sessionId?: string }) => {
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
      if (out.exceptionDetails) throw new Error(out.exceptionDetails.text || JSON.stringify(out.exceptionDetails));
      return out.result?.value;
    };
    const setSize = (width: number, height: number) => send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: width < 600,
    }, sessionId);
    const paint = () => new Promise((r) => setTimeout(r, 200));
    const shot = async (name: string, full = false) => {
      await paint();
      const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full }, sessionId);
      writeFileSync(join(shots, name + '.png'), Buffer.from(data, 'base64'));
    };
    const loaded = waitEvent('Page.loadEventFired', sessionId);
    await send('Page.navigate', { url: `${BASE}/sandbox` }, sessionId);
    await loaded;
    await evaluate('document.fonts && document.fonts.ready');
    const ready = await evaluate(`new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        const api = window.OmniaSandbox;
        const req = api && api.serialize();
        if (req && req.workState && req.workState.certificate && req.workState.certificate.workPSD === '510101' && req.payFrequency === 'weekly') resolve(true);
        else if (Date.now() - start > 8000) resolve(false);
        else setTimeout(tick, 50);
      };
      tick();
    })`);
    assert.equal(ready, true, 'default example did not load');
    const fresh = await evaluate(`({
      step: OmniaSandbox.step(),
      visited: OmniaSandbox.visited(),
      future: document.querySelector('[data-step="2"]').disabled,
      text: document.body.innerText,
    })`);
    assert.equal(fresh.step, 1);
    assert.deepEqual(fresh.visited, [1]);
    assert.equal(fresh.future, true);
    assert.equal(/test mode/i.test(fresh.text), false);
    assert.equal(/not billed/i.test(fresh.text), false);
    assert.equal(/test key/i.test(fresh.text), false);

    const measureExpr = `(() => {
      const visible = (el) => {
        if (el.disabled || el.type === 'hidden') return false;
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden') return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const fields = [...document.querySelectorAll('input.inp, select.inp')].filter(visible);
      const ticks = [...document.querySelectorAll('input.tick, input.dot')].filter(visible);
      const input = fields[0] || ticks[0] || null;
      const btn = document.getElementById('primary') || document.getElementById('runAgain');
      const actions = document.querySelector('.actions');
      const ics = input ? getComputedStyle(input) : null;
      const bcs = getComputedStyle(btn);
      const r = btn.getBoundingClientRect();
      const bad = [...document.querySelectorAll('[data-unsupported]')].filter((el) => !el.disabled).map((el) => el.outerHTML.slice(0, 80));
      return {
        kind: input ? (input.classList.contains('inp') ? 'inp' : 'tick') : '',
        hasInput: !!input,
        borderTopColor: ics && ics.borderTopColor,
        borderTopWidth: ics && ics.borderTopWidth,
        bg: bcs.backgroundColor,
        disabled: btn.disabled,
        text: (btn.innerText || '').replace(/\\s+/g, ' ').trim(),
        top: r.top, bottom: r.bottom, height: r.height,
        innerHeight: window.innerHeight,
        actionsPosition: actions ? getComputedStyle(actions).position : '',
        unsupportedEnabled: bad,
      };
    })()`;
    const labels = [
      'Continue to work locations',
      'Continue to Federal W-4',
      'Continue to state & local',
      'Continue to earnings',
      'Continue to deductions & YTD',
      'Continue to employer',
      'Continue to review & run',
      'Run calculation',
    ];
    const names = ['01-employee', '02-locations', '03-w4', '04-state', '05-earnings', '06-deductions', '07-employer', '08-review'];
    for (let n = 1; n <= 8; n++) {
      await evaluate(`OmniaSandbox.go(${n})`);
      await paint();
      for (const [w, h] of [[1440, 900], [390, 844]] as const) {
        await setSize(w, h);
        await evaluate('window.scrollTo(0,0)');
        await paint();
        const m = await evaluate(measureExpr);
        assert.equal(m.text, labels[n - 1], `step ${n} label`);
        assert.equal(m.disabled, false, `step ${n} primary stays enabled`);
        assert.equal(m.bg, 'rgb(22, 24, 26)', `step ${n} primary`);
        assert.deepEqual(m.unsupportedEnabled, [], `step ${n} unsupported`);
        if (n !== 8) {
          assert.equal(m.hasInput, true, `step ${n} field`);
          assert.notEqual(m.borderTopColor, 'rgba(0, 0, 0, 0)', `step ${n} border`);
          if (m.kind === 'inp') {
            assert.equal(m.borderTopWidth, '1px', `step ${n} border width`);
            assert.equal(m.borderTopColor, 'rgb(107, 112, 118)', `step ${n} border color`);
          } else {
            assert.ok(m.borderTopWidth === '1px' || m.borderTopWidth === '6px', `step ${n} border width ${m.borderTopWidth}`);
            assert.ok(m.borderTopColor === 'rgb(107, 112, 118)' || m.borderTopColor === 'rgb(22, 24, 26)', `step ${n} border color ${m.borderTopColor}`);
          }
        }
        if (w < 600) {
          assert.equal(m.actionsPosition, 'fixed', `step ${n} actions`);
          assert.ok(m.top >= 0 && m.bottom <= m.innerHeight + 0.5 && m.height >= 40, `step ${n} ${w}x${h} button ${m.top}-${m.bottom} of ${m.innerHeight}`);
        }
        await shot(`${names[n - 1]}-${w === 1440 ? 'desktop' : 'mobile'}`);
      }
    }
    await evaluate(`OmniaSandbox.go(2)`);
    const split = await evaluate(`document.querySelector('[data-unsupported]').disabled && document.body.innerText.includes('Not supported yet') && document.body.innerText.includes('In progress')`);
    assert.equal(split, true);
    await evaluate(`OmniaSandbox.go(3)`);
    // The 2019-or-earlier form is supported now: its button works and brings its own field.
    assert.equal(await evaluate(`document.querySelector('[data-unsupported]') === null && !document.body.innerText.includes("aren't supported yet")`), true);
    assert.equal(await evaluate(`(document.querySelector('[data-action="w4form"][data-form="old"]').click(), document.body.innerText.includes('Allowances') && !!document.querySelector('[data-bind="str:legacyAllowances"]'))`), true);
    await evaluate(`document.querySelector('[data-action="w4form"][data-form="new"]').click()`);
    await evaluate(`OmniaSandbox.go(5); document.querySelector('[data-action="add-earn"]').click();`);
    assert.equal(await evaluate(`document.querySelector('#earnMenu [data-unsupported]').disabled`), true);
    await evaluate(`OmniaSandbox.go(7)`);
    assert.equal(await evaluate(`document.querySelector('[data-unsupported]').value === '0.6' && document.querySelector('[data-unsupported]').disabled`), true);

    await evaluate(`OmniaSandbox.showErrors([{ path: 'federalW4.filingStatus', message: 'Choose a filing status the engine knows.' }])`);
    const mapped = await evaluate(`({
      step: OmniaSandbox.step(),
      msg: (document.querySelector('[data-path="federalW4.filingStatus"] .msg') || {}).textContent || '',
      banner: (document.querySelector('.banner') || {}).textContent || '',
    })`);
    assert.equal(mapped.step, 3);
    assert.equal(mapped.msg, 'Choose a filing status the engine knows.');
    assert.match(mapped.banner, /1 fields need a fix/);

    const paNj = examples.find((ex) => ex.id === 'pa-nj-reciprocity')!.request;
    const result = calculatePaycheck(paNj as never);
    await setSize(1440, 900);
    await evaluate('OmniaSandbox.loadExample("pa-nj-reciprocity")');
    await evaluate('OmniaSandbox.showResult(' + JSON.stringify(result) + ')');
    await paint();
    const resultText = await evaluate('document.body.innerText');
    assert.match(resultText, /Philadelphia worker, lives in New Jersey/);
    assert.match(resultText, /Net pay/);
    await shot('09-results-desktop', true);
    await setSize(390, 844);
    await evaluate('window.scrollTo(0,0)');
    const again = await evaluate(measureExpr);
    assert.equal(again.text, 'Run again');
    assert.equal(again.bg, 'rgb(22, 24, 26)');
    assert.equal(again.disabled, false);
    assert.ok(again.top >= 0 && again.bottom <= again.innerHeight + 0.5, `results button ${again.top}-${again.bottom}`);
    await shot('09-results-mobile', true);
  } finally {
    try { ws.close(); } catch { /* already closed */ }
    chrome.kill();
    await new Promise((r) => setTimeout(r, 400));
    try { rmSync(userDir, { recursive: true, force: true }); } catch { /* chrome may still be releasing the profile */ }
  }
});

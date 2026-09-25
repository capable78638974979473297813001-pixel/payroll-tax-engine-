import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The public sandbox: free keys from POST /v1/sandbox-keys, GET /v1/me,
 * the per-key daily cap, and every example the API console ships
 * (site/sandbox-examples.json) run through the real endpoint.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4900 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}`;
const KEYS_PER_HOUR = 4;
const DAILY_CALLS = 12;

const examples: { id: string; title: string; request: unknown }[] =
  JSON.parse(readFileSync(join(REPO, 'site/sandbox-examples.json'), 'utf8')).examples;

let dir: string;
let child: ChildProcess;

async function waitForHealth(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${BASE}/v1/health`)).ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('server did not become healthy in time');
}

const newKey = () => fetch(`${BASE}/v1/sandbox-keys`, { method: 'POST' });
const calc = (key: string, body: unknown) =>
  fetch(`${BASE}/v1/paycheck`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const me = (key: string) => fetch(`${BASE}/v1/me`, { headers: { Authorization: `Bearer ${key}` } });

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'site-sandbox-'));
  child = spawn('node', ['site/server.ts'], {
    cwd: REPO,
    env: {
      ...process.env, PORT: String(PORT), SITE_DB_DIR: dir,
      SANDBOX_KEYS_PER_HOUR: String(KEYS_PER_HOUR), SANDBOX_DAILY_CALLS: String(DAILY_CALLS),
      RATE_LIMIT_PER_MIN: '1000', TRUST_PROXY: '',
    },
    stdio: 'ignore',
  });
  await waitForHealth();
});

after(() => {
  child?.kill('SIGKILL');
  rmSync(dir, { recursive: true, force: true });
});

describe('API sandbox', () => {
  let key = '';

  test('POST /v1/sandbox-keys issues a working test key with its limits', async () => {
    const r = await newKey();
    assert.equal(r.status, 201);
    const j = await r.json();
    assert.match(j.key, /^sk_test_[A-Za-z0-9_-]{20,}$/);
    assert.equal(j.mode, 'sandbox');
    assert.equal(j.limits.callsPerDay, DAILY_CALLS);
    assert.equal(j.limits.requestsPerMinute, 1000);
    const days = (new Date(j.expiresAt).getTime() - Date.now()) / 864e5;
    assert.ok(days > 6.9 && days <= 7, `expires in ${days} days`);
    key = j.key;
  });

  test('every console example calculates (200) with the sandbox key', async () => {
    assert.ok(examples.length >= 8);
    for (const ex of examples) {
      const r = await calc(key, ex.request);
      const body = await r.json();
      assert.equal(r.status, 200, `${ex.id}: ${JSON.stringify(body).slice(0, 300)}`);
      const j = body.result;
      assert.equal(r.headers.get('omnia-mode'), 'sandbox', ex.id);
      assert.ok(Number.isInteger(j.netPay) && j.netPay > 0, `${ex.id} net pay`);
      assert.ok(Array.isArray(j.taxes) && j.taxes.length > 0, `${ex.id} taxes`);
    }
  });

  test('GET /v1/me describes the key: sandbox, not billable, calls counted', async () => {
    const r = await me(key);
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.mode, 'sandbox');
    assert.equal(j.billable, false);
    assert.equal(j.expired, false);
    assert.equal(j.callsToday, examples.length);
    assert.equal(j.limits.callsPerDay, DAILY_CALLS);
    assert.equal(j.keyPrefix, key.slice(0, 14));
  });

  test('GET /v1/me rejects a missing or unknown key', async () => {
    assert.equal((await fetch(`${BASE}/v1/me`)).status, 401);
    assert.equal((await me('sk_test_not_a_real_key_000000')).status, 401);
  });

  test('a validation error is a 422 with field details, not counted against the cap', async () => {
    const r = await calc(key, { ...(examples[0].request as object), payFrequency: 'fortnightly-ish' });
    assert.equal(r.status, 422);
    const j = await r.json();
    assert.ok(Array.isArray(j.details) && j.details.length > 0);
    assert.equal((await (await me(key)).json()).callsToday, examples.length);
  });

  test('the daily cap stops a sandbox key with 429 sandbox_daily_limit', async () => {
    const left = DAILY_CALLS - examples.length;
    for (let i = 0; i < left; i++) assert.equal((await calc(key, examples[0].request)).status, 200);
    const r = await calc(key, examples[0].request);
    assert.equal(r.status, 429);
    assert.equal((await r.json()).code, 'sandbox_daily_limit');
  });

  test('key issuance is limited per client address', async () => {
    // One key was issued above; the rest of the hour's allowance, then 429.
    for (let i = 1; i < KEYS_PER_HOUR; i++) assert.equal((await newKey()).status, 201);
    const r = await newKey();
    assert.equal(r.status, 429);
    assert.ok(Number(r.headers.get('retry-after')) > 0);
    assert.equal((await r.json()).code, 'rate_limited');
  });

  test('the console page and its examples are served', async () => {
    for (const path of ['/sandbox', '/console']) {
      const r = await fetch(BASE + path);
      assert.equal(r.status, 200, path);
      assert.match(await r.text(), /<title>[^<]*Console|<title>[^<]*Sandbox/i, path);
    }
    const r = await fetch(`${BASE}/sandbox-examples.json`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type') ?? '', /application\/json/);
  });
});

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * End-to-end test of the live Omnia API surface: it boots site/server.ts
 * as a real child process against an isolated data dir with a seeded API
 * key, and drives HTTP requests through the whole path — auth, rate
 * limiting, validation, calculation, and metering.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLAINTEXT_KEY = 'sk_test_e2e_integration_key_abcdef';
const KEY_HASH = createHash('sha256').update(PLAINTEXT_KEY).digest('hex');
const PORT = 4600 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}`;
const RATE_LIMIT = 5;

let dir: string;
let child: ChildProcess;

function seedDb(dataDir: string): void {
  mkdirSync(dataDir, { recursive: true });
  const future = new Date(Date.now() + 7 * 864e5).toISOString();
  const db = {
    accounts: {}, acceptances: [], paymentMethods: {}, subscriptions: {},
    keys: {
      [KEY_HASH]: {
        keyHash: KEY_HASH, keyPrefix: PLAINTEXT_KEY.slice(0, 14),
        ownerEmail: 'e2e@example.com', ownerName: 'E2E', company: 'E2E Co',
        plan: 'evaluation', createdAt: new Date().toISOString(), expiresAt: future,
        isActive: true, lastUsedAt: null,
      },
    },
    usage: [], estimates: [],
  };
  writeFileSync(join(dataDir, 'db.json'), JSON.stringify(db), 'utf8');
}

async function waitForHealth(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('server did not become healthy in time');
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${BASE}/api/paycheck`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PLAINTEXT_KEY}`, 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const validBody = () => ({
  checkDate: '2026-06-15',
  payFrequency: 'biweekly',
  earnings: [{ code: 'REG', category: 'regular', amount: 300000 }],
  deductions: [],
  federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
  ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
  workState: { code: 'OH' },
});

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'site-api-'));
  seedDb(dir);
  child = spawn('node', ['site/server.ts'], {
    cwd: REPO,
    env: { ...process.env, PORT: String(PORT), SITE_DB_DIR: dir, RATE_LIMIT_PER_MIN: String(RATE_LIMIT) },
    stdio: 'ignore',
  });
  await waitForHealth();
});

after(() => {
  child?.kill('SIGKILL');
  rmSync(dir, { recursive: true, force: true });
});

describe('Omnia API (end to end)', () => {
  test('GET /api/health reports ok, a version, and jurisdiction count', async () => {
    const r = await fetch(`${BASE}/api/health`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('x-omnia-version'), '1.0.0');
    const j = await r.json();
    assert.equal(j.status, 'ok');
    assert.ok(j.states > 0);
  });

  test('a missing key is 401 missing_key', async () => {
    const r = await fetch(`${BASE}/api/paycheck`, { method: 'POST', body: '{}' });
    assert.equal(r.status, 401);
    assert.equal((await r.json()).code, 'missing_key');
  });

  test('an unknown key is 401 invalid_key', async () => {
    const r = await post(validBody(), { Authorization: 'Bearer sk_test_not_a_real_key' });
    assert.equal(r.status, 401);
    assert.equal((await r.json()).code, 'invalid_key');
  });

  test('malformed JSON is 400 invalid_json', async () => {
    const r = await post('{ not json ');
    assert.equal(r.status, 400);
    assert.equal((await r.json()).code, 'invalid_json');
  });

  test('a request that fails validation is 422 invalid_input with field details', async () => {
    const r = await post({});
    assert.equal(r.status, 422);
    const j = await r.json();
    assert.equal(j.code, 'invalid_input');
    assert.ok(Array.isArray(j.details) && j.details.length > 0);
    assert.ok(j.requestId.startsWith('req_'));
  });

  test('an unknown state is caught as a validation error, not an engine crash', async () => {
    const body = validBody();
    body.workState = { code: 'ZZ' };
    const r = await post(body);
    assert.equal(r.status, 422);
    const j = await r.json();
    assert.equal(j.code, 'invalid_input');
    assert.ok(j.details.some((d: { path: string }) => d.path === 'workState.code'));
  });

  test('a valid request returns 200 with a real result and rate-limit headers', async () => {
    const r = await post(validBody());
    assert.equal(r.status, 200);
    assert.ok(r.headers.get('ratelimit-limit'));
    assert.ok(r.headers.get('x-request-id'));
    const j = await r.json();
    assert.equal(typeof j.result.netPay, 'number');
    assert.equal(j.result.grossPay, 300000);
    assert.ok(j.result.taxes.length > 0);
  });

  test('GET /api/states returns the computable jurisdictions', async () => {
    const r = await fetch(`${BASE}/api/states`);
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.ok(Array.isArray(j.states) && j.states.length > 0);
    assert.ok(j.states.every((s: { code: string; name: string }) => s.code && s.name));
  });

  test('the per-key rate limit eventually returns 429 with Retry-After', async () => {
    let saw429 = false;
    let retryAfter = '';
    for (let i = 0; i < RATE_LIMIT + 8; i++) {
      const r = await post(validBody());
      if (r.status === 429) {
        saw429 = true;
        retryAfter = r.headers.get('retry-after') ?? '';
        assert.equal((await r.json()).code, 'rate_limited');
        break;
      }
      await r.arrayBuffer(); // drain
    }
    assert.equal(saw429, true, 'expected a 429 once the per-minute budget was spent');
    assert.ok(Number(retryAfter) > 0);
  });
});

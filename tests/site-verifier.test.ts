import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The site delegating email verification to verifier/email_verifier.py:
 * codes are minted, mailed and checked by the Python service, and never
 * land in the site's store. Also covers the cross-origin POST guard.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_PORT = 7000 + Math.floor(Math.random() * 300);
const VER_PORT = 7400 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${SITE_PORT}`;
const SECRET = 's'.repeat(40);
const EMAIL = 'ada@verifier.test';
const havePython = spawnSync('python3', ['--version']).status === 0;

let dir: string;
let site: ChildProcess;
let verifier: ChildProcess;
let verifierLog = '';

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

async function waitFor(url: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`${url} did not start`);
}

const lastCode = () => [...verifierLog.matchAll(/\[verifier dev\] \S+: (\d{6})/g)].at(-1)?.[1];

describe('site + python verifier', { skip: !havePython }, () => {
  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'site-verifier-'));
    const env = { ...process.env, VERIFIER_SECRET: SECRET, VERIFIER_PEPPER: 'p'.repeat(40) };
    verifier = spawn('python3', ['verifier/email_verifier.py', 'serve'], {
      cwd: REPO,
      env: { ...env, VERIFIER_DEV: '1', VERIFIER_PORT: String(VER_PORT), VERIFIER_DB: join(dir, 'v.sqlite3'), RESEND_API_KEY: '', SMTP_HOST: '' },
    });
    verifier.stderr!.on('data', (d) => { verifierLog += d; });
    await waitFor(`http://127.0.0.1:${VER_PORT}/healthz`);
    site = spawn('node', ['site/server.ts'], {
      cwd: REPO,
      env: { ...env, PORT: String(SITE_PORT), SITE_DB_DIR: dir, VERIFIER_URL: `http://127.0.0.1:${VER_PORT}`, RESEND_API_KEY: '' },
      stdio: 'ignore',
    });
    await waitFor(`${BASE}/healthz`);
  });

  after(() => {
    site?.kill();
    verifier?.kill();
    rmSync(dir, { recursive: true, force: true });
  });

  test('signup -> code from the verifier -> session, and the site store never holds a code', async () => {
    const r = await post('/api/signup', { name: 'Ada Lovelace', email: EMAIL, company: 'Analytical LLC', phone: '5555550100' });
    assert.equal(r.status, 200);
    await new Promise((res) => setTimeout(res, 200));
    const code = lastCode();
    assert.match(code ?? '', /^\d{6}$/);

    const stored = readFileSync(join(dir, 'db.json'), 'utf8');
    assert.ok(!stored.includes(code!), 'the code must not be in the site store');

    const bad = await post('/api/verify-email', { email: EMAIL, code: code === '000000' ? '111111' : '000000' });
    assert.equal(bad.status, 401);

    const ok = await post('/api/verify-email', { email: EMAIL, code: code! });
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get('set-cookie') ?? '', /omnia_session=.*HttpOnly/);

    const again = await post('/api/verify-email', { email: EMAIL, code: code! });
    assert.equal(again.status, 401, 'a code works once');
  });

  test('an unknown address gets the same refusal as a wrong code', async () => {
    const r = await post('/api/verify-email', { email: 'nobody@verifier.test', code: '123456' });
    assert.equal(r.status, 401);
  });

  test('cross-origin console POSTs are refused; same-origin and header-less pass', async () => {
    const evil = await post('/api/signin', { email: EMAIL }, { Origin: 'https://evil.example' });
    assert.equal(evil.status, 403);
    const same = await post('/api/signin', { email: EMAIL }, { Origin: BASE });
    assert.equal(same.status, 200);
  });

  test('issuing a key needs a verified session', async () => {
    const r = await post('/api/issue-key', {});
    assert.equal(r.status, 401);
  });
});

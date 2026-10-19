import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** POST /api/contact: mail to the owner through Resend, 501 when no provider, honeypot, validation, rate limit. */
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const spawnServer = (port: number, env: Record<string, string>, dir: string) =>
  spawn('node', ['site/server.ts'], { cwd: REPO, env: { ...process.env, PORT: String(port), SITE_DB_DIR: dir, RATE_LIMIT_PER_MIN: '1000', TRUST_PROXY: '', ...env }, stdio: 'ignore' });

const sent: Array<Record<string, any>> = [];
let fake: Server;
let withMail: ChildProcess;
let without: ChildProcess;
let dirA: string;
let dirB: string;
const PORT_A = 6400 + Math.floor(Math.random() * 150);
const PORT_B = PORT_A + 150;

const post = (port: number, body: unknown) =>
  fetch(`http://127.0.0.1:${port}/api/contact`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const ready = async (port: number) => {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/v1/health`)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('server did not start');
};

before(async () => {
  dirA = mkdtempSync(join(tmpdir(), 'contact-a-'));
  dirB = mkdtempSync(join(tmpdir(), 'contact-b-'));
  fake = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => { sent.push(JSON.parse(raw)); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"id":"e1"}'); });
  });
  await new Promise<void>((r) => fake.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(fake.address() as { port: number }).port}`;
  withMail = spawnServer(PORT_A, { RESEND_API_KEY: 're_test', RESEND_API_BASE: base, CONTACT_TO: 'owner@omnia.test' }, dirA);
  without = spawnServer(PORT_B, { RESEND_API_KEY: '' }, dirB);
  await Promise.all([ready(PORT_A), ready(PORT_B)]);
});

after(() => {
  withMail?.kill('SIGKILL');
  without?.kill('SIGKILL');
  fake?.close();
  rmSync(dirA, { recursive: true, force: true });
  rmSync(dirB, { recursive: true, force: true });
});

test('a message is emailed to the owner with the sender as Reply-To', async () => {
  const r = await post(PORT_A, { name: 'Pat Lee', email: 'Pat@Example.test', company: 'Acme', message: 'Do you cover Wilmington?' });
  assert.equal(r.status, 200);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].to, ['owner@omnia.test']);
  assert.equal(sent[0].reply_to, 'pat@example.test');
  assert.match(sent[0].text, /Pat Lee <pat@example.test>/);
  assert.match(sent[0].text, /Do you cover Wilmington\?/);
});

test('a filled honeypot looks like success and sends nothing', async () => {
  const before = sent.length;
  const r = await post(PORT_A, { name: 'Bot', email: 'bot@example.test', message: 'buy now please', website: 'http://spam.test' });
  assert.equal(r.status, 200);
  assert.equal(sent.length, before);
});

test('missing or invalid fields are refused', async () => {
  for (const bad of [{}, { name: 'A', email: 'nope', message: 'hello there' }, { name: 'A', email: 'a@b.test', message: 'hi' }]) {
    const r = await post(PORT_A, bad);
    assert.equal(r.status, 400);
    assert.equal((await r.json()).code, 'invalid_input');
  }
});

test('without an email provider the form says so (501) so the page can fall back to mailto', async () => {
  const r = await post(PORT_B, { name: 'Pat Lee', email: 'pat@example.test', message: 'Hello there' });
  assert.equal(r.status, 501);
  assert.equal((await r.json()).code, 'email_not_configured');
});

test('one network cannot send more than five an hour', async () => {
  let last = 200;
  for (let i = 0; i < 8; i++) last = (await post(PORT_A, { name: 'Pat', email: 'pat@example.test', message: `Message number ${i}` })).status;
  assert.equal(last, 429);
});

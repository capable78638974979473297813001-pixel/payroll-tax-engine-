import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { scanRepo, listJsonFiles } from '../harvester/collect.ts';
import { probe } from '../harvester/probe.ts';
import { classify, fold, type BaselineEntry } from '../harvester/baseline.ts';
import type { Signal } from '../harvester/probe.ts';

// A throwaway data tree so the collector test never depends on real repo data.
function fixtureTree(): string {
  const dir = mkdtempSync(join(tmpdir(), 'harvest-'));
  mkdirSync(join(dir, 'states'), { recursive: true });
  writeFileSync(join(dir, 'federal.json'), JSON.stringify({
    year: 2026,
    asOf: '2026-08-11',
    sources: [
      { title: 'IRS Pub 15-T', url: 'https://www.irs.gov/pub/irs-pdf/p15t.pdf' },
      { title: 'SSA COLA', url: 'https://www.ssa.gov/oact/cola/cbb.html' },
    ],
  }));
  writeFileSync(join(dir, 'states', 'OH.json'), JSON.stringify({
    code: 'OH', year: 2026,
    sources: [{ title: 'OH WHT', url: 'https://tax.ohio.gov/wht.pdf' }],
    // Same URL cited again from a different file to prove dedupe+citedBy.
    also: { url: 'https://www.irs.gov/pub/irs-pdf/p15t.pdf' },
  }));
  writeFileSync(join(dir, 'broken.json'), '{ not valid json ');
  return dir;
}

test('collect: finds every cited URL, dedupes, and records who cites it', () => {
  const dir = fixtureTree();
  try {
    const scan = scanRepo(dir);
    const urls = scan.sources.map((s) => s.url);
    assert.ok(urls.includes('https://www.irs.gov/pub/irs-pdf/p15t.pdf'));
    assert.ok(urls.includes('https://www.ssa.gov/oact/cola/cbb.html'));
    assert.ok(urls.includes('https://tax.ohio.gov/wht.pdf'));
    // p15t is cited by two files → deduped to one source with two citedBy paths.
    const p15t = scan.sources.find((s) => s.url.endsWith('p15t.pdf'))!;
    assert.equal(p15t.citedBy.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collect: a malformed data file is reported, not thrown', () => {
  const dir = fixtureTree();
  try {
    const scan = scanRepo(dir);
    const broken = scan.files.find((f) => f.path.endsWith('broken.json'))!;
    assert.equal(broken.ok, false);
    assert.match(broken.parseError ?? '', /JSON|token|Unexpected/i);
    // The good files still scanned fine.
    assert.ok(scan.files.some((f) => f.ok && f.year === 2026));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('listJsonFiles: missing directory returns [] (never throws)', () => {
  assert.deepEqual(listJsonFiles('/no/such/dir/anywhere'), []);
});

test('classify: hash decides changed vs unchanged', () => {
  const prev: BaselineEntry = { hash: 'aaa', firstSeen: 'x', lastSeen: 'x', lastChanged: 'x' };
  const same: Signal = { url: 'u', ok: true, status: 200, hash: 'aaa' };
  const diff: Signal = { url: 'u', ok: true, status: 200, hash: 'bbb' };
  assert.equal(classify(prev, same), 'unchanged');
  assert.equal(classify(prev, diff), 'changed');
});

test('classify: no prior baseline is "new"; unreachable is never a change', () => {
  const cur: Signal = { url: 'u', ok: true, status: 200, hash: 'aaa' };
  assert.equal(classify(undefined, cur), 'new');
  const down: Signal = { url: 'u', ok: false, error: 'timeout' };
  const prev: BaselineEntry = { hash: 'aaa', firstSeen: 'x', lastSeen: 'x', lastChanged: 'x' };
  assert.equal(classify(prev, down), 'unreachable');
});

test('classify: falls back to etag, then last-modified, then status', () => {
  const prev: BaselineEntry = { etag: 'W/"1"', lastModified: 'Mon', status: 200, firstSeen: 'x', lastSeen: 'x', lastChanged: 'x' };
  assert.equal(classify(prev, { url: 'u', ok: true, etag: 'W/"1"' }), 'unchanged');
  assert.equal(classify(prev, { url: 'u', ok: true, etag: 'W/"2"' }), 'changed');
  assert.equal(classify({ lastModified: 'Mon', firstSeen: 'x', lastSeen: 'x', lastChanged: 'x' }, { url: 'u', ok: true, lastModified: 'Tue' }), 'changed');
});

test('fold: unreachable keeps the last known-good signal intact', () => {
  const prev: BaselineEntry = { hash: 'good', firstSeen: 'd0', lastSeen: 'd0', lastChanged: 'd0' };
  const down: Signal = { url: 'u', ok: false, error: 'timeout' };
  const folded = fold(prev, down, 'd1', 'unreachable');
  assert.equal(folded.hash, 'good'); // not clobbered by the failed probe
});

test('fold: a change bumps lastChanged but keeps firstSeen', () => {
  const prev: BaselineEntry = { hash: 'a', firstSeen: 'd0', lastSeen: 'd0', lastChanged: 'd0' };
  const cur: Signal = { url: 'u', ok: true, status: 200, hash: 'b' };
  const folded = fold(prev, cur, 'd5', 'changed');
  assert.equal(folded.firstSeen, 'd0');
  assert.equal(folded.lastChanged, 'd5');
  assert.equal(folded.hash, 'b');
});

test('probe: a throwing fetch becomes ok=false, never rejects', async () => {
  const boom: typeof fetch = () => Promise.reject(new Error('network down'));
  const sig = await probe('https://example.gov/x', { fetchImpl: boom, retries: 0, timeoutMs: 100 });
  assert.equal(sig.ok, false);
  assert.match(sig.error ?? '', /network down/);
});

test('probe: a 200 response is hashed into a stable signal', async () => {
  const body = new TextEncoder().encode('hello withholding tables');
  const fake: typeof fetch = () => Promise.resolve(new Response(body, { status: 200, headers: { etag: 'W/"abc"' } }));
  const a = await probe('https://example.gov/x', { fetchImpl: fake, retries: 0 });
  const b = await probe('https://example.gov/x', { fetchImpl: fake, retries: 0 });
  assert.equal(a.ok, true);
  assert.equal(a.status, 200);
  assert.equal(a.etag, 'W/"abc"');
  assert.ok(a.hash && a.hash.length === 64);
  assert.equal(a.hash, b.hash); // deterministic
});

test('probe: retries then succeeds', async () => {
  let calls = 0;
  const flaky: typeof fetch = () => {
    calls++;
    if (calls < 2) return Promise.reject(new Error('reset'));
    return Promise.resolve(new Response('ok', { status: 200 }));
  };
  const sig = await probe('https://example.gov/x', { fetchImpl: flaky, retries: 2, timeoutMs: 200 });
  assert.equal(sig.ok, true);
  assert.equal(calls, 2);
});

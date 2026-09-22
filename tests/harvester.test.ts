import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { scanRepo, listJsonFiles } from '../harvester/collect.ts';
import { probe, normalizeHtml } from '../harvester/probe.ts';
import { classify, confirmedChange, fold, type BaselineEntry } from '../harvester/baseline.ts';
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

test('probe: presents a real Chrome user-agent so sources do not 403-block it', async () => {
  let seen: Record<string, string> = {};
  const capture: typeof fetch = (_url, init) => {
    seen = (init?.headers ?? {}) as Record<string, string>;
    return Promise.resolve(new Response('ok', { status: 200 }));
  };
  await probe('https://www.ssa.gov/oact/cola/cbb.html', { fetchImpl: capture, retries: 0 });
  assert.match(seen['user-agent'] ?? '', /Chrome\/\d+/);
  assert.equal(seen['sec-fetch-mode'], 'navigate');
});

test('probe: a 403 block is reported with its status, not a bare failure', async () => {
  const blocked: typeof fetch = () => Promise.resolve(new Response('forbidden', { status: 403 }));
  const sig = await probe('https://www.ssa.gov/x', { fetchImpl: blocked, retries: 1, timeoutMs: 200 });
  assert.equal(sig.ok, false);
  assert.equal(sig.status, 403);
  assert.equal(sig.error, 'HTTP 403');
});

test('normalizeHtml: two fetches that differ only in volatile tokens hash equal', () => {
  const page = (rayId: string, viewState: string, ts: string) => `
    <html><head>
      <meta name="csrf-token" content="${rayId}xxxxxxxxxxxxxxxxxxxx">
      <script nonce="${rayId}">window.__CF$cv$params={r:'${rayId}',t:'${ts}'};</script>
      <style>.a{color:#${rayId.slice(0, 6)}}</style>
    </head><body>
      <form><input type="hidden" name="__VIEWSTATE" value="${viewState}"></form>
      <h1>Wisconsin UI Tax Rates 2026</h1>
      <p>The taxable wage base is $14,000. Rendered ${ts}.</p>
      <!-- build ${rayId} -->
    </body></html>`;
  const a = normalizeHtml(page('a3f3f9b3fb482311', 'AAAA1111BBBB2222CCCC3333DDDD4444EEEE5555', '2026-09-22T20:14:00Z'));
  const b = normalizeHtml(page('a3f3f9b4abdf2311', 'ZZZZ9999YYYY8888XXXX7777WWWW6666VVVV5555', '2026-09-22T20:21:47Z'));
  assert.equal(a, b); // only the substantive text survives, and it's identical
  assert.match(a, /Wisconsin UI Tax Rates 2026/);
  assert.match(a, /taxable wage base is \$14,000/);
});

test('normalizeHtml: a real content change still shows up', () => {
  const base = '<html><body><h1>Rate</h1><p>The rate is 4.25%.</p></body></html>';
  const changed = '<html><body><h1>Rate</h1><p>The rate is 3.99%.</p></body></html>';
  assert.notEqual(normalizeHtml(base), normalizeHtml(changed));
});

test('classify: first capture after being blocked is "new", not "changed"', () => {
  // prev = we only ever saw a 403 (a status, no content); now we get real content.
  const wasBlocked = { status: 403, firstSeen: 'x', lastSeen: 'x', lastChanged: 'x' };
  const nowOk = { url: 'u', ok: true, status: 200, hash: 'abc' } as const;
  assert.equal(classify(wasBlocked, nowOk), 'new');
});

test('classify: the normalized hash wins over a rotating ETag/Last-Modified', () => {
  // Server sends a per-request (weak) ETag and Last-Modified, but the
  // normalized visible-text hash is identical → this is NOT a change.
  const prev = { etag: 'W/"r1"', lastModified: 'Mon, 01 Sep 2026 10:00:00 GMT', hash: 'samehash', firstSeen: 'x', lastSeen: 'x', lastChanged: 'x' };
  const cur = { url: 'u', ok: true, status: 200, etag: 'W/"r2"', lastModified: 'Mon, 01 Sep 2026 10:05:11 GMT', hash: 'samehash' } as const;
  assert.equal(classify(prev, cur), 'unchanged');
  // And a real content change (hash differs) still flags, rotating validator or not.
  const changed = { url: 'u', ok: true, status: 200, etag: 'W/"r3"', hash: 'differenthash' } as const;
  assert.equal(classify(prev, changed), 'changed');
});

test('confirmedChange: two agreeing fetches = a real (stable) change', () => {
  const first = { url: 'u', ok: true, status: 200, hash: 'newstable' } as const;
  const second = { url: 'u', ok: true, status: 200, hash: 'newstable' } as const;
  assert.equal(confirmedChange(first, second), true);
});

test('confirmedChange: two disagreeing fetches = volatile (noise), not a change', () => {
  const first = { url: 'u', ok: true, status: 200, hash: 'churn-a' } as const;
  const second = { url: 'u', ok: true, status: 200, hash: 'churn-b' } as const;
  assert.equal(confirmedChange(first, second), false);
});

test('confirmedChange: an inconclusive confirm (unreachable / no hash) keeps the change', () => {
  const first = { url: 'u', ok: true, status: 200, hash: 'x' } as const;
  assert.equal(confirmedChange(first, { url: 'u', ok: false, error: 'timeout' }), true);
  assert.equal(confirmedChange(first, { url: 'u', ok: true, status: 200, hash: null }), true);
});

test('fold: a volatile verdict does NOT advance lastChanged and marks the entry', () => {
  const prev: BaselineEntry = { hash: 'a', firstSeen: 'd0', lastSeen: 'd0', lastChanged: 'd0' };
  const cur = { url: 'u', ok: true, status: 200, hash: 'b' } as const;
  const folded = fold(prev, cur, 'd9', 'volatile');
  assert.equal(folded.lastChanged, 'd0'); // not bumped — churn isn't a real edit
  assert.equal(folded.volatile, true);
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

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * What a search crawler experiences: robots.txt lets it fetch everything it
 * needs to index and render the public pages, every sitemap URL is a clean
 * 200, nothing indexable is blocked or marked noindex, and nothing it must not
 * index is hidden behind robots.txt where it could never see the noindex.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const ORIGIN = 'https://omniatax.io';

let base = '';
let dir = '';
let child: ChildProcess;

const freePort = () => new Promise<number>((resolve) => {
  const srv = createServer();
  srv.listen(0, '127.0.0.1', () => { const { port } = srv.address() as { port: number }; srv.close(() => resolve(port)); });
});

before(async () => {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  dir = mkdtempSync(join(tmpdir(), 'crawl-'));
  child = spawn('node', ['site/server.ts'], {
    cwd: REPO,
    env: { ...process.env, PORT: String(port), SITE_DB_DIR: dir, PUBLIC_BASE_URL: ORIGIN, RESEND_API_KEY: '', STRIPE_SECRET_KEY: '', TRUST_PROXY: '' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) return; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('server did not start');
});
after(() => { child?.kill('SIGKILL'); if (dir) rmSync(dir, { recursive: true, force: true }); });

const get = (path: string, init: RequestInit = {}) =>
  fetch(base + path, { redirect: 'manual', ...init, headers: { 'User-Agent': GOOGLEBOT, ...(init.headers ?? {}) } });

/** Google's rule: the longest matching Allow/Disallow wins, Allow on a tie. */
function robotsAllows(robots: string, path: string): boolean {
  let applies = false;
  const rules: Array<{ allow: boolean; pattern: string }> = [];
  for (const raw of robots.split('\n')) {
    const line = raw.split('#')[0]!.trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    if (key === 'user-agent') applies = m[2]!.trim() === '*';
    else if (applies && (key === 'allow' || key === 'disallow') && m[2]!.trim()) rules.push({ allow: key === 'allow', pattern: m[2]!.trim() });
  }
  let best: { allow: boolean; len: number } | null = null;
  for (const r of rules) {
    if (!path.startsWith(r.pattern)) continue;
    if (!best || r.pattern.length > best.len || (r.pattern.length === best.len && r.allow)) best = { allow: r.allow, len: r.pattern.length };
  }
  return best ? best.allow : true;
}

async function sitemapPaths(): Promise<string[]> {
  const xml = await (await get('/sitemap.xml')).text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!.replace(ORIGIN, '') || '/');
}

describe('robots.txt', () => {
  test('is served, points at the sitemap, and does not block the site', async () => {
    const r = await get('/robots.txt');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type') ?? '', /text\/plain/);
    const text = await r.text();
    assert.match(text, new RegExp(`Sitemap: ${ORIGIN}/sitemap\\.xml`));
    assert.equal(robotsAllows(text, '/'), true);
    assert.doesNotMatch(text, /^Disallow:\s*\/\s*$/m);
  });

  test('the JSON API is blocked, except the read-only endpoints public pages draw themselves from', async () => {
    const text = await (await get('/robots.txt')).text();
    assert.equal(robotsAllows(text, '/api/paycheck'), false);
    assert.equal(robotsAllows(text, '/v1/paycheck'), false);
    assert.equal(robotsAllows(text, '/api/coverage'), true);
    assert.equal(robotsAllows(text, '/api/coverage/local?state=OR'), true);
    assert.equal(robotsAllows(text, '/v1/health'), true);
  });
});

describe('every sitemap URL', () => {
  test('is a clean 200 a crawler may fetch, indexable, canonical to itself, with a title, description and one h1', async () => {
    const robots = await (await get('/robots.txt')).text();
    const paths = await sitemapPaths();
    assert.ok(paths.length >= 50, `only ${paths.length} URLs in the sitemap`);
    const problems: string[] = [];
    for (const p of paths) {
      if (!robotsAllows(robots, p)) problems.push(`${p}: blocked by robots.txt`);
      const r = await get(p);
      if (r.status !== 200) { problems.push(`${p}: HTTP ${r.status}`); continue; }
      if (/noindex/i.test(r.headers.get('x-robots-tag') ?? '')) problems.push(`${p}: X-Robots-Tag noindex`);
      const html = await r.text();
      if (/<meta name="robots" content="[^"]*noindex/i.test(html)) problems.push(`${p}: meta noindex`);
      const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
      const want = ORIGIN + (p === '/' ? '/' : p);
      if (canonical !== want) problems.push(`${p}: canonical is ${canonical}`);
      if (!/<title>[^<]{10,}/.test(html)) problems.push(`${p}: no real title`);
      if (!/<meta name="description" content="[^"]{40,}/.test(html)) problems.push(`${p}: no real description`);
      if ((html.match(/<h1[\s>]/g) ?? []).length !== 1) problems.push(`${p}: needs exactly one h1`);
    }
    assert.deepEqual(problems, []);
  });

  test('the CSS and scripts those pages load are allowed and load, so Google can render them', async () => {
    const robots = await (await get('/robots.txt')).text();
    const assets = new Set<string>();
    for (const p of await sitemapPaths()) {
      const html = await (await get(p)).text();
      for (const m of html.matchAll(/(?:src|href)="(\/[^"#?]*\.(?:js|css|svg|png|ico|webmanifest))"/g)) assets.add(m[1]!);
    }
    assert.ok(assets.size > 0);
    for (const a of assets) {
      assert.equal(robotsAllows(robots, a), true, `${a} blocked by robots.txt`);
      assert.equal((await get(a)).status, 200, a);
    }
  });
});

describe('pages that must stay out of the index', () => {
  test('carry noindex in the HTML and the header, and are not hidden behind robots.txt', async () => {
    const robots = await (await get('/robots.txt')).text();
    for (const p of ['/signin', '/signup', '/signup/verify', '/signup/payment', '/dashboard', '/console']) {
      const r = await get(p);
      assert.equal(r.status, 200, p);
      assert.match(r.headers.get('x-robots-tag') ?? '', /noindex/, `${p} header`);
      assert.match(await r.text(), /<meta name="robots" content="noindex/, `${p} meta`);
      assert.equal(robotsAllows(robots, p), true, `${p} is blocked, so a crawler could never read its noindex`);
    }
  });

  test('a missing page is a real 404 marked noindex, not a soft 404', async () => {
    const r = await get('/definitely-not-a-page');
    assert.equal(r.status, 404);
    assert.match(r.headers.get('x-robots-tag') ?? '', /noindex/);
  });
});

describe('the coverage page does not depend on JavaScript or on /api being fetched', () => {
  test('the HTML already lists every state, with links to the state pages', async () => {
    const html = await (await get('/coverage')).text();
    assert.doesNotMatch(html, /Loading coverage/);
    for (const name of ['Alabama', 'Colorado', 'Oregon', 'Missouri', 'Wyoming', 'District of Columbia']) assert.match(html, new RegExp(`>${name}<`), name);
    assert.match(html, /<a href="\/payroll-tax\/oregon">Oregon<\/a>/);
    assert.match(html, /id="s-local">[\d,]{4,}</);
    assert.doesNotMatch(html, /need JavaScript/);
  });

  test('the endpoint the page script calls answers a crawler', async () => {
    const r = await get('/api/coverage');
    assert.equal(r.status, 200);
    assert.ok(((await r.json()) as { states: unknown[] }).states.length >= 51);
  });
});

describe('addresses people link to', () => {
  test('a trailing slash, .html, or capitals redirect once to the real page', async () => {
    for (const [from, to] of [['/pricing/', '/pricing'], ['/pricing.html', '/pricing'], ['/Pricing', '/pricing'], ['/docs/', '/docs'], ['/payroll-tax/', '/payroll-tax'], ['/payroll-tax/Alaska/', '/payroll-tax/alaska']]) {
      const r = await get(from);
      assert.equal(r.status, 301, from);
      assert.equal(new URL(r.headers.get('location')!, base).pathname, to, from);
    }
    const q = await get('/pricing/?ref=x');
    assert.equal(new URL(q.headers.get('location')!, base).search, '?ref=x');
  });

  test('a www request goes to the canonical https origin in one hop', async () => {
    const hop = (headers: Record<string, string>) => new Promise<{ status: number; location: string }>((resolve, reject) => {
      const u = new URL(base);
      const req = httpRequest({ host: u.hostname, port: u.port, path: '/pricing', headers: { 'User-Agent': GOOGLEBOT, ...headers } }, (res) => {
        res.resume();
        resolve({ status: res.statusCode ?? 0, location: String(res.headers.location ?? '') });
      });
      req.on('error', reject);
      req.end();
    });
    assert.deepEqual(await hop({ Host: 'www.omniatax.io' }), { status: 301, location: `${ORIGIN}/pricing` });
  });
});

describe('crawler behaviour', () => {
  test('a burst of crawler requests is never rate-limited or refused', async () => {
    const statuses = new Set<number>();
    for (let i = 0; i < 300; i++) statuses.add((await get(i % 2 ? '/coverage' : '/pricing')).status);
    assert.deepEqual([...statuses], [200]);
  });

  test('common crawler user agents get the same page as everyone else', async () => {
    const agents = ['Googlebot/2.1', 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)', 'Mozilla/5.0 (compatible; DuckDuckBot/1.1)', 'Mozilla/5.0 (compatible; Applebot/0.1)', 'Mozilla/5.0 (compatible; GPTBot/1.1)', 'Mozilla/5.0 (compatible; ClaudeBot/1.0)', 'curl/8.0', ''];
    const sizes = new Set<number>();
    for (const ua of agents) {
      const r = await fetch(base + '/product', { headers: { 'User-Agent': ua, 'Accept-Encoding': 'identity' } });
      assert.equal(r.status, 200, ua);
      sizes.add(Math.round((await r.text()).replace(/nonce="[^"]*"/g, '').length / 100));
    }
    assert.equal(sizes.size, 1, 'the body differs by user agent');
  });

  test('HEAD and conditional-friendly responses work', async () => {
    for (const p of ['/', '/pricing', '/sitemap.xml', '/robots.txt']) {
      const r = await get(p, { method: 'HEAD' });
      assert.equal(r.status, 200, p);
    }
  });
});

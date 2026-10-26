import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { gunzipSync } from 'node:zlib';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES, googleSiteVerification } from '../site/lib/seo.ts';

/**
 * Public-page SEO: sitemap, robots, unique titles, canonical and social
 * tags, one h1, JSON-LD, noindex on private pages, a real 404, apex
 * redirects, icons, alt text, internal links, compression, and caching.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 21000 + Math.floor(Math.random() * 20000);
const BASE = `http://127.0.0.1:${PORT}`;
const ORIGIN = 'https://omniatax.io';
const VERIFY = 'OmniaSeoToken1';

let dir = '';
let child: ChildProcess | undefined;

type Raw = { status: number; headers: Record<string, string | string[] | undefined>; body: Buffer };

function raw(path: string, headers: Record<string, string> = {}): Promise<Raw> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: '127.0.0.1', port: PORT, path, method: 'GET', headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

function header(res: Raw, name: string): string {
  const v = res.headers[name.toLowerCase()];
  return Array.isArray(v) ? v.join(', ') : (v ?? '');
}

function meta(html: string, name: string): string {
  const re = new RegExp(`<meta\\s+[^>]*(?:name|property)="${name}"[^>]*>`, 'i');
  const tag = html.match(re)?.[0] ?? '';
  return tag.match(/content="([^"]*)"/)?.[1] ?? '';
}

function day(file: string): string {
  return statSync(join(REPO, 'site', file)).mtime.toISOString().slice(0, 10);
}

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'site-seo-'));
  child = spawn('node', ['site/server.ts'], {
    cwd: REPO,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_DB_DIR: dir,
      PUBLIC_BASE_URL: ORIGIN,
      GOOGLE_SITE_VERIFICATION: VERIFY,
      TRUST_PROXY: '1',
      RENDER: '',
      NODE_ENV: 'development',
      STRIPE_SECRET_KEY: '',
      STRIPE_ALLOW_LIVE: '',
      RESEND_API_KEY: '',
      VERIFIER_URL: '',
      VERIFIER_SECRET: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout?.on('data', (d) => { output += d; });
  child.stderr?.on('data', (d) => { output += d; });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/healthz`)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`seo site did not become healthy\n${output}`);
});

after(() => {
  child?.kill('SIGKILL');
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('sitemap, robots, and Search Console', () => {
  test('robots.txt allows the site, disallows private paths, and points at the sitemap', async () => {
    const r = await fetch(`${BASE}/robots.txt`);
    assert.equal(r.status, 200);
    const text = await r.text();
    assert.match(text, /User-agent: \*/);
    assert.match(text, /Allow: \//);
    for (const path of ['/dashboard', '/signin', '/signup', '/console', '/_states', '/api/', '/v1/']) {
      assert.match(text, new RegExp(`Disallow: ${path.replace('/', '\\/')}`));
    }
    assert.match(text, new RegExp(`Sitemap: ${ORIGIN}/sitemap.xml`));
    assert.equal(r.headers.get('cache-control'), 'public, max-age=3600');
  });

  test('sitemap lists every indexable page with its file lastmod and nothing private', async () => {
    const r = await fetch(`${BASE}/sitemap.xml`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type') ?? '', /xml/);
    const xml = await r.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const mods = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]);
    assert.equal(locs.length, mods.length);
    const indexable = PAGES.filter((p) => p.index);
    assert.equal(locs.length, indexable.length);
    for (const page of indexable) {
      const loc = ORIGIN + page.path;
      const i = locs.indexOf(loc);
      assert.ok(i >= 0, `missing ${loc}`);
      assert.equal(mods[i], day(page.file), page.path);
    }
    for (const page of PAGES.filter((p) => !p.index)) {
      assert.equal(locs.includes(ORIGIN + page.path), false, page.path);
    }
    assert.equal(xml.includes('/dashboard'), false);
    assert.equal(xml.includes('/signin'), false);
  });

  test('the verification meta is the env token, and a bad token renders nothing', () => {
    const prev = process.env.GOOGLE_SITE_VERIFICATION;
    try {
      delete process.env.GOOGLE_SITE_VERIFICATION;
      assert.equal(googleSiteVerification(), null);
      process.env.GOOGLE_SITE_VERIFICATION = 'short';
      assert.equal(googleSiteVerification(), null);
      process.env.GOOGLE_SITE_VERIFICATION = 'has space';
      assert.equal(googleSiteVerification(), null);
      process.env.GOOGLE_SITE_VERIFICATION = VERIFY;
      assert.equal(googleSiteVerification(), VERIFY);
    } finally {
      if (prev === undefined) delete process.env.GOOGLE_SITE_VERIFICATION;
      else process.env.GOOGLE_SITE_VERIFICATION = prev;
    }
  });

  test('Search Console is documented for the operator', async () => {
    const { readFileSync } = await import('node:fs');
    for (const file of ['.env.example', 'docs/GO-LIVE.md', 'render.yaml']) {
      assert.match(readFileSync(join(REPO, file), 'utf8'), /GOOGLE_SITE_VERIFICATION/);
    }
    assert.match(readFileSync(join(REPO, 'render.yaml'), 'utf8'), /sync: false/);
    assert.match(readFileSync(join(REPO, 'docs/GO-LIVE.md'), 'utf8'), /https:\/\/omniatax\.io/);
  });
});

describe('every page', () => {
  test('each page has one title, description, canonical, social tags, and one h1', async () => {
    const titles = new Map<string, string>();
    for (const page of PAGES) {
      const r = await fetch(BASE + page.path);
      assert.equal(r.status, 200, page.path);
      const html = await r.text();
      const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
      assert.equal(title, page.title, page.path);
      titles.set(page.path, title);
      assert.equal(meta(html, 'description'), page.description, page.path);
      const canonical = ORIGIN + (page.canonicalPath ?? page.path);
      assert.equal(html.match(/<link rel="canonical" href="([^"]+)"/)?.[1], canonical, page.path);
      assert.equal(meta(html, 'og:title'), page.title, page.path);
      assert.equal(meta(html, 'og:description'), page.description, page.path);
      assert.equal(meta(html, 'og:url'), canonical, page.path);
      assert.equal(meta(html, 'og:type'), 'website', page.path);
      assert.equal(meta(html, 'twitter:card'), 'summary_large_image', page.path);
      assert.equal(meta(html, 'og:image'), `${ORIGIN}/logo/og-image.png`, page.path);
      assert.equal(meta(html, 'og:image:width'), '1200', page.path);
      assert.equal(meta(html, 'og:image:height'), '630', page.path);
      assert.ok(meta(html, 'og:image:alt'), page.path);
      assert.equal(meta(html, 'twitter:title'), page.title, page.path);
      assert.equal(meta(html, 'twitter:description'), page.description, page.path);
      assert.equal(meta(html, 'robots'), page.index ? 'index, follow' : 'noindex, nofollow', page.path);
      assert.equal(meta(html, 'google-site-verification'), VERIFY, page.path);
      assert.equal((html.match(/<h1\b/gi) ?? []).length, 1, page.path);
      assert.match(html, /rel="apple-touch-icon"/, page.path);
      assert.match(html, /rel="icon"/, page.path);
      const blocks = html.match(/<script type="application\/ld\+json"/g) ?? [];
      if (page.index) {
        assert.equal(blocks.length, 1, page.path);
        const json = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? '';
        const graph = JSON.parse(json) as { '@graph': Array<Record<string, unknown>> };
        const types = graph['@graph'].map((n) => n['@type']);
        assert.deepEqual(types.slice(0, 3), ['Organization', 'WebSite', 'SoftwareApplication']);
        for (const t of types.slice(3)) assert.ok(['BreadcrumbList', 'FAQPage'].includes(String(t)), `${page.path}: unexpected ${t}`);
        assert.equal(types.includes('BreadcrumbList'), page.path !== '/', page.path);
        assert.equal(types.includes('FAQPage'), Boolean(page.faq?.length), page.path);
        const app = graph['@graph'][2] as { offers: { price: string; priceCurrency: string; description: string } };
        assert.equal(app.offers.price, '0.08');
        assert.equal(app.offers.priceCurrency, 'USD');
        assert.match(app.offers.description, /14-day trial/);
        assert.equal(JSON.stringify(app).match(/"@type":"Offer"/g)?.length ?? 0, 1);
        assert.equal(json.includes('0.09'), false);
        assert.match(html, /nonce="/);
      } else {
        assert.equal(blocks.length, 0, page.path);
      }
      const head = html.split('</head>')[0] ?? '';
      assert.equal(/<script\s+[^>]*\bsrc=/.test(head), false, `${page.path} script in head`);
    }
    const indexableTitles = PAGES.filter((p) => p.index).map((p) => titles.get(p.path));
    assert.equal(new Set(indexableTitles).size, indexableTitles.length);
    assert.equal(titles.get('/console'), titles.get('/sandbox'));
  });

  test('images have alt text and dimensions, and the icons answer', async () => {
    for (const page of PAGES) {
      const html = await (await fetch(BASE + page.path)).text();
      for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
        const alt = tag.match(/\balt="([^"]+)"/)?.[1] ?? '';
        assert.ok(alt, `${page.path} ${tag}`);
        assert.match(tag, /\bwidth="\d+"/, tag);
        assert.match(tag, /\bheight="\d+"/, tag);
      }
    }
    const ico = await raw('/favicon.ico');
    assert.equal(ico.status, 200);
    assert.match(header(ico, 'content-type'), /image\/x-icon/);
    assert.equal(ico.body.subarray(0, 4).toString('hex'), '00000100', 'a real .ico, not an SVG served under that name');
    const svg = await raw('/logo/favicon.svg');
    assert.equal(svg.status, 200);
    assert.match(header(svg, 'content-type'), /svg/);
    assert.match(svg.body.toString('utf8'), /<svg/);
    for (const [path, size] of [['/logo/favicon-48.png', 48], ['/logo/favicon-96.png', 96], ['/logo/favicon-192.png', 192], ['/logo/favicon-512.png', 512], ['/apple-touch-icon.png', 180]] as const) {
      const icon = await raw(path);
      assert.equal(icon.status, 200, path);
      assert.equal(icon.body.subarray(0, 4).toString('hex'), '89504e47', path);
      assert.equal(icon.body.readUInt32BE(16), size, `${path} width`);
      assert.equal(icon.body.readUInt32BE(20), size, `${path} height`);
    }
    const og = await raw('/logo/og-image.png');
    assert.equal(og.body.readUInt32BE(16), 1200);
    assert.equal(og.body.readUInt32BE(20), 630);
    const manifest = JSON.parse((await raw('/site.webmanifest')).body.toString('utf8')) as { icons: { src: string }[] };
    assert.ok(manifest.icons.length >= 2);
    const png = await raw('/apple-touch-icon.png');
    assert.equal(png.status, 200);
    assert.match(header(png, 'content-type'), /image\/png/);
    assert.equal(png.body.subarray(0, 4).toString('hex'), '89504e47');
  });

  test('internal links resolve, and a missing page is a real 404', async () => {
    const seen = new Set<string>();
    const pages = [...PAGES.map((p) => p.path), '/no-such-page-seo'];
    const htmlOf = new Map<string, string>();
    for (const path of PAGES.map((p) => p.path)) htmlOf.set(path, await (await fetch(BASE + path)).text());
    const refs: string[] = [];
    for (const html of htmlOf.values()) {
      for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) refs.push(m[1] ?? '');
    }
    const broken: string[] = [];
    for (const ref of refs) {
      if (!ref.startsWith('/') || ref.startsWith('//')) continue;
      const hash = ref.indexOf('#');
      const path = (hash >= 0 ? ref.slice(0, hash) : ref) || '/';
      const id = hash >= 0 ? ref.slice(hash + 1) : '';
      if (seen.has(path + '#' + id)) continue;
      seen.add(path + '#' + id);
      const res = await fetch(BASE + path, { redirect: 'manual' });
      if (res.status === 301 || res.status === 302) {
        const loc = res.headers.get('location') ?? '';
        const next = loc.startsWith('/') ? loc : new URL(loc).pathname;
        const followed = await fetch(BASE + next, { redirect: 'manual' });
        if (followed.status !== 200) broken.push(`${ref} -> ${loc} -> ${followed.status}`);
      } else if (res.status !== 200) {
        broken.push(`${ref} -> ${res.status}`);
      } else if (id) {
        const body = htmlOf.get(path.split('?')[0] ?? path) ?? await res.text();
        if (!body.includes(`id="${id}"`) && !body.includes(`id='${id}'`)) broken.push(`${ref} missing #${id}`);
      }
    }
    assert.deepEqual(broken, []);
    assert.ok(pages.length > 0);

    const missing = await fetch(`${BASE}/no-such-page-seo`);
    assert.equal(missing.status, 404);
    const html = await missing.text();
    assert.match(html, /<title>Page not found — Omnia.tax<\/title>/);
    assert.equal(meta(html, 'robots'), 'noindex, nofollow');
    assert.equal((html.match(/<h1\b/gi) ?? []).length, 1);
  });

  test('http and www go to the apex, and localhost and health checks stay', async () => {
    const pricing = await raw('/pricing?plan=trial', { Host: 'omniatax.io' });
    assert.equal(pricing.status, 301);
    assert.equal(header(pricing, 'location'), `${ORIGIN}/pricing?plan=trial`);
    assert.match(header(pricing, 'strict-transport-security'), /max-age=31536000/);

    const www = await raw('/docs', { Host: 'www.omniatax.io', 'X-Forwarded-Proto': 'https' });
    assert.equal(www.status, 301);
    assert.equal(header(www, 'location'), `${ORIGIN}/docs`);

    const already = await raw('/about', { Host: 'omniatax.io', 'X-Forwarded-Proto': 'https' });
    assert.equal(already.status, 200);
    assert.match(header(already, 'strict-transport-security'), /max-age=31536000/);

    const local = await raw('/pricing');
    assert.equal(local.status, 200);
    assert.equal(header(local, 'strict-transport-security'), '');

    const health = await raw('/healthz', { Host: 'omniatax.io', 'X-Forwarded-Proto': 'http' });
    assert.equal(health.status, 200);

    const sneak = await raw('//evil.example/phish', { Host: 'omniatax.io' });
    assert.equal(sneak.status, 301);
    const loc = new URL(header(sneak, 'location'));
    assert.equal(loc.host, 'omniatax.io');
    assert.equal(loc.pathname, '/');
  });

  test('css is cached and compressible, and /console is noindex', async () => {
    const css = await raw('/assets/v5.css', { 'Accept-Encoding': 'gzip' });
    assert.equal(css.status, 200);
    assert.equal(header(css, 'cache-control'), 'public, max-age=86400, must-revalidate');
    assert.equal(header(css, 'content-encoding'), 'gzip');
    assert.match(gunzipSync(css.body).toString('utf8'), /step-title|site-header|font-size/);

    const home = await raw('/', { 'Accept-Encoding': 'gzip' });
    assert.equal(header(home, 'content-encoding'), 'gzip');
    assert.match(gunzipSync(home.body).toString('utf8'), /<title>/);
    assert.match(header(home, 'cache-control'), /no-store/);

    const consolePage = await fetch(`${BASE}/console`, { redirect: 'manual' });
    assert.equal(consolePage.status, 200);
    const html = await consolePage.text();
    assert.equal(meta(html, 'robots'), 'noindex, nofollow');
    assert.equal(html.match(/<link rel="canonical" href="([^"]+)"/)?.[1], `${ORIGIN}/sandbox`);

    for (const path of ['/reference', '/reference.html', '/api-reference']) {
      const r = await fetch(BASE + path, { redirect: 'manual' });
      assert.equal(r.status, 301, path);
      assert.equal(r.headers.get('location'), '/docs');
    }
  });
});

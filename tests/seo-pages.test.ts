import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FOOTER, generatePages, slugOf } from '../site/lib/seo-pages.ts';
import { PAGES, sitemapXml } from '../site/lib/seo.ts';

/**
 * The generated search-landing pages (site/lib/seo-pages.ts). They must match what the generator
 * writes now, state facts must match the rule files, and nothing may say more about another
 * company than that company's own site does.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(REPO, p), 'utf8');
const pages = generatePages();
const text = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

describe('generated pages are current', () => {
  test('every committed page file is exactly what the generator writes (run npm run build:seo-pages)', () => {
    for (const p of pages) assert.equal(read(`site/${p.file}`), p.html, `${p.file} is stale`);
  });

  test('the manifest the server reads matches, and PAGES carries every generated page', () => {
    const manifest = JSON.parse(read('site/lib/generated-pages.json')) as { path: string; title: string; description: string }[];
    assert.deepEqual(manifest.map((m) => [m.path, m.title, m.description]), pages.map((p) => [p.path, p.title, p.description]));
    for (const p of pages) assert.ok(PAGES.some((x) => x.path === p.path && x.index), `${p.path} is not indexable in PAGES`);
  });

  test('no stray page files: every file under site/payroll-tax/ is a generated page', () => {
    const generated = new Set(pages.map((p) => p.file));
    for (const f of readdirSync(join(REPO, 'site', 'payroll-tax'))) assert.ok(generated.has(`payroll-tax/${f}`), f);
  });
});

describe('coverage of the search topics', () => {
  test('there is a page for each of the 50 states and DC, and the hub links all of them', () => {
    const states = pages.filter((p) => p.path.startsWith('/payroll-tax/'));
    assert.equal(states.length, 51);
    const hub = pages.find((p) => p.path === '/payroll-tax')!;
    for (const s of states) assert.ok(hub.html.includes(`href="${s.path}"`), s.path);
    assert.ok(states.some((s) => s.path === `/payroll-tax/${slugOf('District of Columbia')}`));
  });

  test('the guides exist at the paths the footer links to', () => {
    for (const path of ['/payroll-tax-calculation', '/payroll-tax-api', '/payroll-tax', '/symmetry-tax-engine-alternative', '/payroll-tax-engine-comparison']) {
      assert.ok(pages.some((p) => p.path === path), path);
    }
  });

  test('each page has one h1 containing its subject, a unique title, and a description under 160 characters', () => {
    const titles = new Set<string>();
    for (const p of pages) {
      assert.equal((p.html.match(/<h1\b/g) ?? []).length, 1, p.path);
      assert.ok(p.title.length <= 70, `${p.path} title ${p.title.length}`);
      assert.ok(p.description.length <= 160, `${p.path} description ${p.description.length}`);
      assert.equal(titles.has(p.title), false, `${p.path} duplicate title`);
      titles.add(p.title);
    }
  });

  test('every FAQ answer is visible on its page, because it is also published as FAQPage structured data', () => {
    for (const p of pages) {
      const visible = text(p.html);
      for (const f of p.faq) {
        assert.ok(visible.includes(f.q), `${p.path}: question not visible`);
        assert.ok(visible.includes(f.a.replace(/&/g, '&')), `${p.path}: answer not visible: ${f.a.slice(0, 40)}`);
      }
    }
  });

  test('the sitemap lists the generated pages', () => {
    const xml = sitemapXml('https://omniatax.io', {});
    for (const p of pages) assert.ok(xml.includes(`<loc>https://omniatax.io${p.path}</loc>`), p.path);
  });
});

describe('state pages quote the rule files', () => {
  const statePage = (name: string) => pages.find((p) => p.path === `/payroll-tax/${slugOf(name)}`)!.html;

  test('Texas: no income tax, $9,000 wage base, the engine’s own unemployment line', () => {
    const t = text(statePage('Texas'));
    assert.match(t, /Texas does not tax wages/);
    assert.match(t, /Unemployment \(SUTA\) wage base \$9,000 for 2026/);
    assert.match(t, /Texas Unemployment Insurance \(Employer\)/);
  });

  test('Washington shows both years: $78,200 for 2026 and $82,000 for 2027', () => {
    assert.match(text(statePage('Washington')), /\$78,200 for 2026 and \$82,000 for 2027/);
  });

  test('Pennsylvania, Ohio and New York carry local or paid-leave facts from the data', () => {
    assert.match(text(statePage('Pennsylvania')), /Local income or wage taxes in Omnia\.tax data [\d,]+ jurisdictions/);
    assert.match(text(statePage('New York')), /paid family and medical leave|disability/);
    assert.match(text(statePage('Ohio')), /Ohio Income Tax/);
  });

  test('a flat-rate state quotes its rate from the file', () => {
    const data = JSON.parse(read('data/states/PA-2026.json')) as { flatRate: { rate: number } };
    assert.match(text(statePage('Pennsylvania')), new RegExp(`Flat ${+(data.flatRate.rate * 100).toFixed(4)}%`));
  });
});

describe('what the pages say about other companies', () => {
  const symmetry = text(pages.find((p) => p.path === '/symmetry-tax-engine-alternative')!.html);
  const comparison = text(pages.find((p) => p.path === '/payroll-tax-engine-comparison')!.html);

  test('the Symmetry page does not claim compatibility, and says the adapter is not wire-compatible', () => {
    assert.match(symmetry, /not wire-compatible/);
    assert.match(symmetry, /not a drop-in replacement/i);
    assert.doesNotMatch(symmetry, /drop-in (?:and|compatible)|fully compatible|100% compatible/i);
  });

  test('every claim about a competitor is attributed to that company’s own site, with the date it was read', () => {
    assert.match(symmetry, /From symmetry\.com \(read 2026-10-26\)/);
    assert.match(comparison, /vendor publishes on its own site \(read 2026-10-26\)/);
    assert.match(symmetry, /per symmetry\.com/);
  });

  test('it does not compare prices it has not seen', () => {
    assert.match(symmetry, /do not compare it|does not publish a price/);
    assert.doesNotMatch(symmetry + comparison, /cheaper than|best-in-class|#1|better than Symmetry/i);
  });

  test('it says where Omnia.tax is the wrong choice', () => {
    assert.match(symmetry, /When it is not/);
    assert.match(comparison, /narrowest of these/);
  });
});

describe('every public page links to the guides', () => {
  test('pages that have a footer carry the shared footer exactly', () => {
    const files = [...readdirSync(join(REPO, 'site')).filter((f) => f.endsWith('.html')), ...readdirSync(join(REPO, 'site', 'legal')).map((f) => `legal/${f}`)];
    let withFooter = 0;
    for (const f of files) {
      const html = read(`site/${f}`);
      if (!html.includes('class="site-footer"')) continue;
      withFooter++;
      assert.ok(html.includes(FOOTER), `${f} has an out-of-date footer`);
    }
    assert.ok(withFooter >= 18, `expected the footer on the public pages, found ${withFooter}`);
  });
});

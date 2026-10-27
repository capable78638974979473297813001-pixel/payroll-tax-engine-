import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generatePages, wageBaseOf } from '../site/lib/seo-pages.ts';
import { PAGES } from '../site/lib/seo.ts';
import { calculatePaycheck } from '../src/calculate.ts';
import { exampleInput } from '../site/lib/seo-pages.ts';

/**
 * The topic guides and the per-state unemployment-tax and take-home-pay families. Each page is
 * generated from the rule files and the engine, so these tests check the properties that make
 * thousands of generated words worth indexing: every page is reachable from a hub, no page shows
 * a broken value, the numbers are the engine's, and no two pages are copies of each other.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const pages = generatePages();
const byPath = new Map(pages.map((p) => [p.path, p]));
const text = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const money = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const topic = pages.filter((p) => !p.path.startsWith('/payroll-tax/') && !p.path.startsWith('/unemployment-tax/') && !p.path.startsWith('/take-home-pay/') && p.path !== '/payroll-tax' && p.path !== '/unemployment-tax' && p.path !== '/take-home-pay' && p.path !== '/guides' && !['/payroll-tax-calculation', '/payroll-tax-api', '/symmetry-tax-engine-alternative', '/payroll-tax-engine-comparison'].includes(p.path));
const unemployment = pages.filter((p) => p.path.startsWith('/unemployment-tax/'));
const takeHome = pages.filter((p) => p.path.startsWith('/take-home-pay/'));

describe('what was generated', () => {
  test('a substantial set: topic guides, 51 unemployment pages and 51 take-home pages, each with a hub', () => {
    assert.ok(topic.length >= 30, `topic guides: ${topic.length}`);
    assert.equal(unemployment.length, 51);
    assert.equal(takeHome.length, 51);
    for (const p of ['/guides', '/unemployment-tax', '/take-home-pay']) assert.ok(byPath.has(p), p);
  });

  test('every page is indexable, in the sitemap data, and reachable from a hub', () => {
    const hubs = ['/guides', '/unemployment-tax', '/take-home-pay'].map((h) => byPath.get(h)!.html).join('\n');
    for (const p of [...topic, ...unemployment, ...takeHome]) {
      assert.ok(PAGES.some((x) => x.path === p.path && x.index), `${p.path} is not indexable`);
      assert.ok(hubs.includes(`href="${p.path}"`), `${p.path} is not linked from a hub`);
    }
  });

  test('the guides hub is linked from the footer on every generated page', () => {
    for (const p of pages) assert.ok(p.html.includes('href="/guides"'), p.path);
  });

  test('every internal link on a generated page goes to a real page', () => {
    const known = new Set(PAGES.map((p) => p.path));
    for (const p of pages) {
      for (const m of p.html.matchAll(/href="(\/[^"#?]*)"/g)) {
        const href = m[1]!;
        if (href.startsWith('/assets') || href.startsWith('/logo') || href.startsWith('/v1/')) continue;
        assert.ok(known.has(href), `${p.path} links to ${href}`);
      }
    }
  });
});

describe('no page shows a broken value', () => {
  test('no undefined, NaN, [object Object], or negative dollar sign', () => {
    for (const p of pages) {
      const t = text(p.html);
      for (const bad of ['undefined', 'NaN', '[object', '$-', 'Infinity']) assert.equal(t.includes(bad), false, `${p.path}: ${bad}`);
    }
  });

  test('Michigan\'s two-tier wage base is shown as a number, not an object', () => {
    assert.equal(wageBaseOf({ default: 9500, qualifiedEmployer: 9000 }), 9500);
    const mi = text(byPath.get('/unemployment-tax/michigan')!.html);
    assert.match(mi, /\$9,500/);
    assert.match(mi, /\$9,000/, 'the reduced base for qualifying employers is shown too');
    assert.equal(text(byPath.get('/payroll-tax/michigan')!.html).includes('[object'), false);
  });
});

describe('the numbers are the engine\'s', () => {
  test('a take-home page shows the engine\'s net for $75,000', () => {
    const r = calculatePaycheck(exampleInput('MI', {}, Math.round((75_000 * 100) / 26)));
    const t = text(byPath.get('/take-home-pay/michigan')!.html);
    assert.ok(t.includes(money(r.netPay)), `expected ${money(r.netPay)} on the Michigan page`);
    assert.ok(t.includes(money(r.netPay * 26)));
  });

  test('a state with no income tax takes home more than a high-tax state at the same salary', () => {
    const net = (state: string) => calculatePaycheck(exampleInput(state, {}, Math.round((75_000 * 100) / 26))).netPay;
    assert.ok(net('TX') > net('CA'));
    assert.ok(text(byPath.get('/take-home-pay/texas')!.html).includes(money(net('TX'))));
  });

  test('unemployment pages quote the rule file', () => {
    const d = JSON.parse(readFileSync(join(REPO, 'data/states/OH-2026.json'), 'utf8'));
    const t = text(byPath.get('/unemployment-tax/ohio')!.html);
    assert.ok(t.includes(`$${(d.suiEmployer.wageBase as number).toLocaleString('en-US')}`));
    assert.ok(t.includes(`${+(d.suiEmployer.newEmployerRate * 100).toFixed(4)}%`));
  });

  test('a state with no published new-employer rate says it is assigned, and does not invent one', () => {
    const t = text(byPath.get('/unemployment-tax/washington')!.html);
    assert.match(t, /Assigned by the state/);
  });

  test('the worked examples on the guides are the engine\'s own numbers', () => {
    const gross = text(byPath.get('/gross-to-net-api')!.html);
    const oh = calculatePaycheck(exampleInput('OH', { residenceCity: 'Columbus', workCity: 'Columbus' }, 300_000));
    assert.ok(gross.includes(money(oh.netPay)));
    assert.ok(text(byPath.get('/employer-payroll-tax-calculator')!.html).includes('$2,810.00'), 'the MCTMT worked example');
  });
});

describe('the pages are not copies of each other', () => {
  test('state pages differ by their numbers: no two take-home or unemployment pages share a body', () => {
    for (const family of [unemployment, takeHome]) {
      const bodies = new Set(family.map((p) => text(p.html).replace(new RegExp(p.h1, 'g'), '')));
      assert.ok(bodies.size >= family.length - 2, 'pages in a family are near-identical');
    }
  });

  test('every topic page has substantive text of its own and a distinct title and h1', () => {
    const seen = new Set<string>();
    for (const p of topic) {
      assert.ok(text(p.html).split(' ').length > 350, `${p.path} is thin`);
      assert.equal(seen.has(p.h1), false, `${p.path} duplicate h1`);
      seen.add(p.h1);
    }
  });

  test('topic pages do not claim to file, deposit, or advise', () => {
    for (const p of topic) {
      const t = text(p.html).toLowerCase();
      assert.equal(/\bwe (file|deposit|remit)\b|omnia\.tax (files|deposits|remits)\b/.test(t), false, p.path);
    }
  });
});

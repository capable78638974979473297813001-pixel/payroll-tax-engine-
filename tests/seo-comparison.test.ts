import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generatePages } from '../site/lib/seo-pages.ts';
import { GEOCODE } from '../site/lib/geocoding-facts.ts';
import { coverage } from '../site/lib/coverage.ts';

/**
 * How the comparison pages position Omnia.tax: a smaller, easier, self-serve engine doing the same
 * core calculation, with local coverage and geocoding as headline strengths. Those claims are
 * pinned to the coverage data and to the geocoding measurement, so marketing cannot drift from them.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const pages = generatePages();
const find = (path: string) => pages.find((p) => p.path === path)!;
const text = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const symmetry = text(find('/symmetry-tax-engine-alternative').html);
const comparison = text(find('/payroll-tax-engine-comparison').html);
const local = text(find('/local-payroll-tax-api').html);
const geocoding = text(find('/address-tax-jurisdiction-lookup-api').html);
const summary = coverage().summary;
const n = summary.localJurisdictions.toLocaleString('en-US');

describe('the pitch', () => {
  test('a smaller, easier, self-serve engine with the same core calculation', () => {
    assert.match(symmetry, /smaller, easier, self-serve payroll tax engine/);
    assert.match(symmetry, /same core calculation/);
    assert.match(comparison, /smaller, easier, self-serve payroll tax engine/);
    assert.match(find('/symmetry-tax-engine-alternative').description, /smaller, easier, self-serve/);
  });

  test('local coverage and geocoding lead, with the real counts', () => {
    for (const t of [symmetry, comparison]) {
      assert.ok(t.includes(`${n} local`), 'local jurisdiction count');
      assert.ok(t.includes(`${summary.statesWithLocalTax} states`));
      assert.match(t, /geocoding/);
    }
    assert.match(symmetry, /Local coverage and geocoding, built in/);
    assert.match(symmetry, new RegExp(`${summary.localMinimumWage} city and county ordinances`));
  });

  test('the local and geocoding guides market the same strengths', () => {
    assert.ok(local.includes(`${n} local tax jurisdictions in ${summary.statesWithLocalTax} states`));
    assert.match(local, /Geocoding picks the right jurisdiction/);
    assert.match(geocoding, /Address-level, and measured/);
    assert.match(find('/address-tax-jurisdiction-lookup-api').title, /geocoding/i);
  });
});

describe('nothing says Omnia.tax lacks local coverage or geocoding', () => {
  const all = pages.map((p) => `${p.path}\n${text(p.html)}`).join('\n');
  test('no deficit framing on any generated page', () => {
    for (const bad of [/local coverage beyond/i, /narrowest of these/i, /When it is not/i, /not (?:like-for-like|a like-for-like)/i, /(?:lacks|without) (?:local|geocod)/i, /beyond the \d+ states we have researched/i]) {
      assert.doesNotMatch(all, bad);
    }
  });
  test('the homepage and coverage page lead with local coverage and geocoding', () => {
    const index = readFileSync(join(REPO, 'site/index.html'), 'utf8');
    const cov = readFileSync(join(REPO, 'site/coverage.html'), 'utf8');
    assert.match(index, /found from the employee’s address by geocoding/);
    assert.doesNotMatch(index, /local list is partial/);
    assert.match(cov, /<h1 class="page">What we cover\.<\/h1>/);
    assert.doesNotMatch(cov, /what we don’t/);
  });
});

describe('the claims are the measurement\'s', () => {
  test('the geocoding figures are the ones in docs/geocoding-coverage.md', () => {
    const doc = readFileSync(join(REPO, 'docs/geocoding-coverage.md'), 'utf8');
    assert.ok(doc.includes(`**${GEOCODE.betterThanInterpolation} of ${GEOCODE.jurisdictionsTested} jurisdictions resolve to something better than Census's own interpolation**`));
    assert.match(doc, new RegExp(`\\| \`rooftop\` \\(authoritative\\) \\| ${GEOCODE.rooftop} / ${GEOCODE.jurisdictionsTested} \\|`));
    assert.match(doc, new RegExp(`\\| \`rooftop-osm\` \\(house-level, corroborated\\) \\| ${GEOCODE.rooftopOsm} / ${GEOCODE.jurisdictionsTested} \\|`));
    assert.ok(doc.includes(`Regenerated ${GEOCODE.measuredOn}`));
  });

  test('every state it counts as having local tax has local jurisdictions in the data', () => {
    const by = summary.localByState as Record<string, number>;
    assert.equal(Object.keys(by).length, summary.statesWithLocalTax);
    assert.equal(Object.values(by).reduce((a, b) => a + b, 0), summary.localJurisdictions);
  });

  test('claims about other companies stay attributed to their own sites', () => {
    assert.match(symmetry, /Payroll Point, per symmetry\.com/);
    assert.match(comparison, /Vertex[^.]*geocode-based jurisdiction assignment[^.]*vertexinc\.com/);
    assert.doesNotMatch(symmetry + comparison, /Symmetry (?:cannot|does not|lacks|doesn't) (?:cover|support|geocode)/i);
  });
});

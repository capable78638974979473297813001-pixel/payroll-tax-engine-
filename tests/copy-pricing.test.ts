import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TERMS_VERSION, TERMS_VERSION_2026_10_19_2, termsClauses, termsClauses202610192 } from '../site/lib/terms.ts';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

/** Drop implementation tokens that are not customer copy. */
function visible(text: string): string {
  return text
    .replace(/class="[^"]*\bsandbox\b[^"]*"/g, '')
    .replace(/\/sandbox(?:-examples\.json|\.html)?/g, '')
    .replace(/sandbox\.html/g, '')
    .replace(/sandbox-examples\.json/g, '');
}

const FILES = [
  ...walk(join(REPO, 'site')).filter((p) => p.endsWith('.html') || p.endsWith('/assets/pricing.js') || p.endsWith('\\assets\\pricing.js')),
  join(REPO, 'docs/STRIPE-SETUP.md'),
  join(REPO, 'docs/GO-LIVE.md'),
  join(REPO, 'docs/LEGAL.md'),
  join(REPO, 'README.md'),
];

const FORBIDDEN = [
  /\bsandbox\b/i,
  /to be announced/i,
  /\$0\.09\b/,
  /rooftop fee/i,
  /\bTBA\b/,
  /OMNIA_SANDBOX_KEY/,
  /12-month commitment/i,
];

test('customer-facing copy has no sandbox or old price strings', () => {
  const hits: string[] = [];
  for (const file of FILES) {
    const text = visible(readFileSync(file, 'utf8'));
    for (const re of FORBIDDEN) {
      if (re.test(text)) hits.push(`${file.slice(REPO.length + 1)} matches ${re}`);
    }
  }
  const current = termsClauses({ trialEndsAt: '2026-11-06T00:00:00.000Z', estimatedAnnual: 0, expectedEmployees: 1 })
    .map((c) => `${c.heading}\n${c.body}`)
    .join('\n');
  for (const re of FORBIDDEN) {
    if (re.test(current)) hits.push(`current terms match ${re}`);
  }
  assert.deepEqual(hits, []);
  assert.match(current, /\$0\.08/);
  assert.match(current, /14-day free trial|Free for 14 days/i);
  assert.equal(TERMS_VERSION, '2026-10-25.1');
});

test('the previous terms version is still the old text', () => {
  const old = termsClauses202610192({ trialEndsAt: '2026-11-02T00:00:00.000Z', estimatedAnnual: 1, expectedEmployees: 2 })
    .map((c) => c.body)
    .join('\n');
  assert.equal(TERMS_VERSION_2026_10_19_2, '2026-10-19.2');
  assert.match(old, /That rate is to be announced/);
  assert.match(old, /Sandbox calls are not billed/);
  assert.doesNotMatch(old, /\$0\.08/);
});

test('coverage still says multi-state withholding is in progress, and copy does not claim filing or direct deposit', () => {
  const coverage = readFileSync(join(REPO, 'site/coverage.html'), 'utf8');
  assert.match(coverage, /Same-paycheck multi-state withholding is in progress/);
  const blob = FILES.map((f) => readFileSync(f, 'utf8')).join('\n');
  assert.doesNotMatch(blob, /\bfiles taxes\b/i);
  assert.doesNotMatch(blob, /\bdirect deposit\b/i);
});

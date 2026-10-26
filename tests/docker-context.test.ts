import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The Render image is built from the Dockerfile, in a context that .dockerignore has already
 * trimmed. A COPY of a file the ignore file excludes fails the whole deploy ("not found"), which
 * is what happened when the Dockerfile began copying payroll/platform.ts while .dockerignore still
 * excluded payroll. No Docker daemon is needed to see that coming:
 *
 *   1. every path a COPY line names must be in the build context, and
 *   2. every file site/server.ts imports, directly or through other imports, must be in a path the
 *      Dockerfile copies.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(REPO, p), 'utf8');

const rules = read('.dockerignore')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => l.replace(/^"|"$/g, ''));

/** A pattern's regex: `*` is any run within one path segment, `**` any run, `?` one character. */
function patternRegex(pattern: string): RegExp {
  const p = normalize(pattern.replace(/^\//, ''));
  let re = '';
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '*' && p[i + 1] === '*') {
      re += '.*';
      i++;
      if (p[i + 1] === '/') i++;
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/** Docker's rule: the last pattern that matches the path, or one of its parent directories, decides. */
function inContext(path: string): boolean {
  let excluded = false;
  for (const raw of rules) {
    const negate = raw.startsWith('!');
    const re = patternRegex(negate ? raw.slice(1) : raw);
    const parts = path.split('/');
    const hit = parts.some((_, i) => re.test(parts.slice(0, i + 1).join('/')));
    if (hit) excluded = !negate;
  }
  return !excluded;
}

const copies = read('Dockerfile')
  .split('\n')
  .map((l) => /^COPY\s+(.+?)\s+(\S+)\s*$/.exec(l))
  .filter((m): m is RegExpExecArray => m !== null)
  .map((m) => ({ sources: m[1].split(/\s+/), dest: m[2] }));

describe('the Docker build context', () => {
  test('every COPY source exists and survives .dockerignore', () => {
    const missing: string[] = [];
    for (const { sources } of copies) {
      for (const s of sources) {
        if (!existsSync(join(REPO, s))) missing.push(`${s} (not in the repository)`);
        else if (!inContext(s)) missing.push(`${s} (excluded by .dockerignore)`);
      }
    }
    assert.deepEqual(missing, [], 'the image build would fail on these COPY lines');
  });

  test('the matcher itself: later negations re-include, parents exclude, and a plain name excludes its subtree', () => {
    assert.equal(inContext('payroll/platform.ts'), true);
    assert.equal(inContext('payroll/engine.ts'), false);
    assert.equal(inContext('tests/engine.test.ts'), false);
    assert.equal(inContext('site/server.ts'), true);
    assert.equal(inContext('node_modules/x/index.js'), false);
  });

  test('every file the site server imports is copied into the image', () => {
    const copied = copies.flatMap(({ sources }) => sources.map((s) => normalize(s)));
    const isCopied = (file: string) => copied.some((c) => file === c || file.startsWith(`${c}/`));

    const seen = new Set<string>();
    const stack = ['site/server.ts'];
    const outside: string[] = [];
    while (stack.length > 0) {
      const file = stack.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      if (!isCopied(file)) outside.push(file);
      if (!existsSync(join(REPO, file)) || !file.endsWith('.ts')) continue;
      const src = read(file);
      for (const m of src.matchAll(/(?:import|export)\s[^;]*?from\s+['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)|^import\s+['"](\.[^'"]+)['"]/gm)) {
        const spec = m[1] ?? m[2] ?? m[3];
        stack.push(relative(REPO, join(REPO, dirname(file), spec)).split('\\').join('/'));
      }
    }
    assert.deepEqual(outside, [], 'the server imports files the Dockerfile never copies');
    assert.ok(seen.size > 30, 'the import walk found the server\u2019s modules');
  });
});

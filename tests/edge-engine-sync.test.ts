import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const COPY = join(ROOT, 'supabase', 'functions', '_shared', 'engine');

function files(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files(full, out);
    else if (entry.endsWith('.ts')) out.push(relative(dir.startsWith(SRC) ? SRC : COPY, full));
  }
  return out;
}

/**
 * supabase/functions/_shared/engine/ is a generated copy of src/ (the Edge
 * Function cannot import outside supabase/). It went stale unnoticed before:
 * a fix in src/ never reached the deployed function. This fails the moment the
 * two differ; the fix is `node scripts/build-edge-function.ts`.
 */
test('the Supabase edge-function copy of the engine matches src/', () => {
  const src = files(SRC).sort();
  const copy = files(COPY).sort();
  assert.deepEqual(copy, src, 'the same set of files (run: node scripts/build-edge-function.ts)');
  const stale = src.filter((f) => readFileSync(join(SRC, f), 'utf8') !== readFileSync(join(COPY, f), 'utf8'));
  assert.deepEqual(stale, [], `out of date: ${stale.join(', ')} (run: node scripts/build-edge-function.ts)`);
});

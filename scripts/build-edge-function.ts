import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Copies the calc engine (src/) into supabase/functions/_shared/engine/
 * so the Edge Function's imports never reach outside supabase/functions/.
 *
 * Why copy instead of importing src/ directly from
 * supabase/functions/calculate-paycheck/index.ts: the Supabase CLI's own
 * bundling/upload step is scoped to the supabase/ directory — a
 * cross-directory relative import (../../../src/calculate.ts) resolves
 * fine under plain Deno (which has no such restriction), but is NOT
 * confirmed to survive `supabase functions deploy`'s own packaging, and
 * a silent bundling gap is a much worse failure mode than a scripted
 * copy step. src/ has exactly one Node-specific file (registry.ts, via
 * node:fs — already made swappable by setDataReader(), see its own doc
 * comment) and is otherwise plain TypeScript with explicit .ts import
 * extensions throughout, so a byte-for-byte copy runs unmodified in Deno.
 *
 * Run this (then scripts/build-data-bundle.ts, then redeploy) any time
 * src/ changes.
 *
 *   node scripts/build-edge-function.ts
 */

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = join(HERE, '..');
const SRC = join(REPO_ROOT, 'src');
const OUT = join(REPO_ROOT, 'supabase', 'functions', '_shared', 'engine');

function copyDir(from: string, to: string): number {
  mkdirSync(to, { recursive: true });
  let count = 0;
  for (const entry of readdirSync(from)) {
    const fromPath = join(from, entry);
    const toPath = join(to, entry);
    if (statSync(fromPath).isDirectory()) {
      count += copyDir(fromPath, toPath);
    } else if (entry.endsWith('.ts')) {
      writeFileSync(toPath, readFileSync(fromPath, 'utf8'));
      count++;
    }
  }
  return count;
}

// Clear any stale copy first (e.g. a file since deleted from src/)
// rather than silently accumulating it forever.
if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });

const count = copyDir(SRC, OUT);
console.log(`Copied ${count} files from src/ to ${OUT}`);

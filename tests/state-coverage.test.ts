import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderCoverage } from '../payroll/state/coverage.ts';

test('docs/STATE-COVERAGE.md is exactly what the profiles generate (run: node scripts/state-coverage.ts)', () => {
  const committed = readFileSync(join(import.meta.dirname, '..', 'docs', 'STATE-COVERAGE.md'), 'utf8');
  assert.equal(committed, renderCoverage());
});

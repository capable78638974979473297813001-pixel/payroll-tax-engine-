/** Regenerates docs/STATE-COVERAGE.md from the state profiles: node scripts/state-coverage.ts */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderCoverage } from '../payroll/state/coverage.ts';

const out = join(import.meta.dirname, '..', 'docs', 'STATE-COVERAGE.md');
writeFileSync(out, renderCoverage());
console.log(`wrote ${out}`);

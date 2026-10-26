/**
 * Writes the generated search-landing pages (site/payroll-tax-*.html, site/payroll-tax/*.html, ...)
 * and the manifest the server reads (site/lib/generated-pages.json).
 *
 *   npm run build:seo-pages
 *
 * Re-run it after changing a state rule file, the coverage numbers or site/lib/seo-pages.ts.
 * tests/seo-pages.test.ts fails while the committed files differ from what this would write.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePages } from '../site/lib/seo-pages.ts';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..', 'site');

const pages = generatePages();
for (const p of pages) {
  const file = join(SITE, p.file);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, p.html, 'utf8');
}
const manifest = pages.map(({ html: _html, ...meta }) => meta);
writeFileSync(join(SITE, 'lib', 'generated-pages.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`Wrote ${pages.length} pages and site/lib/generated-pages.json`);

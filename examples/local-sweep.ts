import { readFileSync } from 'node:fs';
import { calculatePaycheck } from '../src/calculate.ts';
import type { PaycheckInput, TaxLine } from '../src/types.ts';

/**
 * Exhaustive local-jurisdiction sweep. Runs EVERY jurisdiction in the local
 * data files through the engine (not one per state) and checks the engine
 * applied that jurisdiction's own stored rate. It compares against the rate
 * the engine actually taxed at (line.taxableWages), so base differences never
 * cause a false mismatch — only a mis-applied rate or a lookup miss does.
 *
 *   npm run sweep:local
 *
 * MATCH  = engine produced the local line at the data's rate (±1¢)
 * ZERO   = data rate is 0 and the engine correctly withheld nothing
 * MISS   = data rate > 0 but the engine produced no matching local line
 * DIFF   = a line was produced but at a different rate than the data
 * ERROR  = the calculation threw
 */

const raw = (f: string) => JSON.parse(readFileSync('data/local/' + f, 'utf8'));
// Return the jurisdiction array whether the file is a raw array or nests it
// under a key (municipalities / jurisdictions / districts / cities / counties).
function L<T = Record<string, unknown>>(f: string): T[] {
  const d = raw(f);
  if (Array.isArray(d)) return d as T[];
  // The data array is the largest array in the file (a file may also hold
  // small arrays like `sources` or `knownGaps`).
  const arrays = (Object.values(d) as unknown[]).filter((v): v is unknown[] => Array.isArray(v));
  arrays.sort((a, b) => b.length - a.length);
  return (arrays[0] as T[]) ?? [];
}
const GROSS = 1000000; // $10,000
const money = (c: number) => '$' + (c / 100).toFixed(2);

const baseInput = (over: Partial<PaycheckInput>): PaycheckInput => ({
  checkDate: '2026-09-15',
  payFrequency: 'biweekly',
  earnings: [{ code: 'REG', category: 'regular', amount: GROSS }],
  deductions: [],
  federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
  ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
  ...over,
});

interface Row { label: string; input: PaycheckInput; expectRate: number; match: RegExp; }
interface FileCfg { name: string; rows: () => Row[]; }

const FILES: FileCfg[] = [
  {
    name: 'OH municipalities',
    rows: () => (L('OH-municipalities-2026.json') as Array<{ name: string; rate: number }>).map((m) => ({
      label: `OH ${m.name}`,
      expectRate: m.rate ?? 0,
      match: /municipal/i,
      input: baseInput({ workState: { code: 'OH', certificate: { residenceCity: m.name, workCity: m.name } } }),
    })),
  },
  {
    name: 'OH school districts',
    rows: () => (L('OH-school-districts-2026.json') as Array<{ sdNumber: string; name: string; rate2026: number }>).map((d) => ({
      label: `OH SD ${d.sdNumber} ${d.name}`,
      expectRate: d.rate2026 ?? 0,
      match: /school district/i,
      input: baseInput({ workState: { code: 'OH', certificate: { schoolDistrictCode: d.sdNumber } }, residenceState: { code: 'OH', certificate: { schoolDistrictCode: d.sdNumber } } }),
    })),
  },
  {
    name: 'PA Act 32 EIT (PSD)',
    rows: () => (L('PA-EIT-LST-2026.json') as Array<Record<string, number | string>>).map((j) => {
      const totalRes = Number(j.totalResidentEIT ?? (Number(j.residentEIT) + Number(j.schoolDistrictEIT ?? 0)));
      const nonres = Number(j.nonresidentEIT ?? 0);
      return {
        label: `PA ${j.municipality} (${j.psdCode})`,
        expectRate: Math.max(totalRes, nonres), // Act 32 withholds the greater
        match: /earned income/i,
        input: baseInput({ workState: { code: 'PA', certificate: { workPSD: String(j.psdCode), residencePSD: String(j.psdCode) } } }),
      };
    }),
  },
  {
    name: 'MI cities',
    rows: () => (L('MI-cities-2026.json') as Array<{ name: string; residentRate: number }>).map((c) => ({
      label: `MI ${c.name}`,
      expectRate: c.residentRate ?? 0,
      match: /income/i,
      input: baseInput({ workState: { code: 'MI', certificate: { residenceCity: c.name, workCity: c.name } } }),
    })),
  },
  {
    name: 'AL municipalities',
    rows: () => (L('AL-municipalities-2026.json') as Array<{ name: string; rate: number }>).map((m) => ({
      label: `AL ${m.name}`,
      expectRate: m.rate ?? 0,
      match: /occupational/i,
      input: baseInput({ workState: { code: 'AL', certificate: { workCity: m.name } } }),
    })),
  },
  {
    name: 'IN counties',
    rows: () => (L('IN-counties-2026.json') as Array<{ name: string; rate: number }>).map((c) => ({
      label: `IN ${c.name}`,
      expectRate: c.rate ?? 0,
      match: /county|income/i,
      input: baseInput({ workState: { code: 'IN', certificate: { county: c.name } } }),
    })),
  },
];

interface Tally { match: number; zero: number; miss: number; diff: number; error: number; }
const sampleDiffs: string[] = [];
const sampleMiss: string[] = [];

function sweepFile(cfg: FileCfg): Tally {
  const t: Tally = { match: 0, zero: 0, miss: 0, diff: 0, error: 0 };
  for (const row of cfg.rows()) {
    let lines: TaxLine[];
    try {
      lines = calculatePaycheck(row.input).taxes.filter((x) => x.jurisdiction === 'local' && x.amount !== 0 && row.match.test(x.name));
    } catch (e) {
      t.error++;
      if (sampleDiffs.length < 40) sampleDiffs.push(`ERROR ${row.label}: ${(e as Error).message.slice(0, 70)}`);
      continue;
    }
    if (row.expectRate === 0) {
      // Expect nothing (or a $0 line). A nonzero line here is a real diff.
      if (lines.length === 0) t.zero++;
      else { t.diff++; if (sampleDiffs.length < 40) sampleDiffs.push(`DIFF ${row.label}: expected $0, got ${money(lines[0].amount)}`); }
      continue;
    }
    if (lines.length === 0) {
      t.miss++;
      if (sampleMiss.length < 40) sampleMiss.push(`MISS ${row.label}: expected ≈${(row.expectRate * 100).toFixed(2)}%, no line`);
      continue;
    }
    const line = lines.reduce((a, b) => (b.amount > a.amount ? b : a));
    const expected = Math.round(line.taxableWages * row.expectRate);
    if (Math.abs(line.amount - expected) <= 1) t.match++;
    else {
      t.diff++;
      const gotPct = ((line.amount / line.taxableWages) * 100).toFixed(2);
      if (sampleDiffs.length < 40) sampleDiffs.push(`DIFF ${row.label}: data ${(row.expectRate * 100).toFixed(2)}%, engine ${gotPct}% (${money(line.amount)} vs ${money(expected)})`);
    }
  }
  return t;
}

console.log('\n' + '═'.repeat(80));
console.log('  OMNIA EXHAUSTIVE LOCAL SWEEP — every jurisdiction in the data, $10,000 biweekly');
console.log('═'.repeat(80));

const totals: Tally = { match: 0, zero: 0, miss: 0, diff: 0, error: 0 };
for (const cfg of FILES) {
  const t = sweepFile(cfg);
  for (const k of Object.keys(totals) as (keyof Tally)[]) totals[k] += t[k];
  const swept = t.match + t.zero + t.miss + t.diff + t.error;
  console.log(
    `\n  ${cfg.name.padEnd(24)} ${String(swept).padStart(5)} swept   ` +
    `✓ ${t.match} match · ${t.zero} zero-rate · ${t.miss} miss · ${t.diff} diff · ${t.error} err`,
  );
}

if (sampleMiss.length) { console.log('\n  ── sample MISSES (rate>0, no line) ──'); for (const s of sampleMiss.slice(0, 15)) console.log('   ' + s); }
if (sampleDiffs.length) { console.log('\n  ── sample DIFFs / ERRORs ──'); for (const s of sampleDiffs.slice(0, 15)) console.log('   ' + s); }

const swept = totals.match + totals.zero + totals.miss + totals.diff + totals.error;
console.log('\n' + '═'.repeat(80));
console.log(`  ${swept} jurisdictions swept`);
console.log(`    ✓ ${totals.match} applied their data rate correctly`);
console.log(`    · ${totals.zero} correctly withheld $0 (no local tax)`);
console.log(`    ⚠ ${totals.miss} miss · ${totals.diff} diff · ${totals.error} error`);
console.log('═'.repeat(80) + '\n');

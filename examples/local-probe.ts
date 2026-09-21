import { readFileSync } from 'node:fs';
import { calculatePaycheck } from '../src/calculate.ts';
import type { PaycheckInput, TaxLine } from '../src/types.ts';

/**
 * Local-jurisdiction probe. Fires a spread of real local taxing
 * jurisdictions through Omnia and reports the local line it produces, the
 * effective rate, and whether that lands where we'd expect. This is the
 * "does the crown jewel actually compute the local layer" smoke test — the
 * exact thing the outreach emails promise.
 *
 *   npm run probe:local
 */

const GROSS = 300000; // $3,000 biweekly
const money = (c: number) => (c < 0 ? '-' : '') + '$' + (Math.abs(c) / 100).toFixed(2);

// Pull a few real PA PSD codes out of the 2,627-jurisdiction registry so we
// aren't hardcoding codes that might drift.
function paPSDs(): { philly?: string; onePct?: string } {
  const rows = JSON.parse(readFileSync('data/local/PA-EIT-LST-2026.json', 'utf8')) as {
    jurisdictions: Array<Record<string, string | number>>;
  };
  const arr = rows.jurisdictions;
  const philly = arr.find((r) => String(r.municipality).toUpperCase() === 'PHILADELPHIA CITY')?.psdCode as string
    ?? (arr.find((r) => String(r.municipality).toUpperCase().includes('PHILADELPHIA')) as Record<string, string> | undefined)?.psdCode;
  const onePct = arr.find((r) => Number(r.residentEIT) >= 0.0098 && Number(r.residentEIT) <= 0.011);
  return { philly: philly as string | undefined, onePct: onePct?.psdCode as string };
}
const { philly, onePct } = paPSDs();

interface Probe {
  label: string;
  input: PaycheckInput;
  /** roughly the resident rate we'd expect, for a sanity read (not an assertion). */
  expectPct?: number;
}

const base = (workState: PaycheckInput['workState'], residenceState?: PaycheckInput['residenceState']): PaycheckInput => ({
  checkDate: '2026-06-15',
  payFrequency: 'biweekly',
  earnings: [{ code: 'REG', category: 'regular', amount: GROSS }],
  deductions: [],
  federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
  ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
  workState,
  residenceState,
});

const oh = (city: string) => base({ code: 'OH', certificate: { residenceCity: city, workCity: city } });

const PROBES: Probe[] = [
  // Ohio municipalities (RITA/CCA territory) — resident working in-city.
  { label: 'OH · Columbus (resident+work)', input: oh('Columbus'), expectPct: 2.5 },
  { label: 'OH · Cleveland', input: oh('Cleveland'), expectPct: 2.5 },
  { label: 'OH · Cincinnati', input: oh('Cincinnati'), expectPct: 1.8 },
  { label: 'OH · Dayton', input: oh('Dayton'), expectPct: 2.5 },
  { label: 'OH · Toledo', input: oh('Toledo'), expectPct: 2.25 },
  { label: 'OH · Akron', input: oh('Akron'), expectPct: 2.5 },
  // Ohio School District Income Tax.
  { label: 'OH · SDIT district 0203 (Bluffton)', input: base({ code: 'OH', certificate: { schoolDistrictCode: '0203' } }, { code: 'OH', certificate: { schoolDistrictCode: '0203' } }), expectPct: 0.5 },
  // Pennsylvania Act 32 EIT by PSD code.
  ...(philly ? [{ label: `PA · Philadelphia City (PSD ${philly})`, input: base({ code: 'PA', certificate: { workPSD: philly, residencePSD: philly } }), expectPct: 3.74 } as Probe] : []),
  ...(onePct ? [{ label: `PA · 1% EIT township (PSD ${onePct})`, input: base({ code: 'PA', certificate: { workPSD: onePct, residencePSD: onePct } }), expectPct: 1.0 } as Probe] : []),
  // Kentucky occupational (work-location based).
  { label: 'KY · Louisville Metro (work)', input: base({ code: 'KY', certificate: { workCity: 'Louisville' } }), expectPct: 1.45 },
  { label: 'KY · Lexington-Fayette (work)', input: base({ code: 'KY', certificate: { workCity: 'Lexington' } }), expectPct: 2.25 },
  // Michigan city income tax.
  { label: 'MI · Detroit (resident+work)', input: base({ code: 'MI', certificate: { residenceCity: 'Detroit', workCity: 'Detroit' } }), expectPct: 2.4 },
  { label: 'MI · Grand Rapids', input: base({ code: 'MI', certificate: { residenceCity: 'Grand Rapids', workCity: 'Grand Rapids' } }), expectPct: 1.5 },
  // Alabama municipal occupational (work-location based).
  { label: 'AL · Birmingham (work)', input: base({ code: 'AL', certificate: { workCity: 'Birmingham' } }), expectPct: 1.0 },
  { label: 'AL · Bessemer (work)', input: base({ code: 'AL', certificate: { workCity: 'Bessemer' } }), expectPct: 1.0 },
  // Indiana county income tax.
  { label: 'IN · Marion County (Indianapolis)', input: base({ code: 'IN', certificate: { county: 'Marion' } }), expectPct: 2.02 },
  // New York City + Yonkers.
  { label: 'NY · NYC resident', input: base({ code: 'NY', certificate: { nycResident: true } }, { code: 'NY', certificate: { nycResident: true } }), expectPct: 3.5 },
  { label: 'NY · Yonkers resident', input: base({ code: 'NY', certificate: { yonkersResident: true } }, { code: 'NY', certificate: { yonkersResident: true } }), expectPct: 1.6 },
  // Oregon transit + Portland-area local.
  { label: 'OR · Multnomah + Metro @ $3k (below threshold → expect $0)', input: base({ code: 'OR', certificate: { multnomahCounty: true, metroDistrict: true } }, { code: 'OR', certificate: { multnomahCounty: true, metroDistrict: true } }) },
  { label: 'OR · Metro+Multnomah @ $10k check, $205k YTD (over $200k trigger → should fire)', input: { ...base({ code: 'OR', certificate: { multnomahCounty: true, metroDistrict: true } }, { code: 'OR', certificate: { multnomahCounty: true, metroDistrict: true } }), earnings: [{ code: 'REG', category: 'regular', amount: 1000000 }], ytd: { socialSecurity: 0, medicare: 0, futa: 0, localIncomeTax: { OR_METRO: 20500000, OR_MULTNOMAH: 20500000 } } } },
  { label: 'OR · TriMet transit district', input: base({ code: 'OR', certificate: { locality: 'TriMet' } }) },
];

function localLines(input: PaycheckInput): { lines: TaxLine[]; error?: string } {
  try {
    const r = calculatePaycheck(input);
    return { lines: r.taxes.filter((t) => t.jurisdiction === 'local') };
  } catch (e) {
    return { lines: [], error: e instanceof Error ? e.message : String(e) };
  }
}

console.log('\n' + '═'.repeat(78));
console.log('  OMNIA LOCAL-JURISDICTION PROBE  ·  $3,000 biweekly, single');
console.log('  effective % = local tax ÷ its taxable base; expect ≈ the known resident rate');
console.log('═'.repeat(78));

let produced = 0;
let empty = 0;
let errored = 0;

for (const p of PROBES) {
  const { lines, error } = localLines(p.input);
  if (error) {
    errored++;
    console.log(`\n✗ ${p.label}\n    ERROR: ${error.slice(0, 90)}`);
    continue;
  }
  const nonzero = lines.filter((l) => l.amount !== 0);
  if (nonzero.length === 0) {
    empty++;
    const zeroNote = lines.length ? ` (${lines.length} local line(s) at $0.00)` : ' (no local line produced)';
    console.log(`\n○ ${p.label}\n    no local tax${zeroNote}`);
    continue;
  }
  produced++;
  console.log(`\n● ${p.label}`);
  for (const l of nonzero) {
    const effPct = l.taxableWages > 0 ? (l.amount / l.taxableWages) * 100 : 0;
    const flag = p.expectPct != null ? (Math.abs(effPct - p.expectPct) <= 0.25 ? '  ✓ near expected' : `  ⚠ expected ≈${p.expectPct}%`) : '';
    console.log(`    ${l.name.slice(0, 40).padEnd(40)} ${money(l.amount).padStart(9)}   ${effPct.toFixed(2)}%${flag}`);
  }
}

console.log('\n' + '═'.repeat(78));
console.log(`  ${produced} produced a local tax · ${empty} came back empty · ${errored} errored`);
console.log('  ● = local tax computed   ○ = no local line   ✗ = engine error');
console.log('═'.repeat(78) + '\n');

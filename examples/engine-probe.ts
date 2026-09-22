import { calculatePaycheck } from '../src/calculate.ts';
import type { PaycheckInput, PaycheckResult, TaxLine, Deduction, Earning } from '../src/types.ts';

/**
 * Federal + cross-cutting correctness probe. Unlike the local probe (which
 * eyeballs rates), this ASSERTS exact expected cents against known 2026 rules:
 * Social Security wage-base cap, Additional Medicare threshold, supplemental
 * flat rates, pre-tax base treatment, and the FUTA cap. Any ✗ is a real
 * finding worth chasing.
 *
 *   npm run probe:engine
 */

const money = (c: number) => (c < 0 ? '-' : '') + '$' + (Math.abs(c) / 100).toFixed(2);
let pass = 0, fail = 0;

function line(r: PaycheckResult, id: string): TaxLine | undefined {
  return r.taxes.find((t) => t.id === id);
}

function check(label: string, actual: number, expected: number, note = ''): void {
  const ok = actual === expected;
  ok ? pass++ : fail++;
  const mark = ok ? '✓' : '✗';
  const detail = ok ? money(actual) : `got ${money(actual)}, expected ${money(expected)}`;
  console.log(`  ${mark} ${label.padEnd(52)} ${detail}${note ? '   ' + note : ''}`);
}

const base = (over: Partial<PaycheckInput> = {}): PaycheckInput => ({
  checkDate: '2026-09-15',
  payFrequency: 'biweekly',
  earnings: [{ code: 'REG', category: 'regular', amount: 1000000 }], // $10,000
  deductions: [],
  federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
  ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
  ...over,
});
const run = (over: Partial<PaycheckInput> = {}) => calculatePaycheck(base(over));

console.log('\n' + '═'.repeat(76));
console.log('  OMNIA ENGINE CORRECTNESS PROBE — 2026 federal rules, asserted to the cent');
console.log('═'.repeat(76));

// ── Social Security wage-base cap ($184,500 @ 6.2%) ──────────────────
console.log('\n Social Security wage base ($184,500 @ 6.2%):');
{
  // $180,000 YTD, $10,000 check → only $4,500 remains taxable → 6.2% = $279.00
  const r = run({ ytd: { socialSecurity: 18000000, medicare: 0, futa: 0 } });
  check('near cap: $4,500 remaining taxable', line(r, 'US_SS_EE')!.amount, 27900, '($4,500 × 6.2%)');
}
{
  // Already at the cap → $0
  const r = run({ ytd: { socialSecurity: 18450000, medicare: 0, futa: 0 } });
  check('at cap: no more SS withheld', line(r, 'US_SS_EE')?.amount ?? 0, 0);
}
{
  // Fresh: full $10,000 taxable → $620.00
  const r = run();
  check('under cap: full wages taxable', line(r, 'US_SS_EE')!.amount, 62000, '($10,000 × 6.2%)');
}

// ── Additional Medicare (0.9% over $200,000 YTD, employee only) ──────
console.log('\n Additional Medicare (0.9% over $200,000, employee only):');
{
  // $195,000 YTD + $10,000 → $5,000 crosses $200k → additional 0.9% = $45; base stays $145
  const r = run({ ytd: { socialSecurity: 0, medicare: 19500000, futa: 0 } });
  check('base Medicare unchanged', line(r, 'US_MED_EE')!.amount, 14500, '(1.45% on $10,000)');
  check('additional 0.9% on the $5,000 over $200k', line(r, 'US_MED_ADDL')!.amount, 4500);
  check('employer NOT charged additional', line(r, 'US_MED_ER')!.amount, 14500, '(stays 1.45%)');
}
{
  // Fully over threshold: additional 0.9% on the full $10,000 = $90
  const r = run({ ytd: { socialSecurity: 0, medicare: 21000000, futa: 0 } });
  check('fully over $200k: additional on full wages', line(r, 'US_MED_ADDL')!.amount, 9000, '(0.9% on $10,000)');
}

// ── Supplemental wages (flat 22%, then 37% over $1,000,000) ──────────
console.log('\n Supplemental wages (flat 22% / 37% over $1M):');
{
  const bonus: Earning[] = [{ code: 'BONUS', category: 'supplemental', amount: 1000000 }];
  const r = run({ earnings: bonus });
  check('bonus flat federal rate', line(r, "US_FIT_SUPP")!.amount, 220000, '($10,000 × 22%)');
}
{
  const bonus: Earning[] = [{ code: 'BONUS', category: 'supplemental', amount: 1000000 }];
  const r = run({ earnings: bonus, ytd: { socialSecurity: 0, medicare: 0, futa: 0, supplemental: 100000000 } });
  check('bonus over $1M YTD supplemental', line(r, "US_FIT_SUPP")!.amount, 370000, '($10,000 × 37%)');
}

// ── Pre-tax base treatment (the spine of the engine) ────────────────
console.log('\n Pre-tax deductions reduce the RIGHT bases:');
{
  // 401(k): reduces federal/state income base, NOT Social Security base.
  const d: Deduction[] = [{ code: '401K', category: 'deferral_401k', amount: 100000 }]; // $1,000
  const r = run({ deductions: d });
  check('401(k): SS base unchanged (still $10,000)', line(r, 'US_SS_EE')!.taxableWages, 1000000);
}
{
  // Section 125 (cafeteria): reduces Social Security base too.
  const d: Deduction[] = [{ code: 'MED', category: 'section125', amount: 100000 }]; // $1,000
  const r = run({ deductions: d });
  check('Section 125: SS base reduced to $9,000', line(r, 'US_SS_EE')!.taxableWages, 900000);
}

// ── FUTA employer cap ($7,000 base @ 0.6% net) ──────────────────────
console.log('\n FUTA employer cap ($7,000 base @ 0.6% net):');
{
  const r = run(); // $0 YTD, $10,000 check → capped at $7,000 base
  check('capped at $7,000 base', line(r, 'US_FUTA')?.amount ?? 0, 4200, '($7,000 × 0.6%)');
}
{
  const r = run({ ytd: { socialSecurity: 0, medicare: 0, futa: 700000 } }); // already at base
  check('exhausted: no more FUTA', line(r, 'US_FUTA')?.amount ?? 0, 0);
}

console.log('\n' + '═'.repeat(76));
console.log(`  ${pass} passed · ${fail} failed`);
console.log('═'.repeat(76) + '\n');
if (fail > 0) process.exitCode = 1;

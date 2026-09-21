import { calculatePaycheck } from '../src/calculate.ts';
import type { PaycheckInput, PaycheckResult, TaxLine } from '../src/types.ts';

/**
 * Accuracy benchmark: Omnia vs. PaycheckCity (Symmetry Software's public
 * calculator — the industry-standard engine your competitors license).
 *
 * WHY THIS EXISTS
 * The whole Omnia sales pitch is "trust our numbers." This turns that into
 * evidence: run the exact same paycheck through Omnia and through
 * PaycheckCity, line by line, and show where they agree — down to the cent.
 * A green table across the hard jurisdictions is the single most persuasive
 * thing you can put in front of a payroll company.
 *
 * HOW TO USE IT
 *   1. Run it once:            npm run compare:paycheckcity
 *      For each scenario it prints Omnia's numbers AND the exact recipe to
 *      type into https://www.paycheckcity.com (Salary or Hourly calculator).
 *   2. Enter that recipe on PaycheckCity, read back its numbers.
 *   3. Paste those into the scenario's `reference` block below (in CENTS).
 *   4. Run it again — now it diffs the two and marks each line
 *      ✓ exact · ≈ within tolerance · ✗ off · — no reference yet.
 *   5. Attach the result to your outreach:  npm run compare:paycheckcity -- --md
 *
 * NOTE ON ROUNDING: two correct engines can differ by a cent or two on a
 * line because of legal rounding choices (whole-dollar withholding, order of
 * rounding). TOLERANCE_CENTS treats those as a match; a bigger gap is a real
 * difference worth investigating.
 */

const TOLERANCE_CENTS = Number(process.env.TOLERANCE_CENTS ?? 2);
const AS_MARKDOWN = process.argv.includes('--md');

type Cents = number;

/** The employee-side figures PaycheckCity reports. All in integer cents. */
interface Reference {
  federalIncomeTax?: Cents | null;
  socialSecurity?: Cents | null;
  medicare?: Cents | null;
  stateIncomeTax?: Cents | null;
  /** SDI / PFML / FLI / disability — any employee state tax that isn't income tax. */
  stateOtherEE?: Cents | null;
  local?: Cents | null;
  netPay?: Cents | null;
}

interface Scenario {
  id: string;
  label: string;
  /** Human recipe to reproduce on PaycheckCity. */
  recipe: string;
  input: PaycheckInput;
  reference: Reference;
}

// ---------------------------------------------------------------------
// Scenario helpers
// ---------------------------------------------------------------------

const w4 = (over: Partial<PaycheckInput['federalW4']> = {}): PaycheckInput['federalW4'] => ({
  filingStatus: 'single',
  multipleJobs: false,
  dependentCredit: 0,
  otherIncome: 0,
  deductions: 0,
  extraWithholding: 0,
  ...over,
});
const ytd0 = () => ({ socialSecurity: 0, medicare: 0, futa: 0 });
const reg = (amount: Cents) => [{ code: 'REG', category: 'regular' as const, amount }];
const noRef = (): Reference => ({
  federalIncomeTax: null, socialSecurity: null, medicare: null,
  stateIncomeTax: null, stateOtherEE: null, local: null, netPay: null,
});

// ---------------------------------------------------------------------
// The scenarios. Fill in `reference` (cents) from PaycheckCity as you go.
// Chosen to cover the jurisdictions the outreach emails actually pitch.
// ---------------------------------------------------------------------

const SCENARIOS: Scenario[] = [
  {
    id: 'tx-fed-fica',
    label: 'Texas — federal + FICA only (no state income tax)',
    recipe: 'Salary · TX · biweekly · gross $2,500.00 · Single · no dependents · no pre-tax',
    input: { checkDate: '2026-06-15', payFrequency: 'biweekly', earnings: reg(250000), deductions: [], federalW4: w4(), ytd: ytd0(), workState: { code: 'TX' } },
    reference: noRef(),
  },
  {
    id: 'oh-plain',
    label: 'Ohio — single, biweekly, no pre-tax',
    recipe: 'Salary · OH · biweekly · gross $3,000.00 · Single · no local city',
    input: { checkDate: '2026-06-15', payFrequency: 'biweekly', earnings: reg(300000), deductions: [], federalW4: w4(), ytd: ytd0(), workState: { code: 'OH' } },
    // Read from paycheckcity.com on 2026-09-21 (verified via browser).
    reference: { federalIncomeTax: 32038, socialSecurity: 18600, medicare: 4350, stateIncomeTax: 7577, stateOtherEE: 0, local: 0, netPay: 237435 },
  },
  {
    id: 'pa-flat',
    label: 'Pennsylvania — flat 3.07%, single, biweekly',
    recipe: 'Salary · PA · biweekly · gross $2,800.00 · Single · no local EIT',
    input: { checkDate: '2026-06-15', payFrequency: 'biweekly', earnings: reg(280000), deductions: [], federalW4: w4(), ytd: ytd0(), workState: { code: 'PA' } },
    // Read from paycheckcity.com on 2026-09-21 (verified via browser).
    reference: { federalIncomeTax: 27638, socialSecurity: 17360, medicare: 4060, stateIncomeTax: 8596, stateOtherEE: 196, local: 0, netPay: 222150 },
  },
  {
    id: 'ca-sdi',
    label: 'California — single, biweekly (watch CA SDI as a separate line)',
    recipe: 'Salary · CA · biweekly · gross $3,500.00 · Single · no pre-tax',
    input: { checkDate: '2026-06-15', payFrequency: 'biweekly', earnings: reg(350000), deductions: [], federalW4: w4(), ytd: ytd0(), workState: { code: 'CA' } },
    reference: noRef(),
  },
  {
    id: 'ny-state',
    label: 'New York State (not NYC) — single, biweekly',
    recipe: 'Salary · NY · biweekly · gross $3,200.00 · Single · NOT a NYC resident',
    input: { checkDate: '2026-06-15', payFrequency: 'biweekly', earnings: reg(320000), deductions: [], federalW4: w4(), ytd: ytd0(), workState: { code: 'NY' } },
    reference: noRef(),
  },
  {
    id: 'nyc-resident',
    label: 'New York City resident — single, biweekly (local NYC tax)',
    recipe: 'Salary · NY · biweekly · gross $3,200.00 · Single · YES a NYC resident',
    input: { checkDate: '2026-06-15', payFrequency: 'biweekly', earnings: reg(320000), deductions: [], federalW4: w4(), ytd: ytd0(), workState: { code: 'NY', certificate: { nycResident: true } }, residenceState: { code: 'NY', certificate: { nycResident: true } } },
    reference: noRef(),
  },
  {
    id: 'nj-fli-sdi',
    label: 'New Jersey — single, biweekly (FLI/SDI as separate lines)',
    recipe: 'Salary · NJ · biweekly · gross $2,900.00 · Single · no pre-tax',
    input: { checkDate: '2026-06-15', payFrequency: 'biweekly', earnings: reg(290000), deductions: [], federalW4: w4(), ytd: ytd0(), workState: { code: 'NJ' } },
    reference: noRef(),
  },
  {
    id: 'or-state',
    label: 'Oregon — single, biweekly (statewide transit + Paid Leave lines)',
    recipe: 'Salary · OR · biweekly · gross $2,700.00 · Single · no local',
    input: { checkDate: '2026-06-15', payFrequency: 'biweekly', earnings: reg(270000), deductions: [], federalW4: w4(), ytd: ytd0(), workState: { code: 'OR' } },
    reference: noRef(),
  },
  {
    id: 'az-flat',
    label: 'Arizona — single, biweekly (flat rate)',
    recipe: 'Salary · AZ · biweekly · gross $2,400.00 · Single · AZ withholding 2.0% election',
    input: { checkDate: '2026-06-15', payFrequency: 'biweekly', earnings: reg(240000), deductions: [], federalW4: w4(), ytd: ytd0(), workState: { code: 'AZ' } },
    reference: noRef(),
  },
  {
    id: 'oh-married-monthly',
    label: 'Ohio — married filing jointly, monthly, 2 dependents',
    recipe: 'Salary · OH · monthly · gross $6,000.00 · Married filing jointly · Step 3 dependents $4,000.00',
    input: { checkDate: '2026-06-15', payFrequency: 'monthly', earnings: reg(600000), deductions: [], federalW4: w4({ filingStatus: 'married_joint', dependentCredit: 400000 }), ytd: ytd0(), workState: { code: 'OH' } },
    reference: noRef(),
  },
];

// ---------------------------------------------------------------------
// Map Omnia's tax lines into the categories PaycheckCity reports.
// ---------------------------------------------------------------------

const sum = (lines: TaxLine[]) => lines.reduce((t, l) => t + l.amount, 0);

interface OmniaFigures {
  federalIncomeTax: Cents;
  socialSecurity: Cents;
  medicare: Cents;
  stateIncomeTax: Cents;
  stateOtherEE: Cents;
  local: Cents;
  netPay: Cents;
  employeeLines: TaxLine[];
}

function omniaFigures(result: PaycheckResult): OmniaFigures {
  const ee = result.taxes.filter((t) => t.payer === 'employee');
  const isStateIncome = (t: TaxLine) => t.jurisdiction === 'state' && /income tax/i.test(t.name);
  return {
    federalIncomeTax: sum(ee.filter((t) => t.id === 'US_FIT')),
    socialSecurity: sum(ee.filter((t) => t.id === 'US_SS_EE')),
    medicare: sum(ee.filter((t) => t.id === 'US_MED_EE' || t.id === 'US_ADDL_MED_EE')),
    stateIncomeTax: sum(ee.filter(isStateIncome)),
    stateOtherEE: sum(ee.filter((t) => t.jurisdiction === 'state' && !isStateIncome(t))),
    local: sum(ee.filter((t) => t.jurisdiction === 'local')),
    netPay: result.netPay,
    employeeLines: ee,
  };
}

// ---------------------------------------------------------------------
// Compare + render
// ---------------------------------------------------------------------

const dollars = (c: Cents | null | undefined) => (c == null ? '—' : (c < 0 ? '-' : '') + '$' + (Math.abs(c) / 100).toFixed(2));

type Mark = '✓' | '≈' | '✗' | '—';
function mark(omnia: Cents, ref: Cents | null | undefined): Mark {
  if (ref == null) return '—';
  const d = Math.abs(omnia - ref);
  if (d === 0) return '✓';
  if (d <= TOLERANCE_CENTS) return '≈';
  return '✗';
}

const ROWS: Array<{ key: keyof Reference; label: string }> = [
  { key: 'federalIncomeTax', label: 'Federal income tax' },
  { key: 'socialSecurity', label: 'Social Security' },
  { key: 'medicare', label: 'Medicare' },
  { key: 'stateIncomeTax', label: 'State income tax' },
  { key: 'stateOtherEE', label: 'State SDI/PFML/FLI' },
  { key: 'local', label: 'Local tax' },
  { key: 'netPay', label: 'NET PAY' },
];

interface Tally { exact: number; near: number; off: number; missing: number; }

function renderScenario(s: Scenario, tally: Tally): string[] {
  const out: string[] = [];
  const result = calculatePaycheck(s.input);
  const f = omniaFigures(result);
  const omniaBy: Record<keyof Reference, Cents> = {
    federalIncomeTax: f.federalIncomeTax, socialSecurity: f.socialSecurity, medicare: f.medicare,
    stateIncomeTax: f.stateIncomeTax, stateOtherEE: f.stateOtherEE, local: f.local, netPay: f.netPay,
  };

  if (AS_MARKDOWN) {
    out.push(`### ${s.label}`, '', `_Recipe: ${s.recipe}_`, '', '| Line | Omnia | PaycheckCity | Δ | |', '|---|--:|--:|--:|:-:|');
  } else {
    out.push('', `━━ ${s.label}`, `   PaycheckCity recipe: ${s.recipe}`, '   ' + '-'.repeat(66), `   ${'Line'.padEnd(22)}${'Omnia'.padStart(12)}${'PaycheckCity'.padStart(14)}${'Δ'.padStart(10)}  `);
  }

  for (const row of ROWS) {
    const o = omniaBy[row.key];
    const r = s.reference[row.key];
    // Skip rows that are zero on both sides and have no reference (keeps it tidy).
    if (o === 0 && r == null && row.key !== 'netPay') continue;
    const m = mark(o, r);
    if (r != null) {
      if (m === '✓') tally.exact++; else if (m === '≈') tally.near++; else tally.off++;
    } else if (row.key === 'netPay' || o !== 0) {
      tally.missing++;
    }
    const delta = r == null ? '—' : dollars(o - r);
    if (AS_MARKDOWN) {
      out.push(`| ${row.label} | ${dollars(o)} | ${dollars(r)} | ${delta} | ${m} |`);
    } else {
      out.push(`   ${row.label.padEnd(22)}${dollars(o).padStart(12)}${dollars(r).padStart(14)}${delta.padStart(10)}  ${m}`);
    }
  }

  // Always show Omnia's raw employee lines so you can eyeball the breakdown.
  if (!AS_MARKDOWN) {
    out.push('   ' + '·'.repeat(66), '   Omnia employee lines:');
    for (const l of f.employeeLines) out.push(`     ${l.id.padEnd(16)} ${l.name.slice(0, 34).padEnd(34)} ${dollars(l.amount).padStart(11)}`);
  }
  return out;
}

function main(): void {
  const tally: Tally = { exact: 0, near: 0, off: 0, missing: 0 };
  const lines: string[] = [];

  if (AS_MARKDOWN) {
    lines.push('# Omnia vs. PaycheckCity — accuracy benchmark', '', `_Generated ${new Date().toISOString().slice(0, 10)}. ✓ exact · ≈ within ${TOLERANCE_CENTS}¢ · ✗ differs. All figures employee-side._`, '');
  } else {
    lines.push('', '═'.repeat(70), '  OMNIA  vs  PAYCHECKCITY  (Symmetry) — accuracy benchmark', `  ✓ exact · ≈ within ${TOLERANCE_CENTS}¢ · ✗ differs · — no reference entered yet`, '═'.repeat(70));
  }

  for (const s of SCENARIOS) lines.push(...renderScenario(s, tally));

  const compared = tally.exact + tally.near + tally.off;
  lines.push('', AS_MARKDOWN ? '---' : '═'.repeat(70));
  if (compared === 0) {
    lines.push(
      AS_MARKDOWN ? '**No PaycheckCity references entered yet.**' : '  No PaycheckCity references entered yet.',
      '  Next: run each recipe above on paycheckcity.com and paste its numbers',
      '  (in cents) into each scenario\'s `reference` block, then run again.',
    );
  } else {
    lines.push(
      `  Compared ${compared} lines across ${SCENARIOS.length} scenarios:`,
      `    ✓ exact:  ${tally.exact}`,
      `    ≈ within ${TOLERANCE_CENTS}¢: ${tally.near}`,
      `    ✗ differ: ${tally.off}`,
      tally.missing ? `  (${tally.missing} Omnia lines still awaiting a PaycheckCity reference.)` : '',
      tally.off === 0
        ? '  → Every referenced line matches. That is your proof — attach it.'
        : '  → Investigate the ✗ lines: which engine is right, and why?',
    );
  }
  lines.push(AS_MARKDOWN ? '' : '═'.repeat(70), '');
  console.log(lines.filter((l) => l !== undefined).join('\n'));
}

main();

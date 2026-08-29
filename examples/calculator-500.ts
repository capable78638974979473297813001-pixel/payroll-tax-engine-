import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { calculatePaycheck } from '../src/calculate.ts';
import { dollars } from '../src/money.ts';
import { PERIODS_PER_YEAR } from '../src/types.ts';
import type { FilingStatus, PayFrequency, PaycheckInput } from '../src/types.ts';

/**
 * 500 real assertion-based test cases run straight through this repo's own
 * calculatePaycheck() — the exact function the general calculator UI calls
 * (see calculator-server.ts). Each case is a randomized-but-realistic W-2
 * scenario cycled across every state this repo has 2026 data for, checked
 * against invariants that must hold for ANY correct payroll calculation:
 * net pay never exceeds gross, the paystub's own numbers foot to the
 * penny, no tax line is negative or non-finite, and FICA matches its
 * statutory rate. This is not a fuzzer for crash-only bugs — it re-derives
 * the expected number for the flat-rate taxes and compares.
 *
 *   node examples/calculator-500.ts
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_STATES_DIR = join(HERE, '..', 'data', 'states');

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260828);

function stateCodes(): string[] {
  return readdirSync(DATA_STATES_DIR)
    .filter((f) => f.endsWith('-2026.json'))
    .map((f) => (JSON.parse(readFileSync(join(DATA_STATES_DIR, f), 'utf8')) as { code: string }).code)
    .sort();
}

const CODES = stateCodes();
const FILING: FilingStatus[] = ['single', 'married_joint', 'head_of_household'];
const FREQ: PayFrequency[] = [
  'weekly',
  'biweekly',
  'semimonthly',
  'monthly',
  'quarterly',
  'semiannual',
  'annual',
  'daily',
];

interface CaseResult {
  n: number;
  stateCode: string | null;
  annualGross: number;
  freq: PayFrequency;
  filingStatus: FilingStatus;
  problems: string[];
}

const results: CaseResult[] = [];
const skipped: { n: number; stateCode: string; freq: PayFrequency }[] = [];
let pass = 0;
let n = -1;
let attempts = 0;

while (pass + results.length < 500 && attempts < 5000) {
  attempts++;
  n++;
  const stateCode = n % 10 === 0 ? null : CODES[n % CODES.length]; // 1 in 10 federal-only, rest cycle every state
  const annualGross = Math.round(15_000 + rand() * 485_000);
  const filingStatus = FILING[Math.floor(rand() * FILING.length)];
  const freq = FREQ[Math.floor(rand() * FREQ.length)];
  const periodsPerYear = PERIODS_PER_YEAR[freq];
  const periodGrossCents = Math.round(dollars(annualGross) / periodsPerYear);
  const dependentCredit = dollars([0, 2000, 4000, 6000][Math.floor(rand() * 4)]);
  // Capped relative to the period's own gross pay — an extra-withholding
  // election larger than what a period actually pays is a real possible
  // W-4 mistake, but it manufactures a negative net pay that has nothing
  // to do with whether the TAX CALCULATION itself is correct.
  const extraWithholding = Math.min(dollars(Math.floor(rand() * 4) * 25), Math.floor(periodGrossCents * 0.2));
  const exempt = rand() < 0.05; // 5% of cases claim full federal exemption

  const input: PaycheckInput = {
    checkDate: '2026-06-15',
    payFrequency: freq,
    earnings: [{ code: 'REG', category: 'regular', amount: periodGrossCents }],
    deductions: [],
    federalW4: {
      filingStatus,
      multipleJobs: rand() < 0.2,
      dependentCredit,
      otherIncome: 0,
      deductions: 0,
      extraWithholding,
      ...(exempt ? { exempt: true } : {}),
    },
    ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
    ...(stateCode ? { workState: { code: stateCode, certificate: {} } } : {}),
  };

  const problems: string[] = [];
  try {
    const result = calculatePaycheck(input);

    if (!Number.isFinite(result.netPay)) problems.push('netPay is not finite');
    if (!Number.isFinite(result.grossPay)) problems.push('grossPay is not finite');
    if (result.netPay < 0) problems.push(`netPay is negative: ${result.netPay}`);
    if (result.netPay > result.grossPay) problems.push(`netPay (${result.netPay}) exceeds grossPay (${result.grossPay})`);
    if (result.grossPay !== periodGrossCents) {
      problems.push(`grossPay (${result.grossPay}) != requested period gross (${periodGrossCents})`);
    }

    const footed =
      result.grossPay - result.pretaxDeductions - result.employeeTaxTotal - result.posttaxDeductions;
    if (Math.abs(footed - result.netPay) > 1) {
      problems.push(`paystub does not foot: gross-pretax-tax-posttax=${footed}, netPay=${result.netPay}`);
    }

    const employeeLines = result.taxes.filter((t) => t.payer === 'employee');
    const employerLines = result.taxes.filter((t) => t.payer === 'employer');
    const employeeSum = employeeLines.reduce((s, l) => s + l.amount, 0);
    const employerSum = employerLines.reduce((s, l) => s + l.amount, 0);
    if (Math.abs(employeeSum - result.employeeTaxTotal) > 1) {
      problems.push(`employee tax lines sum to ${employeeSum}, but employeeTaxTotal=${result.employeeTaxTotal}`);
    }
    if (Math.abs(employerSum - result.employerTaxTotal) > 1) {
      problems.push(`employer tax lines sum to ${employerSum}, but employerTaxTotal=${result.employerTaxTotal}`);
    }
    for (const line of result.taxes) {
      if (!Number.isFinite(line.amount)) problems.push(`${line.name}: amount not finite`);
      if (line.amount < 0) problems.push(`${line.name}: negative withholding ${line.amount}`);
    }

    const ss = employeeLines.find((l) => l.name === 'Social Security');
    if (ss && ss.taxableWages > 0) {
      const expected = Math.round(ss.taxableWages * 0.062);
      if (Math.abs(ss.amount - expected) > 1) {
        problems.push(`Social Security ${ss.amount} != 6.2% of taxable wages (expected ${expected})`);
      }
    }
    const medicare = employeeLines.find((l) => l.name === 'Medicare');
    if (medicare && medicare.taxableWages > 0) {
      const expectedBase = Math.round(medicare.taxableWages * 0.0145);
      if (medicare.amount < expectedBase - 1) {
        problems.push(`Medicare ${medicare.amount} is below the base 1.45% floor (${expectedBase})`);
      }
    }

    if (exempt) {
      const fed = employeeLines.find((l) => l.name === 'Federal Income Tax');
      if (fed && fed.amount !== 0) problems.push(`federalW4.exempt=true but Federal Income Tax withheld ${fed.amount}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Not a bug: this engine deliberately refuses to guess an annualizing
    // multiplier a state's own withholding guidance never published for a
    // given pay frequency (see src/taxes/state.ts), rather than silently
    // producing a wrong number. Regenerate a different case instead of
    // counting a correct refusal as a failure.
    if (/(doesn't|don't) publish/.test(message) && stateCode) {
      skipped.push({ n, stateCode, freq });
      continue;
    }
    problems.push(`threw: ${message}`);
  }

  if (problems.length === 0) pass++;
  else results.push({ n, stateCode, annualGross, freq, filingStatus, problems });
}

console.log(
  `\n500-case calculator check — ${pass}/500 passed, ${results.length} failed` +
    (skipped.length ? ` (${skipped.length} state/frequency combos correctly refused as unsupported, regenerated)` : '') +
    '\n',
);
if (results.length > 0) {
  for (const r of results.slice(0, 30)) {
    console.log(
      `#${r.n} state=${r.stateCode ?? 'federal-only'} annualGross=$${r.annualGross} ${r.freq} ${r.filingStatus}`,
    );
    for (const p of r.problems) console.log(`    - ${p}`);
  }
  if (results.length > 30) console.log(`  ... and ${results.length - 30} more`);
  process.exitCode = 1;
} else {
  console.log('All 500 cases satisfied every invariant (net<=gross, paystub foots, FICA matches statutory rate, no negative/NaN lines, exempt => $0 federal).');
}

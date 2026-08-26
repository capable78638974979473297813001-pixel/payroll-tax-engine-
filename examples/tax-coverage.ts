import { calculatePaycheck } from '../src/calculate.ts';
import { dollars } from '../src/money.ts';
import { hasStateRuleset } from '../src/registry.ts';
import type { PaycheckInput, TaxLine } from '../src/types.ts';

/**
 * What can this engine actually compute, in every state?
 *
 * Not a claim — a measurement, re-runnable with `npm run coverage:taxes`.
 * It runs the same ordinary employee through all 51 jurisdictions and
 * prints the tax lines that come back, so "does it handle every state" has
 * an answer produced by the engine rather than by a README.
 *
 * The employee is deliberately plain: $3,000 biweekly, single, no
 * dependents, no local certificate fields. Local taxes that require a
 * caller-supplied jurisdiction (Ohio's municipalities, Pennsylvania's PSD
 * codes, Kentucky's counties) therefore do NOT appear here — their absence
 * is a property of this sample, not of the engine, and the second section
 * exercises them separately.
 *
 * Needs no network: every figure comes from the jurisdiction files.
 */

const CHECK_DATE = '2026-08-15';
const STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM',
  'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA',
  'WV', 'WI', 'WY',
];

function baseInput(overrides: Partial<PaycheckInput> = {}): PaycheckInput {
  return {
    checkDate: CHECK_DATE,
    payFrequency: 'biweekly',
    earnings: [{ code: 'REG', category: 'regular', amount: dollars(3000) }],
    deductions: [],
    federalW4: {
      filingStatus: 'single',
      multipleJobs: false,
      dependentCredit: 0,
      otherIncome: 0,
      deductions: 0,
      extraWithholding: 0,
    },
    ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
    ...overrides,
  } as PaycheckInput;
}

interface StateRow {
  state: string;
  stateLines: string[];
  employerLines: string[];
  error: string | null;
}

const rows: StateRow[] = [];

for (const state of STATES) {
  if (!hasStateRuleset(state, CHECK_DATE)) {
    rows.push({ state, stateLines: [], employerLines: [], error: 'no ruleset file' });
    continue;
  }
  try {
    const result = calculatePaycheck(
      baseInput({ workState: { code: state, certificate: {} } }),
    );
    const own = (line: TaxLine) => line.jurisdiction !== 'federal';
    rows.push({
      state,
      stateLines: result.taxes.filter((l) => own(l) && l.payer === 'employee').map((l) => l.id),
      employerLines: result.taxes.filter((l) => own(l) && l.payer === 'employer').map((l) => l.id),
      error: null,
    });
  } catch (err) {
    rows.push({
      state,
      stateLines: [],
      employerLines: [],
      error: err instanceof Error ? err.message.slice(0, 70) : String(err).slice(0, 70),
    });
  }
}

console.log(`\n  Ordinary employee, $3,000 biweekly, in each of ${STATES.length} jurisdictions\n`);
console.log(`  ${'ST'.padEnd(4)}${'WITHHELD FROM EMPLOYEE'.padEnd(46)}EMPLOYER-BORNE`);
console.log(`  ${'-'.repeat(96)}`);
for (const row of rows) {
  const withheld = row.error ? `\x1b[31m${row.error}\x1b[0m` : row.stateLines.join(' ') || '(none — no state income tax)';
  console.log(`  ${row.state.padEnd(4)}${withheld.padEnd(46)}${row.employerLines.join(' ')}`);
}

// --- summary ------------------------------------------------------------
const errored = rows.filter((r) => r.error);
const withIncomeTax = rows.filter((r) => r.stateLines.some((id) => id.endsWith('_SIT')));
const withEmployerSui = rows.filter((r) => r.employerLines.some((id) => id.endsWith('_SUI_ER')));
const withEmployeeLevies = rows.filter((r) =>
  r.stateLines.some((id) => /_UC_EE|_PFML_EE|_DBL_EE|_LTC_EE/.test(id)),
);

console.log(`\n  ${'-'.repeat(96)}`);
console.log(`  ${String(rows.length - errored.length).padStart(3)} / ${rows.length}  jurisdictions computed without error`);
console.log(`  ${String(withIncomeTax.length).padStart(3)} / ${rows.length}  levy a state income tax this engine computes`);
console.log(`  ${String(withEmployerSui.length).padStart(3)} / ${rows.length}  produce an employer unemployment line from the published new-employer rate`);
console.log(`  ${String(withEmployeeLevies.length).padStart(3)} / ${rows.length}  withhold a non-income-tax employee levy (UC, paid leave, disability, long-term care)`);
if (errored.length) {
  console.log(`\n  \x1b[31mERRORS: ${errored.map((r) => `${r.state} (${r.error})`).join('; ')}\x1b[0m`);
}

// --- taxes that need a caller-supplied jurisdiction ----------------------
console.log(`\n  Local taxes, which need the jurisdiction a caller resolves from an address:\n`);
const LOCAL_CASES: { label: string; input: PaycheckInput }[] = [
  { label: 'OH municipality (Columbus)', input: baseInput({ workState: { code: 'OH', certificate: { workCity: 'Columbus' } } }) },
  { label: 'OH school district (6901)', input: baseInput({ workState: { code: 'OH', certificate: { schoolDistrictCode: '6901' } } }) },
  { label: 'OH JEDD (zone 9004)', input: baseInput({ workState: { code: 'OH', certificate: { workJEDDId: '9004' } } }) },
  { label: 'PA EIT + LST (PSD 460101)', input: baseInput({ workState: { code: 'PA', certificate: { workPSD: '460101', residencePSD: '460101' } } }) },
  { label: 'MI city (Detroit)', input: baseInput({ workState: { code: 'MI', certificate: { workCity: 'Detroit' } } }) },
  { label: 'IN county (Marion)', input: baseInput({ workState: { code: 'IN', certificate: { county: 'Marion' } } }) },
  { label: 'KY county (Adair County)', input: baseInput({ workState: { code: 'KY', certificate: { workCounty: 'Adair County' } } }) },
  { label: 'AL municipality (Birmingham)', input: baseInput({ workState: { code: 'AL', certificate: { workCity: 'Birmingham' } } }) },
  { label: 'NY City resident', input: baseInput({ workState: { code: 'NY', certificate: { nycResident: true } } }) },
  { label: 'MO earnings tax (Kansas City)', input: baseInput({ workState: { code: 'MO', certificate: { locality: 'Kansas City' } } }) },
  { label: 'NJ Newark payroll (employer)', input: baseInput({ workState: { code: 'NJ', certificate: { locality: 'Newark' } } }) },
  { label: 'OR Multnomah + Metro', input: baseInput({ workState: { code: 'OR', certificate: { multnomahCounty: true, metroDistrict: true } } }) },
  { label: 'CO head tax (Glendale)', input: baseInput({ workState: { code: 'CO', certificate: { locality: 'Glendale', localMonthlyCompensation: dollars(4000) } } }) },
  { label: 'DE Wilmington wage tax', input: baseInput({ workState: { code: 'DE', certificate: { locality: 'Wilmington' } } }) },
  { label: 'WV service fee (Wheeling)', input: baseInput({ workState: { code: 'WV', certificate: { locality: 'Wheeling' } } }) },
];

for (const { label, input } of LOCAL_CASES) {
  try {
    const result = calculatePaycheck(input);
    const local = result.taxes.filter((l) => l.jurisdiction === 'local');
    console.log(
      `  ${label.padEnd(34)}${local.length ? local.map((l) => `${l.id} ${(l.amount / 100).toFixed(2)}`).join('  ') : '\x1b[31mno local line\x1b[0m'}`,
    );
  } catch (err) {
    console.log(`  ${label.padEnd(34)}\x1b[31m${err instanceof Error ? err.message.slice(0, 60) : err}\x1b[0m`);
  }
}

console.log(
  `\n  \x1b[2mThis measures what the engine produces, not whether every figure is\n` +
    `  right — the test suite does that. Taxes deliberately not modelled are\n` +
    `  listed in each jurisdiction file's own knownGaps.\x1b[0m\n`,
);

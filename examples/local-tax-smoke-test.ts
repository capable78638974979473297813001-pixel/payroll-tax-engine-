import { calculatePaycheck } from '../src/calculate.ts';
import { dollars } from '../src/money.ts';
import type { PaycheckInput, PayFrequency } from '../src/types.ts';

/**
 * A same-jurisdiction smoke test for every state with a real local income
 * tax this engine computes.
 *
 * Deliberately SIMPLE: every scenario is one employee who lives and works
 * in the same city/county (no residence-vs-work-location split, no
 * reciprocity, no multi-state anything) — this is a "does the engine run
 * and produce a sane number for ordinary local jurisdictions" pass, not a
 * verification against a second calculator (see docs/geocoding-coverage.md
 * and this project's README for why an external comparison site couldn't
 * be reached this session). Each state gets 5 runs: 3 "medium" complexity
 * (dependents, pretax deductions, higher pay crossing a bracket) and 2
 * "easy" (flat salary, no deductions).
 *
 * Not part of `npm test` — a manual coverage measurement, like
 * tax-coverage.ts and geocode-coverage.ts.
 */

const CHECK_DATE = '2026-06-15';

type Complexity = 'easy' | 'easy' | 'medium';

interface Scenario {
  label: string;
  complexity: 'easy' | 'medium';
  payFrequency: PayFrequency;
  gross: number; // dollars
  filingStatus: 'single' | 'married_joint' | 'head_of_household';
  dependents: number;
  pretax: number; // dollars, 401k
}

// 2 easy + 3 medium, in that order, applied to 5 localities per state.
const SCENARIOS: Scenario[] = [
  { label: 'E1', complexity: 'easy', payFrequency: 'biweekly', gross: 1200, filingStatus: 'single', dependents: 0, pretax: 0 },
  { label: 'E2', complexity: 'easy', payFrequency: 'semimonthly', gross: 2000, filingStatus: 'married_joint', dependents: 0, pretax: 0 },
  { label: 'M1', complexity: 'medium', payFrequency: 'biweekly', gross: 3500, filingStatus: 'single', dependents: 1, pretax: 150 },
  { label: 'M2', complexity: 'medium', payFrequency: 'monthly', gross: 6500, filingStatus: 'married_joint', dependents: 2, pretax: 300 },
  { label: 'M3', complexity: 'medium', payFrequency: 'weekly', gross: 1400, filingStatus: 'head_of_household', dependents: 1, pretax: 75 },
];

function baseInput(scenario: Scenario, overrides: Partial<PaycheckInput>): PaycheckInput {
  return {
    checkDate: CHECK_DATE,
    payFrequency: scenario.payFrequency,
    earnings: [{ code: 'REG', category: 'regular', amount: dollars(scenario.gross) }],
    deductions: scenario.pretax
      ? [{ code: '401K', category: 'deferral_401k', amount: dollars(scenario.pretax) }]
      : [],
    federalW4: {
      filingStatus: scenario.filingStatus,
      multipleJobs: false,
      dependentCredit: scenario.dependents * 2000,
      otherIncome: 0,
      deductions: 0,
      extraWithholding: 0,
    },
    ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
    ...overrides,
  } as PaycheckInput;
}

interface LocalityCase {
  city: string;
  certificate: Record<string, unknown>;
  ytd?: PaycheckInput['ytd'];
  employer?: PaycheckInput['employer'];
}

interface StateGroup {
  state: string;
  mechanism: string;
  localities: LocalityCase[];
}

const GROUPS: StateGroup[] = [
  {
    state: 'OH',
    mechanism: 'municipal income tax',
    localities: [
      { city: 'Columbus', certificate: { workCity: 'Columbus', residenceCity: 'Columbus' } },
      { city: 'Cleveland', certificate: { workCity: 'Cleveland', residenceCity: 'Cleveland' } },
      { city: 'Cincinnati', certificate: { workCity: 'Cincinnati', residenceCity: 'Cincinnati' } },
      { city: 'Toledo', certificate: { workCity: 'Toledo', residenceCity: 'Toledo' } },
      { city: 'Akron', certificate: { workCity: 'Akron', residenceCity: 'Akron' } },
    ],
  },
  {
    state: 'PA',
    mechanism: 'Act 32 EIT + LST (PSD code)',
    localities: [
      { city: 'Harrisburg (220401)', certificate: { workPSD: '220401', residencePSD: '220401' } },
      { city: 'Allentown (390101)', certificate: { workPSD: '390101', residencePSD: '390101' } },
      { city: 'Erie (250201)', certificate: { workPSD: '250201', residencePSD: '250201' } },
      { city: 'Scranton (350901)', certificate: { workPSD: '350901', residencePSD: '350901' } },
      { city: 'Pittsburgh (700102)', certificate: { workPSD: '700102', residencePSD: '700102' } },
    ],
  },
  {
    state: 'MI',
    mechanism: 'city income tax',
    localities: [
      { city: 'Detroit', certificate: { workCity: 'Detroit', residenceCity: 'Detroit' } },
      { city: 'Grand Rapids', certificate: { workCity: 'Grand Rapids', residenceCity: 'Grand Rapids' } },
      { city: 'Flint', certificate: { workCity: 'Flint', residenceCity: 'Flint' } },
      { city: 'East Lansing', certificate: { workCity: 'East Lansing', residenceCity: 'East Lansing' } },
      { city: 'Battle Creek', certificate: { workCity: 'Battle Creek', residenceCity: 'Battle Creek' } },
    ],
  },
  {
    state: 'KY',
    mechanism: 'occupational tax (county/city)',
    localities: [
      { city: 'Adair County', certificate: { workCounty: 'Adair County', residenceCity: 'Adair County' } },
      { city: 'Allen County', certificate: { workCounty: 'Allen County', residenceCity: 'Allen County' } },
      { city: 'Ashland', certificate: { workCity: 'Ashland', residenceCity: 'Ashland' } },
      { city: 'Alexandria', certificate: { workCity: 'Alexandria', residenceCity: 'Alexandria' } },
      { city: 'Louisville Metro', certificate: { workCounty: 'Jefferson County', residenceCity: 'Jefferson County' } },
    ],
  },
  {
    state: 'IN',
    mechanism: 'county income tax',
    localities: [
      { city: 'Marion', certificate: { county: 'Marion' } },
      { city: 'Lake', certificate: { county: 'Lake' } },
      { city: 'Allen', certificate: { county: 'Allen' } },
      { city: 'Hamilton', certificate: { county: 'Hamilton' } },
      { city: 'St. Joseph', certificate: { county: 'St. Joseph' } },
    ],
  },
  {
    state: 'AL',
    mechanism: 'municipal occupational tax',
    localities: [
      { city: 'Birmingham', certificate: { workCity: 'Birmingham' } },
      { city: 'Bessemer', certificate: { workCity: 'Bessemer' } },
      { city: 'Gadsden', certificate: { workCity: 'Gadsden' } },
      { city: 'Auburn', certificate: { workCity: 'Auburn' } },
      { city: 'Attalla', certificate: { workCity: 'Attalla' } },
    ],
  },
  {
    state: 'MD',
    mechanism: 'county income tax (combined w/ state bracket)',
    localities: [
      { city: 'Montgomery', certificate: { county: 'Montgomery' } },
      { city: 'Baltimore City', certificate: { county: 'BaltimoreCity' } },
      { city: 'Prince George\'s', certificate: { county: 'PrinceGeorges' } },
      { city: 'Anne Arundel', certificate: { county: 'AnneArundel' } },
      { city: 'Howard', certificate: { county: 'Howard' } },
    ],
  },
  {
    state: 'NY',
    mechanism: 'NYC personal income tax / Yonkers surcharge',
    localities: [
      { city: 'NYC resident', certificate: { nycResident: true } },
      { city: 'NYC resident', certificate: { nycResident: true } },
      { city: 'NYC resident', certificate: { nycResident: true } },
      { city: 'Yonkers resident', certificate: { yonkersResident: true } },
      { city: 'Yonkers resident', certificate: { yonkersResident: true } },
    ],
  },
  {
    state: 'MO',
    mechanism: 'earnings tax',
    localities: [
      { city: 'Kansas City', certificate: { locality: 'Kansas City' } },
      { city: 'Kansas City', certificate: { locality: 'Kansas City' } },
      { city: 'Kansas City', certificate: { locality: 'Kansas City' } },
      { city: 'St. Louis', certificate: { locality: 'St. Louis' } },
      { city: 'St. Louis', certificate: { locality: 'St. Louis' } },
    ],
  },
  {
    state: 'NJ',
    mechanism: 'Newark payroll tax (employer)',
    localities: [
      { city: 'Newark', certificate: { locality: 'Newark' } },
      { city: 'Newark', certificate: { locality: 'Newark' } },
      { city: 'Newark', certificate: { locality: 'Newark' } },
      { city: 'Newark', certificate: { locality: 'Newark' } },
      { city: 'Newark', certificate: { locality: 'Newark' } },
    ],
  },
  {
    state: 'OR',
    mechanism: 'Portland/Multnomah + transit district payroll taxes',
    localities: [
      {
        city: 'Metro + Multnomah (over threshold)',
        certificate: { metroDistrict: true, multnomahCounty: true },
        ytd: { socialSecurity: 0, medicare: 0, futa: 0, localIncomeTax: { OR_METRO: dollars(195000), OR_MULTNOMAH: dollars(195000) } },
      },
      { city: 'Metro only (under threshold)', certificate: { metroDistrict: true } },
      { city: 'Multnomah only (under threshold)', certificate: { multnomahCounty: true } },
      { city: 'TriMet (employer)', certificate: { locality: 'TriMet' } },
      { city: 'LTD / Lane Transit (employer)', certificate: { locality: 'LTD' } },
    ],
  },
  {
    state: 'CO',
    mechanism: 'Occupational Privilege Tax (OPT / "head tax")',
    localities: [
      { city: 'Denver', certificate: { locality: 'Denver', localMonthlyCompensation: dollars(4000) } },
      { city: 'Glendale', certificate: { locality: 'Glendale', localMonthlyCompensation: dollars(4000) } },
      { city: 'Greenwood Village', certificate: { locality: 'Greenwood Village', localMonthlyCompensation: dollars(4000) } },
      { city: 'Sheridan', certificate: { locality: 'Sheridan', localMonthlyCompensation: dollars(4000) } },
      { city: 'Aurora (repealed 2025)', certificate: { locality: 'Aurora', localMonthlyCompensation: dollars(4000) } },
    ],
  },
  {
    state: 'DE',
    mechanism: 'Wilmington wage tax',
    localities: [
      { city: 'Wilmington', certificate: { locality: 'Wilmington' } },
      { city: 'Wilmington', certificate: { locality: 'Wilmington' } },
      { city: 'Wilmington', certificate: { locality: 'Wilmington' } },
      { city: 'Wilmington', certificate: { locality: 'Wilmington' } },
      { city: 'Wilmington', certificate: { locality: 'Wilmington' } },
    ],
  },
  {
    state: 'WA',
    mechanism: "Seattle JumpStart payroll tax (employer)",
    localities: [
      { city: 'Seattle (small employer)', certificate: { locality: 'Seattle' } },
      { city: 'Seattle (small employer)', certificate: { locality: 'Seattle' } },
      {
        city: 'Seattle (large employer, high earner)',
        certificate: { locality: 'Seattle' },
        employer: { seattlePriorYearPayrollExpense: dollars(50_000_000) },
        ytd: { socialSecurity: 0, medicare: 0, futa: 0, seattleCompensation: dollars(200_000) },
      },
      {
        city: 'Seattle (large employer, high earner)',
        certificate: { locality: 'Seattle' },
        employer: { seattlePriorYearPayrollExpense: dollars(50_000_000) },
        ytd: { socialSecurity: 0, medicare: 0, futa: 0, seattleCompensation: dollars(200_000) },
      },
      { city: 'Seattle (small employer)', certificate: { locality: 'Seattle' } },
    ],
  },
  {
    state: 'WV',
    mechanism: 'municipal service fee (flat $/week)',
    localities: [
      { city: 'Charleston', certificate: { locality: 'Charleston' } },
      { city: 'Huntington', certificate: { locality: 'Huntington' } },
      { city: 'Morgantown', certificate: { locality: 'Morgantown' } },
      { city: 'Parkersburg', certificate: { locality: 'Parkersburg' } },
      { city: 'Wheeling', certificate: { locality: 'Wheeling' } },
    ],
  },
];

interface ResultRow {
  state: string;
  mechanism: string;
  city: string;
  scenario: string;
  ok: boolean;
  localLines: string;
  error: string | null;
}

const rows: ResultRow[] = [];

for (const group of GROUPS) {
  group.localities.forEach((loc, i) => {
    const scenario = SCENARIOS[i];
    try {
      const input = baseInput(scenario, {
        workState: { code: group.state, certificate: loc.certificate },
        ...(loc.ytd ? { ytd: loc.ytd } : {}),
        ...(loc.employer ? { employer: loc.employer } : {}),
      });
      const result = calculatePaycheck(input);
      const local = result.taxes.filter((l) => l.jurisdiction === 'local');
      rows.push({
        state: group.state,
        mechanism: group.mechanism,
        city: loc.city,
        scenario: `${scenario.label} ($${scenario.gross}/${scenario.payFrequency})`,
        ok: true,
        localLines: local.length
          ? local.map((l) => `${l.id}=$${(l.amount / 100).toFixed(2)}`).join(' ')
          : '(no local line)',
        error: null,
      });
    } catch (err) {
      rows.push({
        state: group.state,
        mechanism: group.mechanism,
        city: loc.city,
        scenario: `${scenario.label} ($${scenario.gross}/${scenario.payFrequency})`,
        ok: false,
        localLines: '',
        error: err instanceof Error ? err.message.slice(0, 90) : String(err).slice(0, 90),
      });
    }
  });
}

console.log(`\n  ${GROUPS.length} states with a real local income tax, 5 same-city scenarios each (3 medium + 2 easy)\n`);
for (const group of GROUPS) {
  console.log(`  ${group.state}  —  ${group.mechanism}`);
  for (const row of rows.filter((r) => r.state === group.state)) {
    const status = row.ok ? `\x1b[32mOK\x1b[0m  ${row.localLines}` : `\x1b[31mFAIL  ${row.error}\x1b[0m`;
    console.log(`    ${row.city.padEnd(28)}${row.scenario.padEnd(26)}${status}`);
  }
  console.log('');
}

const failed = rows.filter((r) => !r.ok);
console.log(`  ${'-'.repeat(70)}`);
console.log(`  ${rows.length - failed.length} / ${rows.length}  scenarios computed without error`);
if (failed.length) {
  console.log(`  \x1b[31mFAILURES:\x1b[0m`);
  for (const f of failed) console.log(`    ${f.state} / ${f.city} / ${f.scenario}: ${f.error}`);
}
console.log(
  `\n  \x1b[2mThis is a same-city (lives-and-works-here), single-jurisdiction smoke\n` +
    `  test of the engine only — no external calculator was reachable this\n` +
    `  session to cross-check against (see README's Known Gaps). A $0/no-line\n` +
    `  result is only a bug if the scenario should plainly owe something —\n` +
    `  Aurora's OPT was repealed 2025-01-01 (correctly $0 for this 2026 check\n` +
    `  date) and Seattle's JumpStart tax correctly produces nothing for a\n` +
    `  small employer (no input.employer.seattlePriorYearPayrollExpense).\x1b[0m\n`,
);

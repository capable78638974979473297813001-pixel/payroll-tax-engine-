import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { calculatePaycheck } from '../src/calculate.ts';
import { dollars } from '../src/money.ts';
import { PERIODS_PER_YEAR } from '../src/types.ts';
import type { FilingStatus, PayFrequency, PaycheckInput } from '../src/types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'pcc-full-cases.json');
const STATES_DIR = join(HERE, '..', 'data', 'states');
function stateFullName(code: string): string {
  const raw = JSON.parse(readFileSync(join(STATES_DIR, `${code}-2026.json`), 'utf8')) as { name: string };
  return raw.name;
}

const HARD: [string, string][] = [
  ['OH', 'ohio'], ['PA', 'pennsylvania'], ['KY', 'kentucky'], ['NY', 'new-york'], ['MI', 'michigan'],
];
const MID: [string, string][] = [
  ['AL', 'alabama'], ['CO', 'colorado'], ['DE', 'delaware'], ['IN', 'indiana'], ['MD', 'maryland'],
  ['MO', 'missouri'], ['NJ', 'new-jersey'], ['OR', 'oregon'], ['WA', 'washington'], ['WV', 'west-virginia'],
  ['CA', 'california'], ['MA', 'massachusetts'], ['HI', 'hawaii'], ['CT', 'connecticut'], ['IA', 'iowa'],
];
const EASY: [string, string][] = [
  ['AK', 'alaska'], ['AZ', 'arizona'], ['AR', 'arkansas'], ['DC', 'washington-dc'], ['FL', 'florida'],
  ['GA', 'georgia'], ['ID', 'idaho'], ['IL', 'illinois'], ['KS', 'kansas'], ['LA', 'louisiana'],
  ['ME', 'maine'], ['MN', 'minnesota'], ['MS', 'mississippi'], ['MT', 'montana'], ['NE', 'nebraska'],
  ['NV', 'nevada'], ['NH', 'new-hampshire'], ['NM', 'new-mexico'], ['NC', 'north-carolina'], ['ND', 'north-dakota'],
  ['OK', 'oklahoma'], ['RI', 'rhode-island'], ['SC', 'south-carolina'], ['SD', 'south-dakota'], ['TN', 'tennessee'],
  ['TX', 'texas'], ['UT', 'utah'], ['VT', 'vermont'], ['VA', 'virginia'], ['WI', 'wisconsin'], ['WY', 'wyoming'],
];

function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(51120260);

const FILING_OPTIONS: { ours: FilingStatus; pcc: string }[] = [
  { ours: 'single', pcc: 'SINGLE' },
  { ours: 'married_joint', pcc: 'MARRIED' },
  { ours: 'head_of_household', pcc: 'HEAD_OF_HOUSEHOLD' },
];
const FREQ_OPTIONS: { ours: PayFrequency; pcc: string }[] = [
  { ours: 'weekly', pcc: 'WEEKLY' },
  { ours: 'biweekly', pcc: 'BI_WEEKLY' },
  { ours: 'semimonthly', pcc: 'SEMI_MONTHLY' },
  { ours: 'monthly', pcc: 'MONTHLY' },
];
const CHECK_DATE = '2026-08-28';
const CHECK_DATE_PCC = '08/28/2026';

/**
 * The systemic fix: ~24 states have their OWN state-level filing-status /
 * marital-status certificate field, entirely separate from the federal W-4
 * filing status — leaving certificate:{} (as the original generator did)
 * meant every one of those states silently used ITS OWN default regardless
 * of which federal status the test case picked, producing mismatches that
 * had nothing to do with the tax math. Mapped here from the federal status
 * so "ours" and the PaycheckCity side (via pccStateParms below) get the
 * SAME state-level status, verified against each state's own dispatch
 * function / STATE_FIELDS options rather than guessed.
 *
 * pccStateParms carries the matching paycheckcity.com field id + value
 * (confirmed live against stateInfo.parms.* on each state's own calculator
 * page) so the browser runner can set it explicitly too, instead of
 * relying on PaycheckCity's own (sometimes different) default.
 */
function stateCertAndPccParms(
  stateCode: string,
  fed: FilingStatus,
): { certificate: Record<string, unknown>; pccStateParms: Record<string, string> } {
  const married = fed === 'married_joint';
  const hoh = fed === 'head_of_household';
  switch (stateCode) {
    case 'AL':
      return {
        certificate: { alabamaExemptionCode: married ? 'M' : hoh ? 'H' : 'S' },
        pccStateParms: { FILINGSTATUS: married ? 'M' : hoh ? 'H' : 'S' },
      };
    case 'CA':
      return {
        certificate: { filingStatus: married ? 'married_one_income' : hoh ? 'hoh' : 'single_or_married_two_incomes' },
        pccStateParms: { FILINGSTATUS: married ? 'M' : hoh ? 'H' : 'S' },
      };
    case 'CO':
      // Our engine only distinguishes 'mfj' vs 'other' (DR 0004 has no
      // separate HOH concept) — PCC's FILINGSTATUS has 4 codes (S/M/MH/H);
      // pinning HOH to 'S' too so both sides use the exact same 'other'
      // schedule rather than risking PCC applying an 'H'-specific table
      // ours has no equivalent for.
      return { certificate: { filingStatus: married ? 'mfj' : 'other' }, pccStateParms: { FILINGSTATUS: married ? 'M' : 'S' } };
    case 'DE':
      return {
        certificate: { maritalStatus: married ? 'married' : 'single' },
        pccStateParms: { FILINGSTATUS: married ? 'M' : 'S' },
      };
    case 'GA':
      return { certificate: { georgiaMaritalStatus: married ? 'C' : 'A' }, pccStateParms: { FILINGSTATUS: married ? 'C' : 'A' } };
    case 'HI':
      return {
        certificate: { hawaiiMaritalStatus: married ? 'married' : 'single' },
        pccStateParms: { FILINGSTATUS: married ? 'M' : 'S' },
      };
    case 'IA':
      return {
        certificate: { maritalStatus: married ? 'mfj' : hoh ? 'hoh' : 'other' },
        pccStateParms: { FILINGSTATUS: married ? 'M' : hoh ? 'H' : 'O' },
      };
    case 'KS':
      return {
        certificate: { allowanceRate: married ? 'joint' : 'single', headOfHousehold: hoh },
        pccStateParms: { FILINGSTATUS: married ? 'MJ' : 'S' },
      };
    case 'MA':
      return { certificate: { headOfHousehold: hoh }, pccStateParms: { HEADOFHOUSEHOLD: hoh ? 'TRUE' : 'FALSE' } };
    case 'ID':
      return {
        certificate: { maritalStatus: married ? 'married' : hoh ? 'hoh' : 'single' },
        pccStateParms: { FILINGSTATUS: married ? 'M' : hoh ? 'MH' : 'S' },
      };
    case 'MD':
      // No PaycheckCity county SELECTOR exists — their form infers county
      // from a City/ZIP address instead (see this file's own doc comment
      // at the call site). Pinning both sides to Montgomery County (flat
      // 3.2%, easy to hand-verify) via certificate.county here and a
      // matching Rockville/20850 address on the PCC side.
      return {
        certificate: { filingStatus: married || hoh ? 'mfjHoh' : 'single', county: 'Montgomery' },
        pccStateParms: { FILINGSTATUS: married || hoh ? 'MH' : 'S' },
      };
    case 'ME':
      return { certificate: { maritalStatus: married ? 'married' : 'single' }, pccStateParms: { FILINGSTATUS: married ? 'M' : 'S' } };
    case 'MN':
      return { certificate: { maritalStatus: married ? 'married' : 'single' }, pccStateParms: { FILINGSTATUS: married ? 'M' : 'S' } };
    case 'MO':
      return {
        certificate: {
          filingStatus: married
            ? 'married_spouse_does_not_work'
            : hoh
              ? 'head_of_household'
              : 'single_or_married_spouse_works_or_mfs',
        },
        pccStateParms: { FILINGSTATUS: married ? 'M' : hoh ? 'H' : 'S' },
      };
    case 'MS':
      return {
        certificate: { filingStatus: married ? 'married' : hoh ? 'head_of_family' : 'single' },
        pccStateParms: { FILINGSTATUS: married ? 'M1' : hoh ? 'H' : 'S' },
      };
    case 'MT':
      // Our engine only distinguishes single vs mfj (no HOH concept) —
      // pinning HOH to 'S' on PCC's side too, same reasoning as CO/UT/OK/WI.
      return { certificate: { filingStatus: married ? 'mfj' : 'single' }, pccStateParms: { FILINGSTATUS: married ? 'M' : 'S' } };
    case 'NC':
      return { certificate: { filingStatus: fed }, pccStateParms: { FILINGSTATUS: married ? 'M' : hoh ? 'H' : 'S' } };
    case 'ND':
      // northDakotaWithholding()'s Section 2 (2020+ W-4, our own engine's
      // default absent certificate.formVintage) reads input.federalW4.
      // filingStatus DIRECTLY — not certificate.maritalStatus — and has a
      // real separate headOfHousehold bracket. PCC's own FILINGSTATUS
      // (S/M/H) matches that 3-way split exactly, so pass HOH through
      // rather than collapsing it to 'S' the way the true 2-option states
      // (ME/MN/OK/UT/WI) need to. PCC's own "2020_W4" toggle defaults to
      // FALSE (their pre-2020 method) but empirically has zero effect on
      // the computed amount — confirmed live, not wired to anything —
      // so it's left alone here.
      return {
        certificate: { maritalStatus: married ? 'married' : 'single' },
        pccStateParms: { FILINGSTATUS: married ? 'M' : hoh ? 'H' : 'S' },
      };
    case 'NJ':
      // NJ-WT's own rule (resolveNJRateTable() in src/taxes/state.ts):
      // single/MFS -> Rate A, MFJ/HOH/QW -> Rate B. PaycheckCity's own
      // RATETABLE field does NOT auto-derive this from FILINGSTATUS the
      // way our engine does (confirmed live: FILINGSTATUS='S' alone left
      // their form on RATETABLE='B') — has to be set explicitly too.
      return {
        certificate: { filingStatus: married ? 'mfj' : hoh ? 'hoh' : 'single' },
        pccStateParms: { FILINGSTATUS: married ? 'MJ' : hoh ? 'H' : 'S', RATETABLE: married || hoh ? 'B' : 'A' },
      };
    case 'NM':
      return { certificate: { filingStatus: fed }, pccStateParms: { FILINGSTATUS: married ? 'M' : hoh ? 'H' : 'S' } };
    case 'NY':
      return {
        certificate: { maritalStatus: married ? 'married' : 'single' },
        pccStateParms: { FILINGSTATUS: married ? 'M' : hoh ? 'MH' : 'S' },
      };
    case 'OK':
      return { certificate: { filingStatus: married ? 'married' : 'single' }, pccStateParms: { FILINGSTATUS: married ? 'M' : 'S' } };
    case 'OR':
      return {
        certificate: { maritalStatus: married ? 'married' : 'single' },
        pccStateParms: { FILINGSTATUS: married ? 'M' : 'S' },
      };
    case 'UT':
      return { certificate: { maritalStatus: married ? 'married' : 'single' }, pccStateParms: { FILINGSTATUS: married ? 'M' : 'S' } };
    case 'VT':
      return {
        certificate: { maritalStatus: married ? 'married' : 'single' },
        pccStateParms: { FILINGSTATUS: married ? 'MJ' : 'S' },
      };
    case 'WI':
      return { certificate: { maritalStatus: married ? 'married' : 'single' }, pccStateParms: { FILINGSTATUS: married ? 'M' : 'S' } };
    default:
      return { certificate: {}, pccStateParms: {} };
  }
}

interface Case {
  n: number; tier: string; stateCode: string; slug: string; annualGross: number;
  freq: PayFrequency; freqPcc: string; filingStatus: FilingStatus; filingStatusPcc: string;
  dependentsAnnual: number; checkDatePcc: string; pccStateParms: Record<string, string>;
  ours: { grossPay: number; federal: number; socialSecurity: number; medicare: number; state: number; netPay: number; otherEmployeeLines: { name: string; amount: number }[] };
}

const cases: Case[] = [];
let n = 0;

function addCases(tier: string, states: [string, string][], count: number) {
  for (const [stateCode, slug] of states) {
    for (let i = 0; i < count; i++) {
      n++;
      const annualGross = Math.round((28_000 + rand() * 272_000) / 100) * 100;
      const filing = FILING_OPTIONS[Math.floor(rand() * FILING_OPTIONS.length)];
      let freq = FREQ_OPTIONS[Math.floor(rand() * FREQ_OPTIONS.length)];
      const dependentsAnnual = [0, 2000, 4000, 6000][Math.floor(rand() * 4)];
      const periodsPerYear = PERIODS_PER_YEAR[freq.ours];
      const periodGrossCents = Math.round(dollars(annualGross) / periodsPerYear);
      const { certificate, pccStateParms } = stateCertAndPccParms(stateCode, filing.ours);

      const input: PaycheckInput = {
        checkDate: CHECK_DATE,
        payFrequency: freq.ours,
        earnings: [{ code: 'REG', category: 'regular', amount: periodGrossCents }],
        deductions: [],
        federalW4: { filingStatus: filing.ours, multipleJobs: false, dependentCredit: dollars(dependentsAnnual), otherIncome: 0, deductions: 0, extraWithholding: 0 },
        ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
        workState: { code: stateCode, certificate },
      };

      let result;
      try {
        result = calculatePaycheck(input);
      } catch {
        freq = FREQ_OPTIONS[1];
        input.payFrequency = 'biweekly';
        input.earnings = [{ code: 'REG', category: 'regular', amount: Math.round(dollars(annualGross) / PERIODS_PER_YEAR.biweekly) }];
        result = calculatePaycheck(input);
      }

      const employeeLines = result.taxes.filter((t) => t.payer === 'employee');
      const ss = employeeLines.find((l) => l.name === 'Social Security')?.amount ?? 0;
      const medicare = employeeLines.filter((l) => l.name === 'Medicare' || l.name === 'Additional Medicare').reduce((s, l) => s + l.amount, 0);
      const federal = employeeLines.find((l) => l.name === 'Federal Income Tax')?.amount ?? 0;
      const stateLineName = `${stateFullName(stateCode)} Income Tax`;
      const stateTax = employeeLines.find((l) => l.name === stateLineName)?.amount ?? 0;
      const claimed = new Set(['Social Security', 'Medicare', 'Additional Medicare', 'Federal Income Tax', stateLineName]);
      const otherEmployeeLines = employeeLines.filter((l) => !claimed.has(l.name)).map((l) => ({ name: l.name, amount: l.amount }));

      cases.push({
        n, tier, stateCode, slug, annualGross, freq: freq.ours, freqPcc: freq.pcc,
        filingStatus: filing.ours, filingStatusPcc: filing.pcc, dependentsAnnual, checkDatePcc: CHECK_DATE_PCC,
        pccStateParms,
        ours: { grossPay: result.grossPay, federal, socialSecurity: ss, medicare, state: stateTax, netPay: result.netPay, otherEmployeeLines },
      });
    }
  }
}

addCases('hard', HARD, 20);
addCases('mid', MID, 10);
addCases('easy', EASY, 3);

writeFileSync(OUT, JSON.stringify(cases, null, 2));
console.log(`Wrote ${cases.length} cases (hard ${HARD.length}x20=${HARD.length*20}, mid ${MID.length}x10=${MID.length*10}, easy ${EASY.length}x3=${EASY.length*3})`);

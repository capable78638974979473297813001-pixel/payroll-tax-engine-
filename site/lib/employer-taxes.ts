import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Employer-level taxes that are charged on a quarter's total payroll, not on
 * one paycheck, so no per-paycheck calculation can produce them:
 *
 *   - New York MCTMT (Metropolitan Commuter Transportation Mobility Tax)
 *   - Nevada Modified Business Tax (MBT)
 *
 * The rates and brackets are read from the same data files the paycheck
 * engine uses (data/states/NY-2026.json `mctmt`, data/states/NV-2026.json
 * `modifiedBusinessTax`), where each is sourced to the state's own page. The
 * MCTMT arithmetic is checked against the state's worked example in the tests.
 * An estimate for planning and accruals; the return is the filing.
 */

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'states');
const load = (file: string): any => JSON.parse(readFileSync(join(DATA, file), 'utf8'));

export interface Quarter { year: number; quarter: 1 | 2 | 3 | 4 }

/** "2026-Q2" -> { year: 2026, quarter: 2 }, or null. */
export function parseQuarter(value: unknown): Quarter | null {
  const m = typeof value === 'string' ? /^(\d{4})-Q([1-4])$/.exec(value) : null;
  return m ? { year: Number(m[1]), quarter: Number(m[2]) as Quarter['quarter'] } : null;
}

const index = (q: Quarter) => q.year * 4 + (q.quarter - 1);
export const MCTMT_FIRST: Quarter = { year: 2025, quarter: 3 }; // rates in the data file apply to quarters beginning on or after 2025-07-01
export const MBT_FIRST: Quarter = { year: 2023, quarter: 3 }; // 1.17% rate effective 2023-07-01
export const LAST_SUPPORTED: Quarter = { year: 2026, quarter: 4 }; // the data files are verified for 2026
const label = (q: Quarter) => `${q.year}-Q${q.quarter}`;

export interface EmployerTaxLine {
  id: string;
  name: string;
  payer: 'employer';
  jurisdiction: 'state' | 'local';
  /** The payroll the tax was computed on, in cents. */
  basis: number;
  rate: number;
  amount: number;
  detail: string;
}

export interface EmployerTaxes {
  quarter: string;
  lines: EmployerTaxLine[];
  total: number;
  notes: string[];
}

interface Tier { from: number; to: number | null; rate: number }
const tierFor = (tiers: Tier[], dollars: number): Tier => {
  // "Over from, up to and including to."
  const hit = tiers.find((t) => dollars > t.from && (t.to === null || dollars <= t.to));
  return hit ?? tiers[0]!;
};
const round = (n: number) => Math.round(n);

/** $312,500 of payroll expense in the quarter, across both zones. Checked against data/states/NY-2026.json by a test. */
export const MCTMT_THRESHOLD = 31_250_000;

export interface MctmtInput { zone1PayrollExpense: number; zone2PayrollExpense: number }
export interface MbtInput { category: 'general' | 'financial'; grossWages: number; healthBenefitsPaid: number }

export class EmployerTaxRefusal extends Error {
  code: 'unsupported_quarter';
  constructor(message: string) {
    super(message);
    this.code = 'unsupported_quarter';
  }
}

export function mctmt(q: Quarter, input: MctmtInput): { line: EmployerTaxLine | null; notes: string[] } {
  if (index(q) < index(MCTMT_FIRST) || index(q) > index(LAST_SUPPORTED)) {
    throw new EmployerTaxRefusal(`MCTMT is calculated for quarters ${label(MCTMT_FIRST)} through ${label(LAST_SUPPORTED)}; the rates on file apply to quarters beginning on or after 2025-07-01 and are verified for 2026.`);
  }
  const m = load('NY-2026.json').mctmt;
  const threshold = MCTMT_THRESHOLD;
  const total = input.zone1PayrollExpense + input.zone2PayrollExpense;
  if (total <= threshold) {
    return {
      line: null,
      notes: [`MCTMT: payroll expense of ${cents(total)} is not over the ${cents(threshold)} quarterly threshold across both zones, so no tax is due.`],
    };
  }
  const z1 = tierFor(m.rates2026.zone1, input.zone1PayrollExpense / 100);
  const z2 = tierFor(m.rates2026.zone2, input.zone2PayrollExpense / 100);
  const a1 = round(input.zone1PayrollExpense * z1.rate);
  const a2 = round(input.zone2PayrollExpense * z2.rate);
  return {
    line: {
      id: 'NY_MCTMT',
      name: 'New York MCTMT (Metropolitan Commuter Transportation Mobility Tax)',
      payer: 'employer',
      jurisdiction: 'state',
      basis: total,
      rate: total > 0 ? (a1 + a2) / total : 0,
      amount: a1 + a2,
      detail:
        `Zone 1 ${cents(input.zone1PayrollExpense)} at ${pct(z1.rate)} = ${cents(a1)}; Zone 2 ${cents(input.zone2PayrollExpense)} at ${pct(z2.rate)} = ${cents(a2)}. ` +
        'Each zone\'s whole payroll expense is charged at the rate of the bracket it falls in, and the two are added.',
    },
    notes: [],
  };
}

export function nevadaMbt(q: Quarter, input: MbtInput): { line: EmployerTaxLine; notes: string[] } {
  if (index(q) < index(MBT_FIRST) || index(q) > index(LAST_SUPPORTED)) {
    throw new EmployerTaxRefusal(`Nevada MBT is calculated for quarters ${label(MBT_FIRST)} through ${label(LAST_SUPPORTED)}.`);
  }
  const m = load('NV-2026.json').modifiedBusinessTax;
  const cat = input.category === 'financial' ? m.financialInstitutionsAndMining : m.generalBusiness;
  const exemption = cat.quarterlyExemption * 100;
  const wages = Math.max(0, input.grossWages - input.healthBenefitsPaid);
  const taxable = Math.max(0, wages - exemption);
  const amount = round(taxable * cat.rate);
  return {
    line: {
      id: 'NV_MBT',
      name: input.category === 'financial' ? 'Nevada Modified Business Tax (financial institutions and mining)' : 'Nevada Modified Business Tax (general business)',
      payer: 'employer',
      jurisdiction: 'state',
      basis: taxable,
      rate: cat.rate,
      amount,
      detail:
        `Gross wages ${cents(input.grossWages)}` + (input.healthBenefitsPaid ? ` less ${cents(input.healthBenefitsPaid)} of health benefits paid` : '') +
        (exemption ? ` less the ${cents(exemption)} quarterly exemption` : ' (this category has no quarterly exemption)') +
        ` = ${cents(taxable)} at ${pct(cat.rate)}.`,
    },
    notes: [],
  };
}

const cents = (c: number) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (r: number) => `${+(r * 100).toFixed(4)}%`;

export function employerTaxes(q: Quarter, req: { mctmt?: MctmtInput; nevadaMbt?: MbtInput }): EmployerTaxes {
  const lines: EmployerTaxLine[] = [];
  const notes: string[] = [];
  if (req.mctmt) {
    const r = mctmt(q, req.mctmt);
    if (r.line) lines.push(r.line);
    notes.push(...r.notes);
  }
  if (req.nevadaMbt) {
    const r = nevadaMbt(q, req.nevadaMbt);
    lines.push(r.line);
    notes.push(...r.notes);
  }
  notes.push('These are employer taxes on a quarter\'s total payroll. An estimate for planning and accruals; the state return is the filing.');
  return { quarter: label(q), lines, total: lines.reduce((n, l) => n + l.amount, 0), notes };
}

export interface FieldError { path: string; message: string }
export type EmployerTaxRequest = { quarter: Quarter; mctmt?: MctmtInput; nevadaMbt?: MbtInput };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const MAX_CENTS = 100_000_000_000_000; // $1 trillion a quarter

export function validateEmployerTaxes(raw: unknown): { ok: true; value: EmployerTaxRequest } | { ok: false; errors: FieldError[] } {
  const errors: FieldError[] = [];
  const err = (path: string, message: string) => errors.push({ path, message });
  if (!isObject(raw)) return { ok: false, errors: [{ path: '', message: 'Send an object with quarter and at least one of mctmt or nevadaMbt.' }] };
  for (const k of Object.keys(raw)) if (!['quarter', 'mctmt', 'nevadaMbt'].includes(k)) err(k, 'is not a field this endpoint reads.');

  const quarter = parseQuarter(raw.quarter);
  if (!quarter) err('quarter', 'is required, as the calendar quarter in the form "2026-Q2".');

  const money = (obj: Record<string, unknown>, key: string, path: string, required: boolean): number => {
    const v = obj[key];
    if (v === undefined) {
      if (required) err(`${path}.${key}`, 'is required, in integer cents.');
      return 0;
    }
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > MAX_CENTS) {
      err(`${path}.${key}`, 'must be a whole number of cents, zero or more (e.g. 45000000 for $450,000.00).');
      return 0;
    }
    return v;
  };
  const only = (obj: Record<string, unknown>, allowed: string[], path: string) => {
    for (const k of Object.keys(obj)) {
      if (allowed.includes(k)) continue;
      err(`${path}.${k}`, k === 'localGovernment' ? 'local government employers have separate MCTMT rules that this calculator does not apply.' : 'is not a field this endpoint reads.');
    }
  };

  let m: MctmtInput | undefined;
  if (raw.mctmt !== undefined) {
    if (!isObject(raw.mctmt)) err('mctmt', 'must be an object { zone1PayrollExpense, zone2PayrollExpense }.');
    else {
      only(raw.mctmt, ['zone1PayrollExpense', 'zone2PayrollExpense'], 'mctmt');
      if (raw.mctmt.zone1PayrollExpense === undefined && raw.mctmt.zone2PayrollExpense === undefined) err('mctmt', 'needs zone1PayrollExpense, zone2PayrollExpense, or both, in integer cents.');
      m = { zone1PayrollExpense: money(raw.mctmt, 'zone1PayrollExpense', 'mctmt', false), zone2PayrollExpense: money(raw.mctmt, 'zone2PayrollExpense', 'mctmt', false) };
    }
  }
  let n: MbtInput | undefined;
  if (raw.nevadaMbt !== undefined) {
    if (!isObject(raw.nevadaMbt)) err('nevadaMbt', 'must be an object { category, grossWages, healthBenefitsPaid? }.');
    else {
      only(raw.nevadaMbt, ['category', 'grossWages', 'healthBenefitsPaid'], 'nevadaMbt');
      const category = raw.nevadaMbt.category;
      if (category !== 'general' && category !== 'financial') err('nevadaMbt.category', 'is required: "general" or "financial" (financial institutions and mining).');
      n = {
        category: category === 'financial' ? 'financial' : 'general',
        grossWages: money(raw.nevadaMbt, 'grossWages', 'nevadaMbt', true),
        healthBenefitsPaid: money(raw.nevadaMbt, 'healthBenefitsPaid', 'nevadaMbt', false),
      };
    }
  }
  if (!m && !n && raw.mctmt === undefined && raw.nevadaMbt === undefined) err('', 'Send at least one of mctmt or nevadaMbt.');
  if (errors.length || !quarter) return { ok: false, errors };
  return { ok: true, value: { quarter, ...(m ? { mctmt: m } : {}), ...(n ? { nevadaMbt: n } : {}) } };
}

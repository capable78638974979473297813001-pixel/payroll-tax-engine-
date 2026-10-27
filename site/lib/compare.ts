import { calculatePaycheck } from '../../src/calculate.ts';
import type { PaycheckInput, PaycheckResult } from '../../src/types.ts';

/**
 * Compare two paychecks and say what caused the difference.
 *
 * The explanation is not guessed. The inputs are diffed, then the changes are
 * applied to the first request one at a time, in a fixed order, and the real
 * engine is run after each one. What a step moves is exactly what that change
 * did given the changes before it, and the steps add up to the whole
 * difference. Another order can split the credit differently when changes
 * interact (a raise and a filing status both move the bracket); the total is
 * the same either way.
 */

export interface InputChange { path: string; before: unknown; after: unknown }

export interface Totals {
  grossPay: number;
  pretaxDeductions: number;
  posttaxDeductions: number;
  employeeTaxTotal: number;
  employerTaxTotal: number;
  netPay: number;
}
export type TotalsDifference = { [K in keyof Totals]: { before: number; after: number; change: number } };

export interface TaxDifference {
  id: string;
  name: string;
  payer: 'employee' | 'employer';
  before: number | null;
  after: number | null;
  change: number;
  taxableWages: { before: number | null; after: number | null };
}

export interface Step {
  /** The input changes this step applied. More than one when the engine could not run with only the first. */
  changed: InputChange[];
  summary: string;
  netPayChange: number;
  /** Only the taxes this step moved. */
  taxes: Array<{ id: string; name: string; payer: 'employee' | 'employer'; change: number }>;
  narrative: string;
}

export interface Comparison {
  totals: TotalsDifference;
  taxes: TaxDifference[];
  unchangedTaxes: number;
  inputChanges: InputChange[];
  steps: Step[];
  notes: string[];
}

const REMOVED = '\u0000removed';
const MAX_STEPS = 25;

const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** RFC 7386 JSON merge patch: objects merge, null deletes, anything else replaces. */
export function mergePatch(base: unknown, patch: unknown): unknown {
  if (!isObject(patch)) return clone(patch);
  const out: Record<string, unknown> = isObject(base) ? clone(base) : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k];
    else out[k] = mergePatch(out[k], v);
  }
  return out;
}

function flatten(value: unknown, path: string, out: Map<string, unknown>): void {
  if (Array.isArray(value)) {
    if (value.length === 0) out.set(path, []);
    value.forEach((v, i) => flatten(v, `${path}[${i}]`, out));
  } else if (isObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) out.set(path, {});
    for (const k of keys) flatten(value[k], path ? `${path}.${k}` : k, out);
  } else {
    out.set(path, value);
  }
}

/** Every leaf that differs, as a dotted path with array positions: earnings[1].amount. */
export function diffInputs(before: unknown, after: unknown): InputChange[] {
  const a = new Map<string, unknown>();
  const b = new Map<string, unknown>();
  flatten(before, '', a);
  flatten(after, '', b);
  const paths = [...new Set([...a.keys(), ...b.keys()])];
  const out: InputChange[] = [];
  for (const path of paths) {
    const x = a.get(path);
    const y = b.get(path);
    if (a.has(path) && b.has(path) && same(x, y)) continue;
    out.push({ path, before: a.has(path) ? x : undefined, after: b.has(path) ? y : undefined });
  }
  return out;
}

const ORDER = ['checkDate', 'payFrequency', 'employmentCategory', 'workState', 'residenceState', 'residenceStateWithholding', 'employee', 'federalW4', 'earnings', 'deductions', 'hoursWorked', 'priorRegularPayment', 'ytd', 'employer', 'roundToWholeDollars'];
const rank = (path: string) => {
  const top = path.split(/[.[]/)[0]!;
  const i = ORDER.indexOf(top);
  return i === -1 ? ORDER.length : i;
};

/** A row of earnings or deductions is one change; everything else is one change per leaf. */
function factorKey(path: string): string {
  const m = /^(earnings|deductions|garnishments)\[(\d+)\]/.exec(path);
  return m ? `${m[1]}[${m[2]}]` : path;
}

function setPath(root: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(/\.|\[(\d+)\]/).filter((p) => p !== undefined && p !== '');
  let cur: any = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const nextIsIndex = /^\d+$/.test(parts[i + 1]!);
    if (cur[key] === undefined || cur[key] === null || typeof cur[key] !== 'object') cur[key] = nextIsIndex ? [] : {};
    cur = cur[key];
  }
  const last = parts[parts.length - 1]!;
  if (value === undefined) {
    if (Array.isArray(cur)) cur[Number(last)] = REMOVED;
    else delete cur[last];
  } else cur[last] = clone(value);
}

/** Drop the rows marked removed, and objects emptied by removing their last key. */
function materialize<T>(v: T): T {
  if (Array.isArray(v)) return v.filter((x) => x !== REMOVED).map((x) => materialize(x)) as unknown as T;
  if (isObject(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = materialize(x);
    return out as T;
  }
  return v;
}

const dollars = (cents: number) => {
  const n = Math.abs(cents) / 100;
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const signed = (cents: number) => (cents === 0 ? '$0.00' : (cents > 0 ? '+' : '−') + dollars(cents));
const show = (v: unknown) => (v === undefined ? 'not set' : typeof v === 'string' ? v : JSON.stringify(v));

function describeFactor(leaves: InputChange[]): string {
  if (leaves.length === 1) {
    const l = leaves[0]!;
    if (l.before === undefined) return `${l.path} added: ${show(l.after)}`;
    if (l.after === undefined) return `${l.path} removed (was ${show(l.before)})`;
    return `${l.path}: ${show(l.before)} → ${show(l.after)}`;
  }
  const row = /^(earnings|deductions|garnishments)\[\d+\]/.exec(leaves[0]!.path)?.[0];
  const added = leaves.every((l) => l.before === undefined);
  const removed = leaves.every((l) => l.after === undefined);
  if (row && (added || removed)) return `${row} ${added ? 'added' : 'removed'}`;
  if (row) return `${row}: ${leaves.length} fields changed`;
  return `${leaves.length} inputs changed: ${leaves.map((l) => l.path).join(', ')}`;
}

const TOTAL_KEYS: Array<keyof Totals> = ['grossPay', 'pretaxDeductions', 'posttaxDeductions', 'employeeTaxTotal', 'employerTaxTotal', 'netPay'];

function taxMap(result: PaycheckResult): Map<string, { name: string; payer: 'employee' | 'employer'; amount: number; taxableWages: number }> {
  const m = new Map();
  for (const t of result.taxes) m.set(t.id, { name: t.name, payer: t.payer, amount: t.amount, taxableWages: t.taxableWages });
  return m;
}

function taxMoves(a: PaycheckResult, b: PaycheckResult): Step['taxes'] {
  const x = taxMap(a);
  const y = taxMap(b);
  const out: Step['taxes'] = [];
  for (const id of new Set([...x.keys(), ...y.keys()])) {
    const change = (y.get(id)?.amount ?? 0) - (x.get(id)?.amount ?? 0);
    if (change !== 0) {
      const t = (y.get(id) ?? x.get(id))!;
      out.push({ id, name: t.name, payer: t.payer, change });
    }
  }
  return out;
}

function narrate(netPayChange: number, taxes: Step['taxes']): string {
  const head = netPayChange === 0 ? 'Net pay does not change' : `Net pay ${netPayChange > 0 ? 'goes up' : 'goes down'} ${dollars(netPayChange)}`;
  if (!taxes.length) return `${head}.`;
  return `${head}. ${taxes.map((t) => `${t.id}${t.payer === 'employer' ? ' (employer)' : ''} ${signed(t.change)}`).join(', ')}.`;
}

export function comparePaychecks(
  before: PaycheckInput,
  after: PaycheckInput,
  results: { before: PaycheckResult; after: PaycheckResult },
  run: (input: PaycheckInput) => PaycheckResult = calculatePaycheck,
): Comparison {
  const notes: string[] = [];
  const inputChanges = diffInputs(before, after);

  const totals = {} as TotalsDifference;
  for (const k of TOTAL_KEYS) totals[k] = { before: results.before[k], after: results.after[k], change: results.after[k] - results.before[k] };

  const x = taxMap(results.before);
  const y = taxMap(results.after);
  const taxes: TaxDifference[] = [];
  let unchangedTaxes = 0;
  for (const id of new Set([...x.keys(), ...y.keys()])) {
    const a = x.get(id);
    const b = y.get(id);
    const changed = (a?.amount ?? null) !== (b?.amount ?? null) || (a?.taxableWages ?? null) !== (b?.taxableWages ?? null);
    if (!changed) { unchangedTaxes += 1; continue; }
    taxes.push({
      id,
      name: (b ?? a)!.name,
      payer: (b ?? a)!.payer,
      before: a ? a.amount : null,
      after: b ? b.amount : null,
      change: (b?.amount ?? 0) - (a?.amount ?? 0),
      taxableWages: { before: a ? a.taxableWages : null, after: b ? b.taxableWages : null },
    });
  }

  // Group the leaf changes into factors and put them in a fixed order.
  const groups = new Map<string, InputChange[]>();
  for (const c of inputChanges) {
    const key = factorKey(c.path);
    const list = groups.get(key);
    if (list) list.push(c);
    else groups.set(key, [c]);
  }
  let factors = [...groups.values()].sort((p, q) => rank(p[0]!.path) - rank(q[0]!.path) || p[0]!.path.localeCompare(q[0]!.path));
  if (factors.length > MAX_STEPS) {
    const rest = factors.slice(MAX_STEPS - 1).flat();
    factors = [...factors.slice(0, MAX_STEPS - 1), rest];
    notes.push(`There are more than ${MAX_STEPS} input changes, so the last ones are shown as a single step.`);
  }

  const steps: Step[] = [];
  const work = clone(before) as unknown as Record<string, unknown>;
  let previous = results.before;
  let pending: InputChange[] = [];
  for (const factor of factors) {
    pending.push(...factor);
    for (const leaf of factor) setPath(work, leaf.path, leaf.after);
    let current: PaycheckResult;
    try {
      current = run(materialize(work) as unknown as PaycheckInput);
    } catch {
      // The engine cannot run with only the changes so far (a state with the old
      // state's certificate, say). Carry them into the next step.
      continue;
    }
    steps.push(makeStep(pending, previous, current));
    previous = current;
    pending = [];
  }
  if (pending.length || !same(previous.taxes, results.after.taxes) || previous.netPay !== results.after.netPay) {
    const leftover = pending.length ? pending : [];
    steps.push(makeStep(leftover, previous, results.after, leftover.length ? undefined : 'Other changes'));
    if (!leftover.length) notes.push('The steps did not land exactly on the second paycheck, so the remainder is shown as one more step.');
  }

  return { totals, taxes, unchangedTaxes, inputChanges, steps, notes };
}

function makeStep(changed: InputChange[], from: PaycheckResult, to: PaycheckResult, label?: string): Step {
  const moves = taxMoves(from, to);
  const netPayChange = to.netPay - from.netPay;
  return {
    changed,
    summary: label ?? describeFactor(changed),
    netPayChange,
    taxes: moves,
    narrative: narrate(netPayChange, moves),
  };
}

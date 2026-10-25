import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * What the engine can actually compute, read from the data files and nothing
 * else, so the coverage page cannot claim a jurisdiction the build lacks.
 * Built once per process; the files only change with a deploy.
 *
 *   summary    totals shown at the top of /coverage
 *   states     one row per state and DC, plus the federal row
 *   local      every city, county, school district and taxing body the local
 *              files carry, searchable and paged (GET /api/coverage/local)
 */

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');

export interface StateRow {
  code: string;
  name: string;
  incomeTax: 'none' | 'withholding';
  incomeTaxNote: string;
  unemployment: boolean;
  /** What the state's local layer looks like in the data: confirmed none, fully listed, or partly listed. */
  localStatus: 'none' | 'listed' | 'partial';
  localTax: string;
  localNote: string;
  localCount: number;
  reciprocity: string[];
  minimumWage: boolean;
  minimumWageLocalCount: number;
  garnishment: boolean;
  years: number[];
}

export interface LocalRow {
  state: string;
  name: string;
  kind: string;
  rate: number | null;
  /** What to show in the rate column when it is not a percentage (a flat fee or an hourly wage). */
  value?: string;
  detail: string;
}

export interface Coverage {
  year: number;
  summary: {
    states: number;
    taxYears: number[];
    localJurisdictions: number;
    localByState: Record<string, number>;
    localMinimumWage: number;
    statesWithLocalTax: number;
    asOf: string;
  };
  states: StateRow[];
  local: LocalRow[];
}

function readJson<T = Record<string, any>>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

function latestYear(dir: string, suffix = '.json'): number[] {
  if (!existsSync(dir)) return [];
  const years = new Set<number>();
  for (const f of readdirSync(dir)) {
    const m = /-(\d{4})\.json$/.exec(f);
    if (m && f.endsWith(suffix)) years.add(Number(m[1]));
  }
  return [...years].sort();
}

function describeIncomeTax(raw: Record<string, any>): Pick<StateRow, 'incomeTax' | 'incomeTaxNote'> {
  if (String(raw.method ?? '') === 'no_income_tax') {
    return { incomeTax: 'none', incomeTaxNote: raw.code === 'NH' ? 'No tax on wages' : 'No state income tax' };
  }
  return { incomeTax: 'withholding', incomeTaxNote: 'Withholding computed' };
}

/** Context for a state whose local layer is not a wage tax. */
const INFO_NOTES: Record<string, string> = {
  IA: 'School district surtax is settled on the return, not withheld from pay.',
  WA: 'Seattle taxes are paid by employers; there is no employee withholding.',
  NJ: 'Newark\'s payroll tax is paid by the employer.',
  OR: 'Statewide transit tax, plus Metro and Multnomah County taxes above an income threshold.',
};

/** Where the data itself says the local list is not the whole story. */
const PARTIAL_NOTES: Record<string, string> = {
  AL: '29 municipalities and Macon County; seven of those rates come from a survey rather than the city\'s own document.',
  WV: '11 cities that charge a per-week service fee; other municipalities are not enumerated yet.',
  CO: 'Occupational privilege tax in Denver, Glendale, Greenwood Village and Sheridan.',
};

function localRowsFor(state: string, year: number): { rows: LocalRow[]; label: string } {
  const local = join(DATA, 'local');
  const rows: LocalRow[] = [];
  const add = (r: LocalRow) => rows.push(r);
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

  if (state === 'AL') {
    const d = readJson(join(local, `AL-municipalities-${year}.json`));
    for (const m of d?.municipalities ?? []) add({ state, name: m.name, kind: 'City occupational tax', rate: num(m.rate), detail: 'Municipal occupational tax on wages' });
    for (const c of d?.counties ?? []) add({ state, name: c.name, kind: 'County tax', rate: num(c.rate), detail: 'County occupational tax' });
    return { rows, label: 'Occupational tax' };
  }
  if (state === 'IN') {
    const d = readJson(join(local, `IN-counties-${year}.json`));
    for (const c of d?.counties ?? []) add({ state, name: `${c.name} County`, kind: 'County income tax', rate: num(c.rate), detail: 'County adjusted gross income tax' });
    return { rows, label: 'County income tax' };
  }
  if (state === 'KY') {
    const d = readJson(join(local, `KY-occupational-${year}.json`));
    for (const j of d?.jurisdictions?.scraped ?? []) {
      add({ state, name: j.name, kind: 'Occupational license tax', rate: num(j.wageRateDecimal), detail: 'Wage withholding rate' });
    }
    return { rows, label: 'Occupational tax' };
  }
  if (state === 'MI') {
    const d = readJson(join(local, `MI-cities-${year}.json`));
    for (const c of d?.cities ?? []) add({ state, name: c.name, kind: 'City income tax', rate: num(c.residentRate), detail: `Nonresident ${typeof c.nonresidentRate === 'number' ? (c.nonresidentRate * 100).toFixed(2) + '%' : 'rate varies'}` });
    return { rows, label: 'City income tax' };
  }
  if (state === 'OH') {
    const m = readJson(join(local, `OH-municipalities-${year}.json`));
    for (const c of m?.municipalities ?? []) add({ state, name: c.name, kind: 'Municipal income tax', rate: num(c.rate), detail: c.administeredBy && c.administeredBy !== 'self_or_other' ? `Administered by ${c.administeredBy}` : c.administeredBy ? 'Administered by the municipality' : 'Municipal income tax' });
    const s = readJson(join(local, `OH-school-districts-${year}.json`));
    for (const c of s?.districts ?? []) {
      const m = /^(.*?)\s*\((.*)\)\s*$/.exec(String(c.name)); // "Triad LSD (0.50% expires 2030; 1.00% CPT)"
      const where = c.county ? `${c.county} County` : 'School district';
      add({ state, name: m ? m[1] : c.name, kind: 'School district income tax', rate: num(c.rate2026 ?? c.rate), detail: m ? `${where}. ${m[2]}` : where });
    }
    const j = readJson(join(local, `OH-jedd-jedz-${year}.json`));
    for (const z of j?.zones ?? []) add({ state, name: z.name, kind: 'JEDD / JEDZ', rate: num(z.rate), detail: 'Joint economic development district or zone' });
    return { rows, label: 'City, school district, JEDD' };
  }
  if (state === 'PA') {
    const d = readJson(join(local, `PA-EIT-LST-${year}.json`));
    for (const j of d?.jurisdictions ?? []) {
      add({ state, name: j.municipality, kind: 'Earned income tax', rate: num(j.totalResidentEIT), detail: `${j.county} County, ${j.schoolDistrict}` });
    }
    return { rows, label: 'EIT and LST by taxing body' };
  }
  return { rows, label: '' };
}

function stateLocalExtras(state: string, raw: Record<string, any>): LocalRow[] {
  const out: LocalRow[] = [];
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  if (state === 'MD' && raw.countyRates) {
    for (const [name, v] of Object.entries<any>(raw.countyRates)) {
      if (name.startsWith('$')) continue;
      out.push({ state, name: name.replace(/([a-z])([A-Z])/g, '$1 $2'), kind: 'County income tax', rate: num(v?.flat), detail: v?.tiered ? 'Tiered county rates' : 'Flat county rate' });
    }
  }
  if (state === 'NY') {
    if (raw.nycLocalTax) out.push({ state, name: 'New York City', kind: 'City income tax', rate: num(raw.nycLocalTax.supplementalRate), detail: 'Resident city income tax withholding' });
    if (raw.yonkersLocalTax) out.push({ state, name: 'Yonkers', kind: 'City income tax', rate: num(raw.yonkersLocalTax.residentSurchargeRate ?? raw.yonkersLocalTax.supplementalRate), detail: 'Resident surcharge and nonresident earnings tax' });
  }
  if (state === 'OR') {
    if (raw.statewideTransitTax) out.push({ state, name: 'Statewide transit tax', kind: 'Statewide payroll tax', rate: num(raw.statewideTransitTax.rate), detail: 'Employee-paid' });
    if (raw.portlandAreaLocalIncomeTax?.metroSHS) out.push({ state, name: 'Metro Supportive Housing Services', kind: 'Metro income tax', rate: num(raw.portlandAreaLocalIncomeTax.metroSHS.rate), detail: 'Above the income threshold' });
    if (raw.portlandAreaLocalIncomeTax?.multnomahPFA) out.push({ state, name: 'Multnomah County Preschool for All', kind: 'County income tax', rate: num(raw.portlandAreaLocalIncomeTax.multnomahPFA.tier1Rate), detail: 'Above the income threshold' });
  }
  if (state === 'MO' && raw.localIncomeTax) {
    const li = raw.localIncomeTax;
    if (li.kansasCity) out.push({ state, name: 'Kansas City', kind: 'City earnings tax', rate: num(li.kansasCity.rate), detail: 'Residents and anyone working in the city' });
    if (li.stLouis) out.push({ state, name: 'St. Louis', kind: 'City earnings tax', rate: num(li.stLouis.earningsTaxRate), detail: 'Residents and anyone working in the city' });
  }
  if (state === 'DE' && raw.localIncomeTax) {
    out.push({ state, name: 'Wilmington', kind: 'City wage tax', rate: num(raw.localIncomeTax.rate), detail: 'Residents and anyone working in the city' });
  }
  if (state === 'CO' && raw.localIncomeTax) {
    const li = raw.localIncomeTax;
    const opt = li.occupationalPrivilegeTax ?? {};
    if (li.denver) out.push({ state, name: 'Denver', kind: 'Occupational privilege tax', rate: null, value: `$${Number(li.denver.employeeRate).toFixed(2)}/mo`, detail: `Employee pays this; employer pays $${Number(li.denver.employerRatePerEmployee).toFixed(2)} per employee` });
    for (const [name, v] of Object.entries<any>(opt)) {
      if (name.startsWith('$') || v?.repealed) continue;
      out.push({ state, name, kind: 'Occupational privilege tax', rate: null, value: `$${Number(v.employeeRate).toFixed(2)}/mo`, detail: `Employee pays this; employer pays $${Number(v.employerRatePerEmployee).toFixed(2)} per employee` });
    }
  }
  if (state === 'WV' && raw.localIncomeTax?.serviceFeeCities) {
    for (const [name, v] of Object.entries<any>(raw.localIncomeTax.serviceFeeCities)) {
      if (name.startsWith('$')) continue;
      out.push({ state, name, kind: 'City service fee', rate: null, ...(typeof v?.weeklyRate === 'number' ? { value: `$${v.weeklyRate.toFixed(2)}/wk` } : {}), detail: 'Flat fee withheld by the employer, not a percentage of wages' });
    }
  }
  if (state === 'WA' && raw.localIncomeTax) {
    out.push({ state, name: 'Seattle payroll expense tax', kind: 'Employer payroll tax', rate: null, detail: 'Employer-paid, by prior-year payroll' });
    if (raw.localIncomeTax.seattleSocialHousingTax) out.push({ state, name: 'Seattle social housing tax', kind: 'Employer payroll tax', rate: num(raw.localIncomeTax.seattleSocialHousingTax.rate), detail: 'Employer-paid, on pay above $1,000,000' });
  }
  if (state === 'NJ' && raw.newarkPayrollTax) {
    out.push({ state, name: 'Newark', kind: 'Employer payroll tax', rate: num(raw.newarkPayrollTax.rate), detail: 'Employer-paid, above the quarterly threshold' });
  }
  return out;
}

function minimumWageLocals(year: number): Map<string, LocalRow[]> {
  const map = new Map<string, LocalRow[]>();
  const dir = join(DATA, 'minimum-wage', 'local');
  if (!existsSync(dir)) return map;
  for (const f of readdirSync(dir)) {
    const m = /^([A-Z]{2})-local-(\d{4})\.json$/.exec(f);
    if (!m || Number(m[2]) !== year) continue; // one year's ordinances, not every carried-forward copy
    const d = readJson(join(dir, f));
    const rows: LocalRow[] = (d?.jurisdictions ?? []).map((j: any) => ({
      state: m[1],
      name: j.name,
      kind: `Minimum wage (${j.level ?? 'local'})`,
      rate: null,
      ...(typeof j.hourly === 'number' ? { value: `$${j.hourly.toFixed(2)}/hr` } : {}),
      detail: j.effectiveFrom ? `In effect from ${j.effectiveFrom}` : 'Local minimum wage',
    }));
    map.set(m[1], [...(map.get(m[1]) ?? []), ...rows]);
  }
  return map;
}

let cached: Coverage | null = null;

export function coverage(): Coverage {
  if (cached) return cached;
  const stateDir = join(DATA, 'states');
  const years = latestYear(stateDir);
  const year = years.filter((y) => y <= new Date().getFullYear()).at(-1) ?? years.at(-1) ?? new Date().getFullYear();
  const mw = minimumWageLocals(year);
  const mwStates = new Set(existsSync(join(DATA, 'minimum-wage', 'states')) ? readdirSync(join(DATA, 'minimum-wage', 'states')).map((f) => f.slice(0, 2)) : []);
  const garnishment = readJson(join(DATA, 'garnishment', `state-overrides-${year}.json`));
  const garnStates = new Set(Object.keys(garnishment?.states ?? {}));

  const states: StateRow[] = [];
  const local: LocalRow[] = [];
  const localByState: Record<string, number> = {};

  for (const f of readdirSync(stateDir).filter((x) => x.endsWith(`-${year}.json`)).sort()) {
    const raw = readJson(join(stateDir, f));
    if (!raw?.code) continue;
    const code = String(raw.code);
    const { rows, label } = localRowsFor(code, year);
    const extras = stateLocalExtras(code, raw);
    const wageLocals = mw.get(code) ?? [];
    const all = [...rows, ...extras];
    local.push(...all, ...wageLocals);
    const stateYears: number[] = [];
    for (const y of years) if (existsSync(join(stateDir, `${code}-${y}.json`))) stateYears.push(y);
    const tax = describeIncomeTax(raw);
    const li = raw.localIncomeTax ?? raw.localTaxAbsence ?? raw.local;
    const saysNone =
      /^(none|no local|n\/a)/i.test(String(li?.rule ?? '')) ||
      Boolean(raw.localTaxAbsence) ||
      /no local (income|wage)[- ]?(income )?tax/i.test(JSON.stringify(raw));
    const kinds = [...new Set(all.map((e) => e.kind))];
    const localTax = label || kinds.join(', ');
    if (all.length) localByState[code] = all.length;
    const localStatus: StateRow['localStatus'] = PARTIAL_NOTES[code] ? 'partial' : all.length ? 'listed' : 'none';
    states.push({
      code,
      name: String(raw.name),
      ...tax,
      unemployment: Boolean(raw.suiEmployer),
      localStatus,
      localTax: localTax || (saysNone || tax.incomeTax === 'none' ? 'None levied' : 'None in the data'),
      localNote: PARTIAL_NOTES[code] ?? INFO_NOTES[code] ?? '',
      localCount: all.length,
      reciprocity: Array.isArray(raw.reciprocity?.reciprocalStates) ? raw.reciprocity.reciprocalStates : [],
      minimumWage: mwStates.has(code),
      minimumWageLocalCount: wageLocals.length,
      garnishment: garnStates.has(code),
      years: stateYears,
    });
  }
  states.sort((a, b) => a.name.localeCompare(b.name));

  cached = {
    year,
    summary: {
      states: states.length,
      taxYears: years,
      localJurisdictions: local.filter((l) => !l.kind.startsWith('Minimum wage')).length,
      localByState,
      localMinimumWage: local.filter((l) => l.kind.startsWith('Minimum wage')).length,
      statesWithLocalTax: Object.keys(localByState).length,
      asOf: new Date().toISOString().slice(0, 10),
    },
    states,
    local,
  };
  return cached;
}

export interface LocalQuery {
  q?: string;
  state?: string;
  kind?: 'tax' | 'wage' | 'all';
  page?: number;
  size?: number;
}

export function searchLocal(query: LocalQuery): {
  total: number;
  page: number;
  size: number;
  items: LocalRow[];
  /** Matches per state for the same text and kind, ignoring the state filter, so a page can show which states a search touches. */
  stateCounts: Record<string, number>;
} {
  const cov = coverage();
  const text = (query.q ?? '').trim().toLowerCase();
  const state = (query.state ?? '').trim().toUpperCase();
  const size = Math.min(100, Math.max(1, Math.trunc(query.size ?? 25)));
  const page = Math.max(0, Math.trunc(query.page ?? 0));
  const names = new Map(cov.states.map((x) => [x.code, x.name.toLowerCase()]));
  const stateCounts: Record<string, number> = {};
  const filtered = cov.local.filter((l) => {
    const wage = l.kind.startsWith('Minimum wage');
    if (query.kind === 'tax' && wage) return false;
    if (query.kind === 'wage' && !wage) return false;
    if (text && !`${l.name} ${l.kind} ${l.state} ${names.get(l.state) ?? ''} ${l.detail}`.toLowerCase().includes(text)) return false;
    stateCounts[l.state] = (stateCounts[l.state] ?? 0) + 1;
    return !state || l.state === state;
  });
  return { total: filtered.length, page, size, items: filtered.slice(page * size, page * size + size), stateCounts };
}

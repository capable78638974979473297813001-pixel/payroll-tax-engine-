import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculatePaycheck } from '../src/calculate.ts';
import { dollars } from '../src/money.ts';
import { PERIODS_PER_YEAR } from '../src/types.ts';
import type { FilingStatus, PayFrequency, PaycheckInput } from '../src/types.ts';

/**
 * Live cross-check of the engine against paycheckcity.com on the five
 * "hard" states (OH, PA, KY, NY, MI) — the same tier examples/pcc-full-generate.ts
 * calls HARD. Generates fresh random cases (default 30, 6 per state, its own
 * seed so they are NOT the cases already in pcc-full-cases.json), computes each
 * through calculatePaycheck(), drives PaycheckCity's real calculator in headless
 * Chrome (DevTools protocol, no npm deps), and diffs the two line by line.
 *
 *   node examples/pcc-hard-30.ts [--count 30] [--seed 30] [--date 2026-10-01] [--port 9223]
 *
 * Needs google-chrome (or CHROME_BIN) and network access to paycheckcity.com.
 * Writes examples/pcc-results/hard-30.json. Exits non-zero if any case differs
 * by more than TOLERANCE_CENTS (default 100, the "independent rounding" band
 * the committed summary uses) on net pay.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (name: string, dflt: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const COUNT = Number(arg('count', '30'));
const SEED = Number(arg('seed', '30'));
const CHECK_DATE = arg('date', '2026-10-01');
const PORT = Number(arg('port', '9223'));
const TOLERANCE_CENTS = Number(process.env.TOLERANCE_CENTS ?? 100);
const OUT = join(HERE, 'pcc-results', 'hard-30.json');

const HARD: [string, string][] = [
  ['OH', 'ohio'], ['PA', 'pennsylvania'], ['KY', 'kentucky'], ['NY', 'new-york'], ['MI', 'michigan'],
];
const FILING: { ours: FilingStatus; pcc: string }[] = [
  { ours: 'single', pcc: 'SINGLE' },
  { ours: 'married_joint', pcc: 'MARRIED' },
  { ours: 'head_of_household', pcc: 'HEAD_OF_HOUSEHOLD' },
];
const FREQ: { ours: PayFrequency; pcc: string }[] = [
  { ours: 'weekly', pcc: 'WEEKLY' },
  { ours: 'biweekly', pcc: 'BI_WEEKLY' },
  { ours: 'semimonthly', pcc: 'SEMI_MONTHLY' },
  { ours: 'monthly', pcc: 'MONTHLY' },
];

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];

function stateName(code: string): string {
  return (JSON.parse(readFileSync(join(HERE, '..', 'data', 'states', `${code}-2026.json`), 'utf8')) as { name: string }).name;
}

/** NY is the only hard state with its own marital-status field on both sides. */
function stateFields(code: string, fed: FilingStatus) {
  if (code === 'NY') {
    const married = fed === 'married_joint';
    return {
      certificate: { maritalStatus: married ? 'married' : 'single' },
      pccParms: { FILINGSTATUS: married ? 'M' : fed === 'head_of_household' ? 'MH' : 'S' } as Record<string, string>,
    };
  }
  return { certificate: {}, pccParms: {} as Record<string, string> };
}

interface Ours { gross: number; federal: number; socialSecurity: number; medicare: number; state: number; other: number; net: number; otherLines: { name: string; amount: number }[] }
interface Case {
  n: number; stateCode: string; slug: string; annualGross: number; freq: (typeof FREQ)[number];
  filing: (typeof FILING)[number]; dependentsAnnual: number; pccParms: Record<string, string>;
  ours?: Ours; oursError?: string;
}

function buildCases(): Case[] {
  const cases: Case[] = [];
  const perState = Math.ceil(COUNT / HARD.length);
  for (let i = 0; i < perState; i++) {
    for (const [stateCode, slug] of HARD) {
      if (cases.length >= COUNT) break;
      const filing = pick(FILING);
      const c: Case = {
        n: cases.length + 1, stateCode, slug,
        annualGross: Math.round((28_000 + rand() * 272_000) / 100) * 100,
        freq: pick(FREQ), filing, dependentsAnnual: pick([0, 2000, 4000, 6000]),
        pccParms: stateFields(stateCode, filing.ours).pccParms,
      };
      cases.push(c);
    }
  }
  return cases;
}

function runOurs(c: Case): void {
  const input: PaycheckInput = {
    checkDate: CHECK_DATE,
    payFrequency: c.freq.ours,
    earnings: [{ code: 'REG', category: 'regular', amount: Math.round(dollars(c.annualGross) / PERIODS_PER_YEAR[c.freq.ours]) }],
    deductions: [],
    federalW4: { filingStatus: c.filing.ours, multipleJobs: false, dependentCredit: dollars(c.dependentsAnnual), otherIncome: 0, deductions: 0, extraWithholding: 0 },
    ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
    workState: { code: c.stateCode, certificate: stateFields(c.stateCode, c.filing.ours).certificate },
  };
  try {
    const r = calculatePaycheck(input);
    const ee = r.taxes.filter((t) => t.payer === 'employee');
    const sumBy = (f: (n: string) => boolean) => ee.filter((t) => f(t.name)).reduce((s, t) => s + t.amount, 0);
    const stateLine = `${stateName(c.stateCode)} Income Tax`;
    const claimed = (n: string) => ['Social Security', 'Medicare', 'Additional Medicare', 'Federal Income Tax', stateLine].includes(n);
    c.ours = {
      gross: r.grossPay,
      federal: sumBy((n) => n === 'Federal Income Tax'),
      socialSecurity: sumBy((n) => n === 'Social Security'),
      medicare: sumBy((n) => n === 'Medicare' || n === 'Additional Medicare'),
      state: sumBy((n) => n === stateLine),
      other: sumBy((n) => !claimed(n)),
      net: r.netPay,
      otherLines: ee.filter((t) => !claimed(t.name)).map((t) => ({ name: t.name, amount: t.amount })),
    };
  } catch (e) {
    c.oursError = (e as Error).message;
  }
}

// ---- minimal Chrome DevTools client -------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function startChrome(): Promise<ChildProcess> {
  const bin = process.env.CHROME_BIN ?? 'google-chrome';
  const proc = spawn(bin, ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/pcc-hard-30-chrome-${PORT}`, 'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { await fetch(`http://localhost:${PORT}/json/version`); return proc; } catch { await sleep(200); }
  }
  proc.kill();
  throw new Error(`Chrome did not expose DevTools on port ${PORT}`);
}

async function openPage(url: string) {
  const t = (await (await fetch(`http://localhost:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json()) as { id: string; webSocketDebuggerUrl: string };
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const pending = new Map<number, (m: any) => void>();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(String(e.data));
    if (m.id && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); }
  });
  const evaluate = async <T>(expression: string): Promise<T> => {
    const i = ++id;
    const m = await new Promise<any>((res) => {
      pending.set(i, res);
      ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
    });
    if (m.result?.exceptionDetails) throw new Error(JSON.stringify(m.result.exceptionDetails).slice(0, 300));
    return m.result?.result?.value as T;
  };
  return { evaluate, close: async () => { ws.close(); await fetch(`http://localhost:${PORT}/json/close/${t.id}`); } };
}

const toDollarsString = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;

interface Pcc { lines: Record<string, number>; }

async function runPcc(c: Case): Promise<Pcc> {
  const page = await openPage(`https://www.paycheckcity.com/calculator/salary/${c.slug}`);
  try {
    for (let i = 0; i < 40 && !(await page.evaluate<boolean>(`!!document.getElementById('grossPay')`)); i++) await sleep(250);
    const fields: Record<string, string> = {
      checkDate: toDollarsString(CHECK_DATE),
      grossPay: String(c.annualGross),
      payFrequency: c.freq.pcc,
      federalFilingStatusType2020: c.filing.pcc,
      dependents2020: String(c.dependentsAnnual),
      ...Object.fromEntries(Object.entries(c.pccParms).map(([k, v]) => [`stateInfo.parms.${k}`, v])),
    };
    await page.evaluate(`(() => {
      const f = ${JSON.stringify(fields)};
      for (const [id, v] of Object.entries(f)) {
        const el = document.getElementById(id);
        if (!el) throw new Error('missing field ' + id);
        const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
        el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
      }
      document.querySelector('button[type=submit]').click();
    })()`);
    let text = '';
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      text = await page.evaluate<string>(`document.body.innerText`);
      if (text.includes('Take home pay (net pay)')) break;
    }
    const block = text.split('Employee Paycheck Results')[1]?.split('EDIT')[0];
    if (!block) throw new Error('no results block on PaycheckCity');
    const rows = block.split('\n').map((s) => s.trim()).filter(Boolean);
    const lines: Record<string, number> = {};
    for (let i = 0; i + 1 < rows.length; i += 2) {
      const m = /^(-?)\$([\d,]+\.\d\d)$/.exec(rows[i + 1]);
      if (!m) throw new Error(`unparseable PaycheckCity row: ${rows[i]} / ${rows[i + 1]}`);
      lines[rows[i]] = Math.round(Number(m[2].replace(/,/g, '')) * 100) * (m[1] ? -1 : 1);
    }
    return { lines };
  } finally {
    await page.close();
  }
}

// ---- compare -------------------------------------------------------------

const money = (c: number) => `${c < 0 ? '-' : ''}$${(Math.abs(c) / 100).toFixed(2)}`;

async function main() {
  const cases = buildCases();
  cases.forEach(runOurs);
  const chrome = await startChrome();
  const report: any[] = [];
  let exact = 0, near = 0, off = 0, errors = 0;
  try {
    console.log(`Engine vs PaycheckCity - ${cases.length} cases, hard states, check date ${CHECK_DATE}, seed ${SEED}\n`);
    console.log(['#', 'ST', 'freq', 'filing', 'annual', 'net ours', 'net PCC', 'diff', 'state diff', 'fed diff', 'verdict'].map((h, i) => (i < 4 ? h.padEnd(i === 3 ? 18 : 6) : h.padStart(11))).join(' '));
    for (const c of cases) {
      if (!c.ours) { errors++; report.push({ ...c, verdict: 'engine-error' }); console.log(`${c.n} ${c.stateCode} ENGINE ERROR: ${c.oursError}`); continue; }
      let pcc: Pcc | undefined, pccError: string | undefined;
      for (let attempt = 0; attempt < 3 && !pcc; attempt++) {
        try { pcc = await runPcc(c); } catch (e) { pccError = (e as Error).message; await sleep(1500); }
      }
      if (!pcc) { errors++; report.push({ ...c, verdict: 'pcc-error', pccError }); console.log(`${c.n} ${c.stateCode} PCC ERROR: ${pccError}`); continue; }
      const L = pcc.lines;
      const net = L['Take home pay (net pay)'];
      const fed = L['Federal Withholding'];
      const ss = L['Social Security'];
      const med = L['Medicare'];
      const state = L['State Tax Withholding'] ?? 0;
      const d = {
        gross: c.ours.gross - L['Gross Pay'], federal: c.ours.federal - fed, socialSecurity: c.ours.socialSecurity - ss,
        medicare: c.ours.medicare - med, state: c.ours.state - state, net: c.ours.net - net,
      };
      const absNet = Math.abs(d.net);
      const verdict = absNet === 0 ? 'exact' : absNet <= TOLERANCE_CENTS ? 'within-tolerance' : 'DIFFERS';
      if (verdict === 'exact') exact++; else if (verdict === 'within-tolerance') near++; else off++;
      report.push({ ...c, pcc: L, diffCents: d, verdict });
      console.log([String(c.n).padEnd(6), c.stateCode.padEnd(6), c.freq.ours.padEnd(6).slice(0, 6), c.filing.ours.padEnd(18), money(c.annualGross * 100).padStart(11), money(c.ours.net).padStart(11), money(net).padStart(11), money(d.net).padStart(11), money(d.state).padStart(11), money(d.federal).padStart(11), verdict.padStart(11)].join(' '));
    }
  } finally {
    chrome.kill();
  }
  writeFileSync(OUT, JSON.stringify({ checkDate: CHECK_DATE, seed: SEED, toleranceCents: TOLERANCE_CENTS, summary: { total: cases.length, exact, withinTolerance: near, differs: off, errors }, cases: report }, null, 2));
  console.log(`\nTotal ${cases.length}: exact ${exact}, within ${TOLERANCE_CENTS}c ${near}, differs ${off}, errors ${errors}. Wrote ${OUT}`);
  if (off > 0 || errors > 0) process.exitCode = 1;
}

await main();

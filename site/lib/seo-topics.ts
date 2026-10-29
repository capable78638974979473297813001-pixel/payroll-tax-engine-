import { calculatePaycheck } from '../../src/calculate.ts';
import { minimumWage } from '../../src/minimum-wage.ts';
import { statePensionRules } from '../../src/registry.ts';
import type { PaycheckInput } from '../../src/types.ts';
import { solveGrossUp } from './grossup.ts';
import { comparePaychecks } from './compare.ts';
import { employerTaxes, parseQuarter } from './employer-taxes.ts';
import type { Faq, GeneratedPage } from './seo-pages.ts';
import { GEOCODE } from './geocoding-facts.ts';

/**
 * Topic landing pages for the searches a buyer of a payroll tax engine makes: the engine, the
 * income tax engine, the API, gross to net, net to gross, employer taxes, local tax, multi-state,
 * reciprocity, rates and wage bases. Like the state pages they are generated: every figure is read
 * from the rule files the engine uses, and every worked example is run through the engine, so a
 * page cannot show a number the engine would not return. Each page is about one thing and says
 * what it does not cover.
 */

export interface StateRow { code: string; name: string; slug: string; d26: Record<string, any>; d27: Record<string, any> }

export interface Helpers {
  shell: (p: { title: string; description: string; eyebrow: string; h1: string; sub: string; breadcrumb: { name: string; path: string }[]; body: string; faq: Faq[] }) => string;
  esc: (s: string) => string;
  money: (cents: number) => string;
  dollars: (n: number) => string;
  pct: (r: number) => string;
  exampleInput: (state: string, certificate?: Record<string, unknown>, gross?: number, pretax?: number) => PaycheckInput;
  exampleTable: (input: PaycheckInput) => { html: string; net: number; gross: number } | null;
  CURL: (state: string, certificate: string) => string;
  federalFacts: () => { ssRate: number; ssBase26: number; ssBase27: number; medicare: number; addlMedicare: number; addlThreshold: number };
  wageBaseOf: (raw: unknown) => number | undefined;
  states: StateRow[];
  cov: { localJurisdictions: number; statesWithLocalTax: number; localMinimumWage: number; topLocal: string; statesListedInFull: number };
}

/** Hub sections, in the order /guides lists them. */
export const GROUPS = ['Engines and APIs', 'Developers', 'Calculations', 'Withholding and wages', 'Employer taxes', 'State programs', 'Local taxes', 'States and rates', 'Who it is for', 'Buying and building'] as const;

export interface TopicDef {
  path: string;
  /** Label used in link lists. */
  label: string;
  group: (typeof GROUPS)[number];
  title: string;
  description: string;
  h1: string;
  eyebrow: string;
  sub: string;
  body: string;
  faq: Faq[];
  related: string[];
}

export function table(h: Helpers, headers: string[], rows: string[][], rightFrom = 1): string {
  const th = headers.map((x, i) => `<th${i >= rightFrom ? ' style="text-align:right"' : ''}>${h.esc(x)}</th>`).join('');
  const tr = rows.map((r) => `<tr>${r.map((c, i) => `<td${i >= rightFrom ? ' style="text-align:right"' : ''}>${c}</td>`).join('')}</tr>`).join('');
  return `<div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}
export const code = (h: Helpers, s: string) => `<div class="panel" style="margin-top:14px"><pre style="margin:0;padding:18px 22px;overflow:auto">${h.esc(s)}</pre></div>`;

const W4 = { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 } as const;
const run = (input: PaycheckInput) => calculatePaycheck(input);
const line = (r: ReturnType<typeof run>, id: string) => r.taxes.find((t) => t.id === id);

export function topics(h: Helpers): TopicDef[] {
  const f = h.federalFacts();
  const { money, dollars, pct } = h;
  const cov = h.cov;
  const states = h.states;
  const noTax = states.filter((s) => s.d26.method === 'no_income_tax');
  const flat = states.filter((s) => typeof s.d26.flatRate?.rate === 'number');
  const tables = states.filter((s) => s.d26.method !== 'no_income_tax' && typeof s.d26.flatRate?.rate !== 'number');
  const bases = states.map((s) => ({ s, base: h.wageBaseOf(s.d26.suiEmployer?.wageBase) })).filter((x): x is { s: StateRow; base: number } => typeof x.base === 'number');
  const lowBase = bases.reduce((a, b) => (b.base < a.base ? b : a));
  const highBase = bases.reduce((a, b) => (b.base > a.base ? b : a));
  const rates = states.map((s) => ({ s, rate: s.d26.suiEmployer?.newEmployerRate as number | undefined })).filter((x): x is { s: StateRow; rate: number } => typeof x.rate === 'number');
  const lowRate = rates.reduce((a, b) => (b.rate < a.rate ? b : a));
  const highRate = rates.reduce((a, b) => (b.rate > a.rate ? b : a));

  // ---- worked examples, all from the engine ------------------------------------------------
  const oh = run(h.exampleInput('OH', { residenceCity: 'Columbus', workCity: 'Columbus' }, 300_000, 0));
  const ohTable = h.exampleTable(h.exampleInput('OH', { residenceCity: 'Columbus', workCity: 'Columbus' }, 300_000, 0))!;
  const tx = run(h.exampleInput('TX', {}, 300_000));
  const txTable = h.exampleTable(h.exampleInput('TX', {}, 300_000))!;
  const ohBase = h.exampleInput('OH', { residenceCity: 'Columbus', workCity: 'Columbus' }, 300_000, 0);
  const fit = line(oh, 'US_FIT')!;
  const bonus = run({ ...h.exampleInput('TX'), earnings: [{ code: 'REG', category: 'regular', amount: 300_000 }, { code: 'BON', category: 'supplemental', amount: 500_000 }] } as PaycheckInput);
  const bonusLine = line(bonus, 'US_FIT_SUPP')!;
  const withDeduction = (category: string) => run({ ...ohBase, deductions: [{ code: 'X', category, amount: 20_000 }] } as PaycheckInput);
  const treatments = [
    ['Traditional 401(k) deferral', 'deferral_401k'],
    ['Section 125 health premium', 'section125'],
    ['HSA through payroll', 'hsa'],
  ].map(([label, cat]) => ({ label: label!, r: withDeduction(cat!) }));
  const wagesOf = (r: ReturnType<typeof run>, id: string) => line(r, id)?.taxableWages ?? 0;
  const grossUpBase = h.exampleInput('OH', { residenceCity: 'Columbus', workCity: 'Columbus' }, 300_000, 0);
  const gu = solveGrossUp(grossUpBase, 0, 250_000, run);
  const guTx = solveGrossUp(h.exampleInput('TX'), 0, 250_000, run);
  const caInput = { ...h.exampleInput('CA'), workState: { code: 'CA', certificate: {} } } as PaycheckInput;
  const txInput = h.exampleInput('TX');
  const move = comparePaychecks(txInput, caInput, { before: run(txInput), after: run(caInput) });
  const pa = run({ ...h.exampleInput('PA', { workPSD: '510101', residencePSD: '880000' }), residenceState: { code: 'NJ', certificate: {} } } as PaycheckInput);
  const ny = run({ ...h.exampleInput('NY'), residenceState: { code: 'NJ', certificate: {} }, residenceStateWithholding: { nexus: true } } as PaycheckInput);
  const cappedYtd = 18_000_000;
  const capped = run({ ...h.exampleInput('TX', {}, 1_000_000), ytd: { socialSecurity: cappedYtd, medicare: 0, futa: 0 } } as PaycheckInput);
  const mctmt = employerTaxes(parseQuarter('2026-Q2')!, { mctmt: { zone1PayrollExpense: 45_000_000, zone2PayrollExpense: 20_000_000 }, nevadaMbt: { category: 'general', grossWages: 30_000_000, healthBenefitsPaid: 2_000_000 } });
  const employerOH = oh.taxes.filter((t) => t.payer === 'employer' && t.amount > 0);
  const ssMax = Math.round(f.ssBase26 * f.ssRate * 100);

  const penBase = (amount: number, pension: Record<string, unknown>, freq = 'monthly') => ({ ...h.exampleInput('TX', {}, amount), payFrequency: freq, earnings: [{ code: 'PENSION', category: 'regular', amount }], pension } as unknown as PaycheckInput);
  const penAmount = (amount: number, pension: Record<string, unknown>, freq = 'monthly') => run(penBase(amount, pension, freq)).taxes[0]!.amount;
  const pen = {
    none: penAmount(200_000, { kind: 'periodic' }),
    mfj: penAmount(200_000, { kind: 'periodic', w4p: { filingStatus: 'married_joint' } }),
    other: penAmount(200_000, { kind: 'periodic', w4p: { multiplePensionsAmount: 4_000_000 } }),
    credit: penAmount(500_000, { kind: 'periodic', w4p: { credits: 100_000 } }),
    big: penAmount(500_000, { kind: 'periodic' }),
    extra: penAmount(500_000, { kind: 'periodic', w4p: { extraWithholding: 5_000 } }),
  };
  const penDetail = run(penBase(200_000, { kind: 'periodic' })).taxes[0]!.detail ?? '';
  const lump = (p: Record<string, unknown>) => penAmount(1_000_000, p);
  const pr = statePensionRules('2026-06-15')!;
  const prEntries = Object.entries(pr.states).sort((a, b) => a[0].localeCompare(b[0]));
  const stateName = (c: string) => h.states.find((x) => x.code === c)?.name ?? c;
  const srcLink = (e: { sources?: Array<{ title: string; url: string }> }) => (e.sources ?? []).map((x) => `<a href="${h.esc(x.url)}" rel="noopener">${h.esc(x.title)}</a>`).join('<br>');
  const statusText = (e: { status: string; notes?: string }) =>
    e.status === 'required' ? 'Withholds unless the payee opts out, or on a rule the state sets' : e.status === 'election_only' ? 'Only when the payee asks' : 'Nothing withheld';
  const penState = (st: string, pension: Record<string, unknown>, amount: number) => run({ ...penBase(amount, pension), workState: undefined, residenceState: { code: st } } as unknown as PaycheckInput).taxes.find((t) => t.id.endsWith('_PENSION_SIT'))?.amount ?? 0;

  const money3000 = money(300_000);

  const D: TopicDef[] = [];
  const add = (t: TopicDef) => D.push(t);

  // ============================== Engines and APIs ===========================================
  add({
    path: '/payroll-tax-calculation-engine', label: 'Payroll tax calculation engine', group: 'Engines and APIs',
    title: 'Payroll tax calculation engine: how it works | Omnia.tax',
    description: 'What a payroll tax calculation engine does, the inputs it needs, the lines it returns, and a worked paycheck run through ours. Federal, state, local, employer.',
    h1: 'Payroll tax calculation engine', eyebrow: 'Engines and APIs',
    sub: 'A payroll tax calculation engine turns one paycheck\'s earnings, deductions and withholding certificates into every tax line, so your product does not carry the rules.',
    body: `
    <p>A payroll tax calculation engine is the part of payroll software that knows the rules: which wages each tax applies to, at what rate, up to what cap, and who pays it. You give it a paycheck. It gives back each tax with the wages it applied to, and net pay. It does not run payroll, pay anyone or file anything.</p>
    <h2>What goes in</h2>
    <ul>
      <li><strong>Check date and pay frequency.</strong> The check date, not the pay period, decides which year's rules apply.</li>
      <li><strong>Earnings and deductions,</strong> each with a category, because the category decides which taxes it touches.</li>
      <li><strong>The employee's Form W-4</strong> for federal income tax, and the state's own withholding certificate.</li>
      <li><strong>Year-to-date wages,</strong> so caps like the Social Security wage base (${dollars(f.ssBase26)} in 2026) stop the tax at the right paycheck.</li>
      <li><strong>Where the work is done,</strong> and where the employee lives when it differs.</li>
    </ul>
    <h2>What comes out</h2>
    <p>One line per tax: an id, who pays it, the taxable wages, the amount in cents and a sentence explaining how it was reached. Then gross pay, pre-tax and post-tax deductions, employee and employer totals, and net pay. Here is a single employee in Columbus, Ohio, paid ${money(oh.grossPay)} biweekly, run through the Omnia.tax engine:</p>
    ${ohTable.html}
    <p>Net pay is ${money(oh.netPay)}. The employer lines are a cost to the employer and are not taken from the employee.</p>
    <h2>What makes an engine trustworthy</h2>
    <ul>
      <li><strong>Effective-dated rules.</strong> A correction for an earlier year must use that year's tables.</li>
      <li><strong>Per-tax taxable wages.</strong> One deduction can be pre-tax for income tax and not for Social Security. See <a href="/pre-tax-deduction-tax-treatment">how deductions are treated tax by tax</a>.</li>
      <li><strong>Explainable lines.</strong> A payroll specialist should be able to audit a figure from its detail text.</li>
      <li><strong>Local coverage that says what it covers.</strong> Omnia.tax covers ${cov.localJurisdictions.toLocaleString('en-US')} local jurisdictions in ${cov.statesWithLocalTax} states and publishes which on the <a href="/coverage">coverage page</a>.</li>
    </ul>
    <h2>Use ours</h2>
    <p>Omnia.tax exposes this engine as an <a href="/payroll-tax-api">HTTP API</a> at $0.08 per paycheck calculation after a 14-day trial.</p>`,
    faq: [
      { q: 'What is a payroll tax calculation engine?', a: 'Software that takes one paycheck\'s earnings, deductions, withholding certificates and location and returns each payroll tax with the wages it applied to and who pays it. It calculates; it does not file, deposit or pay.' },
      { q: 'What is the difference between a payroll tax engine and payroll software?', a: 'Payroll software runs payroll: employees, pay runs, employee payments, filings. A tax engine is one component inside it, responsible only for the tax math. Many payroll products embed an engine rather than build the rules themselves.' },
      { q: 'Does a payroll tax engine file my taxes?', a: 'No. Omnia.tax calculates withholding and employer taxes. You, or your payroll provider, still file returns and deposit the tax.' },
    ],
    related: ['/payroll-tax-api', '/gross-to-net-api', '/build-vs-buy-payroll-tax-engine', '/payroll-tax-calculation'],
  });

  add({
    path: '/income-tax-calculation-engine', label: 'Income tax calculation engine', group: 'Engines and APIs',
    title: 'Income tax calculation engine for payroll withholding | Omnia.tax',
    description: 'An income tax calculation engine for payroll: federal withholding from the Form W-4 and state withholding for all 50 states and DC, with each step explained.',
    h1: 'Income tax calculation engine for payroll', eyebrow: 'Engines and APIs',
    sub: 'How an engine works out the income tax to withhold from a paycheck: the federal W-4 method, and what each state does differently.',
    body: `
    <p>An income tax calculation engine for payroll answers one question per paycheck: how much income tax should the employer withhold? That is withholding, an estimate spread across pay periods, not the employee's final tax liability. The employee settles the difference on their return.</p>
    <h2>Federal income tax withholding</h2>
    <p>The federal amount comes from the employee's Form W-4 using the IRS percentage method: annualise the wages, apply the filing-status adjustment and any W-4 entries (the multiple-jobs box, dependent credit, other income, deductions), find the bracket, then divide the annual figure back to one paycheck and add any extra withholding. For the ${money(oh.grossPay)} biweekly paycheck in our Ohio example, the engine's own explanation of that line reads:</p>
    <p><em>${h.esc(fit.detail ?? '')}</em></p>
    <p>The result is ${money(fit.amount)} of federal income tax on ${money(fit.taxableWages)} of taxable wages.</p>
    <h2>State income tax withholding</h2>
    <p>States do not share a method. In the 2026 rules Omnia.tax carries: ${noTax.length} jurisdictions with no tax on wages (${noTax.map((s) => h.esc(s.name)).join(', ')}); ${flat.length} with a flat rate; and ${tables.length} that use their own tables or formulas, where the result depends on pay, pay frequency and the employee's state certificate. See <a href="/state-income-tax-withholding-api">state income tax withholding</a>.</p>
    <h2>Local income tax</h2>
    <p>Some cities, counties and school districts tax wages as well, and which one applies can depend on both the work and home address. The engine covers ${cov.localJurisdictions.toLocaleString('en-US')} jurisdictions in ${cov.statesWithLocalTax} states. <a href="/local-payroll-tax-api">Local payroll tax</a> explains how the right one is chosen.</p>
    <h2>Supplemental wages</h2>
    <p>Bonuses and commissions can be withheld at a flat supplemental rate or aggregated with regular pay. See <a href="/bonus-tax-withholding-calculation">bonus withholding</a>.</p>
    <h2>Run it</h2>
    <p>Send a paycheck to the <a href="/income-tax-withholding-api">income tax withholding API</a> and every federal, state and local income tax line comes back in one response.</p>`,
    faq: [
      { q: 'What is an income tax calculation engine?', a: 'A component that works out how much income tax to withhold from each paycheck, using the employee\'s withholding certificates and the federal, state and local rules for the check date.' },
      { q: 'Is withholding the same as the tax an employee owes?', a: 'No. Withholding is an estimate collected through the year from the employee\'s W-4 and pay. The employee\'s actual tax is settled on their return, so a refund or a balance due is normal.' },
      { q: 'How does federal withholding use the Form W-4?', a: 'The engine annualises the wages, adjusts for filing status and the W-4 entries (multiple jobs, dependents, other income, deductions), finds the bracket, then divides back to one paycheck and adds any extra withholding.' },
    ],
    related: ['/income-tax-withholding-api', '/federal-income-tax-withholding-calculator', '/state-income-tax-withholding-api', '/payroll-tax-calculation-engine'],
  });

  add({
    path: '/income-tax-withholding-api', label: 'Income tax withholding API', group: 'Engines and APIs',
    title: 'Income tax withholding API: federal, state, local | Omnia.tax',
    description: "An income tax withholding API: send a Form W-4 and a work location, get federal, state and local income tax for one paycheck in cents, each line explained.",
    h1: 'Income tax withholding API', eyebrow: 'Engines and APIs',
    sub: 'Which request fields drive income tax withholding, and what comes back.',
    body: `
    <p>The income tax part of <code>POST /v1/paycheck</code> is driven by four groups of fields. Everything else on the request (earnings, deductions, year-to-date wages) shapes the wages the tax is applied to.</p>
    <h2>The fields that matter</h2>
    ${table(h, ['Field', 'What it controls'], [
      ['<code>federalW4.filingStatus</code>', 'The standard-deduction adjustment and which bracket table applies.'],
      ['<code>federalW4.multipleJobs</code>', 'Step 2 of the 2020-or-later Form W-4: uses the higher-withholding table.'],
      ['<code>federalW4.dependentCredit</code>, <code>otherIncome</code>, <code>deductions</code>', 'Steps 3, 4(a) and 4(b), in cents.'],
      ['<code>federalW4.extraWithholding</code>', 'Extra federal tax per paycheck, step 4(c).'],
      ['<code>workState.code</code> and <code>certificate</code>', 'Which state formula runs and the state-specific withholding certificate answers.'],
      ['<code>residenceState</code>', 'Needed when the employee lives in a different state, for reciprocity and residence-based tax.'],
    ], 1).replace(/text-align:right/g, 'text-align:left')}
    <h2>An example response</h2>
    <p>For a single employee in Texas paid ${money(tx.grossPay)} biweekly (Texas has no state income tax), the income tax line is:</p>
    ${table(h, ['Tax', 'Taxable wages', 'Amount'], tx.taxes.filter((t) => t.id === 'US_FIT').map((t) => [h.esc(t.name), money(t.taxableWages), money(t.amount)]), 1)}
    <p>There is no state income tax line, because the engine returns a line only where a tax applies.</p>
    ${code(h, h.CURL('TX', ''))}
    <h2>Exempt employees and overrides</h2>
    <p>The request accepts the W-4 exempt flag, extra withholding, and the voluntary-withholding agreement for categories that are otherwise exempt, so the response follows what the employee actually filed.</p>
    <p>See the <a href="/docs/paycheck">API reference</a> for every field, or try a paycheck in the <a href="/sandbox">calculator</a>.</p>`,
    faq: [
      { q: 'What does an income tax withholding API return?', a: 'For one paycheck, each federal, state and local income tax line with the wages it applied to, the amount in cents and a short explanation, plus the totals and net pay.' },
      { q: 'Does it support the current Form W-4?', a: 'Yes. It implements the 2020-or-later Form W-4: filing status, the multiple-jobs checkbox, the dependent credit, other income, deductions and extra withholding.' },
      { q: 'Are amounts in dollars or cents?', a: 'Integer cents everywhere, in requests and responses. A request that sends dollars with a decimal is rejected with a field-level error.' },
    ],
    related: ['/income-tax-calculation-engine', '/federal-income-tax-withholding-calculator', '/payroll-tax-api', '/docs/paycheck'],
  });

  add({
    path: '/payroll-tax-engine', label: 'Payroll tax engine', group: 'Engines and APIs',
    title: 'Payroll tax engine: what it is and who needs one | Omnia.tax',
    description: 'A payroll tax engine calculates the taxes on a paycheck so a payroll product does not carry the rules. What it covers, what it does not, and how to choose one.',
    h1: 'Payroll tax engine', eyebrow: 'Engines and APIs',
    sub: 'The component that knows the tax rules, and the questions to ask before you pick one.',
    body: `
    <p>A payroll tax engine is a service or library that calculates the taxes on a paycheck. Payroll platforms, HR systems and staffing software use one so they do not have to maintain the federal, state and local rules themselves.</p>
    <h2>Who needs one</h2>
    <ul>
      <li>A team building payroll or HR software that needs gross-to-net without owning the rules.</li>
      <li>A business with its own payroll process that needs to check or estimate withholding by location.</li>
      <li>A finance team modelling the cost of a hire in another state, including the employer's side.</li>
    </ul>
    <h2>What an engine covers</h2>
    <p>Federal income tax, Social Security, Medicare, state and local income tax, employer unemployment tax, and state paid-leave contributions. Omnia.tax adds garnishment limits and a minimum-wage check on the same call.</p>
    <h2>What it does not</h2>
    <p>Filing returns, depositing tax, paying employees and advising. Those are separate services. If you need them in one vendor, see the <a href="/payroll-tax-engine-comparison">comparison of payroll tax engines</a>.</p>
    <h2>How to choose</h2>
    <ul>
      <li>Check the local layer first, and how the right jurisdiction is found from an address. Ours: ${cov.localJurisdictions.toLocaleString('en-US')} local jurisdictions in ${cov.statesWithLocalTax} states, listed by name on <a href="/coverage">coverage</a>, found by address geocoding.</li>
      <li>Ask for a worked example with your own edge cases: a bonus, a multi-state employee, a pre-tax deduction.</li>
      <li>Ask what happens when a state changes a rate mid-year.</li>
      <li>Ask for the price at your volume. Ours is published: $0.08 per paycheck calculation.</li>
    </ul>
    <p>Read how the <a href="/payroll-tax-calculation-engine">calculation engine works</a>, or start with the <a href="/payroll-tax-api">API</a>.</p>`,
    faq: [
      { q: 'What is a payroll tax engine?', a: 'A service that calculates the taxes on a paycheck: federal, state and local withholding, Social Security, Medicare and employer taxes. It is the rules component inside payroll software.' },
      { q: 'How do I choose a payroll tax engine?', a: 'Compare local-tax coverage, how it handles effective dates and mid-year changes, whether each line is explained, whether you need filing as well as calculation, and the price per calculation at your volume.' },
    ],
    related: ['/payroll-tax-calculation-engine', '/payroll-tax-engine-comparison', '/build-vs-buy-payroll-tax-engine', '/embedded-payroll-tax-engine'],
  });

  add({
    path: '/payroll-tax-calculator-api', label: 'Payroll tax calculator API', group: 'Engines and APIs',
    title: 'Payroll tax calculator API vs a calculator page | Omnia.tax',
    description: "A payroll tax calculator you can call: the engine behind our paycheck calculator as an HTTP API with a free test key. When to use the page and when the API.",
    h1: 'Payroll tax calculator API', eyebrow: 'Engines and APIs',
    sub: 'The calculator page is for trying a paycheck. The API is for calculating them from your own software.',
    body: `
    <p>People search for a payroll tax calculator when they want to see what a paycheck costs. People search for a payroll tax calculator API when they want their software to do that for them. Omnia.tax is both, and they run the same engine and the same rules.</p>
    <h2>The calculator</h2>
    <p>The <a href="/sandbox">paycheck calculator</a> takes an address or a state, pay, a Form W-4 and deductions, and shows each tax line with a one-line explanation. Signed-in visitors run it with no key. It also shows the exact request it sent, as JSON and as cURL, so you can copy it into your own code.</p>
    <h2>The API</h2>
    <p>The same request goes to <code>POST /v1/paycheck</code> with an API key. It returns JSON in integer cents, and it is documented in an <a href="/v1/openapi.json">OpenAPI 3.1 document</a> and a <a href="/v1/schemas/paycheck-request.json">JSON Schema</a>.</p>
    <h2>Try it before you pay</h2>
    <p>A <strong>test key</strong> runs the same engine and data as a live key, needs no card, and is never billed. It is capped at 30 requests a minute and 500 a day. A live key is $0.08 per paycheck calculation after a 14-day free trial.</p>
    ${code(h, h.CURL('TX', ''))}
    <h2>Which to use</h2>
    ${table(h, ['You want to', 'Use'], [
      ['See what one paycheck costs', 'The calculator'],
      ['Calculate paychecks from your software', 'The API with a key'],
      ['Check a result against your payroll provider', 'The calculator, then copy the request as cURL'],
      ['Explain why two paychecks differ', '<a href="/compare-two-paychecks-api">The compare endpoint</a>'],
    ]).replace(/text-align:right/g, 'text-align:left')}`,
    faq: [
      { q: 'Is there a free payroll tax calculator API?', a: 'Omnia.tax has free test keys: the same engine and data as a live key, no card needed, never billed, capped at 30 requests a minute and 500 a day. A live key is $0.08 per paycheck calculation after a 14-day trial.' },
      { q: 'Does the calculator page use the same rules as the API?', a: 'Yes. The page and the API call the same engine and the same rule files.' },
    ],
    related: ['/payroll-tax-api-test-keys', '/paycheck-calculator-api', '/payroll-tax-api', '/payroll-tax-api-pricing'],
  });

  add({
    path: '/paycheck-calculator-api', label: 'Paycheck calculator API', group: 'Engines and APIs',
    title: 'Paycheck calculator API: gross pay to net pay | Omnia.tax',
    description: 'A paycheck calculator API that returns net pay and every tax line for a gross pay, pay frequency and location. JSON in cents, explainable, federal to local.',
    h1: 'Paycheck calculator API', eyebrow: 'Engines and APIs',
    sub: 'Send gross pay and a location, get net pay and the line-by-line reason for it.',
    body: `
    <p>A paycheck calculator API takes a gross amount and tells you what lands in the employee's account and where the rest goes. The value is in the second half: each tax, who pays it, and why it is that amount.</p>
    <h2>A paycheck, end to end</h2>
    <p>A single employee in Texas paid ${money(tx.grossPay)} biweekly:</p>
    ${txTable.html}
    <p>Gross pay ${money(tx.grossPay)}, less ${money(tx.employeeTaxTotal)} of employee taxes, equals net pay ${money(tx.netPay)}. The employer separately owes ${money(tx.employerTaxTotal)}.</p>
    <h2>What you can vary</h2>
    <ul>
      <li>Salary, hourly, bonus and commission earnings, and reimbursements that are not taxed.</li>
      <li>Pre-tax and post-tax deductions, each with a category.</li>
      <li>Pay frequency from weekly to annual, and the check date.</li>
      <li>The employee's W-4, state certificate, and home address if it differs from the work address.</li>
    </ul>
    <h2>Beyond one paycheck</h2>
    <p>The same API <a href="/compare-two-paychecks-api">compares two paychecks</a> and explains the difference, and <a href="/net-to-gross-calculator-api">solves for the gross</a> that leaves a target take-home pay.</p>
    ${code(h, h.CURL('TX', ''))}`,
    faq: [
      { q: 'How do I calculate net pay from gross pay?', a: 'Subtract pre-tax deductions, work out each tax on its own taxable wages, then subtract the employee taxes and the post-tax deductions from gross. The API does this in one call and returns each step.' },
      { q: 'Can the API handle hourly and bonus pay?', a: 'Yes. Earnings carry a category, so regular pay, supplemental pay such as bonuses and commissions, and untaxed reimbursements are each treated the way the rules require.' },
    ],
    related: ['/gross-to-net-api', '/net-to-gross-calculator-api', '/compare-two-paychecks-api', '/paycheck-calculation-formula'],
  });

  add({
    path: '/gross-to-net-api', label: 'Gross-to-net API', group: 'Calculations',
    title: 'Gross-to-net API: payroll gross to net pay | Omnia.tax',
    description: 'How gross-to-net payroll calculation works and a gross-to-net API that returns each step: pre-tax deductions, each tax, post-tax deductions, net pay.',
    h1: 'Gross-to-net API', eyebrow: 'Calculations',
    sub: 'Gross to net is the core payroll calculation. The response shows every step so you can check the identity yourself.',
    body: `
    <p>Gross-to-net is the calculation from what an employee earned to what they take home. The response from <code>POST /v1/paycheck</code> carries each of its parts, and they satisfy a simple identity you can test:</p>
    <p><code>net pay = gross pay − pre-tax deductions − employee taxes − post-tax deductions</code></p>
    <h2>Checked on a real response</h2>
    <p>For the Ohio paycheck in our <a href="/payroll-tax-calculation-engine">engine overview</a>: gross ${money(oh.grossPay)}, pre-tax deductions ${money(oh.pretaxDeductions)}, employee taxes ${money(oh.employeeTaxTotal)}, post-tax deductions ${money(oh.posttaxDeductions)}. ${money(oh.grossPay)} − ${money(oh.pretaxDeductions)} − ${money(oh.employeeTaxTotal)} − ${money(oh.posttaxDeductions)} = ${money(oh.grossPay - oh.pretaxDeductions - oh.employeeTaxTotal - oh.posttaxDeductions)}, and the API's <code>netPay</code> is ${money(oh.netPay)}.</p>
    <h2>The response fields</h2>
    ${table(h, ['Field', 'Meaning'], [
      ['<code>grossPay</code>', 'Total earnings for the check, in cents.'],
      ['<code>pretaxDeductions</code>', 'Deductions taken before tax. Each tax still decides for itself whether the deduction reduces its wages.'],
      ['<code>taxes[]</code>', 'One entry per tax: id, name, payer, jurisdiction, taxable wages, amount, detail.'],
      ['<code>employeeTaxTotal</code>', 'Taxes withheld from the employee.'],
      ['<code>employerTaxTotal</code>', 'Taxes the employer pays on top. Not part of net pay.'],
      ['<code>posttaxDeductions</code>', 'Deductions taken after tax, such as a Roth contribution or a garnishment.'],
      ['<code>netPay</code>', 'What the employee takes home.'],
    ]).replace(/text-align:right/g, 'text-align:left')}
    <h2>Going the other way</h2>
    <p>If you know the take-home pay and need the gross, use the <a href="/net-to-gross-calculator-api">net-to-gross endpoint</a>.</p>`,
    faq: [
      { q: 'What does gross to net mean in payroll?', a: 'It is the calculation from an employee\'s gross pay to their net pay: subtract pre-tax deductions, the taxes withheld from the employee and any post-tax deductions.' },
      { q: 'Are employer taxes part of net pay?', a: 'No. Employer taxes such as the employer share of Social Security and Medicare and unemployment tax are an extra cost to the employer. They do not reduce the employee\'s net pay.' },
    ],
    related: ['/paycheck-calculator-api', '/net-to-gross-calculator-api', '/paycheck-calculation-formula', '/pre-tax-deduction-tax-treatment'],
  });

  add({
    path: '/net-to-gross-calculator-api', label: 'Net-to-gross (gross-up) API', group: 'Calculations',
    title: 'Net-to-gross calculator API: find gross pay for a net | Omnia.tax',
    description: "A net-to-gross payroll calculator API: give a take-home pay, get the gross that produces it, found by running the real engine. Worked example to the cent.",
    h1: 'Net-to-gross calculator API', eyebrow: 'Calculations',
    sub: 'When the promise is a take-home amount, the gross has to be found. The engine only goes forward, so ours searches it.',
    body: `
    <p>Net-to-gross, or gross-up, answers: what gross pay leaves the employee a given take-home amount? It comes up in sign-on bonuses promised after tax, relocation payments, and offers quoted as net.</p>
    <h2>Why it is not a formula</h2>
    <p>Withholding has brackets, caps and per-tax wage bases, so net pay is not a straight multiple of gross. <code>POST /v1/paycheck/gross-up</code> runs the real engine on candidate amounts, in whole cents, and returns the smallest amount whose net pay reaches the target. The answer and the returned paycheck are engine results, not an estimate.</p>
    <h2>Two worked examples</h2>
    <p>Target take-home of ${money(250_000)} on a biweekly paycheck:</p>
    ${table(h, ['Location', 'Gross needed', 'Net pay', 'Exact'], [
      ['Texas (no state income tax)', money(guTx.amount), money(guTx.netPay), guTx.exact ? 'Yes' : `${money(guTx.overTarget)} over`],
      ['Columbus, Ohio (state and city tax)', money(gu.amount), money(gu.netPay), gu.exact ? 'Yes' : `${money(gu.overTarget)} over`],
    ], 1)}
    <p>The Ohio employee needs ${money(gu.amount - guTx.amount)} more gross for the same take-home, because of state and city tax.</p>
    <h2>When the target is skipped</h2>
    <p>Occasionally a tax step or rounding rule makes a one-cent change in gross move net by two cents, so an exact target does not exist. The response then returns the smallest amount that reaches it with <code>exact: false</code> and how many cents it is over.</p>
    <h2>The request</h2>
    ${code(h, `POST /v1/paycheck/gross-up\n{ ...a paycheck request..., "grossUp": { "targetNetPay": 250000, "earningIndex": 0 } }`)}
    <p>The earning at <code>earningIndex</code> is the one solved for; its amount is ignored. The response includes <code>request</code> with the solved amount filled in, so you can reuse it, and <code>result</code>, the full paycheck. Billed as one paycheck.</p>`,
    faq: [
      { q: 'How do you calculate gross pay from net pay?', a: 'There is no single formula, because withholding uses brackets and caps. The usual method is to search: try a gross, calculate the net, and adjust until the net matches. Omnia.tax does this with the real engine, in whole cents.' },
      { q: 'What is a payroll gross-up?', a: 'Paying an employee enough gross that the amount they take home after tax equals an agreed figure, common for after-tax bonuses and relocation payments.' },
      { q: 'Is the gross-up answer exact?', a: 'Usually to the cent. If a tax step skips the target, the response returns the smallest gross that reaches it, marks exact as false and shows how many cents over it is.' },
    ],
    related: ['/gross-to-net-api', '/bonus-tax-withholding-calculation', '/paycheck-calculator-api', '/compare-two-paychecks-api'],
  });

  add({
    path: '/compare-two-paychecks-api', label: 'Compare two paychecks API', group: 'Calculations',
    title: 'Compare two paychecks: explain a net pay difference | Omnia.tax',
    description: "Compare two paychecks and see exactly why net pay differs, tax by tax. Each step re-runs the real engine, so the steps add up. Example: a move to California.",
    h1: 'Compare two paychecks and explain the difference', eyebrow: 'Calculations',
    sub: 'A raise, a move, a new deduction: the compare endpoint attributes the change in net pay to each input that changed.',
    body: `
    <p>Why did this employee's net pay change? <code>POST /v1/paycheck/compare</code> takes two paychecks, or one paycheck and the fields that changed, and attributes the difference.</p>
    <h2>How the explanation is built</h2>
    <p>It is not a guess. The inputs are diffed, then each difference is applied to the first paycheck one at a time, in a fixed order, and the engine is re-run after each. What a step moves is exactly what that change did given the changes before it, and the steps add up to the whole difference. When two changes interact, another order can split the credit differently; the total is the same.</p>
    <h2>A worked example: a move from Texas to California</h2>
    <p>The same ${money(tx.grossPay)} biweekly employee, moving from Texas to California. Net pay goes from ${money(tx.netPay)} to ${money(run(caInput).netPay)}, ${move.totals.netPay.change < 0 ? 'a drop' : 'a rise'} of ${money(Math.abs(move.totals.netPay.change))}.</p>
    ${move.steps.map((st) => `<p><strong>${h.esc(st.summary)}.</strong> ${h.esc(st.narrative)}</p>`).join('')}
    <p>Tax ids with <code>_ER</code> are employer taxes; they appear in the explanation but do not change take-home pay.</p>
    <h2>The request</h2>
    ${code(h, `POST /v1/paycheck/compare\n{ "before": { ...a paycheck request... }, "change": { "workState": { "code": "CA" } } }`)}
    <p>Send <code>after</code> for a full second request, or <code>change</code> for only the fields that differ. Billed as two paychecks.</p>`,
    faq: [
      { q: 'How can I see why my net pay changed?', a: 'Compare the two paychecks tax by tax. The compare endpoint does this by applying each changed input to the earlier paycheck in turn and re-running the engine, so each step shows exactly what that change moved.' },
      { q: 'Does the order of changes affect the explanation?', a: 'It can, when changes interact: a raise and a filing status both move the bracket, so the credit between them can split differently in another order. The total difference is always the same.' },
    ],
    related: ['/paycheck-calculator-api', '/multi-state-payroll-tax-calculation', '/net-to-gross-calculator-api', '/mcp-payroll-tax-server'],
  });

  add({
    path: '/state-income-tax-withholding-api', label: 'State income tax withholding API', group: 'Calculations',
    title: 'State income tax withholding API: all 50 states and DC | Omnia.tax',
    description: "State income tax withholding for all 50 states and DC through one API: flat-rate, table and no-tax states, state certificates and reciprocity.",
    h1: 'State income tax withholding API', eyebrow: 'Calculations',
    sub: 'Fifty-one jurisdictions, three kinds of method, and one request shape.',
    body: `
    <p>State withholding is where a payroll tax engine earns its keep: no two states agree on the form, the formula or the certificate. One request, <code>workState: { code }</code>, selects the right one.</p>
    <h2>Three kinds of state</h2>
    ${table(h, ['Method', 'States in the 2026 rules', 'What the engine does'], [
      ['No tax on wages', `${noTax.length}: ${noTax.map((s) => h.esc(s.name)).join(', ')}`, 'Returns no state income tax line. Employer unemployment tax still applies.'],
      ['Flat rate', `${flat.length}: ${flat.map((s) => `${h.esc(s.name)} ${pct(s.d26.flatRate.rate)}`).join(', ')}`, 'Applies the rate to wages after the state\'s allowances and deductions.'],
      ['Own tables or formula', `${tables.length} states`, 'Runs the state\'s published method from pay, pay frequency and the employee\'s certificate.'],
    ], 3).replace(/text-align:right/g, 'text-align:left')}
    <h2>State certificates</h2>
    <p>Many states have their own withholding form with its own questions: allowances, filing status, additional withholding, exemptions. They go in <code>workState.certificate</code>. Where the engine needs a fact it was not given, it refuses with a <code>cannot_compute</code> error that names the missing field, rather than guessing.</p>
    <h2>Employees who cross a state line</h2>
    <p>Reciprocity agreements, resident-state credit and nexus rules decide which state or states withhold. See <a href="/multi-state-payroll-tax-calculation">multi-state payroll tax</a> and the <a href="/payroll-tax-reciprocity-agreements">list of reciprocity agreements</a>.</p>
    <h2>Per-state detail</h2>
    <p>Rates, wage bases and a worked paycheck for each state are on the <a href="/payroll-tax">payroll tax by state</a> pages, and what a salary takes home in each state is under <a href="/take-home-pay">take-home pay by state</a>.</p>`,
    faq: [
      { q: 'Which states have no income tax on wages?', a: `${noTax.map((s) => s.name).join(', ')} do not tax wages in Omnia.tax's 2026 rules, so employers there withhold no state income tax.` },
      { q: 'How many states use a flat income tax rate?', a: `${flat.length} of the ${states.length} jurisdictions use a flat rate in Omnia.tax's 2026 rules. ${tables.length} use the state's own tables or formula, and ${noTax.length} have no tax on wages.` },
      { q: 'What if a state needs information the request does not have?', a: 'The engine returns a cannot_compute error that names the missing certificate field. It does not guess.' },
    ],
    related: ['/income-tax-withholding-api', '/payroll-tax', '/payroll-tax-reciprocity-agreements', '/states-with-no-income-tax'],
  });

  add({
    path: '/local-payroll-tax-api', label: 'Local payroll tax API', group: 'Engines and APIs',
    title: 'Local payroll tax API: city, county, school district | Omnia.tax',
    description: `Local payroll tax in one call: ${cov.localJurisdictions.toLocaleString('en-US')} city, county and school district taxes in ${cov.statesWithLocalTax} states, found from the work and home address by geocoding.`.slice(0, 160),
    h1: 'Local payroll tax API', eyebrow: 'Engines and APIs',
    sub: 'Cities, counties and school districts tax wages in some states. We cover them, and find the right one from the address.',
    body: `
    <p>Beyond federal and state tax, some places tax wages locally: municipal income tax in Ohio, earned income tax and local services tax in Pennsylvania, school-district income tax in Ohio and Kentucky, occupational taxes in Kentucky and Alabama, city income taxes in Michigan, Missouri and Maryland, and others. The local layer is the most common reason a payroll tax result is wrong, so it is the layer we built most carefully.</p>
    <h2>What Omnia.tax covers</h2>
    <ul>
      <li><strong>${cov.localJurisdictions.toLocaleString('en-US')} local tax jurisdictions in ${cov.statesWithLocalTax} states,</strong> every state where we found a local wage tax. The largest: ${cov.topLocal}.</li>
      <li><strong>Each one listed by name,</strong> with its rate and where it came from, on the <a href="/coverage">coverage page</a>. ${cov.statesListedInFull} of the ${cov.statesWithLocalTax} states are listed in full; the coverage page marks the few where a list has a known gap.</li>
      <li><strong>${cov.localMinimumWage} local minimum wage ordinances,</strong> checked on the same call as the tax.</li>
    </ul>
    <h2>Geocoding picks the right jurisdiction</h2>
    <p>Local tax usually follows the work location, the home location, or both. Send a work address, and a home address if it differs, and <a href="/address-tax-jurisdiction-lookup-api">the address endpoint</a> resolves each to the city, county, school district and the state's own codes. Those become the <code>workState.certificate</code> on the paycheck request, so a paycheck is taxed for the place the address is in, not the place its ZIP code suggests. The response says how precisely each address matched.</p>
    <h2>An example</h2>
    <p>The Columbus, Ohio paycheck from our <a href="/payroll-tax-calculation-engine">engine overview</a> has a municipal line:</p>
    ${table(h, ['Tax', 'Taxable wages', 'Amount'], oh.taxes.filter((t) => t.jurisdiction === 'local' && t.payer === 'employee' && t.amount > 0).map((t) => [h.esc(t.name), money(t.taxableWages), money(t.amount)]), 1)}
    <h2>Every line explains itself</h2>
    <p>Each local tax line carries the rate, the wages it applied to and where the rate came from, so a payroll specialist can audit it. When a rate rests on a weaker source than the levying body's own document, the response says so in <code>notices</code>.</p>`,
    faq: [
      { q: 'Which states have local payroll taxes?', a: `Omnia.tax carries local taxes in ${cov.statesWithLocalTax} states, ${cov.localJurisdictions.toLocaleString('en-US')} jurisdictions in all, each listed by name on the coverage page. Pennsylvania and Ohio have the most; Kentucky, Indiana, Michigan, Alabama, Maryland and others have them too.` },
      { q: 'How does the API know which city tax applies?', a: 'It geocodes the work address, and the home address when it differs, to a city, county and school district, and the paycheck calculation applies the local taxes for those places.' },
      { q: 'Does it include local minimum wage?', a: `Yes. ${cov.localMinimumWage} city and county minimum wage ordinances are checked on the same call as the tax.` },
    ],
    related: ['/address-tax-jurisdiction-lookup-api', '/coverage', '/multi-state-payroll-tax-calculation', '/state-income-tax-withholding-api'],
  });

  add({
    path: '/address-tax-jurisdiction-lookup-api', label: 'Address to tax jurisdiction API', group: 'Engines and APIs',
    title: 'Payroll tax geocoding: address to tax jurisdiction API | Omnia.tax',
    description: 'Payroll tax geocoding: turn a work and home address into the state, local tax jurisdictions and certificate a paycheck needs, with match precision reported.',
    h1: 'Payroll tax geocoding: address to tax jurisdiction', eyebrow: 'Engines and APIs',
    sub: 'Resolve an employee once, from their addresses, to the exact local taxes that apply, and reuse the result on every pay run.',
    body: `
    <p>Payroll tax depends on where people work and live, but payroll systems store addresses as text. <code>POST /v1/address</code> turns a one-line work address, and optionally a home address, into the facts a paycheck needs.</p>
    <h2>What you send</h2>
    ${code(h, `POST /v1/address\n{ "workAddress": "77 E Gay St, Columbus, OH 43215",\n  "residenceAddress": "233 Broadway, Yonkers, NY 10701",\n  "checkDate": "2026-09-15" }`)}
    <h2>What comes back</h2>
    ${table(h, ['Field', 'Meaning'], [
      ['<code>state</code>, <code>residenceState</code>', 'The work state, and the home state when it differs.'],
      ['<code>certificate</code>', 'The state and local facts to put in <code>workState.certificate</code>: city, county, school district and the state\'s own codes.'],
      ['<code>work</code>, <code>residence</code>', 'For each address: whether it matched, the matched address, precision and point source, coordinates.'],
      ['<code>notResolvable</code>', 'Taxes that could not be checked, for example residence-based taxes when no home address was given.'],
      ['<code>warnings</code>, <code>fullyResolved</code>', 'Low-confidence reasons, and whether everything needed was found.'],
    ]).replace(/text-align:right/g, 'text-align:left')}
    <h2>Address-level, and measured</h2>
    <p>Geocoding for payroll has to land on the right side of a municipal line, so a ZIP code or a city name is not enough. Omnia.tax places the address using government-published address points (the National Address Database), county address and parcel data, OpenStreetMap, and a national address index, and reports which one answered in <code>precision</code>.</p>
    <p>We measured it: one real address in each of the ${GEOCODE.jurisdictionsTested} jurisdictions, resolved through the same pipeline the API uses. ${GEOCODE.betterThanInterpolation} of ${GEOCODE.jurisdictionsTested} resolved to a surveyed address point or better than the Census geocoder's own position along the street, ${GEOCODE.rooftop} of them to a government-published rooftop point and ${GEOCODE.rooftopOsm} to a corroborated house-level point (run ${GEOCODE.measuredOn}). That is what lets the engine pick the right city, county and school district.</p>
    <h2>It says what it could and could not resolve</h2>
    <p>If only a work address is sent, the response lists the residence-based taxes it could not check, so a missing home address does not silently become a missing tax. A lookup is recorded and not billed; only the paycheck calculation is.</p>
    <p>The <a href="/sandbox">calculator</a> uses this endpoint to fill in the state and local fields from an address.</p>`,
    faq: [
      { q: 'Why does payroll need a home address?', a: 'Several taxes depend on where the employee lives: city and school-district taxes, resident-state tax, and reciprocity between states. Without it those taxes cannot be determined.' },
      { q: 'Is an address lookup billed?', a: 'No. Address lookups are recorded but not billed. The paycheck calculation is the billed call.' },
    ],
    related: ['/local-payroll-tax-api', '/multi-state-payroll-tax-calculation', '/payroll-tax-api', '/state-income-tax-withholding-api'],
  });

  add({
    path: '/mcp-payroll-tax-server', label: 'MCP payroll tax server', group: 'Engines and APIs',
    title: 'MCP server for payroll tax: tools for AI agents | Omnia.tax',
    description: "A Model Context Protocol server for payroll tax. AI assistants can calculate and compare paychecks, gross up, look up addresses and check coverage.",
    h1: 'MCP server for payroll tax', eyebrow: 'Engines and APIs',
    sub: 'Give an AI assistant or agent the real payroll tax engine as tools, instead of letting it guess the rules.',
    body: `
    <p>Language models are unreliable at payroll tax arithmetic: the rules are specific, dated and local. The Omnia.tax MCP server hands an assistant the actual engine as tools, so it calls the calculation and reports the result rather than reciting a rate from memory.</p>
    <h2>The tools</h2>
    ${table(h, ['Tool', 'What it does', 'Billed as'], [
      ['<code>calculate_paycheck</code>', 'One paycheck: every federal, state, local and employer tax line, and net pay.', '1 paycheck'],
      ['<code>compare_paychecks</code>', 'Two paychecks and a step-by-step explanation of the difference.', '2 paychecks'],
      ['<code>gross_up</code>', 'The gross pay that leaves a target take-home amount.', '1 paycheck'],
      ['<code>employer_taxes</code>', 'New York MCTMT and the Nevada Modified Business Tax from a quarter\'s payroll.', 'Not billed'],
      ['<code>lookup_address</code>', 'A work and home address to the state, local jurisdictions and certificate.', 'Not billed'],
      ['<code>coverage</code>', 'The states and tax year the engine can compute.', 'Not billed'],
    ], 2).replace(/text-align:right/g, 'text-align:left')}
    <h2>How it connects</h2>
    <p>The server is at <code>https://api.omnia.tax/mcp</code>, speaks the Model Context Protocol over streamable HTTP with one JSON-RPC message per request, and authenticates with the same bearer key as the REST API. Per-key rate limits and billing match the REST endpoints, and a refused call is not billed. A test key works too, unbilled.</p>
    <h2>Why use it</h2>
    <ul>
      <li>An HR or finance assistant can answer "what does this offer take home in Ohio?" with an engine result.</li>
      <li>Validation failures come back as tool results the model can read and fix, naming the field.</li>
      <li>Every figure is the same one the REST API would return.</li>
    </ul>
    <p>See the <a href="/docs">docs</a> for the connection details.</p>`,
    faq: [
      { q: 'What is an MCP server?', a: 'A Model Context Protocol server exposes tools that AI assistants and agents can call. Here the tools are payroll tax calculations.' },
      { q: 'Does the MCP server cost extra?', a: 'No separate fee. Each call is billed like the REST endpoint it matches: one paycheck for a calculation or gross-up, two for a comparison, and nothing for address lookups, employer-tax estimates or coverage.' },
      { q: 'Can an AI model calculate payroll tax on its own?', a: 'It should not. Rates, caps and local rules are specific and dated, and a model can state them with confidence and be wrong. Calling an engine gives a result you can trace.' },
    ],
    related: ['/payroll-tax-api', '/compare-two-paychecks-api', '/net-to-gross-calculator-api', '/payroll-tax-api-test-keys'],
  });

  add({
    path: '/payroll-tax-api-test-keys', label: 'Payroll tax API test keys', group: 'Engines and APIs',
    title: 'Payroll tax API test keys: free, no card | Omnia.tax',
    description: 'Try the payroll tax API with a free test key: the same engine and data as a live key, no card, never billed, capped at 30 requests a minute and 500 a day.',
    h1: 'Payroll tax API test keys', eyebrow: 'Engines and APIs',
    sub: 'The staging environment is the real engine with a cap, not a mock.',
    body: `
    <p>A test key (<code>sk_test_</code>) is for building your integration without a card or a bill. It returns the real calculation, because a mock that returns different numbers from production tests nothing.</p>
    <h2>What a test key is</h2>
    ${table(h, ['', 'Test key', 'Live key'], [
      ['Engine and data', 'Same', 'Same'],
      ['Card needed', 'No (terms accepted)', 'Yes'],
      ['Billed', 'Never', '$0.08 per paycheck, after a 14-day trial'],
      ['Counted in account usage', 'No', 'Yes'],
      ['Limits', '30 requests a minute, 500 a day (UTC)', 'Per-key rate limit; no daily cap'],
      ['Expires', 'After 90 days', 'Per the key'],
    ]).replace(/text-align:right/g, 'text-align:left')}
    <p>Every response carries an <code>Omnia-Mode: test</code> or <code>live</code> header, and <code>GET /v1/me</code> tells you which kind of key you are holding.</p>
    <h2>What it is not</h2>
    <p>There is no separate pre-release server or data preview: a test key calls the production engine. It is capped so it cannot stand in for a live key.</p>
    <h2>The console</h2>
    <p>A signed-in visitor can also run the <a href="/sandbox">paycheck calculator</a> without any key. It runs the same engine, is not billed, and shows the request as JSON and cURL to copy.</p>`,
    faq: [
      { q: 'Is there a free tier or test environment for the payroll tax API?', a: 'Yes. A test key runs the same engine and data as a live key, needs no card and is never billed. It is capped at 30 requests a minute and 500 a day, and expires after 90 days.' },
      { q: 'Do test keys return real numbers?', a: 'Yes, the same numbers as a live key. There is no mock mode. The header Omnia-Mode tells you which kind of key made the call.' },
    ],
    related: ['/payroll-tax-calculator-api', '/payroll-tax-api-pricing', '/payroll-tax-api', '/mcp-payroll-tax-server'],
  });

  add({
    path: '/embedded-payroll-tax-engine', label: 'Embedded payroll tax engine', group: 'Buying and building',
    title: 'Embedded payroll tax engine for HR and payroll software | Omnia.tax',
    description: 'Embed payroll tax calculation in your HR, payroll or staffing product through an API. What the engine covers, what you still build, and how pricing scales.',
    h1: 'Embedded payroll tax engine', eyebrow: 'Buying and building',
    sub: 'For teams building a payroll, HR or staffing product who want the tax math as a service.',
    body: `
    <p>If your product pays people, or shows what people are paid, it needs payroll tax math. Embedding an engine means your code sends a paycheck and renders the result, and someone else keeps the rules current.</p>
    <h2>What the engine covers</h2>
    <ul>
      <li>Federal, state and local income tax withholding, Social Security, Medicare.</li>
      <li>Employer taxes: federal and state unemployment, state paid-leave contributions, and quarterly employer taxes in New York and Nevada.</li>
      <li>Garnishment limits and a minimum-wage check on the same call.</li>
      <li>Address resolution so you can store an employee once.</li>
    </ul>
    <h2>What you still build</h2>
    <p>The employee and pay-run data model, approvals, paying employees, filing and depositing of the tax, and the screens. Omnia.tax calculates and does not do those.</p>
    <h2>Integration shape</h2>
    <ul>
      <li>One <code>POST /v1/paycheck</code> per employee per pay run; <code>POST /v1/payCalc</code> for batches.</li>
      <li>A published <a href="/v1/openapi.json">OpenAPI document</a> to generate a client from.</li>
      <li>Field-level validation errors you can show to your users.</li>
      <li>Idempotency keys so a retry is not counted twice.</li>
    </ul>
    <h2>Pricing that scales with use</h2>
    <p>$0.08 per paycheck calculation, no seat fees and no minimum. See <a href="/payroll-tax-api-pricing">what that costs at your volume</a>.</p>`,
    faq: [
      { q: 'What is an embedded payroll tax engine?', a: 'A tax calculation service you call from inside your own payroll or HR product, so you do not build and maintain the federal, state and local rules yourself.' },
      { q: 'Does Omnia.tax handle filing and deposits?', a: 'No. It calculates only. Filing returns, depositing tax and paying employees are separate services you provide or buy elsewhere.' },
    ],
    related: ['/payroll-tax-engine', '/build-vs-buy-payroll-tax-engine', '/payroll-tax-api-pricing', '/payroll-tax-engine-comparison'],
  });

  // ============================== Calculations ===============================================
  add({
    path: '/federal-income-tax-withholding-calculator', label: 'Federal income tax withholding calculation', group: 'Calculations',
    title: 'Federal income tax withholding calculation (Form W-4) | Omnia.tax',
    description: 'How federal income tax withholding is calculated from the Form W-4 percentage method, with a worked paycheck run through the engine and each step explained.',
    h1: 'Federal income tax withholding calculation', eyebrow: 'Calculations',
    sub: 'The percentage method behind a W-4 paycheck, with a real example.',
    body: `
    <p>Federal withholding is worked out per paycheck from the employee's Form W-4 and the IRS percentage method. The steps below are what the engine does for the 2020-or-later form.</p>
    <h2>The steps</h2>
    <ol>
      <li><strong>Taxable wages for the check:</strong> gross pay less the pre-tax deductions that reduce income tax wages.</li>
      <li><strong>Annualise:</strong> multiply by the number of pay periods in the year.</li>
      <li><strong>Adjust:</strong> add other income (step 4a), subtract deductions (step 4b), and apply the filing-status adjustment. The multiple-jobs box (step 2) selects the higher-withholding table.</li>
      <li><strong>Find the bracket</strong> in the table for the filing status and compute the annual tentative tax.</li>
      <li><strong>Subtract credits:</strong> the dependent amount from step 3.</li>
      <li><strong>Divide back</strong> to one paycheck, then add extra withholding from step 4(c).</li>
    </ol>
    <h2>A worked paycheck</h2>
    <p>A single employee paid ${money(oh.grossPay)} biweekly, no W-4 adjustments. The engine's explanation of its federal income tax line:</p>
    <p><em>${h.esc(fit.detail ?? '')}</em></p>
    <p>That is ${money(fit.amount)} withheld on ${money(fit.taxableWages)} of wages. Change one W-4 entry and the line changes with it.</p>
    <h2>Special cases</h2>
    <ul>
      <li><strong>Exempt:</strong> an employee who claims exemption has no federal income tax withheld; Social Security and Medicare still apply.</li>
      <li><strong>Pre-2020 Form W-4:</strong> an employee who never filed the newer form is calculated from the old allowance method.</li>
      <li><strong>Bonuses:</strong> may use a flat supplemental rate; see <a href="/bonus-tax-withholding-calculation">bonus withholding</a>.</li>
      <li><strong>Pension and annuity payments</strong> are withheld on a different form and worksheet: see <a href="/pension-withholding-calculation">pension and annuity withholding</a>.</li>
    </ul>
    <p>The same calculation is available through the <a href="/income-tax-withholding-api">income tax withholding API</a>.</p>`,
    faq: [
      { q: 'How is federal income tax withholding calculated?', a: 'From the Form W-4 using the IRS percentage method: annualise the check, adjust for filing status and the W-4 entries, find the bracket, subtract credits, then divide back to one paycheck and add any extra withholding.' },
      { q: 'What does the multiple-jobs checkbox do?', a: 'It selects the higher-withholding table, because each job is withheld as if it were the only one. It is on the Form W-4 as step 2.' },
      { q: 'Does this cover pensions?', a: 'Pension and annuity payments are withheld by a different method: Form W-4P and Pub 15-T Worksheet 1B for periodic payments, and Form W-4R for lump sums and rollovers. Omnia.tax calculates federal withholding on them in a separate pension request, and state withholding for the states listed on its state pension withholding page.' },
    ],
    related: ['/income-tax-calculation-engine', '/income-tax-withholding-api', '/fica-tax-calculation', '/bonus-tax-withholding-calculation'],
  });

  add({
    path: '/bonus-tax-withholding-calculation', label: 'Bonus tax withholding', group: 'Calculations',
    title: 'Bonus tax withholding calculation: supplemental wages | Omnia.tax',
    description: 'How bonus withholding is calculated: the flat 22% supplemental rate or aggregating with regular pay. A worked $5,000 bonus run through the engine, line by line.',
    h1: 'Bonus tax withholding calculation', eyebrow: 'Calculations',
    sub: 'Bonuses and commissions are supplemental wages. They can be withheld differently from regular pay.',
    body: `
    <p>Federal rules let an employer withhold on supplemental wages, such as bonuses and commissions, at a flat rate instead of running them through the regular percentage method. The engine treats an earning with the category <code>supplemental</code> that way, and states each decide their own treatment.</p>
    <h2>A worked example</h2>
    <p>A Texas employee, paid ${money(300_000)} of regular pay and a ${money(500_000)} bonus on the same biweekly check:</p>
    ${table(h, ['Tax', 'Taxable wages', 'Amount'], bonus.taxes.filter((t) => t.payer === 'employee' && t.amount > 0).map((t) => [h.esc(t.name), money(t.taxableWages), money(t.amount)]), 1)}
    <p>The bonus is withheld at a flat rate: ${money(bonusLine.taxableWages)} of supplemental wages produces ${money(bonusLine.amount)} of federal income tax (${bonusLine.detail ? h.esc(bonusLine.detail) : ''}). The regular ${money(300_000)} is taxed by the normal method. Social Security and Medicare apply to the whole ${money(800_000)}.</p>
    <h2>Why the take-home feels low</h2>
    <p>The flat rate can be higher than the employee's normal marginal rate, so a bonus looks heavily taxed on the paycheck. Any over-withholding comes back when the employee files, but it is real money out of that check.</p>
    <h2>State treatment</h2>
    <p>Several states offer a flat supplemental rate as an employer option, and the engine only applies it when the request says the employer elected it; by default it aggregates. Some states aggregate a stand-alone bonus with the last regular payment, which needs that payment as an input.</p>
    <h2>Paying a bonus after tax</h2>
    <p>If the promise is a take-home amount, use <a href="/net-to-gross-calculator-api">net to gross</a> to find the bonus that nets it.</p>`,
    faq: [
      { q: 'How is a bonus taxed?', a: 'Federal withholding on a bonus can use a flat supplemental rate (22% for most amounts) instead of the regular percentage method. Social Security and Medicare apply as normal, and each state has its own treatment.' },
      { q: 'Why is tax on my bonus so high?', a: 'The flat withholding rate can exceed your normal marginal rate, so more is withheld from that check than will be owed. The difference is settled when you file.' },
      { q: 'Can an employer withhold a bonus at the regular rate?', a: 'Yes. Aggregating the bonus with regular pay and running the normal method is the alternative to the flat rate. The engine aggregates by default for states where the flat rate is an employer option.' },
    ],
    related: ['/federal-income-tax-withholding-calculator', '/net-to-gross-calculator-api', '/income-tax-calculation-engine', '/pre-tax-deduction-tax-treatment'],
  });

  add({
    path: '/pre-tax-deduction-tax-treatment', label: 'Pre-tax deductions and tax treatment', group: 'Calculations',
    title: 'Pre-tax deductions: which taxes they reduce | Omnia.tax',
    description: "A 401(k), a health premium and an HSA are all pre-tax, but not for the same taxes. See each deduction's effect on federal, FICA and state wages.",
    h1: 'Pre-tax deductions and which taxes they reduce', eyebrow: 'Calculations',
    sub: '"Pre-tax" is not one thing. Each tax decides for itself.',
    body: `
    <p>The most common payroll tax error is treating a deduction as pre-tax for every tax. It is pre-tax for some and not for others, and the difference is visible in the taxable wages on each line.</p>
    <h2>The same paycheck, three deductions</h2>
    <p>A single employee in Columbus, Ohio, paid ${money(300_000)} biweekly, with ${money(20_000)} deducted for each of the following in turn. Figures are the taxable wages the engine used for each tax:</p>
    ${table(h, ['Deduction', 'Federal income tax', 'Social Security', 'Medicare', 'Ohio income tax'], [
      ['None', money(wagesOf(oh, 'US_FIT')), money(wagesOf(oh, 'US_SS_EE')), money(wagesOf(oh, 'US_MED_EE')), money(wagesOf(oh, 'OH_SIT'))],
      ...treatments.map((t) => [t.label, money(wagesOf(t.r, 'US_FIT')), money(wagesOf(t.r, 'US_SS_EE')), money(wagesOf(t.r, 'US_MED_EE')), money(wagesOf(t.r, 'OH_SIT'))]),
    ], 1)}
    <p>Read across the rows. A traditional 401(k) deferral lowers federal and Ohio income tax wages but leaves Social Security and Medicare wages at ${money(wagesOf(treatments[0]!.r, 'US_SS_EE'))}. A section 125 health premium lowers all of them, and so does an HSA contribution made through payroll.</p>
    <h2>Why it differs by state, too</h2>
    <p>States do not all follow the federal treatment: some tax a 401(k) deferral, some do not recognise HSA contributions. The engine has a per-state treatment for each deduction category, so the state column above is a fact about Ohio, not about every state.</p>
    <h2>In the API</h2>
    <p>Give each deduction a <code>category</code> (<code>deferral_401k</code>, <code>section125</code>, <code>hsa</code>, <code>fsa</code>, <code>dependent_care</code>, <code>commuter</code> and others) and a null category for post-tax deductions. The response shows the taxable wages each tax used.</p>`,
    faq: [
      { q: 'Does a 401(k) contribution reduce Social Security tax?', a: 'No. A traditional 401(k) deferral reduces federal and most state income tax wages but is still subject to Social Security and Medicare.' },
      { q: 'Does a health insurance premium reduce payroll taxes?', a: 'A premium paid through a section 125 cafeteria plan reduces federal income tax, Social Security and Medicare wages, and most state income tax wages.' },
      { q: 'Do all states treat pre-tax deductions the same way?', a: 'No. States differ on 401(k) deferrals, HSA contributions and others, so the treatment is set per state and per deduction category.' },
    ],
    related: ['/gross-to-net-api', '/fica-tax-calculation', '/federal-income-tax-withholding-calculator', '/paycheck-calculation-formula'],
  });

  add({
    path: '/fica-tax-calculation', label: 'FICA tax calculation', group: 'Calculations',
    title: 'FICA tax calculation: Social Security and Medicare | Omnia.tax',
    description: `FICA calculation for 2026: Social Security ${pct(f.ssRate)} up to ${dollars(f.ssBase26)}, Medicare ${pct(f.medicare)} with no cap, and Additional Medicare. A worked example at the cap.`,
    h1: 'FICA tax calculation', eyebrow: 'Calculations',
    sub: 'Social Security and Medicare, the cap, and what happens on the paycheck that crosses it.',
    body: `
    <p>FICA is two taxes, each paid half by the employee and half by the employer.</p>
    <h2>The rates in the 2026 and 2027 rules</h2>
    ${table(h, ['Tax', 'Employee', 'Employer', 'Cap'], [
      ['Social Security', pct(f.ssRate), pct(f.ssRate), `${dollars(f.ssBase26)} (2026), ${dollars(f.ssBase27)} (2027)`],
      ['Medicare', pct(f.medicare), pct(f.medicare), 'None'],
      ['Additional Medicare', pct(f.addlMedicare), 'None', `On wages above ${dollars(f.addlThreshold)}, withheld from the employee`],
    ], 1)}
    <p>The most Social Security tax one employee can pay in 2026 is ${dollars(f.ssBase26)} × ${pct(f.ssRate)} = ${money(ssMax)}, and the employer pays the same again.</p>
    <h2>The paycheck that crosses the cap</h2>
    <p>A Texas employee paid ${money(1_000_000)} on one check, with ${money(cappedYtd)} of Social Security wages already paid this year. Only the wages below the cap are taxed:</p>
    ${table(h, ['Tax', 'Taxable wages', 'Amount'], capped.taxes.filter((t) => t.id.startsWith('US_SS') || t.id.startsWith('US_MED')).map((t) => [h.esc(t.name), money(t.taxableWages), money(t.amount)]), 1)}
    <p>Social Security applies to ${money(line(capped, 'US_SS_EE')!.taxableWages)}, the room left under the cap, while Medicare applies to the full ${money(line(capped, 'US_MED_EE')!.taxableWages)}. This is why year-to-date wages are an input to the calculation.</p>
    <h2>Which pay counts</h2>
    <p>Wages that count for FICA are not always the wages that count for income tax: a traditional 401(k) deferral reduces one and not the other. See <a href="/pre-tax-deduction-tax-treatment">pre-tax deductions by tax</a>. Some worker categories (clergy, household, railroad, election workers) have their own FICA treatment.</p>`,
    faq: [
      { q: 'What is the Social Security wage base for 2026?', a: `${dollars(f.ssBase26)}. It is ${dollars(f.ssBase27)} for 2027. Social Security tax stops once an employee's wages for the year pass it.` },
      { q: 'What is the FICA tax rate?', a: `Social Security is ${pct(f.ssRate)} from the employee and ${pct(f.ssRate)} from the employer; Medicare is ${pct(f.medicare)} from each, with no cap. Employees also pay ${pct(f.addlMedicare)} Additional Medicare on wages above ${dollars(f.addlThreshold)}.` },
      { q: 'Does the employer pay FICA too?', a: 'Yes. The employer pays a matching share of Social Security and Medicare, which is a cost to the employer and not taken from the employee. The Additional Medicare Tax is paid by the employee only.' },
    ],
    related: ['/social-security-wage-base', '/payroll-tax-rates-2026', '/employer-payroll-tax-calculator', '/pre-tax-deduction-tax-treatment'],
  });

  add({
    path: '/paycheck-calculation-formula', label: 'Paycheck calculation formula', group: 'Calculations',
    title: 'Paycheck calculation formula: gross to net pay | Omnia.tax',
    description: 'The paycheck calculation formula from gross pay to net pay, with the order of steps, what each tax is applied to, and a worked example from the engine.',
    h1: 'Paycheck calculation formula', eyebrow: 'Calculations',
    sub: 'One line of arithmetic hides eight rules. Here is the line and the rules.',
    body: `
    <p>The formula is short:</p>
    <p><code>net pay = gross pay − pre-tax deductions − employee taxes − post-tax deductions</code></p>
    <p>Every term hides work. This page walks the order, using the Columbus, Ohio paycheck from the <a href="/payroll-tax-calculation-engine">engine overview</a>.</p>
    <ol>
      <li><strong>Gross pay:</strong> ${money(oh.grossPay)}.</li>
      <li><strong>Pre-tax deductions:</strong> ${money(oh.pretaxDeductions)} here. Each tax then decides whether they reduce its wages.</li>
      <li><strong>Social Security</strong> ${pct(f.ssRate)} of wages up to the annual cap: ${money(line(oh, 'US_SS_EE')!.amount)}.</li>
      <li><strong>Medicare</strong> ${pct(f.medicare)} of wages: ${money(line(oh, 'US_MED_EE')!.amount)}.</li>
      <li><strong>Federal income tax</strong> from the Form W-4: ${money(fit.amount)}.</li>
      <li><strong>State and local income tax:</strong> ${oh.taxes.filter((t) => t.payer === 'employee' && (t.jurisdiction === 'state' || t.jurisdiction === 'local') && t.amount > 0).map((t) => `${h.esc(t.name)} ${money(t.amount)}`).join(', ')}.</li>
      <li><strong>Employee taxes in total:</strong> ${money(oh.employeeTaxTotal)}.</li>
      <li><strong>Post-tax deductions:</strong> ${money(oh.posttaxDeductions)}.</li>
    </ol>
    <p>${money(oh.grossPay)} − ${money(oh.pretaxDeductions)} − ${money(oh.employeeTaxTotal)} − ${money(oh.posttaxDeductions)} = <strong>${money(oh.netPay)}</strong>.</p>
    <h2>What is not in the formula</h2>
    <p>Employer taxes (${money(oh.employerTaxTotal)} here) are paid on top and never reduce net pay. And the order matters in one place: the pre-tax deductions come off before the tax, but whether they come off for <em>that</em> tax is a per-tax rule.</p>
    <p>For the other direction, see <a href="/net-to-gross-calculator-api">net to gross</a>.</p>`,
    faq: [
      { q: 'What is the formula for net pay?', a: 'Net pay equals gross pay minus pre-tax deductions, minus the taxes withheld from the employee, minus post-tax deductions. Employer taxes are not part of it.' },
      { q: 'Why is my net pay not gross minus a flat percentage?', a: 'Each tax has its own rate, cap and taxable wages, federal income tax uses brackets, and deductions affect each tax differently. The effective rate changes with pay level and location.' },
    ],
    related: ['/gross-to-net-api', '/paycheck-calculator-api', '/pre-tax-deduction-tax-treatment', '/take-home-pay'],
  });

  add({
    path: '/pension-withholding-calculation', label: 'Pension and annuity withholding', group: 'Calculations',
    title: 'Pension and annuity withholding calculation (Form W-4P) | Omnia.tax',
    description: "How federal withholding on periodic pension and annuity payments is calculated from Form W-4P (Pub 15-T Worksheet 1B), with worked examples from the engine.",
    h1: 'Pension and annuity withholding calculation', eyebrow: 'Calculations',
    sub: 'Pension payments are not wages. They are withheld on Form W-4P and their own worksheet, and carry no Social Security or Medicare tax.',
    body: `
    <p>A payer of periodic pension, annuity, profit-sharing, stock-bonus or IRA payments withholds federal income tax from the taxable part of each payment, using the payee's Form W-4P. The method is Publication 15-T's Worksheet 1B, which looks like the wage worksheet and differs from it in four places.</p>
    <h2>How it differs from wage withholding</h2>
    <ul>
      <li><strong>No FICA, FUTA or unemployment tax.</strong> The only tax on the payment is federal income tax.</li>
      <li><strong>The standard adjustment always applies.</strong> Annual payments are reduced by $8,600 ($12,900 if married filing jointly) with no multiple-jobs exception; the Form W-4P has Step 2 for other jobs and pensions instead.</li>
      <li><strong>Credits come off the annual tax first.</strong> The Step 3 credit is subtracted from the annual tentative tax before it is divided into payments.</li>
      <li><strong>With no form, the payee is Single with no entries.</strong> There is no "Married" default for payees whose payments began after 2021.</li>
    </ul>
    <h2>The steps in Worksheet 1B</h2>
    <ol>
      <li>Annualise the payment (monthly ×12, semimonthly ×24, biweekly ×26, weekly ×52, daily ×260).</li>
      <li>Add Step 4(a) other income; subtract Step 4(b) deductions and the standard adjustment. This can be negative.</li>
      <li>If Step 2(b)(iii) has an amount, work out the extra tax the other jobs and pensions call for (Parts I to III); otherwise look up the annual tax on the standard schedule for the filing status.</li>
      <li>Subtract the Step 3 credits, never below zero.</li>
      <li>Divide by the number of payments, and add Step 4(c) extra withholding.</li>
    </ol>
    <h2>Worked examples, run through the engine</h2>
    ${table(h, ['Payee, paid monthly', 'Payment', 'Federal tax withheld'], [
      ['No Form W-4P (Single, no entries)', money(200_000), money(pen.none)],
      ['Married filing jointly', money(200_000), money(pen.mfj)],
      ['Single, $40,000 a year from a job (Step 2)', money(200_000), money(pen.other)],
      ['Single, no entries', money(500_000), money(pen.big)],
      ['Single, $1,000 a year of credits (Step 3)', money(500_000), money(pen.credit)],
      ['Single, $50 extra on each payment (Step 4(c))', money(500_000), money(pen.extra)],
    ], 1)}
    <p>For the first row, the engine explains itself: <em>${h.esc(penDetail)}</em></p>
    <h2>Checked against the IRS's own tables</h2>
    <p>The result for a payee with no form equals the tax on annual payments above the standard deduction, from the 2026 Marginal Rate Tables printed on Form W-4R, divided by the number of payments. We test the engine against those tables across three filing statuses and four payment frequencies.</p>
    <h2>In the API</h2>
    ${code(h, `POST /v1/paycheck\n{ "checkDate": "2026-06-15", "payFrequency": "monthly",\n  "earnings": [{ "code": "PENSION", "category": "regular", "amount": 200000 }],\n  "deductions": [],\n  "pension": { "kind": "periodic",\n    "w4p": { "filingStatus": "single", "multiplePensionsAmount": 4000000 } } }`)}
    <p>No <code>federalW4</code> or <code>ytd</code> is needed. The response has a federal line, <code>US_FIT_PENSION</code>, and, for the payee's state, a line such as <code>NC_PENSION_SIT</code>: see <a href="/state-pension-withholding">state pension withholding</a>.</p>
    <h2>What it does not do</h2>
    <ul>
      <li><strong>Local withholding</strong> on pension payments is not calculated, and neither is state withholding for a state we have not checked against its revenue agency's guidance: see <a href="/state-pension-withholding">state pension withholding</a>. The response says so.</li>
      <li><strong>Quarterly, semiannual and annual</strong> periodic payments are refused: Pub 15-T's table lists monthly, semimonthly, biweekly, weekly and daily.</li>
      <li><strong>Nonresident aliens</strong> are outside these methods (Pub 515).</li>
      <li><strong>Lump sums and rollovers</strong> use Form W-4R: see <a href="/eligible-rollover-withholding">eligible rollover and nonperiodic withholding</a>.</li>
    </ul>`,
    faq: [
      { q: 'How is withholding on a pension calculated?', a: 'For periodic payments, from the payee\'s Form W-4P using Pub 15-T Worksheet 1B: annualise the payment, apply the standard adjustment and the form\'s entries, find the annual tax on the standard schedule, subtract credits, and divide by the number of payments.' },
      { q: 'What if a retiree gave the payer no Form W-4P?', a: 'The payer withholds as if the payee were Single with no entries in Steps 2 to 4. For payments that began before 2022 with no form, the payee is treated as married claiming three allowances, under the older rules.' },
      { q: 'Is Social Security or Medicare tax withheld from a pension?', a: 'No. FICA applies to wages. A pension payment has federal income tax withheld and, depending on the state, state income tax.' },
      { q: 'Does Omnia.tax calculate state tax on pensions?', a: 'For the states whose revenue agency publishes a rule we have read and checked, yes: send the payee\'s state and any election they made. For every other state it returns no state line and a warning that says so. Local withholding is not calculated.' },
    ],
    related: ['/eligible-rollover-withholding', '/federal-income-tax-withholding-calculator', '/income-tax-withholding-api', '/gross-to-net-api'],
  });

  add({
    path: '/state-pension-withholding', label: 'State pension withholding', group: 'Calculations',
    title: 'State income tax withholding on pensions, by state | Omnia.tax',
    description: "Which states withhold income tax on pension, annuity and IRA payments, and how, read from each state's revenue agency. Worked examples run through the engine.",
    h1: 'State income tax withholding on pensions and annuities', eyebrow: 'Calculations',
    sub: 'States do not agree. Some withhold unless the payee opts out, some only when asked, some not at all. Here is what we have checked, and what we have not.',
    related: ['/pension-withholding-calculation', '/eligible-rollover-withholding', '/state-income-tax-withholding-api', '/payroll-tax-reciprocity-agreements'],
    body: `
    <p>Only the state the payee lives in withholds: federal law (4 U.S.C. 114) bars a state from taxing a nonresident's retirement income. In the API, send that state as <code>residenceState</code> (or <code>workState</code> if it is all you send), and anything the payee told the payer in <code>pension.stateElection</code>.</p>
    <h2>The states we calculate</h2>
    <p>${prEntries.filter(([, e]) => e.status !== 'not_modelled').length} states and the District, each read from that state's own revenue agency and dated. Where a state publishes a rule for one kind of payment and not another, the other kind is marked not calculated.</p>
    ${table(h, ['State', 'What it does', 'Source'], prEntries.filter(([, e]) => e.status !== 'not_modelled').map(([c, e]) => [h.esc(stateName(c)), h.esc(statusText(e)) + '. ' + h.esc((e.notes ?? '').replace(/\s+/g, ' ')), srcLink(e)]), 3)}
    <h2>Worked examples, run through the engine</h2>
    ${table(h, ['Payee lives in', 'Payment', 'State tax withheld'], [
      ['North Carolina, periodic, no NC-4P', money3000, money(penState('NC', { kind: 'periodic' }, 300_000))],
      ['Connecticut, periodic, no CT-W4P', money3000, money(penState('CT', { kind: 'periodic' }, 300_000))],
      ['Michigan, periodic, no MI W-4P', money3000, money(penState('MI', { kind: 'periodic' }, 300_000))],
      ['Arkansas, lump sum', money(1_000_000), money(penState('AR', { kind: 'nonperiodic' }, 1_000_000))],
      ['Arkansas, eligible rollover', money(1_000_000), money(penState('AR', { kind: 'eligible_rollover' }, 1_000_000))],
      ['Vermont, lump sum (30% of the federal)', money(1_000_000), money(penState('VT', { kind: 'nonperiodic' }, 1_000_000))],
      ['Alabama, nothing asked', money3000, money(penState('AL', { kind: 'periodic' }, 300_000))],
      ['Alabama, payee asks for 2%', money3000, money(penState('AL', { kind: 'periodic', stateElection: { percent: 2 } }, 300_000))],
    ], 1)}
    <h2>In the API</h2>
    ${code(h, `POST /v1/paycheck\n{ "checkDate": "2026-06-15", "payFrequency": "monthly",\n  "earnings": [{ "code": "PENSION", "category": "regular", "amount": 300000 }],\n  "deductions": [],\n  "residenceState": { "code": "AL" },\n  "pension": { "kind": "periodic", "stateElection": { "percent": 2 } } }`)}
    <p>The response has the federal line <code>US_FIT_PENSION</code> and a state line <code>AL_PENSION_SIT</code>. The line says how the amount was found.</p>
    <h2>The states we do not calculate</h2>
    <p>These have either not been checked against the state's own guidance, or the guidance we read does not give a rule for the payment. They return no state line and a warning, never a zero that looks like a result:</p>
    <ul>${prEntries.filter(([, e]) => e.status === 'not_modelled').map(([c, e]) => `<li><strong>${h.esc(stateName(c))}.</strong> ${h.esc((e as { reason?: string }).reason ?? '')}</li>`).join('')}</ul>
    <p>Every other state that taxes wages is also not calculated for pensions. A state with no income tax on wages needs none.</p>
    <h2>What no state result covers</h2>
    <ul>
      <li><strong>Local withholding</strong> on pension payments.</li>
      <li><strong>Direct rollovers</strong> and trustee-to-trustee transfers, which states exempt; send them as no payment.</li>
      <li><strong>Nonresident payees with a state address</strong> who file an opt-out: the engine goes by the state you send.</li>
    </ul>`,
    faq: [
      { q: 'Do states withhold income tax on pensions?', a: 'It depends on the state. Some require it unless the payee opts out (for example Connecticut, Minnesota, Michigan, North Carolina and Iowa), some only withhold when the payee asks (for example Alabama, Arizona, Illinois, New York and New Jersey), and Mississippi does not tax retirement income at all.' },
      { q: 'Which state withholds on a pension, the payer\'s or the payee\'s?', a: 'The payee\'s. Federal law bars a state from taxing the retirement income of someone who lives elsewhere, so the state is the one the payee lives in.' },
      { q: 'What if the payee gave the payer no state form?', a: 'Each state sets its own default. Connecticut withholds 6.99%, Minnesota 6.25%, Michigan 4.25%, North Carolina treats a periodic payee as single with no allowances and withholds 4% of a lump sum, and states that only withhold on request withhold nothing.' },
      { q: 'Why is my state missing?', a: 'We list a state only when we have read a rule in its revenue agency\'s own guidance. Where the guidance was missing or unclear, the engine returns a warning instead of guessing.' },
    ],
  });

  add({
    path: '/eligible-rollover-withholding', label: 'Eligible rollover and nonperiodic withholding', group: 'Calculations',
    title: 'Eligible rollover and lump-sum withholding (Form W-4R) | Omnia.tax',
    description: "How 10% and 20% withholding works for lump sums, IRA distributions and eligible rollover distributions (Form W-4R), with examples from the engine.",
    h1: 'Eligible rollover and nonperiodic payment withholding', eyebrow: 'Calculations',
    sub: 'Lump sums and rollovers are withheld at a rate, not by a worksheet. The rate depends on the type of payment and what the payee chose.',
    body: `
    <p>Payments that are not periodic installments are withheld at a flat percentage of the taxable amount. The payee sets the rate on Form W-4R; with no form, the default applies.</p>
    <h2>The rates</h2>
    ${table(h, ['Payment', 'Default', 'The payee can choose'], [
      ['Nonperiodic payment, including an IRA distribution payable on demand', '10%', 'Any whole percent from 0% to 100% (not less than 10% if delivered outside the United States and its territories)'],
      ['Eligible rollover distribution (qualified plan, 403(b), governmental 457(b))', '20%', 'A higher whole percent. Never lower than 20%, including 0%'],
    ]).replace(/text-align:right/g, 'text-align:left')}
    <p>With no Form W-4R, or no valid taxpayer ID, the payer withholds the default and cannot honor a request for less.</p>
    <h2>On a $10,000 taxable payment, from the engine</h2>
    ${table(h, ['Payment and election', 'Federal tax withheld'], [
      ['Nonperiodic, default', money(lump({ kind: 'nonperiodic' }))],
      ['Nonperiodic, payee chose 0%', money(lump({ kind: 'nonperiodic', w4r: { withholdingRate: 0 } }))],
      ['Nonperiodic, payee chose 19%', money(lump({ kind: 'nonperiodic', w4r: { withholdingRate: 19 } }))],
      ['Eligible rollover, default', money(lump({ kind: 'eligible_rollover' }))],
      ['Eligible rollover, payee asked for 10%', `${money(lump({ kind: 'eligible_rollover', w4r: { withholdingRate: 10 } }))} (the 20% floor applies)`],
      ['Eligible rollover, payee chose 30%', money(lump({ kind: 'eligible_rollover', w4r: { withholdingRate: 30 } }))],
    ], 1)}
    <h2>Only the taxable part</h2>
    <p>Withholding applies to the taxable amount of the payment. If part is a return of after-tax contributions, send <code>pension.taxableAmount</code> and the rate applies to that part only.</p>
    <h2>What counts as an eligible rollover distribution</h2>
    <p>Form W-4R lists payments that are <em>not</em> eligible rollover distributions for these rules: hardship distributions, required minimum distributions, distributions from a pension-linked emergency savings account, and several qualified disaster, birth or adoption, long-term care, domestic abuse and emergency-expense distributions. Those are nonperiodic payments, so send them as <code>nonperiodic</code>; whether a payment is one or the other is a fact about the plan that you supply.</p>
    ${code(h, `"pension": { "kind": "eligible_rollover", "w4r": { "withholdingRate": 30 } }`)}
    <p>See also <a href="/pension-withholding-calculation">withholding on periodic pension payments</a> and <a href="/state-pension-withholding">state pension withholding</a>. Local withholding on these payments is not calculated.</p>`,
    faq: [
      { q: 'How much is withheld from an eligible rollover distribution?', a: 'The payer must withhold 20% of the taxable amount unless the payment is rolled over directly. The payee can ask for a higher rate on Form W-4R but not a lower one, including zero.' },
      { q: 'What is the default withholding on a 401(k) or IRA lump sum?', a: 'An IRA distribution payable on demand or any other nonperiodic payment defaults to 10%, and the payee can choose 0% to 100%. A lump sum from a 401(k) that could be rolled over is an eligible rollover distribution and defaults to 20%.' },
      { q: 'Can a payee choose no withholding?', a: 'On a nonperiodic payment, yes, by entering 0% on Form W-4R, unless the payment is delivered outside the United States and its territories. On an eligible rollover distribution, no.' },
    ],
    related: ['/pension-withholding-calculation', '/federal-income-tax-withholding-calculator', '/bonus-tax-withholding-calculation', '/income-tax-withholding-api'],
  });

  // ============================== Employer taxes =============================================
  add({
    path: '/employer-payroll-tax-calculator', label: 'Employer payroll tax calculator', group: 'Employer taxes',
    title: 'Employer payroll tax calculator: FICA, FUTA, SUTA | Omnia.tax',
    description: "What an employer pays on top of wages: matching Social Security and Medicare, FUTA, state unemployment, paid-leave contributions and NY MCTMT.",
    h1: 'Employer payroll tax calculator', eyebrow: 'Employer taxes',
    sub: 'The cost of an employee is more than their pay. These are the employer-side taxes.',
    body: `
    <p>An employer pays taxes on payroll that are never taken from the employee. They are what makes the cost of a hire higher than the salary.</p>
    <h2>The employer lines on one paycheck</h2>
    <p>For the Columbus, Ohio paycheck (gross ${money(oh.grossPay)}), the engine returns these employer-paid lines, ${money(oh.employerTaxTotal)} in all:</p>
    ${table(h, ['Tax', 'Taxable wages', 'Amount'], employerOH.map((t) => [h.esc(t.name), money(t.taxableWages), money(t.amount)]), 1)}
    <h2>What they are</h2>
    <ul>
      <li><strong>Social Security and Medicare:</strong> a match of the employee's share. See <a href="/fica-tax-calculation">FICA</a>.</li>
      <li><strong>FUTA:</strong> federal unemployment, 6.0% of the first $7,000 per employee with a credit that normally brings it to 0.6%.</li>
      <li><strong>SUTA:</strong> state unemployment, on a state wage base from ${dollars(lowBase.base)} (${h.esc(lowBase.s.name)}) to ${dollars(highBase.base)} (${h.esc(highBase.s.name)}), at the employer's assigned rate or the new-employer rate. See <a href="/unemployment-tax">unemployment tax by state</a>.</li>
      <li><strong>State paid-leave and disability contributions</strong> where the state puts them on the employer.</li>
    </ul>
    <h2>Quarterly payroll taxes that are not per paycheck</h2>
    <p>Two employer taxes are charged on a quarter's total payroll, so no single paycheck produces them: the New York MCTMT and the Nevada Modified Business Tax. <code>POST /v1/employer-taxes</code> calculates them. For a quarter with ${money(45_000_000)} of payroll in New York's Zone 1 and ${money(20_000_000)} in Zone 2, and ${money(30_000_000)} of Nevada general-business wages less ${money(2_000_000)} of health benefits, the engine returns ${mctmt.lines.map((l) => `${h.esc(l.id)} ${money(l.amount)}`).join(' and ')}, ${money(mctmt.total)} in all.</p>
    <p>These are estimates for planning and accruals; the state return is the filing.</p>`,
    faq: [
      { q: 'What payroll taxes does an employer pay?', a: 'The employer match of Social Security and Medicare, federal unemployment tax (FUTA), state unemployment tax (SUTA), and in some states paid-leave or disability contributions. A few places add quarterly payroll taxes such as New York MCTMT.' },
      { q: 'How much extra does an employee cost in payroll tax?', a: 'It depends on pay and state. The employer match of Social Security and Medicare is 7.65% of wages up to the Social Security cap, plus unemployment tax on the first part of the wages.' },
      { q: 'What is the FUTA rate?', a: 'FUTA is 6.0% of the first $7,000 of each employee\'s wages. Employers who pay their state unemployment tax on time normally get a credit that brings the effective rate to 0.6%.' },
    ],
    related: ['/futa-suta-calculation', '/unemployment-tax', '/fica-tax-calculation', '/payroll-tax-api'],
  });

  add({
    path: '/futa-suta-calculation', label: 'FUTA and SUTA calculation', group: 'Employer taxes',
    title: 'FUTA and SUTA calculation: unemployment tax for employers | Omnia.tax',
    description: `How FUTA and SUTA are calculated: $7,000 federal base, state wage bases from ${dollars(lowBase.base)} to ${dollars(highBase.base)}, new-employer rates and the credit.`.slice(0, 160),
    h1: 'FUTA and SUTA calculation', eyebrow: 'Employer taxes',
    sub: 'Unemployment tax is paid by the employer, on a capped slice of each employee\'s wages.',
    body: `
    <p>Two unemployment taxes are paid by the employer: federal (FUTA) and state (SUTA, also called SUI). Both apply only to the first part of each employee's wages for the year, so they are heaviest early in the year and stop once an employee passes the wage base.</p>
    <h2>FUTA</h2>
    <p>6.0% of the first $7,000 of each employee's wages, before the credit. An employer who pays state unemployment tax on time normally takes a credit that brings the rate to 0.6%, which is $42 per employee per year. The engine uses year-to-date wages to stop FUTA once the $7,000 is reached.</p>
    <h2>SUTA</h2>
    <p>Each state sets its own wage base and its own rate for each employer. In the 2026 rules the wage base ranges from ${dollars(lowBase.base)} in ${h.esc(lowBase.s.name)} to ${dollars(highBase.base)} in ${h.esc(highBase.s.name)}. Where a state publishes one, the new-employer rate runs from ${pct(lowRate.rate)} (${h.esc(lowRate.s.name)}) to ${pct(highRate.rate)} (${h.esc(highRate.s.name)}).</p>
    <h2>Your rate, or the new-employer rate</h2>
    <p>An established employer's rate is assigned by the state from its experience and printed on a rate notice. Send it as <code>employer.stateUnemploymentRate</code> and the engine uses it. If you do not, the engine uses the state's new-employer rate and says so in the line's detail; where a state publishes no single new-employer rate, it produces no line rather than a guess.</p>
    <h2>An example</h2>
    <p>The Texas paycheck from our <a href="/paycheck-calculator-api">paycheck calculator API page</a> carries these unemployment lines:</p>
    ${table(h, ['Tax', 'Taxable wages', 'Amount'], tx.taxes.filter((t) => t.payer === 'employer' && /FUTA|SUI/.test(t.id)).map((t) => [h.esc(t.name), money(t.taxableWages), money(t.amount)]), 1)}
    <p>Every state's wage base and new-employer rate is listed on <a href="/state-unemployment-tax-rates">state unemployment tax rates</a>.</p>`,
    faq: [
      { q: 'What is the difference between FUTA and SUTA?', a: 'FUTA is the federal unemployment tax, 6.0% of the first $7,000 per employee before a credit. SUTA is the state unemployment tax, with a different wage base and rate in each state. Both are paid by the employer.' },
      { q: 'How is SUTA calculated?', a: 'The employer\'s assigned rate times the employee\'s wages up to the state wage base for the year. A new employer pays the state\'s new-employer rate until it has an experience-based rate.' },
      { q: 'Do employees pay unemployment tax?', a: 'In most states no, it is employer-paid. A few states also collect a small employee contribution for related programs, which the engine returns as its own line.' },
    ],
    related: ['/state-unemployment-tax-rates', '/unemployment-tax', '/employer-payroll-tax-calculator', '/payroll-tax-rates-2026'],
  });

  // ============================== States and rates ===========================================
  add({
    path: '/states-with-no-income-tax', label: 'States with no income tax', group: 'States and rates',
    title: 'States with no income tax on wages (2026) | Omnia.tax',
    description: `${noTax.length} states and jurisdictions do not tax wages in our 2026 rules. What employers still withhold and pay there, and what a paycheck looks like.`.slice(0, 160),
    h1: 'States with no income tax on wages', eyebrow: 'States and rates',
    sub: 'No state income tax does not mean no payroll tax.',
    body: `
    <p>In Omnia.tax's 2026 rules, these do not tax wages: ${noTax.map((s) => `<a href="/payroll-tax/${s.slug}">${h.esc(s.name)}</a>`).join(', ')}. An employer there withholds no state income tax.</p>
    <h2>What still applies</h2>
    <ul>
      <li>Federal income tax, Social Security and Medicare, withheld as everywhere.</li>
      <li>Federal and state unemployment tax, paid by the employer.</li>
      <li>In some of these states, employee or employer contributions for paid leave, disability or similar programs. Washington's paid family and medical leave is an example.</li>
      <li>Local taxes where a locality has one.</li>
    </ul>
    <h2>A paycheck with no state income tax</h2>
    <p>${money(tx.grossPay)} biweekly in Texas, single, no deductions: employee taxes ${money(tx.employeeTaxTotal)}, net pay ${money(tx.netPay)}.</p>
    ${txTable.html}
    <h2>Unemployment tax still differs</h2>
    ${table(h, ['State', '2026 unemployment wage base', 'New-employer rate'], noTax.map((s) => [`<a href="/unemployment-tax/${s.slug}">${h.esc(s.name)}</a>`, h.wageBaseOf(s.d26.suiEmployer?.wageBase) ? dollars(h.wageBaseOf(s.d26.suiEmployer?.wageBase)!) : 'not recorded', typeof s.d26.suiEmployer?.newEmployerRate === 'number' ? pct(s.d26.suiEmployer.newEmployerRate) : 'Assigned by the state']), 1)}
    <p>See how a salary takes home in each state under <a href="/take-home-pay">take-home pay by state</a>.</p>`,
    faq: [
      { q: 'Which states have no state income tax?', a: `${noTax.map((s) => s.name).join(', ')} do not tax wages in Omnia.tax's 2026 rules.` },
      { q: 'Do employers in no-income-tax states still pay payroll tax?', a: 'Yes. Federal income tax, Social Security and Medicare are withheld everywhere, and employers pay federal and state unemployment tax. Some of these states also have paid-leave contributions.' },
    ],
    related: ['/state-income-tax-withholding-api', '/take-home-pay', '/payroll-tax', '/state-unemployment-tax-rates'],
  });

  add({
    path: '/payroll-tax-reciprocity-agreements', label: 'Payroll tax reciprocity agreements', group: 'States and rates',
    title: 'Payroll tax reciprocity agreements between states | Omnia.tax',
    description: "Which states have income tax reciprocity agreements, so a commuter is withheld for the home state only. The list from our 2026 rules.",
    h1: 'Payroll tax reciprocity agreements', eyebrow: 'States and rates',
    sub: 'When two states agree, an employee who works in one and lives in the other is withheld for the home state only.',
    body: (() => {
      const recip = states.filter((s) => Array.isArray(s.d26.reciprocity?.reciprocalStates) && s.d26.reciprocity.reciprocalStates.length > 0);
      return `
    <p>A reciprocity agreement between two states means an employer in one state withholds the other state's income tax, not its own, for an employee who lives in the other, usually when the employee files a form saying so. It prevents a commuter from being withheld for two states.</p>
    <h2>The agreements in the 2026 rules</h2>
    ${table(h, ['Work state', 'Residents of these states are covered'], recip.map((s) => [`<a href="/payroll-tax/${s.slug}">${h.esc(s.name)}</a>`, s.d26.reciprocity.reciprocalStates.map((c: string) => h.esc(states.find((x) => x.code === c)?.name ?? c)).join(', ')]), 1).replace(/text-align:right/g, 'text-align:left')}
    <h2>An example from the engine</h2>
    <p>An employee who works in Pennsylvania and lives in New Jersey, paid ${money(pa.grossPay)} biweekly. Instead of Pennsylvania income tax, the engine withholds New Jersey's, as the agreement requires:</p>
    ${table(h, ['Tax', 'Amount'], pa.taxes.filter((t) => t.payer === 'employee' && t.jurisdiction !== 'federal' && t.amount > 0).map((t) => [h.esc(t.name), money(t.amount)]), 1)}
    <h2>What the engine needs</h2>
    <p>The work state, the residence state, and whether the employee has filed the state's reciprocity certificate. Where reciprocity does not apply, <a href="/multi-state-payroll-tax-calculation">other rules decide</a>.</p>`;
    })(),
    faq: [
      { q: 'What is a state tax reciprocity agreement?', a: 'An agreement between two states that an employee who lives in one and works in the other is taxed only by the home state, so the employer withholds for the home state.' },
      { q: 'Does reciprocity apply automatically?', a: 'Usually not. The employee typically has to file a certificate with the employer. The engine applies it when the request says the certificate is on file.' },
    ],
    related: ['/multi-state-payroll-tax-calculation', '/state-income-tax-withholding-api', '/address-tax-jurisdiction-lookup-api', '/payroll-tax'],
  });

  add({
    path: '/multi-state-payroll-tax-calculation', label: 'Multi-state payroll tax calculation', group: 'States and rates',
    title: 'Multi-state payroll tax calculation: work vs home state | Omnia.tax',
    description: "Payroll tax for an employee who lives in one state and works in another: reciprocity, resident credit and nexus, with two worked examples.",
    h1: 'Multi-state payroll tax calculation', eyebrow: 'States and rates',
    sub: 'Which state withholds depends on where the employee works, where they live, and what the two states have agreed.',
    body: `
    <p>An employee who lives in one state and works in another is the hardest ordinary case in payroll tax. Three rules decide it: whether the states have a <a href="/payroll-tax-reciprocity-agreements">reciprocity agreement</a>, whether the home state taxes residents on income earned elsewhere, and whether the employer has a legal presence (nexus) in the home state.</p>
    <h2>Example 1: reciprocity. Works in Pennsylvania, lives in New Jersey</h2>
    <p>Paid ${money(pa.grossPay)} biweekly. Pennsylvania and New Jersey have an agreement, so the engine does not withhold Pennsylvania income tax, and withholds New Jersey's instead:</p>
    ${table(h, ['Tax', 'Amount'], pa.taxes.filter((t) => t.payer === 'employee' && t.jurisdiction !== 'federal' && t.amount > 0).map((t) => [h.esc(t.name), money(t.amount)]), 1)}
    <h2>Example 2: no agreement. Works in New York, lives in New Jersey</h2>
    <p>New York taxes the work, and New Jersey taxes its residents' worldwide income, with a credit for the tax paid to New York. When the employer has nexus in New Jersey and elects to withhold for it, the engine returns both:</p>
    ${table(h, ['Tax', 'Amount'], ny.taxes.filter((t) => t.payer === 'employee' && t.jurisdiction !== 'federal' && t.amount > 0).map((t) => [h.esc(t.name), money(t.amount)]), 1)}
    <h2>What to send</h2>
    <p>Set <code>workState</code> and <code>residenceState</code>, and where there is no agreement, <code>residenceStateWithholding</code> with whether the employer has nexus and whether it withholds voluntarily. Those are legal and business facts the engine cannot determine; the request carries them, and the default is that a residence state does not withhold.</p>
    <p>Local taxes follow the same logic: see <a href="/local-payroll-tax-api">local payroll tax</a>, and use the <a href="/address-tax-jurisdiction-lookup-api">address lookup</a> to find both states from two addresses.</p>`,
    faq: [
      { q: 'Which state do I withhold for if my employee lives in another state?', a: 'Usually the work state. If the two states have a reciprocity agreement and the employee has filed the certificate, the home state instead. Some home states also tax residents on out-of-state wages, which can require withholding for both.' },
      { q: 'What is nexus for payroll tax?', a: 'A legal presence in a state, such as an office or employees there, that can require an employer to register and withhold in that state. It is a fact about the employer that the request carries, because the engine cannot determine it.' },
    ],
    related: ['/payroll-tax-reciprocity-agreements', '/local-payroll-tax-api', '/state-income-tax-withholding-api', '/compare-two-paychecks-api'],
  });

  add({
    path: '/state-unemployment-tax-rates', label: 'State unemployment tax rates 2026', group: 'States and rates',
    title: 'State unemployment tax rates and wage bases, 2026 | Omnia.tax',
    description: 'SUTA wage bases and new-employer rates for all 50 states and DC in 2026, with 2027 wage bases where published, from the rule files our engine uses.',
    h1: 'State unemployment tax rates and wage bases, 2026', eyebrow: 'States and rates',
    sub: 'The taxable wage base and the new-employer rate for every state, sorted by state.',
    body: `
    <p>State unemployment tax is paid by the employer on each employee's wages up to the state's wage base. An established employer pays a rate assigned by the state; a new employer pays the new-employer rate. This table is from the rule files the engine reads. Click a state for its page.</p>
    ${table(h, ['State', '2026 wage base', '2027 wage base', 'New-employer rate'], states.map((s) => {
      const b26 = h.wageBaseOf(s.d26.suiEmployer?.wageBase);
      const b27 = h.wageBaseOf(s.d27.suiEmployer?.wageBase);
      const r = s.d26.suiEmployer?.newEmployerRate;
      return [`<a href="/unemployment-tax/${s.slug}">${h.esc(s.name)}</a>`, b26 ? dollars(b26) : 'not recorded', b27 ? dollars(b27) : 'not recorded', typeof r === 'number' ? pct(r) : 'Assigned by the state'];
    }), 1)}
    <p class="fine">2027 figures are provisional until a state publishes its own. A state with no single new-employer rate (rates are assigned by industry or schedule) shows "Assigned by the state"; the engine then needs your assigned rate in <code>employer.stateUnemploymentRate</code>. Confirm against your state workforce agency's rate notice.</p>
    <h2>Highest and lowest</h2>
    <p>The wage base is lowest in ${h.esc(lowBase.s.name)} at ${dollars(lowBase.base)} and highest in ${h.esc(highBase.s.name)} at ${dollars(highBase.base)}. The new-employer rate runs from ${pct(lowRate.rate)} in ${h.esc(lowRate.s.name)} to ${pct(highRate.rate)} in ${h.esc(highRate.s.name)}.</p>
    <p>How the calculation works: <a href="/futa-suta-calculation">FUTA and SUTA</a>.</p>`,
    faq: [
      { q: 'What is the state unemployment tax wage base?', a: `It is the amount of each employee's yearly wages that unemployment tax applies to. It is set by each state; in Omnia.tax's 2026 rules it runs from ${dollars(lowBase.base)} in ${lowBase.s.name} to ${dollars(highBase.base)} in ${highBase.s.name}.` },
      { q: 'What unemployment rate does a new employer pay?', a: `Each state sets a new-employer rate, and where a state publishes one the 2026 figures run from ${pct(lowRate.rate)} in ${lowRate.s.name} to ${pct(highRate.rate)} in ${highRate.s.name}. Some states assign new-employer rates by industry instead of publishing a single figure.` },
    ],
    related: ['/futa-suta-calculation', '/unemployment-tax', '/employer-payroll-tax-calculator', '/payroll-tax'],
  });

  add({
    path: '/payroll-tax-rates-2026', label: 'Payroll tax rates 2026', group: 'States and rates',
    title: 'Payroll tax rates for 2026: federal, FICA, FUTA, states | Omnia.tax',
    description: "The 2026 payroll tax rates and limits in one place: Social Security, Medicare, Additional Medicare, FUTA and the flat state income tax rates.",
    h1: 'Payroll tax rates for 2026', eyebrow: 'States and rates',
    sub: 'The numbers that do not depend on one employee\'s W-4.',
    body: `
    <h2>Federal payroll taxes</h2>
    ${table(h, ['Tax', 'Rate', 'Limit'], [
      ['Social Security, employee', pct(f.ssRate), `Wages up to ${dollars(f.ssBase26)}`],
      ['Social Security, employer', pct(f.ssRate), `Wages up to ${dollars(f.ssBase26)}`],
      ['Medicare, employee', pct(f.medicare), 'No limit'],
      ['Medicare, employer', pct(f.medicare), 'No limit'],
      ['Additional Medicare, employee only', pct(f.addlMedicare), `Wages above ${dollars(f.addlThreshold)}`],
      ['FUTA, before credit', '6.0%', 'First $7,000 per employee'],
      ['FUTA, with the normal credit', '0.6%', 'First $7,000 per employee'],
    ], 1)}
    <p>For 2027 the Social Security wage base is ${dollars(f.ssBase27)}. Federal income tax is not a flat rate: it comes from the employee's Form W-4, see <a href="/federal-income-tax-withholding-calculator">how it is calculated</a>.</p>
    <h2>States with a flat income tax rate</h2>
    ${table(h, ['State', 'Flat rate on wages (2026)'], flat.map((s) => [`<a href="/payroll-tax/${s.slug}">${h.esc(s.name)}</a>`, pct(s.d26.flatRate.rate)]), 1)}
    <p>${tables.length} other states use their own tables or formulas, and ${noTax.length} do not tax wages: <a href="/states-with-no-income-tax">see the list</a>. State unemployment tax is on <a href="/state-unemployment-tax-rates">its own page</a>.</p>
    <p class="fine">Figures come from the rule files Omnia.tax's engine reads. Confirm a rate with the agency before relying on it.</p>`,
    faq: [
      { q: 'What are the payroll tax rates for 2026?', a: `Social Security is ${pct(f.ssRate)} each for employee and employer on wages up to ${dollars(f.ssBase26)}; Medicare is ${pct(f.medicare)} each with no cap, plus ${pct(f.addlMedicare)} Additional Medicare on the employee's wages above ${dollars(f.addlThreshold)}. FUTA is 6.0% of the first $7,000, normally 0.6% after the credit.` },
      { q: 'Which states have a flat income tax?', a: `${flat.map((s) => `${s.name} (${pct(s.d26.flatRate.rate)})`).join(', ')} in Omnia.tax's 2026 rules.` },
    ],
    related: ['/fica-tax-calculation', '/social-security-wage-base', '/state-unemployment-tax-rates', '/states-with-no-income-tax'],
  });

  add({
    path: '/social-security-wage-base', label: 'Social Security wage base', group: 'States and rates',
    title: `Social Security wage base 2026: ${dollars(f.ssBase26)} | Omnia.tax`,
    description: `The Social Security wage base is ${dollars(f.ssBase26)} for 2026 and ${dollars(f.ssBase27)} for 2027. The maximum tax, when it stops in the year, and how a payroll engine applies it.`.slice(0, 160),
    h1: `Social Security wage base: ${dollars(f.ssBase26)} for 2026`, eyebrow: 'States and rates',
    sub: 'The annual limit on wages subject to Social Security tax, and what follows from it.',
    body: `
    <p>Social Security tax applies only to wages up to the annual wage base. The base is ${dollars(f.ssBase26)} for 2026 and ${dollars(f.ssBase27)} for 2027.</p>
    <h2>The maximum tax</h2>
    ${table(h, ['', '2026', '2027'], [
      ['Wage base', dollars(f.ssBase26), dollars(f.ssBase27)],
      ['Employee maximum', money(ssMax), money(Math.round(f.ssBase27 * f.ssRate * 100))],
      ['Employer maximum', money(ssMax), money(Math.round(f.ssBase27 * f.ssRate * 100))],
    ], 1)}
    <h2>When the tax stops</h2>
    <p>An employee earning ${dollars(150_000)} a year never reaches it. One earning ${dollars(300_000)} reaches the base after ${(f.ssBase26 / 300_000 * 100).toFixed(0)}% of the year's pay, and from then on that paycheck carries no Social Security tax, only Medicare. The paycheck that crosses the base is partly taxed; see the <a href="/fica-tax-calculation">worked example</a>.</p>
    <h2>Why a calculator needs year-to-date wages</h2>
    <p>Whether a paycheck is taxed depends on what was paid before it. Without year-to-date Social Security wages in the request, an engine cannot know whether the cap has been reached, so <code>ytd.socialSecurity</code> is an input to the API, not an optional extra.</p>`,
    faq: [
      { q: 'What is the Social Security wage base for 2026?', a: `${dollars(f.ssBase26)}. Wages above it are not subject to Social Security tax, though Medicare still applies. For 2027 it is ${dollars(f.ssBase27)}.` },
      { q: 'What is the most Social Security tax an employee pays in 2026?', a: `${dollars(f.ssBase26)} times ${pct(f.ssRate)}, which is ${money(ssMax)}. The employer pays the same amount again.` },
    ],
    related: ['/fica-tax-calculation', '/payroll-tax-rates-2026', '/employer-payroll-tax-calculator', '/gross-to-net-api'],
  });

  add({
    path: '/minimum-wage-by-state', label: 'Minimum wage by state', group: 'States and rates',
    title: 'Minimum wage by state, 2026 and 2027, with a check API | Omnia.tax',
    description: 'State minimum wages for 2026 and 2027 for all 50 states and DC, from our rule files, and how the API checks a paycheck against the minimum wage.',
    h1: 'Minimum wage by state', eyebrow: 'States and rates',
    sub: 'The state minimum for each state, now and from January 2027, and a minimum-wage check on the paycheck call.',
    body: `
    <p>The table is the state minimum from the rule files the engine reads. Local ordinances can set a higher minimum in some cities and counties: Omnia.tax carries ${cov.localMinimumWage} of them, listed on the <a href="/coverage">coverage page</a>.</p>
    ${table(h, ['State', 'December 2026', 'January 2027'], states.map((s) => {
      const a = minimumWage({ checkDate: '2026-12-15', state: s.code }).cents;
      const b = minimumWage({ checkDate: '2027-01-15', state: s.code }).cents;
      return [`<a href="/payroll-tax/${s.slug}">${h.esc(s.name)}</a>`, money(a), money(b)];
    }), 1)}
    <p class="fine">A state without its own minimum wage law follows the federal minimum. Confirm with the state labor agency before relying on a figure.</p>
    <h2>The minimum-wage check</h2>
    <p>Add <code>minimumWageCheck</code> to a paycheck request and the response says whether the pay for the hours worked meets the minimum for that location and date. It is answered in the same call and billed as one call.</p>`,
    faq: [
      { q: 'Does every state have its own minimum wage?', a: 'No. Some states have none and follow the federal minimum. The table shows the figure Omnia.tax applies for each state.' },
      { q: 'Can a city have a higher minimum wage than its state?', a: `Yes. Omnia.tax carries ${cov.localMinimumWage} local minimum wage ordinances, and the minimum-wage check uses the one for the work location.` },
    ],
    related: ['/payroll-tax', '/garnishment-limit-calculation-api', '/local-payroll-tax-api', '/payroll-tax-api'],
  });

  add({
    path: '/garnishment-limit-calculation-api', label: 'Garnishment limit calculation', group: 'Calculations',
    title: 'Garnishment limit calculation API for payroll | Omnia.tax',
    description: 'Check wage garnishment orders against the limit on the same paycheck call: send the orders, get how much can be withheld, with state law applied.',
    h1: 'Garnishment limit calculation API', eyebrow: 'Calculations',
    sub: 'How much of a paycheck can a garnishment take? The answer depends on the order and the state.',
    body: `
    <p>When a creditor, agency or court orders part of an employee's pay withheld, the amount that may be taken is capped by law. The cap depends on the kind of order and, for ordinary consumer debt, on state law, which can be stricter than the federal limit.</p>
    <h2>One call</h2>
    <p>Add <code>garnishments</code> to a paycheck request and the response includes a <code>garnishment</code> result next to the tax lines. The request needs <code>workState.code</code>, because state law decides the limit on an ordinary consumer garnishment, and each order needs your own identifier so the result can be matched back to it.</p>
    ${code(h, `"garnishments": [ { "id": "order-1", ...the order... } ]`)}
    <p>It is calculated on the same engine as the rest of the paycheck and billed as one call; the garnishment is a post-tax deduction, so it comes out after the taxes.</p>
    <h2>What it is not</h2>
    <p>It applies the legal limit to the orders you send. It does not interpret a legal order or send the money to the creditor, and a payroll specialist or counsel should confirm an order's terms.</p>
    <p>See the <a href="/docs/paycheck">API reference</a> for the order fields.</p>`,
    faq: [
      { q: 'How much of a paycheck can be garnished?', a: 'It depends on the type of order and the state. For ordinary consumer debt, federal law sets a cap and state law can set a lower one, so the work state matters.' },
      { q: 'Is the garnishment taken before or after tax?', a: 'After. A garnishment is a post-tax deduction, so the taxes are calculated first and the garnishment comes out of the pay that is left.' },
    ],
    related: ['/minimum-wage-by-state', '/gross-to-net-api', '/payroll-tax-api', '/paycheck-calculator-api'],
  });

  // ============================== Buying and building ========================================
  add({
    path: '/payroll-tax-api-pricing', label: 'Payroll tax API pricing', group: 'Buying and building',
    title: 'Payroll tax API cost at 10 to 10,000 employees | Omnia.tax',
    description: "Payroll tax API pricing: $0.08 per paycheck calculation after a 14-day free trial, no seat fees. What is billed, and the cost at 10 to 10,000 employees.",
    h1: 'Payroll tax API pricing', eyebrow: 'Buying and building',
    sub: 'One price, per paycheck calculation, published.',
    body: `
    <p>Omnia.tax is $0.08 per paycheck calculation, after a 14-day free trial. There are no seat fees, no minimum and no tiers.</p>
    <h2>What costs what</h2>
    ${table(h, ['Call', 'Billed as'], [
      ['<code>POST /v1/paycheck</code>', '1 paycheck'],
      ['<code>POST /v1/paycheck/gross-up</code>', '1 paycheck'],
      ['<code>POST /v1/paycheck/compare</code>', '2 paychecks'],
      ['<code>POST /v1/payCalc</code> and <code>/v1/payroll/run</code>', '1 per successful paycheck in the batch'],
      ['<code>POST /v1/address</code>', 'Not billed'],
      ['<code>POST /v1/employer-taxes</code>', 'Not billed'],
      ['A refused or failed call', 'Not billed'],
      ['A test key', 'Never billed'],
    ]).replace(/text-align:right/g, 'text-align:left')}
    <h2>The cost at your size</h2>
    <p>Calculating every paycheck for a year, at $0.08:</p>
    ${table(h, ['Employees', 'Pay frequency', 'Paychecks a year', 'Cost a year'], [10, 100, 1000, 10000].flatMap((n) => [['biweekly', 26], ['monthly', 12]].map(([label, per]) => [dollars(n), String(label), (n * Number(per)).toLocaleString('en-US'), `$${(n * Number(per) * 0.08).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`])), 1)}
    <p>That is the calculation only. Filing, deposits and payroll runs are not part of Omnia.tax.</p>
    <h2>Try it free</h2>
    <p>The trial is 14 days, and a <a href="/payroll-tax-api-test-keys">test key</a> never bills.</p>`,
    faq: [
      { q: 'How much does the payroll tax API cost?', a: '$0.08 per paycheck calculation after a 14-day free trial. There are no seat fees, no minimum and no tiers.' },
      { q: 'Are failed requests billed?', a: 'No. A request that is refused for validation or fails is not billed, and neither are address lookups or employer-tax estimates.' },
    ],
    related: ['/payroll-tax-api', '/payroll-tax-api-test-keys', '/build-vs-buy-payroll-tax-engine', '/embedded-payroll-tax-engine'],
  });

  add({
    path: '/build-vs-buy-payroll-tax-engine', label: 'Build vs buy a payroll tax engine', group: 'Buying and building',
    title: 'Build vs buy a payroll tax engine: the real costs | Omnia.tax',
    description: 'Should you build payroll tax calculation yourself? Where the cost really is (upkeep, local taxes, effective dates), a checklist, and when buying wins.',
    h1: 'Build vs buy a payroll tax engine', eyebrow: 'Buying and building',
    sub: 'The arithmetic is easy to build. The permanent cost is keeping the rules right.',
    body: `
    <p>Building a first version of payroll tax calculation takes weeks: Social Security, Medicare, a federal percentage method, a flat state rate. The trouble is everything after that.</p>
    <h2>Where the cost really is</h2>
    <ul>
      <li><strong>Upkeep.</strong> Rates, brackets, wage bases and forms change every year and some mid-year. There are ${states.length} state rule sets, each with its own method, and ${cov.localJurisdictions.toLocaleString('en-US')} local jurisdictions in just ${cov.statesWithLocalTax} of them.</li>
      <li><strong>Effective dating.</strong> A correction for an earlier year must use that year's rules, so old rules cannot be overwritten.</li>
      <li><strong>Per-tax wages.</strong> One deduction touches each tax differently, state by state. See <a href="/pre-tax-deduction-tax-treatment">pre-tax deductions</a>.</li>
      <li><strong>Edge cases.</strong> Multi-state employees, reciprocity, supplemental wages, worker categories, caps carried across paychecks.</li>
      <li><strong>Proof.</strong> A payroll specialist has to be able to audit a line, so each one needs an explanation.</li>
    </ul>
    <h2>Build when</h2>
    <p>Payroll tax is your product, you have specialists to maintain it, and no vendor covers a jurisdiction you need.</p>
    <h2>Buy when</h2>
    <p>Payroll tax is a feature of something else, or you need to ship before a rules team could exist. Check what the vendor covers before you decide. Ours is a smaller, self-serve engine: all states, local taxes in ${cov.statesWithLocalTax} states found by address geocoding, garnishments and minimum wage. It calculates; it does not file, deposit or run payroll.</p>
    <h2>A checklist for either</h2>
    <ul>
      <li>Can it reproduce a paycheck from last year, with last year's rules?</li>
      <li>Does it carry year-to-date wages for the caps?</li>
      <li>Does every line say how it was reached?</li>
      <li>What happens when it cannot compute: an error that names the missing input, or a silent default?</li>
    </ul>
    <p>Compare vendors on the <a href="/payroll-tax-engine-comparison">comparison page</a>, or look at <a href="/payroll-tax-api-pricing">what ours costs</a>.</p>`,
    faq: [
      { q: 'Should I build my own payroll tax calculation?', a: 'Only if payroll tax is your product and you can staff the upkeep. The arithmetic is simple; the permanent cost is keeping every state and local rule current, effective-dated and tested.' },
      { q: 'What makes payroll tax hard to build?', a: 'Volume and change: dozens of state methods, thousands of local jurisdictions, yearly and mid-year updates, effective dating for corrections, and per-tax rules for deductions and caps.' },
    ],
    related: ['/payroll-tax-engine-comparison', '/embedded-payroll-tax-engine', '/payroll-tax-api-pricing', '/payroll-tax-engine'],
  });

  return D;
}

const EXTRA_LABELS: Record<string, string> = {
  '/payroll-tax-api': 'Payroll tax API',
  '/payroll-tax-calculation': 'How payroll tax calculation works',
  '/payroll-tax-engine-comparison': 'Payroll tax engine comparison',
  '/symmetry-tax-engine-alternative': 'Symmetry Tax Engine alternative',
  '/payroll-tax': 'Payroll tax by state',
  '/coverage': 'Coverage',
  '/docs': 'Docs',
  '/docs/paycheck': 'API reference',
  '/take-home-pay': 'Take-home pay by state',
  '/unemployment-tax': 'Unemployment tax by state',
  '/sandbox': 'Paycheck calculator',
  '/disclaimer': 'Disclaimer',
  '/contact': 'Contact',
  '/changelog': 'Changelog',
  '/pricing': 'Pricing',
};

const SMALL = new Set(['of', 'the', 'and']);
const titleCase = (slug: string) => slug.split('-').map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');

export function labelFor(defs: TopicDef[], path: string): string {
  const known = defs.find((d) => d.path === path)?.label ?? EXTRA_LABELS[path];
  if (known) return known;
  const state = /^\/(payroll-tax|take-home-pay|unemployment-tax)\/([a-z-]+)$/.exec(path);
  if (state) {
    const name = titleCase(state[2]!);
    return state[1] === 'payroll-tax' ? `${name} payroll tax` : state[1] === 'take-home-pay' ? `Take-home pay in ${name}` : `${name} unemployment tax`;
  }
  return path;
}

export function topicPage(h: Helpers, d: TopicDef, defs: TopicDef[]): GeneratedPage {
  if (d.title.length > 70) throw new Error(`${d.path}: title is ${d.title.length} characters`);
  if (d.description.length > 160) throw new Error(`${d.path}: description is ${d.description.length} characters`);
  const links = [...d.related, '/guides'].map((p) => `<a href="${p}">${h.esc(p === '/guides' ? 'All guides' : labelFor(defs, p))}</a>`).join(' · ');
  const body = `${d.body}\n    <h2>Keep reading</h2>\n    <p>${links}</p>`;
  const breadcrumb = [{ name: 'Home', path: '/' }, { name: 'Guides', path: '/guides' }, { name: d.label, path: d.path }];
  return {
    path: d.path,
    file: `${d.path.slice(1)}.html`,
    title: d.title, description: d.description, h1: d.h1, faq: d.faq, breadcrumb,
    html: h.shell({ title: d.title, description: d.description, eyebrow: d.eyebrow, h1: d.h1, sub: d.sub, breadcrumb, body, faq: d.faq }),
  };
}

export function guidesHub(h: Helpers, defs: TopicDef[]): GeneratedPage {
  const groups: TopicDef['group'][] = [...GROUPS];
  const section = (g: TopicDef['group']) => `<h2>${h.esc(g)}</h2><ul style="list-style:none;padding:0;line-height:30px">${defs
    .filter((d) => d.group === g)
    .map((d) => `<li><a href="${d.path}">${h.esc(d.label)}</a> <span class="fine">${h.esc(d.sub)}</span></li>`)
    .join('')}</ul>`;
  const body = `
    <p>Guides to payroll tax calculation: how an engine works, how each tax is worked out, what employers pay, and the rates, wage bases and rules by state. Every figure is read from the rule files the Omnia.tax engine uses, and every worked example is run through it.</p>
    <h2>The basics</h2>
    <ul style="list-style:none;padding:0;line-height:30px">
      <li><a href="/payroll-tax-calculation">How payroll tax calculation works</a></li>
      <li><a href="/payroll-tax-api">Payroll tax API</a></li>
      <li><a href="/payroll-tax-engine-comparison">Payroll tax engine comparison</a></li>
      <li><a href="/symmetry-tax-engine-alternative">Symmetry Tax Engine alternative</a></li>
    </ul>
    ${groups.map(section).join('')}
    <h2>By state</h2>
    <ul style="list-style:none;padding:0;line-height:30px">
      <li><a href="/payroll-tax">Payroll tax by state</a> <span class="fine">Income tax, wage base, minimum wage, local taxes and a worked paycheck for each state</span></li>
      <li><a href="/unemployment-tax">Unemployment tax by state</a> <span class="fine">SUTA wage base, rate and the most per employee</span></li>
      <li><a href="/take-home-pay">Take-home pay by state</a> <span class="fine">What nine salaries net in each state</span></li>
    </ul>`;
  const faq: Faq[] = [{ q: 'Where do the figures in these guides come from?', a: 'From the rule files Omnia.tax\'s engine reads, and worked examples are run through the engine itself. Confirm any figure against the state or federal agency before relying on it.' }];
  const breadcrumb = [{ name: 'Home', path: '/' }, { name: 'Guides', path: '/guides' }];
  const title = 'Payroll tax guides: engines, APIs, rates by state | Omnia.tax';
  const description = 'Guides to payroll tax calculation: how an engine works, each tax step by step, employer taxes, and rates, wage bases and take-home pay by state.';
  return {
    path: '/guides', file: 'guides.html', title, description, h1: 'Payroll tax guides', faq, breadcrumb,
    html: h.shell({ title, description, eyebrow: 'Guides', h1: 'Payroll tax guides', sub: 'How payroll tax calculation works, tax by tax and state by state.', breadcrumb, body, faq }),
  };
}

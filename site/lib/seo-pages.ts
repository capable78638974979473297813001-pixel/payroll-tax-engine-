import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { calculatePaycheck } from '../../src/calculate.ts';
import { federalRuleset } from '../../src/registry.ts';
import { minimumWage } from '../../src/minimum-wage.ts';
import type { PaycheckInput } from '../../src/types.ts';
import { coverage } from './coverage.ts';
import { GEOCODE, topLocalStates } from './geocoding-facts.ts';
import { guidesHub, topicPage, topics, type Helpers } from './seo-topics.ts';
import { moreTopics } from './seo-topics-more.ts';
import { takeHomePages, unemploymentPages } from './seo-states.ts';

/**
 * The search-landing pages: how payroll tax is calculated, the API, an honest look at
 * alternatives, and one page per state. They are generated, not hand-edited: the figures come
 * from the same rule files the engine reads, and the worked examples are run through the engine,
 * so a page cannot show a rate the engine does not use. `npm run build:seo-pages` writes them to
 * site/ and site/lib/generated-pages.json; tests/seo-pages.test.ts fails when the files are stale.
 *
 * Nothing here states a fact about another company that is not on that company's own website,
 * and each such statement says where it was read and when.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const read = (p: string) => JSON.parse(readFileSync(join(REPO, p), 'utf8')) as Record<string, any>;

export interface Faq {
  q: string;
  a: string;
}

export interface GeneratedPage {
  path: string;
  /** File under site/. */
  file: string;
  title: string;
  description: string;
  h1: string;
  faq: Faq[];
  breadcrumb: { name: string; path: string }[];
  html: string;
}

export const READ_ON = '2026-10-26';

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const money = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const dollars = (n: number) => `$${n.toLocaleString('en-US')}`;
export const pct = (r: number) => `${+(r * 100).toFixed(4)}%`;

const HEADER = `<header class="site-header"><div class="bar">
  <a class="mark" href="/">Omnia<span class="dot" aria-hidden="true"></span>tax</a>
  <nav class="nav-links" aria-label="Primary"><a href="/product">Product</a><a href="/coverage">Coverage</a><a href="/pricing">Pricing</a><a href="/docs">Docs</a></nav>
  <div class="nav-end"><a class="signin" href="/signin">Sign in</a><a class="btn sm" href="/signup">Get API key</a></div>
  <button class="menu-btn" type="button" aria-expanded="false" aria-label="Menu"><span></span><span></span></button>
</div></header>`;

/** The footer every public page carries, so each guide is linked from every page. */
export const FOOTER = `<footer class="site-footer">
  <div class="wrap foot-grid">
    <a class="mark" href="/">Omnia<span class="dot" aria-hidden="true"></span>tax</a>
    <div><h2>Product</h2><a href="/coverage">Coverage</a><a href="/pricing">Pricing</a><a href="/changelog">Changelog</a></div>
    <div><h2>Developers</h2><a href="/docs">Docs</a><a href="/docs/paycheck">API reference</a><a href="/status">Status</a></div>
    <div><h2>Guides</h2><a href="/guides">All guides</a><a href="/payroll-tax-calculation">Payroll tax calculation</a><a href="/payroll-tax-calculation-engine">Payroll tax calculation engine</a><a href="/income-tax-calculation-engine">Income tax calculation engine</a><a href="/take-home-pay">Take-home pay by state</a><a href="/payroll-tax-api">Payroll tax API</a><a href="/payroll-tax">Payroll tax by state</a><a href="/symmetry-tax-engine-alternative">Symmetry alternative</a><a href="/payroll-tax-engine-comparison">Engine comparison</a></div>
    <div><h2>Company</h2><a href="/about">About</a><a href="/contact">Contact</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a></div>
  </div>
  <p class="wrap copy">© 2026 OMNIA TAX LLC. A Michigan limited liability company.</p>
</footer>`;

export function shell(p: { title: string; description: string; eyebrow: string; h1: string; sub: string; breadcrumb: { name: string; path: string }[]; body: string; faq: Faq[] }): string {
  const crumbs = p.breadcrumb
    .map((c, i) => (i === p.breadcrumb.length - 1 ? `<span aria-current="page">${esc(c.name)}</span>` : `<a href="${c.path}">${esc(c.name)}</a>`))
    .join(' <span aria-hidden="true">/</span> ');
  const faq = p.faq.length
    ? `<section class="faq" aria-labelledby="faq-h" style="margin-top:44px;max-width:720px"><h2 id="faq-h" style="font-size:22px;line-height:30px">Questions</h2>${p.faq
        .map((f) => `<article><h3>${esc(f.q)}</h3><p>${esc(f.a)}</p></article>`)
        .join('')}</section>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}" />
<link rel="stylesheet" href="/assets/v5.css" />
</head>
<body>
${HEADER}
<main class="wrap">
  <div class="page-head">
    <nav class="crumbs" aria-label="Breadcrumb">${crumbs}</nav>
    <p class="eyebrow">${esc(p.eyebrow)}</p>
    <h1 class="page">${esc(p.h1)}</h1>
    <p class="sub">${p.sub}</p>
  </div>
  <div class="prose seo" style="margin-top:32px;max-width:720px">
${p.body}
  </div>
${faq}
  <div class="seo-cta" style="margin:48px 0 8px;max-width:720px"><a class="btn" href="/signup">Start the 14-day trial</a> <a class="text-link" href="/docs">Read the docs →</a><p class="fine">14-day free trial, then $0.08 per paycheck calculation. Omnia.tax calculates; it does not file, deposit tax, or give tax advice. <a href="/disclaimer">Disclaimer</a>.</p></div>
</main>
${FOOTER}
<script src="/assets/v5.js"></script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------------------------
// Worked examples, run through the engine
// ---------------------------------------------------------------------------------------------

const W4 = { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 } as const;

export function exampleInput(state: string, certificate: Record<string, unknown> = {}, gross = 300_000, pretax = 0): PaycheckInput {
  return {
    checkDate: '2026-09-15',
    payFrequency: 'biweekly',
    earnings: [{ code: 'REG', category: 'regular', amount: gross }],
    deductions: pretax ? [{ code: '401K', category: 'deferral_401k', amount: pretax }] : [],
    federalW4: { ...W4 },
    ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
    workState: { code: state, certificate },
  } as PaycheckInput;
}

/** A table of every line the engine returns for one paycheck, or null when the engine needs more input than a bare state. */
export function exampleTable(input: PaycheckInput): { html: string; net: number; gross: number } | null {
  let r;
  try {
    r = calculatePaycheck(input);
  } catch {
    return null;
  }
  const rows = r.taxes
    .filter((t) => t.amount > 0)
    .map(
      (t) =>
        `<tr><td>${esc(t.name)}</td><td>${t.payer === 'employee' ? 'Employee' : 'Employer'}</td><td>${t.jurisdiction[0].toUpperCase()}${t.jurisdiction.slice(1)}</td><td style="text-align:right">${money(t.amount)}</td></tr>`,
    )
    .join('');
  const html = `<div class="table-wrap"><table><thead><tr><th>Tax</th><th>Paid by</th><th>Level</th><th style="text-align:right">Amount</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  return { html, net: r.netPay, gross: r.grossPay };
}

export const CURL = (state: string, certificate: string) => `curl https://api.omnia.tax/v1/paycheck \\
  -H "Authorization: Bearer $KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
  "checkDate": "2026-09-15",
  "payFrequency": "biweekly",
  "earnings": [{ "code": "REG", "category": "regular", "amount": 300000 }],
  "deductions": [],
  "federalW4": { "filingStatus": "single", "multipleJobs": false,
    "dependentCredit": 0, "otherIncome": 0, "deductions": 0, "extraWithholding": 0 },
  "ytd": { "socialSecurity": 0, "medicare": 0, "futa": 0 },
  "workState": { "code": "${state}"${certificate} }
}'`;

// ---------------------------------------------------------------------------------------------
// Facts from the rule files
// ---------------------------------------------------------------------------------------------

export function federalFacts() {
  const f26 = federalRuleset('2026-06-15') as any;
  const f27 = federalRuleset('2027-06-15') as any;
  return {
    ssRate: f26.socialSecurity.employeeRate as number,
    ssBase26: f26.socialSecurity.wageBase as number,
    ssBase27: f27.socialSecurity.wageBase as number,
    medicare: f26.medicare.employeeRate as number,
    addlMedicare: f26.medicare.additional.rate as number,
    addlThreshold: f26.medicare.additional.threshold as number,
  };
}

export const STATE_NAMES: Record<string, string> = {};
export function stateFiles(): { code: string; d26: Record<string, any>; d27: Record<string, any> }[] {
  return readdirSync(join(REPO, 'data', 'states'))
    .filter((f) => /^[A-Z]{2}-2026\.json$/.test(f))
    .sort()
    .map((f) => {
      const code = f.slice(0, 2);
      return { code, d26: read(`data/states/${f}`), d27: read(`data/states/${code}-2027.json`) };
    });
}

export const slugOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function incomeTaxSentence(d: Record<string, any>): string {
  if (d.method === 'no_income_tax') return `${d.name} does not tax wages, so there is no state income tax to withhold.`;
  const flat = d.flatRate?.rate;
  if (typeof flat === 'number') return `${d.name} taxes wages at a flat ${pct(flat)}; withholding is a flat-rate calculation on the wages left after the state's allowances and deductions.`;
  return `${d.name} withholds income tax from the state's own published tables or formula, not a single flat rate, so the amount depends on the employee's pay, pay frequency and withholding certificate.`;
}

const LEAVE_KEYS: [string, string][] = [
  ['statePaidLeaveEmployee', 'an employee-paid paid family and medical leave contribution'],
  ['statePaidLeaveEmployer', 'an employer-paid paid leave contribution'],
  ['stateDisabilityEmployee', 'an employee-paid state disability insurance contribution'],
  ['stateLongTermCareEmployee', 'an employee-paid long-term care insurance contribution'],
];
export function leaveList(d: Record<string, any>): string[] {
  return LEAVE_KEYS.filter(([k]) => d[k]).map(([, label]) => label);
}

/** A wage base is a number, or (Michigan) a default and a reduced base for qualified employers. The default is the one that applies unless the employer qualifies. */
export function wageBaseOf(raw: unknown): number | undefined {
  if (typeof raw === 'number') return raw;
  if (raw && typeof raw === 'object' && typeof (raw as { default?: unknown }).default === 'number') return (raw as { default: number }).default;
  return undefined;
}

export function wageBaseText(d26: Record<string, any>, d27: Record<string, any>): string {
  const a = wageBaseOf(d26.suiEmployer?.wageBase);
  const b = wageBaseOf(d27.suiEmployer?.wageBase);
  if (!a) return 'not recorded';
  if (b && b !== a) return `${dollars(a)} for 2026 and ${dollars(b)} for 2027`;
  return `${dollars(a)} for 2026`;
}

function statePage(code: string, d26: Record<string, any>, d27: Record<string, any>, localCount: number, neighbours: { name: string; slug: string }[]): GeneratedPage {
  const name = d26.name as string;
  const slug = slugOf(name);
  const path = `/payroll-tax/${slug}`;
  const sui = d26.suiEmployer ?? {};
  const rate = typeof sui.newEmployerRate === 'number' ? pct(sui.newEmployerRate) : null;
  const mw26 = minimumWage({ checkDate: '2026-12-15', state: code }).cents;
  const mw27 = minimumWage({ checkDate: '2027-01-15', state: code }).cents;
  const leave = leaveList(d26);
  const recip: string[] = Array.isArray(d26.reciprocity?.reciprocalStates) ? d26.reciprocity.reciprocalStates : [];
  const example = exampleTable(exampleInput(code));
  const noTax = d26.method === 'no_income_tax';

  const facts = [
    ['State income tax', noTax ? 'None' : typeof d26.flatRate?.rate === 'number' ? `Flat ${pct(d26.flatRate.rate)}` : "State's own tables or formula"],
    ['Unemployment (SUTA) wage base', wageBaseText(d26, d27)],
    ['New-employer unemployment rate', rate ?? 'Assigned by the state (no single new-employer rate)'],
    ['State minimum wage', mw27 !== mw26 ? `${money(mw26)} in 2026, ${money(mw27)} from January 2027` : `${money(mw26)}`],
    ['Local income or wage taxes in Omnia.tax data', localCount > 0 ? `${localCount.toLocaleString('en-US')} jurisdictions` : 'None recorded'],
    ['Reciprocity with other states', recip.length ? recip.join(', ') : 'None'],
  ];

  const factsTable = `<div class="table-wrap"><table><tbody>${facts.map(([k, v]) => `<tr><th scope="row" style="text-align:left">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table></div>`;

  const faq: Faq[] = [
    {
      q: `Does ${name} have a state income tax?`,
      a: noTax
        ? `No. ${name} does not tax wages, so an employer withholds no state income tax. Federal income tax, Social Security and Medicare still apply.`
        : typeof d26.flatRate?.rate === 'number'
          ? `Yes. ${name} taxes wages at a flat ${pct(d26.flatRate.rate)} under Omnia.tax's 2026 rules, applied after the state's allowances and deductions.`
          : `Yes. ${name} withholds income tax from its own published tables or formula. The result depends on pay, pay frequency and the employee's withholding certificate.`,
    },
    {
      q: `What is ${name}'s unemployment tax wage base?`,
      a: `${name}'s state unemployment wage base is ${wageBaseText(d26, d27)} in Omnia.tax's rule files. The federal FUTA wage base is $7,000 in every state.`,
    },
    {
      q: `What unemployment rate does a new employer pay in ${name}?`,
      a: rate
        ? `Omnia.tax uses ${rate} for a new employer in ${name} unless you send your own assigned rate in employer.stateUnemploymentRate. An established employer's rate is assigned by the state from its experience, so check your rate notice.`
        : `${name} does not publish a single new-employer rate, so Omnia.tax produces no unemployment line unless you send your assigned rate in employer.stateUnemploymentRate.`,
    },
  ];

  const body = `
    <p>${esc(incomeTaxSentence(d26))} Employers also withhold federal income tax, Social Security and Medicare, and pay federal and state unemployment tax.</p>
    <h2>${esc(name)} payroll tax at a glance</h2>
    ${factsTable}
    <p class="fine">Omnia.tax rule files for 2026, with the 2027 figures that are already published. 2027 rules are provisional until the state publishes its own tables. Confirm against ${esc(name)}'s revenue and workforce agencies before you rely on a figure.</p>
    ${
      example
        ? `<h2>A ${esc(name)} paycheck, line by line</h2>
    <p>A single employee paid ${money(example.gross)} biweekly, no allowances, no pre-tax deductions, check dated 2026-09-15. Net pay is ${money(example.net)}. Every line below comes from the engine, and the employer lines are not taken from the employee's pay.</p>
    ${example.html}`
        : `<h2>Calculating a ${esc(name)} paycheck</h2>
    <p>${esc(name)} needs more than a state code to calculate: the employee's work location or withholding certificate decides the result. Send it in <code>workState.certificate</code>, or resolve a street address with <code>POST /v1/address</code>, and the API returns each line.</p>`
    }
    <h2>Calculate ${esc(name)} payroll tax with the API</h2>
    <p>One call returns federal, ${esc(name)} state${localCount > 0 ? ', local' : ''} and employer taxes for a paycheck. Amounts are integer cents.</p>
    <div class="panel" style="margin-top:14px"><pre style="margin:0;padding:18px 22px;overflow:auto">${esc(CURL(code, ''))}</pre></div>
    ${leave.length ? `<h2>Other ${esc(name)} payroll contributions</h2><p>${esc(name)} also requires ${esc(leave.join(', and '))}. The API returns each as its own line.</p>` : ''}
    <h2>Related</h2>
    <p><a href="/payroll-tax">Payroll tax by state</a> · <a href="/payroll-tax-calculation">How payroll tax calculation works</a> · <a href="/coverage">Coverage</a> · <a href="/pricing">Pricing</a>${neighbours.map((n) => ` · <a href="/payroll-tax/${n.slug}">${esc(n.name)}</a>`).join('')}</p>`;

  const title = `${name} payroll tax calculation: rates, wage base, API | Omnia.tax`;
  const baseNow = wageBaseOf(sui.wageBase) !== undefined ? dollars(wageBaseOf(sui.wageBase)!) : null;
  const description = `${name} payroll tax for employers: ${noTax ? 'no state income tax' : typeof d26.flatRate?.rate === 'number' ? `flat ${pct(d26.flatRate.rate)} income tax` : 'state withholding tables'}${baseNow ? `, ${baseNow} unemployment wage base` : ''}${rate ? `, ${rate} new-employer rate` : ''}. Worked paycheck and API example.`;
  const h1 = `${name} payroll tax calculation`;
  const breadcrumb = [
    { name: 'Home', path: '/' },
    { name: 'Payroll tax by state', path: '/payroll-tax' },
    { name, path },
  ];
  return {
    path,
    file: `payroll-tax/${slug}.html`,
    title: title.length > 70 ? `${name} payroll tax calculation | Omnia.tax` : title,
    description: description.length > 160 ? description.slice(0, 157).replace(/[ ,;]+\S*$/, '') + '...' : description,
    h1,
    faq,
    breadcrumb,
    html: shell({
      title: title.length > 70 ? `${name} payroll tax calculation | Omnia.tax` : title,
      description,
      eyebrow: 'Payroll tax by state',
      h1,
      sub: `What an employer withholds and pays in ${esc(name)}, from the same rule files the API uses.`,
      breadcrumb,
      body,
      faq,
    }),
  };
}

// ---------------------------------------------------------------------------------------------
// The hand-written guides
// ---------------------------------------------------------------------------------------------

function calculationPage(): GeneratedPage {
  const f = federalFacts();
  const ohio = exampleTable(exampleInput('OH', { residenceCity: 'Columbus', workCity: 'Columbus' }, 300_000, 24_000));
  const faq: Faq[] = [
    {
      q: 'How do you calculate payroll taxes?',
      a: `Start with gross pay, subtract the deductions that are pre-tax for each tax, then apply each tax to its own taxable wages: Social Security at ${pct(f.ssRate)} up to the wage base, Medicare at ${pct(f.medicare)}, federal income tax from the employee's Form W-4, then state and local tax. Employers add federal and state unemployment tax on top.`,
    },
    {
      q: 'What is the Social Security wage base?',
      a: `${dollars(f.ssBase26)} for 2026 and ${dollars(f.ssBase27)} for 2027. Social Security tax stops once an employee's wages for the year pass that amount; Medicare has no cap.`,
    },
    {
      q: 'Is a 401(k) deferral subject to payroll tax?',
      a: 'It depends on the tax. A traditional 401(k) deferral reduces federal and most state income tax wages, but it is still subject to Social Security and Medicare. That difference between taxes is the most common cause of payroll tax errors.',
    },
    {
      q: 'Can an API calculate payroll taxes for me?',
      a: 'Yes. Omnia.tax takes earnings, deductions, a Form W-4, year-to-date wages and the work location, and returns each tax line with the wages it applied to and who pays it. It calculates; you still file and deposit.',
    },
  ];
  const body = `
    <p>Payroll tax calculation turns one paycheck's gross pay into net pay by working out each tax separately. The hard part is not the arithmetic. Each tax has its own taxable wages, its own cap, and its own rules for which deductions count, so one set of numbers does not carry across all of them.</p>
    <h2>The steps, in order</h2>
    <ol>
      <li><strong>Gross pay.</strong> Add every earning for the period. Bonuses and commissions are supplemental wages and can be taxed differently.</li>
      <li><strong>Pre-tax deductions, tax by tax.</strong> A section 125 health premium reduces federal income tax, Social Security and Medicare wages. A traditional 401(k) deferral reduces income tax wages but not Social Security or Medicare wages.</li>
      <li><strong>Social Security.</strong> ${pct(f.ssRate)} from the employee and the same from the employer, up to the annual wage base: ${dollars(f.ssBase26)} in 2026, ${dollars(f.ssBase27)} in 2027. This is why year-to-date wages are an input.</li>
      <li><strong>Medicare.</strong> ${pct(f.medicare)} from each side with no cap, plus ${pct(f.addlMedicare)} Additional Medicare Tax withheld from the employee on wages above ${dollars(f.addlThreshold)}.</li>
      <li><strong>Federal income tax.</strong> Worked out from the employee's Form W-4: filing status, the multiple-jobs checkbox, the dependent credit, other income, deductions and extra withholding, using the IRS percentage method.</li>
      <li><strong>State and local income tax.</strong> Each state has its own formula, tables and withholding certificate. Some cities, counties and school districts add a tax on top, which depends on both the work and the home address.</li>
      <li><strong>Employer-only taxes.</strong> Federal unemployment (FUTA) is 6.0% of the first $7,000 per employee, with a credit that normally brings it to 0.6%. State unemployment (SUTA) has its own wage base and rate. Some states add employer contributions for paid leave.</li>
      <li><strong>Net pay.</strong> Gross pay less employee taxes and all deductions. Employer taxes are a cost to the employer, not a deduction from the employee.</li>
    </ol>
    ${
      ohio
        ? `<h2>An example, with a 401(k) deferral</h2>
    <p>A single employee in Columbus, Ohio, paid ${money(ohio.gross)} biweekly with a $240.00 traditional 401(k) deferral, check dated 2026-09-15. Net pay is ${money(ohio.net)}. These lines were produced by the Omnia.tax engine for this input; notice that the deferral lowers income tax but not the Social Security and Medicare lines.</p>
    ${ohio.html}`
        : ''
    }
    <h2>Where payroll tax calculations go wrong</h2>
    <ul>
      <li>Treating one deduction as pre-tax for every tax.</li>
      <li>Missing a wage-base cap because year-to-date wages were not carried forward.</li>
      <li>Using the tax year of the pay period instead of the check date; withholding follows the date the check is paid.</li>
      <li>Looking up a state without the local layer, which matters in Ohio, Pennsylvania, Kentucky, Indiana, Michigan, Alabama and others.</li>
      <li>Rounding each line before totalling instead of working in whole cents.</li>
    </ul>
    <h2>Calculate it with the API</h2>
    <p>The <a href="/payroll-tax-api">Omnia.tax payroll tax API</a> does these steps in one request and returns every line. See the <a href="/payroll-tax">state-by-state guides</a> for rates and wage bases, or the <a href="/docs/paycheck">API reference</a> for the request fields.</p>`;
  const breadcrumb = [{ name: 'Home', path: '/' }, { name: 'Payroll tax calculation', path: '/payroll-tax-calculation' }];
  const title = 'Payroll tax calculation: how gross pay becomes net pay | Omnia.tax';
  const description = `How payroll tax is calculated, step by step: FICA wage base (${dollars(f.ssBase26)} in 2026), federal and state withholding, unemployment tax, a worked example.`;
  const h1 = 'Payroll tax calculation, step by step';
  return {
    path: '/payroll-tax-calculation',
    file: 'payroll-tax-calculation.html',
    title,
    description,
    h1,
    faq,
    breadcrumb,
    html: shell({ title, description, eyebrow: 'Guide', h1, sub: 'How a paycheck is worked out, which numbers change the result, and how to automate it.', breadcrumb, body, faq }),
  };
}

function apiPage(): GeneratedPage {
  const c = coverage().summary;
  const faq: Faq[] = [
    {
      q: 'What is a payroll tax API?',
      a: 'An HTTP service that takes one paycheck (earnings, deductions, the employee\'s W-4 and work location) and returns the payroll taxes: federal, state and local withholding, Social Security, Medicare and the employer taxes.',
    },
    {
      q: 'How much does the Omnia.tax payroll tax API cost?',
      a: '$0.08 per paycheck calculation after a 14-day free trial. There are no seat fees.',
    },
    {
      q: 'Does Omnia.tax file or pay payroll taxes?',
      a: 'No. It calculates the tax. It does not file returns, deposit or remit tax, pay employees or move money, and it does not give tax advice.',
    },
    {
      q: 'Which states and years does it cover?',
      a: `All 50 states and DC for 2025, 2026 and 2027 (2027 is provisional where a state has not yet published its tables), plus local taxes in ${c.statesWithLocalTax} states covering ${c.localJurisdictions.toLocaleString('en-US')} jurisdictions and ${c.localMinimumWage} local minimum wage ordinances.`,
    },
  ];
  const body = `
    <p>Omnia.tax is a payroll tax calculation API. You send a paycheck and get back every tax line: who pays it, the wages it applied to, the amount in cents, and a short explanation of the math.</p>
    <h2>One request, every tax</h2>
    <div class="panel" style="margin-top:14px"><pre style="margin:0;padding:18px 22px;overflow:auto">${esc(CURL('OH', ', "certificate": { "residenceCity": "Columbus", "workCity": "Columbus" }'))}</pre></div>
    <h2>What you get back</h2>
    <ul>
      <li>Federal income tax from the employee's Form W-4, Social Security, Medicare and Additional Medicare.</li>
      <li>State income tax for all 50 states and DC, with each state's own formula and withholding certificate.</li>
      <li>Local taxes, found from the address: ${c.localJurisdictions.toLocaleString('en-US')} jurisdictions across ${c.statesWithLocalTax} states, including Ohio and Pennsylvania municipalities and school districts, each listed by name on the <a href="/coverage">coverage page</a>.</li>
      <li>Employer taxes: FUTA, state unemployment, and state paid-leave contributions.</li>
      <li>Garnishment limits and a minimum-wage check on the same call, billed as one call.</li>
    </ul>
    <h2>Built for developers</h2>
    <ul>
      <li><strong>Plain JSON.</strong> Integer cents everywhere, a published <a href="/v1/schemas/paycheck-request.json">JSON Schema</a> and <a href="/v1/openapi.json">OpenAPI 3.1 document</a>, and field-level validation errors.</li>
      <li><strong>Effective-dated rules.</strong> The check date picks the tax year, so a correction run for an earlier year uses that year's rules.</li>
      <li><strong>Explainable lines.</strong> Each tax line carries a detail string. When a rate rests on a weaker source than the levying body's own form, the response says so in <code>notices</code>.</li>
      <li><strong>Address resolution.</strong> <code>POST /v1/address</code> turns a work and home address into the state, the local jurisdictions and the certificate a paycheck needs.</li>
    </ul>
    <h2>Pricing</h2>
    <p>14-day free trial, then <strong>$0.08 per paycheck calculation</strong>. No seat fees and no minimum. See <a href="/pricing">pricing</a>.</p>
    <h2>What it does not do</h2>
    <p>It calculates only. It does not file returns, deposit tax, pay employees or give advice. If you need a full embedded payroll platform, see the <a href="/payroll-tax-engine-comparison">comparison of payroll tax engines</a>.</p>
    <h2>Keep reading</h2>
    <p><a href="/payroll-tax-calculation">How payroll tax calculation works</a> · <a href="/payroll-tax">Payroll tax by state</a> · <a href="/docs/paycheck">API reference</a> · <a href="/coverage">Coverage</a></p>`;
  const breadcrumb = [{ name: 'Home', path: '/' }, { name: 'Payroll tax API', path: '/payroll-tax-api' }];
  const title = 'Payroll tax API: federal, state, local | Omnia.tax';
  const description = 'A payroll tax calculation API for developers: federal, state, local and employer taxes in one request. JSON in cents, OpenAPI spec, $0.08 per paycheck.';
  const h1 = 'Payroll tax API';
  return {
    path: '/payroll-tax-api',
    file: 'payroll-tax-api.html',
    title,
    description,
    h1,
    faq,
    breadcrumb,
    html: shell({ title, description, eyebrow: 'Developers', h1, sub: 'Federal, state, local and employer payroll tax for one paycheck, from one HTTP call.', breadcrumb, body, faq }),
  };
}

function localSentence(): { jurisdictions: string; states: number; top: string } {
  const c = coverage().summary;
  const top = topLocalStates(c.localByState as Record<string, number>, STATE_NAMES, 4)
    .map((t) => `${t.name} ${t.count.toLocaleString('en-US')}`)
    .join(', ');
  return { jurisdictions: c.localJurisdictions.toLocaleString('en-US'), states: c.statesWithLocalTax, top };
}

function symmetryPage(): GeneratedPage {
  const c = coverage().summary;
  const L = localSentence();
  const faq: Faq[] = [
    {
      q: 'Is Omnia.tax a Symmetry Tax Engine alternative?',
      a: `Yes, if you want a smaller, easier, self-serve payroll tax engine. It does the same core job: gross-to-net for federal, all 50 states and DC and local taxes, plus employer taxes, garnishments and minimum wage, with address geocoding that finds the right local jurisdictions. You sign up, get a key and call it, at a published $0.08 per paycheck calculation. If you also need withholding forms, I-9 or Canadian payroll from the same vendor, those are outside Omnia.tax.`,
    },
    {
      q: 'Does Omnia.tax cover local payroll taxes?',
      a: `Yes: ${L.jurisdictions} local tax jurisdictions in the ${L.states} states where we found local wage taxes, each listed by name on the coverage page, and chosen from the employee's work and home address by geocoding.`,
    },
    {
      q: 'Is the Omnia.tax API compatible with Symmetry\'s?',
      a: 'No. Omnia.tax has an adapter that accepts a Symmetry-shaped payCalc request, but it is not wire-compatible with Symmetry\'s API, and its tax jurisdiction ids are its own, not Symmetry\'s. Expect to change your integration.',
    },
    {
      q: 'How is Omnia.tax priced compared with Symmetry?',
      a: 'Omnia.tax is $0.08 per paycheck calculation after a 14-day trial, published on the pricing page. Symmetry does not publish a price on its website; it directs buyers to a demo. We have not seen Symmetry\'s pricing and do not compare it.',
    },
  ];
  const body = `
    <p>Symmetry Software's Symmetry Tax Engine is an established payroll tax engine that payroll platforms embed. If you are comparing it with other options, this page says what each does, using what each company publishes about itself, and where a smaller, self-serve engine is the better fit.</p>
    <h2>What Symmetry says it is</h2>
    <p>From symmetry.com (read ${READ_ON}): payroll tax infrastructure for employers, providers and platforms, with the Symmetry Tax Engine for gross-to-net calculation, Payroll Forms (over 130 withholding forms), Symmetry I-9, Payroll Point for local withholding from address coordinates, and a Minimum Wage Finder. Its site cites 64 million+ employees' paychecks calculated, 7,400+ tax jurisdictions covered and 40+ years of payroll compliance experience. It does not list prices; it offers a demo.</p>
    <h2>What Omnia.tax is</h2>
    <p>A smaller, easier, self-serve payroll tax engine. It does the same core calculation: federal income tax, FICA, all 50 states and DC, local taxes, employer taxes, garnishment limits and a minimum-wage check, gross to net, in one request. You do not need a demo or a contract: sign up, get a key, and calculate. $0.08 per paycheck calculation after a 14-day trial, with public documentation, a JSON Schema and an OpenAPI document.</p>
    <h2>Local coverage and geocoding, built in</h2>
    <p>Local tax is where payroll tax calculations usually go wrong, so it is the part we built most carefully.</p>
    <ul>
      <li><strong>${L.jurisdictions} local tax jurisdictions in ${L.states} states,</strong> each listed by name with its rate on the <a href="/coverage">coverage page</a>. The largest: ${L.top}.</li>
      <li><strong>Address geocoding that finds the right one.</strong> Send a work address, and a home address if it differs, to <code>POST /v1/address</code> and get the state, city, county, school district and the withholding certificate a paycheck needs. The response says how precisely each address matched.</li>
      <li><strong>Measured, not claimed.</strong> We resolved one real address in each of the ${GEOCODE.jurisdictionsTested} jurisdictions through the same pipeline: ${GEOCODE.betterThanInterpolation} resolved to a surveyed address point or better, ${GEOCODE.rooftop} of them to a government-published rooftop point (run ${GEOCODE.measuredOn}).</li>
      <li><strong>Local minimum wage too:</strong> ${c.localMinimumWage} city and county ordinances, checked on the same call.</li>
    </ul>
    <h2>Side by side</h2>
    <div class="table-wrap"><table>
      <thead><tr><th></th><th>Omnia.tax</th><th>Symmetry Tax Engine</th></tr></thead>
      <tbody>
        <tr><th scope="row" style="text-align:left">Access</th><td>Sign up, get a key, call the API</td><td>Demo and sales contact (per symmetry.com)</td></tr>
        <tr><th scope="row" style="text-align:left">Pricing</th><td>$0.08 per paycheck calculation, published</td><td>Not published on its website</td></tr>
        <tr><th scope="row" style="text-align:left">Core calculation</th><td>Gross to net: federal, 50 states and DC, local, employer taxes, garnishments, minimum wage, pension withholding (federal, and state for the states we have checked)</td><td>Gross-to-net calculation (per symmetry.com)</td></tr>
        <tr><th scope="row" style="text-align:left">Local taxes and addresses</th><td>${L.jurisdictions} local jurisdictions in ${L.states} states, found from the work and home address by geocoding</td><td>Local withholding from address coordinates (Payroll Point, per symmetry.com)</td></tr>
        <tr><th scope="row" style="text-align:left">Size</th><td>Smaller: one calculation API</td><td>A platform: engine, forms, I-9, minimum wage finder</td></tr>
        <tr><th scope="row" style="text-align:left">Withholding forms</th><td>Not part of Omnia.tax</td><td>130+ forms (Symmetry Payroll Forms)</td></tr>
        <tr><th scope="row" style="text-align:left">I-9 and E-Verify</th><td>Not part of Omnia.tax</td><td>Symmetry I-9</td></tr>
        <tr><th scope="row" style="text-align:left">Track record</th><td>Newer</td><td>40+ years of payroll compliance (per symmetry.com)</td></tr>
        <tr><th scope="row" style="text-align:left">Documentation</th><td>Public docs, OpenAPI 3.1, JSON Schema</td><td>Integration guide for customers (per a customer quote on symmetry.com)</td></tr>
      </tbody>
    </table></div>
    <h2>When Omnia.tax is the better fit</h2>
    <ul>
      <li>You want to start the same day, without a sales cycle, and pay per calculation.</li>
      <li>You want the calculation, local taxes and address geocoding in one small API instead of a platform.</li>
      <li>You want explainable lines and a published schema you can generate a client from.</li>
    </ul>
    <h2>What is outside the calculation</h2>
    <p>Omnia.tax calculates. It does not file or deposit tax, run payroll, produce withholding forms, verify I-9s or cover Canadian payroll. If you need those from the same vendor, Symmetry offers forms and I-9, and a long production history (40+ years, per symmetry.com) may matter to your buyers or auditors.</p>
    <h2>Migrating</h2>
    <p>Omnia.tax is not a drop-in replacement. It has an adapter that accepts a Symmetry-shaped <code>payCalc</code> request so the request shape looks familiar, but it is not wire-compatible, and its jurisdiction ids are its own. Plan to map your employees to Omnia.tax's request: earnings, deductions, the W-4, year-to-date wages and the work state certificate. <code>POST /v1/address</code> resolves addresses to certificates.</p>
    <p>See also the <a href="/payroll-tax-engine-comparison">comparison of payroll tax engines</a>, <a href="/local-payroll-tax-api">local payroll tax coverage</a> and the <a href="/payroll-tax-api">payroll tax API</a>.</p>`;
  const breadcrumb = [{ name: 'Home', path: '/' }, { name: 'Symmetry Tax Engine alternative', path: '/symmetry-tax-engine-alternative' }];
  const title = 'Symmetry Tax Engine alternative: payroll tax API | Omnia.tax';
  const description = 'A smaller, easier, self-serve Symmetry Tax Engine alternative: the same gross-to-net calculation, local coverage and address geocoding, $0.08 per paycheck.';
  const h1 = 'A Symmetry Tax Engine alternative';
  return {
    path: '/symmetry-tax-engine-alternative',
    file: 'symmetry-tax-engine-alternative.html',
    title,
    description,
    h1,
    faq,
    breadcrumb,
    html: shell({ title, description, eyebrow: 'Compare', h1, sub: 'A smaller, easier, self-serve payroll tax engine, with local coverage and geocoding built in.', breadcrumb, body, faq }),
  };
}

function comparisonPage(): GeneratedPage {
  const c = coverage().summary;
  const L = localSentence();
  const faq: Faq[] = [
    {
      q: 'What are the alternatives to Symmetry Software?',
      a: 'Other ways to get payroll tax calculation include Vertex Payroll Tax, an embedded payroll API such as Check, a self-serve payroll tax API such as Omnia.tax, or building the rules in-house from IRS and state publications. Which fits depends on whether you need only calculation or a full payroll platform.',
    },
    {
      q: 'Which payroll tax engine has local tax coverage and address geocoding?',
      a: `Several do. Omnia.tax covers ${L.jurisdictions} local jurisdictions in ${L.states} states and finds the right ones from the work and home address with geocoding, in a self-serve API. Symmetry describes local withholding from address coordinates, and Vertex describes geocode-based jurisdiction assignment, on their own sites.`,
    },
    {
      q: 'Should I build payroll tax calculation myself?',
      a: 'Only if payroll tax is your product. The arithmetic is simple. Keeping every state and local rule current, effective-dated and tested is the permanent cost.',
    },
  ];
  const body = `
    <p>There are four ways to get payroll tax calculation into a product. They differ in what you get beyond the calculation and in what you maintain yourself. This page describes each using what the vendor publishes on its own site (read ${READ_ON}).</p>
    <h2>The options</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>Option</th><th>What the vendor says it is</th><th>Choose it when</th></tr></thead>
      <tbody>
        <tr><th scope="row" style="text-align:left">Symmetry Tax Engine</th><td>Payroll tax infrastructure for payroll platforms: gross-to-net calculation, withholding forms, I-9, local lookup. 7,400+ jurisdictions, 40+ years (symmetry.com).</td><td>You are building a payroll product and want a platform with forms and I-9 from one vendor, and a long track record.</td></tr>
        <tr><th scope="row" style="text-align:left">Vertex Payroll Tax</th><td>SaaS payroll tax calculation for HCM and staffing applications in the US and Canada, with geocode-based jurisdiction assignment and REST APIs (vertexinc.com).</td><td>You need US and Canada in one vendor.</td></tr>
        <tr><th scope="row" style="text-align:left">Check</th><td>Embedded payroll infrastructure: tax calculation, tax filing, money movement, benefits and more (checkhq.com).</td><td>You want to launch a whole payroll product, not only the calculation.</td></tr>
        <tr><th scope="row" style="text-align:left">Omnia.tax</th><td>A smaller, easier, self-serve payroll tax engine. The same gross-to-net calculation: federal, 50 states and DC, ${L.jurisdictions} local jurisdictions in ${L.states} states found by address geocoding, employer taxes, garnishments and minimum wage. $0.08 per calculation.</td><td>You want the calculation, with local taxes and geocoding built in, as a small self-serve API you can start with today.</td></tr>
        <tr><th scope="row" style="text-align:left">Build it yourself</th><td>Implement the IRS and state rules in your own code.</td><td>Payroll tax is your product and you can staff the upkeep.</td></tr>
      </tbody>
    </table></div>
    <h2>Questions to ask any vendor</h2>
    <ul>
      <li>Which local taxes (cities, counties, school districts) are covered, and how is the right one chosen from a home and work address?</li>
      <li>How does it handle a check dated in an earlier year, or a state that publishes new tables mid-year?</li>
      <li>Does each tax line explain how it was reached, so a payroll specialist can audit it?</li>
      <li>What is the price per calculation at your volume, and is it published?</li>
      <li>Does it file and deposit, or only calculate, and which do you need?</li>
    </ul>
    <h2>How Omnia.tax answers the local question</h2>
    <p>${L.jurisdictions} local tax jurisdictions in the ${L.states} states where we found local wage taxes, each listed by name with its rate on the <a href="/coverage">coverage page</a> (the largest: ${L.top}). Address geocoding finds the right ones from the work and home address, and says how precisely it matched: in our state-by-state test, ${GEOCODE.betterThanInterpolation} of ${GEOCODE.jurisdictionsTested} jurisdictions resolved to a surveyed address point or better (${GEOCODE.measuredOn}). ${c.localMinimumWage} local minimum wage ordinances are checked on the same call.</p>
    <h2>Where Omnia.tax fits</h2>
    <p>It is the smallest and easiest to start with: a self-serve calculation API with local coverage and geocoding built in, a 14-day trial, then $0.08 per paycheck calculation. It calculates; filing, deposits, payroll runs, withholding forms, I-9 and Canadian payroll are outside it. Read the <a href="/symmetry-tax-engine-alternative">Symmetry Tax Engine comparison</a>, the <a href="/local-payroll-tax-api">local payroll tax coverage</a> or the <a href="/payroll-tax-api">API overview</a>.</p>`;
  const breadcrumb = [{ name: 'Home', path: '/' }, { name: 'Payroll tax engine comparison', path: '/payroll-tax-engine-comparison' }];
  const title = 'Payroll tax engine comparison: Symmetry, Vertex, Check, Omnia.tax';
  const description = 'Compare payroll tax calculation options: Symmetry, Vertex, Check, a self-serve API with local coverage and geocoding, or build it yourself.';
  const h1 = 'Payroll tax engine comparison';
  return {
    path: '/payroll-tax-engine-comparison',
    file: 'payroll-tax-engine-comparison.html',
    title,
    description,
    h1,
    faq,
    breadcrumb,
    html: shell({ title, description, eyebrow: 'Compare', h1, sub: 'Four ways to get payroll tax calculation into a product, and the trade-offs.', breadcrumb, body, faq }),
  };
}

function hubPage(states: { name: string; slug: string; code: string; noTax: boolean }[]): GeneratedPage {
  const list = states.map((s) => `<li><a href="/payroll-tax/${s.slug}">${esc(s.name)} payroll tax</a>${s.noTax ? ' <span class="fine">no state income tax</span>' : ''}</li>`).join('');
  const faq: Faq[] = [
    { q: 'Which states have no income tax?', a: `${states.filter((s) => s.noTax).map((s) => s.name).join(', ')} do not tax wages in Omnia.tax's 2026 rules, so employers withhold no state income tax there.` },
  ];
  const body = `
    <p>Pick a state for its income tax treatment, unemployment wage base and new-employer rate, minimum wage, local taxes and a worked paycheck. Every figure comes from the rule files the API uses.</p>
    <ul style="columns:2;column-gap:32px;list-style:none;padding:0;line-height:30px">${list}</ul>
    <p>New to this? Start with <a href="/payroll-tax-calculation">how payroll tax is calculated</a>, or go straight to the <a href="/payroll-tax-api">payroll tax API</a>.</p>`;
  const breadcrumb = [{ name: 'Home', path: '/' }, { name: 'Payroll tax by state', path: '/payroll-tax' }];
  const title = 'Payroll tax by state: rates, wage bases, minimum wage | Omnia.tax';
  const description = 'Payroll tax for all 50 states and DC: income tax, unemployment wage base and new-employer rate, minimum wage, local taxes, and a worked paycheck.';
  const h1 = 'Payroll tax by state';
  return {
    path: '/payroll-tax',
    file: 'payroll-tax.html',
    title,
    description,
    h1,
    faq,
    breadcrumb,
    html: shell({ title, description, eyebrow: 'States', h1, sub: 'The 50 states and DC, with the figures an employer needs.', breadcrumb, body, faq }),
  };
}

/** Every generated page: the guides, the state hub and one page per state, then the topic guides and the per-state unemployment and take-home families. */
export function generatePages(): GeneratedPage[] {
  const files = stateFiles();
  const local = coverage().summary.localByState as Record<string, number>;
  const bySlug = files.map(({ code, d26 }) => ({ code, name: d26.name as string, slug: slugOf(d26.name), noTax: d26.method === 'no_income_tax' }));
  for (const s of bySlug) STATE_NAMES[s.code] = s.name;
  const pages: GeneratedPage[] = [calculationPage(), apiPage(), symmetryPage(), comparisonPage(), hubPage(bySlug)];
  files.forEach(({ code, d26, d27 }, i) => {
    const near = [bySlug[(i + 1) % bySlug.length], bySlug[(i + bySlug.length - 1) % bySlug.length]].map((n) => ({ name: n.name, slug: n.slug }));
    pages.push(statePage(code, d26, d27, local[code] ?? 0, near));
  });

  const c = coverage().summary;
  const helpers: Helpers = {
    shell, esc, money, dollars, pct, exampleInput, exampleTable, CURL, federalFacts, wageBaseOf,
    states: files.map(({ code, d26, d27 }) => ({ code, name: d26.name as string, slug: slugOf(d26.name), d26, d27 })),
    cov: {
      localJurisdictions: c.localJurisdictions,
      statesWithLocalTax: c.statesWithLocalTax,
      localMinimumWage: c.localMinimumWage,
      topLocal: localSentence().top,
      statesListedInFull: coverage().states.filter((x: { localStatus: string }) => x.localStatus === 'listed').length,
    },
  };
  const first = topics(helpers);
  const defs = [...first, ...moreTopics(helpers)];
  const paths = new Set<string>();
  for (const d of defs) {
    if (paths.has(d.path)) throw new Error(`duplicate topic path ${d.path}`);
    paths.add(d.path);
  }
  pages.push(guidesHub(helpers, defs), ...defs.map((d) => topicPage(helpers, d, defs)), ...unemploymentPages(helpers), ...takeHomePages(helpers));
  return pages;
}

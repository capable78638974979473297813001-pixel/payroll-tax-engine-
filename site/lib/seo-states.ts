import { calculatePaycheck } from '../../src/calculate.ts';
import type { PaycheckInput } from '../../src/types.ts';
import type { Faq, GeneratedPage } from './seo-pages.ts';
import type { Helpers, StateRow } from './seo-topics.ts';
import { table } from './seo-topics.ts';

/**
 * Two families with one page per state, each holding numbers that differ state to state, so no page
 * is a reworded copy of another:
 *
 *   /unemployment-tax/<state>  the employer's unemployment tax: wage base, rate, the most a
 *                              single employee costs, where the state ranks, what the engine
 *                              returns for it.
 *   /take-home-pay/<state>     what a range of salaries takes home in the state, run through the
 *                              engine, single filer, no deductions, state tax only.
 */

const SALARIES = [30_000, 40_000, 50_000, 60_000, 75_000, 100_000, 125_000, 150_000, 200_000];
const PERIODS = 26;

function paycheck(h: Helpers, s: StateRow, annual: number) {
  const input = h.exampleInput(s.code, {}, Math.round((annual * 100) / PERIODS)) as PaycheckInput;
  try {
    const r = calculatePaycheck(input);
    const employeeTax = r.employeeTaxTotal;
    const federal = r.taxes.filter((t) => t.payer === 'employee' && t.jurisdiction === 'federal' && /FIT/.test(t.id)).reduce((n, t) => n + t.amount, 0);
    const fica = r.taxes.filter((t) => t.payer === 'employee' && /^US_(SS|MED)/.test(t.id)).reduce((n, t) => n + t.amount, 0);
    const stateTax = employeeTax - federal - fica;
    return { gross: r.grossPay, net: r.netPay, federal, fica, stateTax, employeeTax };
  } catch {
    return null;
  }
}

function shortLabel(raw: unknown, h: Helpers): number | undefined {
  return h.wageBaseOf(raw);
}

export function unemploymentPages(h: Helpers): GeneratedPage[] {
  const { money, dollars, pct, esc } = h;
  const withBase = h.states.map((s) => ({ s, base: shortLabel(s.d26.suiEmployer?.wageBase, h)! })).filter((x) => typeof x.base === 'number');
  const ranked = [...withBase].sort((a, b) => b.base - a.base || a.s.name.localeCompare(b.s.name));
  const rankOf = (code: string) => ranked.findIndex((x) => x.s.code === code) + 1;
  const pages: GeneratedPage[] = [];

  h.states.forEach((s, i) => {
    const sui = s.d26.suiEmployer ?? {};
    const base = shortLabel(sui.wageBase, h);
    const base27 = shortLabel(s.d27.suiEmployer?.wageBase, h);
    const rate: number | undefined = typeof sui.newEmployerRate === 'number' ? sui.newEmployerRate : undefined;
    const reduced = typeof sui.wageBase === 'object' ? (sui.wageBase as { qualifiedEmployer?: number }).qualifiedEmployer : undefined;
    const maxPerEmployee = base !== undefined && rate !== undefined ? Math.round(base * rate * 100) : undefined;
    const rank = base !== undefined ? rankOf(s.code) : undefined;
    const path = `/unemployment-tax/${s.slug}`;
    const eg = (() => {
      try { return calculatePaycheck(h.exampleInput(s.code, {}, 300_000)); } catch { return null; }
    })();
    const egLine = eg?.taxes.find((t) => t.payer === 'employer' && /SUI/.test(t.id));
    const near = [h.states[(i + 1) % h.states.length]!, h.states[(i + h.states.length - 1) % h.states.length]!];
    const futaCredit = '$42';
    const faq: Faq[] = [
      {
        q: `What is the unemployment tax wage base in ${s.name}?`,
        a: base !== undefined
          ? `${dollars(base)} for 2026${base27 && base27 !== base ? ` and ${dollars(base27)} for 2027` : ''} in Omnia.tax's rule files${reduced ? `, with a reduced base of ${dollars(reduced)} for qualifying employers` : ''}. ${s.name}'s state unemployment tax applies only to each employee's wages up to that amount in a year.`
          : `Omnia.tax has no wage base recorded for ${s.name}.`,
      },
      {
        q: `What unemployment tax rate does a new employer pay in ${s.name}?`,
        a: rate !== undefined
          ? `${pct(rate)} in Omnia.tax's 2026 rules, unless you send your own assigned rate in employer.stateUnemploymentRate. An established employer's rate is assigned by the state, so check your rate notice.`
          : `${s.name} does not publish a single new-employer rate in Omnia.tax's rules, so the engine produces no state unemployment line unless you send your assigned rate in employer.stateUnemploymentRate.`,
      },
      {
        q: `How much is the maximum state unemployment tax per employee in ${s.name}?`,
        a: maxPerEmployee !== undefined
          ? `At the new-employer rate of ${pct(rate!)}, up to ${money(maxPerEmployee)} per employee per year (${dollars(base!)} × ${pct(rate!)}). Your own rate changes that figure.`
          : `It depends on your assigned rate multiplied by the wage base of ${base !== undefined ? dollars(base) : 'the state'}, because ${s.name} does not publish a single new-employer rate.`,
      },
    ];
    const facts = [
      ['2026 state wage base', base !== undefined ? dollars(base) : 'Not recorded'],
      ['2027 state wage base', base27 !== undefined ? dollars(base27) : 'Not recorded'],
      ...(reduced ? [['Reduced base for qualifying employers', dollars(reduced)]] : []),
      ['New-employer rate (2026)', rate !== undefined ? pct(rate) : 'Assigned by the state'],
      ['Most per employee at the new-employer rate', maxPerEmployee !== undefined ? money(maxPerEmployee) : 'Depends on your assigned rate'],
      ['Federal FUTA per employee, with the normal credit', `${futaCredit} (0.6% of the first $7,000)`],
      ['Wage base rank among the 51', rank !== undefined ? `${rank} of ${ranked.length} (1 is the highest)` : 'n/a'],
    ];
    const body = `
    <p>${esc(s.name)}'s state unemployment tax (SUTA, also called SUI) is paid by the employer, on each employee's wages up to the state's wage base${base !== undefined ? `, which is ${dollars(base)} in 2026` : ''}. Once an employee's wages for the year pass the base, no more state unemployment tax is due on them.</p>
    <h2>${esc(s.name)} unemployment tax at a glance</h2>
    <div class="table-wrap"><table><tbody>${facts.map(([k, v]) => `<tr><th scope="row" style="text-align:left">${esc(k!)}</th><td>${esc(v!)}</td></tr>`).join('')}</tbody></table></div>
    ${
      egLine
        ? `<h2>What the engine returns</h2>
    <p>For a ${esc(s.name)} employee paid ${money(eg!.grossPay)} biweekly with no year-to-date wages, the engine's employer line for state unemployment reads: <em>${esc(egLine.detail ?? egLine.name)}</em> The amount is ${money(egLine.amount)}.</p>`
        : `<h2>What the engine returns</h2>
    <p>${esc(s.name)} does not publish a single new-employer rate, so the engine returns no state unemployment line for a bare request. Send your assigned rate in <code>employer.stateUnemploymentRate</code> and it returns the line.</p>`
    }
    <h2>Use your own rate</h2>
    <p>The new-employer rate is a starting point. After your first period the state assigns a rate from your experience, and it is on your rate notice. Send it and the engine uses it instead:</p>
    <div class="panel" style="margin-top:14px"><pre style="margin:0;padding:18px 22px;overflow:auto">${esc(`"employer": { "stateUnemploymentRate": { "${s.code}": 0.031 } }`)}</pre></div>
    <p class="fine">2026 rules from Omnia.tax's rule files, with 2027 figures that are already published; 2027 is provisional until the state publishes its own. Confirm against ${esc(s.name)}'s workforce agency before relying on a figure.</p>
    <h2>Related</h2>
    <p><a href="/payroll-tax/${s.slug}">${esc(s.name)} payroll tax</a> · <a href="/take-home-pay/${s.slug}">Take-home pay in ${esc(s.name)}</a> · <a href="/state-unemployment-tax-rates">All state unemployment rates</a> · <a href="/futa-suta-calculation">How FUTA and SUTA work</a>${near.map((n) => ` · <a href="/unemployment-tax/${n.slug}">${esc(n.name)}</a>`).join('')}</p>`;
    const title = `${s.name} unemployment tax: wage base, rate | Omnia.tax`;
    const description = `${s.name} SUTA: ${base !== undefined ? `${dollars(base)} wage base for 2026` : 'wage base'}${rate !== undefined ? `, ${pct(rate)} new-employer rate` : ', rate assigned by the state'}${maxPerEmployee !== undefined ? `, up to ${money(maxPerEmployee)} per employee` : ''}. How it is calculated and an API example.`;
    const h1 = `${s.name} unemployment tax: wage base and rate`;
    const breadcrumb = [{ name: 'Home', path: '/' }, { name: 'Unemployment tax by state', path: '/unemployment-tax' }, { name: s.name, path }];
    pages.push({
      path,
      file: `unemployment-tax/${s.slug}.html`,
      title: title.length > 70 ? `${s.name} unemployment tax rate | Omnia.tax` : title,
      description: description.length > 160 ? description.slice(0, 157).replace(/[ ,;]+\S*$/, '') + '...' : description,
      h1, faq, breadcrumb,
      html: h.shell({
        title: title.length > 70 ? `${s.name} unemployment tax rate | Omnia.tax` : title,
        description: description.length > 160 ? description.slice(0, 157).replace(/[ ,;]+\S*$/, '') + '...' : description,
        eyebrow: 'Unemployment tax by state', h1,
        sub: `What an employer pays in ${esc(s.name)}, from the same rule files the API uses.`,
        breadcrumb, body, faq,
      }),
    });
  });

  // hub
  const list = h.states.map((s) => {
    const b = shortLabel(s.d26.suiEmployer?.wageBase, h);
    const r = s.d26.suiEmployer?.newEmployerRate;
    return `<li><a href="/unemployment-tax/${s.slug}">${esc(s.name)}</a> <span class="fine">${b ? dollars(b) : ''}${typeof r === 'number' ? ` · ${pct(r)}` : ''}</span></li>`;
  }).join('');
  const faq: Faq[] = [
    { q: 'Where can I find my state unemployment tax rate?', a: 'On the rate notice your state workforce agency sends an established employer. A new employer pays the state\'s new-employer rate until it has an experience-based rate. Each state page here shows the wage base and the new-employer rate in Omnia.tax\'s rules.' },
  ];
  const body = `
    <p>Pick a state for its unemployment tax wage base, new-employer rate, the most one employee can cost, and what the engine returns. For the whole table at once see <a href="/state-unemployment-tax-rates">state unemployment tax rates</a>; for how FUTA and SUTA are calculated see <a href="/futa-suta-calculation">the calculation guide</a>.</p>
    <ul style="columns:2;column-gap:32px;list-style:none;padding:0;line-height:30px">${list}</ul>`;
  const breadcrumb = [{ name: 'Home', path: '/' }, { name: 'Unemployment tax by state', path: '/unemployment-tax' }];
  const title = 'Unemployment tax by state: SUTA wage bases and rates | Omnia.tax';
  const description = 'State unemployment tax (SUTA) for all 50 states and DC: wage base, new-employer rate, the most per employee, and how the engine calculates it.';
  pages.unshift({
    path: '/unemployment-tax', file: 'unemployment-tax.html', title, description,
    h1: 'Unemployment tax by state', faq, breadcrumb,
    html: h.shell({ title, description, eyebrow: 'States', h1: 'Unemployment tax by state', sub: 'The 50 states and DC, with the wage base and rate an employer needs.', breadcrumb, body, faq }),
  });
  return pages;
}

export function takeHomePages(h: Helpers): GeneratedPage[] {
  const { money, dollars, pct, esc } = h;
  const pages: GeneratedPage[] = [];
  h.states.forEach((s, i) => {
    const path = `/take-home-pay/${s.slug}`;
    const rows = SALARIES.map((annual) => ({ annual, r: paycheck(h, s, annual) })).filter((x): x is { annual: number; r: NonNullable<ReturnType<typeof paycheck>> } => x.r !== null);
    const noTax = s.d26.method === 'no_income_tax';
    const get = (annual: number) => rows.find((x) => x.annual === annual)!;
    const r75 = get(75_000);
    const r100 = get(100_000);
    const annualNet = (x: { r: { net: number } }) => x.r.net * PERIODS;
    const pctOf = (part: number, whole: number) => `${((part / whole) * 100).toFixed(1)}%`;
    const near = [h.states[(i + 1) % h.states.length]!, h.states[(i + h.states.length - 1) % h.states.length]!];
    const method = noTax ? `${s.name} does not tax wages, so the only taxes on the paycheck are federal income tax and FICA.` : typeof s.d26.flatRate?.rate === 'number' ? `${s.name} taxes wages at a flat ${pct(s.d26.flatRate.rate)}.` : `${s.name} withholds from its own tables or formula, so the state column rises with pay.`;
    const faq: Faq[] = [
      {
        q: `How much is take-home pay on a $75,000 salary in ${s.name}?`,
        a: `About ${money(r75.r.net)} per biweekly paycheck, or ${money(annualNet(r75))} over 26 paychecks, for a single filer with no deductions, using Omnia.tax's 2026 rules. That is ${money(r75.r.employeeTax)} of tax per paycheck: ${money(r75.r.federal)} federal income tax, ${money(r75.r.fica)} Social Security and Medicare, and ${money(r75.r.stateTax)} ${s.name} tax.`,
      },
      {
        q: `How much is take-home pay on $100,000 in ${s.name}?`,
        a: `About ${money(r100.r.net)} per biweekly paycheck, or ${money(annualNet(r100))} over 26 paychecks, for a single filer with no deductions. Employee taxes are ${pctOf(r100.r.employeeTax, r100.r.gross)} of gross.`,
      },
      {
        q: `Does ${s.name} have a state income tax on wages?`,
        a: noTax ? `No. ${s.name} does not tax wages in Omnia.tax's 2026 rules.` : typeof s.d26.flatRate?.rate === 'number' ? `Yes, a flat ${pct(s.d26.flatRate.rate)} in Omnia.tax's 2026 rules, applied after the state's allowances and deductions.` : `Yes. ${s.name} withholds income tax from its own published tables or formula.`,
      },
    ];
    const body = `
    <p>${esc(method)} The table is the engine's own result for a single filer paid biweekly with no pre-tax deductions, no allowances and no local tax, check dated 2026-09-15. Federal income tax is the employee's W-4 result; "State" is ${esc(s.name)} income tax and any state-level employee contribution such as paid leave or disability.</p>
    <h2>Take-home pay in ${esc(s.name)} by salary</h2>
    ${table(h, ['Salary', 'Gross per paycheck', 'Federal tax', 'Social Security and Medicare', `${s.name} tax`, 'Net per paycheck', 'Net per year (× 26)'], rows.map((x) => [dollars(x.annual), money(x.r.gross), money(x.r.federal), money(x.r.fica), money(x.r.stateTax), `<strong>${money(x.r.net)}</strong>`, money(annualNet(x))]), 1)}
    <p class="fine">Net per year is the biweekly net times 26; a leap-year calendar can have 27 paychecks. Local income taxes, a W-4 with dependents or extra withholding, and pre-tax deductions all change the result. Run your own case in the <a href="/sandbox">paycheck calculator</a>.</p>
    <h2>How it compares</h2>
    <p>On ${dollars(75_000)}, employee taxes in ${esc(s.name)} are ${pctOf(r75.r.employeeTax, r75.r.gross)} of gross pay, and ${pctOf(r100.r.employeeTax, r100.r.gross)} on ${dollars(100_000)}. Of the ${dollars(75_000)} case, ${pctOf(r75.r.stateTax, r75.r.gross)} is ${esc(s.name)} tax and ${pctOf(r75.r.federal, r75.r.gross)} is federal income tax.</p>
    <h2>For employers</h2>
    <p>These are the employee's side. The employer pays more on top: see <a href="/payroll-tax/${s.slug}">${esc(s.name)} payroll tax</a> and <a href="/unemployment-tax/${s.slug}">${esc(s.name)} unemployment tax</a>. To get these numbers from your own software, use the <a href="/paycheck-calculator-api">paycheck calculator API</a>.</p>
    <p><a href="/take-home-pay">Take-home pay by state</a>${near.map((n) => ` · <a href="/take-home-pay/${n.slug}">${esc(n.name)}</a>`).join('')}</p>`;
    const title = `Take-home pay in ${s.name}: $30k to $200k salaries | Omnia.tax`;
    const description = `What a salary takes home in ${s.name} for 2026: $75,000 nets ${money(annualNet(r75))} a year, $100,000 nets ${money(annualNet(r100))}. Federal, FICA and state tax from the engine.`;
    const h1 = `Take-home pay in ${s.name}`;
    const breadcrumb = [{ name: 'Home', path: '/' }, { name: 'Take-home pay by state', path: '/take-home-pay' }, { name: s.name, path }];
    const t = title.length > 70 ? `Take-home pay in ${s.name} by salary | Omnia.tax` : title;
    const d = description.length > 160 ? description.slice(0, 157).replace(/[ ,;]+\S*$/, '') + '...' : description;
    pages.push({
      path, file: `take-home-pay/${s.slug}.html`, title: t, description: d, h1, faq, breadcrumb,
      html: h.shell({ title: t, description: d, eyebrow: 'Take-home pay by state', h1, sub: `What nine salaries take home in ${esc(s.name)}, calculated by the same engine the API uses.`, breadcrumb, body, faq }),
    });
  });

  const rows75 = h.states.map((s) => ({ s, r: paycheck(h, s, 75_000) })).filter((x): x is { s: StateRow; r: NonNullable<ReturnType<typeof paycheck>> } => x.r !== null);
  const sorted = [...rows75].sort((a, b) => b.r.net - a.r.net);
  const list = sorted.map((x) => `<tr><td><a href="/take-home-pay/${x.s.slug}">${esc(x.s.name)}</a></td><td style="text-align:right">${money(x.r.net)}</td><td style="text-align:right">${money(x.r.net * PERIODS)}</td><td style="text-align:right">${money(x.r.stateTax)}</td></tr>`).join('');
  const best = sorted[0]!;
  const worst = sorted[sorted.length - 1]!;
  const faq: Faq[] = [
    { q: 'Which state has the highest take-home pay?', a: `For a single filer on $75,000 paid biweekly with no deductions, ${best.s.name} takes home the most in Omnia.tax's 2026 rules at ${money(best.r.net * PERIODS)} a year, and ${worst.s.name} the least at ${money(worst.r.net * PERIODS)}. State income tax is only part of it: local taxes and paid-leave contributions also differ.` },
  ];
  const body = `
    <p>What a $75,000 salary takes home in each state, highest first, for a single filer paid biweekly with no deductions, from the same engine that powers the API. Click a state for nine salaries from $30,000 to $200,000.</p>
    <div class="table-wrap"><table><thead><tr><th>State</th><th style="text-align:right">Net per paycheck</th><th style="text-align:right">Net per year (× 26)</th><th style="text-align:right">State tax per paycheck</th></tr></thead><tbody>${list}</tbody></table></div>
    <p class="fine">State-level taxes only; local income taxes are not included. Run your own case in the <a href="/sandbox">paycheck calculator</a>.</p>`;
  const breadcrumb = [{ name: 'Home', path: '/' }, { name: 'Take-home pay by state', path: '/take-home-pay' }];
  const title = 'Take-home pay by state: what a salary nets in 2026 | Omnia.tax';
  const description = 'What $75,000 takes home in all 50 states and DC for 2026, ranked, with a page per state for nine salaries. Federal, FICA and state tax from the engine.';
  pages.unshift({
    path: '/take-home-pay', file: 'take-home-pay.html', title, description, h1: 'Take-home pay by state', faq, breadcrumb,
    html: h.shell({ title, description, eyebrow: 'States', h1: 'Take-home pay by state', sub: 'A salary nets different amounts in different states. Here is how much, from the engine.', breadcrumb, body, faq }),
  });
  return pages;
}

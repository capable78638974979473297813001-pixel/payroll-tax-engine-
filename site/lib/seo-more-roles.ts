import type { PaycheckInput } from '../../src/types.ts';
import { def, inp, line, p, ul, kv, code, run, taxTable, pick, W4, type Helpers, type TopicDef } from './seo-more-kit.ts';

/** Who the engine is for, and how to choose one: the buyer-side intents. */
export function roleTopics(h: Helpers): TopicDef[] {
  const { money, dollars, pct } = h;
  const f = h.federalFacts();
  const L: TopicDef[] = [];
  const add = (t: TopicDef) => L.push(t);
  const base = (state = 'TX', cert: Record<string, unknown> = {}, gross = 300_000, extra: Record<string, unknown> = {}) =>
    ({ ...inp(h, state, cert, gross), federalW4: { ...W4 }, ...extra }) as PaycheckInput;
  const tx = run(base('TX'));
  const ca = run(base('CA'));
  const oh = run(base('OH', { residenceCity: 'Columbus', workCity: 'Columbus' }));

  // ---- Who it is for ---------------------------------------------------------------------------
  add(def({
    path: '/payroll-tax-calculator-for-accountants', label: 'Payroll tax calculator for accountants', group: 'Who it is for',
    title: "Payroll tax calculator for accountants and CPAs",
    description: "A payroll tax calculator for accountants and CPAs: rerun a client's paycheck, see each line explained, compare two scenarios and cite the method.",
    h1: 'Payroll tax calculator for accountants',
    sub: 'Check a client\'s payroll without rebuilding their rules in a spreadsheet.',
    lead: p(`Accountants meet payroll mostly as a question: is this withholding right, what will this hire cost, why did this quarter's liability move. A calculator that shows each line with the method behind it answers those quickly. The Omnia.tax <a href="/sandbox">calculator</a> runs the same engine as the API, so a number you check by hand is the number your client's software would get.`),
    sections: [
      ['What accountants use it for', ul([
        '<strong>Spot-checking a client\'s payroll provider.</strong> Rerun a paycheck with the same inputs and compare line by line. See <a href="/payroll-tax-audit-withholding-check">the audit method</a>.',
        '<strong>Planning.</strong> What does a raise, a bonus or a move cost the employee and the employer? The <a href="/compare-two-paychecks-api">compare</a> function explains the difference step by step.',
        '<strong>Onboarding a client.</strong> Their first payroll in a new state: which lines should appear, which certificate is needed.',
        '<strong>Quarter-end questions.</strong> Why a state unemployment liability is high in the first quarter: the wage base resets each January.',
      ])],
      ['A worked check', p(`A client's employee in Columbus, Ohio is paid ${money(300_000)} biweekly. The engine returns federal income tax of ${money(line(oh, 'US_FIT')!.amount)}, Ohio income tax of ${money(line(oh, 'OH_SIT')!.amount)}, Columbus city tax of ${money(line(oh, 'OH_LOCAL')!.amount)}, Social Security of ${money(line(oh, 'US_SS_EE')!.amount)} and Medicare of ${money(line(oh, 'US_MED_EE')!.amount)}, for net pay of ${money(oh.netPay)}. Each line has a sentence you can quote in a workpaper.`)],
      ['What it does not replace', ul([
        'Professional judgement about worker classification, taxability of a particular payment or exempt status.',
        'Filing and deposits, which the engine does not do.',
        'The agency\'s own publications, which remain the authority. Each state page links the withholding guide it was read from.',
      ])],
      ['Free to try', p(`A <a href="/payroll-tax-api-test-keys">test key</a> costs nothing; the calculator is open once you sign in. No developer is needed to use the calculator.`)],
    ],
    faq: [
      { q: 'Can an accountant use the calculator without coding?', a: 'Yes. The browser calculator takes an address or state, pay, a Form W-4 and deductions and shows every tax line with an explanation. No API key or code is needed once you are signed in.' },
      { q: 'Is it a substitute for the payroll provider?', a: 'No. It calculates withholding and employer taxes to check or plan. It does not run payroll, file returns or deposit tax.' },
    ],
    related: ['/payroll-tax-audit-withholding-check', '/payroll-tax-calculator-for-bookkeepers', '/compare-two-paychecks-api', '/sandbox'],
  }));

  add(def({
    path: '/payroll-tax-calculator-for-bookkeepers', label: 'Payroll tax calculator for bookkeepers', group: 'Who it is for',
    title: "Payroll tax calculator for bookkeepers: book a check",
    description: 'A payroll tax calculator for bookkeepers: see which lines are employee-paid and employer-paid, so a paycheck splits cleanly into expense and liability entries.',
    h1: 'Payroll tax calculator for bookkeepers',
    sub: 'The numbers you need to book a paycheck, already separated.',
    lead: p(`A bookkeeper's job with a paycheck is to split it: wages expense, payroll tax expense, payroll liabilities, net pay to the bank. That needs every tax line labelled by who pays it. The engine returns exactly that, so the entries follow from the response instead of from a rate sheet.`),
    sections: [
      ['From response to entries', (() => {
        const rows = [
          ['Debit', 'Wages expense', money(tx.grossPay)],
          ['Debit', 'Employer payroll tax expense', money(tx.employerTaxTotal)],
          ['Credit', 'Employee taxes withheld (liability)', money(tx.employeeTaxTotal)],
          ['Credit', 'Employer payroll taxes payable (liability)', money(tx.employerTaxTotal)],
          ['Credit', 'Cash, net pay', money(tx.netPay)],
        ];
        return p(`For a ${money(tx.grossPay)} check in Texas with no deductions:`) + kv(h, ['', 'Account', 'Amount'], rows).replace(/text-align:left/g, 'text-align:left') + p(`Debits are ${money(tx.grossPay + tx.employerTaxTotal)} and credits are ${money(tx.employeeTaxTotal + tx.employerTaxTotal + tx.netPay)}. They balance because <code>netPay = grossPay − employeeTaxTotal</code> when there are no deductions.`);
      })()],
      ['Lines worth their own accounts', taxTable(h, tx) + p('Separate liability accounts for federal income tax, Social Security and Medicare, and unemployment tax make the quarterly returns easier to tie out.')],
      ['Deductions', ul([
        'Pre-tax benefits (health premiums, HSA) reduce taxable wages and go to a liability for the plan.',
        '401(k) deferrals reduce income tax wages only and go to a plan liability.',
        'Garnishments and other post-tax deductions are liabilities until paid over.',
      ])],
      ['A boundary', p(`The engine gives the amounts. Chart-of-accounts choices, remittance timing and filing are yours or your payroll provider's. See <a href="/true-cost-of-an-employee">the true cost of an employee</a> for the employer side.`)],
    ],
    faq: [
      { q: 'How do I book a paycheck from the tax lines?', a: 'Debit wages expense for gross pay and employer payroll tax expense for the employer lines; credit liabilities for the employee and employer taxes and cash for net pay. The payer field on each line says which side owes it.' },
      { q: 'Do employer taxes reduce net pay?', a: 'No. They are an additional cost to the employer and are not taken from the employee.' },
    ],
    related: ['/employee-vs-employer-payroll-taxes', '/true-cost-of-an-employee', '/payroll-tax-calculator-for-accountants', '/post-tax-deductions-net-pay'],
  }));

  add(def({
    path: '/payroll-tax-calculator-for-small-business', label: 'Payroll tax calculator for small business', group: 'Who it is for',
    title: 'Payroll tax calculator for small business owners',
    description: "A payroll tax calculator for small business owners: what a paycheck costs you and the employee, the employer taxes, and what to check before a first hire.",
    h1: 'Payroll tax calculator for small business owners',
    sub: 'What you pay on top of wages, and what the employee takes home.',
    lead: p(`If you run a small business and are about to pay someone, two numbers matter: what they take home and what it costs you. Both depend on where the work is done. This calculator gives both for one paycheck, with the lines named, so you can plan a hire or sanity-check your payroll provider.`),
    sections: [
      ['One hire, three places', (() => {
        const row = (n: string, r: ReturnType<typeof run>) => [n, money(r.grossPay), money(r.netPay), money(r.employerTaxTotal), money(r.grossPay + r.employerTaxTotal)];
        return kv(h, ['Where', 'Wages', 'Employee takes home', 'You pay in employer taxes', 'Your cost'], [row('Texas', tx), row('California', ca), row('Columbus, Ohio', oh)]).replace(/text-align:left/g, 'text-align:right') + p(`Same ${money(300_000)} biweekly check. Your cost differs by ${money(Math.abs(ca.employerTaxTotal - tx.employerTaxTotal))} between Texas and California because of state unemployment and other employer lines.`);
      })()],
      ['Before the first hire', ul([
        'Register as an employer with the IRS and the state unemployment agency. The calculator does not do this.',
        'Get a Form W-4 and any state withholding certificate from the employee.',
        'Know where the work is done: it decides state and local tax.',
        'Decide how you will deposit tax and file returns, or choose a provider that does.',
      ])],
      ['What the calculator will not do', p(`It calculates. It does not register your business, run payroll, file or deposit. Small employers usually use a payroll service for those and a calculator to check it or to plan. See <a href="/first-employee-payroll-taxes">taxes on your first employee</a>.`)],
    ],
    faq: [
      { q: 'How much does an employee cost on top of wages?', a: 'The employer pays about 7.65% for Social Security and Medicare up to the Social Security wage base, plus federal and state unemployment tax early in the year and any state paid-leave contributions. The calculator shows the exact lines.' },
      { q: 'Do I need an API?', a: 'No. The browser calculator is enough for planning and checking. The API is for software that calculates paychecks automatically.' },
    ],
    related: ['/first-employee-payroll-taxes', '/true-cost-of-an-employee', '/employer-payroll-tax-calculator', '/sandbox'],
  }));

  add(def({
    path: '/first-employee-payroll-taxes', label: 'Payroll taxes on your first employee', group: 'Who it is for',
    title: 'Payroll taxes on your first employee: what to expect',
    description: 'What changes when you hire your first employee: the taxes withheld, the taxes you pay on top, the forms to collect and a worked first paycheck.',
    h1: 'Payroll taxes on your first employee',
    sub: 'A first paycheck, line by line.',
    lead: p(`Hiring your first employee turns you into a withholding agent. You withhold some tax from their pay, pay some of your own on top, and hand both to the government on a schedule. The amounts are easier to understand from one example than from a list of rules.`),
    sections: [
      ['A first paycheck', taxTable(h, tx) + p(`The employee is single, paid ${money(tx.grossPay)} biweekly in Texas. They take home ${money(tx.netPay)}. You owe ${money(tx.employerTaxTotal)} on top: ${tx.taxes.filter((t) => t.payer === 'employer' && t.amount > 0).map((t) => `${h.esc(t.name)} ${money(t.amount)}`).join(', ')}.`)],
      ['What to collect', kv(h, ['Document', 'Why'], [
        ['Form W-4', 'Federal income tax withholding.'],
        ['Form I-9', 'Employment eligibility; kept by you, not filed.'],
        ['State withholding certificate', 'Where the state has one.'],
        ['Home address and work address', 'Local tax and reciprocity.'],
      ])],
      ['The employer side', p(`Employer Social Security and Medicare each match the employee's. FUTA is ${money(1800)} on this check at the start of the year because it applies to the first ${dollars(7_000)} of each employee's pay. State unemployment tax is the largest early cost in most states; see <a href="/suta-wage-base-by-state-ranked">wage bases by state</a>.`)],
      ['Then what', ul([
        'Deposit withheld and employer tax on the schedule the IRS and your state assign.',
        'File quarterly and annual returns and issue a Form W-2 after year end.',
        'Keep payroll records for the periods the law requires.',
      ]) + p(`The calculator does none of these. A payroll service does, and the calculator checks its work.`)],
    ],
    faq: [
      { q: 'What taxes do I withhold from my first employee?', a: 'Federal income tax from their Form W-4, the employee share of Social Security and Medicare, and state and local income tax where they apply, plus any state employee contributions.' },
      { q: 'What do I pay on top?', a: 'The employer match of Social Security and Medicare, federal unemployment tax, state unemployment tax, and in some states paid-leave contributions.' },
    ],
    related: ['/payroll-tax-calculator-for-small-business', '/true-cost-of-an-employee', '/employee-vs-employer-payroll-taxes', '/futa-suta-calculation'],
  }));

  add(def({
    path: '/payroll-tax-calculator-for-hr-managers', label: 'Payroll tax calculator for HR managers', group: 'Who it is for',
    title: "Payroll tax calculator for HR managers: offers, moves",
    description: 'A payroll tax calculator for HR managers: show candidates take-home pay, model a raise or relocation, and see what a role costs including employer taxes.',
    h1: 'Payroll tax calculator for HR managers',
    sub: 'Answer "what will I take home?" and "what does this cost us?" with one tool.',
    lead: p(`HR gets two kinds of money questions: from candidates and employees ("what will I take home?") and from finance ("what does this role cost?"). Both are payroll tax calculations, and doing them by rule of thumb gives answers that are wrong by different amounts in different states.`),
    sections: [
      ['A relocation question', p(`An employee on ${money(300_000)} biweekly asks what a move from Texas to California does to their check. Net pay would go from ${money(tx.netPay)} to ${money(ca.netPay)}, a drop of ${money(tx.netPay - ca.netPay)} per check. The <a href="/relocation-paycheck-comparison">comparison</a> shows which lines account for it.`)],
      ['An offer question', p(`A candidate in Columbus, Ohio asks what ${money(300_000)} biweekly nets. Answer: ${money(oh.netPay)}, after federal income tax, Ohio tax, Columbus city tax, Social Security and Medicare. State the assumption (single, no deductions) and offer to rerun with their details.`)],
      ['A cost question', p(`Finance asks what the role costs. The Columbus check costs you ${money(oh.grossPay + oh.employerTaxTotal)}: gross plus ${money(oh.employerTaxTotal)} of employer taxes, before benefits and overhead.`)],
      ['Good practice', ul([
        'Say the assumptions: filing status, deductions, location.',
        'Use an estimate language: withholding follows the employee\'s W-4, and the final tax is settled on the return.',
        'Do not promise a number the engine did not return.',
        'Keep personal data out of the tool; you do not need names to calculate.',
      ])],
    ],
    faq: [
      { q: 'Can HR share a take-home estimate with a candidate?', a: 'Yes, as an estimate. State the assumptions (filing status, deductions, work location), because the real withholding follows the employee\'s own W-4.' },
      { q: 'Does the calculator need personal data?', a: 'No. It needs pay, location and withholding choices, not a name or an identifier.' },
    ],
    related: ['/payroll-tax-api-for-hr-software', '/relocation-paycheck-comparison', '/salary-to-take-home-pay', '/true-cost-of-an-employee'],
  }));

  const rem = run({ ...base('PA', { workPSD: '510101', residencePSD: '880000' }), residenceState: { code: 'NJ', certificate: {} } } as PaycheckInput);
  add(def({
    path: '/remote-employee-payroll-tax-different-state', label: 'Remote employee in a different state', group: 'Who it is for',
    title: "Remote employee payroll tax: working from another state",
    description: 'Which state taxes a remote employee: the work state, the home state and reciprocity, with a worked New Jersey resident working in Pennsylvania check.',
    h1: 'Remote employee payroll tax in a different state',
    sub: 'Two states, one paycheck, and rules about which one withholds.',
    lead: p(`When an employee works in one state and lives in another, the question is which state's income tax is withheld. The default is the state where the work is done. The employee's home state may tax the same wages too, usually with a credit on the return. Some pairs of states have reciprocity agreements that change the answer. Remote work makes this common.`),
    sections: [
      ['A New Jersey resident working in Pennsylvania', p(`The engine is given the work state (Pennsylvania, with a district) and the residence state (New Jersey). Pennsylvania and New Jersey have a reciprocal agreement, so the employer withholds for the state of residence and not for Pennsylvania. The state lines on a ${money(300_000)} check:`) + pick(h, rem, rem.taxes.filter((t) => t.payer === 'employee' && !t.id.startsWith('US_') && t.amount > 0).map((t) => t.id)) + p(`Total employee tax is ${money(rem.employeeTaxTotal)} and net pay ${money(rem.netPay)}. Read the detail on each line to see which state's rule produced it.`)],
      ['Questions to settle for every remote employee', ul([
        'Where is the work physically done on each day? Some states tax by days worked in the state.',
        'Is there a reciprocity agreement between the work and home states? See <a href="/payroll-tax-reciprocity-agreements">reciprocity</a>.',
        'Did the employee file the work state\'s nonresident certificate, or the home state\'s exemption form?',
        'Does the employer have a registration obligation in the employee\'s home state?',
      ])],
      ['What the engine needs', code(h, `"workState": { "code": "PA", "certificate": { … } },
"residenceState": { "code": "NJ", "certificate": { … } }`) + p(`Send both. For rules that depend on days worked, the certificate has a field for it. See <a href="/multi-state-payroll-tax-calculation">multi-state calculation</a>.`)],
      ['Not legal advice', p(`Nexus and registration rules for remote employees are a legal and tax-planning matter. The engine applies withholding rules to the facts you give it and does not decide where an employer must register.`)],
    ],
    faq: [
      { q: 'Which state do I withhold for a remote employee?', a: 'Usually the state where the work is done, unless a reciprocity agreement or the home state\'s rules say otherwise. The employee\'s home state may also tax the wages, with a credit on the return.' },
      { q: 'Do I have to register in the employee\'s home state?', a: 'That is a question of employer nexus and registration, which depends on the state. The engine does not decide it.' },
    ],
    related: ['/multi-state-payroll-tax-calculation', '/payroll-tax-reciprocity-agreements', '/nonresident-employee-state-withholding', '/payroll-tax-api-for-staffing-agencies'],
  }));

  add(def({
    path: '/nonresident-employee-state-withholding', label: 'Nonresident employee state withholding', group: 'Who it is for',
    title: 'Nonresident employee state withholding: rules and examples',
    description: 'How states withhold income tax from nonresident employees: work-state withholding, reciprocity exemptions, day-count thresholds and a worked check.',
    h1: 'Nonresident employee state withholding',
    sub: 'Working in a state you do not live in.',
    lead: p(`A nonresident employee earns wages in a state where they do not live. In general the work state may tax those wages, and the employer withholds. States differ on the details: some exempt short stays, some have reciprocity with neighbours so only the home state taxes, and some use their own nonresident rates. The engine carries each state's rule.`),
    sections: [
      ['Reciprocal states', (() => {
        const rec = h.states.filter((s) => Array.isArray(s.d26.reciprocity?.reciprocalStates) && s.d26.reciprocity.reciprocalStates.length > 0);
        return p(`${rec.length} states list reciprocal partners in the engine's rule files. For an employee covered by an agreement, the work state withholds nothing when the employee gives the right exemption form; the home state taxes the wages instead.`) + kv(h, ['State', 'Reciprocal with'], rec.slice(0, 12).map((s) => [`<a href="/payroll-tax/${s.slug}">${h.esc(s.name)}</a>`, h.esc(s.d26.reciprocity.reciprocalStates.join(', '))])) + p(`The full list is on <a href="/payroll-tax-reciprocity-agreements">payroll tax reciprocity agreements</a>.`);
      })()],
      ['A worked case', p(`New York resident status changes which line appears: an employee who works in New York but lives in New Jersey is a nonresident for New York. Compare an employee who lives in the state with one who does not, with the same pay. Differences show in <code>NY_SIT</code> and in which city lines apply.`)],
      ['Day-count rules', p(`Some states do not tax a nonresident until they have worked more than a set number of days there; the certificate has a field for days worked, which the engine reads. The employer or the employee supplies it.`)],
      ['Maryland as an example', p(`Maryland nonresidents pay a special local rate instead of a county rate, shown in the <a href="/maryland-county-income-tax-withholding">Maryland county tax</a> example. Other states use separate nonresident tables or a flat nonresident rate.`)],
    ],
    faq: [
      { q: 'Does a nonresident pay state tax where they work?', a: 'Generally yes: the work state may tax wages earned there, and the employer withholds, unless a reciprocity agreement or a short-stay rule exempts the employee.' },
      { q: 'What is a reciprocity agreement?', a: 'An agreement between two states under which an employee who lives in one and works in the other pays income tax only to the home state, usually by giving the employer an exemption form.' },
    ],
    related: ['/payroll-tax-reciprocity-agreements', '/remote-employee-payroll-tax-different-state', '/multi-state-payroll-tax-calculation', '/maryland-county-income-tax-withholding'],
  }));

  add(def({
    path: '/payroll-tax-api-vs-spreadsheet', label: 'Payroll tax API vs spreadsheet', group: 'Who it is for',
    title: "Payroll tax API vs spreadsheet: where a sheet stops",
    description: 'A spreadsheet can calculate a paycheck until local tax, year-to-date caps and rule changes arrive. Where the line is, with a worked example, and when to switch.',
    h1: 'Payroll tax API vs spreadsheet',
    sub: 'A spreadsheet is fine until it is not. Here is where it stops.',
    lead: p(`Plenty of small payrolls run on a spreadsheet, and for one employee in a state with no income tax it works. The trouble arrives in predictable places. Here is where a spreadsheet gets expensive to keep correct, using the same ${money(300_000)} paycheck throughout.`),
    sections: [
      ['Where it works', p(`Texas, one employee, ${money(300_000)} biweekly: Social Security ${pct(f.ssRate)}, Medicare ${pct(f.medicare)}, and federal income tax from the IRS table. The spreadsheet can reproduce the engine's ${money(tx.netPay)}. The federal table is the hard part even here: ${h.esc(line(tx, 'US_FIT')!.detail ?? '')}.`)],
      ['Where it starts to hurt', kv(h, ['Situation', 'What the spreadsheet needs'], [
        ['A state with brackets', 'The state\'s annualisation formula, which is not the federal one.'],
        ['A city tax', `A lookup by work and home address. The Columbus check has an extra ${money(line(oh, 'OH_LOCAL')!.amount)} line.`],
        ['A year-to-date cap', `A running total per employee for Social Security (${dollars(f.ssBase26)}), Medicare and unemployment.`],
        ['A state paid-leave program', 'A rate, a cap and an employer-employee split, per state, per year.'],
        ['A change in January', 'Someone to find every new rate and edit every formula.'],
        ['A correction for last year', 'Last year\'s tables kept alongside this year\'s.'],
      ]).replace(/text-align:left/g, 'text-align:left')],
      ['The switch', p(`A common path is to keep the spreadsheet for the layout and call the API from it for the calculation: see <a href="/payroll-tax-api-google-sheets">calling the API from Google Sheets</a>. You keep your template and lose the maintenance.`)],
      ['What a spreadsheet does better', ul(['It is transparent: everyone can read the cell.', 'It costs nothing for one employee.', 'It needs no integration.'])],
    ],
    faq: [
      { q: 'Can I run payroll taxes in a spreadsheet?', a: 'For one employee in a no-income-tax state, yes. It gets expensive with state brackets, local tax, year-to-date caps, paid-leave programs and annual changes.' },
      { q: 'Can I use the API from a spreadsheet?', a: 'Yes, with a script that posts the paycheck and writes the result into cells. See the Google Sheets example.' },
    ],
    related: ['/payroll-tax-api-google-sheets', '/build-vs-buy-payroll-tax-engine', '/payroll-tax-calculator-for-small-business', '/paycheck-calculation-formula'],
  }));

  add(def({
    path: '/payroll-tax-api-google-sheets', label: 'Payroll tax API in Google Sheets', group: 'Who it is for',
    title: 'Payroll tax API in Google Sheets with Apps Script',
    description: 'Call a payroll tax API from Google Sheets with Apps Script: a custom function that posts a paycheck and returns net pay, with the key stored outside the sheet.',
    h1: 'Payroll tax API in Google Sheets',
    sub: 'A custom function that returns net pay for a row.',
    lead: p(`Google Apps Script can call any HTTPS API with <code>UrlFetchApp</code>, so a sheet can use the Omnia.tax engine for the calculation while you keep your own layout. The key must not live in a cell: store it in Script Properties.`),
    sections: [
      ['The script', code(h, `function NETPAY(state, grossDollars) {
  const key = PropertiesService.getScriptProperties().getProperty("OMNIA_KEY");
  const body = {
    checkDate: "2026-09-15",
    payFrequency: "biweekly",
    earnings: [{ code: "REG", category: "regular", amount: Math.round(grossDollars * 100) }],
    deductions: [],
    federalW4: { filingStatus: "single", multipleJobs: false,
      dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
    ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
    workState: { code: state, certificate: {} },
  };
  const res = UrlFetchApp.fetch("https://api.omnia.tax/v1/paycheck", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + key },
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) return "error " + res.getResponseCode();
  return JSON.parse(res.getContentText()).result.netPay / 100;
}`)],
      ['Use it', p(`In a cell: <code>=NETPAY("TX", 3000)</code>. For the Texas example it returns <strong>${(tx.netPay / 100).toFixed(2)}</strong>. <code>=NETPAY("CA", 3000)</code> returns <strong>${(ca.netPay / 100).toFixed(2)}</strong>.`)],
      ['Cautions', ul([
        'A custom function runs again whenever the sheet recalculates, and each run is a call. Use a test key while you build; a live key bills per calculation.',
        'Apps Script has daily limits on URL fetches. A large payroll belongs in a real integration.',
        'Store the key under Project Settings, Script Properties. Do not put it in a cell or share it with the sheet.',
        'Convert dollars to cents with rounding at the edge, as the script does.',
      ])],
      ['Beyond one number', p(`Return the whole response into a range, or one line at a time, by reading <code>result.taxes</code>. See <a href="/payroll-tax-api-response-fields">the response fields</a>.`)],
    ],
    faq: [
      { q: 'Can Google Sheets call a payroll tax API?', a: 'Yes. Apps Script can post JSON to the API with UrlFetchApp and return a value to a cell through a custom function.' },
      { q: 'Where should I keep the API key?', a: 'In Script Properties, never in a cell. Anyone with access to the sheet could read a key stored in it.' },
    ],
    related: ['/payroll-tax-api-vs-spreadsheet', '/payroll-tax-api-javascript-example', '/payroll-tax-api-test-keys', '/payroll-tax-api-response-fields'],
  }));

  add(def({
    path: '/payroll-tax-glossary', label: 'Payroll tax glossary', group: 'Who it is for',
    title: 'Payroll tax glossary: FIT, FICA, FUTA, SUTA, SDI and more',
    description: 'A plain glossary of payroll tax terms: FIT, FICA, FUTA, SUTA, SDI, PFML, W-4, wage base, supplemental wages, imputed income, gross-to-net and more.',
    h1: 'Payroll tax glossary',
    sub: 'The abbreviations on a pay stub and in the API, in plain words.',
    lead: p(`Payroll is full of abbreviations that mean one narrow thing. This glossary covers the ones that appear on a pay stub and in the Omnia.tax API's tax line ids, with a pointer to the page that explains each in depth.`),
    sections: [
      ['Taxes', kv(h, ['Term', 'Meaning'], [
        ['FIT', `Federal income tax withholding, from the employee's Form W-4. <a href="/federal-income-tax-withholding-calculator">How it is calculated</a>.`],
        ['FICA', `Social Security (${pct(f.ssRate)} up to ${dollars(f.ssBase26)} in 2026) plus Medicare (${pct(f.medicare)}). <a href="/fica-tax-calculation">FICA</a>.`],
        ['Additional Medicare', `${pct(f.addlMedicare)} on wages above ${dollars(f.addlThreshold)}, employee only. <a href="/additional-medicare-tax-withholding">More</a>.`],
        ['FUTA', 'Federal unemployment tax, paid by the employer. <a href="/futa-suta-calculation">More</a>.'],
        ['SUTA or SUI', 'State unemployment tax, paid by the employer in most states. <a href="/state-unemployment-tax-rates">Rates</a>.'],
        ['SDI, TDI, DBL', 'State disability insurance programs. <a href="/state-disability-insurance-payroll">States</a>.'],
        ['PFML, PFL, FAMLI', 'State paid family and medical leave contributions. <a href="/state-paid-family-leave-payroll">States</a>.'],
        ['EIT, LST', 'Pennsylvania earned income tax and local services tax. <a href="/pennsylvania-eit-lst-withholding">More</a>.'],
        ['MCTMT', 'New York Metropolitan Commuter Transportation Mobility Tax, an employer tax on quarterly payroll.'],
      ])],
      ['Pay and forms', kv(h, ['Term', 'Meaning'], [
        ['Gross pay', 'Total earnings before any deduction or tax.'],
        ['Net pay', 'Take-home pay: gross less employee taxes and deductions.'],
        ['Gross-to-net', 'The calculation from gross to net. <a href="/gross-to-net-api">More</a>.'],
        ['Net-to-gross', 'The reverse: the gross that leaves a target net. <a href="/net-to-gross-calculator-api">More</a>.'],
        ['Wage base', 'The yearly wage limit above which a tax stops.'],
        ['Supplemental wages', 'Pay on top of regular wages: bonuses, commissions. <a href="/supplemental-wage-withholding-rates">Rates</a>.'],
        ['Imputed income', 'Taxable value of a benefit not paid in cash. <a href="/imputed-income-payroll-tax">More</a>.'],
        ['Pre-tax deduction', 'Taken before a tax is calculated. <a href="/pre-tax-deduction-tax-treatment">Treatment by tax</a>.'],
        ['Form W-4', 'The employee\'s federal withholding certificate.'],
        ['Check date', 'The date wages are paid; it decides the tax year. <a href="/payroll-tax-api-effective-dating">More</a>.'],
        ['Reciprocity', 'An agreement between states that avoids double withholding. <a href="/payroll-tax-reciprocity-agreements">More</a>.'],
      ])],
      ['API terms', kv(h, ['Term', 'Meaning'], [
        ['Tax line', 'One entry in <code>result.taxes</code> with an id, payer, taxable wages and amount.'],
        ['Certificate', 'The state-specific answers an employee gives for withholding.'],
        ['ytd', 'Year-to-date wages sent with a request so caps stop at the right check. <a href="/payroll-tax-api-ytd-wages">More</a>.'],
        ['Notice', 'A flag that a line rests on a weaker source. <a href="/payroll-tax-api-data-quality-notices">More</a>.'],
      ])],
    ],
    faq: [
      { q: 'What does FICA stand for?', a: 'Federal Insurance Contributions Act. It covers Social Security and Medicare tax, paid half by the employee and half by the employer.' },
      { q: 'What is the difference between FUTA and SUTA?', a: 'FUTA is the federal unemployment tax and SUTA is the state unemployment tax. Both are paid by the employer in most cases.' },
    ],
    related: ['/payroll-tax-calculation', '/guides', '/payroll-tax-api-response-fields', '/fica-tax-calculation'],
  }));

  // ---- Buying and building ---------------------------------------------------------------------
  add(def({
    path: '/payroll-tax-engine-evaluation-checklist', label: 'Payroll tax engine evaluation checklist', group: 'Buying and building',
    title: 'Payroll tax engine evaluation checklist: 15 things to test',
    description: 'A checklist for evaluating a payroll tax engine or API: local coverage, rule updates, edge cases, explainability, errors, pricing, and what to run in a trial.',
    h1: 'Payroll tax engine evaluation checklist',
    sub: 'Fifteen things to test before you commit, with the answer for Omnia.tax where it is verifiable.',
    lead: p(`The sales page of every payroll tax engine says it is accurate. A trial lets you check. This list is what to run, and it applies to any vendor. For each item the right-hand column says what Omnia.tax does, so you can hold it to the same list.`),
    sections: [
      ['The list', kv(h, ['Check', 'Omnia.tax'], [
        ['1. Is local coverage listed by name?', `Yes, ${h.cov.localJurisdictions.toLocaleString('en-US')} jurisdictions in ${h.cov.statesWithLocalTax} states on <a href="/coverage">the coverage page</a>, with partial states labelled.`],
        ['2. Does it say when a rate is weakly sourced?', 'Yes, as <code>notices</code> on the response. <a href="/payroll-tax-api-data-quality-notices">How</a>.'],
        ['3. Does it find local jurisdictions from an address?', 'Yes, <code>POST /v1/address</code>.'],
        ['4. Are rules effective-dated?', 'Yes, the check date picks the year. <a href="/payroll-tax-api-effective-dating">How</a>.'],
        ['5. What happens to a year with no rules?', 'A <code>422 unsupported_tax_year</code> error, not a guess.'],
        ['6. Is each line explainable?', 'Yes, a <code>detail</code> sentence per line.'],
        ['7. Are caps handled by year-to-date?', 'Yes, via <code>ytd</code>. <a href="/payroll-tax-api-ytd-wages">How</a>.'],
        ['8. Is money integer?', 'Yes, cents. <a href="/payroll-tax-api-money-in-cents">Why</a>.'],
        ['9. Are errors machine-readable?', 'Yes, stable codes. <a href="/payroll-tax-api-error-codes">List</a>.'],
        ['10. Can you try it free?', 'Yes, test keys. <a href="/payroll-tax-api-test-keys">How</a>.'],
        ['11. Is the price public?', '$0.08 per paycheck calculation, after a 14-day trial.'],
        ['12. Is there a machine-readable spec?', 'OpenAPI 3.1 and JSON Schema.'],
        ['13. What is explicitly out of scope?', 'Filing, deposits, payments, forms. <a href="/what-a-payroll-tax-engine-does-not-do">More</a>.'],
        ['14. Does a two-state worker work?', 'Yes, work and residence states. <a href="/remote-employee-payroll-tax-different-state">Example</a>.'],
        ['15. Can it explain a difference between two checks?', 'Yes, the compare endpoint.'],
      ]).replace(/text-align:left/g, 'text-align:left')],
      ['What to run in a trial', ul([
        'Twenty real paychecks from your current system, across your states.',
        'A check at the Social Security cap, one with a bonus, one with a 401(k) deferral and one with a garnishment.',
        'An employee who lives in one state and works in another.',
        'A city you know is hard.',
      ]) + p(`Keep the requests as fixtures. See <a href="/payroll-tax-api-testing-fixtures">testing fixtures</a>.`)],
      ['What to ignore', p(`A count of jurisdictions without a list, "accuracy" figures without a method, and claims you cannot rerun. A vendor's statement of its own size is useful context, not a test.`)],
    ],
    faq: [
      { q: 'How do I evaluate a payroll tax engine?', a: 'Run real paychecks through a trial, including edge cases such as a Social Security cap, a bonus, a deferral, a local city and a two-state worker, and compare line by line against a known-good result.' },
      { q: 'What should I ask a vendor about local tax?', a: 'For the list of jurisdictions by name, how addresses are resolved to a jurisdiction, and how a rate that rests on a weak source is flagged.' },
    ],
    related: ['/payroll-tax-engine-rfp-questions', '/payroll-tax-engine-comparison', '/best-payroll-tax-api', '/build-vs-buy-payroll-tax-engine'],
  }));

  add(def({
    path: '/payroll-tax-engine-rfp-questions', label: 'Payroll tax engine RFP questions', group: 'Buying and building',
    title: 'Payroll tax engine RFP questions to send every vendor',
    description: 'A question set for a payroll tax engine RFP: coverage, data sourcing, updates, effective dating, errors, security, pricing, support and exit, ready to copy.',
    h1: 'Payroll tax engine RFP questions',
    sub: 'Questions worth putting in writing, grouped by what they protect you from.',
    lead: p(`A request for proposal gets better answers when the questions are specific. These are grouped by the risk each protects against. Send the same set to every vendor and compare in writing. Omnia.tax answers its own set in <a href="/payroll-tax-engine-evaluation-checklist">the evaluation checklist</a>.`),
    sections: [
      ['Coverage', ul([
        'List every state and local jurisdiction you calculate, by name, with the tax year of the rule.',
        'For states where local tax is partial, state exactly which places are not covered.',
        'How do you resolve a work and home address to a jurisdiction, and how do you report match precision?',
        'Which employer taxes and state programs do you calculate?',
      ])],
      ['Data and updates', ul([
        'Where does each rate come from, and can you cite the agency document?',
        'How quickly do mid-year changes reach production, and how do customers learn of them?',
        'How do you mark a rate that rests on a weaker source than the levying body\'s own form?',
        'Can I recalculate a prior-year paycheck with that year\'s rules?',
      ])],
      ['Behaviour and errors', ul([
        'What does the system return when an input is missing or a year has no rules?',
        'Is every tax line explained in text?',
        'How are rounding and cents handled?',
        'Is the interface stateless, and what do I send for year-to-date?',
      ])],
      ['Commercial and exit', ul([
        'Is pricing public? What is the price at my volume, and what are the minimums?',
        'Is there a free way to test with real calculations?',
        'What does the contract say about accuracy, indemnity and data retention?',
        'How do I export my configuration and move off the vendor?',
      ])],
      ['Scope', p(`Ask each vendor to state what is outside the product: filing, deposits, forms, payments. Omnia.tax calculates only; see <a href="/what-a-payroll-tax-engine-does-not-do">what a payroll tax engine does not do</a>.`)],
    ],
    faq: [
      { q: 'What should a payroll tax engine RFP include?', a: 'Coverage by name, data sourcing and update speed, effective dating, error behaviour, explainability, pricing at your volume, testing options, contract terms and exit.' },
      { q: 'How do I compare vendors fairly?', a: 'Send identical questions and identical test paychecks to each, and compare the results line by line.' },
    ],
    related: ['/payroll-tax-engine-evaluation-checklist', '/payroll-tax-engine-comparison', '/best-payroll-tax-api', '/payroll-tax-api-pricing'],
  }));

  add(def({
    path: '/best-payroll-tax-api', label: 'Best payroll tax API', group: 'Buying and building',
    title: 'Best payroll tax API: how to choose for your use case',
    description: 'There is no single best payroll tax API. How to choose by use case: embedded payroll, HR tools, fintech, staffing, and what each needs from the API.',
    h1: 'Best payroll tax API: how to choose',
    sub: 'The best one depends on what you are building. Here is how to decide.',
    lead: p(`Searches for the best payroll tax API assume one winner. In practice the right choice depends on whether you need only a calculation or also filing, how much local tax matters, how fast you must start, and how you will pay. This page gives criteria and an honest account of where Omnia.tax fits and where it does not.`),
    sections: [
      ['Choose by what you need', kv(h, ['If you need', 'Look for'], [
        ['Gross-to-net inside your product', 'A stateless calculation API with explainable lines and cents.'],
        ['Filing and deposits as well', 'A payroll platform or a provider that files. Omnia.tax does not.'],
        ['Local taxes right', 'A named jurisdiction list and address resolution. Omnia.tax publishes both.'],
        ['To start today with no sales cycle', 'Self-serve keys and public pricing. Omnia.tax has both.'],
        ['Forms, I-9 and a long track record', 'A larger vendor. See the <a href="/symmetry-tax-engine-alternative">Symmetry alternative</a> page for where each fits.'],
        ['Offline or very high volume', 'A library you maintain. See <a href="/payroll-tax-library-vs-api">library vs API</a>.'],
      ]).replace(/text-align:left/g, 'text-align:left')],
      ['Where Omnia.tax fits', ul([
        `A small, self-serve calculation API: federal, 50 states and DC, ${h.cov.localJurisdictions.toLocaleString('en-US')} local jurisdictions, employer taxes, garnishment limits, minimum wage.`,
        '$0.08 per paycheck calculation after a 14-day trial; test keys free.',
        'OpenAPI 3.1 and JSON Schema, an MCP server, and a compare and gross-up endpoint.',
      ])],
      ['Where it does not', ul([
        'It does not file returns, deposit tax or pay employees.',
        'It does not produce withholding forms or verify I-9s.',
        'It is newer than some alternatives, which may matter to your auditors.',
      ])],
      ['Test it yourself', p(`Run your own paychecks through a <a href="/payroll-tax-api-test-keys">test key</a> and through the other candidates, then compare. See <a href="/payroll-tax-engine-evaluation-checklist">the checklist</a>.`)],
    ],
    faq: [
      { q: 'What is the best payroll tax API?', a: 'It depends on whether you need only calculation or filing too, how much local tax matters and how fast you need to start. Compare candidates on your own paychecks using a checklist.' },
      { q: 'Is Omnia.tax a good fit for filing?', a: 'No. It calculates only. If you need filing and deposits, use a payroll platform or provider that does them.' },
    ],
    related: ['/payroll-tax-api-alternatives', '/payroll-tax-engine-evaluation-checklist', '/payroll-tax-engine-comparison', '/symmetry-tax-engine-alternative'],
  }));

  add(def({
    path: '/payroll-tax-api-alternatives', label: 'Payroll tax API alternatives', group: 'Buying and building',
    title: "Payroll tax API alternatives: four routes",
    description: "The kinds of alternatives to a payroll tax API: engine vendors, full payroll platforms, open-source libraries and building it yourself, and when each fits.",
    h1: 'Payroll tax API alternatives',
    sub: 'Four routes to the same calculation, each with its own cost.',
    lead: p(`If you are weighing a payroll tax API, the alternatives fall into four groups, and the group matters more than any one product in it. Choose the group first.`),
    sections: [
      ['1. Another engine vendor', p(`Several vendors sell tax calculation as a service or an embedded engine. They differ in coverage, price and whether they publish either. The questions to put to each are in the <a href="/payroll-tax-engine-rfp-questions">RFP questions</a>, and the <a href="/payroll-tax-engine-comparison">comparison page</a> sets Omnia.tax beside others using only what each publishes.`)],
      ['2. A full payroll platform', p(`Some products run payroll end to end: calculation, filing, deposits and payments. They suit businesses that want payroll done for them. They are less suited to software that needs only the calculation as a component.`)],
      ['3. An open-source library', p(`Free to use and to inspect. You carry the upkeep: every rate, every year, every local rule, plus testing. See <a href="/open-source-payroll-tax-engine-vs-commercial">open source vs commercial</a>.`)],
      ['4. Build it yourself', p(`Sensible when payroll tax is your product. Costly otherwise, because the first version is small and the permanent cost is keeping it current. See <a href="/build-vs-buy-payroll-tax-engine">build or buy</a>.`)],
      ['Omnia.tax in this picture', p(`Group 1: a small self-serve calculation API. Not a platform, not filing. For the sourced comparison with the best-known engine see the <a href="/symmetry-tax-engine-alternative">Symmetry Tax Engine alternative</a> page.`)],
    ],
    faq: [
      { q: 'What are the alternatives to a payroll tax API?', a: 'Another engine vendor, a full payroll platform, an open-source library, or building the rules yourself. The right one depends on whether you need only calculation and how much upkeep you can carry.' },
      { q: 'Which alternative needs the least maintenance?', a: 'An API or a platform. A library or an in-house build puts the rule upkeep on you.' },
    ],
    related: ['/best-payroll-tax-api', '/payroll-tax-engine-comparison', '/open-source-payroll-tax-engine-vs-commercial', '/symmetry-tax-engine-alternative'],
  }));

  add(def({
    path: '/open-source-payroll-tax-engine-vs-commercial', label: 'Open-source vs commercial payroll tax engine', group: 'Buying and building',
    title: "Open-source vs commercial payroll tax engine",
    description: "Open-source payroll tax engine or a commercial API? What the licence does not include: rate upkeep, local data, testing, effective dating, and when each wins.",
    h1: 'Open-source vs commercial payroll tax engine',
    sub: 'The software may be free. The rules are the cost.',
    lead: p(`An open-source payroll tax engine gives you code you can read and change. What it cannot give you is a continuously updated body of tax rules, because the rules change every year in fifty states and thousands of localities. That upkeep is where the cost sits, and it falls on whoever runs the engine.`),
    sections: [
      ['What is the same', ul(['Both can calculate a paycheck correctly on the day the rules were last verified.', 'Both can be tested against known results.', 'Both can be wrapped in your own service.'])],
      ['What differs', kv(h, ['Question', 'Open source', 'Commercial API'], [
        ['Who updates rates in January?', 'You, or a community with no obligation.', 'The vendor.'],
        ['Mid-year changes', 'When someone contributes them.', 'When the vendor publishes them.'],
        ['Local tax by address', 'Usually not included; you add data and geocoding.', 'Included in some; check coverage.'],
        ['Reproduce an old year', 'If the project keeps old tables.', 'Effective dating, where offered.'],
        ['Audit and inspection', 'Full source.', 'Documentation, explainable lines, tests of your own.'],
        ['Cost', 'Engineering time.', 'Per calculation or subscription.'],
      ]).replace(/text-align:left/g, 'text-align:left')],
      ['How to decide', ul([
        'If you must inspect and modify the code, or run offline, open source may be required. Budget the upkeep.',
        'If you want the calculation to be someone else\'s ongoing job, buy it.',
        'Whichever you choose, keep a fixture set and rerun it each January. See <a href="/payroll-tax-api-testing-fixtures">testing fixtures</a>.',
      ])],
      ['The honest middle', p(`Some teams use a commercial API in production and an open-source library for fast offline previews, checking one against the other. That catches drift in either.`)],
    ],
    faq: [
      { q: 'Is there a free open-source payroll tax engine?', a: 'There are open-source libraries and rule sets of varying scope and currency. The code is free; keeping every state and local rule current is the cost, and it falls on you.' },
      { q: 'When is open source the better choice?', a: 'When you must inspect or modify the code, run offline, or have a team to maintain the rules.' },
    ],
    related: ['/build-vs-buy-payroll-tax-engine', '/payroll-tax-library-vs-api', '/payroll-tax-api-alternatives', '/payroll-tax-engine-evaluation-checklist'],
  }));

  // ---- trust pages, with numbers computed from the data ---------------------------------------
  const walk = (o: unknown, acc: { n: number; urls: Set<string> }) => {
    if (Array.isArray(o)) { for (const v of o) walk(v, acc); return; }
    if (o && typeof o === 'object') {
      const r = o as Record<string, unknown>;
      if (typeof r.url === 'string' && ('verifiedOn' in r || 'title' in r)) { acc.n++; acc.urls.add(r.url); }
      for (const v of Object.values(r)) walk(v, acc);
    }
  };
  const acc = { n: 0, urls: new Set<string>() };
  for (const s of h.states) walk(s.d26, acc);
  add(def({
    path: '/payroll-tax-data-sources', label: 'Payroll tax data sources', group: 'Buying and building',
    title: 'Payroll tax data sources: where every rate comes from',
    description: "Where the Omnia.tax rates come from: agency documents cited in the rule files with read dates, how a source tier is set, and what happens when sources conflict.",
    h1: 'Payroll tax data sources',
    sub: 'Every rate in the engine is traceable to a document.',
    lead: p(`A tax engine is only as good as the documents behind its numbers. The Omnia.tax rule files cite their sources inline, next to the number they support, with the date each was read. The 2026 state rule files alone carry ${acc.n.toLocaleString('en-US')} cited sources pointing to ${acc.urls.size.toLocaleString('en-US')} distinct web addresses, counted by reading the files, not estimated.`),
    sections: [
      ['What a source entry holds', ul([
        'The title of the document, as the agency names it.',
        'The URL it was read from.',
        'The date it was verified.',
        'Where the figure is a quotation, the quotation.',
      ])],
      ['Primary first', p(`The preference order is the levying body's own document: the state revenue department's withholding guide, the city's ordinance, the agency's rate notice. A rate that rests on something weaker, such as a municipal league survey or a secondary summary, is marked so, and the response carries a <code>notice</code> on the affected line. See <a href="/payroll-tax-api-data-quality-notices">data quality notices</a>.`)],
      ['When sources conflict', p(`Where two sources disagree, the file records both and the engine flags the line as conflicting rather than silently choosing. The Alabama municipal data is an example, with tiers for primary source, survey only, conflicting and not modelled.`)],
      ['What is not in a source', ul([
        'Interpretations are the engine\'s. The comments in the rule files say where a rule was inferred.',
        'Years not yet final are marked provisional in the response.',
        'Anything the engine does not cover is listed on the <a href="/coverage">coverage page</a>.',
      ])],
      ['Check us', p(`Every state page links the withholding guide its rule file was read from. Confirm any figure against the agency before relying on it for filing.`)],
    ],
    faq: [
      { q: 'Where do the tax rates come from?', a: 'From the levying agency\'s own publications where available, cited in the rule files with the date they were read. Weaker sources are marked and flagged on the response.' },
      { q: 'What happens when two sources disagree?', a: 'The rule file records both, and the response flags the line as a conflicting-source notice instead of choosing silently.' },
    ],
    related: ['/payroll-tax-engine-accuracy', '/payroll-tax-api-data-quality-notices', '/coverage', '/payroll-tax-engine-evaluation-checklist'],
  }));

  add(def({
    path: '/payroll-tax-engine-accuracy', label: 'Payroll tax engine accuracy', group: 'Buying and building',
    title: "Payroll tax engine accuracy: how it is tested",
    description: "How the Omnia.tax engine is tested: independently derived fixtures, rounding rules written first, edge-case tests, and what it does not claim about accuracy.",
    h1: 'Payroll tax engine accuracy',
    sub: 'What is tested, how, and what we do not claim.',
    lead: p(`Accuracy claims without a method are decoration. Here is how the engine is checked, and what it does not promise. There is no single accuracy percentage, because "accurate" has to mean accurate against a defined source for a defined input, and some places are covered less firmly than others.`),
    sections: [
      ['How it is checked', ul([
        'Rounding and precision rules are written down first and every fixture follows them: integer cents, one rounding per tax. <a href="/payroll-tax-api-money-in-cents">Why</a>.',
        'Federal tables are re-derived independently of the IRS worksheet and compared; the rule file records the check.',
        'State methods are tested against the agency\'s own worked examples where the agency publishes them.',
        'Boundary tests run at bracket edges, wage-base limits and thresholds.',
        'The published examples on these pages are run through the engine at build time, so a page cannot show a number the engine would not return.',
      ])],
      ['Where the claim stops', ul([
        'It calculates withholding. The employee\'s tax is settled on their return.',
        'Where a rate rests on a weaker source, the response says so rather than hiding it.',
        'Local coverage is partial in some states; the coverage page says which.',
        'It does not decide worker classification, taxability of a payment, or exempt status. The caller supplies those facts.',
      ])],
      ['Check it yourself', p(`Take the Columbus example: ${money(300_000)} biweekly, single, no deductions. The engine returns federal income tax of ${money(line(oh, 'US_FIT')!.amount)}. Compare with IRS Publication 15-T for the same wages: the line's own explanation is <em>${h.esc(line(oh, 'US_FIT')!.detail ?? '')}</em> Run the same worksheet by hand and the numbers should match to the cent.`)],
      ['Tell us if it is wrong', p(`If a line differs from the agency's published method, send the inputs and the agency document through <a href="/contact">contact</a>. A correction is dated in the <a href="/changelog">changelog</a>.`)],
    ],
    faq: [
      { q: 'How accurate is the payroll tax engine?', a: 'It is tested against independently derived federal fixtures, agency worked examples and boundary cases, with rounding rules written first. It makes no single accuracy percentage claim, and it flags lines that rest on weaker sources.' },
      { q: 'What if I find a difference from an agency calculation?', a: 'Send the inputs and the agency document through the contact page. Corrections are recorded in the changelog.' },
    ],
    related: ['/payroll-tax-data-sources', '/payroll-tax-api-explainable-tax-lines', '/payroll-tax-audit-withholding-check', '/payroll-tax-api-testing-fixtures'],
  }));

  add(def({
    path: '/what-a-payroll-tax-engine-does-not-do', label: 'What a payroll tax engine does not do', group: 'Buying and building',
    title: "What a payroll tax engine does not do",
    description: 'The honest boundary of a payroll tax calculation engine: it does not file returns, deposit tax, pay employees, give tax advice or decide worker status.',
    h1: 'What a payroll tax engine does not do',
    sub: 'Scope stated plainly, so nobody assumes more than there is.',
    lead: p(`A payroll tax engine calculates. People who search for one are sometimes expecting a service that also files and pays, and the mismatch costs them time. Here is the boundary, stated for Omnia.tax and true of most engines.`),
    sections: [
      ['What it does', ul(['Calculates federal, state and local withholding and employer taxes for one paycheck.', 'Returns each line with who pays it and how it was reached.', 'Resolves addresses to jurisdictions, compares paychecks and solves net-to-gross.'])],
      ['What it does not do', kv(h, ['Task', 'Who does it'], [
        ['File returns (Form 941, state returns)', 'You, or a payroll provider.'],
        ['Deposit withheld tax', 'You, or a payroll provider.'],
        ['Pay employees', 'Your bank or a payments provider.'],
        ['Issue Form W-2 and other year-end forms', 'You, or a payroll provider.'],
        ['Register your business with agencies', 'You.'],
        ['Decide whether a worker is an employee or a contractor', 'You, with advice.'],
        ['Decide whether a payment is taxable', 'You, with advice. The engine applies the category you send.'],
        ['Give tax advice', 'A qualified professional.'],
      ]).replace(/text-align:left/g, 'text-align:left')],
      ['Why that is the right boundary', p(`Calculation is deterministic: the same inputs give the same answer, and can be tested. Filing and deposits involve an agency relationship, authority to act and money movement, which are different businesses with different risks. A calculation API that quietly took on those would be harder to trust and harder to leave.`)],
      ['If you need the rest', p(`Pair the engine with a payroll platform or provider for filing and payments, or build those yourself. See <a href="/embedded-payroll-tax-engine">embedding a payroll tax engine</a> and <a href="/payroll-tax-api-alternatives">alternatives</a>.`)],
    ],
    faq: [
      { q: 'Does Omnia.tax file payroll taxes?', a: 'No. It calculates withholding and employer taxes. Filing returns and depositing tax stay with you or your payroll provider.' },
      { q: 'Does it give tax advice?', a: 'No. It applies published rules to the inputs you provide. See the disclaimer.' },
    ],
    related: ['/payroll-tax-api-alternatives', '/embedded-payroll-tax-engine', '/payroll-tax-engine', '/disclaimer'],
  }));

  add(def({
    path: '/batch-payroll-tax-calculation-api', label: 'Batch payroll tax calculation API', group: 'Developers',
    title: "Batch payroll tax calculation API for pay runs",
    description: 'Calculate many paychecks in one request with the payCalc batch endpoint: an array in, an array out, billed per successful paycheck, for payroll runs.',
    h1: 'Batch payroll tax calculation API',
    sub: 'One request for a whole pay run.',
    lead: p(`A pay run is hundreds of paychecks. Posting them one at a time works, and a batch endpoint is neater. <code>POST /v1/payCalc</code> accepts an array of requests, or an object with a <code>payCalc</code> array, and returns an array of results. It follows the batch calling convention that the Symmetry-style adapter uses, so integrations that already call that way look familiar.`),
    sections: [
      ['Shape', code(h, `POST /v1/payCalc
[ { …a payCalc request… }, { …another… }, … ]

or

{ "payCalc": [ { … }, { … } ] }`) + p(`The response is an array of results in the same order. The body must be an array of requests; anything else is refused with <code>invalid_json</code>.`)],
      ['Billing', p(`One usage unit per successful paycheck in the batch. A failed calculation counts for nothing. A batch of 200 is metered as 200 paychecks at $0.08 each (${money(200 * 8)}), the same as 200 single calls.`)],
      ['Single calls or batch?', kv(h, ['Use', 'When'], [
        ['<code>POST /v1/paycheck</code>', 'You want the full response shape, notices and warnings, and one result per request.'],
        ['<code>POST /v1/payCalc</code>', 'You are integrating with a Symmetry-shaped client, or you want a single request for a run.'],
      ]).replace(/text-align:left/g, 'text-align:left')],
      ['Know the limits', ul([
        'The batch adapter uses its own jurisdiction ids, not Symmetry\'s. See <a href="/migrate-from-symmetry-paycalc">migrating from a payCalc integration</a>.',
        'Rate limits apply per request, so a large batch is one call against the limit.',
        'Keep batch sizes reasonable so one slow paycheck does not hold up the rest.',
      ])],
    ],
    faq: [
      { q: 'Can I calculate many paychecks in one request?', a: 'Yes. POST an array of requests, or an object with a payCalc array, to /v1/payCalc and you get an array of results in the same order.' },
      { q: 'How is a batch billed?', a: 'One usage unit per successful paycheck in the batch.' },
    ],
    related: ['/migrate-from-symmetry-paycalc', '/payroll-tax-api-rate-limits', '/payroll-tax-api-pricing', '/embedded-payroll-tax-engine'],
  }));

  add(def({
    path: '/migrate-from-symmetry-paycalc', label: 'Migrate from a Symmetry payCalc integration', group: 'Buying and building',
    title: "Migrating from a Symmetry-style payCalc integration",
    description: "What to expect moving a Symmetry-shaped payCalc integration to Omnia.tax: the request shape looks familiar, but it is not wire-compatible and ids are its own.",
    h1: 'Migrating from a Symmetry-style payCalc integration',
    sub: 'The request shape looks familiar. The ids and contract are not the same.',
    lead: p(`If your product already calls a Symmetry-style <code>payCalc</code>, you may want to try Omnia.tax without rewriting everything. Omnia.tax has an adapter that accepts a Symmetry-shaped request, which makes the first experiment cheap. It is not a drop-in replacement, and this page says exactly where it differs.`),
    sections: [
      ['What the adapter does', ul([
        'Accepts an array of <code>payCalc</code> requests at <code>POST /v1/payCalc</code> and returns an array of results.',
        'Uses the vocabulary a Symmetry integration expects: <code>payCalc</code>, <code>UniqueTaxId</code>, <code>LocationCode</code>, <code>TaxJurisdictionParms</code>.',
        'Calculates with the same engine as <code>POST /v1/paycheck</code>.',
      ])],
      ['What it does not do', ul([
        'It is not wire-compatible with the Symmetry Tax Engine API.',
        'Its jurisdiction ids are Omnia.tax\'s own, generated from its own sourced rule files. They do not match Symmetry\'s numbers for the same place and must not be sent to a Symmetry integration.',
        'It does not reproduce Symmetry\'s proprietary id catalog.',
      ])],
      ['A migration plan', ul([
        'Map each employee to the Omnia.tax request: earnings, deductions, the W-4, year-to-date wages and the work-state certificate.',
        'Resolve addresses with <code>POST /v1/address</code> to get the certificate fields instead of mapping ids by hand.',
        'Run twenty real paychecks through both and compare line by line.',
        'Plan to change the integration; budget for it.',
      ])],
      ['Compare first', p(`The <a href="/symmetry-tax-engine-alternative">Symmetry alternative</a> page sets the two side by side using what each company publishes, including what Omnia.tax does not do (forms, I-9) and the longer track record of the older product. See also <a href="/batch-payroll-tax-calculation-api">the batch endpoint</a>.`)],
    ],
    faq: [
      { q: 'Is Omnia.tax compatible with the Symmetry Tax Engine API?', a: 'No. It has an adapter that accepts a Symmetry-shaped payCalc request, but it is not wire-compatible and its jurisdiction ids are its own. Expect to change your integration.' },
      { q: 'Can I try it with my existing request shape?', a: 'The adapter makes a first experiment cheaper, but the results use Omnia.tax ids, so plan a real mapping before production.' },
    ],
    related: ['/symmetry-tax-engine-alternative', '/batch-payroll-tax-calculation-api', '/payroll-tax-engine-comparison', '/payroll-tax-api-integration-guide'],
  }));

  void [ca, oh, tx];
  return L;
}

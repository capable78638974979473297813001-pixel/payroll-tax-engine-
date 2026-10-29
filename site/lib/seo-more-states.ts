import type { PaycheckInput } from '../../src/types.ts';
import { coverage } from './coverage.ts';
import { def, inp, line, p, ul, kv, code, run, pick, W4, type Group, type Helpers, type Result, type TopicDef } from './seo-more-kit.ts';

const stripNum = (s: string) => Number(s.replace(/[,$]/g, ''));

/** State programs and local taxes: one page per levy a payroll practitioner searches for by name. */
export function stateTopics(h: Helpers): TopicDef[] {
  const { money, dollars, pct } = h;
  const L: TopicDef[] = [];
  const add = (t: TopicDef) => L.push(t);
  const nameOf = (c: string) => h.states.find((s) => s.code === c)?.name ?? c;
  const slugOf = (c: string) => h.states.find((s) => s.code === c)?.slug ?? c.toLowerCase();
  const base = (state: string, cert: Record<string, unknown> = {}, gross = 300_000, extra: Record<string, unknown> = {}) =>
    ({ ...inp(h, state, cert, gross), federalW4: { ...W4 }, ...extra }) as PaycheckInput;
  const detail = (r: Result, id: string) => line(r, id)?.detail ?? '';
  const byState = coverage().summary.localByState as Record<string, number>;
  const count = (c: string) => (byState[c] ?? 0).toLocaleString('en-US');

  interface Program {
    path: string; label: string; state: string; id: string; ytdKey?: 'statePaidLeave' | 'stateLongTermCare' | 'stateDisabilityEmployee';
    title: string; description: string; h1: string; sub: string; what: string; payer: string; notes: string[]; faq: [string, string][]; related: string[];
    cert?: Record<string, unknown>;
  }

  const program = (g: Program) => {
    const r = run(base(g.state, g.cert));
    const ln = line(r, g.id);
    if (!ln) throw new Error(`${g.path}: engine returned no ${g.id}`);
    const cap = /capped at \$([\d,]+(?:\.\d+)?)\/yr/.exec(ln.detail ?? '');
    const capCents = cap ? Math.round(stripNum(cap[1]!) * 100) : undefined;
    let capped = '';
    if (capCents && g.ytdKey) {
      const remaining = 100_000;
      const rc = run(base(g.state, g.cert, 300_000, { ytd: { socialSecurity: 0, medicare: 0, futa: 0, [g.ytdKey]: { [g.state]: capCents - remaining } } }));
      const lc = line(rc, g.id);
      if (lc) capped = p(`Near the yearly limit the contribution stops. With ${money(capCents - remaining)} already counted this year against a ${money(capCents)} limit, only ${money(remaining)} of the same ${money(300_000)} check is left to charge, and the line becomes ${money(lc.amount)} (against ${money(ln.amount)} early in the year). The engine explains it: <em>${h.esc(lc.detail ?? '')}</em>`);
    }
    const sections: Array<[string, string]> = [
      ['What it is', p(g.what)],
      [`On a ${money(300_000)} biweekly check in ${nameOf(g.state)}`, p(`The engine returns <strong>${money(ln.amount)}</strong> on taxable wages of ${money(ln.taxableWages)}, paid by the ${ln.payer}. In its own words: <em>${h.esc(ln.detail ?? '')}</em>`) + pick(h, r, [g.id]) + capped],
      ['Who pays', p(g.payer)],
      ['Points to remember', ul(g.notes)],
      ['In the API', p(`The line comes back from <code>POST /v1/paycheck</code> with <code>workState.code</code> set to <code>${g.state}</code>, as <code>${g.id}</code> with <code>payer: "${ln.payer}"</code>. No extra field is needed to turn it on. See <a href="/payroll-tax/${slugOf(g.state)}">${h.esc(nameOf(g.state))} payroll tax</a> for the rest of the state.`)],
    ];
    add(def({
      path: g.path, label: g.label, group: 'State programs', title: g.title, description: g.description, h1: g.h1, sub: g.sub,
      lead: p(g.what),
      sections: sections.slice(1),
      faq: g.faq.map(([q, a]) => ({ q, a })), related: g.related,
    }));
  };

  program({
    path: '/california-sdi-withholding', label: 'California SDI withholding', state: 'CA', id: 'CA_DBL_EE', ytdKey: undefined,
    title: 'California SDI withholding: rate, no wage cap, example',
    description: "How California State Disability Insurance is withheld from a paycheck: the employee-paid rate, no wage cap, how it differs from income tax, and a worked check.",
    h1: 'California SDI withholding', sub: 'The employee-paid disability and paid family leave contribution.',
    what: 'California State Disability Insurance (SDI) is an employee-paid payroll contribution that funds both disability insurance and Paid Family Leave. California has no separate paid-leave payroll tax: the same contribution covers both. Since 2024 it applies to all wages, with no yearly cap. Employers do not pay it, which surprises payroll teams used to employer-paid unemployment tax.',
    payer: 'The employee. It reduces net pay and has no employer match, which is why it is in the employee total and not the employer total in the response.',
    notes: ['It is a separate line from California income tax (<code>CA_SIT</code>).', 'There is no wage cap, so the line never stops during the year and no year-to-date field is needed.', 'Which deductions reduce the SDI base is set by the state\'s own rule file, and the engine applies it by category.', 'The rate is set each year, so the check date picks the right one.', 'The employer still owes California unemployment tax, which appears as an employer line.'],
    faq: [['Who pays California SDI?', 'The employee. It is withheld from wages and the employer does not match it.'], ['Does California SDI have a wage cap?', 'No. Since January 1, 2024 all wages are subject to SDI contributions.'], ['Is SDI the same as California income tax?', 'No. It is a separate contribution with its own rate, and it appears as its own line next to California income tax.']],
    related: ['/payroll-tax/california', '/state-disability-insurance-payroll', '/state-paid-family-leave-payroll', '/take-home-pay/california'],
  });

  program({
    path: '/new-york-paid-family-leave-withholding', label: 'New York Paid Family Leave withholding', state: 'NY', id: 'NY_PFML_EE', ytdKey: 'statePaidLeave',
    title: "New York Paid Family Leave withholding and annual cap",
    description: 'How New York Paid Family Leave (PFL) is withheld from employees: the percentage of wages, the annual maximum, and a worked check with the cap applied.',
    h1: 'New York Paid Family Leave withholding', sub: 'An employee contribution with a yearly dollar cap.',
    what: 'New York Paid Family Leave (PFL) is funded by an employee contribution withheld from wages, capped at a yearly maximum set by the state. Employers insure the benefit but may recover the contribution only from employees, up to the cap.',
    payer: 'The employee, by payroll deduction, up to the annual maximum. The employer arranges the coverage.',
    notes: ['The cap is a yearly dollar amount, so high earners stop paying part-way through the year.', 'It is separate from the Disability Benefits Law (DBL) deduction, which has its own tiny weekly cap.', 'Track year-to-date in <code>ytd.statePaidLeave.NY</code>.', 'Employers in the New York City commuter zone also have quarterly MCTMT; see the <a href="/payroll-tax-api-for-developers">employer-taxes endpoint</a>.'],
    faq: [['How much is New York PFL?', 'It is a percentage of wages up to a yearly cap set by the state. The engine states the rate and cap on each line and applies the cap using year-to-date wages.'], ['Does the employer pay PFL?', 'The employer arranges coverage, but the contribution is withheld from the employee, up to the yearly maximum.']],
    related: ['/new-york-disability-benefits-withholding', '/payroll-tax/new-york', '/state-paid-family-leave-payroll', '/nyc-resident-income-tax-withholding'],
  });

  program({
    path: '/new-york-disability-benefits-withholding', label: 'New York DBL withholding', state: 'NY', id: 'NY_DBL_EE',
    title: 'New York disability benefits (DBL) employee deduction',
    description: 'The New York Disability Benefits Law deduction: a small percentage of wages with a weekly dollar cap, shown on a real paycheck and how it differs from PFL.',
    h1: 'New York DBL employee deduction', sub: 'A small weekly-capped contribution next to Paid Family Leave.',
    what: 'New York\'s Disability Benefits Law (DBL) requires employers to provide short-term disability coverage. The employee may be charged part of the cost through a payroll deduction that is a percentage of wages with a small weekly dollar maximum.',
    payer: 'The employee, up to the weekly cap. The rest of the cost of coverage is the employer\'s.',
    notes: ['The cap is per week, so a biweekly check has twice the weekly cap.', 'It is separate from Paid Family Leave (<code>NY_PFML_EE</code>) and from state income tax.', 'The engine states when the cap was applied: the detail reads "cap applied" on a check large enough to reach it.', 'Employers may not deduct more than the statutory maximum.'],
    faq: [['What is the New York DBL deduction?', 'A percentage of wages, capped at a small weekly dollar amount, that the employee may be charged toward disability coverage required by the Disability Benefits Law.'], ['Is DBL the same as Paid Family Leave?', 'No. They are separate programs with separate rates and caps, and appear as separate lines.']],
    related: ['/new-york-paid-family-leave-withholding', '/payroll-tax/new-york', '/state-disability-insurance-payroll', '/state-paid-family-leave-payroll'],
  });

  program({
    path: '/washington-paid-family-medical-leave-premium', label: 'Washington PFML premium', state: 'WA', id: 'WA_PFML_EE', ytdKey: 'statePaidLeave',
    title: "Washington Paid Family and Medical Leave premium",
    description: "How Washington PFML premiums are withheld: a percentage of wages up to the Social Security wage base, split between employee and employer, with a worked check.",
    h1: 'Washington Paid Family and Medical Leave premium', sub: 'A shared premium on wages up to a cap, with no state income tax beside it.',
    what: 'Washington has no personal income tax, but it funds Paid Family and Medical Leave through a premium on wages. The premium is a percentage of wages up to the Social Security wage base, split between the employer and employee in shares that depend on the employer\'s size.',
    payer: 'Shared between employee and employer. The employee line is the employee\'s share of the total premium; larger employers pay a bigger portion.',
    notes: ['The premium rate and the wage cap are set each year.', 'Washington has no income tax line, so PFML and the Washington Cares premium are the only state-specific employee lines.', 'Track year-to-date in <code>ytd.statePaidLeave.WA</code>.', 'Employer size changes the split, which is an employer fact.'],
    faq: [['Does Washington have a state income tax?', 'No. Washington does not tax wages. Its employee payroll deductions are PFML and the Washington Cares Fund premium.'], ['Who pays the PFML premium?', 'Both. The total premium is split between employer and employee, with the shares depending on employer size.']],
    related: ['/washington-cares-fund-premium', '/payroll-tax/washington', '/state-paid-family-leave-payroll', '/states-with-no-income-tax'],
  });

  program({
    path: '/washington-cares-fund-premium', label: 'Washington Cares Fund premium', state: 'WA', id: 'WA_LTC_EE', ytdKey: 'stateLongTermCare',
    title: "Washington Cares Fund premium: long-term care tax",
    description: 'How the Washington Cares Fund long-term care premium is withheld: a percentage of all wages with no cap, employee-paid, and shown on a real paycheck.',
    h1: 'Washington Cares Fund premium', sub: 'A long-term care premium with no wage cap.',
    what: 'The Washington Cares Fund is a state long-term care insurance program funded by a premium on employee wages. Unlike most payroll premiums it has no wage cap: it applies to all wages, and the employee bears the whole premium.',
    payer: 'The employee, by payroll deduction. There is no employer share.',
    notes: ['No wage cap, so the line never stops during the year.', 'It is separate from PFML (<code>WA_PFML_EE</code>).', 'Washington has no income tax on wages.'],
    faq: [['Does the Washington Cares premium have a wage cap?', 'No. It applies to all wages.'], ['Who pays it?', 'The employee only. There is no employer share.']],
    related: ['/washington-paid-family-medical-leave-premium', '/payroll-tax/washington', '/states-with-no-income-tax', '/state-paid-family-leave-payroll'],
  });

  program({
    path: '/massachusetts-pfml-contribution', label: 'Massachusetts PFML contribution', state: 'MA', id: 'MA_PFML_EE', ytdKey: 'statePaidLeave',
    title: 'Massachusetts PFML contribution withholding and the cap',
    description: "How Massachusetts Paid Family and Medical Leave contributions are withheld from employees: the percentage, the wage cap and a worked paycheck.",
    h1: 'Massachusetts PFML contribution', sub: 'Employee share of a Paid Family and Medical Leave contribution.',
    what: 'Massachusetts funds Paid Family and Medical Leave through a contribution on wages, up to the Social Security wage base. The employee share is 0.46% (0.28% medical plus 0.18% family) whatever the employer\'s size, and the employer remits it.',
    payer: 'Shared. The engine returns the employee\'s share as an employee line; the employer share appears separately where the employer is liable.',
    notes: ['The contribution is capped by the yearly wage limit.', 'The employer share depends on having 25 or more Massachusetts employees, a determination the caller supplies with the certificate flag <code>employerLiableForPaidLeaveShare</code>.', 'Track year-to-date in <code>ytd.statePaidLeave.MA</code>.', 'It is separate from Massachusetts income tax (<code>MA_SIT</code>).'],
    faq: [['Who pays Massachusetts PFML?', 'The contribution is shared between employer and employee. The employer remits it and may deduct the employee\'s share from wages.'], ['Is there a wage cap?', 'Yes. The contribution applies up to the Social Security wage base for the year.']],
    related: ['/payroll-tax/massachusetts', '/state-paid-family-leave-payroll', '/state-disability-insurance-payroll', '/take-home-pay/massachusetts'],
  });

  program({
    path: '/colorado-famli-premium', label: 'Colorado FAMLI premium', state: 'CO', id: 'CO_PFML_EE', ytdKey: 'statePaidLeave',
    title: 'Colorado FAMLI premium withholding: rate, cap and split',
    description: 'How the Colorado FAMLI paid leave premium is withheld: the percentage of wages up to the Social Security wage base, the employee share, and a worked check.',
    h1: 'Colorado FAMLI premium', sub: 'Paid family and medical leave, funded by a shared premium.',
    what: 'Colorado\'s Family and Medical Leave Insurance (FAMLI) program is funded by a premium on wages up to the Social Security wage base. The employee share applies whatever the employer\'s size; the employer share applies to employers with ten or more employees, and fewer than ten owe none.',
    payer: 'Shared. The engine returns the employee line; the employer share is a separate employer line when the employer owes it.',
    notes: ['The premium is capped by the Social Security wage base for the year.', 'Employer size affects the employer share, a determination the caller supplies with <code>employerLiableForPaidLeaveShare</code>.', 'Track year-to-date in <code>ytd.statePaidLeave.CO</code>.', 'A few Colorado cities add an occupational privilege tax, which is separate from FAMLI.'],
    faq: [['What is the Colorado FAMLI premium?', 'A percentage of wages up to the Social Security wage base that funds paid family and medical leave, shared between employer and employee.'], ['Is the employer share always owed?', 'No. Employers with fewer than ten employees owe no employer share, though the employee share is still withheld.']],
    related: ['/payroll-tax/colorado', '/state-paid-family-leave-payroll', '/states-with-local-income-tax', '/take-home-pay/colorado'],
  });

  program({
    path: '/connecticut-paid-leave-contribution', label: 'Connecticut Paid Leave contribution', state: 'CT', id: 'CT_PFML_EE', ytdKey: 'statePaidLeave',
    title: "Connecticut Paid Leave contribution: 0.5% withholding",
    description: 'How the Connecticut Paid Leave employee contribution is withheld: the rate, the yearly wage cap and a worked paycheck, separate from Connecticut income tax.',
    h1: 'Connecticut Paid Leave contribution', sub: 'An employee-funded contribution up to the Social Security wage base.',
    what: 'Connecticut Paid Leave is funded by an employee contribution on wages, up to the Social Security wage base. The employer withholds and remits it; there is no employer share.',
    payer: 'The employee, by payroll deduction.',
    notes: ['It is separate from Connecticut income tax (<code>CT_SIT</code>), which uses withholding code tables.', 'Wages above the Social Security wage base are not charged.', 'Track year-to-date in <code>ytd.statePaidLeave.CT</code>.', 'Employees exempt under the program\'s rules should be handled by the caller.'],
    faq: [['What is the Connecticut Paid Leave contribution rate?', 'It is a percentage of wages, charged to the employee up to the Social Security wage base. The engine states the rate on each line.'], ['Does the employer pay too?', 'No. The contribution is funded by employees.']],
    related: ['/payroll-tax/connecticut', '/state-paid-family-leave-payroll', '/payroll-tax-api-ytd-wages', '/take-home-pay/connecticut'],
  });

  program({
    path: '/rhode-island-tdi-withholding', label: 'Rhode Island TDI withholding', state: 'RI', id: 'RI_DBL_EE', ytdKey: 'stateDisabilityEmployee',
    title: "Rhode Island TDI withholding: Temporary Disability",
    description: 'How Rhode Island Temporary Disability Insurance (TDI) is withheld: an employee-paid percentage up to a wage cap, with a worked paycheck through the engine.',
    h1: 'Rhode Island Temporary Disability Insurance', sub: 'TDI and Temporary Caregiver Insurance, paid by the employee.',
    what: 'Rhode Island funds Temporary Disability Insurance and Temporary Caregiver Insurance through an employee payroll deduction on wages up to a yearly cap. The employer withholds it and pays it over.',
    payer: 'The employee. There is no employer share of this contribution.',
    notes: ['The wage cap is set each year by the state.', 'Track year-to-date in <code>ytd.stateDisabilityEmployee.RI</code>.', 'It is separate from Rhode Island income tax (<code>RI_SIT</code>).', 'Rhode Island is one of the few states with a state disability program funded by employees.'],
    faq: [['Who pays Rhode Island TDI?', 'The employee, through payroll deduction, up to the yearly wage cap.'], ['Is TDI the same as unemployment insurance?', 'No. Unemployment insurance is an employer tax. TDI is a separate employee-funded program for temporary disability.']],
    related: ['/payroll-tax/rhode-island', '/state-disability-insurance-payroll', '/payroll-tax-api-ytd-wages', '/take-home-pay/rhode-island'],
  });

  program({
    path: '/hawaii-tdi-withholding', label: 'Hawaii TDI withholding', state: 'HI', id: 'HI_DBL_EE',
    title: 'Hawaii TDI withholding: Temporary Disability Insurance',
    description: 'How Hawaii Temporary Disability Insurance is withheld: a percentage of wages with a weekly dollar cap, split between employee and employer, on a real paycheck.',
    h1: 'Hawaii Temporary Disability Insurance', sub: 'A percentage of wages with a small weekly cap.',
    what: 'Hawaii requires employers to provide Temporary Disability Insurance (TDI). The employee may be charged part of the cost through a payroll deduction that is at most 0.5% of wages, limited to a weekly maximum. The engine models that statutory ceiling, not a guaranteed exact figure, because the real employee share depends on the cost share the employer elects.',
    payer: 'The employee pays up to the ceiling; the employer pays the rest of the cost, in a split the employer elects.',
    notes: ['The cap is per week, so a biweekly check has twice the weekly cap.', 'Hawaii has state income tax with its own tables (<code>HI_SIT</code>).', 'Hawaii employers also pay unemployment, employment and training, and tech surcharge contributions; the response lists them as employer lines.', 'Hawaii also has prepaid health care requirements, which are an employer matter.'],
    faq: [['How is Hawaii TDI withheld?', 'As a percentage of wages with a weekly dollar cap for the employee share, deducted from pay.'], ['Does the employer also pay something for Hawaii TDI?', 'Yes. The employer pays the part of the cost the employee is not charged.']],
    related: ['/payroll-tax/hawaii', '/state-disability-insurance-payroll', '/take-home-pay/hawaii', '/state-unemployment-tax-rates'],
  });

  program({
    path: '/minnesota-paid-leave-premium', label: 'Minnesota Paid Leave premium', state: 'MN', id: 'MN_PFML_EE', ytdKey: 'statePaidLeave',
    title: 'Minnesota Paid Leave premium: employee and employer shares',
    description: 'How the Minnesota Paid Leave premium is withheld: the total rate split between employee and employer, the wage cap, and a worked check with both shares.',
    h1: 'Minnesota Paid Leave premium', sub: 'A shared premium that starts in 2026.',
    what: 'Minnesota Paid Leave is funded by a premium on wages up to the Social Security wage base. The total premium is split between employer and employee, and the employer may withhold the employee share from pay.',
    payer: 'Shared. In the engine\'s example the employee and employer lines are equal shares of the total premium.',
    notes: ['The employee rate is the same for every employer, size included. A small-employer discount comes entirely off the employer\'s own share.', 'The wage cap follows the Social Security wage base.', 'Track year-to-date in <code>ytd.statePaidLeave.MN</code>.', 'Minnesota income tax is a separate line (<code>MN_SIT</code>).'],
    faq: [['Who pays the Minnesota Paid Leave premium?', 'Employer and employee share the premium. The employer withholds the employee share from pay.'], ['Is there a wage cap?', 'Yes, at the Social Security wage base.']],
    related: ['/payroll-tax/minnesota', '/state-paid-family-leave-payroll', '/take-home-pay/minnesota', '/payroll-tax-api-ytd-wages'],
  });

  program({
    path: '/maine-paid-family-medical-leave-contribution', label: 'Maine PFML contribution', state: 'ME', id: 'ME_PFML_EE', ytdKey: 'statePaidLeave',
    title: "Maine Paid Family and Medical Leave contribution",
    description: 'How the Maine paid leave contribution is withheld from employees: the rate, the Social Security wage-base cap, and a worked paycheck through the engine.',
    h1: 'Maine Paid Family and Medical Leave contribution', sub: 'A shared contribution with a wage cap.',
    what: 'Maine funds Paid Family and Medical Leave through a contribution on wages up to the Social Security wage base. The cost is split between the employer and the employee, and the employer may withhold the employee share.',
    payer: 'Shared between employer and employee: the employee pays 0.5% and the employer share makes up the rest of the 1% total. Small employers may owe no employer share, which is an employer fact the caller supplies.',
    notes: ['Employer size affects the employer share.', 'Track year-to-date in <code>ytd.statePaidLeave.ME</code>.', 'Maine income tax is a separate line (<code>ME_SIT</code>).', 'Maine revised its withholding method during 2026; the check date picks the version that applies.'],
    faq: [['Who pays Maine PFML?', 'Employer and employee share the contribution. The employee share is withheld from pay.'], ['Where is the cap?', 'At the Social Security wage base for the year.']],
    related: ['/payroll-tax/maine', '/state-paid-family-leave-payroll', '/payroll-tax-api-effective-dating', '/take-home-pay/maine'],
  });

  // ---- hand-written, because they need more than one line -------------------------------------
  const nj = run(base('NJ'));
  add(def({
    path: '/new-jersey-payroll-contributions', label: 'New Jersey employee payroll contributions', group: 'State programs',
    title: "New Jersey payroll contributions: UI/WF, TDI and FLI",
    description: "The New Jersey payroll contributions an employee pays besides income tax: unemployment and workforce, temporary disability and family leave, on a worked check.",
    h1: 'New Jersey employee payroll contributions',
    sub: 'Four employee-side lines beside New Jersey income tax.',
    lead: p(`New Jersey is unusual for the number of contributions it takes from the employee as well as the employer. Besides income tax, a ${money(300_000)} biweekly check shows an employee unemployment and workforce contribution, a temporary disability contribution and a family leave insurance contribution, and the employer pays a disability contribution of its own.`),
    sections: [
      ['What the engine returns', pick(h, nj, ['NJ_SIT', 'NJ_UC_EE', 'NJ_DBL_EE', 'NJ_PFML_EE', 'NJ_DI_ER']) + p(`Employee lines: income tax ${money(line(nj, 'NJ_SIT')!.amount)}, unemployment and workforce ${money(line(nj, 'NJ_UC_EE')!.amount)}, temporary disability ${money(line(nj, 'NJ_DBL_EE')!.amount)} and family leave ${money(line(nj, 'NJ_PFML_EE')!.amount)}. The employer line for disability is ${money(line(nj, 'NJ_DI_ER')!.amount)}. Net pay is ${money(nj.netPay)}.`)],
      ['What each is', kv(h, ['Line', 'Meaning'], [
        ['<code>NJ_SIT</code>', 'State income tax from the New Jersey withholding tables.'],
        ['<code>NJ_UC_EE</code>', 'Employee share of unemployment insurance and workforce development.'],
        ['<code>NJ_DBL_EE</code>', 'Employee Temporary Disability Insurance contribution.'],
        ['<code>NJ_PFML_EE</code>', 'Employee Family Leave Insurance contribution.'],
        ['<code>NJ_DI_ER</code>', 'Employer disability insurance contribution.'],
      ])],
      ['Each has its own wage base', p(`The contributions apply to wages up to yearly bases set by the state, and the bases differ between the programs. The engine applies each against year-to-date wages. Send them as <code>ytd.stateUnemployment.NJ</code>, <code>ytd.stateDisabilityEmployee.NJ</code> and <code>ytd.statePaidLeave.NJ</code>.`)],
      ['Local', p(`The engine carries one New Jersey local jurisdiction; the <a href="/coverage">coverage page</a> names it.`)],
    ],
    faq: [
      { q: 'Which payroll taxes does New Jersey withhold from employees?', a: 'Income tax, an unemployment and workforce contribution, a temporary disability insurance contribution and a family leave insurance contribution.' },
      { q: 'Does the employer pay anything for New Jersey disability?', a: 'Yes. The engine returns an employer disability insurance line on top of the employee lines.' },
    ],
    related: ['/payroll-tax/new-jersey', '/state-disability-insurance-payroll', '/state-paid-family-leave-payroll', '/take-home-pay/new-jersey'],
  }));

  const orr = run(base('OR'));
  add(def({
    path: '/oregon-paid-leave-and-transit-tax', label: 'Oregon paid leave and statewide transit tax', group: 'State programs',
    title: "Oregon payroll: Paid Leave, transit tax and WBF",
    description: "The Oregon payroll lines beside income tax: Paid Leave Oregon, the statewide transit tax and the Workers' Benefit Fund assessment, on a real paycheck.",
    h1: 'Oregon Paid Leave, statewide transit tax and WBF',
    sub: 'Three employee-side lines that appear with Oregon income tax.',
    lead: p(`An Oregon paycheck has more state lines than the income tax. The engine returns Paid Leave Oregon, the statewide transit tax and the Workers' Benefit Fund assessment on a ${money(300_000)} biweekly check, and the employer matches the assessment.`),
    sections: [
      ['The lines', pick(h, orr, ['OR_SIT', 'OR_PFML_EE', 'OR_STT', 'OR_WBF_EE']) + p(`Net pay is ${money(orr.netPay)}.`)],
      ['What the engine says about each', ul(['OR_PFML_EE', 'OR_STT', 'OR_WBF_EE'].map((id) => `<strong>${h.esc(line(orr, id)!.name)}</strong> (${money(line(orr, id)!.amount)}): <em>${h.esc(line(orr, id)!.detail ?? '')}</em>`))],
      ['Caps and hours', p(`Paid Leave Oregon is capped at a yearly wage limit, tracked in <code>ytd.statePaidLeave.OR</code>. The Workers' Benefit Fund assessment is charged per hour worked, split equally between employee and employer. When the request does not carry <code>hoursWorked</code> the engine assumes a flat-rate period, which its detail text states. Send the hours for an exact figure.`)],
      ['Portland-area taxes', p(`Employees in the Portland region may also have the Metro Supportive Housing Services tax and the Multnomah County Preschool for All tax withheld; both are threshold-triggered taxes on higher incomes. Employers in particular transit districts owe payroll taxes of their own. The engine's Oregon rule file carries them; see <a href="/coverage">coverage</a> for the locations.`)],
    ],
    faq: [
      { q: 'What does Oregon withhold besides income tax?', a: 'Paid Leave Oregon contributions, the statewide transit tax, and the employee half of the Workers\' Benefit Fund assessment, each as its own line.' },
      { q: 'How is the Workers\' Benefit Fund assessment charged?', a: 'Per hour worked, split equally between employee and employer. Send hoursWorked for an exact figure; otherwise the engine uses a flat-rate period and says so.' },
    ],
    related: ['/payroll-tax/oregon', '/state-paid-family-leave-payroll', '/payroll-tax-api-ytd-wages', '/take-home-pay/oregon'],
  }));

  // ---- state lists, computed from the engine ---------------------------------------------------
  const codes = h.states.map((s) => s.code);
  const probe = codes.map((c) => {
    try { return { c, r: run(base(c)) }; } catch { return { c, r: null as Result | null }; }
  }).filter((x): x is { c: string; r: Result } => x.r !== null);
  const linesFor = (re: RegExp, payer?: 'employee' | 'employer') =>
    probe.flatMap(({ c, r }) => r.taxes.filter((t) => re.test(t.id) && (!payer || t.payer === payer)).map((t) => ({ c, t })));

  const dis = linesFor(/_(DBL|SDI)_EE$/);
  add(def({
    path: '/state-disability-insurance-payroll', label: 'States with disability insurance payroll deductions', group: 'State programs',
    title: "States with disability insurance payroll deductions",
    description: "Which states take a disability insurance contribution from employee pay, the line each produces on a $3,000 check, and who pays: CA, HI, NJ, NY and RI.",
    h1: 'States with disability insurance payroll deductions',
    sub: 'Where an employee-side SDI or TDI line appears on the paycheck.',
    lead: p(`Most states do not have a state disability insurance program. A few do, and in those the employee usually pays through payroll. The engine returns a line for each. This list is produced by running a ${money(300_000)} biweekly check in every state and listing those that return a disability line, so it cannot drift from the rules.`),
    sections: [
      ['The states', kv(h, ['State', 'Line', 'Amount on the check'], dis.map(({ c, t }) => [`<a href="/payroll-tax/${slugOf(c)}">${h.esc(nameOf(c))}</a>`, h.esc(t.name), money(t.amount)])).replace(/text-align:left/g, 'text-align:left') + p(`${dis.length} states return an employee disability line on this check.`)],
      ['How they differ', ul([
        'California charges a percentage of all wages with no yearly cap; Rhode Island charges a percentage up to a yearly wage cap.',
        'Some cap by the week at a small dollar amount (Hawaii, New York).',
        'New Jersey combines disability with family leave and unemployment lines of its own.',
        'In all of them the employer still owes unemployment tax.',
      ])],
      ['Related programs', p(`Paid family leave contributions are separate programs in some of the same states and others: see <a href="/state-paid-family-leave-payroll">states with paid family leave payroll deductions</a>.`)],
    ],
    faq: [
      { q: 'Which states have state disability insurance?', a: 'California, Hawaii, New Jersey, New York and Rhode Island run state-mandated disability programs funded in whole or part through employee deductions. The table above comes from running a paycheck in each state.' },
      { q: 'Does the employer also pay?', a: 'In some of them, yes. Hawaii and New York share the cost, and New Jersey has an employer disability line. California and Rhode Island are employee-funded.' },
    ],
    related: ['/california-sdi-withholding', '/new-jersey-payroll-contributions', '/hawaii-tdi-withholding', '/rhode-island-tdi-withholding'],
  }));

  const pfl = linesFor(/_PFML_(EE|ER)$/);
  add(def({
    path: '/state-paid-family-leave-payroll', label: 'States with paid family leave payroll deductions', group: 'State programs',
    title: 'States with paid family leave payroll contributions',
    description: 'Which states take paid family and medical leave contributions through payroll, who pays in each, and the line each produces on a $3,000 check.',
    h1: 'States with paid family leave payroll contributions',
    sub: 'Every state where the engine returns a paid-leave line, and which side pays.',
    lead: p(`State paid family and medical leave programs keep adding new payroll lines. Each state sets its own rate, wage cap and employer-employee split. This list comes from running a ${money(300_000)} biweekly check in every state and listing the paid-leave lines the engine returns.`),
    sections: [
      ['The lines', kv(h, ['State', 'Line', 'Paid by', 'Amount'], pfl.map(({ c, t }) => [`<a href="/payroll-tax/${slugOf(c)}">${h.esc(nameOf(c))}</a>`, h.esc(t.name), t.payer === 'employer' ? 'Employer' : 'Employee', money(t.amount)])) + p(`${new Set(pfl.map((x) => x.c)).size} jurisdictions return at least one paid-leave line on this check. California is not in the list because its State Disability Insurance contribution funds Paid Family Leave in one line: see <a href="/california-sdi-withholding">California SDI</a>.`)],
      ['Why it matters to an engine', ul([
        'The split between employee and employer differs by state, and sometimes by employer size.',
        'Most have a yearly wage cap, so year-to-date wages must be sent: <code>ytd.statePaidLeave</code>.',
        'Programs are added and rates change nearly every January, so the check date matters.',
        'Washington has no income tax, so its paid-leave and long-term-care lines are most of the state-specific paycheck there.',
      ])],
      ['Not shown', p(`States whose programs depend on employer choices the engine cannot see, such as a private plan election or employer size, show the default treatment. The state's own page and the response notices say when that applies. Delaware, for example, funds its program from the employer with an optional recovery from employees, which is an employer election and not a fixed rate.`)],
    ],
    faq: [
      { q: 'Which states have paid family leave contributions?', a: 'In the engine\'s data: Colorado, Connecticut, Maine, Massachusetts, Minnesota, New Jersey, New York, Oregon and Washington, and the District of Columbia. California funds Paid Family Leave through its SDI contribution. The table above lists the lines the engine returns.' },
      { q: 'Do employers or employees pay?', a: 'It depends on the state. Some are employee-funded, some employer-funded and some shared. The table shows which side each line is on.' },
    ],
    related: ['/state-disability-insurance-payroll', '/washington-paid-family-medical-leave-premium', '/massachusetts-pfml-contribution', '/colorado-famli-premium'],
  }));

  add(def({
    path: '/states-with-local-income-tax', label: 'States with local income tax', group: 'Local taxes',
    title: 'States with local income and wage taxes for payroll',
    description: `The ${h.cov.statesWithLocalTax} states where cities, counties or school districts tax wages in the engine's data, how many jurisdictions each has, and what is partial.`,
    h1: 'States with local income and wage taxes', sub: `${h.cov.localJurisdictions.toLocaleString('en-US')} jurisdictions in ${h.cov.statesWithLocalTax} states in the Omnia.tax data.`,
    lead: p(`Local income tax is the part of payroll tax most engines treat as an afterthought, and the part most likely to be wrong. A city, county or school district can tax wages by where the employee works, where they live or both. The engine carries ${h.cov.localJurisdictions.toLocaleString('en-US')} such jurisdictions in ${h.cov.statesWithLocalTax} states and publishes the list.`),
    sections: [
      ['Where local tax exists', p(`The <a href="/coverage">coverage page</a> lists every state and whether its local layer is listed in full or partial, with a count of jurisdictions. Highlights of the structures:`) + ul([
        '<strong>Ohio</strong>: municipal income tax, plus school district income taxes, found by address.',
        '<strong>Pennsylvania</strong>: earned income tax by taxing district, plus the local services tax.',
        '<strong>Michigan</strong>: 24 cities with their own resident and nonresident rates.',
        '<strong>Kentucky</strong>: occupational license taxes by city, county and school district.',
        '<strong>Indiana</strong>: county income taxes.',
        '<strong>Maryland</strong>: county rates built into state withholding.',
        '<strong>New York</strong>: New York City and Yonkers resident taxes.',
        '<strong>Alabama and West Virginia</strong>: partial coverage, with the gaps stated.',
      ])],
      ['Finding the right one', p(`The address decides. <code>POST /v1/address</code> takes a work address and a home address and returns the state, the local jurisdictions and the certificate fields a paycheck needs. See <a href="/address-tax-jurisdiction-lookup-api">address tax jurisdiction lookup</a>.`)],
      ['Partial is stated, not hidden', p(`Where a state's local data is incomplete the response says so and the coverage page lists which places are not covered. A rate that rests on a survey instead of the town's ordinance appears as a notice on the line. See <a href="/payroll-tax-api-data-quality-notices">data quality notices</a>.`)],
    ],
    faq: [
      { q: 'Which states have local income taxes?', a: `In the Omnia.tax data, ${h.cov.statesWithLocalTax} states, including Ohio, Pennsylvania, Michigan, Kentucky, Indiana, Maryland, New York, Alabama and West Virginia. The coverage page lists each.` },
      { q: 'How does the engine know which local tax applies?', a: 'From the work and home addresses. The address endpoint returns the jurisdictions and the certificate fields for the paycheck call.' },
    ],
    related: ['/local-payroll-tax-api', '/address-tax-jurisdiction-lookup-api', '/coverage', '/ohio-municipal-income-tax-withholding'],
  }));

  // ---- SUTA wage bases ranked -----------------------------------------------------------------
  const bases = h.states.map((s) => ({ s, base: h.wageBaseOf(s.d26.suiEmployer?.wageBase) })).filter((x): x is { s: (typeof h.states)[number]; base: number } => typeof x.base === 'number').sort((a, b) => b.base - a.base);
  add(def({
    path: '/suta-wage-base-by-state-ranked', label: 'SUTA wage base ranked by state', group: 'Employer taxes',
    title: 'SUTA wage base ranked: highest and lowest states in 2026',
    description: 'State unemployment tax wage bases for 2026 ranked from highest to lowest, with the most an employer pays per employee at the new-employer rate.',
    h1: 'SUTA wage base ranked by state', sub: 'Where the first dollars of each employee\'s pay cost the most.',
    lead: p(`State unemployment tax applies to the first slice of each employee's yearly wages, the wage base. States set it independently: from ${dollars(bases[bases.length - 1]!.base)} in ${h.esc(bases[bases.length - 1]!.s.name)} to ${dollars(bases[0]!.base)} in ${h.esc(bases[0]!.s.name)}. Combined with the new-employer rate it gives the most an employer pays per employee.`),
    sections: [
      ['Highest ten', kv(h, ['State', 'Wage base', 'New-employer rate', 'Most per employee'], bases.slice(0, 10).map(({ s, base }) => {
        const r = s.d26.suiEmployer?.newEmployerRate as number | undefined;
        return [`<a href="/unemployment-tax/${s.slug}">${h.esc(s.name)}</a>`, dollars(base), r !== undefined ? pct(r) : '—', r !== undefined ? dollars(Math.round(base * r)) : '—'];
      }))],
      ['Lowest ten', kv(h, ['State', 'Wage base', 'New-employer rate', 'Most per employee'], bases.slice(-10).reverse().map(({ s, base }) => {
        const r = s.d26.suiEmployer?.newEmployerRate as number | undefined;
        return [`<a href="/unemployment-tax/${s.slug}">${h.esc(s.name)}</a>`, dollars(base), r !== undefined ? pct(r) : '—', r !== undefined ? dollars(Math.round(base * r)) : '—'];
      }))],
      ['Reading the table', ul([
        'Experienced employers pay an assigned rate, not the new-employer rate, so the real cost can be lower or higher.',
        'The wage base resets each January, so unemployment tax is front-loaded in the year.',
        'Some states index the base to wages each year, so it rises without legislation.',
        'The federal FUTA base is separate and small: see <a href="/futa-suta-calculation">FUTA and SUTA calculation</a>.',
      ])],
      ['Every state', p(`See <a href="/unemployment-tax">unemployment tax by state</a> for the full list, and <a href="/state-unemployment-tax-rates">state unemployment tax rates</a> for the rates.`)],
    ],
    faq: [
      { q: 'Which state has the highest SUTA wage base?', a: `${bases[0]!.s.name} in the 2026 rules the engine uses, at ${dollars(bases[0]!.base)}.` },
      { q: 'Which has the lowest?', a: `${bases[bases.length - 1]!.s.name}, at ${dollars(bases[bases.length - 1]!.base)}.` },
    ],
    related: ['/unemployment-tax', '/state-unemployment-tax-rates', '/futa-suta-calculation', '/true-cost-of-an-employee'],
  }));

  // ---- 2027 changes ----------------------------------------------------------------------------
  const diffs = h.states.map((s) => ({ s, a: h.wageBaseOf(s.d26.suiEmployer?.wageBase), b: h.wageBaseOf(s.d27.suiEmployer?.wageBase) })).filter((x) => typeof x.a === 'number' && typeof x.b === 'number' && x.a !== x.b) as Array<{ s: (typeof h.states)[number]; a: number; b: number }>;
  const rateDiffs = h.states.filter((s) => typeof s.d26.flatRate?.rate === 'number' && typeof s.d27.flatRate?.rate === 'number' && s.d26.flatRate.rate !== s.d27.flatRate.rate);
  add(def({
    path: '/2027-payroll-tax-changes-by-state', label: '2027 payroll tax changes by state', group: 'States and rates',
    title: "2027 payroll tax changes by state: bases and rates",
    description: "What changes for payroll in 2027 in the engine's rule files: the Social Security wage base, state unemployment wage bases that move, and flat rates that change.",
    h1: '2027 payroll tax changes by state', sub: 'The figures that differ between the 2026 and 2027 rule files.',
    lead: p(`Payroll tax rules change every January. This page compares the 2026 and 2027 rule files the engine carries and lists what moves: the Social Security wage base, state unemployment wage bases, and flat income tax rates. Years that are not final carry a provisional notice in the response, so treat 2027 figures as the best available, not as settled.`),
    sections: [
      ['Federal', kv(h, ['Item', '2026', '2027'], [
        ['Social Security wage base', dollars(f().ssBase26), dollars(f().ssBase27)],
        ['Social Security rate', pct(f().ssRate), pct(f().ssRate)],
        ['Medicare rate', pct(f().medicare), pct(f().medicare)],
        ['Additional Medicare threshold', dollars(f().addlThreshold), dollars(f().addlThreshold)],
      ])],
      [`State unemployment wage bases that move (${diffs.length})`, diffs.length ? kv(h, ['State', '2026', '2027'], diffs.map(({ s, a, b }) => [`<a href="/unemployment-tax/${s.slug}">${h.esc(s.name)}</a>`, dollars(a), dollars(b)])) : p('No state unemployment wage base differs between the two rule files.')],
      [`Flat income tax rates that change (${rateDiffs.length})`, rateDiffs.length ? kv(h, ['State', '2026', '2027'], rateDiffs.map((s) => [`<a href="/payroll-tax/${s.slug}">${h.esc(s.name)}</a>`, pct(s.d26.flatRate.rate), pct(s.d27.flatRate.rate)])) : p('No flat income tax rate differs between the two rule files.')],
      ['How to use it', ul([
        'Run your year-end test paychecks with a 2027 check date to see the effect before January.',
        'Check the response <code>warnings</code> for provisional-year notices.',
        'Agency announcements after the date of the rule files may not be reflected; confirm with the state.',
      ])],
    ],
    faq: [
      { q: 'What is the Social Security wage base for 2027?', a: `${dollars(f().ssBase27)} in the engine's 2027 rule file, up from ${dollars(f().ssBase26)} in 2026.` },
      { q: 'Are the 2027 figures final?', a: 'Not necessarily. Years that are provisional carry a warning in the response. Confirm with the agency before relying on one.' },
    ],
    related: ['/payroll-tax-rates-2026', '/social-security-wage-base', '/payroll-tax-api-effective-dating', '/suta-wage-base-by-state-ranked'],
  }));
  function f() { return h.federalFacts(); }

  // ---- local taxes -----------------------------------------------------------------------------
  const nyc = run(base('NY', { nycResident: true }));
  const nyBase = run(base('NY'));
  add(def({
    path: '/nyc-resident-income-tax-withholding', label: 'New York City resident income tax withholding', group: 'Local taxes',
    title: "New York City resident income tax withholding",
    description: 'How New York City resident income tax is withheld: an extra line beside New York State tax, with the engine\'s numbers for a $3,000 biweekly check.',
    h1: 'New York City resident income tax withholding', sub: 'A separate city line for residents of the five boroughs.',
    lead: p(`Residents of New York City pay a city income tax on top of New York State income tax. Employers withhold it as its own line, based on where the employee lives, not where they work. The engine switches it on with a single certificate flag, <code>nycResident</code>.`),
    sections: [
      ['Same pay, resident and not', kv(h, ['', 'State income tax', 'City income tax', 'Net pay'], [
        ['Lives outside the city', money(line(nyBase, 'NY_SIT')!.amount), money(0), money(nyBase.netPay)],
        ['City resident', money(line(nyc, 'NY_SIT')!.amount), money(line(nyc, 'NY_NYC_SIT')!.amount), money(nyc.netPay)],
      ]).replace(/text-align:left/g, 'text-align:right') + p(`On ${money(300_000)} biweekly the city tax is <strong>${money(line(nyc, 'NY_NYC_SIT')!.amount)}</strong> and net pay falls by ${money(nyBase.netPay - nyc.netPay)}. The engine's detail: <em>${h.esc(detail(nyc, 'NY_NYC_SIT'))}</em>`)],
      ['In the request', code(h, `"workState": { "code": "NY", "certificate": { "nycResident": true } }`)],
      ['Points to remember', ul([
        'It follows residence. A New York State resident who lives in Westchester and works in Manhattan owes no city tax.',
        'Yonkers has its own resident tax: see <a href="/yonkers-income-tax-withholding">Yonkers income tax withholding</a>.',
        'Employers in the New York City area also owe the quarterly MCTMT, calculated by <code>/v1/employer-taxes</code>.',
        'Paid Family Leave and DBL lines appear as well: see <a href="/new-york-paid-family-leave-withholding">New York PFL</a>.',
      ])],
    ],
    faq: [
      { q: 'Who pays New York City income tax?', a: 'Residents of the five boroughs. It is withheld by the employer as a separate line from New York State income tax, based on where the employee lives.' },
      { q: 'Does working in New York City make me pay city tax?', a: 'Not by itself. The city resident tax follows residence, so a commuter who lives outside the city does not have it withheld.' },
    ],
    related: ['/yonkers-income-tax-withholding', '/payroll-tax/new-york', '/new-york-paid-family-leave-withholding', '/states-with-local-income-tax'],
  }));

  const yk = run(base('NY', { yonkersResident: true, nycResident: false }));
  add(def({
    path: '/yonkers-income-tax-withholding', label: 'Yonkers income tax withholding', group: 'Local taxes',
    title: 'Yonkers resident income tax withholding on a paycheck',
    description: "How Yonkers resident income tax is withheld alongside New York State tax, calculated as a percentage of the state tax, with the engine's numbers for $3,000.",
    h1: 'Yonkers income tax withholding', sub: 'A resident surcharge calculated from the state tax.',
    lead: p(`Yonkers, New York taxes its residents with a city income tax that is calculated from the New York State tax, not from wages directly. Employers withhold it as its own line. The engine switches it on with the certificate flag <code>yonkersResident</code>.`),
    sections: [
      ['On a paycheck', p(`On a ${money(300_000)} biweekly check the Yonkers line is <strong>${money(line(yk, 'NY_YONKERS_SIT')!.amount)}</strong> on top of state tax of ${money(line(yk, 'NY_SIT')!.amount)}. Net pay is ${money(yk.netPay)}, against ${money(nyBase.netPay)} for an employee who does not live in Yonkers. The engine's detail: <em>${h.esc(detail(yk, 'NY_YONKERS_SIT'))}</em>`)],
      ['In the request', code(h, `"workState": { "code": "NY", "certificate": { "yonkersResident": true } }`)],
      ['Points to remember', ul([
        'It follows residence, like the New York City tax.',
        'A Yonkers resident has no New York City tax; the two flags describe different places.',
        'There is a separate Yonkers nonresident earnings tax on people who work in the city but live elsewhere. Check the coverage page for what the engine carries.',
        'Extra withholding for Yonkers has its own certificate field.',
      ])],
    ],
    faq: [
      { q: 'How is Yonkers income tax calculated?', a: 'As a percentage of the New York State tax for residents, withheld by the employer as its own line.' },
      { q: 'Does it apply if I work in Yonkers but live elsewhere?', a: 'The resident tax does not. Yonkers has a separate nonresident earnings tax, which depends on the rules in force.' },
    ],
    related: ['/nyc-resident-income-tax-withholding', '/payroll-tax/new-york', '/states-with-local-income-tax', '/local-payroll-tax-api'],
  }));

  const ohCities = ['Columbus', 'Cincinnati', 'Youngstown'].map((c) => ({ c, r: run(base('OH', { residenceCity: c, workCity: c })) }));
  const ohc = ohCities[0]!.r;
  add(def({
    path: '/ohio-municipal-income-tax-withholding', label: 'Ohio municipal income tax withholding', group: 'Local taxes',
    title: 'Ohio municipal income tax withholding by city',
    description: 'How Ohio municipal income tax is withheld: the work-city rule, resident credits, and numbers for Columbus, Cincinnati and Youngstown on a $3,000 check.',
    h1: 'Ohio municipal income tax withholding', sub: `${count('OH')} Ohio local entries are in the data, the most of any state.`,
    lead: p(`Ohio cities tax wages, and employers withhold for the city where the employee works. That is the biggest difference from state tax, which follows residence. Ohio has many taxing municipalities, plus joint economic districts and school districts, and the rates differ. The engine resolves them by name from the certificate.`),
    sections: [
      ['Three cities, the same pay', kv(h, ['City', 'Rate', 'City tax on ' + money(300_000), 'Net pay'], ohCities.map(({ c, r }) => [c, pct(line(r, 'OH_LOCAL')!.amount / 300_000), money(line(r, 'OH_LOCAL')!.amount), money(r.netPay)])).replace(/text-align:left/g, 'text-align:right') + p(`The engine's explanation for Columbus: <em>${h.esc(detail(ohc, 'OH_LOCAL'))}</em> For Cincinnati: <em>${h.esc(detail(ohCities[1]!.r, 'OH_LOCAL'))}</em>`)],
      ['The rule that trips people', ul([
        'The work city is the one the employer withholds for, subject to the city\'s rules about days worked there.',
        'The home city may tax too, usually with a credit for tax paid to the work city. That credit is settled on the return, so the engine withholds for the work city.',
        'Some cities exempt nonresident workers below a threshold of days. The certificate carries that.',
      ])],
      ['In the request', code(h, `"workState": { "code": "OH",
  "certificate": { "residenceCity": "Columbus", "workCity": "Columbus" } }`) + p(`You can skip the names and resolve the address with <code>POST /v1/address</code>. See <a href="/address-tax-jurisdiction-lookup-api">address lookup</a>.`)],
      ['Count and coverage', p(`The Ohio data lists ${count('OH')} municipal, school district and joint economic district entries. The <a href="/coverage">coverage page</a> shows which are in the data and names them.`)],
    ],
    faq: [
      { q: 'Which Ohio city tax is withheld?', a: 'The tax of the city where the employee works. The home city may also tax the wages, usually with a credit for tax paid to the work city, which is settled on the return.' },
      { q: 'How do I find the right Ohio municipality?', a: 'Resolve the work address with the address endpoint, or pass the city names in the certificate.' },
    ],
    related: ['/states-with-local-income-tax', '/local-payroll-tax-api', '/address-tax-jurisdiction-lookup-api', '/payroll-tax/ohio'],
  }));

  const pa = run(base('PA', { workPSD: '510101', residencePSD: '510101', lstPSD: '510101' }));
  const paLst = run(base('PA', { workPSD: '010201', residencePSD: '010201', lstPSD: '010201' }));
  add(def({
    path: '/pennsylvania-eit-lst-withholding', label: 'Pennsylvania EIT and LST withholding', group: 'Local taxes',
    title: 'Pennsylvania EIT and LST withholding by PSD code',
    description: "How Pennsylvania Earned Income Tax and Local Services Tax are withheld by PSD code: resident and nonresident rates, with a Philadelphia worked check.",
    h1: 'Pennsylvania Earned Income Tax and Local Services Tax', sub: 'Local tax by Political Subdivision code, not by city name.',
    lead: p(`Pennsylvania local tax is organised by PSD code, a six-digit identifier for the taxing district. The Earned Income Tax (EIT) is a percentage of wages, withheld at the higher of the resident rate and the work-location nonresident rate. The Local Services Tax (LST) is a flat annual amount. The engine reads PSD codes from the certificate.`),
    sections: [
      ['A Philadelphia check', pick(h, pa, ['PA_SIT', 'PA_UC_EE', 'PA_EIT']) + p(`The EIT line is ${money(line(pa, 'PA_EIT')!.amount)}. The engine's detail: <em>${h.esc(detail(pa, 'PA_EIT'))}</em>`)],
      ['Resident in a different district', (() => {
        const diff = run(base('PA', { residencePSD: '880000', workPSD: '510101' }));
        return p(`Change the home district to one with no resident EIT (PSD 880000) while the work stays in Philadelphia and the line becomes ${money(line(diff, 'PA_EIT')!.amount)}: <em>${h.esc(detail(diff, 'PA_EIT'))}</em> The rule is that the employer withholds the higher of the two.`);
      })()],
      ['LST', p(`The Local Services Tax is a flat dollar amount per year, prorated over the pay periods. It has a municipal portion and a school district portion, each with its own low-income exemption threshold. Send <code>lstPSD</code> in the certificate. For PSD 010201 (Abbottstown Borough) the engine returns an LST line of ${money(line(paLst, 'PA_LST')!.amount)} on the ${money(300_000)} check: <em>${h.esc(detail(paLst, 'PA_LST'))}</em> A second employer need not withhold if shown proof of LST already withheld; the certificate flag <code>lstAlreadyWithheldElsewhere</code> skips the line.`)],
      ['Why it is hard', ul([
        `${count('PA')} PSD entries exist in the data, and they change often.`,
        'The tax collector for a district (not the city) usually sets how to remit.',
        'An employee can have a work PSD and a home PSD that disagree about the rate.',
        'The address endpoint resolves the PSD codes so the form does not need to ask.',
      ])],
    ],
    faq: [
      { q: 'What is a PSD code?', a: 'A six-digit Political Subdivision code that identifies a Pennsylvania taxing district. Local tax is looked up by PSD code.' },
      { q: 'Which EIT rate does the employer withhold?', a: 'The higher of the employee\'s resident rate and the nonresident rate at the work location.' },
    ],
    related: ['/states-with-local-income-tax', '/address-tax-jurisdiction-lookup-api', '/local-payroll-tax-api', '/payroll-tax/pennsylvania'],
  }));

  const mi = run(base('MI', { residenceCity: 'Detroit', workCity: 'Detroit' }));
  add(def({
    path: '/michigan-city-income-tax-withholding', label: 'Michigan city income tax withholding', group: 'Local taxes',
    title: "Michigan city income tax withholding: Detroit and more",
    description: 'How Michigan\'s 24 city income taxes are withheld: resident and nonresident rates, no netting of credits at withholding, and a Detroit worked check.',
    h1: 'Michigan city income tax withholding', sub: 'Twenty-four cities, each with a resident and a nonresident rate.',
    lead: p(`Michigan allows 24 cities to tax income under the Uniform City Income Tax Ordinance. A resident of a taxing city owes the city's resident rate on all earnings, wherever earned. A nonresident who works in a taxing city owes the lower nonresident rate on wages earned there.`),
    sections: [
      ['A Detroit check', pick(h, mi, ['MI_SIT', 'MI_LOCAL']) + p(`Net pay is ${money(mi.netPay)}. The engine's detail for the city line: <em>${h.esc(detail(mi, 'MI_LOCAL'))}</em>`)],
      ['Two cities, same pay', (() => {
        const gr = run(base('MI', { residenceCity: 'Grand Rapids', workCity: 'Grand Rapids' }));
        return kv(h, ['City', 'City tax', 'Net pay'], [['Detroit', money(line(mi, 'MI_LOCAL')!.amount), money(mi.netPay)], ['Grand Rapids', money(line(gr, 'MI_LOCAL')!.amount), money(gr.netPay)]]).replace(/text-align:left/g, 'text-align:right');
      })()],
      ['Residents who work elsewhere', p(`When a resident of one taxing city works in another, both cities can claim tax. The engine withholds both lines and does not net a credit at withholding time, because the inter-city credit is claimed on the return. If your policy is to withhold only one, send only that city.`)],
      ['In the request', code(h, `"certificate": { "residenceCity": "Detroit", "workCity": "Detroit" }`)],
    ],
    faq: [
      { q: 'How many Michigan cities have an income tax?', a: '24 cities levy one under the Uniform City Income Tax Ordinance.' },
      { q: 'What do nonresidents pay?', a: 'A lower nonresident rate on wages earned in the taxing city.' },
    ],
    related: ['/states-with-local-income-tax', '/local-payroll-tax-api', '/address-tax-jurisdiction-lookup-api', '/payroll-tax/michigan'],
  }));

  const ky = run(base('KY', { workCity: 'Louisville', workCounty: 'Jefferson', residenceCounty: 'Jefferson' }));
  add(def({
    path: '/kentucky-occupational-license-tax-withholding', label: 'Kentucky occupational license tax withholding', group: 'Local taxes',
    title: "Kentucky occupational license tax withholding",
    description: 'How Kentucky occupational license taxes are withheld: city, county and school district levies on wages, and the engine\'s Louisville worked paycheck.',
    h1: 'Kentucky occupational license tax withholding', sub: 'Local levies on wages by city, county and school district.',
    lead: p(`Kentucky's cities, counties and some school districts levy occupational license taxes on wages, and employers withhold them. They are commonly a percentage of gross wages. The engine carries ${count('KY')} Kentucky entries and picks the right ones from the certificate.`),
    sections: [
      ['A Louisville check', pick(h, ky, ['KY_SIT', 'KY_LOCAL']) + p(`The local line is ${money(line(ky, 'KY_LOCAL')!.amount)}. The engine says: <em>${h.esc(detail(ky, 'KY_LOCAL'))}</em>`)],
      ['Why Kentucky is its own case', ul([
        'City and county can both levy, and some tax the same wages.',
        'Louisville and Jefferson County are a consolidated metro government with one combined rate.',
        'School district occupational taxes exist in some counties and are separate.',
        'Residents and nonresidents may pay different rates.',
      ])],
      ['In the request', code(h, `"certificate": { "workCity": "Louisville", "workCounty": "Jefferson", "residenceCounty": "Jefferson" }`)],
      ['Stated gaps', p(`Where a Kentucky rate rests on a weaker source than the taxing body's own ordinance, the response carries a notice on the line. Read <a href="/payroll-tax-api-data-quality-notices">data quality notices</a>.`)],
    ],
    faq: [
      { q: 'Who pays Kentucky occupational license tax?', a: 'Employees working in a taxing city or county, by payroll withholding at the local rate.' },
      { q: 'Is it the same as state income tax?', a: 'No. It is a separate local levy on wages with its own rate and administration.' },
    ],
    related: ['/states-with-local-income-tax', '/local-payroll-tax-api', '/address-tax-jurisdiction-lookup-api', '/payroll-tax/kentucky'],
  }));

  const ind = run(base('IN', { county: 'Marion' }));
  add(def({
    path: '/indiana-county-income-tax-withholding', label: 'Indiana county income tax withholding', group: 'Local taxes',
    title: "Indiana county income tax withholding by county",
    description: 'How Indiana county income tax is withheld: the rate follows the employee\'s county on January 1, and the engine\'s Marion County worked check.',
    h1: 'Indiana county income tax withholding', sub: `${count('IN')} counties, one rate each, set mainly by where you live.`,
    lead: p(`Indiana's counties tax income, and the rate that applies depends on the county where the employee lives, with rules for those who live out of state but work in Indiana. Employers withhold it as a line beside state income tax. The engine resolves it from the certificate's <code>county</code>.`),
    sections: [
      ['A Marion County check', pick(h, ind, ['IN_SIT', 'IN_COUNTY']) + p(`The county line is ${money(line(ind, 'IN_COUNTY')!.amount)}. The engine says: <em>${h.esc(detail(ind, 'IN_COUNTY'))}</em>`)],
      ['What to supply', ul(['The county, in <code>certificate.county</code>. Indiana\'s rule is the county of residence on January 1, or, for someone who lives out of state on that date, the county of principal work.', 'Nothing else: the county rates are in the data.'])],
      ['Without a county', p(`Run the same check with no county and the engine does not guess. It returns a county line of ${money(line(run(base('IN')), 'IN_COUNTY')!.amount)} that says: <em>${h.esc(detail(run(base('IN')), 'IN_COUNTY'))}</em> A missing certificate is visible instead of silently zero.`)],
      ['Coverage', p(`The data carries ${count('IN')} Indiana counties. The list is on the <a href="/coverage">coverage page</a>.`)],
    ],
    faq: [
      { q: 'Which Indiana county tax applies?', a: 'The one for the county where the employee lives, set on a fixed date each year, with separate rules for out-of-state residents who work in Indiana.' },
      { q: 'Is the county tax part of the state tax?', a: 'No. It is a separate line, IN_COUNTY, beside IN_SIT.' },
    ],
    related: ['/states-with-local-income-tax', '/local-payroll-tax-api', '/address-tax-jurisdiction-lookup-api', '/payroll-tax/indiana'],
  }));

  const md = run(base('MD', { county: 'Montgomery' }));
  add(def({
    path: '/maryland-county-income-tax-withholding', label: 'Maryland county income tax withholding', group: 'Local taxes',
    title: 'Maryland county income tax withholding: 24 jurisdictions',
    description: 'How Maryland county income tax is withheld: the county rate is built into state withholding, nonresidents pay a special rate, and a Montgomery County check.',
    h1: 'Maryland county income tax withholding', sub: 'A local tax that travels inside the state line.',
    lead: p(`Maryland collects county income tax through the state, and employers withhold it together with state tax. There are 24 jurisdictions (23 counties and Baltimore City), almost all at a flat percentage of the same taxable income the state uses. Because the county rate is part of one line, <code>MD_SIT</code>, it is easy to miss.`),
    sections: [
      ['A Montgomery County check', p(`On ${money(300_000)} biweekly the combined Maryland line is ${money(line(md, 'MD_SIT')!.amount)}. The engine says: <em>${h.esc(detail(md, 'MD_SIT'))}</em>`)],
      ['Without a recognised county', (() => {
        const none = run(base('MD'));
        const nr = run(base('MD', { nonresident: true }));
        return kv(h, ['Case', 'Maryland line', 'Net pay'], [
          ['Montgomery County resident', money(line(md, 'MD_SIT')!.amount), money(md.netPay)],
          ['No county named', money(line(none, 'MD_SIT')!.amount), money(none.netPay)],
          ['Nonresident of Maryland', money(line(nr, 'MD_SIT')!.amount), money(nr.netPay)],
        ]).replace(/text-align:left/g, 'text-align:right') + p(`With no county the engine withholds the maximum local rate and says so in its detail, rather than guessing a lower one. A nonresident pays a special rate.`);
      })()],
      ['Two counties are tiered', p(`Anne Arundel and Frederick counties use their own internal brackets rather than a flat percentage. The rule file records both shapes.`)],
      ['In the request', code(h, `"workState": { "code": "MD", "certificate": { "county": "Montgomery" } }`)],
    ],
    faq: [
      { q: 'Is Maryland county tax a separate line?', a: 'In the engine it is part of the Maryland income tax line, MD_SIT, built from the state rate and the county rate together. The detail text shows both.' },
      { q: 'What if I do not give a county?', a: 'The engine withholds at the maximum local rate and states that in the line\'s detail, so a missing certificate is visible.' },
    ],
    related: ['/states-with-local-income-tax', '/payroll-tax/maryland', '/local-payroll-tax-api', '/payroll-tax-reciprocity-agreements'],
  }));

  const kc = run(base('MO', { locality: 'Kansas City' }));
  const stl = run(base('MO', { locality: 'St. Louis' }));
  add(def({
    path: '/kansas-city-st-louis-earnings-tax', label: 'Kansas City and St. Louis earnings tax', group: 'Local taxes',
    title: "Kansas City and St. Louis earnings tax withholding",
    description: 'How Missouri\'s two city earnings taxes are withheld: 1% in Kansas City and St. Louis, plus the St. Louis employer payroll expense tax, from the engine.',
    h1: 'Kansas City and St. Louis earnings tax', sub: 'Missouri has exactly two cities with this power.',
    lead: p(`Missouri allows only two cities, Kansas City and St. Louis, to levy an earnings tax on wages. Both apply to residents wherever they work, and to nonresidents on wages earned in the city. The engine switches them on from the certificate's <code>locality</code>.`),
    sections: [
      ['Two checks', kv(h, ['', 'City earnings tax', 'Employer city tax', 'Net pay'], [
        ['Kansas City', money(line(kc, 'KC_EARN')!.amount), money(0), money(kc.netPay)],
        ['St. Louis', money(line(stl, 'STL_EARN')!.amount), money(line(stl, 'STL_PAYROLL_ER')!.amount), money(stl.netPay)],
      ]).replace(/text-align:left/g, 'text-align:right') + p(`Both earnings taxes are ${pct(line(kc, 'KC_EARN')!.amount / 300_000)} of wages. St. Louis also charges employers a payroll expense tax on top, ${money(line(stl, 'STL_PAYROLL_ER')!.amount)} on this check. The engine says: <em>${h.esc(detail(stl, 'STL_PAYROLL_ER'))}</em>`)],
      ['In the request', code(h, `"workState": { "code": "MO", "certificate": { "locality": "Kansas City" } }`) + p(`The <code>locality</code> is the caller's determination of residence or work location in one of the two cities. The engine does not guess.`)],
      ['Notes', ul(['Missouri state withholding is a separate line.', 'The employer payroll expense tax does not reduce net pay.', 'These are city taxes administered by the cities, not by the state.'])],
    ],
    faq: [
      { q: 'Which Missouri cities have an earnings tax?', a: 'Kansas City and St. Louis. They are the only two cities in Missouri with the power to levy one.' },
      { q: 'Does the employer pay anything extra in St. Louis?', a: 'Yes. St. Louis has a payroll expense tax charged to employers on top of the employee earnings tax.' },
    ],
    related: ['/states-with-local-income-tax', '/local-payroll-tax-api', '/payroll-tax/missouri', '/payroll-tax-api-data-quality-notices'],
  }));

  const al = run(base('AL', { workCity: 'Birmingham' }));
  add(def({
    path: '/alabama-occupational-tax-withholding', label: 'Alabama occupational tax withholding', group: 'Local taxes',
    title: "Alabama occupational tax withholding: Birmingham",
    description: 'How Alabama city occupational taxes are withheld, which towns are confirmed from primary sources and which are survey-only, with a Birmingham worked check.',
    h1: 'Alabama occupational tax withholding', sub: 'Cities and counties tax wages by where the work is done.',
    lead: p(`Alabama cities and some counties levy occupational taxes on wages earned within their limits, and employers withhold them. They follow the work location, not residence. The engine carries Alabama municipalities with their source quality stated on each: a rate confirmed from the town's own ordinance is different from one that only appears in the Alabama League of Municipalities survey.`),
    sections: [
      ['A Birmingham check', pick(h, al, ['AL_SIT', 'AL_LOCAL']) + p(`The occupational line is ${money(line(al, 'AL_LOCAL')!.amount)}. The engine says: <em>${h.esc(detail(al, 'AL_LOCAL'))}</em>`)],
      ['Source quality is stated', kv(h, ['Tier', 'Meaning'], [
        ['Primary source', 'Rate confirmed from the municipality\'s own ordinance or official page.'],
        ['League survey only', 'Rate appears in the Alabama League of Municipalities survey, but the town\'s own document was not found.'],
        ['Conflicting sources', 'Sources disagree. The response carries a notice naming the conflict.'],
        ['Not modelled', 'The tax is known but its mechanics are not in the engine; the response says so.'],
      ])],
      ['Partial coverage', p(`The data carries ${count('AL')} Alabama jurisdictions, and the <a href="/coverage">coverage page</a> lists them and states that Alabama's local layer is partial. If a town is not in the list, the engine does not invent a rate for it.`)],
      ['In the request', code(h, `"certificate": { "workCity": "Birmingham" }`)],
    ],
    faq: [
      { q: 'Does Alabama have a local income tax?', a: 'Alabama cities and some counties levy occupational taxes on wages earned in their limits. They follow the work location.' },
      { q: 'Are all Alabama towns covered?', a: 'No. Alabama is partial. The coverage page lists the jurisdictions in the data, and lines that rest on a weaker source carry a notice.' },
    ],
    related: ['/states-with-local-income-tax', '/payroll-tax-api-data-quality-notices', '/coverage', '/payroll-tax/alabama'],
  }));

  return L;
}

import type { PaycheckInput } from '../../src/types.ts';
import { solveGrossUp } from './grossup.ts';
import { comparePaychecks } from './compare.ts';
import { def, inp, line, p, ul, kv, code, run, taxTable, pick, W4, type Helpers, type TopicDef } from './seo-more-kit.ts';

const reg = (amount: number) => ({ code: 'REG', category: 'regular', amount });
const sup = (amount: number) => ({ code: 'BON', category: 'supplemental', amount });
const ded = (category: string | null, amount: number) => ({ code: 'D', category, amount });

/** Calculation and withholding intents: the questions a payroll practitioner asks about how one number is reached. */
export function calcTopics(h: Helpers): TopicDef[] {
  const { money, dollars, pct } = h;
  const f = h.federalFacts();
  const L: TopicDef[] = [];
  const add = (t: TopicDef) => L.push(t);
  const base = (state = 'TX', gross = 300_000, extra: Record<string, unknown> = {}, w4: Record<string, unknown> = {}, cert: Record<string, unknown> = {}) =>
    ({ ...inp(h, state, cert, gross), federalW4: { ...W4, ...w4 }, ...extra }) as PaycheckInput;
  const fit = (r: ReturnType<typeof run>) => (line(r, 'US_FIT')?.amount ?? 0) + (line(r, 'US_FIT_SUPP')?.amount ?? 0);

  // ---- shared scenarios ----------------------------------------------------------------------
  const plain = run(base());
  const flatB = run(base('TX', 300_000, { earnings: [reg(300_000), sup(500_000)] }));
  const aggB = run(base('TX', 300_000, { earnings: [reg(300_000), reg(500_000)] }));
  const bonusOnly = run(base('TX', 300_000, { earnings: [sup(500_000)] }));
  const ssBase = Math.round(f.ssBase26 * 100);
  const crossYtd = { socialSecurity: ssBase, medicare: 80_000_000, futa: 0, supplemental: 80_000_000 };
  const cross = run(base('TX', 300_000, { earnings: [sup(40_000_000)], ytd: crossYtd }));
  const addl = run(base('TX', 1_000_000, {}, {}, {}));
  const addlYtd = run(base('TX', 1_000_000, { ytd: { socialSecurity: 0, medicare: 19_500_000, futa: 0 } }));
  const mj = run(base('TX', 300_000, {}, { multipleJobs: true }));
  const dep = run(base('TX', 300_000, {}, { dependentCredit: 400_000 }));
  const extraW = run(base('TX', 300_000, {}, { extraWithholding: 5_000 }));
  const exempt = run(base('TX', 300_000, {}, { exempt: true }));
  const mfj = run(base('TX', 300_000, {}, { filingStatus: 'married_joint' }));
  const hoh = run(base('TX', 300_000, {}, { filingStatus: 'head_of_household' }));
  const k401 = run(base('TX', 300_000, { deductions: [ded('deferral_401k', 30_000)] }));
  const hsa = run(base('TX', 300_000, { deductions: [ded('hsa', 30_000)] }));
  const s125 = run(base('TX', 300_000, { deductions: [ded('section125', 30_000)] }));
  const post = run(base('TX', 300_000, { deductions: [ded(null, 30_000)] }));
  const imputed = run(base('TX', 300_000, { earnings: [reg(300_000), { code: 'GTL', category: 'imputed', amount: 12_000 }] }));
  const reimb = run(base('TX', 300_000, { earnings: [reg(300_000), { code: 'MILE', category: 'reimbursement', amount: 20_000 }] }));
  const freq = (pf: string) => run(base('TX', 300_000, { payFrequency: pf }));
  const wk = freq('weekly'), bw = freq('biweekly'), sm = freq('semimonthly'), mo = freq('monthly');
  const ohInput = base('OH', 300_000, {}, {}, { residenceCity: 'Columbus', workCity: 'Columbus' });
  const oh = run(ohInput);
  const ca = run(base('CA'));

  // ---------------- Withholding and wages ------------------------------------------------------
  add(def({
    path: '/supplemental-wage-withholding-rates', label: 'Supplemental wage withholding rates', group: 'Withholding and wages',
    title: "Supplemental wage withholding: 22% flat, 37% over $1M",
    description: "The federal supplemental wage withholding rates for bonuses and commissions: the 22% flat rate, the mandatory 37% over $1 million, and the aggregate method.",
    h1: 'Supplemental wage withholding rates',
    sub: 'The federal flat rates for bonuses and similar pay, and when each applies.',
    lead: p(`Supplemental wages are pay on top of regular wages: bonuses, commissions, overtime pay paid separately, severance and similar payments. For federal income tax the employer has two ways to withhold on them. One is a flat rate. The other is to add the payment to regular wages and run the ordinary percentage method on the total. The rates below are read from the federal rule file the engine uses for 2026.`),
    sections: [
      ['The rates', kv(h, ['Situation', 'Federal withholding'], [
        ['Supplemental wages identified separately, flat-rate method', `${pct(0.22)} on the supplemental amount`],
        ['Cumulative supplemental wages to one employee over $1,000,000 in the year', `${pct(0.37)} on the part over $1,000,000, mandatory`],
        ['Aggregate method', 'Add to the regular payment and withhold on the total under the percentage method'],
      ])],
      ['A bonus, both ways', p(`An employee paid ${money(300_000)} regular biweekly pay gets a ${money(500_000)} bonus in the same check. Flat rate: federal withholding on the bonus is <strong>${money(line(flatB, 'US_FIT_SUPP')!.amount)}</strong> (${pct(0.22)} of ${money(500_000)}), plus ${money(line(flatB, 'US_FIT')!.amount)} on the regular pay, ${money(fit(flatB))} in total. Aggregate: the ${money(800_000)} is treated as one payment and federal withholding is <strong>${money(fit(aggB))}</strong>. The difference is ${money(Math.abs(fit(flatB) - fit(aggB)))} in this check, which is withholding only; the employee's actual tax is settled on their return.`)],
      ['How to ask for each', p(`Tag the earning <code>category: "supplemental"</code> for the flat method. Leave the bonus as <code>regular</code> to aggregate it. The engine does not guess which you intend, because the choice belongs to the employer and the rules allow either.`)],
      ['The $1 million line', p(`Send the supplemental wages paid so far this year in <code>ytd.supplemental</code>. When a check crosses $1,000,000 the engine splits it. A ${money(40_000_000)} bonus on top of ${money(80_000_000)} already paid this year returns federal withholding of ${money(line(cross, 'US_FIT_SUPP')!.amount)}, and the line explains why: <em>${h.esc(line(cross, 'US_FIT_SUPP')!.detail ?? '')}</em>`)],
      ['State rules differ', p(`States have their own supplemental treatment. Some use a flat rate, some require aggregation, some leave it to the employer. See <a href="/bonus-withholding-by-state">bonus withholding by state</a>.`)],
    ],
    faq: [
      { q: 'What is the federal supplemental wage withholding rate?', a: 'Under the flat-rate method it is 22% on supplemental wages identified separately from regular wages. Cumulative supplemental wages over $1,000,000 in a year are withheld at a mandatory 37% on the excess.' },
      { q: 'Can an employer use the aggregate method instead?', a: 'Yes. The employer may add the supplemental pay to regular wages for the period and withhold on the total using the percentage method.' },
      { q: 'Is withholding the same as the tax owed on a bonus?', a: 'No. Withholding is an advance. The employee\'s actual tax on the bonus is settled on their return, so a refund or a balance due is possible either way.' },
    ],
    related: ['/bonus-tax-withholding-calculation', '/flat-rate-vs-aggregate-bonus-withholding', '/bonus-over-one-million-withholding', '/bonus-withholding-by-state'],
  }));

  add(def({
    path: '/flat-rate-vs-aggregate-bonus-withholding', label: 'Flat rate vs aggregate bonus withholding', group: 'Withholding and wages',
    title: "Flat rate vs aggregate bonus withholding compared",
    description: 'Flat rate or aggregate method for bonus withholding? Worked checks at three bonus sizes show when each withholds more, and what that does to take-home pay.',
    h1: 'Flat rate vs aggregate bonus withholding',
    sub: 'Same bonus, two methods, different paychecks.',
    lead: p(`When a bonus is paid with regular pay, an employer can withhold on it at a flat federal rate or add it to the regular wages and withhold on the total. Which one withholds more depends on the size of the bonus and the employee's regular pay. Here are three bonus sizes on a ${money(300_000)} biweekly paycheck, run through the engine.`),
    sections: [
      ['Three bonus sizes', (() => {
        const rows = [100_000, 500_000, 2_000_000].map((b) => {
          const fl = run(base('TX', 300_000, { earnings: [reg(300_000), sup(b)] }));
          const ag = run(base('TX', 300_000, { earnings: [reg(300_000), reg(b)] }));
          return [money(b), money(fit(fl)), money(fit(ag)), money(fl.netPay), money(ag.netPay)];
        });
        return kv(h, ['Bonus', 'Federal withheld, flat', 'Federal withheld, aggregate', 'Net pay, flat', 'Net pay, aggregate'], rows).replace(/text-align:left/g, 'text-align:right');
      })()],
      ['What the pattern is', p(`Aggregate withholding annualises the combined check, so a large bonus makes the engine treat the employee as if they earn that much every pay period. That pushes it into higher brackets for that one check. The flat rate stays at ${pct(0.22)} regardless. For a small bonus the two are close. For a large bonus on modest regular pay, aggregation usually withholds more.`)],
      ['Which to choose', ul([
        '<strong>Flat rate</strong> is simple and predictable, and employees can see the number before the check. It requires the bonus to be identified separately from regular wages.',
        '<strong>Aggregate</strong> follows the employee\'s W-4 more closely and can over-withhold on one large check.',
        'Employers usually choose one policy and apply it consistently, but the rules allow the choice.',
      ])],
      ['The same check, in the API', p(`The only difference between the two requests is one field: the bonus earning's <code>category</code>, <code>supplemental</code> or <code>regular</code>.`) + code(h, `"earnings": [
  { "code": "REG", "category": "regular",       "amount": 300000 },
  { "code": "BON", "category": "supplemental",  "amount": 500000 }   // flat rate
]
// or, to aggregate:
  { "code": "BON", "category": "regular",       "amount": 500000 }`)],
    ],
    faq: [
      { q: 'Does the flat rate or the aggregate method withhold more?', a: 'It depends. Aggregation annualises the combined check, so a large bonus on modest regular pay usually withholds more than the 22% flat rate. For a small bonus the two are close.' },
      { q: 'Can I switch between methods?', a: 'The rules allow an employer to use either. Most apply one policy consistently, and the engine uses the method implied by how you categorise the earning.' },
    ],
    related: ['/supplemental-wage-withholding-rates', '/bonus-tax-withholding-calculation', '/bonus-gross-up-calculator', '/year-end-bonus-net-pay'],
  }));

  add(def({
    path: '/bonus-over-one-million-withholding', label: 'Bonus over $1 million withholding', group: 'Withholding and wages',
    title: "Bonus over $1 million: mandatory 37% withholding",
    description: "How federal withholding works once supplemental wages pass $1 million in a year: the mandatory 37% rate on the excess, with a worked check that crosses it.",
    h1: 'Bonus over $1 million: mandatory 37% withholding',
    sub: 'Past $1,000,000 of supplemental wages in a year, the flat rate is not optional.',
    lead: p(`Once an employee has been paid more than $1,000,000 of supplemental wages in a calendar year, federal withholding on the excess must be at the highest rate, ${pct(0.37)}, whatever method the employer normally uses. The engine tracks this from one number you send: <code>ytd.supplemental</code>.`),
    sections: [
      ['A check that crosses the line', p(`An executive has been paid ${money(80_000_000)} of supplemental wages so far this year and receives a ${money(40_000_000)} bonus. Only the first ${money(20_000_000)} of the bonus fits under $1,000,000.`) + pick(h, cross, ['US_FIT_SUPP', 'US_SS_EE', 'US_MED_EE', 'US_MED_ADDL']) + p(`Federal withholding on the bonus is ${money(line(cross, 'US_FIT_SUPP')!.amount)}. The line's own explanation: <em>${h.esc(line(cross, 'US_FIT_SUPP')!.detail ?? '')}</em> Social Security is ${money(line(cross, 'US_SS_EE')?.amount ?? 0)} because the year's wages already passed the wage base, and Additional Medicare of ${money(line(cross, 'US_MED_ADDL')!.amount)} applies to the whole check because the employee is already over ${dollars(f.addlThreshold)} for the year.`)],
      ['What you send', code(h, `"earnings": [{ "code": "BON", "category": "supplemental", "amount": 40000000 }],
"ytd": { "socialSecurity": 18450000, "medicare": 80000000, "futa": 0, "supplemental": 80000000 }`)],
      ['What to remember', ul([
        'The threshold is cumulative supplemental wages to one employee in the calendar year, not per check.',
        'Under $1,000,000 the engine uses the flat rate for supplemental wages, or aggregation if you categorise the pay as regular.',
        'This is withholding. The 37% rate does not change the employee\'s tax liability.',
        'State supplemental rules are separate and have no such threshold in most states.',
      ])],
    ],
    faq: [
      { q: 'What is the withholding rate on a bonus over $1 million?', a: 'Federal income tax withholding on supplemental wages above $1,000,000 in a calendar year is mandatory at 37%.' },
      { q: 'How does the API know the total so far?', a: 'You send the supplemental wages already paid this year in ytd.supplemental. The engine splits a check that crosses the line.' },
    ],
    related: ['/supplemental-wage-withholding-rates', '/additional-medicare-tax-withholding', '/payroll-tax-api-ytd-wages', '/bonus-tax-withholding-calculation'],
  }));

  add(def({
    path: '/additional-medicare-tax-withholding', label: 'Additional Medicare tax withholding', group: 'Withholding and wages',
    title: "Additional Medicare tax withholding: 0.9% over $200,000",
    description: 'How employers withhold Additional Medicare tax: 0.9% on wages over $200,000 in the year, no employer match, with a worked check that crosses the threshold.',
    h1: 'Additional Medicare tax withholding',
    sub: 'The 0.9% employee-only tax that starts partway through the year.',
    lead: p(`Additional Medicare tax is ${pct(f.addlMedicare)} on an employee's Medicare wages above ${dollars(f.addlThreshold)} in a calendar year. The employer withholds it once wages pass that figure, regardless of the employee's filing status, and does not match it. It is separate from regular Medicare, which is ${pct(f.medicare)} on every dollar with no cap.`),
    sections: [
      ['How the threshold works', p(`The engine needs to know the Medicare wages already paid this year, in <code>ytd.medicare</code>. A ${money(1_000_000)} check with no earlier wages owes no Additional Medicare tax, since it does not reach ${dollars(f.addlThreshold)}. The same check after ${money(19_500_000)} has already been paid crosses the line by ${money(500_000)}:`) + pick(h, addlYtd, ['US_MED_EE', 'US_MED_ER', 'US_MED_ADDL'])],
      ['Reading the example', p(`Regular Medicare is ${money(line(addlYtd, 'US_MED_EE')!.amount)} on the whole ${money(1_000_000)}, and the employer pays a matching ${money(line(addlYtd, 'US_MED_ER')!.amount)}. Additional Medicare is ${money(line(addlYtd, 'US_MED_ADDL')!.amount)}, which is ${pct(f.addlMedicare)} of the ${money(500_000)} over the threshold. There is no employer share of that line.`)],
      ['Without year-to-date wages', p(`Run the same ${money(1_000_000)} check with <code>ytd.medicare</code> at zero and the engine returns no Additional Medicare line (${money(line(addl, 'US_MED_ADDL')?.amount ?? 0)}). If your system does not track year-to-date wages, it will under-withhold in the check that should have started the tax. See <a href="/payroll-tax-api-ytd-wages">year-to-date wages</a>.`)],
      ['What it is not', ul([
        'It is not a second Medicare match for the employer.',
        'It does not depend on filing status for withholding, although the employee\'s actual liability on Form 8959 does.',
        'It is not capped.',
      ])],
    ],
    faq: [
      { q: 'When does Additional Medicare tax start?', a: 'Employers begin withholding 0.9% on the part of an employee\'s Medicare wages that exceeds $200,000 in the calendar year, whatever the employee\'s filing status.' },
      { q: 'Does the employer match Additional Medicare tax?', a: 'No. It is paid by the employee only.' },
    ],
    related: ['/medicare-tax-calculation', '/fica-tax-calculation', '/payroll-tax-api-ytd-wages', '/bonus-over-one-million-withholding'],
  }));

  add(def({
    path: '/social-security-wage-cap-paycheck', label: 'Social Security wage cap on a paycheck', group: 'Withholding and wages',
    title: "Social Security wage cap: a paycheck at the limit",
    description: 'How Social Security tax stops at the wage base: a worked paycheck that straddles the 2026 limit, the employer match, and why net pay jumps when the tax ends.',
    h1: 'Social Security wage cap on a paycheck',
    sub: `The tax is ${pct(f.ssRate)} up to ${dollars(f.ssBase26)} in 2026, and then it stops.`,
    lead: p(`Social Security tax applies to wages up to a yearly limit, the wage base: ${dollars(f.ssBase26)} for 2026 and ${dollars(f.ssBase27)} for 2027. Each of the employee and employer pays ${pct(f.ssRate)}. Past the limit the tax is zero, so net pay rises at the check where the cap is reached.`),
    sections: [
      ['The check that straddles the cap', (() => {
        const ytdAt = ssBase - 400_000;
        const c = run(base('TX', 1_000_000, { ytd: { socialSecurity: ytdAt, medicare: 0, futa: 0 } }));
        const after = run(base('TX', 1_000_000, { ytd: { socialSecurity: ssBase, medicare: 0, futa: 0 } }));
        const before = run(base('TX', 1_000_000));
        return p(`An employee paid ${money(1_000_000)} per check has ${money(ytdAt)} counted so far. Only ${money(400_000)} remains under the ${money(ssBase)} base.`) + kv(h, ['Check', 'Social Security (employee)', 'Net pay'], [
          ['Early in the year, nothing counted', money(line(before, 'US_SS_EE')!.amount), money(before.netPay)],
          ['The check that reaches the cap', money(line(c, 'US_SS_EE')!.amount), money(c.netPay)],
          ['Every check after the cap', money(line(after, 'US_SS_EE')?.amount ?? 0), money(after.netPay)],
        ]).replace(/text-align:left/g, 'text-align:right') + p(`The employer matches: the employer line at the cap check is ${money(line(c, 'US_SS_ER')!.amount)}.`);
      })()],
      ['Why the engine needs the year to date', p(`The only way to know the cap was reached is the Social Security wages already paid this year. Send them in <code>ytd.socialSecurity</code>. See <a href="/payroll-tax-api-ytd-wages">year-to-date wages</a>.`)],
      ['What counts toward the cap', ul([
        'Wages subject to Social Security tax, which excludes pre-tax Section 125 premiums but includes 401(k) deferrals.',
        'Only wages paid by this employer count, unless a successor-employer rule says otherwise.',
        'Medicare has no cap, so it keeps going: see <a href="/medicare-tax-calculation">Medicare tax calculation</a>.',
      ])],
      ['2026 and 2027', kv(h, ['Year', 'Wage base', 'Most the employee pays'], [
        ['2026', dollars(f.ssBase26), money(Math.round(f.ssBase26 * f.ssRate * 100))],
        ['2027', dollars(f.ssBase27), money(Math.round(f.ssBase27 * f.ssRate * 100))],
      ])],
    ],
    faq: [
      { q: 'What is the Social Security wage base for 2026?', a: `${dollars(f.ssBase26)}. Employee and employer each pay ${pct(f.ssRate)} on wages up to that amount.` },
      { q: 'Why does take-home pay jump near the end of the year for high earners?', a: 'Once wages reach the wage base, Social Security tax stops, so later checks have no Social Security withholding.' },
    ],
    related: ['/social-security-wage-base', '/fica-tax-calculation', '/payroll-tax-api-ytd-wages', '/medicare-tax-calculation'],
  }));

  add(def({
    path: '/medicare-tax-calculation', label: 'Medicare tax calculation', group: 'Withholding and wages',
    title: 'Medicare tax calculation: rates, no cap, employer match',
    description: "How Medicare tax is calculated on a paycheck: 1.45% each for employee and employer on all wages, which deductions reduce it, and when 0.9% extra starts.",
    h1: 'Medicare tax calculation',
    sub: 'A flat percentage on every dollar, with one add-on for high earners.',
    lead: p(`Medicare tax is ${pct(f.medicare)} for the employee and ${pct(f.medicare)} for the employer, on all wages. Unlike Social Security it has no wage base, so it never stops. Above ${dollars(f.addlThreshold)} in a year the employee also owes Additional Medicare tax, which the employer does not match.`),
    sections: [
      ['A plain check', p(`On a ${money(plain.grossPay)} biweekly check the employee's Medicare is ${money(line(plain, 'US_MED_EE')!.amount)} and the employer's is ${money(line(plain, 'US_MED_ER')!.amount)}. Both are ${pct(f.medicare)} of ${money(plain.grossPay)}.`)],
      ['What lowers the Medicare wage', p(`Pre-tax deductions under a Section 125 cafeteria plan (health premiums, an HSA through the plan, FSAs) are exempt. A 401(k) deferral is not: it reduces income tax wages but not Medicare wages. Run a ${money(30_000)} deduction each way:`) + kv(h, ['Deduction', 'Medicare wages', 'Employee Medicare'], [
        ['None', money(line(plain, 'US_MED_EE')!.taxableWages), money(line(plain, 'US_MED_EE')!.amount)],
        ['401(k) deferral', money(line(k401, 'US_MED_EE')!.taxableWages), money(line(k401, 'US_MED_EE')!.amount)],
        ['Section 125 health premium', money(line(s125, 'US_MED_EE')!.taxableWages), money(line(s125, 'US_MED_EE')!.amount)],
        ['HSA through payroll', money(line(hsa, 'US_MED_EE')!.taxableWages), money(line(hsa, 'US_MED_EE')!.amount)],
      ]).replace(/text-align:left/g, 'text-align:right')],
      ['Additional Medicare', p(`It starts above ${dollars(f.addlThreshold)} of Medicare wages in the year and is ${pct(f.addlMedicare)} for the employee only. See <a href="/additional-medicare-tax-withholding">Additional Medicare tax withholding</a>.`)],
      ['Who it applies to', p(`Almost every employee. There are narrow exceptions for particular kinds of work, such as election workers paid below a yearly threshold, and the engine's federal rule file records the employment categories it knows about.`)],
    ],
    faq: [
      { q: 'What is the Medicare tax rate?', a: `${pct(f.medicare)} for the employee and ${pct(f.medicare)} for the employer, on all wages with no cap. Employees also pay ${pct(f.addlMedicare)} Additional Medicare on wages above ${dollars(f.addlThreshold)}.` },
      { q: 'Does a 401(k) deferral reduce Medicare tax?', a: 'No. A 401(k) deferral reduces income tax wages but remains subject to Social Security and Medicare. Section 125 premiums reduce both.' },
    ],
    related: ['/fica-tax-calculation', '/additional-medicare-tax-withholding', '/pre-tax-deduction-tax-treatment', '/social-security-wage-cap-paycheck'],
  }));

  add(def({
    path: '/w4-multiple-jobs-withholding', label: 'W-4 multiple jobs withholding', group: 'Withholding and wages',
    title: 'W-4 multiple jobs checkbox: what it does to withholding',
    description: 'What Step 2 of the Form W-4 (the multiple jobs checkbox) does to federal withholding, shown on a real paycheck: how much more is withheld and why.',
    h1: 'W-4 multiple jobs withholding (Step 2)',
    sub: 'One checkbox that changes which table the paycheck uses.',
    lead: p(`Step 2 of the Form W-4 is for employees with more than one job, or a spouse who works. Ticking the box tells the employer to withhold at a higher rate so that the combined jobs do not under-withhold. In the percentage method it switches the employer to a different bracket schedule. The effect on one paycheck is large.`),
    sections: [
      ['The same pay, box ticked and not', kv(h, ['', 'Federal income tax', 'Net pay'], [
        ['Box not ticked', money(line(plain, 'US_FIT')!.amount), money(plain.netPay)],
        ['Box ticked', money(line(mj, 'US_FIT')!.amount), money(mj.netPay)],
      ]).replace(/text-align:left/g, 'text-align:right') + p(`On ${money(plain.grossPay)} biweekly for a single filer, ticking Step 2 raises federal withholding from ${money(line(plain, 'US_FIT')!.amount)} to ${money(line(mj, 'US_FIT')!.amount)}, a difference of ${money(line(mj, 'US_FIT')!.amount - line(plain, 'US_FIT')!.amount)} a check. The engine's explanation for the ticked case: <em>${h.esc(line(mj, 'US_FIT')!.detail ?? '')}</em>`)],
      ['Why it withholds more', p(`Without the box, each employer withholds as if their job were the only income, using the full standard deduction and low brackets. With two jobs that happens twice, and together they under-withhold. The higher-withholding schedule halves the benefit of the standard deduction and brackets to compensate.`)],
      ['In the request', code(h, `"federalW4": { "filingStatus": "single", "multipleJobs": true,
  "dependentCredit": 0, "otherIncome": 0, "deductions": 0, "extraWithholding": 0 }`)],
      ['Notes', ul([
        'It applies to the 2020-or-later Form W-4. Employees on an older form follow different rules, which the engine also carries.',
        'The checkbox is one way to complete Step 2; the worksheet or estimator on the form is another, and the result goes into other entries.',
        'It affects withholding only. The employee\'s tax is settled on their return.',
      ])],
    ],
    faq: [
      { q: 'What does checking the multiple jobs box on the W-4 do?', a: 'It switches the employer to a higher-withholding bracket schedule so that two jobs together do not under-withhold. On a single filer paid $3,000 biweekly, it raises federal withholding noticeably each check.' },
      { q: 'Does it change Social Security or Medicare?', a: 'No. It affects federal income tax withholding only.' },
    ],
    related: ['/federal-income-tax-withholding-calculator', '/w4-dependent-credit-withholding', '/w4-extra-withholding', '/income-tax-withholding-api'],
  }));

  add(def({
    path: '/w4-dependent-credit-withholding', label: 'W-4 dependent credit withholding', group: 'Withholding and wages',
    title: 'W-4 Step 3 dependents credit: how it reduces withholding',
    description: 'How the Form W-4 Step 3 dependents credit lowers federal withholding: the annual amount is spread across pay periods, shown on a real biweekly paycheck.',
    h1: 'W-4 dependents credit (Step 3)',
    sub: 'An annual credit, spread evenly across the year\'s paychecks.',
    lead: p(`Step 3 of the Form W-4 lets an employee claim credits for qualifying children and other dependents. The employer does not apply the credit to wages. They subtract it from the tentative tax, spread over the pay periods in the year. So a ${money(400_000)} annual credit on a biweekly schedule lowers each check's federal withholding by ${money(400_000)} divided by 26.`),
    sections: [
      ['The arithmetic, from the engine', kv(h, ['', 'Federal income tax', 'Net pay'], [
        ['No credit', money(line(plain, 'US_FIT')!.amount), money(plain.netPay)],
        [`${money(400_000)} annual credit`, money(line(dep, 'US_FIT')!.amount), money(dep.netPay)],
      ]).replace(/text-align:left/g, 'text-align:right') + p(`Withholding falls by ${money(line(plain, 'US_FIT')!.amount - line(dep, 'US_FIT')!.amount)} per check, which is ${money(400_000)} ÷ 26 rounded to the cent. The line's detail ends: <em>${h.esc((line(dep, 'US_FIT')!.detail ?? '').split(';').slice(-1)[0]!.trim())}</em>`)],
      ['What the engine needs', code(h, `"federalW4": { "filingStatus": "single", "multipleJobs": false,
  "dependentCredit": 400000,   // Step 3 total, in cents per year
  "otherIncome": 0, "deductions": 0, "extraWithholding": 0 }`)],
      ['Points that catch people', ul([
        'The amount is the Step 3 total for the year, not per check.',
        'The credit cannot reduce federal withholding below zero.',
        'It does not change Social Security or Medicare.',
        'The pay frequency matters: the same annual credit gives a larger per-check reduction on a monthly schedule than a weekly one.',
      ])],
    ],
    faq: [
      { q: 'How does the W-4 Step 3 credit change my paycheck?', a: 'The annual credit is divided by the number of pay periods and subtracted from each check\'s federal income tax withholding. A $4,000 credit on a biweekly schedule lowers each check by about $153.85.' },
      { q: 'Does the credit affect Social Security or Medicare tax?', a: 'No. It only reduces federal income tax withholding.' },
    ],
    related: ['/w4-multiple-jobs-withholding', '/w4-extra-withholding', '/federal-income-tax-withholding-calculator', '/income-tax-withholding-api'],
  }));

  add(def({
    path: '/w4-extra-withholding', label: 'W-4 extra withholding', group: 'Withholding and wages',
    title: "W-4 extra withholding (Step 4c): a fixed amount per check",
    description: 'How extra withholding on Form W-4 line 4(c) works: a fixed amount added to each paycheck on top of the calculated federal tax, with a worked example.',
    h1: 'W-4 extra withholding (Step 4c)',
    sub: 'A flat amount on top of whatever the percentage method says.',
    lead: p(`Line 4(c) of the Form W-4 lets an employee ask for an extra fixed amount to be withheld each pay period. It is the simplest way to fix an expected balance due: the employer calculates federal tax as usual, then adds the amount.`),
    sections: [
      ['One example', p(`Adding ${money(5_000)} on the ${money(plain.grossPay)} check changes federal withholding from ${money(line(plain, 'US_FIT')!.amount)} to ${money(line(extraW, 'US_FIT')!.amount)}, exactly ${money(5_000)} more, and net pay from ${money(plain.netPay)} to ${money(extraW.netPay)}. The line's detail ends: <em>${h.esc((line(extraW, 'US_FIT')!.detail ?? '').split(';').slice(-1)[0]!.trim())}</em>`)],
      ['How it differs from the other entries', kv(h, ['Entry', 'Effect'], [
        ['Step 2, multiple jobs', 'Changes the bracket schedule.'],
        ['Step 3, dependents', 'Subtracts an annual credit, spread over pay periods.'],
        ['Step 4(a), other income', 'Adds annual income before the percentage method.'],
        ['Step 4(b), deductions', 'Subtracts annual deductions before the percentage method.'],
        ['Step 4(c), extra withholding', 'Adds a flat amount to each check.'],
      ])],
      ['In the request', code(h, `"federalW4": { "filingStatus": "single", "multipleJobs": false,
  "dependentCredit": 0, "otherIncome": 0, "deductions": 0,
  "extraWithholding": 5000 }   // per paycheck, in cents`)],
      ['Remember', ul([
        'It is per pay period, not per year.',
        'It stays until the employee files a new Form W-4.',
        'It applies to federal withholding only. State extra withholding is a separate field on the state certificate where the state offers one.',
      ])],
    ],
    faq: [
      { q: 'What is line 4(c) on the Form W-4?', a: 'Extra withholding: a fixed dollar amount the employee asks the employer to withhold from every paycheck, on top of the amount calculated from the rest of the form.' },
      { q: 'Does extra withholding carry to state tax?', a: 'No. It applies to federal income tax. Some states have their own extra-withholding entry on the state certificate.' },
    ],
    related: ['/w4-multiple-jobs-withholding', '/w4-dependent-credit-withholding', '/federal-income-tax-withholding-calculator', '/exempt-from-withholding-w4'],
  }));

  add(def({
    path: '/exempt-from-withholding-w4', label: 'Exempt from withholding on the W-4', group: 'Withholding and wages',
    title: "Exempt on the W-4: what federal withholding still applies",
    description: 'What exempt on the Form W-4 does: no federal income tax withheld, but Social Security and Medicare still apply. A worked paycheck shows which lines disappear.',
    h1: 'Exempt from federal withholding on the W-4',
    sub: 'Exempt removes one tax line, not all of them.',
    lead: p(`An employee can write "Exempt" on the Form W-4 if they expect to owe no federal income tax this year, under conditions set out on the form. The employer then withholds no federal income tax. But exempt status applies to income tax only. FICA still applies, and so can state tax.`),
    sections: [
      ['A paycheck, exempt and not', kv(h, ['', 'Federal income tax', 'Social Security', 'Medicare', 'Net pay'], [
        ['Not exempt', money(line(plain, 'US_FIT')!.amount), money(line(plain, 'US_SS_EE')!.amount), money(line(plain, 'US_MED_EE')!.amount), money(plain.netPay)],
        ['Exempt', money(line(exempt, 'US_FIT')?.amount ?? 0), money(line(exempt, 'US_SS_EE')!.amount), money(line(exempt, 'US_MED_EE')!.amount), money(exempt.netPay)],
      ]).replace(/text-align:left/g, 'text-align:right')],
      ['Reading it', p(`On the ${money(plain.grossPay)} check, the federal income tax line of ${money(line(plain, 'US_FIT')!.amount)} disappears. Social Security (${money(line(exempt, 'US_SS_EE')!.amount)}) and Medicare (${money(line(exempt, 'US_MED_EE')!.amount)}) are unchanged, so net pay rises by ${money(exempt.netPay - plain.netPay)} and not by the full amount of the gross.`)],
      ['Things to know', ul([
        'An exempt claim must be renewed each year; it lapses if a new form is not given by the date the rules set.',
        'It does not exempt the employee from state income tax. Each state has its own certificate and its own exempt rules.',
        'An employee who claims exempt but is not entitled to may owe tax and penalties at filing time.',
      ])],
      ['In the request', code(h, `"federalW4": { "filingStatus": "single", "multipleJobs": false,
  "dependentCredit": 0, "otherIncome": 0, "deductions": 0,
  "extraWithholding": 0, "exempt": true }`)],
    ],
    faq: [
      { q: 'Does exempt on the W-4 stop Social Security and Medicare?', a: 'No. Exempt status covers federal income tax withholding only. Social Security and Medicare are still withheld.' },
      { q: 'Does it stop state income tax?', a: 'Not by itself. States have their own withholding certificates and exemption rules.' },
    ],
    related: ['/w4-extra-withholding', '/federal-income-tax-withholding-calculator', '/fica-tax-calculation', '/income-tax-withholding-api'],
  }));

  add(def({
    path: '/w4-filing-status-withholding', label: 'W-4 filing status withholding', group: 'Withholding and wages',
    title: "W-4 filing status and withholding compared",
    description: 'How the filing status on the Form W-4 changes federal withholding, shown on one paycheck: single, married filing jointly and head of household side by side.',
    h1: 'W-4 filing status and withholding',
    sub: 'Three filing statuses, three different amounts on the same pay.',
    lead: p(`The filing status in Step 1 of the Form W-4 chooses the standard-deduction adjustment and the bracket table used to withhold. The same wages produce different federal income tax for each status.`),
    sections: [
      ['The same pay, three statuses', kv(h, ['Filing status', 'Federal income tax', 'Net pay'], [
        ['Single or married filing separately', money(line(plain, 'US_FIT')!.amount), money(plain.netPay)],
        ['Married filing jointly', money(line(mfj, 'US_FIT')!.amount), money(mfj.netPay)],
        ['Head of household', money(line(hoh, 'US_FIT')!.amount), money(hoh.netPay)],
      ]).replace(/text-align:left/g, 'text-align:right') + p(`All three use ${money(plain.grossPay)} paid biweekly. The married-filing-jointly employee has ${money(line(plain, 'US_FIT')!.amount - line(mfj, 'US_FIT')!.amount)} less withheld each check than the single employee.`)],
      ['Why they differ', p(`Each status carries a different standard deduction and wider or narrower brackets. The engine's explanation for married filing jointly: <em>${h.esc(line(mfj, 'US_FIT')!.detail ?? '')}</em> Compare with single: <em>${h.esc(line(plain, 'US_FIT')!.detail ?? '')}</em>`)],
      ['Request values', ul(['<code>single</code>', '<code>married_joint</code>', '<code>head_of_household</code>']) + p(`Social Security and Medicare do not depend on filing status.`)],
    ],
    faq: [
      { q: 'How does filing status change withholding?', a: 'It selects the standard-deduction adjustment and the bracket table. Married filing jointly withholds less than single on the same wages because the deduction is larger and the brackets are wider.' },
      { q: 'Does filing status change FICA?', a: 'No. Social Security and Medicare are the same for every filing status.' },
    ],
    related: ['/federal-income-tax-withholding-calculator', '/w4-multiple-jobs-withholding', '/w4-dependent-credit-withholding', '/income-tax-withholding-api'],
  }));

  add(def({
    path: '/overtime-pay-tax-withholding', label: 'Overtime pay tax withholding', group: 'Withholding and wages',
    title: "Overtime pay tax withholding on a paycheck",
    description: "How overtime is taxed in payroll: ordinary wages for federal tax, Social Security and Medicare, why a big overtime check withholds more, and a worked example.",
    h1: 'Overtime pay tax withholding',
    sub: 'Overtime is not taxed at a special rate. It just makes the check bigger.',
    lead: p(`There is no separate overtime tax rate. Overtime pay is wages: federal income tax, Social Security and Medicare apply as they do to regular pay. A large overtime check can feel heavily taxed because the percentage method annualises the check, treating a big one-off period as a regular high income.`),
    sections: [
      ['Regular and overtime, side by side', (() => {
        const ot = run(base('TX', 300_000, { earnings: [reg(300_000), { code: 'OT', category: 'regular', amount: 150_000, overtime: true }] }));
        return kv(h, ['', 'Gross', 'Federal income tax', 'Net pay'], [
          ['Regular pay only', money(plain.grossPay), money(line(plain, 'US_FIT')!.amount), money(plain.netPay)],
          ['Plus a ' + money(150_000) + ' overtime line', money(ot.grossPay), money(line(ot, 'US_FIT')!.amount), money(ot.netPay)],
        ]).replace(/text-align:left/g, 'text-align:right') + p(`Adding ${money(150_000)} of overtime raises federal withholding by ${money(line(ot, 'US_FIT')!.amount - line(plain, 'US_FIT')!.amount)}, which is ${((line(ot, 'US_FIT')!.amount - line(plain, 'US_FIT')!.amount) / 150_000 * 100).toFixed(1)}% of the overtime, because the extra pay sits in a higher bracket in the annualised calculation. It is the same rate the employee would pay on any ${money(450_000)} check.`);
      })()],
      ['Why it looks like more', ul([
        'The percentage method assumes every check is like this one, so a bigger check annualises to a bigger yearly income.',
        'The employee\'s actual tax for the year is settled on their return, where overtime is taxed like other income.',
        'A pay stub that shows overtime separately makes the withheld percentage look higher than the stated rate.',
      ])],
      ['A flag, for one state', p(`The earning has an <code>overtime</code> flag. Almost every jurisdiction ignores it. One state rule that excluded overtime from taxable wages (Alabama, for a limited period in 2024 and 2025) reads it. Outside such a rule, overtime is just wages of its category.`)],
      ['Categorise it', p(`The IRS lists overtime pay among supplemental wages when it is paid separately from regular wages, and treats it as part of regular wages when paid in the same check. Send overtime as <code>regular</code> to withhold with the aggregate method, or as <code>supplemental</code> to use the flat supplemental rate, per your policy. See <a href="/flat-rate-vs-aggregate-bonus-withholding">flat rate vs aggregate</a>.`)],
    ],
    faq: [
      { q: 'Is overtime taxed at a higher rate?', a: 'No. Overtime is ordinary wages. It looks higher because a bigger check annualises to a higher bracket in the withholding calculation, but the employee\'s actual tax is settled on their return.' },
      { q: 'Are Social Security and Medicare taken from overtime?', a: 'Yes. They apply to all wages up to the Social Security wage base.' },
    ],
    related: ['/commission-tax-withholding', '/supplemental-wage-withholding-rates', '/hourly-employee-paycheck-calculation', '/paycheck-calculation-formula'],
  }));

  add(def({
    path: '/commission-tax-withholding', label: 'Commission tax withholding', group: 'Withholding and wages',
    title: 'Commission tax withholding: flat rate or aggregate',
    description: 'How commissions are taxed in payroll: the flat 22% supplemental rate or aggregation with regular pay, with a worked check and what to categorise in the API.',
    h1: 'Commission tax withholding',
    sub: 'Commissions are supplemental wages. Pick a method and be consistent.',
    lead: p(`Commissions are supplemental wages for federal withholding. An employer can withhold at the flat ${pct(0.22)} rate when the commission is paid separately from regular pay, or aggregate it with regular wages. Social Security and Medicare apply to the whole amount either way.`),
    sections: [
      ['A commission check', p(`A sales employee has ${money(300_000)} of regular biweekly pay and a ${money(250_000)} commission paid in the same check.`) + (() => {
        const fl = run(base('TX', 300_000, { earnings: [reg(300_000), sup(250_000)] }));
        const ag = run(base('TX', 300_000, { earnings: [reg(300_000), reg(250_000)] }));
        const alone = run(base('TX', 300_000, { earnings: [sup(250_000)] }));
        return kv(h, ['Method', 'Federal withheld', 'Net pay'], [
          ['Flat rate, commission identified separately', money(fit(fl)), money(fl.netPay)],
          ['Aggregate with regular pay', money(fit(ag)), money(ag.netPay)],
          ['Commission paid alone, flat rate', money(fit(alone)), money(alone.netPay)],
        ]).replace(/text-align:left/g, 'text-align:right');
      })()],
      ['Choosing', ul([
        'If commissions are paid on a separate schedule, the flat rate is the usual choice and easy to explain.',
        'If they are paid with regular wages, aggregation follows the employee\'s W-4 and often withholds more on a large commission.',
        'A draw against commission is usually regular pay; the commission above the draw is supplemental.',
      ])],
      ['States', p(`State treatment varies. Some states set their own flat supplemental rate, some require aggregation, and some leave it open. See <a href="/bonus-withholding-by-state">supplemental withholding by state</a>.`)],
      ['Recording it', code(h, `{ "code": "COMM", "category": "supplemental", "amount": 250000 }`)],
    ],
    faq: [
      { q: 'How are commissions taxed?', a: 'As supplemental wages. Federal withholding can use the flat 22% rate if the commission is separately identified, or aggregate it with regular pay. FICA applies in full.' },
      { q: 'Why is my commission check withheld more than expected?', a: 'If it is aggregated with regular pay, the combined check annualises to a higher bracket, which withholds more. The final tax is settled on the return.' },
    ],
    related: ['/supplemental-wage-withholding-rates', '/flat-rate-vs-aggregate-bonus-withholding', '/overtime-pay-tax-withholding', '/bonus-withholding-by-state'],
  }));

  add(def({
    path: '/severance-pay-tax-withholding', label: 'Severance pay tax withholding', group: 'Withholding and wages',
    title: 'Severance pay tax withholding: federal, FICA and state',
    description: "How severance pay is withheld: supplemental wages for federal income tax, full Social Security and Medicare, and a worked check in Texas and California.",
    h1: 'Severance pay tax withholding',
    sub: 'Severance is wages. It is taxed like a bonus, not like a gift.',
    lead: p(`Severance pay is wages for tax purposes. It is subject to federal income tax withholding, Social Security and Medicare, and state tax where there is one. The usual treatment for federal income tax is the supplemental wage rules: ${pct(0.22)} flat when paid separately, or aggregation, and ${pct(0.37)} over $1,000,000 in the year.`),
    sections: [
      ['A severance check', (() => {
        const amt = 2_000_000;
        const t = run(base('TX', 300_000, { earnings: [sup(amt)] }));
        const c = run(base('CA', 300_000, { earnings: [sup(amt)] }));
        return p(`A severance payment of ${money(amt)}, paid on its own as supplemental wages:`) + kv(h, ['', 'Texas', 'California'], [
          ['Federal income tax', money(fit(t)), money(fit(c))],
          ['Social Security', money(line(t, 'US_SS_EE')!.amount), money(line(c, 'US_SS_EE')!.amount)],
          ['Medicare', money(line(t, 'US_MED_EE')!.amount), money(line(c, 'US_MED_EE')!.amount)],
          ['State income tax', money(0), money(c.taxes.filter((x) => x.id === 'CA_SIT').reduce((a, x) => a + x.amount, 0))],
          ['Net pay', money(t.netPay), money(c.netPay)],
        ]).replace(/text-align:left/g, 'text-align:right');
      })()],
      ['Points that surprise people', ul([
        'Social Security and Medicare apply even if the person has left. Severance is wages for the year in which it is paid.',
        'A lump sum can cross the Social Security wage base or the Additional Medicare threshold. Send year-to-date wages so the engine splits the check.',
        'Some states have special treatment for severance or require specific withholding. Check the state page.',
        'Severance is not exempt because it follows a layoff.',
      ])],
      ['Not covered', p(`Retirement-plan distributions have their own withholding rules; see <a href="/eligible-rollover-withholding">eligible rollover withholding</a>. Whether a payment is severance, a settlement or damages is a legal question the engine does not decide.`)],
    ],
    faq: [
      { q: 'Is severance pay subject to payroll taxes?', a: 'Yes. Severance is wages: federal income tax, Social Security, Medicare and state tax apply, with the supplemental wage rules available for federal withholding.' },
      { q: 'How is federal withholding calculated on severance?', a: 'Commonly at the 22% flat supplemental rate when paid separately, or by aggregating with regular wages, and at 37% on supplemental wages over $1,000,000 in the year.' },
    ],
    related: ['/supplemental-wage-withholding-rates', '/final-paycheck-tax-withholding', '/bonus-over-one-million-withholding', '/commission-tax-withholding'],
  }));

  add(def({
    path: '/final-paycheck-tax-withholding', label: 'Final paycheck tax withholding', group: 'Withholding and wages',
    title: 'Final paycheck tax withholding and unused PTO payout',
    description: 'How a final paycheck is taxed: regular pay and PTO payout are wages, the flat or aggregate method for the payout, and the year-to-date caps that may apply.',
    h1: 'Final paycheck and PTO payout withholding',
    sub: 'The last check is still a paycheck, with a payout riding on it.',
    lead: p(`A final paycheck has no special tax rules. The last period's wages and any payout of unused paid time off are wages, subject to the same withholding as any other check. The payout is usually treated as supplemental wages. What changes is that the check often hits a cap, because it is a final year-to-date total.`),
    sections: [
      ['An example', (() => {
        const fl = run(base('TX', 300_000, { earnings: [reg(300_000), sup(400_000)] }));
        const ag = run(base('TX', 300_000, { earnings: [reg(300_000), reg(400_000)] }));
        return p(`An employee's last check is ${money(300_000)} of regular pay plus a ${money(400_000)} payout of unused PTO.`) + kv(h, ['Method for the payout', 'Federal withheld', 'Net pay'], [
          ['Flat supplemental rate', money(fit(fl)), money(fl.netPay)],
          ['Aggregate with the regular pay', money(fit(ag)), money(ag.netPay)],
        ]).replace(/text-align:left/g, 'text-align:right') + p(`Social Security and Medicare are ${money(line(fl, 'US_SS_EE')!.amount)} and ${money(line(fl, 'US_MED_EE')!.amount)} either way.`);
      })()],
      ['Timing is a state matter', p(`When the final pay is due, and whether unused PTO must be paid, are set by state law and employer policy. The tax engine calculates the withholding on whatever amount you decide is owed. It does not decide the amount or the deadline.`)],
      ['Watch for', ul([
        'Year-to-date wages. A final check can reach the Social Security wage base or the Additional Medicare threshold.',
        'Employer unemployment tax. Wages paid reduce the remaining state wage base.',
        'Garnishments. A final check can still be subject to a withholding order; see the <a href="/garnishment-limit-calculation-api">garnishment limits</a>.',
        'Reimbursements of business expenses. Paid under an accountable plan they are not wages; send them as <code>reimbursement</code>.',
      ])],
    ],
    faq: [
      { q: 'Is PTO payout taxed differently?', a: 'It is wages, usually treated as supplemental: the flat 22% federal rate if identified separately, or aggregated. Social Security and Medicare apply in full.' },
      { q: 'Does the API decide when the final pay is due?', a: 'No. The due date and whether PTO must be paid are set by state law and employer policy. The API calculates tax on the amount you send.' },
    ],
    related: ['/severance-pay-tax-withholding', '/supplemental-wage-withholding-rates', '/payroll-tax-api-ytd-wages', '/garnishment-limit-calculation-api'],
  }));

  add(def({
    path: '/401k-deferral-payroll-tax', label: '401(k) deferral payroll tax treatment', group: 'Withholding and wages',
    title: '401(k) deferral payroll tax treatment: income tax vs FICA',
    description: 'How a 401(k) deferral changes payroll tax: it lowers income tax wages but not Social Security or Medicare wages, shown on a real paycheck with the 2026 limit.',
    h1: '401(k) deferrals and payroll tax',
    sub: 'Pre-tax for income tax. Not pre-tax for FICA.',
    lead: p(`A traditional 401(k) deferral lowers the wages used for federal and most state income tax. It does not lower wages for Social Security or Medicare, which is a common source of confusion on a pay stub. The 2026 elective-deferral limit is $24,500 for 401(k), 403(b) and governmental 457(b) plans combined under section 402(g).`),
    sections: [
      ['One paycheck, with and without', kv(h, ['', 'Income tax wages', 'Social Security wages', 'Federal income tax', 'Net pay'], [
        ['No deferral', money(line(plain, 'US_FIT')!.taxableWages), money(line(plain, 'US_SS_EE')!.taxableWages), money(line(plain, 'US_FIT')!.amount), money(plain.netPay)],
        [`${money(30_000)} deferral`, money(line(k401, 'US_FIT')!.taxableWages), money(line(k401, 'US_SS_EE')!.taxableWages), money(line(k401, 'US_FIT')!.amount), money(k401.netPay)],
      ]).replace(/text-align:left/g, 'text-align:right') + p(`The ${money(30_000)} deferral cuts federal withholding by ${money(line(plain, 'US_FIT')!.amount - line(k401, 'US_FIT')!.amount)}. Net pay falls by only ${money(plain.netPay - k401.netPay)}, less than the deferral itself, because part of it is offset by lower tax. Social Security stays at ${money(line(k401, 'US_SS_EE')!.amount)}.`)],
      ['Roth is different', p(`A Roth 401(k) contribution is made after tax, so it is a post-tax deduction: send it with a <code>null</code> category. It reduces net pay by the full amount and changes no tax line. Run it and the federal tax is ${money(line(post, 'US_FIT')!.amount)}, the same as with no deduction.`)],
      ['Limits and catch-up', p(`The engine tracks the annual limit and returns <code>electiveDeferrals</code> showing what stayed pre-tax, so you can carry it to the next check. Catch-up contributions for employees of certain ages raise the limit and are an employee fact to supply. See <a href="/retirement-deferral-limits-2026">the 2026 limits</a>.`)],
      ['State differences', p(`Most states follow the federal treatment. A few treat deferrals differently, and the state rule files record this tax by tax. See <a href="/pre-tax-deduction-tax-treatment">how every deduction is treated</a>.`)],
    ],
    faq: [
      { q: 'Does a 401(k) deferral reduce Social Security tax?', a: 'No. It reduces federal and most state income tax wages but remains subject to Social Security and Medicare.' },
      { q: 'How is a Roth 401(k) contribution handled?', a: 'It is after-tax, so it is a post-tax deduction. It lowers net pay by the full amount and does not change any tax line.' },
    ],
    related: ['/pre-tax-deduction-tax-treatment', '/retirement-deferral-limits-2026', '/hsa-payroll-tax-treatment', '/section-125-cafeteria-plan-payroll-tax'],
  }));

  add(def({
    path: '/retirement-deferral-limits-2026', label: 'Retirement deferral limits 2026', group: 'Withholding and wages',
    title: "2026 retirement deferral limits in payroll: 401(k), 457",
    description: "The 2026 elective deferral limits payroll applies: $24,500 for 401(k), 403(b) and 457(b), $17,000 for SIMPLE, and how pre-tax treatment stops at the limit.",
    h1: '2026 retirement deferral limits in payroll',
    sub: 'What stays pre-tax, and when it stops.',
    lead: p(`Retirement plans cap how much an employee can defer from pay in a year. When a payroll system keeps treating deferrals as pre-tax after the cap is reached, it under-withholds. The engine reads the cap from its federal rule file for the check date's year, and reports what stayed pre-tax so you can carry it forward.`),
    sections: [
      ['The limits in the 2026 rule file', kv(h, ['Plan type', '2026 limit'], [
        ['401(k) and 403(b) combined (IRC 402(g))', dollars(24_500)],
        ['Governmental 457(b)', dollars(24_500)],
        ['SIMPLE plan', dollars(17_000)],
      ]) + p(`The 401(k) and 403(b) figure is one shared limit: an employee contributing to both gets $24,500 between them, not each.`)],
      ['How it works in a request', code(h, `"deductions": [{ "code": "401K", "category": "deferral_401k", "amount": 300000 }],
"ytd": { "socialSecurity": 0, "medicare": 0, "futa": 0,
         "electiveDeferrals": { "section402gAggregate": 2400000 } }`) + p(`With the year's deferrals sent in, a check that would exceed the limit has only the remaining part treated as pre-tax. The response's <code>electiveDeferrals</code> block shows the totals to carry into the next request.`)],
      ['What to supply yourself', ul([
        'Catch-up eligibility. Age-based catch-up contributions raise the limit for some employees, which is an employee fact the engine cannot know.',
        'Contributions to another employer\'s plan in the same year, which also count toward the 402(g) limit.',
        'Roth and after-tax contributions, which are post-tax deductions and do not count as pre-tax deferrals.',
      ])],
      ['Where to read the primary source', p(`The 2026 limits are from the IRS announcement of cost-of-living adjustments. Confirm any figure against the IRS before relying on it for plan administration.`)],
    ],
    faq: [
      { q: 'What is the 401(k) deferral limit for 2026?', a: 'The elective deferral limit under section 402(g) is $24,500 for 401(k), 403(b) and governmental 457(b) plans, with the 401(k) and 403(b) limit shared. The SIMPLE plan limit is $17,000.' },
      { q: 'What happens when the limit is reached mid-year?', a: 'The engine treats only the remaining part of a deferral as pre-tax and returns electiveDeferrals so you can carry the total forward.' },
    ],
    related: ['/401k-deferral-payroll-tax', '/pre-tax-deduction-tax-treatment', '/hsa-payroll-tax-treatment', '/payroll-tax-api-ytd-wages'],
  }));

  add(def({
    path: '/hsa-payroll-tax-treatment', label: 'HSA payroll tax treatment', group: 'Withholding and wages',
    title: "HSA payroll tax treatment: exempt from FICA",
    description: 'How an HSA contribution through payroll is taxed: through a Section 125 plan it is exempt from income tax and FICA, shown on a real paycheck against a 401(k).',
    h1: 'HSA contributions and payroll tax',
    sub: 'Through a cafeteria plan, an HSA is pre-tax for everything.',
    lead: p(`A health savings account contribution made through payroll under a cafeteria plan (Section 125) is excluded from federal income tax, Social Security and Medicare wages. That is better than a 401(k) deferral, which escapes only income tax. The engine encodes this by category.`),
    sections: [
      ['HSA and 401(k) on the same pay', kv(h, ['', 'Income tax wages', 'Social Security wages', 'Total employee tax', 'Net pay'], [
        ['No deduction', money(line(plain, 'US_FIT')!.taxableWages), money(line(plain, 'US_SS_EE')!.taxableWages), money(plain.employeeTaxTotal), money(plain.netPay)],
        [`${money(30_000)} HSA`, money(line(hsa, 'US_FIT')!.taxableWages), money(line(hsa, 'US_SS_EE')!.taxableWages), money(hsa.employeeTaxTotal), money(hsa.netPay)],
        [`${money(30_000)} 401(k)`, money(line(k401, 'US_FIT')!.taxableWages), money(line(k401, 'US_SS_EE')!.taxableWages), money(k401.employeeTaxTotal), money(k401.netPay)],
      ]).replace(/text-align:left/g, 'text-align:right') + p(`The HSA lowers employee taxes by ${money(plain.employeeTaxTotal - hsa.employeeTaxTotal)} and the 401(k) by ${money(plain.employeeTaxTotal - k401.employeeTaxTotal)}. The HSA gives ${money(k401.employeeTaxTotal - hsa.employeeTaxTotal)} more tax relief because it also leaves Social Security and Medicare wages.`)],
      ['The employer saves too', p(`Employer Social Security and Medicare are also computed on the lower wage: ${money(plain.employerTaxTotal)} with no deduction against ${money(hsa.employerTaxTotal)} with the HSA.`)],
      ['A state exception to watch', p(`A few states do not follow the federal exclusion for HSA contributions. The state rule files record the treatment tax by tax, and the engine applies it, so a contribution can be pre-tax federally and taxable for that state. See <a href="/pre-tax-deduction-tax-treatment">deduction treatment by tax</a>.`)],
      ['Request value', code(h, `{ "code": "HSA", "category": "hsa", "amount": 30000 }`)],
    ],
    faq: [
      { q: 'Is an HSA contribution through payroll subject to FICA?', a: 'Not when made through a Section 125 cafeteria plan. It is excluded from Social Security and Medicare wages as well as federal income tax wages.' },
      { q: 'Does every state exclude HSA contributions?', a: 'No. A few states tax them. The engine applies each state\'s own rule by tax.' },
    ],
    related: ['/section-125-cafeteria-plan-payroll-tax', '/401k-deferral-payroll-tax', '/pre-tax-deduction-tax-treatment', '/medicare-tax-calculation'],
  }));

  add(def({
    path: '/section-125-cafeteria-plan-payroll-tax', label: 'Section 125 cafeteria plan payroll tax', group: 'Withholding and wages',
    title: "Section 125 cafeteria plan payroll tax treatment",
    description: "How Section 125 premiums are taxed in payroll: excluded from federal income tax, Social Security and Medicare, with employer savings, on a real paycheck.",
    h1: 'Section 125 cafeteria plan payroll tax',
    sub: 'Health premiums paid before any tax is calculated.',
    lead: p(`A Section 125 cafeteria plan lets employees pay certain benefit premiums (health, dental, vision) and fund some accounts (health FSA, dependent care, an HSA) from pre-tax pay. Contributions are excluded from federal income tax, Social Security and Medicare wages. In payroll, that is a deduction whose category is <code>section125</code>.`),
    sections: [
      ['A paycheck with a premium', p(`A ${money(30_000)} health premium on the ${money(plain.grossPay)} biweekly check:`) + pick(h, s125, ['US_FIT', 'US_SS_EE', 'US_MED_EE']) + p(`Taxable wages for every line are ${money(line(s125, 'US_FIT')!.taxableWages)} instead of ${money(plain.grossPay)}. The employee pays ${money(plain.employeeTaxTotal - s125.employeeTaxTotal)} less tax, and the employer pays ${money(plain.employerTaxTotal - s125.employerTaxTotal)} less. Net pay is ${money(s125.netPay)} against ${money(plain.netPay)}.`)],
      ['Category matters', kv(h, ['Deduction category', 'Income tax', 'Social Security', 'Medicare'], [
        ['<code>section125</code>, <code>hsa</code>, <code>fsa</code>, <code>dependent_care</code>, <code>commuter</code>', 'Exempt', 'Exempt', 'Exempt'],
        ['<code>deferral_401k</code>, <code>deferral_403b</code>, <code>deferral_457</code>', 'Exempt', 'Taxable', 'Taxable'],
        ['Post-tax (<code>null</code>)', 'Taxable', 'Taxable', 'Taxable'],
      ])],
      ['Cautions', ul([
        'Dependent care and commuter benefits have annual limits set by law. The engine treats the category as exempt; keeping contributions within the limit is for your benefits system.',
        'Some states tax these differently. The engine applies each state\'s rule by tax.',
        'Premiums for a more-than-2% S-corporation shareholder are not Section 125 benefits. Do not categorise them as such.',
      ])],
    ],
    faq: [
      { q: 'Are Section 125 premiums subject to Social Security tax?', a: 'No. They are excluded from federal income tax, Social Security and Medicare wages, which also lowers the employer\'s share.' },
      { q: 'How do I send a premium to the API?', a: 'As a deduction with category section125. The category decides which taxes it reduces.' },
    ],
    related: ['/hsa-payroll-tax-treatment', '/pre-tax-deduction-tax-treatment', '/401k-deferral-payroll-tax', '/post-tax-deductions-net-pay'],
  }));

  add(def({
    path: '/post-tax-deductions-net-pay', label: 'Post-tax deductions and net pay', group: 'Withholding and wages',
    title: "Post-tax deductions and net pay: what changes",
    description: 'Post-tax deductions such as Roth contributions, union dues and charitable giving reduce net pay but not taxes. A worked paycheck proves no tax line moves.',
    h1: 'Post-tax deductions and net pay',
    sub: 'They reduce take-home pay. They never reduce a tax.',
    lead: p(`A post-tax deduction comes out of pay after taxes are calculated. Examples are Roth retirement contributions, union dues, charitable giving through payroll, and after-tax insurance. It reduces net pay by the full amount and changes none of the tax lines. In the API it is a deduction with a <code>null</code> category.`),
    sections: [
      ['Proof on one paycheck', p(`The ${money(plain.grossPay)} check with a ${money(30_000)} post-tax deduction:`) + kv(h, ['', 'No deduction', 'Post-tax deduction'], [
        ['Federal income tax', money(line(plain, 'US_FIT')!.amount), money(line(post, 'US_FIT')!.amount)],
        ['Social Security', money(line(plain, 'US_SS_EE')!.amount), money(line(post, 'US_SS_EE')!.amount)],
        ['Medicare', money(line(plain, 'US_MED_EE')!.amount), money(line(post, 'US_MED_EE')!.amount)],
        ['Net pay', money(plain.netPay), money(post.netPay)],
      ]).replace(/text-align:left/g, 'text-align:right') + p(`Every tax line is identical. Net pay is lower by exactly ${money(plain.netPay - post.netPay)}, the full deduction.`)],
      ['Common post-tax deductions', ul(['Roth 401(k) or Roth 403(b) contributions', 'Union dues', 'Charitable contributions', 'After-tax life or disability insurance', 'Loan repayments and wage advances']) + p(`Garnishments are also taken from pay after tax, but the amount is limited by law. See <a href="/garnishment-limit-calculation-api">garnishment limits</a>.`)],
      ['Order of operations', p(`Gross pay, less pre-tax deductions, gives the base for each tax. Employee taxes come out. Post-tax deductions come out of what is left, leaving net pay. The identity is <code>netPay = grossPay − pretaxDeductions − employeeTaxTotal − posttaxDeductions</code>. See <a href="/paycheck-calculation-formula">the paycheck formula</a>.`)],
    ],
    faq: [
      { q: 'Do post-tax deductions reduce taxes?', a: 'No. They are taken after taxes are calculated and change no tax line, only net pay.' },
      { q: 'Is a Roth 401(k) contribution pre-tax?', a: 'No. Roth contributions are made after tax, so they are post-tax deductions.' },
    ],
    related: ['/pre-tax-deduction-tax-treatment', '/401k-deferral-payroll-tax', '/paycheck-calculation-formula', '/garnishment-limit-calculation-api'],
  }));

  add(def({
    path: '/expense-reimbursement-payroll-tax', label: 'Expense reimbursement payroll tax', group: 'Withholding and wages',
    title: 'Expense reimbursements in payroll: not wages, not taxed',
    description: 'How expense reimbursements are treated on a paycheck: paid in cash but not taxable under an accountable plan, with a worked check showing no tax line changes.',
    h1: 'Expense reimbursements and payroll tax',
    sub: 'Paid with the check, but not wages.',
    lead: p(`When an employee is repaid for business expenses under an accountable plan, the repayment is not wages. It is paid with the paycheck, shown on the stub, and carries no income tax, Social Security or Medicare. In the API it is an earning with category <code>reimbursement</code>.`),
    sections: [
      ['On a paycheck', p(`A ${money(20_000)} mileage reimbursement added to the ${money(plain.grossPay)} check:`) + kv(h, ['', 'Without', 'With reimbursement'], [
        ['Gross pay shown', money(plain.grossPay), money(reimb.grossPay)],
        ['Federal income tax', money(line(plain, 'US_FIT')!.amount), money(line(reimb, 'US_FIT')!.amount)],
        ['Social Security', money(line(plain, 'US_SS_EE')!.amount), money(line(reimb, 'US_SS_EE')!.amount)],
        ['Net pay', money(plain.netPay), money(reimb.netPay)],
      ]).replace(/text-align:left/g, 'text-align:right') + p(`Net pay rises by exactly ${money(reimb.netPay - plain.netPay)}. No tax line changed.`)],
      ['The accountable plan test', ul([
        'The expense has a business connection.',
        'The employee substantiates it within a reasonable time.',
        'The employee returns any excess advance.',
      ]) + p(`Reimbursements that fail the test are wages. If you cannot tell, treat the amount as regular pay, which is the cautious direction.`)],
      ['What the engine trusts', p(`The engine does not check whether your plan is accountable. It trusts the category you send, because that determination depends on facts your company holds. Send <code>reimbursement</code> only for amounts that qualify.`)],
    ],
    faq: [
      { q: 'Are expense reimbursements taxable?', a: 'Not under an accountable plan. They are not wages and have no income tax, Social Security or Medicare. Reimbursements that fail the plan test are wages.' },
      { q: 'How do I show one on the API?', a: 'As an earning with category reimbursement. The engine adds it to gross pay shown but excludes it from every taxable base.' },
    ],
    related: ['/imputed-income-payroll-tax', '/paycheck-calculation-formula', '/post-tax-deductions-net-pay', '/gross-to-net-api'],
  }));

  add(def({
    path: '/imputed-income-payroll-tax', label: 'Imputed income payroll tax', group: 'Withholding and wages',
    title: 'Imputed income in payroll: taxable but not paid in cash',
    description: "How imputed income such as group-term life over $50,000 is taxed: added to taxable wages without being paid, with a worked check showing the extra tax.",
    h1: 'Imputed income and payroll tax',
    sub: 'Taxable pay the employee never receives as cash.',
    lead: p(`Imputed income is the taxable value of a benefit that is not paid in cash. The usual example is employer-paid group-term life insurance above $50,000 of coverage. It is added to taxable wages, so tax is withheld on it, but no money is paid. The employee's net pay goes down.`),
    sections: [
      ['A paycheck with imputed income', p(`A ${money(12_000)} imputed amount on the ${money(plain.grossPay)} check:`) + kv(h, ['', 'Without', 'With imputed income'], [
        ['Cash gross pay', money(plain.grossPay), money(imputed.grossPay)],
        ['Federal taxable wages', money(line(plain, 'US_FIT')!.taxableWages), money(line(imputed, 'US_FIT')!.taxableWages)],
        ['Federal income tax', money(line(plain, 'US_FIT')!.amount), money(line(imputed, 'US_FIT')!.amount)],
        ['Social Security', money(line(plain, 'US_SS_EE')!.amount), money(line(imputed, 'US_SS_EE')!.amount)],
        ['Net pay', money(plain.netPay), money(imputed.netPay)],
      ]).replace(/text-align:left/g, 'text-align:right') + p(`Taxable wages rise to ${money(line(imputed, 'US_FIT')!.taxableWages)}, tax rises, and net pay falls by ${money(plain.netPay - imputed.netPay)} even though no cash was added.`)],
      ['Where it comes from', ul([
        'Group-term life insurance above $50,000 of coverage.',
        'Personal use of a company vehicle, in the cases where it is taxable.',
        'Some other fringe benefits that are taxable and not paid in cash.',
      ]) + p(`The value comes from the IRS tables or the benefit rules, which your benefits system supplies. The engine applies the tax to the amount you send.`)],
      ['A limit', p(`Because imputed income adds tax without cash, it cannot raise take-home pay. The gross-up endpoint refuses to solve for an imputed earning with the code <code>cannot_gross_up</code>.`)],
    ],
    faq: [
      { q: 'What is imputed income?', a: 'The taxable value of a benefit that is not paid in cash, such as group-term life insurance over $50,000. It is added to taxable wages, so tax is withheld, while net pay falls.' },
      { q: 'How do I send it to the API?', a: 'As an earning with category imputed. It raises the taxable wages but is not paid in cash.' },
    ],
    related: ['/expense-reimbursement-payroll-tax', '/section-125-cafeteria-plan-payroll-tax', '/paycheck-calculation-formula', '/fica-tax-calculation'],
  }));

  add(def({
    path: '/pay-frequency-withholding', label: 'Pay frequency and withholding', group: 'Withholding and wages',
    title: "Pay frequency and withholding: weekly to monthly",
    description: "Why the same pay gets different withholding on weekly, biweekly, semimonthly and monthly schedules: annualisation and brackets, with the engine's numbers.",
    h1: 'Pay frequency and withholding',
    sub: 'Pay frequency changes the table, and the table changes the tax.',
    lead: p(`Federal withholding annualises each paycheck: multiply by the number of pay periods in the year, apply the tax brackets, then divide back. So ${money(300_000)} paid weekly is a ${money(300_000 * 52)} yearly income; paid monthly it is only ${money(300_000 * 12)}. The same check withholds very different amounts.`),
    sections: [
      ['One check, four frequencies', kv(h, ['Pay frequency', 'Periods', 'Annualised wages', 'Federal income tax', 'Net pay'], [
        ['Weekly', '52', money(300_000 * 52), money(line(wk, 'US_FIT')!.amount), money(wk.netPay)],
        ['Biweekly', '26', money(300_000 * 26), money(line(bw, 'US_FIT')!.amount), money(bw.netPay)],
        ['Semimonthly', '24', money(300_000 * 24), money(line(sm, 'US_FIT')!.amount), money(sm.netPay)],
        ['Monthly', '12', money(300_000 * 12), money(line(mo, 'US_FIT')!.amount), money(mo.netPay)],
      ]).replace(/text-align:left/g, 'text-align:right') + p(`Every row is a ${money(300_000)} check for a single filer in Texas. Social Security and Medicare are identical in all four, at ${money(line(wk, 'US_SS_EE')!.amount)} and ${money(line(wk, 'US_MED_EE')!.amount)}, because they are flat percentages.`)],
      ['What this means', ul([
        'A comparison of "take-home per month" across employers must use the same schedule, or the annualised tax will not be comparable.',
        'An employee who moves from monthly to weekly pay with the same annual salary has a similar yearly tax, because each check is smaller.',
        'The annual tax is settled on the return, so withholding differences by schedule even out over the year when pay is steady.',
      ])],
      ['In the request', p(`Set <code>payFrequency</code> to <code>weekly</code>, <code>biweekly</code>, <code>semimonthly</code>, <code>monthly</code>, <code>quarterly</code>, <code>semiannual</code>, <code>annual</code> or <code>daily</code>. State tables use the same frequency.`)],
    ],
    faq: [
      { q: 'Why does pay frequency change federal withholding?', a: 'The percentage method annualises each check by the number of pay periods, applies the brackets, and divides back. A larger check on a weekly schedule annualises to a higher income than the same check paid monthly.' },
      { q: 'Does pay frequency change Social Security or Medicare?', a: 'No. They are flat percentages of wages, so the amount is the same on any schedule.' },
    ],
    related: ['/federal-income-tax-withholding-calculator', '/semimonthly-vs-biweekly-pay', '/paycheck-calculation-formula', '/hourly-employee-paycheck-calculation'],
  }));

  add(def({
    path: '/semimonthly-vs-biweekly-pay', label: 'Semimonthly vs biweekly pay', group: 'Withholding and wages',
    title: 'Semimonthly vs biweekly pay: 24 checks or 26, and the net',
    description: 'Semimonthly or biweekly pay on the same salary: 24 checks versus 26, different per-check withholding, the same year, and which gives a bigger check.',
    h1: 'Semimonthly vs biweekly pay',
    sub: 'Same salary, different check size, almost the same year.',
    lead: p(`A salary of ${money(7_800_000)} a year pays ${money(7_800_000 / 26)} biweekly (26 checks) or ${money(7_800_000 / 24)} semimonthly (24 checks). The semimonthly check is larger. Withholding follows the check, so the two schedules withhold different amounts per check, and nearly the same over the year.`),
    sections: [
      ['Per check', (() => {
        const bwk = run(base('TX', 300_000, { payFrequency: 'biweekly' }));
        const smk = run(base('TX', Math.round(7_800_000 / 24), { payFrequency: 'semimonthly' }));
        return kv(h, ['', 'Biweekly, 26 checks', 'Semimonthly, 24 checks'], [
          ['Gross per check', money(bwk.grossPay), money(smk.grossPay)],
          ['Federal income tax', money(line(bwk, 'US_FIT')!.amount), money(line(smk, 'US_FIT')!.amount)],
          ['Net pay per check', money(bwk.netPay), money(smk.netPay)],
          ['Federal tax for the year', money(line(bwk, 'US_FIT')!.amount * 26), money(line(smk, 'US_FIT')!.amount * 24)],
          ['Net pay for the year', money(bwk.netPay * 26), money(smk.netPay * 24)],
        ]).replace(/text-align:left/g, 'text-align:right') + p(`The difference over a year is ${money(Math.abs(line(bwk, 'US_FIT')!.amount * 26 - line(smk, 'US_FIT')!.amount * 24))} of federal withholding, a rounding effect of the two tables. The employee's final tax is settled on their return.`);
      })()],
      ['Things that differ', ul([
        'Two months a year, a biweekly employee gets three checks. Budgeting is different even though the year is the same.',
        'Hourly employees may earn slightly different totals because periods end on different days.',
        'Benefit deductions are often set per pay period, so 24 or 26 deductions change the per-check amount.',
      ])],
      ['In the API', p(`Set <code>payFrequency</code> to <code>biweekly</code> or <code>semimonthly</code>. The engine uses the matching table and divisor. See <a href="/pay-frequency-withholding">pay frequency and withholding</a>.`)],
    ],
    faq: [
      { q: 'Is semimonthly or biweekly pay better?', a: 'Neither pays more per year on the same salary. Semimonthly gives 24 larger checks; biweekly gives 26 smaller ones, with three checks in two months.' },
      { q: 'Is withholding the same over a year?', a: 'Nearly. The two schedules use different tables, so total withholding differs slightly. The final tax is settled on the return.' },
    ],
    related: ['/pay-frequency-withholding', '/salary-to-take-home-pay', '/hourly-employee-paycheck-calculation', '/federal-income-tax-withholding-calculator'],
  }));

  add(def({
    path: '/hourly-employee-paycheck-calculation', label: 'Hourly employee paycheck calculation', group: 'Calculations',
    title: "Hourly employee paycheck calculation: hours to net",
    description: 'How to calculate an hourly employee\'s paycheck: hours times rate, overtime, then every tax line to net pay, with a worked example for a Columbus, Ohio worker.',
    h1: 'Hourly employee paycheck calculation',
    sub: 'Hours and rate in. Net pay and every tax out.',
    lead: p(`An hourly paycheck starts with arithmetic you can do on a calculator: hours times rate, plus overtime. Everything after that is tax rules. The useful way to automate it is to compute the gross yourself, as an earning in cents, and let the engine do the rest.`),
    sections: [
      ['A worked example', (() => {
        const rate = 2_500;
        const g = 80 * rate;
        const r = run(base('OH', g, {}, {}, { residenceCity: 'Columbus', workCity: 'Columbus' }));
        return p(`An employee in Columbus, Ohio works 80 hours at ${money(rate)} an hour. Gross is 80 × ${money(rate)} = ${money(g)}.`) + taxTable(h, r) + p(`Net pay is ${money(r.netPay)}. The employer's lines (${money(r.employerTaxTotal)}) are a cost on top of the gross.`);
      })()],
      ['Steps', ul([
        'Gross: hours × rate for regular time, and the overtime premium for hours over the threshold, in integer cents.',
        'Send the earnings. Use one <code>regular</code> earning, or separate ones for regular and overtime.',
        'Send deductions with their categories.',
        'Send the W-4 and the work location. Local tax depends on the address.',
        'Read the lines back and display them.',
      ])],
      ['Two traps', ul([
        'Rounding gross to dollars before sending. Keep cents all the way: 37.5 hours at $18.75 is $703.125, and your payroll policy decides how it rounds to a cent.',
        'Using the wrong pay frequency. A weekly check and a biweekly check of the same size withhold differently.',
      ])],
      ['Minimum wage in the same call', p(`Add <code>minimumWageCheck: { hourlyRate: 2500 }</code> to the request to compare the hourly rate with the binding federal, state and local minimum wage. It is answered in the same call and billed as one calculation.`)],
    ],
    faq: [
      { q: 'How do I calculate an hourly paycheck?', a: 'Multiply hours by the hourly rate, add overtime pay, send that as gross earnings in cents with deductions, the W-4 and the work location, and the engine returns each tax and net pay.' },
      { q: 'Does the API check minimum wage?', a: 'Yes. Add a minimumWageCheck with the hourly rate and the same call compares it with the federal, state and local minimum wage.' },
    ],
    related: ['/overtime-pay-tax-withholding', '/minimum-wage-compliance-check', '/paycheck-calculator-api', '/pay-frequency-withholding'],
  }));

  add(def({
    path: '/minimum-wage-compliance-check', label: 'Minimum wage compliance check', group: 'Calculations',
    title: "Minimum wage compliance check API: all levels",
    description: 'Check an hourly rate against the binding federal, state and local minimum wage in the same call as the paycheck, with tipped, region and headcount options.',
    h1: 'Minimum wage compliance check',
    sub: 'Is this hourly rate legal at this address? Ask in the paycheck call.',
    lead: p(`The minimum wage that binds an employer is the highest of the federal, state and any local figure that applies. Local ordinances now cover ${h.cov.localMinimumWage} jurisdictions in the data the engine carries, so a state figure alone is often wrong. Add a <code>minimumWageCheck</code> to the paycheck request and the answer comes back with the calculation.`),
    sections: [
      ['What you send', code(h, `"workState": { "code": "WA" },
"minimumWageCheck": { "hourlyRate": 1800, "locality": "seattle", "employeeCount": 250 }`) + kv(h, ['Field', 'Meaning'], [
        ['<code>hourlyRate</code>', 'The employee\'s hourly rate in cents: $15.00 is 1500.'],
        ['<code>locality</code>', 'A local ordinance id or name, such as <code>seattle</code>.'],
        ['<code>employeeCount</code>', 'Employer headcount, where the ordinance has size tiers.'],
        ['<code>tipped</code>', 'Compare with the tipped cash floor.'],
        ['<code>region</code>', 'A named sub-region such as New York "downstate" or Oregon "portland_metro".'],
      ])],
      ['One billed call', p(`The check is answered in the same call as the paycheck and billed as one calculation. Federal, state and local figures are all considered, and the binding one is reported.`)],
      ['What it is for', ul([
        'Catching a rate that fell below the floor after a state or city increase on January 1 or July 1.',
        'Checking an offer before it is sent.',
        'Showing a compliance flag next to the rate in a scheduling or HR tool.',
      ])],
      ['Limits', p(`It compares a rate with a floor. It does not decide whether an employee is exempt, whether a particular tip credit is allowed for a job, or whether a sector-specific minimum applies beyond those the data covers. See <a href="/minimum-wage-by-state">minimum wage by state</a> for the state figures and <a href="/coverage">coverage</a> for the local ones.`)],
    ],
    faq: [
      { q: 'Can the payroll API check minimum wage?', a: 'Yes. Add minimumWageCheck with an hourly rate to the paycheck request and it compares the rate with the binding federal, state and local minimum wage in the same call.' },
      { q: 'Is the minimum wage check billed separately?', a: 'No. It is answered in the same call and billed as one paycheck calculation.' },
    ],
    related: ['/minimum-wage-by-state', '/hourly-employee-paycheck-calculation', '/garnishment-limit-calculation-api', '/coverage'],
  }));

  add(def({
    path: '/salary-to-take-home-pay', label: 'Salary to take-home pay', group: 'Calculations',
    title: 'Salary to take-home pay: annual salary to net per paycheck',
    description: "Turn an annual salary into take-home pay per paycheck: divide by pay periods, run it through the tax engine, and compare Texas, California and Ohio.",
    h1: 'Salary to take-home pay',
    sub: 'An annual salary is not a paycheck. The tax engine turns one into the other.',
    lead: p(`To find take-home pay from a yearly salary, divide the salary by the number of pay periods to get the gross per check, then run the check through the tax rules. Skipping the second step is the common mistake: a rule of thumb like "take-home is about 75%" is wrong by hundreds of dollars a year in either direction depending on the state.`),
    sections: [
      ['A ' + money(7_800_000) + ' salary, biweekly, in three places', (() => {
        const gross = Math.round(7_800_000 / 26);
        const t = run(base('TX', gross));
        const c = run(base('CA', gross));
        const o = run(base('OH', gross, {}, {}, { residenceCity: 'Columbus', workCity: 'Columbus' }));
        const row = (n: string, r: ReturnType<typeof run>) => [n, money(r.grossPay), money(r.employeeTaxTotal), money(r.netPay), money(r.netPay * 26)];
        return kv(h, ['Location', 'Gross per check', 'Employee taxes', 'Net per check', 'Net per year'], [row('Texas', t), row('California', c), row('Columbus, Ohio', o)]).replace(/text-align:left/g, 'text-align:right');
      })()],
      ['Make it your own', ul([
        'Change the filing status and the W-4 entries: they change federal withholding.',
        'Add pre-tax deductions: a 401(k) deferral or health premium raises take-home relative to what it costs.',
        'Change the work address: local tax follows it.',
      ])],
      ['By state', p(`For nine salaries in every state, see <a href="/take-home-pay">take-home pay by state</a>. For the API form of this calculation, see <a href="/gross-to-net-api">the gross-to-net API</a>.`)],
      ['Estimates', p(`Take-home pay calculated this way is an estimate of withholding for a typical year. Actual withholding depends on the employee's W-4 and the employer's choices, and the final tax is settled on the return.`)],
    ],
    faq: [
      { q: 'How do I convert an annual salary to take-home pay?', a: 'Divide the salary by the pay periods to get gross per check, then apply federal, state and local taxes and any deductions to reach net pay. A tax engine does the second step.' },
      { q: 'Is take-home pay a fixed percentage of salary?', a: 'No. It depends on the state, filing status, deductions and pay frequency, so a single percentage is wrong for most people.' },
    ],
    related: ['/take-home-pay', '/gross-to-net-api', '/net-to-gross-calculator-api', '/pay-frequency-withholding'],
  }));

  add(def({
    path: '/true-cost-of-an-employee', label: 'True cost of an employee', group: 'Employer taxes',
    title: "True cost of an employee: wages plus employer taxes",
    description: 'What an employee really costs: gross pay plus employer Social Security, Medicare, FUTA and state unemployment, shown for Texas, California and Columbus, Ohio.',
    h1: 'True cost of an employee: employer payroll taxes',
    sub: 'The salary is not the cost. The employer side adds more.',
    lead: p(`A salary understates what an employee costs. On top of gross pay the employer owes its share of Social Security and Medicare, federal unemployment tax, state unemployment tax, and in some states paid-leave contributions. The employer lines are in every response under <code>payer: "employer"</code>.`),
    sections: [
      ['One biweekly check, three places', (() => {
        const t = run(base('TX')), c = ca, o = oh;
        const row = (n: string, r: ReturnType<typeof run>) => [n, money(r.grossPay), money(r.employerTaxTotal), money(r.grossPay + r.employerTaxTotal), ((r.employerTaxTotal / r.grossPay) * 100).toFixed(1) + '%'];
        return kv(h, ['Location', 'Gross', 'Employer taxes', 'Cost of the check', 'Employer tax as share of gross'], [row('Texas', t), row('California', c), row('Columbus, Ohio', o)]).replace(/text-align:left/g, 'text-align:right');
      })()],
      ['What is in the employer total', taxTable(h, run(base('CA')), 'employer') + p('These are the California employer lines on the same check.')],
      ['Why the first check looks expensive', p(`State unemployment tax and FUTA apply to the first part of each employee's yearly wages, up to a wage base (FUTA is 0.6% of the first ${dollars(7_000)} in most states; state bases run from ${dollars(Math.min(...h.states.map((x) => h.wageBaseOf(x.d26.suiEmployer?.wageBase) ?? Infinity)))} up). They hit early in the year and stop, so the first checks cost more than the last. Social Security stops at ${dollars(f.ssBase26)}.`)],
      ['What this does not include', ul([
        'Workers\' compensation, health benefits and other insurance.',
        'Paid time off, equipment and overhead.',
        'Quarterly employer taxes that apply to total payroll rather than to one check: New York MCTMT and the Nevada MBT, available from <code>/v1/employer-taxes</code>.',
      ])],
    ],
    faq: [
      { q: 'How much do employer payroll taxes add to an employee\'s cost?', a: 'Employer Social Security and Medicare add 7.65% of wages up to the Social Security wage base, and FUTA and state unemployment add more early in the year. The exact share depends on the state.' },
      { q: 'Do employer taxes come out of the employee\'s pay?', a: 'No. They are paid by the employer on top of gross pay and do not reduce net pay.' },
    ],
    related: ['/employer-payroll-tax-calculator', '/futa-suta-calculation', '/state-unemployment-tax-rates', '/employee-vs-employer-payroll-taxes'],
  }));

  add(def({
    path: '/relocation-paycheck-comparison', label: 'Relocation paycheck comparison', group: 'Calculations',
    title: "Relocation paycheck comparison: same pay, new state",
    description: "Compare a paycheck before and after a move, Texas to California as the worked case, with each tax that changes and the explanation, from one API call.",
    h1: 'Relocation paycheck comparison',
    sub: 'What does a move do to take-home pay? Ask for the difference, not two numbers.',
    lead: p(`When an employee is offered a role in another state, the question is not what each paycheck is. It is what changes and why. The compare endpoint runs both paychecks through the engine and walks from one to the other one input change at a time, so every step is an engine result.`),
    sections: [
      ['Texas to California', (() => {
        const before = base('TX');
        const after = { ...base('CA'), workState: { code: 'CA', certificate: {} } } as PaycheckInput;
        const cmp = comparePaychecks(before, after, { before: run(before), after: run(after) }) as any;
        return p(`The same ${money(300_000)} biweekly check. Net pay moves from ${money(run(before).netPay)} in Texas to ${money(run(after).netPay)} in California, a drop of ${money(Math.abs(run(before).netPay - run(after).netPay))}.`) + kv(h, ['Tax that moved', 'Texas', 'California'], (cmp.taxes ?? []).map((t: any) => [h.esc(String(t.name ?? t.id)), money(t.before ?? 0), money(t.after ?? 0)])).replace(/text-align:left/g, 'text-align:right');
      })()],
      ['The request', code(h, `POST /v1/paycheck/compare
{ "before": { …the Texas paycheck… },
  "change": { "workState": { "code": "CA", "certificate": {} } } }`) + p(`Send <code>after</code> as a full second paycheck, or <code>change</code> with only the fields that differ. The response has <code>totals</code>, <code>taxes</code> (only those that moved), <code>inputChanges</code> and <code>steps</code>.`)],
      ['Billing', p(`A successful comparison is billed as two paycheck calculations and nothing when refused. See <a href="/compare-two-paychecks-api">the compare endpoint</a>.`)],
      ['Limits', p(`A paycheck comparison does not account for the cost of living, income taxes beyond withholding, property or sales taxes, or the employee's total return. It compares withholding on one check.`)],
    ],
    faq: [
      { q: 'How do I compare take-home pay between two states?', a: 'Use the compare endpoint with the same paycheck and a changed work state. It returns both results and a step-by-step explanation of the difference.' },
      { q: 'Does the comparison include cost of living?', a: 'No. It compares tax withholding on one paycheck, not living costs or other taxes.' },
    ],
    related: ['/compare-two-paychecks-api', '/take-home-pay', '/multi-state-payroll-tax-calculation', '/payroll-tax-api-for-hr-software'],
  }));

  add(def({
    path: '/bonus-gross-up-calculator', label: 'Bonus gross-up calculator', group: 'Calculations',
    title: "Bonus gross-up calculator: pay a bonus that nets a target",
    description: 'How to gross up a bonus so the employee nets a target amount after tax: the solver finds the gross, with a worked example and the one earning it will not solve.',
    h1: 'Bonus gross-up calculator',
    sub: 'Net to gross for a bonus: what to pay so they take home exactly the target.',
    lead: p(`Sometimes a bonus is promised as a take-home figure: "we will give you $2,500 after taxes". The gross that achieves it is not the target divided by one minus a tax rate, because the taxes are layered and have thresholds. The gross-up endpoint searches with the real engine until it finds the smallest amount that leaves the target.`),
    sections: [
      ['A worked case', (() => {
        const input = base('OH', 300_000, { earnings: [reg(300_000), sup(100_000)] }, {}, { residenceCity: 'Columbus', workCity: 'Columbus' });
        const target = 450_000;
        const res = solveGrossUp(input, 1, target, run) as any;
        const g = res?.grossUp ?? res;
        const amount = g?.amount ?? g?.solved ?? 0;
        return p(`An employee in Columbus, Ohio earns ${money(300_000)} regular pay and is promised a bonus large enough that the whole check nets ${money(target)}. The solver returns a bonus of <strong>${money(amount)}</strong>, with net pay of ${money(g?.netPay ?? 0)}${g?.exact === false ? ` (the nearest the tax steps allow, ${money(g?.overTarget ?? 0)} over)` : ' (exact)'}.`);
      })()],
      ['In the request', code(h, `POST /v1/paycheck/gross-up
{ …a paycheck request…,
  "grossUp": { "targetNetPay": 450000, "earningIndex": 1 } }`) + p(`<code>earningIndex</code> says which earning to solve for. The amount you send there is ignored. The response has <code>grossUp</code>, <code>request</code> (your request with the solved amount, ready to reuse) and <code>result</code>.`)],
      ['When it cannot be exact', p(`Some tax steps jump, so no whole-cent amount hits the target. The engine returns the smallest amount that reaches it, with <code>exact: false</code> and the cents over in <code>overTarget</code>. An imputed earning cannot raise take-home pay and returns <code>cannot_gross_up</code>.`)],
      ['A policy note', p(`A gross-up is a decision about who bears the tax. It is also more expensive: the employer pays tax on the grossed-up amount. Run the employer side too, as in <a href="/true-cost-of-an-employee">the true cost of an employee</a>.`)],
    ],
    faq: [
      { q: 'How do I gross up a bonus?', a: 'Use the gross-up endpoint with the paycheck, a target net pay and the index of the bonus earning. It finds the smallest bonus that leaves that take-home using the real engine.' },
      { q: 'Why is the answer not target ÷ (1 − rate)?', a: 'Taxes are layered with thresholds, caps and different bases, so no single rate applies. The solver uses the engine itself.' },
    ],
    related: ['/net-to-gross-calculator-api', '/flat-rate-vs-aggregate-bonus-withholding', '/year-end-bonus-net-pay', '/bonus-tax-withholding-calculation'],
  }));

  add(def({
    path: '/year-end-bonus-net-pay', label: 'Year-end bonus net pay', group: 'Calculations',
    title: 'Year-end bonus net pay: what a $5,000 bonus takes home',
    description: 'What a year-end bonus nets after federal, state and FICA withholding, run for three states, so you can tell staff the real take-home before the check arrives.',
    h1: 'Year-end bonus net pay',
    sub: 'The number staff actually ask about: how much will I get?',
    lead: p(`Employees quote a bonus as a gross amount and then are surprised by the check. The gap between the two is mostly federal withholding at the flat supplemental rate, Social Security and Medicare, and state tax. Here is what a ${money(500_000)} bonus paid on its own leaves in three states.`),
    sections: [
      ['Take-home on a ' + money(500_000) + ' bonus', (() => {
        const t = run(base('TX', 300_000, { earnings: [sup(500_000)] }));
        const c = run(base('CA', 300_000, { earnings: [sup(500_000)] }));
        const o = run(base('OH', 300_000, { earnings: [sup(500_000)] }, {}, { residenceCity: 'Columbus', workCity: 'Columbus' }));
        const stateTax = (r: ReturnType<typeof run>) => r.taxes.filter((x) => /_SIT$|_LOCAL$/.test(x.id) && x.payer === 'employee').reduce((a, x) => a + x.amount, 0);
        const row = (n: string, r: ReturnType<typeof run>) => [n, money(fit(r)), money(line(r, 'US_SS_EE')!.amount + line(r, 'US_MED_EE')!.amount), money(stateTax(r)), money(r.netPay), ((r.netPay / r.grossPay) * 100).toFixed(1) + '%'];
        return kv(h, ['Place', 'Federal', 'FICA', 'State and city', 'Net', 'Share kept'], [row('Texas', t), row('California', c), row('Columbus, Ohio', o)]).replace(/text-align:left/g, 'text-align:right');
      })()],
      ['Why it is withheld that way', p(`The bonus is paid separately, so federal withholding uses the ${pct(0.22)} flat supplemental rate. State rules differ: California withholds on a bonus at its own supplemental rate, Texas withholds no state tax, Ohio uses its own method plus city tax. See <a href="/supplemental-wage-withholding-rates">supplemental wage rates</a>.`)],
      ['Setting expectations', ul([
        'Tell employees the withholding, not just the gross. The stub will show it.',
        'If you promised a net figure, use the <a href="/bonus-gross-up-calculator">bonus gross-up</a>.',
        'A year-end bonus can reach a cap: check Social Security with <a href="/payroll-tax-api-ytd-wages">year-to-date wages</a>.',
      ])],
    ],
    faq: [
      { q: 'How much of a $5,000 bonus do I keep?', a: 'It depends on the state. In Texas about 70% after the 22% federal flat rate, Social Security and Medicare; less in states with income tax. The table above shows the engine\'s result for three places.' },
      { q: 'Why is my bonus withheld at 22%?', a: 'Federal withholding on a separately identified bonus uses the flat supplemental rate of 22%. It is an advance on your tax, settled on your return.' },
    ],
    related: ['/supplemental-wage-withholding-rates', '/flat-rate-vs-aggregate-bonus-withholding', '/bonus-gross-up-calculator', '/bonus-withholding-by-state'],
  }));

  add(def({
    path: '/bonus-withholding-by-state', label: 'Bonus withholding by state', group: 'States and rates',
    title: 'Bonus withholding by state: supplemental rates compared',
    description: 'How each state withholds on bonuses and other supplemental wages: states with a flat rate, those that require aggregation, and those with no income tax.',
    h1: 'Bonus withholding by state',
    sub: 'The federal rule is one number. The states are not.',
    lead: p(`Federal withholding on a bonus can use a flat ${pct(0.22)} rate. States set their own rules, and they differ more than the federal ones: a fixed supplemental rate in some, aggregation with regular pay in others, no tax in ${h.states.filter((s) => s.d26.method === 'no_income_tax').length} jurisdictions. This list is read from the 2026 state rule files the engine uses.`),
    sections: [
      ['States with a stated flat supplemental rate in the data', (() => {
        const rows = h.states
          .filter((s) => s.d26.supplementalWages && typeof s.d26.supplementalWages.flatRate === 'number')
          .map((s) => [`<a href="/payroll-tax/${s.slug}">${h.esc(s.name)}</a>`, h.pct(s.d26.supplementalWages.flatRate)]);
        return table2(h, ['State', 'Flat supplemental rate'], rows) + p(`${rows.length} states carry a flat supplemental rate in the rule files. California has two (a higher rate for bonuses and stock options, a lower one for other supplemental pay), so it is recorded separately and not in this list.`);
      })()],
      ['Everything else', ul([
        `<strong>No state income tax:</strong> ${h.states.filter((s) => s.d26.method === 'no_income_tax').map((s) => h.esc(s.name)).join(', ')}.`,
        '<strong>Aggregation:</strong> in most other states a bonus is combined with regular pay and run through the state\'s normal method, which is what happens when you do not tag the earning supplemental.',
        '<strong>Employer choice:</strong> some states allow either a flat rate or aggregation.',
      ])],
      ['Caution', p(`A rate in the data is the state's supplemental rate for withholding. States update these, and some limit when the flat rate may be used. Confirm against the state's current withholding guide before relying on a figure, and read the state page for the source.`)],
    ],
    faq: [
      { q: 'Which states have a flat withholding rate for bonuses?', a: 'Several states publish a flat supplemental rate, listed in the table above from the 2026 rule files. Others require aggregation with regular pay, and some have no income tax.' },
      { q: 'Where is each state\'s source?', a: 'On the state\'s own page under /payroll-tax, which links to the withholding guide the rule file was read from.' },
    ],
    related: ['/supplemental-wage-withholding-rates', '/state-income-tax-withholding-api', '/payroll-tax', '/commission-tax-withholding'],
  }));
  function table2(hh: Helpers, headers: string[], rows: string[][]) { return kv(hh, headers as [string, string], rows); }

  add(def({
    path: '/employee-vs-employer-payroll-taxes', label: 'Employee vs employer payroll taxes', group: 'Employer taxes',
    title: 'Employee vs employer payroll taxes: who pays which tax',
    description: "Which payroll taxes are withheld from the employee and which the employer pays on top: Social Security, Medicare, FUTA, SUTA and paid leave, with a worked.",
    h1: 'Employee vs employer payroll taxes',
    sub: 'Two sets of lines on one paycheck: one comes out of pay, one is a cost.',
    lead: p(`A paycheck carries two kinds of tax. Employee taxes are withheld from the employee's pay: federal income tax, state and local income tax, the employee's share of Social Security and Medicare, and state employee contributions. Employer taxes are paid by the employer on top: the matching Social Security and Medicare, federal unemployment tax, state unemployment tax, and in some states paid-leave contributions. In the API each line says which: <code>payer</code>.`),
    sections: [
      ['One check, both sides', taxTable(h, run(base('CA'))) + p(`For this ${money(300_000)} California check the employee taxes total ${money(ca.employeeTaxTotal)} and the employer taxes ${money(ca.employerTaxTotal)}. Only the first reduces net pay.`)],
      ['Who pays what', kv(h, ['Tax', 'Employee', 'Employer'], [
        ['Federal income tax', 'Withheld', '—'],
        ['Social Security', `${pct(f.ssRate)}`, `${pct(f.ssRate)}`],
        ['Medicare', `${pct(f.medicare)}`, `${pct(f.medicare)}`],
        ['Additional Medicare', `${pct(f.addlMedicare)} above ${dollars(f.addlThreshold)}`, '—'],
        ['Federal unemployment (FUTA)', '—', 'Employer only'],
        ['State unemployment (SUTA)', 'Rare (a few states)', 'Employer, in most states'],
        ['State and local income tax', 'Withheld', '—'],
        ['State disability or paid leave', 'Varies by state', 'Varies by state'],
      ])],
      ['Why the split matters', ul([
        'Net pay depends only on employee taxes.',
        'Employer cost depends on both. See <a href="/true-cost-of-an-employee">the true cost of an employee</a>.',
        'A small number of states charge employees for programs where most charge employers, so check the state page.',
      ])],
    ],
    faq: [
      { q: 'Which payroll taxes does the employer pay?', a: 'The employer\'s match of Social Security and Medicare, federal unemployment tax, state unemployment tax in most states, and some state paid-leave contributions. They are paid on top of gross pay.' },
      { q: 'Does the API show which side pays?', a: 'Yes. Each tax line has a payer field, employee or employer, and the response totals them separately.' },
    ],
    related: ['/employer-payroll-tax-calculator', '/true-cost-of-an-employee', '/fica-tax-calculation', '/futa-suta-calculation'],
  }));

  add(def({
    path: '/payroll-tax-audit-withholding-check', label: 'Payroll tax audit: withholding check', group: 'Calculations',
    title: 'Payroll tax audit: check your provider\'s withholding',
    description: "How to check whether your payroll provider withheld the right tax: rerun a paycheck through an independent engine, compare line by line and read the detail.",
    h1: 'Payroll tax audit: check withholding independently',
    sub: 'Do not take the pay stub on trust. Run it again.',
    lead: p(`Payroll providers make mistakes. A rate not updated in January, a local tax missed after a move, a W-4 entered wrong. They are found when an employee asks, or when a notice arrives. A cheaper way is to rerun a sample of checks through an independent engine and read the differences.`),
    sections: [
      ['A method', ul([
        'Pick a sample: new hires, anyone who moved, anyone who changed their W-4, a few high earners and a few from each state.',
        'For each, collect: check date, pay frequency, earnings and deductions with categories, W-4, state certificate, year-to-date wages, work and home address.',
        'Run each through the engine (a <a href="/payroll-tax-api-test-keys">test key</a> costs nothing).',
        'Compare line by line: federal income tax, FICA, state, local, state programs.',
        'For every difference, read the <code>detail</code> of the engine\'s line and the provider\'s method.',
      ])],
      ['What differences usually mean', kv(h, ['Difference', 'Likely cause'], [
        ['A local tax line is missing or extra', 'Address changed, or the provider uses the home or work address wrongly.'],
        ['Federal income tax is off by a round amount', 'Extra withholding or credit entered differently from the W-4.'],
        ['Social Security keeps being withheld at high earnings', 'Year-to-date wages not tracked, or the base is the wrong year.'],
        ['State tax differs', 'Wrong certificate answers or an out-of-date rate.'],
        ['Net differs by the pre-tax deduction', 'A deduction categorised as post-tax, or the reverse.'],
      ]).replace(/text-align:left/g, 'text-align:left')],
      ['A sample to try', p(`A single employee in Columbus, Ohio on ${money(300_000)} biweekly: federal ${money(line(oh, 'US_FIT')!.amount)}, Ohio ${money(line(oh, 'OH_SIT')?.amount ?? 0)}, Columbus ${money(line(oh, 'OH_LOCAL')?.amount ?? 0)}, net ${money(oh.netPay)}. If your provider shows something different for the same inputs, find out why.`)],
      ['Limits', p(`An independent engine can disagree with your provider and still be the one that is wrong, or both can be wrong for different reasons. Treat a difference as a question to resolve against the agency's published method, not as a verdict.`)],
    ],
    faq: [
      { q: 'How can I check if my payroll provider withheld the right tax?', a: 'Rerun a sample of paychecks through an independent engine with the same inputs, compare each tax line, and read the engine\'s detail text on any difference.' },
      { q: 'Does the check cost anything?', a: 'Test keys run the same engine as live keys and are never billed, within a cap of 30 requests a minute and 500 a day.' },
    ],
    related: ['/payroll-tax-api-explainable-tax-lines', '/payroll-tax-api-testing-fixtures', '/payroll-tax-calculator-for-accountants', '/payroll-tax-api-test-environment'],
  }));

  void [oh, ca]; // referenced above
  return L;
}

import type { PaycheckInput } from '../../src/types.ts';
import { inp, line, p, kv, run, W4, type Helpers, type Result, type TopicDef } from './seo-more-kit.ts';

/**
 * Worked tables appended to pages that would otherwise show a single example: the same line at three
 * pay levels, or the same pay under three choices. Every cell is an engine result.
 */
export function addExtras(h: Helpers, defs: TopicDef[]): TopicDef[] {
  const { money } = h;
  const reg = (amount: number) => ({ code: 'REG', category: 'regular', amount });
  const sup = (amount: number) => ({ code: 'BON', category: 'supplemental', amount });
  const mk = (state: string, cert: Record<string, unknown> = {}, gross = 300_000, extra: Record<string, unknown> = {}, w4: Record<string, unknown> = {}) =>
    ({ ...inp(h, state, cert, gross), federalW4: { ...W4, ...w4 }, ...extra }) as PaycheckInput;
  const right = (html: string) => html.replace(/text-align:left/g, 'text-align:right');
  const PAYS = [150_000, 300_000, 600_000];

  /** One tax line across three pay levels. */
  const levels = (state: string, cert: Record<string, unknown>, id: string, what: string) => {
    const rows = PAYS.map((g) => {
      const r = run(mk(state, cert, g));
      const t = line(r, id);
      return [money(g), money(t?.amount ?? 0), money(r.netPay)];
    });
    return ['The same line at three pay levels', p(`Every figure below is a ${what} on a biweekly check, run through the engine.`) + right(kv(h, ['Gross pay', 'Line', 'Net pay'], rows))] as [string, string];
  };

  const X: Record<string, [string, string]> = {};
  X['/washington-cares-fund-premium'] = levels('WA', {}, 'WA_LTC_EE', 'Washington Cares Fund premium');
  X['/connecticut-paid-leave-contribution'] = levels('CT', {}, 'CT_PFML_EE', 'Connecticut Paid Leave contribution');
  X['/rhode-island-tdi-withholding'] = levels('RI', {}, 'RI_DBL_EE', 'Rhode Island TDI contribution');
  X['/hawaii-tdi-withholding'] = levels('HI', {}, 'HI_DBL_EE', 'Hawaii TDI deduction');
  X['/new-york-disability-benefits-withholding'] = levels('NY', {}, 'NY_DBL_EE', 'New York DBL deduction');
  X['/michigan-city-income-tax-withholding'] = levels('MI', { residenceCity: 'Detroit', workCity: 'Detroit' }, 'MI_LOCAL', 'Detroit resident tax');
  X['/kentucky-occupational-license-tax-withholding'] = levels('KY', { workCity: 'Louisville', workCounty: 'Jefferson', residenceCounty: 'Jefferson' }, 'KY_LOCAL', 'Louisville occupational tax');
  X['/kansas-city-st-louis-earnings-tax'] = levels('MO', { locality: 'Kansas City' }, 'KC_EARN', 'Kansas City earnings tax');
  X['/yonkers-income-tax-withholding'] = levels('NY', { yonkersResident: true, nycResident: false }, 'NY_YONKERS_SIT', 'Yonkers resident tax');
  X['/indiana-county-income-tax-withholding'] = levels('IN', { county: 'Marion' }, 'IN_COUNTY', 'Marion County tax');
  X['/maryland-county-income-tax-withholding'] = levels('MD', { county: 'Montgomery' }, 'MD_SIT', 'Maryland line (state and Montgomery County together)');
  X['/nyc-resident-income-tax-withholding'] = levels('NY', { nycResident: true }, 'NY_NYC_SIT', 'New York City resident tax');
  X['/alabama-occupational-tax-withholding'] = levels('AL', { workCity: 'Birmingham' }, 'AL_LOCAL', 'Birmingham occupational tax');

  // W-4 pages ------------------------------------------------------------------------------------
  {
    const rows = PAYS.map((g) => {
      const f = (fs: string) => run(mk('TX', {}, g, {}, { filingStatus: fs }));
      const s = f('single'), m = f('married_joint'), hoh = f('head_of_household');
      return [money(g), money(line(s, 'US_FIT')!.amount), money(line(m, 'US_FIT')!.amount), money(line(hoh, 'US_FIT')!.amount)];
    });
    X['/w4-filing-status-withholding'] = ['Three pay levels, three statuses', p('Federal income tax on a biweekly check, single filer against the other two statuses. The gap grows with pay, because the brackets differ.') + right(kv(h, ['Gross pay', 'Single', 'Married filing jointly', 'Head of household'], rows)) + p('The 2020-or-later Form W-4 offers three boxes in Step 1(c): single or married filing separately, married filing jointly or qualifying surviving spouse, and head of household. The engine takes the same three values.')];
  }
  {
    const rows = [200_000, 400_000, 800_000].map((c) => {
      const r = run(mk('TX', {}, 300_000, {}, { dependentCredit: c }));
      return [money(c), money(line(r, 'US_FIT')!.amount), money(r.netPay)];
    });
    X['/w4-dependent-credit-withholding'] = ['Three credit sizes', p(`The same ${money(300_000)} biweekly check with different Step 3 totals. Each is divided by 26 pay periods and subtracted from the tentative tax.`) + right(kv(h, ['Step 3 total per year', 'Federal income tax', 'Net pay'], rows))];
  }
  {
    const rows = [2_500, 5_000, 10_000].map((e) => {
      const r = run(mk('TX', {}, 300_000, {}, { extraWithholding: e }));
      return [money(e), money(line(r, 'US_FIT')!.amount), money(r.netPay)];
    });
    X['/w4-extra-withholding'] = ['Three extra amounts', p(`The same ${money(300_000)} biweekly check. Net pay falls by exactly the extra amount each time.`) + right(kv(h, ['Extra per check', 'Federal income tax', 'Net pay'], rows))];
  }
  {
    const rows = PAYS.map((g) => {
      const a = run(mk('TX', {}, g)), e = run(mk('TX', {}, g, {}, { exempt: true }));
      return [money(g), money(line(a, 'US_FIT')!.amount), money(a.netPay), money(e.netPay)];
    });
    X['/exempt-from-withholding-w4'] = ['Three pay levels', p('What exempt status is worth on a biweekly check, and what it leaves untouched.') + right(kv(h, ['Gross pay', 'Federal income tax if not exempt', 'Net pay, not exempt', 'Net pay, exempt'], rows)) + p('The difference in net pay is the federal income tax line and nothing else. Social Security and Medicare are the same in both columns.')];
  }
  {
    const rows = [100_000, 250_000, 500_000].map((c) => {
      const fl = run(mk('TX', {}, 300_000, { earnings: [reg(300_000), sup(c)] }));
      const ag = run(mk('TX', {}, 300_000, { earnings: [reg(300_000), reg(c)] }));
      const f = (r: Result) => (line(r, 'US_FIT')?.amount ?? 0) + (line(r, 'US_FIT_SUPP')?.amount ?? 0);
      return [money(c), money(f(fl)), money(f(ag)), money(fl.netPay), money(ag.netPay)];
    });
    X['/commission-tax-withholding'] = ['Three commission sizes', p(`A ${money(300_000)} regular biweekly check plus a commission, withheld both ways.`) + right(kv(h, ['Commission', 'Federal, flat', 'Federal, aggregate', 'Net, flat', 'Net, aggregate'], rows)) + p('The flat column grows by exactly 22% of each commission. The aggregate column grows faster because the larger combined check annualises into a higher bracket.')];
  }
  {
    const rows = [500_000, 2_000_000, 10_000_000].map((a) => {
      const r = run(mk('TX', {}, 300_000, { earnings: [sup(a)] }));
      return [money(a), money((line(r, 'US_FIT_SUPP')?.amount ?? 0)), money(line(r, 'US_SS_EE')!.amount + line(r, 'US_MED_EE')!.amount), money(r.netPay)];
    });
    X['/severance-pay-tax-withholding'] = ['Three severance sizes in Texas', p('Severance paid alone as supplemental wages. The Social Security column stops growing once the wage base is reached.') + right(kv(h, ['Severance', 'Federal income tax', 'Social Security and Medicare', 'Net pay'], rows))];
  }
  {
    const rows = [500_000, 1_000_000, 2_500_000].map((b) => {
      const r = run(mk('TX', {}, 300_000, { earnings: [sup(b)] }));
      return [money(b), money(line(r, 'US_FIT_SUPP')!.amount), money(line(r, 'US_SS_EE')!.amount + line(r, 'US_MED_EE')!.amount), money(r.netPay), ((r.netPay / r.grossPay) * 100).toFixed(1) + '%'];
    });
    X['/year-end-bonus-net-pay'] = ['Three bonus sizes in Texas', p('A bonus paid alone, with no state income tax to subtract.') + right(kv(h, ['Bonus', 'Federal (22% flat)', 'Social Security and Medicare', 'Net', 'Share kept'], rows))];
  }
  {
    const rows = [30_000, 80_000, 150_000].map((d) => {
      const r = run(mk('TX', {}, 300_000, { deductions: [{ code: 'D', category: null, amount: d }] }));
      return [money(d), money(r.employeeTaxTotal), money(r.netPay)];
    });
    X['/post-tax-deductions-net-pay'] = ['Three deduction sizes', p(`The ${money(300_000)} biweekly check with a post-tax deduction. Employee taxes do not change in any row, and net pay falls by the full amount.`) + right(kv(h, ['Post-tax deduction', 'Employee taxes', 'Net pay'], rows))];
  }
  {
    const rows = [20_000, 100_000, 250_000].map((e) => {
      const r = run(mk('TX', {}, 300_000, { earnings: [reg(300_000), { code: 'MILE', category: 'reimbursement', amount: e }] }));
      return [money(e), money(r.employeeTaxTotal), money(r.netPay)];
    });
    X['/expense-reimbursement-payroll-tax'] = ['Three reimbursement sizes', p(`The ${money(300_000)} biweekly check plus a reimbursement. Taxes stay put and net pay rises by exactly the reimbursement.`) + right(kv(h, ['Reimbursement', 'Employee taxes', 'Net pay'], rows))];
  }
  {
    const rows = [6_000, 12_000, 24_000].map((i) => {
      const r = run(mk('TX', {}, 300_000, { earnings: [reg(300_000), { code: 'GTL', category: 'imputed', amount: i }] }));
      return [money(i), money(line(r, 'US_FIT')!.taxableWages), money(r.employeeTaxTotal), money(r.netPay)];
    });
    X['/imputed-income-payroll-tax'] = ['Three imputed amounts', p(`The ${money(300_000)} biweekly check with imputed income added. Cash pay is unchanged and net pay falls as taxes rise.`) + right(kv(h, ['Imputed income', 'Federal taxable wages', 'Employee taxes', 'Net pay'], rows))];
  }
  {
    const rows = [15_000, 30_000, 60_000].map((d) => {
      const f = (cat: string) => run(mk('TX', {}, 300_000, { deductions: [{ code: 'D', category: cat, amount: d }] }));
      return [money(d), money(f('section125').netPay), money(f('hsa').netPay), money(f('deferral_401k').netPay)];
    });
    X['/hsa-payroll-tax-treatment'] = ['Net pay at three contribution sizes', p(`The ${money(300_000)} biweekly check. Net pay is highest for the Section 125 and HSA columns because they also cut Social Security and Medicare.`) + right(kv(h, ['Contribution', 'Net, Section 125 premium', 'Net, HSA', 'Net, 401(k)'], rows))];
  }
  {
    const rows = [15_000, 30_000, 60_000].map((d) => {
      const r = run(mk('TX', {}, 300_000, { deductions: [{ code: 'D', category: 'section125', amount: d }] }));
      return [money(d), money(line(r, 'US_FIT')!.taxableWages), money(r.employeeTaxTotal), money(r.employerTaxTotal), money(r.netPay)];
    });
    X['/section-125-cafeteria-plan-payroll-tax'] = ['Three premium sizes', p('The same check with a Section 125 premium. The employer share falls along with the employee share.') + right(kv(h, ['Premium', 'Taxable wages', 'Employee taxes', 'Employer taxes', 'Net pay'], rows))];
  }
  {
    const rows = [15_000, 30_000, 60_000].map((d) => {
      const r = run(mk('TX', {}, 300_000, { deductions: [{ code: 'D', category: 'section125', amount: d }] }));
      return [money(d), money(line(r, 'US_MED_EE')!.taxableWages), money(line(r, 'US_MED_EE')!.amount)];
    });
    X['/medicare-tax-calculation'] = ['Medicare at three Section 125 premium sizes', p('Medicare is a flat percentage of Medicare wages, so each premium lowers it in proportion.') + right(kv(h, ['Section 125 premium', 'Medicare wages', 'Employee Medicare'], rows))];
  }
  {
    const rows = [1_500_000, 7_800_000, 15_600_000].map((sal) => {
      const g = Math.round(sal / 26);
      const t = run(mk('TX', {}, g)), c = run(mk('CA', {}, g));
      return [money(sal), money(t.netPay), money(c.netPay), money(t.netPay - c.netPay)];
    });
    X['/relocation-paycheck-comparison'] = ['Three salaries, Texas to California', p('Net pay per biweekly check at three annual salaries. The cost of the move grows with pay.') + right(kv(h, ['Annual salary', 'Net in Texas', 'Net in California', 'Difference per check'], rows))];
  }
  {
    const places: Array<[string, Result]> = [
      ['Texas', run(mk('TX'))], ['California', run(mk('CA'))], ['Washington', run(mk('WA'))], ['New York', run(mk('NY'))],
      ['Columbus, Ohio', run(mk('OH', { residenceCity: 'Columbus', workCity: 'Columbus' }))],
    ];
    X['/payroll-tax-calculator-for-hr-managers'] = ['Five common locations', p(`A candidate on ${money(300_000)} biweekly, single, no deductions. Quote the number for their location, not an average.`) + right(kv(h, ['Location', 'Employee taxes', 'Net pay', 'Employer taxes'], places.map(([n, r]) => [n, money(r.employeeTaxTotal), money(r.netPay), money(r.employerTaxTotal)])))];
  }
  {
    const rows = [['California', 'CA'], ['Hawaii', 'HI'], ['New Jersey', 'NJ'], ['New York', 'NY'], ['Rhode Island', 'RI']].map(([n, c]) => {
      const r = run(mk(c!, {}, 1_000_000));
      const t = r.taxes.find((x) => /_(DBL|SDI)_EE$/.test(x.id));
      return [n!, money(t?.amount ?? 0)];
    });
    X['/state-disability-insurance-payroll'] = ['The same line on a $10,000 check', p('Caps show up on a larger check: New York and Hawaii stop at a small weekly amount, California does not stop.') + right(kv(h, ['State', 'Disability line on ' + money(1_000_000)], rows))];
  }
  {
    const bases = h.states
      .map((s) => ({ s, base: h.wageBaseOf(s.d26.suiEmployer?.wageBase), rate: s.d26.suiEmployer?.newEmployerRate as number | undefined }))
      .filter((x): x is { s: (typeof h.states)[number]; base: number; rate: number } => typeof x.base === 'number' && typeof x.rate === 'number');
    const pick = ['TX', 'CA', 'NY', 'WA', 'FL'].map((c) => bases.find((b) => b.s.code === c)).filter(Boolean) as typeof bases;
    const wage = 5_000_000;
    X['/suta-wage-base-by-state-ranked'] = ['An employee paid $50,000 a year', p(`Unemployment tax at the new-employer rate on a ${money(wage)} annual wage depends on the wage base, because only the first slice is taxed.`) + right(kv(h, ['State', 'Wage base', 'New-employer rate', 'Tax on ' + money(wage)], pick.map(({ s, base, rate }) => [h.esc(s.name), h.dollars(base), h.pct(rate), money(Math.round(Math.min(base * 100, wage) * rate))])))];
  }
  {
    const f = h.federalFacts();
    const max26 = Math.round(f.ssBase26 * f.ssRate * 100), max27 = Math.round(f.ssBase27 * f.ssRate * 100);
    X['/2027-payroll-tax-changes-by-state'] = ['What the Social Security change means for one employee', p(`The wage base rises from ${h.dollars(f.ssBase26)} to ${h.dollars(f.ssBase27)}, so the most an employee pays in Social Security rises from ${money(max26)} to ${money(max27)}, and the employer pays the same again. That is ${money(max27 - max26)} more per high earner on each side. The change only reaches employees paid above the 2026 base, but it moves the point in the year where Social Security stops.`)];
  }
  {
    const rows = [5_200_000, 7_800_000, 10_400_000].map((sal) => {
      const b = run(mk('TX', {}, Math.round(sal / 26), { payFrequency: 'biweekly' }));
      const m = run(mk('TX', {}, Math.round(sal / 24), { payFrequency: 'semimonthly' }));
      return [money(sal), money(b.netPay * 26), money(m.netPay * 24), money(Math.abs(b.netPay * 26 - m.netPay * 24))];
    });
    X['/semimonthly-vs-biweekly-pay'] = ['Net pay for the year at three salaries', p('Federal withholding only, single filer in Texas. The yearly net differs by a small amount that comes from the two withholding tables.') + right(kv(h, ['Annual salary', 'Net, 26 biweekly checks', 'Net, 24 semimonthly checks', 'Difference'], rows))];
  }

  return defs.map((d) => {
    const extra = X[d.path];
    return extra ? { ...d, body: `${d.body}\n    <h2>${extra[0]}</h2>\n    ${extra[1]}` } : d;
  });
}

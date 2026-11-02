import { fmt, type Cents } from '../../src/money.ts';
import { federalRuleset } from '../../src/registry.ts';
import type { W2Summary } from '../filings.ts';
import { formW2Due } from './calendar.ts';
import type { EmployerIdentity, Finding, Form941 } from './form941.ts';

/**
 * Forms W-2 / W-3 checks and the W-3 <-> Form 941 reconciliation.
 *
 * Source: General Instructions for Forms W-2 and W-3 (2026), "Reconciling Forms
 * W-2, W-3, 941, ...", read in full. The IRS and SSA compare, year to year:
 *
 *   - W-3 box 2 (income tax withheld)            with the four 941s' line 3
 *   - W-3 boxes 3, 5 and 7 (SS wages, Medicare wages, SS tips)
 *                                                  with 941 lines 5a+5b, 5c
 *   - W-3 boxes 4 and 6 (taxes withheld)          with the 941 taxes, which "should be
 *     approximately twice the amounts shown on Form W-3"
 *
 * One consequence worth stating: Additional Medicare Tax is paid by the
 * employee only, so the 941's Medicare tax (line 5c column 2 + line 5d column 2)
 * is twice the REGULAR Medicare withholding plus one share of the additional
 * tax. W-2 box 6 contains the regular tax and the additional tax, so
 * expected 941 Medicare = 2 x box 6 - line 5d column 2.
 *
 * The instructions' own checklist for individual W-2s is applied as errors:
 * box 4 only if box 3 or 7 is nonzero; box 6 only if box 5 is; box 5 not less
 * than boxes 3 + 7; box 3 not above the social security wage base ($184,500 in
 * 2026). This module does not hold SSNs, addresses or the control number, so
 * it produces the W-3 totals and the reconciliation, not the SSA file (see
 * agency.ts for why).
 */

export interface W3 {
  year: number;
  employer: EmployerIdentity;
  /** Box c: total number of Forms W-2. */
  totalForms: number;
  box1_wages: Cents;
  box2_federalIncomeTaxWithheld: Cents;
  box3_socialSecurityWages: Cents;
  box4_socialSecurityTaxWithheld: Cents;
  box5_medicareWages: Cents;
  box6_medicareTaxWithheld: Cents;
  box10_dependentCareBenefits: Cents;
  /** Box 12 totals by code (W-3 box 12a: deferred compensation is code D/E/F/G/H/S/Y totals). */
  box12ByCode: Record<string, Cents>;
  /** State wages and income tax withheld totals, by state (boxes 16-17 detail; the W-3 itself carries the sums). */
  stateTotals: Record<string, { wages: Cents; incomeTaxWithheld: Cents }>;
  due: string;
}

export function buildW3(year: number, employer: EmployerIdentity, w2s: readonly W2Summary[]): W3 {
  const w3: W3 = {
    year,
    employer,
    totalForms: w2s.length,
    box1_wages: 0,
    box2_federalIncomeTaxWithheld: 0,
    box3_socialSecurityWages: 0,
    box4_socialSecurityTaxWithheld: 0,
    box5_medicareWages: 0,
    box6_medicareTaxWithheld: 0,
    box10_dependentCareBenefits: 0,
    box12ByCode: {},
    stateTotals: {},
    due: formW2Due(year),
  };
  for (const w of w2s) {
    w3.box1_wages += w.box1_wages;
    w3.box2_federalIncomeTaxWithheld += w.box2_federalIncomeTaxWithheld;
    w3.box3_socialSecurityWages += w.box3_socialSecurityWages;
    w3.box4_socialSecurityTaxWithheld += w.box4_socialSecurityTaxWithheld;
    w3.box5_medicareWages += w.box5_medicareWages;
    w3.box6_medicareTaxWithheld += w.box6_medicareTaxWithheld;
    w3.box10_dependentCareBenefits += w.box10_dependentCareBenefits;
    for (const b of w.box12) w3.box12ByCode[b.code] = (w3.box12ByCode[b.code] ?? 0) + b.amount;
    for (const s of w.box15to17_state) {
      const t = (w3.stateTotals[s.state] ??= { wages: 0, incomeTaxWithheld: 0 });
      t.wages += s.wages;
      t.incomeTaxWithheld += s.incomeTaxWithheld;
    }
  }
  return w3;
}

/** The instructions' own checklist for one employee's W-2. */
export function validateW2(w2: W2Summary, year: number): Finding[] {
  const out: Finding[] = [];
  const who = `Employee ${w2.employeeId}`;
  const wageBase = (() => {
    try {
      const ss = (federalRuleset(`${year}-06-30`) as unknown as { socialSecurity?: { wageBase?: number } }).socialSecurity;
      return ss?.wageBase !== undefined ? Math.round(ss.wageBase * 100) : undefined;
    } catch {
      return undefined;
    }
  })();
  if (w2.box4_socialSecurityTaxWithheld !== 0 && w2.box3_socialSecurityWages === 0) {
    out.push({ severity: 'error', code: 'box4_without_box3', message: `${who}: box 4 is ${fmt(w2.box4_socialSecurityTaxWithheld)} but social security wages (box 3) and tips (box 7) are both zero.` });
  }
  if (w2.box6_medicareTaxWithheld !== 0 && w2.box5_medicareWages === 0) {
    out.push({ severity: 'error', code: 'box6_without_box5', message: `${who}: box 6 is ${fmt(w2.box6_medicareTaxWithheld)} but Medicare wages (box 5) are zero.` });
  }
  if (w2.box5_medicareWages < w2.box3_socialSecurityWages) {
    out.push({ severity: 'error', code: 'box5_less_than_box3', message: `${who}: Medicare wages (${fmt(w2.box5_medicareWages)}) are less than social security wages (${fmt(w2.box3_socialSecurityWages)}); box 5 may not be less than boxes 3 + 7.` });
  }
  if (wageBase !== undefined && w2.box3_socialSecurityWages > wageBase) {
    out.push({ severity: 'error', code: 'box3_over_wage_base', message: `${who}: social security wages (${fmt(w2.box3_socialSecurityWages)}) exceed the ${year} wage base (${fmt(wageBase)}).` });
  }
  if (w2.box1_wages < 0 || w2.box2_federalIncomeTaxWithheld < 0) {
    out.push({ severity: 'error', code: 'negative_box', message: `${who}: a W-2 box is negative.` });
  }
  return out;
}

export interface ReconciliationRow {
  label: string;
  w3: Cents;
  form941: Cents;
  difference: Cents;
  /** The cents the two are allowed to differ by purely from rounding. */
  tolerance: Cents;
  matches: boolean;
}

export interface W3Reconciliation {
  rows: ReconciliationRow[];
  findings: Finding[];
  /** True when every row matches within rounding. */
  reconciled: boolean;
}

/**
 * Compare a year's W-3 with the year's four Forms 941. `forms941` must be the
 * returns for the same company and year (any order; a missing quarter is
 * reported). Differences beyond rounding are NOT automatically wrong - sick pay
 * paid by a third party, uncollected tax on tips, and prior-year adjustments all
 * legitimately separate the two - but each must be explained and kept on file,
 * so each becomes a finding rather than being absorbed.
 */
export function reconcileW3With941(w3: W3, forms941: readonly Form941[]): W3Reconciliation {
  const findings: Finding[] = [];
  const quarters = new Set(forms941.filter((f) => f.year === w3.year).map((f) => f.quarter));
  for (const q of [1, 2, 3, 4] as const) {
    if (!quarters.has(q)) findings.push({ severity: 'error', code: 'missing_941', message: `No Form 941 for ${w3.year} Q${q}; the W-3 cannot be reconciled without all four quarters.` });
  }
  const f = forms941.filter((x) => x.year === w3.year);
  const sum = (pick: (x: Form941) => Cents) => f.reduce((s, x) => s + pick(x), 0);
  // Wage rows are sums of integer cents on both sides, so they match to the cent
  // apart from a stray adjustment; allow a couple of cents per form regardless.
  const tol = w3.totalForms * 2 + 4;
  // Tax rows are not: Form 941 computes column 2 once on the quarter's wages while
  // box 4 / box 6 are sums of every paycheck's own rounded tax. Each paycheck is off
  // by at most half a cent per share, so 2 x (the W-2 sum) can drift from the 941 by
  // at most one cent per paycheck, plus the 941's own few roundings. The drift
  // accumulates in one direction when paychecks are alike, so it scales with the
  // number of paychecks, not the number of employees.
  const paychecks = f.reduce((s, x) => s + x.statistics.paychecks, 0);
  const taxTol = paychecks + 8;

  const line3 = sum((x) => x.line3_federalIncomeTaxWithheld);
  const ssWages = sum((x) => x.line5a_socialSecurityWages.column1 + x.line5b_socialSecurityTips.column1);
  const medWages = sum((x) => x.line5c_medicareWagesAndTips.column1);
  const ssTax941 = sum((x) => x.line5a_socialSecurityWages.column2 + x.line5b_socialSecurityTips.column2);
  const medTax941 = sum((x) => x.line5c_medicareWagesAndTips.column2 + x.line5d_additionalMedicare.column2);
  const addl941 = sum((x) => x.line5d_additionalMedicare.column2);
  const line2 = sum((x) => x.line2_wagesTipsOtherCompensation);

  const row = (label: string, w3v: Cents, f941: Cents, tolerance: Cents): ReconciliationRow => ({
    label,
    w3: w3v,
    form941: f941,
    difference: f941 - w3v,
    tolerance,
    matches: Math.abs(f941 - w3v) <= tolerance,
  });
  const rows: ReconciliationRow[] = [
    row('Box 1 wages vs 941 line 2', w3.box1_wages, line2, tol),
    row('Box 2 income tax withheld vs 941 line 3', w3.box2_federalIncomeTaxWithheld, line3, tol),
    row('Box 3 (+7) social security wages vs 941 lines 5a + 5b col. 1', w3.box3_socialSecurityWages, ssWages, tol),
    row('Box 5 Medicare wages vs 941 line 5c col. 1', w3.box5_medicareWages, medWages, tol),
    row('2 x box 4 social security tax vs 941 lines 5a + 5b col. 2', 2 * w3.box4_socialSecurityTaxWithheld, ssTax941, taxTol),
    row('2 x box 6 - line 5d (Medicare tax) vs 941 lines 5c + 5d col. 2', 2 * w3.box6_medicareTaxWithheld - addl941, medTax941, taxTol),
  ];
  for (const r of rows) {
    if (!r.matches) {
      findings.push({
        severity: 'warning',
        code: 'w3_941_mismatch',
        message: `${r.label}: Forms 941 total ${fmt(r.form941)} and the W-3 ${fmt(r.w3)} differ by ${fmt(r.difference)} (rounding allows ${fmt(r.tolerance)}). The IRS will contact you about unexplained differences; valid reasons include third-party sick pay, uncollected tax on tips and prior-year adjustments. Keep the explanation on file.`,
      });
    }
  }
  return { rows, findings, reconciled: rows.every((r) => r.matches) && findings.every((x) => x.severity !== 'error') };
}

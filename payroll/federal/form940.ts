import { dollars, fmt, type Cents } from '../../src/money.ts';
import { federalRuleset } from '../../src/registry.ts';
import type { PayRun } from '../types.ts';
import { form940Due, futaDepositDue, quarterOf, type ReturnDue } from './calendar.ts';
import type { EmployerIdentity, Finding } from './form941.ts';

/**
 * FORM 940, Employer's Annual Federal Unemployment (FUTA) Tax Return, with
 * Schedule A (multi-state employers and credit reduction).
 *
 * Built from the form and the Instructions for Form 940 (2025), read in full.
 * The 2026 form is not published yet; the structure has been stable for years
 * and the figures that change (the credit-reduction list) are inputs and
 * registry data, not constants in this file. Re-check the line numbers against
 * the 2026 form when the IRS releases it.
 *
 * Rules implemented, each from the instructions:
 *  - Line 3 is ALL payments, "even if the payments aren't taxable for FUTA".
 *  - Line 5 is, per employee, payments minus that employee's exempt payments
 *    minus $7,000 (not below zero), summed - the Joan / Sara / John example
 *    ($42,500) is a test. Line 6 = 4 + 5; line 7 = 3 - 6; line 8 = 7 x 0.006.
 *  - Line 9 (7 x 0.054) applies only if ALL taxable FUTA wages were excluded
 *    from state unemployment tax; then lines 10 and 11 must be zero.
 *  - Line 10 is the instructions' worksheet (partly-excluded wages or late
 *    state payments). It depends on facts the payroll does not hold, so it is
 *    an input, never guessed.
 *  - Line 11 is the Schedule A total: FUTA wages in each credit-reduction state
 *    x that state's reduction rate.
 *  - Line 12 = 8 + 9 + 10 + 11. Line 14 over $500 must be deposited; $500 or
 *    less may be paid with the return; under $1 need not be paid.
 *  - Part 5 (line 16) only when line 12 exceeds $500: the quarter's liability
 *    is the quarter's taxable wages x 0.006, and 16d is line 12 less 16a-16c,
 *    which is where credit reduction and any adjustment land (the instructions
 *    say credit-reduction liability "should be recorded as being incurred in
 *    the fourth quarter").
 *  - Deposits: tax accumulates until it exceeds $500, then is deposited by the
 *    last day of the month after the quarter (the $200 / $400 example is a test).
 *
 * The credit-reduction determination for a year is made after November 10 of
 * that year and applies retroactively. Until the engine's data carries the
 * final list, the return says the figure is provisional rather than implying
 * no reduction.
 */

export const FUTA_WAGE_BASE: Cents = dollars(7_000);
const NET_RATE = { numerator: 6, denominator: 1000 };
const CREDIT_LOST_RATE = { numerator: 54, denominator: 1000 };
export const FUTA_DEPOSIT_THRESHOLD: Cents = dollars(500);

function rate(base: Cents, r: { numerator: number; denominator: number }): Cents {
  return Math.floor((2 * base * r.numerator + r.denominator) / (2 * r.denominator));
}

export interface ExemptPayments {
  fringeBenefits?: Cents;
  groupTermLifeInsurance?: Cents;
  retirementPension?: Cents;
  dependentCare?: Cents;
  other?: Cents;
}

export interface FutaDeposit {
  id: string;
  date: string;
  amount: Cents;
  /** The quarter the deposit was designated to. */
  quarter: 1 | 2 | 3 | 4;
  traceNumber?: string;
}

export interface Form940Input {
  employer: EmployerIdentity;
  year: number;
  runs: readonly PayRun[];
  /** Each employee's own exempt payments (Joan $2,000 ...). When absent, see the derivation note on line 4. */
  exemptPaymentsByEmployee?: Readonly<Record<string, Cents>>;
  /** Which "exempt payment" boxes (4a-4e) to tick; the amounts are the line 4 total. */
  exemptPaymentTypes?: ExemptPayments;
  /** Line 9 applies: every taxable FUTA wage was excluded from state unemployment tax. */
  allWagesExcludedFromStateUnemployment?: boolean;
  /** Line 10: the amount from line 7 of the instructions' worksheet. */
  worksheetCredit?: Cents;
  /**
   * Credit-reduction rates by state, e.g. { CA: 0.012 }. Defaults to the engine's
   * federal data for the year. `determined` is false when the DOL has not yet
   * published the year's list.
   */
  creditReduction?: { states: Readonly<Record<string, number>>; determined: boolean };
  /** FUTA taxable wages by state for Schedule A, when they cannot be read from the pay runs. */
  futaWagesByState?: Readonly<Record<string, Cents>>;
  deposits?: readonly FutaDeposit[];
  /** Overpayment applied from the prior year (adds to line 13). */
  priorYearOverpaymentApplied?: Cents;
  returnType?: { amended?: boolean; successorEmployer?: boolean; noPayments?: boolean; final?: boolean };
  overpaymentElection?: { kind: 'apply_to_next_return' } | { kind: 'refund'; routingNumber?: string; accountType?: 'checking' | 'savings'; accountNumber?: string };
  asOf?: string;
}

export interface ScheduleARow {
  state: string;
  futaTaxableWages: Cents;
  reductionRate: number;
  creditReduction: Cents;
}

export interface FutaQuarter {
  quarter: 1 | 2 | 3 | 4;
  /** Line 16a-16d. */
  liability: Cents;
  /** Cumulative undeposited tax at the end of the quarter, before any deposit due. */
  cumulativeUndeposited: Cents;
  /** Set when the cumulative amount exceeds $500: deposit it by this date. */
  depositDue?: { amount: Cents; dueDate: string };
}

export interface Form940 {
  employer: EmployerIdentity;
  year: number;
  returnType: NonNullable<Form940Input['returnType']>;
  line1a_singleState: string | null;
  line1b_multiState: boolean;
  line2_creditReductionState: boolean;
  line3_totalPayments: Cents;
  line4_exemptPayments: Cents;
  line4_types: ExemptPayments;
  line5_paymentsOverWageBase: Cents;
  line6_subtotal: Cents;
  line7_totalTaxableFutaWages: Cents;
  line8_futaTaxBeforeAdjustments: Cents;
  line9_allWagesExcluded: Cents;
  line10_worksheet: Cents;
  line11_creditReduction: Cents;
  line12_totalFutaTax: Cents;
  line13_deposited: Cents;
  line14_balanceDue: Cents;
  line15a_overpayment: Cents;
  line17_totalLiability: Cents;
  quarters: FutaQuarter[];
  scheduleA?: { rows: ScheduleARow[]; totalCreditReduction: Cents; determined: boolean };
  due: ReturnDue;
  /** True when the balance due is over $500 and so had to be deposited rather than paid with the return. */
  balanceMustHaveBeenDeposited: boolean;
  fields: Record<string, string | number | boolean | null>;
  findings: Finding[];
  readyToSign: boolean;
}

/** Joan / Sara / John: per-employee line 5, summed. */
export function paymentsOverWageBase(
  employees: readonly { payments: Cents; exempt: Cents }[],
): { exempt: Cents; overBase: Cents } {
  let exempt = 0;
  let overBase = 0;
  for (const e of employees) {
    exempt += e.exempt;
    overBase += Math.max(0, e.payments - e.exempt - FUTA_WAGE_BASE);
  }
  return { exempt, overBase };
}

/** Schedule A: wages x reduction rate for each state, summed. */
export function scheduleA(
  wagesByState: Readonly<Record<string, Cents>>,
  rates: Readonly<Record<string, number>>,
): { rows: ScheduleARow[]; total: Cents } {
  const rows: ScheduleARow[] = [];
  for (const [state, wages] of Object.entries(wagesByState).sort(([a], [b]) => a.localeCompare(b))) {
    const r = rates[state] ?? 0;
    if (r <= 0) continue;
    const creditReduction = rate(wages, { numerator: Math.round(r * 10_000), denominator: 10_000 });
    rows.push({ state, futaTaxableWages: wages, reductionRate: r, creditReduction });
  }
  return { rows, total: rows.reduce((s, r) => s + r.creditReduction, 0) };
}

/**
 * The deposit plan from quarterly liabilities: carry tax forward until the
 * cumulative undeposited amount exceeds $500, then it is due by the last day of
 * the month after the quarter. Q4 always settles whatever is left.
 */
export function futaDepositPlan(year: number, liabilities: readonly [Cents, Cents, Cents, Cents]): FutaQuarter[] {
  const out: FutaQuarter[] = [];
  let cumulative = 0;
  for (const q of [1, 2, 3, 4] as const) {
    cumulative += liabilities[q - 1];
    const entry: FutaQuarter = { quarter: q, liability: liabilities[q - 1], cumulativeUndeposited: cumulative };
    if (cumulative > FUTA_DEPOSIT_THRESHOLD) {
      entry.depositDue = { amount: cumulative, dueDate: futaDepositDue(year, q) };
      cumulative = 0;
    }
    out.push(entry);
  }
  return out;
}

function yearOfRuns(runs: readonly PayRun[], year: number): PayRun[] {
  return runs.filter((r) => r.status === 'approved' && r.checkDate.startsWith(`${year}-`));
}

export function computeForm940(input: Form940Input, companyId: string): Form940 {
  const { year, employer } = input;
  const findings: Finding[] = [];
  const runs = yearOfRuns(input.runs, year).filter((r) => r.companyId === companyId);

  // Per employee: total payments (line 3 base) and FUTA-taxable wages (as the engine computed them).
  const perEmployee = new Map<string, { payments: Cents; taxable: Cents }>();
  const quarterTaxable: [Cents, Cents, Cents, Cents] = [0, 0, 0, 0];
  const futaWagesFromRuns: Record<string, Cents> = {};
  const sutaStates = new Set<string>();
  let unattributed = 0;

  for (const run of runs) {
    const q = quarterOf(run.checkDate);
    for (const line of run.lines) {
      const e = perEmployee.get(line.employeeId) ?? { payments: 0, taxable: 0 };
      e.payments += line.grossPay;
      const futa = line.taxLines.find((t) => t.id === 'US_FUTA');
      const taxable = futa?.taxableWages ?? 0;
      e.taxable += taxable;
      perEmployee.set(line.employeeId, e);
      quarterTaxable[q - 1] += taxable;
      const sui = line.taxLines.find((t) => /^[A-Z]{2}_SUI_ER$/.test(t.id));
      const state = sui ? sui.id.slice(0, 2) : undefined;
      if (state) sutaStates.add(state);
      if (taxable > 0) {
        if (state) futaWagesFromRuns[state] = (futaWagesFromRuns[state] ?? 0) + taxable;
        else unattributed += taxable;
      }
    }
  }

  const line3 = [...perEmployee.values()].reduce((s, e) => s + e.payments, 0);
  const line7 = [...perEmployee.values()].reduce((s, e) => s + e.taxable, 0);

  // Lines 4 and 5. With each employee's exempt payments we apply the instructions
  // exactly. Without them: an employee under the $7,000 base has (payments - taxable)
  // of exempt pay; an employee at the base is assumed to have none, so the whole
  // excess is line 5. Lines 6 and 7 are right either way; only the 4/5 split can differ.
  let line4: number;
  let line5: number;
  if (input.exemptPaymentsByEmployee) {
    const r = paymentsOverWageBase(
      [...perEmployee.entries()].map(([id, e]) => ({ payments: e.payments, exempt: input.exemptPaymentsByEmployee![id] ?? 0 })),
    );
    line4 = r.exempt;
    line5 = r.overBase;
    if (line3 - line4 - line5 !== line7) {
      findings.push({
        severity: 'error',
        code: 'futa_wages_do_not_tie',
        message: `Line 3 - (line 4 + line 5) is ${fmt(line3 - line4 - line5)} but the pay runs' FUTA taxable wages are ${fmt(line7)}. The exempt payments entered do not match what the payroll treated as exempt.`,
      });
    }
  } else {
    line4 = 0;
    line5 = 0;
    for (const e of perEmployee.values()) {
      if (e.taxable < FUTA_WAGE_BASE) line4 += e.payments - e.taxable;
      else line5 += e.payments - e.taxable;
    }
    if (line4 + line5 > 0) {
      findings.push({
        severity: 'info',
        code: 'line4_line5_derived',
        message: 'Lines 4 and 5 were split from the pay runs: pay of an employee below $7,000 that was not FUTA-taxable is treated as exempt (line 4); everything not taxable for an employee at the $7,000 base is treated as excess (line 5). Supply each employee\'s exempt payments to state the split exactly.',
      });
    }
  }
  if (input.exemptPaymentTypes) {
    const typed = Object.values(input.exemptPaymentTypes).reduce((s, v) => s + (v ?? 0), 0);
    if (typed !== line4) {
      findings.push({ severity: 'warning', code: 'exempt_types_do_not_sum_to_line4', message: `The exempt payment types sum to ${fmt(typed)} but line 4 is ${fmt(line4)}.` });
    }
  }
  const line6 = line4 + line5;
  const line8 = rate(line7, NET_RATE);

  // Part 3
  const allExcluded = input.allWagesExcludedFromStateUnemployment ?? false;
  const line9 = allExcluded ? rate(line7, CREDIT_LOST_RATE) : 0;
  const line10 = allExcluded ? 0 : (input.worksheetCredit ?? 0);

  // Credit reduction (Schedule A)
  const fromRules = (() => {
    try {
      const cfg = federalRuleset(`${year}-06-30`).futa as unknown as { creditReduction?: { states?: Record<string, number>; determinationDate?: string } };
      const states = cfg.creditReduction?.states ?? {};
      return { states, determined: Object.keys(states).length > 0 || cfg.creditReduction?.determinationDate === undefined };
    } catch {
      return undefined;
    }
  })();
  const creditReduction = input.creditReduction ?? fromRules ?? { states: {}, determined: false };
  const wagesByState = input.futaWagesByState ?? futaWagesFromRuns;
  const sched = allExcluded ? { rows: [] as ScheduleARow[], total: 0 } : scheduleA(wagesByState, creditReduction.states);
  const line11 = sched.total;
  const hasReductionState = sched.rows.length > 0 || Object.keys(wagesByState).some((s) => (creditReduction.states[s] ?? 0) > 0);

  if (unattributed > 0 && !input.futaWagesByState && Object.keys(creditReduction.states).length > 0) {
    findings.push({
      severity: 'error',
      code: 'futa_wages_without_state',
      message: `${fmt(unattributed)} of FUTA-taxable wages could not be attributed to a state (no state unemployment line on the paycheck). Schedule A needs wages by state: supply futaWagesByState.`,
    });
  }
  if (!creditReduction.determined) {
    findings.push({
      severity: 'warning',
      code: 'credit_reduction_not_determined',
      message: `The Department of Labor has not published ${year}'s FUTA credit-reduction states (the determination is made after November 10 and applies to the whole year, retroactively). Line 11 here is ${fmt(line11)} on the list the engine currently holds; re-run once the list is published, before filing.`,
    });
  }
  if (allExcluded && line7 === 0) {
    findings.push({ severity: 'info', code: 'line9_without_wages', message: 'Line 9 was selected but there are no taxable FUTA wages.' });
  }

  const line12 = line8 + line9 + line10 + line11;

  const deposits = input.deposits ?? [];
  const line13 = deposits.reduce((s, d) => s + d.amount, 0) + (input.priorYearOverpaymentApplied ?? 0);
  const line14 = line12 > line13 ? line12 - line13 : 0;
  const line15a = line13 > line12 ? line13 - line12 : 0;

  // Part 5
  const needsPart5 = line12 > FUTA_DEPOSIT_THRESHOLD;
  const accrued: [Cents, Cents, Cents, Cents] = [
    rate(quarterTaxable[0], NET_RATE),
    rate(quarterTaxable[1], NET_RATE),
    rate(quarterTaxable[2], NET_RATE),
    rate(quarterTaxable[3], NET_RATE),
  ];
  // 16d = line 17 (= line 12) less 16a-16c: this is where credit reduction, line 9/10
  // adjustments and any rounding settle.
  accrued[3] = line12 - (accrued[0] + accrued[1] + accrued[2]);
  if (accrued[3] < 0) {
    findings.push({ severity: 'error', code: 'q4_liability_negative', message: 'The first three quarters\' liability exceeds the annual FUTA tax, so the fourth quarter would be negative. A line 10 credit larger than the tax is not possible.' });
    accrued[3] = 0;
  }
  const quarters = futaDepositPlan(year, accrued);

  // Deposit status
  const asOf = input.asOf ?? form940Due(year).dueDate;
  const due = form940Due(year);
  const balanceMustHaveBeenDeposited = line14 > FUTA_DEPOSIT_THRESHOLD;
  if (balanceMustHaveBeenDeposited) {
    findings.push({
      severity: 'warning',
      code: 'balance_over_500_must_be_deposited',
      message: `Balance due is ${fmt(line14)}, more than $500, which must be deposited rather than paid with the return. Check the quarterly deposits due: ${quarters.filter((q) => q.depositDue).map((q) => `${fmt(q.depositDue!.amount)} by ${q.depositDue!.dueDate}`).join('; ') || 'none'}.`,
    });
  } else if (line14 > 0 && line14 < dollars(1)) {
    findings.push({ severity: 'info', code: 'balance_under_one_dollar', message: 'You do not have to pay a balance of less than $1.' });
  }
  for (const q of quarters) {
    if (!q.depositDue) continue;
    const paid = deposits.filter((d) => d.quarter === q.quarter).reduce((s, d) => s + d.amount, 0);
    const lateDeposits = deposits.filter((d) => d.quarter === q.quarter && d.date > q.depositDue!.dueDate);
    if (paid < q.depositDue.amount && asOf > q.depositDue.dueDate) {
      findings.push({ severity: 'warning', code: 'futa_deposit_short', message: `Q${q.quarter} FUTA deposit of ${fmt(q.depositDue.amount)} was due ${q.depositDue.dueDate}; ${fmt(paid)} deposited.` });
    }
    if (lateDeposits.length > 0) {
      findings.push({ severity: 'warning', code: 'futa_deposit_late', message: `Q${q.quarter} FUTA deposit was made after ${q.depositDue.dueDate}.` });
    }
  }
  if (line9 > 0 && (line10 > 0 || line11 > 0)) {
    findings.push({ severity: 'error', code: 'line9_excludes_10_and_11', message: 'If line 9 is greater than zero, lines 10 and 11 must be zero.' });
  }
  if (!/^\d{9}$/.test(employer.ein)) findings.push({ severity: 'error', code: 'invalid_ein', message: 'The EIN must be nine digits (no hyphen).' });
  if (!employer.legalName.trim()) findings.push({ severity: 'error', code: 'missing_name', message: 'The business name is required.' });
  if (runs.length === 0 && !input.returnType?.noPayments) {
    findings.push({ severity: 'info', code: 'no_payments', message: `No wages were paid in ${year}. Tick "No payments to employees" (box c) on the return.` });
  }

  const states = [...sutaStates].sort();
  const multiState = states.length > 1;
  const fields: Form940['fields'] = {
    EIN: employer.ein,
    Name: employer.legalName,
    Year: year,
    Line1a: states.length === 1 ? states[0] : null,
    Line1b: multiState,
    Line2: hasReductionState,
    Line3: line3,
    Line4: line4,
    Line5: line5,
    Line6: line6,
    Line7: line7,
    Line8: line8,
    Line9: line9,
    Line10: line10,
    Line11: line11,
    Line12: line12,
    Line13: line13,
    Line14: line14,
    Line15a: line15a,
    Line16a: needsPart5 ? quarters[0].liability : null,
    Line16b: needsPart5 ? quarters[1].liability : null,
    Line16c: needsPart5 ? quarters[2].liability : null,
    Line16d: needsPart5 ? quarters[3].liability : null,
    Line17: needsPart5 ? line12 : null,
  };

  return {
    employer,
    year,
    returnType: input.returnType ?? {},
    line1a_singleState: states.length === 1 ? states[0] : null,
    line1b_multiState: multiState,
    line2_creditReductionState: hasReductionState,
    line3_totalPayments: line3,
    line4_exemptPayments: line4,
    line4_types: input.exemptPaymentTypes ?? {},
    line5_paymentsOverWageBase: line5,
    line6_subtotal: line6,
    line7_totalTaxableFutaWages: line7,
    line8_futaTaxBeforeAdjustments: line8,
    line9_allWagesExcluded: line9,
    line10_worksheet: line10,
    line11_creditReduction: line11,
    line12_totalFutaTax: line12,
    line13_deposited: line13,
    line14_balanceDue: line14,
    line15a_overpayment: line15a,
    line17_totalLiability: needsPart5 ? line12 : 0,
    quarters,
    scheduleA: multiState || hasReductionState ? { rows: sched.rows, totalCreditReduction: line11, determined: creditReduction.determined } : undefined,
    due,
    balanceMustHaveBeenDeposited,
    fields,
    findings,
    readyToSign: !findings.some((f) => f.severity === 'error'),
  };
}

export function renderForm940(f: Form940): string {
  const m = (c: Cents) => fmt(c).replace('$', '').padStart(14);
  const row = (line: string, label: string, value: string) => `${line.padEnd(5)}${label.padEnd(58)}${value}`;
  const out = [
    `Form 940 for ${f.year} - Employer's Annual Federal Unemployment (FUTA) Tax Return`,
    `${f.employer.legalName}   EIN ${f.employer.ein.slice(0, 2)}-${f.employer.ein.slice(2)}`,
    `Due ${f.due.dueDate}${f.due.extendedDueDate ? ` (${f.due.extendedDueDate} if all FUTA tax was deposited on time)` : ''}`,
    '',
    row('1', f.line1b_multiState ? 'Multi-state employer - complete Schedule A' : `State unemployment tax paid in: ${f.line1a_singleState ?? '(none found)'}`, ''),
    row('2', 'Paid wages in a credit-reduction state', f.line2_creditReductionState ? '[X]'.padStart(14) : ''.padStart(14)),
    row('3', 'Total payments to all employees', m(f.line3_totalPayments)),
    row('4', 'Payments exempt from FUTA tax', m(f.line4_exemptPayments)),
    row('5', 'Payments to each employee in excess of $7,000', m(f.line5_paymentsOverWageBase)),
    row('6', 'Subtotal (4 + 5)', m(f.line6_subtotal)),
    row('7', 'Total taxable FUTA wages (3 - 6)', m(f.line7_totalTaxableFutaWages)),
    row('8', 'FUTA tax before adjustments (7 x 0.006)', m(f.line8_futaTaxBeforeAdjustments)),
    row('9', 'All taxable FUTA wages excluded from state tax (7 x 0.054)', m(f.line9_allWagesExcluded)),
    row('10', 'Some wages excluded / state tax paid late (worksheet)', m(f.line10_worksheet)),
    row('11', 'Credit reduction (Schedule A)', m(f.line11_creditReduction)),
    row('12', 'Total FUTA tax after adjustments', m(f.line12_totalFutaTax)),
    row('13', 'FUTA tax deposited for the year', m(f.line13_deposited)),
    row('14', 'Balance due', m(f.line14_balanceDue)),
    row('15a', 'Overpayment', m(f.line15a_overpayment)),
  ];
  if (f.line17_totalLiability > 0) {
    out.push('', 'Part 5 - liability by quarter:');
    for (const q of f.quarters) out.push(row(`16${'abcd'[q.quarter - 1]}`, `Quarter ${q.quarter}`, m(q.liability)));
    out.push(row('17', 'Total tax liability for the year (= line 12)', m(f.line17_totalLiability)));
    const deps = f.quarters.filter((q) => q.depositDue);
    if (deps.length) out.push('', 'Deposits due: ' + deps.map((q) => `${fmt(q.depositDue!.amount)} by ${q.depositDue!.dueDate}`).join('; '));
  }
  if (f.scheduleA) {
    out.push('', `Schedule A - credit reduction${f.scheduleA.determined ? '' : ' (PROVISIONAL: the DOL list for the year is not final)'}:`);
    for (const r of f.scheduleA.rows) out.push(row(r.state, `${fmt(r.futaTaxableWages)} x ${(r.reductionRate * 100).toFixed(1)}%`, m(r.creditReduction)));
    if (f.scheduleA.rows.length === 0) out.push('  (no credit-reduction state)');
  }
  if (f.findings.length) {
    out.push('', 'Review:');
    for (const x of f.findings) out.push(`  [${x.severity}] ${x.code}: ${x.message}`);
  }
  out.push('', f.readyToSign ? 'No errors: ready for a responsible person to review and sign.' : 'NOT READY TO SIGN: resolve the errors above.');
  return out.join('\n');
}

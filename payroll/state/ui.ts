import { fmt, type Cents } from '../../src/money.ts';
import { quarterBounds } from '../federal/calendar.ts';
import type { Finding } from '../federal/form941.ts';
import type { PayRun } from '../types.ts';
import { holidayFinding, resolveDue, secondarySourceFinding, type ResolvedDue } from './calendar.ts';
import { buildStateLedger, employeeQuarterWages, type EmployeeQuarter } from './ledger.ts';
import type { StateProfile } from './profile.ts';

/**
 * The STATE QUARTERLY REPORT: the employer's unemployment wage-and-contribution
 * report for one quarter, with each return's due date from the state's own rule.
 *
 * It assembles the CONTENT every state asks for (each employee's wages for the
 * quarter, the wages the contribution is computed on, totals, and the contribution
 * owed) and checks it. The agency-specific FILE FORMAT is a separate matter (a
 * profile lists the channel and says whether its layout was read); where it was not,
 * nothing here pretends to produce the file.
 *
 * "Subject wages" is each agency's own definition; gross pay is used as the proxy and
 * the report says so. Social security numbers are not held by the engine, so the
 * report never invents them: they must be supplied at filing time.
 */

export interface StateQuarterlyReport {
  state: string;
  year: number;
  quarter: 1 | 2 | 3 | 4;
  returns: { id: string; name: string; due: ResolvedDue; contents: string[] }[];
  employees: EmployeeQuarter[];
  totals: { grossWages: Cents; uiTaxableWages: Cents; withholdingWages: Cents; withheld: Cents; employerUi: Cents; employeeInsurance: Cents };
  /** The employer's unemployment contribution owed for the quarter (the engine's computed amount; the agency's own rate notice governs). */
  contributionDue: Cents;
  findings: Finding[];
  readyToFile: boolean;
}

export function stateQuarterlyReport(
  profile: StateProfile,
  companyId: string,
  runs: readonly PayRun[],
  year: number,
  quarter: 1 | 2 | 3 | 4,
  options: { extraHolidays?: readonly string[] } = {},
): StateQuarterlyReport {
  const findings: Finding[] = [];
  const bounds = quarterBounds(year, quarter);
  const empty = { grossWages: 0, uiTaxableWages: 0, withholdingWages: 0, withheld: 0, employerUi: 0, employeeInsurance: 0 };
  if (!profile.ui) {
    findings.push({ severity: 'error', code: 'state_ui_not_modelled', message: `${profile.state}: the unemployment reporting rules are not modelled (${profile.notModelled.join('; ') || 'no profile section'}).` });
    return { state: profile.state, year, quarter, returns: [], employees: [], totals: empty, contributionDue: 0, findings, readyToFile: false };
  }
  const hf = holidayFinding(profile);
  if (hf) findings.push(hf);
  const sf = secondarySourceFinding(profile);
  if (sf) findings.push(sf);

  const employees = employeeQuarterWages(profile, companyId, runs, bounds);
  const days = buildStateLedger(profile, companyId, runs, bounds);
  const totals = {
    grossWages: employees.reduce((s, e) => s + e.grossWages, 0),
    uiTaxableWages: employees.reduce((s, e) => s + e.uiTaxableWages, 0),
    withholdingWages: employees.reduce((s, e) => s + e.withholdingWages, 0),
    withheld: employees.reduce((s, e) => s + e.withheld, 0),
    employerUi: days.reduce((s, d) => s + d.employerUi, 0),
    employeeInsurance: days.reduce((s, d) => s + d.employeeInsurance, 0),
  };

  // The wage base is annual: an employee's contribution wages across the year must not exceed it.
  const ytd = employeeQuarterWages(profile, companyId, runs, { start: `${year}-01-01`, end: bounds.end });
  for (const e of ytd) {
    if (e.uiTaxableWages > profile.ui.wageBase) {
      findings.push({
        severity: 'error',
        code: 'ui_wages_exceed_wage_base',
        message: `Employee ${e.employeeId}: ${fmt(e.uiTaxableWages)} of year-to-date wages were taxed for unemployment, above the ${profile.state} ${profile.ui.wageBaseYear} wage base of ${fmt(profile.ui.wageBase)}.`,
      });
    }
  }
  if (employees.length === 0) {
    findings.push({ severity: 'info', code: 'no_wages', message: `No wages were paid in ${year} Q${quarter}. ${profile.state} may still require a report for the quarter: check the agency's rule.` });
  }
  findings.push({ severity: 'info', code: 'subject_wages_basis', message: 'Gross pay is used as the quarter\'s subject wages; the agency\'s own definition of subject wages governs and may exclude items.' });
  findings.push({ severity: 'info', code: 'ssn_not_held', message: 'The engine does not hold social security numbers. Supply each employee\'s SSN when filing; the report does not invent them.' });

  const anchor = bounds.start;
  const returns = profile.ui.returns.map((r) => ({
    id: r.id,
    name: r.name,
    due: resolveDue(r.due, anchor, profile, options.extraHolidays ?? []),
    contents: r.contents,
  }));
  return {
    state: profile.state,
    year,
    quarter,
    returns,
    employees,
    totals,
    contributionDue: totals.employerUi,
    findings,
    readyToFile: !findings.some((f) => f.severity === 'error'),
  };
}

export interface WithholdingReturnDue {
  id: string;
  name: string;
  frequency: 'quarterly' | 'annual';
  due: ResolvedDue;
  contents: string[];
}

/**
 * The state withholding returns a profile lists (quarterly reconciliations and the
 * annual reconciliation) and when each is due for the period containing `anchor`
 * (any date in the quarter, or in the year for annual returns).
 */
export function withholdingReturnDates(profile: StateProfile, anchor: string, options: { extraHolidays?: readonly string[] } = {}): WithholdingReturnDue[] {
  return (profile.withholding?.returns ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    frequency: r.frequency,
    due: resolveDue(r.due, anchor, profile, options.extraHolidays ?? []),
    contents: r.contents,
  }));
}

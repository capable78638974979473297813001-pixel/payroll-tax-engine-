import type { Cents } from '../../src/money.ts';
import type { PayRun, PayRunLine } from '../types.ts';
import type { StateProfile } from './profile.ts';

/**
 * The STATE ledger: what was withheld and owed to one state, by the date wages
 * were paid, read from the tax lines the engine emits (`XX_SIT`, `XX_SUI_ER`,
 * `XX_DBL_EE`, ...). Only approved runs count; the check date is the pay date.
 */

export interface StateDay {
  date: string;
  /** State income tax withheld. */
  withholding: Cents;
  /** Wages the state income tax was computed on. */
  withholdingWages: Cents;
  /** Employee-paid insurance withheld for the state (SDI, paid leave ...). */
  employeeInsurance: Cents;
  /** Employer unemployment contributions. */
  employerUi: Cents;
  /** Wages the employer UI contribution was computed on (after the wage base). */
  uiWages: Cents;
  employeeIds: string[];
}

const amt = (l: PayRunLine, id: string): Cents => l.taxLines.find((t) => t.id === id)?.amount ?? 0;
const wag = (l: PayRunLine, id: string): Cents => l.taxLines.find((t) => t.id === id)?.taxableWages ?? 0;

export function buildStateLedger(
  profile: StateProfile,
  companyId: string,
  runs: readonly PayRun[],
  range: { start: string; end: string },
): StateDay[] {
  const ids = profile.withholding?.taxLineIds;
  const uiId = profile.ui?.employerTaxLineId;
  const byDate = new Map<string, StateDay>();
  for (const run of runs) {
    if (run.companyId !== companyId || run.status !== 'approved') continue;
    if (run.checkDate < range.start || run.checkDate > range.end) continue;
    const day = byDate.get(run.checkDate) ?? { date: run.checkDate, withholding: 0, withholdingWages: 0, employeeInsurance: 0, employerUi: 0, uiWages: 0, employeeIds: [] };
    for (const line of run.lines) {
      let touched = false;
      if (ids) {
        day.withholding += amt(line, ids.withholding);
        day.withholdingWages += wag(line, ids.withholding);
        for (const ins of ids.employeeInsurance) day.employeeInsurance += amt(line, ins);
        touched = true;
      }
      if (uiId) {
        day.employerUi += amt(line, uiId);
        day.uiWages += wag(line, uiId);
        touched = true;
      }
      if (touched && !day.employeeIds.includes(line.employeeId)) day.employeeIds.push(line.employeeId);
    }
    byDate.set(run.checkDate, day);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export interface EmployeeQuarter {
  employeeId: string;
  /** Gross pay across the quarter's approved runs. A proxy for the state's "subject wages"; the exact definition is the agency's. */
  grossWages: Cents;
  /** Wages the employer UI contribution was computed on (capped at the wage base by the engine). */
  uiTaxableWages: Cents;
  withholdingWages: Cents;
  withheld: Cents;
}

export function employeeQuarterWages(
  profile: StateProfile,
  companyId: string,
  runs: readonly PayRun[],
  range: { start: string; end: string },
): EmployeeQuarter[] {
  const ids = profile.withholding?.taxLineIds;
  const uiId = profile.ui?.employerTaxLineId;
  const rows = new Map<string, EmployeeQuarter>();
  for (const run of runs) {
    if (run.companyId !== companyId || run.status !== 'approved') continue;
    if (run.checkDate < range.start || run.checkDate > range.end) continue;
    for (const line of run.lines) {
      const r = rows.get(line.employeeId) ?? { employeeId: line.employeeId, grossWages: 0, uiTaxableWages: 0, withholdingWages: 0, withheld: 0 };
      r.grossWages += line.grossPay;
      if (uiId) r.uiTaxableWages += wag(line, uiId);
      if (ids) {
        r.withholdingWages += wag(line, ids.withholding);
        r.withheld += amt(line, ids.withholding);
      }
      rows.set(line.employeeId, r);
    }
  }
  return [...rows.values()].sort((a, b) => a.employeeId.localeCompare(b.employeeId));
}

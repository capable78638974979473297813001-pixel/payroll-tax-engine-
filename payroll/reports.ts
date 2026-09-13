import type { Cents } from '../src/money.ts';
import type { Company, Employee, PayRun } from './types.ts';
import { activeEmployeesFor } from './run.ts';

/**
 * Company-level analytics: headcount, payroll cost, and a department
 * breakdown — pure aggregations over records this project already
 * maintains, the same "no new business logic, just a rollup" discipline
 * payroll/filings.ts uses for Form 941/940/W-2. Nothing here is a new
 * source of truth; a wrong figure would be a wrong SUM, not a wrong
 * calculation.
 */

export interface DepartmentHeadcount {
  department: string;
  headcount: number;
}

export interface CompanyReport {
  companyId: string;
  /** Headcount as of `asOfDate` — active employees, same definition payroll/run.ts's own activeEmployeesFor() uses for who gets paid. */
  headcount: number;
  /** Employees with no department on file are grouped under this literal label rather than silently dropped from the count. */
  byDepartment: DepartmentHeadcount[];
  year: number;
  /** Sum of every APPROVED run's grossPay this year. */
  ytdGrossPay: Cents;
  /** Sum of every APPROVED run's employeeTaxTotal this year. */
  ytdEmployeeTaxes: Cents;
  /** Sum of every APPROVED run's employerTaxTotal this year — the employer's own cost beyond gross pay. */
  ytdEmployerTaxes: Cents;
  /** Gross pay + employer taxes — the employer's own true cost of payroll, not just what employees were paid. */
  ytdTotalPayrollCost: Cents;
  payRunCount: number;
}

const UNASSIGNED_DEPARTMENT = '(unassigned)';

export function computeCompanyReport(
  company: Company,
  employees: readonly Employee[],
  payRuns: readonly PayRun[],
  asOfDate: string,
): CompanyReport {
  const active = activeEmployeesFor(company, employees, asOfDate);

  const byDepartmentMap = new Map<string, number>();
  for (const employee of active) {
    const department = employee.department ?? UNASSIGNED_DEPARTMENT;
    byDepartmentMap.set(department, (byDepartmentMap.get(department) ?? 0) + 1);
  }
  const byDepartment = [...byDepartmentMap.entries()]
    .map(([department, headcount]) => ({ department, headcount }))
    .sort((a, b) => b.headcount - a.headcount);

  const year = Number(asOfDate.slice(0, 4));
  const runsThisYear = payRuns.filter((r) => r.companyId === company.id && r.status === 'approved' && r.checkDate.startsWith(String(year)));

  let ytdGrossPay = 0;
  let ytdEmployeeTaxes = 0;
  let ytdEmployerTaxes = 0;
  for (const run of runsThisYear) {
    for (const line of run.lines) {
      ytdGrossPay += line.grossPay;
      ytdEmployeeTaxes += line.employeeTaxTotal;
      ytdEmployerTaxes += line.employerTaxTotal;
    }
  }

  return {
    companyId: company.id,
    headcount: active.length,
    byDepartment,
    year,
    ytdGrossPay,
    ytdEmployeeTaxes,
    ytdEmployerTaxes,
    ytdTotalPayrollCost: ytdGrossPay + ytdEmployerTaxes,
    payRunCount: runsThisYear.length,
  };
}

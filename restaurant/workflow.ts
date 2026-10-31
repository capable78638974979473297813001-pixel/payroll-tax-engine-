import { createHash } from 'node:crypto';
import { draftPayRun, activeEmployeesFor, approvePayRun } from '../payroll/run.ts';
import { auditLogEntry } from '../payroll/auditLog.ts';
import { withPayrollDb, readPayrollDb } from '../payroll/store.ts';
import type { Company, Employee, PayRun, TimeEntry } from '../payroll/types.ts';
export interface RestaurantEntry extends TimeEntry {
  cashTipsCents: number;
  paycheckTipsCents: number;
  serviceChargesCents: number;
  hoursReviewed: boolean;
  tipsReviewed: boolean;
}
export interface ReviewInput {
  companyId: string; periodStart: string; periodEnd: string; checkDate: string;
  entries: RestaurantEntry[];
}
export interface Review {
  input: ReviewInput; fingerprint: string; run: PayRun; blockers: string[];
  totals: { gross: number; net: number; employeeTaxes: number; employerTaxes: number; employerCost: number; reportedTips: number };
}
export function isoDate(value: string): boolean {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function validate(input: ReviewInput, company: Company, employees: Employee[]): void {
  if (!input || input.companyId !== company.id || ![input.periodStart, input.periodEnd, input.checkDate].every(isoDate) || input.periodEnd < input.periodStart || input.checkDate < input.periodEnd || Date.parse(input.periodEnd) - Date.parse(input.periodStart) > 31 * 86400000) throw new Error('Choose a valid pay period and a check date on or after its end.');
  if (!Array.isArray(input.entries) || input.entries.length > 5000) throw new Error('Invalid employee entries.');
  const ids = new Set<string>();
  for (const entry of input.entries) {
    if (!entry || ids.has(entry.employeeId) || !employees.some(e => e.id === entry.employeeId)) throw new Error('Duplicate or unknown employee entry.');
    ids.add(entry.employeeId);
    for (const key of ['regularHours', 'overtimeHours', 'cashTipsCents', 'paycheckTipsCents', 'serviceChargesCents'] as const) {
      const value = entry[key];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100000000 || (key.endsWith('Cents') && !Number.isSafeInteger(value))) throw new Error(`Invalid ${key}.`);
    }
    if (entry.regularHours + entry.overtimeHours > 744 || entry.extraEarnings?.length || entry.doubleTimeHours || entry.ptoHours) throw new Error('Use the specialist payroll flow for additional earnings, PTO or double time.');
  }
}
export function reviewPayroll(input: ReviewInput, company: Company, employees: Employee[]): Review {
  validate(input, company, employees);
  const active = activeEmployeesFor(company, employees, input.checkDate);
  const blockers: string[] = [];
  const expectedDays = company.paySchedule.frequency === 'weekly' ? 7 : company.paySchedule.frequency === 'biweekly' ? 14 : null;
  if (expectedDays && (Date.parse(input.periodEnd) - Date.parse(input.periodStart)) / 86400000 + 1 !== expectedDays) blockers.push(`This employer uses ${company.paySchedule.frequency} payroll. Select a ${expectedDays}-day period.`);
  if (!active.length) blockers.push('No active employees in this pay period.');
  for (const employee of active) {
    const entry = input.entries.find(e => e.employeeId === employee.id);
    const name = `${employee.firstName} ${employee.lastName}`;
    if (!entry || entry.hoursReviewed !== true) blockers.push(`${name}: review hours, overtime and job rates.`);
    if (!entry || entry.tipsReviewed !== true) blockers.push(`${name}: reconcile tips and service charges, including zero amounts.`);
    if (entry && (entry.cashTipsCents || entry.paycheckTipsCents || entry.serviceChargesCents)) blockers.push(`${name}: tipped/service-charge payroll requires the dedicated tip-tax engine, which is not implemented. No tips have been added to the calculation.`);
    if (employee.payType.kind === 'hourly' && entry && entry.regularHours + entry.overtimeHours === 0) blockers.push(`${name}: zero hours needs a separate exclusion or no-pay workflow.`);
  }
  const safeEntries = input.entries.map(e => ({ employeeId: e.employeeId, regularHours: e.regularHours, overtimeHours: e.overtimeHours }));
  const run = draftPayRun(company, employees, input.periodStart, input.periodEnd, input.checkDate, safeEntries);
  for (const issue of run.minimumWageIssues) blockers.push(`${issue.employeeId}: minimum-wage shortfall in ${issue.jurisdiction}.`);
  if (run.lines.some(line => line.netPayAfterGarnishment < 0)) blockers.push('Negative net pay requires correction.');
  const sum = (key: 'grossPay' | 'netPayAfterGarnishment' | 'employeeTaxTotal' | 'employerTaxTotal') => run.lines.reduce((total, line) => total + line[key], 0);
  const gross = sum('grossPay'), employerTaxes = sum('employerTaxTotal');
  return { input, run, blockers, fingerprint: createHash('sha256').update(JSON.stringify({ company, employees, input })).digest('hex'), totals: { gross, net: sum('netPayAfterGarnishment'), employeeTaxes: sum('employeeTaxTotal'), employerTaxes, employerCost: gross + employerTaxes, reportedTips: input.entries.reduce((s, e) => s + e.cashTipsCents + e.paycheckTipsCents, 0) } };
}
/** One synchronous store mutation: stale reviews and duplicate/overlapping runs are refused. */
export function commitReview(review: Review, actorId = 'local-restaurant-operator'): PayRun {
  return withPayrollDb(db => {
    const company = db.companies[review.input.companyId];
    if (!company) throw new Error('Employer no longer exists.');
    const employees = Object.values(db.employees).filter(e => e.companyId === company.id);
    const fresh = reviewPayroll(review.input, company, employees);
    if (fresh.fingerprint !== review.fingerprint) throw new Error('Employee or employer records changed. Review payroll again.');
    if (fresh.blockers.length) throw new Error('Resolve all payroll blockers before approval.');
    const overlap = Object.values(db.payRuns).some(r => r.companyId === company.id && r.status === 'approved' && r.periodStart <= fresh.run.periodEnd && r.periodEnd >= fresh.run.periodStart);
    if (overlap) throw new Error('This period overlaps an approved payroll. Use a correction or off-cycle workflow.');
    if (Object.values(db.payRuns).some(r => r.companyId === company.id && r.status === 'approved' && r.checkDate > fresh.run.checkDate)) throw new Error('A later payroll is already recorded. Use a correction workflow to preserve year-to-date calculations.');
    const { run, updatedEmployees } = approvePayRun({ ...fresh.run, id: review.run.id }, employees);
    for (const employee of updatedEmployees) db.employees[employee.id] = employee;
    db.payRuns[run.id] = run;
    db.auditLog.push(auditLogEntry(actorId, 'restaurant.payroll.recorded', 'PayRun', run.id, { fingerprint: review.fingerprint, paymentStatus: 'not_submitted', filingStatus: 'not_filed' }));
    return run;
  });
}
export function workspace(companyId: string) {
  return readPayrollDb(db => ({
    companies: Object.values(db.companies).filter(c => c.id === companyId).map(c => ({ id: c.id, legalName: c.legalName, homeState: c.homeState, paySchedule: c.paySchedule, hasEin: Boolean(c.ein) })),
    employees: Object.values(db.employees).filter(e => e.companyId === companyId).map(e => ({ id: e.id, companyId: e.companyId, firstName: e.firstName, lastName: e.lastName, jobTitle: e.jobTitle, department: e.department, payType: e.payType, hireDate: e.hireDate, terminationDate: e.terminationDate })),
    runs: Object.values(db.payRuns).filter(r => r.companyId === companyId).map(r => ({ ...r, lines: r.lines.map(({ depositAllocations, ...line }) => line) })),
  }));
}

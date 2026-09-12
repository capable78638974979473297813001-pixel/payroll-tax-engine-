import { calculatePaycheck } from '../src/calculate.ts';
import { calculateGarnishments } from '../src/garnishment.ts';
import type { GarnishmentResult } from '../src/garnishment.ts';
import type { Cents } from '../src/money.ts';
import type { Deduction, Earning, PaycheckInput, PaycheckResult } from '../src/types.ts';
import { PERIODS_PER_YEAR } from '../src/types.ts';
import { allocateNetPay } from './directDeposit.ts';
import type { DepositAllocation } from './directDeposit.ts';
import type { Company, Employee, PayRunLine, TimeEntry } from './types.ts';

/**
 * Turns one employee's standing records (payType, deductionPlans,
 * garnishmentOrders, ...) plus this period's hours into exactly the
 * PaycheckInput the tax engine expects, runs it, layers garnishments on
 * top, and splits what's left across direct deposit accounts.
 *
 * This is the one place a payroll run touches src/calculate.ts and
 * src/garnishment.ts — every other module in payroll/ works with the
 * result, never the engine's own input shape directly, so a change to how
 * an employee's pay is ASSEMBLED never has to ripple through run.ts or the
 * store.
 */

const OVERTIME_MULTIPLIER = 1.5;

/** Regular + overtime pay for the period from an hourly employee's own rate and reported hours, or a salaried employee's own period slice of their annual salary. Overtime is priced at 1.5x but reported under the SAME 'regular' EarningCategory as straight time — real payroll practice taxes overtime paid on the same cheque as regular wages via the ordinary method, not the flat supplemental rate reserved for a bonus or commission paid as identifiably separate compensation (see EarningCategory's own doc comment in src/types.ts). */
function baseEarnings(employee: Employee, timeEntry: TimeEntry | undefined, periodsPerYear: number): Earning[] {
  if (employee.payType.kind === 'salary') {
    return [{ code: 'REG', category: 'regular', amount: Math.round(employee.payType.annualSalary / periodsPerYear) }];
  }

  const entry = timeEntry ?? { employeeId: employee.id, regularHours: 0, overtimeHours: 0 };
  const earnings: Earning[] = [];
  const regularPay = Math.round(employee.payType.hourlyRate * entry.regularHours);
  earnings.push({ code: 'REG', category: 'regular', amount: regularPay });
  if (entry.overtimeHours > 0) {
    const overtimePay = Math.round(employee.payType.hourlyRate * OVERTIME_MULTIPLIER * entry.overtimeHours);
    earnings.push({ code: 'OT', category: 'regular', amount: overtimePay });
  }
  return earnings;
}

function extraEarnings(timeEntry: TimeEntry | undefined): Earning[] {
  return (timeEntry?.extraEarnings ?? []).map((e) => ({ code: e.code, category: e.category, amount: e.amount }));
}

/** Cash portion of this period's earnings — what a percentOfGross deduction plan (a 401(k) election, most commonly) is a percentage OF. Excludes 'imputed' income (group-term life over $50k, etc.), which is never cash the employee actually receives to defer a percentage of. */
function cashGrossForDeductions(earnings: readonly Earning[]): Cents {
  return earnings.filter((e) => e.category !== 'imputed').reduce((sum, e) => sum + e.amount, 0);
}

function resolveDeductions(employee: Employee, earnings: readonly Earning[]): Deduction[] {
  const cashGross = cashGrossForDeductions(earnings);
  return employee.deductionPlans
    .filter((plan) => plan.active)
    .map((plan) => ({
      code: plan.code,
      category: plan.category,
      amount:
        plan.amount.kind === 'flat' ? plan.amount.cents : Math.round(cashGross * (plan.amount.percent / 100)),
    }));
}

export function buildPaycheckInput(
  company: Company,
  employee: Employee,
  checkDate: string,
  timeEntry?: TimeEntry,
): PaycheckInput {
  const periodsPerYear = PERIODS_PER_YEAR[company.paySchedule.frequency];
  const earnings = [...baseEarnings(employee, timeEntry, periodsPerYear), ...extraEarnings(timeEntry)];

  return {
    checkDate,
    payFrequency: company.paySchedule.frequency,
    earnings,
    deductions: resolveDeductions(employee, earnings),
    federalW4: employee.federalW4,
    ytd: employee.ytd,
    employer: company.employerContext,
    employmentCategory: employee.employmentCategory,
    workState: employee.workState ?? { code: company.homeState },
    residenceState: employee.residenceState,
    residenceStateWithholding: employee.residenceStateWithholding,
  };
}

export interface EmployeePaycheckComputation {
  employeeId: string;
  input: PaycheckInput;
  result: PaycheckResult;
  garnishment: GarnishmentResult | null;
  depositAllocations: DepositAllocation[];
  line: PayRunLine;
}

/**
 * The full pipeline for one employee on one check date: build the input,
 * run the tax engine, run garnishments against the result (garnishment
 * ceilings are a function of disposable earnings, which doesn't exist
 * until the paycheck itself has been computed — see garnishment.ts's own
 * disposableEarnings()), and split what's left across direct deposit.
 */
export function computeEmployeePaycheck(
  company: Company,
  employee: Employee,
  checkDate: string,
  timeEntry?: TimeEntry,
): EmployeePaycheckComputation {
  const input = buildPaycheckInput(company, employee, checkDate, timeEntry);
  const result = calculatePaycheck(input);

  const garnishment =
    employee.garnishmentOrders.length > 0
      ? calculateGarnishments({
          checkDate,
          payFrequency: company.paySchedule.frequency,
          workState: input.workState!.code,
          paycheck: result,
          orders: employee.garnishmentOrders,
        })
      : null;

  const netPayAfterGarnishment = result.netPay - (garnishment?.totalWithheld ?? 0);
  const depositAllocations = allocateNetPay(netPayAfterGarnishment, employee.directDepositAccounts);

  const line: PayRunLine = {
    employeeId: employee.id,
    grossPay: result.grossPay,
    netPay: result.netPay,
    employeeTaxTotal: result.employeeTaxTotal,
    employerTaxTotal: result.employerTaxTotal,
    pretaxDeductions: result.pretaxDeductions,
    posttaxDeductions: result.posttaxDeductions,
    garnishmentTotal: garnishment?.totalWithheld ?? 0,
    netPayAfterGarnishment,
    taxLines: result.taxes.map((t) => ({ id: t.id, name: t.name, payer: t.payer, taxableWages: t.taxableWages, amount: t.amount })),
    garnishmentLines: garnishment?.lines.map((g) => ({ orderId: g.orderId, withheld: g.withheld, detail: g.detail })) ?? [],
    depositAllocations,
  };

  return { employeeId: employee.id, input, result, garnishment, depositAllocations, line };
}

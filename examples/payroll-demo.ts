import { dollars } from '../src/money.ts';
import { activeEmployeesFor, approvePayRun, draftPayRun, freshYearToDate, renderPaystubText } from '../payroll/index.ts';
import { buildNachaFile } from '../payroll/directDeposit.ts';
import type { AchCredit } from '../payroll/directDeposit.ts';
import type { Company, Employee } from '../payroll/types.ts';

/**
 * End-to-end: a company, two employees (one salaried, one hourly with
 * overtime and a garnishment order), one biweekly pay run from draft
 * through approval, their paystubs, and the NACHA file that would actually
 * move their direct deposits. Run with `npm run demo:payroll`.
 */

const company: Company = {
  id: 'co-demo',
  legalName: 'Riverside Bakery LLC',
  ein: '84-1234567',
  homeState: 'IL',
  paySchedule: { frequency: 'biweekly', anchorPeriodStart: '2026-01-04', checkDateLagDays: 5 },
};

const alice: Employee = {
  id: 'emp-alice',
  companyId: company.id,
  firstName: 'Alice',
  lastName: 'Nguyen',
  hireDate: '2024-03-01',
  employmentCategory: 'standard',
  payType: { kind: 'salary', annualSalary: dollars(78_000) },
  residenceState: { code: 'IL' },
  federalW4: {
    filingStatus: 'married_joint',
    multipleJobs: false,
    dependentCredit: dollars(2_000),
    otherIncome: 0,
    deductions: 0,
    extraWithholding: 0,
  },
  deductionPlans: [
    { id: 'dp-401k', code: '401K', category: 'deferral_401k', amount: { kind: 'percentOfGross', percent: 6 }, active: true },
    { id: 'dp-health', code: 'HEALTH', category: 'section125', amount: { kind: 'flat', cents: dollars(120) }, active: true },
  ],
  directDepositAccounts: [{ id: 'dd-alice', routingNumber: '021000021', accountNumber: '4441002233', accountType: 'checking', allocation: { kind: 'remainder' } }],
  garnishmentOrders: [],
  ytd: freshYearToDate(),
  ytdYear: 2026,
};

const bob: Employee = {
  id: 'emp-bob',
  companyId: company.id,
  firstName: 'Bob',
  lastName: 'Carter',
  hireDate: '2025-07-15',
  employmentCategory: 'standard',
  payType: { kind: 'hourly', hourlyRate: dollars(22) },
  residenceState: { code: 'IL' },
  federalW4: {
    filingStatus: 'single',
    multipleJobs: false,
    dependentCredit: 0,
    otherIncome: 0,
    deductions: 0,
    extraWithholding: 0,
  },
  deductionPlans: [],
  directDepositAccounts: [
    { id: 'dd-bob-savings', routingNumber: '011000015', accountNumber: '778812345', accountType: 'savings', allocation: { kind: 'flatAmount', amount: dollars(100) }, priority: 1 },
    { id: 'dd-bob-checking', routingNumber: '021000021', accountNumber: '990044556', accountType: 'checking', allocation: { kind: 'remainder' } },
  ],
  garnishmentOrders: [{ id: 'ORDER-1', type: 'child_support', amountOrdered: dollars(150), supportingOtherFamily: false }],
  ytd: freshYearToDate(),
  ytdYear: 2026,
};

let employees: Employee[] = [alice, bob];

console.log(`\n=== ${company.legalName} — payroll run for check date 2026-01-22 ===\n`);
console.log(`Active employees: ${activeEmployeesFor(company, employees, '2026-01-22').map((e) => e.firstName).join(', ')}\n`);

const draft = draftPayRun(company, employees, '2026-01-04', '2026-01-17', '2026-01-22', [
  { employeeId: bob.id, regularHours: 80, overtimeHours: 6 },
]);

console.log(`Draft run ${draft.id} — status: ${draft.status}, ${draft.lines.length} employees\n`);

const { run: approved, updatedEmployees } = approvePayRun(draft, employees);
employees = employees.map((e) => updatedEmployees.find((u) => u.id === e.id) ?? e);

console.log(`Approved: status ${approved.status}, approvedAt ${approved.approvedAt}\n`);

for (const line of approved.lines) {
  const employee = employees.find((e) => e.id === line.employeeId)!;
  console.log(renderPaystubText(company, employee, approved, line));
  console.log('-'.repeat(60));
}

// Every deposit allocation across the run, flattened into ACH credits.
const credits: AchCredit[] = approved.lines.flatMap((line) => {
  const employee = employees.find((e) => e.id === line.employeeId)!;
  return line.depositAllocations
    .filter((a) => a.amount > 0)
    .map((a) => {
      const account = employee.directDepositAccounts.find((acc) => acc.id === a.accountId)!;
      return {
        routingNumber: account.routingNumber,
        accountNumber: account.accountNumber,
        accountType: account.accountType,
        amount: a.amount,
        individualId: employee.id,
        individualName: `${employee.firstName} ${employee.lastName}`,
      };
    });
});

const nachaFile = buildNachaFile(credits, {
  originRoutingNumber: '021000021',
  originName: company.legalName,
  immediateOriginId: '841234567',
  companyName: company.legalName,
  companyIdentification: `1${company.ein.replace('-', '')}`,
  effectiveEntryDate: approved.checkDate,
});

console.log(`NACHA file (${credits.length} credits, ${nachaFile.trim().split('\r\n').length} records):\n`);
console.log(nachaFile);

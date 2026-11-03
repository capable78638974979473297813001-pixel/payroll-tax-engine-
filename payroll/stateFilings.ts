import type { Company, PayRun } from './types.ts';

export const STATE_FILING_CODES = Object.freeze(
  'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '),
);

export interface StateTaxReconciliation {
  taxId: string;
  payer: 'employee' | 'employer';
  /** Tax-specific base, NOT total wages reportable to the agency. */
  taxableWages: number;
  amount: number;
  employees: { employeeId: string; taxableWages: number; amount: number }[];
}
export interface StateFilingWorksheet {
  companyId: string;
  stateCode: string;
  year: number;
  quarter: number;
  status: 'worksheet_only';
  canSubmit: false;
  sourceRunIds: string[];
  taxes: StateTaxReconciliation[];
  blockers: string[];
}

function required(value: string, label: string): void {
  if (typeof value !== 'string' || !value.trim()) throw new Error(label + ' is required');
}
function state(value: string): void {
  if (!STATE_FILING_CODES.includes(value)) throw new Error('Unsupported state code');
}
function validDate(value: string): void {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value + 'T00:00:00Z')) ||
      new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) {
    throw new Error('Invalid check date');
  }
}
function cents(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Expected nonnegative safe integer cents');
}
function add(a: number, b: number): number {
  const result = a + b;
  cents(result);
  return result;
}

/**
 * Reconciles stored state tax lines for all 50 states and DC. This is NOT
 * an agency return, wage report, or zero-return determination. Capped UI
 * taxable wages cannot reconstruct total UI subject wages. No submission
 * adapter is installed; every result stays explicitly blocked.
 *
 * requestedStates permits an explicit worksheet for a state with no tax
 * lines. Registrations and observed tax lines also create worksheets.
 * Neither absence of tax nor an empty worksheet means "no filing due".
 */
export function buildStateFilingWorksheets(
  company: Company,
  year: number,
  quarter: number,
  runs: readonly PayRun[],
  requestedStates: readonly string[] = [],
): StateFilingWorksheet[] {
  required(company.id, 'companyId');
  if (!Number.isInteger(year) || year < 1900 || year > 9999) throw new Error('Invalid year');
  if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) throw new Error('Invalid quarter');
  const states = new Set<string>();
  const registered = new Map<string, NonNullable<Company['stateRegistrations']>[number]>();
  for (const code of requestedStates) { state(code); states.add(code); }
  for (const registration of company.stateRegistrations ?? []) {
    state(registration.stateCode);
    if (registered.has(registration.stateCode)) throw new Error('Duplicate state registration');
    registered.set(registration.stateCode, registration);
    states.add(registration.stateCode);
  }
  const selected: PayRun[] = [];
  const ids = new Set<string>();
  for (const run of runs) {
    if (run.companyId !== company.id) continue;
    required(run.id, 'runId');
    // Duplicate historical snapshots must not silently select a status.
    if (ids.has(run.id)) throw new Error('Duplicate pay run');
    ids.add(run.id);
    if (!['draft', 'approved', 'voided'].includes(run.status)) throw new Error('Invalid run status');
    if (run.status !== 'approved') continue;
    validDate(run.checkDate);
    if (Number(run.checkDate.slice(0, 4)) !== year ||
        Math.ceil(Number(run.checkDate.slice(5, 7)) / 3) !== quarter) continue;
    selected.push(run);
  }
  const taxes = new Map<string, Map<string, StateTaxReconciliation>>();
  const sourceIds = new Map<string, Set<string>>();
  for (const run of selected) {
    const employeeIds = new Set<string>();
    for (const line of run.lines) {
      required(line.employeeId, 'employeeId');
      if (employeeIds.has(line.employeeId)) throw new Error('Duplicate employee in pay run');
      employeeIds.add(line.employeeId);
      const taxKeys = new Set<string>();
      for (const tax of line.taxLines) {
        if (tax.jurisdiction !== 'state') continue;
        const code = /^([A-Z]{2})_/.exec(tax.id)?.[1];
        if (!code) throw new Error('State tax has no state code');
        state(code);
        if (!['employee', 'employer'].includes(tax.payer)) throw new Error('Invalid tax payer');
        cents(tax.taxableWages); cents(tax.amount);
        const key = tax.id + ':' + tax.payer;
        if (taxKeys.has(key)) throw new Error('Duplicate state tax line');
        taxKeys.add(key);
        states.add(code);
        const byTax = taxes.get(code) ?? new Map<string, StateTaxReconciliation>();
        const item = byTax.get(key) ?? {
          taxId: tax.id, payer: tax.payer, taxableWages: 0, amount: 0, employees: [],
        };
        const employee = item.employees.find(e => e.employeeId === line.employeeId) ??
          { employeeId: line.employeeId, taxableWages: 0, amount: 0 };
        if (!item.employees.includes(employee)) item.employees.push(employee);
        employee.taxableWages = add(employee.taxableWages, tax.taxableWages);
        employee.amount = add(employee.amount, tax.amount);
        item.taxableWages = add(item.taxableWages, tax.taxableWages);
        item.amount = add(item.amount, tax.amount);
        byTax.set(key, item);
        taxes.set(code, byTax);
        const contributing = sourceIds.get(code) ?? new Set<string>();
        contributing.add(run.id);
        sourceIds.set(code, contributing);
      }
    }
  }
  return [...states].sort().map(stateCode => {
    const registration = registered.get(stateCode);
    const blockers = ['agency_format_not_implemented', 'agency_acceptance_not_verified',
      'reportable_wage_details_required', 'filing_obligations_require_review'];
    if (!registration) blockers.push('state_registration_missing');
    if (registration && !registration.suiAccountNumber?.trim()) blockers.push('sui_account_missing');
    const items = [...(taxes.get(stateCode)?.values() ?? [])];
    if (items.some(t => /^([A-Z]{2})_SIT(?:_|$)/.test(t.taxId)) &&
        !registration?.withholdingAccountNumber?.trim()) blockers.push('withholding_account_missing');
    items.sort((a, b) => (a.taxId + a.payer).localeCompare(b.taxId + b.payer));
    for (const item of items) item.employees.sort((a, b) => a.employeeId.localeCompare(b.employeeId));
    return {
      companyId: company.id, stateCode, year, quarter, status: 'worksheet_only' as const,
      canSubmit: false as const, sourceRunIds: [...(sourceIds.get(stateCode) ?? [])].sort(),
      taxes: items, blockers,
    };
  });
}

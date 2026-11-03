import { createHash } from 'node:crypto';
import { STATE_FILING_CODES } from './stateFilings.ts';

export interface FilingPeriod {
  companyId: string;
  year: number;
  quarter: number;
  accountNumber: string;
  /** Agency-reportable wages, explicitly supplied; never inferred from capped tax bases. */
  wageBasis: 'agency_reportable';
}
export interface CaWageRecord {
  ssn: string;
  firstName: string;
  middleInitial: string;
  lastName: string;
  subjectWagesCents: number;
  pitWagesCents: number;
  pitWithheldCents: number;
  wagePlanCode: 'A' | 'J' | 'L' | 'P' | 'R' | 'S' | 'U';
}
export interface CaDe9cInput extends FilingPeriod {
  state: 'CA';
  form: 'DE9C';
  action: 'original';
  employees: CaWageRecord[];
}
export interface MiWageRecord {
  ssn: string;
  firstName: string;
  middleName: string;
  lastName: string;
  unitNumber: string;
  employedOn12th: [boolean, boolean, boolean];
  uiGrossWagesCents: number;
  seasonal: boolean;
  ownerOfficer: boolean;
  /** Original=0; adjustments=1..9. Out-of-state credit records (10) are not supported. */
  adjustmentCode: number;
}
export interface MiWageInput extends FilingPeriod {
  state: 'MI';
  form: 'UI_WAGE';
  action: 'original' | 'adjustment';
  employerName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  addressState: string;
  zip: string;
  zipExtension: string;
  apportionment: boolean;
  terminatingBusiness: boolean;
  employees: MiWageRecord[];
}
export type StateFilingInput = CaDe9cInput | MiWageInput;
export interface FilingExport {
  filename: string;
  content: string;
  manifest: {
    version: 1;
    companyId: string;
    state: 'CA' | 'MI';
    form: string;
    action: string;
    year: number;
    quarter: number;
    accountLast4: string;
    accountSha256: string;
    formatVersion: string;
    sourceUrl: string;
    sha256: string;
    recordCount: number;
    totalReportableWagesCents: number;
    totalWithheldCents: number | null;
    status: 'prepared';
    submissionMethod: 'manual_portal_upload';
    agencyValidated: false;
  };
  instructions: string[];
}

// Errors name fields only; never include SSNs, names or wage data.
function check(ok: unknown, field: string): asserts ok {
  if (!ok) throw new Error('Invalid or unsupported ' + field);
}
function text(value: unknown, field: string, max: number, pattern: RegExp, optional = false): string {
  check(typeof value === 'string' && value.length <= max &&
    (optional && value === '' || value.trim().length > 0 && pattern.test(value)), field);
  return value;
}
function digits(value: unknown, field: string, length: number): string {
  check(typeof value === 'string' && new RegExp('^[0-9]{' + length + '}$').test(value), field);
  return value;
}
function ssn(value: unknown): string {
  const result = digits(value, 'ssn', 9);
  check(!/^(000|666|9)/.test(result) && result.slice(3, 5) !== '00' && result.slice(5) !== '0000', 'ssn');
  return result;
}
function money(value: unknown, field: string): number {
  check(typeof value === 'number' && Number.isSafeInteger(value) && value >= 0, field);
  return value;
}
function decimal(value: unknown, field: string): string {
  const cents = money(value, field);
  const result = Math.floor(cents / 100) + '.' + String(cents % 100).padStart(2, '0');
  check(result.length <= 12, field);
  return result;
}
function flag(value: unknown, field: string): string {
  check(typeof value === 'boolean', field);
  return value ? 'Y' : 'N';
}
function total(values: number[]): number {
  return values.reduce((sum, value) => money(sum + value, 'total overflow'), 0);
}
function unique(key: string, keys: Set<string>): void {
  check(!keys.has(key), 'duplicate employee record');
  keys.add(key);
}
function knownFields(value: object, allowed: string[]): void {
  check(Object.keys(value).every(key => allowed.includes(key)), 'unexpected input field');
}
export function filingContentHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/** Creates actual agency import layouts. Preparation is never submission or acceptance. */
export function exportStateFiling(input: StateFilingInput): FilingExport {
  check(input && typeof input === 'object', 'input');
  text(input.companyId, 'companyId', 128, /^[A-Za-z0-9_-]+$/);
  check(input.wageBasis === 'agency_reportable', 'wageBasis');
  // MI's fetched specification is explicitly a 2026 revision. Future years require re-verification.
  check(input.year === 2026, 'year (only verified 2026 formats enabled)');
  check(Number.isInteger(input.quarter) && input.quarter >= 1 && input.quarter <= 4, 'quarter');
  check(Array.isArray(input.employees) && input.employees.length > 0, 'employees (use agency no-payroll workflow for zero returns)');
  const keys = new Set<string>();
  let rows: string[];
  let totalWages: number;
  let totalWithheld: number | null;
  let formatVersion: string;
  let sourceUrl: string;
  let instructions: string[];
  if (input.state === 'CA') {
    knownFields(input, ['companyId', 'year', 'quarter', 'accountNumber', 'wageBasis', 'state', 'form', 'action', 'employees']);
    check(input.form === 'DE9C' && input.action === 'original', 'CA form/action');
    digits(input.accountNumber, 'accountNumber', 8);
    const names = new Map<string, string>();
    rows = input.employees.map(employee => {
      check(employee && typeof employee === 'object', 'employee');
      knownFields(employee, ['ssn', 'firstName', 'middleInitial', 'lastName', 'subjectWagesCents', 'pitWagesCents', 'pitWithheldCents', 'wagePlanCode']);
      const id = ssn(employee.ssn);
      check(['A', 'J', 'L', 'P', 'R', 'S', 'U'].includes(employee.wagePlanCode), 'wagePlanCode');
      unique(id + ':' + employee.wagePlanCode, keys);
      const first = text(employee.firstName, 'firstName', 12, /^[A-Za-z -]+$/);
      const middle = text(employee.middleInitial, 'middleInitial', 1, /^[A-Za-z]$/, true);
      const last = text(employee.lastName, 'lastName', 20, /^[A-Za-z -]+$/);
      const name = JSON.stringify([first, middle, last]);
      check(!names.has(id) || names.get(id) === name, 'inconsistent employee name');
      names.set(id, name);
      return [id, first, middle, last, decimal(employee.subjectWagesCents, 'subjectWagesCents'),
        decimal(employee.pitWagesCents, 'pitWagesCents'), decimal(employee.pitWithheldCents, 'pitWithheldCents'),
        employee.wagePlanCode].join(',');
    });
    totalWages = total(input.employees.map(e => e.subjectWagesCents));
    totalWithheld = total(input.employees.map(e => e.pitWithheldCents));
    formatVersion = 'DE8300-rev12-2024-07-AppendixA';
    sourceUrl = 'https://edd.ca.gov/siteassets/files/pdf_pub_ctr/de8300.pdf';
    instructions = [
      'Sign in to EDD e-Services for Business for the employer account shown in your input.',
      'Select the 2026 quarter and the DE 9C direct-entry/import workflow. Import the CSV as employee detail, not a bulk return.',
      'Verify account, quarter, wage-plan eligibility, all wage totals and monthly employee counts in the portal. The CSV contains employee detail only.',
      'Complete the remaining return fields and review before submitting. Record the agency confirmation and final processing result.',
      'File the DE 9 and make any required deposits separately. This CSV does not file DE 9 or pay tax.',
      'For amendments or no payroll, use the agency portal workflow; this exporter supports original employee detail only.',
    ];
  } else if (input.state === 'MI') {
    knownFields(input, ['companyId', 'year', 'quarter', 'accountNumber', 'wageBasis', 'state', 'form', 'action', 'employees',
      'employerName', 'addressLine1', 'addressLine2', 'city', 'addressState', 'zip', 'zipExtension', 'apportionment', 'terminatingBusiness']);
    check(input.form === 'UI_WAGE' && ['original', 'adjustment'].includes(input.action), 'MI form/action');
    const account = digits(input.accountNumber, 'accountNumber', 7);
    const period = String(input.year) + String(input.quarter * 3).padStart(2, '0');
    // Conservative delimiter-safe subset. Do not silently change or truncate legal names/addresses.
    const employerPattern = /^[A-Za-z0-9 '-]+$/;
    check(STATE_FILING_CODES.includes(input.addressState), 'addressState');
    const header = ['RE', period, account,
      text(input.employerName, 'employerName', 60, employerPattern),
      text(input.addressLine1, 'addressLine1', 45, employerPattern),
      text(input.addressLine2, 'addressLine2', 45, employerPattern, true),
      text(input.city, 'city', 35, /^[A-Za-z ]+$/), input.addressState,
      digits(input.zip, 'zip', 5), input.zipExtension === '' ? '' : digits(input.zipExtension, 'zipExtension', 4),
      flag(input.apportionment, 'apportionment'), flag(input.terminatingBusiness, 'terminatingBusiness')].join(',');
    rows = [header, ...input.employees.map(employee => {
      check(employee && typeof employee === 'object', 'employee');
      knownFields(employee, ['ssn', 'firstName', 'middleName', 'lastName', 'unitNumber', 'employedOn12th',
        'uiGrossWagesCents', 'seasonal', 'ownerOfficer', 'adjustmentCode']);
      const id = ssn(employee.ssn);
      const unit = digits(employee.unitNumber, 'unitNumber', 3);
      unique(id + ':' + unit, keys);
      check(Array.isArray(employee.employedOn12th) && employee.employedOn12th.length === 3 &&
        employee.employedOn12th.every(v => typeof v === 'boolean'), 'employedOn12th');
      check(Number.isInteger(employee.adjustmentCode) && (input.action === 'original' ? employee.adjustmentCode === 0 :
        employee.adjustmentCode >= 1 && employee.adjustmentCode <= 9), 'adjustmentCode');
      return ['RW', account, unit, period, ...employee.employedOn12th.map(v => v ? '1' : '0'), id,
        text(employee.lastName, 'lastName', 30, /^[A-Za-z '-]+$/),
        text(employee.firstName, 'firstName', 15, /^[A-Za-z '-]+$/),
        text(employee.middleName, 'middleName', 30, /^[A-Za-z '-]+$/, true),
        String(money(employee.uiGrossWagesCents, 'uiGrossWagesCents')),
        flag(employee.seasonal, 'seasonal'), flag(employee.ownerOfficer, 'ownerOfficer'),
        String(employee.adjustmentCode), '0', 'N', '', '           '].join(',');
    })];
    totalWages = total(input.employees.map(e => e.uiGrossWagesCents));
    totalWithheld = null;
    formatVersion = 'MiUI-delimited-2026-v3-2026-04-08';
    sourceUrl = 'https://www.michigan.gov/leo/-/media/Project/Websites/leo/Documents/UIA/Publications/MiUI-University/Delimited_File_Format_Employer_Reference_Document.pdf';
    instructions = [
      'Sign in to MiUI through MiLogin for Business with employer or authorized TPA access.',
      'Choose Wage Detail Reporting, File Upload, and the year/quarter and original/adjustment option matching the manifest.',
      'Upload the CSV. Review every employee, unit, monthly employment flag and gross UI wage total before submitting.',
      'Save the confirmation file from Submission History. Large files may process overnight; upload confirmation is not final acceptance.',
      'Record the actual processing result, including partial acceptance and all errors. Resolve agency errors before treating the filing as complete.',
      'Pay UI liabilities separately. This file does not file Michigan withholding returns or remit payments.',
      'No-employment returns, out-of-state wage credits and obligation-tax reporting are not supported by this exporter.',
    ];
  } else {
    throw new Error('No verified exporter for requested state/form');
  }
  const content = rows.join('\r\n') + '\r\n';
  check(Buffer.byteLength(content, 'utf8') <= 50_000_000, 'file size');
  return {
    filename: input.state + '-' + input.form + '-' + input.year + '-Q' + input.quarter + '.csv',
    content,
    manifest: {
      version: 1, companyId: input.companyId, state: input.state, form: input.form, action: input.action,
      year: input.year, quarter: input.quarter, accountLast4: input.accountNumber.slice(-4),
      accountSha256: filingContentHash(input.state + ':' + input.accountNumber),
      formatVersion, sourceUrl, sha256: filingContentHash(content), recordCount: input.employees.length,
      totalReportableWagesCents: totalWages, totalWithheldCents: totalWithheld,
      status: 'prepared', submissionMethod: 'manual_portal_upload', agencyValidated: false,
    },
    instructions,
  };
}

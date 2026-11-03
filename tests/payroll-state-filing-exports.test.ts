import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { exportStateFiling, filingContentHash } from '../payroll/stateFilingExports.ts';
import type { CaDe9cInput, MiWageInput } from '../payroll/stateFilingExports.ts';
import { writeStateFilingPacket, recordStateFilingReceipt } from '../payroll/stateFilingPackets.ts';
import { STATE_FILING_CODES } from '../payroll/stateFilings.ts';

function ca(): CaDe9cInput {
  return { companyId: 'fixture', year: 2026, quarter: 1, accountNumber: '12345678',
    wageBasis: 'agency_reportable', state: 'CA', form: 'DE9C', action: 'original', employees: [{
      ssn: '001234567', firstName: 'Jane', middleInitial: '', lastName: 'Martinez',
      subjectWagesCents: 2232100, pitWagesCents: 2232100, pitWithheldCents: 568400, wagePlanCode: 'S',
    }] };
}
function mi(): MiWageInput {
  return { companyId: 'fixture', year: 2026, quarter: 1, accountNumber: '1234567',
    wageBasis: 'agency_reportable', state: 'MI', form: 'UI_WAGE', action: 'original',
    employerName: 'Fixture LLC', addressLine1: '123 Main Street', addressLine2: '', city: 'Detroit',
    addressState: 'MI', zip: '48231', zipExtension: '', apportionment: false, terminatingBusiness: false,
    employees: [{ ssn: '001234567', firstName: 'Jane', middleName: '', lastName: 'Martinez',
      unitNumber: '000', employedOn12th: [true, false, true], uiGrossWagesCents: 1000090,
      seasonal: false, ownerOfficer: true, adjustmentCode: 0 }] };
}
test('CA output matches DE8300 Appendix A example exactly, with no header/footer', () => {
  const result = exportStateFiling(ca());
  assert.equal(result.content, '001234567,Jane,,Martinez,22321.00,22321.00,5684.00,S\r\n');
  assert.equal(result.manifest.totalReportableWagesCents, 2232100);
  assert.equal(result.manifest.totalWithheldCents, 568400);
  assert.equal(result.manifest.status, 'prepared');
  assert.equal(result.manifest.agencyValidated, false);
  assert.equal(result.manifest.sha256, filingContentHash(result.content));
  assert.ok(!JSON.stringify(result.manifest).includes('001234567'));
});
test('MI emits 12 RE fields and 19 RW fields, implied cents and eleven out-of-state blank spaces', () => {
  const result = exportStateFiling(mi());
  const [header, employee, empty] = result.content.split('\r\n');
  assert.equal(header, 'RE,202603,1234567,Fixture LLC,123 Main Street,,Detroit,MI,48231,,N,N');
  assert.equal(employee, 'RW,1234567,000,202603,1,0,1,001234567,Martinez,Jane,,1000090,N,Y,0,0,N,,           ');
  assert.equal(header.split(',').length, 12);
  assert.equal(employee.split(',').length, 19);
  assert.equal(empty, '');
  assert.equal(result.manifest.totalReportableWagesCents, 1000090);
  assert.equal(result.manifest.totalWithheldCents, null);
});
test('MI quarter-end month encoding works for all four quarters', () => {
  for (const [quarter, period] of [[1, '202603'], [2, '202606'], [3, '202609'], [4, '202612']] as const) {
    const data = mi(); data.quarter = quarter;
    const rows = exportStateFiling(data).content.split('\r\n');
    assert.equal(rows[0].split(',')[1], period);
    assert.equal(rows[1].split(',')[3], period);
  }
});
test('MI adjustments require an explicit replacement record reason and reject out-of-state credits', () => {
  const data = mi(); data.action = 'adjustment';
  assert.throws(() => exportStateFiling(data), /adjustmentCode/);
  for (let code = 1; code <= 9; code++) {
    data.employees[0].adjustmentCode = code;
    assert.equal(exportStateFiling(data).content.split('\r\n')[1].split(',')[14], String(code));
  }
  data.employees[0].adjustmentCode = 10;
  assert.throws(() => exportStateFiling(data), /adjustmentCode/);
});
test('unsupported states cannot silently use a generic filing layout', () => {
  for (const state of STATE_FILING_CODES.filter(s => s !== 'CA' && s !== 'MI')) {
    assert.throws(() => exportStateFiling({ ...ca(), state } as any), /No verified exporter/);
  }
});
test('missing reportable basis, unknown data, empty reports and unverified years are refused', () => {
  assert.throws(() => exportStateFiling({ ...ca(), wageBasis: 'taxable' } as any), /wageBasis/);
  assert.throws(() => exportStateFiling({ ...ca(), year: 2027 }), /year/);
  assert.throws(() => exportStateFiling({ ...ca(), employees: [] }), /no-payroll/);
  assert.throws(() => exportStateFiling({ ...ca(), action: 'adjustment' } as any), /form\/action/);
  const extra = mi() as any; extra.employees[0].outOfStateWagesCents = 10000;
  assert.throws(() => exportStateFiling(extra), /unexpected input field/);
});
test('invalid identifiers, names, delimiters, booleans and money fail without echoing personal data', () => {
  for (const ssn of ['000123456', '666123456', '900123456', '123004567', '123450000', '123-45-6789']) {
    const data = ca(); data.employees[0].ssn = ssn;
    assert.throws(() => exportStateFiling(data), { message: 'Invalid or unsupported ssn' });
  }
  for (const firstName of ['Jane,Smith', 'Jane\nSmith', '=SUM(A1)', 'NameTooLongHere']) {
    const data = ca(); data.employees[0].firstName = firstName;
    assert.throws(() => exportStateFiling(data), { message: 'Invalid or unsupported firstName' });
  }
  for (const value of [-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    const data = ca(); data.employees[0].subjectWagesCents = value;
    assert.throws(() => exportStateFiling(data));
  }
  const data = mi() as any; data.employees[0].employedOn12th = [true, true];
  assert.throws(() => exportStateFiling(data), /employedOn12th/);
  data.employees[0].employedOn12th = [true, false, true]; data.apportionment = 'N';
  assert.throws(() => exportStateFiling(data), /apportionment/);
});
test('duplicate CA employee/plan and MI employee/unit combinations are refused', () => {
  const a = ca(); a.employees.push({ ...a.employees[0] });
  assert.throws(() => exportStateFiling(a), /duplicate/);
  a.employees[1].wagePlanCode = 'R';
  assert.equal(exportStateFiling(a).manifest.recordCount, 2);
  a.employees[1].firstName = 'Other';
  assert.throws(() => exportStateFiling(a), /inconsistent/);
  const b = mi(); b.employees.push({ ...b.employees[0] });
  assert.throws(() => exportStateFiling(b), /duplicate/);
  b.employees[1].unitNumber = '001';
  assert.equal(exportStateFiling(b).manifest.recordCount, 2);
});
test('cent formatting preserves pennies and rejects totals beyond safe integer precision', () => {
  const a = ca(); a.employees[0].subjectWagesCents = 1;
  assert.equal(exportStateFiling(a).content.split(',')[4], '0.01');
  const b = mi(); b.employees[0].uiGrossWagesCents = Number.MAX_SAFE_INTEGER;
  b.employees.push({ ...b.employees[0], ssn: '002234567', uiGrossWagesCents: 1 });
  assert.throws(() => exportStateFiling(b), /overflow/);
});
test('packet writer refuses overwrite and validates before creating files', () => {
  const root = mkdtempSync(join(tmpdir(), 'state-export-'));
  try {
    const path = join(root, 'packet');
    writeStateFilingPacket(ca(), path);
    assert.equal(readFileSync(join(path, 'CA-DE9C-2026-Q1.csv'), 'utf8'), exportStateFiling(ca()).content);
    assert.throws(() => writeStateFilingPacket(ca(), path));
    mkdirSync(join(root, 'empty'));
    assert.throws(() => writeStateFilingPacket(ca(), join(root, 'empty')));
    assert.throws(() => writeStateFilingPacket({ ...ca(), year: 2027 }, join(root, 'invalid')));
    assert.deepEqual(readdirSync(root).sort(), ['empty', 'packet']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('receipt workflow separates preparation, submission, partial and final agency results', () => {
  const root = mkdtempSync(join(tmpdir(), 'state-receipt-'));
  const path = join(root, 'packet');
  const evidence = Buffer.from('Synthetic portal confirmation');
  const receipt = { status: 'submitted' as const, confirmationId: 'fixture-1', recordedBy: 'tester', occurredAt: '2026-01-01T00:00:00.000Z' };
  try {
    writeStateFilingPacket(mi(), path);
    assert.throws(() => recordStateFilingReceipt(path, { ...receipt, status: 'accepted' }, evidence), /before its result/);
    assert.equal(recordStateFilingReceipt(path, receipt, evidence).sequence, 1);
    assert.throws(() => recordStateFilingReceipt(path, receipt, evidence), /transition/);
    assert.equal(recordStateFilingReceipt(path, { ...receipt, status: 'partially_accepted' }, evidence).sequence, 2);
    assert.equal(recordStateFilingReceipt(path, { ...receipt, status: 'accepted' }, evidence).sequence, 3);
    assert.throws(() => recordStateFilingReceipt(path, { ...receipt, status: 'rejected' }, evidence), /transition/);
    const manifest = JSON.parse(readFileSync(join(path, 'manifest.json'), 'utf8'));
    assert.equal(manifest.status, 'prepared'); // Immutable original preparation record.
    assert.equal(JSON.parse(readFileSync(join(path, 'receipt-000003', 'receipt.json'), 'utf8')).source, 'operator_recorded_agency_evidence');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('receipt writer rejects altered files, evidence/history corruption and incomplete timestamps', () => {
  const root = mkdtempSync(join(tmpdir(), 'state-integrity-'));
  const path = join(root, 'packet');
  const receipt = { status: 'submitted' as const, confirmationId: 'fixture-1', recordedBy: 'tester', occurredAt: '2026-01-01T00:00:00.000Z' };
  try {
    writeStateFilingPacket(ca(), path);
    assert.throws(() => recordStateFilingReceipt(path, { ...receipt, occurredAt: '2026-02-30T00:00:00.000Z' }, Buffer.from('evidence')), /timestamp/);
    assert.throws(() => recordStateFilingReceipt(path, receipt, Buffer.alloc(0)), /evidence/);
    const file = join(path, 'CA-DE9C-2026-Q1.csv');
    writeFileSync(file, 'modified');
    assert.throws(() => recordStateFilingReceipt(path, receipt, Buffer.from('evidence')), /changed/);
    writeFileSync(file, exportStateFiling(ca()).content);
    recordStateFilingReceipt(path, receipt, Buffer.from('evidence'));
    writeFileSync(join(path, 'receipt-000001', 'evidence.bin'), 'changed');
    assert.throws(() => recordStateFilingReceipt(path, { ...receipt, status: 'accepted' }, Buffer.from('evidence')), /integrity/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('CLI prepares a real CSV packet without printing SSNs and refuses malformed JSON', () => {
  const root = mkdtempSync(join(tmpdir(), 'state-cli-'));
  try {
    const input = join(root, 'input.json'); writeFileSync(input, JSON.stringify(mi()));
    const result = spawnSync(process.execPath, ['scripts/state-filing.ts', 'prepare', input, join(root, 'out')], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, 'prepared');
    assert.ok(!result.stdout.includes('001234567'));
    writeFileSync(input, '{"ssn":"001234567", BROKEN');
    const invalid = spawnSync(process.execPath, ['scripts/state-filing.ts', 'prepare', input, join(root, 'out2')], { encoding: 'utf8' });
    assert.equal(invalid.status, 1);
    assert.ok(!invalid.stderr.includes('001234567'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

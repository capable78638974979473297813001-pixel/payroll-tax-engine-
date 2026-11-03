import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStateFilingWorksheets, STATE_FILING_CODES } from '../payroll/stateFilings.ts';
import type { Company, PayRun, PayRunLine } from '../payroll/types.ts';

const company: Company = {
  id: 'a', legalName: 'Fixture', ein: '00-0000000', homeState: 'MI',
  paySchedule: { frequency: 'monthly', checkDateLagDays: 0 },
};
function tax(id = 'MI_SIT', amount = 425, payer: 'employee' | 'employer' = 'employee') {
  return { id, name: id, amount, taxableWages: 10000, payer, jurisdiction: 'state' as const };
}
function run(id = 'r1', taxLines = [tax()]): PayRun {
  const line: PayRunLine = {
    employeeId: 'e1', grossPay: 10000, netPay: 9575, employeeTaxTotal: 425,
    employerTaxTotal: 0, pretaxDeductions: 0, posttaxDeductions: 0, garnishmentTotal: 0,
    netPayAfterGarnishment: 9575, taxLines, garnishmentLines: [], depositAllocations: [],
  };
  return { id, companyId: 'a', periodStart: '2025-12-01', periodEnd: '2025-12-31',
    checkDate: '2026-01-02', status: 'approved', lines: [line],
    createdAt: '2026-01-01T00:00:00Z', minimumWageIssues: [] };
}
test('all 50 states plus DC can be explicitly reconciled, never marked fileable', () => {
  const reports = buildStateFilingWorksheets(company, 2026, 1, [], STATE_FILING_CODES);
  assert.equal(reports.length, 51);
  assert.equal(new Set(STATE_FILING_CODES).size, 51);
  for (const report of reports) {
    assert.equal(report.canSubmit, false);
    assert.equal(report.status, 'worksheet_only');
    assert.deepEqual(report.taxes, []);
    assert.ok(report.blockers.includes('agency_format_not_implemented'));
    assert.ok(report.blockers.includes('filing_obligations_require_review'));
  }
});
test('uses paid quarter and employer ownership; skips draft, void and other quarters', () => {
  const base = run();
  const reports = buildStateFilingWorksheets(company, 2026, 1, [
    base, { ...run('r2'), status: 'draft' }, { ...run('r3'), status: 'voided' },
    { ...run('r4'), companyId: 'b' }, { ...run('r5'), checkDate: '2026-04-01' },
    { ...run('r6'), checkDate: '2025-12-31' },
  ]);
  assert.equal(reports[0].taxes[0].amount, 425);
  assert.deepEqual(reports[0].sourceRunIds, ['r1']);
});
test('separates tax bases, employee and employer contributions, and states', () => {
  const reports = buildStateFilingWorksheets(company, 2026, 1, [
    run('r2', [tax(), tax('MI_UI', 270, 'employer'), tax('OH_SIT', 123)]),
    run('r1'),
  ]);
  assert.deepEqual(reports.map(r => r.stateCode), ['MI', 'OH']);
  const sit = reports[0].taxes.find(t => t.taxId === 'MI_SIT')!;
  assert.equal(sit.amount, 850);
  assert.equal(sit.taxableWages, 20000);
  assert.deepEqual(sit.employees, [{ employeeId: 'e1', taxableWages: 20000, amount: 850 }]);
  assert.equal(reports[0].taxes.find(t => t.taxId === 'MI_UI')!.taxableWages, 10000);
  assert.deepEqual(reports[0].sourceRunIds, ['r1', 'r2']);
});
test('rejects duplicates instead of doubling reported liabilities', () => {
  assert.throws(() => buildStateFilingWorksheets(company, 2026, 1, [run(), run()]), /Duplicate pay run/);
  const r = run(); r.lines.push(r.lines[0]);
  assert.throws(() => buildStateFilingWorksheets(company, 2026, 1, [r]), /Duplicate employee/);
  assert.throws(() => buildStateFilingWorksheets(company, 2026, 1, [run('r', [tax(), tax()])]), /Duplicate state tax/);
});
test('rejects invalid dates, quarters, state codes, money, and overflowing totals', () => {
  for (const checkDate of ['2026-02-30', '2026-13-01', '2026-1-01']) {
    assert.throws(() => buildStateFilingWorksheets(company, 2026, 1, [{ ...run(), checkDate }]), /Invalid check date/);
  }
  for (const q of [0, 5, 1.5, NaN]) assert.throws(() => buildStateFilingWorksheets(company, 2026, q, []));
  assert.throws(() => buildStateFilingWorksheets(company, 2026, 1, [], ['ZZ']));
  for (const amount of [-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => buildStateFilingWorksheets(company, 2026, 1, [run('r', [tax('MI_SIT', amount)])]));
  }
  assert.throws(() => buildStateFilingWorksheets(company, 2026, 1, [
    run('r1', [tax('MI_SIT', Number.MAX_SAFE_INTEGER)]), run('r2'),
  ]), /integer cents/);
});
test('registered zero-activity states remain visible and registration cannot clear filing blockers', () => {
  const registered: Company = { ...company, stateRegistrations: [{
    stateCode: 'MI', suiAccountNumber: 'fixture', suiRate: 0.027,
    withholdingAccountNumber: 'fixture', registeredDate: '2025-01-01',
  }] };
  const [report] = buildStateFilingWorksheets(registered, 2026, 1, []);
  assert.equal(report.stateCode, 'MI');
  assert.equal(report.canSubmit, false);
  assert.ok(!report.blockers.includes('state_registration_missing'));
  assert.ok(report.blockers.includes('reportable_wage_details_required'));
  const duplicate = { ...registered, stateRegistrations: [...registered.stateRegistrations!, ...registered.stateRegistrations!] };
  assert.throws(() => buildStateFilingWorksheets(duplicate, 2026, 1, []), /Duplicate state registration/);
});
test('does not mutate payroll history and orders input-independent output', () => {
  const runs = [run('r2'), run('r1')];
  const before = JSON.stringify(runs);
  const result = buildStateFilingWorksheets(company, 2026, 1, runs);
  assert.equal(JSON.stringify(runs), before);
  assert.deepEqual(result, buildStateFilingWorksheets(company, 2026, 1, [...runs].reverse()));
  result[0].taxes[0].employees[0].amount = 0;
  assert.equal(runs[0].lines[0].taxLines[0].amount, 425);
});

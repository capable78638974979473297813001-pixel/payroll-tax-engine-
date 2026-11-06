import test from 'node:test';
import assert from 'node:assert/strict';
import { cities, prepare } from '../payroll/miLocalFiling.mjs';

function fixture(city = 'Grand Rapids') {
  const address = { street: '1 MAIN ST', city: 'TEST', state: 'MI', zip: '49503' };
  return {
    year: 2026, companyId: 'demo', city,
    employer: { ...address, ein: '012345678', name: 'Demo', corporation: true },
    runs: [{ id: 'r', companyId: 'demo', status: 'approved', checkDate: '2026-04-02',
      lines: [{ employeeId: 'a', taxLines: [{ id: 'MI_LOCAL', amount: 1234 }] }] }],
    allocations: [{ city, runId: 'r', employeeId: 'a', localWagesCents: 80000, withheldCents: 1234 }],
    deposits: [{ city, month: 4, id: 'receipt', amountCents: 1000 }],
    statements: [{ ...address, taxCity: city, employeeId: 'a', ssn: '012345679', first: 'Jane', last: 'Test',
      middle: 'Lee', box1Cents: 90000, box3Cents: 91000, box5Cents: 92000, deferredCents: 1000,
      localWagesCents: 80000, withheldCents: 1234 }],
  };
}

const layouts = {
  'Battle Creek': ['MIBCK     ',13,true], 'East Lansing': ['MIELA',13,false],
  Flint: ['FL',17,false], 'Grand Rapids': ['MIGRR     ',13,true], Grayling: ['GRA',17,false],
  Lansing: ['LAN',17,false], 'Port Huron': ['PHN',17,false], Saginaw: ['SAG',17,false],
  Springfield: ['SPR',17,false], Walker: ['WLKR',13,false],
};

for (const [city, [code, count, trailer]] of Object.entries(layouts)) {
  test(city + ' W-2 layout', () => {
    const { w2 } = prepare(fixture(city));
    const records = w2.content.split('\r\n');
    const fields = records[1].split(',');
    assert.equal(fields.length, count);
    assert.equal(fields[1], '012345679');
    assert.equal(fields[6], 'TEST');
    assert.equal(fields[10], city === 'East Lansing' ? '800.00' : '900.00');
    assert.equal(fields[11], code);
    assert.equal(fields[12], '12.34');
    assert.equal(records[2], trailer ? 'ZZZ' : '');
    if (count === 17) assert.equal(fields.slice(13).join(','), '910.00,920.00,800.00,10.00');
  });
}

test('city directory and manual handoff', () => {
  assert.equal(Object.keys(cities).length, 24);
  for (const name of Object.keys(cities)) {
    const packet = prepare(fixture(name));
    assert.equal(packet.worksheet.quarters[1].withheldCents, 1234);
    assert.equal(packet.worksheet.withholdingLessPaymentsCents, 234);
    assert.equal(Boolean(packet.w2), Object.hasOwn(layouts, name));
    assert.equal(JSON.stringify(packet.worksheet).includes('012345679'), false);
  }
});

test('one pay line split between two cities', () => {
  const input = fixture();
  input.allocations[0].withheldCents = 234;
  input.statements[0].withheldCents = 234;
  input.allocations.push({ ...input.allocations[0], city: 'Walker', withheldCents: 1000 });
  assert.equal(prepare(input).worksheet.annual.withheldCents, 234);
});

test('retain reportable wages with zero withholding', () => {
  const input = fixture();
  input.runs[0].lines[0].taxLines[0].amount = 0;
  input.statements[0].withheldCents = input.allocations[0].withheldCents = 0;
  assert.equal(prepare(input).worksheet.employeeCount, 1);
});

for (const [reason, change] of Object.entries({
  'wrong employer': i => { i.runs[0].companyId = 'another'; },
  'orphan split': i => { i.runs[0].status = 'voided'; },
  'draft': i => { i.runs[0].status = 'draft'; },
  'wrong year': i => { i.runs[0].checkDate = '2025-12-31'; },
  'invalid date': i => { i.runs[0].checkDate = '2026-02-30'; },
  'duplicate allocation': i => i.allocations.push(i.allocations[0]),
  'duplicate receipt': i => i.deposits.push(i.deposits[0]),
  'missing city': i => i.allocations.pop(),
  'wrong employee wages': i => { i.statements[0].localWagesCents--; },
  'missing statement': i => i.statements.pop(),
  'different withholding': i => { i.statements[0].withheldCents++; },
  'fractional cents': i => { i.deposits[0].amountCents += 0.5; },
  'invalid csv data': i => { i.statements[0].first = 'A,B'; },
})) test('reject ' + reason, () => {
  const input = fixture();
  change(input);
  assert.throws(() => prepare(input));
});

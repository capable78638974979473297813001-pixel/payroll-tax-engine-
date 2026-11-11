import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Employee-side paid leave, disability and unemployment parameters, each read on 2026-11-10-11 from the
 * program's own page and pinned here so a silent edit cannot drift them:
 *  AK  labor.alaska.gov/estax/2026-experience-rates.html: employee 0.50%, wage base $54,200
 *  CA  edd.ca.gov rates page: SDI 1.3% for 2026, no wage limit (SB 951)
 *  CO  famli.colorado.gov: 0.88% premium, 0.44% employee, wages up to the Social Security cap
 *  CT  ctpaidleave.org contributions: 0.5% up to the Social Security limit
 *  HI  labor.hawaii.gov 2026 Maximum Weekly Wage Base: $1,500.21 x 0.5% = $7.50 weekly maximum
 *  MA  mass.gov PFML contributions: 0.46% of eligible wages for the employee side
 *  MN  pl.mn.gov: 0.88% premium, employee up to half; OASDI limit $185,000 for 2026
 *  NJ  nj.gov rate-info: worker UI 0.3825% + WF/SWF 0.0425%, DI 0.19%, FLI 0.23%, bases $44,800 and $171,100 (2026);
 *      DI 0.24%, FLI 0.24%, bases $46,400 and $177,100 (2027)
 *  NY  paidfamilyleave.ny.gov: PFL 0.432%, annual maximum $411.91
 *  OR  paidleave.oregon.gov: employees pay 60% of the 1% rate, wages up to the Social Security cap ($184,500 for 2026)
 *  PA  pa.gov DLI: employee UC contribution 0.07% from 2023
 *  RI  dlt.ri.gov: TDI 1.1% on a $100,000 wage base
 *  WA  paidleave.wa.gov: 1.13%, employees 71.43%; wacaresfund.wa.gov: 0.58%
 * Not pinned because this pass could not read the figure on an agency page: Maine's employee share of its PFML rate.
 */
const read = (p: string) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const st = (code: string, year = 2026) => read(`states/${code}-${year}.json`);

describe('employee-side paid leave, disability and unemployment parameters (2026)', () => {
  test('Social Security wage base 2026 is $184,500, the cap Colorado, Connecticut, Oregon and Washington track', () => {
    assert.equal(read('federal/2026.json').socialSecurity.wageBase, 184500);
    for (const [code, key] of [['CO', 'statePaidLeaveEmployee'], ['CT', 'statePaidLeaveEmployee'], ['OR', 'statePaidLeaveEmployee'], ['WA', 'statePaidLeaveEmployee']] as const) {
      assert.equal(st(code)[key].wageBase, 'ssWageBase', code);
    }
  });
  test('Alaska, California, Colorado, Connecticut, Massachusetts, Oregon, Pennsylvania', () => {
    assert.deepEqual([st('AK').stateUnemploymentEmployee.rate, st('AK').stateUnemploymentEmployee.wageBase], [0.005, 54200]);
    assert.equal(st('CA').stateDisabilityEmployee.rate, 0.013);
    assert.equal(st('CA').stateDisabilityEmployee.wageBase ?? null, null); // no wage limit since 2024 (SB 951)
    assert.equal(st('CO').statePaidLeaveEmployee.rate, 0.0044);
    assert.equal(st('CT').statePaidLeaveEmployee.rate, 0.005);
    assert.equal(st('CT', 2027).statePaidLeaveEmployee.rate, 0.005);
    assert.equal(st('MA').statePaidLeaveEmployee.rate, 0.0046);
    assert.equal(st('OR').statePaidLeaveEmployee.rate, 0.006);
    assert.equal(st('PA').stateUnemploymentEmployee.rate, 0.0007);
  });
  test('Hawaii: 0.5% of the $1,500.21 weekly wage base is the $7.50 weekly maximum', () => {
    const h = st('HI').stateDisabilityEmployee;
    assert.equal(h.rate, 0.005);
    assert.equal(h.weeklyCapDollars, 7.5);
    assert.equal(Math.round(1500.21 * 0.005 * 100) / 100, 7.5);
  });
  test('Minnesota: 0.88% total, employee up to half (0.44%), $185,000 limit', () => {
    assert.equal(st('MN').statePaidLeaveEmployee.rate, 0.0044);
    assert.equal(st('MN').statePaidLeaveEmployee.wageBase, 185000);
    assert.equal(st('MN').statePaidLeaveEmployer.totalRate, 0.0088);
    assert.equal(st('MN').statePaidLeaveEmployer.employeeRate, 0.0044);
  });
  test('New Jersey 2026 and 2027 worker rates and bases', () => {
    const nj = (y: number) => st('NJ', y);
    assert.deepEqual([nj(2026).stateUnemploymentEmployee.rate, nj(2026).stateUnemploymentEmployee.wageBase], [0.00425, 44800]);
    assert.deepEqual([nj(2026).stateDisabilityEmployee.rate, nj(2026).stateDisabilityEmployee.wageBase], [0.0019, 171100]);
    assert.deepEqual([nj(2026).statePaidLeaveEmployee.rate, nj(2026).statePaidLeaveEmployee.wageBase], [0.0023, 171100]);
    assert.deepEqual([nj(2027).stateUnemploymentEmployee.rate, nj(2027).stateUnemploymentEmployee.wageBase], [0.00425, 46400]);
    assert.deepEqual([nj(2027).stateDisabilityEmployee.rate, nj(2027).stateDisabilityEmployee.wageBase], [0.0024, 177100]);
    assert.deepEqual([nj(2027).statePaidLeaveEmployee.rate, nj(2027).statePaidLeaveEmployee.wageBase], [0.0024, 177100]);
  });
  test('New York PFL 0.432% reproduces the $411.91 annual maximum', () => {
    const p = st('NY').statePaidLeaveEmployee;
    assert.equal(p.rate, 0.00432);
    assert.equal(Math.round(p.rate * p.wageBase * 100) / 100, 411.91);
  });
  test('Rhode Island TDI 1.1% on $100,000; Washington PFML 1.13% x 71.43% and WA Cares 0.58%', () => {
    assert.deepEqual([st('RI').stateDisabilityEmployee.rate, st('RI').stateDisabilityEmployee.wageBase], [0.011, 100000]);
    assert.ok(Math.abs(st('WA').statePaidLeaveEmployee.rate - 0.0113 * 0.7143) < 1e-7);
    assert.equal(st('WA').stateLongTermCareEmployee.rate, 0.0058);
  });
});

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { minimumWage } from '../src/minimum-wage.ts';

/**
 * Rates in force on 2026-11-06 that were re-read from the agency's or locality's own page or statute that day.
 * Each line names the source it was compared with.
 */

const D = '2026-11-06';
const cents = (state: string, extra: Record<string, unknown> = {}) => minimumWage({ checkDate: D, state, ...extra }).cents;
const file = (p: string) => JSON.parse(readFileSync(new URL(`../data/${p}.json`, import.meta.url), 'utf8'));

describe('state minimum wages in force (statutes and agency pages read 2026-11-06)', () => {
  test('Florida $15.00 since September 30, 2026 (Fla. Const. art. X sec. 24); tipped $11.98 = $15.00 less the 2003 FLSA credit of $3.02', () => {
    assert.equal(minimumWage({ checkDate: '2026-09-29', state: 'FL' }).cents, 1400);
    assert.equal(cents('FL'), 1500);
    assert.equal(cents('FL', { tipped: true }), 1198);
  });
  test('Alaska $14.00 (DOL wage-and-hour summary), Oregon $15.55 standard / $16.80 Portland metro / $14.55 non-urban (BOLI), DC $18.40 with tipped $10.30 (DOES notice), Rhode Island $16.00 (R.I. Gen. Laws 28-12-3(p))', () => {
    assert.equal(cents('AK'), 1400);
    assert.equal(cents('OR'), 1555);
    assert.equal(cents('DC'), 1840);
    assert.equal(cents('DC', { tipped: true }), 1030);
    assert.equal(cents('RI'), 1600);
  });
  test('Rhode Island tipped cash wage is $3.89 (R.I. Gen. Laws 28-12-5(c), read 2026-11-06)', () => {
    assert.equal(cents('RI', { tipped: true }), 389);
  });
});

describe('local minimum wages in force', () => {
  const loc = (state: string, locality: string, n?: number) => minimumWage({ checkDate: D, state, locality, employeeCount: n }).cents;
  test('San Francisco $19.61, Los Angeles $18.42, Chicago $17.05 (July 1, 2026 steps), Burien 2026 tiers $21.78 / $20.78 / $19.28', () => {
    assert.equal(loc('CA', 'san_francisco'), 1961);
    assert.equal(loc('CA', 'los_angeles'), 1842);
    assert.equal(loc('IL', 'chicago'), 1705);
    assert.deepEqual([loc('WA', 'burien', 600), loc('WA', 'burien', 100), loc('WA', 'burien', 10)], [2178, 2078, 1928]);
  });
  test("San Francisco's separate $17.35 rate for Government Supported Employees is recorded but cannot bind (status unknown to the engine)", () => {
    const sf = file('minimum-wage/local/CA-local-2026').jurisdictions.find((j: { id: string }) => j.id === 'san_francisco');
    assert.equal(sf.variants.find((v: { id: string }) => v.id === 'government_supported_employee').hourly, 17.35);
    assert.equal(loc('CA', 'san_francisco'), 1961);
  });
  test('Omaha $15.00 from October 1, 2026: the court enjoined only the removal of the youth and training wage (order of 2026-09-28)', () => {
    const om = file('minimum-wage/local/NE-local-2026').jurisdictions.find((j: { id: string }) => j.id === 'omaha');
    assert.equal(om.hourly, 15);
    assert.match(om.note, /temporary injunction only as to the youth\/training-wage provisions/);
  });
});

describe('Connecticut tipped minimum wage (Conn. Gen. Stat. 31-60; DOL tip statement effective 2026-01-01)', () => {
  test('hotel and restaurant staff $6.38 cash, bartenders $8.23 cash', () => {
    const ct = file('minimum-wage/states/CT-2026');
    assert.equal(ct.tipped.cashWage, 6.38);
    assert.equal(ct.variants.find((v: { id: string }) => v.id === 'tipped_bartender').hourly, 8.23);
  });
});

describe('Indiana county income tax rates, Departmental Notice #1 effective 2026-10-01 (all 92 counties compared)', () => {
  test('Boone is 1.71% (the only county that changed) and LaPorte 1.45%', () => {
    const c = file('local/IN-counties-2026').counties;
    assert.equal(c.find((x: { name: string }) => x.name === 'Boone').rate, 0.0171);
    assert.equal(c.find((x: { name: string }) => x.name === 'LaPorte').rate, 0.0145);
    assert.equal(c.length, 92);
  });
});

describe('Maine withholding, August 2026 revised booklet (read directly)', () => {
  test('standard deduction $12,850 / $28,550 and a 2% surcharge over $1,000,000 / $1,500,000, dated 2026-08-01', () => {
    const e = file('states/ME-2026').effectiveDated[0];
    assert.equal(e.from, '2026-08-01');
    assert.equal(e.set['maineWithholding.standardDeduction'].single.max, 12_850);
    assert.equal(e.set['maineWithholding.standardDeduction'].married.max, 28_550);
    assert.deepEqual([e.set['maineWithholding.surcharge'].single.threshold, e.set['maineWithholding.surcharge'].married.threshold, e.set['maineWithholding.surcharge'].single.rate], [1_000_000, 1_500_000, 0.02]);
  });
});

describe('Pennsylvania local EIT and LST (DCED statewide register, downloaded 2026-11-06)', () => {
  const pa = file('local/PA-EIT-LST-2026').jurisdictions as Array<Record<string, any>>;
  test('the three municipalities whose 1% EIT starts 2026-07-01 carry it as a scheduled change over a 0 base, matching the register', () => {
    for (const psd of ['231101', '580408', '231202']) {
      const j = pa.find((x) => x.psdCode === psd)!;
      assert.equal(j.residentEIT, 0);
      assert.deepEqual(j.rateChanges, [{ on: '2026-07-01', set: { residentEIT: 0.01, nonresidentEIT: 0.01, totalResidentEIT: 0.01 } }]);
    }
  });
});

describe('tipped queries in cities with employer-size tiers follow the tier (no tip credit in California)', () => {
  const t = (locality: string, employeeCount: number) =>
    minimumWage({ checkDate: D, state: 'CA', locality, employeeCount, tipped: true }).cents;
  const s = (locality: string, employeeCount: number) =>
    minimumWage({ checkDate: D, state: 'CA', locality, employeeCount }).cents;
  test('Hayward and Novato: the tipped cash floor equals the standard floor for small and large employers', () => {
    for (const [loc, n] of [['hayward', 3], ['hayward', 12], ['hayward', 100], ['novato', 3], ['novato', 12], ['novato', 150], ['novato', 600]] as const) {
      assert.equal(t(loc, n), s(loc, n), `${loc} ${n}`);
    }
    assert.equal(t('novato', 150), 1773);
    assert.equal(t('hayward', 12), 1690);
  });
});

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { minimumWage } from '../src/minimum-wage.ts';

/**
 * Local 2027 minimum wages re-read from the cities' and counties' own pages on 2026-11-06 (each entry's
 * `sources` and provisional.updatedFor2027 record the page and the sentence). Localities whose pages could not be
 * read are NOT here: they stay at 2026 figures until their notices are read.
 */

const D = '2027-01-15';
const cents = (state: string, locality: string, extra: Record<string, unknown> = {}) => minimumWage({ checkDate: D, state, locality, ...extra }).cents;

describe('2027 local minimum wages read from the localities\' own pages', () => {
  for (const [state, locality, expected] of [
    ['WA', 'seattle', 2214], ['WA', 'burien', 2249], ['WA', 'king_county_unincorporated', 2157],
    ['CO', 'denver', 1984], ['CO', 'boulder', 1817], ['CO', 'boulder_county_unincorporated', 1743],
    ['MN', 'minneapolis', 1702], ['NM', 'albuquerque', 1300], ['NM', 'santa_fe_city', 1750],
    ['CA', 'san_diego', 1835], ['CA', 'richmond', 1961], ['CA', 'hayward', 1839], ['CA', 'daly_city', 1810],
    ['CA', 'burlingame', 1847], ['CA', 'el_cerrito', 1936], ['CA', 'san_mateo', 1925], ['CA', 'foster_city', 1836],
    ['CA', 'san_carlos', 1835], ['CA', 'half_moon_bay', 1852], ['CA', 'san_mateo_county_unincorporated', 1858],
  ] as const) {
    test(`${state} ${locality} is ${expected} cents on ${D}`, () => assert.equal(cents(state, locality), expected));
  }

  test('2026 is unchanged: Seattle $21.30, Denver $19.29, Minneapolis $16.37', () => {
    assert.equal(minimumWage({ checkDate: '2026-12-15', state: 'WA', locality: 'seattle' }).cents, 2130);
    assert.equal(minimumWage({ checkDate: '2026-12-15', state: 'CO', locality: 'denver' }).cents, 1929);
    assert.equal(minimumWage({ checkDate: '2026-12-15', state: 'MN', locality: 'minneapolis' }).cents, 1637);
  });

  test('tip credits: Denver and Boulder keep the $3.02 offset on the new rates; Minneapolis allows none', () => {
    const den = minimumWage({ checkDate: D, state: 'CO', locality: 'denver', tipped: true });
    const bou = minimumWage({ checkDate: D, state: 'CO', locality: 'boulder', tipped: true });
    assert.equal(den.cents, 1682);
    assert.equal(bou.cents, 1515);
    assert.equal(cents('MN', 'minneapolis', { tipped: true }), 1702);
  });

  test('Burien medium employers pay the large rate in 2027; the small-employer rate is $20.49', () => {
    assert.equal(cents('WA', 'burien', { employeeCount: 100 }), 2249);
    assert.equal(cents('WA', 'burien', { employeeCount: 10 }), 2049);
  });

  test('unincorporated King County: only small, low-revenue employers pay $2.00 less in 2027', () => {
    assert.equal(cents('WA', 'king_county_unincorporated', { employeeCount: 100 }), 2157);
  });

  test('Hayward: 26 or more employees $18.39, 25 or fewer $17.40', () => {
    assert.equal(cents('CA', 'hayward', { employeeCount: 30 }), 1839);
    assert.equal(cents('CA', 'hayward', { employeeCount: 10 }), 1740);
  });
});

describe('Connecticut bartenders (Conn. Gen. Stat. 31-60; Department of Labor tip statement effective 2026-01-01)', () => {
  test('the bartender cash wage is $8.23 and the tip credit is the rest of the minimum wage, in 2026 and 2027', async () => {
    const { readFileSync } = await import('node:fs');
    for (const [year, min] of [[2026, 16.94], [2027, 17.48]] as const) {
      const d = JSON.parse(readFileSync(new URL(`../data/minimum-wage/states/CT-${year}.json`, import.meta.url), 'utf8'));
      const v = d.variants.find((x: { id: string }) => x.id === 'tipped_bartender');
      assert.equal(v.hourly, 8.23, String(year));
      assert.equal(Math.round((min - v.hourly) * 100) / 100, v.maxTipCredit, String(year));
    }
  });
});

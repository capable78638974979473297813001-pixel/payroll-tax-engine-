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
    ['AZ', 'flagstaff', 1895], ['CA', 'san_carlos', 1835], ['CA', 'half_moon_bay', 1852], ['CA', 'san_mateo_county_unincorporated', 1858],
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

describe('New York home care aides, 2027 (Department of Labor: $20.00 downstate, $19.00 elsewhere)', () => {
  test('the sectoral file carries the 2027 figures and 2026 is unchanged', async () => {
    const { readFileSync } = await import('node:fs');
    const r = (y: number) => JSON.parse(readFileSync(new URL(`../data/minimum-wage/sectoral/NY-sectoral-${y}.json`, import.meta.url), 'utf8')).sectors;
    const by = (y: number, id: string) => r(y).find((x: { id: string }) => x.id === id).hourly;
    assert.deepEqual([by(2027, 'home_care_aide_downstate'), by(2027, 'home_care_aide_upstate')], [20, 19]);
    assert.deepEqual([by(2026, 'home_care_aide_downstate'), by(2026, 'home_care_aide_upstate')], [19.65, 18.65]);
  });
});

describe('Saint Paul 2027 (city announcement of 2027-09-01: tiers step on January 1 and July 1)', () => {
  const sp = (date: string, employeeCount: number) => minimumWage({ checkDate: date, state: 'MN', locality: 'saint_paul', employeeCount }).cents;
  test('large and macro $17.02 all year; small $16.37 then $17.02 from July 1; micro $14.25 then $15.00 from July 1', () => {
    assert.deepEqual([sp('2027-02-01', 200), sp('2027-02-01', 50), sp('2027-02-01', 3)], [1702, 1637, 1425]);
    assert.deepEqual([sp('2027-08-01', 200), sp('2027-08-01', 50), sp('2027-08-01', 3)], [1702, 1702, 1500]);
  });
});

describe('Montgomery County, Maryland keeps its three size tiers (county page: $18.00 / $16.50 / $15.95 from July 1, 2026)', () => {
  test('large, mid-size and small employers resolve to their own rates', () => {
    const mc = (n: number) => minimumWage({ checkDate: '2026-09-01', state: 'MD', locality: 'montgomery_county', employeeCount: n }).cents;
    assert.deepEqual([mc(100), mc(30), mc(5)], [1800, 1650, 1595]);
  });
});

describe('Petaluma 2027 and the local exceptions read from the cities\' pages on 2026-11-07', () => {
  test('Petaluma is $18.93 from 2027-01-01 (city page) and $18.31 in 2026; the learner rate is recorded but cannot bind', () => {
    assert.equal(cents('CA', 'petaluma'), 1893);
    assert.equal(minimumWage({ checkDate: '2026-11-06', state: 'CA', locality: 'petaluma' }).cents, 1831);
    assert.equal(minimumWage({ checkDate: D, state: 'CA', locality: 'petaluma', tipped: true }).cents, 1893);
  });
  test('California cities have no tip credit: the tipped cash wage equals the rate in every 2027 local file', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const dir = new URL('../data/minimum-wage/local/', import.meta.url);
    for (const f of readdirSync(dir).filter((n) => n.endsWith('-local-2027.json'))) {
      for (const j of JSON.parse(readFileSync(new URL(f, dir), 'utf8')).jurisdictions) {
        if (j.tipped && j.tipped.tipCreditAllowed === false) assert.equal(j.tipped.cashWageCents, j.hourlyCents, `${f} ${j.id}`);
      }
    }
  });
});

describe('learner wages follow the ordinance rule (Petaluma 8.35.030(E), Sonoma 2.80.040(A): 85 percent, nearest five cents)', () => {
  const nickel = (cents: number) => Math.round((cents * 0.85) / 5) * 5;
  const jur = async (file: string, id: string) => {
    const { readFileSync } = await import('node:fs');
    return JSON.parse(readFileSync(new URL(`../data/minimum-wage/local/${file}.json`, import.meta.url), 'utf8')).jurisdictions.find((j: { id: string }) => j.id === id);
  };
  test('Petaluma learner: 2026 $15.55 (the city prints $15.56), 2027 $16.10', async () => {
    const p26 = await jur('CA-local-2026', 'petaluma');
    const p27 = await jur('CA-local-2027', 'petaluma');
    assert.equal(p26.variants[0].hourlyCents, nickel(p26.hourlyCents));
    assert.equal(p26.variants[0].hourlyCents, 1555);
    assert.equal(p27.variants[0].hourlyCents, nickel(p27.hourlyCents));
    assert.equal(p27.variants[0].hourlyCents, 1610);
  });
  test('Sonoma learner: $15.70 for large employers, $14.75 for small; informational, the headline rates still bind', async () => {
    const s = await jur('CA-local-2026', 'sonoma');
    const big = s.variants.find((v: { id: string }) => v.id === 'learner_14_17_large');
    const small = s.variants.find((v: { id: string }) => v.id === 'learner_14_17_small');
    assert.equal(big.hourlyCents, nickel(1847));
    assert.equal(big.hourlyCents, 1570);
    assert.equal(small.hourlyCents, nickel(1738));
    assert.equal(small.hourlyCents, 1475);
    assert.equal(cents('CA', 'sonoma'), 1847);
    assert.equal(minimumWage({ checkDate: '2026-11-06', state: 'CA', locality: 'sonoma', employeeCount: 10 }).cents, 1738);
  });
  test('Cook County records its 2018 coverage exclusions but the headline rate binds', async () => {
    const c = await jur('IL-local-2026', 'cook_county');
    assert.match(c.coverage, /four employees/);
    assert.match(JSON.stringify(c.sources), /Rule 3\.05/);
    assert.equal(minimumWage({ checkDate: '2026-11-06', state: 'IL', locality: 'cook_county' }).cents, 1540);
  });
});

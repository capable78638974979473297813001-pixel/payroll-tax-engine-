import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculatePaycheck } from '../src/calculate.ts';
import type { PaycheckInput } from '../src/types.ts';
import { resolveJurisdiction, toCertificateFields } from '../geocode/resolve.ts';
import { coverage } from '../site/lib/coverage.ts';

function fee(certificate: Record<string, unknown>, checkDate = '2026-10-16', payFrequency: PaycheckInput['payFrequency'] = 'weekly', residenceState?: PaycheckInput['residenceState']) {
  const input: PaycheckInput = {
    checkDate, payFrequency,
    earnings: [{ code: 'REG', category: 'regular', amount: 80_000 }], deductions: [],
    federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
    ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
    workState: { code: 'WV', certificate } as PaycheckInput['workState'], residenceState,
  };
  return calculatePaycheck(input).taxes.find(t => t.id === 'WV_LOCAL_FEE')?.amount;
}

test('Weirton uses the city published May 17 effective date, including the intervening three days', () => {
  for (const date of ['2026-05-13', '2026-05-14', '2026-05-15', '2026-05-16'])
    assert.equal(fee({ locality: 'Weirton' }, date), 200, date);
  assert.equal(fee({ locality: 'Weirton' }, '2026-05-17'), 500);
  assert.equal(fee({ locality: 'Weirton' }, '2026-05-17', 'biweekly'), 1000);
  assert.equal(fee({ locality: 'Weirton' }, '2026-05-17', 'semimonthly'), 1083);
  assert.equal(fee({ locality: 'Weirton' }, '2026-05-17', 'monthly'), 2166);
});

test('a same-named city in another state does not exempt a Montgomery WV worker', () => {
  assert.equal(fee({ locality: 'Montgomery', residenceCity: 'Montgomery' }, '2026-10-16', 'weekly', { code: 'AL', certificate: {} }), 200);
});

for (const year of [2025, 2026, 2027]) {
  const date = `${year}-10-16`;
  test(`${year}: Fairmont and Wheeling use their city-published monthly amount`, () => {
    for (const city of ['Fairmont', 'Wheeling']) {
      assert.equal(fee({ locality: city, residenceCity: 'Charleston' }, date, 'monthly'), 867, city);
      assert.equal(fee({ locality: city, residenceCity: 'Charleston' }, date, 'semimonthly'), 433, city);
      assert.equal(fee({ locality: city, residenceCity: 'Charleston' }, date, 'biweekly'), 400, city);
    }
    assert.equal(fee({ locality: 'Fairmont', residenceCity: 'Fairmont' }, date, 'monthly'), undefined);
  });
  test(`${year}: Montgomery exempts residents; Rivesville charges only nonresidents`, () => {
    for (const city of ['Montgomery', 'Rivesville']) {
      assert.equal(fee({ locality: city, residenceCity: 'Charleston' }, date), 200, city);
      assert.equal(fee({ locality: city, residenceCity: city.toUpperCase() }, date), undefined, city);
      assert.equal(fee({ locality: city, wvLocalFeeAlreadyWithheld: true }, date), undefined, city);
    }
  });
  test(`${year}: Weirton and Wheeling require 30 days during the calendar year`, () => {
    for (const city of ['Weirton', 'Wheeling']) {
      assert.equal(fee({ locality: city, daysWorkedInLocality: 29 }, date), undefined);
      assert.equal(fee({ locality: city, daysWorkedInLocality: 30 }, date), city === 'Weirton' && year > 2025 ? 500 : 200);
    }
  });
  test(`${year}: every configured fee city resolves from an incorporated place and carries residency`, () => {
    const rules = JSON.parse(readFileSync(new URL(`../data/states/WV-${year}.json`, import.meta.url), 'utf8'));
    const cities = Object.keys(rules.localIncomeTax.serviceFeeCities);
    assert.equal(cities.length, 13);
    assert.ok(!cities.includes('Smithers'), 'do not invent a rate while sources conflict');
    for (const city of cities) {
      const resolved = resolveJurisdiction({ state: 'WV', incorporatedPlaces: [`${city} ${city === 'Rivesville' ? 'town' : 'city'}`], countySubdivisions: [], counties: [] }, date);
      assert.equal(resolved.wvServiceFeeCity, city);
      assert.equal(toCertificateFields(resolved, 'work').workCity, city);
      assert.equal(toCertificateFields(resolved, 'residence').residenceCity, city);
      if (rules.localIncomeTax.serviceFeeCities[city].nonResidentOnly) {
        // geocode/index.ts selects certificate.locality from the work resolver;
        // toCertificateFields contributes the residence exemption facts.
        assert.equal(fee({ locality: city, ...toCertificateFields(resolved, 'work'), ...toCertificateFields(resolved, 'residence') }, date), undefined, city);
        assert.ok(fee({ locality: city, ...toCertificateFields(resolved, 'work') }, date)! > 0, city);
      }
    }
  });
}

test('WV coverage remains partial and calls out unresolved rates and secondary sourcing', () => {
  const row = coverage().states.find(s => s.code === 'WV')!;
  assert.equal(row.localStatus, 'partial');
  assert.equal(row.localCount, 13);
  for (const city of ['Smithers', 'Madison', 'Rivesville']) assert.match(row.localNote, new RegExp(city));
});

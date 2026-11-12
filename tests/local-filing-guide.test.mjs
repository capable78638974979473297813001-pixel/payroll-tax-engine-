import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { localAgencyGuide, localWithholdingGuide } from '../payroll/local/filingGuide.mjs';

function rows(file, key) {
  return JSON.parse(readFileSync(new URL('../data/local/' + file + '-2026.json', import.meta.url), 'utf8'))[key];
}

test('every registered Indiana county and taxing Ohio school district routes to its state collector', () => {
  for (const row of rows('IN-counties', 'counties')) {
    const result = localWithholdingGuide('IN-county', row.countyCode, 2026);
    assert.equal(result.agency, 'IN-DOR');
    assert.equal(result.jurisdiction, row.name);
  }
  for (const row of rows('OH-school-districts', 'districts')) {
    const result = localWithholdingGuide('OH-school-district', row.sdNumber, 2026);
    assert.equal(result.agency, 'OH-SDIT');
    assert.equal(result.jurisdiction, row.name);
  }
});

test('regional Ohio collectors use the registry; residual and ambiguous cities remain unresolved', () => {
  for (const row of rows('OH-municipalities', 'municipalities')) {
    const result = localWithholdingGuide('OH-municipality', row.municode, 2026);
    if (!row.municode) {
      assert.equal(result.status, 'unknown-code');
      continue;
    }
    assert.equal(result.jurisdiction, row.name);
    if (row.municode === '21616') {
      assert.equal(result.agency, 'OH-DELTA');
    } else if (row.municode === '71983') {
      assert.equal(result.status, 'collector-unverified');
    } else if (['RITA', 'CCA'].includes(row.administeredBy)) {
      assert.ok(result.membershipSources.length);
      assert.equal(result.agency, 'OH-' + row.administeredBy);
      assert.equal(result.confirmMembershipForPeriod, true);
    } else if (!['57750', '57764', '57792', '21378'].includes(row.municode)) {
      assert.equal(result.status, 'collector-unverified');
    }
  }
});

test('unknown codes and unsupported years never return filing instructions', () => {
  assert.equal(localWithholdingGuide('IN-county', 1, 2026).status, 'unknown-code');
  assert.equal(localWithholdingGuide('OH-school-district', '0203', 2025).status, 'unsupported-year');
  assert.equal(localWithholdingGuide('unknown', '01', 2026).status, 'unsupported-jurisdiction-type');
  assert.equal(localAgencyGuide('toString', 2026), null);
  assert.equal(localAgencyGuide('OH-RITA', 2027), null);
});

test('Pennsylvania tax collection districts preserve the Allegheny split and Philadelphia exception', () => {
  const guide = code => localWithholdingGuide('PA-EIT-district', code, 2026);
  assert.equal(guide('01').guide.collector, 'York Adams Tax Bureau');
  assert.match(guide('70').guide.collector, /Jordan/);
  assert.match(guide('71').guide.collector, /Keystone/);
  assert.match(guide('51').guide.returns[0][0], /Wage Tax/);
  assert.equal(guide('02').status, 'unknown-code');
  assert.equal(guide('constructor').status, 'unknown-code');
});

test('2026 municipal filing routes use county-specific and dated sources', () => {
  for (const [code, agency] of Object.entries({
    '57750': 'OH-RITA', '57764': 'OH-OAKWOOD-MONTGOMERY', '57792': 'OH-CCA',
    '21378': 'OH-RITA', '71486': 'OH-CCA',
  })) {
    const result = localWithholdingGuide('OH-municipality', code, 2026);
    assert.equal(result.agency, agency);
    assert.ok(result.membershipSources.length);
    assert.equal(localWithholdingGuide('OH-municipality', code, 2027).status, 'unsupported-year');
  }
  for (const [code, name] of Object.entries({
    '29932': 'Germantown', '56588': 'North Hampton', '74748': 'Stockport',
  })) {
    const result = localWithholdingGuide('OH-municipality', code, 2026);
    assert.equal(result.jurisdiction, name);
    assert.equal(result.agency, 'OH-RITA');
  }
  assert.equal(localWithholdingGuide('OH-municipality', '', 2026).status, 'unknown-code');
});

test('Ohio zones resolve by Finder zone ID, with explicit gaps', () => {
  for (const zone of rows('OH-jedd-jedz', 'zones')) {
    const result = localWithholdingGuide('OH-jedd-jedz', zone.jeddId, 2026);
    assert.equal(result.jurisdiction, zone.name);
    if (result.status === 'guide') {
      assert.match(result.collectorCode, /^\d{3}$/);
      assert.ok(result.membershipSources.length);
    } else {
      assert.equal(result.status, 'collector-unverified');
    }
  }
  assert.equal(localWithholdingGuide('OH-jedd-jedz', '981', 2026).status, 'unknown-code');
});

test('collector filing codes preserve leading zeroes and district subdivisions', () => {
  for (const [code, agency, collectorCode] of [
    ['9143', 'OH-RITA', '047'], ['9142', 'OH-RITA', '247'],
    ['9003', 'OH-RITA', '037'], ['9055', 'OH-CCA', '981'],
    ['9115', 'OH-RITA', '145'], ['9118', 'OH-RITA', '144'],
    ['9132', 'OH-CCA', '982'], ['9072', 'OH-CCA', '990'],
  ]) {
    const result = localWithholdingGuide('OH-jedd-jedz', code, 2026);
    assert.equal(result.agency, agency);
    assert.equal(result.collectorCode, collectorCode);
  }
  assert.equal(localWithholdingGuide('OH-jedd-jedz', '9156', 2026).status, 'collector-unverified');
});

test('municipal filing routes preserve transitions and distinguish the two Shawnee Hills', () => {
  const lookup = code => localWithholdingGuide('OH-municipality', code, 2026);
  assert.equal(lookup('21616').agency, 'OH-DELTA');
  assert.equal(lookup('71976').agency, 'OH-RITA');
  assert.equal(lookup('71983').status, 'collector-unverified');
  for (const code of ['54866', '52682', '61504', '45094']) {
    assert.equal(lookup(code).administrationStartedOn, code === '45094' ? '2026-10-01' : '2026-07-01');
    assert.match(lookup(code).filingNote, /earlier periods/);
  }
});

test('PA EIT instructions follow the appointed collector across the district directory', () => {
  const directory = JSON.parse(readFileSync(new URL('../data/filing/local/PA-districts-2026.json', import.meta.url)));
  for (const [code, district] of Object.entries(directory.districts)) {
    const { guide } = localWithholdingGuide('PA-EIT-district', code, 2026);
    if (district.collector === 'Keystone Collections Group') {
      assert.match(guide.payment, /electronically/);
      assert.ok(guide.sources.includes('https://keystonecollects.com/mandatory-electronic-filing-for-employers/'));
    } else if (district.collector === 'Berkheimer Tax Administrator') {
      assert.equal(guide.returns[0][0], 'E1');
      assert.match(guide.payment, /ACH debit/);
      assert.match(guide.filing, /combined monthly filers must use electronic file upload/i);
    } else {
      assert.doesNotMatch(guide.payment, /Keystone|Berkheimer/);
    }
    assert.ok(guide.sources.includes(directory.source));
  }
});

test('PA LST uses a separately identified collector and its own form and remittance instructions', () => {
  const hab = localAgencyGuide('PA-BERKHEIMER-LST', 2026);
  assert.equal(hab.returns[0][0], 'LST-1');
  assert.match(hab.filing, /25156/);
  const keystone = localAgencyGuide('PA-KEYSTONE-LST', 2026);
  assert.match(keystone.returns[0][1], /zero-filing/);
  assert.match(keystone.payment, /electronically/);
  assert.equal(localWithholdingGuide('PA-LST-district', '71', 2026).status, 'unsupported-jurisdiction-type');
  assert.equal(localAgencyGuide('PA-KEYSTONE-LST', 2025), null);
});

test('all Act 32 districts return collector filing channels and preserve local requirements', () => {
  const directory = JSON.parse(readFileSync(new URL('../data/filing/local/PA-districts-2026.json', import.meta.url)));
  const lookup = code => localWithholdingGuide('PA-EIT-district', code, 2026).guide;
  for (const [code, district] of Object.entries(directory.districts)) {
    if (code === '51') continue;
    const guide = lookup(code);
    assert.ok(directory.collectorInstructions[district.collector]);
    assert.notEqual(guide.filing, directory.act32.filing);
    assert.notEqual(guide.payment, directory.act32.payment);
    assert.match(guide.returns[0][1], /last day of the month|February 1, 2027/);
  }
  assert.match(lookup('31').filing, /26 or more employees must/);
  assert.match(lookup('21').filing, /20 or more employees must/);
  assert.match(lookup('26').filing, /requests electronic detail/);
  assert.match(lookup('73').filing, /require electronic returns/);
  assert.match(lookup('36').returns[1][1], /Confirm with the bureau/);
  assert.equal(lookup('28').returns[1][0], '541');
  assert.match(lookup('51').returns[0][0], /Wage Tax/);
});

test('Michigan city guides distinguish state and municipal filing offices', () => {
  const lookup = city => localWithholdingGuide('MI-city', city, 2026);
  assert.equal(lookup('Detroit').agency, 'MI-DETROIT');
  assert.deepEqual(lookup('Detroit').guide.returns.map(([form]) => form), ['5323', '5321']);
  assert.match(lookup('Grand Rapids').guide.registration, /SS-4/);
  assert.equal(lookup('Lansing').guide.returns[0][0], 'L-941');
  assert.equal(lookup('  east lansing ').guide.returns[0][0], 'EL-501');
  assert.equal(lookup('Lansing Township').status, 'unknown-code');
  assert.equal(localWithholdingGuide('MI-city', 'Detroit', 2027).status, 'unsupported-year');
  for (const row of rows('MI-cities', 'cities')) {
    const result = lookup(row.name);
    assert.equal(result.jurisdiction, row.name);
    assert.equal(result.status, 'guide');
    assert.ok(result.guide.sources.length);
    for (const field of ['registration', 'returns', 'filing', 'payment']) {
      assert.ok(result.guide[field].length, row.name + ' lacks ' + field);
    }
  }
});

test('Michigan employer guides preserve city-specific filing and remittance instructions', () => {
  const guide = city => localWithholdingGuide('MI-city', city, 2026).guide;
  assert.match(guide('Grayling').filing, /PO Box 549, Grayling/);
  assert.match(guide('Hamtramck').filing, /PO Box 209/);
  assert.match(guide('Highland Park').filing, /PO Box 239/);
  assert.match(guide('Port Huron').filing, /100 or more employees/);
  assert.match(guide('Springfield').returns[0][1], /\$100 or more/);
  assert.match(guide('Walker').filing, /Upload W-2s before/);
  assert.notEqual(guide('Muskegon').collector, guide('Muskegon Heights').collector);
  assert.match(guide('Ionia').returns[1][1], /Confirm/);
});

test('Missouri city routes distinguish quarterly, annual and employer-only filings', () => {
  const lookup = city => localWithholdingGuide('MO-city', city, 2026);
  const kc = lookup(' Kansas City ');
  assert.equal(kc.agency, 'MO-KANSAS-CITY');
  assert.deepEqual(kc.guide.returns.map(([form]) => form), ['RD-110', 'RD-130M / RD-130QM', 'RD-113']);
  for (const city of ['St. Louis', 'St Louis', 'Saint Louis']) {
    const result = lookup(city);
    assert.equal(result.jurisdiction, 'St. Louis');
    assert.deepEqual(result.guide.returns.map(([form]) => form), ['W-10', 'P-10', 'W-3']);
  }
  assert.equal(lookup('St. Louis County').status, 'unknown-code');
  assert.equal(lookup('North Kansas City').status, 'unknown-code');
  assert.equal(localWithholdingGuide('MO-city', 'Kansas City', 2027).status, 'unsupported-year');
});

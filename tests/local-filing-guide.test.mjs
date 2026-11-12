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

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
    if (['RITA', 'CCA'].includes(row.administeredBy)) {
      assert.equal(result.agency, 'OH-' + row.administeredBy);
      assert.equal(result.confirmMembershipForPeriod, true);
    } else {
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

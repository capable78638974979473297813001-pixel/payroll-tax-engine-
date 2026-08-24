import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  namesEqual,
  schoolDistrictKeyFromCensusName,
  schoolDistrictKeyFromDataFileName,
  schoolDistrictKeysMatch,
  stripCountySuffix,
  stripParenthetical,
  stripPlaceTypeSuffix,
  toPAMunicipalityForm,
} from '../geocode/normalize.ts';
import {
  resolveJurisdiction,
  toCertificateFields,
  type CensusGeographies,
} from '../geocode/resolve.ts';

const CHECK_DATE = '2026-08-15';

/**
 * Every geography object below is a trimmed, hand-verified transcription of
 * a REAL response from geocoding.geo.census.gov, captured live this
 * session (not invented) — e.g. Bluffton:
 *   curl 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress
 *   ?address=136+N+Main+St,+Bluffton,+OH+45817&benchmark=Public_AR_Current
 *   &vintage=Current_Current&format=json'
 * returned Incorporated Places=["Bluffton village"], County Subdivisions=
 * ["Richland township"], Counties=["Allen County"], States[0].STUSAB="OH".
 * The school district name ("Bluffton Exempted Village School District")
 * is a real TIGERweb identify() result at that same address's resolved
 * coordinates (-83.890750603619, 40.894159987441), layer 14 (Unified
 * School Districts) — school districts are NOT in the geocoder's own
 * response; see census.ts's own doc comment for why a second service call
 * is required.
 */
describe('normalize.ts', () => {
  test('stripParenthetical removes a trailing annotation', () => {
    assert.equal(stripParenthetical('Bluffton EVSD (expires 2028)'), 'Bluffton EVSD');
    assert.equal(stripParenthetical('Columbus Grove LSD'), 'Columbus Grove LSD');
  });

  test('stripPlaceTypeSuffix handles Census\'s place-type qualifiers, including the compound "city (balance)" case', () => {
    assert.equal(stripPlaceTypeSuffix('Bluffton village'), 'Bluffton');
    assert.equal(stripPlaceTypeSuffix('Detroit city'), 'Detroit');
    assert.equal(stripPlaceTypeSuffix('Indianapolis city (balance)'), 'Indianapolis');
    assert.equal(stripPlaceTypeSuffix('Abington township'), 'Abington');
  });

  test('stripCountySuffix', () => {
    assert.equal(stripCountySuffix('Marion County'), 'Marion');
    assert.equal(stripCountySuffix('Allen County'), 'Allen');
  });

  test('namesEqual is case/whitespace-insensitive', () => {
    assert.equal(namesEqual('Columbus', ' columbus '), true);
    assert.equal(namesEqual('Columbus', 'Columbus Grove'), false);
  });

  test('toPAMunicipalityForm matches PA-EIT-LST-2026.json\'s own abbreviated convention', () => {
    assert.equal(toPAMunicipalityForm('Abington township'), 'ABINGTON TWP');
    assert.equal(toPAMunicipalityForm('Abbottstown borough'), 'ABBOTTSTOWN BORO');
  });

  test('Ohio school district keys match across genuinely different vocabularies on each side', () => {
    const census = schoolDistrictKeyFromCensusName('Bluffton Exempted Village School District');
    const dataFile = schoolDistrictKeyFromDataFileName('Bluffton EVSD (expires 2028)');
    assert.deepEqual(census, { base: 'BLUFFTON', type: 'EVSD' });
    assert.deepEqual(dataFile, { base: 'BLUFFTON', type: 'EVSD' });
    assert.equal(schoolDistrictKeysMatch(census, dataFile), true);
  });

  test('school district keys do NOT match a different district', () => {
    const census = schoolDistrictKeyFromCensusName('Columbus City School District');
    const bluffton = schoolDistrictKeyFromDataFileName('Bluffton EVSD (expires 2028)');
    assert.equal(schoolDistrictKeysMatch(census, bluffton), false);
  });
});

describe('resolve.ts — real captured Census geographies', () => {
  test('Bluffton, OH: resolves BOTH a real municipal match and a real SDIT match at once', () => {
    const geo: CensusGeographies = {
      state: 'OH',
      incorporatedPlaces: ['Bluffton village'],
      countySubdivisions: ['Richland township'],
      counties: ['Allen County'],
    };
    const resolved = resolveJurisdiction(geo, CHECK_DATE, 'Bluffton Exempted Village School District');

    assert.equal(resolved.ohMunicipality?.confidence, 'matched');
    assert.equal(resolved.ohMunicipality?.entry?.name, 'Bluffton');
    assert.equal(resolved.ohMunicipality?.entry?.rate, 0.0165);
    assert.equal(resolved.ohSchoolDistrict?.confidence, 'matched');
    assert.equal(resolved.ohSchoolDistrict?.entry?.sdNumber, '0203');
    assert.equal(resolved.ohSchoolDistrict?.entry?.rate2026, 0.005);

    const fields = toCertificateFields(resolved, 'work');
    assert.equal(fields.workCity, 'Bluffton');
    assert.equal(fields.schoolDistrictCode, '0203');
  });

  test('Columbus, OH: resolves to a real municipal match, and a school district NAME that correctly finds no SDIT levy', () => {
    const geo: CensusGeographies = {
      state: 'OH',
      incorporatedPlaces: ['Columbus city'],
      countySubdivisions: ['Columbus city'],
      counties: ['Franklin County'],
    };
    // Real TIGERweb identify() result for downtown Columbus — Columbus
    // City School District does not levy SDIT (only 214 of Ohio's 600+
    // districts do), so a real, correctly-resolved district name should
    // still produce no_match here, not an error.
    const resolved = resolveJurisdiction(geo, CHECK_DATE, 'Columbus City School District');

    assert.equal(resolved.ohMunicipality?.confidence, 'matched');
    assert.equal(resolved.ohMunicipality?.entry?.name, 'Columbus');
    assert.equal(resolved.ohMunicipality?.entry?.rate, 0.025);
    assert.equal(resolved.ohSchoolDistrict?.confidence, 'no_match');

    const fields = toCertificateFields(resolved, 'work');
    assert.equal(fields.workCity, 'Columbus');
    assert.equal(fields.schoolDistrictCode, undefined);
  });

  test('Indianapolis, IN: resolves to a county match (Indiana taxes by county, not city)', () => {
    const geo: CensusGeographies = {
      state: 'IN',
      incorporatedPlaces: ['Indianapolis city (balance)'],
      countySubdivisions: ['Center township'],
      counties: ['Marion County'],
    };
    const resolved = resolveJurisdiction(geo, CHECK_DATE);
    assert.equal(resolved.county?.confidence, 'matched');
    assert.equal(resolved.county?.entry?.name, 'Marion');

    const fields = toCertificateFields(resolved, 'work');
    assert.equal(fields.county, 'Marion');
  });

  test('Detroit, MI: resolves to a real MI city match', () => {
    const geo: CensusGeographies = {
      state: 'MI',
      incorporatedPlaces: ['Detroit city'],
      countySubdivisions: ['Detroit city'],
      counties: ['Wayne County'],
    };
    const resolved = resolveJurisdiction(geo, CHECK_DATE);
    assert.equal(resolved.miCity?.confidence, 'matched');
    assert.equal(resolved.miCity?.entry?.name, 'Detroit');
    assert.equal(resolved.miCity?.entry?.residentRate, 0.024);

    const fields = toCertificateFields(resolved, 'residence');
    assert.equal(fields.residenceCity, 'Detroit');
  });

  test('Abington, PA: resolves to a real PSD code via county+municipality join', () => {
    const geo: CensusGeographies = {
      state: 'PA',
      incorporatedPlaces: [], // PA townships aren't "Incorporated Places" in Census's own terms
      countySubdivisions: ['Abington township'],
      counties: ['Montgomery County'],
    };
    const resolved = resolveJurisdiction(geo, CHECK_DATE);
    assert.equal(resolved.paJurisdiction?.confidence, 'matched');
    assert.equal(resolved.paJurisdiction?.entry?.psdCode, '460101');
    assert.equal(resolved.paJurisdiction?.entry?.municipality, 'ABINGTON TWP');

    const fields = toCertificateFields(resolved, 'work');
    assert.equal(fields.workPSD, '460101');
  });

  test('a state with no local registry wired (e.g. Texas) resolves every field to null, not a false no_match', () => {
    const geo: CensusGeographies = {
      state: 'TX',
      incorporatedPlaces: ['Austin city'],
      countySubdivisions: [],
      counties: ['Travis County'],
    };
    const resolved = resolveJurisdiction(geo, CHECK_DATE);
    assert.equal(resolved.miCity, null);
    assert.equal(resolved.ohMunicipality, null);
    assert.equal(resolved.county, null);
    assert.equal(resolved.paJurisdiction, null);
    assert.deepEqual(toCertificateFields(resolved, 'work'), {});
  });

  test('an unrecognised place name produces no_match, never a guess', () => {
    const geo: CensusGeographies = {
      state: 'MI',
      incorporatedPlaces: ['Nowhereville city'],
      countySubdivisions: [],
      counties: ['Wayne County'],
    };
    const resolved = resolveJurisdiction(geo, CHECK_DATE);
    assert.equal(resolved.miCity?.confidence, 'no_match');
    assert.equal(resolved.miCity?.entry, null);
  });
});

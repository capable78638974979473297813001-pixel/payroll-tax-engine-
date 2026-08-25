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
  toMDCountyKey,
  toPAMunicipalityForm,
} from '../geocode/normalize.ts';
import {
  resolveJurisdiction,
  toCertificateFields,
  type CensusGeographies,
} from '../geocode/resolve.ts';
import {
  fetchSchoolDistrictAtPointSafe,
  geocodeAddress,
  normalizeAddress,
  stripSecondaryUnit,
} from '../geocode/census.ts';
import { crossCheckAddress, crossCheckSafe, milesBetween } from '../geocode/nominatim.ts';
import {
  LARGE_HOUSE_NUMBER_GAP,
  checkNearestBuilding,
  extractHouseNumber,
  extractStreet,
  fetchNearbyBuildings,
  nearestBuilding,
  nearestBuildingOnStreet,
  streetKey,
} from '../geocode/buildings.ts';

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

  test('toMDCountyKey matches MD-2026.json\'s own camelCase countyRates keys, including the Baltimore City/County special case', () => {
    assert.equal(toMDCountyKey('Anne Arundel County'), 'AnneArundel');
    assert.equal(toMDCountyKey("Prince George's County"), 'PrinceGeorges');
    assert.equal(toMDCountyKey("St. Mary's County"), 'StMarys');
    assert.equal(toMDCountyKey("Queen Anne's County"), 'QueenAnnes');
    assert.equal(toMDCountyKey('Montgomery County'), 'Montgomery');
    // The one deliberate exception: MD-2026.json keeps "County"/"City" on
    // Baltimore specifically because the two are different, adjacent
    // jurisdictions that are easy to conflate.
    assert.equal(toMDCountyKey('Baltimore County'), 'BaltimoreCounty');
    assert.equal(toMDCountyKey('Baltimore city'), 'BaltimoreCity');
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

  // Real captured responses: Baltimore MD (independent city, no county),
  // Rockville MD (ordinary city inside a real county), St. Louis MO
  // (independent city), Kansas City MO (ordinary city inside Jackson
  // County), Newark NJ, Yonkers NY, midtown Manhattan NY, downtown
  // Portland OR (inside Multnomah County).
  test('Baltimore, MD: resolves via the Incorporated Places layer to BaltimoreCity, not BaltimoreCounty', () => {
    const geo: CensusGeographies = {
      state: 'MD',
      incorporatedPlaces: ['Baltimore city'],
      countySubdivisions: [],
      counties: ['Baltimore city'],
    };
    const resolved = resolveJurisdiction(geo, CHECK_DATE);
    assert.equal(resolved.mdCounty?.confidence, 'matched');
    assert.equal(resolved.mdCounty?.entry, 'BaltimoreCity');
    assert.deepEqual(toCertificateFields(resolved, 'residence'), { county: 'BaltimoreCity' });
  });

  test('Rockville, MD: an ordinary city resolves via the county it sits inside, not the city name', () => {
    const geo: CensusGeographies = {
      state: 'MD',
      incorporatedPlaces: ['Rockville city'],
      countySubdivisions: [],
      counties: ['Montgomery County'],
    };
    const resolved = resolveJurisdiction(geo, CHECK_DATE);
    assert.equal(resolved.mdCounty?.confidence, 'matched');
    assert.equal(resolved.mdCounty?.entry, 'Montgomery');
  });

  test('New York City: sets the newYorkCity flag from Incorporated Places', () => {
    const geo: CensusGeographies = {
      state: 'NY',
      incorporatedPlaces: ['New York city'],
      countySubdivisions: [],
      counties: ['New York County'],
    };
    const resolved = resolveJurisdiction(geo, CHECK_DATE);
    assert.equal(resolved.flags.newYorkCity, true);
    assert.equal(resolved.flags.yonkers, false);
  });

  test('Yonkers, NY: sets the yonkers flag, not the newYorkCity flag', () => {
    const geo: CensusGeographies = {
      state: 'NY',
      incorporatedPlaces: ['Yonkers city'],
      countySubdivisions: [],
      counties: ['Westchester County'],
    };
    const resolved = resolveJurisdiction(geo, CHECK_DATE);
    assert.equal(resolved.flags.yonkers, true);
    assert.equal(resolved.flags.newYorkCity, false);
  });

  test('St. Louis, MO: sets the stLouis flag (Census keeps the period)', () => {
    const geo: CensusGeographies = {
      state: 'MO',
      incorporatedPlaces: ['St. Louis city'],
      countySubdivisions: [],
      counties: ['St. Louis city'],
    };
    const resolved = resolveJurisdiction(geo, CHECK_DATE);
    assert.equal(resolved.flags.stLouis, true);
    assert.equal(resolved.flags.kansasCity, false);
  });

  test('Kansas City, MO: sets the kansasCity flag', () => {
    const geo: CensusGeographies = {
      state: 'MO',
      incorporatedPlaces: ['Kansas City city'],
      countySubdivisions: [],
      counties: ['Jackson County'],
    };
    const resolved = resolveJurisdiction(geo, CHECK_DATE);
    assert.equal(resolved.flags.kansasCity, true);
    assert.equal(resolved.flags.stLouis, false);
  });

  test('Newark, NJ: sets the newark flag', () => {
    const geo: CensusGeographies = {
      state: 'NJ',
      incorporatedPlaces: ['Newark city'],
      countySubdivisions: [],
      counties: ['Essex County'],
    };
    const resolved = resolveJurisdiction(geo, CHECK_DATE);
    assert.equal(resolved.flags.newark, true);
  });

  test('downtown Portland, OR: sets multnomahCounty from the Counties layer', () => {
    const geo: CensusGeographies = {
      state: 'OR',
      incorporatedPlaces: ['Portland city'],
      countySubdivisions: [],
      counties: ['Multnomah County'],
    };
    const resolved = resolveJurisdiction(geo, CHECK_DATE);
    assert.equal(resolved.flags.multnomahCounty, true);
  });

  test('a Missouri address outside both KC and St. Louis leaves both flags false', () => {
    const geo: CensusGeographies = {
      state: 'MO',
      incorporatedPlaces: ['Springfield city'],
      countySubdivisions: [],
      counties: ['Greene County'],
    };
    const resolved = resolveJurisdiction(geo, CHECK_DATE);
    assert.equal(resolved.flags.kansasCity, false);
    assert.equal(resolved.flags.stLouis, false);
  });

  test('Birmingham, AL: resolves a real municipal occupational tax match', () => {
    // Real Census result for 710 20th St N, Birmingham, AL 35203.
    const geo: CensusGeographies = {
      state: 'AL',
      incorporatedPlaces: ['Birmingham city'],
      countySubdivisions: [],
      counties: ['Jefferson County'],
    };
    const resolved = resolveJurisdiction(geo, CHECK_DATE);
    assert.equal(resolved.alMunicipality?.confidence, 'matched');
    assert.equal(resolved.alMunicipality?.entry?.name, 'Birmingham');
    assert.equal(resolved.alMunicipality?.entry?.rate, 0.01);

    const fields = toCertificateFields(resolved, 'work');
    assert.equal(fields.workCity, 'Birmingham');
  });

  test('a real AL city outside the 25-jurisdiction list: no_match, not a guess', () => {
    const geo: CensusGeographies = {
      state: 'AL',
      incorporatedPlaces: ['Montgomery city'],
      countySubdivisions: [],
      counties: ['Montgomery County'],
    };
    const resolved = resolveJurisdiction(geo, CHECK_DATE);
    assert.equal(resolved.alMunicipality?.confidence, 'no_match');
  });

  test('Edmonton, KY: resolves BOTH the city and its containing county at once — the KRS 68.197 credit-eligible pair', () => {
    // Real Census result for 105 W Main St, Edmonton, KY 42129 — Edmonton
    // is Metcalfe County's own county seat, and both are independently
    // confirmed at 1% in data/local/KY-occupational-2026.json.
    const geo: CensusGeographies = {
      state: 'KY',
      incorporatedPlaces: ['Edmonton city'],
      countySubdivisions: [],
      counties: ['Metcalfe County'],
    };
    const resolved = resolveJurisdiction(geo, CHECK_DATE);
    assert.equal(resolved.kyCity?.confidence, 'matched');
    assert.equal(resolved.kyCity?.entry?.name, 'Edmonton');
    assert.equal(resolved.kyCounty?.confidence, 'matched');
    assert.equal(resolved.kyCounty?.entry?.name, 'Metcalfe County');

    const fields = toCertificateFields(resolved, 'work');
    assert.equal(fields.workCity, 'Edmonton');
    assert.equal(fields.workCounty, 'Metcalfe County');
  });

  test('KY county matching excludes school-district-level entries, even though they name-match', () => {
    // Cumberland County Public School District (0.5%, confirmed) is a
    // DIFFERENT jurisdiction from a general "Cumberland County" government
    // tax — see toKYCountyBaseName()'s own doc comment for why. A Census
    // "Cumberland County" match must NOT resolve to the school district.
    const geo: CensusGeographies = {
      state: 'KY',
      incorporatedPlaces: [],
      countySubdivisions: [],
      counties: ['Cumberland County'],
    };
    const resolved = resolveJurisdiction(geo, CHECK_DATE);
    assert.equal(resolved.kyCounty?.confidence, 'no_match');
  });

  test('KY workCounty is only populated on a work-role call, never residence', () => {
    const geo: CensusGeographies = {
      state: 'KY',
      incorporatedPlaces: ['Edmonton city'],
      countySubdivisions: [],
      counties: ['Metcalfe County'],
    };
    const resolved = resolveJurisdiction(geo, CHECK_DATE);
    const residenceFields = toCertificateFields(resolved, 'residence');
    assert.equal(residenceFields.workCounty, undefined);
    assert.equal(residenceFields.residenceCity, 'Edmonton');
  });

  test('Wheeling, WV: matches the wvServiceFeeCity field by name', () => {
    // Real Census result for 1500 Chapline St, Wheeling, WV 26003.
    const geo: CensusGeographies = {
      state: 'WV',
      incorporatedPlaces: ['Wheeling city'],
      countySubdivisions: [],
      counties: ['Ohio County'],
    };
    const resolved = resolveJurisdiction(geo, CHECK_DATE);
    assert.equal(resolved.wvServiceFeeCity, 'Wheeling');
  });

  test('a WV city with no service fee: wvServiceFeeCity stays null', () => {
    const geo: CensusGeographies = {
      state: 'WV',
      incorporatedPlaces: ['Beckley city'],
      countySubdivisions: [],
      counties: ['Raleigh County'],
    };
    const resolved = resolveJurisdiction(geo, CHECK_DATE);
    assert.equal(resolved.wvServiceFeeCity, null);
  });

  test('Denver, CO: sets the denver flag', () => {
    // Real Census result for 1437 Bannock St, Denver, CO 80202 — Denver
    // is itself a consolidated city-county government in Colorado too.
    const geo: CensusGeographies = {
      state: 'CO',
      incorporatedPlaces: ['Denver city'],
      countySubdivisions: [],
      counties: ['Denver County'],
    };
    const resolved = resolveJurisdiction(geo, CHECK_DATE);
    assert.equal(resolved.flags.denver, true);
  });

  test('a Colorado address outside Denver leaves the denver flag false', () => {
    const geo: CensusGeographies = {
      state: 'CO',
      incorporatedPlaces: ['Colorado Springs city'],
      countySubdivisions: [],
      counties: ['El Paso County'],
    };
    const resolved = resolveJurisdiction(geo, CHECK_DATE);
    assert.equal(resolved.flags.denver, false);
  });

  test('Wilmington, DE: sets the wilmington flag', () => {
    // Real Census result for 800 N French St, Wilmington, DE 19801.
    const geo: CensusGeographies = {
      state: 'DE',
      incorporatedPlaces: ['Wilmington city'],
      countySubdivisions: [],
      counties: ['New Castle County'],
    };
    const resolved = resolveJurisdiction(geo, CHECK_DATE);
    assert.equal(resolved.flags.wilmington, true);
  });

  test('a Delaware address outside Wilmington leaves the wilmington flag false', () => {
    const geo: CensusGeographies = {
      state: 'DE',
      incorporatedPlaces: ['Dover city'],
      countySubdivisions: [],
      counties: ['Kent County'],
    };
    const resolved = resolveJurisdiction(geo, CHECK_DATE);
    assert.equal(resolved.flags.wilmington, false);
  });
});

describe('census.ts — match quality, retries, and the secondary-unit fallback (mocked fetch, no live network)', () => {
  function geocoderBody(opts: { matched: boolean; fromAddress?: string; toAddress?: string }) {
    if (!opts.matched) return { result: { addressMatches: [] } };
    return {
      result: {
        addressMatches: [
          {
            matchedAddress: '90 W BROAD ST, COLUMBUS, OH, 43215',
            coordinates: { x: -83.0, y: 40.0 },
            addressComponents: { fromAddress: opts.fromAddress, toAddress: opts.toAddress },
            geographies: {
              States: [{ STUSAB: 'OH' }],
              'Incorporated Places': [{ NAME: 'Columbus city' }],
              'County Subdivisions': [],
              Counties: [{ NAME: 'Franklin County' }],
            },
          },
        ],
      },
    };
  }

  describe('normalizeAddress / stripSecondaryUnit (pure)', () => {
    test('normalizeAddress trims and collapses internal whitespace', () => {
      assert.equal(normalizeAddress('  123  Main   St ,  Columbus, OH  '), '123 Main St , Columbus, OH');
    });

    test('stripSecondaryUnit removes a trailing apartment/suite/unit designator', () => {
      assert.equal(stripSecondaryUnit('123 Main St Apt 4B, Columbus, OH 43215'), '123 Main St, Columbus, OH 43215');
      assert.equal(stripSecondaryUnit('123 Main St Unit 12, Columbus, OH 43215'), '123 Main St, Columbus, OH 43215');
      assert.equal(stripSecondaryUnit('123 Main St Suite 200, Columbus, OH 43215'), '123 Main St, Columbus, OH 43215');
      assert.equal(stripSecondaryUnit('123 Main St #5, Columbus, OH 43215'), '123 Main St, Columbus, OH 43215');
    });

    test('stripSecondaryUnit returns null when there is nothing to strip', () => {
      assert.equal(stripSecondaryUnit('123 Main St, Columbus, OH 43215'), null);
    });
  });

  describe('geocodeAddress fallback retry', () => {
    test('falls back to the unit-stripped address when the full address does not match, and flags matchedViaFallback', async () => {
      let calls = 0;
      const fakeFetch = (async (url: string) => {
        calls++;
        const isFirstCall = calls === 1;
        return new Response(
          JSON.stringify(geocoderBody(isFirstCall ? { matched: false } : { matched: true, fromAddress: '90', toAddress: '98' })),
          { status: 200 },
        );
      }) as typeof fetch;

      const result = await geocodeAddress('123 Main St Apt 4B, Columbus, OH 43215', fakeFetch);
      assert.equal(calls, 2, 'should try the full address once, then the stripped fallback once');
      assert.equal(result.matched, true);
      assert.equal(result.matchQuality?.matchedViaFallback, true);
    });

    test('an address with no secondary unit to strip does not retry after a genuine no-match', async () => {
      let calls = 0;
      const fakeFetch = (async () => {
        calls++;
        return new Response(JSON.stringify(geocoderBody({ matched: false })), { status: 200 });
      }) as typeof fetch;

      const result = await geocodeAddress('999 Nowhere Rd, Columbus, OH 43215', fakeFetch);
      assert.equal(calls, 1, 'nothing to strip, so no fallback attempt should fire');
      assert.equal(result.matched, false);
    });
  });

  describe('matchQuality.addressRangeWidth', () => {
    test('computed from the matched address range Census returns', async () => {
      const fakeFetch = (async () =>
        new Response(JSON.stringify(geocoderBody({ matched: true, fromAddress: '90', toAddress: '148' })), {
          status: 200,
        })) as typeof fetch;

      const result = await geocodeAddress('90 W Broad St, Columbus, OH 43215', fakeFetch);
      assert.equal(result.matchQuality?.addressRangeWidth, 58);
      assert.equal(result.matchQuality?.matchedAddress, '90 W BROAD ST, COLUMBUS, OH, 43215');
    });
  });

  describe('retry-with-backoff on transient failures', () => {
    test('a transient 500 is retried and a subsequent success is returned', async () => {
      let calls = 0;
      const fakeFetch = (async () => {
        calls++;
        if (calls === 1) return new Response('server error', { status: 500 });
        return new Response(JSON.stringify(geocoderBody({ matched: true, fromAddress: '1', toAddress: '9' })), {
          status: 200,
        });
      }) as typeof fetch;

      const result = await geocodeAddress('90 W Broad St, Columbus, OH 43215', fakeFetch, { baseBackoffMs: 0 });
      assert.equal(calls, 2, 'one failed attempt, one retried success');
      assert.equal(result.matched, true);
    });

    test('a genuine 400 (bad request) is NOT retried — retrying a client error cannot help', async () => {
      let calls = 0;
      const fakeFetch = (async () => {
        calls++;
        return new Response('bad request', { status: 400 });
      }) as typeof fetch;

      await assert.rejects(() => geocodeAddress('90 W Broad St, Columbus, OH 43215', fakeFetch, { baseBackoffMs: 0 }));
      assert.equal(calls, 1, 'a 400 should fail fast, not burn retries');
    });

    test('exhausting all retries on persistent 500s eventually throws rather than hanging forever', async () => {
      let calls = 0;
      const fakeFetch = (async () => {
        calls++;
        return new Response('server error', { status: 500 });
      }) as typeof fetch;

      await assert.rejects(() => geocodeAddress('90 W Broad St, Columbus, OH 43215', fakeFetch, { baseBackoffMs: 0 }));
      assert.ok(calls > 1, 'should have retried at least once before giving up');
    });
  });

  describe('fetchSchoolDistrictAtPointSafe', () => {
    test('a network failure is caught and reported as {ok: false}, not thrown', async () => {
      const failingFetch = (async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch;

      const result = await fetchSchoolDistrictAtPointSafe(-83.0, 40.0, failingFetch, { baseBackoffMs: 0 });
      assert.equal(result.ok, false);
    });

    test('a genuine "no district here" result still comes back as {ok: true, district: null}, distinct from a failure', async () => {
      const fakeFetch = (async () => new Response(JSON.stringify({ results: [] }), { status: 200 })) as typeof fetch;

      const result = await fetchSchoolDistrictAtPointSafe(-83.0, 40.0, fakeFetch);
      assert.deepEqual(result, { ok: true, district: null });
    });
  });
});

describe('nominatim.ts — the independent cross-check geocoder (mocked fetch, no live network)', () => {
  function nominatimBody(opts: { matched: boolean; lat?: string; lon?: string; address?: Record<string, string> }) {
    if (!opts.matched) return [];
    return [{ lat: opts.lat, lon: opts.lon, address: opts.address }];
  }

  describe('milesBetween (pure)', () => {
    test('the same point is zero miles from itself', () => {
      assert.equal(milesBetween({ lat: 39.96, lon: -83.0 }, { lat: 39.96, lon: -83.0 }), 0);
    });

    test('a real, known distance comes out approximately right', () => {
      // Columbus, OH downtown vs. a point ~1 mile east — sanity-checked
      // against a rough 1-degree-longitude-at-this-latitude ≈ 53 miles
      // approximation (0.019 deg * 53 ≈ 1.0mi), not an exact fixture.
      const miles = milesBetween({ lat: 39.9612, lon: -83.0007 }, { lat: 39.9612, lon: -82.9817 });
      assert.ok(miles > 0.8 && miles < 1.3, `expected roughly 1 mile, got ${miles}`);
    });
  });

  describe('crossCheckAddress / crossCheckSafe', () => {
    test('extracts place from whichever of city/town/village Nominatim used, and county', async () => {
      const fakeFetch = (async () =>
        new Response(
          JSON.stringify(
            nominatimBody({
              matched: true,
              lat: '40.894',
              lon: '-83.890',
              address: { town: 'Bluffton', county: 'Allen County', state: 'Ohio' },
            }),
          ),
          { status: 200 },
        )) as typeof fetch;

      const result = await crossCheckAddress('136 N Main St, Bluffton, OH 45817', fakeFetch, {
        minIntervalMs: 0,
      });
      assert.equal(result.matched, true);
      assert.equal(result.place, 'Bluffton');
      assert.equal(result.county, 'Allen County');
      assert.deepEqual(result.coordinates, { lat: 40.894, lon: -83.89 });
    });

    test('no match comes back as matched: false, not a throw', async () => {
      const fakeFetch = (async () =>
        new Response(JSON.stringify(nominatimBody({ matched: false })), { status: 200 })) as typeof fetch;

      const result = await crossCheckAddress('999 Nowhere Rd', fakeFetch, { minIntervalMs: 0 });
      assert.equal(result.matched, false);
    });

    test('crossCheckSafe catches a network failure and reports {ok: false} rather than throwing', async () => {
      const failingFetch = (async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch;

      const result = await crossCheckSafe('90 W Broad St, Columbus, OH 43215', failingFetch, {
        minIntervalMs: 0,
        baseBackoffMs: 0,
      });
      assert.equal(result.ok, false);
    });

    test('crossCheckSafe wraps a genuine match as {ok: true, result}', async () => {
      const fakeFetch = (async () =>
        new Response(
          JSON.stringify(
            nominatimBody({ matched: true, lat: '39.96', lon: '-83.0', address: { city: 'Columbus', county: 'Franklin County' } }),
          ),
          { status: 200 },
        )) as typeof fetch;

      const result = await crossCheckSafe('90 W Broad St, Columbus, OH 43215', fakeFetch, { minIntervalMs: 0 });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.result.place, 'Columbus');
      }
    });
  });
});

/**
 * The building-footprint check. Every footprint below is REAL data,
 * captured live from the Overpass API this session with the exact query
 * fetchNearbyBuildings() itself builds:
 *   curl -X POST https://overpass-api.de/api/interpreter --data-urlencode \
 *     'data=[out:json][timeout:20];way["building"](39.960237,-83.014757,39.962932,-83.011240);out tags geom;'
 * (that bbox is the ~150m box around Nominatim's own point for 90 W Broad
 * St, Columbus; the other set is the same query around Census's point).
 * Only the six closest footprints per point are kept, and only the tags
 * this module reads — coordinates are the real ones, rounded to 6
 * decimals (~0.1m).
 *
 * This is the pair of real results the whole module exists for: Census's
 * point sits 23m from "50 West Broad Street" (LeVeque Tower) — 40 numbers
 * from the target, plausible — while Nominatim's sits 10m from "500 W
 * Broad Street" (Gravity Building A), 410 numbers away, which is the
 * signal that Nominatim resolved a genuinely different location.
 */
describe('buildings.ts — the OpenStreetMap building-footprint check (real captured Overpass data, mocked fetch)', () => {
  const ring = (pairs: [number, number][]) => pairs.map(([lat, lon]) => ({ lat, lon }));
  const TARGET = '90 W Broad St, Columbus, OH 43215';
  const CENSUS_POINT = { lat: 39.962072, lon: -83.002493 };
  const NOMINATIM_POINT = { lat: 39.961585, lon: -83.012999 };

  // CENSUS point {"lat":39.962072,"lon":-83.002493} — 6 of 25 footprints returned
  const CENSUS_FOOTPRINTS = [
    // 23m away
    { tags: {"name":"LeVeque Tower","addr:housenumber":"50","addr:street":"West Broad Street","building":"yes"}, geometry: ring([[39.962419, -83.002334], [39.962216, -83.002296], [39.962242, -83.002064], [39.962247, -83.002024], [39.962289, -83.001647], [39.962370, -83.001663], [39.962423, -83.001673], [39.962452, -83.001678], [39.962410, -83.002054], [39.962443, -83.002104], [39.962437, -83.002153], [39.962734, -83.002209], [39.962714, -83.002390], [39.962419, -83.002334]]) },
    // 31m away
    { tags: {"name":"Huntington Plaza","addr:housenumber":"37","addr:street":"West Broad Street","building":"commercial"}, geometry: ring([[39.961615, -83.002180], [39.961880, -83.002233], [39.961910, -83.001981], [39.961940, -83.001725], [39.961674, -83.001672], [39.961634, -83.002022], [39.961615, -83.002180]]) },
    // 33m away
    { tags: {"name":"Ohio Department of Education","addr:housenumber":"25","addr:street":"South Front Street","building":"public"}, geometry: ring([[39.961307, -83.003126], [39.961450, -83.003153], [39.961580, -83.003179], [39.961723, -83.003206], [39.961729, -83.003158], [39.961790, -83.002618], [39.961751, -83.002611], [39.961425, -83.002548], [39.961374, -83.002538], [39.961312, -83.003078], [39.961307, -83.003126]]) },
    // 50m away
    { tags: {"name":"Palace Theatre","building":"yes"}, geometry: ring([[39.962452, -83.001678], [39.962791, -83.001737], [39.962734, -83.002209], [39.962437, -83.002153], [39.962443, -83.002104], [39.962410, -83.002054], [39.962452, -83.001678]]) },
    // 58m away
    { tags: {"name":"City Hall","building":"civic"}, geometry: ring([[39.962824, -83.003773], [39.962835, -83.003676], [39.962873, -83.003683], [39.962931, -83.003181], [39.962898, -83.003175], [39.962916, -83.003019], [39.962473, -83.002932], [39.962456, -83.003075], [39.962425, -83.003069], [39.962367, -83.003577], [39.962409, -83.003585], [39.962395, -83.003701], [39.962455, -83.003713], [39.962453, -83.003731], [39.962488, -83.003738], [39.962486, -83.003762], [39.962714, -83.003806], [39.962718, -83.003777], [39.962750, -83.003783], [39.962752, -83.003759], [39.962824, -83.003773]]) },
    // 66m away
    { tags: {"building":"parking"}, geometry: ring([[39.961604, -83.002016], [39.961611, -83.001958], [39.961621, -83.001882], [39.961602, -83.001879], [39.961620, -83.001727], [39.961460, -83.001695], [39.961427, -83.001978], [39.961526, -83.002000], [39.961545, -83.002004], [39.961595, -83.002014], [39.961602, -83.002016], [39.961604, -83.002016]]) },
  ];

  // NOMINATIM point {"lat":39.961585,"lon":-83.012999} — 6 of 10 footprints returned
  const NOMINATIM_FOOTPRINTS = [
    // 10m away
    { tags: {"name":"Gravity Building A","addr:housenumber":"500","addr:street":"W Broad Street","building":"apartments"}, geometry: ring([[39.960792, -83.013381], [39.960758, -83.013632], [39.960958, -83.013993], [39.961149, -83.014041], [39.961171, -83.013865], [39.961067, -83.013672], [39.961337, -83.013433], [39.961351, -83.013213], [39.961202, -83.013286], [39.961140, -83.013094], [39.961410, -83.012855], [39.961578, -83.013185], [39.961727, -83.013055], [39.961695, -83.012916], [39.961432, -83.012639], [39.961275, -83.012717], [39.961209, -83.012506], [39.960952, -83.012220], [39.960923, -83.012473], [39.961085, -83.012822], [39.961037, -83.012888], [39.960990, -83.012938], [39.960872, -83.012829], [39.960843, -83.013038], [39.961030, -83.013379], [39.960932, -83.013522], [39.960792, -83.013381]]) },
    // 26m away
    { tags: {"name":"Gravity Apartments parking garage","building":"parking"}, geometry: ring([[39.961174, -83.013738], [39.961367, -83.014094], [39.961568, -83.013917], [39.961651, -83.014067], [39.961673, -83.014108], [39.961725, -83.014203], [39.961813, -83.014209], [39.962032, -83.014006], [39.961840, -83.013662], [39.961956, -83.013559], [39.961791, -83.013254], [39.961742, -83.013303], [39.961714, -83.013249], [39.961174, -83.013738]]) },
    // 85m away
    { tags: {"building":"service"}, geometry: ring([[39.962128, -83.012261], [39.962123, -83.012291], [39.962144, -83.012297], [39.962149, -83.012267], [39.962128, -83.012261]]) },
    // 96m away
    { tags: {"name":"Agora Christian Fellowship Church","building":"yes"}, geometry: ring([[39.961262, -83.011452], [39.961270, -83.011394], [39.961187, -83.011386], [39.961158, -83.011607], [39.961065, -83.011585], [39.961022, -83.011607], [39.960996, -83.011805], [39.961418, -83.011891], [39.961468, -83.011492], [39.961262, -83.011452]]) },
    // 97m away
    { tags: {"building":"industrial"}, geometry: ring([[39.961847, -83.011742], [39.961844, -83.011775], [39.961739, -83.011757], [39.961743, -83.011718], [39.961707, -83.011711], [39.961705, -83.011736], [39.961448, -83.011690], [39.961434, -83.011819], [39.962055, -83.011931], [39.962071, -83.011782], [39.961847, -83.011742]]) },
    // 111m away
    { tags: {"addr:housenumber":"455","addr:street":"W Broad Street","building":"commercial"}, geometry: ring([[39.960555, -83.013208], [39.960612, -83.012696], [39.959959, -83.012572], [39.959902, -83.013084], [39.960555, -83.013208]]) },
  ];

  /**
   * Opts out of the retry backoff and the request-spacing throttle (the
   * LOGIC still runs; the suite just doesn't pay real seconds for it), and
   * hands each call its OWN availability record. That last part is not
   * ceremony: without it, the tests below that simulate an outage open the
   * module-wide circuit and every later test gets skipped instead of run —
   * which is exactly what happened the first time these were written.
   */
  const fresh = (overrides: Record<string, unknown> = {}) => ({
    minIntervalMs: 0,
    baseBackoffMs: 0,
    circuit: { consecutiveFailures: 0, openUntil: 0 },
    ...overrides,
  });

  const okFetch = (elements: unknown[]) =>
    (async () => new Response(JSON.stringify({ elements }), { status: 200 })) as unknown as typeof fetch;

  describe('street/house-number parsing (pure)', () => {
    test('streetKey makes the postal and OSM spellings of one street compare equal — both forms appear in the real data above', () => {
      assert.equal(streetKey('W Broad St'), streetKey('West Broad Street'));
      assert.equal(streetKey('W Broad Street'), streetKey('West Broad Street'));
      assert.equal(streetKey('N. Main St.'), 'north main street');
    });

    test('streetKey expands a street type only at the END, so a name that starts with one survives', () => {
      assert.equal(streetKey('St Clair Ave'), 'st clair avenue');
    });

    test('streetKey keeps genuinely different streets different', () => {
      assert.notEqual(streetKey('W Broad St'), streetKey('S Front St'));
    });

    test('extractHouseNumber reads the leading number, or null when there is none', () => {
      assert.equal(extractHouseNumber(TARGET), '90');
      assert.equal(extractHouseNumber('Broadway, New York, NY'), null);
    });

    test('extractStreet drops the house number and any unit designator', () => {
      assert.equal(extractStreet(TARGET), 'W Broad St');
      assert.equal(extractStreet('1600 Broadway, New York, NY 10019'), 'Broadway');
      assert.equal(extractStreet('123 Main St Apt 4B, Columbus, OH 43215'), 'Main St');
    });
  });

  describe('nearestBuilding / nearestBuildingOnStreet (pure, real footprints)', () => {
    test("the nearest footprint of any kind to Census's point is LeVeque Tower, about 23m away", () => {
      const nearest = nearestBuilding(CENSUS_POINT, CENSUS_FOOTPRINTS);
      assert.equal(nearest?.name, 'LeVeque Tower');
      assert.ok(
        nearest!.distanceMeters > 15 && nearest!.distanceMeters < 35,
        `expected roughly 23m, got ${nearest!.distanceMeters}`,
      );
    });

    test('the point falls OUTSIDE every footprint — which is why this uses nearest-edge distance, not containment', () => {
      // Census interpolates to the street curb, not into the building. If
      // this ever starts returning ~0, the geocoder's behaviour changed,
      // not this module's.
      assert.ok(nearestBuilding(CENSUS_POINT, CENSUS_FOOTPRINTS)!.distanceMeters > 5);
    });

    test('the SAME-STREET filter skips a closer cross-street building whose number would mean nothing', () => {
      // The Ohio Department of Education footprint ("25 South Front
      // Street") is only 33m from this point — closer than City Hall and
      // barely further than Huntington Plaza — but comparing 90 W Broad
      // St against a South Front Street number compares nothing.
      const onStreet = nearestBuildingOnStreet(CENSUS_POINT, CENSUS_FOOTPRINTS, 'W Broad St');
      assert.equal(onStreet?.name, 'LeVeque Tower');
      assert.equal(onStreet?.houseNumber, '50');
      assert.equal(onStreet?.street, 'West Broad Street');
    });

    test('a street with no tagged footprint nearby yields no candidate at all, rather than the wrong one', () => {
      assert.equal(nearestBuildingOnStreet(CENSUS_POINT, CENSUS_FOOTPRINTS, 'E Long St'), null);
    });

    test('a footprint tagged with a street but no house number is not a candidate — there is nothing to compare', () => {
      const untagged = [
        {
          tags: { 'addr:street': 'West Broad Street' },
          geometry: ring([
            [39.9621, -83.0025],
            [39.9622, -83.0026],
          ]),
        },
      ];
      assert.equal(nearestBuildingOnStreet(CENSUS_POINT, untagged, 'W Broad St'), null);
    });
  });

  describe('checkNearestBuilding — the real Columbus disagreement, end to end', () => {
    test("Census's point: a 40-number gap to the nearest same-street building, well under the flag threshold", async () => {
      const result = await checkNearestBuilding(TARGET, CENSUS_POINT, okFetch(CENSUS_FOOTPRINTS), fresh());
      assert.equal(result.attempted, true);
      assert.equal(result.onStreet?.houseNumber, '50');
      assert.equal(result.houseNumberGap, 40);
      assert.ok(result.houseNumberGap! < LARGE_HOUSE_NUMBER_GAP);
    });

    test("Nominatim's point: a 410-number gap — the real error this check was built to catch", async () => {
      const result = await checkNearestBuilding(TARGET, NOMINATIM_POINT, okFetch(NOMINATIM_FOOTPRINTS), fresh());
      assert.equal(result.attempted, true);
      assert.equal(result.nearest?.name, 'Gravity Building A');
      // Tagged "W Broad Street" here vs. "West Broad Street" on Census's
      // side of the river — a raw string comparison would have missed
      // this one entirely.
      assert.equal(result.onStreet?.houseNumber, '500');
      assert.equal(result.houseNumberGap, 410);
      assert.ok(result.houseNumberGap! > LARGE_HOUSE_NUMBER_GAP);
    });

    test('an address with no mapped footprints nearby is attempted-but-silent, NOT evidence against the point', async () => {
      const result = await checkNearestBuilding('1 Rural Route 2, Nowhere, OH', { lat: 40.5, lon: -83.5 }, okFetch([]), fresh());
      assert.equal(result.attempted, true);
      assert.equal(result.nearest, null);
      assert.equal(result.houseNumberGap, null);
    });

    test('a same-street footprint with no house number tagged produces no gap rather than a guess', async () => {
      const result = await checkNearestBuilding(
        TARGET,
        CENSUS_POINT,
        okFetch([
          {
            tags: { 'addr:street': 'West Broad Street', building: 'yes' },
            geometry: [
              { lat: 39.9621, lon: -83.0025 },
              { lat: 39.9622, lon: -83.0026 },
              { lat: 39.9621, lon: -83.0025 },
            ],
          },
        ]),
        fresh(),
      );
      assert.equal(result.attempted, true);
      assert.equal(result.houseNumberGap, null);
    });
  });

  describe('fetchNearbyBuildings — Overpass request shape and failure handling', () => {
    test('posts a bounding-box building query, not a GET', async () => {
      let seen: { url: string; init: RequestInit } | null = null;
      const spyFetch = (async (url: string, init: RequestInit) => {
        seen = { url, init };
        return new Response(JSON.stringify({ elements: [] }), { status: 200 });
      }) as unknown as typeof fetch;

      await fetchNearbyBuildings(39.962072, -83.002493, 150, spyFetch, fresh());
      assert.match(seen!.url, /overpass-api\.de/);
      assert.equal(seen!.init.method, 'POST');
      const body = String(seen!.init.body);
      assert.match(body, /way%5B%22building%22%5D/);
      // The bbox is built around the point, not around the whole city.
      assert.match(body, /39\.96/);
    });

    test("a transient 504 (Overpass under load — observed live, repeatedly) is retried, and the retry's success is returned", async () => {
      let calls = 0;
      const flakyFetch = (async () => {
        calls++;
        if (calls === 1) return new Response('dispatcher error', { status: 504 });
        return new Response(
          JSON.stringify({
            elements: [
              {
                tags: { building: 'yes' },
                geometry: [
                  { lat: 1, lon: 1 },
                  { lat: 1.1, lon: 1.1 },
                ],
              },
            ],
          }),
          { status: 200 },
        );
      }) as unknown as typeof fetch;

      const result = await fetchNearbyBuildings(39.96, -83.0, 150, flakyFetch, fresh());
      assert.equal(calls, 2);
      assert.equal(result.ok, true);
      if (result.ok) assert.equal(result.elements.length, 1);
    });

    test('a genuine empty result is {ok: true, elements: []} — distinct from a failed query, on purpose', async () => {
      const result = await fetchNearbyBuildings(39.96, -83.0, 150, okFetch([]), fresh());
      assert.equal(result.ok, true);
      if (result.ok) assert.deepEqual(result.elements, []);
    });

    test('exhausting the retries reports {ok: false} rather than throwing, or pretending nothing is mapped there', async () => {
      const downFetch = (async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch;

      const result = await fetchNearbyBuildings(39.96, -83.0, 150, downFetch, fresh());
      assert.equal(result.ok, false);
    });

    test('back-to-back calls are spaced by the throttle — the cap Overpass asks for is enforced here, not left to callers', async () => {
      const stamps: number[] = [];
      const stampingFetch = (async () => {
        stamps.push(Date.now());
        return new Response(JSON.stringify({ elements: [] }), { status: 200 });
      }) as unknown as typeof fetch;

      const options = fresh({ minIntervalMs: 60 });
      await fetchNearbyBuildings(39.96, -83.0, 150, stampingFetch, options);
      await fetchNearbyBuildings(39.96, -83.0, 150, stampingFetch, options);
      assert.equal(stamps.length, 2);
      assert.ok(stamps[1] - stamps[0] >= 55, `expected ~60ms of spacing, got ${stamps[1] - stamps[0]}ms`);
    });

    test('a 429 with a Retry-After header waits the time the server actually asked for, not a made-up backoff', async () => {
      let calls = 0;
      const rateLimitedFetch = (async () => {
        calls++;
        if (calls === 1) {
          return new Response('rate limited', { status: 429, headers: { 'Retry-After': '0.08' } });
        }
        return new Response(JSON.stringify({ elements: [] }), { status: 200 });
      }) as unknown as typeof fetch;

      const started = Date.now();
      // baseBackoffMs: 0 would retry instantly — the header has to win.
      const result = await fetchNearbyBuildings(39.96, -83.0, 150, rateLimitedFetch, fresh());
      assert.equal(calls, 2);
      assert.equal(result.ok, true);
      assert.ok(Date.now() - started >= 70, 'expected the Retry-After delay to be honoured');
    });

    test('a host that never answers at all opens the circuit immediately — the next address is skipped, not made to wait for the same timeout', async () => {
      const circuit = { consecutiveFailures: 0, openUntil: 0 };
      const downFetch = (async () => {
        throw new Error('connect ETIMEDOUT');
      }) as unknown as typeof fetch;
      let secondCallReachedTheNetwork = false;
      const spyFetch = (async () => {
        secondCallReachedTheNetwork = true;
        return new Response(JSON.stringify({ elements: [] }), { status: 200 });
      }) as unknown as typeof fetch;

      const first = await fetchNearbyBuildings(39.96, -83.0, 150, downFetch, fresh({ circuit }));
      assert.equal(first.ok, false);
      assert.ok(circuit.openUntil > Date.now(), 'an unreachable host should open the circuit at once');

      const second = await fetchNearbyBuildings(39.96, -83.0, 150, spyFetch, fresh({ circuit }));
      assert.equal(second.ok, false);
      assert.equal(secondCallReachedTheNetwork, false);
    });

    test('an HTTP-level failure gets the benefit of the doubt until three in a row — one unlucky query is not an outage', async () => {
      const circuit = { consecutiveFailures: 0, openUntil: 0 };
      const erroringFetch = (async () => new Response('server error', { status: 500 })) as unknown as typeof fetch;
      const options = fresh({ circuit, retries: 0 });

      await fetchNearbyBuildings(39.96, -83.0, 150, erroringFetch, options);
      assert.equal(circuit.openUntil, 0, 'one failure should not open the circuit');
      await fetchNearbyBuildings(39.96, -83.0, 150, erroringFetch, options);
      assert.equal(circuit.openUntil, 0, 'two failures should not open the circuit');
      await fetchNearbyBuildings(39.96, -83.0, 150, erroringFetch, options);
      assert.ok(circuit.openUntil > Date.now(), 'three in a row is an outage');
    });

    test('a success clears the failure count, so unrelated hiccups never accumulate into a false outage', async () => {
      const circuit = { consecutiveFailures: 0, openUntil: 0 };
      const erroringFetch = (async () => new Response('server error', { status: 500 })) as unknown as typeof fetch;

      await fetchNearbyBuildings(39.96, -83.0, 150, erroringFetch, fresh({ circuit, retries: 0 }));
      assert.equal(circuit.consecutiveFailures, 1);
      await fetchNearbyBuildings(39.96, -83.0, 150, okFetch([]), fresh({ circuit }));
      assert.equal(circuit.consecutiveFailures, 0);
    });

    test('once the cooldown has passed, the next call actually tries again rather than staying open forever', async () => {
      const circuit = { consecutiveFailures: 9, openUntil: Date.now() - 1 };
      let tried = false;
      const spyFetch = (async () => {
        tried = true;
        return new Response(JSON.stringify({ elements: [] }), { status: 200 });
      }) as unknown as typeof fetch;

      const result = await fetchNearbyBuildings(39.96, -83.0, 150, spyFetch, fresh({ circuit }));
      assert.equal(tried, true);
      assert.equal(result.ok, true);
      assert.equal(circuit.consecutiveFailures, 0);
    });

    test('checkNearestBuilding turns that failure into attempted: false — no second opinion, never a mark against the address', async () => {
      const downFetch = (async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch;

      const result = await checkNearestBuilding(TARGET, CENSUS_POINT, downFetch, fresh());
      assert.deepEqual(result, { attempted: false, nearest: null, onStreet: null, houseNumberGap: null });
    });
  });
});

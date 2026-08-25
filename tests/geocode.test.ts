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

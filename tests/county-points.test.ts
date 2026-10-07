import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ADDRESS_POINT_SOURCES,
  fetchCountyAddressPoints,
  layerFeatureToPoint,
  ordinal,
  reconcileDirectionalPosition,
  socrataRowToPoint,
  type LayerPointSource,
  type SocrataPointSource,
} from '../geocode/county-points.ts';
import { resolveRooftop } from '../geocode/rooftop.ts';
import { pointSourceOf } from '../geocode/index.ts';

const source = (id: string): LayerPointSource => {
  const s = ADDRESS_POINT_SOURCES.find((x) => x.id === id);
  assert.ok(s && s.kind === 'layer', `${id} is a registered layer source`);
  return s as LayerPointSource;
};

/** One ArcGIS point feature in the shape the REST API returns with outSR=4326. */
const feature = (attributes: Record<string, unknown>, lat: number, lon: number) => ({ attributes, geometry: { x: lon, y: lat } });

const respond = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

const PITTSBURGH = { lat: 40.4388, lon: -79.9964 };
const FAST = { baseBackoffMs: 0, minIntervalMs: 0 };

describe('ordinal()', () => {
  test('numbers get the right suffix, including the 11-13 exceptions', () => {
    assert.equal(ordinal('1'), '1st');
    assert.equal(ordinal('2'), '2nd');
    assert.equal(ordinal('3'), '3rd');
    assert.equal(ordinal('4'), '4th');
    assert.equal(ordinal('11'), '11th');
    assert.equal(ordinal('12'), '12th');
    assert.equal(ordinal('13'), '13th');
    assert.equal(ordinal('21'), '21st');
    assert.equal(ordinal('112'), '112th');
  });
  test('a name that is not a plain number is left alone', () => {
    assert.equal(ordinal('MAIN'), 'MAIN');
    assert.equal(ordinal(''), '');
  });
});

describe('layerFeatureToPoint()', () => {
  test('Allegheny: directional + name + type are joined in writing order', () => {
    const p = layerFeatureToPoint(
      source('allegheny-pa'),
      feature({ ADDR_NUM: 604, ST_PREFIX: 'N', ST_NAME: 'NEGLEY', ST_TYPE: 'AVE', ZIP_CODE: '15206', MUNICIPALITY: 'CITY OF PITTSBURGH' }, 40.46, -79.93),
    );
    assert.ok(p);
    assert.equal(p!.houseNumber, '604');
    assert.equal(p!.street, 'N NEGLEY AVE');
    assert.equal(p!.zip, '15206');
    assert.equal(p!.lat, 40.46);
    assert.equal(p!.lon, -79.93);
    assert.match(p!.source ?? '', /Allegheny County/);
  });

  test('a row with a number suffix is skipped rather than guessed at ("604 1/2")', () => {
    const p = layerFeatureToPoint(
      source('allegheny-pa'),
      feature({ ADDR_NUM: 604, ADDR_NUM_SUFFIX: '1/2', ST_NAME: 'NEGLEY', ST_TYPE: 'AVE' }, 40.46, -79.93),
    );
    assert.equal(p, null);
  });

  test('a row with no house number, a zero, or a non-numeric one is skipped', () => {
    const s = source('allegheny-pa');
    assert.equal(layerFeatureToPoint(s, feature({ ADDR_NUM: 0, ST_NAME: 'X', ST_TYPE: 'ST' }, 40, -80)), null);
    assert.equal(layerFeatureToPoint(s, feature({ ADDR_NUM: null, ST_NAME: 'X', ST_TYPE: 'ST' }, 40, -80)), null);
    assert.equal(layerFeatureToPoint(s, feature({ ADDR_NUM: 'ABC', ST_NAME: 'X', ST_TYPE: 'ST' }, 40, -80)), null);
  });

  test('a row with no street, or no usable geometry, is skipped', () => {
    const s = source('allegheny-pa');
    assert.equal(layerFeatureToPoint(s, feature({ ADDR_NUM: 5 }, 40, -80)), null);
    assert.equal(layerFeatureToPoint(s, { attributes: { ADDR_NUM: 5, ST_NAME: 'X' } }), null);
  });

  test('City of Miami: the bare grid number becomes an ordinal, padded fields are trimmed, ZIP+4 is cut to five', () => {
    const p = layerFeatureToPoint(
      source('miami-fl'),
      feature({ STNUMBER: 133, STQUAD: 'NE ', STNAME: '2', STTYPE: 'AV', SUITE: '2102', ZIPCODE: 331320000 }, 25.776, -80.19),
    );
    assert.ok(p);
    assert.equal(p!.street, 'NE 2nd AV');
    assert.equal(p!.unit, '2102');
    assert.equal(p!.zip, '33132');
  });

  test('Madison County MS: space-padded values are trimmed', () => {
    const p = layerFeatureToPoint(
      source('madison-ms'),
      feature({ Address: 177, Street: 'VIRLILIA   ', StreetType: 'ROAD', Zipcode: '39046' }, 32.6, -90.08),
    );
    assert.equal(p!.street, 'VIRLILIA ROAD');
  });
});

const socrata = (id: string): SocrataPointSource => {
  const s = ADDRESS_POINT_SOURCES.find((x) => x.id === id);
  assert.ok(s && s.kind === 'socrata', `${id} is a registered Socrata source`);
  return s as SocrataPointSource;
};

describe('socrataRowToPoint()', () => {
  test('San Francisco: plain latitude/longitude columns, street name + type', () => {
    const p = socrataRowToPoint(socrata('sf-ca'), {
      address_number: '401',
      street_name: 'VAN NESS',
      street_type: 'AVE',
      zip_code: '94102',
      latitude: '37.77946222286584',
      longitude: '-122.42051342151602',
    });
    assert.ok(p);
    assert.equal(p!.houseNumber, '401');
    assert.equal(p!.street, 'VAN NESS AVE');
    assert.equal(p!.lat, 37.77946222286584);
    assert.equal(p!.lon, -122.42051342151602);
  });

  test('NYC: coordinates come from the GeoJSON point (lon first), the grid number becomes an ordinal', () => {
    const p = socrataRowToPoint(socrata('nyc-ny'), {
      house_number: '100',
      pre_directional: 'W',
      street_name: '42',
      post_type: 'ST',
      zipcode: '10036',
      the_geom: { type: 'Point', coordinates: [-73.9856, 40.7566] },
    });
    assert.ok(p);
    assert.equal(p!.street, 'W 42nd ST');
    assert.equal(p!.lat, 40.7566);
    assert.equal(p!.lon, -73.9856);
  });

  test('NYC: a hyphenated Queens number ("12-34") and a suffixed number are skipped, not guessed at', () => {
    const base = { street_name: 'MAIN', post_type: 'ST', the_geom: { type: 'Point', coordinates: [-73.8, 40.7] } };
    assert.equal(socrataRowToPoint(socrata('nyc-ny'), { ...base, house_number: '12-34' }), null);
    assert.equal(socrataRowToPoint(socrata('nyc-ny'), { ...base, house_number: '12', house_number_suffix: 'A' }), null);
  });

  test('a row with no usable coordinates is skipped', () => {
    assert.equal(socrataRowToPoint(socrata('sf-ca'), { address_number: '1', street_name: 'X', street_type: 'ST' }), null);
    assert.equal(
      socrataRowToPoint(socrata('sf-ca'), { address_number: '1', street_name: 'X', street_type: 'ST', latitude: '0', longitude: '0' }),
      null,
    );
  });
});

describe('reconcileDirectionalPosition()', () => {
  test('Hennepin\'s "5th Street South" takes the target\'s "S 5th St" spelling', () => {
    assert.equal(reconcileDirectionalPosition('5th Street South', 'S 5th St'), 'S 5th St');
    assert.equal(reconcileDirectionalPosition('Grant Street West', 'W Grant St'), 'W Grant St');
  });
  test('the other way round works too', () => {
    assert.equal(reconcileDirectionalPosition('South 5th Street', '5th St S'), '5th St S');
  });
  test('a DIFFERENT directional is never reconciled: "5th Street North" is not "S 5th St"', () => {
    assert.equal(reconcileDirectionalPosition('5th Street North', 'S 5th St'), '5th Street North');
  });
  test('different street words are left alone', () => {
    assert.equal(reconcileDirectionalPosition('6th Street South', 'S 5th St'), '6th Street South');
    assert.equal(reconcileDirectionalPosition('Main Street', 'Main St'), 'Main Street');
  });
});

describe('the registry', () => {
  test('every source has a state, bounds that are a valid box, and a provenance string', () => {
    for (const s of ADDRESS_POINT_SOURCES) {
      assert.match(s.state, /^[A-Z]{2}$/, s.id);
      assert.ok(s.bounds[0] < s.bounds[2] && s.bounds[1] < s.bounds[3], `${s.id} bounds`);
      assert.ok(s.source.length > 10, `${s.id} source`);
    }
  });
  test('ids are unique', () => {
    const ids = ADDRESS_POINT_SOURCES.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
  });
  test('no layer source requests an owner, tax or value column', () => {
    for (const s of ADDRESS_POINT_SOURCES) {
      if (s.kind !== 'layer') continue;
      for (const f of [s.numberField, ...s.streetFields, s.unitField, s.cityField, s.zipField, ...(s.skipIfSetFields ?? [])]) {
        assert.doesNotMatch(f ?? '', /owner|tax|value|val$/i, `${s.id}: ${f}`);
      }
    }
  });
});

describe('fetchCountyAddressPoints()', () => {
  test('a point outside every source\'s bounds sends no request at all', async () => {
    let calls = 0;
    const out = await fetchCountyAddressPoints('90 W Broad St, Columbus, OH 43215', 39.96, -83.0, 300, (async () => {
      calls++;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch);
    assert.deepEqual(out, []);
    assert.equal(calls, 0);
  });

  test('a state with no registered source sends no request even when the box would fit', async () => {
    let calls = 0;
    await fetchCountyAddressPoints('1 Main St, Detroit, MI 48226', 42.33, -83.04, 300, (async () => {
      calls++;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch);
    assert.equal(calls, 0);
  });

  test('a service error contributes nothing instead of throwing', async () => {
    const out = await fetchCountyAddressPoints(
      '436 Grant St, Pittsburgh, PA 15219',
      PITTSBURGH.lat,
      PITTSBURGH.lon,
      300,
      respond({ error: { code: 500, message: 'down' } }),
    );
    assert.deepEqual(out, []);
  });

  test('a network failure contributes nothing instead of throwing', async () => {
    const out = await fetchCountyAddressPoints(
      '436 Grant St, Pittsburgh, PA 15219',
      PITTSBURGH.lat,
      PITTSBURGH.lon,
      300,
      (async () => {
        throw new Error('ECONNRESET');
      }) as unknown as typeof fetch,
    );
    assert.deepEqual(out, []);
  });

  test('a truncated answer is retried on a tighter box', async () => {
    const urls: string[] = [];
    const out = await fetchCountyAddressPoints('436 Grant St, Pittsburgh, PA 15219', PITTSBURGH.lat, PITTSBURGH.lon, 300, (async (url: string) => {
      urls.push(String(url));
      return new Response(
        JSON.stringify({
          exceededTransferLimit: urls.length === 1,
          features: [feature({ ADDR_NUM: 436, ST_NAME: 'GRANT', ST_TYPE: 'ST' }, PITTSBURGH.lat, PITTSBURGH.lon)],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch);
    assert.equal(urls.length, 2);
    assert.notEqual(urls[0], urls[1]);
    assert.equal(out.length, 1);
  });

  describe('the West Virginia point-address locator', () => {
    const CHARLESTON = { lat: 38.3358, lon: -81.6142 };
    const candidate = (over: Record<string, unknown>, score = 99.5) => ({
      location: { x: -81.6102, y: 38.3378 },
      score,
      attributes: { Addr_type: 'PointAddress', AddNum: '1900', StPreDir: 'E', StName: 'KANAWHA BLVD E', City: 'CHARLESTON', Postal: '25305', ...over },
    });
    const ask = (cands: unknown[]) =>
      fetchCountyAddressPoints('1900 Kanawha Blvd E, Charleston, WV 25305', CHARLESTON.lat, CHARLESTON.lon, 300, respond({ candidates: cands }));

    test('an exact point-address candidate is accepted and carries the target spelling of the street', async () => {
      const out = await ask([candidate({})]);
      assert.equal(out.length, 1);
      assert.equal(out[0].houseNumber, '1900');
      assert.equal(out[0].street, 'Kanawha Blvd E');
      assert.equal(out[0].lat, 38.3378);
    });
    test('a street interpolation (not a point address) is refused', async () => {
      assert.deepEqual(await ask([candidate({ Addr_type: 'StreetAddress' })]), []);
    });
    test('a low score is refused', async () => {
      assert.deepEqual(await ask([candidate({}, 80)]), []);
    });
    test('a different house number is refused', async () => {
      assert.deepEqual(await ask([candidate({ AddNum: '1902' })]), []);
    });
    test('Chicago: a point address scoring 95 is accepted by the 90-point floor, with the locator\'s "LASALLE" spelling matching "LaSalle"', async () => {
      const out = await fetchCountyAddressPoints(
        '121 N LaSalle St, Chicago, IL 60602',
        41.8838,
        -87.6321,
        300,
        respond({
          candidates: [
            { location: { x: -87.632071, y: 41.883784 }, score: 95.05, attributes: { Addr_type: 'PointAddress', AddNum: '121', StPreDir: 'N', StName: 'LASALLE', StType: 'ST', Postal: '60601' } },
          ],
        }),
      );
      assert.equal(out.length, 1);
      assert.match(out[0].source ?? '', /Chicago/);
    });
    test('a different street is refused', async () => {
      assert.deepEqual(await ask([candidate({ StPreDir: '', StName: 'WASHINGTON ST' })]), []);
    });
  });
});

describe('resolveRooftop() with a county source', () => {
  /** NAD returns nothing, Nominatim returns nothing; only the Allegheny service answers. */
  const alleghenyOnly = (features: unknown[]) =>
    (async (url: string) => {
      const target = String(url);
      if (target.includes('alleghenycounty.us')) return new Response(JSON.stringify({ features }), { status: 200 });
      if (target.includes('nominatim')) return new Response('[]', { status: 200 });
      return new Response(JSON.stringify({ features: [] }), { status: 200 });
    }) as unknown as typeof fetch;

  test('an address NAD does not carry resolves "authoritative", with the county named as the source', async () => {
    const r = await resolveRooftop(
      '436 Grant St, Pittsburgh, PA 15219',
      { lat: 40.4385, lon: -79.9959 },
      alleghenyOnly([feature({ ADDR_NUM: 436, ST_NAME: 'GRANT', ST_TYPE: 'ST', ZIP_CODE: '15219' }, 40.4388, -79.9964)]),
      FAST,
      undefined,
      () => [],
    );
    assert.equal(r.tier, 'authoritative');
    assert.equal(r.point!.lat, 40.4388);
    assert.match(r.match!.chosen.source ?? '', /Allegheny County/);
  });

  test('a county point for a DIFFERENT house number is never used as an exact match', async () => {
    const r = await resolveRooftop(
      '436 Grant St, Pittsburgh, PA 15219',
      { lat: 40.4385, lon: -79.9959 },
      alleghenyOnly([feature({ ADDR_NUM: 440, ST_NAME: 'GRANT', ST_TYPE: 'ST' }, 40.4388, -79.9964)]),
      FAST,
      undefined,
      () => [],
    );
    assert.notEqual(r.tier, 'authoritative');
  });

  test('a directional mismatch is not matched: "N Craig" is not "S Craig"', async () => {
    const r = await resolveRooftop(
      '100 N Craig St, Pittsburgh, PA 15213',
      { lat: 40.4388, lon: -79.9500 },
      alleghenyOnly([feature({ ADDR_NUM: 100, ST_PREFIX: 'S', ST_NAME: 'CRAIG', ST_TYPE: 'ST' }, 40.4388, -79.9500)]),
      FAST,
      undefined,
      () => [],
    );
    assert.notEqual(r.tier, 'authoritative');
  });
});

describe('pointSourceOf()', () => {
  const FAST = { baseBackoffMs: 0, minIntervalMs: 0 };
  const empty = (async () => new Response(JSON.stringify({ features: [] }), { status: 200 })) as unknown as typeof fetch;

  test('names the publishing government for an authoritative point, wherever it came from', async () => {
    const r = await resolveRooftop(
      '600 Grant St, Pittsburgh, PA 15219',
      { lat: 40.4385, lon: -79.9959 },
      empty,
      FAST,
      undefined,
      () => [
        { houseNumber: '600', street: 'Grant St', unit: null, city: null, zip: null, placement: null, source: 'OpenAddresses pa/allegheny', lat: 40.4388, lon: -79.9964 },
      ],
    );
    assert.equal(pointSourceOf(r), 'OpenAddresses pa/allegheny');
  });

  test('is null when nothing better than the interpolated point was found, or the match was ambiguous', async () => {
    const none = await resolveRooftop('1 Nowhere Rd, Nowhere, ZZ 00000', { lat: 1, lon: 1 }, empty, FAST, undefined, () => []);
    assert.equal(pointSourceOf(none), null);
    assert.equal(pointSourceOf(null), null);
    assert.equal(pointSourceOf({ ...none, found: true, ambiguous: true, tier: 'authoritative' }), null);
  });

  test('the keyed /v1/address response carries pointSource and the public demo response does not', () => {
    const server = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'site', 'server.ts'), 'utf8');
    const keyed = server.slice(server.indexOf('async function handleAddress('));
    const demo = server.slice(server.indexOf('async function handleDemoResolveAddress('), server.indexOf('async function handleAddress('));
    assert.match(keyed, /pointSource:/);
    assert.doesNotMatch(demo, /pointSource/);
  });
});

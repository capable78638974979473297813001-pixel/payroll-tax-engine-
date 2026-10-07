import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  ADDRESS_POINT_SOURCES,
  fetchCountyAddressPoints,
  layerFeatureToPoint,
  ordinal,
  type LayerPointSource,
} from '../geocode/county-points.ts';
import { resolveRooftop } from '../geocode/rooftop.ts';

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

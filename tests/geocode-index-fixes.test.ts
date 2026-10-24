import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseOpenAddressesLine, splitCsvLine, cellId, toMicro } from '../scripts/address-index-lib.ts';
import {
  hasLocalAddressIndex,
  localAddressPointsNear,
  resetLocalAddressIndexCache,
} from '../geocode/local-address-index.ts';
import { createThrottle } from '../geocode/throttle.ts';
import { crossCheckAddress } from '../geocode/nominatim.ts';
import { fetchNearbyBuildings } from '../geocode/buildings.ts';
import { fetchCountyAddressPoints, sameLocatorStreet } from '../geocode/county-points.ts';
import {
  extractUnit,
  matchAddressPoint,
  neighborBracket,
  parseAddressParts,
  resolveRooftop,
  type AddressPoint,
} from '../geocode/rooftop.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Write a zip of {entry: text} using Python, the same tool the builders read zips with. */
function makeZip(path: string, files: Record<string, string>): void {
  const script = 'import zipfile,sys,json\nz=zipfile.ZipFile(sys.argv[1],"w")\nfor k,v in json.loads(sys.argv[2]).items(): z.writestr(k,v)\nz.close()';
  const r = spawnSync('python3', ['-c', script, path, JSON.stringify(files)]);
  assert.equal(r.status, 0, String(r.stderr));
}

const OA_HEADER = 'LON,LAT,NUMBER,STREET,UNIT,CITY,DISTRICT,REGION,POSTCODE,ID,HASH';

/** One NAD_r23.txt row: 59 columns, only the ones the builder reads filled in. */
function nadRow(f: { number: string; street: string; city: string; state: string; zip: string; lon: number; lat: number; source: string }): string {
  const cols = new Array<string>(59).fill('');
  cols[4] = f.number;
  cols[13] = f.street;
  cols[23] = f.city;
  cols[33] = f.state;
  cols[34] = f.zip;
  cols[39] = String(f.lon);
  cols[40] = String(f.lat);
  cols[58] = f.source;
  return cols.join(',');
}
const NAD_TXT = `${new Array(59).fill('h').join(',')}\n${nadRow({ number: '900', street: 'Smith Ave', city: 'Pittsburgh', state: 'PA', zip: '15220', lon: -80.05, lat: 40.45, source: 'Allegheny GIS' })}\n`;

function run(script: string, args: string[], env: Record<string, string>) {
  return spawnSync(process.execPath, [join(ROOT, 'scripts', script), ...args], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

function rowCount(dbPath: string, where = '1=1'): number {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return (db.prepare(`SELECT COUNT(*) AS c FROM points WHERE ${where}`).get() as { c: number }).c;
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// the importers
// ---------------------------------------------------------------------------

describe('CSV parsing keeps quoted fields intact', () => {
  test('a quoted street containing a comma stays one field, so the unit and city do not shift', () => {
    const r = parseOpenAddressesLine('-79.9959,40.4385,100,"MAIN ST, EAST",4B,PITTSBURGH,,PA,15219,a,b');
    assert.ok(r);
    assert.equal(r!.street, 'MAIN ST, EAST');
    assert.equal(r!.unit, '4B');
    assert.equal(r!.city, 'PITTSBURGH');
    assert.equal(r!.zip, 15219);
  });
  test('doubled quotes unescape, and an unterminated quote skips the row', () => {
    assert.deepEqual(splitCsvLine('a,"b""c",d'), ['a', 'b"c', 'd']);
    assert.equal(parseOpenAddressesLine('-79.9,40.4,1,"MAIN ST,,P,,PA,15219,a,b'), null);
  });
  test('a plain line is split exactly as before', () => {
    assert.deepEqual(splitCsvLine('a,b,,d'), ['a', 'b', '', 'd']);
  });
});

describe('the two bulk importers build one index (scripts/)', () => {
  let dir = '';
  const OA_ROW = '-79.9959,40.4385,600,GRANT ST,,PITTSBURGH,,PA,15219,a,b';

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'index-build-'));
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  const env = (name: string) => ({ ADDRESS_INDEX_PATH: join(dir, name, 'index.db'), ADDRESS_INDEX_RAW_DIR: join(dir, name, 'raw'), NAD_ZIP_PATH: join(dir, name, 'nad.zip') });

  test('OpenAddresses then NAD write format 2 into the same file, and a repeat NAD run does nothing', () => {
    const e = env('both');
    mkdirSync(e.ADDRESS_INDEX_RAW_DIR, { recursive: true });
    makeZip(join(e.ADDRESS_INDEX_RAW_DIR, 'us_northeast.zip'), { 'us/pa/allegheny.csv': `${OA_HEADER}\n${OA_ROW}\n` });
    const oa = run('build-address-index.ts', [], e);
    assert.equal(oa.status, 0, oa.stderr);

    makeZip(e.NAD_ZIP_PATH, { 'TXT/NAD_r23.txt': NAD_TXT });
    const nad = run('build-nad-index.ts', [], e);
    assert.equal(nad.status, 0, nad.stderr);
    assert.equal(rowCount(e.ADDRESS_INDEX_PATH), 2);

    const db = new DatabaseSync(e.ADDRESS_INDEX_PATH, { readOnly: true });
    assert.equal((db.prepare("SELECT value FROM meta WHERE key='format'").get() as { value: string }).value, '2');
    const names = (db.prepare('SELECT name FROM sources ORDER BY name').all() as { name: string }[]).map((r) => r.name);
    db.close();
    assert.deepEqual(names, ['NAD Allegheny GIS', 'OpenAddresses pa/allegheny']);

    // The reader sees both, with their ZIPs.
    const saved = process.env.ADDRESS_INDEX_PATH;
    process.env.ADDRESS_INDEX_PATH = e.ADDRESS_INDEX_PATH;
    resetLocalAddressIndexCache();
    try {
      const a = localAddressPointsNear(40.4385, -79.9959, 300);
      assert.equal(a.length, 1);
      assert.equal(a[0].zip, '15219');
      const b = localAddressPointsNear(40.45, -80.05, 300);
      assert.equal(b[0].source, 'NAD Allegheny GIS');
      assert.equal(b[0].zip, '15220');
    } finally {
      resetLocalAddressIndexCache();
      if (saved === undefined) delete process.env.ADDRESS_INDEX_PATH;
      else process.env.ADDRESS_INDEX_PATH = saved;
    }

    const again = run('build-nad-index.ts', [], e);
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.stdout, /already in/);
    assert.equal(rowCount(e.ADDRESS_INDEX_PATH), 2);
  });

  test('NAD into a format-1 index is refused rather than mixing encodings', () => {
    const e = env('v1');
    mkdirSync(dirname(e.ADDRESS_INDEX_PATH), { recursive: true });
    const db = new DatabaseSync(e.ADDRESS_INDEX_PATH);
    db.exec('CREATE TABLE points (cell TEXT, lat REAL, lon REAL, number TEXT, street TEXT, unit TEXT, city TEXT, state TEXT, source TEXT)');
    db.close();
    makeZip(e.NAD_ZIP_PATH, { 'TXT/NAD_r23.txt': NAD_TXT });
    const nad = run('build-nad-index.ts', [], e);
    assert.equal(nad.status, 1);
    assert.match(nad.stderr, /format-1/);
  });

  test('one good and one unreadable archive: the build fails and the existing index is left alone', () => {
    const e = env('partial');
    mkdirSync(e.ADDRESS_INDEX_RAW_DIR, { recursive: true });
    makeZip(join(e.ADDRESS_INDEX_RAW_DIR, 'us_midwest.zip'), { 'us/pa/allegheny.csv': `${OA_HEADER}\n${OA_ROW}\n` });
    writeFileSync(join(e.ADDRESS_INDEX_RAW_DIR, 'us_west.zip'), 'this is not a zip archive');

    // A good index is already in place.
    const existing = new DatabaseSync(e.ADDRESS_INDEX_PATH);
    existing.exec('CREATE TABLE marker (x INTEGER); INSERT INTO marker VALUES (42)');
    existing.close();
    copyFileSync(e.ADDRESS_INDEX_PATH, `${e.ADDRESS_INDEX_PATH}.copy`);

    const r = run('build-address-index.ts', [], e);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /us_west\.zip/);
    assert.match(r.stderr, /left untouched/);
    const after = new DatabaseSync(e.ADDRESS_INDEX_PATH, { readOnly: true });
    assert.equal((after.prepare('SELECT x FROM marker').get() as { x: number }).x, 42, 'the old index is still the live one');
    after.close();
    assert.equal(existsSync(`${e.ADDRESS_INDEX_PATH}.building`), false, 'the partial build is cleaned up');

    // The operator can still choose to publish what was ingested, and the exit code still says it was partial.
    const forced = run('build-address-index.ts', ['--allow-partial'], e);
    assert.equal(forced.status, 1);
    assert.equal(rowCount(e.ADDRESS_INDEX_PATH), 1);
  });

  test('importing the same data again with --append does not add duplicate rows', () => {
    const e = env('append');
    mkdirSync(e.ADDRESS_INDEX_RAW_DIR, { recursive: true });
    makeZip(join(e.ADDRESS_INDEX_RAW_DIR, 'us_south.zip'), {
      'us/pa/allegheny.csv': `${OA_HEADER}\n${OA_ROW}\n-79.99,40.43,601,GRANT ST,,PITTSBURGH,,PA,15219,a,c\n`,
    });
    assert.equal(run('build-address-index.ts', [], e).status, 0);
    assert.equal(rowCount(e.ADDRESS_INDEX_PATH), 2);
    const again = run('build-address-index.ts', ['--append'], e);
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.stdout, /already in the index/);
    assert.equal(rowCount(e.ADDRESS_INDEX_PATH), 2);
  });

  test('a point listed twice inside one county file is stored once', () => {
    const e = env('dupes');
    mkdirSync(e.ADDRESS_INDEX_RAW_DIR, { recursive: true });
    makeZip(join(e.ADDRESS_INDEX_RAW_DIR, 'us_south.zip'), {
      'us/pa/allegheny.csv': `${OA_HEADER}\n${OA_ROW}\n${OA_ROW}\n-79.99,40.43,601,GRANT ST,,PITTSBURGH,,PA,15219,a,c\n-79.99,40.43,601,GRANT ST,2,PITTSBURGH,,PA,15219,a,d\n`,
    });
    const r = run('build-address-index.ts', [], e);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /1 duplicate row/);
    // 600 once, 601 once, and 601 unit 2 is a different address.
    assert.equal(rowCount(e.ADDRESS_INDEX_PATH), 3);
  });

  test('a quoted comma in a county file lands in the right columns end to end', () => {
    const e = env('quoted');
    mkdirSync(e.ADDRESS_INDEX_RAW_DIR, { recursive: true });
    makeZip(join(e.ADDRESS_INDEX_RAW_DIR, 'us_south.zip'), {
      'us/pa/allegheny.csv': `${OA_HEADER}\n-79.9959,40.4385,100,"MAIN ST, EAST",4B,PITTSBURGH,,PA,15219,a,b\n`,
    });
    assert.equal(run('build-address-index.ts', [], e).status, 0);
    const db = new DatabaseSync(e.ADDRESS_INDEX_PATH, { readOnly: true });
    const row = db.prepare('SELECT street, unit, city FROM points').get() as { street: string; unit: string; city: string };
    db.close();
    assert.deepEqual({ ...row }, { street: 'MAIN ST, EAST', unit: '4B', city: 'PITTSBURGH' });
  });
});

// ---------------------------------------------------------------------------
// the reader
// ---------------------------------------------------------------------------

describe('the local index reader survives a bad or replaced file', () => {
  let dir = '';
  const saved = { path: process.env.ADDRESS_INDEX_PATH, recheck: process.env.ADDRESS_INDEX_RECHECK_MS };
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'index-read-'));
    process.env.ADDRESS_INDEX_RECHECK_MS = '0';
  });
  after(() => {
    resetLocalAddressIndexCache();
    if (saved.path === undefined) delete process.env.ADDRESS_INDEX_PATH;
    else process.env.ADDRESS_INDEX_PATH = saved.path;
    if (saved.recheck === undefined) delete process.env.ADDRESS_INDEX_RECHECK_MS;
    else process.env.ADDRESS_INDEX_RECHECK_MS = saved.recheck;
    rmSync(dir, { recursive: true, force: true });
  });

  function buildIndex(path: string, number: string): void {
    const db = new DatabaseSync(path);
    db.exec(`CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
             CREATE TABLE sources (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
             CREATE TABLE points (cell INTEGER NOT NULL, lat INTEGER NOT NULL, lon INTEGER NOT NULL, number TEXT, street TEXT, unit TEXT, city TEXT, state TEXT NOT NULL, source INTEGER NOT NULL)`);
    db.exec("INSERT INTO meta VALUES ('format','2')");
    db.exec("INSERT INTO sources VALUES (1,'OpenAddresses test')");
    db.prepare('INSERT INTO points VALUES (?,?,?,?,?,?,?,?,?)').run(cellId(40.4385, -79.9959), toMicro(40.4385), toMicro(-79.9959), number, 'GRANT ST', null, 'PITTSBURGH', 'PA', 1);
    db.close();
  }

  test('a SQLite file with the wrong schema is unavailable, not a thrown "no such table"', () => {
    const path = join(dir, 'wrong.db');
    const db = new DatabaseSync(path);
    db.exec('CREATE TABLE unrelated (x INTEGER)');
    db.close();
    process.env.ADDRESS_INDEX_PATH = path;
    resetLocalAddressIndexCache();
    assert.equal(hasLocalAddressIndex(), false);
    assert.deepEqual(localAddressPointsNear(40.4385, -79.9959, 300), []);
  });

  test('a points table missing a column is unavailable too', () => {
    const path = join(dir, 'partial.db');
    const db = new DatabaseSync(path);
    db.exec('CREATE TABLE points (cell INTEGER, lat INTEGER)');
    db.close();
    process.env.ADDRESS_INDEX_PATH = path;
    resetLocalAddressIndexCache();
    assert.equal(hasLocalAddressIndex(), false);
    assert.deepEqual(localAddressPointsNear(40.4385, -79.9959, 300), []);
  });

  test('replacing the index file is picked up without a cache reset', () => {
    const path = join(dir, 'live.db');
    buildIndex(path, '100');
    process.env.ADDRESS_INDEX_PATH = path;
    resetLocalAddressIndexCache();
    assert.equal(localAddressPointsNear(40.4385, -79.9959, 300)[0].houseNumber, '100');

    const next = join(dir, 'live.db.building');
    buildIndex(next, '200');
    renameSync(next, path);
    assert.equal(localAddressPointsNear(40.4385, -79.9959, 300)[0].houseNumber, '200');
  });
});

// ---------------------------------------------------------------------------
// matching
// ---------------------------------------------------------------------------

const pt = (over: Partial<AddressPoint>): AddressPoint => ({
  houseNumber: '100', street: 'Main St', unit: null, city: null, zip: null, placement: null, source: 'test',
  lat: 39.96, lon: -83.0, ...over,
});

describe('a different street type is not an authoritative match', () => {
  test('100 Main St does not accept a lone point on 100 Main Ave', () => {
    assert.equal(matchAddressPoint('100 Main St, Columbus, OH 43215', [pt({ street: 'Main Ave' })]), null);
  });
  test('a missing type on one side is still a match (St Antoine vs St Antoine St)', () => {
    const m = matchAddressPoint('1901 St Antoine St, Detroit, MI', [pt({ houseNumber: '1901', street: 'ST ANTOINE' })]);
    assert.ok(m);
    assert.equal(m!.streetTypeFallback, true);
  });
});

describe('the candidate\'s city and ZIP must agree with the address', () => {
  test('the right number and street in a different ZIP is refused', () => {
    assert.equal(matchAddressPoint('100 Main St, Columbus, OH 43215', [pt({ city: 'Dublin', zip: '43017' })]), null);
    assert.ok(matchAddressPoint('100 Main St, Columbus, OH 43215', [pt({ city: 'Columbus', zip: '43215' })]));
  });
  test('with no ZIP on the point, a different city is refused and the same city (however written) is kept', () => {
    assert.equal(matchAddressPoint('100 Main St, Columbus, OH', [pt({ city: 'Bexley' })]), null);
    assert.ok(matchAddressPoint('100 Main St, Columbus, OH', [pt({ city: 'CITY OF COLUMBUS' })]));
  });
  test('the same ZIP vouches for the point even when the municipality is named differently', () => {
    assert.ok(matchAddressPoint('100 Main St, Detroit, MI 48201', [pt({ city: 'Highland Park', zip: '48201' })]));
  });
  test('a point with no place data still matches, and two same-number points are told apart by ZIP', () => {
    assert.ok(matchAddressPoint('100 Main St, Columbus, OH 43215', [pt({})]));
    const m = matchAddressPoint('100 Main St, Columbus, OH 43215', [
      pt({ zip: '43017', lat: 40.1, lon: -83.1 }),
      pt({ zip: '43215', lat: 39.96, lon: -83.0 }),
    ]);
    assert.equal(m!.matchCount, 1);
    assert.equal(m!.chosen.zip, '43215');
  });
  test('neighbour bracketing ignores points from another ZIP', () => {
    const near = (n: string, zip: string, lat: number) => pt({ houseNumber: n, zip, lat });
    assert.equal(
      neighborBracket('105 Main St, Columbus, OH 43215', [near('100', '43215', 39.96), near('110', '43017', 39.9602)]),
      null,
    );
  });
});

describe('common address formats parse', () => {
  test('"#4B" is a unit and does not stop an otherwise valid match', () => {
    assert.equal(extractUnit('100 Main St #4B, Columbus, OH'), '4B');
    assert.equal(extractUnit('100 Main St # 4B, Columbus, OH'), '4B');
    assert.equal(extractUnit('100 Main St Apt 4B'), '4B');
    assert.equal(extractUnit('100 Flint St'), null);
    const m = matchAddressPoint('100 Main St #4B', [pt({ unit: '4B', lat: 39.96 }), pt({ unit: '5C', lat: 39.9601 })]);
    assert.ok(m);
    assert.equal(m!.matchedUnit, true);
    assert.equal(m!.chosen.unit, '4B');
    assert.ok(matchAddressPoint('100 Main St #4B, Columbus, OH', [pt({})]));
  });
  test('a hyphenated house number (12-34 Main St) is one number', () => {
    const parts = parseAddressParts('12-34 Main St, Queens, NY 11101');
    assert.equal(parts.houseNumber, '12-34');
    assert.equal(parts.street, 'Main St');
    assert.ok(matchAddressPoint('12-34 Main St, Queens, NY', [pt({ houseNumber: '12-34' })]));
    assert.equal(matchAddressPoint('12-34 Main St, Queens, NY', [pt({ houseNumber: '12' })]), null);
  });
});

describe('a government locator may not flip the street direction', () => {
  const respond = (candidates: unknown[]) => (async () => new Response(JSON.stringify({ candidates }), { status: 200 })) as unknown as typeof fetch;
  const CHARLESTON = { lat: 38.3358, lon: -81.6142 };
  const cand = (over: Record<string, unknown>) => ({
    location: { x: -81.6102, y: 38.3378 },
    score: 99.5,
    attributes: { Addr_type: 'PointAddress', AddNum: '1900', StPreDir: 'E', StName: 'KANAWHA BLVD E', City: 'CHARLESTON', Postal: '25305', ...over },
  });

  test('sameLocatorStreet', () => {
    assert.equal(sameLocatorStreet('S MAIN ST', 'N Main St'), false);
    assert.equal(sameLocatorStreet('N MAIN ST', 'N Main St'), true);
    assert.equal(sameLocatorStreet('MAIN AVE', 'Main St'), false);
    assert.equal(sameLocatorStreet('E KANAWHA BLVD E', 'Kanawha Blvd E'), true);
  });
  test('a candidate on the opposite side of the street is dropped, not relabelled', async () => {
    const out = await fetchCountyAddressPoints(
      '1900 W Kanawha Blvd, Charleston, WV 25305', CHARLESTON.lat, CHARLESTON.lon, 300,
      respond([cand({ StPreDir: 'E', StName: 'KANAWHA BLVD' })]),
    );
    assert.deepEqual(out, []);
  });
  test('a different street type is dropped too', async () => {
    const out = await fetchCountyAddressPoints(
      '1900 Kanawha Blvd E, Charleston, WV 25305', CHARLESTON.lat, CHARLESTON.lon, 300,
      respond([cand({ StName: 'KANAWHA', StType: 'AVE', StPreDir: 'E' })]),
    );
    assert.deepEqual(out, []);
  });
});

// ---------------------------------------------------------------------------
// ordering and throttling
// ---------------------------------------------------------------------------

describe('resolveRooftop() answers from the local index without waiting on the network', () => {
  test('an exact local match returns while the NAD and county requests would never finish', async () => {
    let networkCalls = 0;
    const hung = (() => {
      networkCalls++;
      return new Promise<Response>(() => {});
    }) as unknown as typeof fetch;
    const local = () => [pt({ houseNumber: '600', street: 'GRANT ST', city: 'Pittsburgh', zip: '15219', lat: 40.4385, lon: -79.9959, source: 'OpenAddresses pa/allegheny' })];
    const result = await Promise.race([
      resolveRooftop('600 Grant St, Pittsburgh, PA 15219', { lat: 40.4388, lon: -79.9964 }, hung, {}, 300, local),
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 2000)),
    ]);
    assert.notEqual(result, 'timeout');
    assert.equal((result as Awaited<ReturnType<typeof resolveRooftop>>).tier, 'authoritative');
    assert.equal(networkCalls, 0);
  });
});

describe('the request throttle holds under concurrency', () => {
  test('three simultaneous callers are spaced by the interval, not released together', async () => {
    const throttle = createThrottle();
    const stamps: number[] = [];
    await Promise.all([1, 2, 3].map(async () => {
      await throttle(100);
      stamps.push(Date.now());
    }));
    stamps.sort((a, b) => a - b);
    assert.ok(stamps[1] - stamps[0] >= 90, `gap ${stamps[1] - stamps[0]}`);
    assert.ok(stamps[2] - stamps[1] >= 90, `gap ${stamps[2] - stamps[1]}`);
  });
  test('an interval of 0 never waits', async () => {
    const throttle = createThrottle();
    const t = Date.now();
    await Promise.all([throttle(0), throttle(0), throttle(0)]);
    assert.ok(Date.now() - t < 50);
  });
});

describe('the real clients space concurrent requests', () => {
  /** A fetch that records when each request arrived. */
  const recorder = (body: unknown) => {
    const stamps: number[] = [];
    const impl = (async () => {
      stamps.push(Date.now());
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;
    return { stamps, impl };
  };
  const gaps = (stamps: number[]) => stamps.slice(1).map((t, i) => t - stamps[i]);

  test('Nominatim: three simultaneous lookups with a 100 ms interval are at least ~100 ms apart', async () => {
    const { stamps, impl } = recorder([]);
    await Promise.all([1, 2, 3].map((i) => crossCheckAddress(`${i} Main St, Columbus, OH`, impl, { minIntervalMs: 100, retries: 0 })));
    assert.equal(stamps.length, 3);
    for (const g of gaps(stamps)) assert.ok(g >= 90, `gap ${g}ms`);
  });

  test('Overpass (buildings): three simultaneous lookups are spaced the same way', async () => {
    const { stamps, impl } = recorder({ elements: [] });
    await Promise.all([1, 2, 3].map((i) => fetchNearbyBuildings(39.96 + i * 0.001, -83.0, 100, impl, { minIntervalMs: 100, retries: 0 })));
    assert.equal(stamps.length, 3);
    for (const g of gaps(stamps)) assert.ok(g >= 90, `gap ${g}ms`);
  });
});

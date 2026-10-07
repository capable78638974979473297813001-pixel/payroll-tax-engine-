import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CELL, cellId, cellKey, openAddressesRegionUrl, parseOpenAddressesLine, toMicro } from '../scripts/address-index-lib.ts';
import { BUILD_NEEDS_BYTES, DOWNLOAD_NEEDS_BYTES, decide } from '../scripts/ensure-address-index.ts';
import {
  hasLocalAddressIndex,
  localAddressIndexStats,
  localAddressPointsNear,
  resetLocalAddressIndexCache,
} from '../geocode/local-address-index.ts';

describe('parseOpenAddressesLine()', () => {
  test('a normal row becomes an index row', () => {
    const r = parseOpenAddressesLine('-79.9959,40.4385,600,GRANT ST,,PITTSBURGH,,PA,15219,abc,def');
    assert.ok(r);
    assert.equal(r!.number, '600');
    assert.equal(r!.street, 'GRANT ST');
    assert.equal(r!.unit, null);
    assert.equal(r!.city, 'PITTSBURGH');
    assert.equal(r!.lat, 40.4385);
    assert.equal(r!.lon, -79.9959);
    assert.equal(r!.cell, cellId(40.4385, -79.9959));
  });
  test('malformed, zero, out-of-range and empty rows are skipped, not guessed at', () => {
    assert.equal(parseOpenAddressesLine(''), null);
    assert.equal(parseOpenAddressesLine('1,2,3'), null);
    assert.equal(parseOpenAddressesLine('x,y,600,GRANT ST,,C,,PA,1,a,b'), null);
    assert.equal(parseOpenAddressesLine('0,0,600,GRANT ST,,C,,PA,1,a,b'), null);
    assert.equal(parseOpenAddressesLine('-200,40,600,GRANT ST,,C,,PA,1,a,b'), null);
    assert.equal(parseOpenAddressesLine('-80,95,600,GRANT ST,,C,,PA,1,a,b'), null);
    assert.equal(parseOpenAddressesLine('-80,40,,,,C,,PA,1,a,b'), null);
  });
  test('region download URLs point at the OpenAddresses collected extracts', () => {
    assert.equal(openAddressesRegionUrl('south'), 'https://data.openaddresses.io/openaddr-collected-us_south.zip');
  });
});

describe('decide(): what the boot job does', () => {
  const base = { path: '/var/data/x.db', exists: false, url: undefined, autobuild: false, freeBytes: 40 * 1024 ** 3 };
  test('no path means the feature is off', () => assert.equal(decide({ ...base, path: undefined }), 'off'));
  test('an existing index is left alone, even when a URL and autobuild are set', () =>
    assert.equal(decide({ ...base, exists: true, url: 'https://x/y.db', autobuild: true }), 'present'));
  test('a URL is preferred over building', () => assert.equal(decide({ ...base, url: 'https://x/y.db.gz', autobuild: true }), 'download'));
  test('autobuild builds when there is no URL', () => assert.equal(decide({ ...base, autobuild: true }), 'build'));
  test('neither configured: the site runs on the live services only', () => assert.equal(decide(base), 'not-configured'));
  test('too little disk refuses instead of filling the disk the account store lives on', () => {
    assert.equal(decide({ ...base, autobuild: true, freeBytes: BUILD_NEEDS_BYTES - 1 }), 'no-space');
    assert.equal(decide({ ...base, url: 'https://x/y.db', freeBytes: DOWNLOAD_NEEDS_BYTES - 1 }), 'no-space');
    assert.equal(decide({ ...base, autobuild: true, freeBytes: null }), 'build');
  });
});

describe('the reader and the builder agree, and the reader picks up an index that appears later', () => {
  let dir = '';
  let dbPath = '';
  const saved = { path: process.env.ADDRESS_INDEX_PATH, recheck: process.env.ADDRESS_INDEX_RECHECK_MS };

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'addr-index-'));
    dbPath = join(dir, 'address-points.db');
    process.env.ADDRESS_INDEX_PATH = dbPath;
    process.env.ADDRESS_INDEX_RECHECK_MS = '0';
    resetLocalAddressIndexCache();
  });
  after(() => {
    resetLocalAddressIndexCache();
    if (saved.path === undefined) delete process.env.ADDRESS_INDEX_PATH;
    else process.env.ADDRESS_INDEX_PATH = saved.path;
    if (saved.recheck === undefined) delete process.env.ADDRESS_INDEX_RECHECK_MS;
    else process.env.ADDRESS_INDEX_RECHECK_MS = saved.recheck;
    rmSync(dir, { recursive: true, force: true });
  });

  test('before the file exists the index is simply absent', () => {
    assert.equal(hasLocalAddressIndex(), false);
    assert.deepEqual(localAddressPointsNear(40.4385, -79.9959, 300), []);
    assert.equal(localAddressIndexStats().available, false);
  });

  test('the same running process finds a format-2 index once it is renamed into place', () => {
    const building = `${dbPath}.building`;
    const db = new DatabaseSync(building);
    db.exec(`CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
             CREATE TABLE sources (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
             CREATE TABLE points (cell INTEGER NOT NULL, lat INTEGER NOT NULL, lon INTEGER NOT NULL, number TEXT, street TEXT, unit TEXT, city TEXT, state TEXT NOT NULL, source INTEGER NOT NULL)`);
    db.exec("INSERT INTO meta VALUES ('format', '2')");
    db.exec("INSERT INTO sources (id, name) VALUES (7, 'OpenAddresses pa/allegheny')");
    const row = parseOpenAddressesLine('-79.9959,40.4385,600,GRANT ST,,PITTSBURGH,,PA,15219,a,b')!;
    db.prepare('INSERT INTO points VALUES (?,?,?,?,?,?,?,?,?)').run(row.cell, toMicro(row.lat), toMicro(row.lon), row.number, row.street, row.unit, row.city, 'PA', 7);
    db.exec('CREATE INDEX idx_points_cell ON points(cell)');
    db.close();

    // A half-built file under its temporary name is never opened.
    assert.equal(hasLocalAddressIndex(), false);

    // Finishing the build is a rename; the next lookup sees it.
    renameSync(building, dbPath);
    const pts = localAddressPointsNear(40.4385, -79.9959, 300);
    assert.equal(pts.length, 1);
    assert.equal(pts[0].houseNumber, '600');
    assert.equal(pts[0].street, 'GRANT ST');
    assert.equal(pts[0].source, 'OpenAddresses pa/allegheny');
    assert.ok(Math.abs(pts[0].lat - 40.4385) < 1e-6 && Math.abs(pts[0].lon - -79.9959) < 1e-6, 'micro-degrees come back as degrees');
    assert.equal(localAddressIndexStats().totalPoints, 1);
  });

  test('a point just outside the search box is not returned, and a different cell is never read', () => {
    assert.equal(localAddressPointsNear(40.4385 + 0.01, -79.9959, 300).length, 0);
    assert.deepEqual(localAddressPointsNear(41.0, -80.0, 300), []);
  });

  test('a format-1 file (text cell, REAL coordinates, text source) still reads', () => {
    const v1 = join(dir, 'v1.db');
    const db = new DatabaseSync(v1);
    db.exec('CREATE TABLE points (cell TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, number TEXT, street TEXT, unit TEXT, city TEXT, state TEXT NOT NULL, source TEXT NOT NULL)');
    db.prepare('INSERT INTO points VALUES (?,?,?,?,?,?,?,?,?)').run(cellKey(41.5, -81.7), 41.5, -81.7, '1', 'Public Sq', null, 'Cleveland', 'OH', 'NAD Cuyahoga');
    db.close();
    process.env.ADDRESS_INDEX_PATH = v1;
    resetLocalAddressIndexCache();
    const pts = localAddressPointsNear(41.5, -81.7, 300);
    assert.equal(pts.length, 1);
    assert.equal(pts[0].source, 'NAD Cuyahoga');
    assert.equal(pts[0].lat, 41.5);
    process.env.ADDRESS_INDEX_PATH = dbPath;
    resetLocalAddressIndexCache();
  });

  test('the reader and builder use the same cell size, so a point is found in the cell it was written to', () => {
    assert.equal(CELL, 0.01);
    // The packed id stays a 4-byte integer across the whole planet, and neighbouring cells differ by 1 in longitude.
    assert.ok(cellId(89.99, 179.99) < 2 ** 31 && cellId(-89.99, -179.99) >= 0);
    assert.equal(cellId(40.4385, -79.9859) - cellId(40.4385, -79.9959), 1);
  });
});

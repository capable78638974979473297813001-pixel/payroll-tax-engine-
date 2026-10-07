import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { localIndexReaderFor } from '../geocode/index.ts';
import { resolveRooftop } from '../geocode/rooftop.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = readFileSync(join(HERE, '..', 'site', 'server.ts'), 'utf8');

/** The source of one top-level handler, from its declaration to the next top-level one. */
const handlerSource = (name: string): string => {
  const start = SERVER.indexOf(`async function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  const next = SERVER.indexOf('\nasync function ', start + 10);
  return SERVER.slice(start, next === -1 ? undefined : next);
};

describe('the large local address index is a keyed-API feature', () => {
  test('useLocalIndex: false hands the resolver an EMPTY reader; anything else leaves the real index in play', () => {
    const off = localIndexReaderFor({ useLocalIndex: false });
    assert.ok(off);
    assert.deepEqual(off!(), []);
    assert.equal(localIndexReaderFor({ useLocalIndex: true }), undefined);
    assert.equal(localIndexReaderFor({}), undefined);
    assert.equal(localIndexReaderFor(undefined), undefined);
  });

  test('with the index off, points that exist only in the index are never seen by resolveRooftop', async () => {
    const empty = (async () => new Response(JSON.stringify({ features: [] }), { status: 200 })) as unknown as typeof fetch;
    const localOnly = () => [
      { houseNumber: '600', street: 'Grant St', unit: null, city: 'Pittsburgh', zip: '15219', placement: null, source: 'local index', lat: 40.4388, lon: -79.9964 },
    ];
    const at = { lat: 40.4385, lon: -79.9959 };
    const FAST = { baseBackoffMs: 0, minIntervalMs: 0 };

    const withIndex = await resolveRooftop('600 Grant St, Pittsburgh, PA 15219', at, empty, FAST, undefined, localOnly);
    assert.equal(withIndex.tier, 'authoritative');

    const withoutIndex = await resolveRooftop('600 Grant St, Pittsburgh, PA 15219', at, empty, FAST, undefined, localIndexReaderFor({ useLocalIndex: false }));
    assert.notEqual(withoutIndex.tier, 'authoritative');
  });

  test('the public website lookup switches the index off', () => {
    const demo = handlerSource('handleDemoResolveAddress');
    assert.match(demo, /resolveEmployee\([^;]*useLocalIndex:\s*false/s);
  });

  test('the key-authenticated /v1/address endpoint authenticates first and never switches the index off', () => {
    const keyed = handlerSource('handleAddress');
    assert.match(keyed, /authenticateKey\(req, res, 'address'\)/);
    assert.match(keyed, /resolveEmployee\([^;]*useLocalIndex:\s*true/s);
    assert.doesNotMatch(keyed, /useLocalIndex:\s*false/);
  });

  test('no other caller in the site server resolves addresses', () => {
    const calls = SERVER.match(/resolveEmployee\(/g) ?? [];
    assert.equal(calls.length, 2, 'only the demo and the keyed endpoint resolve addresses');
  });
});

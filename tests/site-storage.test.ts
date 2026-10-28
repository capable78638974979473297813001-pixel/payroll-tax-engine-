import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { storageStatusFor } from '../site/lib/store.ts';

/**
 * A server that keeps accounts on its container's own filesystem forgets every one of them at the
 * next restart or redeploy. Sign-up and password sign-in work right up until then, so the symptom is
 * "my account vanished after a while". These pin how the server tells that apart from a real disk.
 */

const prod = { NODE_ENV: 'production', SITE_DB_DIR: '/var/data/site' };
const devices = (map: Record<string, number>) => (path: string) => (path in map ? map[path]! : null);

describe('storage durability', () => {
  test('a mounted disk (a different device than the root filesystem) is durable', () => {
    const r = storageStatusFor('/var/data/site', prod, devices({ '/': 1, '/var/data/site': 2 }));
    assert.equal(r.status, 'durable');
  });

  test('a folder on the root filesystem is temporary: the next redeploy erases every account', () => {
    const r = storageStatusFor('/var/data/site', prod, devices({ '/': 1, '/var/data/site': 1 }));
    assert.equal(r.status, 'temporary');
    assert.match(r.reason, /restart or redeploy erases every account/);
  });

  test('the store folder not existing yet is judged by the nearest folder that does', () => {
    assert.equal(storageStatusFor('/var/data/site', prod, devices({ '/': 1, '/var/data': 2 })).status, 'durable');
    assert.equal(storageStatusFor('/var/data/site', prod, devices({ '/': 1, '/var/data': 1 })).status, 'temporary');
  });

  test('production with no SITE_DB_DIR saves inside the application folder: temporary', () => {
    const r = storageStatusFor('/app/site/.data', { NODE_ENV: 'production' }, devices({ '/': 1, '/app/site/.data': 2 }));
    assert.equal(r.status, 'temporary');
    assert.match(r.reason, /SITE_DB_DIR is not set/);
  });

  test('outside production nothing is claimed either way, and STORAGE_IS_DURABLE=1 overrides the check', () => {
    assert.equal(storageStatusFor('/x', { NODE_ENV: 'development' }, devices({})).status, 'unchecked');
    assert.equal(storageStatusFor('/x', {}, devices({})).status, 'unchecked');
    assert.equal(storageStatusFor('/var/data/site', { ...prod, STORAGE_IS_DURABLE: '1' }, devices({ '/': 1, '/var/data/site': 1 })).status, 'durable');
  });

  test('an uninspectable disk is reported as unchecked, not as a failure', () => {
    assert.equal(storageStatusFor('/var/data/site', prod, devices({})).status, 'unchecked');
  });
});

describe('where the warning appears', () => {
  const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

  test('the health report carries the storage status', () => {
    assert.match(read('site/server.ts'), /storage: storageStatus\(\)\.status/);
  });

  test('the sign-in and sign-up pages show a notice when storage is temporary', () => {
    const js = read('site/assets/session.js');
    assert.match(js, /body\.storage !== 'temporary'/);
    assert.match(js, /signin\|signup/);
  });

  test('the start script warns before the server starts', () => {
    assert.match(read('deploy/start.sh'), /is not on a mounted disk/);
  });
});

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readJsonFile, withFileLock, writeJsonFileAtomic, StoreCorruptError } from '../api/json-store.ts';

/**
 * The JSON stores must never trade a corrupt file for an empty one, and
 * concurrent writers (several processes on one volume) must not lose each
 * other's updates.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
let dir: string;
before(() => { dir = mkdtempSync(join(tmpdir(), 'store-durability-')); });
after(() => rmSync(dir, { recursive: true, force: true }));

describe('durable JSON store (api/json-store.ts)', () => {
  test('a corrupt file throws and is left exactly as it was', () => {
    const file = join(dir, 'corrupt.json');
    writeFileSync(file, '{"keys": {"k1": {"id": "k1"', 'utf8'); // truncated write
    assert.throws(() => readJsonFile(file), StoreCorruptError);
    assert.equal(readFileSync(file, 'utf8'), '{"keys": {"k1": {"id": "k1"');
  });

  test('api/keys.ts refuses a corrupt store instead of overwriting it', async () => {
    const apiDir = join(dir, 'api');
    process.env.API_DB_DIR = apiDir;
    const { mintApiKey } = await import('../api/keys.ts');
    mintApiKey('Before corruption');
    const file = join(apiDir, 'api-keys.json');
    writeFileSync(file, '{ not json', 'utf8');
    assert.throws(() => mintApiKey('After corruption'), StoreCorruptError);
    assert.equal(readFileSync(file, 'utf8'), '{ not json');
    delete process.env.API_DB_DIR;
  });

  test('atomic writes leave no temp files and a readable result', () => {
    const file = join(dir, 'atomic.json');
    writeJsonFileAtomic(file, { a: 1 });
    writeJsonFileAtomic(file, { a: 2 });
    assert.deepEqual(readJsonFile(file), { a: 2 });
    assert.deepEqual(readdirSync(dir).filter((f) => f.endsWith('.tmp')), []);
  });

  test('the lock is re-entrant within a process', () => {
    const file = join(dir, 'reentrant.json');
    const out = withFileLock(file, () => withFileLock(file, () => 42));
    assert.equal(out, 42);
  });

  test('concurrent processes do not lose each other\'s updates', async () => {
    const file = join(dir, 'counter.json');
    writeJsonFileAtomic(file, { n: 0 });
    const script = `
      import { readJsonFile, withFileLock, writeJsonFileAtomic } from ${JSON.stringify(join(REPO, 'api/json-store.ts'))};
      for (let i = 0; i < 40; i++) {
        withFileLock(${JSON.stringify(file)}, () => {
          const db = readJsonFile(${JSON.stringify(file)});
          db.n += 1;
          writeJsonFileAtomic(${JSON.stringify(file)}, db);
        });
      }
    `;
    const runs = Array.from({ length: 4 }, () => new Promise<number>((resolve) => {
      const p = spawn('node', ['--input-type=module', '-e', script], { stdio: 'inherit' });
      p.on('exit', (code) => resolve(code ?? 1));
    }));
    assert.deepEqual(await Promise.all(runs), [0, 0, 0, 0]);
    assert.equal((readJsonFile(file) as { n: number }).n, 160);
  });
});

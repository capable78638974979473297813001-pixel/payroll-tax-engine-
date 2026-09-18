import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  EmailTakenError,
  accountForToken,
  createAccount,
  createSession,
  deleteSession,
  getAccountByEmail,
  getAccountForEmployee,
  getSession,
  publicAccount,
  setPassword,
  verifyCredentials,
} from '../trades/index.ts';

// Each run gets its own on-disk store so the tests never touch a real one.
let dir: string;
before(() => {
  dir = mkdtempSync(join(tmpdir(), 'crewtally-accounts-'));
  process.env.TRADES_DB_DIR = dir;
});
after(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('accounts (trades/accounts.ts)', () => {
  test('an owner account is created and the password is never stored in the clear', () => {
    const acct = createAccount({ email: 'Owner@Shop.test', password: 'hunter2', name: 'Dana Owner', role: 'owner', companyId: 'co_1' });
    assert.equal(acct.role, 'owner');
    assert.equal(acct.email, 'owner@shop.test'); // normalized
    assert.equal(acct.employeeId, null);
    assert.notEqual(acct.passwordHash, 'hunter2');
    assert.ok(acct.passwordHash.length >= 64 && acct.salt.length >= 16);
    // the public shape carries no secret material
    const pub = publicAccount(acct);
    assert.deepEqual(Object.keys(pub).sort(), ['companyId', 'email', 'employeeId', 'id', 'name', 'role']);
  });

  test('a duplicate email (any case) is rejected', () => {
    createAccount({ email: 'dupe@shop.test', password: 'x', name: 'A', role: 'owner', companyId: 'co_1' });
    assert.throws(() => createAccount({ email: 'DUPE@shop.test', password: 'y', name: 'B', role: 'owner', companyId: 'co_2' }), EmailTakenError);
  });

  test('credentials verify only with the right password', () => {
    createAccount({ email: 'joe@shop.test', password: 'correct-horse', name: 'Joe', role: 'worker', companyId: 'co_1', employeeId: 'joe' });
    assert.equal(verifyCredentials('joe@shop.test', 'correct-horse')?.email, 'joe@shop.test');
    assert.equal(verifyCredentials('JOE@shop.test', 'correct-horse')?.employeeId, 'joe'); // email case-insensitive
    assert.equal(verifyCredentials('joe@shop.test', 'wrong'), null);
    assert.equal(verifyCredentials('nobody@shop.test', 'correct-horse'), null);
  });

  test('a reset password replaces the old one', () => {
    const a = createAccount({ email: 'reset@shop.test', password: 'old', name: 'R', role: 'owner', companyId: 'co_1' });
    setPassword(a.id, 'new-secret');
    assert.equal(verifyCredentials('reset@shop.test', 'old'), null);
    assert.equal(verifyCredentials('reset@shop.test', 'new-secret')?.id, a.id);
  });

  test('a worker account is found by its linked employee id', () => {
    createAccount({ email: 'amy@shop.test', password: 'x', name: 'Amy', role: 'worker', companyId: 'co_1', employeeId: 'amy' });
    assert.equal(getAccountForEmployee('amy')?.email, 'amy@shop.test');
    assert.equal(getAccountForEmployee('ghost'), null);
    assert.equal(getAccountByEmail('amy@shop.test')?.employeeId, 'amy');
  });

  test('a session resolves to its account and can be revoked', () => {
    const a = createAccount({ email: 'sess@shop.test', password: 'x', name: 'S', role: 'owner', companyId: 'co_1' });
    const s = createSession(a.id);
    assert.ok(s.token.length >= 32);
    assert.equal(getSession(s.token)?.accountId, a.id);
    assert.equal(accountForToken(s.token)?.id, a.id);
    deleteSession(s.token);
    assert.equal(getSession(s.token), null);
    assert.equal(accountForToken(s.token), null);
  });

  test('an unknown or empty token is not a session', () => {
    assert.equal(getSession(''), null);
    assert.equal(getSession('deadbeef'), null);
  });
});

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { calculatePaycheck } from '../src/calculate.ts';
import type { PaycheckInput } from '../src/types.ts';
import { ExtrasRefusal, runPaycheckExtras, validatePaycheckExtras } from '../site/lib/extras.ts';

const input = (state: string): PaycheckInput =>
  ({
    checkDate: '2026-06-15',
    payFrequency: 'biweekly',
    earnings: [{ code: 'REG', category: 'regular', amount: 300000 }],
    deductions: [],
    federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
    ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
    workState: { code: state },
  }) as unknown as PaycheckInput;

const NO_STATE = '(none)';
const stateArg = (s: string) => (s === NO_STATE ? undefined : s);
const ok = (body: Record<string, unknown>, state = 'OH') => {
  const v = validatePaycheckExtras(body, stateArg(state));
  assert.ok(v.ok, JSON.stringify((v as { errors?: unknown }).errors));
  return v.value;
};
const errors = (body: Record<string, unknown>, state = 'OH') => {
  const v = validatePaycheckExtras(body, stateArg(state));
  assert.equal(v.ok, false);
  return (v as { errors: { path: string; message: string }[] }).errors;
};

describe('validatePaycheckExtras()', () => {
  test('a request with neither extra passes untouched', () => assert.deepEqual(ok({}), {}));

  test('a good garnishment order and minimum wage check pass', () => {
    const v = ok({
      garnishments: [{ id: 'cc-1', type: 'consumer_creditor', amountOrdered: 50000 }],
      minimumWageCheck: { hourlyRate: 1500 },
    });
    assert.equal(v.garnishments?.length, 1);
    assert.equal(v.minimumWageCheck?.hourlyRate, 1500);
  });

  test('money must be integer cents', () => {
    assert.ok(errors({ garnishments: [{ id: 'a', type: 'consumer_creditor', amountOrdered: 500.5 }] }).some((e) => e.path === 'garnishments[0].amountOrdered'));
    assert.ok(errors({ minimumWageCheck: { hourlyRate: 15.5 } }).some((e) => e.path === 'minimumWageCheck.hourlyRate'));
    assert.ok(errors({ minimumWageCheck: { hourlyRate: -1 } }).some((e) => e.path === 'minimumWageCheck.hourlyRate'));
  });

  test('a child-support order must say whether the employee supports another family; it is never assumed', () => {
    const e = errors({ garnishments: [{ id: 'cs', type: 'child_support', amountOrdered: 1000 }] });
    assert.ok(e.some((x) => x.path === 'garnishments[0].supportingOtherFamily'));
  });

  test('ids are required and unique, types are one of the three, and the list is capped', () => {
    assert.ok(errors({ garnishments: [{ type: 'consumer_creditor', amountOrdered: 1 }] }).some((e) => e.path === 'garnishments[0].id'));
    assert.ok(errors({ garnishments: [{ id: 'a', type: 'tax_levy', amountOrdered: 1 }] }).some((e) => e.path === 'garnishments[0].type'));
    const dup = errors({ garnishments: [{ id: 'a', type: 'consumer_creditor', amountOrdered: 1 }, { id: 'a', type: 'consumer_creditor', amountOrdered: 1 }] });
    assert.ok(dup.some((e) => e.path === 'garnishments[1].id'));
    assert.ok(errors({ garnishments: Array.from({ length: 26 }, (_, i) => ({ id: `o${i}`, type: 'consumer_creditor', amountOrdered: 1 })) }).some((e) => e.path === 'garnishments'));
  });

  test('both extras need a work state, since the state decides what applies', () => {
    assert.ok(errors({ garnishments: [{ id: 'a', type: 'consumer_creditor', amountOrdered: 1 }] }, NO_STATE).some((e) => e.path === 'garnishments'));
    assert.ok(errors({ minimumWageCheck: { hourlyRate: 1500 } }, NO_STATE).some((e) => e.path === 'minimumWageCheck'));
  });

  test('shape errors are field-level', () => {
    assert.ok(errors({ garnishments: 'nope' }).some((e) => e.path === 'garnishments'));
    assert.ok(errors({ minimumWageCheck: 5 }).some((e) => e.path === 'minimumWageCheck'));
    assert.ok(errors({ minimumWageCheck: { hourlyRate: 1500, occupation: 'pilot' } }).some((e) => e.path === 'minimumWageCheck.occupation'));
    assert.ok(errors({ minimumWageCheck: { hourlyRate: 1500, tipped: 'yes' } }).some((e) => e.path === 'minimumWageCheck.tipped'));
  });
});

describe('runPaycheckExtras()', () => {
  test('garnishment: support draws first, the ordinary order is capped by the shared ceiling, and net pay falls by what is withheld', () => {
    const pc = calculatePaycheck(input('OH'));
    const extras = ok({
      garnishments: [
        { id: 'cc-1', type: 'consumer_creditor', amountOrdered: 1_000_000 },
        { id: 'cs-1', type: 'child_support', amountOrdered: 50_000, supportingOtherFamily: true },
      ],
    });
    const g = runPaycheckExtras(input('OH'), pc, extras).garnishment!;
    assert.equal(g.lines[0].orderId, 'cs-1');
    assert.equal(g.lines[0].withheld, 50_000);
    assert.ok(g.totalWithheld <= g.aggregateCeiling, 'never more than the one shared ceiling');
    assert.equal(g.netPayAfterGarnishment, pc.netPay - g.totalWithheld);
    assert.ok(g.lines.every((l) => l.detail.length > 0), 'every line says why');
  });

  test('garnishment: an order is never withheld above what it demands', () => {
    const pc = calculatePaycheck(input('OH'));
    const g = runPaycheckExtras(input('OH'), pc, ok({ garnishments: [{ id: 'small', type: 'consumer_creditor', amountOrdered: 1_000 }] })).garnishment!;
    assert.equal(g.lines[0].withheld, 1_000);
  });

  test('minimum wage: Ohio is judged against its state rate', () => {
    const m = runPaycheckExtras(input('OH'), calculatePaycheck(input('OH')), ok({ minimumWageCheck: { hourlyRate: 1500 } })).minimumWage!;
    assert.equal(m.bindingLevel, 'state');
    assert.equal(m.bindingJurisdiction, 'Ohio');
    assert.equal(m.compliant, true);
    assert.equal(m.shortfallPerHour, 0);
    assert.deepEqual(m.caveats, []);
  });

  test('minimum wage: a local ordinance binds when it is the highest, and the shortfall is reported', () => {
    const wa = input('WA');
    const m = runPaycheckExtras(wa, calculatePaycheck(wa), ok({ minimumWageCheck: { hourlyRate: 1500, locality: 'seattle' } }, 'WA')).minimumWage!;
    assert.equal(m.bindingLevel, 'local');
    assert.equal(m.bindingJurisdiction, 'Seattle');
    assert.equal(m.compliant, false);
    assert.equal(m.shortfallPerHour, m.requiredHourlyRate - 1500);
    assert.deepEqual(m.considered.map((c) => c.level), ['federal', 'state', 'local']);
  });

  test('minimum wage: a locality that is not recorded is reported as a caveat, not silently treated as "no ordinance"', () => {
    const wa = input('WA');
    const m = runPaycheckExtras(wa, calculatePaycheck(wa), ok({ minimumWageCheck: { hourlyRate: 1500, locality: 'atlantis' } }, 'WA')).minimumWage!;
    assert.equal(m.caveats.length, 1);
    assert.match(m.caveats[0], /atlantis/);
  });

  test('a state this build has no minimum wage ruleset for is a refusal the caller can act on, not a crash', () => {
    const zz = input('ZZ');
    assert.throws(() => runPaycheckExtras(zz, { netPay: 0 } as never, { minimumWageCheck: { hourlyRate: 1500 } }), ExtrasRefusal);
  });
});

// ---------------------------------------------------------------------------
// End to end: a real server process, a seeded key, the real HTTP path.
// ---------------------------------------------------------------------------

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const KEY = 'sk_test_extras_e2e_key_abcdef';
const KEY_HASH = createHash('sha256').update(KEY).digest('hex');
const PORT = 5200 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}`;
let dir: string;
let child: ChildProcess;

describe('POST /v1/paycheck with garnishments and a minimum wage check (end to end)', () => {
  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'extras-e2e-'));
    mkdirSync(dir, { recursive: true });
    const future = new Date(Date.now() + 7 * 864e5).toISOString();
    writeFileSync(
      join(dir, 'db.json'),
      JSON.stringify({
        accounts: {},
        acceptances: [],
        paymentMethods: { 'x@example.com': { email: 'x@example.com', kind: 'card', processorRef: 'pm', last4: '4242', brand: 'visa', attachedAt: new Date().toISOString() } },
        subscriptions: {},
        keys: { [KEY_HASH]: { keyHash: KEY_HASH, keyPrefix: KEY.slice(0, 14), ownerEmail: 'x@example.com', ownerName: 'X', company: 'X', plan: 'evaluation', createdAt: new Date().toISOString(), expiresAt: future, isActive: true, lastUsedAt: null } },
        usage: [],
        estimates: [],
      }),
    );
    child = spawn('node', ['site/server.ts'], { cwd: REPO, env: { ...process.env, PORT: String(PORT), SITE_DB_DIR: dir }, stdio: 'ignore' });
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(`${BASE}/healthz`)).ok) return;
      } catch {
        /* not up yet */
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('server did not start');
  });
  after(() => {
    child?.kill('SIGKILL');
    rmSync(dir, { recursive: true, force: true });
  });

  const post = (body: unknown) =>
    fetch(`${BASE}/v1/paycheck`, { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  test('the same call returns the paycheck, the garnishment run and the minimum wage verdict', async () => {
    const r = await post({
      ...input('WA'),
      garnishments: [{ id: 'cc-1', type: 'consumer_creditor', amountOrdered: 40_000 }],
      minimumWageCheck: { hourlyRate: 1500, locality: 'seattle' },
    });
    assert.equal(r.status, 200);
    const j = (await r.json()) as { result: Record<string, any> };
    assert.equal(j.result.grossPay, 300000);
    assert.ok(j.result.taxes.length > 0);
    assert.equal(j.result.garnishment.lines[0].orderId, 'cc-1');
    assert.equal(j.result.garnishment.netPayAfterGarnishment, j.result.netPay - j.result.garnishment.totalWithheld);
    assert.equal(j.result.minimumWage.bindingJurisdiction, 'Seattle');
    assert.equal(j.result.minimumWage.compliant, false);
  });

  test('without the extras the response is exactly what it was before', async () => {
    const j = (await (await post(input('OH'))).json()) as { result: Record<string, unknown> };
    assert.equal('garnishment' in j.result, false);
    assert.equal('minimumWage' in j.result, false);
  });

  test('a bad order is a field-level 422 and costs nothing', async () => {
    const r = await post({ ...input('OH'), garnishments: [{ id: 'cs', type: 'child_support', amountOrdered: 1000 }] });
    assert.equal(r.status, 422);
    const j = (await r.json()) as { code: string; details: { path: string }[] };
    assert.equal(j.code, 'invalid_input');
    assert.ok(j.details.some((d) => d.path === 'garnishments[0].supportingOtherFamily'));
  });

  test('an unrecorded locality comes back as a caveat on a 200, not an error', async () => {
    const body = { ...input('OH'), minimumWageCheck: { hourlyRate: 1500, locality: 'atlantis' } };
    const r = await post(body);
    assert.equal(r.status, 200);
    const j = (await r.json()) as { result: { minimumWage: { caveats: string[] } } };
    assert.equal(j.result.minimumWage.caveats.length, 1);
  });
});

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { calculatePaycheck } from '../src/calculate.ts';
// @ts-expect-error plain JS module shared with the browser
import { CERT_KEYS, createModel, loadRequest, serialize, stepForPath, validateStep } from '../site/assets/sandbox-form.js';
// @ts-expect-error plain JS module shared with the browser
import { fieldsForState, LOCAL_FIELDS } from '../site/assets/calculator-form.js';

/**
 * The sandbox must be the engine, not a picture of it. What it sends is what
 * the API accepts, what comes back is what calculatePaycheck returns, and it
 * has a control for everything the engine reads, so a new engine input cannot
 * ship without a way to try it.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(REPO, p), 'utf8');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const freePort = () => new Promise<number>((resolve) => {
  const srv = createServer();
  srv.listen(0, '127.0.0.1', () => { const { port } = srv.address() as { port: number }; srv.close(() => resolve(port)); });
});

const form = read('site/assets/sandbox-form.js');
const page = read('site/assets/sandbox.js');
const registry = JSON.parse(read('site/assets/state-cert-fields.json')) as Record<string, Array<{ key: string }>>;
const examples = (JSON.parse(read('site/sandbox-examples.json')) as { examples: Array<{ id: string; request: Record<string, unknown> }> }).examples;

/** The property names declared by one exported interface in src/types.ts. */
function interfaceKeys(name: string): string[] {
  const types = read('src/types.ts');
  const start = types.indexOf(`export interface ${name} {`);
  assert.ok(start >= 0, name);
  let depth = 0;
  let end = start;
  for (let i = types.indexOf('{', start); i < types.length; i++) {
    if (types[i] === '{') depth++;
    if (types[i] === '}' && --depth === 0) { end = i; break; }
  }
  return [...types.slice(start, end).matchAll(/^ {2}(\w+)\??:/gm)].map((m) => m[1]!);
}

describe('the sandbox has a way to set everything the engine reads', () => {
  test('every PaycheckInput field is built by the form', () => {
    const missing = interfaceKeys('PaycheckInput').filter((k) => !new RegExp(`\\b${k}\\b`).test(form));
    assert.deepEqual(missing, []);
  });
  test('every Form W-4 field is built by the form', () => {
    assert.deepEqual(interfaceKeys('FederalW4').filter((k) => !new RegExp(`\\b${k}\\b`).test(form)), []);
  });
  test('every employee fact is built by the form', () => {
    assert.deepEqual(interfaceKeys('EmployeeContext').filter((k) => !new RegExp(`\\b${k}\\b`).test(form)), []);
  });
  test('every year-to-date field is built by the form', () => {
    assert.deepEqual(interfaceKeys('YearToDate').filter((k) => !new RegExp(`\\b${k}\\b`).test(form)), []);
  });
  test('every certificate field can be sent, and the calculator renders registry plus local geography', () => {
    const certKeys = interfaceKeys('StateCertificate');
    assert.deepEqual(certKeys.filter((k) => !CERT_KEYS.has(k)), [], 'dropped by the form before it reaches the API');
    for (const [state, fields] of Object.entries(registry)) {
      const rendered = new Set(fieldsForState(state, registry).map((f: { key: string }) => f.key));
      for (const field of fields) assert.equal(rendered.has(field.key), true, `${state}.${field.key}`);
      assert.equal(rendered.has('exempt'), true, state);
      assert.equal(rendered.has('additionalWithholding'), true, state);
    }
    const localKeys = new Set(Object.values(LOCAL_FIELDS).flat().map((f: { key: string }) => f.key));
    for (const key of ['workCity', 'residenceCity', 'workCounty', 'residenceCounty', 'county', 'workSchoolDistrict', 'residenceSchoolDistrict', 'workPSD', 'residencePSD', 'schoolDistrictCode', 'workJEDDId', 'locality', 'localities']) {
      assert.equal(localKeys.has(key), true, key);
    }
    assert.match(page, /fieldsForState/);
    assert.match(page, /\/v1\/address/);
    assert.doesNotMatch(page, /geocoding\.geo\.census\.gov|Census geocoder/);
  });
  test('nothing on the page still says a thing the engine does now is "not supported"', () => {
    assert.doesNotMatch(page, /Pre-2020 forms with allowances aren't supported/);
    assert.doesNotMatch(page, /pre-2020 W-4 allowances, tips/);
    assert.doesNotMatch(page, /Aurora\./);
  });
});

describe('the new inputs round-trip through the form', () => {
  const base = examples[0]!.request;
  const req = (o: Record<string, unknown>) => ({ ...base, ...o });

  test('a 2019-or-earlier W-4 and an age load and serialize unchanged', () => {
    const request = req({
      federalW4: { filingStatus: 'married_joint', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 1000, legacyAllowances: 3 },
      employee: { ageAtYearEnd: 61 },
    });
    const model = loadRequest(createModel(), request);
    assert.equal(model.legacyW4, true);
    assert.equal(model.legacyAllowances, '3');
    assert.equal(model.ageAtYearEnd, '61');
    const out = serialize(model);
    assert.equal(out.federalW4.legacyAllowances, 3);
    assert.equal(out.federalW4.extraWithholding, 1000);
    assert.deepEqual(out.employee, { ageAtYearEnd: 61 });
  });

  test('turning the old form on drops what it cannot carry, so the engine does not refuse it', () => {
    const model = loadRequest(createModel(), req({ federalW4: { filingStatus: 'single', multipleJobs: true, dependentCredit: 400000, otherIncome: 100000, deductions: 100000, extraWithholding: 0 } }));
    model.legacyW4 = true;
    model.legacyAllowances = '2';
    const out = serialize(model);
    assert.equal(out.federalW4.multipleJobs, false);
    assert.equal(out.federalW4.dependentCredit, 0);
    assert.equal(out.federalW4.otherIncome, 0);
    assert.equal(out.federalW4.deductions, 0);
    calculatePaycheck(out); // would throw if the engine rejected the mix
  });

  test('the form refuses what the engine refuses, on the right step', () => {
    const model = loadRequest(createModel(), req({ federalW4: { filingStatus: 'head_of_household', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0, legacyAllowances: 1 } }));
    assert.ok(validateStep(model, 3, { supportedYears: [2025, 2026, 2027] }).some((e: { path: string }) => e.path === 'federalW4.filingStatus'));
    model.filingStatus = 'single';
    model.legacyAllowances = '1.5';
    assert.ok(validateStep(model, 3, { supportedYears: [2025, 2026, 2027] }).some((e: { path: string }) => e.path === 'federalW4.legacyAllowances'));
    model.ageAtYearEnd = '150';
    assert.ok(validateStep(model, 6, { supportedYears: [2025, 2026, 2027] }).some((e: { path: string }) => e.path === 'employee.ageAtYearEnd'));
    assert.equal(stepForPath('employee.ageAtYearEnd'), 6);
    assert.equal(stepForPath('federalW4.legacyAllowances'), 3);
  });

  test('an age changes the answer the way the engine says it should', () => {
    const request = req({ deductions: [{ code: '401K', category: 'deferral_401k', amount: 300000 }], ytd: { socialSecurity: 0, medicare: 0, futa: 0, electiveDeferrals: { section402gAggregate: 2300000 } } });
    const young = calculatePaycheck(serialize(loadRequest(createModel(), request)));
    const older = calculatePaycheck(serialize(loadRequest(createModel(), { ...request, employee: { ageAtYearEnd: 55 } })));
    assert.equal(young.pretaxDeductions, 150000);
    assert.equal(older.pretaxDeductions, 300000);
  });
});

describe('what the API returns is what the engine returns', () => {
  let dir = '';
  let child: ChildProcess;
  let base = '';
  const KEY = 'sk_live_' + randomBytes(18).toString('base64url');

  before(async () => {
    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    dir = mkdtempSync(join(tmpdir(), 'sandbox-fidelity-'));
    const now = new Date().toISOString();
    const email = 'fidelity@sandbox.test';
    writeFileSync(join(dir, 'db.json'), JSON.stringify({
      accounts: { [email]: { name: 'F', email, company: 'F', phone: '', code: null, codeExpiresAt: null, codeRequestedAt: null, emailVerifiedAt: now, sessionToken: null, sessionExpiresAt: null, stage: 'trialing', createdAt: now } },
      scenarios: {}, acceptances: [], paymentMethods: { [email]: { email, kind: 'card', processorRef: 'pm_1', last4: '4242', brand: 'visa', attachedAt: now } },
      subscriptions: { [email]: { email, legalName: 'F', billingContact: 'F', billingEmail: email, address: 'x', expectedEmployees: 1, payFrequency: 'biweekly', rooftop: false, estimatedAnnual: 0, status: 'trialing', trialStartsAt: now, trialEndsAt: new Date(Date.now() + 864e6).toISOString(), termMonths: 12, termEndsAt: new Date(Date.now() + 2e10).toISOString(), createdAt: now, activatedAt: now, stripeCustomerId: null, stripeSubscriptionId: null, suspended: false, suspendedReason: null } },
      keys: { [sha(KEY)]: { keyHash: sha(KEY), keyPrefix: KEY.slice(0, 14), ownerEmail: email, ownerName: 'F', company: 'F', plan: 'trial', createdAt: now, expiresAt: '2099-01-01T00:00:00.000Z', isActive: true, lastUsedAt: null, totalCalls: 0 } },
      usage: [], estimates: [], termsQuotes: {}, meterQueue: [], rateLimits: {}, processedStripeEvents: [],
    }));
    child = spawn('node', ['site/server.ts'], { cwd: REPO, env: { ...process.env, PORT: String(port), SITE_DB_DIR: dir, STRIPE_SECRET_KEY: '', RESEND_API_KEY: '', RATE_LIMIT_PER_MIN: '10000' }, stdio: 'ignore' });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`${base}/healthz`)).ok) return; } catch { /* not up */ }
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error('server did not start');
  });
  after(() => { child?.kill('SIGKILL'); if (dir) rmSync(dir, { recursive: true, force: true }); });

  const run = async (request: unknown) => {
    const r = await fetch(`${base}/v1/paycheck`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` }, body: JSON.stringify(request) });
    return { status: r.status, body: await r.json() as Record<string, unknown> };
  };
  /** The API adds only request bookkeeping to the engine's result. */
  const engineFields = (body: Record<string, unknown>) => {
    const { requestId, ...rest } = body as { requestId?: unknown };
    void requestId;
    return JSON.parse(JSON.stringify(rest));
  };

  for (const ex of examples) {
    test(`example ${ex.id}: what the form sends gives the engine's own answer`, async () => {
      const sent = serialize(loadRequest(createModel(), ex.request));
      const { status, body } = await run(sent);
      assert.equal(status, 200, JSON.stringify(body).slice(0, 300));
      const direct = JSON.parse(JSON.stringify(calculatePaycheck(sent)));
      const got = engineFields((body.result ?? body) as Record<string, unknown>);
      for (const k of ['grossPay', 'pretaxDeductions', 'posttaxDeductions', 'employeeTaxTotal', 'employerTaxTotal', 'netPay', 'taxes']) {
        assert.deepEqual(got[k], direct[k], k);
      }
    });
  }

  test('a 2019-or-earlier W-4 with an age matches the engine through the API', async () => {
    const request = {
      ...examples[0]!.request,
      federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0, legacyAllowances: 2 },
      employee: { ageAtYearEnd: 52 },
      deductions: [{ code: '401K', category: 'deferral_401k', amount: 300000 }],
      ytd: { socialSecurity: 0, medicare: 0, futa: 0, electiveDeferrals: { section402gAggregate: 2400000 } },
    };
    const { status, body } = await run(request);
    assert.equal(status, 200);
    const direct = JSON.parse(JSON.stringify(calculatePaycheck(request as never)));
    const got = engineFields((body.result ?? body) as Record<string, unknown>);
    assert.deepEqual(got.taxes, direct.taxes);
    assert.equal(got.pretaxDeductions, 300000, 'the catch-up limit applied');
    assert.match(String((got.taxes as Array<{ detail: string }>).find((t) => (t as { id: string }).id === 'US_FIT')?.detail), /pre-2020 Form W-4/);
  });
});

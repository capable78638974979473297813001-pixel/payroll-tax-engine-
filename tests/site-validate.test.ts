import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validatePaycheckInput } from '../site/lib/validate.ts';

const good = () => ({
  checkDate: '2026-06-15',
  payFrequency: 'biweekly',
  earnings: [{ code: 'REG', category: 'regular', amount: 300000 }],
  deductions: [{ code: '401K', category: 'deferral_401k', amount: 24000 }],
  federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
  ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
  workState: { code: 'OH' },
});

const pathsOf = (r: ReturnType<typeof validatePaycheckInput>) => (r.ok ? [] : r.errors.map((e) => e.path));

describe('validatePaycheckInput', () => {
  test('accepts a well-formed request and passes the value through', () => {
    const r = validatePaycheckInput(good());
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.checkDate, '2026-06-15');
  });

  test('a non-object body is rejected outright', () => {
    for (const bad of [null, 42, 'x', [], undefined]) {
      const r = validatePaycheckInput(bad);
      assert.equal(r.ok, false);
    }
  });

  test('names every missing required field', () => {
    const r = validatePaycheckInput({});
    assert.equal(r.ok, false);
    const p = pathsOf(r);
    for (const f of ['checkDate', 'payFrequency', 'earnings', 'deductions', 'federalW4', 'ytd']) {
      assert.ok(p.includes(f), `expected an error for ${f}`);
    }
  });

  test('rejects dollars-as-floats with a cents-shaped message', () => {
    const body = good();
    body.earnings[0].amount = 3000.5 as never; // dollars mistake
    const r = validatePaycheckInput(body);
    assert.equal(r.ok, false);
    const e = (r as { ok: false; errors: { path: string; message: string }[] }).errors.find((x) => x.path === 'earnings[0].amount');
    assert.ok(e);
    assert.match(e!.message, /integer cents/);
  });

  test('rejects negative amounts', () => {
    const body = good();
    body.earnings[0].amount = -100 as never;
    assert.deepEqual(pathsOf(validatePaycheckInput(body)), ['earnings[0].amount']);
  });

  test('rejects an unknown pay frequency and bad enums', () => {
    const body = good();
    (body as { payFrequency: string }).payFrequency = 'fortnightly';
    (body.federalW4 as { filingStatus: string }).filingStatus = 'complicated';
    (body.earnings[0] as { category: string }).category = 'overtime';
    const p = pathsOf(validatePaycheckInput(body));
    assert.ok(p.includes('payFrequency'));
    assert.ok(p.includes('federalW4.filingStatus'));
    assert.ok(p.includes('earnings[0].category'));
  });

  test('requires at least one earning', () => {
    const body = good();
    body.earnings = [];
    assert.deepEqual(pathsOf(validatePaycheckInput(body)), ['earnings']);
  });

  test('allows an empty deductions array and a null (post-tax) category', () => {
    const body = good();
    body.deductions = [{ code: 'GARN', category: null as never, amount: 10000 }];
    assert.equal(validatePaycheckInput(body).ok, true);
    body.deductions = [];
    assert.equal(validatePaycheckInput(body).ok, true);
  });

  test('rejects a malformed calendar date', () => {
    const body = good();
    body.checkDate = '2026-13-40';
    assert.deepEqual(pathsOf(validatePaycheckInput(body)), ['checkDate']);
  });

  test('validates a state code against the allowed set when provided', () => {
    const body = good();
    body.workState = { code: 'ZZ' };
    const r = validatePaycheckInput(body, { validStateCodes: new Set(['OH', 'PA']) });
    assert.equal(r.ok, false);
    assert.match((r as { ok: false; errors: { message: string }[] }).errors[0].message, /not a state this API can compute/);

    body.workState = { code: 'OH' };
    assert.equal(validatePaycheckInput(body, { validStateCodes: new Set(['OH', 'PA']) }).ok, true);
  });

  test('validates optional employer SUI rates', () => {
    const body = good() as Record<string, unknown>;
    body.employer = { stateUnemploymentRate: { OH: 'high' } };
    assert.deepEqual(pathsOf(validatePaycheckInput(body)), ['employer.stateUnemploymentRate.OH']);
    body.employer = { stateUnemploymentRate: { OH: 0.031 } };
    assert.equal(validatePaycheckInput(body).ok, true);
  });

  test('collects multiple errors at once rather than failing on the first', () => {
    const r = validatePaycheckInput({ checkDate: 'nope', payFrequency: 'nope', earnings: 'nope', deductions: 'nope', federalW4: 1, ytd: 2 });
    assert.equal(r.ok, false);
    assert.ok((r as { ok: false; errors: unknown[] }).errors.length >= 6);
  });
});

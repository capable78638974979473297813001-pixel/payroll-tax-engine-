import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { calculatePaycheck } from '../src/calculate.ts';
import { openApiDocument, paycheckRequestExamples, paycheckRequestSchema, unknownFieldWarnings } from '../site/lib/api-spec.ts';
import {
  EARNING_CATEGORIES, EMPLOYMENT_CATEGORIES, FILING_STATUSES, PAY_FREQUENCIES, PRETAX_CATEGORIES, validatePaycheckInput,
} from '../site/lib/validate.ts';
import { validatePaycheckExtras } from '../site/lib/extras.ts';
import { PERIODS_PER_YEAR } from '../src/types.ts';

/**
 * The published contract (JSON Schema + OpenAPI) against the code that enforces it.
 */

const props = paycheckRequestSchema.properties as Record<string, any>;

describe('the schema and the validator agree', () => {
  test('every enum is the validator’s own list', () => {
    assert.deepEqual(props.payFrequency.enum, PAY_FREQUENCIES);
    assert.deepEqual(props.earnings.items.properties.category.enum, EARNING_CATEGORIES);
    assert.deepEqual(props.deductions.items.properties.category.oneOf[0].enum, PRETAX_CATEGORIES);
    assert.deepEqual(props.federalW4.properties.filingStatus.enum, FILING_STATUSES);
    assert.deepEqual(props.employmentCategory.enum, EMPLOYMENT_CATEGORIES);
  });

  test('the pay frequencies are all the engine’s (the docs once listed four of eight)', () => {
    assert.deepEqual([...PAY_FREQUENCIES].sort(), Object.keys(PERIODS_PER_YEAR).sort());
  });

  test('each required top-level field is one the validator refuses to do without', () => {
    const example = structuredClone(paycheckRequestExamples.salariedOhio.value);
    for (const field of paycheckRequestSchema.required) {
      const body = structuredClone(example);
      delete body[field];
      const r = validatePaycheckInput(body);
      assert.equal(r.ok, false, `${field} is listed as required but a request without it validates`);
      if (!r.ok) assert.ok(r.errors.some((e) => e.path === field || e.path.startsWith(field)), field);
    }
  });

  test('each required W-4 and year-to-date field is required by the validator too', () => {
    for (const [section, fields] of [['federalW4', props.federalW4.required], ['ytd', props.ytd.required]] as const) {
      for (const f of fields as string[]) {
        const body = structuredClone(paycheckRequestExamples.salariedOhio.value) as any;
        delete body[section][f];
        const r = validatePaycheckInput(body);
        assert.equal(r.ok, false, `${section}.${f}`);
      }
    }
  });

  test('money fields are integer cents in the schema and floats are refused by the validator', () => {
    assert.equal(props.earnings.items.properties.amount.type, 'integer');
    const body = structuredClone(paycheckRequestExamples.salariedOhio.value) as any;
    body.earnings[0].amount = 3000.5;
    const r = validatePaycheckInput(body);
    assert.equal(r.ok, false);
  });
});

describe('every published example is a request the API accepts and the engine computes', () => {
  for (const [name, ex] of Object.entries(paycheckRequestExamples)) {
    test(name, () => {
      const v = validatePaycheckInput(ex.value);
      assert.ok(v.ok, v.ok ? '' : JSON.stringify(v.errors));
      const extras = validatePaycheckExtras(ex.value, (ex.value.workState as any)?.code);
      assert.ok(extras.ok, extras.ok ? '' : JSON.stringify(extras.errors));
      const r = calculatePaycheck(v.value);
      assert.ok(r.taxes.length > 0);
      assert.equal(r.netPay, r.grossPay - r.pretaxDeductions - r.posttaxDeductions - r.employeeTaxTotal);
    });
  }
});

describe('the OpenAPI document', () => {
  const doc = openApiDocument('1.2.3') as any;

  test('is OpenAPI 3.1 with the version it was given and a bearer scheme', () => {
    assert.equal(doc.openapi, '3.1.0');
    assert.equal(doc.info.version, '1.2.3');
    assert.equal(doc.components.securitySchemes.bearerAuth.scheme, 'bearer');
  });

  test('every $ref resolves', () => {
    const refs: string[] = [];
    const walk = (n: unknown) => {
      if (Array.isArray(n)) n.forEach(walk);
      else if (n && typeof n === 'object') {
        for (const [k, v] of Object.entries(n)) {
          if (k === '$ref' && typeof v === 'string') refs.push(v);
          else walk(v);
        }
      }
    };
    walk(doc);
    assert.ok(refs.length >= 5);
    for (const ref of refs) {
      const target = ref.replace(/^#\//, '').split('/').reduce((n: any, k) => n?.[k], doc);
      assert.ok(target, `${ref} does not resolve`);
    }
  });

  test('the paycheck operation documents the statuses the server returns', () => {
    const codes = Object.keys(doc.paths['/v1/paycheck'].post.responses);
    for (const c of ['200', '400', '401', '402', '422', '429']) assert.ok(codes.includes(c), c);
  });

  test('every example in the document is the same object the tests above validated', () => {
    const shown = doc.paths['/v1/paycheck'].post.requestBody.content['application/json'].examples;
    assert.deepEqual(Object.keys(shown), Object.keys(paycheckRequestExamples));
  });

  test('is plain JSON (round-trips without loss)', () => {
    assert.deepEqual(JSON.parse(JSON.stringify(doc)), doc);
  });
});

describe('unknownFieldWarnings', () => {
  test('a misspelled optional field is named with the field it was probably meant to be', () => {
    const w = unknownFieldWarnings({ ...paycheckRequestExamples.salariedOhio.value, roundToWholeDollar: true });
    assert.equal(w.length, 1);
    assert.match(w[0], /"roundToWholeDollar" was ignored\. Did you mean "roundToWholeDollars"\?/);
  });

  test('a field that is nothing like any real one points to the schema instead of guessing', () => {
    const w = unknownFieldWarnings({ ...paycheckRequestExamples.salariedOhio.value, zzzzzzzz: 1 });
    assert.match(w[0], /schemas\/paycheck-request\.json/);
    assert.doesNotMatch(w[0], /Did you mean/);
  });

  test('a clean request has no warnings, and every documented field counts as known', () => {
    for (const ex of Object.values(paycheckRequestExamples)) assert.deepEqual(unknownFieldWarnings(ex.value), []);
  });
});

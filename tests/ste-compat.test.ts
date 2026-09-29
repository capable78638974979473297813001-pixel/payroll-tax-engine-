import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { calculatePaycheck } from '../src/calculate.ts';
import {
  FEDERAL_UNIQUE_TAX_ID,
  listUniqueTaxIds,
  payCalc,
  resolveUniqueTaxId,
  unpinnedUniqueTaxIds,
} from '../api/ste-compat.ts';

const CHECK_DATE = '2026-08-15';

describe('STE-shaped compatibility layer (api/ste-compat.ts)', () => {
  describe('the uniqueTaxId catalog', () => {
    test('issues one state-level id per modelled state, in the XX-000-0001 shape', () => {
      const entries = listUniqueTaxIds(CHECK_DATE);
      const ohState = entries.find((e) => e.state === 'OH' && e.type === 'state');
      assert.ok(ohState, 'expected an OH state-level entry');
      assert.equal(ohState!.uniqueTaxId, '39-000-0001');
      assert.equal(ohState!.locationCode, ohState!.uniqueTaxId);
    });

    test('covers thousands of real local jurisdictions, not just states', () => {
      const entries = listUniqueTaxIds(CHECK_DATE);
      // 51 states/DC + Indiana counties + Michigan cities + Ohio
      // municipalities/school districts/JEDDs + Alabama municipalities +
      // Kentucky jurisdictions + Pennsylvania's ~2,627 PSDs + the fixed
      // named-locality list — comfortably in the thousands.
      assert.ok(entries.length > 3000, `expected >3000 catalog entries, got ${entries.length}`);
    });

    test('reuses Pennsylvania\'s own published PSD code as its location code, not a generated sequence', () => {
      const entries = listUniqueTaxIds(CHECK_DATE);
      const somePA = entries.find((e) => e.state === 'PA' && e.type === 'psd');
      assert.ok(somePA, 'expected at least one PA PSD entry');
      assert.match(somePA!.uniqueTaxId, /^42-PSD-\d{6}$/);
    });

    test('resolveUniqueTaxId round-trips a listed id, and returns undefined for an unknown one', () => {
      const entries = listUniqueTaxIds(CHECK_DATE);
      const first = entries[0];
      assert.deepEqual(resolveUniqueTaxId(first.uniqueTaxId, CHECK_DATE), first);
      assert.equal(resolveUniqueTaxId('99-999-9999', CHECK_DATE), undefined);
    });
  });

  describe('uniqueTaxId stability (api/ste-id-pins.json)', () => {
    test('every catalog entry is pinned -- append new jurisdictions to the pin file', () => {
      assert.deepEqual(unpinnedUniqueTaxIds(CHECK_DATE), []);
    });

    test('a town added after launch does not renumber the ones after it', () => {
      // Beaverton (added 2026-09-28) sorts between Bear Creek and Bessemer;
      // Bessemer keeps the id it launched with.
      assert.equal(resolveUniqueTaxId('01-200-0004', CHECK_DATE)?.name, 'Bessemer');
      assert.equal(resolveUniqueTaxId('01-200-0026', CHECK_DATE)?.name, 'Beaverton');
      assert.equal(resolveUniqueTaxId('01-100-0001', CHECK_DATE)?.value, 'Macon');
    });

    test('non-PSD ids are unique', () => {
      // (A PA borough split across two counties is listed once per county
      // under its one PSD code; both entries set the same workPSD.)
      const ids = listUniqueTaxIds(CHECK_DATE).filter((e) => e.type !== 'psd').map((e) => e.uniqueTaxId);
      assert.equal(new Set(ids).size, ids.length);
    });
  });

  describe('payCalc()', () => {
    test('a plain Ohio employee matches the equivalent direct calculatePaycheck() call', () => {
      const entries = listUniqueTaxIds(CHECK_DATE);
      const ohState = entries.find((e) => e.state === 'OH' && e.type === 'state')!;

      const [result] = payCalc([
        {
          checkDate: CHECK_DATE,
          frequency: 'biweekly',
          grossPay: 3000,
          workUniqueTaxIds: [ohState.uniqueTaxId],
        },
      ]);

      const direct = calculatePaycheck({
        checkDate: CHECK_DATE,
        payFrequency: 'biweekly',
        earnings: [{ code: 'REG', category: 'regular', amount: 300_000 }],
        deductions: [],
        federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
        ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
        workState: { code: 'OH', certificate: {} },
      });

      assert.equal(result.error, undefined);
      assert.equal(result.netPay, direct.netPay / 100);
      assert.equal(result.employeeTaxTotal, direct.employeeTaxTotal / 100);
      assert.equal(result.taxJurisdictionParms.length, direct.taxes.length);
    });

    test('a work-locality id (Columbus) produces the same city tax as the native certificate.workCity field', () => {
      const entries = listUniqueTaxIds(CHECK_DATE);
      const ohState = entries.find((e) => e.state === 'OH' && e.type === 'state')!;
      const columbus = entries.find((e) => e.state === 'OH' && e.type === 'city' && e.name === 'Columbus')!;
      assert.ok(columbus, 'expected a Columbus catalog entry');

      const [result] = payCalc([
        {
          checkDate: CHECK_DATE,
          frequency: 'biweekly',
          grossPay: 3000,
          workUniqueTaxIds: [ohState.uniqueTaxId, columbus.uniqueTaxId],
        },
      ]);

      const direct = calculatePaycheck({
        checkDate: CHECK_DATE,
        payFrequency: 'biweekly',
        earnings: [{ code: 'REG', category: 'regular', amount: 300_000 }],
        deductions: [],
        federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
        ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
        workState: { code: 'OH', certificate: { workCity: 'Columbus' } },
      });

      assert.equal(result.netPay, direct.netPay / 100);
      const municipal = direct.taxes.find((l) => l.jurisdiction === 'local');
      assert.ok(municipal, 'expected a local tax line from the direct call');
      const municipalOut = result.taxJurisdictionParms.find((l) => l.description === municipal!.name);
      assert.ok(municipalOut, 'expected the same local tax line back from payCalc()');
      assert.equal(municipalOut!.amount, municipal!.amount / 100);
    });

    test('federal lines carry the well-known 00-000-0000 id', () => {
      const entries = listUniqueTaxIds(CHECK_DATE);
      const ohState = entries.find((e) => e.state === 'OH' && e.type === 'state')!;
      const [result] = payCalc([
        { checkDate: CHECK_DATE, frequency: 'biweekly', grossPay: 3000, workUniqueTaxIds: [ohState.uniqueTaxId] },
      ]);
      const federalLine = result.taxJurisdictionParms.find((l) => l.description === 'Federal Income Tax');
      assert.equal(federalLine?.uniqueTaxId, FEDERAL_UNIQUE_TAX_ID);
    });

    test('an unresolvable uniqueTaxId comes back as a structured error on that one batch item, not a thrown exception', () => {
      const results = payCalc([
        { checkDate: CHECK_DATE, frequency: 'biweekly', grossPay: 3000, workUniqueTaxIds: ['99-999-9999'] },
      ]);
      assert.equal(results.length, 1);
      assert.match(results[0].error ?? '', /Unrecognized uniqueTaxId/);
    });

    test('a request with no state-level id at all is a structured error, not a silent no-tax result', () => {
      const results = payCalc([
        { checkDate: CHECK_DATE, frequency: 'biweekly', grossPay: 3000, workUniqueTaxIds: [] },
      ]);
      assert.match(results[0].error ?? '', /no work state could be resolved/);
    });

    test('conflicting state or local ids are rejected instead of last-one-wins', () => {
      const entries = listUniqueTaxIds(CHECK_DATE);
      const oh = entries.find((e) => e.state === 'OH' && e.type === 'state')!;
      const pa = entries.find((e) => e.state === 'PA' && e.type === 'state')!;
      const twoStates = payCalc([{ checkDate: CHECK_DATE, frequency: 'biweekly', grossPay: 3000, workUniqueTaxIds: [oh.uniqueTaxId, pa.uniqueTaxId] }]);
      assert.match(twoStates[0].error ?? '', /two states|conflicting ids/);
      assert.equal(twoStates[0].taxJurisdictionParms.length, 0);

      // Two different locals that write the same certificate field.
      const byField = new Map<string, typeof entries>();
      for (const e of entries.filter((x) => x.state === 'OH' && x.type !== 'state' && x.role !== 'residence')) {
        byField.set(String(e.field), [...(byField.get(String(e.field)) ?? []), e]);
      }
      const clash = [...byField.values()].find((list) => new Set(list.map((e) => String(e.value))).size > 1)!;
      assert.ok(clash, 'expected two OH locals sharing a field');
      const a = clash[0];
      const b = clash.find((e) => String(e.value) !== String(a.value))!;
      const twoCities = payCalc([{ checkDate: CHECK_DATE, frequency: 'biweekly', grossPay: 3000, workUniqueTaxIds: [oh.uniqueTaxId, a.uniqueTaxId, b.uniqueTaxId] }]);
      assert.match(twoCities[0].error ?? '', /conflicting ids/);

      // A local from another state can't ride along with this state.
      const paLocal = entries.find((e) => e.state === 'PA' && e.type !== 'state' && e.role !== 'residence')!;
      const mixed = payCalc([{ checkDate: CHECK_DATE, frequency: 'biweekly', grossPay: 3000, workUniqueTaxIds: [oh.uniqueTaxId, paLocal.uniqueTaxId] }]);
      assert.match(mixed[0].error ?? '', /two states/);

      // Repeating the very same id is harmless.
      const dup = payCalc([{ checkDate: CHECK_DATE, frequency: 'biweekly', grossPay: 3000, workUniqueTaxIds: [oh.uniqueTaxId, oh.uniqueTaxId] }]);
      assert.equal(dup[0].error, undefined);
    });

    test('one bad request in a batch does not fail the others', () => {
      const entries = listUniqueTaxIds(CHECK_DATE);
      const ohState = entries.find((e) => e.state === 'OH' && e.type === 'state')!;
      const results = payCalc([
        { checkDate: CHECK_DATE, frequency: 'biweekly', grossPay: 3000, workUniqueTaxIds: ['bogus'] },
        { checkDate: CHECK_DATE, frequency: 'biweekly', grossPay: 3000, workUniqueTaxIds: [ohState.uniqueTaxId] },
      ]);
      assert.ok(results[0].error);
      assert.equal(results[1].error, undefined);
    });

    test('accepts STE\'s hyphenated "Semi-Monthly"-style frequency spelling', () => {
      const entries = listUniqueTaxIds(CHECK_DATE);
      const txState = entries.find((e) => e.state === 'TX' && e.type === 'state')!;
      const results = payCalc([
        { checkDate: CHECK_DATE, frequency: 'Semi-Monthly', grossPay: 2000, workUniqueTaxIds: [txState.uniqueTaxId] },
      ]);
      assert.equal(results[0].error, undefined);
    });

    test('rejects an unrecognized frequency with a structured error', () => {
      const entries = listUniqueTaxIds(CHECK_DATE);
      const txState = entries.find((e) => e.state === 'TX' && e.type === 'state')!;
      const results = payCalc([
        { checkDate: CHECK_DATE, frequency: 'fortnightly', grossPay: 2000, workUniqueTaxIds: [txState.uniqueTaxId] },
      ]);
      assert.match(results[0].error ?? '', /Unrecognized Frequency/);
    });
  });
});

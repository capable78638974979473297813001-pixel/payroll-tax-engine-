import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { calculatePaycheck } from '../src/calculate.ts';
import {
  FEDERAL_UNIQUE_TAX_ID,
  listUniqueTaxIds,
  payCalc,
  resolveUniqueTaxId,
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

    test('a single work city is stamped with that city id, not the state id', () => {
      const entries = listUniqueTaxIds(CHECK_DATE);
      const ohState = entries.find((e) => e.state === 'OH' && e.type === 'state')!;
      const columbus = entries.find((e) => e.state === 'OH' && e.type === 'city' && e.name === 'Columbus')!;
      const [result] = payCalc([
        { checkDate: CHECK_DATE, frequency: 'biweekly', grossPay: 3000, workUniqueTaxIds: [ohState.uniqueTaxId, columbus.uniqueTaxId] },
      ]);
      const local = result.taxJurisdictionParms.find((l) => l.description === 'Ohio Municipal Income Tax');
      assert.equal(local?.uniqueTaxId, columbus.uniqueTaxId);
      const stateLine = result.taxJurisdictionParms.find((l) => l.description.includes('Ohio') && l.description.includes('Income Tax') && l.uniqueTaxId === ohState.uniqueTaxId);
      assert.ok(stateLine);
    });

    test('a live city id is the residence city, and two cities leave the blended line unlabeled', () => {
      const entries = listUniqueTaxIds(CHECK_DATE);
      const ohState = entries.find((e) => e.state === 'OH' && e.type === 'state')!;
      const columbus = entries.find((e) => e.state === 'OH' && e.type === 'city' && e.name === 'Columbus')!;
      const cleveland = entries.find((e) => e.state === 'OH' && e.type === 'city' && e.name === 'Cleveland')!;
      assert.ok(cleveland);

      const [liveOnly] = payCalc([
        { checkDate: CHECK_DATE, frequency: 'biweekly', grossPay: 3000, workUniqueTaxIds: [ohState.uniqueTaxId], liveUniqueTaxIds: [cleveland.uniqueTaxId] },
      ]);
      const direct = calculatePaycheck({
        checkDate: CHECK_DATE,
        payFrequency: 'biweekly',
        earnings: [{ code: 'REG', category: 'regular', amount: 300_000 }],
        deductions: [],
        federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
        ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
        workState: { code: 'OH', certificate: { residenceCity: 'Cleveland' } },
      });
      assert.equal(liveOnly.netPay, direct.netPay / 100);
      const liveLocal = liveOnly.taxJurisdictionParms.find((l) => l.description === 'Ohio Municipal Income Tax');
      assert.equal(liveLocal?.uniqueTaxId, cleveland.uniqueTaxId);

      const [both] = payCalc([
        {
          checkDate: CHECK_DATE,
          frequency: 'biweekly',
          grossPay: 3000,
          workUniqueTaxIds: [ohState.uniqueTaxId, columbus.uniqueTaxId],
          liveUniqueTaxIds: [cleveland.uniqueTaxId],
        },
      ]);
      const blended = both.taxJurisdictionParms.find((l) => l.description === 'Ohio Municipal Income Tax');
      assert.equal(blended?.uniqueTaxId, null);
      assert.ok((blended?.amount ?? 0) > 0);
    });

    test('a live Pennsylvania PSD becomes residencePSD and the work PSD labels the LST line', () => {
      const entries = listUniqueTaxIds(CHECK_DATE);
      const paState = entries.find((e) => e.state === 'PA' && e.type === 'state')!;
      const work = entries.find((e) => e.uniqueTaxId === '42-PSD-010201')!;
      const home = entries.find((e) => e.uniqueTaxId === '42-PSD-530301')!;
      assert.ok(work && home);

      const [result] = payCalc([
        {
          checkDate: CHECK_DATE,
          frequency: 'biweekly',
          grossPay: 2800,
          workUniqueTaxIds: [paState.uniqueTaxId, work.uniqueTaxId],
          liveUniqueTaxIds: [home.uniqueTaxId],
        },
      ]);
      const direct = calculatePaycheck({
        checkDate: CHECK_DATE,
        payFrequency: 'biweekly',
        earnings: [{ code: 'REG', category: 'regular', amount: 280_000 }],
        deductions: [],
        federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
        ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
        workState: { code: 'PA', certificate: { workPSD: work.value as string, residencePSD: home.value as string } },
      });
      assert.equal(result.error, undefined);
      assert.equal(result.netPay, direct.netPay / 100);
      const lst = result.taxJurisdictionParms.find((l) => l.description === 'PA Local Services Tax');
      assert.equal(lst?.uniqueTaxId, work.uniqueTaxId);
      const eit = result.taxJurisdictionParms.find((l) => l.description === 'PA Local Earned Income Tax');
      assert.equal(eit?.uniqueTaxId, null);
    });

    test('a live Maryland county id is what the combined state tax withholds', () => {
      const entries = listUniqueTaxIds(CHECK_DATE);
      const mdState = entries.find((e) => e.state === 'MD' && e.type === 'state')!;
      const county = entries.find((e) => e.state === 'MD' && e.type === 'county')!;
      const [result] = payCalc([
        { checkDate: CHECK_DATE, frequency: 'biweekly', grossPay: 3000, workUniqueTaxIds: [mdState.uniqueTaxId], liveUniqueTaxIds: [county.uniqueTaxId] },
      ]);
      const direct = calculatePaycheck({
        checkDate: CHECK_DATE,
        payFrequency: 'biweekly',
        earnings: [{ code: 'REG', category: 'regular', amount: 300_000 }],
        deductions: [],
        federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
        ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
        workState: { code: 'MD', certificate: { county: county.value as string } },
      });
      assert.equal(result.netPay, direct.netPay / 100);
    });

    test('isExempt and additionalWH on the state id change the state line', () => {
      const entries = listUniqueTaxIds(CHECK_DATE);
      const ohState = entries.find((e) => e.state === 'OH' && e.type === 'state')!;

      const [exempt] = payCalc([
        {
          checkDate: CHECK_DATE,
          frequency: 'biweekly',
          grossPay: 3000,
          workUniqueTaxIds: [ohState.uniqueTaxId],
          taxJurisdictionParms: [{ uniqueTaxId: ohState.uniqueTaxId, isExempt: true }],
        },
      ]);
      const stateLine = exempt.taxJurisdictionParms.find((l) => l.uniqueTaxId === ohState.uniqueTaxId && l.payer === 'employee' && /income tax/i.test(l.description));
      assert.equal(stateLine?.amount, 0);

      const [ohioExtra] = payCalc([
        {
          checkDate: CHECK_DATE,
          frequency: 'biweekly',
          grossPay: 3000,
          workUniqueTaxIds: [ohState.uniqueTaxId],
          taxJurisdictionParms: [{ uniqueTaxId: ohState.uniqueTaxId, additionalWH: 10 }],
        },
      ]);
      const direct = calculatePaycheck({
        checkDate: CHECK_DATE,
        payFrequency: 'biweekly',
        earnings: [{ code: 'REG', category: 'regular', amount: 300_000 }],
        deductions: [],
        federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
        ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
        workState: { code: 'OH', certificate: { additionalWithholding: 1000 } },
      });
      assert.equal(ohioExtra.netPay, direct.netPay / 100);
    });
  });
});

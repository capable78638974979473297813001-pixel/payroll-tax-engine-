import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { calculatePaycheck } from '../src/calculate.ts';
import { federalSupplementalTax } from '../src/taxes/federal.ts';
import { calculateGarnishments } from '../src/garnishment.ts';
import { minimumWage } from '../src/minimum-wage.ts';
import { dollars, roundDownToCent, toWholeDollars } from '../src/money.ts';
import { federalRuleset } from '../src/registry.ts';
import { resolveJurisdiction, toCertificateFields } from '../geocode/resolve.ts';
import { listUniqueTaxIds, payCalc } from '../api/ste-compat.ts';
import type { PaycheckInput, PaycheckResult } from '../src/types.ts';

function input(overrides: Partial<PaycheckInput> = {}): PaycheckInput {
  return {
    checkDate: '2026-06-15',
    payFrequency: 'biweekly',
    earnings: [{ code: 'REG', category: 'regular', amount: dollars(3000) }],
    deductions: [],
    federalW4: {
      filingStatus: 'single',
      multipleJobs: false,
      dependentCredit: 0,
      otherIncome: 0,
      deductions: 0,
      extraWithholding: 0,
    },
    ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
    ...overrides,
  };
}

function amountOf(result: PaycheckResult, id: string) {
  const line = result.taxes.find((t) => t.id === id);
  assert.ok(line, `expected a tax line with id ${id}`);
  return line.amount;
}

function barePaycheck(gross: number): PaycheckResult {
  return {
    checkDate: '2026-06-15',
    grossPay: dollars(gross),
    pretaxDeductions: 0,
    posttaxDeductions: 0,
    taxes: [],
    employeeTaxTotal: 0,
    employerTaxTotal: 0,
    netPay: dollars(gross),
  };
}

describe('audit fixes', () => {
  test('railroad Tier II and RUIA keep 401(k) deferrals in the wage base', () => {
    const rail = (deductions: PaycheckInput['deductions']) =>
      input({
        checkDate: '2026-08-15',
        employmentCategory: 'railroad',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1800) }],
        deductions,
      });
    const plain = calculatePaycheck(rail([]));
    const deferred = calculatePaycheck(
      rail([{ code: '401K', category: 'deferral_401k', amount: dollars(400) }]),
    );
    assert.equal(amountOf(deferred, 'US_RRTA_TIER2_EE'), amountOf(plain, 'US_RRTA_TIER2_EE'));
    assert.equal(amountOf(deferred, 'US_RUIA_ER'), amountOf(plain, 'US_RUIA_ER'));
    assert.equal(deferred.taxes.find((t) => t.id === 'US_RRTA_TIER2_EE')!.taxableWages, dollars(1800));
    assert.ok(amountOf(deferred, 'US_FIT') < amountOf(plain, 'US_FIT'));
    assert.match(plain.taxes.find((t) => t.id === 'US_FUTA')!.detail, /US_RUIA_ER/);
    assert.doesNotMatch(plain.taxes.find((t) => t.id === 'US_FUTA')!.detail, /does not model/);
  });

  test('an Indiana resident working in Pennsylvania keeps county tax on the swap', () => {
    const weekly = {
      payFrequency: 'weekly' as const,
      earnings: [{ code: 'REG', category: 'regular' as const, amount: dollars(800) }],
    };
    const direct = calculatePaycheck(
      input({ ...weekly, workState: { code: 'IN', certificate: { county: 'Marion' } } }),
    );
    const swap = calculatePaycheck(
      input({
        ...weekly,
        workState: { code: 'PA' },
        residenceState: { code: 'IN', certificate: { county: 'Marion' } },
      }),
    );
    assert.equal(amountOf(swap, 'PA_SIT'), 0);
    assert.equal(amountOf(swap, 'IN_SIT_RECIPROCITY_SWAP'), amountOf(direct, 'IN_SIT'));
    assert.equal(amountOf(swap, 'IN_COUNTY'), amountOf(direct, 'IN_COUNTY'));
    assert.ok(amountOf(swap, 'IN_COUNTY') > 0);
  });

  test('New York City tax is withheld when residence withholding is elected', () => {
    const weekly = {
      payFrequency: 'weekly' as const,
      earnings: [{ code: 'REG', category: 'regular' as const, amount: dollars(400) }],
    };
    const cert = { maritalStatus: 'single', exemptions: 3, nycResident: true };
    const direct = calculatePaycheck(input({ ...weekly, workState: { code: 'NY', certificate: cert } }));
    const courtesy = calculatePaycheck(
      input({
        ...weekly,
        workState: { code: 'TX' },
        residenceState: { code: 'NY', certificate: cert },
        residenceStateWithholding: { nexus: true },
      }),
    );
    assert.equal(amountOf(courtesy, 'NY_SIT_RESIDENCE'), amountOf(direct, 'NY_SIT'));
    assert.equal(amountOf(courtesy, 'NY_NYC_SIT'), amountOf(direct, 'NY_NYC_SIT'));
    assert.ok(amountOf(courtesy, 'NY_NYC_SIT') > 0);
  });

  test('Oregon statewide transit tax follows an Oregon resident working in Washington', () => {
    const resident = calculatePaycheck(
      input({
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'WA' },
        residenceState: { code: 'OR' },
      }),
    );
    assert.equal(amountOf(resident, 'OR_STT'), dollars(1));

    const workingInOregon = calculatePaycheck(
      input({
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'OR', certificate: { maritalStatus: 'single', allowances: 0 } },
        residenceState: { code: 'OR', certificate: { maritalStatus: 'single', allowances: 0 } },
      }),
    );
    assert.equal(workingInOregon.taxes.filter((t) => t.id === 'OR_STT').length, 1);
  });

  test('Hackleburg matches the Alabama municipality alias', () => {
    const resolved = resolveJurisdiction(
      {
        state: 'AL',
        incorporatedPlaces: ['Hackleburg'],
        countySubdivisions: [],
        counties: ['Marion County'],
      },
      '2026-06-15',
    );
    assert.equal(resolved.alMunicipality?.confidence, 'matched');
    assert.equal(toCertificateFields(resolved, 'work').workCity, 'Hacklebug');
  });

  test('a residence PSD supplied through payCalc is withheld at the resident rate', () => {
    const [result] = payCalc([
      {
        checkDate: '2026-06-15',
        frequency: 'biweekly',
        grossPay: 3000,
        workUniqueTaxIds: ['42-000-0001', '42-PSD-700102'],
        liveUniqueTaxIds: ['42-000-0001', '42-PSD-730105'],
      },
    ]);
    assert.equal(result.error, undefined);
    const eit = result.taxJurisdictionParms.find((l) => l.description === 'PA Local Earned Income Tax');
    assert.ok(eit);
    assert.equal(eit!.amount, 45);
  });

  test('the catalog exposes South Clackamas, Metro, and Multnomah', () => {
    const entries = listUniqueTaxIds('2026-08-15');
    assert.ok(entries.some((e) => e.value === 'SCTD'));
    assert.ok(entries.some((e) => e.field === 'metroDistrict'));
    assert.ok(entries.some((e) => e.field === 'multnomahCounty'));
  });

  test('child support refuses to run without supportingOtherFamily', () => {
    assert.throws(
      () =>
        calculateGarnishments({
          checkDate: '2026-06-15',
          payFrequency: 'weekly',
          workState: 'OH',
          paycheck: barePaycheck(1000),
          orders: [{ id: 'S', type: 'child_support', amountOrdered: dollars(300) }],
        }),
      /supportingOtherFamily/,
    );
  });

  test('whole-dollar rounding leaves Social Security in cents', () => {
    const r = calculatePaycheck(
      input({
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(2412.5) }],
        roundToWholeDollars: true,
      }),
    );
    assert.equal(amountOf(r, 'US_SS_EE'), dollars(149.58));
    assert.equal(amountOf(r, 'US_FIT') % 100, 0);
  });

  test('Florida minimum wage steps to $15 on 2026-09-30', () => {
    assert.equal(minimumWage({ checkDate: '2026-09-29', state: 'FL' }).hourly, 14);
    const stepped = minimumWage({ checkDate: '2026-09-30', state: 'FL' });
    assert.equal(stepped.hourly, 15);
    assert.equal(minimumWage({ checkDate: '2026-09-30', state: 'FL', tipped: true }).hourly, 11.98);
    assert.equal(minimumWage({ checkDate: '2026-09-29', state: 'FL', tipped: true }).hourly, 10.98);
  });

  test('a 401(k) deferral does not reduce Ohio SUTA wages', () => {
    const plain = calculatePaycheck(input({ workState: { code: 'OH' } }));
    const deferred = calculatePaycheck(
      input({
        workState: { code: 'OH' },
        deductions: [{ code: '401K', category: 'deferral_401k', amount: dollars(400) }],
      }),
    );
    assert.equal(amountOf(deferred, 'OH_SUI_ER'), amountOf(plain, 'OH_SUI_ER'));
    assert.equal(deferred.taxes.find((t) => t.id === 'OH_SUI_ER')!.taxableWages, dollars(3000));
  });

  test('household FUTA counts this check toward the quarterly $1,000', () => {
    const r = calculatePaycheck(
      input({
        employmentCategory: 'household',
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(600) }],
        ytd: { socialSecurity: 0, medicare: 0, futa: 0, categoryCashWages: dollars(2900) },
        employer: { householdQuarterlyCashWages: dollars(500) },
      }),
    );
    assert.equal(amountOf(r, 'US_FUTA'), dollars(3.6));
  });

  test('supplemental withholding rejects a string exempt flag', () => {
    const paycheck = input({
      earnings: [{ code: 'BON', category: 'supplemental', amount: dollars(500) }],
      federalW4: {
        filingStatus: 'single',
        multipleJobs: false,
        dependentCredit: 0,
        otherIncome: 0,
        deductions: 0,
        extraWithholding: 0,
        exempt: 'false' as unknown as boolean,
      },
    });
    assert.throws(
      () =>
        federalSupplementalTax(
          paycheck,
          { year: 2026, periodsPerYear: 26, taxableWagesFor: () => dollars(500) },
          federalRuleset(paycheck.checkDate),
        ),
      /exempt/,
    );
  });

  test('Oregon no-certificate withholding uses the rate stored on the ruleset', () => {
    const rules = JSON.parse(readFileSync(new URL('../data/states/OR-2026.json', import.meta.url), 'utf8')) as {
      bracketFederalSubtractionPhaseout: { noCertificateDefaultRate: number };
    };
    const r = calculatePaycheck(
      input({
        earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
        workState: { code: 'OR' },
      }),
    );
    assert.equal(amountOf(r, 'OR_SIT'), Math.round(dollars(1000) * rules.bracketFederalSubtractionPhaseout.noCertificateDefaultRate));
  });

  test('NaN is rejected by the cent-floor and whole-dollar helpers', () => {
    assert.throws(() => roundDownToCent(NaN), /roundDownToCent\(NaN\)/);
    assert.throws(() => toWholeDollars(NaN), /toWholeDollars\(NaN\)/);
  });

  test('New York garnishment uses the downstate minimum wage when the region is named', () => {
    const orders = [{ id: 'G', type: 'consumer_creditor' as const, amountOrdered: dollars(1000) }];
    const upstate = calculateGarnishments({
      checkDate: '2026-06-15',
      payFrequency: 'weekly',
      workState: 'NY',
      paycheck: barePaycheck(500),
      orders,
    });
    const downstate = calculateGarnishments({
      checkDate: '2026-06-15',
      payFrequency: 'weekly',
      workState: 'NY',
      workRegion: 'downstate',
      paycheck: barePaycheck(500),
      orders,
    });
    assert.ok(upstate.totalWithheld > 0);
    assert.equal(downstate.totalWithheld, 0);
  });

  test('DC garnishment uses the pre-July minimum wage before 2026-07-01', () => {
    const orders = [{ id: 'G', type: 'consumer_creditor' as const, amountOrdered: dollars(1000) }];
    const before = calculateGarnishments({
      checkDate: '2026-06-15',
      payFrequency: 'weekly',
      workState: 'DC',
      paycheck: barePaycheck(720),
      orders,
    });
    const after = calculateGarnishments({
      checkDate: '2026-07-15',
      payFrequency: 'weekly',
      workState: 'DC',
      paycheck: barePaycheck(720),
      orders,
    });
    assert.ok(before.totalWithheld > 0);
    assert.equal(after.totalWithheld, 0);
  });
});

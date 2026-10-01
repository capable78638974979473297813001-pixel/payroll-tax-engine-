import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { calculatePaycheck } from '../src/calculate.ts';
import { minimumWage } from '../src/minimum-wage.ts';
import {
  UnsupportedTaxYearError,
  federalMinimumWageRuleset,
  hasFederalRuleset,
  hasStateMinimumWageRuleset,
  hasStateRuleset,
  stateMinimumWageRuleset,
  stateRuleset,
} from '../src/registry.ts';
import type { PaycheckInput } from '../src/types.ts';

/**
 * Announced final 2027 figures, effective 2027-01-01. The loader is
 * year-keyed, so these live in their own files. 2026 files are not edited.
 * A 2027 paycheck is still refused: there is no federal/2027.json.
 */

const D26 = '2026-06-15';
const D27 = '2027-01-15';

const pay = (checkDate: string, state: string): PaycheckInput => ({
  checkDate,
  payFrequency: 'biweekly',
  earnings: [{ code: 'REG', category: 'regular', amount: 300000 }],
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
  workState: { code: state } as PaycheckInput['workState'],
});

function sourceUrls(rules: { sources: { url: string }[] }): string[] {
  return rules.sources.map((s) => s.url);
}

describe('2026 values are unchanged', () => {
  test('Nevada UI taxable wage base stays $43,700', () => {
    const r = stateRuleset('NV', D26);
    assert.equal(r.year, 2026);
    assert.equal(r.unemploymentInsurance.wageBase, 43700);
    assert.equal(r.suiEmployer.wageBase, 43700);
  });

  test('Washington UI taxable wage base stays $78,200', () => {
    const r = stateRuleset('WA', D26);
    assert.equal(r.year, 2026);
    assert.equal(r.suiEmployer.wageBase, 78200);
  });

  test('Wyoming UI taxable wage base stays $33,800', () => {
    const r = stateRuleset('WY', D26);
    assert.equal(r.year, 2026);
    assert.equal(r.unemploymentInsurance.wageBase, 33800);
    assert.equal(r.suiEmployer.wageBase, 33800);
  });

  test('New Jersey 2026 wage bases and worker rates stay as published for 2026', () => {
    const r = stateRuleset('NJ', D26);
    assert.equal(r.year, 2026);
    assert.equal(r.stateUnemploymentEmployee.wageBase, 44800);
    assert.equal(r.stateUnemploymentEmployee.rate, 0.00425);
    assert.equal(r.stateUnemploymentEmployee.rateStatus, undefined);
    assert.equal(r.stateDisabilityEmployee.wageBase, 171100);
    assert.equal(r.stateDisabilityEmployee.rate, 0.0019);
    assert.equal(r.stateDisabilityEmployee.rateStatus, undefined);
    assert.equal(r.statePaidLeaveEmployee.wageBase, 171100);
    assert.equal(r.statePaidLeaveEmployee.rate, 0.0023);
    assert.equal(r.statePaidLeaveEmployee.rateStatus, undefined);
    assert.equal(r.suiEmployer.wageBase, 44800);
    assert.equal(r.employerTemporaryDisability, undefined);
  });

  test('California statewide minimum wage stays $16.90', () => {
    const ca = stateMinimumWageRuleset('CA', D26);
    assert.equal(ca.year, 2026);
    assert.equal(ca.standard!.hourlyCents, 1690);
    assert.equal(ca.tipped.cashWageCents, 1690);
    assert.deepEqual(ca.scheduledChanges, []);
  });

  test('a 2026 Nevada paycheck still uses the $43,700 base and the 2.95% new-employer rate', () => {
    const r = calculatePaycheck(pay(D26, 'NV'));
    // $3,000 x 2.95% = $88.50. The wage base is far above this cheque.
    assert.equal(r.taxes.find((t) => t.id === 'NV_SUI_ER')?.amount, 8850);
  });
});

describe('2027 announced values load by check date', () => {
  test('Nevada SUI taxable wage base is $45,400', () => {
    assert.equal(hasStateRuleset('NV', D27), true);
    const r = stateRuleset('NV', D27);
    assert.equal(r.year, 2027);
    assert.equal(r.unemploymentInsurance.wageBase, 45400);
    assert.equal(r.suiEmployer.wageBase, 45400);
    assert.ok(sourceUrls(r).includes('https://detr.nv.gov/Page/UI_Tax'));
    assert.ok((r.carriedForwardUnconfirmed as string[]).includes('suiEmployer.newEmployerRate'));
  });

  test('Washington UI taxable wage base is $82,000', () => {
    const r = stateRuleset('WA', D27);
    assert.equal(r.year, 2027);
    assert.equal(r.suiEmployer.wageBase, 82000);
    assert.ok(
      sourceUrls(r).includes(
        'https://esd.wa.gov/about-us/news-release/2026/new-average-annual-wage-estimates-adjust-unemployment-insurance-and-paid-leave-benefits',
      ),
    );
    assert.ok((r.carriedForwardUnconfirmed as string[]).includes('statePaidLeaveEmployee'));
  });

  test('Wyoming SUI taxable wage base is $34,900', () => {
    const r = stateRuleset('WY', D27);
    assert.equal(r.year, 2027);
    assert.equal(r.unemploymentInsurance.wageBase, 34900);
    assert.equal(r.suiEmployer.wageBase, 34900);
    assert.ok(
      sourceUrls(r).includes(
        'https://dws.wyo.gov/dws-division/unemployment-insurance/wyui/unemployment-taxable-wage-base/',
      ),
    );
  });

  test('New Jersey wage bases load, and unpublished worker rates stay provisional', () => {
    const r = stateRuleset('NJ', D27);
    assert.equal(r.year, 2027);
    assert.equal(r.stateUnemploymentEmployee.wageBase, 46400);
    assert.equal(r.suiEmployer.wageBase, 46400);
    assert.equal(r.employerTemporaryDisability.wageBase, 46400);
    assert.equal(r.employerTemporaryDisability.rate, null);
    assert.equal(r.employerTemporaryDisability.rateStatus, 'pending_publication');
    assert.equal(r.stateDisabilityEmployee.wageBase, 177100);
    assert.equal(r.statePaidLeaveEmployee.wageBase, 177100);
    // The engine requires a numeric rate. These are the 2026 rates, flagged.
    assert.equal(r.stateUnemploymentEmployee.rate, 0.00425);
    assert.equal(r.stateUnemploymentEmployee.rateStatus, 'provisional');
    assert.equal(r.stateDisabilityEmployee.rate, 0.0019);
    assert.equal(r.stateDisabilityEmployee.rateStatus, 'provisional');
    assert.equal(r.statePaidLeaveEmployee.rate, 0.0023);
    assert.equal(r.statePaidLeaveEmployee.rateStatus, 'provisional');
    assert.equal(r.suiEmployer.newEmployerRate, 0.026825);
    assert.equal(r.suiEmployer.newEmployerRateConfirmedThrough, '2027-06-30');
    assert.ok(
      sourceUrls(r).includes('https://www.nj.gov/labor/ea/employer-services/rate-info/index.shtml'),
    );
    assert.match(String(r.stateDisabilityEmployee.rateNote), /not a 2027 rate/);
  });

  test('California statewide minimum wage is $17.40', () => {
    assert.equal(hasStateMinimumWageRuleset('CA', D27), true);
    const ca = stateMinimumWageRuleset('CA', D27);
    assert.equal(ca.year, 2027);
    assert.equal(ca.standard!.hourly, 17.4);
    assert.equal(ca.standard!.hourlyCents, 1740);
    assert.equal(ca.standard!.effectiveFrom, '2027-01-01');
    assert.equal(ca.tipped.cashWageCents, 1740);
    assert.equal(ca.tipped.tipCreditAllowed, false);
    assert.ok(
      ca.sources.some(
        (s) =>
          s.url ===
          'https://www.gov.ca.gov/2026/07/31/governor-newsom-announces-california-will-raise-statewide-minimum-wage/',
      ),
    );
  });

  test('a 2027 paycheck is refused until federal rules exist', () => {
    assert.equal(hasFederalRuleset(D27), false);
    assert.throws(() => calculatePaycheck(pay(D27, 'NV')), UnsupportedTaxYearError);
    assert.throws(() => calculatePaycheck(pay(D27, 'NJ')), /no 2027 rules for federal tax/);
  });

  test('minimumWage() returns the $17.40 statewide floor on a 2027 check date', () => {
    // minimumWage() reads the federal file for the same year before the
    // state file. federal-2027.json carries the statutory $7.25 FLSA floor
    // so the comparison can run; it is not a withholding ruleset.
    const fed = federalMinimumWageRuleset(D27);
    assert.equal(fed.year, 2027);
    assert.equal(fed.standard.hourlyCents, 725);
    const answer = minimumWage({ checkDate: D27, state: 'CA' });
    assert.equal(answer.cents, 1740);
    assert.equal(answer.hourly, 17.4);
    assert.equal(answer.bindingLevel, 'state');
    assert.equal(answer.bindingJurisdiction, 'California');
    assert.equal(answer.tipCreditAllowed, false);
    const tipped = minimumWage({ checkDate: D27, state: 'CA', tipped: true });
    assert.equal(tipped.cents, 1740);
    assert.equal(tipped.tipCreditAllowed, false);
  });
});

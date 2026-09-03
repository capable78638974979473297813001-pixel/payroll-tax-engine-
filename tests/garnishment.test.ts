import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { calculatePaycheck } from '../src/calculate.ts';
import { calculateGarnishments, disposableEarnings } from '../src/garnishment.ts';
import { dollars } from '../src/money.ts';
import type { Cents } from '../src/money.ts';
import type { GarnishmentOrder } from '../src/garnishment.ts';
import type { PaycheckInput, PaycheckResult, PayFrequency } from '../src/types.ts';

/**
 * Every expected figure below was hand-derived from the CCPA's own published
 * rule (DOL Fact Sheet #30 / 29 CFR 870.10) before the code ran — same
 * discipline as this project's other test suites. The $217.50/$290.00
 * weekly break points come directly from 30x/40x the $7.25 federal minimum
 * wage; the state-override figures come from data/garnishment/
 * state-overrides-2026.json's own cited statutes.
 */

// A synthetic PaycheckResult with an exact, hand-chosen disposable-earnings
// figure — isolates garnishment math from any particular state's tax rules.
function paycheckOf(gross: Cents, mandatoryTax: Cents, pretax: Cents = 0): PaycheckResult {
  return {
    checkDate: '2026-06-15',
    grossPay: gross,
    pretaxDeductions: pretax,
    posttaxDeductions: 0,
    taxes: [
      {
        id: 'US_FIT',
        name: 'Federal Income Tax',
        payer: 'employee',
        jurisdiction: 'federal',
        taxableWages: gross - pretax,
        amount: mandatoryTax,
      },
    ],
    employeeTaxTotal: mandatoryTax,
    employerTaxTotal: 0,
    netPay: gross - pretax - mandatoryTax,
  };
}

function order(overrides: Partial<GarnishmentOrder> & Pick<GarnishmentOrder, 'id' | 'type'>): GarnishmentOrder {
  return { amountOrdered: Number.MAX_SAFE_INTEGER, ...overrides };
}

function run(
  paycheck: PaycheckResult,
  orders: GarnishmentOrder[],
  workState = 'CA',
  payFrequency: PayFrequency = 'weekly',
) {
  return calculateGarnishments({
    checkDate: '2026-06-15',
    payFrequency,
    workState,
    paycheck,
    orders,
  });
}

describe('disposableEarnings', () => {
  test('subtracts only employee-paid taxes, never pretax deductions', () => {
    const paycheck = paycheckOf(dollars(1000), dollars(150), dollars(200));
    // $1000 gross - $150 tax = $850, NOT $1000 - $200 - $150 = $650. The
    // $200 pretax deduction lowered what was taxed, but the CCPA still
    // counts it as part of disposable earnings — see garnishment.ts's
    // header comment for why that's correct, not a bug.
    assert.equal(disposableEarnings(paycheck), dollars(850));
  });

  test('matches a real calculatePaycheck() result the same way', () => {
    const input: PaycheckInput = {
      checkDate: '2026-06-15',
      payFrequency: 'weekly',
      earnings: [{ code: 'REG', category: 'regular', amount: dollars(1000) }],
      deductions: [{ code: '401K', category: 'deferral_401k', amount: dollars(100) }],
      federalW4: {
        filingStatus: 'single',
        multipleJobs: false,
        dependentCredit: 0,
        otherIncome: 0,
        deductions: 0,
        extraWithholding: 0,
      },
      ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
    };
    const result = calculatePaycheck(input);
    const expected = result.grossPay - result.employeeTaxTotal;
    assert.equal(disposableEarnings(result), expected);
    // The pretax 401(k) deferral must NOT have been subtracted a second time.
    assert.notEqual(disposableEarnings(result), result.netPay);
  });
});

describe('ordinary (consumer/creditor) garnishment — federal default', () => {
  test('below the 30x-minimum-wage floor: nothing may be withheld', () => {
    // $250 gross - $50 tax = $200 disposable, under the weekly $217.50 floor.
    const r = run(paycheckOf(dollars(250), dollars(50)), [
      order({ id: 'A', type: 'consumer_creditor' }),
    ]);
    assert.equal(r.disposableEarnings, dollars(200));
    assert.equal(r.totalWithheld, 0);
  });

  test('between the floor and the 25% crossover: the floor rule binds', () => {
    // $300 gross - $50 tax = $250 disposable. 25% of $250 = $62.50; the
    // floor rule gives $250 - $217.50 = $32.50, the smaller of the two.
    const r = run(paycheckOf(dollars(300), dollars(50)), [
      order({ id: 'A', type: 'consumer_creditor', amountOrdered: dollars(500) }),
    ]);
    assert.equal(r.disposableEarnings, dollars(250));
    assert.equal(r.totalWithheld, dollars(32.5));
  });

  test('well above the crossover: the flat 25% rule binds', () => {
    // $1000 disposable: 25% = $250; the floor rule would allow $782.50.
    const r = run(paycheckOf(dollars(1000), 0), [
      order({ id: 'A', type: 'consumer_creditor', amountOrdered: dollars(1000) }),
    ]);
    assert.equal(r.totalWithheld, dollars(250));
  });

  test('never withholds more than the order itself demands', () => {
    const r = run(paycheckOf(dollars(1000), 0), [
      order({ id: 'A', type: 'consumer_creditor', amountOrdered: dollars(40) }),
    ]);
    assert.equal(r.totalWithheld, dollars(40));
  });

  test('the 30x floor scales by pay frequency (biweekly = 60x, monthly = 130x)', () => {
    // Biweekly floor: 60 * $7.25 = $435.00. $500 disposable clears it by $65.
    const biweekly = run(
      paycheckOf(dollars(500), 0),
      [order({ id: 'A', type: 'consumer_creditor', amountOrdered: dollars(500) })],
      'CA',
      'biweekly',
    );
    assert.equal(biweekly.totalWithheld, dollars(65)); // lesser of 25%=$125 and $65
    // Monthly floor: 130 * $7.25 = $942.50 — $900 disposable falls under it.
    const monthly = run(
      paycheckOf(dollars(900), 0),
      [order({ id: 'A', type: 'consumer_creditor', amountOrdered: dollars(900) })],
      'CA',
      'monthly',
    );
    assert.equal(monthly.totalWithheld, 0);
  });
});

describe('ordinary garnishment — state overrides', () => {
  for (const state of ['TX', 'PA', 'NC', 'SC']) {
    test(`${state} prohibits ordinary consumer garnishment outright`, () => {
      const r = run(paycheckOf(dollars(2000), 0), [
        order({ id: 'A', type: 'consumer_creditor', amountOrdered: dollars(1000) }),
      ], state);
      assert.equal(r.totalWithheld, 0);
      assert.match(r.lines[0].detail, new RegExp(`prohibited in ${state}`));
    });

    test(`${state}'s prohibition does not touch a child support order`, () => {
      const r = run(paycheckOf(dollars(1000), 0), [
        order({ id: 'S', type: 'child_support', amountOrdered: dollars(300), supportingOtherFamily: false }),
      ], state);
      assert.equal(r.totalWithheld, dollars(300));
    });
  }

  test('Illinois: lesser of 15% of GROSS and disposable over 45x its own $15 minimum wage', () => {
    // $1000 gross, $100 tax => $900 disposable. 15% of gross = $150;
    // disposable over 45*$15=$675 is $225. $150 is smaller.
    const r = run(paycheckOf(dollars(1000), dollars(100)), [
      order({ id: 'A', type: 'consumer_creditor', amountOrdered: dollars(1000) }),
    ], 'IL');
    assert.equal(r.totalWithheld, dollars(150));
  });

  test("Illinois's 45x floor still protects a low earner even though 15% of gross alone would allow something", () => {
    // $700 gross, $50 tax => $650 disposable, under the $675 floor.
    // 15% of $700 = $105, but the floor rule gives $0 and the lesser wins.
    const r = run(paycheckOf(dollars(700), dollars(50)), [
      order({ id: 'A', type: 'consumer_creditor', amountOrdered: dollars(700) }),
    ], 'IL');
    assert.equal(r.totalWithheld, 0);
  });
});

describe('child support / alimony withholding orders', () => {
  test('60% ceiling when not supporting another spouse or child', () => {
    const r = run(paycheckOf(dollars(1000), 0), [
      order({ id: 'S', type: 'child_support', amountOrdered: dollars(800), supportingOtherFamily: false }),
    ]);
    assert.equal(r.aggregateCeiling, dollars(600));
    assert.equal(r.totalWithheld, dollars(600));
  });

  test('50% ceiling when supporting another spouse or child', () => {
    const r = run(paycheckOf(dollars(1000), 0), [
      order({ id: 'S', type: 'child_support', amountOrdered: dollars(800), supportingOtherFamily: true }),
    ]);
    assert.equal(r.totalWithheld, dollars(500));
  });

  test('+5 points for 12+ weeks in arrears (60% -> 65%)', () => {
    const r = run(paycheckOf(dollars(1000), 0), [
      order({
        id: 'S',
        type: 'child_support',
        amountOrdered: dollars(800),
        supportingOtherFamily: false,
        arrearsOver12Weeks: true,
      }),
    ]);
    assert.equal(r.totalWithheld, dollars(650));
  });

  test('never withholds more than the order itself demands, even under a higher ceiling', () => {
    const r = run(paycheckOf(dollars(1000), 0), [
      order({ id: 'S', type: 'child_support', amountOrdered: dollars(300), supportingOtherFamily: false }),
    ]);
    assert.equal(r.totalWithheld, dollars(300));
  });

  test('multiple support orders share ONE ceiling, prorated by each order\'s own demanded amount', () => {
    // $1000 disposable, 60% ceiling = $600. Two orders demand $300 and
    // $600 (total $900, over the $600 ceiling) -> prorated 1:2.
    const r = run(paycheckOf(dollars(1000), 0), [
      order({ id: 'S1', type: 'child_support', amountOrdered: dollars(300), supportingOtherFamily: false }),
      order({ id: 'S2', type: 'child_support', amountOrdered: dollars(600), supportingOtherFamily: false }),
    ]);
    assert.equal(r.totalWithheld, dollars(600));
    const s1 = r.lines.find((l) => l.orderId === 'S1')!;
    const s2 = r.lines.find((l) => l.orderId === 'S2')!;
    assert.equal(s1.withheld, dollars(200)); // 300/900 * 600
    assert.equal(s2.withheld, dollars(400)); // 600/900 * 600
  });
});

describe('stacking a support order with an ordinary garnishment', () => {
  test('the ordinary garnishment only gets what room the support ceiling leaves behind', () => {
    // $1000 disposable, 60% support ceiling = $600. Support order takes
    // $300 of it, leaving $300 of room; the ordinary garnishment's own cap
    // (25% = $250) is smaller than that remaining room, so IT binds.
    const r = run(paycheckOf(dollars(1000), 0), [
      order({ id: 'S', type: 'child_support', amountOrdered: dollars(300), supportingOtherFamily: false }),
      order({ id: 'C', type: 'consumer_creditor', amountOrdered: dollars(500), priority: 1 }),
    ]);
    assert.equal(r.aggregateCeiling, dollars(600));
    assert.equal(r.lines.find((l) => l.orderId === 'S')!.withheld, dollars(300));
    assert.equal(r.lines.find((l) => l.orderId === 'C')!.withheld, dollars(250));
    assert.equal(r.totalWithheld, dollars(550));
  });

  test('a support order that consumes the full ceiling leaves nothing for anything junior', () => {
    const r = run(paycheckOf(dollars(1000), 0), [
      order({ id: 'S', type: 'child_support', amountOrdered: dollars(600), supportingOtherFamily: false }),
      order({ id: 'C', type: 'consumer_creditor', amountOrdered: dollars(500), priority: 1 }),
    ]);
    assert.equal(r.lines.find((l) => l.orderId === 'S')!.withheld, dollars(600));
    assert.equal(r.lines.find((l) => l.orderId === 'C')!.withheld, 0);
  });
});

describe('federal student loan default (34 CFR 34.19)', () => {
  test('capped at the lesser of 15% of disposable earnings and the 30x floor', () => {
    const r = run(paycheckOf(dollars(1000), 0), [
      order({ id: 'L', type: 'federal_student_loan_default' }),
    ]);
    assert.equal(r.totalWithheld, dollars(150));
  });

  test('combined with a consumer garnishment, the two never exceed the 25% aggregate ceiling', () => {
    // $1000 disposable, no support order -> 25% aggregate ceiling = $250.
    // Student loan (priority 1) draws its own $150 cap first, leaving $100
    // of room; the consumer garnishment (own cap $250) is limited to that.
    const r = run(paycheckOf(dollars(1000), 0), [
      order({ id: 'L', type: 'federal_student_loan_default', priority: 1 }),
      order({ id: 'C', type: 'consumer_creditor', amountOrdered: dollars(500), priority: 2 }),
    ]);
    assert.equal(r.lines.find((l) => l.orderId === 'L')!.withheld, dollars(150));
    assert.equal(r.lines.find((l) => l.orderId === 'C')!.withheld, dollars(100));
    assert.equal(r.totalWithheld, dollars(250));
  });

  test("a state's ordinary-garnishment prohibition does not touch a federal student loan default", () => {
    const r = run(paycheckOf(dollars(1000), 0), [
      order({ id: 'L', type: 'federal_student_loan_default' }),
    ], 'TX');
    assert.equal(r.totalWithheld, dollars(150));
  });
});

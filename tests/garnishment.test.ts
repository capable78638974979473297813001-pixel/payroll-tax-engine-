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

  test('Maryland: lesser of 25% of disposable and disposable over 30x its own $15.00 minimum wage', () => {
    // Md. Code Com. Law 15-601.1 (2020 amendment, uniform statewide): floor
    // is 30 x $15.00 = $450/week. $1000 disposable: 25%=$250, floor excess
    // is $1000-$450=$550 -- 25% is smaller.
    const aboveFloor = run(paycheckOf(dollars(1000), 0), [
      order({ id: 'A', type: 'consumer_creditor' }),
    ], 'MD');
    assert.equal(aboveFloor.totalWithheld, dollars(250));

    // $500 disposable: 25%=$125, but floor excess is only $500-$450=$50 --
    // the floor binds instead.
    const floorBinds = run(paycheckOf(dollars(500), 0), [
      order({ id: 'A', type: 'consumer_creditor' }),
    ], 'MD');
    assert.equal(floorBinds.totalWithheld, dollars(50));
  });

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

  test('Connecticut: lesser of 25% of disposable and disposable over 40x its own $16.94 minimum wage', () => {
    // $677.60 = 40 * $16.94 is the floor.
    const belowFloor = run(paycheckOf(dollars(600), 0), [
      order({ id: 'A', type: 'consumer_creditor' }),
    ], 'CT');
    assert.equal(belowFloor.totalWithheld, 0);

    // $700 disposable: 25% = $175; floor excess = $700 - $677.60 = $22.40 (smaller).
    const floorBinds = run(paycheckOf(dollars(700), 0), [
      order({ id: 'A', type: 'consumer_creditor' }),
    ], 'CT');
    assert.equal(floorBinds.totalWithheld, dollars(22.4));

    // $2000 disposable: 25% = $500; floor excess = $1322.40 (25% smaller).
    const fractionBinds = run(paycheckOf(dollars(2000), 0), [
      order({ id: 'A', type: 'consumer_creditor' }),
    ], 'CT');
    assert.equal(fractionBinds.totalWithheld, dollars(500));
  });

  test('Minnesota: cliff-bracket tiers, not a "lesser of" formula', () => {
    // Weekly thresholds at $11.41/hr: 40x=$456.40, 60x=$684.60, 80x=$912.80.
    assert.equal(
      run(paycheckOf(dollars(400), 0), [order({ id: 'A', type: 'consumer_creditor' })], 'MN')
        .totalWithheld,
      0, // at or below 40x: fully exempt
    );
    assert.equal(
      run(paycheckOf(dollars(500), 0), [order({ id: 'A', type: 'consumer_creditor' })], 'MN')
        .totalWithheld,
      dollars(50), // 40x-60x tier: flat 10% of the WHOLE $500, not just the excess
    );
    assert.equal(
      run(paycheckOf(dollars(700), 0), [order({ id: 'A', type: 'consumer_creditor' })], 'MN')
        .totalWithheld,
      dollars(105), // 60x-80x tier: flat 15%
    );
    assert.equal(
      run(paycheckOf(dollars(1000), 0), [order({ id: 'A', type: 'consumer_creditor' })], 'MN')
        .totalWithheld,
      dollars(250), // above 80x: flat 25%
    );
  });

  test('New York: lesser of 10% of GROSS, 25% of disposable, and disposable over 30x its own $16 minimum wage', () => {
    // $1000 gross, $100 tax => $900 disposable. 10% of gross = $100 (smallest).
    const grossBinds = run(paycheckOf(dollars(1000), dollars(100)), [
      order({ id: 'A', type: 'consumer_creditor' }),
    ], 'NY');
    assert.equal(grossBinds.totalWithheld, dollars(100));

    // $600 gross, $100 tax => $500 disposable. 10%*600=$60; 25%*500=$125;
    // floor excess = $500-$480(=30x$16)=$20 (smallest).
    const floorBinds = run(paycheckOf(dollars(600), dollars(100)), [
      order({ id: 'A', type: 'consumer_creditor' }),
    ], 'NY');
    assert.equal(floorBinds.totalWithheld, dollars(20));

    // $400 disposable is under the $480 floor: fully exempt.
    const exempt = run(paycheckOf(dollars(400), 0), [
      order({ id: 'A', type: 'consumer_creditor' }),
    ], 'NY');
    assert.equal(exempt.totalWithheld, 0);
  });

  test('Massachusetts: lesser of 15% of GROSS and disposable over 50x its own $15 minimum wage', () => {
    // $1200 gross, $200 tax => $1000 disposable. 15%*1200=$180;
    // floor excess = $1000 - $750(=50x$15) = $250 (fraction is smaller).
    const fractionBinds = run(paycheckOf(dollars(1200), dollars(200)), [
      order({ id: 'A', type: 'consumer_creditor' }),
    ], 'MA');
    assert.equal(fractionBinds.totalWithheld, dollars(180));

    // $900 gross, $100 tax => $800 disposable. 15%*900=$135;
    // floor excess = $800-$750=$50 (floor is smaller).
    const floorBinds = run(paycheckOf(dollars(900), dollars(100)), [
      order({ id: 'A', type: 'consumer_creditor' }),
    ], 'MA');
    assert.equal(floorBinds.totalWithheld, dollars(50));
  });

  test('Delaware: a flat 15% of disposable earnings, with no separate minimum-wage floor', () => {
    assert.equal(
      run(paycheckOf(dollars(1000), 0), [order({ id: 'A', type: 'consumer_creditor' })], 'DE')
        .totalWithheld,
      dollars(150),
    );
    // Even a very low earner gets no floor protection beyond the flat 15% —
    // unlike every other override in this file, DE names no separate floor.
    assert.equal(
      run(paycheckOf(dollars(100), 0), [order({ id: 'A', type: 'consumer_creditor' })], 'DE')
        .totalWithheld,
      dollars(15),
    );
  });

  test("Florida: a head-of-family debtor owes $0 at ANY income level, not just below a threshold", () => {
    const r = run(paycheckOf(dollars(5000), 0), [
      order({ id: 'A', type: 'consumer_creditor', headOfFamily: true }),
    ], 'FL');
    assert.equal(r.totalWithheld, 0);
  });

  test('Florida: a head-of-family debtor who waived the exemption in writing gets the plain federal default', () => {
    // $1000 disposable, no state departure beyond the (waived) exemption:
    // federal 25% = $250 binds (floor excess would be $782.50).
    const r = run(paycheckOf(dollars(1000), 0), [
      order({
        id: 'A',
        type: 'consumer_creditor',
        headOfFamily: true,
        wageExemptionWaivedInWriting: true,
      }),
    ], 'FL');
    assert.equal(r.totalWithheld, dollars(250));
  });

  test('Florida: a non-head-of-family debtor gets the plain federal default too', () => {
    const r = run(paycheckOf(dollars(1000), 0), [
      order({ id: 'A', type: 'consumer_creditor', headOfFamily: false }),
    ], 'FL');
    assert.equal(r.totalWithheld, dollars(250));
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

describe('more state overrides — cliff-on-dollar, marginal-bracket and head-of-family shapes', () => {
  test('Colorado: lesser of 20% of disposable and disposable over 40x its own $15.16 minimum wage', () => {
    // Floor: 40 * $15.16 = $606.40.
    const floorBinds = run(paycheckOf(dollars(700), 0), [
      order({ id: 'A', type: 'consumer_creditor' }),
    ], 'CO');
    assert.equal(floorBinds.totalWithheld, dollars(93.6)); // $700-$606.40, smaller than 20%*$700=$140

    const fractionBinds = run(paycheckOf(dollars(2000), 0), [
      order({ id: 'A', type: 'consumer_creditor' }),
    ], 'CO');
    assert.equal(fractionBinds.totalWithheld, dollars(400)); // 20%*$2000, smaller than the floor excess

    const exempt = run(paycheckOf(dollars(500), 0), [
      order({ id: 'A', type: 'consumer_creditor' }),
    ], 'CO');
    assert.equal(exempt.totalWithheld, 0); // under the $606.40 floor
  });

  test('Washington: lesser of 20% of disposable and disposable over 35x its own $17.13 minimum wage', () => {
    // Floor: 35 * $17.13 = $599.55.
    const floorBinds = run(paycheckOf(dollars(700), 0), [
      order({ id: 'A', type: 'consumer_creditor' }),
    ], 'WA');
    assert.equal(floorBinds.totalWithheld, dollars(100.45)); // $700-$599.55, smaller than 20%*$700=$140

    const fractionBinds = run(paycheckOf(dollars(2000), 0), [
      order({ id: 'A', type: 'consumer_creditor' }),
    ], 'WA');
    assert.equal(fractionBinds.totalWithheld, dollars(400)); // 20%*$2000
  });

  test('Nevada: an 18%/25% cliff keyed on a FIXED gross-weekly dollar threshold, applied to disposable earnings', () => {
    // Floor: 50 * $7.25 = $362.50 (the federal rate specifically, not Nevada's own).
    // Gross <= $770 -> 18% tier.
    const lowTier = run(paycheckOf(dollars(700), dollars(50)), [
      order({ id: 'A', type: 'consumer_creditor' }),
    ], 'NV');
    assert.equal(lowTier.totalWithheld, dollars(117)); // 18% of $650 disposable

    // Gross > $770 -> 25% tier.
    const highTier = run(paycheckOf(dollars(1000), dollars(100)), [
      order({ id: 'A', type: 'consumer_creditor' }),
    ], 'NV');
    assert.equal(highTier.totalWithheld, dollars(225)); // 25% of $900 disposable

    // The floor still binds even in the 25% tier at low disposable earnings.
    const floorBinds = run(paycheckOf(dollars(1000), dollars(600)), [
      order({ id: 'A', type: 'consumer_creditor' }),
    ], 'NV');
    assert.equal(floorBinds.totalWithheld, dollars(37.5)); // $400-$362.50, smaller than 25%*$400=$100
  });

  test('Hawaii: MARGINAL brackets on monthly-prorated disposable earnings, not a cliff', () => {
    // Weekly-prorated breakpoints: $100/mo -> $23.08/week, $200/mo -> $46.15/week.
    const withinFirstBracket = run(paycheckOf(dollars(10), 0), [
      order({ id: 'A', type: 'consumer_creditor' }),
    ], 'HI');
    assert.equal(withinFirstBracket.totalWithheld, dollars(0.5)); // 5% of the whole $10

    const acrossTwoBrackets = run(paycheckOf(dollars(40), 0), [
      order({ id: 'A', type: 'consumer_creditor' }),
    ], 'HI');
    // 5% of the first $23.08 ($1.15) + 10% of the next $16.92 ($1.69) = $2.84 —
    // NOT 10% of the whole $40, which is what a cliff rule would give.
    assert.equal(acrossTwoBrackets.totalWithheld, dollars(2.84));

    const acrossAllThreeBrackets = run(paycheckOf(dollars(100), 0), [
      order({ id: 'A', type: 'consumer_creditor' }),
    ], 'HI');
    // 5% of $23.08 ($1.15) + 10% of $23.07 ($2.31) + 20% of the remaining $53.85 ($10.77) = $14.23.
    assert.equal(acrossAllThreeBrackets.totalWithheld, dollars(14.23));
  });

  test('Missouri: a head-of-family debtor gets 10% instead of the ordinary 25%, never a full exemption', () => {
    const r = run(paycheckOf(dollars(1000), 0), [
      order({ id: 'A', type: 'consumer_creditor', headOfFamily: true }),
    ], 'MO');
    assert.equal(r.totalWithheld, dollars(100)); // 10% of $1000, smaller than the floor excess

    // The 30x-federal-minimum-wage floor ($217.50) still binds independently.
    const floorBinds = run(paycheckOf(dollars(220), 0), [
      order({ id: 'A', type: 'consumer_creditor', headOfFamily: true }),
    ], 'MO');
    assert.equal(floorBinds.totalWithheld, dollars(2.5)); // $220-$217.50, smaller than 10%*$220=$22

    // Not head-of-family: Missouri has no other departure, so the plain
    // federal 25%/30x default applies.
    const notHeadOfFamily = run(paycheckOf(dollars(1000), 0), [
      order({ id: 'A', type: 'consumer_creditor', headOfFamily: false }),
    ], 'MO');
    assert.equal(notHeadOfFamily.totalWithheld, dollars(250));
  });

  test('Wisconsin: lesser of 20% of disposable and disposable over 30x the FEDERAL minimum wage', () => {
    // Floor: 30 * $7.25 = $217.50.
    const floorBinds = run(paycheckOf(dollars(250), 0), [
      order({ id: 'A', type: 'consumer_creditor' }),
    ], 'WI');
    assert.equal(floorBinds.totalWithheld, dollars(32.5)); // $250-$217.50, smaller than 20%*$250=$50

    const fractionBinds = run(paycheckOf(dollars(2000), 0), [
      order({ id: 'A', type: 'consumer_creditor' }),
    ], 'WI');
    assert.equal(fractionBinds.totalWithheld, dollars(400)); // 20%*$2000
  });

  test("Maine: lesser of 25% of disposable and disposable over 40x its own $15.10 minimum wage", () => {
    // Floor: 40 * $15.10 = $604.00.
    const floorBinds = run(paycheckOf(dollars(700), 0), [
      order({ id: 'A', type: 'consumer_creditor' }),
    ], 'ME');
    assert.equal(floorBinds.totalWithheld, dollars(96)); // $700-$604, smaller than 25%*$700=$175

    const fractionBinds = run(paycheckOf(dollars(2000), 0), [
      order({ id: 'A', type: 'consumer_creditor' }),
    ], 'ME');
    assert.equal(fractionBinds.totalWithheld, dollars(500)); // 25%*$2000
  });

  test('Vermont: the MORE protective consumer-credit-transaction rule (15%/40x federal) governs an ordinary garnishment', () => {
    // Floor: 40 * $7.25 = $290.00.
    const floorBinds = run(paycheckOf(dollars(300), 0), [
      order({ id: 'A', type: 'consumer_creditor' }),
    ], 'VT');
    assert.equal(floorBinds.totalWithheld, dollars(10)); // $300-$290, smaller than 15%*$300=$45

    const fractionBinds = run(paycheckOf(dollars(2000), 0), [
      order({ id: 'A', type: 'consumer_creditor' }),
    ], 'VT');
    assert.equal(fractionBinds.totalWithheld, dollars(300)); // 15%*$2000
  });

  test('North Dakota: the 25%/40x-federal cap is further reduced by $20/week per dependent', () => {
    const noDependents = run(paycheckOf(dollars(1000), 0), [
      order({ id: 'A', type: 'consumer_creditor' }),
    ], 'ND');
    assert.equal(noDependents.totalWithheld, dollars(250)); // 25%*$1000, floor excess is $710

    const twoDependents = run(paycheckOf(dollars(1000), 0), [
      order({ id: 'A', type: 'consumer_creditor', dependents: 2 }),
    ], 'ND');
    assert.equal(twoDependents.totalWithheld, dollars(210)); // $250 - 2*$20

    // The per-dependent reduction never pushes the cap below zero.
    const reductionExceedsCap = run(paycheckOf(dollars(300), 0), [
      order({ id: 'A', type: 'consumer_creditor', dependents: 3 }),
    ], 'ND');
    assert.equal(reductionExceedsCap.totalWithheld, 0); // base cap is $10 (floor-bound); 3*$20=$60 would go negative
  });

  test('New Jersey: 10% of GROSS while at/under 250% of the household poverty guideline, else the federal default', () => {
    // Household of 4: 2026 HHS guideline $33,000 x 250% = $82,500. $1000/week
    // annualizes to $52,000 -- at or under the threshold, so the 10%-of-gross
    // tier applies: 10% x $1000 = $100. The $48/week flat floor ($1000-$48=
    // $952) doesn't bind here.
    const belowThreshold = run(paycheckOf(dollars(1000), 0), [
      order({ id: 'A', type: 'consumer_creditor', householdSize: 4 }),
    ], 'NJ');
    assert.equal(belowThreshold.totalWithheld, dollars(100));

    // Household of 1: guideline $15,960 x 250% = $39,900. The same $1000/week
    // ($52,000/year) now EXCEEDS the threshold, so N.J. Stat. 2A:17-56 leaves
    // it to court discretion -- this engine falls through to the plain
    // federal default: lesser of 25%*$1000 and $1000-$217.50(30x $7.25).
    const aboveThreshold = run(paycheckOf(dollars(1000), 0), [
      order({ id: 'A', type: 'consumer_creditor', householdSize: 1 }),
    ], 'NJ');
    assert.equal(aboveThreshold.totalWithheld, dollars(250));

    // No household size supplied at all: never guessed, same federal
    // fallback as the above-threshold case.
    const noHouseholdSize = run(paycheckOf(dollars(1000), 0), [
      order({ id: 'A', type: 'consumer_creditor' }),
    ], 'NJ');
    assert.equal(noHouseholdSize.totalWithheld, dollars(250));

    // At very low income the separate $48/week flat exemption (2A:17-50)
    // binds ahead of the 10% fraction: 10%*$50=$5, but the flat floor only
    // leaves $50-$48=$2 exposed.
    const flatFloorBinds = run(paycheckOf(dollars(50), 0), [
      order({ id: 'A', type: 'consumer_creditor', householdSize: 1 }),
    ], 'NJ');
    assert.equal(flatFloorBinds.totalWithheld, dollars(2));
  });
});

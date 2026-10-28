import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { calculatePaycheck } from '../src/calculate.ts';
import { CannotComputeError } from '../src/registry.ts';
import type { PaycheckInput, PensionPayment, PayFrequency } from '../src/types.ts';
import { PERIODS_PER_YEAR } from '../src/types.ts';

/**
 * Federal withholding on pension, annuity and IRA payments, 2026.
 *
 * The periodic method (Pub 15-T Worksheet 1B) is checked against a source the implementation does
 * not read: the 2026 Marginal Rate Tables printed on Form W-4R, which give the tax brackets on
 * total income. A payee with no Form W-4P is Single with no entries, so withholding on one payment
 * must equal the tax on (annual payments - standard deduction) from those tables, divided by the
 * number of payments.
 */

const W4R_TABLES: Record<string, { standardDeduction: number; brackets: [number, number][] }> = {
  single: { standardDeduction: 16_100, brackets: [[0, 0], [16_100, 0.1], [28_500, 0.12], [66_500, 0.22], [121_800, 0.24], [217_875, 0.32], [272_325, 0.35], [656_700, 0.37]] },
  married_joint: { standardDeduction: 32_200, brackets: [[0, 0], [32_200, 0.1], [57_000, 0.12], [133_000, 0.22], [243_600, 0.24], [435_750, 0.32], [544_650, 0.35], [800_900, 0.37]] },
  head_of_household: { standardDeduction: 24_150, brackets: [[0, 0], [24_150, 0.1], [41_850, 0.12], [91_600, 0.22], [129_850, 0.24], [225_900, 0.32], [280_350, 0.35], [664_750, 0.37]] },
};

/** Tax in cents on total annual income (dollars), from the W-4R marginal rates, with nothing rounded until the end. */
function irsTaxCents(status: string, annualIncomeDollars: number): number {
  const { brackets } = W4R_TABLES[status]!;
  let tax = 0;
  for (let i = 0; i < brackets.length; i++) {
    const [from, rate] = brackets[i]!;
    const to = i + 1 < brackets.length ? brackets[i + 1]![0] : Infinity;
    if (annualIncomeDollars > from) tax += (Math.min(annualIncomeDollars, to) - from) * rate;
  }
  return tax * 100;
}

const W4 = { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 } as const;
function pay(amount: number, pension: PensionPayment, payFrequency: PayFrequency = 'monthly', extra: Partial<PaycheckInput> = {}): PaycheckInput {
  return {
    checkDate: '2026-06-15',
    payFrequency,
    earnings: [{ code: 'PENSION', category: 'regular', amount }],
    deductions: [],
    federalW4: { ...W4 },
    ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
    pension,
    ...extra,
  } as PaycheckInput;
}
const withheld = (input: PaycheckInput) => calculatePaycheck(input).taxes[0]!.amount;

describe('periodic payments with no Form W-4P: Single, no entries', () => {
  for (const [status, label] of [['single', 'Single'], ['married_joint', 'Married filing jointly'], ['head_of_household', 'Head of household']] as const) {
    test(`${label}: equals the Form W-4R marginal-rate tax on income above the standard deduction`, () => {
      let checked = 0;
      for (const frequency of ['monthly', 'semimonthly', 'biweekly', 'weekly'] as const) {
        const periods = PERIODS_PER_YEAR[frequency];
        for (const annual of [9_000, 20_000, 32_199, 33_000, 48_000, 75_000, 120_000, 150_000, 250_000, 400_000, 700_000, 1_200_000]) {
          const payment = Math.round((annual * 100) / periods);
          const annualised = (payment * periods) / 100;
          const expected = Math.round(Math.max(0, irsTaxCents(status, annualised - 0) - 0) );
          // the W-4R table already includes the standard deduction in its first 0% band
          const engine = withheld(pay(payment, { kind: 'periodic', w4p: { filingStatus: status } }, frequency));
          const reference = Math.round(irsTaxCents(status, annualised) / periods);
          assert.ok(Math.abs(engine - reference) <= 1, `${label} ${frequency} $${annual}: engine ${engine} vs W-4R ${reference} (${expected})`);
          checked++;
        }
      }
      assert.equal(checked, 48);
    });
  }

  test('a payee with no form at all is treated as Single', () => {
    const none = calculatePaycheck(pay(200_000, { kind: 'periodic' }));
    const single = calculatePaycheck(pay(200_000, { kind: 'periodic', w4p: { filingStatus: 'single' } }));
    assert.equal(none.taxes[0]!.amount, single.taxes[0]!.amount);
    assert.equal(none.taxes[0]!.amount, 6583, '$2,000 a month: ($24,000 - $16,100) x 10% = $790 a year = $65.83');
    assert.match(none.taxes[0]!.detail!, /no Form W-4P \(treated as Single, no entries\)/);
  });
});

describe('Form W-4P entries', () => {
  test('Step 3 credits come off the annual tax before it is divided into payments', () => {
    assert.equal(withheld(pay(200_000, { kind: 'periodic', w4p: { credits: 40_000 } })), Math.round((79_000 - 40_000) / 12));
    assert.equal(withheld(pay(200_000, { kind: 'periodic', w4p: { credits: 220_000 } })), 0, 'credits larger than the tax leave nothing, never a negative');
  });

  test('Steps 4(a) and 4(b) move the annual payments, and 4(c) is added to each payment', () => {
    const base = withheld(pay(200_000, { kind: 'periodic' }));
    assert.ok(withheld(pay(200_000, { kind: 'periodic', w4p: { otherIncome: 1_000_000 } })) > base);
    assert.ok(withheld(pay(200_000, { kind: 'periodic', w4p: { deductions: 500_000 } })) < base);
    assert.equal(withheld(pay(200_000, { kind: 'periodic', w4p: { extraWithholding: 2_500 } })), base + 2_500);
  });

  test('"No withholding" withholds nothing, unless the payment is delivered outside the United States', () => {
    assert.equal(withheld(pay(500_000, { kind: 'periodic', w4p: { noWithholding: true } })), 0);
    const abroad = calculatePaycheck(pay(500_000, { kind: 'periodic', w4p: { noWithholding: true }, deliveredOutsideUS: true }));
    assert.equal(abroad.taxes[0]!.amount, withheld(pay(500_000, { kind: 'periodic' })), 'withheld as Single with no entries');
    assert.match(abroad.taxes[0]!.detail!, /not honored/);
  });

  test('Step 2(b)(iii): withholding is the extra tax the other jobs and pensions call for (Worksheet 1B Parts I-III)', () => {
    // Single, $2,000 a month, $40,000 a year of other pay. Tax on the two together less tax on the other alone:
    // tax(40,000 + 24,000) - tax(40,000), each from the W-4R marginal rates, is the whole-year extra tax.
    const expectedAnnual = irsTaxCents('single', 64_000) - irsTaxCents('single', 40_000);
    const engine = withheld(pay(200_000, { kind: 'periodic', w4p: { multiplePensionsAmount: 4_000_000 } }));
    assert.ok(Math.abs(engine - Math.round(expectedAnnual / 12)) <= 1, `${engine} vs ${Math.round(expectedAnnual / 12)}`);
    assert.ok(engine > withheld(pay(200_000, { kind: 'periodic' })), 'more is withheld than with no other income');
  });

  test('a 2021-or-earlier Form W-4P: allowances x $4,300 off the annual payments, then the standard schedule', () => {
    // Married, 3 allowances, $2,000 a month: $24,000 - $12,900 = $11,100, inside the 0% band, so nothing.
    // The band ends where annual payments reach $32,200 ($2,683.33 a month); the IRS rounds that to the
    // "at least $2,690 per month" it quotes for a payee treated as married with three allowances.
    const married3 = (amount: number) => withheld(pay(amount, { kind: 'periodic', w4p: { form: '2021_or_earlier', maritalStatus: 'married', allowances: 3 } }));
    assert.equal(married3(200_000), 0);
    assert.equal(married3(268_333), 0);
    assert.ok(married3(269_000) > 0, 'a $2,690 payment is the first the IRS figure shows tax on');
    // Single with no allowances: the old form has no standard-deduction line, so nothing is subtracted:
    // $24,000 is taxed on the standard schedule, $1,240 + ($24,000 - $19,900) x 12% = $1,732 a year = $144.33 a month.
    assert.equal(withheld(pay(200_000, { kind: 'periodic', w4p: { form: '2021_or_earlier', maritalStatus: 'single', allowances: 0 } })), 14_433);
    const three = withheld(pay(200_000, { kind: 'periodic', w4p: { form: '2021_or_earlier', maritalStatus: 'single', allowances: 3 } }));
    assert.equal(withheld(pay(200_000, { kind: 'periodic', w4p: { form: '2021_or_earlier', maritalStatus: 'single', allowances: 3, extraWithholding: 1_000 } })), three + 1_000, 'line 3 is added to each payment');
    assert.ok(three < 14_433, 'allowances lower the withholding');
  });
});

describe('what a pension payment is not', () => {
  test('no Social Security, Medicare, FUTA, unemployment or state tax, one federal line, and a warning that says so', () => {
    const r = calculatePaycheck(pay(500_000, { kind: 'periodic' }, 'monthly', { workState: { code: 'OH', certificate: {} } }));
    assert.deepEqual(r.taxes.map((t) => t.id), ['US_FIT_PENSION']);
    assert.equal(r.employerTaxTotal, 0);
    assert.equal(r.netPay, 500_000 - r.taxes[0]!.amount);
    assert.match(r.warnings!.join(' '), /State and local income tax withholding on pension payments is not calculated/);
  });

  test('post-tax deductions come out of the payment; pre-tax deductions are refused', () => {
    const r = calculatePaycheck(pay(500_000, { kind: 'periodic' }, 'monthly', { deductions: [{ code: 'INS', category: null, amount: 12_000 }] }));
    assert.equal(r.posttaxDeductions, 12_000);
    assert.equal(r.netPay, 500_000 - r.taxes[0]!.amount - 12_000);
    assert.throws(() => calculatePaycheck(pay(500_000, { kind: 'periodic' }, 'monthly', { deductions: [{ code: '401K', category: 'deferral_401k', amount: 1_000 }] })), /no pre-tax deductions/);
  });

  test('only the taxable part of the payment is withheld on', () => {
    const whole = withheld(pay(600_000, { kind: 'nonperiodic' }));
    const part = calculatePaycheck(pay(600_000, { kind: 'nonperiodic', taxableAmount: 250_000 }));
    assert.equal(whole, 60_000);
    assert.equal(part.taxes[0]!.amount, 25_000);
    assert.equal(part.taxes[0]!.taxableWages, 250_000);
    assert.throws(() => calculatePaycheck(pay(600_000, { kind: 'nonperiodic', taxableAmount: 700_000 })), /taxableAmount/);
  });

  test('payment frequencies Pub 15-T does not list are refused, not guessed', () => {
    for (const f of ['quarterly', 'semiannual', 'annual'] as const) {
      assert.throws(() => calculatePaycheck(pay(500_000, { kind: 'periodic' }, f)), (e: unknown) => e instanceof CannotComputeError && /Table 4/.test((e as Error).message));
    }
    for (const f of ['monthly', 'semimonthly', 'biweekly', 'weekly', 'daily'] as const) assert.doesNotThrow(() => calculatePaycheck(pay(500_000, { kind: 'periodic' }, f)));
  });

  test('a year this build has not checked is refused', () => {
    assert.throws(() => calculatePaycheck(pay(500_000, { kind: 'periodic' }, 'monthly', { checkDate: '2025-06-15' })), CannotComputeError);
  });

  test('nonresident aliens are refused: the methods do not apply to them', () => {
    assert.throws(() => calculatePaycheck(pay(500_000, { kind: 'periodic' }, 'monthly', { federalW4: { ...W4, nonresidentAlien: true } as PaycheckInput['federalW4'] })), /nonresident aliens/);
  });
});

describe('Form W-4R: nonperiodic payments and eligible rollover distributions', () => {
  test('nonperiodic: 10% by default, any whole percent from 0 to 100 when chosen', () => {
    assert.equal(withheld(pay(1_000_000, { kind: 'nonperiodic' })), 100_000);
    assert.equal(withheld(pay(1_000_000, { kind: 'nonperiodic', w4r: { withholdingRate: 0 } })), 0);
    assert.equal(withheld(pay(1_000_000, { kind: 'nonperiodic', w4r: { withholdingRate: 19 } })), 190_000);
    assert.equal(withheld(pay(1_000_000, { kind: 'nonperiodic', w4r: { withholdingRate: 100 } })), 1_000_000);
  });

  test('nonperiodic delivered outside the United States cannot go below 10%', () => {
    assert.equal(withheld(pay(1_000_000, { kind: 'nonperiodic', w4r: { withholdingRate: 0 }, deliveredOutsideUS: true })), 100_000);
    assert.equal(withheld(pay(1_000_000, { kind: 'nonperiodic', w4r: { withholdingRate: 25 }, deliveredOutsideUS: true })), 250_000);
  });

  test('eligible rollover: 20% by default, a higher rate may be chosen, a lower one never', () => {
    assert.equal(withheld(pay(1_000_000, { kind: 'eligible_rollover' })), 200_000);
    assert.equal(withheld(pay(1_000_000, { kind: 'eligible_rollover', w4r: { withholdingRate: 30 } })), 300_000);
    const lower = calculatePaycheck(pay(1_000_000, { kind: 'eligible_rollover', w4r: { withholdingRate: 0 } }));
    assert.equal(lower.taxes[0]!.amount, 200_000);
    assert.match(lower.taxes[0]!.detail!, /cannot be withheld below 20%/);
  });

  test('the rate is rounded to the cent, half up', () => {
    assert.equal(withheld(pay(10_005, { kind: 'nonperiodic' })), 1_001);
    assert.equal(withheld(pay(333, { kind: 'nonperiodic', w4r: { withholdingRate: 19 } })), 63);
  });

  test('a rate that is not a whole percent from 0 to 100 is refused', () => {
    for (const rate of [-1, 101, 12.5, Number.NaN]) {
      assert.throws(() => calculatePaycheck(pay(1_000_000, { kind: 'nonperiodic', w4r: { withholdingRate: rate } })), /whole-number percent/);
    }
  });

  test('wages are unaffected: a paycheck without pension still runs the wage path', () => {
    const wages = calculatePaycheck({ ...pay(300_000, { kind: 'periodic' }), pension: undefined, payFrequency: 'biweekly', workState: { code: 'TX' } } as PaycheckInput);
    assert.ok(wages.taxes.some((t) => t.id === 'US_SS_EE'));
    assert.ok(wages.taxes.some((t) => t.id === 'US_FIT'));
    assert.equal(wages.taxes.some((t) => t.id === 'US_FIT_PENSION'), false);
  });
});

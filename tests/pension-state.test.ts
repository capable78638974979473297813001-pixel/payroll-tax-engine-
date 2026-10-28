import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { calculatePaycheck } from '../src/calculate.ts';
import { CannotComputeError } from '../src/registry.ts';
import type { PaycheckInput, PensionPayment } from '../src/types.ts';

/**
 * State withholding on pension, annuity and IRA payments. Every expected number is worked by hand
 * from the rule the state's revenue agency publishes (see data/pension/state-withholding-2026.json).
 */

const DATA = JSON.parse(readFileSync(new URL('../data/pension/state-withholding-2026.json', import.meta.url), 'utf8')) as {
  states: Record<string, { status: string; sources?: Array<{ url: string; readOn: string }>; electable?: string[] }>;
};

const pay = (state: string, pension: PensionPayment, amount = 300_000, extra: Partial<PaycheckInput> = {}): PaycheckInput => ({
  checkDate: '2026-06-15',
  payFrequency: 'monthly',
  earnings: [{ code: 'PENSION', category: 'regular', amount }],
  deductions: [],
  pension,
  residenceState: { code: state },
  ...extra,
} as PaycheckInput);

const stateLine = (input: PaycheckInput) => calculatePaycheck(input).taxes.find((t) => t.id.endsWith('_PENSION_SIT'));
const stateAmount = (input: PaycheckInput) => stateLine(input)?.amount;
const fed = (input: PaycheckInput) => calculatePaycheck(input).taxes.find((t) => t.id === 'US_FIT_PENSION')!.amount;

describe('flat defaults a state publishes', () => {
  test('Connecticut 6.99%, Minnesota 6.25%, Michigan 4.25%, Iowa 3.8%, on a $3,000 payment', () => {
    assert.equal(stateAmount(pay('CT', { kind: 'periodic' })), 20_970);
    assert.equal(stateAmount(pay('MN', { kind: 'periodic' })), 18_750);
    assert.equal(stateAmount(pay('MI', { kind: 'periodic' })), 12_750);
    assert.equal(stateAmount(pay('IA', { kind: 'periodic' })), 11_400);
  });

  test('nonperiodic and rollover rates: AR 3% and 5%, NC 4%, NE 3.5%, CT 6.99%', () => {
    const amt = 1_000_000;
    assert.equal(stateAmount(pay('AR', { kind: 'nonperiodic' }, amt)), 30_000);
    assert.equal(stateAmount(pay('AR', { kind: 'eligible_rollover' }, amt)), 50_000);
    assert.equal(stateAmount(pay('NC', { kind: 'nonperiodic' }, amt)), 40_000);
    assert.equal(stateAmount(pay('ME', { kind: 'nonperiodic' }, amt)), 50_000);
    assert.equal(stateAmount(pay('GA', { kind: 'nonperiodic' }, amt)), undefined, 'Georgia withholds a lump sum only if the payee elects it');
    assert.equal(stateAmount(pay('NC', { kind: 'eligible_rollover' }, amt)), 40_000);
    assert.equal(stateAmount(pay('NE', { kind: 'nonperiodic' }, amt)), 35_000);
    assert.equal(stateAmount(pay('CT', { kind: 'nonperiodic' }, amt)), 69_900);
  });

  test('Vermont is 30% and California 10% of the federal withholding', () => {
    const amt = 1_000_000;
    const vt = pay('VT', { kind: 'nonperiodic' }, amt);
    assert.equal(fed(vt), 100_000);
    assert.equal(stateAmount(vt), 30_000);
    const ca = pay('CA', { kind: 'eligible_rollover' }, amt);
    assert.equal(fed(ca), 200_000);
    assert.equal(stateAmount(ca), 20_000);
    const periodic = pay('CA', { kind: 'periodic' });
    assert.equal(stateAmount(periodic), Math.round(fed(periodic) / 10));
  });

  test('DC withholds 10.75% on a lump sum of the entire account, and says it does not know the rest', () => {
    const amt = 2_000_000;
    assert.equal(stateAmount(pay('DC', { kind: 'nonperiodic', entireAccountBalance: true }, amt)), 215_000);
    const r = calculatePaycheck(pay('DC', { kind: 'nonperiodic' }, amt));
    assert.equal(r.taxes.some((t) => t.id === 'DC_PENSION_SIT'), false);
    assert.match(r.warnings!.join(' '), /not calculated for DC/);
  });
});

describe('periodic payments withheld as on wages', () => {
  const wageTax = (state: string, certificate: Record<string, unknown> = {}, amount = 300_000) =>
    calculatePaycheck({
      checkDate: '2026-06-15', payFrequency: 'monthly', earnings: [{ code: 'REG', category: 'regular', amount }], deductions: [],
      federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
      ytd: { socialSecurity: 0, medicare: 0, futa: 0 }, workState: { code: state, certificate },
    } as PaycheckInput).taxes.find((t) => t.id === `${state}_SIT`)!.amount;

  test('each state matches its own wage withholding on the same amount', () => {
    assert.equal(stateAmount(pay('AR', { kind: 'periodic' })), wageTax('AR', { exemptions: 3 }), 'AR4P default: married, three allowances');
    for (const st of ['NC', 'NE', 'VT', 'VA', 'MA', 'ME', 'GA']) assert.equal(stateAmount(pay(st, { kind: 'periodic' })), wageTax(st), st);
  });

  test("the payee's certificate replaces the default", () => {
    const withCert = pay('AR', { kind: 'periodic', stateElection: { certificate: { exemptions: 0 } } });
    assert.equal(stateAmount(withCert), wageTax('AR', { exemptions: 0 }));
    assert.ok(stateAmount(withCert)! > stateAmount(pay('AR', { kind: 'periodic' }))!, 'fewer allowances withhold more');
    assert.equal(stateAmount(pay('MI', { kind: 'periodic', stateElection: { certificate: { allowances: 2 } } })), wageTax('MI', { allowances: 2 }));
  });

  test('a certificate is not used for a lump sum except California', () => {
    assert.equal(stateAmount(pay('NC', { kind: 'nonperiodic', stateElection: { certificate: { allowances: 5 } } }, 1_000_000)), 40_000);
  });
});

describe('Oklahoma and Maryland, from their own regulation and release', () => {
  test('Oklahoma: periodic as wages (married, three allowances by default); nonperiodic at the 4.5% top rate', () => {
    const wage = (cert: Record<string, unknown>) => calculatePaycheck({
      checkDate: '2026-06-15', payFrequency: 'monthly', earnings: [{ code: 'REG', category: 'regular', amount: 300_000 }], deductions: [],
      federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
      ytd: { socialSecurity: 0, medicare: 0, futa: 0 }, workState: { code: 'OK', certificate: cert },
    } as PaycheckInput).taxes.find((t) => t.id === 'OK_SIT')!.amount;
    assert.equal(stateAmount(pay('OK', { kind: 'periodic' })), wage({ filingStatus: 'married', allowances: 3 }));
    assert.equal(stateAmount(pay('OK', { kind: 'periodic', stateElection: { certificate: { filingStatus: 'single', allowances: 0 } } })), wage({ filingStatus: 'single', allowances: 0 }));
    assert.equal(stateAmount(pay('OK', { kind: 'nonperiodic' }, 1_000_000)), 45_000);
    assert.equal(stateAmount(pay('OK', { kind: 'eligible_rollover' }, 1_000_000)), 45_000);
    assert.equal(stateAmount(pay('OK', { kind: 'nonperiodic', stateElection: { none: true } }, 1_000_000)), undefined);
  });

  test('Maryland: 7.75% on an eligible rollover distribution with no opt-out; anything else only when the payee asks', () => {
    assert.equal(stateAmount(pay('MD', { kind: 'eligible_rollover' }, 1_000_000)), 77_500);
    assert.throws(() => calculatePaycheck(pay('MD', { kind: 'eligible_rollover', stateElection: { none: true } })), /opt out/);
    assert.equal(stateAmount(pay('MD', { kind: 'periodic' })), undefined);
    assert.equal(stateAmount(pay('MD', { kind: 'nonperiodic' }, 1_000_000)), undefined);
    assert.equal(stateAmount(pay('MD', { kind: 'periodic', stateElection: { amount: 5_000 } })), 5_000);
  });
});

describe('states that only withhold when asked', () => {
  test('nothing by default, with a warning that says why', () => {
    for (const st of ['AL', 'AZ', 'ID', 'IL', 'IN', 'LA', 'MO', 'NJ', 'NM', 'NY', 'ND', 'WI']) {
      const r = calculatePaycheck(pay(st, { kind: 'periodic' }));
      assert.equal(r.taxes.some((t) => t.id.endsWith('_PENSION_SIT')), false, st);
      assert.match(r.warnings!.join(' '), new RegExp(`${st} withholds on pension payments only when the payee asks`), st);
    }
  });

  test('a percent or amount the payee asks for is withheld', () => {
    assert.equal(stateAmount(pay('AL', { kind: 'periodic', stateElection: { percent: 2 } })), 6_000);
    assert.equal(stateAmount(pay('NY', { kind: 'periodic', stateElection: { amount: 2_500 } })), 2_500);
    assert.equal(stateAmount(pay('AZ', { kind: 'nonperiodic', stateElection: { percent: 2.5 } }, 1_000_000)), 25_000);
  });

  test("Arizona's A-4P offers half-point steps from 0.5% to 3.5%", () => {
    assert.throws(() => calculatePaycheck(pay('AZ', { kind: 'periodic', stateElection: { percent: 2.7 } })), CannotComputeError);
    assert.throws(() => calculatePaycheck(pay('AZ', { kind: 'periodic', stateElection: { percent: 4 } })), /allows only these percentages/);
  });

  test('Mississippi withholds nothing and says retirement income is not taxed', () => {
    const r = calculatePaycheck(pay('MS', { kind: 'periodic' }));
    assert.equal(r.taxes.length, 1);
    assert.match(r.warnings!.join(' '), /not subject to Mississippi income tax/);
  });
});

describe('what a payee may and may not choose', () => {
  const refuses = (input: PaycheckInput, re: RegExp) => assert.throws(() => calculatePaycheck(input), (e: unknown) => e instanceof CannotComputeError && re.test(e.message));

  test('opting out', () => {
    assert.equal(stateAmount(pay('CA', { kind: 'periodic', stateElection: { none: true } })), undefined);
    assert.equal(stateAmount(pay('CT', { kind: 'nonperiodic', stateElection: { none: true } })), undefined);
    assert.equal(stateAmount(pay('NC', { kind: 'nonperiodic', stateElection: { none: true } }, 1_000_000)), undefined);
    refuses(pay('AR', { kind: 'eligible_rollover', stateElection: { none: true } }), /opt out/);
    refuses(pay('NC', { kind: 'eligible_rollover', stateElection: { none: true } }), /opt out/);
    refuses(pay('CT', { kind: 'nonperiodic', entireAccountBalance: true, stateElection: { none: true } }), /entire account balance/);
    refuses(pay('MI', { kind: 'periodic', stateElection: { none: true } }), /opt out/);
    // Alabama withholds nothing unless asked, so "none" is accepted and changes nothing.
    const al = calculatePaycheck(pay('AL', { kind: 'periodic', stateElection: { none: true } }));
    assert.equal(al.taxes.length, 1);
    assert.match(al.warnings!.join(' '), /only when the payee asks/);
  });

  test('a state that does not let a payee name a percent or amount says so', () => {
    refuses(pay('AR', { kind: 'periodic', stateElection: { amount: 5_000 } }), /dollar amount/);
    refuses(pay('NE', { kind: 'periodic', stateElection: { percent: 3 } }), /percentage/);
    refuses(pay('MS', { kind: 'periodic', stateElection: { percent: 3 } }), /percentage/);
  });

  test('one choice at a time, in whole cents', () => {
    refuses(pay('CA', { kind: 'periodic', stateElection: { percent: 2, amount: 100 } }), /only one of/);
    refuses(pay('CA', { kind: 'periodic', stateElection: { amount: 10.5 } }), /whole cents/);
  });

  test('an extra amount is added to what the state computes', () => {
    const base = stateAmount(pay('CT', { kind: 'periodic' }))!;
    assert.equal(stateAmount(pay('CT', { kind: 'periodic', stateElection: { additionalAmount: 1_000 } })), base + 1_000);
  });
});

describe('when a state does not withhold', () => {
  test('a payee who lives in a state with no income tax, or whose state is not checked, gets no state line and a reason', () => {
    const tx = calculatePaycheck(pay('TX', { kind: 'periodic' }));
    assert.equal(tx.taxes.length, 1);
    assert.match(tx.warnings!.join(' '), /TX has no state income tax/);
    for (const st of ['OH', 'KS', 'DE', 'OR', 'PA', 'CO', 'KY', 'SC']) {
      const r = calculatePaycheck(pay(st, { kind: 'periodic' }));
      assert.equal(r.taxes.length, 1, st);
      assert.match(r.warnings!.join(' '), new RegExp(`not calculated for ${st}`), st);
    }
  });

  test('the payee is withheld by their own state only: workState is the fallback, residenceState wins', () => {
    const viaWork = pay('CT', { kind: 'periodic' }) as PaycheckInput;
    delete (viaWork as { residenceState?: unknown }).residenceState;
    viaWork.workState = { code: 'CT' };
    assert.equal(stateAmount(viaWork), 20_970);
    const both = { ...viaWork, workState: { code: 'TX' }, residenceState: { code: 'CT' } } as PaycheckInput;
    assert.equal(stateAmount(both), 20_970);
  });

  test('NC and MA follow the federal opt-out; NE and VT too', () => {
    for (const st of ['NC', 'MA', 'NE', 'VT', 'ME']) {
      const r = calculatePaycheck(pay(st, { kind: 'periodic', w4p: { noWithholding: true } }));
      assert.equal(r.taxes.some((t) => t.id.endsWith('_PENSION_SIT')), false, st);
    }
    // A nonperiodic payee who set the federal rate to 0 owes no North Carolina tax either.
    assert.equal(stateAmount(pay('NC', { kind: 'nonperiodic', w4r: { withholdingRate: 0 } }, 1_000_000)), undefined);
    // An eligible rollover distribution cannot be opted out of, federally or in North Carolina.
    assert.equal(stateAmount(pay('NC', { kind: 'eligible_rollover', w4r: { withholdingRate: 0 } }, 1_000_000)), 40_000);
  });

  test('Iowa: nothing at 55 or older, disabled or a surviving spouse; 3.8% otherwise, with a warning when age is unknown', () => {
    const old = pay('IA', { kind: 'periodic' }, 300_000, { employee: { ageAtYearEnd: 67 } });
    assert.equal(stateAmount(old), undefined);
    assert.equal(stateAmount(pay('IA', { kind: 'periodic', stateElection: { retirementExclusion: true } })), undefined);
    assert.equal(stateAmount(pay('IA', { kind: 'periodic' }, 300_000, { employee: { ageAtYearEnd: 54 } })), 11_400);
    assert.equal(stateAmount(pay('IA', { kind: 'periodic', stateElection: { percent: 2 } }, 300_000, { employee: { ageAtYearEnd: 67 } })), 6_000);
    assert.match(calculatePaycheck(pay('IA', { kind: 'periodic' })).warnings!.join(' '), /ageAtYearEnd/);
  });

  test('Virginia and Massachusetts do periodic payments only; their other payments say so', () => {
    for (const st of ['VA', 'MA']) {
      const r = calculatePaycheck(pay(st, { kind: 'nonperiodic' }, 1_000_000));
      assert.equal(r.taxes.length, 1, st);
      assert.match(r.warnings!.join(' '), new RegExp(`not calculated for ${st}`), st);
    }
  });
});

describe('the result adds up', () => {
  test('net pay and totals include the state line; rounding to whole dollars applies to it', () => {
    const input = pay('CT', { kind: 'periodic', taxableAmount: 123_456 }, 300_000, { roundToWholeDollars: true });
    const r = calculatePaycheck(input);
    const f = r.taxes.find((t) => t.id === 'US_FIT_PENSION')!;
    const s = r.taxes.find((t) => t.id === 'CT_PENSION_SIT')!;
    assert.equal(s.taxableWages, 123_456);
    assert.equal(s.amount, 8_600); // 6.99% of $1,234.56 = $86.30, whole dollars
    assert.equal(r.employeeTaxTotal, f.amount + s.amount);
    assert.equal(r.netPay, 300_000 - r.employeeTaxTotal);
    assert.equal(r.employerTaxTotal, 0);
  });
});

describe('the rule file', () => {
  test('every checked state names where it was read, with a date, and only modelled states list a rule', () => {
    for (const [code, e] of Object.entries(DATA.states)) {
      if (e.status === 'not_modelled') continue;
      assert.ok(e.sources && e.sources.length > 0, `${code} has no source`);
      for (const s of e.sources!) {
        assert.match(s.url, /^https:\/\//, code);
        assert.match(s.readOn, /^\d{4}-\d{2}-\d{2}$/, code);
      }
    }
  });
});

describe('the published description names the states the file calculates', () => {
  test('api-spec lists exactly the modelled states', async () => {
    const { paycheckRequestSchema } = await import('../site/lib/api-spec.ts');
    const text = JSON.stringify(paycheckRequestSchema);
    const listed = /State withholding is calculated for ([^;]*?);/.exec(text)![1]!;
    const codes = [...listed.matchAll(/\b([A-Z]{2})\b/g)].map((m) => m[1]!).sort();
    const modelled = Object.entries(DATA.states).filter(([, e]) => e.status !== 'not_modelled').map(([c]) => c).sort();
    assert.deepEqual(codes, modelled);
  });
});

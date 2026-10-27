import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculatePaycheck } from '../src/calculate.ts';
// @ts-expect-error plain JS module shared with the browser
import {
  UNWIRED_FIELDS,
  PAY_ITEMS,
  createForm,
  buildPaycheckInput,
  coerceControl,
  fieldsForState,
  CalculatorInputError,
} from '../site/assets/calculator-form.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(REPO, p), 'utf8');

test('additional pay the engine cannot classify is named and never sent', () => {
  assert.deepEqual(UNWIRED_FIELDS, [
    'Delivery runs',
    'Shift differentials',
    'Paid time off',
    'Tips',
  ]);
  assert.deepEqual(PAY_ITEMS.map((p: { id: string }) => p.id), ['bonus', 'commission', 'overtime', 'reimbursement']);
  const form = createForm();
  form.grossPayMethod = 'perPeriod';
  form.grossPay = 1000;
  form.payItems = [
    { kind: 'bonus', amount: 100 },
    { kind: 'delivery', amount: 50 },
    { kind: 'tips', amount: 20 },
    { kind: 'shift', amount: 10 },
    { kind: 'pto', amount: 10 },
    { kind: 'commission', amount: 25 },
    { kind: 'overtime', amount: 40 },
    { kind: 'reimbursement', amount: 15 },
    { kind: 'bonus', amount: 0 },
  ];
  const out = buildPaycheckInput(form);
  assert.deepEqual(out.earnings.map((e: { code: string; category: string; amount: number; overtime?: boolean }) => ({
    code: e.code, category: e.category, amount: e.amount, overtime: e.overtime === true,
  })), [
    { code: 'REG', category: 'regular', amount: 100000, overtime: false },
    { code: 'BONUS', category: 'supplemental', amount: 10000, overtime: false },
    { code: 'COMM', category: 'supplemental', amount: 2500, overtime: false },
    { code: 'OT', category: 'regular', amount: 4000, overtime: true },
    { code: 'REIMB', category: 'reimbursement', amount: 1500, overtime: false },
  ]);
});

test('gross method, year-to-date, and federal flags map onto engine inputs', () => {
  const annual = createForm();
  annual.grossPay = 52000;
  annual.payFrequency = 'biweekly';
  annual.grossPayYTD = 1000;
  annual.filingStatus = 'married_joint';
  annual.multipleJobs = true;
  annual.dependentCredit = 2000;
  annual.otherIncome = 500;
  annual.w4Deductions = 100;
  annual.extraWithholding = 25;
  annual.roundToWholeDollars = true;
  annual.federalExempt = true;
  annual.voluntaryWithholdingAgreement = true;
  annual.employmentCategory = 'household';
  const a = buildPaycheckInput(annual);
  assert.equal(a.earnings[0].amount, 200000);
  assert.equal(a.workState, undefined);
  assert.equal(a.employmentCategory, 'household');
  assert.equal(a.roundToWholeDollars, true);
  assert.deepEqual(a.ytd, {
    socialSecurity: 100000,
    medicare: 100000,
    futa: 100000,
    categoryCashWages: 100000,
  });
  assert.equal(a.ytd.supplemental, undefined);
  assert.deepEqual(a.federalW4, {
    filingStatus: 'married_joint',
    multipleJobs: true,
    dependentCredit: 200000,
    otherIncome: 50000,
    deductions: 10000,
    extraWithholding: 2500,
    exempt: true,
    voluntaryWithholdingAgreement: true,
  });

  const period = createForm();
  period.grossPayMethod = 'perPeriod';
  period.grossPay = 2000.5;
  assert.equal(buildPaycheckInput(period).earnings[0].amount, 200050);
  assert.equal(buildPaycheckInput(period).employmentCategory, undefined);
  assert.equal(buildPaycheckInput(period).roundToWholeDollars, undefined);
  assert.equal(buildPaycheckInput(period).federalW4.exempt, undefined);

  const hourly = createForm();
  hourly.grossPayMethod = 'hourly';
  hourly.hourlyRate = 25;
  hourly.hoursPerPeriod = 40;
  const h = buildPaycheckInput(hourly);
  assert.equal(h.earnings[0].amount, 100000);
  assert.equal(h.hoursWorked, 40);

  const bad = createForm();
  bad.grossPay = -1;
  assert.throws(() => buildPaycheckInput(bad), CalculatorInputError);
});

test('state certificate money is cents, PSD stays a string, and residence is separate', () => {
  assert.equal(coerceControl({ key: 'additionalWithholding', type: 'money' }, '12.50', false), 1250);
  assert.equal(coerceControl({ key: 'workPSD', type: 'text' }, '510101', false), '510101');
  assert.equal(coerceControl({ key: 'exempt', type: 'boolean' }, false, false), undefined);
  assert.deepEqual(coerceControl({ key: 'localities', type: 'list' }, 'Kansas City, St. Louis', false), ['Kansas City', 'St. Louis']);

  const form = createForm();
  form.grossPayMethod = 'perPeriod';
  form.grossPay = 1500;
  form.stateCode = 'PA';
  form.workCertificate = {
    workPSD: '510101',
    residencePSD: '880000',
    additionalWithholding: 1250,
    exempt: false,
    locality: '',
  };
  form.residenceStateCode = 'NJ';
  form.residenceNexus = true;
  form.residenceVoluntary = true;
  form.residenceCertificate = { filingStatus: 'single' };
  const out = buildPaycheckInput(form);
  assert.equal(out.workState.code, 'PA');
  assert.equal(out.workState.certificate.workPSD, '510101');
  assert.equal(typeof out.workState.certificate.workPSD, 'string');
  assert.equal(out.workState.certificate.additionalWithholding, 1250);
  assert.equal(out.workState.certificate.exempt, undefined);
  assert.equal(out.workState.certificate.locality, undefined);
  assert.equal(out.residenceState.code, 'NJ');
  assert.deepEqual(out.residenceStateWithholding, { nexus: true, voluntary: true });
  assert.equal(out.ytd.stateUnemployment.PA, 0);

  const same = createForm();
  same.stateCode = 'MI';
  same.residenceStateCode = 'MI';
  same.residenceNexus = true;
  const mi = buildPaycheckInput(same);
  assert.equal(mi.residenceState, undefined);
  assert.equal(mi.residenceStateWithholding, undefined);
  assert.equal(mi.workState.code, 'MI');

  const registry = { MI: [{ key: 'allowances', label: 'Allowances', type: 'count' }] };
  const keys = fieldsForState('MI', registry).map((f: { key: string }) => f.key);
  assert.deepEqual(keys.slice(0, 3), ['exempt', 'additionalWithholding', 'allowances']);
  assert.ok(keys.includes('workCity'));
  assert.equal(fieldsForState('', registry).length, 0);

  const ran = calculatePaycheck(buildPaycheckInput({ ...createForm(), grossPayMethod: 'perPeriod', grossPay: 2000, stateCode: 'MI', workCertificate: { allowances: 1 } }));
  assert.equal(typeof ran.netPay, 'number');
  assert.ok(Array.isArray(ran.taxes));
});

test('the calculator page is the specified form, in order, with no census call and no invented key', () => {
  const html = read('site/sandbox.html');
  const js = read('site/assets/sandbox.js');
  const marks = [
    'Work Address (optional)',
    'Look up a street address to auto-fill the state and local jurisdiction fields below. Fill in Residence Address below too if it\'s different — several local taxes (NYC/Yonkers residency, Missouri\'s earnings tax, reciprocity) depend on comparing both.',
    'placeholder="e.g. 2 Woodward Ave"',
    'placeholder="e.g. Detroit"',
    'placeholder="e.g. MI"',
    'placeholder="e.g. 48226"',
    'Residence Address (optional)',
    'Where the employee lives, if different from where they work. Needed for residence-based local taxes (e.g. NYC/Yonkers residents) and for state reciprocity.',
    'placeholder="e.g. 233 Broadway"',
    'placeholder="e.g. Yonkers"',
    'placeholder="e.g. NY"',
    'placeholder="e.g. 10701"',
    'Look Up Jurisdiction(s)',
    'Federal taxes only',
    'Select a state to include state &amp; local taxes.',
    'Gross Pay ($)',
    'Annually',
    'Gross Pay YTD ($)',
    'Biweekly',
    'Bonuses, commissions, delivery runs, shift differentials, paid time off, tips and reimbursements. Each is taxed the way the law treats it; bonuses and delivery pay also feed the overtime calculation.',
    '+ Add pay item',
    'This engine implements the 2020-or-later Form W-4 only — there is no legacy pre-2020 allowance-based path.',
    'Federal Filing Status',
    'Step 3: Dependents Amount',
    'Step 2: Two Jobs',
    'Step 4a: Other Income',
    'Step 4b: Deductions',
    'Additional Federal Withholding (per cheque)',
    'Round Withholding to Whole Dollars',
    'Exempt from Federal Withholding',
    'Employment Category',
    'Drives Social Security/Medicare/FUTA treatment — this engine has no standalone "exempt from Social Security" or "exempt from Medicare" checkbox because those exemptions are always a consequence of the worker\'s category, never an independent election.',
    'Voluntary Federal Withholding Agreement',
    'Only matters for Clergy, Household, and Election Worker above — those categories are exempt from federal withholding by default; check this if the employer and employee agreed in writing to withhold anyway.',
    'No state selected. Select state above to see its withholding certificate fields.',
    '+ Add Deduction',
    'Fill in the form and press Calculate — the result appears here.',
  ];
  let at = -1;
  for (const mark of marks) {
    const next = html.indexOf(mark);
    assert.ok(next > at, mark);
    at = next;
  }
  assert.match(html, />Street Address</);
  assert.match(html, />Street</);
  assert.match(html, />ZIP Code</);
  assert.match(html, /<label for="addrResZip">ZIP</);
  assert.match(js, /\/v1\/paycheck/);
  assert.match(js, /\/v1\/address/);
  assert.match(js, /Create an account/);
  assert.match(js, /Example output\. This is not your calculation\./);
  assert.match(js, /This page does not issue a key/);
  assert.doesNotMatch(html + js, /geocoding\.geo\.census\.gov|Census geocoder|OMNIA_SANDBOX_KEY|sandbox-key/i);
  assert.doesNotMatch(html.replace(/\/assets\/sandbox\.(?:css|js)/g, ''), /\bsandbox\b/i);
});

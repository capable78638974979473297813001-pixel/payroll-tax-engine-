/**
 * Paycheck calculator → POST /v1/paycheck body.
 *
 * Dollar inputs become integer cents. A control the engine does not read
 * is not invented here: see UNWIRED_FIELDS. No DOM.
 */

export const PERIODS_PER_YEAR = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
  quarterly: 4,
  semiannual: 2,
  annual: 1,
  daily: 260,
};

/** Additional pay the engine taxes as its own earning category or flag. */
export const PAY_ITEMS = [
  { id: 'bonus', label: 'Bonus', category: 'supplemental', code: 'BONUS' },
  { id: 'commission', label: 'Commission', category: 'supplemental', code: 'COMM' },
  { id: 'overtime', label: 'Overtime', category: 'regular', code: 'OT', overtime: true },
  { id: 'reimbursement', label: 'Reimbursement', category: 'reimbursement', code: 'REIMB' },
];

/**
 * Named in the Additional Pay help, with no engine earning category.
 * They are not offered as pay items and are never sent.
 */
export const UNWIRED_FIELDS = [
  'Delivery runs',
  'Shift differentials',
  'Paid time off',
  'Tips',
];

export const DEDUCTION_KINDS = [
  ['section125', 'Section 125 (medical, dental, or vision)'],
  ['hsa', 'HSA'],
  ['fsa', 'Health FSA'],
  ['dependent_care', 'Dependent care'],
  ['deferral_401k', '401(k)'],
  ['deferral_403b', '403(b)'],
  ['deferral_457', '457(b)'],
  ['deferral_simple', 'SIMPLE'],
  ['commuter', 'Commuter'],
  ['posttax', 'Post-tax'],
];

const PRETAX = new Set(DEDUCTION_KINDS.map(([id]) => id).filter((id) => id !== 'posttax'));

/**
 * Local certificate fields the geocoder fills and the engine reads.
 * Kept beside the per-state registry (state-cert-fields.json), which is
 * the withholding-certificate metadata and does not list these.
 */
export const LOCAL_FIELDS = {
  PA: [
    { key: 'workPSD', label: 'Work PSD', type: 'text', hint: '6 digits. 88000 means out of state.' },
    { key: 'residencePSD', label: 'Residence PSD', type: 'text', hint: '6 digits. 88000 means the employee lives out of state.' },
  ],
  OH: [
    { key: 'workCity', label: 'Work city', type: 'text' },
    { key: 'residenceCity', label: 'Residence city', type: 'text' },
    { key: 'schoolDistrictCode', label: 'School district code', type: 'text', hint: '4 digits.' },
    { key: 'workJEDDId', label: 'JEDD', type: 'text' },
  ],
  MI: [
    { key: 'workCity', label: 'Work city', type: 'text' },
    { key: 'residenceCity', label: 'Residence city', type: 'text' },
  ],
  AL: [
    { key: 'workCity', label: 'Work city', type: 'text' },
    { key: 'residenceCity', label: 'Residence city', type: 'text' },
    { key: 'workCounty', label: 'Work county', type: 'text' },
  ],
  KY: [
    { key: 'workCity', label: 'Work city', type: 'text' },
    { key: 'residenceCity', label: 'Residence city', type: 'text' },
    { key: 'workCounty', label: 'Work county', type: 'text' },
    { key: 'residenceCounty', label: 'Residence county', type: 'text' },
    { key: 'workSchoolDistrict', label: 'Work school district', type: 'text' },
    { key: 'residenceSchoolDistrict', label: 'Residence school district', type: 'text' },
  ],
  MD: [{ key: 'county', label: 'County', type: 'text' }],
  IN: [{ key: 'county', label: 'County', type: 'text' }],
  NY: [
    { key: 'nycResident', label: 'New York City resident', type: 'boolean' },
    { key: 'yonkersResident', label: 'Yonkers resident', type: 'boolean' },
    { key: 'yonkersNonresidentWorker', label: 'Yonkers nonresident worker', type: 'boolean' },
    { key: 'nycExemptions', label: 'NYC exemptions', type: 'count' },
    { key: 'additionalWithholdingNYC', label: 'Extra NYC withholding, per cheque', type: 'money' },
    { key: 'additionalWithholdingYonkers', label: 'Extra Yonkers withholding, per cheque', type: 'money' },
  ],
  OR: [
    { key: 'metroDistrict', label: 'Metro district', type: 'boolean' },
    { key: 'multnomahCounty', label: 'Multnomah County', type: 'boolean' },
    { key: 'locality', label: 'Locality', type: 'text' },
  ],
  NJ: [
    { key: 'locality', label: 'Locality', type: 'text', hint: 'Newark, when the lookup did not set it.' },
  ],
  MO: [
    { key: 'locality', label: 'Locality', type: 'text', hint: 'Kansas City or St. Louis.' },
    { key: 'localities', label: 'Localities', type: 'list', hint: 'Comma-separated when more than one city applies.' },
  ],
  DE: [{ key: 'locality', label: 'Locality', type: 'text' }],
  WA: [{ key: 'locality', label: 'Locality', type: 'text' }],
  CO: [
    { key: 'locality', label: 'Locality', type: 'text' },
    { key: 'localMonthlyCompensation', label: 'Pay in this locality so far this month', type: 'money' },
    { key: 'localOPTWithheldThisMonth', label: 'Head tax already withheld this month', type: 'money' },
  ],
  WV: [
    { key: 'locality', label: 'Locality', type: 'text' },
    { key: 'wvLocalFeeAlreadyWithheld', label: 'Service fee already withheld this week', type: 'boolean' },
  ],
};

/** Certificate money the engine reads as cents, not as a raw dollar figure. */
export const MONEY_CERT_KEYS = new Set([
  'additionalWithholding',
  'reducedWithholding',
  'additionalWithholdingNYC',
  'additionalWithholdingYonkers',
  'totalAllowanceAmount',
  'exemptWages',
  'localMonthlyCompensation',
  'localOPTWithheldThisMonth',
  'stateTaxWithheldThisMonth',
  'severanceExemptYtd',
]);

/** Digit strings. Coercing them to numbers makes the engine skip the tax. */
const STRING_CODE_KEYS = new Set(['workPSD', 'residencePSD', 'schoolDistrictCode']);

const COVERAGE_CATEGORIES = new Set(['household', 'agricultural', 'election_worker']);

export function dollars(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}

export function centsToDollars(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return '';
  return (n / 100).toFixed(2);
}

export function localToday() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function createForm() {
  return {
    checkDate: localToday(),
    payFrequency: 'biweekly',
    grossPayMethod: 'annual',
    grossPay: 0,
    hourlyRate: 0,
    hoursPerPeriod: 0,
    grossPayYTD: 0,
    filingStatus: 'single',
    multipleJobs: false,
    dependentCredit: 0,
    otherIncome: 0,
    w4Deductions: 0,
    extraWithholding: 0,
    roundToWholeDollars: false,
    federalExempt: false,
    employmentCategory: 'standard',
    voluntaryWithholdingAgreement: false,
    stateCode: '',
    residenceStateCode: '',
    residenceNexus: false,
    residenceVoluntary: false,
    workCertificate: {},
    residenceCertificate: {},
    payItems: [],
    deductionItems: [],
    // A pension, annuity or IRA payment instead of wages. '' means wages.
    pensionKind: '',
    pensionTaxableAmount: '',
    pensionFilingStatus: 'single',
    pensionStep2: 0,
    pensionCredits: 0,
    pensionOtherIncome: 0,
    pensionDeductions: 0,
    pensionExtra: 0,
    pensionNoWithholding: false,
    pensionRate: '',
    pensionAbroad: false,
  };
}

/** Payment periods Pub 15-T Table 4 lists for periodic pension payments. */
export const PERIODIC_PENSION_FREQUENCIES = ['monthly', 'semimonthly', 'biweekly', 'weekly', 'daily'];

function buildPensionInput(form, gross) {
  const problems = [];
  const kind = form.pensionKind;
  if (kind === 'periodic' && !PERIODIC_PENSION_FREQUENCIES.includes(form.payFrequency)) {
    problems.push('A periodic pension payment can be paid monthly, semimonthly, biweekly, weekly or daily. Choose one of those pay frequencies.');
  }
  if (!(gross > 0)) problems.push('Enter the payment amount above $0.');
  const pretax = (form.deductionItems || []).some((item) => {
    const amount = dollars(item.amount);
    return Number.isFinite(amount) && amount > 0 && item.category !== 'posttax' && item.category != null;
  });
  if (pretax) problems.push('A pension payment takes no pre-tax deductions. Use Post-tax, or clear the deduction.');
  const pension = { kind };
  const taxable = String(form.pensionTaxableAmount ?? '').trim();
  if (taxable !== '') {
    const cents = dollars(taxable);
    if (!Number.isFinite(cents) || cents < 0) problems.push('Taxable amount must be a dollar amount of 0 or more.');
    else if (cents > gross) problems.push('Taxable amount cannot be more than the payment.');
    else pension.taxableAmount = cents;
  }
  if (form.pensionAbroad) pension.deliveredOutsideUS = true;
  if (kind === 'periodic') {
    const w4p = { form: '2022_or_later', filingStatus: form.pensionFilingStatus || 'single' };
    for (const [key, field] of [['multiplePensionsAmount', 'pensionStep2'], ['credits', 'pensionCredits'], ['otherIncome', 'pensionOtherIncome'], ['deductions', 'pensionDeductions'], ['extraWithholding', 'pensionExtra']]) {
      const cents = dollars(form[field] || 0);
      if (!Number.isFinite(cents) || cents < 0) problems.push(`${field} must be a dollar amount of 0 or more.`);
      else if (cents > 0) w4p[key] = cents;
    }
    if (form.pensionNoWithholding) w4p.noWithholding = true;
    pension.w4p = w4p;
  } else {
    const rate = String(form.pensionRate ?? '').trim();
    if (rate !== '') {
      const n = Number(rate);
      if (!Number.isInteger(n) || n < 0 || n > 100) problems.push('Withholding rate must be a whole number from 0 to 100.');
      else pension.w4r = { withholdingRate: n };
    }
  }
  if (problems.length) throw new CalculatorInputError(problems);
  return pension;
}

export class CalculatorInputError extends Error {
  constructor(problems) {
    super(problems.join(' '));
    this.name = 'CalculatorInputError';
    this.problems = problems;
  }
}

export function addressLine(street, city, state, zip) {
  const s = String(street || '').trim();
  const c = String(city || '').trim();
  const st = String(state || '').trim();
  const z = String(zip || '').trim();
  if (!s || !c || !st) return '';
  return `${s}, ${c}, ${st}${z ? ' ' + z : ''}`;
}

/** Withholding-certificate fields for one state, plus the local fields the geocoder fills. */
export function fieldsForState(code, registry) {
  const state = String(code || '').toUpperCase();
  if (!state) return [];
  const reg = Array.isArray(registry?.[state]) ? registry[state] : [];
  const seen = new Set();
  const out = [];
  const push = (field) => {
    if (!field || seen.has(field.key)) return;
    seen.add(field.key);
    out.push(field);
  };
  push({ key: 'exempt', label: 'Exempt from state withholding', type: 'boolean' });
  push({ key: 'additionalWithholding', label: 'Additional state withholding (per cheque)', type: 'money' });
  for (const field of reg) push(field);
  for (const field of LOCAL_FIELDS[state] || []) push(field);
  return out;
}

/** Residence-state withholding certificate only. Local geography stays on the work certificate. */
export function residenceFieldsForState(code, registry) {
  const state = String(code || '').toUpperCase();
  if (!state) return [];
  const reg = Array.isArray(registry?.[state]) ? registry[state] : [];
  return reg.filter((field) => field && field.key !== 'exempt' && field.key !== 'additionalWithholding');
}

function cleanCert(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (STRING_CODE_KEYS.has(key)) {
      out[key] = String(value);
      continue;
    }
    out[key] = value;
  }
  return out;
}

/**
 * A typed certificate control → the value the engine stores.
 * Money fields in MONEY_CERT_KEYS are cents. Lookup results are already
 * in engine units and must not be converted again.
 */
export function coerceControl(field, raw, fromEngine) {
  if (fromEngine) {
    if (raw === undefined || raw === null || raw === '' || raw === false) return undefined;
    if (field?.type === 'list' && typeof raw === 'string') {
      const items = raw.split(',').map((s) => s.trim()).filter(Boolean);
      return items.length ? items : undefined;
    }
    return raw;
  }
  if (!field) return undefined;
  if (field.type === 'boolean') return raw === true ? true : undefined;
  if (field.type === 'list') {
    const items = String(raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    return items.length ? items : undefined;
  }
  if (raw === undefined || raw === null || String(raw).trim() === '') return undefined;
  if (field.type === 'money' || MONEY_CERT_KEYS.has(field.key)) {
    const cents = dollars(raw);
    if (!Number.isFinite(cents)) return undefined;
    return cents;
  }
  if (field.type === 'count') {
    const n = Math.round(Number(raw));
    return Number.isFinite(n) ? n : undefined;
  }
  if (field.options) {
    const match = field.options.find((o) => String(o.value) === String(raw));
    return match ? match.value : String(raw).trim();
  }
  if (STRING_CODE_KEYS.has(field.key)) return String(raw).trim();
  return String(raw).trim();
}

function periodGrossCents(form) {
  const periods = PERIODS_PER_YEAR[form.payFrequency];
  if (form.grossPayMethod === 'annual') return Math.round(dollars(form.grossPay) / periods);
  if (form.grossPayMethod === 'hourly') return Math.round(dollars(form.hourlyRate) * Number(form.hoursPerPeriod || 0));
  return dollars(form.grossPay);
}

export function buildPaycheckInput(form) {
  const problems = [];
  if (!form.checkDate || !/^\d{4}-\d{2}-\d{2}$/.test(form.checkDate)) {
    problems.push('Check date must be yyyy-mm-dd.');
  }
  if (!PERIODS_PER_YEAR[form.payFrequency]) problems.push('Choose a pay frequency.');
  if (!form.filingStatus) problems.push('Choose a federal filing status.');
  if (!['annual', 'perPeriod', 'hourly'].includes(form.grossPayMethod)) problems.push('Choose a gross pay method.');
  const gross = periodGrossCents(form);
  if (!Number.isFinite(gross) || gross < 0) problems.push('Gross pay cannot be negative.');
  if (problems.length) throw new CalculatorInputError(problems);

  if (form.pensionKind) {
    // A pension, annuity or IRA payment is not wages: one payment, post-tax deductions only, no state or W-4.
    const pension = buildPensionInput(form, gross);
    const deductions = [];
    for (const item of form.deductionItems || []) {
      const amount = dollars(item.amount);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      deductions.push({ code: String(item.code || '').trim() || 'DED', category: null, amount });
    }
    return {
      checkDate: form.checkDate,
      payFrequency: form.payFrequency,
      earnings: [{ code: 'PENSION', category: 'regular', amount: gross }],
      deductions,
      pension,
    };
  }

  const earnings = [{ code: 'REG', category: 'regular', amount: gross }];
  const seen = new Set(['REG']);
  for (const item of form.payItems || []) {
    const spec = PAY_ITEMS.find((p) => p.id === item.kind);
    if (!spec) continue;
    const amount = dollars(item.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    let code = spec.code;
    if (seen.has(code)) code = spec.code + (seen.size + 1);
    seen.add(code);
    const row = { code, category: spec.category, amount };
    if (spec.overtime) row.overtime = true;
    earnings.push(row);
  }

  const deductions = [];
  for (const item of form.deductionItems || []) {
    const amount = dollars(item.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const category = item.category === 'posttax' || item.category == null ? null : item.category;
    if (category != null && !PRETAX.has(category)) continue;
    const code = String(item.code || '').trim() || 'DED';
    deductions.push({ code, category, amount });
  }

  const ytdCents = dollars(form.grossPayYTD || 0);
  const state = String(form.stateCode || '').trim().toUpperCase();
  const home = String(form.residenceStateCode || '').trim().toUpperCase();
  const ytd = {
    socialSecurity: Number.isFinite(ytdCents) ? ytdCents : 0,
    medicare: Number.isFinite(ytdCents) ? ytdCents : 0,
    futa: Number.isFinite(ytdCents) ? ytdCents : 0,
  };
  if (state) ytd.stateUnemployment = { [state]: ytd.socialSecurity };
  if (COVERAGE_CATEGORIES.has(form.employmentCategory)) ytd.categoryCashWages = ytd.socialSecurity;

  const federalW4 = {
    filingStatus: form.filingStatus,
    multipleJobs: form.multipleJobs === true,
    dependentCredit: dollars(form.dependentCredit || 0),
    otherIncome: dollars(form.otherIncome || 0),
    deductions: dollars(form.w4Deductions || 0),
    extraWithholding: dollars(form.extraWithholding || 0),
  };
  if (form.federalExempt) federalW4.exempt = true;
  if (form.voluntaryWithholdingAgreement) federalW4.voluntaryWithholdingAgreement = true;

  const input = {
    checkDate: form.checkDate,
    payFrequency: form.payFrequency,
    earnings,
    deductions,
    federalW4,
    ytd,
  };
  if (form.grossPayMethod === 'hourly' && Number(form.hoursPerPeriod) > 0) {
    input.hoursWorked = Number(form.hoursPerPeriod);
  }
  if (form.employmentCategory && form.employmentCategory !== 'standard') {
    input.employmentCategory = form.employmentCategory;
  }
  if (form.roundToWholeDollars) input.roundToWholeDollars = true;
  if (state) {
    const certificate = cleanCert(form.workCertificate);
    input.workState = Object.keys(certificate).length ? { code: state, certificate } : { code: state };
  }
  if (home && home !== state) {
    const certificate = cleanCert(form.residenceCertificate);
    input.residenceState = Object.keys(certificate).length ? { code: home, certificate } : { code: home };
    if (form.residenceNexus || form.residenceVoluntary) {
      input.residenceStateWithholding = {};
      if (form.residenceNexus) input.residenceStateWithholding.nexus = true;
      if (form.residenceVoluntary) input.residenceStateWithholding.voluntary = true;
    }
  }
  return input;
}

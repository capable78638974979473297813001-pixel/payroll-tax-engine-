/**
 * Paycheck sandbox model: load an engine request, serialize it back,
 * map a 422 path to a step, and read a rate out of a tax line's detail.
 * No DOM. The page and the tests both use this file.
 */

export const STEPS = [
  { n: 1, name: 'Employee & addresses', title: 'Employee and addresses', next: 'work locations' },
  { n: 2, name: 'Work locations', title: 'Work locations', next: 'Federal W-4' },
  { n: 3, name: 'Federal W-4', title: 'Federal W-4', next: 'state & local' },
  { n: 4, name: 'State & local', title: 'State and local', next: 'earnings' },
  { n: 5, name: 'Earnings', title: 'Earnings', next: 'deductions & YTD' },
  { n: 6, name: 'Deductions & YTD', title: 'Deductions and year to date', next: 'employer' },
  { n: 7, name: 'Employer', title: 'Employer', next: 'review & run' },
  { n: 8, name: 'Review & run', title: 'Review and run', next: '' },
];

/** Named StateCertificate keys. Anything else is dropped and never sent. */
export const CERT_KEYS = new Set([
  'locality', 'localities', 'county', 'lowIncomeElection', 'workCounty', 'workCity',
  'residenceCounty', 'workSchoolDistrict', 'residenceSchoolDistrict', 'residenceCity',
  'workPSD', 'residencePSD', 'schoolDistrictCode', 'workJEDDId', 'nycResident',
  'yonkersResident', 'yonkersNonresidentWorker', 'nycExemptions', 'additionalWithholdingNYC',
  'additionalWithholdingYonkers', 'metroDistrict', 'multnomahCounty', 'localMonthlyCompensation',
  'localOPTWithheldThisMonth', 'localOPTEmployeeWithheldByOtherEmployer', 'stateTaxWithheldThisMonth',
  'wvLocalFeeAlreadyWithheld', 'daysWorkedInLocality', 'daysWorkedInMunicipality',
  'workCityIsPrincipalWorkplace', 'newarkResidentApportionmentExcluded', 'lstAlreadyWithheldElsewhere',
  'dailyCommuter', 'nonresidentDeMinimisEligible', 'nonresidentCreditEligible', 'daysWorkedInStateThisYear',
  'nonresident', 'exempt', 'exemptReason', 'additionalWithholding', 'reducedWithholding',
  'nonresidentAlien', 'voluntaryWithholdingAgreement', 'allowances', 'exemptions',
  'totalAllowanceAmount', 'personalAllowances', 'formVintage', 'spouseHasEarnedIncome',
  'dependents', 'exemptWages', 'maritalStatus', 'georgiaMaritalStatus', 'louisianaBlockA',
  'filingStatus', 'hawaiiMaritalStatus', 'withholdingCode', 'allowanceRate', 'rateTableOverride',
  'personalExemptionCode', 'spouseExemptionCode', 'alabamaExemptionCode', 'electedRate',
  'zeroElection', 'severanceExemptYtd', 'severanceApprovalOnFile', 'paidLeaveExempt',
  'paidLeaveEmployeeRateOverride', 'wacaresExempt', 'employerLiableForPaidLeaveShare',
]);

const MONEY_CERT = new Set([
  'additionalWithholding', 'reducedWithholding', 'additionalWithholdingNYC', 'additionalWithholdingYonkers',
  'totalAllowanceAmount', 'exemptWages', 'localMonthlyCompensation', 'localOPTWithheldThisMonth',
  'stateTaxWithheldThisMonth', 'severanceExemptYtd',
]);

const EARNING_CATS = new Set(['regular', 'supplemental', 'imputed', 'reimbursement', 'housing_allowance']);
const DEDUCTION_CATS = new Set([
  'section125', 'hsa', 'fsa', 'dependent_care', 'deferral_401k', 'deferral_403b', 'deferral_457',
  'deferral_simple', 'commuter',
]);

/** Wage bases copied from data/federal. The test checks they still match the files. */
export const WAGE_BASES = {
  2025: { socialSecurity: 176100, futa: 7000 },
  2026: { socialSecurity: 184500, futa: 7000 },
  2027: { socialSecurity: 184500, futa: 7000 },
};

const FILING = new Set(['single', 'married_joint', 'married_separate', 'head_of_household']);
const FREQS = new Set(['weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'semiannual', 'annual', 'daily']);

export function clone(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}

export function dollarsToCents(s) {
  const t = String(s ?? '').replace(/[$,\s]/g, '');
  if (t === '' || t === '.' || t === '-') return 0;
  const n = Number(t);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}

export function centsToDollars(c) {
  const n = Number(c);
  if (!Number.isFinite(n)) return '';
  return (n / 100).toFixed(2);
}

/** Three-decimal percent (3.650) → decimal rate (0.0365). */
export function percentToDecimal(s) {
  const t = String(s ?? '').replace(/[%\s]/g, '');
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 1000) / 100000;
}

export function decimalToPercent(n) {
  const pct = Math.round(Number(n) * 100000) / 1000;
  return pct.toFixed(3);
}

export function formatMoney(cents) {
  const n = Number(cents) / 100;
  const sign = n < 0 ? '−' : '';
  return sign + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Rate column. The response has no rate field. Read it from the detail
 * text (@ 6.2%, @ 3.650%, 22% flat, bracket 12%). A line with no rate is an em dash.
 */
export function parseRate(detail) {
  const d = String(detail ?? '');
  let m = d.match(/@\s*(\d+(?:\.\d+)?)%\s*flat/i);
  if (m) return `${m[1]}% flat`;
  m = d.match(/(\d+(?:\.\d+)?)%\s*flat/i);
  if (m) return `${m[1]}% flat`;
  m = d.match(/bracket\s+(\d+(?:\.\d+)?)%/i);
  if (m) return `${m[1]}% bracket`;
  m = d.match(/@\s*(\d+(?:\.\d+)?)%/);
  if (m) return `${m[1]}%`;
  return '—';
}

export function stepForPath(path) {
  const p = String(path ?? '');
  if (p.startsWith('federalW4')) return 3;
  if (p.startsWith('earnings') || p === 'hoursWorked' || p.startsWith('priorRegularPayment')) return 5;
  if (p.startsWith('deductions') || p.startsWith('ytd')) return 6;
  if (p.startsWith('employer') || p.startsWith('garnishments') || p.startsWith('minimumWageCheck')) return 7;
  if (p.startsWith('residenceStateWithholding') || p.startsWith('residenceState')) return 4;
  if (p.includes('workCityIsPrincipalWorkplace') || p.includes('daysWorked')) return 2;
  if (p.startsWith('workState')) return 4;
  if (p === 'checkDate' || p === 'payFrequency' || p === 'employmentCategory' || p === 'roundToWholeDollars') return 1;
  return 1;
}

function blankEarning() {
  return { code: 'REG', category: 'regular', amount: 0, overtime: false };
}

export function createModel() {
  return {
    checkDate: '2026-09-15',
    payFrequency: 'weekly',
    homeAddress: '',
    workAddress: '',
    employmentCategory: 'standard',
    roundToWholeDollars: false,
    principalWorkplace: true,
    daysMunicipality: '',
    daysState: '',
    daysLocality: '',
    filingStatus: 'single',
    multipleJobs: false,
    depChildren: '',
    depOther: '',
    dependentCredit: 0,
    creditManual: true,
    otherIncome: 0,
    w4Deductions: 0,
    extraWithholding: 0,
    w4Exempt: false,
    w4Nra: false,
    w4Voluntary: false,
    workCode: '',
    homeCode: '',
    workCert: {},
    homeCert: {},
    fromAddress: {},
    nexus: false,
    voluntaryWh: false,
    earnings: [blankEarning()],
    hoursWorked: '',
    priorWages: null,
    priorTax: null,
    deductions: [],
    ytdSS: 0,
    ytdMed: 0,
    ytdFuta: 0,
    ytdSui: null,
    ytdExtra: {},
    suiRate: '',
    employerExtra: {},
    garnishments: null,
    minimumWage: null,
    homeLookup: null,
    workLookup: null,
  };
}

function take(obj, key) {
  if (!obj || !Object.prototype.hasOwnProperty.call(obj, key)) return undefined;
  const v = obj[key];
  delete obj[key];
  return v;
}

function cleanCert(bag) {
  const out = {};
  if (!bag) return out;
  for (const [k, v] of Object.entries(bag)) {
    if (!CERT_KEYS.has(k)) continue;
    if (v === undefined || v === null || v === '' || v === false) continue;
    if (typeof v === 'number' && v === 0 && MONEY_CERT.has(k)) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

function putDays(cert, key, raw) {
  if (raw === '' || raw == null) return;
  const n = Number(raw);
  if (Number.isFinite(n)) cert[key] = n;
}

export function loadRequest(model, request) {
  const req = clone(request) || {};
  model.checkDate = typeof req.checkDate === 'string' ? req.checkDate : '';
  model.payFrequency = typeof req.payFrequency === 'string' ? req.payFrequency : 'weekly';
  model.homeAddress = '';
  model.workAddress = '';
  model.employmentCategory = typeof req.employmentCategory === 'string' ? req.employmentCategory : 'standard';
  model.roundToWholeDollars = req.roundToWholeDollars === true;
  model.homeLookup = null;
  model.workLookup = null;
  model.fromAddress = {};

  const work = req.workState && typeof req.workState === 'object' ? req.workState : {};
  const workCert = work.certificate && typeof work.certificate === 'object' ? work.certificate : {};
  model.workCode = typeof work.code === 'string' ? work.code : '';
  const principal = take(workCert, 'workCityIsPrincipalWorkplace');
  model.principalWorkplace = principal !== false;
  const dm = take(workCert, 'daysWorkedInMunicipality');
  const ds = take(workCert, 'daysWorkedInStateThisYear');
  const dl = take(workCert, 'daysWorkedInLocality');
  model.daysMunicipality = dm == null ? '' : String(dm);
  model.daysState = ds == null ? '' : String(ds);
  model.daysLocality = dl == null ? '' : String(dl);
  model.workCert = workCert;

  const home = req.residenceState && typeof req.residenceState === 'object' ? req.residenceState : null;
  model.homeCode = home && typeof home.code === 'string' && home.code !== model.workCode ? home.code : '';
  model.homeCert = home && home.certificate && typeof home.certificate === 'object' ? home.certificate : {};

  const hold = req.residenceStateWithholding && typeof req.residenceStateWithholding === 'object' ? req.residenceStateWithholding : {};
  model.nexus = hold.nexus === true;
  model.voluntaryWh = hold.voluntary === true;

  const w4 = req.federalW4 && typeof req.federalW4 === 'object' ? req.federalW4 : {};
  model.filingStatus = FILING.has(w4.filingStatus) ? w4.filingStatus : 'single';
  model.multipleJobs = w4.multipleJobs === true;
  model.dependentCredit = Number(w4.dependentCredit) || 0;
  model.creditManual = true;
  model.otherIncome = Number(w4.otherIncome) || 0;
  model.w4Deductions = Number(w4.deductions) || 0;
  model.extraWithholding = Number(w4.extraWithholding) || 0;
  model.w4Exempt = w4.exempt === true;
  model.w4Nra = w4.nonresidentAlien === true;
  model.w4Voluntary = w4.voluntaryWithholdingAgreement === true;
  const kids = Math.floor(model.dependentCredit / 200000);
  const rem = model.dependentCredit - kids * 200000;
  if (rem % 50000 === 0) {
    model.depChildren = String(kids);
    model.depOther = String(rem / 50000);
  } else {
    model.depChildren = '';
    model.depOther = '';
  }

  model.earnings = Array.isArray(req.earnings) && req.earnings.length
    ? req.earnings.map((e) => ({
      code: String(e.code ?? ''),
      category: EARNING_CATS.has(e.category) ? e.category : 'regular',
      amount: Number(e.amount) || 0,
      overtime: e.overtime === true,
    }))
    : [blankEarning()];
  model.hoursWorked = req.hoursWorked == null || req.hoursWorked === '' ? '' : String(req.hoursWorked);
  if (req.priorRegularPayment && typeof req.priorRegularPayment === 'object') {
    model.priorWages = Number(req.priorRegularPayment.taxableWages) || 0;
    model.priorTax = req.priorRegularPayment.stateIncomeTaxWithheld == null
      ? null
      : Number(req.priorRegularPayment.stateIncomeTaxWithheld) || 0;
  } else {
    model.priorWages = null;
    model.priorTax = null;
  }

  model.deductions = Array.isArray(req.deductions)
    ? req.deductions.map((d) => ({
      code: String(d.code ?? ''),
      category: d.category == null ? null : String(d.category),
      amount: Number(d.amount) || 0,
    }))
    : [];

  const ytd = req.ytd && typeof req.ytd === 'object' ? req.ytd : {};
  model.ytdSS = Number(ytd.socialSecurity) || 0;
  model.ytdMed = Number(ytd.medicare) || 0;
  model.ytdFuta = Number(ytd.futa) || 0;
  const sui = ytd.stateUnemployment && typeof ytd.stateUnemployment === 'object' ? { ...ytd.stateUnemployment } : null;
  if (sui && model.workCode && Object.prototype.hasOwnProperty.call(sui, model.workCode)) {
    model.ytdSui = Number(sui[model.workCode]) || 0;
    delete sui[model.workCode];
  } else {
    model.ytdSui = null;
  }
  model.ytdExtra = {};
  if (sui && Object.keys(sui).length) model.ytdExtra.stateUnemployment = sui;
  for (const k of ['supplemental', 'statePaidLeave', 'stateDisabilityEmployee', 'stateLongTermCare', 'localIncomeTax', 'electiveDeferrals', 'seattleCompensation', 'categoryCashWages', 'tier2Compensation', 'railroadMonthlyCompensation']) {
    if (ytd[k] !== undefined) model.ytdExtra[k] = clone(ytd[k]);
  }
  if (model.ytdExtra.supplemental != null) {
    /* supplemental is edited as its own field; keep it in ytdExtra for round trip */
  }

  const employer = req.employer && typeof req.employer === 'object' ? clone(req.employer) : {};
  const rates = employer.stateUnemploymentRate && typeof employer.stateUnemploymentRate === 'object' ? employer.stateUnemploymentRate : null;
  if (rates && model.workCode && rates[model.workCode] != null) {
    model.suiRate = decimalToPercent(rates[model.workCode]);
    delete rates[model.workCode];
    if (Object.keys(rates).length === 0) delete employer.stateUnemploymentRate;
  } else {
    model.suiRate = '';
  }
  model.employerExtra = employer;
  model.garnishments = Array.isArray(req.garnishments) ? clone(req.garnishments) : null;
  model.minimumWage = req.minimumWageCheck && typeof req.minimumWageCheck === 'object' ? clone(req.minimumWageCheck) : null;
  return model;
}

function earningOut(e) {
  if (!e || !EARNING_CATS.has(e.category)) return null;
  const code = String(e.code ?? '').trim();
  if (!code && !(Number(e.amount) > 0)) return null;
  const row = { code, category: e.category, amount: Math.round(Number(e.amount) || 0) };
  if (e.overtime === true) row.overtime = true;
  return row;
}

function deductionOut(d) {
  if (!d) return null;
  const code = String(d.code ?? '').trim();
  if (!code && !(Number(d.amount) > 0)) return null;
  const category = d.category == null || d.category === '' || d.category === 'null' ? null : d.category;
  if (category != null && !DEDUCTION_CATS.has(category)) return null;
  return { code, category, amount: Math.round(Number(d.amount) || 0) };
}

export function serialize(model) {
  const workCert = cleanCert(model.workCert);
  putDays(workCert, 'daysWorkedInMunicipality', model.daysMunicipality);
  putDays(workCert, 'daysWorkedInStateThisYear', model.daysState);
  putDays(workCert, 'daysWorkedInLocality', model.daysLocality);
  if (model.principalWorkplace === false) workCert.workCityIsPrincipalWorkplace = false;
  else delete workCert.workCityIsPrincipalWorkplace;

  const federalW4 = {
    filingStatus: model.filingStatus,
    multipleJobs: model.multipleJobs === true,
    dependentCredit: Math.round(Number(model.dependentCredit) || 0),
    otherIncome: Math.round(Number(model.otherIncome) || 0),
    deductions: Math.round(Number(model.w4Deductions) || 0),
    extraWithholding: Math.round(Number(model.extraWithholding) || 0),
  };
  if (model.w4Exempt) federalW4.exempt = true;
  if (model.w4Nra) federalW4.nonresidentAlien = true;
  if (model.w4Voluntary && model.employmentCategory === 'clergy') federalW4.voluntaryWithholdingAgreement = true;

  const ytd = {
    socialSecurity: Math.round(Number(model.ytdSS) || 0),
    medicare: Math.round(Number(model.ytdMed) || 0),
    futa: Math.round(Number(model.ytdFuta) || 0),
  };
  const extra = clone(model.ytdExtra) || {};
  if (extra.supplemental != null) ytd.supplemental = Math.round(Number(extra.supplemental) || 0);
  delete extra.supplemental;
  for (const k of ['statePaidLeave', 'stateDisabilityEmployee', 'stateLongTermCare', 'localIncomeTax', 'electiveDeferrals', 'seattleCompensation', 'categoryCashWages', 'tier2Compensation', 'railroadMonthlyCompensation']) {
    if (extra[k] !== undefined) ytd[k] = extra[k];
  }
  const sui = { ...(extra.stateUnemployment || {}) };
  if (model.ytdSui != null && model.workCode) sui[model.workCode] = Math.round(Number(model.ytdSui) || 0);
  if (Object.keys(sui).length) ytd.stateUnemployment = sui;

  const out = {
    checkDate: model.checkDate,
    payFrequency: model.payFrequency,
  };
  if (model.hoursWorked !== '' && model.hoursWorked != null) {
    const h = Number(model.hoursWorked);
    if (Number.isFinite(h)) out.hoursWorked = h;
  }
  out.earnings = model.earnings.map(earningOut).filter(Boolean);
  out.deductions = model.deductions.map(deductionOut).filter(Boolean);
  out.federalW4 = federalW4;
  out.ytd = ytd;

  if (model.workCode) {
    const work = { code: model.workCode };
    if (Object.keys(workCert).length) work.certificate = workCert;
    out.workState = work;
  }
  if (model.homeCode && model.homeCode !== model.workCode) {
    const homeCert = cleanCert(model.homeCert);
    const home = { code: model.homeCode };
    if (Object.keys(homeCert).length) home.certificate = homeCert;
    out.residenceState = home;
  }
  const reciprocal = model._reciprocal === true;
  if (!reciprocal && (model.nexus || model.voluntaryWh)) {
    const hold = {};
    if (model.nexus) hold.nexus = true;
    if (model.voluntaryWh) hold.voluntary = true;
    out.residenceStateWithholding = hold;
  }
  if (model.employmentCategory && model.employmentCategory !== 'standard') out.employmentCategory = model.employmentCategory;
  if (model.roundToWholeDollars) out.roundToWholeDollars = true;
  if (model.priorWages != null) {
    const prior = { taxableWages: Math.round(Number(model.priorWages) || 0) };
    if (model.priorTax != null) prior.stateIncomeTaxWithheld = Math.round(Number(model.priorTax) || 0);
    out.priorRegularPayment = prior;
  }

  const employer = clone(model.employerExtra) || {};
  delete employer.futaRate;
  delete employer.futa;
  if (model.suiRate !== '' && model.workCode) {
    const dec = percentToDecimal(model.suiRate);
    if (dec != null && !Number.isNaN(dec)) {
      employer.stateUnemploymentRate = { ...(employer.stateUnemploymentRate || {}), [model.workCode]: dec };
    }
  }
  for (const k of Object.keys(employer)) {
    if (employer[k] && typeof employer[k] === 'object' && !Array.isArray(employer[k]) && Object.keys(employer[k]).length === 0) delete employer[k];
  }
  if (Object.keys(employer).length) out.employer = employer;
  if (Array.isArray(model.garnishments) && model.garnishments.length) out.garnishments = clone(model.garnishments);
  if (model.minimumWage && typeof model.minimumWage === 'object' && model.minimumWage.hourlyRate != null) {
    out.minimumWageCheck = clone(model.minimumWage);
  }
  return out;
}

export function stepSlice(full, step) {
  const pick = (keys) => {
    const o = {};
    for (const k of keys) if (full[k] !== undefined) o[k] = full[k];
    return o;
  };
  if (step === 1) return pick(['checkDate', 'payFrequency', 'employmentCategory', 'roundToWholeDollars']);
  if (step === 2) return pick(['workState']);
  if (step === 3) return pick(['federalW4']);
  if (step === 4) return pick(['workState', 'residenceState', 'residenceStateWithholding']);
  if (step === 5) return pick(['earnings', 'hoursWorked', 'priorRegularPayment']);
  if (step === 6) return pick(['deductions', 'ytd']);
  if (step === 7) return pick(['employer', 'garnishments', 'minimumWageCheck']);
  return full;
}

function moneyOk(n) {
  return Number.isFinite(n) && n >= 0 && Number.isInteger(n);
}

export function validateStep(model, step, ctx) {
  const errors = [];
  const bad = (path, message) => errors.push({ path, message });
  const years = (ctx && ctx.supportedYears) || [2025, 2026, 2027];
  if (step === 1) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(model.checkDate || '')) bad('checkDate', 'Enter a check date.');
    else {
      const y = Number(model.checkDate.slice(0, 4));
      if (!years.includes(y)) {
        const a = years[0];
        const b = years[years.length - 1];
        bad('checkDate', `We have rules for ${a}–${b}.`);
      }
    }
    if (!FREQS.has(model.payFrequency)) bad('payFrequency', 'Choose a pay frequency.');
    if ((model.homeAddress || '').length > 200) bad('homeAddress', 'An address can be at most 200 characters.');
    if ((model.workAddress || '').length > 200) bad('workAddress', 'An address can be at most 200 characters.');
  }
  if (step === 2) {
    for (const [path, raw] of [['workState.certificate.daysWorkedInMunicipality', model.daysMunicipality], ['workState.certificate.daysWorkedInStateThisYear', model.daysState], ['workState.certificate.daysWorkedInLocality', model.daysLocality]]) {
      if (raw === '' || raw == null) continue;
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0 || n > 366) bad(path, 'Enter a whole number from 0 to 366.');
    }
  }
  if (step === 3) {
    if (!FILING.has(model.filingStatus)) bad('federalW4.filingStatus', 'Choose a filing status.');
    for (const [path, n] of [['federalW4.dependentCredit', model.dependentCredit], ['federalW4.otherIncome', model.otherIncome], ['federalW4.deductions', model.w4Deductions], ['federalW4.extraWithholding', model.extraWithholding]]) {
      if (!moneyOk(Math.round(Number(n) || 0))) bad(path, 'Enter zero or more.');
    }
  }
  if (step === 4) {
    if (!model.workCode || !/^[A-Za-z]{2}$/.test(model.workCode)) bad('workState.code', 'Choose a work state.');
    const psd = (bag, key, path) => {
      const v = bag && bag[key];
      if (v == null || v === '') return;
      if (!/^\d{6}$/.test(String(v))) bad(path, 'Enter a 6-digit PSD code.');
    };
    psd(model.workCert, 'workPSD', 'workState.certificate.workPSD');
    psd(model.workCert, 'residencePSD', 'workState.certificate.residencePSD');
    const sd = model.workCert && model.workCert.schoolDistrictCode;
    if (sd != null && sd !== '' && !/^\d{4}$/.test(String(sd))) bad('workState.certificate.schoolDistrictCode', 'Enter a 4-digit school district code.');
  }
  if (step === 5) {
    const rows = model.earnings.map(earningOut).filter(Boolean);
    if (!rows.some((e) => e.amount > 0)) bad('earnings', 'Add at least one earning.');
    const seen = new Set();
    rows.forEach((e, i) => {
      if (e.code.length > 16) bad(`earnings[${i}].code`, 'Use 16 characters or fewer.');
      if (seen.has(e.code)) bad(`earnings[${i}].code`, 'Use a different code. This one is already on the check.');
      seen.add(e.code);
      if (!moneyOk(e.amount)) bad(`earnings[${i}].amount`, 'Enter zero or more.');
    });
    if (model.hoursWorked !== '' && model.hoursWorked != null) {
      const h = Number(model.hoursWorked);
      if (!Number.isFinite(h) || h < 0) bad('hoursWorked', 'Enter zero or more, with one decimal.');
    }
  }
  if (step === 6) {
    for (const [path, n] of [['ytd.socialSecurity', model.ytdSS], ['ytd.medicare', model.ytdMed], ['ytd.futa', model.ytdFuta]]) {
      if (!moneyOk(Math.round(Number(n) || 0))) bad(path, 'Enter zero or more.');
    }
    if (model.ytdSui != null && !moneyOk(Math.round(Number(model.ytdSui) || 0))) bad(`ytd.stateUnemployment.${model.workCode || 'ST'}`, 'Enter zero or more.');
  }
  if (step === 7) {
    if (model.suiRate !== '') {
      const n = Number(String(model.suiRate).replace(/[%\s]/g, ''));
      const dec = percentToDecimal(model.suiRate);
      if (!Number.isFinite(n) || n < 0 || n > 20 || dec == null || Number.isNaN(dec)) {
        bad(`employer.stateUnemploymentRate.${model.workCode || 'ST'}`, 'Enter a rate from 0 to 20, with up to three decimals.');
      }
    }
    if (Array.isArray(model.garnishments)) {
      model.garnishments.forEach((g, i) => {
        if (g && g.type === 'child_support' && typeof g.supportingOtherFamily !== 'boolean') {
          bad(`garnishments[${i}].supportingOtherFamily`, 'Say whether the employee supports another family.');
        }
      });
    }
  }
  return errors;
}

export function grossCents(model) {
  return model.earnings.reduce((t, e) => {
    if (!e || e.category === 'imputed') return t;
    return t + (Math.round(Number(e.amount) || 0));
  }, 0);
}

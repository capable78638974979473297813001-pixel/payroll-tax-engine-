/**
 * Sandbox page. The form model lives in sandbox-form.js (no DOM).
 * This file draws the eight steps, talks to the API, and shows a result.
 */
import {
  STEPS, CERT_KEYS, WAGE_BASES,
  centsToDollars, dollarsToCents, decimalToPercent, percentToDecimal,
  formatMoney, parseRate, stepForPath, stepSlice, grossCents,
  createModel, loadRequest, serialize, validateStep,
} from '/assets/sandbox-form.js';

const FREQS = [
  ['weekly', 'Weekly', 52],
  ['biweekly', 'Biweekly', 26],
  ['semimonthly', 'Semimonthly', 24],
  ['monthly', 'Monthly', 12],
  ['quarterly', 'Quarterly', 4],
  ['semiannual', 'Semiannual', 2],
  ['annual', 'Annual', 1],
  ['daily', 'Daily', 260],
];
const WORKERS = [
  ['standard', 'A regular employee.'],
  ['clergy', 'A minister. A housing allowance is its own earning line.'],
  ['statutory_employee', 'A statutory employee. Social Security and Medicare still apply.'],
  ['household', 'Household work in a private home.'],
  ['agricultural', 'Farm work.'],
  ['railroad', 'Railroad work, covered by railroad retirement instead of Social Security.'],
  ['election_worker', 'A poll worker or election official.'],
];
const FILING_LABEL = {
  single: 'Single or married filing separately',
  married_joint: 'Married filing jointly',
  married_separate: 'Married filing separately',
  head_of_household: 'Head of household',
};
const EARN_MENU = [
  { id: 'regular', label: 'Regular', category: 'regular', code: 'REG' },
  { id: 'overtime', label: 'Overtime', category: 'regular', overtime: true, code: 'OT' },
  { id: 'bonus', label: 'Bonus / supplemental', category: 'supplemental', code: 'BONUS' },
  { id: 'commission', label: 'Commission', category: 'supplemental', code: 'COMM' },
  { id: 'tips', label: 'Tips', disabled: true },
  { id: 'imputed', label: 'Imputed income', category: 'imputed', code: 'IMPUTED' },
  { id: 'reimburse', label: 'Reimbursement', category: 'reimbursement', code: 'REIMB' },
  { id: 'housing', label: 'Housing allowance', category: 'housing_allowance', code: 'HOUSING', clergy: true },
];
const DED_TYPES = [
  ['deferral_401k', '401(k)'],
  ['deferral_403b', '403(b)'],
  ['deferral_457', '457(b)'],
  ['deferral_simple', 'SIMPLE'],
  ['section125', 'Section 125 medical, dental, or vision'],
  ['hsa', 'HSA'],
  ['fsa', 'Health FSA'],
  ['dependent_care', 'Dependent care'],
  ['commuter', 'Commuter'],
  ['null', 'After-tax'],
];
const FLAT_STATES = new Set(['MO', 'NE', 'OR', 'ME', 'NC']);
const TIER = {
  secondary_source: 'Secondary source',
  inferred: 'Inferred',
  not_modelled: 'Not modelled',
  conflicting_sources: 'Conflicting sources',
};
const LOCAL = {
  PA: [
    { key: 'workPSD', label: 'Work PSD', hint: '6 digits. 88000 means out of state.' },
    { key: 'residencePSD', label: 'Residence PSD', hint: '6 digits. 88000 means the employee lives out of state.' },
  ],
  OH: [
    { key: 'workCity', label: 'Work city' },
    { key: 'residenceCity', label: 'Residence city' },
    { key: 'schoolDistrictCode', label: 'School district code', hint: '4 digits.' },
    { key: 'workJEDDId', label: 'JEDD' },
  ],
  MI: [
    { key: 'workCity', label: 'Work city' },
    { key: 'residenceCity', label: 'Residence city' },
  ],
  AL: [
    { key: 'workCity', label: 'Work city' },
    { key: 'residenceCity', label: 'Residence city' },
    { key: 'workCounty', label: 'Work county' },
  ],
  KY: [
    { key: 'workCity', label: 'Work city' },
    { key: 'residenceCity', label: 'Residence city' },
    { key: 'workCounty', label: 'Work county' },
    { key: 'residenceCounty', label: 'Residence county' },
    { key: 'workSchoolDistrict', label: 'Work school district' },
    { key: 'residenceSchoolDistrict', label: 'Residence school district' },
  ],
  MD: [{ key: 'county', label: 'County' }],
  IN: [{ key: 'county', label: 'County' }],
  NY: [
    { key: 'nycResident', label: 'New York City resident', type: 'boolean' },
    { key: 'yonkersResident', label: 'Yonkers resident', type: 'boolean' },
    { key: 'yonkersNonresidentWorker', label: 'Yonkers nonresident worker', type: 'boolean' },
    { key: 'nycExemptions', label: 'NYC exemptions', type: 'count' },
    { key: 'additionalWithholdingNYC', label: 'Extra NYC withholding, per check', type: 'money' },
    { key: 'additionalWithholdingYonkers', label: 'Extra Yonkers withholding, per check', type: 'money' },
  ],
  OR: [
    { key: 'metroDistrict', label: 'Metro district', type: 'boolean' },
    { key: 'multnomahCounty', label: 'Multnomah County', type: 'boolean' },
    { key: 'locality', label: 'Locality', hint: 'A caller-resolved transit district, when the lookup did not set one.' },
  ],
  NJ: [
    { key: 'locality', label: 'Locality', hint: 'Newark, when the lookup did not set it.' },
    { key: 'newarkResidentApportionmentExcluded', label: 'Newark resident excluded from the employer tax apportionment', type: 'boolean' },
  ],
  MO: [
    { key: 'locality', label: 'Locality', hint: 'Kansas City or St. Louis.' },
    { key: 'localities', label: 'Localities', type: 'list', hint: 'Comma-separated when more than one city applies.' },
    { key: 'stLouisPayrollExpenseTaxExempt', label: 'Employer exempt from the St. Louis payroll expense tax', type: 'boolean', hint: 'Nonprofit, government or airport-only. The employee earnings tax still applies.' },
  ],
  DE: [{ key: 'locality', label: 'Locality', hint: 'Wilmington, when the lookup did not set it.' }],
  WA: [{ key: 'locality', label: 'Locality', hint: 'Seattle, when the lookup did not set it.' }],
  CO: [
    { key: 'locality', label: 'Locality', hint: 'Denver, Glendale, Greenwood Village or Sheridan. Aurora ended its tax on 2025-01-01.' },
    { key: 'localMonthlyCompensation', label: 'Pay in this locality so far this month', type: 'money', hint: 'Decides whether the monthly head tax applies.' },
    { key: 'localOPTWithheldThisMonth', label: 'Head tax already withheld this month', type: 'money' },
    { key: 'localOPTEmployeeWithheldByOtherEmployer', label: 'Another employer already withheld the employee head tax this month', type: 'boolean' },
  ],
  WV: [
    { key: 'locality', label: 'Locality', hint: 'A city with a municipal service fee.' },
    { key: 'wvLocalFeeAlreadyWithheld', label: 'Service fee already withheld this week', type: 'boolean' },
  ],
};

const model = createModel();
let step = 1;
let visited = new Set([1]);
let view = 'wizard';
let examples = [];
let states = [];
let statesReady = false;
let registry = {};
let taxYears = [2025, 2026, 2027];
let errors = {};
let banner = '';
let bannerHref = '';
let bannerKind = 'bad';
let bannerLinkLabel = '';
let bannerExample = false;
let busy = false;
let lookupBusy = false;
let returnToReview = false;
let resultTab = 'taxes';
let exampleTitle = '';
let exampleId = '';
let lastResult = null;
let lastMode = '';
let lastRequest = null;
let booted = false;
let lookupTimer = 0;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function advMap() {
  try { return JSON.parse(sessionStorage.getItem('sandbox_adv') || '{}'); } catch { return {}; }
}
function setAdv(id, open) {
  const o = advMap();
  o[id] = !!open;
  try { sessionStorage.setItem('sandbox_adv', JSON.stringify(o)); } catch { /* private mode */ }
}
function stateBy(code) { return states.find((s) => s.code === code) || null; }
function stateLabel(code) {
  if (!code) return 'No state';
  const st = stateBy(code);
  return st ? st.name : code;
}
function freqLabel(v) {
  const row = FREQS.find((f) => f[0] === v);
  return row ? row[1] : v;
}
function refreshReciprocal() {
  const st = stateBy(model.workCode);
  model._reciprocal = !!(st && model.homeCode && model.homeCode !== model.workCode && (st.reciprocalStates || []).includes(model.homeCode));
}
function yearBases() {
  const y = Number((model.checkDate || '').slice(0, 4));
  return WAGE_BASES[y] || WAGE_BASES[2026];
}
function bag(which) { return which === 'home' ? model.homeCert : model.workCert; }

function moneyInput(bind, cents, blank) {
  const v = blank && (cents == null || cents === '') ? '' : centsToDollars(cents || 0);
  return `<div class="money"><em>$</em><input class="inp" inputmode="decimal" data-bind="${bind}" value="${esc(v)}"></div>`;
}
function pctInput(bind, value, disabled, unsupported) {
  return `<div class="money pct"><input class="inp" inputmode="decimal" data-bind="${bind}" value="${esc(value)}"${disabled ? ' disabled' : ''}${unsupported ? ' data-unsupported' : ''}><em>%</em></div>`;
}
function errClass(path) { return errors[path] ? ' is-error' : ''; }
function fieldError(path) { return errors[path] ? `<p class="msg">${esc(errors[path])}</p>` : ''; }
function wrap(path, label, control, hint, tag) {
  return `<div class="f${errClass(path)}" data-path="${esc(path)}"><div class="lab"><label>${esc(label)}</label>${tag || ''}</div>${control}${fieldError(path)}${hint ? `<p class="hint">${hint}</p>` : ''}${path ? `<span class="path">${esc(path)}</span>` : ''}</div>`;
}
function fromTag(which, key) {
  return model.fromAddress[which + ':' + key] ? '<span class="tag tag-auto">From address</span>' : '';
}
function advanced(id, title, count, inner) {
  const open = advMap()[id] ? ' open' : '';
  return `<div class="adv${open}"><button type="button" class="adv-h" data-action="adv" data-adv="${id}"><span class="chev"></span>${esc(title)}<span class="cnt">${esc(count)}</span></button><div class="adv-b">${inner}</div></div>`;
}
function exampleOutputHtml() {
  return `<div class="sample"><p>Example output. This is not your calculation.</p><pre>{
  "grossPay": 140000,
  "employeeTaxTotal": 27035,
  "netPay": 112965,
  "taxes": [ "…one line per tax, in cents" ]
}</pre></div>`;
}
function hasApiKey() {
  const key = window.Omnia && Omnia.apiKey && Omnia.apiKey();
  return !!(key && key.key);
}
function signedIn() {
  return !!(window.Omnia && Omnia.session && Omnia.session() && Omnia.session().email);
}
function clearBanner() {
  banner = '';
  bannerHref = '';
  bannerKind = 'bad';
  bannerLinkLabel = '';
  bannerExample = false;
}
function setKeyGate(forLookup) {
  bannerKind = 'bad';
  bannerExample = !signedIn();
  if (!signedIn()) {
    banner = forLookup
      ? 'Sign up to get an API key before an address can be looked up. A test key is free and needs no card. This page does not issue a key.'
      : 'Sign up to get an API key before this calculation can run. A test key is free and needs no card. This page does not issue a key.';
    bannerHref = '/signup';
    bannerLinkLabel = 'Create an account';
    return;
  }
  banner = forLookup
    ? 'Create a test key (free, no card) or a live key in your account, then paste it here, before an address can be looked up.'
    : 'Create a test key (free, no card) or a live key in your account, then paste it here, before this calculation can run.';
  bannerHref = '/dashboard';
  bannerLinkLabel = 'Open your account';
  bannerExample = false;
}
function keyGateHtml() {
  if (hasApiKey() || banner) return '';
  const prev = { banner, bannerHref, bannerKind, bannerLinkLabel, bannerExample };
  setKeyGate(false);
  const html = bannerHtml();
  banner = prev.banner;
  bannerHref = prev.bannerHref;
  bannerKind = prev.bannerKind;
  bannerLinkLabel = prev.bannerLinkLabel;
  bannerExample = prev.bannerExample;
  return html;
}
function bannerHtml() {
  if (!banner) return '';
  const cls = bannerKind === 'warn' ? 'banner-warn' : 'banner-bad';
  const link = bannerHref ? ` <a href="${esc(bannerHref)}">${esc(bannerLinkLabel || 'Open your account')}</a>.` : '';
  const example = bannerExample ? exampleOutputHtml() : '';
  return `<div class="banner ${cls}" role="alert">${esc(banner)}${link}${example}</div>`;
}
function residentNote() {
  if (!model.homeCode || !model.workCode || model.homeCode === model.workCode) return '';
  const home = stateLabel(model.homeCode);
  const work = stateLabel(model.workCode);
  let text = `Lives in ${home}, works in ${work}. The employee is a nonresident of ${work}.`;
  if (model._reciprocal) text += ` ${work} and ${home} have a reciprocity agreement, so the engine withholds ${home} tax instead of ${work} tax. Nothing to set here.`;
  return `<div class="note note-info">${esc(text)}</div>`;
}
function hi(json) {
  return esc(json).replace(/("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?/g, (m, str, colon, kw) => {
    if (str) return colon ? `<span class="k">${str}</span>${colon}` : `<span class="s">${str}</span>`;
    if (kw) return `<span class="k">${kw}</span>`;
    return `<span class="n">${m}</span>`;
  });
}

function certControl(which, field, path) {
  const b = bag(which);
  const key = field.key;
  const bind = `${which}:${key}`;
  const cur = b[key];
  if (field.type === 'boolean') {
    return `<label class="chk"><input class="tick" type="checkbox" data-bind="certbool:${bind}"${cur === true ? ' checked' : ''}><span class="cl">${esc(field.label)}</span></label><span class="path">${esc(path)}</span>`;
  }
  if (field.type === 'count') {
    return wrap(path, field.label, `<input class="inp" inputmode="numeric" data-bind="certnum:${bind}" value="${cur == null ? '' : esc(String(cur))}">`, field.hint || '', fromTag(which, key));
  }
  if (field.type === 'money') {
    return wrap(path, field.label, moneyInput(`certcents:${bind}`, cur == null ? null : cur, true), field.hint || '', fromTag(which, key));
  }
  if (field.type === 'list') {
    const text = Array.isArray(cur) ? cur.join(', ') : (cur || '');
    return wrap(path, field.label, `<input class="inp" data-bind="list:${bind}" value="${esc(text)}">`, field.hint || '', fromTag(which, key));
  }
  if (field.options) {
    const opts = ['<option value="">Choose</option>'].concat(field.options.map((o, i) => {
      const selected = JSON.stringify(o.value) === JSON.stringify(cur) ? ' selected' : '';
      return `<option value="${i}" data-raw="${esc(JSON.stringify(o.value))}"${selected}>${esc(o.label)}</option>`;
    }));
    if (cur != null && cur !== '' && !field.options.some((o) => JSON.stringify(o.value) === JSON.stringify(cur))) {
      opts.push(`<option value="x" data-raw="${esc(JSON.stringify(cur))}" selected>${esc(String(cur))}</option>`);
    }
    return wrap(path, field.label, `<select class="inp" data-bind="certpick:${bind}">${opts.join('')}</select>`, field.hint || '', fromTag(which, key));
  }
  return wrap(path, field.label, `<input class="inp" data-bind="cert:${bind}" value="${cur == null ? '' : esc(String(cur))}">`, field.hint || '', fromTag(which, key));
}

function registryFields(code) { return registry[code] || []; }

function certIntro(code) {
  if (!statesReady) return '<p class="flat">Loading state rules…</p>';
  const fields = registryFields(code);
  if (fields.length) return '';
  const st = stateBy(code);
  const name = st ? st.name : (code || 'This state');
  const rate = st ? st.rateLabel : 'withholding tables';
  return `<p class="flat">${esc(name)} uses ${esc(rate)} with no certificate choices.</p>`;
}

function certBlock(which, code) {
  const fields = registryFields(code);
  const prefix = which === 'home' ? 'residenceState.certificate' : 'workState.certificate';
  const main = fields.filter((f) => !f.advanced).map((f) => certControl(which, f, `${prefix}.${f.key}`)).join('');
  const extra = fields.filter((f) => f.advanced);
  const adv = extra.length
    ? advanced(`${which}-cert`, 'Advanced', `${extra.length} fields`, extra.map((f) => certControl(which, f, `${prefix}.${f.key}`)).join(''))
    : '';
  return certIntro(code) + main + adv;
}

function localBlock(code, skip) {
  const fields = LOCAL[code];
  const name = stateLabel(code);
  if (!fields) {
    return `<div class="nsb"><div class="nsb-h"><b>Local tax · ${esc(name)}</b> <span class="tag tag-ip">In progress</span></div><p>Local tax for ${esc(name)} is in progress.</p></div>`;
  }
  // Local taxes, including residence-side codes, are read from the work certificate only.
  const prefix = 'workState.certificate';
  const shown = fields.filter((f) => !skip.has(f.key));
  shown.forEach((f) => skip.add(f.key));
  if (!shown.length) return '';
  return `<h2>Local · ${esc(name)}</h2>` + shown.map((f) => certControl('work', f, `${prefix}.${f.key}`)).join('');
}

function genericCertAdvanced(which, code) {
  const fields = registryFields(code);
  const hasExtra = fields.some((f) => f.key === 'additionalWithholding');
  const prefix = which === 'home' ? 'residenceState.certificate' : 'workState.certificate';
  const bits = [];
  bits.push(certControl(which, { key: 'exempt', label: 'Exempt from withholding', type: 'boolean' }, `${prefix}.exempt`));
  bits.push(certControl(which, { key: 'exemptReason', label: 'Exempt reason' }, `${prefix}.exemptReason`));
  if (!hasExtra) bits.push(certControl(which, { key: 'additionalWithholding', label: 'Extra state withholding, per check', type: 'money' }, `${prefix}.additionalWithholding`));
  bits.push(certControl(which, { key: 'reducedWithholding', label: 'Reduced withholding, per check', type: 'money' }, `${prefix}.reducedWithholding`));
  bits.push(certControl(which, { key: 'nonresidentAlien', label: 'Nonresident alien', type: 'boolean' }, `${prefix}.nonresidentAlien`));
  if (which === 'work' && (code === 'MD' || code === 'DE')) bits.push(certControl(which, { key: 'nonresident', label: 'Nonresident', type: 'boolean' }, `${prefix}.nonresident`));
  if (which === 'work' && code === 'PA') bits.push(certControl(which, { key: 'lstAlreadyWithheldElsewhere', label: 'Local services tax already withheld elsewhere', type: 'boolean' }, `${prefix}.lstAlreadyWithheldElsewhere`));
  // The field map lists all three on the work certificate. The engine reads the first two from the home certificate.
  if (which === 'home') {
    bits.push(certControl(which, { key: 'dailyCommuter', label: 'Daily commuter', type: 'boolean' }, `${prefix}.dailyCommuter`));
    bits.push(certControl(which, { key: 'nonresidentCreditEligible', label: 'Nonresident credit eligible', type: 'boolean' }, `${prefix}.nonresidentCreditEligible`));
  }
  if (which === 'work') bits.push(certControl(which, { key: 'nonresidentDeMinimisEligible', label: 'Nonresident de minimis eligible', type: 'boolean' }, `${prefix}.nonresidentDeMinimisEligible`));
  return advanced(`${which}-more`, 'Advanced', `${bits.length} fields`, bits.join(''));
}

function stateOptions(selected, blankLabel) {
  const head = blankLabel ? `<option value="">${esc(blankLabel)}</option>` : '<option value="">Choose a state</option>';
  const opts = states.map((s) => `<option value="${esc(s.code)}"${s.code === selected ? ' selected' : ''}>${esc(s.name)} (${esc(s.code)})</option>`);
  if (selected && !states.some((s) => s.code === selected)) opts.unshift(`<option value="${esc(selected)}" selected>${esc(selected)}</option>`);
  return head + opts.join('');
}

function lookupCard(side, role) {
  if (!side) return '';
  if (side.error) return `<p class="msg">${esc(side.error)}</p>`;
  if (!side.matched) return '';
  const prec = precisionLabel(side.precision, side.pointSource);
  const codes = side.codes ? `<div><dt>Code</dt><dd>${esc(side.codes)}</dd></div>` : '';
  const warn = (side.warnings && side.warnings.length
    ? `<div class="note note-warn">${side.warnings.map((w) => esc(w)).join('<br>')}</div>` : '')
    // A boundary service that did not answer means a local tax may be missing: an unknown, not a "none here".
    + (side.failures && side.failures.length
      ? `<div class="note note-warn"><b>Not checked.</b> ${side.failures.map((w) => esc(w)).join('<br>')}</div>` : '')
    + (side.notes && side.notes.length
      ? `<div class="note note-info">${side.notes.map((w) => esc(w)).join('<br>')}</div>` : '');
  return `<div class="match"><div class="match-h"><span class="ok"></span><span>${esc(side.matchedAddress || 'Matched')}</span>${prec ? `<span class="tag tag-auto">${esc(prec)}</span>` : ''}</div><dl><div><dt>State</dt><dd>${esc(side.state || '—')}</dd></div><div><dt>County</dt><dd>${esc(side.county || '—')}</dd></div><div><dt>Place</dt><dd>${esc(side.place || '—')}</dd></div>${codes}</dl>${warn}</div>`;
}
function precisionLabel(p, source) {
  if (p === 'rooftop-osm') return 'Rooftop (OpenStreetMap)';
  if (p === 'rooftop') return source ? `Rooftop (${source})` : 'Rooftop';
  if (p === 'parcel-centroid') return 'Parcel';
  if (p === 'neighbor') return 'Nearby building';
  if (p === 'interpolated') return 'Estimated along the street';
  return '';
}

function step1() {
  const freq = FREQS.map(([v, name, n]) => `<option value="${v}"${model.payFrequency === v ? ' selected' : ''}>${esc(name)} · ${n} per year</option>`).join('');
  const workers = WORKERS.map(([v, desc]) => `<option value="${v}"${model.employmentCategory === v ? ' selected' : ''}>${esc(v === 'standard' ? 'Standard' : v.replace(/_/g, ' '))}</option>`).join('');
  const desc = (WORKERS.find((w) => w[0] === model.employmentCategory) || WORKERS[0])[1];
  return `<p class="eyebrow">Step 1 of 8</p><h2 class="step-title">Employee and addresses</h2><p class="sub">Who is being paid, and where they live and work.</p>
    ${bannerHtml()}${residentNote()}
    <div class="grid g2">
      ${wrap('checkDate', 'Check date', `<input id="f-date" class="inp" type="date" data-bind="str:checkDate" value="${esc(model.checkDate)}">`)}
      ${wrap('payFrequency', 'Pay frequency', `<select id="f-freq" class="inp" data-bind="str:payFrequency">${freq}</select>`)}
    </div>
    <div class="f${errClass('homeAddress')}" data-path="homeAddress"><div class="lab"><label for="f-home">Home address</label></div>
      <div class="addr-row"><div class="grow"><input id="f-home" class="inp" data-bind="str:homeAddress" maxlength="200" value="${esc(model.homeAddress)}"></div><button type="button" class="btn sec" id="lookupHome" data-action="lookup">Look up</button></div>
      ${fieldError('homeAddress')}${lookupCard(model.homeLookup, 'home')}<span class="path">residenceAddress</span></div>
    <div class="f${errClass('workAddress')}" data-path="workAddress"><div class="lab"><label for="f-work">Work address</label></div>
      <div class="addr-row"><div class="grow"><input id="f-work" class="inp" data-bind="str:workAddress" maxlength="200" value="${esc(model.workAddress)}"></div><button type="button" class="btn sec" id="lookupWork" data-action="lookup">Look up</button></div>
      ${fieldError('workAddress')}${lookupCard(model.workLookup, 'work')}<span class="path">workAddress</span></div>
    ${advanced('s1', 'Advanced', '2 fields', `
      ${wrap('employmentCategory', 'Worker type', `<select class="inp" data-bind="str:employmentCategory">${workers}</select>`, esc(desc))}
      <label class="chk"><input class="tick" type="checkbox" data-bind="bool:roundToWholeDollars"${model.roundToWholeDollars ? ' checked' : ''}><span><span class="cl">Round withheld income tax to whole dollars</span><span class="path">roundToWholeDollars</span></span></label>
    `)}`;
}

function step2() {
  const place = model.workAddress || stateLabel(model.workCode) || 'Primary location';
  const day = (bind, path, label) => wrap(path, label, `<input class="inp" inputmode="numeric" data-bind="str:${bind}" value="${esc(model[bind])}">`, 'A whole number from 0 to 366.');
  return `<p class="eyebrow">Step 2 of 8</p><h2 class="step-title">Work locations</h2><p class="sub">One work state per paycheck.</p>${bannerHtml()}
    <div class="loc"><div><b>${esc(place)}</b><div class="hint">${esc(stateLabel(model.workCode))}</div></div><span class="pct">100% of wages</span></div>
    <div class="f" data-path="workState.certificate.workCityIsPrincipalWorkplace"><label class="chk"><input class="tick" type="checkbox" data-bind="bool:principalWorkplace"${model.principalWorkplace ? ' checked' : ''}><span><span class="cl">This is the principal workplace</span><span class="hint">Sent only when this is off.</span><span class="path">workState.certificate.workCityIsPrincipalWorkplace</span></span></label></div>
    <div class="nsb"><div class="nsb-h"><b>Split across locations</b> <span class="tag tag-ns">Not supported yet</span> <span class="tag tag-ip">In progress</span></div>
      <p>The engine takes one work state per paycheck today. Splitting time or wages across several locations is in progress.</p>
      <div class="tbl dis"><div class="tr th"><span>Location</span><span>State</span><span>Time</span><span>Wages</span></div>
        <div class="tr"><input class="inp sm" disabled data-unsupported value=""><input class="inp sm" disabled data-unsupported value=""><input class="inp sm" disabled data-unsupported value=""><input class="inp sm" disabled data-unsupported value=""></div></div>
      <button type="button" class="btn sec" disabled data-unsupported>+ Add work location</button>
    </div>
    ${advanced('s2', 'Advanced', '3 fields', day('daysMunicipality', 'workState.certificate.daysWorkedInMunicipality', 'Days worked in the municipality') + day('daysState', 'workState.certificate.daysWorkedInStateThisYear', 'Days worked in the state this year') + day('daysLocality', 'workState.certificate.daysWorkedInLocality', 'Days worked in the locality'))}`;
}

function step3() {
  const legacy = model.legacyW4;
  const ignored = model.w4Exempt ? '<p class="hint">Ignored while exempt.</p>' : '';
  const radio = (value, label) => `<label class="rad"><input class="dot" type="radio" name="fs" data-bind="str:filingStatus" value="${value}"${(model.filingStatus === value || (value === 'single' && model.filingStatus === 'married_separate')) ? ' checked' : ''}><span class="cl">${esc(label)}</span></label>`;
  const mfs = `<div class="chk"><input class="tick" type="checkbox" data-bind="mfs:1"${model.filingStatus === 'married_separate' ? ' checked' : ''}><span>Married filing separately</span></div>`;
  const creditKids = model.depChildren;
  const creditOther = model.depOther;
  const seg = `<div class="seg"><button type="button"${legacy ? '' : ' class="on"'} data-action="w4form" data-form="new">2020 or later</button><button type="button"${legacy ? ' class="on"' : ''} data-action="w4form" data-form="old">2019 or earlier</button></div>`;
  const status = `<div class="f${errClass('federalW4.filingStatus')}" data-path="federalW4.filingStatus"><div class="lab"><label>${legacy ? 'Marital status' : 'Filing status'}</label></div>
      <div class="rads">${radio('single', legacy ? 'Single' : 'Single or married filing separately')}${legacy ? '' : mfs}${radio('married_joint', legacy ? 'Married' : 'Married filing jointly')}${legacy ? '' : radio('head_of_household', 'Head of household')}</div>
      ${fieldError('federalW4.filingStatus')}${ignored}<span class="path">federalW4.filingStatus</span></div>`;
  const advancedBits = `
      <label class="chk"><input class="tick" type="checkbox" data-bind="bool:w4Exempt"${model.w4Exempt ? ' checked' : ''}><span><span class="cl">Exempt</span><span class="path">federalW4.exempt</span></span></label>
      <label class="chk"><input class="tick" type="checkbox" data-bind="bool:w4Nra"${model.w4Nra ? ' checked' : ''}><span><span class="cl">Nonresident alien</span><span class="path">federalW4.nonresidentAlien</span></span></label>
      ${model.employmentCategory === 'clergy' ? `<label class="chk"><input class="tick" type="checkbox" data-bind="bool:w4Voluntary"${model.w4Voluntary ? ' checked' : ''}><span><span class="cl">Voluntary withholding agreement</span><span class="path">federalW4.voluntaryWithholdingAgreement</span></span></label>` : ''}
      ${legacy ? '' : `<div class="f"><div class="lab"><label>Married filing separately</label></div>
        <label class="rad" style="border:1px solid var(--rule);border-radius:6px"><input class="dot" type="radio" name="fs-adv" data-bind="str:filingStatus" value="married_separate"${model.filingStatus === 'married_separate' ? ' checked' : ''}><span class="cl">Married filing separately</span></label>
        <span class="path">federalW4.filingStatus</span></div>`}
    `;
  const advCount = model.employmentCategory === 'clergy' ? 3 : 2;
  if (legacy) {
    return `<p class="eyebrow">Step 3 of 8</p><h2 class="step-title">Federal W-4</h2><p class="sub">A form from 2019 or earlier. Allowances and a marital status; no credits, other income or deductions.</p>${bannerHtml()}
    ${seg}
    ${status}
    ${wrap('federalW4.legacyAllowances', 'Allowances', `<input class="inp" inputmode="numeric" data-bind="str:legacyAllowances" value="${esc(model.legacyAllowances)}">`, 'Line 5 of the old form. Each one takes $4,300 off the year’s wages.')}
    ${wrap('federalW4.extraWithholding', 'Extra withholding', moneyInput('cents:extraWithholding', model.extraWithholding), 'Line 6 of the old form, per check.')}
    ${advanced('s3', 'Advanced', advCount + ' fields', advancedBits)}`;
  }
  return `<p class="eyebrow">Step 3 of 8</p><h2 class="step-title">Federal W-4</h2><p class="sub">The current form. Counts fill the credit. Only the credit is sent.</p>${bannerHtml()}
    ${seg}
    ${status}
    <label class="chk"><input class="tick" type="checkbox" data-bind="bool:multipleJobs"${model.multipleJobs ? ' checked' : ''}><span><span class="cl">Multiple jobs or spouse works</span>${ignored}<span class="path">federalW4.multipleJobs</span></span></label>
    <div class="grid g2">
      <div class="f"><div class="lab"><label>Children under 17</label></div><input class="inp" inputmode="numeric" data-bind="str:depChildren" value="${esc(creditKids)}"><p class="hint">× $2,000. The count is not sent.</p></div>
      <div class="f"><div class="lab"><label>Other dependents</label></div><input class="inp" inputmode="numeric" data-bind="str:depOther" value="${esc(creditOther)}"><p class="hint">× $500. The count is not sent.</p></div>
    </div>
    ${wrap('federalW4.dependentCredit', 'Total credit', moneyInput('cents:dependentCredit', model.dependentCredit), 'Annual. Children under 17 × $2,000, plus other dependents × $500.')}
    <div class="grid g2">
      ${wrap('federalW4.otherIncome', 'Other income', moneyInput('cents:otherIncome', model.otherIncome), 'Annual.')}
      ${wrap('federalW4.deductions', 'Deductions', moneyInput('cents:w4Deductions', model.w4Deductions), 'Annual, beyond the standard deduction.')}
    </div>
    ${wrap('federalW4.extraWithholding', 'Extra withholding', moneyInput('cents:extraWithholding', model.extraWithholding), 'Per check.')}
    ${advanced('s3', 'Advanced', advCount + ' fields', advancedBits)}`;
}

function step4() {
  const homeDifferent = model.homeCode && model.homeCode !== model.workCode;
  const skip = new Set();
  const holdDis = model._reciprocal ? ' disabled' : '';
  const holdHint = model._reciprocal ? 'Off because reciprocity already decides this.' : '';
  const home = stateLabel(model.homeCode);
  const withholding = homeDifferent ? `<div class="blk"><h2>Withholding for ${esc(home)}</h2>
      ${holdHint ? `<p class="hint">${esc(holdHint)}</p>` : ''}
      <label class="chk${model._reciprocal ? ' is-disabled' : ''}"><input class="tick" type="checkbox" data-bind="bool:nexus"${model.nexus ? ' checked' : ''}${holdDis}><span><span class="cl">Nexus</span><span class="hint">The employer is registered in ${esc(home)}, so it has to withhold there.</span><span class="path">residenceStateWithholding.nexus</span></span></label>
      <label class="chk${model._reciprocal ? ' is-disabled' : ''}"><input class="tick" type="checkbox" data-bind="bool:voluntaryWh"${model.voluntaryWh ? ' checked' : ''}${holdDis}><span><span class="cl">Voluntary withholding</span><span class="hint">No nexus, but the employer withholds ${esc(home)} tax as a courtesy.</span><span class="path">residenceStateWithholding.voluntary</span></span></label>
    </div>` : '';
  return `<p class="eyebrow">Step 4 of 8</p><h2 class="step-title">State and local</h2><p class="sub">Certificate choices for the work state, and for home when it differs.</p>${bannerHtml()}${residentNote()}
    ${wrap('workState.code', 'Work state', `<select class="inp" data-bind="str:workCode">${stateOptions(model.workCode)}</select>`)}
    <h2>${esc(stateLabel(model.workCode))} certificate</h2>
    ${certBlock('work', model.workCode)}
    ${genericCertAdvanced('work', model.workCode)}
    <div class="blk"><h2>Home state</h2>
      ${wrap('residenceState.code', 'Home state', `<select class="inp" data-bind="str:homeCode">${stateOptions(model.homeCode, 'Same as work state')}</select>`, 'Leave this on “Same as work state” when the employee lives where they work.')}
      ${homeDifferent ? `<h2>${esc(home)} certificate</h2>${certBlock('home', model.homeCode)}${genericCertAdvanced('home', model.homeCode)}` : ''}
    </div>
    ${withholding}
    <div class="blk">${localBlock(model.workCode, skip)}${homeDifferent ? localBlock(model.homeCode, skip) : ''}</div>`;
}

function earnTypeValue(row) {
  if (row.overtime && row.category === 'regular') return 'overtime';
  return row.category || 'regular';
}
function step5() {
  const typeOpts = (row) => {
    const cur = earnTypeValue(row);
    const opts = [
      ['regular', 'Regular'],
      ['overtime', 'Overtime'],
      ['supplemental', 'Bonus / supplemental'],
      ['imputed', 'Imputed income'],
      ['reimbursement', 'Reimbursement'],
    ];
    if (model.employmentCategory === 'clergy' || row.category === 'housing_allowance') opts.push(['housing_allowance', 'Housing allowance']);
    return opts.map(([v, label]) => `<option value="${v}"${cur === v ? ' selected' : ''}>${esc(label)}</option>`).join('');
  };
  const rows = model.earnings.map((row, i) => `<div class="tr">
      <input class="inp sm" data-bind="rowstr:earnings:${i}:code" value="${esc(row.code)}" aria-label="Code">
      <div><select class="inp sm" data-bind="rowtype:${i}">${typeOpts(row)}</select>${row.overtime ? '<span class="mini">Overtime</span>' : ''}</div>
      ${moneyInput(`rowcents:earnings:${i}:amount`, row.amount).replace('class="inp"', 'class="inp sm"')}
      <button type="button" class="x" data-action="remove-earn" data-i="${i}">Remove</button>
    </div>`).join('');
  const menu = EARN_MENU.filter((item) => !item.clergy || model.employmentCategory === 'clergy').map((item) => item.disabled
    ? `<button type="button" disabled data-unsupported>${esc(item.label)} <span class="tag tag-ns">Not supported yet</span></button>`
    : `<button type="button" data-action="earn-pick" data-id="${item.id}">${esc(item.label)}</button>`).join('');
  const prior = model.priorWages == null ? '' : centsToDollars(model.priorWages);
  const priorTax = model.priorTax == null ? '' : centsToDollars(model.priorTax);
  return `<p class="eyebrow">Step 5 of 8</p><h2 class="step-title">Earnings</h2><p class="sub">At least one line with an amount.</p>${bannerHtml()}
    <div class="f${errClass('earnings')}" data-path="earnings">${fieldError('earnings')}
      <div class="tbl ed"><div class="tr th"><span>Code</span><span>Type</span><span>Amount</span><span></span></div>${rows}</div>
      <div class="addrow"><button type="button" class="btn sec" data-action="add-earn">+ Add earning</button><div class="menu" id="earnMenu" hidden>${menu}</div></div>
    </div>
    <div class="total"><span>Gross pay</span><b id="grossLine">${formatMoney(grossCents(model))}</b></div>
    <p class="hint">Worked out from the lines above. The API has no gross pay field.</p>
    ${wrap('hoursWorked', 'Hours worked', `<input class="inp" inputmode="decimal" data-bind="str:hoursWorked" value="${esc(model.hoursWorked)}">`, 'Zero or more, with one decimal. Leave blank to omit.')}
    ${advanced('s5', 'Advanced', '2 fields', `
      ${wrap('priorRegularPayment.taxableWages', 'Last regular taxable wages', `<div class="money"><em>$</em><input class="inp" inputmode="decimal" data-bind="centsornull:priorWages" value="${esc(prior)}"></div>`, 'For a bonus paid on its own check.')}
      ${wrap('priorRegularPayment.stateIncomeTaxWithheld', 'State income tax withheld on that check', `<div class="money"><em>$</em><input class="inp" inputmode="decimal" data-bind="centsornull:priorTax" value="${esc(priorTax)}"></div>`)}
    `)}`;
}

function step6() {
  const rows = model.deductions.map((row, i) => {
    const opts = DED_TYPES.map(([v, label]) => `<option value="${v}"${(row.category == null ? 'null' : row.category) === v ? ' selected' : ''}>${esc(label)}</option>`).join('');
    return `<div class="tr"><input class="inp sm" data-bind="rowstr:deductions:${i}:code" value="${esc(row.code)}" aria-label="Code"><select class="inp sm" data-bind="dedtype:${i}">${opts}</select>${moneyInput(`rowcents:deductions:${i}:amount`, row.amount).replace('class="inp"', 'class="inp sm"')}<button type="button" class="x" data-action="remove-ded" data-i="${i}">Remove</button></div>`;
  }).join('');
  const bases = yearBases();
  const ssHint = model.ytdSS >= bases.socialSecurity * 100 ? `The $${bases.socialSecurity.toLocaleString('en-US')} base is met, so Social Security is $0.` : '';
  const futaHint = model.ytdFuta >= bases.futa * 100 ? `The $${bases.futa.toLocaleString('en-US')} base is met, so FUTA is $0.` : '';
  const suiPath = `ytd.stateUnemployment.${model.workCode || 'ST'}`;
  const ytdMap = (key, label) => {
    const map = model.ytdExtra[key] || {};
    const cur = model.workCode ? map[model.workCode] : null;
    return wrap(`ytd.${key}.${model.workCode || 'ST'}`, label, moneyInput(`ytdmap:${key}`, cur == null ? null : cur, true));
  };
  const nest = (key, label) => {
    const obj = model.ytdExtra.electiveDeferrals || {};
    return wrap(`ytd.electiveDeferrals.${key}`, label, moneyInput(`ytdnest:electiveDeferrals:${key}`, obj[key] == null ? null : obj[key], true));
  };
  const extraBits = [
    wrap('ytd.supplemental', 'Supplemental wages, year to date', moneyInput('ytdcents:supplemental', model.ytdExtra.supplemental == null ? null : model.ytdExtra.supplemental, true)),
    ytdMap('statePaidLeave', 'State paid leave wages'),
    ytdMap('stateDisabilityEmployee', 'State disability wages'),
    ytdMap('stateLongTermCare', 'State long-term care wages'),
  ];
  const local = model.ytdExtra.localIncomeTax || {};
  const localId = Object.keys(local)[0] || '';
  extraBits.push(wrap(localId ? `ytd.localIncomeTax.${localId}` : 'ytd.localIncomeTax.{id}', 'Local income tax, year to date', `<div class="grid g2"><input class="inp" data-bind="localid" placeholder="Tax id" value="${esc(localId)}">${moneyInput('localamt', localId ? local[localId] : null, true)}</div>`));
  extraBits.push(wrap('employee.ageAtYearEnd', 'Age reached by December 31', `<input class="inp" inputmode="numeric" data-bind="str:ageAtYearEnd" value="${esc(model.ageAtYearEnd)}">`, '50 or older raises the 401(k), 403(b), 457(b) and SIMPLE limits; 60 to 63 raises them further. Blank uses the standard limits.'));
  extraBits.push(nest('section402gAggregate', 'Section 402(g) deferrals'));
  extraBits.push(nest('deferral457', '457 deferrals'));
  extraBits.push(nest('simple', 'SIMPLE deferrals'));
  if (model.workCode === 'WA' || model.homeCode === 'WA') {
    extraBits.push(wrap('ytd.seattleCompensation', 'Seattle compensation, year to date', moneyInput('ytdcents:seattleCompensation', model.ytdExtra.seattleCompensation == null ? null : model.ytdExtra.seattleCompensation, true)));
  }
  if (['household', 'agricultural', 'election_worker'].includes(model.employmentCategory)) {
    extraBits.push(wrap('ytd.categoryCashWages', 'Cash wages in this category, year to date', moneyInput('ytdcents:categoryCashWages', model.ytdExtra.categoryCashWages == null ? null : model.ytdExtra.categoryCashWages, true)));
  }
  if (model.employmentCategory === 'railroad') {
    extraBits.push(wrap('ytd.tier2Compensation', 'Tier II compensation, year to date', moneyInput('ytdcents:tier2Compensation', model.ytdExtra.tier2Compensation == null ? null : model.ytdExtra.tier2Compensation, true)));
    extraBits.push(wrap('ytd.railroadMonthlyCompensation', 'Railroad unemployment compensation this month', moneyInput('ytdcents:railroadMonthlyCompensation', model.ytdExtra.railroadMonthlyCompensation == null ? null : model.ytdExtra.railroadMonthlyCompensation, true)));
  }
  return `<p class="eyebrow">Step 6 of 8</p><h2 class="step-title">Deductions and year to date</h2>${bannerHtml()}
    <p class="hint">Each type lowers different taxes. 401(k) skips income tax but not Social Security. Section 125 skips both.</p>
    <div class="tbl ed"><div class="tr th"><span>Code</span><span>Type</span><span>Amount</span><span></span></div>${rows || ''}</div>
    <button type="button" class="btn sec" data-action="add-ded">+ Add deduction</button>
    <div class="blk"><h2>Year to date, before this check</h2>
      <div class="grid g2">
        ${wrap('ytd.socialSecurity', 'Social Security wages', moneyInput('cents:ytdSS', model.ytdSS), `<span id="ssHint">${esc(ssHint)}</span>`)}
        ${wrap('ytd.medicare', 'Medicare wages', moneyInput('cents:ytdMed', model.ytdMed))}
        ${wrap('ytd.futa', 'FUTA wages', moneyInput('cents:ytdFuta', model.ytdFuta), `<span id="futaHint">${esc(futaHint)}</span>`)}
        ${wrap(suiPath, `${stateLabel(model.workCode)} unemployment wages`, moneyInput('centsornull:ytdSui', model.ytdSui, true), 'Blank leaves this off the request. A missing amount counts as zero.')}
      </div>
      ${advanced('s6', 'Advanced', `${extraBits.length} fields`, extraBits.join(''))}
    </div>`;
}

function mapPercent(key) {
  const map = model.employerExtra[key];
  const v = map && model.workCode ? map[model.workCode] : null;
  return v == null ? '' : decimalToPercent(v);
}
function step7() {
  const st = stateLabel(model.workCode);
  const offer = FLAT_STATES.has(model.workCode);
  const paid = statesReady && stateBy(model.workCode) ? stateBy(model.workCode).paidLeaveNote : 'Loading state rules…';
  const flatChecked = !!(model.employerExtra.supplementalFlatRateElection && model.employerExtra.supplementalFlatRateElection[model.workCode]);
  const bits = [];
  if (model.workCode === 'MA') bits.push(wrap(`employer.stateUnemploymentAssessmentRate.${model.workCode}`, 'Unemployment assessment rate', pctInput('emap:stateUnemploymentAssessmentRate', mapPercent('stateUnemploymentAssessmentRate')), 'Massachusetts adds this on top of the experience rate.'));
  if (model.workCode === 'MI') bits.push(`<label class="chk"><input class="tick" type="checkbox" data-bind="ebool:stateUnemploymentQualifiedForReducedWageBase"${model.employerExtra.stateUnemploymentQualifiedForReducedWageBase && model.employerExtra.stateUnemploymentQualifiedForReducedWageBase.MI ? ' checked' : ''}><span><span class="cl">Qualified for the reduced wage base</span><span class="path">employer.stateUnemploymentQualifiedForReducedWageBase.MI</span></span></label>`);
  if (model.workCode === 'KS') bits.push(wrap('employer.suiIndustry.KS', 'SUTA industry', `<input class="inp" data-bind="estr:suiIndustry" value="${esc((model.employerExtra.suiIndustry && model.employerExtra.suiIndustry.KS) || '')}">`));
  const tier = (model.employerExtra.paidLeaveTier && model.employerExtra.paidLeaveTier[model.workCode]) || '';
  bits.push(wrap(`employer.paidLeaveTier.${model.workCode || 'ST'}`, 'Paid leave tier', `<select class="inp" data-bind="estr:paidLeaveTier"><option value="">Choose</option>${['exempt', 'parentalOnly', 'full'].map((v) => `<option value="${v}"${tier === v ? ' selected' : ''}>${v}</option>`).join('')}</select>`));
  const frac = model.employerExtra.paidLeaveEmployeeShareFraction && model.workCode ? model.employerExtra.paidLeaveEmployeeShareFraction[model.workCode] : null;
  bits.push(wrap(`employer.paidLeaveEmployeeShareFraction.${model.workCode || 'ST'}`, 'Employee share of paid leave', `<input class="inp" inputmode="decimal" data-bind="edec:paidLeaveEmployeeShareFraction" value="${frac == null ? '' : esc(String(frac))}">`, 'A fraction from 0 to the state ceiling. Blank omits it.'));
  bits.push(certControl('work', { key: 'paidLeaveExempt', label: 'Paid leave exempt', type: 'boolean' }, 'workState.certificate.paidLeaveExempt'));
  bits.push(certControl('work', { key: 'employerLiableForPaidLeaveShare', label: 'Employer pays the paid-leave share', type: 'boolean' }, 'workState.certificate.employerLiableForPaidLeaveShare'));
  const leaveRate = model.workCert.paidLeaveEmployeeRateOverride;
  bits.push(wrap('workState.certificate.paidLeaveEmployeeRateOverride', 'Paid leave employee rate', pctInput('certdec:work:paidLeaveEmployeeRateOverride', leaveRate == null ? '' : decimalToPercent(leaveRate))));
  if (model.workCode === 'WA') {
    bits.push(certControl('work', { key: 'wacaresExempt', label: 'WA Cares exempt', type: 'boolean' }, 'workState.certificate.wacaresExempt'));
  }
  if (model.employmentCategory === 'agricultural') {
    bits.push(`<label class="chk"><input class="tick" type="checkbox" data-bind="ebool1:agriculturalFutaLiable"${model.employerExtra.agriculturalFutaLiable ? ' checked' : ''}><span><span class="cl">Agricultural FUTA applies</span><span class="path">employer.agriculturalFutaLiable</span></span></label>`);
    bits.push(wrap('employer.agriculturalTotalWages', 'Farm wages this year, all workers', moneyInput('emoney:agriculturalTotalWages', model.employerExtra.agriculturalTotalWages == null ? null : model.employerExtra.agriculturalTotalWages, true)));
  }
  if (model.employmentCategory === 'household') {
    bits.push(wrap('employer.householdQuarterlyCashWages', 'Household cash wages this quarter, before this check', moneyInput('emoney:householdQuarterlyCashWages', model.employerExtra.householdQuarterlyCashWages == null ? null : model.employerExtra.householdQuarterlyCashWages, true)));
  }
  if (model.employmentCategory === 'railroad') {
    const ruia = model.employerExtra.railroadUnemploymentRate;
    bits.push(wrap('employer.railroadUnemploymentRate', 'Railroad unemployment rate', pctInput('epct:railroadUnemploymentRate', ruia == null ? '' : decimalToPercent(ruia))));
  }
  if (model.workCode === 'WA') {
    bits.push(wrap('employer.seattlePriorYearPayrollExpense', 'Seattle payroll expense, prior year', moneyInput('emoney:seattlePriorYearPayrollExpense', model.employerExtra.seattlePriorYearPayrollExpense == null ? null : model.employerExtra.seattlePriorYearPayrollExpense, true)));
  }
  if (model.workCode === 'NM') {
    const fee = (model.employerExtra.quarterlyHeadFeeCollection && model.employerExtra.quarterlyHeadFeeCollection.NM) || '';
    bits.push(wrap('employer.quarterlyHeadFeeCollection.NM', 'Quarterly head fee', `<select class="inp" data-bind="estr:quarterlyHeadFeeCollection"><option value="">Choose</option>${['prorated', 'full', 'skip'].map((v) => `<option value="${v}"${fee === v ? ' selected' : ''}>${v}</option>`).join('')}</select>`));
  }
  const garnOn = Array.isArray(model.garnishments);
  const garnRows = garnOn ? model.garnishments.map((g, i) => garnRow(g, i)).join('') : '<p class="hint">Off. Nothing is sent until you add an order.</p><button type="button" class="btn sec" data-action="garn-on">Add a garnishment</button>';
  const mwOn = model.minimumWage && typeof model.minimumWage === 'object';
  const mw = mwOn ? minWageFields() : '<p class="hint">Off. Nothing is sent until you turn this on.</p><button type="button" class="btn sec" data-action="mw-on">Check an hourly rate</button>';
  return `<p class="eyebrow">Step 7 of 8</p><h2 class="step-title">Employer</h2>${bannerHtml()}
    ${wrap(`employer.stateUnemploymentRate.${model.workCode || 'ST'}`, `${st} unemployment rate`, pctInput('pct:suiRate', model.suiRate), 'Blank uses the new-employer rate. From 0 to 20, with three decimals.')}
    <div class="f is-disabled"><div class="lab"><label>FUTA rate</label> <span class="tag tag-ns">Not supported yet</span></div>
      <div class="money pct"><input class="inp" disabled data-unsupported value="0.6"><em>%</em></div>
      <p class="hint">Worked out by the engine, including credit reduction.</p><span class="path">Not sent</span></div>
    <p class="flat">${esc(paid)}</p>
    <label class="chk${offer ? '' : ' is-disabled'}"><input class="tick" type="checkbox" data-bind="ebool:supplementalFlatRateElection"${flatChecked ? ' checked' : ''}${offer ? '' : ' disabled'}><span><span class="cl">Flat rate on supplemental wages</span><span class="hint">${offer ? 'The employer chooses the flat supplemental rate.' : esc(st) + " doesn't offer one."}</span><span class="path">employer.supplementalFlatRateElection.${esc(model.workCode || 'ST')}</span></span></label>
    ${advanced('s7', 'Advanced', `${bits.length} fields`, bits.join(''))}
    ${advanced('garn', 'Garnishments', garnOn ? `${model.garnishments.length} orders` : 'Off', garnRows + (garnOn ? '<button type="button" class="btn sec" data-action="garn-add">+ Add garnishment</button> <button type="button" class="lnk" data-action="garn-off">Turn off</button>' : ''))}
    ${advanced('mw', 'Minimum wage check', mwOn ? 'On' : 'Off', mw + (mwOn ? '<button type="button" class="lnk" data-action="mw-off">Turn off</button>' : ''))}`;
}

function garnRow(g, i) {
  const types = ['consumer_creditor', 'child_support', 'federal_student_loan_default'];
  const ordered = g.amountOrdered != null ? g.amountOrdered : g.amount;
  const max = ordered === Number.MAX_SAFE_INTEGER;
  const sof = g.supportingOtherFamily;
  const support = g.type === 'child_support' ? `<div class="f${errClass(`garnishments[${i}].supportingOtherFamily`)}" data-path="garnishments[${i}].supportingOtherFamily"><div class="lab"><label>Supports another family</label></div>
      <label class="rad"><input class="dot" type="radio" name="sof-${i}" data-bind="garn:${i}:supportingOtherFamily" value="true"${sof === true ? ' checked' : ''}><span>Yes</span></label>
      <label class="rad"><input class="dot" type="radio" name="sof-${i}" data-bind="garn:${i}:supportingOtherFamily" value="false"${sof === false ? ' checked' : ''}><span>No</span></label>
      ${fieldError(`garnishments[${i}].supportingOtherFamily`)}<span class="path">garnishments[${i}].supportingOtherFamily</span></div>` : '';
  return `<div class="blk"><div class="grid g2">
      ${wrap(`garnishments[${i}].id`, 'Id', `<input class="inp" data-bind="garn:${i}:id" value="${esc(g.id || '')}">`)}
      ${wrap(`garnishments[${i}].type`, 'Type', `<select class="inp" data-bind="garn:${i}:type">${types.map((t) => `<option value="${t}"${g.type === t ? ' selected' : ''}>${t}</option>`).join('')}</select>`)}
    </div>
    ${wrap(`garnishments[${i}].amountOrdered`, 'Amount ordered, per check', moneyInput(`garn:${i}:amountOrdered`, max ? 0 : (ordered || 0)) + `<label class="chk"><input class="tick" type="checkbox" data-bind="garn:${i}:max"${max ? ' checked' : ''}><span>Maximum the law allows</span></label>`)}
    ${support}
    <div class="grid g2">
      ${wrap(`garnishments[${i}].priority`, 'Priority', `<input class="inp" inputmode="numeric" data-bind="garn:${i}:priority" value="${g.priority == null ? '' : esc(String(g.priority))}">`)}
      ${wrap(`garnishments[${i}].dependents`, 'Dependents', `<input class="inp" inputmode="numeric" data-bind="garn:${i}:dependents" value="${g.dependents == null ? '' : esc(String(g.dependents))}">`)}
      ${wrap(`garnishments[${i}].householdSize`, 'Household size', `<input class="inp" inputmode="numeric" data-bind="garn:${i}:householdSize" value="${g.householdSize == null ? '' : esc(String(g.householdSize))}">`)}
      ${wrap(`garnishments[${i}].expectedAnnualEarnings`, 'Expected annual earnings', moneyInput(`garn:${i}:expectedAnnualEarnings`, g.expectedAnnualEarnings == null ? null : g.expectedAnnualEarnings, true))}
      ${wrap(`garnishments[${i}].garnishedThisYearForThisOrder`, 'Already garnished this year for this order', moneyInput(`garn:${i}:garnishedThisYearForThisOrder`, g.garnishedThisYearForThisOrder == null ? null : g.garnishedThisYearForThisOrder, true))}
    </div>
    <label class="chk"><input class="tick" type="checkbox" data-bind="garn:${i}:arrearsOver12Weeks" value="true"${g.arrearsOver12Weeks ? ' checked' : ''}><span><span class="cl">Arrears over 12 weeks</span><span class="path">garnishments[${i}].arrearsOver12Weeks</span></span></label>
    <label class="chk"><input class="tick" type="checkbox" data-bind="garn:${i}:headOfFamily" value="true"${g.headOfFamily ? ' checked' : ''}><span><span class="cl">Head of family</span><span class="path">garnishments[${i}].headOfFamily</span></span></label>
    <label class="chk"><input class="tick" type="checkbox" data-bind="garn:${i}:wageExemptionWaivedInWriting" value="true"${g.wageExemptionWaivedInWriting ? ' checked' : ''}><span><span class="cl">Wage exemption waived in writing</span><span class="path">garnishments[${i}].wageExemptionWaivedInWriting</span></span></label>
    <label class="chk"><input class="tick" type="checkbox" data-bind="garn:${i}:soleHouseholdSupport" value="true"${g.soleHouseholdSupport ? ' checked' : ''}><span><span class="cl">Sole household support</span><span class="path">garnishments[${i}].soleHouseholdSupport</span></span></label>
    <button type="button" class="x" data-action="garn-remove" data-i="${i}">Remove</button></div>`;
}
function minWageFields() {
  const m = model.minimumWage || {};
  const occ = m.occupation || '';
  return `${wrap('minimumWageCheck.hourlyRate', 'Hourly rate', moneyInput('mw:hourlyRate', m.hourlyRate, true))}
    ${wrap('minimumWageCheck.locality', 'Locality', `<input class="inp" data-bind="mw:locality" value="${esc(m.locality || '')}">`)}
    ${wrap('minimumWageCheck.employeeCount', 'Employee count', `<input class="inp" inputmode="numeric" data-bind="mw:employeeCount" value="${m.employeeCount == null ? '' : esc(String(m.employeeCount))}">`)}
    <label class="chk"><input class="tick" type="checkbox" data-bind="mw:tipped"${m.tipped ? ' checked' : ''}><span><span class="cl">Tipped</span><span class="path">minimumWageCheck.tipped</span></span></label>
    ${wrap('minimumWageCheck.region', 'Region', `<input class="inp" data-bind="mw:region" value="${esc(m.region || '')}">`)}
    ${wrap('minimumWageCheck.occupation', 'Occupation', `<select class="inp" data-bind="mw:occupation"><option value="">Choose</option><option value="food_service"${occ === 'food_service' ? ' selected' : ''}>Food service</option><option value="service_employee"${occ === 'service_employee' ? ' selected' : ''}>Service employee</option></select>`)}`;
}

function oneLine(n) {
  if (n === 1) return `${model.checkDate || 'No date'} · ${freqLabel(model.payFrequency)}`;
  if (n === 2) return `${stateLabel(model.workCode)} · ${model.principalWorkplace ? 'principal workplace' : 'not the principal workplace'}`;
  if (n === 3) return model.legacyW4 ? `2019 or earlier · ${model.filingStatus === 'married_joint' ? 'Married' : 'Single'} · ${model.legacyAllowances || 0} allowances` : (FILING_LABEL[model.filingStatus] || model.filingStatus);
  if (n === 4) return model.homeCode && model.homeCode !== model.workCode ? `${stateLabel(model.workCode)} work · ${stateLabel(model.homeCode)} home` : stateLabel(model.workCode);
  if (n === 5) return `Gross ${formatMoney(grossCents(model))}`;
  if (n === 6) return `${model.deductions.length} deduction${model.deductions.length === 1 ? '' : 's'}`;
  if (n === 7) return model.suiRate ? `Unemployment ${model.suiRate}%` : 'Unemployment at the new-employer rate';
  return '';
}
function step8() {
  const rows = STEPS.filter((s) => s.n < 8).map((s) => `<div class="rv"><div><b>${esc(s.name)}</b><p>${esc(oneLine(s.n))}</p></div><button type="button" class="lnk" data-action="edit" data-step="${s.n}">Edit</button></div>`).join('');
  const localGap = !LOCAL[model.workCode] ? stateLabel(model.workCode) : '';
  return `<p class="eyebrow">Step 8 of 8</p><h2 class="step-title">Review and run</h2><p class="sub">Check the request, then run it against the engine.</p>${banner ? bannerHtml() : keyGateHtml()}
    <div class="rev">${rows}</div>
    <div class="note note-info"><b>Not included.</b> Split work locations, tips, and an employer FUTA rate. Unsupported items are left off the request.${localGap ? ' ' + esc(`Local tax for ${localGap} is in progress.`) : ''}</div>`;
}

function prettyDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return iso || '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}
function outcomeSentence(result) {
  for (const t of result.taxes || []) {
    const d = String(t.detail || '');
    if (/reciproc/i.test(d) || /nonresident/i.test(d)) return d.replace(/\s+/g, ' ').trim();
  }
  return '';
}
function placeOf(line) {
  if (line.jurisdiction === 'federal') return 'Federal';
  const code = String(line.id || '').split('_')[0];
  const st = stateBy(code);
  return st ? st.name : (line.jurisdiction || '');
}
function taxTable(lines) {
  const head = '<div class="rr rh"><span>Tax</span><span>Jurisdiction</span><span class="num">Taxable wages</span><span class="num">Rate</span><span class="num">Amount</span><span>How it was worked out</span></div>';
  const rows = lines.map((line) => {
    const rate = parseRate(line.detail);
    const zero = !line.amount ? ' zero' : '';
    const tier = line.dataQuality ? `<a class="tag tag-ip" href="#notice-${esc(line.id)}">${esc(TIER[line.dataQuality.tier] || line.dataQuality.tier)}</a>` : '';
    const det = esc(line.detail || '');
    const more = (line.detail || '').length > 140 ? '<button type="button" class="moreline" data-action="more">Show the rest</button>' : '';
    return `<div class="rr${zero}"><div><b>${esc(line.name)}</b><code>${esc(line.id)}</code> ${tier}</div><div>${esc(placeOf(line))}<em>${esc(line.jurisdiction || '')}</em></div><div class="num">${formatMoney(line.taxableWages || 0)}</div><div class="num">${esc(rate)}</div><div class="num amt">${formatMoney(line.amount || 0)}</div><div><div class="det">${det}</div>${more}</div></div>
      <div class="mrow${zero}"><div class="mr1"><span>${esc(line.name)}</span><span class="amt">${formatMoney(line.amount || 0)}</span></div><div class="mr2">${esc(placeOf(line))} · ${esc(line.jurisdiction || '')} · ${esc(rate)} on ${formatMoney(line.taxableWages || 0)}</div><div class="det">${det}</div>${more}</div>`;
  }).join('');
  return `<div class="rt">${head}${rows}</div>`;
}
function resultsView() {
  const r = lastResult || {};
  const sentence = outcomeSentence(r);
  const sub = [freqLabel(model.payFrequency), prettyDate(r.checkDate || model.checkDate), sentence].filter(Boolean).join(' · ');
  const ee = (r.taxes || []).filter((t) => t.payer === 'employee');
  const er = (r.taxes || []).filter((t) => t.payer === 'employer');
  const sum = (rows) => rows.reduce((n, t) => n + (Number(t.amount) || 0), 0);
  let taxes = '';
  if (ee.length) taxes += `<div class="gh"><span>Withheld from the employee</span><span>${formatMoney(sum(ee))}</span></div>${taxTable(ee)}`;
  if (er.length) taxes += `<div class="gh"><span>Paid by the employer</span><span>${formatMoney(sum(er))}</span></div>${taxTable(er)}`;
  const req = JSON.stringify(lastRequest || serialize(model), null, 2);
  const res = JSON.stringify(r, null, 2);
  const origin = window.OMNIA_API_ORIGIN || 'https://api.omnia.tax';
  const curl = `curl ${origin}/v1/paycheck \\\n  -H "Authorization: Bearer $OMNIA_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${req.replace(/'/g, `'\\''`)}'`;
  const tab = (id, label) => `<button type="button" data-action="tab" data-tab="${id}" class="${resultTab === id ? 'on' : ''}">${label}</button>`;
  let body = '';
  if (resultTab === 'taxes') {
    body = taxes + `<div class="net"><div><span>Gross</span><span>${formatMoney(r.grossPay || 0)}</span></div><div><span>− Pre-tax deductions</span><span>${formatMoney(r.pretaxDeductions || 0)}</span></div><div><span>− Employee taxes</span><span>${formatMoney(r.employeeTaxTotal || 0)}</span></div><div><span>− Post-tax deductions</span><span>${formatMoney(r.posttaxDeductions || 0)}</span></div><div class="nt"><span>Net pay</span><span>${formatMoney(r.netPay || 0)}</span></div></div>`;
    const notices = r.notices || [];
    const warnings = r.warnings || [];
    if (!notices.length && !warnings.length) body += '<div class="note note-info">None for this check.</div>';
    else {
      body += notices.map((n) => `<div class="note note-warn" id="notice-${esc(n.taxId)}"><b>${esc(n.taxId)}</b> ${esc(n.note)}</div>`).join('');
      body += warnings.map((w) => `<div class="note note-warn">${esc(typeof w === 'string' ? w : JSON.stringify(w))}</div>`).join('');
    }
    if (r.garnishment) body += `<div class="note note-info"><b>Garnishment</b><p>Withheld ${formatMoney(r.garnishment.totalWithheld || 0)}.${r.garnishment.netPayAfterGarnishment == null ? '' : ' Net after garnishment ' + formatMoney(r.garnishment.netPayAfterGarnishment) + '.'}</p></div>`;
    if (r.minimumWage) {
      const m = r.minimumWage;
      body += `<div class="note note-info"><b>Minimum wage</b><p>${m.compliant ? 'At or above the binding minimum.' : 'Short by ' + formatMoney(m.shortfallPerHour || 0) + ' an hour.'} Binding ${esc(m.bindingJurisdiction || m.bindingLevel || '')}.</p></div>`;
    }
  } else if (resultTab === 'req') {
    body = `<div class="code"><div class="code-h"><span>Request</span><button type="button" class="btn sec" data-action="copy" data-copy="req">Copy</button></div><pre>${hi(req)}</pre><div class="code-h" style="margin-top:16px"><span>curl</span><button type="button" class="btn sec" data-action="copy" data-copy="curl">Copy</button></div><pre>${esc(curl)}</pre></div>`;
  } else {
    body = `<div class="code"><div class="code-h"><span>Response</span><button type="button" class="btn sec" data-action="copy" data-copy="res">Copy</button></div><pre>${hi(res)}</pre></div>`;
  }
  const cards = [['Gross pay', r.grossPay], ['Employee taxes', r.employeeTaxTotal], ['Employer taxes', r.employerTaxTotal], ['Net pay', r.netPay]];
  return `${bannerHtml()}<p class="eyebrow">Result</p><h2 class="step-title">${esc(exampleTitle || 'Your paycheck')}</h2><p class="sub">${esc(sub)}</p>
    ${lastMode === 'test' ? '<p class="hint">Run with a test key: same engine and data as a live key, and not billed.</p>' : ''}
    <div class="cards">${cards.map(([n, v], i) => `<div class="card${i === 3 ? ' netc' : ''}"><span>${n}</span><b>${formatMoney(v || 0)}</b></div>`).join('')}</div>
    <div class="tabs">${tab('taxes', 'Taxes')}${tab('req', 'Request JSON')}${tab('res', 'Response JSON')}</div>
    ${body}
    <div class="actions"><button type="button" class="btn sec" id="editRequest" data-action="edit-request">Edit request</button><button type="button" class="btn pri" id="runAgain" data-action="run">${busy ? '<span class="spin"></span>' : ''}Run again</button></div>`;
}

function primaryLabel() {
  if (returnToReview && step !== 8) return 'Back to review';
  if (step === 8) return 'Run calculation';
  return 'Continue to ' + STEPS[step - 1].next;
}
function wizard() {
  const body = [step1, step2, step3, step4, step5, step6, step7, step8][step - 1]();
  const back = step > 1 ? '<button type="button" class="btn sec" id="backBtn" data-action="back">Back</button>' : '';
  const bar = `<div class="stepper"><div class="stepper-top"><b>Step ${step} of 8</b> · ${esc(STEPS[step - 1].name)}</div><div class="stepper-bar"><i style="width:${(step / 8) * 100}%"></i></div></div><p><button type="button" class="lnk req-link" data-action="sheet">Request so far</button></p>`;
  return `${bar}${body}<div class="actions">${back}<button type="button" class="btn pri" id="primary" data-action="primary" aria-busy="${busy ? 'true' : 'false'}">${busy ? '<span class="spin"></span>' : ''}${esc(primaryLabel())}</button></div>`;
}

function renderRail() {
  $('railList').innerHTML = STEPS.map((s) => {
    const cls = view === 'wizard' && s.n === step ? 'cur' : visited.has(s.n) ? 'done' : 'future';
    const mark = cls === 'done' ? '✓' : String(s.n);
    return `<li class="${cls}"><button type="button" class="stepbtn" data-action="rail" data-step="${s.n}"${cls === 'future' ? ' disabled' : ''}><span class="num">${mark}</span><span>${esc(s.name)}</span></button></li>`;
  }).join('');
}
function renderSide() {
  const full = serialize(model);
  const slice = view === 'results' ? full : stepSlice(full, step);
  const html = hi(JSON.stringify(slice, null, 2));
  $('sidePre').innerHTML = html;
  $('sheetPre').innerHTML = html;
  $('sideStep').textContent = view === 'results' ? 'Result' : `Step ${step}`;
}
function render() {
  refreshReciprocal();
  const main = $('main');
  main.innerHTML = view === 'results' ? resultsView() : wizard();
  main.classList.toggle('wide', view === 'results');
  $('layout').classList.toggle('res', view === 'results');
  renderRail();
  renderSide();
  paintKey();
}

function applyBind(el) {
  const parts = el.dataset.bind.split(':');
  const kind = parts[0];
  const val = el.type === 'checkbox' ? el.checked : el.value;
  if (kind === 'str') {
    model[parts[1]] = el.value;
    if (parts[1] === 'homeAddress') model.homeDirty = true;
    if (parts[1] === 'workAddress') model.workDirty = true;
  } else if (kind === 'bool') model[parts[1]] = el.checked;
  else if (kind === 'cents') model[parts[1]] = dollarsToCents(el.value) || 0;
  else if (kind === 'centsornull') model[parts[1]] = el.value.trim() === '' ? null : (dollarsToCents(el.value) || 0);
  else if (kind === 'mfs') model.filingStatus = el.checked ? 'married_separate' : 'single';
  else if (kind === 'cert' || kind === 'certnum') {
    const b = bag(parts[1]);
    if (el.value.trim() === '') delete b[parts[2]];
    else b[parts[2]] = kind === 'certnum' ? Math.round(Number(el.value)) : el.value.trim();
    delete model.fromAddress[parts[1] + ':' + parts[2]];
  } else if (kind === 'certcents') {
    const b = bag(parts[1]);
    if (el.value.trim() === '') delete b[parts[2]];
    else b[parts[2]] = dollarsToCents(el.value) || 0;
    delete model.fromAddress[parts[1] + ':' + parts[2]];
  } else if (kind === 'certbool') {
    const b = bag(parts[1]);
    if (el.checked) b[parts[2]] = true;
    else delete b[parts[2]];
    delete model.fromAddress[parts[1] + ':' + parts[2]];
  } else if (kind === 'certpick') {
    const b = bag(parts[1]);
    const opt = el.selectedOptions && el.selectedOptions[0];
    if (!opt || opt.value === '') delete b[parts[2]];
    else b[parts[2]] = JSON.parse(opt.dataset.raw);
    delete model.fromAddress[parts[1] + ':' + parts[2]];
  } else if (kind === 'certdec') {
    const b = bag(parts[1]);
    if (el.value.trim() === '') delete b[parts[2]];
    else {
      const dec = percentToDecimal(el.value);
      if (dec != null && !Number.isNaN(dec)) b[parts[2]] = dec;
    }
  } else if (kind === 'list') {
    const b = bag(parts[1]);
    const items = el.value.split(',').map((s) => s.trim()).filter(Boolean);
    if (!items.length) delete b[parts[2]];
    else b[parts[2]] = items;
    delete model.fromAddress[parts[1] + ':' + parts[2]];
  } else if (kind === 'rowstr') model[parts[1]][Number(parts[2])][parts[3]] = el.value;
  else if (kind === 'rowcents') model[parts[1]][Number(parts[2])][parts[3]] = dollarsToCents(el.value) || 0;
  else if (kind === 'rowtype') {
    const row = model.earnings[Number(parts[1])];
    if (el.value === 'overtime') { row.category = 'regular'; row.overtime = true; }
    else { row.category = el.value; row.overtime = false; }
  } else if (kind === 'dedtype') {
    const row = model.deductions[Number(parts[1])];
    row.category = el.value === 'null' ? null : el.value;
  } else if (kind === 'ytdcents') {
    if (el.value.trim() === '') delete model.ytdExtra[parts[1]];
    else model.ytdExtra[parts[1]] = dollarsToCents(el.value) || 0;
  } else if (kind === 'ytdmap') {
    const st = model.workCode;
    if (!st) return;
    const map = { ...(model.ytdExtra[parts[1]] || {}) };
    if (el.value.trim() === '') delete map[st];
    else map[st] = dollarsToCents(el.value) || 0;
    if (Object.keys(map).length) model.ytdExtra[parts[1]] = map;
    else delete model.ytdExtra[parts[1]];
  } else if (kind === 'ytdnest') {
    const obj = { ...(model.ytdExtra[parts[1]] || {}) };
    if (el.value.trim() === '') delete obj[parts[2]];
    else obj[parts[2]] = dollarsToCents(el.value) || 0;
    if (Object.keys(obj).length) model.ytdExtra[parts[1]] = obj;
    else delete model.ytdExtra[parts[1]];
  } else if (kind === 'localid' || kind === 'localamt') {
    const idEl = document.querySelector('[data-bind="localid"]');
    const amtEl = document.querySelector('[data-bind="localamt"]');
    const id = (idEl && idEl.value || '').trim();
    const prev = model.ytdExtra.localIncomeTax || {};
    const next = {};
    if (id) next[id] = amtEl && amtEl.value.trim() !== '' ? (dollarsToCents(amtEl.value) || 0) : (prev[id] || 0);
    if (Object.keys(next).length) model.ytdExtra.localIncomeTax = next;
    else delete model.ytdExtra.localIncomeTax;
  } else if (kind === 'pct') model[parts[1]] = el.value.trim();
  else if (kind === 'emap' || kind === 'edec' || kind === 'estr' || kind === 'ebool') {
    const st = model.workCode;
    if (!st) return;
    const map = { ...(model.employerExtra[parts[1]] || {}) };
    if (kind === 'ebool') { if (el.checked) map[st] = true; else delete map[st]; }
    else if (el.value.trim() === '') delete map[st];
    else if (kind === 'estr') map[st] = el.value;
    else if (kind === 'edec') map[st] = Number(el.value);
    else {
      const dec = percentToDecimal(el.value);
      if (dec != null && !Number.isNaN(dec)) map[st] = dec;
    }
    if (Object.keys(map).length) model.employerExtra[parts[1]] = map;
    else delete model.employerExtra[parts[1]];
  } else if (kind === 'emoney') {
    if (el.value.trim() === '') delete model.employerExtra[parts[1]];
    else model.employerExtra[parts[1]] = dollarsToCents(el.value) || 0;
  } else if (kind === 'epct') {
    if (el.value.trim() === '') delete model.employerExtra[parts[1]];
    else {
      const dec = percentToDecimal(el.value);
      if (dec != null && !Number.isNaN(dec)) model.employerExtra[parts[1]] = dec;
    }
  } else if (kind === 'ebool1') {
    if (el.checked) model.employerExtra[parts[1]] = true;
    else delete model.employerExtra[parts[1]];
  } else if (kind === 'garn') {
    const g = model.garnishments[Number(parts[1])];
    const field = parts[2];
    if (!g) return;
    if (field === 'max') {
      delete g.amount;
      g.amountOrdered = el.checked ? Number.MAX_SAFE_INTEGER : 0;
    } else if (field === 'amountOrdered' || field === 'amount') {
      delete g.amount;
      if (g.amountOrdered !== Number.MAX_SAFE_INTEGER) g.amountOrdered = dollarsToCents(el.value) || 0;
    }
    else if (field === 'supportingOtherFamily') g.supportingOtherFamily = el.value === 'true';
    else if (field === 'arrearsOver12Weeks' || field === 'headOfFamily' || field === 'wageExemptionWaivedInWriting' || field === 'soleHouseholdSupport') {
      if (el.checked) g[field] = true;
      else delete g[field];
    } else if (field === 'priority' || field === 'dependents' || field === 'householdSize') {
      if (el.value.trim() === '') delete g[field];
      else g[field] = Math.round(Number(el.value));
    } else if (field === 'expectedAnnualEarnings' || field === 'garnishedThisYearForThisOrder') {
      if (el.value.trim() === '') delete g[field];
      else g[field] = dollarsToCents(el.value) || 0;
    } else if (field === 'id' || field === 'type') g[field] = el.value;
  } else if (kind === 'mw') {
    if (!model.minimumWage) model.minimumWage = {};
    const field = parts[1];
    if (field === 'hourlyRate') model.minimumWage.hourlyRate = el.value.trim() === '' ? null : (dollarsToCents(el.value) || 0);
    else if (field === 'tipped') model.minimumWage.tipped = el.checked;
    else if (field === 'employeeCount') {
      if (el.value.trim() === '') delete model.minimumWage.employeeCount;
      else model.minimumWage.employeeCount = Math.round(Number(el.value));
    } else if (el.value.trim() === '') delete model.minimumWage[field];
    else model.minimumWage[field] = el.value;
  }
  return val;
}

function syncCredit() {
  const kids = Math.max(0, Math.round(Number(model.depChildren) || 0));
  const other = Math.max(0, Math.round(Number(model.depOther) || 0));
  model.dependentCredit = kids * 200000 + other * 50000;
  const credit = document.querySelector('[data-bind="cents:dependentCredit"]');
  if (credit) credit.value = centsToDollars(model.dependentCredit);
}
function updateGross() {
  const el = $('grossLine');
  if (el) el.textContent = formatMoney(grossCents(model));
}
function updateYtdHints() {
  const bases = yearBases();
  const ss = $('ssHint');
  const futa = $('futaHint');
  if (ss) ss.textContent = model.ytdSS >= bases.socialSecurity * 100 ? `The $${bases.socialSecurity.toLocaleString('en-US')} base is met, so Social Security is $0.` : '';
  if (futa) futa.textContent = model.ytdFuta >= bases.futa * 100 ? `The $${bases.futa.toLocaleString('en-US')} base is met, so FUTA is $0.` : '';
}

function onInput(ev) {
  const el = ev.target;
  if (!el.dataset || !el.dataset.bind) return;
  if (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'radio') return;
  applyBind(el);
  if (el.dataset.bind === 'str:depChildren' || el.dataset.bind === 'str:depOther') {
    model.creditManual = false;
    syncCredit();
  }
  if (el.dataset.bind === 'cents:dependentCredit') model.creditManual = true;
  const path = el.closest('[data-path]');
  if (path && errors[path.dataset.path]) {
    delete errors[path.dataset.path];
    path.classList.remove('is-error');
    const msg = path.querySelector('.msg');
    if (msg) msg.remove();
  }
  updateGross();
  updateYtdHints();
  renderSide();
}
function onChange(ev) {
  const el = ev.target;
  if (!el.dataset || !el.dataset.bind) return;
  const bind = el.dataset.bind;
  if (bind === 'str:workCode' && el.value !== model.workCode) {
    model.workCode = el.value;
    model.workCert = {};
    model.fromAddress = {};
    refreshReciprocal();
    render();
    return;
  }
  if (bind === 'str:homeCode') {
    if (el.value !== model.homeCode) model.homeCert = {};
    model.homeCode = el.value;
    if (!model.homeCode || model.homeCode === model.workCode) model.homeCert = {};
    refreshReciprocal();
    render();
    return;
  }
  if (bind === 'str:employmentCategory' || bind === 'bool:legacyW4' || bind === 'str:filingStatus' || bind === 'mfs:1' || bind === 'bool:w4Exempt' || bind.startsWith('rowtype') || bind.startsWith('garn:') && (bind.endsWith(':type') || bind.endsWith(':max'))) {
    applyBind(el);
    render();
    return;
  }
  if (bind === 'str:checkDate') {
    applyBind(el);
    loadStates();
    return;
  }
  applyBind(el);
  renderSide();
}
function onBlur(ev) {
  const el = ev.target;
  if (!el.dataset || (el.dataset.bind !== 'str:homeAddress' && el.dataset.bind !== 'str:workAddress')) return;
  if (!model.homeDirty && !model.workDirty) return;
  clearTimeout(lookupTimer);
  lookupTimer = setTimeout(() => runLookup(null), 600);
}

function showErrors(details) {
  const list = Array.isArray(details) ? details : [];
  errors = {};
  for (const d of list) if (d && d.path) errors[d.path] = d.message || 'This needs a fix.';
  banner = list.length ? `${list.length} fields need a fix` : '';
  bannerHref = '';
  bannerKind = 'bad';
  bannerLinkLabel = '';
  bannerExample = false;
  if (list[0] && list[0].path) {
    step = stepForPath(list[0].path);
    visited.add(step);
    view = 'wizard';
  }
  busy = false;
  render();
}
function go(n) {
  step = Math.min(8, Math.max(1, Number(n) || 1));
  visited.add(step);
  view = 'wizard';
  render();
}
function showResult(result, request) {
  lastResult = result;
  if (request) lastRequest = request;
  else if (!lastRequest) lastRequest = serialize(model);
  view = 'results';
  resultTab = 'taxes';
  busy = false;
  banner = '';
  render();
}

async function continuePrimary() {
  if (busy) return;
  if (step === 8 && !(returnToReview && step !== 8)) {
    await runCalc();
    return;
  }
  const list = validateStep(model, step, { supportedYears: taxYears });
  if (list.length) {
    showErrors(list);
    const bad = document.querySelector('.is-error input, .is-error select, .is-error textarea');
    if (bad) bad.focus();
    return;
  }
  banner = '';
  errors = {};
  if (returnToReview) {
    returnToReview = false;
    step = 8;
    visited.add(8);
    render();
    return;
  }
  if (step < 8) {
    step += 1;
    visited.add(step);
  }
  render();
}

async function runCalc() {
  if (busy) return;
  const all = [];
  for (let s = 1; s <= 7; s++) all.push(...validateStep(model, s, { supportedYears: taxYears }));
  if (all.length) {
    showErrors(all);
    return;
  }
  busy = true;
  render();
  const request = serialize(model);
  lastRequest = request;
  const key = window.Omnia && Omnia.apiKey();
  const headers = { 'Content-Type': 'application/json' };
  if (key && key.key) headers.Authorization = 'Bearer ' + key.key;
  try {
    const res = await fetch('/v1/paycheck', { method: 'POST', headers, body: JSON.stringify(request) });
    const body = await res.json().catch(() => ({}));
    busy = false;
    lastMode = res.headers.get('Omnia-Mode') || '';
    if (res.status === 422 && Array.isArray(body.details)) { showErrors(body.details); return; }
    if (res.status === 401) {
      setKeyGate(false);
      view = 'wizard';
      render();
      return;
    }
    if (res.status === 402) {
      banner = body.error || 'This account cannot run a calculation yet.';
      bannerHref = '/dashboard';
      bannerLinkLabel = 'Open your account';
      bannerExample = false;
      bannerKind = 'bad';
      view = 'wizard';
      render();
      return;
    }
    if (res.status === 429) {
      banner = 'Too many calculations. Try again in a minute.';
      bannerHref = '';
      bannerLinkLabel = '';
      bannerExample = false;
      bannerKind = 'warn';
      view = 'wizard';
      render();
      return;
    }
    if (!res.ok) {
      banner = `Something went wrong on our side. Request id ${body.requestId || 'unknown'}.`;
      bannerHref = '';
      bannerLinkLabel = '';
      bannerExample = false;
      bannerKind = 'bad';
      view = 'wizard';
      render();
      return;
    }
    banner = '';
    showResult(body, request);
  } catch {
    busy = false;
    banner = 'Something went wrong on our side. Request id unknown.';
    bannerHref = '';
    bannerLinkLabel = '';
    bannerExample = false;
    bannerKind = 'bad';
    view = 'wizard';
    render();
  }
}

function codeSummary(cert) {
  if (!cert || typeof cert !== 'object') return '';
  const bits = [];
  for (const k of ['workPSD', 'residencePSD', 'workCity', 'residenceCity', 'schoolDistrictCode', 'county', 'locality']) {
    if (cert[k]) bits.push(`${k} ${cert[k]}`);
  }
  return bits.join(' · ');
}
async function runLookup() {
  if (lookupBusy) return;
  if (!model.homeAddress && !model.workAddress) return;
  lookupBusy = true;
  document.querySelectorAll('[data-action="lookup"]').forEach((btn) => {
    btn.setAttribute('aria-busy', 'true');
    if (!btn.querySelector('.spin')) btn.insertAdjacentHTML('afterbegin', '<span class="spin"></span>');
  });
  const key = window.Omnia && Omnia.apiKey();
  const headers = { 'Content-Type': 'application/json' };
  if (key && key.key) headers.Authorization = 'Bearer ' + key.key;
  const payload = { checkDate: model.checkDate || undefined };
  if (model.workAddress) payload.workAddress = model.workAddress;
  if (model.homeAddress) payload.residenceAddress = model.homeAddress;
  try {
    // Census and the boundary services can be slow; a minute or more is normal for a first lookup.
    const res = await fetch('/v1/address', { method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(150000) });
    const body = await res.json().catch(() => ({}));
    model.homeDirty = false;
    model.workDirty = false;
    if (res.status === 401) {
      setKeyGate(true);
    } else if (res.status === 429) {
      banner = 'Too many lookups. Try again in a minute.';
      bannerKind = 'warn';
      bannerHref = '';
      bannerLinkLabel = '';
      bannerExample = false;
    } else if (res.status === 502 || res.status === 503) {
      // The address service did not answer. That says nothing about the address itself.
      const fail = 'The address service did not answer. Try again in a minute; nothing was billed.';
      if (model.workAddress) model.workLookup = { error: fail };
      if (model.homeAddress) model.homeLookup = { error: fail };
    } else if (!res.ok) {
      const fail = "We couldn't place this address. Check the ZIP, or enter the codes in step 4.";
      if (model.workAddress) model.workLookup = { error: fail };
      if (model.homeAddress) model.homeLookup = { error: fail };
    } else {
      banner = '';
      const fail = body.notResolvable || (Array.isArray(body.lookupFailures) && body.lookupFailures.length);
      const msg = "We couldn't place this address. Check the ZIP, or enter the codes in step 4.";
      // The API prefixes each reason with the address it is about; keep each on its own card.
      const reasons = body.fullyResolved === false ? (body.warnings || []) : [];
      const forRole = (role) => reasons.filter((w) => {
        const m = /^(Work|Residence) address:/.exec(String(w));
        return m ? m[1].toLowerCase() === role : role === 'work';
      });
      const side = (block, role) => block && {
        matched: !!block.matched,
        matchedAddress: block.matchedAddress || '',
        precision: block.precision || '',
        pointSource: block.pointSource || '',
        state: block.state || '',
        county: block.county || '',
        place: block.place || '',
        warnings: forRole(role),
        failures: role === 'work' || !body.work ? (body.lookupFailures || []) : [],
        notes: (role === 'work' || !body.work ? (body.notResolvable || []) : []).filter((n) => !(body.lookupFailures || []).includes(n)),
        error: block.matched ? '' : msg,
      };
      if (model.workAddress) model.workLookup = side(body.work, 'work') || (fail ? { error: msg } : null);
      if (model.homeAddress) model.homeLookup = side(body.residence, 'residence') || (fail ? { error: msg } : null);
      if (body.certificate && typeof body.certificate === 'object') {
        for (const [k, v] of Object.entries(body.certificate)) {
          if (!CERT_KEYS.has(k) || v == null || v === '' || v === false) continue;
          model.workCert[k] = v;
          model.fromAddress['work:' + k] = true;
        }
        const summary = codeSummary(body.certificate);
        if (model.workLookup && summary) model.workLookup.codes = summary;
      }
      if (body.state) model.workCode = body.state;
      if (body.residenceState) model.homeCode = body.residenceState;
      refreshReciprocal();
    }
  } catch (err) {
    banner = err && err.name === 'TimeoutError'
      ? 'The address service is taking too long. Try again in a minute; nothing was billed.'
      : 'Something went wrong on our side. Request id unknown.';
    bannerHref = '';
    bannerLinkLabel = '';
    bannerExample = false;
    bannerKind = 'bad';
  } finally {
    lookupBusy = false;
    render();
  }
}

function addEarning(id) {
  const spec = EARN_MENU.find((item) => item.id === id);
  if (!spec || spec.disabled) return;
  const n = model.earnings.length + 1;
  model.earnings.push({
    code: spec.code === 'REG' && n > 1 ? spec.code + n : spec.code,
    category: spec.category,
    amount: 0,
    overtime: !!spec.overtime,
  });
  render();
}
function loadExample(id, markAll) {
  const ex = examples.find((e) => e.id === id);
  if (!ex) return;
  loadRequest(model, ex.request);
  exampleTitle = ex.title || '';
  exampleId = ex.id;
  visited = markAll ? new Set([1, 2, 3, 4, 5, 6, 7, 8]) : new Set([1]);
  step = 1;
  view = 'wizard';
  returnToReview = false;
  errors = {};
  banner = '';
  refreshReciprocal();
  render();
}

function onClick(ev) {
  const sheet = $('sheet');
  if (ev.target === sheet) { sheet.classList.remove('on'); return; }
  if (ev.target.closest('#exBtn')) {
    const menu = $('exMenu');
    menu.hidden = !menu.hidden;
    $('exBtn').setAttribute('aria-expanded', String(!menu.hidden));
    return;
  }
  if (!ev.target.closest('#exMenu')) $('exMenu').hidden = true;
  if (ev.target.closest('#keyBtn')) {
    const menu = $('keyMenu');
    menu.hidden = !menu.hidden;
    $('keyBtn').setAttribute('aria-expanded', String(!menu.hidden));
    return;
  }
  if (!ev.target.closest('#keyMenu')) $('keyMenu').hidden = true;
  if (ev.target.closest('#keySave')) {
    const v = $('keyInput').value.trim();
    if (v && window.Omnia) Omnia.setApiKey({ key: v });
    $('keyMenu').hidden = true;
    paintKey();
    return;
  }
  if (ev.target.closest('#keyForget')) {
    if (window.Omnia) Omnia.forgetKey();
    $('keyInput').value = '';
    $('keyMenu').hidden = true;
    paintKey();
    return;
  }
  const actionEl = ev.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  if (action === 'primary') { continuePrimary(); return; }
  if (action === 'w4form') {
    const old = actionEl.dataset.form === 'old';
    if (old !== model.legacyW4) {
      model.legacyW4 = old;
      // Head of household did not exist on the old form.
      if (old && model.filingStatus === 'head_of_household') model.filingStatus = 'single';
      if (old && model.filingStatus === 'married_separate') model.filingStatus = 'single';
      if (old && model.legacyAllowances === '') model.legacyAllowances = '0';
    }
    render();
    return;
  }
  if (action === 'back') { if (step > 1) { step -= 1; render(); } return; }
  if (action === 'rail') {
    const n = Number(actionEl.dataset.step);
    if (!visited.has(n)) return;
    view = 'wizard';
    step = n;
    render();
    return;
  }
  if (action === 'lookup') { clearTimeout(lookupTimer); runLookup(); return; }
  if (action === 'adv') {
    const id = actionEl.dataset.adv;
    const open = !advMap()[id];
    setAdv(id, open);
    actionEl.closest('.adv').classList.toggle('open', open);
    return;
  }
  if (action === 'add-earn') {
    const menu = $('earnMenu');
    if (menu) menu.hidden = !menu.hidden;
    return;
  }
  if (action === 'earn-pick') { addEarning(actionEl.dataset.id); return; }
  if (action === 'remove-earn') {
    model.earnings.splice(Number(actionEl.dataset.i), 1);
    if (!model.earnings.length) model.earnings.push({ code: 'REG', category: 'regular', amount: 0, overtime: false });
    render();
    return;
  }
  if (action === 'add-ded') { model.deductions.push({ code: 'DED', category: 'section125', amount: 0 }); render(); return; }
  if (action === 'remove-ded') { model.deductions.splice(Number(actionEl.dataset.i), 1); render(); return; }
  if (action === 'edit') {
    returnToReview = true;
    step = Number(actionEl.dataset.step);
    visited.add(step);
    view = 'wizard';
    render();
    return;
  }
  if (action === 'edit-request') { view = 'wizard'; step = 8; visited.add(8); render(); return; }
  if (action === 'run') { runCalc(); return; }
  if (action === 'tab') { resultTab = actionEl.dataset.tab; render(); return; }
  if (action === 'more') {
    const det = actionEl.previousElementSibling;
    if (det) det.classList.toggle('open');
    actionEl.textContent = det && det.classList.contains('open') ? 'Show less' : 'Show the rest';
    return;
  }
  if (action === 'copy') {
    const req = JSON.stringify(lastRequest || serialize(model), null, 2);
    const origin = window.OMNIA_API_ORIGIN || 'https://api.omnia.tax';
    const curl = `curl ${origin}/v1/paycheck \\\n  -H "Authorization: Bearer $OMNIA_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${req.replace(/'/g, `'\\''`)}'`;
    const text = actionEl.dataset.copy === 'curl' ? curl : actionEl.dataset.copy === 'res' ? JSON.stringify(lastResult, null, 2) : req;
    const btn = actionEl;
    navigator.clipboard.writeText(text).then(() => { btn.textContent = 'Copied'; }).catch(() => {});
    return;
  }
  if (action === 'sheet') { $('sheet').classList.add('on'); return; }
  if (action === 'example') { loadExample(actionEl.dataset.id, true); $('exMenu').hidden = true; return; }
  if (action === 'garn-on' || action === 'garn-add') {
    if (!Array.isArray(model.garnishments)) model.garnishments = [];
    const n = model.garnishments.length + 1;
    model.garnishments.push({ id: 'G' + n, type: 'consumer_creditor', amountOrdered: 0 });
    setAdv('garn', true);
    render();
    return;
  }
  if (action === 'garn-off') { model.garnishments = null; render(); return; }
  if (action === 'garn-remove') { model.garnishments.splice(Number(actionEl.dataset.i), 1); render(); return; }
  if (action === 'mw-on') { model.minimumWage = { hourlyRate: null }; setAdv('mw', true); render(); return; }
  if (action === 'mw-off') { model.minimumWage = null; render(); return; }
}

function paintKey() {
  const key = window.Omnia && Omnia.apiKey();
  const label = $('keyLabel');
  const dot = $('keyDot');
  if (!label || !dot) return;
  if (key && key.key) {
    label.textContent = Omnia.maskKey(key.key);
    dot.classList.add('on');
  } else {
    label.textContent = 'Your API key';
    dot.classList.remove('on');
  }
}
function renderExamples() {
  $('exMenu').innerHTML = examples.map((ex) => `<button type="button" data-action="example" data-id="${esc(ex.id)}">${esc(ex.title)}<small>${esc(ex.blurb || '')}</small></button>`).join('');
}
async function loadStates() {
  const year = Number((model.checkDate || '').slice(0, 4)) || 2026;
  try {
    const res = await fetch('/v1/states?year=' + year);
    const body = await res.json();
    states = body.states || [];
    statesReady = true;
    refreshReciprocal();
    if (view === 'wizard') render();
    else renderSide();
  } catch { /* the sentence stays on "Loading state rules…" */ }
}

document.addEventListener('input', onInput);
document.addEventListener('change', onChange);
document.addEventListener('click', onClick);
document.addEventListener('blur', onBlur, true);
$('sheetClose').addEventListener('click', () => $('sheet').classList.remove('on'));

window.OmniaSandbox = {
  serialize: () => serialize(model),
  loadRequest: (req) => { loadRequest(model, req); refreshReciprocal(); render(); },
  loadExample: (id) => loadExample(id, true),
  stepForPath,
  showErrors,
  go,
  showResult,
  model: () => model,
  step: () => step,
  visited: () => [...visited],
};

(async function boot() {
  render();
  paintKey();
  try {
    const [exRes, regRes, healthRes] = await Promise.all([
      fetch('/sandbox-examples.json'),
      fetch('/assets/state-cert-fields.json'),
      fetch('/v1/health'),
    ]);
    const exBody = await exRes.json();
    examples = exBody.examples || exBody;
    registry = await regRes.json();
    const health = await healthRes.json().catch(() => ({}));
    if (Array.isArray(health.taxYears) && health.taxYears.length) taxYears = health.taxYears;
    renderExamples();
    if (!booted) {
      booted = true;
      loadExample('pa-philadelphia', false);
    }
  } catch { render(); }
  loadStates();
})();

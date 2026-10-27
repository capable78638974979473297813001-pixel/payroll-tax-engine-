/**
 * Paycheck calculator. The request is built in calculator-form.js.
 * This file draws state certificate fields, calls POST /v1/address and
 * POST /v1/paycheck, and shows each tax line.
 */
import {
  PAY_ITEMS,
  DEDUCTION_KINDS,
  MONEY_CERT_KEYS,
  createForm,
  buildPaycheckInput,
  addressLine,
  fieldsForState,
  residenceFieldsForState,
  coerceControl,
  centsToDollars,
  CalculatorInputError,
} from '/assets/calculator-form.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const form = createForm();
let registry = {};
let states = [];
let busy = false;
let lookupBusy = false;

function num(id) {
  const el = $(id);
  if (!el || String(el.value).trim() === '') return 0;
  const n = Number(String(el.value).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function checked(id) {
  return !!($(id) && $(id).checked);
}

function readMoneyRows(listId, mapRow) {
  return [...document.querySelectorAll(`#${listId} .item-row`)].map(mapRow);
}

function syncFromDom() {
  form.checkDate = $('checkDate').value;
  form.payFrequency = $('payFrequency').value;
  form.grossPayMethod = $('grossPayMethod').value;
  form.grossPay = num('grossPay');
  form.hourlyRate = num('hourlyRate');
  form.hoursPerPeriod = num('hoursPerPeriod');
  form.grossPayYTD = num('grossPayYTD');
  form.filingStatus = $('filingStatus').value;
  form.multipleJobs = checked('multipleJobs');
  form.dependentCredit = num('dependentCredit');
  form.otherIncome = num('otherIncome');
  form.w4Deductions = num('w4Deductions');
  form.extraWithholding = num('extraWithholding');
  form.roundToWholeDollars = checked('roundToWholeDollars');
  form.federalExempt = checked('federalExempt');
  form.employmentCategory = $('employmentCategory').value;
  form.voluntaryWithholdingAgreement = checked('voluntaryWithholdingAgreement');
  form.stateCode = $('state').value;
  const home = $('residenceState');
  form.residenceStateCode = home ? home.value : form.residenceStateCode;
  form.residenceNexus = checked('residenceNexus');
  form.residenceVoluntary = checked('residenceVoluntary');
  form.payItems = readMoneyRows('payItems', (row) => ({
    kind: row.querySelector('.pay-kind').value,
    amount: Number(row.querySelector('.pay-amount').value || 0),
  }));
  form.deductionItems = readMoneyRows('deductionsList', (row) => ({
    code: row.querySelector('.ded-code').value,
    category: row.querySelector('.ded-category').value,
    amount: Number(row.querySelector('.ded-amount').value || 0),
  }));
  readCertInputs('stateFieldsBox', 'sf_', fieldsForState(form.stateCode, registry), form.workCertificate);
  readCertInputs('residenceBox', 'rf_', residenceFieldsForState(form.residenceStateCode, registry), form.residenceCertificate);
}

function readCertInputs(boxId, prefix, fields, bag) {
  const box = $(boxId);
  if (!box) return;
  for (const field of fields) {
    const el = box.querySelector(`[id="${prefix}${field.key}"]`);
    if (!el) continue;
    const raw = el.type === 'checkbox' ? el.checked : el.value;
    const value = coerceControl(field, raw, false);
    if (value === undefined) delete bag[field.key];
    else bag[field.key] = value;
  }
}

function hasApiKey() {
  const key = window.Omnia && Omnia.apiKey && Omnia.apiKey();
  return !!(key && key.key);
}
function signedIn() {
  return !!(window.Omnia && Omnia.session && Omnia.session() && Omnia.session().email);
}
function currentKey() {
  const typed = ($('keyInput') && $('keyInput').value || '').trim();
  if (typed) return typed;
  const stored = window.Omnia && Omnia.apiKey && Omnia.apiKey();
  return stored && stored.key ? stored.key : '';
}

function exampleOutputHtml() {
  return `<div class="sample"><p>Example output. This is not your calculation.</p><pre>{
  "grossPay": 140000,
  "employeeTaxTotal": 27035,
  "netPay": 112965,
  "taxes": [ "…one line per tax, in cents" ]
}</pre></div>`;
}

function setKeyGate(forLookup) {
  const gate = $('gate');
  const example = !signedIn();
  let text;
  let href;
  let label;
  if (!signedIn()) {
    text = forLookup
      ? 'Sign up to get an API key before an address can be looked up. This page does not issue a key.'
      : 'Sign up to get an API key before this calculation can run. This page does not issue a key.';
    href = '/signup';
    label = 'Create an account';
  } else {
    text = forLookup
      ? 'Create an API key in your account, then paste it here, before an address can be looked up.'
      : 'Create an API key in your account, then paste it here, before this calculation can run.';
    href = '/dashboard';
    label = 'Open your account';
  }
  gate.hidden = false;
  gate.innerHTML = `<div class="banner banner-bad" role="alert">${esc(text)} <a href="${esc(href)}">${esc(label)}</a>.${example ? exampleOutputHtml() : ''}</div>`;
  $('placeholder').hidden = true;
  $('result').hidden = true;
}

function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const key = currentKey();
  if (key) headers.Authorization = 'Bearer ' + key;
  return headers;
}

function fieldControl(field, prefix, bag) {
  const id = prefix + field.key;
  const cur = bag[field.key];
  if (field.type === 'boolean') {
    return `<label class="chk"><input class="tick" type="checkbox" id="${esc(id)}"${cur === true ? ' checked' : ''}><span class="cl">${esc(field.label)}</span></label>`;
  }
  let control;
  if (field.options) {
    const opts = field.options.map((o) => {
      const selected = String(o.value) === String(cur) ? ' selected' : '';
      return `<option value="${esc(String(o.value))}"${selected}>${esc(o.label)}</option>`;
    }).join('');
    const blank = cur == null || cur === '' ? ' selected' : '';
    control = `<select class="inp" id="${esc(id)}"><option value=""${blank}>Choose</option>${opts}</select>`;
  } else if (field.type === 'money') {
    const shown = cur == null || cur === '' ? '' : (MONEY_CERT_KEYS.has(field.key) ? centsToDollars(cur) : String(cur));
    control = `<div class="money"><em>$</em><input class="inp" id="${esc(id)}" inputmode="decimal" value="${esc(shown)}"></div>`;
  } else if (field.type === 'list') {
    const text = Array.isArray(cur) ? cur.join(', ') : (cur == null ? '' : String(cur));
    control = `<input class="inp" id="${esc(id)}" value="${esc(text)}">`;
  } else {
    const shown = cur == null ? '' : String(cur);
    control = `<input class="inp" id="${esc(id)}" inputmode="${field.type === 'count' ? 'numeric' : 'text'}" value="${esc(shown)}">`;
  }
  const hint = field.hint ? `<p class="hint">${esc(field.hint)}</p>` : '';
  return `<div class="f"><div class="lab"><label for="${esc(id)}">${esc(field.label)}</label></div>${control}${hint}</div>`;
}

function stateOptions(selected, blank) {
  const head = `<option value="">${esc(blank)}</option>`;
  const opts = states.map((s) => `<option value="${esc(s.code)}"${s.code === selected ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
  return head + opts;
}

function renderResidence() {
  const box = $('residenceBox');
  const code = String(form.residenceStateCode || '').toUpperCase();
  const work = String(form.stateCode || '').toUpperCase();
  if (!code || code === work) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  const fields = residenceFieldsForState(code, registry);
  const name = (states.find((s) => s.code === code) || {}).name || code;
  box.hidden = false;
  box.innerHTML = `<h2>Residence certificate · ${esc(name)}</h2>`
    + fields.map((f) => fieldControl(f, 'rf_', form.residenceCertificate)).join('')
    + `<label class="chk"><input class="tick" type="checkbox" id="residenceNexus"${form.residenceNexus ? ' checked' : ''}><span class="cl">Employer has nexus in the residence state</span></label>`
    + `<label class="chk"><input class="tick" type="checkbox" id="residenceVoluntary"${form.residenceVoluntary ? ' checked' : ''}><span class="cl">Voluntary withholding for the residence state</span></label>`
    + `<p class="hint">Used when the residence state differs and reciprocity does not already decide the withholding.</p>`;
}

function renderStateFields() {
  const box = $('stateFieldsBox');
  const code = String(form.stateCode || '').toUpperCase();
  if (!code) {
    box.innerHTML = '<p class="muted-box" id="noStateMsg">No state selected. Select state above to see its withholding certificate fields.</p>';
    renderResidence();
    return;
  }
  const fields = fieldsForState(code, registry);
  const res = `<div class="f"><div class="lab"><label for="residenceState">Residence state, if different</label></div><select class="inp" id="residenceState">${stateOptions(form.residenceStateCode, 'Same as work state')}</select></div>`;
  box.innerHTML = fields.map((f) => fieldControl(f, 'sf_', form.workCertificate)).join('') + res;
  renderResidence();
}

function showAddressStatus(text, isError) {
  const el = $('addressStatus');
  el.hidden = false;
  el.className = 'lookup-status ' + (isError ? 'banner banner-bad' : 'note note-info');
  el.textContent = text;
}

function applyLookup(body) {
  const workState = body.state || '';
  if (workState) {
    form.stateCode = workState;
    $('state').value = workState;
  }
  form.residenceStateCode = body.residenceState || '';
  const cert = body.certificate && typeof body.certificate === 'object' ? body.certificate : {};
  for (const [key, value] of Object.entries(cert)) {
    if (value == null || value === '' || value === false) continue;
    form.workCertificate[key] = value;
  }
  renderStateFields();
  const lines = [];
  const side = (label, block) => {
    if (!block) return;
    if (block.matched) lines.push(`${label} matched: ${block.matchedAddress || block.state || ''} → ${block.state || ''}`);
    else lines.push(`${label} address was not matched.`);
  };
  side('Work', body.work);
  side('Residence', body.residence);
  const filled = Object.keys(cert).filter((k) => cert[k] != null && cert[k] !== '' && cert[k] !== false);
  if (filled.length) lines.push('Auto-filled: ' + filled.join(', '));
  if (body.residenceState) lines.push('Residence state: ' + body.residenceState);
  for (const note of body.notResolvable || []) lines.push(note);
  for (const note of body.warnings || []) lines.push(note);
  showAddressStatus(lines.join('\n') || 'Lookup finished.', false);
}

function payRow(kind) {
  const row = document.createElement('div');
  row.className = 'item-row';
  const opts = PAY_ITEMS.map((p) => `<option value="${esc(p.id)}"${p.id === kind ? ' selected' : ''}>${esc(p.label)}</option>`).join('');
  row.innerHTML = `<div class="f"><div class="lab"><label>Pay item</label></div><select class="inp pay-kind">${opts}</select></div>
    <div class="f"><div class="lab"><label>Amount</label></div><div class="money"><em>$</em><input class="inp pay-amount" inputmode="decimal" value="0"></div></div>
    <button type="button" class="x pay-remove">Remove</button>`;
  row.querySelector('.pay-remove').addEventListener('click', () => row.remove());
  return row;
}

function dedRow() {
  const row = document.createElement('div');
  row.className = 'item-row';
  const opts = DEDUCTION_KINDS.map(([v, label]) => `<option value="${esc(v)}">${esc(label)}</option>`).join('');
  row.innerHTML = `<div class="f"><div class="lab"><label>Description</label></div><input class="inp ded-code" placeholder="e.g. 401K"></div>
    <div class="f"><div class="lab"><label>Category</label></div><select class="inp ded-category">${opts}</select></div>
    <div class="f"><div class="lab"><label>Amount</label></div><div class="money"><em>$</em><input class="inp ded-amount" inputmode="decimal" value="0"></div></div>
    <button type="button" class="x ded-remove">Remove</button>`;
  row.querySelector('.ded-remove').addEventListener('click', () => row.remove());
  return row;
}

function money(cents) {
  const n = Number(cents) / 100;
  const sign = n < 0 ? '−' : '';
  return sign + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function lineRows(lines) {
  return lines.map((line) => `<tr>
    <td><b>${esc(line.name)}</b>${line.detail ? `<div class="line-detail">${esc(line.detail)}</div>` : ''}</td>
    <td>${esc(line.payer || '')}</td>
    <td class="num">${money(line.taxableWages || 0)}</td>
    <td class="num">${money(line.amount || 0)}</td>
  </tr>`).join('');
}

function showResult(result) {
  const taxes = Array.isArray(result.taxes) ? result.taxes : [];
  const employee = taxes.filter((t) => t.payer === 'employee');
  const employer = taxes.filter((t) => t.payer === 'employer');
  const table = (title, lines, total) => {
    if (!lines.length) return '';
    return `<h2>${esc(title)}</h2><table class="lines"><thead><tr><th>Tax</th><th>Who pays</th><th class="num">Taxable wages</th><th class="num">Amount</th></tr></thead><tbody>${lineRows(lines)}<tr class="total"><td colspan="3">${esc(title)} total</td><td class="num">${money(total)}</td></tr></tbody></table>`;
  };
  const notices = (result.notices || []).map((n) => `<div class="note note-warn"><b>${esc(n.taxId || '')}</b> ${esc(n.note || '')}</div>`).join('');
  const warnings = (result.warnings || []).map((w) => `<div class="note note-warn">${esc(typeof w === 'string' ? w : JSON.stringify(w))}</div>`).join('');
  $('result').innerHTML = `<div class="paystub">
    <p class="meta">${esc(result.checkDate || '')}</p>
    <div class="net-pay"><span>Net pay</span><b>${money(result.netPay || 0)}</b></div>
    <p class="meta">Gross ${money(result.grossPay || 0)} · Pre-tax deductions ${money(result.pretaxDeductions || 0)} · Post-tax deductions ${money(result.posttaxDeductions || 0)}</p>
    ${table('Withheld from the employee', employee, result.employeeTaxTotal || 0)}
    ${table('Paid by the employer', employer, result.employerTaxTotal || 0)}
    ${notices}${warnings}
  </div>`;
  $('result').hidden = false;
  $('placeholder').hidden = true;
  $('gate').hidden = true;
}

function showError(message) {
  $('result').innerHTML = `<div class="banner banner-bad" role="alert">${esc(message)}</div>`;
  $('result').hidden = false;
  $('placeholder').hidden = true;
  $('gate').hidden = true;
}

async function runLookup() {
  if (lookupBusy) return;
  const work = addressLine($('addrStreet').value, $('addrCity').value, $('addrState').value, $('addrZip').value);
  const home = addressLine($('addrResStreet').value, $('addrResCity').value, $('addrResState').value, $('addrResZip').value);
  if (!work && !home) {
    showAddressStatus('Fill in at least one address (street, city, and state). ZIP is optional.', true);
    return;
  }
  if (!currentKey()) {
    setKeyGate(true);
    return;
  }
  lookupBusy = true;
  const btn = $('addressLookup');
  btn.disabled = true;
  btn.textContent = 'Looking up…';
  try {
    const res = await fetch('/v1/address', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        workAddress: work || undefined,
        residenceAddress: home || undefined,
        checkDate: $('checkDate').value || undefined,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) {
      setKeyGate(true);
      return;
    }
    if (!res.ok) {
      showAddressStatus(body.error || 'The address lookup is unavailable right now.', true);
      return;
    }
    if (!body.state) {
      showAddressStatus('Neither address could be matched.', true);
      return;
    }
    syncFromDom();
    applyLookup(body);
  } catch {
    showAddressStatus('The address lookup is unavailable right now.', true);
  } finally {
    lookupBusy = false;
    btn.disabled = false;
    btn.textContent = 'Look Up Jurisdiction(s)';
  }
}

async function runCalc(ev) {
  if (ev) ev.preventDefault();
  if (busy) return;
  syncFromDom();
  if (!currentKey()) {
    setKeyGate(false);
    return;
  }
  let request;
  try {
    request = buildPaycheckInput(form);
  } catch (err) {
    const problems = err instanceof CalculatorInputError ? err.problems : [err.message];
    showError(problems.join('\n'));
    return;
  }
  busy = true;
  const btn = $('calc');
  btn.disabled = true;
  btn.textContent = 'Calculating…';
  try {
    const res = await fetch('/v1/paycheck', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(request),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) {
      setKeyGate(false);
      return;
    }
    if (res.status === 422 && Array.isArray(body.details)) {
      showError(body.details.map((d) => d.message || d.path).filter(Boolean).join('\n') || body.error || 'That request needs a fix.');
      return;
    }
    if (!res.ok) {
      showError(body.error || 'The calculation could not be completed.');
      return;
    }
    showResult(body.result || body);
  } catch {
    showError('The calculation could not be completed.');
  } finally {
    busy = false;
    btn.disabled = false;
    btn.textContent = 'Calculate';
  }
}

function paintKey() {
  const key = window.Omnia && Omnia.apiKey && Omnia.apiKey();
  const label = $('keyLabel');
  const dot = $('keyDot');
  if (!label || !dot) return;
  if (key && key.key) {
    label.textContent = Omnia.maskKey ? Omnia.maskKey(key.key) : 'Key saved';
    dot.classList.add('on');
    if ($('keyInput') && !$('keyInput').value) $('keyInput').value = key.key;
  } else {
    label.textContent = 'Your API key';
    dot.classList.remove('on');
  }
}

async function loadStates() {
  const year = Number((($('checkDate') && $('checkDate').value) || '').slice(0, 4)) || new Date().getFullYear();
  try {
    const res = await fetch('/api/states?year=' + year);
    const body = await res.json();
    states = body.states || [];
    const selected = $('state').value;
    const opts = states.map((s) => `<option value="${esc(s.code)}"${s.code === selected ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
    $('state').innerHTML = `<option value=""${selected ? '' : ' selected'}>Federal taxes only</option>${opts}`;
    if (selected) $('state').value = selected;
  } catch { /* the dropdown keeps Federal taxes only */ }
}

$('checkDate').value = form.checkDate;
$('grossPayMethod').addEventListener('change', () => {
  $('hourlyRow').hidden = $('grossPayMethod').value !== 'hourly';
});
$('state').addEventListener('change', () => {
  syncFromDom();
  form.workCertificate = {};
  if (!form.residenceStateCode || form.residenceStateCode === form.stateCode) form.residenceCertificate = {};
  renderStateFields();
});
$('checkDate').addEventListener('change', () => { syncFromDom(); loadStates(); });
$('form').addEventListener('change', (ev) => {
  if (ev.target && ev.target.id === 'residenceState') {
    syncFromDom();
    form.residenceCertificate = {};
    renderResidence();
  }
});
$('addressLookup').addEventListener('click', runLookup);
$('addPayItem').addEventListener('click', () => $('payItems').appendChild(payRow('bonus')));
$('clearPay').addEventListener('click', () => { $('payItems').replaceChildren(); });
$('addDeduction').addEventListener('click', () => $('deductionsList').appendChild(dedRow()));
$('clearDeductions').addEventListener('click', () => { $('deductionsList').replaceChildren(); });
$('form').addEventListener('submit', runCalc);
$('keyBtn').addEventListener('click', () => {
  const menu = $('keyMenu');
  menu.hidden = !menu.hidden;
  $('keyBtn').setAttribute('aria-expanded', String(!menu.hidden));
});
document.addEventListener('click', (ev) => {
  if (!ev.target.closest('#keyMenu') && !ev.target.closest('#keyBtn')) $('keyMenu').hidden = true;
});
$('keySave').addEventListener('click', () => {
  const v = $('keyInput').value.trim();
  if (v && window.Omnia) Omnia.setApiKey({ key: v });
  $('keyMenu').hidden = true;
  paintKey();
});
$('keyForget').addEventListener('click', () => {
  if (window.Omnia) Omnia.forgetKey();
  $('keyInput').value = '';
  $('keyMenu').hidden = true;
  paintKey();
});

window.OmniaSandbox = {
  buildRequest: () => { syncFromDom(); return buildPaycheckInput(form); },
  form: () => form,
  showResult,
  setKeyGate,
};

(async function boot() {
  paintKey();
  try {
    const res = await fetch('/assets/state-cert-fields.json');
    registry = await res.json();
  } catch { registry = {}; }
  await loadStates();
  renderStateFields();
})();

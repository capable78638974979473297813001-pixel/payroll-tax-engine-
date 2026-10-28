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
let lastMode = '';
/** True when the browser holds a live sign-in (the session cookie), found by asking the server. */
let sessionActive = false;
let lastRequest = null;

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
  form.pensionKind = $('pensionKind').value;
  form.pensionTaxableAmount = $('pensionTaxableAmount').value;
  form.pensionFilingStatus = $('pensionFilingStatus').value;
  form.pensionStep2 = num('pensionStep2');
  form.pensionCredits = num('pensionCredits');
  form.pensionOtherIncome = num('pensionOtherIncome');
  form.pensionDeductions = num('pensionDeductions');
  form.pensionExtra = num('pensionExtra');
  form.pensionNoWithholding = checked('pensionNoWithholding');
  form.pensionRate = $('pensionRate').value;
  form.pensionAbroad = checked('pensionAbroad');
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
  return sessionActive;
}
/** Which door a run goes through: a key the visitor pasted or saved, else their sign-in, else neither. */
function route() {
  if (currentKey()) return 'key';
  return sessionActive ? 'session' : 'none';
}
function endpoint(kind) {
  const how = route();
  const base = how === 'session' ? '/api/console/' : '/v1/';
  return base + kind;
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
  let links;
  if (!signedIn()) {
    text = forLookup
      ? 'Sign up to get an API key before an address can be looked up. A test key is free and needs no card. This page does not issue a key.'
      : 'Sign up to get an API key before this calculation can run. A test key is free and needs no card. This page does not issue a key.';
    links = '<a href="/signup">Create an account</a> or <a href="/signin">sign in</a>';
  } else {
    text = 'Your session ended. Sign in again, or paste an API key.';
    links = '<a href="/signin">Sign in</a>';
  }
  gate.hidden = false;
  gate.innerHTML = `<div class="banner banner-bad" role="alert">${esc(text)} ${links}.${example ? exampleOutputHtml() : ''}</div>`;
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
    <td class="num">${money(line.taxableWages || 0)}</td>
    <td class="num">${money(line.amount || 0)}</td>
  </tr>`).join('');
}

function curlFor(req) {
  const body = JSON.stringify(req.request, null, 2).replace(/'/g, "'\\''");
  return `curl https://api.omnia.tax/v1/paycheck \\\n  -H "Authorization: Bearer $OMNIA_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${body}'`;
}

function showResult(result, whole) {
  const taxes = Array.isArray(result.taxes) ? result.taxes : [];
  const employee = taxes.filter((t) => t.payer === 'employee');
  const employer = taxes.filter((t) => t.payer === 'employer');
  const table = (title, lines, total) => {
    if (!lines.length) return '';
    return `<h2>${esc(title)}</h2><div class="tablewrap"><table class="lines"><thead><tr><th>Tax</th><th class="num">Taxable wages</th><th class="num">Amount</th></tr></thead><tbody>${lineRows(lines)}<tr class="total"><td colspan="2">${esc(title)} total</td><td class="num">${money(total)}</td></tr></tbody></table></div>`;
  };
  const notices = (result.notices || []).map((n) => `<div class="note note-warn"><b>${esc(n.taxId || '')}</b> ${esc(n.note || '')}</div>`).join('');
  const warnings = (result.warnings || []).map((w) => `<div class="note note-warn">${esc(typeof w === 'string' ? w : JSON.stringify(w))}</div>`).join('');
  const testNote = lastMode === 'test' ? '<p class="hint">Run with a test key: same engine and data as a live key, and not billed.</p>' : '';
  const sent = lastRequest ? JSON.stringify(lastRequest.request, null, 2) : '';
  const developer = lastRequest ? `<details class="dev"><summary>Request and response</summary>
      <div class="dev-h"><span>Request body (POST /v1/paycheck)</span><button type="button" class="lnk" data-copy="request">Copy</button></div>
      <pre>${esc(sent)}</pre>
      <div class="dev-h"><span>As cURL</span><button type="button" class="lnk" data-copy="curl">Copy</button></div>
      <pre>${esc(curlFor(lastRequest))}</pre>
      <div class="dev-h"><span>Response</span><button type="button" class="lnk" data-copy="response">Copy</button></div>
      <pre>${esc(JSON.stringify(whole || { result }, null, 2))}</pre>
    </details>` : '';
  $('result').innerHTML = `<div class="paystub">
    ${testNote}
    <p class="meta">Check date ${esc(result.checkDate || '')}</p>
    <div class="net-pay"><span>Net pay</span><b>${money(result.netPay || 0)}</b></div>
    <dl class="sumgrid">
      <div><dt>Gross pay</dt><dd>${money(result.grossPay || 0)}</dd></div>
      <div><dt>Pre-tax deductions</dt><dd>${money(result.pretaxDeductions || 0)}</dd></div>
      <div><dt>Employee taxes</dt><dd>${money(result.employeeTaxTotal || 0)}</dd></div>
      <div><dt>Post-tax deductions</dt><dd>${money(result.posttaxDeductions || 0)}</dd></div>
      <div><dt>Employer taxes</dt><dd>${money(result.employerTaxTotal || 0)}</dd></div>
      <div><dt>Tax lines</dt><dd>${taxes.length}</dd></div>
    </dl>
    ${table('Withheld from the employee', employee, result.employeeTaxTotal || 0)}
    ${table('Paid by the employer', employer, result.employerTaxTotal || 0)}
    ${notices}${warnings}
    ${developer}
  </div>`;
  const copyText = { request: sent, curl: lastRequest ? curlFor(lastRequest) : '', response: JSON.stringify(whole || { result }, null, 2) };
  $('result').querySelectorAll('[data-copy]').forEach((btn) => btn.addEventListener('click', () => {
    const text = copyText[btn.getAttribute('data-copy')] || '';
    const done = () => { btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = 'Copy'; }, 1500); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, done); else done();
  }));
  $('result').hidden = false;
  $('placeholder').hidden = true;
  $('gate').hidden = true;
  if (window.matchMedia && window.matchMedia('(max-width: 980px)').matches) $('result-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  if (route() === 'none') {
    setKeyGate(true);
    return;
  }
  lookupBusy = true;
  const btn = $('addressLookup');
  btn.disabled = true;
  btn.textContent = 'Looking up…';
  showAddressStatus('Looking up the address. This checks the live address services and can take up to 30 seconds.', false);
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 90000);
  try {
    const res = await fetch(endpoint('address'), {
      method: 'POST',
      signal: abort.signal,
      headers: authHeaders(),
      body: JSON.stringify({
        workAddress: work || undefined,
        residenceAddress: home || undefined,
        checkDate: $('checkDate').value || undefined,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) {
      if (route() === 'session') sessionActive = false;
      paintKey();
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
    showAddressStatus('The address lookup is unavailable right now. Try again in a minute, or pick the state yourself below.', true);
  } finally {
    clearTimeout(timer);
    lookupBusy = false;
    btn.disabled = false;
    btn.textContent = 'Look Up Jurisdiction(s)';
  }
}

async function runCalc(ev) {
  if (ev) ev.preventDefault();
  if (busy) return;
  syncFromDom();
  if (route() === 'none') {
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
  if (!(request.earnings || []).some((e) => Number(e.amount) > 0)) {
    showError('Enter a gross pay above $0 (or an hourly rate and hours) before calculating.');
    return;
  }
  busy = true;
  const btn = $('calc');
  btn.disabled = true;
  btn.textContent = 'Calculating…';
  try {
    lastRequest = { request, how: route(), key: currentKey() };
    const res = await fetch(endpoint('paycheck'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(request),
    });
    const body = await res.json().catch(() => ({}));
    lastMode = res.headers.get('Omnia-Mode') || '';
    if (res.status === 401) {
      if (lastRequest.how === 'session') sessionActive = false;
      paintKey();
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
    showResult(body.result || body, body);
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
  } else if (sessionActive) {
    label.textContent = 'Signed in · no key needed';
    dot.classList.add('on');
  } else {
    label.textContent = 'Your API key';
    dot.classList.remove('on');
  }
  const note = $('modeNote');
  if (note) {
    note.textContent = key && key.key
      ? 'Calculations use the key saved in this tab.'
      : sessionActive ? 'You are signed in, so calculations run without a key. They are free and do not count toward your usage.' : '';
    note.hidden = !note.textContent;
  }
}

/** Ask the server whether the sign-in cookie is live. Per-tab storage cannot answer that. */
async function checkSession() {
  try {
    const res = await fetch('/api/account', { headers: { Accept: 'application/json' } });
    sessionActive = res.ok;
    if (res.ok && window.Omnia && Omnia.setSession) {
      const who = await res.json().catch(() => null);
      if (who && who.email) Omnia.setSession({ email: who.email, name: who.name, company: who.company });
    }
  } catch { sessionActive = false; }
}

/** After a key is issued the visitor lands here. Show it once, saved in this tab. */
function showWelcome() {
  const params = new URLSearchParams(location.search);
  if (params.get('welcome') !== 'key') return;
  const key = window.Omnia && Omnia.apiKey && Omnia.apiKey();
  history.replaceState(null, '', location.pathname);
  if (!key || !key.key) return;
  const box = $('welcome');
  const live = key.key.indexOf('sk_live_') === 0;
  box.hidden = false;
  box.innerHTML = `<div class="welcome-h"><b>Your ${live ? 'live' : 'test'} API key is ready.</b><button type="button" class="lnk" id="welcomeClose">Dismiss</button></div>
    <p>It is saved in this tab, so Calculate uses it now. Copy it somewhere safe: the full key is shown only once.</p>
    <div class="keyline"><code>${esc(key.key)}</code><button type="button" class="btn sec" id="welcomeCopy">Copy key</button></div>`;
  $('welcomeCopy').addEventListener('click', () => {
    const done = () => { $('welcomeCopy').textContent = 'Copied'; };
    if (navigator.clipboard) navigator.clipboard.writeText(key.key).then(done, done); else done();
  });
  $('welcomeClose').addEventListener('click', () => { box.hidden = true; });
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

const EXAMPLES = {
  mi: { state: 'MI', method: 'annual', gross: 85000, frequency: 'biweekly' },
  tx: { state: 'TX', method: 'hourly', rate: 22, hours: 80, frequency: 'biweekly' },
  ca: { state: 'CA', method: 'annual', gross: 120000, frequency: 'semimonthly', filing: 'married_joint', bonus: 5000 },
  oh: { state: 'OH', method: 'perPeriod', gross: 1400, frequency: 'weekly' },
  pension: { state: '', method: 'perPeriod', gross: 2000, frequency: 'monthly', pension: 'periodic' },
};
function fire(id) { $(id).dispatchEvent(new Event('change', { bubbles: true })); }
function applyExample(id) {
  const ex = EXAMPLES[id];
  if (!ex) return;
  $('state').value = ex.state; fire('state');
  $('grossPayMethod').value = ex.method; fire('grossPayMethod');
  $('payFrequency').value = ex.frequency;
  $('grossPay').value = String(ex.gross || 0);
  $('hourlyRate').value = String(ex.rate || 0);
  $('hoursPerPeriod').value = String(ex.hours || 0);
  $('filingStatus').value = ex.filing || 'single';
  $('pensionKind').value = ex.pension || ''; paintPension();
  $('payItems').replaceChildren();
  if (ex.bonus) {
    const row = payRow('bonus');
    row.querySelector('.pay-amount').value = String(ex.bonus);
    $('payItems').appendChild(row);
  }
  syncFromDom();
  $('result').hidden = true;
  $('gate').hidden = true;
  $('placeholder').hidden = false;
}
$('example').addEventListener('change', () => { applyExample($('example').value); });

$('checkDate').value = form.checkDate;
function paintPension() {
  const kind = $('pensionKind').value;
  $('pensionBox').hidden = !kind;
  $('pensionPeriodic').hidden = kind !== 'periodic';
  $('pensionRateBox').hidden = !(kind === 'nonperiodic' || kind === 'eligible_rollover');
}
$('pensionKind').addEventListener('change', paintPension);
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
  $('gate').hidden = true;
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
  await checkSession();
  paintKey();
  showWelcome();
  try {
    const res = await fetch('/assets/state-cert-fields.json');
    registry = await res.json();
  } catch { registry = {}; }
  await loadStates();
  renderStateFields();
})();

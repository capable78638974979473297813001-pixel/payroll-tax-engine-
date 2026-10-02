/* Home page: the live calculator, the clickable state grid, the real code
   sample, and the sign-in-aware nav. Everything shown comes from the same
   engine the API runs; nothing here is a mock-up. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  // States that also have city, county, school-district or transit lines.
  var LOCAL = { AL: 'Alabama municipalities', IN: 'Indiana counties', KY: 'Kentucky occupational taxes', MI: 'Michigan cities',
    NY: 'New York City and Yonkers', OH: 'Ohio municipalities and school districts', OR: 'Oregon transit and Metro', PA: 'Pennsylvania local taxes' };

  var last = { request: null, result: null };
  var seq = 0;
  var timer = null;

  function cents(text) {
    var n = Number(String(text).replace(/[$,\s]/g, ''));
    return isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
  }
  function money(c) { return (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' }); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function api(path, body) {
    return fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined)
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, body: j }; }); });
  }

  // ---------- states -------------------------------------------------------
  var stateNames = {};
  function loadStates() {
    return api('/v1/states').then(function (r) {
      var list = (r.body && r.body.states) || [];
      if (!list.length) return;
      var sel = $('cState');
      var want = (new URLSearchParams(location.search).get('state') || sel.value || 'OH').toUpperCase();
      sel.textContent = '';
      var grid = $('stateGrid');
      if (grid) grid.textContent = '';
      list.forEach(function (s) {
        stateNames[s.code] = s.name;
        var o = el('option', null, s.name); o.value = s.code; sel.appendChild(o);
        if (grid) {
          var b = el('button', 'state-chip' + (LOCAL[s.code] ? ' has-local' : ''), s.name);
          b.type = 'button'; b.dataset.code = s.code;
          b.title = LOCAL[s.code] ? s.name + ' · state tax plus ' + LOCAL[s.code] : s.name + ' · state tax';
          b.addEventListener('click', function () { choose(s.code); });
          grid.appendChild(b);
        }
      });
      sel.value = stateNames[want] ? want : 'OH';
      markChip();
    });
  }
  function markChip() {
    document.querySelectorAll('.state-chip').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.code === $('cState').value));
    });
  }
  function choose(code) {
    $('cState').value = code;
    markChip();
    run();
    var c = $('calculator');
    if (c && c.scrollIntoView) c.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- calculator ---------------------------------------------------
  function setErr(msg) {
    var e = $('cErr');
    e.textContent = msg || '';
    e.hidden = !msg;
  }
  function run() {
    clearTimeout(timer);
    timer = setTimeout(doRun, 150);
  }
  function doRun() {
    var gross = cents($('cGross').value);
    var pretax = cents($('cPretax').value || '0');
    if (isNaN(gross) || gross < 1) { setErr('Enter a paycheck amount, for example 3,000.00.'); return; }
    if (isNaN(pretax)) { setErr('Enter the 401(k) deferral as dollars, for example 240.00.'); return; }
    if (pretax > gross) { setErr('The 401(k) deferral can’t be more than the paycheck.'); return; }
    setErr('');
    var mine = ++seq;
    api('/api/demo/paycheck', {
      state: $('cState').value, payFrequency: $('cFreq').value, filingStatus: $('cFiling').value,
      grossCents: gross, pretaxCents: pretax,
    }).then(function (r) {
      if (mine !== seq) return; // a newer request is already on its way
      if (!r.ok) { setErr((r.body && r.body.error) || 'The calculator could not be reached. Try again.'); return; }
      last = { request: r.body.request, result: r.body.result };
      render();
    }).catch(function () { setErr('The calculator could not be reached. Try again.'); });
  }

  function level(t) {
    if (t.jurisdiction === 'local') return 'LOCAL';
    return String(t.jurisdiction || '').toUpperCase();
  }
  function notModelled(t) { return /^NOT MODELLED/i.test(t.detail || ''); }

  // One tax line: a row that opens in place to show how it was calculated.
  function row(t) {
    var item = el('div', 'cc-item');
    var b = el('button', 'tax-row' + (notModelled(t) ? ' nm' : ''));
    b.type = 'button';
    b.setAttribute('aria-expanded', 'false');
    b.appendChild(el('span', 'tax-name2', t.name));
    b.appendChild(el('span', 'tax-tag', level(t)));
    b.appendChild(el('span', 'tax-amt', notModelled(t) ? 'Not modelled' : money(t.amount)));
    b.appendChild(el('span', 'tax-chev'));
    var d = el('div', 'tax-detail');
    d.hidden = true;
    d.appendChild(el('p', null, t.detail || 'No further detail for this line.'));
    d.appendChild(el('div', 'mono', 'id ' + t.id + '  ·  ' + t.payer + '  ·  taxableWages ' + t.taxableWages + '  ·  amount ' + t.amount + '  (cents)'));
    b.addEventListener('click', function () {
      var open = b.getAttribute('aria-expanded') === 'true';
      b.setAttribute('aria-expanded', String(!open));
      d.hidden = open;
    });
    item.appendChild(b);
    item.appendChild(d);
    return item;
  }

  function render() {
    var r = last.result;
    $('sGross').textContent = money(r.grossPay);
    $('sEmployee').textContent = money(r.employeeTaxTotal);
    $('sNet').textContent = money(r.netPay);
    $('sPct').textContent = r.grossPay ? Math.round((r.netPay / r.grossPay) * 100) + '% of gross' : '';
    $('sCost').textContent = money(r.grossPay + r.employerTaxTotal);
    var ee = $('tilesEmployee'), er = $('tilesEmployer');
    ee.textContent = ''; er.textContent = '';
    r.taxes.filter(function (t) { return t.payer === 'employee'; }).forEach(function (t) { ee.appendChild(row(t)); });
    var employer = r.taxes.filter(function (t) { return t.payer === 'employer'; });
    employer.forEach(function (t) { er.appendChild(row(t)); });
    $('employerHead').hidden = !employer.length;
    $('cNote').textContent = 'Real output for ' + (stateNames[$('cState').value] || $('cState').value) + ', check date ' + last.request.checkDate +
      ': ' + r.taxes.length + ' tax lines from one call. Employer-paid lines do not reduce net pay. Your API key runs this same call.';
    renderCode();
    markChip();
  }

  // ---------- real code sample ---------------------------------------------
  function curl() {
    return 'curl -X POST ' + location.origin + '/v1/paycheck \\\n' +
      '  -H "Authorization: Bearer sk_live_..." \\\n' +
      '  -H "Content-Type: application/json" \\\n' +
      "  -d '" + JSON.stringify(last.request, null, 2) + "'";
  }
  function renderCode() {
    if ($('landingCurl')) $('landingCurl').textContent = curl();
    if ($('landingResp')) {
      var slim = JSON.parse(JSON.stringify(last.result));
      slim.taxes.forEach(function (t) { if (t.detail && t.detail.length > 70) t.detail = t.detail.slice(0, 67) + '...'; });
      $('landingResp').textContent = JSON.stringify({ result: slim }, null, 2);
    }
  }
  function copy(btn, text) {
    var old = btn.textContent;
    function done(ok) { btn.textContent = ok ? 'Copied' : 'Copy failed'; setTimeout(function () { btn.textContent = old; }, 1600); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
    else done(false);
  }

  // ---------- "never a silent $0": a real not-modelled line ------------------
  function loadExcerpt() {
    var box = $('nmExcerpt');
    if (!box) return;
    api('/api/demo/paycheck', { state: 'IN', payFrequency: 'biweekly', filingStatus: 'single', grossCents: 300000 }).then(function (r) {
      var line = r.ok && r.body.result.taxes.filter(notModelled)[0];
      box.textContent = line
        ? JSON.stringify({ name: line.name, amount: line.amount, detail: line.detail }, null, 2)
        : 'This example is unavailable right now. Try the calculator above with Indiana.';
    });
  }

  // ---------- sign-in aware nav --------------------------------------------
  function navState() {
    api('/api/account').then(function (r) {
      if (!r.ok || !r.body || !r.body.email) return;
      var a = $('navSignin');
      if (a) { a.textContent = r.body.email; a.href = '/sandbox'; a.title = 'Open your console'; }
      var p = $('navPrimary');
      if (p) { p.textContent = 'Open console'; p.href = '/sandbox'; }
    });
  }

  // ---------- go ------------------------------------------------------------
  ['cState', 'cFreq', 'cFiling'].forEach(function (id) { $(id).addEventListener('change', function () { markChip(); run(); }); });
  ['cGross', 'cPretax'].forEach(function (id) { $(id).addEventListener('input', run); });
  $('calc').addEventListener('submit', function (e) { e.preventDefault(); doRun(); });
  $('cCopy').addEventListener('click', function () { if (last.request) copy($('cCopy'), curl()); });
  if ($('curlCopy')) $('curlCopy').addEventListener('click', function () { if (last.request) copy($('curlCopy'), curl()); });

  loadStates().then(doRun, doRun);
  loadExcerpt();
  navState();
})();

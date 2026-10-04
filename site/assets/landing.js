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
  // What the address lookup found: { certificate, residenceState, state }.
  // Cleared the moment the person picks a state by hand or edits the address.
  var geo = null;
  var EXAMPLES = [
    ['Chicago, IL', '233 S Wacker Dr, Chicago, IL 60606'],
    ['Columbus, OH', '77 S High St, Columbus, OH 43215'],
    ['Philadelphia, PA', '1500 Market St, Philadelphia, PA 19102'],
    ['New York, NY', '350 5th Ave, New York, NY 10118'],
    ['Detroit, MI', '2 Woodward Ave, Detroit, MI 48226']
  ];
  var PRECISION = {
    rooftop: 'Exact point, published by the local address authority',
    'rooftop-osm': 'House-level point (OpenStreetMap, cross-checked)',
    neighbor: 'Between two published address points on the street',
    'parcel-centroid': 'Center of the county tax parcel',
    interpolated: 'Estimated along the street segment'
  };
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
    clearGeo();
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
    var req = {
      state: $('cState').value, payFrequency: $('cFreq').value, filingStatus: $('cFiling').value,
      grossCents: gross, pretaxCents: pretax,
    };
    if (geo && geo.state === req.state) {
      if (geo.certificate) req.certificate = geo.certificate;
      if (geo.residenceState) req.residenceState = geo.residenceState;
    }
    api('/api/demo/paycheck', req).then(function (r) {
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

  // ---------- address lookup -----------------------------------------------
  function showGeo(node, warn) {
    var g = $('cGeo');
    g.textContent = '';
    g.className = 'cc-geo' + (warn ? ' warn' : '');
    if (!node) { g.hidden = true; return; }
    g.appendChild(node);
    g.hidden = false;
  }
  function geoMsg(title, lines, mono) {
    var d = el('div');
    d.appendChild(el('b', null, title));
    if (lines && lines.length) {
      var ul = el('ul');
      lines.forEach(function (l) { ul.appendChild(el('li', null, l)); });
      d.appendChild(ul);
    }
    if (mono) d.appendChild(el('span', 'mono', mono));
    return d;
  }
  function place(a) {
    return [a.place && a.place.replace(/ (city|town|village|borough|CDP)$/i, ''), a.county && a.county.replace(/ County$/i, '') + ' County', a.state].filter(Boolean).join(', ');
  }
  function lookup() {
    var work = $('cAddr').value.trim(), home = $('cHome').value.trim();
    if (!work && !home) { showGeo(geoMsg('Enter a street address first.', null, 'For example 233 S Wacker Dr, Chicago, IL 60606'), true); $('cAddr').focus(); return; }
    var btn = $('cLookup');
    btn.disabled = true; btn.textContent = 'Looking up…';
    showGeo(geoMsg('Finding that address…'));
    api('/api/demo/resolve-address', { workAddress: work, residenceAddress: home }).then(function (r) {
      btn.disabled = false; btn.textContent = 'Look up';
      if (!r.ok) { geo = null; showGeo(geoMsg((r.body && r.body.error) || 'The address lookup could not be reached. Pick the state by hand instead.'), true); return; }
      var b = r.body;
      if (!b.state) {
        geo = null;
        showGeo(geoMsg('We couldn’t match that address.', ['Check the street number and spelling, and include the city and state.']), true);
        return;
      }
      geo = { state: b.state, certificate: b.certificate, residenceState: b.residenceState };
      $('cState').value = b.state;
      markChip();
      var a = b.work && b.work.matched ? b.work : null;
      var lines = [];
      if (a) lines.push('Works in ' + place(a));
      else if (b.work) lines.push('Work address not matched, so the home address is used for the state.');
      if (b.residence && b.residence.matched) lines.push('Lives in ' + place(b.residence) + (b.residenceState ? ' (a different state: reciprocity and home-state rules apply)' : ''));
      else if (b.residence) lines.push('Home address not matched, so it was ignored.');
      (b.warnings || []).slice(0, 2).forEach(function (w) { lines.push(w); });
      var m = a || b.residence;
      showGeo(geoMsg('Matched: ' + (m.matchedAddress || m.state), lines, m.precision ? (PRECISION[m.precision] || m.precision) : ''), !b.fullyResolved && (b.warnings || []).length > 0);
      doRun();
    }).catch(function () {
      btn.disabled = false; btn.textContent = 'Look up';
      geo = null;
      showGeo(geoMsg('The address lookup could not be reached. Pick the state by hand instead.'), true);
    });
  }
  function clearGeo() { geo = null; showGeo(null); }

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

  // ---------- saved scenarios ----------------------------------------------
  // A scenario is the calculator's inputs. Loading one reruns the engine, so
  // it never shows an out-of-date result. Needs a signed-in account.
  var signedIn = false;
  function currentInputs() {
    var inputs = {
      state: $('cState').value, payFrequency: $('cFreq').value, filingStatus: $('cFiling').value,
      grossCents: cents($('cGross').value), pretaxCents: cents($('cPretax').value || '0'),
    };
    var w = $('cAddr').value.trim(), h = $('cHome').value.trim();
    if (w) inputs.workAddress = w;
    if (h) inputs.residenceAddress = h;
    if (geo && geo.state === inputs.state) {
      if (geo.certificate) inputs.certificate = geo.certificate;
      if (geo.residenceState) inputs.residenceState = geo.residenceState;
    }
    return inputs;
  }
  function saveMsg(t, bad) { var m = $('cSaveMsg'); m.textContent = t || ''; m.style.color = bad ? 'var(--color-error)' : ''; }
  function describe(i) {
    return (stateNames[i.state] || i.state) + ' · ' + money(i.grossCents) + ' ' + ({ weekly: 'weekly', biweekly: 'every two weeks', semimonthly: 'twice a month', monthly: 'monthly' }[i.payFrequency] || '');
  }
  function renderSaved(list) {
    var ul = $('cSavedList');
    ul.textContent = '';
    list.forEach(function (s) {
      var li = el('li');
      var b = el('button', 'load', s.name); b.type = 'button';
      b.appendChild(el('small', null, describe(s.inputs)));
      b.addEventListener('click', function () { loadScenario(s); });
      var d = el('button', 'del', '×'); d.type = 'button';
      d.setAttribute('aria-label', 'Delete ' + s.name);
      d.addEventListener('click', function () {
        api('/api/scenarios/delete', { id: s.id }).then(function (r) {
          if (r.ok) { saveMsg('Deleted “' + s.name + '”.'); loadSaved(); } else saveMsg((r.body && r.body.error) || 'Could not delete.', true);
        });
      });
      li.appendChild(b); li.appendChild(d); ul.appendChild(li);
    });
  }
  function loadSaved() {
    return api('/api/scenarios').then(function (r) {
      signedIn = r.ok;
      $('cSavedOut').hidden = r.ok;
      $('cSavedIn').hidden = !r.ok;
      if (r.ok) renderSaved(r.body.scenarios || []);
    });
  }
  function loadScenario(s) {
    var i = s.inputs;
    $('cState').value = i.state; $('cFreq').value = i.payFrequency; $('cFiling').value = i.filingStatus;
    $('cGross').value = (i.grossCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    $('cPretax').value = ((i.pretaxCents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    $('cAddr').value = i.workAddress || ''; $('cHome').value = i.residenceAddress || '';
    if (i.residenceAddress) $('cHomeBox').open = true;
    geo = (i.certificate || i.residenceState) ? { state: i.state, certificate: i.certificate, residenceState: i.residenceState } : null;
    showGeo(geo ? geoMsg('Using the address facts saved with “' + s.name + '”.', null, 'Look up again to refresh them.') : null);
    $('cSaveName').value = s.name;
    saveMsg('');
    markChip();
    doRun();
  }
  function saveScenario() {
    var name = $('cSaveName').value.trim();
    var inputs = currentInputs();
    if (!name) { saveMsg('Give it a name first.', true); $('cSaveName').focus(); return; }
    if (isNaN(inputs.grossCents) || inputs.grossCents < 1 || isNaN(inputs.pretaxCents)) { saveMsg('Fix the paycheck amounts first.', true); return; }
    api('/api/scenarios/save', { name: name, inputs: inputs }).then(function (r) {
      if (r.ok) { saveMsg('Saved “' + r.body.scenario.name + '”.'); loadSaved(); }
      else if (r.status === 401) { signedIn = false; loadSaved(); }
      else saveMsg((r.body && r.body.error) || 'Could not save.', true);
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
  ['cState', 'cFreq', 'cFiling'].forEach(function (id) { $(id).addEventListener('change', function () { if (id === 'cState') clearGeo(); markChip(); run(); }); });
  $('cLookup').addEventListener('click', lookup);
  ['cAddr', 'cHome'].forEach(function (id) {
    $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); lookup(); } });
    $(id).addEventListener('input', function () { if (geo) { geo = null; $('cGeo').hidden = true; } });
  });
  EXAMPLES.forEach(function (x) {
    var b = el('button', null, x[0]); b.type = 'button';
    b.addEventListener('click', function () { $('cAddr').value = x[1]; lookup(); });
    $('cExamples').appendChild(b);
  });
  ['cGross', 'cPretax'].forEach(function (id) { $(id).addEventListener('input', run); });
  $('calc').addEventListener('submit', function (e) { e.preventDefault(); doRun(); });
  $('cCopy').addEventListener('click', function () { if (last.request) copy($('cCopy'), curl()); });
  if ($('curlCopy')) $('curlCopy').addEventListener('click', function () { if (last.request) copy($('curlCopy'), curl()); });

  $('cSave').addEventListener('click', saveScenario);
  $('cSaveName').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); saveScenario(); } });
  loadStates().then(doRun, doRun).then(loadSaved);
  loadExcerpt();
  navState();
})();

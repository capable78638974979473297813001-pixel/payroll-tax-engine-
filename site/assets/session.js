/* Copy the double-submit cookie onto state-changing fetches. The cookie is
   not HttpOnly; the session cookie is. Install once so a second script
   on the same page does not wrap fetch twice. */
(function (w) {
  if (w.__omniaCsrfFetch || typeof w.fetch !== 'function') return;
  w.__omniaCsrfFetch = true;
  var orig = w.fetch;
  w.fetch = function (input, init) {
    var opts = init ? Object.assign({}, init) : {};
    var method = String(opts.method || (input && input.method) || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      var match = document.cookie.match(/(?:^|; )omnia_csrf=([^;]*)/);
      if (match) {
        var headers = new Headers(opts.headers || undefined);
        if (!headers.has('X-CSRF-Token')) headers.set('X-CSRF-Token', decodeURIComponent(match[1]));
        opts.headers = headers;
      }
    }
    return orig.call(this, input, opts);
  };
})(window);

/* Display profile for this tab only. The session token is an HttpOnly cookie
   set by email verification and by password sign-in, so page script never
   stores it. The cookie lasts a year and is renewed while the account is in
   use. The one-time API key stays in sessionStorage and is not written to
   localStorage. */
(function (w) {
  'use strict';
  var PROFILE = 'omnia_profile';
  var PENDING = 'omnia_pending';
  var APIKEY = 'omnia_session_key';
  try {
    localStorage.removeItem('omnia_session');
    localStorage.removeItem('omnia_key');
    localStorage.removeItem('omnia_console_key');
  } catch (e) { /* private mode */ }

  function read(store, key) {
    try { return JSON.parse(store.getItem(key) || 'null'); } catch (e) { return null; }
  }
  function write(store, key, value) {
    try {
      if (value == null) store.removeItem(key);
      else store.setItem(key, JSON.stringify(value));
    } catch (e) { /* private mode */ }
  }

  function session() { return read(sessionStorage, PROFILE); }
  function setSession(value) {
    if (!value) { write(sessionStorage, PROFILE, null); return; }
    write(sessionStorage, PROFILE, {
      email: value.email || '',
      name: value.name || '',
      company: value.company || '',
    });
  }
  function pending() { return read(sessionStorage, PENDING); }
  function setPending(value) { write(sessionStorage, PENDING, value); }

  function apiKey() {
    var cur = read(sessionStorage, APIKEY);
    if (cur && cur.key) return cur;
    return null;
  }
  function setApiKey(value) { write(sessionStorage, APIKEY, value); }
  function forgetKey() {
    write(sessionStorage, APIKEY, null);
    try {
      localStorage.removeItem('omnia_key');
      localStorage.removeItem('omnia_console_key');
    } catch (e) {}
  }

  function authHeaders() {
    return { 'Content-Type': 'application/json' };
  }

  function signOut() {
    setSession(null);
    forgetKey();
    return api('/api/signout', { method: 'POST', headers: authHeaders() });
  }

  function api(path, opts) {
    opts = opts || {};
    return fetch(path, opts).then(function (res) {
      return res.text().then(function (text) {
        var body = null;
        try { body = text ? JSON.parse(text) : null; } catch (e) { body = null; }
        var headers = [];
        res.headers.forEach(function (v, k) { headers.push([k, v]); });
        return { ok: res.ok, status: res.status, body: body, text: text, headers: headers };
      });
    });
  }

  function maskKey(key) {
    if (!key) return '';
    var head = key.slice(0, key.indexOf('_', 3) + 1);
    if (head.length < 4) head = key.slice(0, 8);
    return head + '…' + key.slice(-4);
  }

  function setLoading(btn, on) {
    if (!btn) return;
    btn.classList.toggle('is-loading', on);
    btn.disabled = !!on;
    btn.setAttribute('aria-busy', on ? 'true' : 'false');
  }

  function toast(message, kind) {
    var el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'alert toast';
      document.body.appendChild(el);
    }
    el.className = 'alert toast ' + (kind === 'error' ? 'alert-error' : 'alert-success');
    el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    el.innerHTML = '<span class="alert-icon" aria-hidden="true"></span><span class="alert-msg"></span>';
    el.querySelector('.alert-msg').textContent = message;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.hidden = true; }, 4000);
  }

  w.Omnia = {
    session: session,
    setSession: setSession,
    pending: pending,
    setPending: setPending,
    apiKey: apiKey,
    setApiKey: setApiKey,
    forgetKey: forgetKey,
    signOut: signOut,
    authHeaders: authHeaders,
    api: api,
    maskKey: maskKey,
    setLoading: setLoading,
    toast: toast,
  };
})(window);

/* A server whose account store sits on the container's own filesystem forgets every account at the
   next restart or redeploy, which looks like "I was signed out and my password stopped working".
   /healthz says so; on the sign-in and sign-up pages, say it to the person who is about to rely on it. */
(function (w) {
  var path = (w.location && w.location.pathname) || '';
  if (!/^\/(signin|signup)/.test(path) || typeof w.fetch !== 'function') return;
  w.fetch('/healthz', { headers: { Accept: 'application/json' } }).then(function (res) {
    return res.json();
  }).then(function (body) {
    if (!body || body.storage !== 'temporary') return;
    var box = document.createElement('div');
    box.className = 'alert alert-error';
    box.setAttribute('role', 'alert');
    box.style.margin = '0 0 16px';
    box.textContent = 'This server is saving accounts on temporary storage. They are erased whenever it restarts or redeploys, so a new account can disappear within hours. The site owner needs to attach a persistent disk at /var/data (see docs/GO-LIVE.md).';
    var host = document.querySelector('main') || document.body;
    host.insertBefore(box, host.firstChild);
  }).catch(function () { /* health unreachable: say nothing */ });
})(window);

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

(function () {
  var btn = document.querySelector('.menu-btn');
  var header = document.querySelector('.site-header');
  if (btn && header) {
    btn.addEventListener('click', function () {
      var open = header.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // The cookie is what keeps someone signed in. When it is present, show
  // who they are and a Sign out that deletes this device's server session.
  var signin = document.querySelector('.nav-end .signin');
  if (!signin) return;
  fetch('/api/account', { headers: { Accept: 'application/json' } }).then(function (res) {
    if (!res.ok) return null;
    return res.json();
  }).then(function (body) {
    if (!body || !body.email) return;
    signin.textContent = body.email;
    signin.setAttribute('href', '/dashboard');
    signin.title = 'Open your dashboard';
    if (document.getElementById('navSignOut')) return;
    var out = document.createElement('button');
    out.type = 'button';
    out.id = 'navSignOut';
    out.className = 'signin';
    out.textContent = 'Sign out';
    out.addEventListener('click', function () {
      out.disabled = true;
      fetch('/api/signout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(function () {
        try { sessionStorage.removeItem('omnia_profile'); } catch (e) { /* private mode */ }
        location.href = '/signin';
      });
    });
    signin.insertAdjacentElement('afterend', out);
  }).catch(function () { /* unsigned visitors keep the Sign in link */ });
})();

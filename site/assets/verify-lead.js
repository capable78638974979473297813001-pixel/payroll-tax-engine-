/* Lead copy for /signup/verify. The dev-server sentence is appended only when
   the server sets window.OMNIA.devCodeHint (NODE_ENV is not production, or
   OMNIA_DEV_CODE_HINT / VERIFIER_DEV is set). */
(function (root) {
  'use strict';

  var FAIL = "We couldn't send your code. Try again or contact support.";
  var DEV = 'On a development server the code is in the server log.';

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function verifyLead(opts) {
    opts = opts || {};
    var email = escapeHtml(opts.email || '');
    var devHint = !!opts.devHint;
    var bold = '<b style="color:var(--ink)">' + email + '</b>';
    if (opts.signin) {
      if (opts.emailConfigured || !devHint) {
        return { html: 'If ' + bold + ' has an Omnia.tax account, we sent a 6-digit code.', devHintShown: false };
      }
      return {
        html: 'If ' + bold + ' has an account, its sign-in code is in the server log (no email provider is connected yet).',
        devHintShown: true,
      };
    }
    if (opts.emailSent) {
      return { html: 'We sent a 6-digit code to ' + bold + '.', devHintShown: false };
    }
    if (opts.cooldown) {
      return {
        html: 'A code was just requested. Check your email, or use Resend code when the timer ends.',
        devHintShown: false,
      };
    }
    return { html: devHint ? FAIL + ' ' + DEV : FAIL, devHintShown: devHint };
  }

  root.OmniaVerifyLead = verifyLead;
})(typeof window !== 'undefined' ? window : globalThis);

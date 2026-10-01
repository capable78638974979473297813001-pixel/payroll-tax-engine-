/* Prices on the page come from window.OMNIA, injected by site/server.ts
   from site/lib/pricing.ts. Do not hardcode a per-call rate here. */
(function (w) {
  'use strict';
  var cfg = w.OMNIA || {
    trialDays: 14,
    termMonths: 12,
    tiers: [{ upTo: null, rate: 0.9 }],
    rooftopRate: 0.3,
    periodsPerYear: { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 },
    codeTtlSec: 900,
    codeCooldownSec: 30,
    maxCodeAttempts: 8,
    rateLimitPerMin: 120,
  };

  function round2(n) { return Math.round(n * 100) / 100; }

  /** Same graduated sum as costForCalls() in site/lib/pricing.ts. */
  function costForCalls(calls) {
    var remaining = Math.max(0, calls);
    var previous = 0;
    var total = 0;
    var tiers = cfg.tiers || [];
    for (var i = 0; i < tiers.length; i++) {
      var up = tiers[i].upTo == null ? Infinity : tiers[i].upTo;
      var band = Math.min(remaining, up - previous);
      if (band > 0) {
        total += band * tiers[i].rate;
        remaining -= band;
      }
      previous = up;
      if (remaining <= 0) break;
    }
    return total;
  }

  /**
   * Biweekly monthly estimate, in dollars, from estimate() in pricing.ts
   * (annual cost ÷ 12). Not the flat 325/12 cents formula.
   */
  function estimate(employees, payFrequency) {
    var freq = payFrequency || 'biweekly';
    var periods = (cfg.periodsPerYear && cfg.periodsPerYear[freq]) || 26;
    var n = Math.max(0, Math.round(Number(employees) || 0));
    var calls = n * periods;
    var annual = round2(costForCalls(calls));
    var monthly = round2(annual / 12);
    var first = (cfg.tiers && cfg.tiers[0]) || { upTo: null, rate: 0 };
    var cap = first.upTo == null ? Infinity : first.upTo;
    return {
      employees: n,
      payFrequency: freq,
      periodsPerYear: periods,
      callsPerYear: calls,
      annual: annual,
      monthly: monthly,
      rate: first.rate,
      inFirstTier: calls <= cap,
    };
  }

  /** $0.90, $0.125 — however many decimals the tier actually uses. */
  function formatRate(rate) {
    var n = Number(rate);
    if (!Number.isFinite(n)) return '';
    var s = (Math.round(n * 1000) / 1000).toString();
    if (s.indexOf('.') < 0) s += '.00';
    else if (s.split('.')[1].length < 2) s += '0';
    return '$' + s;
  }

  function formatMoney(n) {
    return Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }

  function headlineRate() {
    return (cfg.tiers && cfg.tiers[0] && cfg.tiers[0].rate) || 0;
  }

  function apply(root) {
    var scope = root || document;
    var rate = formatRate(headlineRate());
    var days = String(cfg.trialDays);
    scope.querySelectorAll('[data-rate]').forEach(function (el) { el.textContent = rate; });
    scope.querySelectorAll('[data-trial]').forEach(function (el) { el.textContent = days; });
  }

  w.OmniaPricing = {
    cfg: cfg,
    costForCalls: costForCalls,
    estimate: estimate,
    formatRate: formatRate,
    formatMoney: formatMoney,
    headlineRate: headlineRate,
    apply: apply,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { apply(document); });
  } else {
    apply(document);
  }
})(window);

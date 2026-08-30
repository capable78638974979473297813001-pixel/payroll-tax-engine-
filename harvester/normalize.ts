/**
 * Stripping the parts of a page that change without anything changing.
 *
 * A byte-level hash is the harvester's cheap first gate, and it only works
 * if identical content hashes identically. Several real sources break that
 * assumption on every single request:
 *
 *   - Cloudflare injects a challenge token (`__CF$cv$params={r:'…',t:'…'}`)
 *     that rotates per request. Wyoming, Tennessee, Florida and DC all
 *     carry one. Two fetches sixty seconds apart differ by exactly that
 *     token and nothing else — verified by diffing consecutive captures.
 *   - ASP.NET pages (Pennsylvania's DCED register, and most state sites
 *     still running WebForms) embed `__VIEWSTATE` / `__EVENTVALIDATION`
 *     blobs that encode server-side session state, not content.
 *   - Analytics and cache-busting query strings carry build ids and
 *     timestamps.
 *
 * Left alone, every one of those sources reports "changed" on every run,
 * and a monitor that cries wolf daily is a monitor nobody reads. That is
 * the actual failure mode this prevents — not wasted CPU.
 *
 * The rule followed here: strip only what is *provably* volatile and
 * *provably* not tax content. Every pattern below targets a machine-
 * generated token with a recognisable structural signature. Nothing
 * touches prose, tables, rates or dates. When in doubt, leave it in and
 * accept a false positive — a spurious "go read this" costs someone five
 * minutes; a suppressed real change costs a wrong paycheque.
 */

export interface VolatilePattern {
  name: string;
  pattern: RegExp;
  why: string;
}

export const VOLATILE_PATTERNS: VolatilePattern[] = [
  {
    name: 'cloudflare-challenge-token',
    // r: a request id, t: a base64 timestamp. Both rotate per request.
    pattern: /window\.__CF\$cv\$params\s*=\s*\{[^}]*\}/g,
    why: "Cloudflare's per-request challenge parameters. Confirmed by diffing two captures of Wyoming's UI page sixty seconds apart: this token was the only difference.",
  },
  {
    name: 'aspnet-viewstate',
    pattern:
      /<input[^>]*\bname="(__VIEWSTATE|__VIEWSTATEGENERATOR|__EVENTVALIDATION|__REQUESTDIGEST)"[^>]*>/gi,
    why: 'ASP.NET WebForms server-side state. Encodes control state, not page content, and is regenerated per request.',
  },
  {
    name: 'csrf-token-input',
    pattern:
      /<input[^>]*\bname="(?:csrf[-_]?token|_csrf|authenticity_token|__RequestVerificationToken)"[^>]*>/gi,
    why: 'Per-session CSRF tokens.',
  },
  {
    name: 'nonce-attribute',
    pattern: /\snonce="[A-Za-z0-9+/=_-]{8,}"/g,
    why: 'Content-Security-Policy nonces are required to be unique per response.',
  },
  {
    name: 'json-csp-nonce',
    // The same per-response CSP nonce as nonce-attribute above, but
    // embedded as a JSON value (Drupal's own settings blob) rather than
    // an HTML attribute. Confirmed on Iowa's workforce.iowa.gov.
    pattern: /"nonce":"[A-Za-z0-9+/=_-]{8,}"/g,
    why: 'A per-response CSP nonce embedded as a JSON value rather than an HTML attribute.',
  },
  {
    name: 'cache-busting-query',
    // ?v=1699… / &ver=8.2.1 / ?_=1699… on asset URLs.
    pattern: /([?&](?:v|ver|version|_|cb|cachebust|rev|cdv)=)[A-Za-z0-9._-]{1,40}/gi,
    why: 'Asset cache-busting parameters change on every deploy without the document changing.',
  },
  {
    name: 'google-analytics-session',
    pattern: /\bga\(\s*['"]set['"]\s*,\s*['"][^'"]*['"]\s*,\s*['"][^'"]*['"]\s*\)/g,
    why: 'Analytics session identifiers.',
  },
  {
    name: 'akamai-bot-telemetry',
    // "ak.rid":"23d9d91e", "ak.t":"1787854782", "ak.ak":"hOBiQw…" — a
    // per-request telemetry blob on Akamai-fronted sites. Caught on
    // ssa.gov, whose OASDI wage-base page is one of the highest-value
    // sources in the registry and was reporting a change on every run.
    pattern: /"ak\.[a-z0-9.]+"\s*:\s*(?:"[^"]*"|-?\d+)/gi,
    why: "Akamai bot-manager telemetry (request id, timestamp, signature). Rotates per request; contains no page content.",
  },
  {
    name: 'aem-data-layer-uuid',
    // Adobe Experience Manager emits fresh UUIDs per render for its
    // client-side data layer. Pennsylvania's revenue site (pa.gov) does
    // this on every component.
    pattern: /\sdata-cmp-data-layer="[^"]*"/g,
    why: 'Adobe Experience Manager component data-layer, whose ids are regenerated on every render.',
  },
  {
    name: 'dynatrace-agent-config',
    pattern: /\sdata-dtconfig="[^"]*"/g,
    why: 'Dynatrace RUM agent configuration, carrying a rotating report id (rpid). Seen on floridarevenue.com.',
  },
  {
    name: 'jwt-token',
    // header.payload.signature — always a credential, never prose.
    // Tennessee's UI page embeds a fresh search-widget JWT per request.
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
    why: 'JSON Web Tokens embedded for client-side widgets. Signed and time-stamped, so every response differs.',
  },
  {
    name: 'akamai-edge-hostname',
    // e.g. jqacqc5iaaabbvjbafp-f-af30533b8-clienttons-s.akamaihd.net —
    // the edge node assigned to this particular response.
    pattern: /\b[a-z0-9]{8,}-f-[a-z0-9]{6,}-clienttons-s\.akamaihd\.net\b/gi,
    why: 'Akamai edge-node hostname, assigned per response and embedded in their bot-manager script.',
  },
  {
    name: 'sharepoint-generated-element-id',
    // SharePoint regenerates element ids for its stylesheet links on every
    // render, in TWO different serializations on the same page: an HTML
    // attribute (id="CssLink-...") and, inside the inline
    // RegisterCssReferences() call the same page emits, a JSON-style key
    // ("Id":"CssLink-..."). Confirmed by diffing two real captures of
    // floridarevenue.com/taxes/taxesfees/Pages/rt_rate.aspx four minutes
    // apart: every CssLink id differed, HTML-attribute and JSON-key forms
    // both present, nothing else in that line changed.
    pattern: /(?:\bid="|"Id":")(?:CssLink|ctl\d+)-[0-9a-f]{16,}"/gi,
    why: 'SharePoint per-render element identifiers on stylesheet links, as either an HTML id attribute or a JSON "Id" key.',
  },
  {
    name: 'sharepoint-page-context-info',
    // _spPageContextInfo is SharePoint's own per-request client context
    // object -- embeds a fresh CorrelationId, serverTime, and a signed
    // formDigestValue (SharePoint's CSRF token) on every single response.
    // None of it is page content; the terminator string
    // ";_spPageContextInfo.updateFormDigestPageLoaded" is emitted
    // verbatim immediately after the object literal on every SharePoint
    // page, which is what makes a non-greedy match to it safe without
    // needing real brace balancing. Confirmed on the same floridarevenue.com
    // capture pair as sharepoint-generated-element-id above.
    pattern: /var _spPageContextInfo=\{[\s\S]*?\};_spPageContextInfo\.updateFormDigestPageLoaded/g,
    why: "SharePoint's per-request page context object (correlation id, server time, CSRF form digest) — regenerated on every response, never page content.",
  },
  {
    name: 'sharepoint-correlation-id',
    // A second, EARLIER standalone copy of the same rotating id that also
    // appears inside _spPageContextInfo above -- SharePoint sets it as
    // its own JS global before the context object is even built.
    pattern: /var g_correlationId\s*=\s*'[0-9a-f-]+'/g,
    why: "SharePoint's own per-request correlation id, set as a standalone JS global ahead of _spPageContextInfo.",
  },
  {
    name: 'sharepoint-form-digest-assignment',
    // formDigestValue is ALSO written a second time, later in the page,
    // as a direct DOM-property assignment rather than through the context
    // object or an <input> tag -- so neither aspnet-viewstate's <input>
    // pattern nor sharepoint-page-context-info's object-literal pattern
    // reaches this second occurrence.
    pattern: /formDigestElement\.value\s*=\s*'[^']*'/g,
    why: "SharePoint's CSRF form digest, written a second time as a direct JS assignment rather than an <input> tag.",
  },
  {
    name: 'cloudflare-email-obfuscation',
    // Cloudflare re-encodes mailto: links with a random key per response.
    pattern:
      /(?:\sdata-cfemail="[0-9a-f]+"|\/cdn-cgi\/l\/email-protection#[0-9a-f]+)/gi,
    why: "Cloudflare's email-address obfuscation re-encodes with a fresh key on each response. Seen on DC's OTR site.",
  },
  {
    name: 'akamai-rua-telemetry',
    // A SECOND, separate Akamai telemetry namespace from akamai-bot-
    // telemetry above ("ak.*") -- "rua.*" (Real User Analytics/mPulse)
    // keys, including a rotating "SJ-<uuid>" transaction id and several
    // boolean session flags that also toggle per request. Confirmed on
    // ssa.gov's own OASDI wage-base page: two fetches under a minute
    // apart differed ONLY in these keys.
    pattern: /"rua\.[a-z0-9._]+"\s*:\s*(?:"[^"]*"|-?\d+)/gi,
    why: "Akamai Real User Analytics (mPulse) telemetry — a rotating transaction id and session flags, distinct from the ak.* bot-manager namespace already stripped above.",
  },
  {
    name: 'drupal-ajax-theme-token',
    // Drupal's ajaxPageState.theme_token, a per-session CSRF-style token
    // for its AJAX framework. DC's OTR site (otr.cfo.dc.gov) runs Drupal.
    pattern: /"theme_token":"[A-Za-z0-9_-]+"/g,
    why: "Drupal's per-session AJAX theme token, regenerated every response.",
  },
  {
    name: 'drupal-views-dom-id',
    // Drupal's Views module stamps a fresh dom id onto EVERY view block on
    // the page, every render (alerts, headers/footers, homepage feature
    // blocks — DC's OTR site has several). Confirmed across three separate
    // occurrences on two real fetches of the same page, each with
    // identical surrounding content otherwise. The hash length itself
    // varies by Drupal install — DC's is 32 hex (MD5-shaped), North
    // Dakota's jobsnd.com is 64 (SHA-256-shaped) — so both are matched
    // rather than hardcoding one length and silently under-matching the
    // other (confirmed: a hardcoded {32} left 32 leftover hex characters
    // dangling unmatched on the ND capture).
    pattern: /view-dom-id-[0-9a-f]{32,64}/g,
    why: "Drupal Views' per-render DOM id, stamped fresh on every view block regardless of whether the block's content changed.",
  },
  {
    name: 'sitefinity-vicurrentdatetime',
    // A .NET CMS (Sitecore/Sitefinity-shaped) meta tag reporting the
    // current moment as a raw .NET file-time tick count. Confirmed on
    // Connecticut's DOL UI-rates page.
    pattern: /<meta name="VIcurrentDateTime" content="\d+" \/>/g,
    why: 'A CMS meta tag reporting live server time as raw .NET ticks, regenerated every response.',
  },
  {
    name: 'newrelic-browser-timing',
    // New Relic's browser (RUM) agent snippet embeds this render's own
    // real queue/application timing in milliseconds — genuine performance
    // measurements, which is exactly why they differ on every single
    // request. Confirmed on two of DC's own gov sites (both New-Relic-
    // instrumented) that otherwise served byte-identical pages.
    pattern: /"queueTime":\d+,"applicationTime":\d+/g,
    why: "New Relic's browser agent embeds this specific page load's own timing measurements, which are never the same twice by construction.",
  },
  {
    name: 'auto-generated-component-id-suffix',
    // A web-component design system (seen as class="sdc-component" on
    // Iowa's site) suffixes an element id with a large random/session
    // number, then references the SAME number from aria-describedby —
    // both differed between two real fetches of an otherwise-identical
    // page.
    pattern: /(?:id|aria-describedby)="[\w-]+--\d{6,}"/g,
    why: 'A design-system component id suffixed with a per-render random number, referenced identically from an aria- attribute.',
  },
  {
    name: 'telerik-panel-random-suffix',
    // A Telerik/Sitefinity-shaped widget (RadPanelBar or similar) suffixes
    // a fixed element name with two random alphanumeric characters on
    // every render. Confirmed on Montana's DOL site: id="PhonePane6a" vs
    // id="PhonePane01" on two otherwise-identical fetches.
    pattern: /\bid="PhonePane[0-9a-z]{2}"/gi,
    why: 'A Telerik-shaped widget element id with a random 2-character suffix regenerated per render.',
  },
  {
    name: 'truncated-guid-widget-id',
    // A nav widget suffixes aria-controls/aria-owns with a TRUNCATED GUID
    // (missing its last segment) that regenerates per render — a
    // different shape from quoted-guid above (which only matches a FULL
    // 8-4-4-4-12 GUID), so a full-GUID pattern alone under-matches this
    // one. Confirmed on Montana's DOL site: "claimants--4abeb7a5-9ac6-
    // 4cda-83" vs "claimants--0453282d-5e2f-4a72-b9" on two otherwise-
    // identical fetches.
    // The truncation depth itself varies per menu item, not just the
    // fragment's value: a different item on the SAME Montana page
    // truncated to only "48a98456-98" (8-2) rather than "4abeb7a5-9ac6-
    // 4cda-83" (8-4-4-2), and one used a single hyphen before the
    // fragment where another used two — so the hyphen count and the
    // number of hex groups are both matched loosely rather than pinned
    // to the exact depth of the first example found.
    // A trailing hyphen with NOTHING after it is also a real shape this
    // widget produces ("report-fraud-f3226647-2d35-4459-", cut off mid-
    // separator with no final hex group at all) — the optional groups
    // below allow zero hex chars after their hyphen, not just 1-4, so a
    // dangling trailing hyphen is matched through to the closing quote.
    pattern: /(?:aria-controls|aria-owns|id|data-submenu|data-menu)="[\w-]+-[0-9a-f]{6,8}(?:-[0-9a-f]{0,4}){0,4}"/gi,
    why: 'A nav widget id/aria/data attribute suffixed with a truncated, per-render GUID fragment of varying depth.',
  },
  {
    name: 'dnn-megamenu-id',
    // DotNetNuke's "dnngo" mega-menu module appends a random 10-hex-char
    // suffix directly to a fixed id (no separator). Confirmed on New
    // Mexico's dws.nm.gov.
    // Matched bare (not just inside id="...") because the SAME generated
    // id is also referenced from a jQuery selector string elsewhere on
    // the page ($("#dnngo_megamenu9a8f0407bd")) — confirmed on two
    // separate New Mexico DOL pages (dws.nm.gov and its "how UI rates are
    // calculated" page), both of which had this second occurrence.
    pattern: /dnngo_megamenu[0-9a-f]{10}/g,
    why: "DotNetNuke's mega-menu module id, suffixed with a random hex string on every render, referenced from both an HTML attribute and a jQuery selector.",
  },
  {
    name: 'akamai-sensor-script-path',
    // Akamai bot-manager's own sensor-data script path embeds a rotating
    // hex fragment (distinct from akamai-edge-hostname above, which is a
    // full hostname, not a URL path segment). Confirmed on Nevada's
    // detr.nv.gov.
    pattern: /\/akam\/\d+\/[0-9a-f]{6,10}/g,
    why: "Akamai bot-manager's sensor script path, with a rotating hex fragment per response.",
  },
  {
    name: 'aspnet-scriptresource-payload',
    // ASP.NET AJAX's ScriptResource.axd embeds an opaque, encoded,
    // per-session payload in its "d=" query parameter. Confirmed on
    // Oregon's DOL site: two fetches produced two different payloads for
    // the identical script resource.
    // WebResource.axd is ScriptResource.axd's sibling handler (embedded
    // control resources rather than combined scripts) — same opaque
    // per-session "d=" payload shape, plus its own "&t=" timestamp.
    // Confirmed on Florida's revenue site.
    // The "t=" suffix is HEX, not decimal (confirmed: "t=32e5dfca" and
    // "t=ffffffffbec1863d" both contain letters a-f) — a plain \d+ left
    // it, and sometimes part of the preceding "d=" payload too, unmatched.
    pattern: /(?:Script|Web)Resource\.axd\?d=[A-Za-z0-9_-]+(?:&amp;t=[0-9a-f]+)?/g,
    why: "ASP.NET AJAX's Script/WebResource loaders embed an opaque per-session payload and timestamp, not the resource's actual content.",
  },
  {
    name: 'f5-cspm-token',
    // F5 BIG-IP's client-side persistence/anti-bot script embeds a long
    // opaque token (f5_p) that regenerates every response. Confirmed on
    // Oregon's DOL site.
    pattern: /var f5_cspm=\{f5_p:'[A-Za-z0-9]+'/g,
    why: "F5 BIG-IP's client-side session-persistence token, regenerated per response.",
  },
  {
    name: 'drupal-form-build-id',
    // Drupal's per-render anti-replay form token, embedded in TWO places
    // on the same form: a data attribute AND a hidden input's value.
    // Confirmed on Rhode Island's DOL site (a Drupal install, like DC's
    // OTR site and North Dakota's jobsnd.com above, all fixed
    // independently since each embeds the token differently).
    // The generated token itself can contain embedded hyphens (confirmed:
    // "form-i3xyu-1-3c1su2a2n2yiwywsqiy8v5adsecblrqdh1g" on a second real
    // fetch, vs the first fetch's pure-alphanumeric "form-pvsljm49..." —
    // a character class without "-" matched the first token by luck and
    // silently under-matched the second, leaving its tail as raw
    // unmatched text).
    pattern: /(?:data-drupal-selector="form-[a-zA-Z0-9_-]+"|name="form_build_id" value="form-[A-Za-z0-9_-]+")/g,
    why: "Drupal's per-render form-build-id anti-replay token, embedded in both a data attribute and a hidden input value.",
  },
  {
    name: 'expand-collapse-widget-unique-id',
    // A different widget on the same Rhode Island page (a details/summary
    // expand-collapse control, not the nav menu) assigns its own
    // sequential "unique-N" id, referenced from THREE attributes on
    // sibling elements (aria-controls, data-id, id).
    // Generalized to any of the four attribute names actually seen this
    // widget use across ITS OWN several instances on one page, each
    // pairing them differently ("aria-controls"+"details-" on one
    // instance, "id"+"details-" and "aria-labelledby"+"summary-" on
    // another) — matching the shared "(details-|summary-)?unique-N" value
    // shape directly, rather than enumerating every attribute/prefix
    // combination this same widget happens to produce.
    pattern: /\b(?:aria-controls|aria-labelledby|data-id|id)="(?:details-|summary-)?unique-\d+"/g,
    why: "An expand/collapse widget's sequential 'unique' id, referenced from several differently-paired attributes, not stable between renders.",
  },
  {
    name: 'visionapps-opaque-token',
    // A site-search widget (window.visionApps.token) embeds a long opaque
    // per-session token that is NOT a real 3-part JWT despite starting
    // with a JWT-shaped header — the existing jwt-token pattern above
    // only matches through its own 3-segment definition and leaves a long
    // trailing continuation unmatched. Matched as the whole quoted
    // assignment instead of trying to characterize the token's own
    // internal shape. Confirmed on Kansas's DOL site.
    pattern: /window\.visionApps\.token="[^"]*"/g,
    why: 'A site-search widget embeds an opaque per-session token as this whole quoted assignment.',
  },
  {
    name: 'wordpress-nav-menu-item-id',
    // A WordPress nav-menu plugin assigns each menu item a sequential
    // integer id that isn't stable between renders — confirmed on Rhode
    // Island's DOL site: id="menu-227" on one fetch, id="menu-1190" on
    // the next, for the SAME "About Us" menu item. Page chrome (site
    // navigation), never tax-rate content, so safe to strip generally.
    // The same volatile number is ALSO referenced from a sibling submenu's
    // aria-labelledby, pointing back at the parent item's id — both
    // attribute names are matched so the two stay in sync after stripping.
    pattern: /\b(?:id|aria-labelledby)="menu-\d+"/g,
    why: "A WordPress navigation-menu item's sequential id, not stable between renders, referenced from both its own id and a submenu's aria-labelledby.",
  },
  {
    name: 'incapsula-resource-counter',
    // Incapsula's own async resource-loader script increments a plain
    // counter (ns=1, ns=2, ...) rather than the URL's genuine cache-
    // busting query already stripped above (that pattern only matches
    // v/ver/version/_/cb/cachebust/rev keys, not Incapsula's own "ns").
    // Confirmed on New Jersey's UI-rates page.
    pattern: /(_Incapsula_Resource\?SWJIYLWA=[0-9a-f]+&ns=)\d+/g,
    why: "Incapsula's own per-request resource-loader sequence counter.",
  },
  {
    name: 'quoted-guid',
    // A .NET CMS menu widget ("TBElementsCounter", "theme":"ci_xy", class
    // "tbm tbm-main") regenerates the SAME fresh GUID in at least three
    // different syntactic wrappers on one render — an HTML id attribute,
    // a JSON config key, and a getElementById("...") JS call — confirmed
    // by chasing all three on real captures of Colorado's UI-rates page,
    // which is what makes matching "whichever wrapper this GUID happens
    // to sit in" the wrong approach: any new wrapper the widget adds would
    // need its own pattern forever. A bare quoted GUID is never itself tax
    // content (a rate is a number, a jurisdiction code is short and
    // non-hyphenated) — safe to strip in any quoting context, generally.
    // Also resolves "menu-item-<32 hex>" id/aria-controls pairs, one per
    // menu item, on the same widget.
    pattern:
      /["'][0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}["']|(?:\bid|aria-controls)="menu-item-[0-9a-f]{32}"/gi,
    why: 'A bare GUID in any quoting context — never tax content, but regenerated per render by several CMS widgets (menu ids, view ids, form tokens).',
  },
  {
    name: 'mislabeled-live-server-time',
    // A JSON field literally named "buildDate" that in fact reports the
    // CURRENT moment, not when anything was built — confirmed on
    // Illinois's withholding page: two fetches four seconds apart produced
    // two different "buildDate" values four seconds apart. Deliberately
    // scoped to this exact key name, unlike html-comment-timestamp's
    // comment-only scope: a real effective/published date in prose is
    // never named "buildDate" in this shape and is never touched.
    pattern: /"buildDate":\s*"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z"/g,
    why: "A JSON 'buildDate' field that actually reports live server time on every request, not a real build date.",
  },
  {
    name: 'html-comment-timestamp',
    // <!-- generated 2026-08-27T18:13:44Z --> style build stamps.
    pattern:
      /<!--[^>]*?\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?[^>]*?-->/g,
    why: 'Build/render timestamps in HTML comments. Deliberately narrow: only matches inside a comment, so a published effective date in visible text is never touched.',
  },
];

export interface NormalizeResult {
  content: string;
  /** Which patterns actually fired, for the record. */
  strippedPatterns: string[];
}

/**
 * Normalize a fetched document for change detection.
 *
 * Also collapses trailing whitespace per line and normalizes line endings —
 * a server switching between \r\n and \n is not a tax change, and PDF text
 * extraction produces trailing spaces that vary with column widths.
 */
export function normalizeForComparison(raw: string): NormalizeResult {
  let out = raw;
  const stripped: string[] = [];

  for (const { name, pattern } of VOLATILE_PATTERNS) {
    // A fresh regex per call: /g patterns carry lastIndex between uses.
    const re = new RegExp(pattern.source, pattern.flags);
    if (re.test(out)) {
      stripped.push(name);
      out = out.replace(new RegExp(pattern.source, pattern.flags), `[${name}]`);
    }
  }

  out = out
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .trim();

  return { content: out, strippedPatterns: stripped };
}

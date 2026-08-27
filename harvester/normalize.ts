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
    name: 'cache-busting-query',
    // ?v=1699… / &ver=8.2.1 / ?_=1699… on asset URLs.
    pattern: /([?&](?:v|ver|version|_|cb|cachebust|rev)=)[A-Za-z0-9._-]{1,40}/gi,
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
    // SharePoint regenerates element ids for its stylesheet links on
    // every render. floridarevenue.com runs on it.
    pattern: /\bid="(?:CssLink|ctl\d+)-[0-9a-f]{16,}"/gi,
    why: 'SharePoint per-render element identifiers on stylesheet links.',
  },
  {
    name: 'cloudflare-email-obfuscation',
    // Cloudflare re-encodes mailto: links with a random key per response.
    pattern:
      /(?:\sdata-cfemail="[0-9a-f]+"|\/cdn-cgi\/l\/email-protection#[0-9a-f]+)/gi,
    why: "Cloudflare's email-address obfuscation re-encodes with a fresh key on each response. Seen on DC's OTR site.",
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

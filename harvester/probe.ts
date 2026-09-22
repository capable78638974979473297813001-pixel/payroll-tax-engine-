import { createHash } from 'node:crypto';

/**
 * Network side of the harvester. Probes one source URL and returns a change
 * SIGNAL — HTTP status, ETag, Last-Modified, and a content hash. Every failure
 * mode (timeout, DNS, TLS, 4xx/5xx, abort) resolves to a signal with ok=false
 * and an `error`; this function NEVER throws and NEVER rejects, so a source
 * being down can never fail the harvester.
 */

export interface Signal {
  url: string;
  ok: boolean;
  status?: number;
  etag?: string;
  lastModified?: string;
  /** sha256 of the body, or null when the body was not hashed (too large / HEAD only). */
  hash?: string | null;
  bytes?: number;
  error?: string;
  ms?: number;
}

/** Bodies larger than this are identified by headers only, not hashed. */
const MAX_HASH_BYTES = 25 * 1024 * 1024;

/**
 * Strip the volatile bits out of an HTML page before hashing so a page whose
 * substantive content is unchanged doesn't churn a new hash on every fetch.
 * Government pages are riddled with per-request tokens: ASP.NET __VIEWSTATE /
 * __EVENTVALIDATION, CSRF tokens, script nonces, cache-busting query strings,
 * and embedded timestamps. Left in, they made ~90 stable pages look "changed"
 * every run. This is a freshness signal, not a security boundary, so an
 * aggressive, purely-heuristic scrub is the right trade.
 */
export function normalizeHtml(text: string): string {
  return text
    // Drop <script>/<style> bodies and HTML comments outright — they carry the
    // worst churn (Cloudflare's per-request __CF$cv$params ray id, analytics
    // tags, rocket-loader) and never hold the substantive page content we track.
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    // Whole hidden state/token inputs (name or id giving them away).
    .replace(/<input\b[^>]*\b(?:name|id)\s*=\s*["'](?:__VIEWSTATE\w*|__EVENTVALIDATION|__REQUESTVERIFICATIONTOKEN|[^"']*(?:csrf|token|nonce)[^"']*)["'][^>]*>/gi, '')
    // Inline script/style nonces and CSRF meta tags.
    .replace(/\snonce\s*=\s*["'][^"']*["']/gi, '')
    .replace(/<meta\b[^>]*\b(?:csrf|token|request-id|build-id)[^>]*>/gi, '')
    // Cache-busting query params on asset links: ?v=..., ?_=..., &ver=...
    .replace(/([?&])(?:v|ver|_|cb|cache|ts|t|build)=[^"'&\s]+/gi, '$1')
    // ISO timestamps and clock times that many pages stamp on render.
    .replace(/\d{4}-\d{2}-\d{2}[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?/g, '')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?\b/g, '')
    // Any remaining long opaque hex/base64 blob (view-state values, hashes, ids).
    .replace(/[A-Za-z0-9+/=_-]{40,}/g, '')
    // Collapse whitespace so reflowed markup doesn't count as a change.
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Present as a real Chrome browser. Many government / CDN-fronted sites
 * (SSA, state revenue departments behind Akamai/Cloudflare) return 403/404/400
 * to a plain scripting user-agent, so a bare fetch looks "blocked" even though
 * the page is fine. Sending the full Chrome header set makes those sources
 * respond normally — verified: tax.ohio.gov 404→200, dced.pa.gov 400→200. A
 * site that still blocks by IP is reported as unreachable, never a failure.
 */
const BROWSER_HEADERS: Record<string, string> = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,image/avif,image/webp,image/apng,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  'upgrade-insecure-requests': '1',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'sec-ch-ua': '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
};

export interface ProbeOptions {
  timeoutMs?: number;
  retries?: number;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

async function once(url: string, timeoutMs: number, fetchImpl: typeof fetch): Promise<Signal> {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: BROWSER_HEADERS,
    });
    const etag = res.headers.get('etag') ?? undefined;
    const lastModified = res.headers.get('last-modified') ?? undefined;
    const contentType = res.headers.get('content-type') ?? undefined;
    const declared = Number(res.headers.get('content-length') ?? '0');

    let hash: string | null = null;
    let bytes: number | undefined;
    if (res.ok && (declared === 0 || declared <= MAX_HASH_BYTES)) {
      const buf = Buffer.from(await res.arrayBuffer());
      bytes = buf.byteLength;
      if (bytes <= MAX_HASH_BYTES) {
        // Normalize HTML (strip per-request tokens) before hashing; hash other
        // content types (PDF, JSON, CSV) byte-for-byte since they're stable.
        const isHtml = /text\/html|application\/xhtml/i.test(contentType ?? '')
          || (!contentType && /^\s*<(?:!doctype|html)/i.test(buf.subarray(0, 200).toString('utf8')));
        const material = isHtml ? Buffer.from(normalizeHtml(buf.toString('utf8')), 'utf8') : buf;
        hash = createHash('sha256').update(material).digest('hex');
      }
    } else {
      // Drain nothing; rely on headers as the signal for oversized bodies.
      bytes = declared || undefined;
    }
    return { url, ok: res.ok, status: res.status, etag, lastModified, hash, bytes, error: res.ok ? undefined : `HTTP ${res.status}`, ms: Date.now() - started };
  } catch (e) {
    const err = e as Error;
    return { url, ok: false, error: (err?.name === 'AbortError' ? 'timeout' : err?.message ?? String(e)).slice(0, 140), ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Probe a URL with a timeout and a few retries on failure. Always resolves. */
export async function probe(url: string, opts: ProbeOptions = {}): Promise<Signal> {
  const timeoutMs = opts.timeoutMs ?? 20000;
  const retries = opts.retries ?? 2;
  const fetchImpl = opts.fetchImpl ?? fetch;
  let last: Signal = { url, ok: false, error: 'not attempted' };
  for (let attempt = 0; attempt <= retries; attempt++) {
    last = await once(url, timeoutMs, fetchImpl);
    if (last.ok) return last;
    if (attempt < retries) await sleep(500 * 2 ** attempt); // 0.5s, 1s, 2s
  }
  return last;
}

/** Probe many URLs with bounded concurrency. Always resolves for every URL. */
export async function probeAll(urls: string[], opts: ProbeOptions & { concurrency?: number } = {}): Promise<Signal[]> {
  const concurrency = Math.max(1, opts.concurrency ?? 6);
  const out: Signal[] = new Array(urls.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < urls.length) {
      const i = next++;
      out[i] = await probe(urls[i], opts);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
  return out;
}

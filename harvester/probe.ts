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
    const declared = Number(res.headers.get('content-length') ?? '0');

    let hash: string | null = null;
    let bytes: number | undefined;
    if (res.ok && (declared === 0 || declared <= MAX_HASH_BYTES)) {
      const buf = Buffer.from(await res.arrayBuffer());
      bytes = buf.byteLength;
      if (bytes <= MAX_HASH_BYTES) hash = createHash('sha256').update(buf).digest('hex');
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

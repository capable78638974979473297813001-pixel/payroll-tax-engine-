import { execFile, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Reaching the actual taxing authority.
 *
 * The engine itself never touches the network — that is deliberate and
 * stays true. This module is the harvester's one door to the outside, and
 * it exists because every other piece of the harvester (snapshot, diff,
 * review) already assumed someone else had fetched the bytes.
 *
 * Three things learned the hard way while researching states by hand, all
 * encoded here rather than rediscovered per source:
 *
 *  1. A plain fetch gets 403'd by several state sites (Colorado's
 *     tax.colorado.gov is the confirmed case) purely for lacking a browser
 *     User-Agent. Sending one is not evasion — these are public documents
 *     published for employers to read; it is what any human's browser sends.
 *  2. Half the authoritative sources are PDFs. Bytes alone are useless for
 *     diffing (a regenerated PDF changes bytes with identical content), so
 *     PDFs are converted to text and the TEXT is what gets snapshotted.
 *  3. URLs move. Utah's Publication 14 404s at its documented tax.utah.gov
 *     path and lives at files.tax.utah.gov instead. A fetch failure is
 *     therefore an ordinary, expected outcome to be reported — never an
 *     exception that aborts a run over the other fifty-nine sources.
 *
 * Nothing here throws. A runner sweeping every source needs a result for
 * each one, including the broken ones.
 */

export interface FetchOk {
  ok: true;
  sourceId: string;
  url: string;
  /** Text suitable for hashing and parsing — PDFs arrive already extracted. */
  content: string;
  contentType: string;
  bytes: number;
  fetchedAt: string;
  /** True when the body was a PDF that had to be run through pdftotext. */
  extractedFromPdf: boolean;
}

export interface FetchFail {
  ok: false;
  sourceId: string;
  url: string;
  fetchedAt: string;
  /**
   * Why this source could not be read, in terms a human can act on. A 404
   * usually means the URL moved and the registry entry needs updating; a
   * 403 means the site is refusing us specifically; a timeout may just be
   * a bad afternoon.
   */
  reason: string;
  status?: number;
}

export type FetchResult = FetchOk | FetchFail;

/**
 * What a browser sends. Several state revenue sites reject anything else
 * with a 403 — verified directly against Colorado's own withholding guide,
 * which returns 403 to a default fetch and 200 to this.
 */
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * A User-Agent alone is not always enough. Texas's TWC returns a 202 with a
 * ZERO-byte body to a request sending `Accept: * / *`, and a real body once
 * `Accept`/`Accept-Language` look like a browser's — measured directly, not
 * guessed. Several WAFs fingerprint the whole header set, so these are sent
 * together.
 */
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': BROWSER_UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const DEFAULT_TIMEOUT_MS = 60_000;
/** Above this, a "document" is almost certainly not the rate register we wanted. */
const MAX_BYTES = 60 * 1024 * 1024;

export interface FetchOptions {
  timeoutMs?: number;
  /** Injected in tests so no test run ever reaches the network. */
  fetchImpl?: typeof globalThis.fetch;
  /** Injected in tests to avoid depending on a pdftotext binary. */
  pdfToText?: (pdf: Buffer) => Promise<string>;
}

export async function fetchSource(
  source: { id: string; url: string },
  options: FetchOptions = {},
): Promise<FetchResult> {
  const fetchedAt = new Date().toISOString();
  const doFetch = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const fail = (reason: string, status?: number): FetchFail => ({
    ok: false,
    sourceId: source.id,
    url: source.url,
    fetchedAt,
    reason,
    ...(status !== undefined ? { status } : {}),
  });

  let response: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    response = await doFetch(source.url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: BROWSER_HEADERS,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(
      controller.signal.aborted
        ? `Timed out after ${timeoutMs}ms.`
        : `Network error: ${message}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    return fail(
      response.status === 404
        ? `HTTP 404 — the URL has moved or been retired. Update this source's url in sources.json.`
        : response.status === 403
          ? `HTTP 403 — the site refused the request even with a browser User-Agent. Likely a bot wall (Akamai/Cloudflare); this source may need fetching by hand.`
          : `HTTP ${response.status} ${response.statusText}.`,
      response.status,
    );
  }

  const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
  let buffer: Buffer;
  try {
    buffer = Buffer.from(await response.arrayBuffer());
  } catch (err) {
    return fail(`Could not read response body: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (buffer.byteLength > MAX_BYTES) {
    return fail(`Body is ${buffer.byteLength} bytes, over the ${MAX_BYTES}-byte ceiling.`);
  }

  // A 202 is technically "ok" by fetch's reckoning, which is how this
  // slipped through at first: Texas's TWC answers 202 with an empty body
  // when its WAF decides to issue a challenge instead of serving the page.
  // Reporting that as a generic "empty body" sent the reader hunting for a
  // dead URL that was in fact perfectly alive.
  if (response.status === 202 && buffer.byteLength < 4096) {
    return fail(
      `HTTP 202 with a ${buffer.byteLength}-byte body — a WAF challenge, not the document. ` +
        'The URL is probably fine; the site is refusing automated clients. Fetch it by hand.',
      202,
    );
  }
  if (buffer.byteLength === 0) {
    return fail(`Body was empty — HTTP ${response.status} with no content is not a register.`);
  }

  const looksPdf = isPdf(buffer, contentType);
  if (!looksPdf) {
    return {
      ok: true,
      sourceId: source.id,
      url: source.url,
      content: buffer.toString('utf8'),
      contentType,
      bytes: buffer.byteLength,
      fetchedAt,
      extractedFromPdf: false,
    };
  }

  try {
    const text = await (options.pdfToText ?? pdfToTextViaPdftotext)(buffer);
    if (text.trim().length === 0) {
      return fail(
        'PDF extracted to zero characters — likely a scanned/image PDF needing OCR, which this harvester does not do.',
      );
    }
    return {
      ok: true,
      sourceId: source.id,
      url: source.url,
      content: text,
      contentType,
      bytes: buffer.byteLength,
      fetchedAt,
      extractedFromPdf: true,
    };
  } catch (err) {
    return fail(`PDF text extraction failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Content-Type lies often enough (several state sites serve PDFs as
 * application/octet-stream) that the magic number is checked too. `%PDF-`
 * is the only reliable tell.
 */
export function isPdf(buffer: Buffer, contentType: string): boolean {
  if (contentType.toLowerCase().includes('application/pdf')) return true;
  return buffer.subarray(0, 5).toString('latin1') === '%PDF-';
}

/**
 * Shell out to pdftotext (poppler). Deliberately the -layout variant: the
 * withholding tables this project reads are column-aligned, and without
 * -layout the columns interleave into unparseable soup — a failure mode
 * already documented across several state files in data/.
 */
/**
 * Locate pdftotext without depending on the caller's PATH.
 *
 * This is not defensive padding — it is a bug that actually happened. The
 * interactive sweep read all 55 sources happily, and the very same code
 * under Windows Task Scheduler failed on 37 of them, because a scheduled
 * task does not inherit the shell's PATH and poppler lives inside Git for
 * Windows rather than in a system directory. Two thirds of the registry is
 * PDF, so "works when I run it, blind at 8am" is close to the worst
 * possible failure for a monitor whose whole promise is not missing a
 * change.
 *
 * Resolution order: an explicit override first (so any environment can be
 * pinned), then PATH, then the places poppler actually installs on
 * Windows. Resolved once and cached, since a sweep calls this ~37 times.
 */
let cachedPdftotext: string | null | undefined;

function resolvePdftotext(): string | null {
  if (cachedPdftotext !== undefined) return cachedPdftotext;

  const candidates = [
    process.env.PDFTOTEXT_PATH,
    'pdftotext', // on PATH — the interactive case
    'C:\\Program Files\\Git\\mingw64\\bin\\pdftotext.exe',
    'C:\\Program Files (x86)\\Git\\mingw64\\bin\\pdftotext.exe',
    'C:\\Program Files\\poppler\\bin\\pdftotext.exe',
    '/usr/bin/pdftotext',
    '/usr/local/bin/pdftotext',
    '/opt/homebrew/bin/pdftotext',
  ].filter((c): c is string => typeof c === 'string' && c.length > 0);

  for (const candidate of candidates) {
    // A bare name can only be tested by running it; an absolute path can
    // be checked far more cheaply.
    if (candidate.includes('/') || candidate.includes('\\')) {
      if (existsSync(candidate)) {
        cachedPdftotext = candidate;
        return cachedPdftotext;
      }
      continue;
    }
    try {
      execFileSync(candidate, ['-v'], { stdio: 'ignore', timeout: 10_000 });
      cachedPdftotext = candidate;
      return cachedPdftotext;
    } catch {
      // Not on PATH here; keep looking.
    }
  }

  cachedPdftotext = null;
  return cachedPdftotext;
}

/**
 * Shell out to pdftotext (poppler). Deliberately the -layout variant: the
 * withholding tables this project reads are column-aligned, and without
 * -layout the columns interleave into unparseable soup — a failure mode
 * already documented across several state files in data/.
 */
async function pdfToTextViaPdftotext(pdf: Buffer): Promise<string> {
  const binary = resolvePdftotext();
  if (binary === null) {
    throw new Error(
      'pdftotext could not be found. It ships with poppler-utils (and with Git for Windows, at ' +
        'Program Files\\Git\\mingw64\\bin). Without it this harvester cannot read PDF sources, which are ' +
        'most of the registry. Set PDFTOTEXT_PATH to its full path if it lives somewhere unusual.',
    );
  }

  const dir = mkdtempSync(join(tmpdir(), 'harvester-pdf-'));
  const pdfPath = join(dir, 'source.pdf');
  const txtPath = join(dir, 'source.txt');
  try {
    writeFileSync(pdfPath, pdf);
    await execFileAsync(binary, ['-layout', pdfPath, txtPath], {
      timeout: 120_000,
      maxBuffer: 64 * 1024 * 1024,
    });
    return readFileSync(txtPath, 'utf8');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

import { execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
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
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: '*/*',
      },
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
  if (buffer.byteLength === 0) {
    return fail('Body was empty — a 200 with no content is not a register.');
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
async function pdfToTextViaPdftotext(pdf: Buffer): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'harvester-pdf-'));
  const pdfPath = join(dir, 'source.pdf');
  const txtPath = join(dir, 'source.txt');
  try {
    writeFileSync(pdfPath, pdf);
    await execFileAsync('pdftotext', ['-layout', pdfPath, txtPath], {
      timeout: 120_000,
      maxBuffer: 64 * 1024 * 1024,
    });
    return readFileSync(txtPath, 'utf8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('ENOENT')) {
      throw new Error(
        'pdftotext is not installed or not on PATH. It ships with poppler-utils; ' +
          'without it this harvester cannot read PDF sources.',
      );
    }
    throw err;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

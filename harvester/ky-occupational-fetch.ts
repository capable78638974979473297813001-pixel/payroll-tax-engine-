import { BROWSER_HEADERS } from './fetch.ts';
import type { FetchResult } from './fetch.ts';

/**
 * Kentucky's real local-occupational-tax register — not a URL, a UI.
 *
 * web.sos.ky.gov/occupationaltax IS the authoritative, state-run roster of
 * every Kentucky occupational-license taxing district (this project's own
 * data/local/KY-occupational-2026.json says as much: "Kentucky's PA-DCED/
 * OH-Finder equivalent"). But unlike Ohio's Finder or Pennsylvania's DCED
 * register, it is not a document a single GET returns — it is a classic
 * ASP.NET WebForms page. The 227 district NAMES are in a <select> on the
 * initial page load; the actual rate/ordinance data for any one of them
 * only appears after a postback that selects it, rendered into a server
 * control (#ContentPlaceHolder1_FvDetails / _fvDetail) that starts empty.
 * That is exactly why the harvester's registered "ky-occupational" source
 * only ever watched the enabling STATUTE, not real rates: fetch.ts's
 * fetchSource() is a single GET, and a single GET here shows nothing.
 *
 * What follows is the smallest thing that actually reads this register:
 * one GET to collect the session cookie, __VIEWSTATE/__VIEWSTATEGENERATOR/
 * __EVENTVALIDATION, and the full district list, then one POST per
 * district reusing that SAME cookie and viewstate (confirmed by hand:
 * three different districts selected in a row against one initial
 * viewstate all returned correct, distinct data — ASP.NET does not
 * require re-fetching state between dropdown selections here).
 *
 * Two deliberate restraints, both about not being a bad guest on a small
 * state agency's server:
 *
 *  1. REQUEST_DELAY_MS between postbacks. 227 requests back to back is a
 *     burst; spread over the delay it is closer to how long a diligent
 *     human would actually take clicking through the same dropdown by
 *     hand, which is the same "a browser, not a bot" ethic fetch.ts's own
 *     BROWSER_HEADERS comment already states for this project.
 *  2. `heavyFetch` in sources.json (see run.ts's sweep()) exempts this
 *     source from the daily sweep's `force: true` — every OTHER source is
 *     one cheap GET, so checking it daily "is nothing"; this one is 227
 *     requests, so checking it daily would be disproportionate for a
 *     figure that changes at most annually. It still gets checked on its
 *     own monthly cadence, and the annual-new-year calendar window (when
 *     KY's local rates actually move) forces it regardless of cadence,
 *     same as everything else.
 *
 * Only the compliance-relevant fields are extracted per district: name,
 * ordinance reference, gross/net basis, rate, minimum tax, cap. Deliberately
 * EXCLUDED: contact name/email/phone/address. Those are a city clerk's
 * personal contact details, not tax content — capturing them would (a) put
 * a real person's PII into this project's git-committed snapshots for no
 * reason, and (b) make the monitor cry wolf every time a clerk retires,
 * which has nothing to do with a rate changing.
 */

const REQUEST_DELAY_MS = 150;
const REQUEST_TIMEOUT_MS = 20_000;

export interface KyFetchOptions {
  fetchImpl?: typeof globalThis.fetch;
  requestDelayMs?: number;
  timeoutMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function grabHidden(html: string, id: string): string {
  const m = new RegExp(`id="${id}" value="([^"]*)"`).exec(html);
  return m ? m[1] : '';
}

interface District {
  id: string;
  name: string;
}

function parseDistricts(html: string): District[] {
  const out: District[] = [];
  const re = /<option value="(\d+)">([^<]*)<\/option>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    out.push({ id: m[1], name: m[2].trim() });
  }
  // Sorted by numeric id: stable across runs regardless of any reordering
  // in the page's own markup, so the composite document's byte order never
  // changes on its own and a real content change is the only thing that
  // moves the hash.
  return out.sort((a, b) => Number(a.id) - Number(b.id));
}

function extractField(html: string, id: string): string {
  const m = new RegExp(`id="${id}"[^>]*>([^<]*)<`).exec(html);
  return (m ? m[1] : '').trim();
}

async function fetchWithTimeout(
  doFetch: typeof globalThis.fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await doFetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fail-closed, deliberately: if any single district cannot be read, the
 * whole composite fetch is reported as failed rather than silently
 * publishing 226 good districts and one missing one. This project's own
 * standing rule (journal.ts) is that a failed read is not "unchanged" —
 * it is a source going dark — and that is exactly as true of one district
 * out of 227 as it is of a single-document source.
 */
export async function fetchKyOccupationalDatabase(
  source: { id: string; url: string },
  options: KyFetchOptions = {},
): Promise<FetchResult> {
  const fetchedAt = new Date().toISOString();
  const doFetch = options.fetchImpl ?? globalThis.fetch;
  const delayMs = options.requestDelayMs ?? REQUEST_DELAY_MS;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;

  const fail = (reason: string): FetchResult => ({
    ok: false,
    sourceId: source.id,
    url: source.url,
    fetchedAt,
    reason,
  });

  let initial: Response;
  try {
    initial = await fetchWithTimeout(doFetch, source.url, { headers: BROWSER_HEADERS }, timeoutMs);
  } catch (err) {
    return fail(`Network error on initial page load: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!initial.ok) {
    return fail(`Initial page load returned HTTP ${initial.status}.`);
  }
  const cookie = (initial.headers.get('set-cookie') ?? '').split(';')[0];
  const html = await initial.text();

  const viewstate = grabHidden(html, '__VIEWSTATE');
  const viewstategen = grabHidden(html, '__VIEWSTATEGENERATOR');
  const eventvalidation = grabHidden(html, '__EVENTVALIDATION');
  if (!viewstate || !cookie) {
    return fail(
      'Could not find __VIEWSTATE and/or a session cookie on the initial page — the site\'s markup or ' +
        'ASP.NET session handling may have changed. Re-derive the postback fields by hand before trusting this source again.',
    );
  }

  const districts = parseDistricts(html);
  if (districts.length === 0) {
    return fail('Found no district options in the dropdown — the page structure has likely changed.');
  }

  const lines: string[] = [];
  for (const { id, name } of districts) {
    const body = new URLSearchParams({
      __EVENTTARGET: 'ctl00$ContentPlaceHolder1$ddlDistricts',
      __EVENTARGUMENT: '',
      __VIEWSTATE: viewstate,
      __VIEWSTATEGENERATOR: viewstategen,
      __EVENTVALIDATION: eventvalidation,
      'ctl00$ContentPlaceHolder1$ddlDistricts': id,
    });

    let resp: Response;
    try {
      resp = await fetchWithTimeout(
        doFetch,
        source.url,
        {
          method: 'POST',
          headers: { ...BROWSER_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
          body: body.toString(),
        },
        timeoutMs,
      );
    } catch (err) {
      return fail(
        `District "${name}" (id ${id}): network error mid-crawl: ${err instanceof Error ? err.message : String(err)}. ` +
          'Failing the whole read rather than publishing a partial roster.',
      );
    }
    if (!resp.ok) {
      return fail(`District "${name}" (id ${id}): postback returned HTTP ${resp.status}.`);
    }
    const detailHtml = await resp.text();

    const districtName = extractField(detailHtml, 'ContentPlaceHolder1_FvDetails_TaxDistrictNameLabel');
    if (!districtName) {
      return fail(
        `District "${name}" (id ${id}): the response had no district-name label — the postback likely failed ` +
          '(stale viewstate, or the page structure changed) rather than genuinely returning empty data.',
      );
    }

    const ordinance = extractField(detailHtml, 'ContentPlaceHolder1_FvDetails_OrdinanceLabel');
    const basis = extractField(detailHtml, 'ContentPlaceHolder1_fvDetail_LblGross');
    const rate = extractField(detailHtml, 'ContentPlaceHolder1_fvDetail_LblRate');
    const min = extractField(detailHtml, 'ContentPlaceHolder1_fvDetail_LblMin');
    const cap = extractField(detailHtml, 'ContentPlaceHolder1_fvDetail_LblCap');

    lines.push(`${id}|${districtName}|ordinance=${ordinance}|basis=${basis}|rate=${rate}|min=${min}|cap=${cap}`);

    await sleep(delayMs);
  }

  const content = lines.join('\n') + '\n';
  return {
    ok: true,
    sourceId: source.id,
    url: source.url,
    content,
    contentType: 'text/plain',
    bytes: Buffer.byteLength(content),
    fetchedAt,
    extractedFromPdf: false,
  };
}

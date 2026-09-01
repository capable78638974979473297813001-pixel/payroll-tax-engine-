import { fetchSource } from './fetch.ts';
import type { FetchOptions, FetchResult } from './fetch.ts';

/**
 * West Virginia's Employer Handbook — read via the standing index page that
 * links to it, not a year-pinned URL.
 *
 * The registry used to point straight at
 * workforcewv.org/wp-content/uploads/2024/06/Employer-Handbook-Rev.-06.24.pdf.
 * That already-documented risk stopped being theoretical: this audit found
 * WV had published .../2025/02/Employer-Handbook-Rev.-02.25.pdf months ago,
 * and the old URL was still serving 200 with the STALE 06.24 edition the
 * whole time — a real false-green, not a hypothetical one, discovered only
 * by going looking for it by hand.
 *
 * The fix follows the same shape as this project's other "resolve the
 * current document, then read it" sources: workforcewv.org/businesses/
 * unemployment-tax-information/employer-resources/ is a standing page
 * (no date in ITS url) that lists current employer documents, including
 * whichever Employer Handbook edition is current. Read that page, pull out
 * whichever "Employer-Handbook-Rev-*.pdf" link it currently lists, and read
 * THAT document — so a future edition is followed automatically instead of
 * silently going stale behind an old link, and the actual PDF content
 * (numbers, not just a filename) is still what gets hashed.
 */
export async function fetchWvHandbook(
  source: { id: string; url: string },
  options: FetchOptions = {},
): Promise<FetchResult> {
  const indexResult = await fetchSource(source, options);
  if (!indexResult.ok) return indexResult;

  const m = /href="([^"]*Employer-Handbook-Rev[^"]*\.pdf)"/i.exec(indexResult.content);
  if (!m) {
    return {
      ok: false,
      sourceId: source.id,
      url: source.url,
      fetchedAt: indexResult.fetchedAt,
      reason:
        'The index page loaded, but no "Employer-Handbook-Rev-*.pdf" link was found on it — WV likely renamed ' +
        'the document or restructured this page. Re-derive the link pattern by hand before trusting this source again.',
    };
  }

  const pdfUrl = new URL(m[1], source.url).toString();
  const pdfResult = await fetchSource({ id: source.id, url: pdfUrl }, options);
  // Propagated as-is: a genuine fetch failure on the resolved PDF (say, a
  // 404 the day WV renames it again) should read exactly like any other
  // source's fetch failure, not be disguised as an index-page problem.
  return pdfResult;
}

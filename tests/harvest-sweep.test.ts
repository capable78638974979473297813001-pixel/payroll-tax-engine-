import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

import {
  annualAnchors,
  extractEffectiveDates,
  scheduledEffectiveDates,
  shiftDays,
  windowsDueOn,
} from '../harvester/calendar.ts';
import { fetchSource, isPdf } from '../harvester/fetch.ts';
import { fetchKyOccupationalDatabase } from '../harvester/ky-occupational-fetch.ts';
import { normalizeForComparison } from '../harvester/normalize.ts';
import { isDue, windowTouchesSource, sweep } from '../harvester/run.ts';
import type { RegisteredSource } from '../harvester/run.ts';
import { writeSnapshot } from '../harvester/snapshot.ts';
import { fetchWvHandbook } from '../harvester/wv-handbook-fetch.ts';

const HARVESTER = join(import.meta.dirname, '..', 'harvester');

before(() => {
  // The sweep writes snapshots; start from a known-empty state so "first
  // capture" vs "unchanged" is deterministic.
  rmSync(join(HARVESTER, 'snapshots', 'sweep-test-a'), { recursive: true, force: true });
  rmSync(join(HARVESTER, 'snapshots', 'sweep-test-b'), { recursive: true, force: true });
  rmSync(join(HARVESTER, 'snapshots', 'sweep-test-heavy'), { recursive: true, force: true });
});

/**
 * No test in this file reaches the network. Every fetch is injected — a
 * test suite that depended on the IRS being up would fail for reasons
 * that have nothing to do with this code.
 */
function stubFetch(body: string | Buffer, init: { status?: number; contentType?: string } = {}) {
  const status = init.status ?? 200;
  return async () =>
    new Response(body as BodyInit, {
      status,
      headers: { 'content-type': init.contentType ?? 'text/html' },
    });
}

describe('calendar — annual anchors', () => {
  test('the new-year window opens in mid-November of the PRIOR year', () => {
    // Waiting until 1 January to look means running the first week of the
    // year on last year's tables. The documents are published well before.
    const [newYear] = annualAnchors(2027);
    assert.equal(newYear.effectiveOn, '2027-01-01');
    assert.equal(newYear.checkFrom, '2026-11-15');
    assert.ok(newYear.checkFrom < newYear.effectiveOn);
  });

  test('the wage-base window opens 1 October, when the COLA lands', () => {
    const wageBase = annualAnchors(2026).find((w) => w.kind === 'annual_wage_base');
    assert.ok(wageBase);
    assert.equal(wageBase.checkFrom, '2026-10-01');
    // It is about NEXT year's base, announced this autumn.
    assert.equal(wageBase.effectiveOn, '2027-01-01');
  });

  test('1 December opens both annual windows', () => {
    const kinds = windowsDueOn('2026-12-01').map((w) => w.kind);
    assert.ok(kinds.includes('annual_new_year'));
    assert.ok(kinds.includes('annual_wage_base'));
  });

  test('a quiet day in March opens neither annual window', () => {
    const kinds = windowsDueOn('2026-03-10').map((w) => w.kind);
    assert.ok(!kinds.includes('annual_new_year'));
    assert.ok(!kinds.includes('annual_wage_base'));
  });
});

describe('calendar — scheduled effective dates from the data files', () => {
  test('picks up a real mid-year change: Georgia 2026-05-11', () => {
    const ga = scheduledEffectiveDates().find((w) => w.affects[0].includes('GA-2026'));
    assert.ok(ga, 'Georgia\'s own effectiveDateOfNewTable should be discovered');
    assert.equal(ga.effectiveOn, '2026-05-11');
  });

  test('the window opens BEFORE the date, not on it', () => {
    // 5 May is inside Georgia's window; the change lands on the 11th.
    const open = windowsDueOn('2026-05-05').map((w) => w.effectiveOn);
    assert.ok(open.includes('2026-05-11'));
  });

  test('ignores research-provenance dates like verifiedOn', () => {
    const found = extractEffectiveDates({
      verifiedOn: '2026-08-21',
      fetchedOn: '2026-08-21',
      asOf: '2026-08-21',
      effectiveDate: '2026-06-01',
    });
    assert.deepEqual(found, [{ path: 'effectiveDate', date: '2026-06-01' }]);
  });

  test('ignores effectiveFrom, which in this data records HISTORY not a schedule', () => {
    // Ohio's municipalities file carries 826 of these, nearly all from the
    // early 2000s — they say when a current rate began, not that a change
    // is coming. Including them flooded the calendar on the first run.
    const found = extractEffectiveDates({ effectiveFrom: '2002-01-01' });
    assert.equal(found.length, 0);
  });

  test('ignores 9999 sentinel dates', () => {
    const found = extractEffectiveDates({ effectiveDate: '9999-12-31' });
    assert.equal(found.length, 0);
  });

  test('every discovered date is a real ISO date, and there are few of them', () => {
    const all = scheduledEffectiveDates();
    // The point of the closed key list: a handful of genuine scheduled
    // changes, not thousands of historical records.
    assert.ok(all.length > 0 && all.length < 50, `expected a handful, got ${all.length}`);
    for (const w of all) {
      assert.match(w.effectiveOn, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(w.checkFrom < w.effectiveOn);
      assert.ok(w.checkUntil > w.effectiveOn);
    }
  });

  test('shiftDays crosses month and year boundaries correctly', () => {
    assert.equal(shiftDays('2026-01-01', -30), '2025-12-02');
    assert.equal(shiftDays('2026-12-31', 1), '2027-01-01');
  });
});

describe('fetch — failure modes are results, never exceptions', () => {
  const src = { id: 'sweep-test-a', url: 'https://example.invalid/doc' };

  test('a 404 explains that the URL moved, rather than throwing', async () => {
    const r = await fetchSource(src, { fetchImpl: stubFetch('', { status: 404 }) });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.status, 404);
    assert.match(r.reason, /moved or been retired/i);
  });

  test('a 403 names the bot-wall case, which needs a human not a retry', async () => {
    const r = await fetchSource(src, { fetchImpl: stubFetch('', { status: 403 }) });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.match(r.reason, /bot wall|refused/i);
  });

  test('a network error is reported, not thrown', async () => {
    const r = await fetchSource(src, {
      fetchImpl: async () => {
        throw new Error('getaddrinfo ENOTFOUND');
      },
      retryDelayMs: 0,
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.match(r.reason, /ENOTFOUND/);
  });

  test('a network error is retried once before being reported', async () => {
    let calls = 0;
    const r = await fetchSource(src, {
      fetchImpl: async () => {
        calls++;
        if (calls === 1) throw new Error('ECONNRESET');
        return new Response('<html>rate 1.5%</html>', { headers: { 'content-type': 'text/html' } });
      },
      retryDelayMs: 0,
    });
    assert.equal(calls, 2);
    assert.equal(r.ok, true);
  });

  test('a 403 is never retried — it is a settled answer, not a hiccup', async () => {
    let calls = 0;
    const r = await fetchSource(src, {
      fetchImpl: async () => {
        calls++;
        return new Response('', { status: 403 });
      },
      retryDelayMs: 0,
    });
    assert.equal(calls, 1);
    assert.equal(r.ok, false);
  });

  test('an empty 200 is a failure — a blank page is not a register', async () => {
    const r = await fetchSource(src, { fetchImpl: stubFetch('') });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.match(r.reason, /empty/i);
  });

  test('ordinary HTML comes back as content', async () => {
    const r = await fetchSource(src, { fetchImpl: stubFetch('<html>rate 1.5%</html>') });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.match(r.content, /1\.5%/);
    assert.equal(r.extractedFromPdf, false);
  });

  test('a PDF is detected by magic number even when served as octet-stream, and is text-extracted', async () => {
    // Content-Type lies on several state sites; %PDF- does not.
    const pdfBytes = Buffer.from('%PDF-1.7\nbinary junk here', 'latin1');
    const r = await fetchSource(src, {
      fetchImpl: stubFetch(pdfBytes, { contentType: 'application/octet-stream' }),
      pdfToText: async () => 'Wage Bracket Method Tables ... 22%',
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.extractedFromPdf, true);
    assert.match(r.content, /Wage Bracket/);
  });

  test('a scanned PDF that extracts to nothing is a failure, not silent empty content', async () => {
    const r = await fetchSource(src, {
      fetchImpl: stubFetch(Buffer.from('%PDF-1.7 scan', 'latin1'), { contentType: 'application/pdf' }),
      pdfToText: async () => '   \n  ',
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.match(r.reason, /OCR|zero characters/i);
  });

  test('isPdf trusts the magic number over a wrong Content-Type', () => {
    assert.equal(isPdf(Buffer.from('%PDF-1.4'), 'text/html'), true);
    assert.equal(isPdf(Buffer.from('<html>'), 'text/html'), false);
  });
});

describe('normalize — hashing substance, not transport noise', () => {
  /**
   * Every fixture below is a real token captured from the live sweep, not
   * an invented one. Before this normalisation existed, six of the
   * registered sources reported "changed" on every single run.
   */
  const unchangedAfterNormalising = (a: string, b: string) =>
    normalizeForComparison(a).content === normalizeForComparison(b).content;

  test("Cloudflare's rotating challenge token does not count as a change", () => {
    // Captured from wyoming's UI page: two fetches 60s apart differed by
    // exactly this and nothing else.
    const page = (r: string, t: string) =>
      `<p>Taxable wage base $30,900</p><script>window.__CF$cv$params={r:'${r}',t:'${t}'};</script>`;
    assert.ok(
      unchangedAfterNormalising(
        page('a31d0d59efbb8720', 'MTc4Nzg1NDQyNw=='),
        page('a31d0eb6cf4c0880', 'MTc4Nzg1NDQ4Mw=='),
      ),
    );
  });

  test("ASP.NET VIEWSTATE does not count as a change", () => {
    const page = (v: string) =>
      `<form><input type="hidden" name="__VIEWSTATE" value="${v}" /><td>1.25%</td></form>`;
    assert.ok(unchangedAfterNormalising(page('/wEPDwUKMTk1O'), page('/wEPDwULOTg3N')));
  });

  test('a rotating JWT does not count as a change', () => {
    const page = (t: string) => `<script>accessToken: "${t}"</script><p>rate 6.6%</p>`;
    assert.ok(
      unchangedAfterNormalising(
        page('eyJhbGciOiJIUzI1NiJ9.eyJzZWFyY2hIdWIiOiJUTkdvdiJ9.t4pOlvrXQnFi'),
        page('eyJhbGciOiJIUzI1NiJ9.eyJzZWFyY2hIdWIiOiJUTkdvdnYifQ.ZZpOlvrXQnAb'),
      ),
    );
  });

  test("Akamai's per-request telemetry does not count as a change", () => {
    const page = (rid: string, t: string) =>
      `<script>i={"ak.v":"41","ak.rid":"${rid}","ak.t":"${t}"}</script><p>$184,500</p>`;
    assert.ok(unchangedAfterNormalising(page('23d9d91e', '1787854782'), page('44f1c0aa', '1787854999')));
  });

  test("Cloudflare's email obfuscation does not count as a change", () => {
    const page = (h: string) => `<a href="/cdn-cgi/l/email-protection#${h}"><span data-cfemail="${h}">x</span></a>`;
    assert.ok(unchangedAfterNormalising(page('1f7a326c7a6d6976'), page('553078263027233c')));
  });

  test('a REAL rate change is still detected — normalisation must not swallow content', () => {
    // The whole point of being conservative: transport noise is stripped,
    // tax content never is.
    const before = `<script>window.__CF$cv$params={r:'aaa',t:'bbb'};</script><td>Rate: 3.07%</td>`;
    const after = `<script>window.__CF$cv$params={r:'ccc',t:'ddd'};</script><td>Rate: 3.50%</td>`;
    assert.ok(!unchangedAfterNormalising(before, after), 'a moved rate must survive normalisation');
  });

  test('a published effective date in visible text is never stripped', () => {
    // The html-comment-timestamp pattern is deliberately scoped to
    // comments so a real date like Georgia's 2026-05-11 stays put.
    const { content } = normalizeForComparison('<p>Effective 2026-05-11, the rate falls.</p>');
    assert.match(content, /2026-05-11/);
  });

  test('it reports which patterns actually fired', () => {
    const { strippedPatterns } = normalizeForComparison(
      `<script>window.__CF$cv$params={r:'a',t:'b'};</script>`,
    );
    assert.deepEqual(strippedPatterns, ['cloudflare-challenge-token']);
  });

  test('line-ending and trailing-whitespace churn is not a change', () => {
    assert.ok(unchangedAfterNormalising('rate 5%\r\nnext line', 'rate 5%   \nnext line'));
  });
});

describe('run — what is due today', () => {
  const federalSource: RegisteredSource = {
    id: 'sweep-test-a',
    level: 'federal',
    jurisdiction: 'US',
    title: 'Test federal source',
    url: 'https://example.invalid/fed',
    authority: 'primary',
    format: 'html',
    checkFrequency: 'monthly',
  };
  const ohioLocal: RegisteredSource = {
    id: 'sweep-test-b',
    level: 'local',
    jurisdiction: 'OH',
    title: 'Test Ohio register',
    url: 'https://example.invalid/oh',
    authority: 'state_register',
    format: 'delimited',
    checkFrequency: 'weekly',
  };

  test('a never-seen source is always due', () => {
    const { due } = isDue(federalSource, '2026-03-10', []);
    assert.equal(due, true);
  });

  test('the new-year window forces every source, whatever its cadence', () => {
    const newYear = annualAnchors(2027)[0];
    assert.equal(windowTouchesSource(newYear, federalSource), true);
    assert.equal(windowTouchesSource(newYear, ohioLocal), true);
  });

  test('the wage-base window skips purely local registers, which carry no wage base', () => {
    const wageBase = annualAnchors(2026).find((w) => w.kind === 'annual_wage_base')!;
    assert.equal(windowTouchesSource(wageBase, federalSource), true);
    assert.equal(windowTouchesSource(wageBase, ohioLocal), false);
  });

  test('heavyFetch sources are exempt from force: true — see ky-occupational-fetch.ts', async () => {
    const heavySource: RegisteredSource = {
      id: 'sweep-test-heavy',
      level: 'local',
      jurisdiction: 'KY',
      title: 'Test heavy source',
      url: 'https://example.invalid/heavy',
      authority: 'state_register',
      format: 'html',
      checkFrequency: 'monthly',
      heavyFetch: true,
    };
    // Seed a snapshot dated exactly `asOf`, so elapsedDays is 0 — genuinely
    // not due under the monthly cadence, deterministically, regardless of
    // whenever this test actually runs (never relying on the real clock,
    // unlike computing "not due" from a past checkFrequency window).
    writeSnapshot(heavySource.id, 'heavy content v1', '2026-03-01T00:00:00.000Z');

    // Same day, `force: true` — an ordinary source would be re-checked
    // regardless of cadence; a heavyFetch source should be skipped instead.
    const forced = await sweep('2026-03-01', {
      sources: [heavySource],
      fetchImpl: stubFetch('heavy content v1'),
      force: true,
    });
    assert.equal(forced.counts.skipped_not_due, 1);
  });

  test('a calendar window still forces a heavyFetch source, even without force: true', () => {
    const heavySource: RegisteredSource = {
      id: 'sweep-test-heavy',
      level: 'local',
      jurisdiction: 'KY',
      title: 'Test heavy source',
      url: 'https://example.invalid/heavy',
      authority: 'state_register',
      format: 'html',
      checkFrequency: 'monthly',
      heavyFetch: true,
    };
    const newYear = annualAnchors(2027)[0];
    assert.equal(windowTouchesSource(newYear, heavySource), true);
  });

  test("a state's scheduled date forces that state's sources only", () => {
    const ohioWindow = {
      kind: 'scheduled_effective_date' as const,
      effectiveOn: '2026-08-01',
      checkFrom: '2026-07-02',
      checkUntil: '2026-08-31',
      affects: ['data/states/OH-2026.json#midYearEffectiveDating.thresholdDate'],
      why: 'test',
    };
    assert.equal(windowTouchesSource(ohioWindow, ohioLocal), true);
    // Re-reading the IRS publication because Ohio changed is busywork.
    assert.equal(windowTouchesSource(ohioWindow, federalSource), false);
  });

  test('a full sweep records a first capture, then reports it unchanged next time', async () => {
    const fetchImpl = stubFetch('municipal rates v1');
    const first = await sweep('2026-03-10', { sources: [ohioLocal], fetchImpl });
    assert.equal(first.counts.changed, 1);
    assert.match(first.entries[0].reason ?? '', /First capture/);

    // Same bytes, forced so cadence doesn't skip it.
    const second = await sweep('2026-03-10', { sources: [ohioLocal], fetchImpl, force: true });
    assert.equal(second.counts.unchanged, 1);
    assert.equal(second.counts.changed, 0);
  });

  test('a changed document is surfaced for review', async () => {
    await sweep('2026-03-10', {
      sources: [federalSource],
      fetchImpl: stubFetch('rate 3.07%'),
      force: true,
    });
    const changed = await sweep('2026-03-10', {
      sources: [federalSource],
      fetchImpl: stubFetch('rate 3.50%'),
      force: true,
    });
    assert.equal(changed.counts.changed, 1);
    assert.match(changed.entries[0].reason ?? '', /differs from the last capture/);
  });

  test('an unreadable source is reported without aborting the rest of the sweep', async () => {
    const report = await sweep('2026-03-10', {
      sources: [federalSource, ohioLocal],
      fetchImpl: async (url) =>
        String(url).includes('/fed')
          ? new Response('', { status: 500 })
          : new Response('ok content', { status: 200, headers: { 'content-type': 'text/html' } }),
      force: true,
      retryDelayMs: 0,
    });
    // One failed, but the other was still checked — a broken source must not
    // blind the harvester to the other fifty-nine.
    assert.equal(report.counts.fetch_failed, 1);
    assert.equal(report.entries.filter((e) => e.outcome !== 'fetch_failed').length, 1);
  });

  test('the sweep never writes to data/ — findings end at "a human should look"', async () => {
    const report = await sweep('2026-03-10', {
      sources: [federalSource],
      fetchImpl: stubFetch('anything at all'),
      force: true,
    });
    // The report's own contract: snapshots and review items only.
    for (const e of report.entries) {
      if (e.snapshotPath) assert.match(e.snapshotPath, /snapshots/);
      assert.ok(!e.snapshotPath?.includes(`${'data'}${'/'}states`));
    }
  });
});

describe('ky-occupational-fetch — driving a WebForms postback for every district', () => {
  const INITIAL_HTML = `<html><body>
    <input type="hidden" id="__VIEWSTATE" value="VS1" />
    <input type="hidden" id="__VIEWSTATEGENERATOR" value="GEN1" />
    <input type="hidden" id="__EVENTVALIDATION" value="EV1" />
    <select id="ContentPlaceHolder1_ddlDistricts">
      <option value="2">Beta County</option>
      <option value="1">Alpha City</option>
    </select>
  </body></html>`;

  function detailHtml(name: string, rate: string): string {
    return `<html><body>
      <span id="ContentPlaceHolder1_FvDetails_TaxDistrictNameLabel">${name}</span>
      <span id="ContentPlaceHolder1_FvDetails_OrdinanceLabel">O-1</span>
      <span id="ContentPlaceHolder1_fvDetail_LblGross">Net Profits</span>
      <span id="ContentPlaceHolder1_fvDetail_LblRate">${rate}</span>
      <span id="ContentPlaceHolder1_fvDetail_LblMin"></span>
      <span id="ContentPlaceHolder1_fvDetail_LblCap"></span>
      <span id="ContentPlaceHolder1_fvDetail_ContactEMail">someone@example.gov</span>
    </body></html>`;
  }

  function mockServer(districtHtml: Record<string, string | null>) {
    return async (_url: string, init?: RequestInit) => {
      if (!init || init.method !== 'POST') {
        return new Response(INITIAL_HTML, {
          status: 200,
          headers: { 'content-type': 'text/html', 'set-cookie': 'ASP.NET_SessionId=abc123; path=/' },
        });
      }
      const body = new URLSearchParams(String(init.body));
      const id = body.get('ctl00$ContentPlaceHolder1$ddlDistricts') ?? '';
      const html = districtHtml[id];
      if (html === null || html === undefined) return new Response('', { status: 500 });
      return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
    };
  }

  test('reads every district in one session and composes one document, sorted by id', async () => {
    const fetchImpl = mockServer({
      '1': detailHtml('Alpha City', '1.5%'),
      '2': detailHtml('Beta County', '2%'),
    });
    const r = await fetchKyOccupationalDatabase(
      { id: 'ky-occupational-rates', url: 'https://web.sos.ky.gov/occupationaltax/' },
      { fetchImpl, requestDelayMs: 0 },
    );
    assert.equal(r.ok, true);
    if (!r.ok) return;
    // Sorted by numeric id (1 before 2) even though the dropdown listed
    // Beta (2) first — the composite document's order must not depend on
    // the page's own markup order.
    const alphaIdx = r.content.indexOf('Alpha City');
    const betaIdx = r.content.indexOf('Beta County');
    assert.ok(alphaIdx >= 0 && betaIdx >= 0 && alphaIdx < betaIdx);
    assert.match(r.content, /rate=1\.5%/);
    assert.match(r.content, /rate=2%/);
  });

  test('a rate change in ONE district changes the composite document', async () => {
    const before = await fetchKyOccupationalDatabase(
      { id: 'ky-occupational-rates', url: 'https://web.sos.ky.gov/occupationaltax/' },
      { fetchImpl: mockServer({ '1': detailHtml('Alpha City', '1.5%'), '2': detailHtml('Beta County', '2%') }), requestDelayMs: 0 },
    );
    const after = await fetchKyOccupationalDatabase(
      { id: 'ky-occupational-rates', url: 'https://web.sos.ky.gov/occupationaltax/' },
      { fetchImpl: mockServer({ '1': detailHtml('Alpha City', '1.75%'), '2': detailHtml('Beta County', '2%') }), requestDelayMs: 0 },
    );
    assert.equal(before.ok, true);
    assert.equal(after.ok, true);
    if (!before.ok || !after.ok) return;
    assert.notEqual(before.content, after.content);
  });

  test('never captures a contact email — administrative metadata, not tax content', async () => {
    const r = await fetchKyOccupationalDatabase(
      { id: 'ky-occupational-rates', url: 'https://web.sos.ky.gov/occupationaltax/' },
      { fetchImpl: mockServer({ '1': detailHtml('Alpha City', '1.5%'), '2': detailHtml('Beta County', '2%') }), requestDelayMs: 0 },
    );
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.doesNotMatch(r.content, /someone@example\.gov/);
  });

  test('one unreadable district fails the WHOLE fetch, never a silent partial roster', async () => {
    const r = await fetchKyOccupationalDatabase(
      { id: 'ky-occupational-rates', url: 'https://web.sos.ky.gov/occupationaltax/' },
      { fetchImpl: mockServer({ '1': detailHtml('Alpha City', '1.5%'), '2': null }), requestDelayMs: 0 },
    );
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.match(r.reason, /Beta County/);
  });

  test('a missing session cookie or viewstate on the initial page is reported, not thrown', async () => {
    const r = await fetchKyOccupationalDatabase(
      { id: 'ky-occupational-rates', url: 'https://web.sos.ky.gov/occupationaltax/' },
      {
        fetchImpl: async () => new Response('<html>no viewstate here</html>', { status: 200 }),
        requestDelayMs: 0,
      },
    );
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.match(r.reason, /VIEWSTATE|cookie/);
  });
});

describe('wv-handbook-fetch — resolving the CURRENT handbook edition, not a pinned one', () => {
  const source = { id: 'wv-ui-rates', url: 'https://workforcewv.org/index/' };

  function indexPage(handbookHref: string): string {
    return `<html><body><a href="${handbookHref}">Employer Handbook</a></body></html>`;
  }

  test('follows the index page to whichever handbook edition it currently lists', async () => {
    const fetchImpl = async (url: string) =>
      String(url).includes('Employer-Handbook-Rev')
        ? new Response('rate tables inside: 2.7%', { status: 200, headers: { 'content-type': 'text/html' } })
        : new Response(indexPage('/wp-content/uploads/2025/02/Employer-Handbook-Rev.-02.25.pdf'), {
            status: 200,
            headers: { 'content-type': 'text/html' },
          });
    const r = await fetchWvHandbook(source, { fetchImpl });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.match(r.content, /2\.7%/);
  });

  test('a NEW edition on the index page is followed automatically — no URL to update by hand', async () => {
    const fetchImplOld = async (url: string) =>
      String(url).includes('Employer-Handbook-Rev')
        ? new Response('old edition content', { status: 200, headers: { 'content-type': 'text/html' } })
        : new Response(indexPage('/wp-content/uploads/2024/06/Employer-Handbook-Rev.-06.24.pdf'), { status: 200 });
    const fetchImplNew = async (url: string) =>
      String(url).includes('Employer-Handbook-Rev')
        ? new Response('new edition content', { status: 200, headers: { 'content-type': 'text/html' } })
        : new Response(indexPage('/wp-content/uploads/2025/02/Employer-Handbook-Rev.-02.25.pdf'), { status: 200 });
    const before = await fetchWvHandbook(source, { fetchImpl: fetchImplOld });
    const after = await fetchWvHandbook(source, { fetchImpl: fetchImplNew });
    assert.equal(before.ok, true);
    assert.equal(after.ok, true);
    if (!before.ok || !after.ok) return;
    assert.notEqual(before.content, after.content);
  });

  test('a restructured index page with no handbook link is reported, not silently blank', async () => {
    const r = await fetchWvHandbook(source, {
      fetchImpl: async () => new Response('<html>no handbook link here</html>', { status: 200 }),
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.match(r.reason, /Employer-Handbook/);
  });

  test('an index page that fails to load is reported like any other fetch failure', async () => {
    const r = await fetchWvHandbook(source, {
      fetchImpl: async () => new Response('', { status: 404 }),
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.match(r.reason, /moved or been retired/i);
  });
});

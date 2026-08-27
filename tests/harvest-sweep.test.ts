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
import { isDue, windowTouchesSource, sweep } from '../harvester/run.ts';
import type { RegisteredSource } from '../harvester/run.ts';

const HARVESTER = join(import.meta.dirname, '..', 'harvester');

before(() => {
  // The sweep writes snapshots; start from a known-empty state so "first
  // capture" vs "unchanged" is deterministic.
  rmSync(join(HARVESTER, 'snapshots', 'sweep-test-a'), { recursive: true, force: true });
  rmSync(join(HARVESTER, 'snapshots', 'sweep-test-b'), { recursive: true, force: true });
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
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.match(r.reason, /ENOTFOUND/);
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

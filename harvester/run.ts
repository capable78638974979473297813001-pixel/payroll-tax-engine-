import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { windowsDueOn, describeWindows } from './calendar.ts';
import type { CalendarWindow } from './calendar.ts';
import { fetchSource } from './fetch.ts';
import type { FetchOptions, FetchResult } from './fetch.ts';
import { fetchKyOccupationalDatabase } from './ky-occupational-fetch.ts';
import { normalizeForComparison } from './normalize.ts';
import { hasChanged, writeSnapshot, latestSnapshot } from './snapshot.ts';
import { fetchWvHandbook } from './wv-handbook-fetch.ts';

/**
 * One sweep of the outside world.
 *
 * This is where the two halves meet. The CALENDAR knows when a change is
 * scheduled and therefore which sources deserve attention today; the
 * SNAPSHOT sweep catches the changes nobody scheduled. Neither alone is
 * sufficient: a calendar cannot see a village council raising a rate in
 * March, and a daily byte-diff of sixty documents is mostly noise that
 * still misses the thing you actually needed to re-read on 2 January.
 *
 * What this run does NOT do, deliberately: write to data/. That boundary
 * is inherited from harvest.ts and is the whole safety model — a harvester
 * that can move rates on its own can move them wrongly on its own. Every
 * finding here ends at "a human should look at this."
 */

const SOURCES_PATH = join(import.meta.dirname, 'sources.json');

export type CheckFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly';

export interface RegisteredSource {
  id: string;
  level: 'federal' | 'state' | 'local';
  jurisdiction: string;
  title: string;
  url: string;
  authority: string;
  format: string;
  checkFrequency: CheckFrequency;
  expectedChange?: string;
  feeds?: string[];
  note?: string;
  /** Known to be unfetchable by machine; see manualOnlyReason. */
  manualOnly?: boolean;
  /**
   * The URL fetches cleanly but is not the document whose changes matter —
   * e.g. a search form standing in front of the register. Distinct from
   * manualOnly (which cannot be fetched at all): this one looks perfectly
   * healthy every day, which is exactly why it needs saying out loud.
   */
  monitoringGap?: boolean;
  /**
   * Inclusive [from, to] byte offsets this source regenerates per request
   * (an embedded timestamp in a binary export, say). Zeroed before hashing
   * so the capture is comparable. Measure these by diffing two fetches —
   * never guess, since masking real content would hide a rate change.
   */
  volatileByteRanges?: [number, number][];
  manualOnlyReason?: string;
  /**
   * This source's fetch is many requests, not one (see
   * ky-occupational-fetch.ts) — checking it EVERY day the way every other,
   * single-GET source is force-checked would be a disproportionate load
   * for a figure that changes at most annually. Exempts it from the daily
   * sweep's `force: true` so it follows its own checkFrequency instead;
   * calendar windows (the annual new-year window, in particular) still
   * force it regardless, same as any other source.
   */
  heavyFetch?: boolean;
  /**
   * Some sources are not a single GET at all — a WebForms page whose real
   * content only appears after simulating its own postback flow, say.
   * Naming the fetcher here keeps sweep() itself generic instead of
   * special-casing this one source id inline.
   */
  customFetcher?: 'ky-occupational-full' | 'wv-handbook-current';
}

const FREQUENCY_DAYS: Record<CheckFrequency, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  quarterly: 90,
};

export function loadSources(path = SOURCES_PATH): RegisteredSource[] {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as { sources: RegisteredSource[] };
  return raw.sources;
}

export type SweepOutcome =
  /** Not yet due under its own cadence, and no calendar window forced it. */
  | 'skipped_not_due'
  /** Fetched; byte-identical to the last capture. */
  | 'unchanged'
  /** Fetched; the document differs from last capture. A human should read it. */
  | 'changed'
  /** Could not be read at all — see reason. */
  | 'fetch_failed';

export interface SweepEntry {
  sourceId: string;
  title: string;
  jurisdiction: string;
  url: string;
  outcome: SweepOutcome;
  /** Which calendar window, if any, made this urgent today. */
  forcedBy?: CalendarWindow['kind'];
  lastCheckedAt?: string;
  reason?: string;
  snapshotPath?: string;
  /** Volatile tokens (CF challenge, VIEWSTATE…) removed before comparing. */
  strippedPatterns?: string[];
}

export interface SweepReport {
  asOf: string;
  openWindows: CalendarWindow[];
  entries: SweepEntry[];
  counts: Record<SweepOutcome, number>;
}

/**
 * Is this source due today?
 *
 * Two independent reasons to look: its own cadence has elapsed, or a
 * calendar window is open that touches it. The second overrides the first —
 * a monthly source is checked on 2 January regardless of when it was last
 * read, because that is the day the answer is most likely to have changed.
 */
export function isDue(
  source: RegisteredSource,
  asOf: string,
  openWindows: readonly CalendarWindow[],
): { due: boolean; forcedBy?: CalendarWindow['kind']; lastCheckedAt?: string } {
  const forcing = openWindows.find((w) => windowTouchesSource(w, source));
  const last = latestSnapshot(source.id);

  if (forcing) {
    return {
      due: true,
      forcedBy: forcing.kind,
      ...(last ? { lastCheckedAt: last.fetchedAt } : {}),
    };
  }
  if (!last) return { due: true };

  const elapsedDays =
    (Date.parse(`${asOf}T00:00:00.000Z`) - Date.parse(last.fetchedAt)) / 86_400_000;
  return {
    due: elapsedDays >= FREQUENCY_DAYS[source.checkFrequency],
    lastCheckedAt: last.fetchedAt,
  };
}

/**
 * Does an open calendar window reach this source?
 *
 * The annual windows are deliberately broad — on 2 January everything is
 * suspect, so they touch every source. A scheduled date extracted from one
 * state's file only touches sources for that same jurisdiction; re-reading
 * the IRS publication because Utah changed its table would be busywork.
 */
export function windowTouchesSource(w: CalendarWindow, source: RegisteredSource): boolean {
  if (w.kind === 'annual_new_year') return true;
  if (w.kind === 'annual_wage_base') {
    // Wage bases are federal-anchored and state-SUI; local registers don't carry them.
    return source.level !== 'local';
  }
  // scheduled_effective_date: match on the jurisdiction in the file path.
  return w.affects.some((a) => {
    const m = /data\/(?:states|local)\/([A-Z]{2})-/.exec(a);
    return m ? m[1] === source.jurisdiction : false;
  });
}

export interface SweepOptions extends FetchOptions {
  /** Injected so tests never reach the network. */
  fetchImpl?: typeof globalThis.fetch;
  sources?: RegisteredSource[];
  /** Check every source regardless of cadence. */
  force?: boolean;
}

export async function sweep(asOf: string, options: SweepOptions = {}): Promise<SweepReport> {
  const sources = options.sources ?? loadSources();
  const openWindows = windowsDueOn(asOf);
  const entries: SweepEntry[] = [];

  for (const source of sources) {
    const { due, forcedBy, lastCheckedAt } = isDue(source, asOf, openWindows);
    const base = {
      sourceId: source.id,
      title: source.title,
      jurisdiction: source.jurisdiction,
      url: source.url,
      ...(forcedBy ? { forcedBy } : {}),
      ...(lastCheckedAt ? { lastCheckedAt } : {}),
    };

    // heavyFetch sources ignore `force` — see RegisteredSource.heavyFetch.
    // A calendar window (forcedBy set above) still overrides even for these.
    const forcedToday = options.force && !(source.heavyFetch && !forcedBy);
    if (!due && !forcedToday) {
      entries.push({ ...base, outcome: 'skipped_not_due' });
      continue;
    }

    const result: FetchResult =
      source.customFetcher === 'ky-occupational-full'
        ? await fetchKyOccupationalDatabase(source, options)
        : source.customFetcher === 'wv-handbook-current'
          ? await fetchWvHandbook(source, options)
          : await fetchSource(source, options);
    if (!result.ok) {
      entries.push({ ...base, outcome: 'fetch_failed', reason: result.reason });
      continue;
    }

    // Compare — and snapshot — the NORMALIZED text, not the raw bytes.
    // Several sources rotate a Cloudflare token or an ASP.NET VIEWSTATE on
    // every single request; hashing those makes every run report a change
    // and the monitor becomes noise nobody reads. Snapshotting the
    // normalized form also makes the stored captures diffable against each
    // other, which is what a reviewer actually does with them.
    const { content: normalized, strippedPatterns } = normalizeForComparison(result.content);

    if (!hasChanged(source.id, normalized)) {
      entries.push({ ...base, outcome: 'unchanged' });
      continue;
    }

    const snap = writeSnapshot(source.id, normalized, result.fetchedAt);
    entries.push({
      ...base,
      outcome: 'changed',
      snapshotPath: snap.path,
      ...(strippedPatterns.length ? { strippedPatterns } : {}),
      reason:
        lastCheckedAt === undefined
          ? 'First capture of this source — nothing to compare against yet. Future runs will diff against it.'
          : 'Document content differs from the last capture, after volatile tokens were stripped. Read it and update the affected data file if a rate actually moved.',
    });
  }

  const counts = entries.reduce(
    (acc, e) => {
      acc[e.outcome]++;
      return acc;
    },
    {
      skipped_not_due: 0,
      unchanged: 0,
      changed: 0,
      fetch_failed: 0,
    } as Record<SweepOutcome, number>,
  );

  return { asOf, openWindows, entries, counts };
}

export function describeSweep(report: SweepReport): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`HARVEST SWEEP — ${report.asOf}`);
  lines.push('='.repeat(72));
  lines.push('');
  lines.push(describeWindows(report.openWindows, report.asOf));
  lines.push('');
  lines.push(
    `Sources: ${report.counts.changed} changed, ${report.counts.unchanged} unchanged, ` +
      `${report.counts.fetch_failed} unreadable, ${report.counts.skipped_not_due} not due`,
  );
  lines.push('');

  const show = (outcome: SweepOutcome, heading: string) => {
    const items = report.entries.filter((e) => e.outcome === outcome);
    if (items.length === 0) return;
    lines.push(heading);
    for (const e of items) {
      lines.push(`  ${e.sourceId} [${e.jurisdiction}]${e.forcedBy ? `  (forced by ${e.forcedBy})` : ''}`);
      if (e.reason) lines.push(`      ${e.reason}`);
      if (e.snapshotPath) lines.push(`      snapshot: ${e.snapshotPath}`);
    }
    lines.push('');
  };

  show('changed', 'CHANGED — a human should read these:');
  show('fetch_failed', 'UNREADABLE — the source could not be fetched:');
  show('unchanged', 'Unchanged:');
  show('skipped_not_due', 'Not due today:');

  lines.push('Nothing above has been written to data/. Rates only move by explicit human edit.');
  lines.push('');
  return lines.join('\n');
}

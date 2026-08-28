import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadSources, sweep } from './run.ts';
import type { SweepEntry } from './run.ts';
import {
  acquireLock,
  releaseLock,
  appendEvent,
  assessHealth,
  findingIdFor,
  readEvents,
} from './journal.ts';

/**
 * The scheduled sweep — the thing the 8am task actually invokes.
 *
 * Two deliberate differences from an ad-hoc `npm run harvest`:
 *
 * 1. EVERY source is checked, every day, regardless of its own
 *    checkFrequency. Cadence exists to be polite to servers, and politeness
 *    is the wrong trade when the requirement is that a change is never
 *    missed: a monthly cadence can hide a rate change for a month, and
 *    Alabama's booklet or Ohio's mid-year cut do not wait for a source's
 *    turn to come round. Fifty-five fetches once a day is nothing.
 *
 * 2. Everything is written to the journal before the process exits, so the
 *    findings outlive the terminal that produced them. A change discovered
 *    at 8am on Tuesday is still sitting there on Friday if nobody looked —
 *    it is state with a lifecycle, not a line of console output.
 *
 * Exit code is meaningful: non-zero when the sweep could not do its job, so
 * the OS scheduler's own "last run result" column tells the truth rather
 * than always reading 0x0.
 */

export interface DailyResult {
  runId: string;
  ok: boolean;
  checked: number;
  changed: number;
  failed: number;
  message: string;
}

/** The hash lives in the snapshot filename: `<stamp>.<sha12>.raw`. */
function hashFromSnapshotPath(path: string | undefined): string {
  if (!path) return 'nohash';
  const m = /\.([0-9a-f]{12})\.raw$/.exec(path);
  return m ? m[1] : 'nohash';
}

export async function runDaily(asOf = new Date().toISOString()): Promise<DailyResult> {
  const runId = `run-${asOf.replace(/[:.]/g, '-')}`;
  const sources = loadSources();

  const lock = acquireLock(asOf);
  if (!lock.ok) {
    // Not a failure: another sweep is genuinely in progress. Saying so is
    // better than two sweeps racing on the snapshot directory, where one
    // could write the baseline the other then compares against and turn a
    // real change into "unchanged".
    return {
      runId,
      ok: true,
      checked: 0,
      changed: 0,
      failed: 0,
      message: `Another sweep has held the lock since ${lock.heldSince}; skipping this one.`,
    };
  }

  const startedMs = Date.now();

  // Read BEFORE this run appends anything, so it reflects history rather
  // than this sweep's own writes. This is the durable answer to "have we
  // ever successfully read this source?", independent of whether its
  // snapshot file still exists.
  const everVerified = new Set(
    readEvents()
      .filter((e) => e.kind === 'source_verified')
      .map((e) => e.sourceId),
  );

  appendEvent({ kind: 'run_started', at: asOf, runId, sourceCount: sources.length });

  try {
    // force: true — check everything, every day. See the note above.
    const report = await sweep(asOf, { force: true });

    for (const entry of report.entries as SweepEntry[]) {
      if (entry.outcome === 'fetch_failed') {
        appendEvent({
          kind: 'source_unreadable',
          at: asOf,
          runId,
          sourceId: entry.sourceId,
          reason: entry.reason ?? 'unknown',
        });
        continue;
      }
      if (entry.outcome === 'unchanged' || entry.outcome === 'changed') {
        appendEvent({
          kind: 'source_verified',
          at: asOf,
          runId,
          sourceId: entry.sourceId,
          changed: entry.outcome === 'changed',
        });
      }
      // A FIRST capture is a baseline, not a change. There is nothing to
      // have changed FROM, so opening a finding for it would greet you
      // with fifty-five "findings" on day one and teach you that findings
      // are noise — which is exactly how a real one later gets ignored.
      // The source is still recorded as verified above, which is what the
      // freshness guarantee actually rests on.
      //
      // But "first capture" must be decided from the JOURNAL, not from
      // whether a snapshot file happens to exist. sweep() infers
      // lastCheckedAt purely from latestSnapshot(), so anything that
      // removes the snapshot directory — and tests/harvester.test.ts
      // deleted ALL of it, production baselines included, until this was
      // found — makes every source look brand new. Every source then
      // re-baselines silently and opens nothing, so a rate that moved in
      // that window is absorbed into the new baseline and never reported.
      // That is failure mode F, and the earlier no-noise-on-day-one fix
      // is precisely what opened the hole. The journal is the durable
      // record and cannot be erased by a test run, so it decides.
      const seenBefore = everVerified.has(entry.sourceId);
      const baselineLost = seenBefore && entry.lastCheckedAt === undefined;

      if (entry.outcome === 'changed' && seenBefore) {
        appendEvent({
          kind: 'finding_opened',
          at: asOf,
          runId,
          findingId: findingIdFor(entry.sourceId, hashFromSnapshotPath(entry.snapshotPath)),
          sourceId: entry.sourceId,
          jurisdiction: entry.jurisdiction,
          title: entry.title,
          url: entry.url,
          detail: baselineLost
            ? 'Its stored baseline was missing, so this could not be compared against what we last saw. ' +
              'The journal shows this source HAS been read before, so the snapshot was lost rather than never taken. ' +
              'Treated as a change because the alternative is silently re-baselining and absorbing a rate move that ' +
              'nobody would ever see. Read the document and compare it against the data file by hand.'
            : (entry.reason ?? 'Document content changed.'),
          ...(entry.snapshotPath ? { snapshotPath: entry.snapshotPath } : {}),
        });
      }
    }

    const durationMs = Date.now() - startedMs;
    const checked = report.counts.changed + report.counts.unchanged;
    appendEvent({
      kind: 'run_finished',
      at: new Date().toISOString(),
      runId,
      checked,
      changed: report.counts.changed,
      failed: report.counts.fetch_failed,
      durationMs,
    });

    return {
      runId,
      ok: true,
      checked,
      changed: report.counts.changed,
      failed: report.counts.fetch_failed,
      message:
        `Checked ${checked}/${sources.length} sources in ${(durationMs / 1000).toFixed(0)}s — ` +
        `${report.counts.changed} changed, ${report.counts.fetch_failed} unreadable.`,
    };
  } catch (err) {
    // A crash must leave a mark. An unrecorded crash is indistinguishable
    // from a quiet night, which is precisely the failure this design
    // exists to rule out.
    const error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    appendEvent({ kind: 'run_crashed', at: new Date().toISOString(), runId, error });
    return {
      runId,
      ok: false,
      checked: 0,
      changed: 0,
      failed: 0,
      message: `Sweep crashed: ${error}`,
    };
  } finally {
    releaseLock();
  }
}

/** The morning answer to "anything change?" — reads state, fetches nothing. */
export function describeStatus(asOf = new Date().toISOString()): string {
  const sources = loadSources();
  const health = assessHealth(
    asOf,
    sources.map((s) => s.id),
    undefined,
    undefined,
    sources.filter((s) => s.manualOnly).map((s) => s.id),
  );
  const lines: string[] = [];

  const banner =
    health.status === 'green'
      ? 'HEALTHY — every source verified recently'
      : health.status === 'amber'
        ? 'DEGRADED'
        : 'NOT TRUSTWORTHY — see below';

  lines.push('');
  lines.push(`HARVEST STATUS  ${asOf}`);
  lines.push('='.repeat(72));
  lines.push(`  ${banner}`);
  if (health.lastRunFinishedAt) {
    lines.push(
      `  Last completed sweep: ${health.lastRunFinishedAt} (${health.hoursSinceLastRun!.toFixed(1)}h ago)`,
    );
  }
  lines.push('');

  if (health.problems.length > 0) {
    lines.push('WHY THE MONITOR CANNOT BE TRUSTED RIGHT NOW:');
    for (const p of health.problems) lines.push(`  ! ${p}`);
    lines.push('');
  }

  if (health.manualSources.length > 0) {
    lines.push('NEEDS A HUMAN — these cannot be fetched by machine and are excluded from the freshness test:');
    for (const m of health.manualSources) {
      const src = sources.find((s) => s.id === m.sourceId);
      // First sentence only — split on '. ' rather than '.', or a URL
      // like twc.texas.gov truncates the reason to "twc.".
      const why = src?.manualOnlyReason?.split('. ')[0];
      lines.push(`  · ${m.sourceId}${why ? ` — ${why}.` : ''}`);
    }
    lines.push('');
  }

  // States whose UI figures rest on the lagging federal backstop alone.
  // Surfaced because "healthy" refers to sources being READ, which is not
  // the same as every number in data/ being watched — and that gap is
  // invisible unless it is printed.
  try {
    const reg = JSON.parse(
      readFileSync(join(import.meta.dirname, 'sources.json'), 'utf8'),
    ) as {
      uiCoverage?: {
        backstopOnly?: string[];
        contentAudit?: {
          wageBaseMonitoredCount?: number;
          rateMonitoredCount?: number;
          carriesNeither?: string[];
        };
      };
      sources?: {
        id: string;
        jurisdiction: string;
        datedUrlRisk?: boolean;
      };
    };

    // What the registered sources actually CONTAIN, which is a different
    // question from whether they fetch. Printed first because a source
    // that loads cleanly while stating no figures is the failure this
    // project already hit once, with Pennsylvania's search form.
    const ca = reg.uiCoverage?.contentAudit;
    if (ca) {
      lines.push(
        `UI FIGURES — of 51 states, ${ca.wageBaseMonitoredCount} have a source stating the taxable WAGE BASE, ` +
          `${ca.rateMonitoredCount} one stating RATES.`,
      );
      if (ca.carriesNeither?.length) {
        lines.push(`  Registered but carrying neither figure: ${ca.carriesNeither.join(' ')}`);
      }
      // A versioned URL cannot change, so it reports green forever — even
      // once the agency has published a newer edition somewhere else. That
      // is a false green rather than a gap, so it is named here rather
      // than left in a note nobody opens.
      const dated = (reg.sources ?? []).filter((s) => s.datedUrlRisk);
      if (dated.length) {
        lines.push(
          `  Watching a DATED file (cannot change; re-check yearly): ${dated.map((s) => s.jurisdiction).join(' ')}`,
        );
      }
      lines.push('');
    }

    const backstop = reg.uiCoverage?.backstopOnly ?? [];
    if (backstop.length > 0) {
      lines.push(
        `UI RATES — ${backstop.length} states have no dedicated labour-department source; their wage base is`,
      );
      lines.push('  covered only by the annual (lagging) US DOL report, and their new-employer rates not at all:');
      lines.push(`  ${backstop.join(' ')}`);
      lines.push('');
    }
  } catch {
    // Never let a status read fail over an advisory section.
  }

  // Sources that fetch fine but do not actually watch the thing that
  // changes. Surfaced on every status read, because their whole failure
  // mode is looking green forever.
  const gaps = sources.filter((s) => s.monitoringGap);
  if (gaps.length > 0) {
    lines.push('WATCHING THE WRONG THING — fetches fine, but will not reveal a change:');
    for (const g of gaps) {
      lines.push(`  · ${g.id} [${g.jurisdiction}] — ${g.title}`);
    }
    lines.push("  See each source's own note in harvester/sources.json for what was tried.");
    lines.push('');
  }

  if (health.openFindings.length === 0) {
    lines.push(
      health.status === 'green'
        ? 'No open findings. Every registered source was read and matched its last capture.'
        : 'No open findings — but see the problems above before reading that as "nothing changed".',
    );
  } else {
    lines.push(`OPEN FINDINGS (${health.openFindings.length}) — unreviewed, oldest first:`);
    lines.push('');
    for (const f of health.openFindings) {
      lines.push(`  [${f.findingId}]  ${f.jurisdiction} — ${f.title}`);
      lines.push(`      opened ${f.openedAt}${f.seenCount > 1 ? `, re-observed on ${f.seenCount} sweeps` : ''}`);
      lines.push(`      ${f.url}`);
      if (f.snapshotPath) lines.push(`      snapshot: ${f.snapshotPath}`);
      lines.push('');
    }
    lines.push('  See exactly what moved:              npm run harvest:diff -- <sourceId>');
    lines.push('  These stay open until acknowledged:  npm run harvest:ack -- <findingId> "<who>"');
  }

  lines.push('');
  return lines.join('\n');
}

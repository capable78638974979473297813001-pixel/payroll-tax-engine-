import { loadSources, sweep } from './run.ts';
import type { SweepEntry } from './run.ts';
import {
  acquireLock,
  releaseLock,
  appendEvent,
  assessHealth,
  findingIdFor,
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
      const isFirstCapture = entry.lastCheckedAt === undefined;
      if (entry.outcome === 'changed' && !isFirstCapture) {
        appendEvent({
          kind: 'finding_opened',
          at: asOf,
          runId,
          findingId: findingIdFor(entry.sourceId, hashFromSnapshotPath(entry.snapshotPath)),
          sourceId: entry.sourceId,
          jurisdiction: entry.jurisdiction,
          title: entry.title,
          url: entry.url,
          detail: entry.reason ?? 'Document content changed.',
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
    lines.push('  These stay open until acknowledged:  npm run harvest:ack -- <findingId> "<who>"');
  }

  lines.push('');
  return lines.join('\n');
}

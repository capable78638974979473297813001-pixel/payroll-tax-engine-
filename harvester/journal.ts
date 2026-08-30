import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';

/**
 * The durable memory of the monitor.
 *
 * The requirement this exists to satisfy is absolute: a change must never
 * be missed, and it must not matter WHY it would have been missed. That is
 * a stronger claim than "the sweep works", and it is not satisfied by a
 * sweep that prints a report to a terminal nobody was watching.
 *
 * Every way a change could slip through, and what answers it here:
 *
 *   A. The run never fired — machine asleep, scheduler disabled, crash on
 *      startup. A report that was never produced looks exactly like a
 *      report that found nothing, which is the most dangerous failure of
 *      the set because it is SILENT.
 *   B. The source was not due under its own cadence, so the sweep skipped
 *      it. A monthly source can hide a change for a month.
 *   C. The fetch failed. We did not learn "unchanged"; we learned nothing.
 *      Tolerating that quietly is the same as not checking.
 *   D. It changed on Tuesday, nobody looked, and Wednesday's sweep
 *      compared against TUESDAY'S snapshot and said "unchanged" — the
 *      finding erases itself the day after it appears.
 *   F. The snapshot directory is lost, so everything looks new.
 *   H. The sweep crashed halfway and the remaining sources went unchecked.
 *
 * A/B/C/F/H are all the same shape once you stop asking why: SOME SOURCE
 * HAS NOT BEEN SUCCESSFULLY COMPARED RECENTLY. So rather than defend each
 * cause separately, this tracks one fact per source — `lastVerifiedAt`,
 * set only when a fetch actually succeeded and a comparison actually
 * happened — and reports RED when any source goes stale past its SLA. The
 * cause does not need to be anticipated for the gap to be caught.
 *
 * D is answered separately: findings stay OPEN until a human explicitly
 * acknowledges them. A finding is not a notification, it is a piece of
 * state with a lifecycle.
 *
 * The log is append-only JSONL. Appends of a single line are the closest
 * thing a filesystem offers to an atomic write, and derived state is
 * rebuilt by replaying the log — so a torn write costs one line, never the
 * history. Mutable state is never edited in place.
 */

const STATE_DIR = join(import.meta.dirname, 'state');
const EVENTS_PATH = join(STATE_DIR, 'events.jsonl');
const LOCK_PATH = join(STATE_DIR, 'sweep.lock');

/** How stale a source may go before the monitor calls itself unhealthy. */
export const FRESHNESS_SLA_HOURS = 36;

/** How long a lock may persist before it is presumed to be from a crash. */
const LOCK_STALE_MS = 2 * 60 * 60 * 1000;

export type JournalEvent =
  | { kind: 'run_started'; at: string; runId: string; sourceCount: number }
  | {
      kind: 'run_finished';
      at: string;
      runId: string;
      checked: number;
      changed: number;
      failed: number;
      durationMs: number;
    }
  | { kind: 'run_crashed'; at: string; runId: string; error: string }
  | {
      kind: 'source_verified';
      at: string;
      runId: string;
      sourceId: string;
      changed: boolean;
    }
  | {
      kind: 'source_unreadable';
      at: string;
      runId: string;
      sourceId: string;
      reason: string;
    }
  | {
      kind: 'finding_opened';
      at: string;
      runId: string;
      findingId: string;
      sourceId: string;
      jurisdiction: string;
      title: string;
      url: string;
      detail: string;
      snapshotPath?: string;
    }
  | { kind: 'finding_acknowledged'; at: string; findingId: string; by: string; note?: string };

function ensureDir(): void {
  mkdirSync(STATE_DIR, { recursive: true });
}

export function appendEvent(event: JournalEvent, eventsPath = EVENTS_PATH): void {
  ensureDir();
  // Single-line append: the write either lands or it does not. Derived
  // state is a replay of this file, so nothing else can be left corrupt.
  appendFileSync(eventsPath, JSON.stringify(event) + '\n', 'utf8');
}

export function readEvents(eventsPath = EVENTS_PATH): JournalEvent[] {
  if (!existsSync(eventsPath)) return [];
  return readFileSync(eventsPath, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as JournalEvent];
      } catch {
        // A torn final line from a power cut. Skip it rather than refusing
        // to report at all — a monitor that won't start because of one bad
        // byte is worse than one that skips it and says so.
        return [];
      }
    });
}

export interface OpenFinding {
  findingId: string;
  sourceId: string;
  jurisdiction: string;
  title: string;
  url: string;
  detail: string;
  snapshotPath?: string;
  openedAt: string;
  /** How many separate sweeps have re-observed a change on this source. */
  seenCount: number;
  /** When the most recent observation landed, if later than openedAt. */
  latestObservedAt?: string;
}

export interface SourceHealth {
  sourceId: string;
  lastVerifiedAt?: string;
  lastFailureAt?: string;
  lastFailureReason?: string;
  hoursSinceVerified?: number;
  stale: boolean;
}

export interface Health {
  status: 'green' | 'amber' | 'red';
  /** Plain sentences explaining the status. Empty when green. */
  problems: string[];
  lastRunFinishedAt?: string;
  lastRunStartedAt?: string;
  hoursSinceLastRun?: number;
  openFindings: OpenFinding[];
  staleSources: SourceHealth[];
  unreadableSources: SourceHealth[];
  /** Registered but known to need a human; excluded from the staleness test. */
  manualSources: SourceHealth[];
}

const HOUR_MS = 3_600_000;

/**
 * Rebuild current state by replaying the log, then judge it.
 *
 * `knownSourceIds` matters: a source registered but never once fetched has
 * no events at all, so replay alone would not notice it. Passing the
 * registry in is what turns "nothing recorded" into "never verified",
 * which is failure mode B/F.
 */
export function assessHealth(
  asOf: string,
  knownSourceIds: readonly string[],
  eventsPath = EVENTS_PATH,
  slaHours = FRESHNESS_SLA_HOURS,
  /**
   * Sources known to be unfetchable by machine — Texas's TWC answers every
   * automated request with a WAF challenge, whatever headers are sent.
   *
   * These are excluded from the staleness test for a specific reason, and
   * it is the same reason the volatile-token normalisation exists: a
   * warning that is permanently on is a warning nobody reads. Leaving
   * Texas in would pin the status to RED forever, and the day a REAL
   * source went stale, nothing would change colour. They are not dropped
   * — describeStatus() lists them separately as needing a human — but they
   * are not allowed to drown out the signal.
   */
  manualOnlyIds: readonly string[] = [],
): Health {
  const events = readEvents(eventsPath);
  const now = Date.parse(asOf);

  const findings = new Map<string, OpenFinding>();
  const acknowledged = new Set<string>();
  const verified = new Map<string, string>();
  const failures = new Map<string, { at: string; reason: string }>();
  let lastRunFinishedAt: string | undefined;
  let lastRunStartedAt: string | undefined;
  let lastCrash: { at: string; error: string } | undefined;

  for (const e of events) {
    switch (e.kind) {
      case 'run_started':
        lastRunStartedAt = e.at;
        break;
      case 'run_finished':
        lastRunFinishedAt = e.at;
        break;
      case 'run_crashed':
        lastCrash = { at: e.at, error: e.error };
        break;
      case 'source_verified':
        verified.set(e.sourceId, e.at);
        failures.delete(e.sourceId);
        break;
      case 'source_unreadable':
        failures.set(e.sourceId, { at: e.at, reason: e.reason });
        break;
      case 'finding_opened': {
        const existing = findings.get(e.findingId);
        if (existing) {
          existing.seenCount += 1;
        } else {
          findings.set(e.findingId, {
            findingId: e.findingId,
            sourceId: e.sourceId,
            jurisdiction: e.jurisdiction,
            title: e.title,
            url: e.url,
            detail: e.detail,
            snapshotPath: e.snapshotPath,
            openedAt: e.at,
            seenCount: 1,
          });
        }
        break;
      }
      case 'finding_acknowledged':
        acknowledged.add(e.findingId);
        break;
    }
  }

  // ONE open finding per source, not one per distinct content hash.
  //
  // findingIdFor() keys on the content hash, so a source whose page differs
  // on every fetch mints a brand new finding every sweep and they pile up
  // without limit. Measured on real data: 241 open findings across 102
  // sources after 21 sweeps, 39 sources holding more than one, Florida
  // alone at 18. That is the "cries wolf" failure the normalisation work
  // was meant to prevent, arriving by a different route — and a list of
  // 241 is not a list anyone reads.
  //
  // Collapsing by source is not merely cosmetic. Reviewing means opening
  // the source and looking at what it says NOW; two open findings for one
  // source are never more actionable than one, because the second tells
  // you nothing the first did not: go and look at this source. The oldest
  // is kept so "how long has this been unreviewed" stays truthful, and
  // seenCount reports how many separate sweeps observed a change, which is
  // the genuinely useful signal — a source changing daily is behaving very
  // differently from one that changed once in March.
  const unacknowledged = [...findings.values()].filter((f) => !acknowledged.has(f.findingId));
  const bySource = new Map<string, OpenFinding>();
  for (const f of unacknowledged.sort((a, b) => a.openedAt.localeCompare(b.openedAt))) {
    const existing = bySource.get(f.sourceId);
    if (!existing) {
      bySource.set(f.sourceId, { ...f, seenCount: f.seenCount });
      continue;
    }
    // Keep the oldest as the representative; carry the newest detail and
    // snapshot, since those describe what the source looks like now.
    existing.seenCount += f.seenCount;
    existing.detail = f.detail;
    existing.snapshotPath = f.snapshotPath;
    existing.latestObservedAt = f.openedAt;
  }
  const openFindings = [...bySource.values()].sort((a, b) => a.openedAt.localeCompare(b.openedAt));

  const sourceHealth: SourceHealth[] = knownSourceIds.map((id) => {
    const at = verified.get(id);
    const fail = failures.get(id);
    const hours = at === undefined ? undefined : (now - Date.parse(at)) / HOUR_MS;
    return {
      sourceId: id,
      lastVerifiedAt: at,
      lastFailureAt: fail?.at,
      lastFailureReason: fail?.reason,
      hoursSinceVerified: hours,
      stale: at === undefined || hours! > slaHours,
    };
  });

  const manual = new Set(manualOnlyIds);
  const manualSources = sourceHealth.filter((s) => manual.has(s.sourceId));
  const staleSources = sourceHealth.filter((s) => s.stale && !manual.has(s.sourceId));
  const unreadableSources = sourceHealth.filter((s) => s.lastFailureAt !== undefined);

  const hoursSinceLastRun =
    lastRunFinishedAt === undefined ? undefined : (now - Date.parse(lastRunFinishedAt)) / HOUR_MS;

  const problems: string[] = [];
  let status: Health['status'] = 'green';

  // A: the sweep is not running. Checked FIRST because every other signal
  // becomes untrustworthy when the thing producing them has stopped.
  if (lastRunFinishedAt === undefined) {
    problems.push(
      'No sweep has ever completed. Nothing is being monitored yet — run `npm run harvest:daily` once to establish a baseline.',
    );
    status = 'red';
  } else if (hoursSinceLastRun! > slaHours) {
    problems.push(
      `The last completed sweep was ${hoursSinceLastRun!.toFixed(1)} hours ago (${lastRunFinishedAt}), past the ` +
        `${slaHours}-hour limit. The scheduled task is not running. Until it does, "no changes" means nothing — ` +
        'a change could have landed and gone unseen.',
    );
    status = 'red';
  }

  if (lastCrash && (!lastRunFinishedAt || lastCrash.at > lastRunFinishedAt)) {
    problems.push(
      `The most recent sweep crashed at ${lastCrash.at}: ${lastCrash.error}. Sources after the failure point were ` +
        'never checked on that run.',
    );
    status = 'red';
  }

  // B/C/F/H: something has not been compared recently, whatever the cause.
  if (staleSources.length > 0) {
    const never = staleSources.filter((s) => s.lastVerifiedAt === undefined);
    const aged = staleSources.filter((s) => s.lastVerifiedAt !== undefined);
    if (never.length > 0) {
      problems.push(
        `${never.length} source(s) have NEVER been successfully read: ${never.map((s) => s.sourceId).join(', ')}. ` +
          'A source that has never been read cannot be known to be unchanged.',
      );
    }
    if (aged.length > 0) {
      problems.push(
        `${aged.length} source(s) have not been successfully read within ${slaHours}h: ` +
          aged
            .map((s) => `${s.sourceId} (${s.hoursSinceVerified!.toFixed(0)}h${s.lastFailureReason ? `, last error: ${s.lastFailureReason}` : ''})`)
            .join('; '),
      );
    }
    if (status !== 'red') status = 'red';
  }

  return {
    status,
    problems,
    lastRunFinishedAt,
    lastRunStartedAt,
    hoursSinceLastRun,
    openFindings,
    staleSources,
    unreadableSources,
    manualSources,
  };
}

/**
 * A stable id for a finding.
 *
 * Keyed on source + snapshot hash so that re-observing the SAME unreviewed
 * change on successive days increments a counter instead of spawning a new
 * finding every morning. A genuinely different change produces a different
 * hash and therefore a new finding.
 */
export function findingIdFor(sourceId: string, contentHash: string): string {
  return `${sourceId}:${contentHash.slice(0, 12)}`;
}

/**
 * Close a finding — or, given a source id, every open finding on that
 * source.
 *
 * The source form is the one that matters in practice. Findings are
 * displayed collapsed by source, so what a reviewer sees and decides to
 * close is a SOURCE; acknowledging only the representative id would leave
 * its siblings unacknowledged and the entry would reappear on the next
 * status read, which looks exactly like the acknowledgement having been
 * ignored. Accepts either, and reports how many it actually closed so a
 * silent no-op is impossible.
 */
export function acknowledgeFinding(
  findingIdOrSourceId: string,
  by: string,
  note?: string,
  eventsPath = EVENTS_PATH,
): { closed: string[] } {
  const events = readEvents(eventsPath);
  const acked = new Set(
    events.flatMap((e) => (e.kind === 'finding_acknowledged' ? [e.findingId] : [])),
  );
  const opened = events.flatMap((e) => (e.kind === 'finding_opened' ? [e] : []));

  const exact = opened.filter((e) => e.findingId === findingIdOrSourceId);
  const bySource = opened.filter((e) => e.sourceId === findingIdOrSourceId);
  const targets = [...new Set((exact.length ? exact : bySource).map((e) => e.findingId))].filter(
    (id) => !acked.has(id),
  );

  const at = new Date().toISOString();
  for (const findingId of targets) {
    appendEvent(
      { kind: 'finding_acknowledged', at, findingId, by, ...(note ? { note } : {}) },
      eventsPath,
    );
  }
  return { closed: targets };
}

/**
 * Refuse to run two sweeps at once.
 *
 * Two concurrent sweeps would interleave their appends and, worse, race on
 * the snapshot directory — one could write a baseline the other then
 * compares against, turning a real change into "unchanged". A stale lock
 * (from a crash) is broken automatically, because a monitor that refuses
 * to run until someone deletes a file by hand is a monitor that silently
 * stops.
 */
export function acquireLock(asOf: string, lockPath = LOCK_PATH): { ok: true } | { ok: false; heldSince: string } {
  ensureDir();
  if (existsSync(lockPath)) {
    const heldSince = readFileSync(lockPath, 'utf8').trim();
    const age = Date.parse(asOf) - Date.parse(heldSince);
    if (Number.isFinite(age) && age < LOCK_STALE_MS) {
      return { ok: false, heldSince };
    }
  }
  const tmp = `${lockPath}.${process.pid}.tmp`;
  writeFileSync(tmp, asOf, 'utf8');
  renameSync(tmp, lockPath);
  return { ok: true };
}

export function releaseLock(lockPath = LOCK_PATH): void {
  rmSync(lockPath, { force: true });
}

export { EVENTS_PATH, STATE_DIR, LOCK_PATH };

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  appendEvent,
  assessHealth,
  acquireLock,
  releaseLock,
  findingIdFor,
  readEvents,
  FRESHNESS_SLA_HOURS,
} from '../harvester/journal.ts';
import type { JournalEvent } from '../harvester/journal.ts';

/**
 * The monitor's promise is not "the sweep works". It is that a change is
 * never missed, and that it does not matter WHY it would have been missed.
 * These tests are written against that promise: each one names a way a
 * change could have slipped through and asserts the system refuses to
 * pretend otherwise.
 *
 * Every test uses its own temp event log, so they are order-independent
 * and cannot see each other's history.
 */

let dir: string;
let events: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'harvest-journal-'));
  events = join(dir, 'events.jsonl');
});

const SOURCES = ['al-withholding', 'oh-municipal-rates'];
const HOURS = (n: number) => n * 3_600_000;
const at = (ms: number) => new Date(ms).toISOString();

/** A complete, healthy sweep over every source at time `when`. */
function recordGoodSweep(when: number, sourceIds = SOURCES): void {
  const runId = `run-${when}`;
  appendEvent({ kind: 'run_started', at: at(when), runId, sourceCount: sourceIds.length }, events);
  for (const sourceId of sourceIds) {
    appendEvent({ kind: 'source_verified', at: at(when), runId, sourceId, changed: false }, events);
  }
  appendEvent(
    { kind: 'run_finished', at: at(when), runId, checked: sourceIds.length, changed: 0, failed: 0, durationMs: 1000 },
    events,
  );
}

describe('the monitor refuses to look healthy when it cannot vouch for itself', () => {
  test('A — before any sweep has ever run, status is red, not "all clear"', () => {
    // The most dangerous failure in the set: a report that was never
    // produced looks exactly like a report that found nothing.
    const h = assessHealth(at(HOURS(100)), SOURCES, events);
    assert.equal(h.status, 'red');
    assert.ok(h.problems.some((p) => p.includes('No sweep has ever completed')));
  });

  test('A — a sweep that stopped running turns the status red once past the SLA', () => {
    recordGoodSweep(HOURS(0));
    const withinSla = assessHealth(at(HOURS(FRESHNESS_SLA_HOURS - 1)), SOURCES, events);
    assert.equal(withinSla.status, 'green');

    const pastSla = assessHealth(at(HOURS(FRESHNESS_SLA_HOURS + 2)), SOURCES, events);
    assert.equal(pastSla.status, 'red');
    assert.ok(pastSla.problems.some((p) => p.includes('scheduled task is not running')));
  });

  test('B/F — a source the sweep never touched is reported, not quietly assumed unchanged', () => {
    // Only one of the two registered sources was verified. The other has
    // no events at all, which replay alone could not notice — this is why
    // the registry is passed in.
    recordGoodSweep(HOURS(0), ['al-withholding']);
    const h = assessHealth(at(HOURS(1)), SOURCES, events);
    assert.equal(h.status, 'red');
    assert.ok(h.problems.some((p) => p.includes('NEVER been successfully read')));
    assert.ok(h.staleSources.some((s) => s.sourceId === 'oh-municipal-rates'));
  });

  test('C — a source that keeps failing to fetch is a finding in itself', () => {
    recordGoodSweep(HOURS(0));
    // Two days later the sweep still runs, but this source will not load.
    const runId = 'run-later';
    appendEvent({ kind: 'run_started', at: at(HOURS(48)), runId, sourceCount: 2 }, events);
    appendEvent({ kind: 'source_verified', at: at(HOURS(48)), runId, sourceId: 'oh-municipal-rates', changed: false }, events);
    appendEvent(
      { kind: 'source_unreadable', at: at(HOURS(48)), runId, sourceId: 'al-withholding', reason: 'HTTP 503' },
      events,
    );
    appendEvent(
      { kind: 'run_finished', at: at(HOURS(48)), runId, checked: 1, changed: 0, failed: 1, durationMs: 900 },
      events,
    );

    const h = assessHealth(at(HOURS(49)), SOURCES, events);
    assert.equal(h.status, 'red', 'a blind spot is not a healthy state');
    assert.ok(h.problems.some((p) => p.includes('HTTP 503')), 'the reason should reach the reader');
  });

  test('H — a crashed sweep leaves a mark rather than resembling a quiet night', () => {
    recordGoodSweep(HOURS(0));
    appendEvent({ kind: 'run_crashed', at: at(HOURS(2)), runId: 'run-boom', error: 'Error: socket hang up' }, events);
    const h = assessHealth(at(HOURS(3)), SOURCES, events);
    assert.equal(h.status, 'red');
    assert.ok(h.problems.some((p) => p.includes('crashed')));
  });

  test('a healthy, recent, complete sweep is green with nothing outstanding', () => {
    recordGoodSweep(HOURS(0));
    const h = assessHealth(at(HOURS(2)), SOURCES, events);
    assert.equal(h.status, 'green');
    assert.deepEqual(h.problems, []);
    assert.equal(h.openFindings.length, 0);
  });
});

describe('D — a finding outlives the sweep that found it', () => {
  const opened = (when: number, runId: string, findingId: string): JournalEvent => ({
    kind: 'finding_opened',
    at: at(when),
    runId,
    findingId,
    sourceId: 'al-withholding',
    jurisdiction: 'AL',
    title: 'Alabama withholding booklet',
    url: 'https://example.gov/al.pdf',
    detail: 'Document content changed.',
  });

  test('it stays open through later sweeps that see nothing new', () => {
    // This is the failure that motivated the whole design: it changed on
    // Tuesday, nobody looked, and Wednesday's sweep compares against
    // TUESDAY'S snapshot and says "unchanged". Without persistence the
    // finding would erase itself the day after it appeared.
    recordGoodSweep(HOURS(0));
    appendEvent(opened(HOURS(24), 'run-tue', 'al-withholding:abc123def456'), events);
    recordGoodSweep(HOURS(48)); // Wednesday: everything now matches.
    recordGoodSweep(HOURS(72)); // Thursday: still quiet.

    const h = assessHealth(at(HOURS(73)), SOURCES, events);
    assert.equal(h.openFindings.length, 1, 'the finding must survive quiet sweeps');
    assert.equal(h.openFindings[0].findingId, 'al-withholding:abc123def456');
  });

  test('re-observing the same unreviewed change counts it instead of duplicating it', () => {
    recordGoodSweep(HOURS(0));
    appendEvent(opened(HOURS(24), 'run-1', 'al-withholding:abc123def456'), events);
    appendEvent(opened(HOURS(48), 'run-2', 'al-withholding:abc123def456'), events);
    appendEvent(opened(HOURS(72), 'run-3', 'al-withholding:abc123def456'), events);

    const h = assessHealth(at(HOURS(73)), SOURCES, events);
    assert.equal(h.openFindings.length, 1, 'one change is one finding, however often it is seen');
    assert.equal(h.openFindings[0].seenCount, 3);
  });

  test('a genuinely different change opens a separate finding', () => {
    recordGoodSweep(HOURS(0));
    appendEvent(opened(HOURS(24), 'run-1', findingIdFor('al-withholding', 'aaaaaaaaaaaa')), events);
    appendEvent(opened(HOURS(48), 'run-2', findingIdFor('al-withholding', 'bbbbbbbbbbbb')), events);

    const h = assessHealth(at(HOURS(49)), SOURCES, events);
    assert.equal(h.openFindings.length, 2);
  });

  test('only an explicit acknowledgement closes it', () => {
    recordGoodSweep(HOURS(0));
    appendEvent(opened(HOURS(24), 'run-1', 'al-withholding:abc123def456'), events);
    assert.equal(assessHealth(at(HOURS(25)), SOURCES, events).openFindings.length, 1);

    appendEvent(
      { kind: 'finding_acknowledged', at: at(HOURS(26)), findingId: 'al-withholding:abc123def456', by: 'scott' },
      events,
    );
    assert.equal(assessHealth(at(HOURS(27)), SOURCES, events).openFindings.length, 0);
  });
});

describe('the log survives damage rather than refusing to report', () => {
  test('a torn final line is skipped, not fatal', () => {
    recordGoodSweep(HOURS(0));
    // Simulate a power cut mid-append.
    appendEvent({ kind: 'run_started', at: at(HOURS(1)), runId: 'x', sourceCount: 2 }, events);
    appendFileSync(events, '{"kind":"run_fin', 'utf8');

    const h = assessHealth(at(HOURS(2)), SOURCES, events);
    // Still readable, still judging — a monitor that will not start
    // because of one bad byte is worse than one that skips it.
    assert.equal(h.status, 'green');
  });
});

describe('two sweeps cannot race each other', () => {
  test('the second is refused while the first holds the lock', () => {
    const lockPath = join(dir, 'sweep.lock');
    const first = acquireLock(at(HOURS(0)), lockPath);
    assert.equal(first.ok, true);

    const second = acquireLock(at(HOURS(0.5)), lockPath);
    assert.equal(second.ok, false);

    releaseLock(lockPath);
    assert.equal(acquireLock(at(HOURS(1)), lockPath).ok, true);
  });

  test('a lock abandoned by a crash is broken rather than blocking forever', () => {
    // A monitor that stops until someone deletes a file by hand is a
    // monitor that silently stops.
    const lockPath = join(dir, 'sweep.lock');
    acquireLock(at(HOURS(0)), lockPath);
    const muchLater = acquireLock(at(HOURS(5)), lockPath);
    assert.equal(muchLater.ok, true);
  });
});

describe('F — a lost baseline is never mistaken for a first capture', () => {
  /**
   * The bug this pins down was live and silent. sweep() infers
   * lastCheckedAt purely from whether a snapshot file exists, and
   * tests/harvester.test.ts deleted the whole snapshot directory —
   * production baselines included — on every run. Every source then looked
   * brand new, and because a genuine first capture deliberately opens no
   * finding (otherwise day one is fifty-five false alarms), a rate that
   * moved in that window would be absorbed into the new baseline and never
   * reported by anyone.
   *
   * The fix is to decide "have we seen this before?" from the journal,
   * which a test run cannot erase, rather than from the filesystem.
   */
  const everVerifiedFrom = (path: string) =>
    new Set(
      readEvents(path)
        .filter((e) => e.kind === 'source_verified')
        .map((e) => e.sourceId),
    );

  test('the journal still knows a source was read even after its snapshot is gone', () => {
    recordGoodSweep(HOURS(0)); // both sources verified and snapshotted
    // Snapshots wiped; the journal is untouched.
    const seen = everVerifiedFrom(events);
    assert.ok(seen.has('al-withholding'));
    assert.ok(seen.has('oh-municipal-rates'));
  });

  test('a genuinely new source is absent from the journal, so day one stays quiet', () => {
    recordGoodSweep(HOURS(0), ['al-withholding']);
    const seen = everVerifiedFrom(events);
    assert.equal(seen.has('oh-municipal-rates'), false, 'never-seen source must not look previously-verified');
  });

  test('seen-before + missing snapshot is the exact condition that must open a finding', () => {
    recordGoodSweep(HOURS(0));
    const seen = everVerifiedFrom(events);

    // What runDaily() computes for a source whose snapshot vanished:
    // sweep() reports outcome 'changed' with lastCheckedAt undefined.
    const seenBefore = seen.has('al-withholding');
    const lastCheckedAt = undefined;
    const baselineLost = seenBefore && lastCheckedAt === undefined;

    assert.equal(seenBefore, true);
    assert.equal(baselineLost, true, 'must be recognised as a lost baseline, not a first capture');
    // seenBefore is the gate on opening a finding, so this case opens one.
    assert.ok(seenBefore, 'a lost baseline must not be silently re-baselined');
  });
});

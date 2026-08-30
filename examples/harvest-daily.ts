import { runDaily, describeStatus } from '../harvester/daily.ts';
import { loadSources } from '../harvester/run.ts';
import { assessHealth, acknowledgeFinding } from '../harvester/journal.ts';
import { describeDiff, diffSource } from '../harvester/diffview.ts';
import { auditUiSources, describeAudit } from '../harvester/audit-ui.ts';

/**
 * The three commands around the scheduled sweep.
 *
 *   npm run harvest:daily   — what the 8am task runs
 *   npm run harvest:status  — the morning answer; reads state, fetches nothing
 *   npm run harvest:ack     — close a finding you have actually dealt with
 */

const mode = process.argv[2] ?? 'daily';

if (mode === 'status') {
  console.log(describeStatus());
  // Exit 1 when the monitor cannot vouch for itself, so a wrapper script
  // or another agent can branch on it without parsing prose.
  const health = assessHealth(
    new Date().toISOString(),
    loadSources().map((s) => s.id),
  );
  process.exit(health.status === 'red' ? 1 : 0);
}

if (mode === 'audit') {
  console.log(describeAudit(auditUiSources()));
  process.exit(0);
}

if (mode === 'diff') {
  const sourceId = process.argv[3];
  if (!sourceId) {
    console.error('Usage: npm run harvest:diff -- <sourceId>');
    process.exit(2);
  }
  console.log(describeDiff(diffSource(sourceId)));
  process.exit(0);
}

if (mode === 'ack') {
  const findingId = process.argv[3];
  const by = process.argv[4] ?? 'unattributed';
  const note = process.argv[5];
  if (!findingId) {
    console.error('Usage: npm run harvest:ack -- <findingId> "<who>" ["note"]');
    process.exit(2);
  }
  const { closed } = acknowledgeFinding(findingId, by, note);
  if (closed.length === 0) {
    console.log(`Nothing open matched "${findingId}" — already acknowledged, or not a known finding/source id.`);
    process.exit(1);
  }
  console.log(
    `Acknowledged ${closed.length} finding(s) for "${findingId}" (by ${by}). They will no longer appear in status.`,
  );
  process.exit(0);
}

const result = await runDaily();
console.log(`[${result.runId}] ${result.message}`);

// Print the full status after every scheduled run, so the task's own
// transcript is a complete record rather than a bare count.
console.log(describeStatus());

// Non-zero on a crash so the scheduler's "last run result" is truthful.
process.exit(result.ok ? 0 : 1);

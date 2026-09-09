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
  // Exit 1 when the monitor cannot vouch for itself, so a wrapper script
  // or another agent can branch on it without parsing prose.
  //
  // manualOnlyIds MUST be passed here — found live, not hypothesized: a
  // real run (2026-09-01) produced a tracking issue titled "status red,
  // sources unverified" whose OWN body then printed "HEALTHY — every
  // source verified recently" two lines later. Cause: this call omitted
  // the 5th assessHealth() argument (manualOnlyIds), which describeStatus()
  // below passes correctly, so the six sources already known to be
  // permanently unfetchable (ssa-wage-base, ks-ui-rates, ma-ui-rates,
  // ma-withholding, nh-withholding, nv-ui-rates — see sources.json's own
  // manualOnlyReason on each) counted as stale here but not there. Both
  // this JSON status AND the exit code below were reading the wrong
  // health value — permanently red, forever, for a condition the project
  // already decided should never drag the whole monitor down. That is
  // the exact "don't cry wolf" failure this file's own comment warns
  // about, just one level up: the monitor about the monitor.
  const sources = loadSources();
  const health = assessHealth(
    new Date().toISOString(),
    sources.map((s) => s.id),
    undefined,
    undefined,
    sources.filter((s) => s.manualOnly).map((s) => s.id),
  );
  // `status --json` — for CI/automation to read health.status and
  // openFindings structurally, instead of regexing the prose report below.
  if (process.argv[3] === '--json') {
    console.log(JSON.stringify(health));
  } else {
    console.log(describeStatus());
  }
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

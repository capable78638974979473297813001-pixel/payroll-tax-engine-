import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { scanRepo } from './collect.ts';
import { probeAll, type Signal } from './probe.ts';
import { classify, fold, loadBaseline, saveBaseline, type Baseline, type Verdict } from './baseline.ts';

/**
 * The harvester entrypoint.
 *
 *   node harvester/audit.ts                # scan repo + probe every cited source
 *   node harvester/audit.ts --no-network   # repo scan only (deterministic, offline)
 *   node harvester/audit.ts --strict       # exit 1 if any source CHANGED (for gating)
 *
 * It scans the committed data tree, probes every official source URL the data
 * cites, and diffs each against harvester/baseline.json to flag CHANGED /
 * NEW / UNREACHABLE. It writes harvester/report.md and, in GitHub Actions,
 * the job summary. By design it exits 0 even when sources are unreachable or
 * have changed — those are findings to review, not job failures. Only
 * --strict turns a detected change into a non-zero exit.
 */

const ARGS = new Set(process.argv.slice(2));
const NO_NETWORK = ARGS.has('--no-network');
const STRICT = ARGS.has('--strict');
const ROOT = process.cwd();
const DATA_DIR = process.env.HARVEST_DATA_DIR ?? join(ROOT, 'data');
const BASELINE_PATH = process.env.HARVEST_BASELINE ?? join(ROOT, 'harvester', 'baseline.json');
const REPORT_PATH = process.env.HARVEST_REPORT ?? join(ROOT, 'harvester', 'report.md');
const STALE_DAYS = Number(process.env.HARVEST_STALE_DAYS ?? 400);

const ICON: Record<Verdict, string> = { new: '🆕', unchanged: '✅', changed: '⚠️', unreachable: '🔌' };
const clip = (s: string | undefined, n = 90): string => (s && s.length > n ? s.slice(0, n - 1) + '…' : s ?? '');

function daysSince(iso?: string): number | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? undefined : Math.floor((Date.now() - t) / 86400000);
}

interface Row { verdict: Verdict; url: string; signal: Signal; citedBy: string[]; title?: string; }

function buildReport(rows: Row[], filesScanned: number, parseErrors: string[], stale: string[]): string {
  const n = (v: Verdict) => rows.filter((r) => r.verdict === v).length;
  const changed = rows.filter((r) => r.verdict === 'changed');
  const unreachable = rows.filter((r) => r.verdict === 'unreachable');
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const L: string[] = [];
  L.push('# 🌾 Omnia data harvester', '', `_Run ${now} UTC · ${filesScanned} data files · ${rows.length} cited sources_`, '');
  L.push('| | count |', '|---|--:|',
    `| ⚠️ changed | ${n('changed')} |`,
    `| 🆕 new | ${n('new')} |`,
    `| ✅ unchanged | ${n('unchanged')} |`,
    `| 🔌 unreachable | ${n('unreachable')} |`,
    `| 📄 JSON parse errors | ${parseErrors.length} |`,
    `| 🕰️ stale (>${STALE_DAYS}d) | ${stale.length} |`, '');

  if (changed.length) {
    L.push('## ⚠️ Sources that CHANGED since last run', '', 'A change here means the official page/PDF differs from what we last saw — review whether our data needs updating.', '');
    for (const r of changed) {
      L.push(`- **${clip(r.title) || r.url}**`, `  - ${r.url}`, `  - cited by: ${r.citedBy.join(', ')}`);
    }
    L.push('');
  }
  if (parseErrors.length) {
    L.push('## 📄 JSON parse errors (fix these — the data file is broken)', '', ...parseErrors.map((p) => `- ${p}`), '');
  }
  if (unreachable.length) {
    L.push('<details><summary>🔌 Unreachable this run (not a failure — retried next run)</summary>', '');
    for (const r of unreachable) L.push(`- ${clip(r.title) || r.url} — ${r.signal.error ?? 'unreachable'}`);
    L.push('', '</details>', '');
  }
  if (stale.length) {
    L.push('<details><summary>🕰️ Data files whose freshness marker is older than ' + STALE_DAYS + ' days</summary>', '', ...stale.map((s) => `- ${s}`), '', '</details>', '');
  }
  L.push('---', '_The harvester never fails on unreachable sources or detected changes; both are findings above. It only reports._');
  return L.join('\n');
}

async function main(): Promise<void> {
  const scan = scanRepo(DATA_DIR);
  const parseErrors = scan.files.filter((f) => !f.ok).map((f) => `${f.path}: ${f.parseError}`);
  const stale = scan.files
    .filter((f) => f.ok && f.asOf && (daysSince(f.asOf) ?? 0) > STALE_DAYS)
    .map((f) => `${f.path} (asOf ${f.asOf}, ${daysSince(f.asOf)}d ago)`);

  const urls = scan.sources.map((s) => s.url);
  const signals: Signal[] = NO_NETWORK
    ? urls.map((url) => ({ url, ok: false, error: 'network skipped (--no-network)' }))
    : await probeAll(urls, { concurrency: 10, timeoutMs: 15000, retries: 1 });

  const baseline: Baseline = loadBaseline(BASELINE_PATH);
  const now = new Date().toISOString();
  const rows: Row[] = [];
  for (let i = 0; i < scan.sources.length; i++) {
    const src = scan.sources[i];
    const sig = signals[i];
    const verdict = NO_NETWORK ? 'unreachable' : classify(baseline[src.url], sig);
    rows.push({ verdict, url: src.url, signal: sig, citedBy: src.citedBy, title: src.title });
    // Only evolve the baseline on a real network run, so --no-network never rewrites it.
    if (!NO_NETWORK) baseline[src.url] = fold(baseline[src.url], sig, now, verdict);
  }

  const report = buildReport(rows, scan.files.length, parseErrors, stale);
  writeFileSync(REPORT_PATH, report + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) {
    try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n'); } catch { /* summary is best-effort */ }
  }
  if (!NO_NETWORK) saveBaseline(BASELINE_PATH, baseline);

  const count = (v: Verdict) => rows.filter((r) => r.verdict === v).length;
  console.log(`\n🌾 Harvester: ${scan.files.length} files, ${rows.length} sources — ⚠️ ${count('changed')} changed · 🆕 ${count('new')} new · ✅ ${count('unchanged')} unchanged · 🔌 ${count('unreachable')} unreachable · 📄 ${parseErrors.length} parse errors · 🕰️ ${stale.length} stale`);
  console.log(`   report → ${REPORT_PATH}`);

  if (STRICT && count('changed') > 0) {
    console.error('   --strict: sources changed; exiting non-zero.');
    process.exitCode = 1;
  }
}

main().catch((e) => {
  // Even an unexpected internal error is reported without killing the workflow,
  // unless --strict is set. "No fail" is the contract.
  console.error('harvester: unexpected error:', (e as Error)?.message ?? e);
  if (STRICT) process.exitCode = 1;
});

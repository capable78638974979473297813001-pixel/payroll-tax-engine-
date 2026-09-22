import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadSources, sweep } from '../harvester/run.ts';

const STATUS_PATH = join(import.meta.dirname, '..', 'harvester', 'us-tax-harvest-status.json');

function ensureParentDir() {
  mkdirSync(join(import.meta.dirname, '..', 'harvester'), { recursive: true });
}

function readPrevious(): Record<string, unknown> {
  if (!existsSync(STATUS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(STATUS_PATH, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeStatus(payload: Record<string, unknown>) {
  ensureParentDir();
  writeFileSync(STATUS_PATH, JSON.stringify(payload, null, 2));
}

async function main() {
  const sources = loadSources().filter(
    (source) => (source.level === 'state' || source.level === 'local') && !source.manualOnly,
  );

  const asOf = new Date().toISOString();
  const report = await sweep(asOf, { force: true, sources });

  const changed = report.entries.filter((entry) => entry.outcome === 'changed');
  const unreadable = report.entries.filter((entry) => entry.outcome === 'fetch_failed');

  const payload = {
    checked: sources.length,
    changedCount: changed.length,
    unreadableCount: unreadable.length,
    reportedAt: asOf,
    previousRun: readPrevious(),
    changes: changed.map((entry) => ({
      sourceId: entry.sourceId,
      jurisdiction: entry.jurisdiction,
      title: entry.title,
      url: entry.url,
      snapshotPath: entry.snapshotPath ?? null,
      reason: entry.reason ?? null,
      forcedBy: entry.forcedBy ?? null,
    })),
    unreadable: unreadable.map((entry) => ({
      sourceId: entry.sourceId,
      jurisdiction: entry.jurisdiction,
      title: entry.title,
      url: entry.url,
      reason: entry.reason ?? null,
    })),
  };

  writeStatus(payload);
  console.log(JSON.stringify(payload, null, 2));
}

await main();

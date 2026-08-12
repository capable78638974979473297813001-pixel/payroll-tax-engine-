import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ChangeSet, RateRecord } from './diff.ts';
import { diffRegister, looksLikeParserFailure, summarise } from './diff.ts';
import { hasChanged, writeSnapshot } from './snapshot.ts';

const REVIEW_ROOT = join(import.meta.dirname, 'review', 'pending');

export interface SourceDef {
  id: string;
  title: string;
  url: string;
  jurisdiction: string;
  keyField?: string;
}

export type Decision =
  /** Byte-identical to the last capture. Nothing to do. */
  | 'unchanged'
  /** Real changes found; queued for a human. Nothing published. */
  | 'needs_review'
  /** Change volume implies the parser broke, not that the world changed. */
  | 'blocked_suspect_parser';

export interface HarvestResult {
  sourceId: string;
  decision: Decision;
  changeSet: ChangeSet | null;
  reviewPath: string | null;
  message: string;
}

/**
 * Harvest one source.
 *
 * Nothing here writes to `data/`. That separation is the whole point: the
 * harvester's job ends at "a human needs to look at this". Rates only reach
 * the engine through an explicit, recorded approval, so a bad parse or a
 * defaced source page cannot move money on its own.
 */
export function harvestSource(
  source: SourceDef,
  rawContent: string,
  parse: (raw: string) => RateRecord[],
  currentRecords: readonly RateRecord[],
  asOf = new Date().toISOString(),
): HarvestResult {
  if (!hasChanged(source.id, rawContent)) {
    return {
      sourceId: source.id,
      decision: 'unchanged',
      changeSet: null,
      reviewPath: null,
      message: `${source.id}: unchanged since last capture`,
    };
  }

  const snapshot = writeSnapshot(source.id, rawContent, asOf);
  const parsed = parse(rawContent);
  const changeSet = diffRegister(source.id, currentRecords, parsed, asOf);

  if (
    looksLikeParserFailure(changeSet, parsed.length, {
      baselineCount: currentRecords.length,
    })
  ) {
    const path = writeReview(source, changeSet, snapshot.sha256, 'blocked_suspect_parser');
    return {
      sourceId: source.id,
      decision: 'blocked_suspect_parser',
      changeSet,
      reviewPath: path,
      message:
        `${source.id}: BLOCKED — ${changeSet.changed.length + changeSet.added.length + changeSet.removed.length} ` +
        `of ${parsed.length} records moved. That is a reformatted source or a broken parser, not a tax change. ` +
        `Publishing this would be worse than being stale.`,
    };
  }

  if (!changeSet.hasChanges) {
    // The bytes moved but no rate did — a footer date, a session token.
    return {
      sourceId: source.id,
      decision: 'unchanged',
      changeSet,
      reviewPath: null,
      message: `${source.id}: source bytes changed but no rates moved (${changeSet.unchangedCount} records)`,
    };
  }

  const path = writeReview(source, changeSet, snapshot.sha256, 'needs_review');
  return {
    sourceId: source.id,
    decision: 'needs_review',
    changeSet,
    reviewPath: path,
    message: summarise(changeSet),
  };
}

function writeReview(
  source: SourceDef,
  changeSet: ChangeSet,
  sha256: string,
  decision: Decision,
): string {
  mkdirSync(REVIEW_ROOT, { recursive: true });
  const stamp = changeSet.detectedAt.replace(/[:.]/g, '-');
  const path = join(REVIEW_ROOT, `${source.id}.${stamp}.json`);

  writeFileSync(
    path,
    JSON.stringify(
      {
        source,
        decision,
        detectedAt: changeSet.detectedAt,
        sourceSha256: sha256,
        approved: false,
        approvedBy: null,
        approvedAt: null,
        changes: {
          changed: changeSet.changed,
          added: changeSet.added,
          removed: changeSet.removed,
          unchangedCount: changeSet.unchangedCount,
        },
      },
      null,
      2,
    ),
  );
  return path;
}

/** Rate changes already in force — the ones that imply corrections, not just edits. */
export function retroactiveChanges(cs: ChangeSet) {
  return cs.changed.filter((c) => c.severity === 'retroactive');
}

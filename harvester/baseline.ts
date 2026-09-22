import { readFileSync, writeFileSync } from 'node:fs';
import type { Signal } from './probe.ts';

/**
 * The rolling baseline: what each source looked like the last time the
 * harvester saw it. Committed to the repo as harvester/baseline.json so a
 * change shows up both in the run's report AND as a reviewable git diff.
 */

export interface BaselineEntry {
  hash?: string | null;
  etag?: string;
  lastModified?: string;
  status?: number;
  firstSeen: string;
  lastSeen: string;
  lastChanged: string;
}

export type Baseline = Record<string, BaselineEntry>;

export type Verdict = 'new' | 'unchanged' | 'changed' | 'unreachable';

export function loadBaseline(path: string): Baseline {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return (parsed && typeof parsed === 'object' && parsed.sources) ? parsed.sources : {};
  } catch {
    return {};
  }
}

export function saveBaseline(path: string, sources: Baseline): void {
  const ordered: Baseline = {};
  for (const k of Object.keys(sources).sort()) ordered[k] = sources[k];
  writeFileSync(path, JSON.stringify({ $comment: 'Rolling source-freshness baseline written by the harvester. Do not hand-edit.', updatedAt: new Date().toISOString(), sources: ordered }, null, 2) + '\n');
}

/**
 * Compare a fresh probe against the baseline entry. A source that could not be
 * reached is 'unreachable' (a report note, never a change), so a flaky source
 * never masquerades as a real content change.
 */
/** Did we ever capture real content for this source (a hash or a validator)? */
const hasContent = (e: { hash?: string | null; etag?: string; lastModified?: string } | undefined): boolean =>
  !!e && (e.hash != null || !!e.etag || !!e.lastModified);

export function classify(prev: BaselineEntry | undefined, cur: Signal): Verdict {
  if (!cur.ok) return 'unreachable';
  if (!prev) return 'new';
  // First successful capture after the source was previously blocked/unreachable
  // (we had a status but never real content) is NEW, not a content change.
  if (!hasContent(prev) && hasContent(cur)) return 'new';
  // The normalized visible-text hash is the source of truth. ETag and
  // Last-Modified are consulted ONLY when a hash isn't available on both sides,
  // because many servers (pa.gov, county sites, CDN fronts) send rotating or
  // weak validators that change every request even when the page content is
  // identical — trusting them over the hash flags dozens of false changes.
  if (cur.hash != null && prev.hash != null) return cur.hash === prev.hash ? 'unchanged' : 'changed';
  if (cur.etag && prev.etag) return cur.etag === prev.etag ? 'unchanged' : 'changed';
  if (cur.lastModified && prev.lastModified) return cur.lastModified === prev.lastModified ? 'unchanged' : 'changed';
  // One side has only a validator and the other only a hash — not comparable;
  // treat as unchanged rather than inventing a change.
  return 'unchanged';
}

/**
 * Fold a probe result into a (possibly new) baseline entry. An unreachable
 * probe only updates lastSeen-nothing — it leaves the last known-good signal
 * intact so the next reachable run compares against real content.
 */
export function fold(prev: BaselineEntry | undefined, cur: Signal, now: string, verdict: Verdict): BaselineEntry {
  if (verdict === 'unreachable') {
    return prev ?? { status: cur.status, firstSeen: now, lastSeen: now, lastChanged: now };
  }
  return {
    hash: cur.hash ?? prev?.hash,
    etag: cur.etag ?? prev?.etag,
    lastModified: cur.lastModified ?? prev?.lastModified,
    status: cur.status ?? prev?.status,
    firstSeen: prev?.firstSeen ?? now,
    lastSeen: now,
    lastChanged: verdict === 'changed' || verdict === 'new' ? now : (prev?.lastChanged ?? now),
  };
}

/**
 * Change detection over a rate register.
 *
 * A byte-level hash tells you *that* something moved; this tells you *what*,
 * which is what a human actually needs in order to approve or reject it.
 */

export interface RateRecord {
  /** Stable jurisdiction key — PSD code, Ohio municipality code, etc. */
  key: string;
  name: string;
  rate: number;
  /** ISO date the rate takes effect, when the register publishes one. */
  effectiveFrom?: string;
}

export interface RateChange {
  key: string;
  name: string;
  before: number;
  after: number;
  effectiveFrom?: string;
  /**
   * `retroactive` is the dangerous case: the register is telling us about a
   * rate that was already in force. Every cheque issued since that date was
   * computed on a stale rate and may need a correction run.
   */
  severity: 'retroactive' | 'imminent' | 'scheduled';
}

export interface ChangeSet {
  sourceId: string;
  detectedAt: string;
  added: RateRecord[];
  removed: RateRecord[];
  changed: RateChange[];
  unchangedCount: number;
  get hasChanges(): boolean;
}

const DAY = 86_400_000;

export function classify(
  effectiveFrom: string | undefined,
  asOf: string,
): RateChange['severity'] {
  if (!effectiveFrom) return 'imminent'; // no date published — treat as urgent
  const eff = Date.parse(effectiveFrom);
  const now = Date.parse(asOf);
  if (eff <= now) return 'retroactive';
  if (eff - now <= 30 * DAY) return 'imminent';
  return 'scheduled';
}

export function diffRegister(
  sourceId: string,
  before: readonly RateRecord[],
  after: readonly RateRecord[],
  asOf = new Date().toISOString(),
): ChangeSet {
  const prev = new Map(before.map((r) => [r.key, r]));
  const next = new Map(after.map((r) => [r.key, r]));

  const added: RateRecord[] = [];
  const removed: RateRecord[] = [];
  const changed: RateChange[] = [];
  let unchangedCount = 0;

  for (const [key, rec] of next) {
    const old = prev.get(key);
    if (!old) {
      added.push(rec);
    } else if (old.rate !== rec.rate) {
      changed.push({
        key,
        name: rec.name,
        before: old.rate,
        after: rec.rate,
        effectiveFrom: rec.effectiveFrom,
        severity: classify(rec.effectiveFrom, asOf),
      });
    } else {
      unchangedCount++;
    }
  }

  for (const [key, rec] of prev) {
    if (!next.has(key)) removed.push(rec);
  }

  return {
    sourceId,
    detectedAt: asOf,
    added,
    removed,
    changed,
    unchangedCount,
    get hasChanges() {
      return (
        this.added.length > 0 ||
        this.removed.length > 0 ||
        this.changed.length > 0
      );
    },
  };
}

/**
 * Guard against a parser that has quietly broken.
 *
 * If a register reformats and the parser starts producing garbage, the diff
 * will look like a mass change. Publishing that automatically would be worse
 * than being stale, so a run that moves too much of the register is held for
 * a human regardless of what the individual rows say.
 */
export interface GuardOptions {
  /** Proportion of the register that may move before we get suspicious. */
  threshold?: number;
  /**
   * Minimum absolute number of moved records. Without this, a five-row
   * register trips the guard on a single legitimate rate change, because one
   * row is 20% of it. Proportion alone is the wrong test on small registers.
   */
  minAbsolute?: number;
  /**
   * Size of the baseline we are diffing against. Zero means this is the first
   * time we have ever parsed the source, so "everything is new" is expected
   * rather than suspicious.
   */
  baselineCount?: number;
}

export function looksLikeParserFailure(
  cs: ChangeSet,
  totalRecords: number,
  opts: GuardOptions = {},
): boolean {
  const { threshold = 0.1, minAbsolute = 5, baselineCount } = opts;

  // Bootstrapping: no baseline to be suspicious about. Only an empty parse
  // is alarming here.
  if (baselineCount === 0) return totalRecords === 0;

  // The register came back empty. Either the source is down or the parser
  // matched nothing — never a real "all jurisdictions abolished tax" event.
  if (totalRecords === 0) return true;

  const touched = cs.added.length + cs.removed.length + cs.changed.length;
  return touched >= minAbsolute && touched / totalRecords > threshold;
}

export function summarise(cs: ChangeSet): string {
  if (!cs.hasChanges) return `${cs.sourceId}: no changes (${cs.unchangedCount} records)`;

  const lines = [`${cs.sourceId}: ${cs.changed.length} rate changes, ${cs.added.length} added, ${cs.removed.length} removed`];

  const bySeverity = (s: RateChange['severity']) =>
    cs.changed.filter((c) => c.severity === s);

  for (const sev of ['retroactive', 'imminent', 'scheduled'] as const) {
    const items = bySeverity(sev);
    if (!items.length) continue;
    lines.push(`  ${sev.toUpperCase()} (${items.length}):`);
    for (const c of items.slice(0, 10)) {
      const pct = (r: number) => `${(r * 100).toFixed(3)}%`;
      lines.push(
        `    ${c.name} [${c.key}]  ${pct(c.before)} → ${pct(c.after)}` +
          (c.effectiveFrom ? `  eff ${c.effectiveFrom}` : '  eff UNKNOWN'),
      );
    }
    if (items.length > 10) lines.push(`    …and ${items.length - 10} more`);
  }

  return lines.join('\n');
}

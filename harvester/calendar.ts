import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * When tax data is actually likely to be wrong.
 *
 * Polling sixty sources every day is mostly waste: the overwhelming
 * majority of withholding changes are calendar-driven and known in advance.
 * New tables land on 1 January nearly everywhere. Social Security's wage
 * base is announced with the COLA in mid-October. And mid-year changes,
 * when they happen, are typically legislated months ahead with a stated
 * effective date — this project's own data already carries several
 * (Georgia's 2026-05-11 rate cut, Utah's 2026-06-01 table).
 *
 * So the calendar answers a cheaper question than "has anything changed?":
 * *when is something scheduled to change, and what does it touch?* That
 * covers the predictable majority for almost nothing. It deliberately does
 * NOT replace the snapshot/diff sweep — a village council raising a rate in
 * March with no notice is invisible to a calendar, which is exactly the
 * scenario harvest-demo.ts models. The two are complements: this one knows
 * where to look and when, the other catches what nobody announced.
 */

const DATA_ROOT = join(import.meta.dirname, '..', 'data');

export type WindowKind =
  /** Every jurisdiction republishes for the new tax year. */
  | 'annual_new_year'
  /** SSA announces next year's wage base with the COLA; states follow. */
  | 'annual_wage_base'
  /** A specific, already-published date a specific file says something changes. */
  | 'scheduled_effective_date';

export interface CalendarWindow {
  kind: WindowKind;
  /** ISO yyyy-mm-dd the change takes effect. */
  effectiveOn: string;
  /** When to START checking — changes are published before they take effect. */
  checkFrom: string;
  /** When to stop treating it as urgent, once it's safely verified. */
  checkUntil: string;
  /** Which files this touches, so a run knows what to re-read. */
  affects: string[];
  why: string;
}

/**
 * The two fixed anchors every year, independent of any file's contents.
 *
 * 1 January: essentially every state republishes withholding tables,
 * brackets, and standard deductions. Checking starts in mid-November
 * because that is when the documents actually appear — waiting until
 * 1 January means running the first week of the year on last year's rates.
 *
 * 1 October: the SSA announces the next year's OASDI wage base alongside
 * the COLA (mid-October in practice), and it cascades into every state's
 * own wage-base-linked figures. Kentucky's local occupational taxes cap at
 * the federal SS wage base, so this is not federal-only.
 */
export function annualAnchors(year: number): CalendarWindow[] {
  return [
    {
      kind: 'annual_new_year',
      effectiveOn: `${year}-01-01`,
      // Documents appear well before they take effect. Start looking in
      // mid-November of the PRIOR year.
      checkFrom: `${year - 1}-11-15`,
      checkUntil: `${year}-02-15`,
      affects: ['data/federal/{year}.json', 'data/states/*.json', 'data/local/*.json'],
      why:
        'New tax year. Nearly every jurisdiction republishes withholding tables, brackets and ' +
        'standard deductions effective 1 January. This is the single highest-yield check of the year.',
    },
    {
      kind: 'annual_wage_base',
      effectiveOn: `${year + 1}-01-01`,
      checkFrom: `${year}-10-01`,
      checkUntil: `${year}-12-31`,
      affects: [
        'data/federal/{year}.json#socialSecurity.wageBase',
        'data/federal/{year}.json#futa',
        'data/states/*.json#suiEmployer.wageBase',
      ],
      why:
        "SSA announces next year's OASDI contribution and benefit base with the October COLA, and " +
        'state unemployment wage bases are set in the same autumn window. Also when DOL finalises the ' +
        'FUTA credit-reduction state list.',
    },
  ];
}

/**
 * Keys whose value is genuinely a FORWARD-LOOKING effective date.
 *
 * Deliberately a closed list rather than "any key matching /date/i", and
 * measured against the actual data rather than assumed. Two distinct traps
 * this list is shaped around, both confirmed by counting real occurrences:
 *
 *  - Research provenance. `verifiedOn` / `fetchedOn` / `asOf` record when a
 *    human last read a source. There are hundreds of them and none is a
 *    scheduled change.
 *  - Historical provenance. `effectiveFrom` looks like an effective date
 *    and is not one *in this codebase*: 826 of its 827 occurrences are past
 *    dates recording when a municipality's CURRENT rate began (many from
 *    the early 2000s), and the 827th is a `9999-12-31` never-expires
 *    sentinel. Including it flooded the calendar with thousands of dead
 *    windows on the first run, which is how this was caught.
 *
 * What survives yields exactly the real scheduled changes and nothing else:
 * Georgia 2026-05-11, Utah 2026-06-01, Ohio's 2026-08-01 threshold.
 */
const EFFECTIVE_DATE_KEYS = new Set([
  'effectiveDateOfNewTable',
  'effectiveDate',
  'thresholdDate',
]);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Placeholder dates meaning "no end" rather than a real calendar event.
 * A window opened around the year 9999 would never close.
 */
function isSentinelDate(date: string): boolean {
  return date.startsWith('9999') || date.startsWith('0000');
}

/**
 * Walk a parsed data file and collect every genuine effective date, with
 * the path that carried it so a reviewer can find it again.
 */
export function extractEffectiveDates(
  value: unknown,
  path = '',
  found: { path: string; date: string }[] = [],
): { path: string; date: string }[] {
  if (Array.isArray(value)) {
    value.forEach((v, i) => extractEffectiveDates(v, `${path}[${i}]`, found));
    return found;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const child = path ? `${path}.${k}` : k;
      if (
        EFFECTIVE_DATE_KEYS.has(k) &&
        typeof v === 'string' &&
        ISO_DATE.test(v) &&
        !isSentinelDate(v)
      ) {
        found.push({ path: child, date: v });
      }
      extractEffectiveDates(v, child, found);
    }
  }
  return found;
}

function dataFiles(): string[] {
  const out: string[] = [];
  for (const sub of ['federal', 'states', 'local']) {
    const dir = join(DATA_ROOT, sub);
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const f of entries) {
      if (f.endsWith('.json')) out.push(join(sub, f));
    }
  }
  return out;
}

/**
 * Every scheduled change this repo's own data already knows about.
 *
 * A date in the PAST is still worth surfacing during its window: it means
 * a rule took effect and the file that predicted it should be confirmed as
 * having actually been updated, not assumed.
 */
export function scheduledEffectiveDates(): CalendarWindow[] {
  const windows: CalendarWindow[] = [];
  for (const rel of dataFiles()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(DATA_ROOT, rel), 'utf8'));
    } catch {
      continue; // A malformed data file is the test suite's problem, not the calendar's.
    }
    for (const { path, date } of extractEffectiveDates(parsed)) {
      windows.push({
        kind: 'scheduled_effective_date',
        effectiveOn: date,
        checkFrom: shiftDays(date, -30),
        checkUntil: shiftDays(date, 30),
        affects: [`data/${rel.replace(/\\/g, '/')}#${path}`],
        why:
          `data/${rel.replace(/\\/g, '/')} declares a rule change effective ${date} at ${path}. ` +
          'Confirm the published source actually matches on and after that date.',
      });
    }
  }
  return windows.sort((a, b) => a.effectiveOn.localeCompare(b.effectiveOn));
}

export function shiftDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Everything worth checking on a given day.
 *
 * Takes the date as an argument rather than reading the clock so a run is
 * reproducible and testable — the same discipline the engine itself applies
 * to checkDate.
 */
export function windowsDueOn(asOf: string): CalendarWindow[] {
  const year = Number(asOf.slice(0, 4));
  const candidates = [
    // The new-year window straddles a year boundary, so both this year's
    // and next year's are candidates on any given day.
    ...annualAnchors(year),
    ...annualAnchors(year + 1),
    ...scheduledEffectiveDates(),
  ];
  const due = candidates.filter((w) => asOf >= w.checkFrom && asOf <= w.checkUntil);
  // Two calls to annualAnchors can produce the same window twice.
  const seen = new Set<string>();
  return due.filter((w) => {
    const k = `${w.kind}|${w.effectiveOn}|${w.affects.join(',')}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function describeWindows(windows: readonly CalendarWindow[], asOf: string): string {
  if (windows.length === 0) {
    return `No scheduled tax-change windows are open on ${asOf}. The snapshot sweep is the only thing worth running today.`;
  }
  const lines = [`${windows.length} window(s) open on ${asOf}:`];
  for (const w of windows) {
    const when =
      w.effectiveOn < asOf
        ? `took effect ${w.effectiveOn}`
        : w.effectiveOn === asOf
          ? `TAKES EFFECT TODAY (${w.effectiveOn})`
          : `effective ${w.effectiveOn}`;
    lines.push(`  [${w.kind}] ${when}`);
    lines.push(`      ${w.why}`);
    for (const a of w.affects) lines.push(`      affects: ${a}`);
  }
  return lines.join('\n');
}

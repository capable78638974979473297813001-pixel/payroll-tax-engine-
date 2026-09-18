import { dollars, type Cents } from '../src/money.ts';
import type { ConstructionType, WageDetermination, WageDeterminationRate } from './types.ts';

/**
 * The IMPORT boundary for wage determinations — validate a determination that
 * arrived from outside and convert it into the WageDetermination the trades
 * layer runs on (integer cents, effective-dated, stable classification codes).
 *
 * WHERE THE DATA COMES FROM (and doesn't): the federal Davis-Bacon
 * determinations live at SAM.gov and the state schedules on each state's own
 * site, in a mix of formats (SAM's own JSON/XML, PDFs, spreadsheets). This
 * project does NOT ship a fetcher or a parser for any one of those formats —
 * that adapter is caller-supplied, the same disclosed-not-built boundary the
 * rest of the layer draws around the determination dataset. What this module
 * OWNS is the step after the adapter: a single, well-defined intermediate
 * shape (DeterminationExport, in dollars and human titles) that an adapter
 * targets, and the validation + conversion that turns it into a trusted
 * WageDetermination. Splitting it this way means a new source format is a new
 * small adapter, never a change to the pricing engine.
 *
 * VALIDATION IS THE POINT. A determination priced from a malformed row is
 * worse than one that fails to import — a wrong rate underpays workers
 * silently. So every row is checked (finite non-negative rates, a real ISO
 * date, a non-empty classification) and a bad one RAISES with the row named,
 * rather than being dropped or defaulted, the same discipline the tax engine's
 * own money.ts uses when a numeric field can't be parsed.
 */

/** One rate line as an external source expresses it — dollars, a human title, an effective date. */
export interface DeterminationExportRow {
  /** The classification's printed title, e.g. "Plumber" or "Plumber, Apprentice (1st period)". */
  classification: string;
  /**
   * A stable code for the classification. STRONGLY preferred — supply the same
   * code your WorkedHours and worker profiles use. When absent, a code is
   * derived from the title (see slugifyClassification), which is convenient
   * for a one-off import but brittle if the title's punctuation ever changes.
   */
  classificationCode?: string;
  /** Basic hourly rate in dollars. */
  baseHourlyRate: number;
  /** Fringe obligation per hour in dollars. */
  fringeRate: number;
  /** ISO yyyy-mm-dd the rate takes effect. */
  effectiveDate: string;
}

export interface DeterminationExport {
  determinationId: string;
  authority: 'davis-bacon' | 'state-prevailing-wage';
  state: string;
  locality: string;
  constructionType: ConstructionType;
  rows: DeterminationExportRow[];
}

/** Thrown when an import can't be trusted — the message names exactly what was wrong so the source (or the adapter) can be fixed, never the pricing engine. */
export class DeterminationImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeterminationImportError';
  }
}

const CONSTRUCTION_TYPES: ReadonlySet<string> = new Set(['building', 'residential', 'highway', 'heavy']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A real ISO calendar date — not just the right SHAPE. Catches "2026-13-45", which passes the regex but is not a date, at the import boundary rather than letting it corrupt effective-date resolution downstream (which compares dates as strings). */
function isRealIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Derive a stable-ish classification code from a printed title: upper-case, non-alphanumeric runs to single underscores, trimmed. Documented as a fallback — an explicit classificationCode is preferred. */
export function slugifyClassification(title: string): string {
  return title
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function toRateCents(value: number, field: string, row: number): Cents {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new DeterminationImportError(`Row ${row}: ${field} must be a non-negative number of dollars, got ${String(value)}.`);
  }
  return dollars(value);
}

/**
 * Validate and convert a DeterminationExport into a WageDetermination. Pure.
 * Raises DeterminationImportError on the first malformed field, naming the row.
 * Rows keep their given order; effective-date resolution (which line is in
 * force on a work date) happens later in wageDetermination.ts, so this does
 * not need to sort them.
 */
export function normalizeDetermination(input: DeterminationExport): WageDetermination {
  if (!input.determinationId?.trim()) throw new DeterminationImportError('determinationId is required.');
  if (!/^[A-Z]{2}$/.test(input.state)) {
    throw new DeterminationImportError(`state must be a two-letter uppercase code, got "${input.state}".`);
  }
  if (!CONSTRUCTION_TYPES.has(input.constructionType)) {
    throw new DeterminationImportError(`constructionType "${input.constructionType}" is not one of building | residential | highway | heavy.`);
  }
  if (input.authority !== 'davis-bacon' && input.authority !== 'state-prevailing-wage') {
    throw new DeterminationImportError(`authority "${input.authority}" is not one of davis-bacon | state-prevailing-wage.`);
  }
  if (!Array.isArray(input.rows) || input.rows.length === 0) {
    throw new DeterminationImportError(`determination "${input.determinationId}" has no rate rows.`);
  }

  const rates: WageDeterminationRate[] = input.rows.map((row, i) => {
    const n = i + 1;
    const title = (row.classification ?? '').trim();
    if (!title) throw new DeterminationImportError(`Row ${n}: classification title is required.`);
    if (!isRealIsoDate(row.effectiveDate ?? '')) {
      throw new DeterminationImportError(`Row ${n} (${title}): effectiveDate must be a real ISO yyyy-mm-dd date, got "${row.effectiveDate}".`);
    }
    const code = row.classificationCode?.trim() || slugifyClassification(title);
    if (!code) throw new DeterminationImportError(`Row ${n} (${title}): could not derive a classification code — supply classificationCode.`);
    return {
      classificationCode: code,
      baseHourlyRateCents: toRateCents(row.baseHourlyRate, 'baseHourlyRate', n),
      fringePerHourCents: toRateCents(row.fringeRate, 'fringeRate', n),
      effectiveDate: row.effectiveDate,
    };
  });

  return {
    id: input.determinationId,
    authority: input.authority,
    state: input.state,
    locality: input.locality,
    constructionType: input.constructionType,
    rates,
  };
}

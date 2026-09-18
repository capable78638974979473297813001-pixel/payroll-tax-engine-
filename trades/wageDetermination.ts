import type { WageDetermination, WageDeterminationRate } from './types.ts';

/**
 * Effective-dated resolution of a prevailing-wage rate — the trades layer's
 * equivalent of src/registry.ts selecting a tax ruleset by the date on the
 * cheque. A wage determination is reissued as numbered modifications through
 * the year; the rate that governs a day of work is the one in force on that
 * work date, and a modification published later never rewrites a cheque
 * already run against the earlier rate.
 *
 * Everything here is a pure lookup over the determination the CALLER supplied
 * (see trades/types.ts's header on why the determination database is
 * disclosed-not-built). The one opinion this module enforces is the tax
 * engine's own: a rate that cannot be found RAISES, it never defaults to
 * zero — a silent $0 prevailing rate would let an employer pay a worker their
 * shop rate on a public job and believe they were compliant.
 */

/** Thrown when a classification has no rate line in force on a work date — a real compliance stop, surfaced as an error rather than a guessed rate. */
export class MissingWageDeterminationRateError extends Error {
  readonly determinationId: string;
  readonly classificationCode: string;
  readonly workDate: string;
  constructor(determinationId: string, classificationCode: string, workDate: string) {
    super(
      `Wage determination ${determinationId} has no rate for classification ` +
        `"${classificationCode}" in force on ${workDate}. A prevailing-wage job cannot be ` +
        `priced without it — add the classification's rate line (or correct the work date / ` +
        `classification code) rather than paying an unverified rate.`,
    );
    this.name = 'MissingWageDeterminationRateError';
    this.determinationId = determinationId;
    this.classificationCode = classificationCode;
    this.workDate = workDate;
  }
}

/**
 * The rate line for `classificationCode` in force on `workDate`: the latest
 * line whose effectiveDate is on or before the work date. Returns null when
 * the classification has no such line (the caller decides whether that is an
 * error — resolveRate() below makes it one; a compliance sweep may prefer to
 * collect it as a finding).
 */
export function findRateOnDate(
  determination: WageDetermination,
  classificationCode: string,
  workDate: string,
): WageDeterminationRate | null {
  let best: WageDeterminationRate | null = null;
  for (const rate of determination.rates) {
    if (rate.classificationCode !== classificationCode) continue;
    if (rate.effectiveDate > workDate) continue; // not yet in force on this cheque
    if (!best || rate.effectiveDate > best.effectiveDate) best = rate;
  }
  return best;
}

/** Like findRateOnDate(), but raises MissingWageDeterminationRateError instead of returning null — the strict path a paycheck build uses, where a missing rate must stop the run, not zero it. */
export function resolveRate(
  determination: WageDetermination,
  classificationCode: string,
  workDate: string,
): WageDeterminationRate {
  const rate = findRateOnDate(determination, classificationCode, workDate);
  if (!rate) throw new MissingWageDeterminationRateError(determination.id, classificationCode, workDate);
  return rate;
}

/** Index a caller's determinations by id for repeated lookup within a run. A duplicate id is a caller error (two different determinations claiming the same published number) and throws rather than silently keeping one. */
export function indexDeterminations(determinations: readonly WageDetermination[]): Map<string, WageDetermination> {
  const byId = new Map<string, WageDetermination>();
  for (const det of determinations) {
    if (byId.has(det.id)) {
      throw new Error(`Duplicate wage determination id "${det.id}" — each determination must have a unique id.`);
    }
    byId.set(det.id, det);
  }
  return byId;
}

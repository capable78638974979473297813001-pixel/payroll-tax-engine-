import { roundHalfUp, type Cents } from '../src/money.ts';
import type { ResolvedWorkedHours } from './prevailingWage.ts';

/**
 * Davis-Bacon apprentice-RATIO compliance — the rule that keeps an employer
 * from stacking a crew with low-paid apprentices to dodge the journeyworker
 * prevailing wage.
 *
 * THE RULE (29 CFR 5.5(a)(4)): an apprentice may be paid below the
 * journeyworker prevailing rate only while employed within the
 * apprentice-to-journeyworker RATIO allowed by the registered apprenticeship
 * program (registered with DOL's Office of Apprenticeship or a state agency).
 * Apprentices working on the site IN EXCESS of that ratio must be paid the
 * full journeyworker prevailing rate for the classification. The ratio and
 * the apprentice's step-percentage both come from the program's registered
 * standards — caller-supplied facts, never guessed, the same discipline the
 * wage determination itself follows.
 *
 * HOW IT IS MEASURED HERE: per day, by HOURS. The strict legal measure is the
 * count of apprentices vs. journeyworkers physically on the site, but a
 * certified-payroll system sees hours, not a headcount roster, so this applies
 * the ratio to each day's journeyworker and apprentice hours — allowable
 * apprentice hours = journeyworker hours × (apprentices ÷ journeyworkers). It
 * is the same proxy other certified-payroll tools use, and it is stated here
 * rather than presented as the headcount rule it approximates. A finer-grained
 * headcount check would need on-site presence data this layer doesn't carry.
 *
 * WHAT IT COMPUTES: the apprentice hours OVER the ratio each day, and the
 * additional wages owed on them — those hours should have been paid the
 * journeyworker prevailing total (base + fringe) rather than the apprentice
 * total, so the make-up is the gap between the two, times the over-ratio
 * hours. That figure is real back-wage exposure, the same shape as the
 * fringe-annualization and prevailing-wage findings elsewhere in this layer.
 */

export interface ApprenticeshipProgram {
  id: string;
  trade: string;
  /** The journeyworker classification code apprentices are rationed against (must match the code used on WorkedHours / the determination). */
  journeyworkerClassificationCode: string;
  /** The apprentice classification codes this program covers (a program may register several apprentice steps). */
  apprenticeClassificationCodes: string[];
  /** Allowable ratio as apprentices : journeyworkers — e.g. { apprentices: 1, journeyworkers: 3 } is one apprentice for every three journeyworkers. */
  ratio: { apprentices: number; journeyworkers: number };
}

export interface ApprenticeRatioDayFinding {
  jobId: string;
  date: string;
  journeyworkerHours: number;
  apprenticeHours: number;
  /** journeyworker hours × (apprentices ÷ journeyworkers) — the apprentice hours payable at the apprentice rate this day. */
  allowableApprenticeHours: number;
  /** Apprentice hours beyond the allowance, which must be paid the journeyworker prevailing rate. */
  overRatioApprenticeHours: number;
  /** Additional wages owed: over-ratio hours × (journeyworker prevailing total − the apprentice prevailing total actually applied). */
  additionalWagesOwedCents: Cents;
  message: string;
}

/** Thrown when a program's ratio names zero (or negative) journeyworkers — an undefined divisor, and a real data error rather than "no apprentices allowed". */
export class InvalidApprenticeRatioError extends Error {
  readonly programId: string;
  constructor(programId: string, journeyworkers: number) {
    super(`Apprenticeship program "${programId}" has an invalid ratio denominator (${journeyworkers} journeyworkers) — it must be a positive number.`);
    this.name = 'InvalidApprenticeRatioError';
    this.programId = programId;
  }
}

/** The prevailing total (basic rate + fringe obligation) an entry was priced at — what an over-ratio apprentice hour is compared against and what a journeyworker hour establishes. */
function prevailingTotal(entry: ResolvedWorkedHours): Cents {
  return entry.prevailingBaseRateCents + entry.fringeObligationPerHourCents;
}

function entryHours(entry: ResolvedWorkedHours): number {
  return entry.straightHours + entry.overtimeHours + entry.doubleTimeHours;
}

/**
 * Check one job's resolved hours against a program's apprentice ratio,
 * day by day. `journeyworkerRateCents` is the journeyworker prevailing total
 * (base + fringe) per hour, supplied by the caller from the determination —
 * needed because the make-up rate must be known even on a day when no
 * journeyworker actually worked (every apprentice hour is over the ratio
 * then). Returns a finding only for days where apprentices exceeded the ratio.
 */
export function checkApprenticeRatio(
  jobId: string,
  entries: readonly ResolvedWorkedHours[],
  program: ApprenticeshipProgram,
  journeyworkerRateCents: Cents,
): ApprenticeRatioDayFinding[] {
  if (program.ratio.journeyworkers <= 0) throw new InvalidApprenticeRatioError(program.id, program.ratio.journeyworkers);
  const apprenticeCodes = new Set(program.apprenticeClassificationCodes);
  const ratioValue = program.ratio.apprentices / program.ratio.journeyworkers;

  // Group this job's entries by day.
  const byDate = new Map<string, ResolvedWorkedHours[]>();
  for (const e of entries) {
    if (e.jobId !== jobId) continue;
    const list = byDate.get(e.date);
    if (list) list.push(e);
    else byDate.set(e.date, [e]);
  }

  const findings: ApprenticeRatioDayFinding[] = [];
  for (const [date, dayEntries] of [...byDate.entries()].sort()) {
    let journeyworkerHours = 0;
    let apprenticeHours = 0;
    let apprenticeWeightedTotal = 0; // Σ hours × apprentice prevailing total, for the weighted apprentice rate

    for (const e of dayEntries) {
      const hours = entryHours(e);
      if (e.classificationCode === program.journeyworkerClassificationCode) {
        journeyworkerHours += hours;
      } else if (apprenticeCodes.has(e.classificationCode)) {
        apprenticeHours += hours;
        apprenticeWeightedTotal += hours * prevailingTotal(e);
      }
    }

    if (apprenticeHours <= 0) continue;
    const allowable = journeyworkerHours * ratioValue;
    const overRatio = apprenticeHours - allowable;
    if (overRatio <= 0) continue;

    // The apprentice hours were paid the apprentice prevailing total (weighted
    // across whatever steps worked); the over-ratio ones owed the journeyworker
    // total, so the make-up is the positive gap between the two.
    const apprenticeAvgTotal = apprenticeWeightedTotal / apprenticeHours;
    const perHourGap = Math.max(0, journeyworkerRateCents - apprenticeAvgTotal);
    const additionalWagesOwed = roundHalfUp(overRatio * perHourGap);

    findings.push({
      jobId,
      date,
      journeyworkerHours,
      apprenticeHours,
      allowableApprenticeHours: allowable,
      overRatioApprenticeHours: overRatio,
      additionalWagesOwedCents: additionalWagesOwed,
      message:
        `Apprentice ratio exceeded on job ${jobId} ${date}: ${apprenticeHours}h apprentice vs ` +
        `${journeyworkerHours}h journeyworker allows ${allowable.toFixed(2)}h at the apprentice rate ` +
        `(${program.ratio.apprentices}:${program.ratio.journeyworkers}); ${overRatio.toFixed(2)}h over the ratio owe the ` +
        `journeyworker rate — ${additionalWagesOwed}¢ additional.`,
    });
  }
  return findings;
}

/** Total additional wages owed across every over-ratio day — the job's apprentice-ratio back-wage exposure at a glance. */
export function totalApprenticeRatioExposure(findings: readonly ApprenticeRatioDayFinding[]): Cents {
  return findings.reduce((sum, f) => sum + f.additionalWagesOwedCents, 0);
}

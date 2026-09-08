import type { Cents } from './money.ts';
import {
  federalMinimumWageRuleset,
  localMinimumWageRuleset,
  stateMinimumWageRuleset,
  hasStateMinimumWageRuleset,
  type MinimumWageAmount,
  type MinimumWageJurisdiction,
  type TippedMinimumWage,
} from './registry.ts';

/**
 * The minimum wage side of this engine.
 *
 * Everything else in src/ answers "what comes OUT of a paycheck." This
 * module answers the one question that constrains the paycheck before any
 * of that happens: how low may the hourly rate itself go.
 *
 * The whole calculation is one rule, and it is DOL's own: where federal,
 * state and local minimum wage laws all cover the same hour of work, the
 * employer owes the HIGHEST of them. That is why the data is stored one
 * level at a time in data/minimum-wage/ and merged here at query time,
 * rather than pre-flattened into a single rate per address — a pre-merged
 * table silently loses the reason a number is what it is, and goes stale
 * one jurisdiction at a time without anything noticing.
 *
 * Two consequences worth stating plainly, because they are where naive
 * implementations go wrong:
 *
 *  - TIPPED pay is a separate ladder, not a discount on this one. Where a
 *    jurisdiction allows a tip credit, its floor is a CASH wage; where it
 *    does not (California, Minnesota, Montana, Nevada, Oregon, Washington,
 *    Alaska, Guam, and Flagstaff AZ), the full rate is owed in cash. The
 *    highest-applicable rule applies to the cash floors independently, so
 *    a tipped answer is never derived from the standard answer.
 *
 *  - EMPLOYER SIZE genuinely changes the answer in a dozen jurisdictions,
 *    and the size tiers are not all the same shape (headcount in Burien,
 *    headcount-or-revenue in unincorporated King County, gross receipts in
 *    Ohio, seasonality in New Jersey). Only the headcount tiers are
 *    machine-readable; where a tier is not, this module says so in the
 *    trail instead of guessing at it.
 */

export type MinimumWageLevel = 'federal' | 'state' | 'local';

export interface MinimumWageQuery {
  /** Any date; selects the year's ruleset the same way every other loader here does. */
  checkDate: string;
  /** Two-letter state, DC, or territory code. */
  state: string;
  /**
   * A local jurisdiction id or name from data/minimum-wage/local/, e.g.
   * 'seattle' or 'Los Angeles County (unincorporated areas only)'. Omit it
   * and no local ordinance is applied — this engine will not guess a
   * locality from a state code.
   */
  locality?: string;
  /** Employer headcount, used only where a jurisdiction publishes a headcount tier. */
  employeeCount?: number;
  /** Ask for the tipped CASH floor rather than the standard rate. */
  tipped?: boolean;
}

export interface MinimumWageCandidate {
  level: MinimumWageLevel;
  jurisdiction: string;
  /** Undefined where a jurisdiction publishes no applicable figure (e.g. an employer its ordinance does not reach). */
  cents?: Cents;
  basis: string;
  /** Set where this level's figure could not be narrowed with the inputs given. */
  caveat?: string;
}

export interface MinimumWageAnswer {
  /** The binding floor, in cents per hour. */
  cents: Cents;
  hourly: number;
  /** Which level actually binds — the highest of those considered. */
  bindingLevel: MinimumWageLevel;
  bindingJurisdiction: string;
  /** Whether `cents` is a cash floor that tips may top up, or the full rate. */
  tipCreditAllowed: boolean;
  /** Every level considered, in federal → state → local order, including the ones that lost. */
  considered: MinimumWageCandidate[];
}

/** Cents can carry a half-cent in exactly one place: South Dakota's $5.925 tipped wage. */
function toCents(amount: { hourlyCents: number }): number {
  return amount.hourlyCents;
}

function tippedCents(tipped: TippedMinimumWage | undefined): number | undefined {
  return tipped ? tipped.cashWageCents : undefined;
}

function sizeMatches(amount: MinimumWageAmount, employeeCount: number | undefined): boolean {
  const when = amount.appliesWhen;
  if (!when) return false;
  if (employeeCount === undefined) return false;
  if (when.employeeCountMin !== undefined && employeeCount < when.employeeCountMin) return false;
  if (when.employeeCountMax !== undefined && employeeCount > when.employeeCountMax) return false;
  return true;
}

function dateInRange(amount: MinimumWageAmount, checkDate: string): boolean {
  if (amount.effectiveFrom && checkDate < amount.effectiveFrom) return false;
  if (amount.effectiveTo && checkDate > amount.effectiveTo) return false;
  return true;
}

/**
 * Pick the tier that actually applies to this employer, out of a
 * jurisdiction's default figure plus its variants.
 *
 * Returns the default untouched when the caller gave no headcount, or when
 * no variant declares a machine-readable one — with `narrowed: false` so
 * the caller can say so rather than implying a size test was performed.
 */
function selectTier(
  base: MinimumWageAmount,
  variants: MinimumWageAmount[] | undefined,
  query: MinimumWageQuery,
): { amount: MinimumWageAmount | undefined; narrowed: boolean; notCovered: boolean } {
  const sized = (variants ?? []).filter(
    (v) => v.appliesWhen && dateInRange(v, query.checkDate),
  );
  if (sized.length === 0) return { amount: base, narrowed: false, notCovered: false };
  if (query.employeeCount === undefined) {
    return { amount: base, narrowed: false, notCovered: false };
  }
  if (sizeMatches(base, query.employeeCount) || base.appliesWhen === undefined) {
    // The jurisdiction's headline figure either matches the headcount test
    // it declares, or declares none at all — but a variant may still be the
    // better match, so keep looking before settling for it.
    const match = sized.find((v) => sizeMatches(v, query.employeeCount));
    if (match) {
      if (match.notCovered) return { amount: undefined, narrowed: true, notCovered: true };
      return { amount: match, narrowed: true, notCovered: false };
    }
    return { amount: base, narrowed: base.appliesWhen !== undefined, notCovered: false };
  }
  const match = sized.find((v) => sizeMatches(v, query.employeeCount));
  if (!match) return { amount: base, narrowed: false, notCovered: false };
  if (match.notCovered) return { amount: undefined, narrowed: true, notCovered: true };
  return { amount: match, narrowed: true, notCovered: false };
}

function findLocality(
  jurisdictions: MinimumWageJurisdiction[],
  locality: string,
): MinimumWageJurisdiction | undefined {
  const needle = locality.trim().toLowerCase();
  return jurisdictions.find(
    (j) => j.id.toLowerCase() === needle || j.name.toLowerCase() === needle,
  );
}

/** Every local ordinance researched for one state — for callers that need to search rather than name one. */
export function localMinimumWages(
  stateCode: string,
  checkDate: string,
): MinimumWageJurisdiction[] {
  return localMinimumWageRuleset(stateCode, checkDate);
}

/**
 * The binding minimum wage for one employee, and the trail that produced it.
 *
 * Throws only if the state/territory code has no ruleset at all — an
 * unrecognised LOCALITY is reported in the trail instead, because
 * "this city has no ordinance" and "you spelled the city wrong" must not
 * silently produce the same confident-looking number.
 */
export function minimumWage(query: MinimumWageQuery): MinimumWageAnswer {
  const considered: MinimumWageCandidate[] = [];

  const fed = federalMinimumWageRuleset(query.checkDate);
  const fedCents = query.tipped ? tippedCents(fed.tipped)! : toCents(fed.standard);
  considered.push({
    level: 'federal',
    jurisdiction: 'United States (FLSA)',
    cents: fedCents,
    basis: query.tipped
      ? 'FLSA tipped cash wage (29 U.S.C. 203(m))'
      : 'FLSA minimum wage (29 U.S.C. 206(a))',
  });

  if (!hasStateMinimumWageRuleset(query.state, query.checkDate)) {
    throw new Error(
      `No minimum wage ruleset for '${query.state}'. Rates are data, not code: add ` +
        `data/minimum-wage/states/${query.state.toUpperCase()}-<year>.json (with its ` +
        `source URL and verifiedOn date) rather than falling back to the federal floor silently.`,
    );
  }

  const state = stateMinimumWageRuleset(query.state, query.checkDate);
  if (state.standard === null) {
    // American Samoa: the federal floor there is 18 industry rates, and no
    // single number is a correct answer. Refuse rather than pick one.
    considered.push({
      level: 'state',
      jurisdiction: state.jurisdiction.name,
      basis: 'No single rate exists',
      caveat:
        'American Samoa has 18 industry-specific federal minimum wages ranging from $5.78 to ' +
        '$7.19; read industryRates from its ruleset and pick the employer’s own industry.',
    });
  } else if (query.tipped) {
    considered.push({
      level: 'state',
      jurisdiction: state.jurisdiction.name,
      cents: tippedCents(state.tipped),
      basis: state.tipped.tipCreditAllowed
        ? 'State tipped cash wage'
        : 'State law allows no tip credit — the full state rate is owed in cash',
    });
  } else {
    const tier = selectTier(state.standard, state.variants, query);
    considered.push({
      level: 'state',
      jurisdiction: state.jurisdiction.name,
      cents: tier.amount ? toCents(tier.amount as MinimumWageAmount) : undefined,
      basis: tier.narrowed
        ? `State rate, ${(tier.amount as MinimumWageAmount)?.label ?? 'tier'} (${query.employeeCount} employees)`
        : 'State standard rate',
      caveat:
        !tier.narrowed && (state.variants ?? []).some((v) => v.appliesWhen)
          ? 'This state publishes an employer-size tier; no employeeCount was supplied, so the headline rate is used.'
          : undefined,
    });
  }

  if (query.locality) {
    const locals = localMinimumWageRuleset(query.state, query.checkDate);
    const found = findLocality(locals, query.locality);
    if (!found) {
      considered.push({
        level: 'local',
        jurisdiction: query.locality,
        basis: 'No local ordinance found',
        caveat:
          locals.length === 0
            ? `No local minimum wage ordinances are recorded for ${query.state.toUpperCase()}.`
            : `'${query.locality}' is not one of the ${locals.length} ordinances recorded for ` +
              `${query.state.toUpperCase()}. This is reported, not treated as "no ordinance": ` +
              `check the spelling against localMinimumWages().`,
      });
    } else if (found.status) {
      considered.push({
        level: 'local',
        jurisdiction: found.name,
        basis: `Ordinance not applied — ${found.status}`,
        caveat: found.note as string | undefined,
      });
    } else if (query.tipped) {
      considered.push({
        level: 'local',
        jurisdiction: found.name,
        cents: tippedCents(found.tipped),
        basis: found.tipped
          ? found.tipped.tipCreditAllowed
            ? 'Local tipped cash wage'
            : 'Local ordinance allows no tip credit — the full local rate is owed in cash'
          : 'Ordinance publishes no separate tipped rate',
        caveat: found.tipped
          ? undefined
          : 'No local tipped figure: the state tipped rule applies against the local rate.',
      });
    } else {
      const tier = selectTier(found, found.variants, query);
      considered.push({
        level: 'local',
        jurisdiction: found.name,
        cents: tier.amount ? toCents(tier.amount as MinimumWageAmount) : undefined,
        basis: tier.notCovered
          ? 'Employer is below this ordinance’s size threshold — not covered'
          : tier.narrowed
            ? `Local rate, ${(tier.amount as MinimumWageAmount)?.label ?? 'tier'} (${query.employeeCount} employees)`
            : 'Local standard rate',
        caveat:
          !tier.narrowed && (found.variants ?? []).some((v) => v.appliesWhen)
            ? 'This ordinance publishes employer-size tiers; no employeeCount was supplied, so the headline rate is used.'
            : undefined,
      });
    }
  }

  let binding = considered[0]!;
  for (const c of considered) {
    if (c.cents !== undefined && c.cents > (binding.cents ?? -1)) binding = c;
  }

  const tipCreditAllowed =
    query.tipped === true
      ? binding.level === 'federal'
        ? fed.tipped.tipCreditAllowed
        : binding.level === 'state'
          ? state.tipped.tipCreditAllowed
          : (findLocality(localMinimumWageRuleset(query.state, query.checkDate), query.locality!)
              ?.tipped?.tipCreditAllowed ?? state.tipped.tipCreditAllowed)
      : false;

  return {
    cents: binding.cents!,
    hourly: binding.cents! / 100,
    bindingLevel: binding.level,
    bindingJurisdiction: binding.jurisdiction,
    tipCreditAllowed,
    considered,
  };
}

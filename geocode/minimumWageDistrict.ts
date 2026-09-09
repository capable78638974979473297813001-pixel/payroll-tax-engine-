/**
 * Address geography -> minimum-wage locality/region id.
 *
 * src/minimum-wage.ts already does everything hard about minimum wage
 * (employer-size tiers, tipped ladders, mid-year steps, named regions) —
 * but it takes a `locality` id string ('seattle') and a `region` id string
 * ('downstate') as INPUT, the same way resolve.ts's own local-tax matchers
 * take Census geography names as input rather than an address. This module
 * is the missing middle step: given the geography an address already
 * resolved to, which (if any) of data/minimum-wage/local/'s ~66
 * jurisdictions or NY/OR's named regions does it fall inside.
 *
 * Deliberately DATA-DRIVEN, not a hardcoded per-state name table: it reads
 * whatever localMinimumWageRuleset() actually has on file for the state and
 * matches Census's own place/county names against each jurisdiction's own
 * `name` field, the same stripPlaceTypeSuffix/namesEqual idiom resolve.ts
 * already uses for MI/OH/AL/KY city matching. A jurisdiction added to the
 * database later is matchable here with zero code changes, same as a new
 * OH municipality needs none.
 *
 * THREE genuinely different shapes of "county-level" ordinance exist in
 * the real data, conflated in an earlier draft of this module until a
 * smoke test against Maryland and Illinois caught it — worth stating
 * plainly since a future edit could reintroduce the same conflation:
 *
 *   1. UNINCORPORATED-ONLY (Los Angeles, San Mateo, Boulder, Bernalillo,
 *      and King counties — each carries "(unincorporated areas only)" in
 *      its own name and an `_unincorporated`-suffixed id by this
 *      database's own convention). "No incorporated place matched at this
 *      point" is the same signal Ohio's JEDD lookup relies on for the same
 *      underlying reason (unincorporated township land has no
 *      municipality to match) — but it is a HEURISTIC, not a legal
 *      determination: Census's own place layer is the evidence, not a
 *      parcel-level annexation record. Disclosed via
 *      MinimumWageLocalityMatch.heuristic rather than silently assumed
 *      exact.
 *   2. COUNTY-WIDE, no carve-out at all (Maryland's Montgomery and Howard
 *      counties — their own ordinances reach every incorporated town
 *      inside the county too, not just unincorporated land). A plain
 *      county-name match, unconditional.
 *   3. COUNTY-WIDE MINUS ONE NAMED CITY (Illinois's "Cook County
 *      (excluding Chicago)" — Chicago has its own, separately-listed
 *      ordinance, and Cook County's applies everywhere else in the county,
 *      INCLUDING other incorporated suburbs like Evanston, not just
 *      unincorporated land). A county-name match that is refused only when
 *      the specific excluded place is present.
 *
 * All three are told apart from a plain city ordinance (Chicago, Seattle,
 * Denver, ...) by the same signal: the jurisdiction's own `name`, once any
 * trailing parenthetical is stripped, ends in "County". Which of the three
 * county shapes applies is then read from that same name/id, never
 * guessed.
 */
import { namesEqual, normalizeSaintAbbreviation, stripCountySuffix, stripPlaceTypeSuffix } from './normalize.ts';
import { localMinimumWageRuleset, type MinimumWageJurisdiction } from '../src/registry.ts';

export interface MinimumWageLocalityMatch {
  /** The id to pass as minimumWage()'s `locality` field, e.g. 'seattle'. Null when nothing matched or the match was ambiguous. */
  locality: string | null;
  jurisdictionName: string | null;
  confidence: 'matched' | 'ambiguous' | 'no_match';
  /** Populated only when confidence is 'ambiguous' — should not happen in practice (no two ordinances in one state's file share a name), but surfaced rather than silently picking one, the same discipline resolve.ts's own FieldMatch uses. */
  candidates?: MinimumWageJurisdiction[];
  /** True when this match relied on the "no incorporated place here" unincorporated-land heuristic described in this module's own doc comment, rather than a direct name match — a caller surfacing confidence to a human should say so. */
  heuristic: boolean;
}

/** A jurisdiction whose ordinance covers only a county's UNINCORPORATED land — by this database's own naming convention, both its id and its name say so. */
function isUnincorporatedCountyJurisdiction(j: MinimumWageJurisdiction): boolean {
  return j.id.endsWith('_unincorporated');
}

/** Strip a trailing parenthetical the same way normalize.ts's stripParenthetical does elsewhere in this project — "Cook County (excluding Chicago)" -> "Cook County". */
function withoutParenthetical(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/** True when a jurisdiction's own name (parenthetical aside) names a COUNTY rather than a city — the signal that distinguishes all three county-ordinance shapes from a plain city one. */
function isCountyShaped(name: string): boolean {
  return /county$/i.test(withoutParenthetical(name));
}

/** The one specific place a "(excluding X)" ordinance carves out — Illinois's Cook County is the only current example — or null when the name has no such carve-out. */
function excludedPlaceFromLabel(name: string): string | null {
  const m = /\(excluding\s+([^)]+)\)/i.exec(name);
  return m ? m[1].trim() : null;
}

/** Census place/county name vs. this database's own jurisdiction name, insensitive to case, whitespace, and the "St."/"Saint" abbreviation split (see normalizeSaintAbbreviation's own doc comment for why that specific normalization exists). Every place/county comparison in this module goes through this, not a bare namesEqual, so a future "St. X"-named jurisdiction added to data/minimum-wage/local/ is matchable with no code change here either. */
function placeOrCountyNamesEqual(a: string, b: string): boolean {
  return namesEqual(normalizeSaintAbbreviation(a), normalizeSaintAbbreviation(b));
}

/**
 * Match an already-resolved address's geography against every local
 * minimum-wage ordinance on file for its state. Pure — takes Census's own
 * incorporatedPlaces/counties lists (the same shape resolve.ts's own
 * matchers read), never touches the network.
 */
export function matchMinimumWageLocality(
  state: string,
  geo: { incorporatedPlaces: string[]; counties: string[] },
  checkDate: string,
): MinimumWageLocalityMatch {
  const jurisdictions = localMinimumWageRuleset(state, checkDate);
  if (jurisdictions.length === 0) {
    return { locality: null, jurisdictionName: null, confidence: 'no_match', heuristic: false };
  }

  const candidates: { j: MinimumWageJurisdiction; heuristic: boolean }[] = [];
  for (const j of jurisdictions) {
    if (isCountyShaped(j.name)) {
      const bareCounty = stripCountySuffix(withoutParenthetical(j.name));
      const countyMatches = geo.counties.some((c) => placeOrCountyNamesEqual(stripCountySuffix(c), bareCounty));
      if (!countyMatches) continue;

      if (isUnincorporatedCountyJurisdiction(j)) {
        // Shape 1: unincorporated land only (LA/San Mateo/Boulder/
        // Bernalillo/King counties) — no incorporated place may sit here.
        if (geo.incorporatedPlaces.length === 0) candidates.push({ j, heuristic: true });
        continue;
      }
      const excluded = excludedPlaceFromLabel(j.name);
      if (excluded) {
        // Shape 3: county-wide EXCEPT one named city (Cook County minus
        // Chicago) — refuse only where that specific place matched;
        // every OTHER incorporated town in the county is still covered.
        const isExcludedPlace = geo.incorporatedPlaces.some((p) => placeOrCountyNamesEqual(stripPlaceTypeSuffix(p), excluded));
        if (!isExcludedPlace) candidates.push({ j, heuristic: false });
        continue;
      }
      // Shape 2: county-wide, no carve-out at all (Maryland's Montgomery
      // and Howard counties) — the county match alone is sufficient.
      candidates.push({ j, heuristic: false });
    } else {
      const placeMatches = geo.incorporatedPlaces.some((p) => placeOrCountyNamesEqual(stripPlaceTypeSuffix(p), j.name));
      if (placeMatches) candidates.push({ j, heuristic: false });
    }
  }

  if (candidates.length === 1) {
    const { j, heuristic } = candidates[0];
    return { locality: j.id, jurisdictionName: j.name, confidence: 'matched', heuristic };
  }
  if (candidates.length > 1) {
    return {
      locality: null,
      jurisdictionName: null,
      confidence: 'ambiguous',
      candidates: candidates.map((c) => c.j),
      heuristic: false,
    };
  }
  return { locality: null, jurisdictionName: null, confidence: 'no_match', heuristic: false };
}

/**
 * Oregon's 18 "non-urban" counties, quoted verbatim from
 * data/minimum-wage/states/OR-2026.json's own `nonurban` variant `test`
 * field (itself sourced from ORS 653.025) — kept here as its own copy
 * rather than read live from that file, the same "small, stable, verified
 * list" treatment this project already gives WV's 6 service-fee cities and
 * CO's 5 OPT cities in resolve.ts. If Oregon's own statute ever redraws
 * this list, this constant and that data file must be updated together.
 */
const OREGON_NONURBAN_COUNTIES = new Set([
  'baker', 'coos', 'crook', 'curry', 'douglas', 'gilliam', 'grant', 'harney',
  'jefferson', 'klamath', 'lake', 'malheur', 'morrow', 'sherman', 'umatilla',
  'union', 'wallowa', 'wheeler',
]);

/** True when the resolved county is one of Oregon's 18 statutorily-named non-urban counties. Pure — the Portland-metro region needs a live boundary check instead (see districts.ts's isInsidePortlandMetro), which is why this only ever handles the OTHER half of Oregon's three-way split. */
export function isOregonNonurbanCounty(counties: string[]): boolean {
  return counties.some((c) => OREGON_NONURBAN_COUNTIES.has(stripCountySuffix(c).toLowerCase()));
}

/** New York's four "downstate" counties/city — N.Y. Lab. Law 652, quoted in data/minimum-wage/states/NY-2026.json's own 'downstate' variant label ("New York City, Nassau, Suffolk and Westchester counties"). NYC itself is matched via resolve.ts's own newYorkCity flag (Incorporated Places), not this set, since "New York" is a place, not a county. */
const NY_DOWNSTATE_COUNTIES = new Set(['nassau', 'suffolk', 'westchester']);

/** True when the resolved geography is New York's "downstate" minimum-wage region: NYC itself, or Nassau/Suffolk/Westchester county. */
export function isNewYorkDownstate(geo: { incorporatedPlaces: string[]; counties: string[] }): boolean {
  const nyc = geo.incorporatedPlaces.some((p) => namesEqual(stripPlaceTypeSuffix(p), 'New York'));
  const county = geo.counties.some((c) => NY_DOWNSTATE_COUNTIES.has(stripCountySuffix(c).toLowerCase()));
  return nyc || county;
}

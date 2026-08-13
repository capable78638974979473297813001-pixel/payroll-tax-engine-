import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DATA_ROOT = join(import.meta.dirname, '..', 'data');

const cache = new Map<string, unknown>();

function loadJson<T>(relPath: string): T {
  const cached = cache.get(relPath);
  if (cached !== undefined) return cached as T;

  const full = join(DATA_ROOT, relPath);
  if (!existsSync(full)) {
    throw new RulesetNotFoundError(relPath);
  }
  const parsed = JSON.parse(readFileSync(full, 'utf8')) as T;
  cache.set(relPath, parsed);
  return parsed;
}

export class RulesetNotFoundError extends Error {
  readonly relPath: string;

  constructor(relPath: string) {
    super(
      `No ruleset at data/${relPath}. Rates are data, not code: add the file ` +
        `(with its source URL and verifiedOn date) rather than hardcoding a rate.`,
    );
    this.name = 'RulesetNotFoundError';
    this.relPath = relPath;
  }
}

/**
 * Resolve the tax year from a check date.
 *
 * Deliberately derived from the check date and never from the clock: a
 * correction run in March for a December check must use December's rules.
 */
export function yearOf(checkDate: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(checkDate);
  if (!m) throw new Error(`checkDate must be ISO yyyy-mm-dd, got: ${checkDate}`);
  return Number(m[1]);
}

export interface Bracket {
  from: number;
  to: number | null;
  base: number;
  rate: number;
}

export interface FederalRuleset {
  year: number;
  sources: { id: string; title: string; url: string; verifiedOn: string }[];
  incomeTax: {
    step1StandardAdjustment: { married_joint: number; other: number };
    supplementalRate: number;
    supplementalMandatoryRate: number;
    supplementalMandatoryThreshold: number;
    standardSchedules: Record<string, Bracket[]>;
    multipleJobsSchedules: Record<string, Bracket[]>;
    exemptPretax: string[];
  };
  socialSecurity: {
    employeeRate: number;
    employerRate: number;
    wageBase: number;
    exemptPretax: string[];
  };
  medicare: {
    employeeRate: number;
    employerRate: number;
    wageBase: number | null;
    additional: { rate: number; threshold: number; employeeOnly: boolean };
    exemptPretax: string[];
  };
  futa: {
    netRate: number;
    wageBase: number;
    exemptPretax: string[];
  };
}

export function federalRuleset(checkDate: string): FederalRuleset {
  return loadJson<FederalRuleset>(join('federal', `${yearOf(checkDate)}.json`));
}

export interface StateRuleset {
  code: string;
  name: string;
  year: number;
  method: string;
  sources: { title: string; url: string; verifiedOn: string }[];
  [key: string]: unknown;
}

export function stateRuleset(code: string, checkDate: string): StateRuleset {
  return loadJson<StateRuleset>(
    join('states', `${code.toUpperCase()}-${yearOf(checkDate)}.json`),
  );
}

export function hasStateRuleset(code: string, checkDate: string): boolean {
  return existsSync(
    join(DATA_ROOT, 'states', `${code.toUpperCase()}-${yearOf(checkDate)}.json`),
  );
}

export interface CountyEntry {
  name: string;
  countyCode: string;
  rate: number;
  changedSinceOct2025?: boolean;
}

interface CountyRegistryFile {
  year: number;
  counties: CountyEntry[];
}

/**
 * Whether a mandatory county-level registry exists for this state/year — e.g.
 * Indiana, where every address falls inside exactly one of 92 counties (no
 * closed-list-with-a-zero-case the way Michigan's 24 cities work).
 */
export function hasCountyRuleset(stateCode: string, checkDate: string): boolean {
  return existsSync(
    join(DATA_ROOT, 'local', `${stateCode.toUpperCase()}-counties-${yearOf(checkDate)}.json`),
  );
}

/**
 * Look up one county's rate by name (case-insensitive). Returns undefined
 * for an unrecognised name rather than throwing — the caller decides how to
 * surface that (see taxes/state.ts's handling of a missing/unknown county).
 */
export function countyRuleset(
  stateCode: string,
  countyName: string,
  checkDate: string,
): CountyEntry | undefined {
  const file = loadJson<CountyRegistryFile>(
    join('local', `${stateCode.toUpperCase()}-counties-${yearOf(checkDate)}.json`),
  );
  return file.counties.find(
    (c) => c.name.toLowerCase() === countyName.toLowerCase(),
  );
}

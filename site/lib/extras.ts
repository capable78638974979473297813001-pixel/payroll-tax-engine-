import { calculateGarnishments, type GarnishmentOrder, type GarnishmentResult } from '../../src/garnishment.ts';
import { minimumWage, type MinimumWageAnswer, type MinimumWageQuery } from '../../src/minimum-wage.ts';
import type { PaycheckInput, PaycheckResult } from '../../src/types.ts';
import type { FieldError } from './validate.ts';

/**
 * The two optional extras a /v1/paycheck request can carry, answered in the
 * same call and the same billed unit:
 *
 *   garnishments[]    court-ordered / administrative wage garnishments, run
 *                     against the paycheck the engine just computed
 *   minimumWageCheck  is the employee's hourly rate at or above the binding
 *                     federal / state / local minimum wage for the work state
 *
 * Both are shape-checked here (the engine trusts its input), so a malformed
 * order is a field-level 422 rather than a raw engine throw.
 */

export interface MinimumWageCheckInput {
  /** The employee's hourly rate, in integer cents ($15.00 = 1500). */
  hourlyRate: number;
  /** A local ordinance id or name from data/minimum-wage/local/, e.g. "seattle". Omit and no local ordinance is applied. */
  locality?: string;
  employeeCount?: number;
  /** Compare against the tipped CASH floor rather than the standard rate. */
  tipped?: boolean;
  region?: string;
  occupation?: 'food_service' | 'service_employee';
}

export interface PaycheckExtras {
  garnishments?: GarnishmentOrder[];
  minimumWageCheck?: MinimumWageCheckInput;
}

export interface GarnishmentOutput extends GarnishmentResult {
  /** The paycheck's netPay less everything withheld for garnishment. */
  netPayAfterGarnishment: number;
}

export interface MinimumWageOutput {
  /** The employee's rate, echoed, in cents per hour. */
  hourlyRate: number;
  /** The binding floor, in cents per hour. */
  requiredHourlyRate: number;
  compliant: boolean;
  /** Cents per hour the rate falls short of the floor; 0 when compliant. */
  shortfallPerHour: number;
  bindingLevel: MinimumWageAnswer['bindingLevel'];
  bindingJurisdiction: string;
  tipCreditAllowed: boolean;
  /**
   * Anything that kept a level from being narrowed with the inputs given, for example a
   * locality name that is not one of the recorded ordinances. Empty means the answer is
   * complete; when it is not empty, `compliant` is judged against the levels that did resolve.
   */
  caveats: string[];
  /** Every level considered, including the ones that lost. */
  considered: MinimumWageAnswer['considered'];
}

export type ExtrasValidation = { ok: true; value: PaycheckExtras } | { ok: false; errors: FieldError[] };

const ORDER_TYPES = ['consumer_creditor', 'child_support', 'federal_student_loan_default'];
const OCCUPATIONS = ['food_service', 'service_employee'];
const MAX_ORDERS = 25;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validates the two optional extras on a paycheck request body. `workStateCode` is what the paycheck input already carries. */
export function validatePaycheckExtras(body: Record<string, unknown>, workStateCode: string | undefined): ExtrasValidation {
  const errors: FieldError[] = [];
  const err = (path: string, message: string) => errors.push({ path, message });
  const value: PaycheckExtras = {};

  const intCents = (v: unknown, path: string, { allowZero = true } = {}): v is number => {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      err(path, 'must be a number of integer cents (e.g. 15000 for $150.00).');
      return false;
    }
    if (!Number.isInteger(v)) {
      err(path, `must be integer cents, not ${v}.`);
      return false;
    }
    if (v < 0 || (!allowZero && v === 0)) {
      err(path, 'must not be negative.');
      return false;
    }
    return true;
  };
  const optBool = (o: Record<string, unknown>, key: string, path: string) => {
    if (o[key] !== undefined && typeof o[key] !== 'boolean') err(`${path}.${key}`, 'must be a boolean when present.');
  };
  const optCount = (o: Record<string, unknown>, key: string, path: string) => {
    const v = o[key];
    if (v !== undefined && (typeof v !== 'number' || !Number.isInteger(v) || v < 0)) err(`${path}.${key}`, 'must be a non-negative whole number when present.');
  };

  if (body.garnishments !== undefined) {
    if (!Array.isArray(body.garnishments)) {
      err('garnishments', 'must be an array of orders when present.');
    } else if (body.garnishments.length > MAX_ORDERS) {
      err('garnishments', `can hold at most ${MAX_ORDERS} orders.`);
    } else {
      if (!workStateCode) err('garnishments', 'needs workState.code, because state law decides the limit on an ordinary consumer garnishment.');
      const seen = new Set<string>();
      body.garnishments.forEach((raw, i) => {
        const path = `garnishments[${i}]`;
        if (!isObject(raw)) return err(path, 'must be an object.');
        if (typeof raw.id !== 'string' || raw.id.trim() === '' || raw.id.length > 64) err(`${path}.id`, 'is required: your own identifier for the order, 1-64 characters.');
        else if (seen.has(raw.id)) err(`${path}.id`, `"${raw.id}" is used twice; each order needs its own id.`);
        else seen.add(raw.id);
        if (typeof raw.type !== 'string' || !ORDER_TYPES.includes(raw.type)) err(`${path}.type`, `must be one of ${ORDER_TYPES.join(', ')}.`);
        intCents(raw.amountOrdered, `${path}.amountOrdered`);
        if (raw.type === 'child_support' && typeof raw.supportingOtherFamily !== 'boolean') {
          err(`${path}.supportingOtherFamily`, 'is required for child_support: the federal ceiling is 50% when the employee supports another spouse or child and 60% when not, and it is never assumed.');
        }
        for (const flag of ['supportingOtherFamily', 'arrearsOver12Weeks', 'headOfFamily', 'wageExemptionWaivedInWriting', 'soleHouseholdSupport']) optBool(raw, flag, path);
        for (const n of ['dependents', 'householdSize', 'priority']) optCount(raw, n, path);
        if (raw.expectedAnnualEarnings !== undefined) intCents(raw.expectedAnnualEarnings, `${path}.expectedAnnualEarnings`);
        if (raw.garnishedThisYearForThisOrder !== undefined) intCents(raw.garnishedThisYearForThisOrder, `${path}.garnishedThisYearForThisOrder`);
      });
      if (body.garnishments.length > 0 && errors.length === 0) value.garnishments = body.garnishments as GarnishmentOrder[];
    }
  }

  if (body.minimumWageCheck !== undefined) {
    const path = 'minimumWageCheck';
    const m = body.minimumWageCheck;
    if (!isObject(m)) {
      err(path, 'must be an object { hourlyRate, locality?, employeeCount?, tipped?, region?, occupation? } when present.');
    } else {
      if (!workStateCode) err(path, 'needs workState.code: the state decides which minimum wage applies.');
      intCents(m.hourlyRate, `${path}.hourlyRate`);
      for (const key of ['locality', 'region']) {
        if (m[key] !== undefined && (typeof m[key] !== 'string' || (m[key] as string).trim() === '' || (m[key] as string).length > 120)) {
          err(`${path}.${key}`, 'must be a non-empty string when present.');
        }
      }
      optCount(m, 'employeeCount', path);
      optBool(m, 'tipped', path);
      if (m.occupation !== undefined && (typeof m.occupation !== 'string' || !OCCUPATIONS.includes(m.occupation))) {
        err(`${path}.occupation`, `must be one of ${OCCUPATIONS.join(', ')} when present.`);
      }
      if (errors.every((e) => !e.path.startsWith(path))) value.minimumWageCheck = m as unknown as MinimumWageCheckInput;
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value };
}

/** An engine refusal the caller can act on (an unsupported state or year, an unknown locality), as opposed to a bug. */
export class ExtrasRefusal extends Error {
  readonly path: string;
  constructor(path: string, message: string) {
    super(message);
    this.name = 'ExtrasRefusal';
    this.path = path;
  }
}

export interface ExtrasOutput {
  garnishment?: GarnishmentOutput;
  minimumWage?: MinimumWageOutput;
}

/** Runs the requested extras against the paycheck the engine just computed. Throws ExtrasRefusal for a caller-fixable refusal. */
export function runPaycheckExtras(input: PaycheckInput, paycheck: PaycheckResult, extras: PaycheckExtras): ExtrasOutput {
  const out: ExtrasOutput = {};
  const state = input.workState?.code;

  if (extras.garnishments && state) {
    try {
      const g = calculateGarnishments({
        checkDate: input.checkDate,
        payFrequency: input.payFrequency,
        workState: state,
        paycheck,
        orders: extras.garnishments,
      });
      out.garnishment = { ...g, netPayAfterGarnishment: paycheck.netPay - g.totalWithheld };
    } catch (e) {
      throw new ExtrasRefusal('garnishments', (e as Error).message);
    }
  }

  if (extras.minimumWageCheck && state) {
    const c = extras.minimumWageCheck;
    const query: MinimumWageQuery = {
      checkDate: input.checkDate,
      state,
      ...(c.locality !== undefined ? { locality: c.locality } : {}),
      ...(c.employeeCount !== undefined ? { employeeCount: c.employeeCount } : {}),
      ...(c.tipped !== undefined ? { tipped: c.tipped } : {}),
      ...(c.region !== undefined ? { region: c.region } : {}),
      ...(c.occupation !== undefined ? { occupation: c.occupation } : {}),
    };
    try {
      const w = minimumWage(query);
      out.minimumWage = {
        hourlyRate: c.hourlyRate,
        requiredHourlyRate: w.cents,
        compliant: c.hourlyRate >= w.cents,
        shortfallPerHour: Math.max(0, w.cents - c.hourlyRate),
        bindingLevel: w.bindingLevel,
        bindingJurisdiction: w.bindingJurisdiction,
        tipCreditAllowed: w.tipCreditAllowed,
        caveats: w.considered.filter((c) => c.caveat).map((c) => `${c.jurisdiction}: ${c.caveat}`),
        considered: w.considered,
      };
    } catch (e) {
      throw new ExtrasRefusal('minimumWageCheck', (e as Error).message);
    }
  }

  return out;
}

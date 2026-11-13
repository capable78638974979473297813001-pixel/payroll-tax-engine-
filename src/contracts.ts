import type { PaycheckInput } from './types.ts';
import { hasStateRuleset, stateRuleset } from './registry.ts';

/**
 * Inputs that are present but in a place, or a combination, the engine can't
 * use. Each one silently changes a tax if left alone, so it is reported in
 * result.warnings instead. None of these stops the calculation.
 */

/** Local-tax fields the engine reads from workState.certificate only. */
const LOCAL_FIELDS = [
  'workPSD',
  'residencePSD',
  'lstPSD',
  'schoolDistrictCode',
  'workJEDDId',
  'workCity',
  'residenceCity',
  'workCounty',
  'residenceCounty',
  'county',
  'workSchoolDistrict',
  'residenceSchoolDistrict',
  'locality',
  'localities',
] as const;


/**
 * The pay period's first day when the caller supplied a usable one: a real yyyy-mm-dd date on or before the check date.
 * Anything else is undefined, and the caller's check date stands in.
 */
export function payPeriodStartOf(input: { checkDate: string; payPeriodStart?: string }): string | undefined {
  const v = input.payPeriodStart;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const t = Date.parse(v + 'T00:00:00Z');
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== v) return undefined;
  return v <= input.checkDate ? v : undefined;
}
export function inputContractWarnings(input: PaycheckInput): string[] {
  const warnings: string[] = [];
  const work = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const residence = (input.residenceState?.certificate ?? {}) as Record<string, unknown>;

  if (input.payPeriodStart !== undefined && payPeriodStartOf(input) === undefined) {
    warnings.push(
      `payPeriodStart '${String(input.payPeriodStart)}' was ignored: it must be a real date written yyyy-mm-dd and no later than checkDate (${input.checkDate}). ` +
        'Local taxes that start with a pay period (Whitesville KY, Springfield OR) fell back to the check date.',
    );
  }

  // Local taxes are read from the WORK state's certificate, including the
  // residence-side fields (residencePSD, residenceCity, schoolDistrictCode).
  const stranded = LOCAL_FIELDS.filter((k) => residence[k] !== undefined && work[k] === undefined);
  if (input.residenceState && stranded.length > 0) {
    warnings.push(
      `residenceState.certificate has ${stranded.join(', ')}, but local taxes read these from workState.certificate only, so ${stranded.length === 1 ? 'it was' : 'they were'} ignored. ` +
        'Put the residence-side local fields (residencePSD, residenceCity, residenceCounty, residenceSchoolDistrict, schoolDistrictCode) on workState.certificate too.',
    );
  }

  // A nonresident flag with no residence state: reciprocity and every
  // residence-state rule need to know where the employee lives.
  if (work.nonresident === true && !input.residenceState) {
    warnings.push(
      `workState.certificate.nonresident is true but input.residenceState is absent, so reciprocity and residence-state rules could not apply. Supply residenceState with the employee's home state.`,
    );
  }

  // A nonresident flag on someone whose home state IS the work state zeroes or
  // cuts the resident tax (DC's nonresident flag takes DC tax to $0).
  if (work.nonresident === true && input.residenceState && input.workState && input.residenceState.code === input.workState.code) {
    warnings.push(
      `workState.certificate.nonresident is true, but residenceState is the same state (${input.workState.code}). A resident marked nonresident is under-withheld (in DC, to $0). Check which is right.`,
    );
  }

  return warnings;
}

/**
 * Employer facts the engine cannot see from one paycheck and therefore
 * leaves out when the caller does not supply them. A missing employer-share
 * line looks like a $0 tax, so each omission is named here instead.
 */
export function missingEmployerFactWarnings(input: PaycheckInput): string[] {
  const warnings: string[] = [];
  const code = input.workState?.code;
  if (!code || !hasStateRuleset(code, input.checkDate)) return warnings;
  const rules = stateRuleset(code, input.checkDate) as unknown as {
    statePaidLeaveEmployer?: { employerSizeGated?: boolean; tiers?: Record<string, number>; defaultTier?: string; maxEmployeeShareFraction?: number; totalRate?: number };
    statePaidLeaveEmployee?: unknown;
    name?: string;
  };
  const cfg = rules.statePaidLeaveEmployer;
  if (!cfg) return warnings;
  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  if (cert.paidLeaveExempt === true) return warnings;

  if (cfg.tiers) {
    const tier = input.employer?.paidLeaveTier?.[code] ?? cfg.defaultTier;
    if (!tier) {
      warnings.push(
        `${code} paid leave was not computed: its premium depends on the employer's headcount, which the engine cannot see. ` +
          `Send employer.paidLeaveTier.${code} (${Object.keys(cfg.tiers).join(', ')}) and, if the employer recovers part of the premium from employees, employer.paidLeaveEmployeeShareFraction.${code}.`,
      );
    } else if (cfg.maxEmployeeShareFraction !== undefined && !rules.statePaidLeaveEmployee && input.employer?.paidLeaveEmployeeShareFraction?.[code] === undefined) {
      warnings.push(
        `${code} paid leave: no employee share was withheld because the employer's election is not known (the state lets the employer recover up to ${Math.round(cfg.maxEmployeeShareFraction * 100)}% from the employee). ` +
          `Send employer.paidLeaveEmployeeShareFraction.${code} if the employer charges employees.`,
      );
    }
  } else if (cfg.employerSizeGated !== false && cert.employerLiableForPaidLeaveShare === undefined) {
    warnings.push(
      `${code} paid leave: the employer's share was not computed because the engine cannot see the employer's headcount. ` +
        `Send workState.certificate.employerLiableForPaidLeaveShare (true if the employer meets ${code}'s size threshold) to add it. The employee's share, if any, is unaffected.`,
    );
  }
  return warnings;
}


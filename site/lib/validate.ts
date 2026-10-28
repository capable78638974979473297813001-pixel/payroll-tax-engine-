import { PERIODS_PER_YEAR } from '../../src/types.ts';
import type { PaycheckInput } from '../../src/types.ts';

/**
 * Request validation for POST /api/paycheck.
 *
 * The engine (calculatePaycheck) trusts its input: hand it `{}` and it
 * throws reading `ytd.electiveDeferrals` of undefined, and a raw throw
 * message is not something to hand a paying customer. This module is the
 * guard at the API edge — it turns a malformed request into a precise,
 * field-level 422 the caller can act on, and guarantees that anything
 * reaching the engine is at least shaped like a PaycheckInput.
 *
 * It validates SHAPE and TYPES, not tax correctness — the engine and its
 * data own that. Two rules it does enforce because they are the most
 * common integration mistakes:
 *   - money is integer cents, never floating-point dollars, and
 *   - a state code, if given, is one this build can actually compute.
 */

export interface FieldError {
  /** Dotted path to the offending field, e.g. "earnings[0].amount". */
  path: string;
  message: string;
}

export type ValidationResult =
  | { ok: true; value: PaycheckInput }
  | { ok: false; errors: FieldError[] };

export const PAY_FREQUENCIES = Object.keys(PERIODS_PER_YEAR);
export const EARNING_CATEGORIES = ['regular', 'supplemental', 'imputed', 'reimbursement', 'housing_allowance'];
export const PRETAX_CATEGORIES = [
  'section125', 'hsa', 'fsa', 'dependent_care',
  'deferral_401k', 'deferral_403b', 'deferral_457', 'deferral_simple', 'commuter',
];
export const FILING_STATUSES = ['single', 'married_joint', 'married_separate', 'head_of_household'];
export const EMPLOYMENT_CATEGORIES = [
  'standard', 'clergy', 'statutory_employee', 'household', 'agricultural', 'railroad', 'election_worker',
];

export interface ValidateOptions {
  /**
   * Two-letter codes this build can compute. When supplied, a workState
   * or residenceState code outside the set is rejected with a clear
   * message instead of surfacing as an engine throw.
   */
  validStateCodes?: Set<string>;
  /**
   * Tax years this build has rulesets for. When supplied, a checkDate in
   * any other year is rejected up front with the supported years named,
   * instead of reaching the engine and failing as a calculation error.
   * Withholding is decided by the check date's year, so a correction or
   * retroactive run for an earlier year needs that year's ruleset.
   */
  supportedYears?: number[];
  /**
   * Whether a state has a ruleset for a tax year. A year can be covered for
   * federal tax and only some states (2025 is), so a supported year is
   * still rejected for a work or residence state without that year's rules.
   */
  stateHasYear?: (code: string, year: number) => boolean;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function validatePaycheckInput(raw: unknown, opts: ValidateOptions = {}): ValidationResult {
  const errors: FieldError[] = [];
  const err = (path: string, message: string) => errors.push({ path, message });

  if (!isObject(raw)) {
    return { ok: false, errors: [{ path: '(body)', message: 'The request body must be a JSON object.' }] };
  }
  const body = raw as Record<string, unknown>;
  // A pension, annuity or IRA payment is withheld on its own rules and needs no W-4 or year-to-date wages.
  const isPension = body.pension !== undefined;

  // ---- integer-cents helper -------------------------------------------
  // Rejects floats (the classic "$3,000.00" → 3000 dollars mistake) and
  // negatives, with a message that shows the caller the right shape.
  const cents = (v: unknown, path: string, { allowNegative = false } = {}): void => {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      err(path, 'must be a number of integer cents (e.g. 300000 for $3,000.00).');
      return;
    }
    if (!Number.isInteger(v)) {
      err(path, `must be integer cents, not ${v} — send whole cents (e.g. 300050 for $3,000.50), never dollars.`);
      return;
    }
    if (!allowNegative && v < 0) err(path, 'must not be negative.');
  };

  // ---- checkDate -------------------------------------------------------
  if (typeof body.checkDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.checkDate)) {
    err('checkDate', 'is required and must be an ISO date, "YYYY-MM-DD".');
  } else {
    const d = new Date(body.checkDate + 'T00:00:00Z');
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== body.checkDate) {
      err('checkDate', `is not a real calendar date: "${body.checkDate}".`);
    } else if (opts.supportedYears && !opts.supportedYears.includes(d.getUTCFullYear())) {
      err(
        'checkDate',
        `falls in tax year ${d.getUTCFullYear()}, but this build only has rulesets for ${opts.supportedYears.join(', ')}. ` +
          'Checks dated in other years (including corrections and retroactive pay for earlier years) cannot be calculated yet.',
      );
    }
  }

  // ---- payFrequency ----------------------------------------------------
  if (typeof body.payFrequency !== 'string' || !PAY_FREQUENCIES.includes(body.payFrequency)) {
    err('payFrequency', `is required and must be one of: ${PAY_FREQUENCIES.join(', ')}.`);
  }

  // ---- earnings --------------------------------------------------------
  if (!Array.isArray(body.earnings)) {
    err('earnings', 'is required and must be an array (at least one earning).');
  } else if (body.earnings.length === 0) {
    err('earnings', 'must contain at least one earning.');
  } else {
    body.earnings.forEach((e, i) => {
      const p = `earnings[${i}]`;
      if (!isObject(e)) { err(p, 'must be an object { code, category, amount }.'); return; }
      if (typeof e.code !== 'string' || e.code.trim() === '') err(`${p}.code`, 'is required (a non-empty label).');
      if (typeof e.category !== 'string' || !EARNING_CATEGORIES.includes(e.category)) {
        err(`${p}.category`, `must be one of: ${EARNING_CATEGORIES.join(', ')}.`);
      }
      cents(e.amount, `${p}.amount`);
    });
  }

  // ---- deductions (may be empty) --------------------------------------
  if (!Array.isArray(body.deductions)) {
    err('deductions', 'is required and must be an array (use [] if there are none).');
  } else {
    body.deductions.forEach((d, i) => {
      const p = `deductions[${i}]`;
      if (!isObject(d)) { err(p, 'must be an object { code, category, amount }.'); return; }
      if (typeof d.code !== 'string' || d.code.trim() === '') err(`${p}.code`, 'is required (a non-empty label).');
      if (d.category !== null && (typeof d.category !== 'string' || !PRETAX_CATEGORIES.includes(d.category))) {
        err(`${p}.category`, `must be null (post-tax) or one of: ${PRETAX_CATEGORIES.join(', ')}.`);
      }
      cents(d.amount, `${p}.amount`);
    });
  }

  // Pre-tax deductions come out before tax, so they can't exceed the cash
  // pay they come out of. That is a mistake in the request, not a paycheck.
  if (errors.length === 0 && Array.isArray(body.earnings) && Array.isArray(body.deductions)) {
    const sum = (xs: unknown[], pick: (x: Record<string, unknown>) => boolean) =>
      xs.reduce<number>((t, x) => (isObject(x) && pick(x) && typeof x.amount === 'number' ? t + x.amount : t), 0);
    const cash = sum(body.earnings, (e) => e.category !== 'imputed');
    const pretax = sum(body.deductions, (d) => d.category !== null);
    if (pretax > cash) err('deductions', `pre-tax deductions (${pretax} cents) are more than the cash pay (${cash} cents).`);
  }

  // ---- federalW4 -------------------------------------------------------
  if (isPension && body.federalW4 === undefined) {
    // not needed: the pension block carries the payee's own form
  } else if (!isObject(body.federalW4)) {
    err('federalW4', 'is required and must be a Form W-4 object.');
  } else {
    const w4 = body.federalW4;
    if (typeof w4.filingStatus !== 'string' || !FILING_STATUSES.includes(w4.filingStatus)) {
      err('federalW4.filingStatus', `must be one of: ${FILING_STATUSES.join(', ')}.`);
    }
    if (typeof w4.multipleJobs !== 'boolean') err('federalW4.multipleJobs', 'must be a boolean.');
    cents(w4.dependentCredit, 'federalW4.dependentCredit');
    cents(w4.otherIncome, 'federalW4.otherIncome');
    cents(w4.deductions, 'federalW4.deductions');
    cents(w4.extraWithholding, 'federalW4.extraWithholding');
    for (const flag of ['exempt', 'nonresidentAlien', 'voluntaryWithholdingAgreement'] as const) {
      if (w4[flag] !== undefined && typeof w4[flag] !== 'boolean') err(`federalW4.${flag}`, 'must be a boolean when present.');
    }
    if (w4.legacyAllowances !== undefined) {
      if (typeof w4.legacyAllowances !== 'number' || !Number.isInteger(w4.legacyAllowances) || w4.legacyAllowances < 0 || w4.legacyAllowances > 99) {
        err('federalW4.legacyAllowances', 'must be a whole number of allowances from 0 to 99 (the line 5 count on a 2019-or-earlier Form W-4).');
      } else {
        if (w4.filingStatus === 'head_of_household') {
          err('federalW4.filingStatus', 'head_of_household does not exist on a 2019-or-earlier Form W-4. Use single or married_joint with legacyAllowances.');
        }
        if (w4.multipleJobs === true || w4.dependentCredit || w4.otherIncome || w4.deductions) {
          err('federalW4.legacyAllowances', 'means a 2019-or-earlier Form W-4, which has no Step 2 checkbox, credits, other income or deductions. Leave multipleJobs false and dependentCredit, otherIncome and deductions at 0.');
        }
      }
    }
  }

  // ---- optional: employee ----------------------------------------------
  if (body.employee !== undefined) {
    if (!isObject(body.employee)) {
      err('employee', 'must be an object { ageAtYearEnd? } when present.');
    } else if (body.employee.ageAtYearEnd !== undefined) {
      const age = body.employee.ageAtYearEnd;
      if (typeof age !== 'number' || !Number.isInteger(age) || age < 0 || age > 120) {
        err('employee.ageAtYearEnd', 'must be a whole number of years from 0 to 120: the age the employee reaches by December 31.');
      }
    }
  }

  // ---- ytd -------------------------------------------------------------
  if (isPension && body.ytd === undefined) {
    // not needed: no Social Security, Medicare, FUTA or elective-deferral limit applies to a pension payment
  } else if (!isObject(body.ytd)) {
    err('ytd', 'is required and must be a year-to-date object.');
  } else {
    cents(body.ytd.socialSecurity, 'ytd.socialSecurity');
    cents(body.ytd.medicare, 'ytd.medicare');
    cents(body.ytd.futa, 'ytd.futa');
    if (body.ytd.supplemental !== undefined) cents(body.ytd.supplemental, 'ytd.supplemental');
    if (body.ytd.electiveDeferrals !== undefined) {
      if (!isObject(body.ytd.electiveDeferrals)) {
        err('ytd.electiveDeferrals', 'must be an object { section402gAggregate?, deferral457?, simple? } of cents when present.');
      } else {
        for (const k of ['section402gAggregate', 'deferral457', 'simple'] as const) {
          if (body.ytd.electiveDeferrals[k] !== undefined) cents(body.ytd.electiveDeferrals[k], `ytd.electiveDeferrals.${k}`);
        }
      }
    }
  }

  // ---- optional: workState / residenceState ---------------------------
  const validateState = (v: unknown, path: string): void => {
    if (v === undefined) return;
    if (!isObject(v)) { err(path, 'must be an object { code, certificate? } when present.'); return; }
    if (typeof v.code !== 'string' || !/^[A-Za-z]{2}$/.test(v.code)) {
      err(`${path}.code`, 'must be a two-letter state code, e.g. "OH".');
      return;
    }
    if (opts.validStateCodes && !opts.validStateCodes.has(v.code.toUpperCase())) {
      err(`${path}.code`, `"${v.code}" is not a state this API can compute. GET /api/states for the list.`);
    } else if (opts.stateHasYear && typeof body.checkDate === 'string' && /^\d{4}-/.test(body.checkDate)) {
      const year = Number(body.checkDate.slice(0, 4));
      if (!opts.supportedYears || opts.supportedYears.includes(year)) {
        if (!opts.stateHasYear(v.code.toUpperCase(), year)) {
          err(
            `${path}.code`,
            `has no ${year} rules in this build, so a ${year} check can't be calculated for ${v.code.toUpperCase()}. ` +
              `GET /api/states?year=${year} for the states that have them.`,
          );
        }
      }
    }
    if (v.certificate !== undefined && !isObject(v.certificate)) {
      err(`${path}.certificate`, 'must be an object when present.');
    }
  };
  validateState(body.workState, 'workState');
  validateState(body.residenceState, 'residenceState');

  // ---- optional: employmentCategory -----------------------------------
  if (body.employmentCategory !== undefined) {
    if (typeof body.employmentCategory !== 'string' || !EMPLOYMENT_CATEGORIES.includes(body.employmentCategory)) {
      err('employmentCategory', `must be one of: ${EMPLOYMENT_CATEGORIES.join(', ')}.`);
    }
  }

  // ---- optional: pension (a pension, annuity or IRA payment) ----------
  if (body.pension !== undefined) {
    const p = body.pension;
    if (!isObject(p)) {
      err('pension', 'must be an object { kind, ... } when present.');
    } else {
      if (!['periodic', 'nonperiodic', 'eligible_rollover'].includes(String(p.kind))) {
        err('pension.kind', 'is required: "periodic" (Form W-4P), "nonperiodic" or "eligible_rollover" (Form W-4R).');
      }
      if (p.taxableAmount !== undefined) cents(p.taxableAmount, 'pension.taxableAmount');
      if (p.deliveredOutsideUS !== undefined && typeof p.deliveredOutsideUS !== 'boolean') err('pension.deliveredOutsideUS', 'must be a boolean when present.');
      if (p.entireAccountBalance !== undefined && typeof p.entireAccountBalance !== 'boolean') err('pension.entireAccountBalance', 'must be a boolean when present.');
      if (p.stateElection !== undefined) {
        if (!isObject(p.stateElection)) {
          err('pension.stateElection', 'must be an object when present.');
        } else {
          const e = p.stateElection;
          const known = ['none', 'percent', 'amount', 'additionalAmount', 'certificate', 'retirementExclusion'];
          for (const k of Object.keys(e)) if (!known.includes(k)) err(`pension.stateElection.${k}`, `is not a field of the state election. Fields: ${known.join(', ')}.`);
          if (e.none !== undefined && typeof e.none !== 'boolean') err('pension.stateElection.none', 'must be a boolean when present.');
          if (e.retirementExclusion !== undefined && typeof e.retirementExclusion !== 'boolean') err('pension.stateElection.retirementExclusion', 'must be a boolean when present.');
          if (e.percent !== undefined && (typeof e.percent !== 'number' || !Number.isFinite(e.percent) || e.percent <= 0 || e.percent > 100)) err('pension.stateElection.percent', 'must be a number greater than 0 and at most 100 (a percent of the taxable payment, e.g. 2.5).');
          if (e.amount !== undefined) cents(e.amount, 'pension.stateElection.amount');
          if (e.additionalAmount !== undefined) cents(e.additionalAmount, 'pension.stateElection.additionalAmount');
          if (e.certificate !== undefined && !isObject(e.certificate)) err('pension.stateElection.certificate', 'must be an object: the payee\'s state withholding certificate fields, as in residenceState.certificate.');
        }
      }
      if (p.w4p !== undefined) {
        if (!isObject(p.w4p)) {
          err('pension.w4p', 'must be an object when present.');
        } else {
          const w = p.w4p;
          if (p.kind !== undefined && p.kind !== 'periodic') err('pension.w4p', 'is the Form W-4P for periodic payments. Use pension.w4r for nonperiodic payments and eligible rollover distributions.');
          if (w.form !== undefined && w.form !== '2022_or_later' && w.form !== '2021_or_earlier') err('pension.w4p.form', 'must be "2022_or_later" or "2021_or_earlier".');
          if (w.filingStatus !== undefined && !FILING_STATUSES.includes(String(w.filingStatus))) err('pension.w4p.filingStatus', `must be one of: ${FILING_STATUSES.join(', ')}.`);
          for (const k of ['multiplePensionsAmount', 'credits', 'otherIncome', 'deductions', 'extraWithholding'] as const) {
            if (w[k] !== undefined) cents(w[k], `pension.w4p.${k}`);
          }
          if (w.maritalStatus !== undefined && w.maritalStatus !== 'single' && w.maritalStatus !== 'married') err('pension.w4p.maritalStatus', 'must be "single" or "married" (line 2 of a 2021-or-earlier Form W-4P).');
          if (w.allowances !== undefined && (typeof w.allowances !== 'number' || !Number.isInteger(w.allowances) || w.allowances < 0 || w.allowances > 99)) {
            err('pension.w4p.allowances', 'must be a whole number of allowances from 0 to 99.');
          }
          if (w.noWithholding !== undefined && typeof w.noWithholding !== 'boolean') err('pension.w4p.noWithholding', 'must be a boolean when present.');
          const old = w.form === '2021_or_earlier';
          if (old && (w.filingStatus !== undefined || w.multiplePensionsAmount !== undefined || w.credits !== undefined || w.otherIncome !== undefined || w.deductions !== undefined)) {
            err('pension.w4p', 'a 2021-or-earlier Form W-4P has only marital status, allowances and extra withholding. Use maritalStatus, allowances and extraWithholding, or set form to "2022_or_later".');
          }
          if (!old && (w.maritalStatus !== undefined || w.allowances !== undefined)) {
            err('pension.w4p', 'maritalStatus and allowances belong to a 2021-or-earlier Form W-4P. Use filingStatus, or set form to "2021_or_earlier".');
          }
        }
      }
      if (p.w4r !== undefined) {
        if (!isObject(p.w4r)) {
          err('pension.w4r', 'must be an object when present.');
        } else {
          if (p.kind === 'periodic') err('pension.w4r', 'is the Form W-4R for nonperiodic payments and eligible rollover distributions. Use pension.w4p for periodic payments.');
          const r = p.w4r.withholdingRate;
          if (r !== undefined && (typeof r !== 'number' || !Number.isInteger(r) || r < 0 || r > 100)) {
            err('pension.w4r.withholdingRate', 'must be a whole-number percent from 0 to 100 (Form W-4R line 2).');
          }
        }
      }
      if (p.kind === 'periodic' && typeof body.payFrequency === 'string' && !['monthly', 'semimonthly', 'biweekly', 'weekly', 'daily'].includes(body.payFrequency)) {
        err('payFrequency', 'a periodic pension payment can be paid monthly, semimonthly, biweekly, weekly or daily: those are the payment periods Pub 15-T lists for Worksheet 1B.');
      }
      if (Array.isArray(body.deductions) && body.deductions.some((d) => isObject(d) && d.category !== null && d.category !== undefined)) {
        err('deductions', 'a pension payment takes no pre-tax deductions. Send only post-tax deductions (category null).');
      }
      if (body.employmentCategory !== undefined && body.employmentCategory !== 'standard') {
        err('employmentCategory', 'cannot be combined with pension. A pension payment is not wages.');
      }
    }
  }

  // ---- optional: roundToWholeDollars ----------------------------------
  if (body.roundToWholeDollars !== undefined && typeof body.roundToWholeDollars !== 'boolean') {
    err('roundToWholeDollars', 'must be a boolean when present.');
  }

  // ---- optional: priorRegularPayment ----------------------------------
  if (body.priorRegularPayment !== undefined) {
    if (!isObject(body.priorRegularPayment)) {
      err('priorRegularPayment', 'must be an object when present.');
    } else {
      cents(body.priorRegularPayment.taxableWages, 'priorRegularPayment.taxableWages');
      if (body.priorRegularPayment.stateIncomeTaxWithheld !== undefined) {
        cents(body.priorRegularPayment.stateIncomeTaxWithheld, 'priorRegularPayment.stateIncomeTaxWithheld');
      }
    }
  }

  // ---- optional: residenceStateWithholding ----------------------------
  if (body.residenceStateWithholding !== undefined) {
    if (!isObject(body.residenceStateWithholding)) {
      err('residenceStateWithholding', 'must be an object { nexus?, voluntary? } when present.');
    } else {
      for (const flag of ['nexus', 'voluntary'] as const) {
        const val = body.residenceStateWithholding[flag];
        if (val !== undefined && typeof val !== 'boolean') err(`residenceStateWithholding.${flag}`, 'must be a boolean when present.');
      }
    }
  }

  // ---- optional: employer (lenient — only guard the numeric maps) -----
  if (body.employer !== undefined) {
    if (!isObject(body.employer)) {
      err('employer', 'must be an object when present.');
    } else {
      const rate = body.employer.stateUnemploymentRate;
      if (rate !== undefined) {
        if (!isObject(rate)) err('employer.stateUnemploymentRate', 'must be an object keyed by state code, e.g. { "OH": 0.031 }.');
        else for (const [code, r] of Object.entries(rate)) {
          if (typeof r !== 'number' || !Number.isFinite(r) || r < 0) {
            err(`employer.stateUnemploymentRate.${code}`, 'must be a non-negative decimal rate, e.g. 0.031 for 3.1%.');
          }
        }
      }
      const assessment = body.employer.stateUnemploymentAssessmentRate;
      if (assessment !== undefined) {
        if (!isObject(assessment)) err('employer.stateUnemploymentAssessmentRate', 'must be an object keyed by state code, e.g. { "MA": 0.01 }.');
        else for (const [code, r] of Object.entries(assessment)) {
          if (typeof r !== 'number' || !Number.isFinite(r) || r < 0) {
            err(`employer.stateUnemploymentAssessmentRate.${code}`, 'must be a non-negative decimal rate, e.g. 0.01 for 1%.');
          }
        }
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  const value = body as unknown as PaycheckInput;
  if (isPension) {
    // The engine reads neither for a pension payment; fill them so the input is whole.
    const w4 = value.federalW4 ?? { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 };
    return { ok: true, value: { ...value, federalW4: w4, ytd: value.ytd ?? { socialSecurity: 0, medicare: 0, futa: 0 } } };
  }
  return { ok: true, value };
}

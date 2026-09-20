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

const PAY_FREQUENCIES = Object.keys(PERIODS_PER_YEAR);
const EARNING_CATEGORIES = ['regular', 'supplemental', 'imputed', 'reimbursement', 'housing_allowance'];
const PRETAX_CATEGORIES = [
  'section125', 'hsa', 'fsa', 'dependent_care',
  'deferral_401k', 'deferral_403b', 'deferral_457', 'deferral_simple', 'commuter',
];
const FILING_STATUSES = ['single', 'married_joint', 'married_separate', 'head_of_household'];
const EMPLOYMENT_CATEGORIES = [
  'standard', 'clergy', 'statutory_employee', 'household', 'agricultural', 'railroad', 'election_worker',
];

export interface ValidateOptions {
  /**
   * Two-letter codes this build can compute. When supplied, a workState
   * or residenceState code outside the set is rejected with a clear
   * message instead of surfacing as an engine throw.
   */
  validStateCodes?: Set<string>;
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

  // ---- federalW4 -------------------------------------------------------
  if (!isObject(body.federalW4)) {
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
  }

  // ---- ytd -------------------------------------------------------------
  if (!isObject(body.ytd)) {
    err('ytd', 'is required and must be a year-to-date object.');
  } else {
    cents(body.ytd.socialSecurity, 'ytd.socialSecurity');
    cents(body.ytd.medicare, 'ytd.medicare');
    cents(body.ytd.futa, 'ytd.futa');
    if (body.ytd.supplemental !== undefined) cents(body.ytd.supplemental, 'ytd.supplemental');
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
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: body as unknown as PaycheckInput };
}

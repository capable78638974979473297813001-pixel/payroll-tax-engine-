import { dollars } from '../src/money.ts';
import { PERIODS_PER_YEAR } from '../src/types.ts';
import type {
  Deduction,
  Earning,
  EmploymentCategory,
  FilingStatus,
  PaycheckInput,
  PayFrequency,
  PretaxCategory,
} from '../src/types.ts';

/**
 * Turns the calculator UI's own request shape into a PaycheckInput.
 *
 * Extracted from examples/calculator-server.ts so the docs console's
 * sandbox (site/server.ts) can serve the very same calculator UI against
 * the very same conversion, rather than keeping a second, slightly
 * different copy that drifts. calculator-server.ts still owns the
 * standalone calculator; this module owns the translation both of them
 * depend on.
 */

export interface CalculatorRequest {
  checkDate: string;
  stateCode?: string;
  residenceStateCode?: string;
  /** Employer is registered/has nexus in the residence state — see input.residenceStateWithholding in types.ts. */
  residenceNexus?: boolean;
  /** No nexus, but the employer agreed to withhold the residence state's tax anyway, as a courtesy. */
  residenceVoluntary?: boolean;
  grossPayMethod: 'annual' | 'perPeriod' | 'hourly';
  grossPay: number;
  hourlyRate?: number;
  hoursPerPeriod?: number;
  payFrequency: PayFrequency;
  grossPayYTD?: number;
  employmentCategory?: EmploymentCategory;
  federalW4: {
    filingStatus: FilingStatus;
    multipleJobs?: boolean;
    dependentCredit?: number;
    otherIncome?: number;
    deductions?: number;
    extraWithholding?: number;
    exempt?: boolean;
    voluntaryWithholdingAgreement?: boolean;
  };
  roundToWholeDollars?: boolean;
  stateCertificate?: Record<string, unknown>;
  /** The RESIDENCE state's own withholding certificate — a separate object from stateCertificate (the work state's), per input.residenceState.certificate in types.ts. */
  residenceStateCertificate?: Record<string, unknown>;
  deductions?: { code: string; category: string; amount: number }[];
}

const PRETAX_CATEGORIES: readonly PretaxCategory[] = [
  'section125',
  'hsa',
  'fsa',
  'dependent_care',
  'deferral_401k',
  'deferral_403b',
  'deferral_457',
  'deferral_simple',
  'commuter',
];

/**
 * Certificate fields the engine reads with `typeof cert.X === 'string'`
 * (src/taxes/state.ts) whose VALUES also happen to look numeric — PA's PSD
 * codes and Ohio's school district codes are digit strings, not amounts.
 * Left to the generic numeric coercion below, "460101" would silently
 * become the number 460101, the string check would fail, and the engine
 * would report the tax as NOT MODELLED instead of computing it — exactly
 * the bug that made PA's local EIT/LST never fire through this form,
 * whether typed by hand or auto-filled by the address lookup.
 */
const STRING_CODE_CERTIFICATE_FIELDS = new Set(['workPSD', 'residencePSD', 'schoolDistrictCode']);

/**
 * Coerce a raw state-certificate value from the dynamic form into the type
 * the engine expects — numbers arrive as strings from HTML inputs, and a
 * checkbox arrives as a real boolean already. Everything else stays a
 * string, which is what most certificate fields (codes, marital status
 * enums) actually want.
 */
function coerceCertificateValue(key: string, raw: unknown): unknown {
  if (typeof raw === 'boolean') return raw;
  if (STRING_CODE_CERTIFICATE_FIELDS.has(key)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '' && !Number.isNaN(Number(raw)) && /^-?\d+(\.\d+)?$/.test(raw.trim())) {
    return Number(raw);
  }
  return raw;
}

export function buildPaycheckInput(body: CalculatorRequest): PaycheckInput {
  const problems: string[] = [];

  if (!body.checkDate || !/^\d{4}-\d{2}-\d{2}$/.test(body.checkDate)) {
    problems.push('checkDate must be an ISO yyyy-mm-dd string.');
  }
  if (!body.payFrequency || !(body.payFrequency in PERIODS_PER_YEAR)) {
    problems.push(`payFrequency must be one of ${Object.keys(PERIODS_PER_YEAR).join(', ')}.`);
  }
  if (!body.federalW4?.filingStatus) {
    problems.push('federalW4.filingStatus is required.');
  }
  if (problems.length > 0) {
    throw new CalculatorInputError(problems);
  }

  const periodsPerYear = PERIODS_PER_YEAR[body.payFrequency];
  let periodGrossCents: number;
  if (body.grossPayMethod === 'annual') {
    periodGrossCents = Math.round(dollars(body.grossPay) / periodsPerYear);
  } else if (body.grossPayMethod === 'hourly') {
    const rate = body.hourlyRate ?? 0;
    const hours = body.hoursPerPeriod ?? 0;
    periodGrossCents = Math.round(dollars(rate) * hours);
  } else {
    periodGrossCents = dollars(body.grossPay);
  }
  if (periodGrossCents < 0) {
    throw new CalculatorInputError(['Gross pay cannot be negative.']);
  }

  const earnings: Earning[] = [{ code: 'REG', category: 'regular', amount: periodGrossCents }];

  const deductions: Deduction[] = [];
  for (const d of body.deductions ?? []) {
    if (!d.code || !d.category || !(d.amount > 0)) continue;
    const isPosttax = d.category === 'posttax';
    if (!isPosttax && !PRETAX_CATEGORIES.includes(d.category as PretaxCategory)) {
      throw new CalculatorInputError([`Unknown deduction category "${d.category}".`]);
    }
    deductions.push({
      code: d.code,
      category: isPosttax ? null : (d.category as PretaxCategory),
      amount: dollars(d.amount),
    });
  }

  const ytdCents = dollars(body.grossPayYTD ?? 0);
  const stateCode = body.stateCode?.trim().toUpperCase() || undefined;

  // Every state's own withholding certificate has its own dollar-amount
  // fields, and the convention for those (dr0004Line2Amount, louisianaBlockA,
  // totalExemptionClaimed, ...) is a RAW dollar figure — the state's own
  // dispatch function calls dollars() on it internally. The two GENERIC
  // certificate fields applyAdditionalStateWithholding()/
  // applyReducedStateWithholding() read (src/taxes/state.ts) are the one
  // deliberate exception: those two are documented and unit-tested as
  // expecting CENTS already (certificate.additionalWithholding: dollars(15)
  // in tests/engine.test.ts), matching federalW4.extraWithholding's own
  // convention rather than the per-state fields' convention. This form only
  // ever collects a raw dollar amount from the user, so these two keys need
  // converting here rather than left to coerceCertificateValue().
  const CENTS_CERTIFICATE_FIELDS = new Set(['additionalWithholding', 'reducedWithholding']);
  const certificate: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body.stateCertificate ?? {})) {
    if (v === '' || v === undefined || v === null) continue;
    const coerced = coerceCertificateValue(k, v);
    certificate[k] = CENTS_CERTIFICATE_FIELDS.has(k) && typeof coerced === 'number' ? dollars(coerced) : coerced;
  }

  // The residence state's OWN certificate — a separate object from the work
  // state's above (input.residenceState.certificate vs
  // input.workState.certificate), read by residenceStateWithholdingLine()/
  // reciprocitySwapWithholdingLine()/residentWorkingElsewhereCreditLine() in
  // src/taxes/state.ts. Same coercion rules apply.
  const residenceCertificate: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body.residenceStateCertificate ?? {})) {
    if (v === '' || v === undefined || v === null) continue;
    const coerced = coerceCertificateValue(k, v);
    residenceCertificate[k] = CENTS_CERTIFICATE_FIELDS.has(k) && typeof coerced === 'number' ? dollars(coerced) : coerced;
  }

  const w4 = body.federalW4;
  const input: PaycheckInput = {
    checkDate: body.checkDate,
    payFrequency: body.payFrequency,
    earnings,
    deductions,
    federalW4: {
      filingStatus: w4.filingStatus,
      multipleJobs: w4.multipleJobs === true,
      dependentCredit: dollars(w4.dependentCredit ?? 0),
      otherIncome: dollars(w4.otherIncome ?? 0),
      deductions: dollars(w4.deductions ?? 0),
      extraWithholding: dollars(w4.extraWithholding ?? 0),
      ...(w4.exempt ? { exempt: true } : {}),
      ...(w4.voluntaryWithholdingAgreement ? { voluntaryWithholdingAgreement: true } : {}),
    },
    ytd: {
      socialSecurity: ytdCents,
      medicare: ytdCents,
      futa: ytdCents,
      ...(stateCode ? { stateUnemployment: { [stateCode]: ytdCents } } : {}),
    },
    ...(body.employmentCategory && body.employmentCategory !== 'standard'
      ? { employmentCategory: body.employmentCategory }
      : {}),
    ...(stateCode ? { workState: { code: stateCode, certificate } } : {}),
    ...(body.residenceStateCode
      ? { residenceState: { code: body.residenceStateCode.trim().toUpperCase(), certificate: residenceCertificate } }
      : {}),
    ...(body.residenceNexus || body.residenceVoluntary
      ? {
          residenceStateWithholding: {
            ...(body.residenceNexus ? { nexus: true } : {}),
            ...(body.residenceVoluntary ? { voluntary: true } : {}),
          },
        }
      : {}),
    ...(body.roundToWholeDollars ? { roundToWholeDollars: true } : {}),
  };

  return input;
}

export class CalculatorInputError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(problems.join(' '));
    this.name = 'CalculatorInputError';
    this.problems = problems;
  }
}

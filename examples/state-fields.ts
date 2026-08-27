/**
 * Per-state certificate field schemas for the general calculator UI.
 *
 * The engine itself reads certificate.* fields generically (see the
 * cert.foo grep across src/taxes/state.ts) — there is no single shared
 * shape, because every state's own withholding certificate is its own
 * form with its own fields and its own valid values. This file is the
 * UI-facing map from "which state is selected" to "which fields should
 * this form show, and what values are actually valid" — hand-built by
 * reading each state's own dispatch function (flatRateTwoTierExemption(),
 * marylandWithholding(), resolveCAFilingStatus(), etc.) rather than
 * guessed, so a value this form sends is one the engine actually accepts.
 *
 * Deliberately NOT exhaustive for local taxes (Denver OPT's monthly
 * aggregation, Newark's employer-only payroll tax, Kentucky's 59-jurisdiction
 * roster, etc.) — those get a compact generic "Local / Work City" section
 * instead of a bespoke one, since building 40+ individual local-tax forms
 * is a different, much larger project than this calculator.
 */

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldSpec {
  key: string;
  label: string;
  type: 'select' | 'number' | 'text' | 'checkbox';
  options?: FieldOption[];
  hint?: string;
  placeholder?: string;
}

const FILING_STATUS_SINGLE_MARRIED: FieldOption[] = [
  { value: 'single', label: 'Single' },
  { value: 'married', label: 'Married' },
];

const MARITAL_SINGLE_MARRIED: FieldSpec = {
  key: 'maritalStatus',
  label: 'Marital status (state withholding form)',
  type: 'select',
  options: FILING_STATUS_SINGLE_MARRIED,
};

const EXEMPTIONS: FieldSpec = {
  key: 'exemptions',
  label: 'Exemptions claimed',
  type: 'number',
  hint: 'From the employee’s state withholding certificate.',
};

const ALLOWANCES: FieldSpec = {
  key: 'allowances',
  label: 'Allowances claimed',
  type: 'number',
};

const DEPENDENTS: FieldSpec = {
  key: 'dependents',
  label: 'Dependents',
  type: 'number',
};

const NONRESIDENT: FieldSpec = {
  key: 'nonresident',
  label: 'Nonresident of this state',
  type: 'checkbox',
};

const WORK_CITY: FieldSpec = {
  key: 'workCity',
  label: 'Work city (local tax)',
  type: 'text',
  placeholder: 'e.g. Birmingham',
};

/** Per-state certificate field lists. Keyed by two-letter state code. */
export const STATE_FIELDS: Record<string, FieldSpec[]> = {
  AL: [
    {
      key: 'alabamaExemptionCode',
      label: 'Form A-4 exemption code',
      type: 'select',
      options: [
        { value: '0', label: '0 — none claimed' },
        { value: 'S', label: 'S — single' },
        { value: 'MS', label: 'MS — married filing separately' },
        { value: 'M', label: 'M — married' },
        { value: 'H', label: 'H — head of family' },
      ],
    },
    DEPENDENTS,
    WORK_CITY,
  ],
  AR: [EXEMPTIONS],
  AZ: [
    {
      key: 'electedRate',
      label: 'Elected withholding rate (Form A-4)',
      type: 'select',
      options: ['0.005', '0.01', '0.015', '0.02', '0.025', '0.03', '0.035'].map((v) => ({
        value: v,
        label: `${(Number(v) * 100).toFixed(1)}%`,
      })),
    },
    { key: 'zeroElection', label: 'Elected $0 withholding', type: 'checkbox' },
  ],
  CA: [
    {
      key: 'filingStatus',
      label: 'Filing status (DE 4)',
      type: 'select',
      options: [
        { value: 'single_or_married_two_incomes', label: 'Single, or married (two incomes)' },
        { value: 'married_one_income', label: 'Married (one income)' },
        { value: 'hoh', label: 'Head of household' },
      ],
    },
    { key: 'regularAllowances', label: 'Regular withholding allowances', type: 'number' },
    { key: 'estimatedDeductionAllowances', label: 'Estimated deduction allowances', type: 'number' },
  ],
  CO: [
    {
      key: 'filingStatus',
      label: 'Filing status',
      type: 'select',
      options: [
        { value: 'other', label: 'Single / other' },
        { value: 'mfj', label: 'Married filing jointly' },
      ],
    },
    { key: 'dr0004Line2Amount', label: 'DR 0004 Line 2 override ($, annual)', type: 'number' },
  ],
  CT: [
    {
      key: 'withholdingCode',
      label: 'Withholding code (Form CT-W4)',
      type: 'select',
      options: ['A', 'B', 'C', 'D', 'F'].map((v) => ({ value: v, label: v })),
    },
  ],
  DC: [ALLOWANCES, NONRESIDENT],
  DE: [EXEMPTIONS, MARITAL_SINGLE_MARRIED],
  GA: [
    {
      key: 'georgiaMaritalStatus',
      label: 'Filing status',
      type: 'select',
      options: [
        { value: 'A', label: 'Single/Married filing separately/Head of household' },
        { value: 'C', label: 'Married filing jointly, one spouse works' },
      ],
    },
    DEPENDENTS,
  ],
  HI: [
    {
      key: 'hawaiiMaritalStatus',
      label: 'Marital status',
      type: 'select',
      options: FILING_STATUS_SINGLE_MARRIED,
    },
    ALLOWANCES,
  ],
  IA: [
    {
      key: 'maritalStatus',
      label: 'Marital status (2024+ IA W-4)',
      type: 'select',
      options: [
        { value: 'other', label: 'Single / other' },
        { value: 'hoh', label: 'Head of household' },
        { value: 'mfj', label: 'Married filing jointly' },
      ],
    },
    { key: 'spouseHasEarnedIncome', label: 'Spouse has earned income', type: 'checkbox' },
    { key: 'totalAllowanceAmount', label: 'Total allowance amount ($, IA W-4 Line 7)', type: 'number' },
  ],
  ID: [
    {
      key: 'maritalStatus',
      label: 'Marital status',
      type: 'select',
      options: [
        { value: 'single', label: 'Single' },
        { value: 'hoh', label: 'Head of household' },
        { value: 'married', label: 'Married' },
      ],
    },
    ALLOWANCES,
  ],
  IL: [
    { key: 'basicAllowances', label: 'Basic allowances (Line 1)', type: 'number' },
    { key: 'additionalAllowances', label: 'Additional allowances (Line 2)', type: 'number' },
  ],
  IN: [
    { key: 'personalExemptions', label: 'Personal exemptions', type: 'number' },
    { key: 'dependentExemptions', label: 'Dependent exemptions', type: 'number' },
    { key: 'firstTimeDependentExemptions', label: 'First-time additional dependent exemptions', type: 'number' },
    { key: 'county', label: 'County (Indiana county tax)', type: 'text', placeholder: 'e.g. Marion' },
  ],
  KS: [
    {
      key: 'allowanceRate',
      label: 'Rate table',
      type: 'select',
      options: [
        { value: 'single', label: 'Single' },
        { value: 'joint', label: 'Married filing jointly' },
      ],
    },
    { key: 'personalAllowances', label: 'Personal allowances', type: 'number' },
    DEPENDENTS,
    { key: 'headOfHousehold', label: 'Head of household', type: 'checkbox' },
  ],
  KY: [],
  LA: [
    { key: 'louisianaBlockA', label: 'Block A personal exemption ($, annual)', type: 'number' },
  ],
  MA: [
    { key: 'personalExemptionCode', label: 'Personal exemption code (1–4)', type: 'number' },
    { key: 'spouseExemptionCode', label: 'Spouse exemption code (0 or 4)', type: 'number' },
    DEPENDENTS,
    { key: 'blind', label: 'Blind exemption', type: 'checkbox' },
    { key: 'headOfHousehold', label: 'Head of household', type: 'checkbox' },
  ],
  MD: [
    {
      key: 'filingStatus',
      label: 'Filing status',
      type: 'select',
      options: [
        { value: 'single', label: 'Single' },
        { value: 'mfjHoh', label: 'Married filing jointly / Head of household' },
      ],
    },
    EXEMPTIONS,
    { key: 'county', label: 'County of residence', type: 'text', placeholder: 'e.g. Allegany' },
    NONRESIDENT,
  ],
  ME: [MARITAL_SINGLE_MARRIED, ALLOWANCES],
  MI: [ALLOWANCES, { key: 'workCity', label: 'Work city (Act 284)', type: 'text' }],
  MN: [MARITAL_SINGLE_MARRIED, ALLOWANCES],
  MO: [
    {
      key: 'filingStatus',
      label: 'Filing status',
      type: 'select',
      options: [
        { value: 'single_or_married_spouse_works_or_mfs', label: 'Single / MFS / spouse also works' },
        { value: 'married_spouse_does_not_work', label: 'Married, spouse does not work' },
        { value: 'head_of_household', label: 'Head of household' },
      ],
    },
  ],
  MS: [
    {
      key: 'filingStatus',
      label: 'Filing status',
      type: 'select',
      options: [
        { value: 'single', label: 'Single' },
        { value: 'married', label: 'Married' },
        { value: 'head_of_family', label: 'Head of family' },
      ],
    },
    { key: 'totalExemptionClaimed', label: 'Total exemption claimed ($, annual)', type: 'number' },
  ],
  MT: [
    {
      key: 'filingStatus',
      label: 'Filing status (Form MW-4)',
      type: 'select',
      options: [
        { value: 'single', label: 'Single / MFS' },
        { value: 'mfj', label: 'Married filing jointly' },
      ],
    },
    { key: 'bothSpousesWorking', label: 'Both spouses working', type: 'checkbox' },
  ],
  NC: [
    {
      key: 'filingStatus',
      label: 'Filing status',
      type: 'select',
      options: [
        { value: 'single', label: 'Single / MFS' },
        { value: 'married_joint', label: 'Married filing jointly / Qualifying widow(er)' },
        { value: 'head_of_household', label: 'Head of household' },
      ],
    },
    ALLOWANCES,
  ],
  ND: [
    MARITAL_SINGLE_MARRIED,
    ALLOWANCES,
    {
      key: 'formVintage',
      label: 'W-4 vintage on file',
      type: 'select',
      options: [
        { value: 'current', label: '2020 or later' },
        { value: 'pre_2020', label: 'Before 2020' },
      ],
    },
  ],
  NE: [ALLOWANCES],
  NJ: [
    {
      key: 'filingStatus',
      label: 'Filing status',
      type: 'select',
      options: [
        { value: 'single', label: 'Single / MFS' },
        { value: 'mfj', label: 'Married filing jointly' },
        { value: 'hoh', label: 'Head of household' },
        { value: 'qw', label: 'Qualifying widow(er)' },
      ],
    },
    EXEMPTIONS,
  ],
  NM: [
    {
      key: 'filingStatus',
      label: 'Filing status',
      type: 'select',
      options: [
        { value: 'single', label: 'Single' },
        { value: 'married_joint', label: 'Married filing jointly' },
        { value: 'head_of_household', label: 'Head of household' },
      ],
    },
  ],
  NY: [
    MARITAL_SINGLE_MARRIED,
    EXEMPTIONS,
    { key: 'nycResident', label: 'New York City resident', type: 'checkbox' },
    { key: 'yonkersResident', label: 'Yonkers resident', type: 'checkbox' },
    { key: 'yonkersNonresidentWorker', label: 'Works in Yonkers, not a resident', type: 'checkbox' },
    {
      key: 'voluntaryWithholdingAgreement',
      label: 'Voluntary withholding agreement in place (household employees only)',
      type: 'checkbox',
    },
  ],
  OH: [
    EXEMPTIONS,
    { key: 'workCity', label: 'Work city (municipal income tax)', type: 'text' },
    { key: 'residenceCity', label: 'Residence city', type: 'text' },
    { key: 'schoolDistrictCode', label: 'School district code', type: 'text' },
  ],
  OK: [
    {
      key: 'filingStatus',
      label: 'Filing status',
      type: 'select',
      options: [
        { value: 'single', label: 'Single' },
        { value: 'married', label: 'Married' },
      ],
    },
    ALLOWANCES,
  ],
  OR: [MARITAL_SINGLE_MARRIED, ALLOWANCES],
  PA: [{ key: 'residencePSD', label: 'Residence PSD code (local EIT)', type: 'text' }, { key: 'workPSD', label: 'Work PSD code (local EIT)', type: 'text' }],
  RI: [EXEMPTIONS],
  SC: [ALLOWANCES],
  UT: [MARITAL_SINGLE_MARRIED],
  VA: [
    { key: 'personalExemptions', label: 'Personal exemptions', type: 'number' },
    { key: 'ageOrBlindExemptions', label: 'Age/blindness exemptions', type: 'number' },
  ],
  VT: [
    {
      key: 'maritalStatus',
      label: 'Marital status',
      type: 'select',
      options: [
        { value: 'single', label: 'Single' },
        { value: 'mfs', label: 'Married filing separately' },
        { value: 'married', label: 'Married filing jointly' },
      ],
    },
    ALLOWANCES,
  ],
  WI: [EXEMPTIONS, MARITAL_SINGLE_MARRIED],
  WV: [EXEMPTIONS, { key: 'oneEarnerElection', label: 'One-earner election', type: 'checkbox' }],
};

/** States with a real, wired local income tax the generic Work City field reaches. */
export const STATES_WITH_LOCAL_TAX = new Set(['AL', 'CO', 'DE', 'KY', 'MI', 'MO', 'OH', 'OR', 'PA', 'WV', 'NY']);

/** Two-letter codes with no state income tax at all. */
export const NO_INCOME_TAX_STATES = new Set(['AK', 'FL', 'NH', 'NV', 'SD', 'TN', 'TX', 'WA', 'WY']);

import { PERIODS_PER_YEAR } from '../../src/types.ts';
import {
  EARNING_CATEGORIES,
  EMPLOYMENT_CATEGORIES,
  FILING_STATUSES,
  PAY_FREQUENCIES,
  PRETAX_CATEGORIES,
} from './validate.ts';
import { MAX_ORDERS, OCCUPATIONS, ORDER_TYPES } from './extras.ts';

/**
 * The machine-readable description of the public API: a JSON Schema for the
 * POST /v1/paycheck request body and an OpenAPI 3.1 document around it.
 *
 * Every enum below is read from the constants the validator itself uses
 * (site/lib/validate.ts, site/lib/extras.ts), so the published contract cannot
 * list a value the server rejects or omit one it accepts. tests/api-spec.test.ts
 * also runs every example through the real validator.
 *
 * The schema describes SHAPE and TYPES, the same scope as the validator. Tax
 * correctness, and the state-specific certificate fields, belong to the engine
 * and its data.
 */

const BASE = 'https://api.omnia.tax';

const cents = (description: string, extra: Record<string, unknown> = {}) => ({
  type: 'integer',
  minimum: 0,
  description: `${description} Integer cents, never dollars: $3,000.00 is 300000.`,
  ...extra,
});
const stateKeyedCents = (description: string) => ({
  type: 'object',
  description,
  propertyNames: { pattern: '^[A-Z]{2}$' },
  additionalProperties: cents('Year-to-date wages for that state.'),
});
const stateKeyedRate = (description: string, example: Record<string, number>) => ({
  type: 'object',
  description,
  propertyNames: { pattern: '^[A-Z]{2}$' },
  additionalProperties: { type: 'number', minimum: 0, maximum: 1 },
  examples: [example],
});

const stateWithholding = (which: string) => ({
  type: 'object',
  required: ['code'],
  description: which,
  properties: {
    code: {
      type: 'string',
      pattern: '^[A-Za-z]{2}$',
      description: 'Two-letter state code. GET /v1/states lists the states, and the years each has rules for.',
      examples: ['OH'],
    },
    certificate: {
      type: 'object',
      description:
        "The employee's state withholding certificate, as the state's own form defines it. The fields differ by state " +
        '(Pennsylvania reads workPSD and residencePSD; Ohio reads workCity and residenceCity; New York reads maritalStatus and nycResident). ' +
        'POST /v1/address resolves a street address into this object. A field the engine needs and cannot find is a 422 cannot_compute that names it.',
      additionalProperties: true,
    },
  },
  additionalProperties: false,
});

export const paycheckRequestSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: `${BASE}/v1/schemas/paycheck-request.json`,
  title: 'PaycheckRequest',
  description:
    'Body of POST /v1/paycheck: one employee, one pay date. All money is integer cents. ' +
    'Unknown top-level fields are ignored by the server, so a misspelled optional field does nothing: check the names against this schema.',
  type: 'object',
  required: ['checkDate', 'payFrequency', 'earnings', 'deductions', 'federalW4', 'ytd'],
  properties: {
    checkDate: {
      type: 'string',
      format: 'date',
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      description:
        'The pay date, YYYY-MM-DD. Its calendar year picks the tax rules, so a correction for an earlier year needs that year’s date. ' +
        'GET /v1/states?year=YYYY shows which years each state has.',
      examples: ['2026-09-15'],
    },
    payFrequency: {
      enum: [...PAY_FREQUENCIES],
      description: `How often this employee is paid. Pay periods per year: ${PAY_FREQUENCIES.map((f) => `${f} ${PERIODS_PER_YEAR[f as keyof typeof PERIODS_PER_YEAR]}`).join(', ')}.`,
    },
    earnings: {
      type: 'array',
      minItems: 1,
      description: 'Pay for this period, one line per earning code.',
      items: {
        type: 'object',
        required: ['code', 'category', 'amount'],
        properties: {
          code: { type: 'string', minLength: 1, description: 'Your label for the earning, e.g. "REG", "BONUS".', examples: ['REG'] },
          category: {
            enum: [...EARNING_CATEGORIES],
            description:
              'regular: ordinary wages. supplemental: bonus or commission, which some taxes treat differently. ' +
              'imputed: taxable but not paid in cash (group-term life over $50,000). ' +
              'reimbursement: paid in cash, not taxable. housing_allowance: a minister’s housing allowance (employmentCategory "clergy" only).',
          },
          amount: cents('Amount for this period.'),
          overtime: { type: 'boolean', description: 'Overtime pay. Only a state rule that excludes overtime reads it.' },
        },
        additionalProperties: false,
      },
    },
    deductions: {
      type: 'array',
      description: 'Deductions from pay. Send [] when there are none. Pre-tax ones may not exceed the cash pay.',
      items: {
        type: 'object',
        required: ['code', 'category', 'amount'],
        properties: {
          code: { type: 'string', minLength: 1, examples: ['401K'] },
          category: {
            oneOf: [{ enum: [...PRETAX_CATEGORIES] }, { type: 'null' }],
            description:
              'Which tax base a pre-tax deduction reduces. null means post-tax: it lowers net pay and no tax base. ' +
              'The same dollar can reduce one tax and not another, so the category matters.',
          },
          amount: cents('Amount for this period.'),
        },
        additionalProperties: false,
      },
    },
    federalW4: {
      type: 'object',
      description: 'The employee’s Form W-4. All six core fields are required.',
      required: ['filingStatus', 'multipleJobs', 'dependentCredit', 'otherIncome', 'deductions', 'extraWithholding'],
      properties: {
        filingStatus: { enum: [...FILING_STATUSES] },
        multipleJobs: { type: 'boolean', description: 'Step 2 checkbox: two jobs, or a working spouse.' },
        dependentCredit: cents('Step 3: the ANNUAL credit for dependents.'),
        otherIncome: cents('Step 4(a): other ANNUAL income.'),
        deductions: cents('Step 4(b): ANNUAL deductions beyond the standard deduction.'),
        extraWithholding: cents('Step 4(c): extra withholding PER PAY PERIOD.'),
        exempt: { type: 'boolean', description: 'The employee claimed exempt from federal income tax withholding.' },
        nonresidentAlien: { type: 'boolean', description: 'Nonresident alien employee: applies the IRS Pub 15-T adjustment.' },
        legacyAllowances: {
          type: 'integer',
          minimum: 0,
          maximum: 99,
          description:
            'The allowance count (line 5) from a 2019-or-earlier Form W-4, for an employee who never filed a 2020-or-later form. ' +
            'Uses Pub 15-T Worksheet 1A lines 1j-1l. Then multipleJobs is false, dependentCredit, otherIncome and deductions are 0, ' +
            'filingStatus is single or married_joint, and extraWithholding is the old line 6.',
        },
        voluntaryWithholdingAgreement: {
          type: 'boolean',
          description: 'A voluntary withholding agreement. Read only for employmentCategory "clergy".',
        },
      },
      additionalProperties: false,
    },
    ytd: {
      type: 'object',
      description: 'Year-to-date figures before this check, which drive wage-base caps. Send zeros at the start of the year.',
      required: ['socialSecurity', 'medicare', 'futa'],
      properties: {
        socialSecurity: cents('Wages already subject to Social Security tax this year.'),
        medicare: cents('Wages already subject to Medicare tax this year.'),
        futa: cents('Wages already subject to FUTA this year.'),
        supplemental: cents('Supplemental wages paid so far this year. Drives the 37% rate above $1,000,000.'),
        electiveDeferrals: {
          type: 'object',
          description:
            'Retirement deferrals already made at this employer this year, so the annual limit can be applied. A deduction past the limit is taxed as ordinary pay.',
          properties: {
            section402gAggregate: cents('401(k), 403(b) and SIMPLE deferrals together.'),
            deferral457: cents('457(b) deferrals.'),
            simple: cents('SIMPLE plan deferrals (also counted in section402gAggregate).'),
          },
          additionalProperties: false,
        },
        stateUnemployment: stateKeyedCents('Wages already subject to state unemployment tax, by state code.'),
        statePaidLeave: stateKeyedCents('Wages already counted toward a state paid-leave wage cap, by state code.'),
        stateDisabilityEmployee: stateKeyedCents('Wages already counted toward a state disability wage cap, by state code.'),
        stateLongTermCare: stateKeyedCents('Wages already counted toward a state long-term-care wage cap, by state code.'),
        categoryCashWages: cents('Cash wages paid to this household or agricultural worker so far this year.'),
        tier2Compensation: cents('Railroad Tier II compensation so far this year.'),
        railroadMonthlyCompensation: cents('Railroad unemployment compensation so far THIS CALENDAR MONTH.'),
        seattleCompensation: cents('This employee’s Seattle compensation so far this year.'),
      },
      additionalProperties: true,
    },
    workState: stateWithholding('Where the work is performed. Its income tax, local taxes and employer-side state taxes apply.'),
    residenceState: stateWithholding('Where the employee lives, when that differs from the work state.'),
    residenceStateWithholding: {
      type: 'object',
      description: 'Whether the residence state also withholds.',
      properties: {
        nexus: { type: 'boolean', description: 'The employer has a presence in the residence state.' },
        voluntary: { type: 'boolean', description: 'The employee asked for residence-state withholding.' },
      },
      additionalProperties: false,
    },
    employmentCategory: {
      enum: [...EMPLOYMENT_CATEGORIES],
      default: 'standard',
      description: 'Selects whole sets of federal and state rules. A misspelling is a 422, never a silent fallback.',
    },
    employee: {
      type: 'object',
      description: 'Facts about the employee that raise a federal limit.',
      properties: {
        ageAtYearEnd: {
          type: 'integer',
          minimum: 0,
          maximum: 120,
          description:
            'The age the employee reaches by December 31 of the check year. 50 and over raises the 401(k), 403(b), 457(b) and SIMPLE deferral limits; 60 through 63 raises them further. Absent, the standard limits apply.',
        },
      },
      additionalProperties: false,
    },
    employer: {
      type: 'object',
      description: 'Facts about the employer, which only the employer has.',
      properties: {
        stateUnemploymentRate: stateKeyedRate(
          "The employer's assigned state unemployment rate by state code, as a decimal: 0.031 is 3.1%. Absent, the state's new-employer rate is used and the line says so.",
          { OH: 0.031 },
        ),
        stateUnemploymentAssessmentRate: stateKeyedRate(
          'A separate assessment some states add to the unemployment rate (Massachusetts), by state code.',
          { MA: 0.01 },
        ),
        stateUnemploymentQualifiedForReducedWageBase: { type: 'object', additionalProperties: { type: 'boolean' } },
        supplementalFlatRateElection: {
          type: 'object',
          description: 'By state code: true to use a state’s optional flat supplemental rate instead of aggregating.',
          additionalProperties: { type: 'boolean' },
        },
        quarterlyHeadFeeCollection: {
          type: 'object',
          description: 'By state code: how a flat quarterly per-employee fee is collected on this check.',
          additionalProperties: { enum: ['prorated', 'full', 'skip'] },
        },
        householdQuarterlyCashWages: cents('Cash wages paid to all household employees this quarter before this check.'),
        agriculturalTotalWages: cents('Wages paid to all farmworkers this year.'),
      },
      additionalProperties: true,
    },
    priorRegularPayment: {
      type: 'object',
      description:
        'For a bonus or other supplemental check paid apart from regular pay: the taxable wages and state tax of the regular check it is aggregated with.',
      required: ['taxableWages'],
      properties: {
        taxableWages: cents('Taxable wages of that earlier check.'),
        stateIncomeTaxWithheld: cents('State income tax already withheld on that check.'),
      },
      additionalProperties: false,
    },
    hoursWorked: { type: 'number', minimum: 0, description: 'Hours worked in the period, for the few rules that need them.' },
    roundToWholeDollars: { type: 'boolean', description: 'Round state withholding to whole dollars where the state requires it.' },
    garnishments: {
      type: 'array',
      maxItems: MAX_ORDERS,
      description:
        'Wage garnishment orders, run against this paycheck in the same call and the same billed unit. Needs workState.code. ' +
        'Child support, then ordinary garnishments, are limited by the federal and state ceilings.',
      items: {
        type: 'object',
        required: ['id', 'type', 'amountOrdered'],
        properties: {
          id: { type: 'string', minLength: 1, maxLength: 64, description: 'Your identifier for the order. Unique within the request.' },
          type: { enum: [...ORDER_TYPES] },
          amountOrdered: cents('What the order demands this period. Use a very large number to mean "the maximum the law allows".'),
          supportingOtherFamily: {
            type: 'boolean',
            description: 'REQUIRED for child_support: 50% ceiling when the employee supports another spouse or child, 60% when not. Never assumed.',
          },
          arrearsOver12Weeks: { type: 'boolean' },
          headOfFamily: { type: 'boolean' },
          wageExemptionWaivedInWriting: { type: 'boolean' },
          soleHouseholdSupport: { type: 'boolean' },
          dependents: { type: 'integer', minimum: 0 },
          householdSize: { type: 'integer', minimum: 0 },
          priority: { type: 'integer', minimum: 0 },
          expectedAnnualEarnings: cents('Expected annual earnings, where a state formula uses them.'),
          garnishedThisYearForThisOrder: cents('Already garnished this year for this order, where a state caps the year.'),
        },
        additionalProperties: true,
      },
    },
    minimumWageCheck: {
      type: 'object',
      description: 'Compare an hourly rate with the binding federal, state and local minimum wage on the same call. Needs workState.code.',
      required: ['hourlyRate'],
      properties: {
        hourlyRate: cents('The employee’s hourly rate: $15.00 is 1500.'),
        locality: { type: 'string', maxLength: 120, description: 'A local ordinance id or name, e.g. "seattle". Omit and no local ordinance is applied.' },
        employeeCount: { type: 'integer', minimum: 0, description: 'Employer headcount, where an ordinance has size tiers.' },
        tipped: { type: 'boolean', description: 'Compare with the tipped CASH floor.' },
        region: { type: 'string', maxLength: 120, description: 'A named sub-region such as New York "downstate" or Oregon "portland_metro".' },
        industry: { type: 'string', maxLength: 120, description: 'American Samoa only.' },
        occupation: { enum: [...OCCUPATIONS] },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: true,
  examples: [] as unknown[],
};

/** Complete, valid example bodies, shown in the schema and the OpenAPI document. tests/api-spec.test.ts runs each through the validator and the engine. */
export const paycheckRequestExamples: Record<string, { summary: string; value: Record<string, unknown> }> = {
  salariedOhio: {
    summary: 'Biweekly salary in Columbus, Ohio, with a 401(k) deferral',
    value: {
      checkDate: '2026-09-15',
      payFrequency: 'biweekly',
      earnings: [{ code: 'REG', category: 'regular', amount: 300000 }],
      deductions: [{ code: '401K', category: 'deferral_401k', amount: 24000 }],
      federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
      ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
      workState: { code: 'OH', certificate: { residenceCity: 'Columbus', workCity: 'Columbus' } },
    },
  },
  bonusLateInYear: {
    summary: 'A bonus paid with regular pay late in the year, with year-to-date wages and the employer’s own unemployment rate',
    value: {
      checkDate: '2026-11-13',
      payFrequency: 'biweekly',
      earnings: [
        { code: 'REG', category: 'regular', amount: 300000 },
        { code: 'BONUS', category: 'supplemental', amount: 500000 },
      ],
      deductions: [
        { code: 'MED', category: 'section125', amount: 15000 },
        { code: 'ADV', category: null, amount: 5000 },
      ],
      federalW4: { filingStatus: 'married_joint', multipleJobs: false, dependentCredit: 400000, otherIncome: 0, deductions: 0, extraWithholding: 2500 },
      ytd: { socialSecurity: 7800000, medicare: 7800000, futa: 700000, supplemental: 0, stateUnemployment: { OH: 900000 } },
      employer: { stateUnemploymentRate: { OH: 0.031 } },
      workState: { code: 'OH', certificate: { residenceCity: 'Columbus', workCity: 'Columbus' } },
    },
  },
  garnishmentAndMinimumWage: {
    summary: 'Weekly hourly pay with a child support order and a minimum-wage check',
    value: {
      checkDate: '2026-09-15',
      payFrequency: 'weekly',
      earnings: [{ code: 'REG', category: 'regular', amount: 60000 }],
      deductions: [],
      federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
      ytd: { socialSecurity: 1800000, medicare: 1800000, futa: 700000 },
      workState: { code: 'TX' },
      garnishments: [{ id: 'order-1', type: 'child_support', amountOrdered: 15000, supportingOtherFamily: false }],
      minimumWageCheck: { hourlyRate: 1500 },
    },
  },
};
paycheckRequestSchema.examples = Object.values(paycheckRequestExamples).map((e) => e.value);

const fieldError = {
  type: 'object',
  required: ['path', 'message'],
  properties: {
    path: { type: 'string', description: 'Dotted path to the field, e.g. "earnings[0].amount".', examples: ['earnings[0].amount'] },
    message: { type: 'string', examples: ['must be integer cents, not 3000.5 — send whole cents (e.g. 300050 for $3,000.50), never dollars.'] },
  },
};

const errorResponse = (description: string, code: string, extra: Record<string, unknown> = {}) => ({
  description,
  headers: { 'X-Omnia-Version': { $ref: '#/components/headers/XOmniaVersion' } },
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/Error' },
      example: { error: description, code, requestId: 'req_01J9Z6Q8X3', ...extra },
    },
  },
});

const bearer = [{ bearerAuth: [] }];

export function openApiDocument(version: string): Record<string, unknown> {
  const schema = JSON.parse(JSON.stringify(paycheckRequestSchema)) as Record<string, unknown>;
  delete schema.$schema;
  delete schema.$id;
  delete schema.examples;
  return {
    openapi: '3.1.0',
    info: {
      title: 'Omnia.tax API',
      version,
      summary: 'US payroll taxes for one paycheck: federal, state and local, with garnishment and minimum-wage checks.',
      description:
        'Every amount is an integer number of cents. Send `Authorization: Bearer <key>`. ' +
        'Each response carries `X-Omnia-Version`; `RateLimit-Limit` and `RateLimit-Remaining` show the per-minute budget. ' +
        'Validation failures are `422` with a `details` array of `{ path, message }`, one entry per field.',
    },
    servers: [{ url: BASE }],
    security: bearer,
    paths: {
      '/v1/paycheck': {
        post: {
          operationId: 'calculatePaycheck',
          summary: 'Calculate a paycheck',
          description:
            'Returns each federal, state and local tax for one paycheck, with totals and net pay. Optional `garnishments` and `minimumWageCheck` are answered in the same call and billed as one call.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PaycheckRequest' },
                examples: paycheckRequestExamples,
              },
            },
          },
          responses: {
            '200': {
              description: 'The calculation.',
              headers: {
                'X-Omnia-Version': { $ref: '#/components/headers/XOmniaVersion' },
                'RateLimit-Limit': { schema: { type: 'integer' }, description: 'Calls allowed per minute.' },
                'RateLimit-Remaining': { schema: { type: 'integer' }, description: 'Calls left in this window.' },
              },
              content: { 'application/json': { schema: { $ref: '#/components/schemas/PaycheckResponse' } } },
            },
            '400': errorResponse('The body is not valid JSON.', 'invalid_json'),
            '401': errorResponse('No key, an invalid key, or an expired key.', 'invalid_key'),
            '402': errorResponse('No payment method on file, or the subscription is cancelled or suspended.', 'payment_method_required'),
            '422': {
              description:
                'The body failed validation (`invalid_input`, with `details`), the year has no rules (`unsupported_tax_year`), or the input is valid but the engine cannot compute it (`cannot_compute`, which names the missing certificate field).',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                  examples: {
                    invalidInput: {
                      summary: 'Dollars sent where cents are required',
                      value: {
                        error: 'The request did not pass validation.',
                        code: 'invalid_input',
                        details: [{ path: 'earnings[0].amount', message: 'must be integer cents, not 3000.5 — send whole cents (e.g. 300050 for $3,000.50), never dollars.' }],
                        requestId: 'req_01J9Z6Q8X3',
                      },
                    },
                  },
                },
              },
            },
            '429': {
              description: 'Too many requests this minute.',
              headers: { 'Retry-After': { schema: { type: 'integer' }, description: 'Seconds to wait.' } },
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
            },
          },
        },
      },
      '/v1/address': {
        post: {
          operationId: 'resolveAddress',
          summary: 'Resolve a work (and home) address into a state and certificate',
          description: 'Returns the `workState` object to put on a paycheck request. Recorded, not metered.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  minProperties: 1,
                  properties: {
                    workAddress: { type: 'string', maxLength: 200, examples: ['77 E Gay St, Columbus, OH 43215'] },
                    residenceAddress: { type: 'string', maxLength: 200 },
                    checkDate: { type: 'string', format: 'date', description: 'Defaults to today.' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'The resolved jurisdictions.', content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
            '422': errorResponse('Send workAddress, residenceAddress, or both, as one-line street addresses.', 'invalid_input'),
          },
        },
      },
      '/v1/states': {
        get: {
          operationId: 'listStates',
          summary: 'States with rules, for a tax year',
          security: [],
          parameters: [{ name: 'year', in: 'query', schema: { type: 'integer' }, description: 'Defaults to the latest year with rules.' }],
          responses: { '200': { description: 'The states.', content: { 'application/json': { schema: { type: 'object', required: ['year', 'states'], properties: { year: { type: 'integer' }, states: { type: 'array', items: { type: 'object', properties: { code: { type: 'string' }, name: { type: 'string' }, rateLabel: { type: 'string' }, reciprocalStates: { type: 'array', items: { type: 'string' } } } } } } } } } } },
        },
      },
      '/v1/me': {
        get: {
          operationId: 'whoAmI',
          summary: 'The key making the request',
          responses: { '200': { description: 'Key details and recent usage.', content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } }, '401': errorResponse('Missing or invalid key.', 'missing_key') },
        },
      },
      '/v1/health': {
        get: { operationId: 'health', summary: 'Liveness', security: [], responses: { '200': { description: 'The service is up.' } } },
      },
    },
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', description: 'An API key from the console, sent as `Authorization: Bearer <key>`.' } },
      headers: { XOmniaVersion: { schema: { type: 'string' }, description: 'The API version that served the request.' } },
      schemas: {
        PaycheckRequest: schema,
        PaycheckResponse: {
          type: 'object',
          required: ['result'],
          properties: {
            result: {
              type: 'object',
              required: ['checkDate', 'grossPay', 'pretaxDeductions', 'posttaxDeductions', 'taxes', 'employeeTaxTotal', 'employerTaxTotal', 'netPay'],
              properties: {
                checkDate: { type: 'string', format: 'date' },
                grossPay: { type: 'integer', description: 'Total earnings in cents.' },
                pretaxDeductions: { type: 'integer' },
                posttaxDeductions: { type: 'integer' },
                electiveDeferrals: {
                  type: 'object',
                  description: 'Present when the check had retirement deferrals: what stayed pretax after the annual limits, in cents. Add these to ytd.electiveDeferrals for the next check.',
                  properties: {
                    section402gAggregate: { type: 'integer' },
                    deferral457: { type: 'integer' },
                    simple: { type: 'integer' },
                  },
                },
                taxes: { type: 'array', items: { $ref: '#/components/schemas/TaxLine' } },
                employeeTaxTotal: { type: 'integer', description: 'Sum of the employee-paid taxes, in cents.' },
                employerTaxTotal: { type: 'integer', description: 'Sum of the employer-paid taxes, in cents. Not deducted from net pay.' },
                netPay: { type: 'integer', description: 'Gross pay less employee taxes and deductions, in cents.' },
                notices: {
                  type: 'array',
                  description: 'Lines whose rate rests on a weaker source than the levying body’s own form.',
                  items: { type: 'object', required: ['taxId', 'tier', 'note'], properties: { taxId: { type: 'string' }, tier: { enum: ['secondary_source', 'inferred', 'not_modelled', 'conflicting_sources'] }, note: { type: 'string' } } },
                },
                warnings: { type: 'array', items: { type: 'string' }, description: 'Inputs that need a second look, and provisional-year notices.' },
                garnishment: { type: 'object', additionalProperties: true, description: 'Present when `garnishments` was sent.' },
                minimumWage: { type: 'object', additionalProperties: true, description: 'Present when `minimumWageCheck` was sent.' },
              },
            },
          },
        },
        TaxLine: {
          type: 'object',
          required: ['id', 'name', 'payer', 'jurisdiction', 'taxableWages', 'amount'],
          properties: {
            id: { type: 'string', description: 'Stable identifier, e.g. US_FIT, OH_SIT, OH_LOCAL.', examples: ['US_FIT'] },
            name: { type: 'string' },
            payer: { enum: ['employee', 'employer'] },
            jurisdiction: { enum: ['federal', 'state', 'local'] },
            taxableWages: { type: 'integer', description: 'The wages this tax was computed on, in cents.' },
            amount: { type: 'integer', description: 'The tax, in cents.' },
            detail: { type: 'string', description: 'How the amount was reached, in words.' },
          },
        },
        Error: {
          type: 'object',
          required: ['error', 'code'],
          properties: {
            error: { type: 'string', description: 'A message for a person.' },
            code: {
              type: 'string',
              description: 'A stable value to branch on.',
              examples: ['invalid_json', 'invalid_input', 'unsupported_tax_year', 'cannot_compute', 'missing_key', 'invalid_key', 'expired_key', 'payment_method_required', 'rate_limited'],
            },
            details: { type: 'array', items: fieldError, description: 'One entry per invalid field, on `invalid_input`.' },
            requestId: { type: 'string', description: 'Quote this when contacting support.' },
          },
        },
      },
    },
  };
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

/**
 * Top-level fields in a request body that the API does not read, each with the
 * nearest real field when one is close. The server has always ignored them, so a
 * misspelled optional field ("roundToWholeDollar") used to change nothing and say
 * nothing. Reported as a warning on the response, never an error, so a client that
 * sends extra fields keeps working.
 */
export function unknownFieldWarnings(body: Record<string, unknown>): string[] {
  const known = Object.keys(paycheckRequestSchema.properties);
  const out: string[] = [];
  for (const key of Object.keys(body)) {
    if (known.includes(key)) continue;
    const near = known
      .map((k) => ({ k, d: editDistance(key.toLowerCase(), k.toLowerCase()) }))
      .sort((x, y) => x.d - y.d)[0];
    const close = near && near.d <= Math.max(2, Math.floor(near.k.length / 4));
    out.push(
      `Unrecognized request field "${key}" was ignored.` + (close ? ` Did you mean "${near.k}"?` : ' See GET /v1/schemas/paycheck-request.json for the fields this endpoint reads.'),
    );
  }
  return out;
}

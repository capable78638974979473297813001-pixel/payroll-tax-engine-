import { createServer } from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { calculatePaycheck } from '../src/calculate.ts';
import { dollars } from '../src/money.ts';
import { PERIODS_PER_YEAR } from '../src/types.ts';
import { resolveAddress } from '../geocode/index.ts';
import type {
  Deduction,
  Earning,
  EmploymentCategory,
  FilingStatus,
  PaycheckInput,
  PayFrequency,
  PretaxCategory,
} from '../src/types.ts';
import { STATE_FIELDS, STATES_WITH_LOCAL_TAX, NO_INCOME_TAX_STATES } from './state-fields.ts';

/**
 * A general, any-state paycheck calculator UI, backed directly by this
 * repo's own calculatePaycheck() — no separate tax logic lives in this
 * server. Every state in data/states/*.json is selectable; picking none
 * runs federal taxes only, same as leaving workState off a PaycheckInput.
 *
 *   npm run ui:calculator
 *   then open http://localhost:4322
 */

const PORT = Number(process.env.PORT ?? 4322);
const HERE = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = join(HERE, 'calculator-ui.html');
const DATA_STATES_DIR = join(HERE, '..', 'data', 'states');

function sendJson(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error('Request body too large.'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

/** Every state this repo has a 2026 ruleset for, with a friendly name. */
function listStates(): { code: string; name: string; hasIncomeTax: boolean }[] {
  const files = readdirSync(DATA_STATES_DIR).filter((f) => f.endsWith('-2026.json'));
  return files
    .map((f) => {
      const raw = JSON.parse(readFileSync(join(DATA_STATES_DIR, f), 'utf8')) as {
        code: string;
        name: string;
      };
      return {
        code: raw.code,
        name: raw.name,
        hasIncomeTax: !NO_INCOME_TAX_STATES.has(raw.code),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * URL slugs matching paycheckcity.com's own /calculator/salary/<slug>
 * scheme exactly (confirmed against their live "Change state" list) — a
 * plain kebab-case of the state name, except the District of Columbia,
 * which PaycheckCity slugs as "washington-dc" rather than the literal
 * "district-of-columbia".
 */
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
function stateSlug(code: string, name: string): string {
  return code === 'DC' ? 'washington-dc' : slugify(name);
}
function slugToCode(slug: string): string | undefined {
  return listStates().find((s) => stateSlug(s.code, s.name) === slug)?.code;
}

interface CalculatorRequest {
  checkDate: string;
  stateCode?: string;
  residenceStateCode?: string;
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
  };
  roundToWholeDollars?: boolean;
  stateCertificate?: Record<string, unknown>;
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
 * Coerce a raw state-certificate value from the dynamic form into the type
 * the engine expects — numbers arrive as strings from HTML inputs, and a
 * checkbox arrives as a real boolean already. Everything else stays a
 * string, which is what most certificate fields (codes, marital status
 * enums) actually want.
 */
function coerceCertificateValue(raw: unknown): unknown {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string' && raw.trim() !== '' && !Number.isNaN(Number(raw)) && /^-?\d+(\.\d+)?$/.test(raw.trim())) {
    return Number(raw);
  }
  return raw;
}

function buildPaycheckInput(body: CalculatorRequest): PaycheckInput {
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
    const coerced = coerceCertificateValue(v);
    certificate[k] = CENTS_CERTIFICATE_FIELDS.has(k) && typeof coerced === 'number' ? dollars(coerced) : coerced;
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
      ? { residenceState: { code: body.residenceStateCode.trim().toUpperCase() } }
      : {}),
    ...(body.roundToWholeDollars ? { roundToWholeDollars: true } : {}),
  };

  return input;
}

class CalculatorInputError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(problems.join(' '));
    this.name = 'CalculatorInputError';
    this.problems = problems;
  }
}

const server = createServer(async (req, res) => {
  try {
    const salaryPath = req.url?.match(/^\/calculator\/salary(?:\/([a-z-]+))?(?:\/result)?\/?(?:\?.*)?$/);

    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html' || salaryPath)) {
      if (salaryPath?.[1] && !slugToCode(salaryPath[1])) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end(`Not found: no state matches "/calculator/salary/${salaryPath[1]}"`);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(readFileSync(HTML_PATH, 'utf8'));
      return;
    }

    if (req.method === 'GET' && req.url === '/api/states') {
      sendJson(res, 200, {
        states: listStates().map((s) => ({ ...s, slug: stateSlug(s.code, s.name) })),
      });
      return;
    }

    if (req.method === 'GET' && req.url?.startsWith('/api/state-fields/')) {
      const code = decodeURIComponent(req.url.split('/').pop() ?? '').toUpperCase();
      sendJson(res, 200, {
        fields: STATE_FIELDS[code] ?? [],
        hasLocalTax: STATES_WITH_LOCAL_TAX.has(code),
        hasIncomeTax: !NO_INCOME_TAX_STATES.has(code),
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/resolve-address') {
      const raw = await readBody(req);
      let body: { address?: string; checkDate?: string };
      try {
        body = JSON.parse(raw);
      } catch {
        sendJson(res, 400, { error: 'Request body was not valid JSON.' });
        return;
      }
      const address = body.address?.trim();
      if (!address) {
        sendJson(res, 422, { error: 'address is required.' });
        return;
      }
      try {
        const result = await resolveAddress(address, 'work', body.checkDate || new Date().toISOString().slice(0, 10));
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 502, {
          error: err instanceof Error ? err.message : 'Address lookup failed.',
        });
      }
      return;
    }

    if (req.method === 'POST' && req.url === '/api/calculate') {
      const raw = await readBody(req);
      let body: CalculatorRequest;
      try {
        body = JSON.parse(raw);
      } catch {
        sendJson(res, 400, { error: 'Request body was not valid JSON.' });
        return;
      }
      try {
        const input = buildPaycheckInput(body);
        const result = calculatePaycheck(input);
        sendJson(res, 200, { result, input });
      } catch (err) {
        if (err instanceof CalculatorInputError) {
          sendJson(res, 422, { error: err.message, problems: err.problems });
          return;
        }
        if (err instanceof Error) {
          sendJson(res, 422, { error: err.message, problems: [err.message] });
          return;
        }
        throw err;
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err instanceof Error ? err.message : 'Unknown server error' });
  }
});

server.listen(PORT, () => {
  console.log(`\nPaycheck calculator running at http://localhost:${PORT}\n`);
});

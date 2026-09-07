import { createServer } from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { calculatePaycheck } from '../src/calculate.ts';
import { dollars } from '../src/money.ts';
import { PERIODS_PER_YEAR } from '../src/types.ts';
import { resolveEmployee } from '../geocode/index.ts';
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
import {
  buildPaycheckInput,
  CalculatorInputError,
  type CalculatorRequest,
} from './calculator-input.ts';

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
      let body: { workAddress?: string; residenceAddress?: string; checkDate?: string };
      try {
        body = JSON.parse(raw);
      } catch {
        sendJson(res, 400, { error: 'Request body was not valid JSON.' });
        return;
      }
      const workAddress = body.workAddress?.trim() || undefined;
      const residenceAddress = body.residenceAddress?.trim() || undefined;
      if (!workAddress && !residenceAddress) {
        sendJson(res, 422, { error: 'At least one of workAddress/residenceAddress is required.' });
        return;
      }
      try {
        // resolveEmployee() (not resolveAddress()) because several taxes are
        // keyed off comparing BOTH addresses at once — e.g. Yonkers'
        // resident-vs-nonresident-worker split, which is undefined if the
        // two addresses are resolved independently rather than together.
        const result = await resolveEmployee(
          { work: workAddress, residence: residenceAddress },
          body.checkDate || new Date().toISOString().slice(0, 10),
        );
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

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { calculatePaycheck } from '../src/calculate.ts';
import type { PaycheckInput } from '../src/types.ts';
import { mintApiKey, recordUsage, usageForKey, verifyApiKey, type ApiKey } from '../api/keys.ts';

/**
 * The payroll-tax API — the engine (src/calculatePaycheck) behind an
 * API-key gate that meters every call, with NOTHING external: keys and usage
 * live in api/keys.ts's local file store, so this runs on `node` alone. It is
 * the self-hosted equivalent of supabase/functions/calculate-paycheck, minus
 * Supabase.
 *
 *   npm run api                       # start on :4380
 *   npm run api:key "Acme Payroll"    # mint a key (printed once)
 *
 *   curl -s localhost:4380/v1/health
 *   curl -s localhost:4380/v1/calculate -H "Authorization: Bearer sk_live_..." \
 *     -H 'Content-Type: application/json' -d '{
 *       "checkDate":"2026-08-15","payFrequency":"weekly",
 *       "earnings":[{"code":"REG","category":"regular","amount":100000}],
 *       "federalW4":{"filingStatus":"single","multipleJobs":false,"dependentCredit":0,"otherIncome":0,"deductions":0,"extraWithholding":0},
 *       "ytd":{"socialSecurity":0,"medicare":0,"futa":0},
 *       "workState":{"code":"OH","certificate":{"residenceCity":"Columbus","workCity":"Columbus"}}
 *     }'
 *   curl -s localhost:4380/v1/usage -H "Authorization: Bearer sk_live_..."
 */

const PORT = Number(process.env.PORT ?? 4380);

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

function readJson<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error('Request body too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) return resolve({} as T);
      try {
        resolve(JSON.parse(data) as T);
      } catch {
        reject(new Error('Request body must be valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

/** The bearer token from Authorization: Bearer <key>, or the x-api-key header. */
function presentedKey(req: IncomingMessage): string {
  const auth = req.headers['authorization'];
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const x = req.headers['x-api-key'];
  return typeof x === 'string' ? x.trim() : '';
}

const server = createServer(async (req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  const method = req.method ?? 'GET';

  // Health is open — everything else requires a key.
  if (method === 'GET' && path === '/v1/health') {
    return sendJson(res, 200, { ok: true, service: 'payroll-tax-api', time: new Date().toISOString() });
  }

  const key: ApiKey | null = verifyApiKey(presentedKey(req));
  if (!key) {
    return sendJson(res, 401, { error: 'Missing or invalid API key. Send it as "Authorization: Bearer sk_live_...".' });
  }

  if (method === 'GET' && path === '/v1/usage') {
    return sendJson(res, 200, { key: { id: key.id, name: key.name, prefix: key.prefix, plan: key.plan }, usage: usageForKey(key.id) });
  }

  if (method === 'POST' && path === '/v1/calculate') {
    let input: PaycheckInput;
    try {
      input = await readJson<PaycheckInput>(req);
    } catch (err) {
      recordUsage(key.id, { statusCode: 400, error: err instanceof Error ? err.message : 'bad request' });
      return sendJson(res, 400, { error: err instanceof Error ? err.message : 'Bad request.' });
    }
    const stateCode = input?.workState?.code ?? null;
    // Tolerate the two arrays/objects callers most often omit, so a caller who
    // sends only earnings + a W-4 gets a result instead of a cryptic engine
    // crash. Genuinely required fields (earnings, federalW4) still surface a
    // clear error below.
    if (input && typeof input === 'object') {
      input.deductions ??= [];
      input.ytd ??= { socialSecurity: 0, medicare: 0, futa: 0 };
    }
    try {
      const result = calculatePaycheck(input);
      recordUsage(key.id, { stateCode, statusCode: 200 });
      return sendJson(res, 200, { ok: true, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Calculation failed.';
      recordUsage(key.id, { stateCode, statusCode: 422, error: message });
      return sendJson(res, 422, { error: message });
    }
  }

  return sendJson(res, 404, { error: 'Not found. Try POST /v1/calculate, GET /v1/usage, or GET /v1/health.' });
});

// A tiny convenience: `node examples/api-server.ts --mint "Name"` mints a key
// without a separate command, for a quick first-run.
const mintFlag = process.argv.indexOf('--mint');
if (mintFlag !== -1) {
  const { key, record } = mintApiKey(process.argv[mintFlag + 1] ?? 'dev');
  console.log(`Minted key for "${record.name}" (${record.prefix}…):\n  ${key}\n`);
}

server.listen(PORT, () => {
  console.log(`\n  Payroll-tax API — the engine behind a metered API key`);
  console.log(`  Health:     http://localhost:${PORT}/v1/health`);
  console.log(`  Calculate:  POST http://localhost:${PORT}/v1/calculate  (Authorization: Bearer sk_live_...)`);
  console.log(`  Usage:      GET  http://localhost:${PORT}/v1/usage`);
  console.log(`  Mint a key: npm run api:key "Customer Name"\n`);
});

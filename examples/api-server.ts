import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { calculatePaycheck } from '../src/calculate.ts';
import type { PaycheckInput } from '../src/types.ts';
import { mintApiKey, recordUsage, usageForKey, verifyApiKey, type ApiKey } from '../api/keys.ts';
import { billingConfigured, completeCardSetup, handleStripeWebhook, meteringConfigured, reportCall, startCardSetup } from '../api/billing.ts';
import { runEmbeddedPayroll, type PlatformEmployeeInput } from '../payroll/platform.ts';
import type { PayFrequency } from '../src/types.ts';
import { listUniqueTaxIds, payCalc, resolveUniqueTaxId, type PayCalcRequest } from '../api/ste-compat.ts';

// Load a local .env (Stripe keys, PUBLIC_BASE_URL, etc.) if one exists — so
// pasting values into .env is all it takes to configure billing. Harmless when
// there's no .env; real host env vars still take precedence.
try {
  process.loadEnvFile();
} catch {
  /* no .env — that's fine */
}

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
 *
 *   # Symmetry Tax Engine (STE) -shaped compatibility routes — this
 *   # engine's own request/response shape is above; these exist for a
 *   # caller already integrated against payCalc/UniqueTaxId/
 *   # TaxJurisdictionParms. See api/ste-compat.ts's own doc comment for
 *   # exactly what this is (a compatible SHAPE) and isn't (Symmetry's own
 *   # data, which this project has no access to).
 *   curl -s localhost:4380/v1/uniqueTaxIds -H "Authorization: Bearer sk_live_..."
 *   curl -s localhost:4380/v1/payCalc -H "Authorization: Bearer sk_live_..." \
 *     -H 'Content-Type: application/json' -d '{"payCalc":[{
 *       "checkDate":"2026-08-15","frequency":"biweekly","grossPay":3000,
 *       "workUniqueTaxIds":["39-000-0001"]
 *     }]}'
 */

const PORT = Number(process.env.PORT ?? 4380);
const HERE = dirname(fileURLToPath(import.meta.url));

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

function sendHtml(res: ServerResponse, status: number, title: string, message: string): void {
  const body = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><body style="font-family:system-ui,sans-serif;max-width:34rem;margin:12vh auto;padding:0 1.2rem;color:#1c2530">
<h1 style="font-size:1.5rem">${title}</h1><p style="font-size:1.05rem;color:#475569">${message}</p></body>`;
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

/** Where this API is publicly reachable — for building Checkout return URLs. */
function baseUrl(req: IncomingMessage): string {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  return `http://${req.headers.host ?? `localhost:${PORT}`}`;
}

function readRaw(req: IncomingMessage): Promise<string> {
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

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const raw = await readRaw(req);
  if (!raw) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error('Request body must be valid JSON.');
  }
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

  // The developer console — a self-serve UI for a key holder to see usage,
  // cost, and their card, and to save one. Open (the key is entered in-page).
  if (method === 'GET' && (path === '/' || path === '/dashboard' || path === '/console')) {
    const html = readFileSync(join(HERE, 'api-dashboard.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': html.byteLength });
    return res.end(html);
  }

  // Health is open — everything else requires a key.
  if (method === 'GET' && path === '/v1/health') {
    const billing = meteringConfigured() ? 'metered' : billingConfigured() ? 'stripe-manual' : 'ledger-only';
    return sendJson(res, 200, { ok: true, service: 'payroll-tax-api', billing, time: new Date().toISOString() });
  }

  // Stripe Checkout redirects the customer's BROWSER back here with no API key,
  // so these two are open (correlation is via the session's server-trusted metadata).
  if (method === 'GET' && path === '/v1/billing/return') {
    const sessionId = new URL(req.url ?? '', baseUrl(req)).searchParams.get('session_id') ?? '';
    try {
      const out = await completeCardSetup(sessionId);
      if (out.ok) {
        // Back to the console, which shows the saved card and a success note.
        res.writeHead(302, { Location: '/?card=saved' });
        return res.end();
      }
      return sendHtml(res, 400, "Couldn't save the card", `Setup did not complete (${out.reason}). Please try again from the console.`);
    } catch (err) {
      return sendHtml(res, 502, 'Card setup error', err instanceof Error ? err.message : 'Unexpected error talking to the payment processor.');
    }
  }
  if (method === 'GET' && path === '/v1/billing/cancel') {
    return sendHtml(res, 200, 'Setup canceled', 'No card was saved. You can start again whenever you like.');
  }

  // Stripe webhook — open, signature-verified. Suspends a key on a failed
  // invoice and reactivates it once paid.
  if (method === 'POST' && path === '/v1/billing/webhook') {
    const raw = await readRaw(req);
    const out = handleStripeWebhook(raw, String(req.headers['stripe-signature'] ?? ''));
    if (!out.ok && out.reason === 'bad_signature') return sendJson(res, 400, { error: 'Invalid signature.' });
    return sendJson(res, 200, { received: true, action: out.action });
  }

  const key: ApiKey | null = verifyApiKey(presentedKey(req));
  if (!key) {
    return sendJson(res, 401, { error: 'Missing or invalid API key. Send it as "Authorization: Bearer sk_live_...".' });
  }

  if (method === 'GET' && path === '/v1/usage') {
    return sendJson(res, 200, { key: { id: key.id, name: key.name, prefix: key.prefix, plan: key.plan }, usage: usageForKey(key.id) });
  }

  // Start saving a card: returns a hosted Stripe Checkout URL for this customer.
  if (method === 'POST' && path === '/v1/billing/setup') {
    if (!billingConfigured()) return sendJson(res, 503, { error: 'Billing is not configured on this server (no STRIPE_SECRET_KEY).' });
    try {
      const out = await startCardSetup(key.id, baseUrl(req));
      if (out.ok) return sendJson(res, 200, { url: out.url });
      return sendJson(res, 400, { error: `Could not start card setup (${out.reason}).` });
    } catch (err) {
      return sendJson(res, 502, { error: err instanceof Error ? err.message : 'Payment processor error.' });
    }
  }

  // Whether this key has a card on file, plus what it owes.
  if (method === 'GET' && path === '/v1/billing/status') {
    const u = usageForKey(key.id);
    return sendJson(res, 200, {
      cardOnFile: Boolean(key.stripePaymentMethodId),
      card: key.stripePaymentMethodId ? { brand: key.cardBrand, last4: key.cardLast4 } : null,
      pricePerCallCents: key.pricePerCallCents,
      balanceDueCents: u?.balanceDueCents ?? 0,
      billingEnabled: billingConfigured(),
      metered: meteringConfigured(),
      suspended: key.suspended,
      suspendedReason: key.suspendedReason,
    });
  }

  if (method === 'POST' && path === '/v1/calculate') {
    // A key suspended for non-payment can still sign in (to fix its card) but can't make billable calls.
    if (key.suspended) {
      return sendJson(res, 402, { error: key.suspendedReason ?? 'This key is suspended for non-payment. Update your card to resume.', suspended: true });
    }
    let input: PaycheckInput;
    try {
      input = await readJson<PaycheckInput>(req);
    } catch (err) {
      // A malformed request isn't a billable call.
      recordUsage(key.id, { statusCode: 400, error: err instanceof Error ? err.message : 'bad request', billable: false });
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
      const chargedCents = recordUsage(key.id, { stateCode, statusCode: 200 }); // billable success (local ledger)
      // Report this call to Stripe's usage meter — the per-call charge. Fire and
      // forget so a metering hiccup never delays or fails the customer's response.
      void reportCall(key.id).catch(() => {});
      const balanceDueCents = usageForKey(key.id)?.balanceDueCents ?? 0;
      res.setHeader('X-Charge-Cents', String(chargedCents));
      return sendJson(res, 200, { ok: true, result, billing: { chargedCents, balanceDueCents, metered: meteringConfigured() } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Calculation failed.';
      // A calc that couldn't be produced isn't billed.
      recordUsage(key.id, { stateCode, statusCode: 422, error: message, billable: false });
      return sendJson(res, 422, { error: message });
    }
  }

  // Run a WHOLE payroll (the embedded-payroll platform — "our own Zeal"):
  // compute every employee gross-to-net with the engine, then hand it to the
  // provider to pay + file. With the sandbox provider, settlement.moneyMoved is
  // false — the response says exactly what really happened.
  if (method === 'POST' && path === '/v1/payroll/run') {
    if (key.suspended) return sendJson(res, 402, { error: key.suspendedReason ?? 'Suspended for non-payment.', suspended: true });
    let body: { companyId?: string; checkDate?: string; payFrequency?: string; employees?: PlatformEmployeeInput[] };
    try {
      body = await readJson(req);
    } catch (err) {
      recordUsage(key.id, { statusCode: 400, error: 'bad request', billable: false });
      return sendJson(res, 400, { error: err instanceof Error ? err.message : 'Bad request.' });
    }
    if (!body.employees?.length || !body.checkDate) {
      recordUsage(key.id, { statusCode: 400, billable: false });
      return sendJson(res, 400, { error: 'checkDate and a non-empty employees[] are required.' });
    }
    try {
      const run = await runEmbeddedPayroll({
        companyId: body.companyId ?? 'company',
        checkDate: body.checkDate,
        payFrequency: (body.payFrequency ?? 'biweekly') as PayFrequency,
        employees: body.employees,
      });
      recordUsage(key.id, { statusCode: 200 }); // billable
      void reportCall(key.id).catch(() => {});
      return sendJson(res, 200, { ok: true, run });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Payroll run failed.';
      recordUsage(key.id, { statusCode: 422, error: message, billable: false });
      return sendJson(res, 422, { error: message });
    }
  }

  // Symmetry Tax Engine (STE) -shaped compatibility routes — see
  // api/ste-compat.ts's own doc comment for what this is and, importantly,
  // isn't: this engine's OWN uniqueTaxId/locationCode catalog in STE's
  // familiar request/response shape, not Symmetry's actual proprietary
  // data. A caller who already speaks this engine's native PaycheckInput
  // shape should keep using POST /v1/calculate directly; this exists for a
  // caller migrating an integration that already speaks payCalc/
  // UniqueTaxId/TaxJurisdictionParms.
  if (method === 'GET' && path === '/v1/uniqueTaxIds') {
    const checkDate = new URL(req.url ?? '', baseUrl(req)).searchParams.get('checkDate') ?? new Date().toISOString().slice(0, 10);
    try {
      return sendJson(res, 200, { checkDate, count: listUniqueTaxIds(checkDate).length, entries: listUniqueTaxIds(checkDate) });
    } catch (err) {
      return sendJson(res, 400, { error: err instanceof Error ? err.message : 'Bad request.' });
    }
  }

  if (method === 'GET' && path.startsWith('/v1/uniqueTaxIds/')) {
    const id = decodeURIComponent(path.slice('/v1/uniqueTaxIds/'.length));
    const checkDate = new URL(req.url ?? '', baseUrl(req)).searchParams.get('checkDate') ?? new Date().toISOString().slice(0, 10);
    const entry = resolveUniqueTaxId(id, checkDate);
    if (!entry) return sendJson(res, 404, { error: `No such uniqueTaxId/locationCode "${id}" for ${checkDate}.` });
    return sendJson(res, 200, entry);
  }

  if (method === 'POST' && path === '/v1/payCalc') {
    if (key.suspended) {
      return sendJson(res, 402, { error: key.suspendedReason ?? 'This key is suspended for non-payment. Update your card to resume.', suspended: true });
    }
    let requests: PayCalcRequest[];
    try {
      const body = await readJson<PayCalcRequest[] | { payCalc: PayCalcRequest[] }>(req);
      requests = Array.isArray(body) ? body : body.payCalc;
      if (!Array.isArray(requests)) throw new Error('Request body must be an array of PayCalcRequest, or { "payCalc": [...] }.');
    } catch (err) {
      recordUsage(key.id, { statusCode: 400, error: err instanceof Error ? err.message : 'bad request', billable: false });
      return sendJson(res, 400, { error: err instanceof Error ? err.message : 'Bad request.' });
    }
    const results = payCalc(requests);
    // Billed the same as /v1/calculate, once per request in the batch —
    // this endpoint is a translation in front of the same engine call, not
    // a cheaper one.
    let chargedCents = 0;
    for (const r of results) {
      chargedCents += recordUsage(key.id, { statusCode: r.error ? 422 : 200, error: r.error, billable: !r.error });
    }
    if (results.some((r) => !r.error)) void reportCall(key.id).catch(() => {});
    res.setHeader('X-Charge-Cents', String(chargedCents));
    return sendJson(res, 200, { payCalc: results });
  }

  return sendJson(res, 404, { error: 'Not found. Try POST /v1/calculate, POST /v1/payroll/run, POST /v1/payCalc, GET /v1/uniqueTaxIds, GET /v1/usage, or GET /v1/health.' });
});

// A tiny convenience: `node examples/api-server.ts --mint "Name"` mints a key
// without a separate command, for a quick first-run.
const mintFlag = process.argv.indexOf('--mint');
if (mintFlag !== -1) {
  const { key, record } = mintApiKey(process.argv[mintFlag + 1] ?? 'dev');
  console.log(`Minted key for "${record.name}" (${record.prefix}…):\n  ${key}\n`);
}

server.listen(PORT, () => {
  console.log(`\n  Payroll-tax API — the engine behind a metered, billed API key`);
  console.log(`  Console:     http://localhost:${PORT}/            (paste a key to see usage, cost, card)`);
  console.log(`  Health:      http://localhost:${PORT}/v1/health`);
  console.log(`  Calculate:   POST http://localhost:${PORT}/v1/calculate   (Authorization: Bearer sk_live_...)`);
  console.log(`  Usage:       GET  http://localhost:${PORT}/v1/usage`);
  console.log(`  Save a card: POST http://localhost:${PORT}/v1/billing/setup  -> returns a Stripe Checkout URL`);
  const billingMode = meteringConfigured()
    ? 'METERED per-call (Stripe usage billing — every call reports $0.15 to Stripe, invoiced monthly)'
    : billingConfigured()
      ? 'Stripe manual (STRIPE_SECRET_KEY set; add STRIPE_PRICE_ID + STRIPE_METER_EVENT for per-call metering)'
      : 'ledger-only (set STRIPE_SECRET_KEY + STRIPE_PRICE_ID + STRIPE_METER_EVENT to bill per call)';
  console.log(`  Bill a key:  npm run api:key -- --bill <prefix>   (manual path; metered billing auto-invoices)`);
  console.log(`  Billing:     ${billingMode}\n`);
});

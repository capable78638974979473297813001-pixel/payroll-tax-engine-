import './lib/env.ts';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { calculatePaycheck } from '../src/calculate.ts';
import type { PayFrequency } from '../src/types.ts';
import { CannotComputeError, UnsupportedTaxYearError } from '../src/registry.ts';
import { listUniqueTaxIds, payCalc, resolveUniqueTaxId, type PayCalcRequest } from '../api/ste-compat.ts';
import { runEmbeddedPayroll, type PlatformEmployeeInput } from '../payroll/platform.ts';
import { pointSourceOf, resolveEmployee } from '../geocode/index.ts';
import {
  withDb, readDb, hitStoredLimit,
  type AccountRecord, type AuthSession, type DB, type KeyRecord, type PaymentMethodRecord,
  type SavedScenario, type SubscriptionRecord, type TermsAcceptance, type TermsQuote,
} from './lib/store.ts';
import { dashboardUsage, recordAccountUsage, type RecordUsageInput } from './lib/usage.ts';
import { TRIAL_DAYS, estimate as computePricing } from './lib/pricing.ts';
import { TERMS_VERSION, TERM_MONTHS, termsClauses } from './lib/terms.ts';
import { isEmailConfigured, scrubMailLog, sendVerificationEmail, sendContactEmail } from './lib/mail.ts';
import { validatePaycheckInput } from './lib/validate.ts';
import { openApiDocument, paycheckRequestSchema, unknownFieldWarnings } from './lib/api-spec.ts';
import { ExtrasRefusal, runPaycheckExtras, validatePaycheckExtras } from './lib/extras.ts';
import { keyLifeFor } from './lib/keylife.ts';
import { coverage, renderCoverageHtml, searchLocal } from './lib/coverage.ts';
import { verifierConfigured, issueCode, checkCode } from './lib/verifier.ts';
import { checkoutInProduction, isAllowedCheckoutUrl, resolveCheckoutOrigin, stripeConfigured, stripeKeyRefused } from '../api/stripe.ts';
import { hashPassword, verifyPassword, passwordNeedsRehash, passwordProblem, MAX_PASSWORD } from './lib/password.ts';
import { canonicalOrigin, decorateHtml, indexablePages, pageForRoute, robotsTxt, sitemapXml } from './lib/seo.ts';
import {
  billingConfigured, meteringConfigured, flushMeterQueue,
  createBillingCustomer, startMeteredCheckout, completeMeteredCheckout, interpretWebhook,
} from './lib/billing.ts';

// <repo root>/.env (RESEND_API_KEY, STRIPE_SECRET_KEY -- see .env.example) is
// loaded by ./lib/env.ts, the first import above, so modules that read the
// environment while loading (the store's SITE_DB_DIR) see it. Absent .env is
// fine: signup still works, the code prints to this console instead of
// emailing, and the payment step reports honestly that no processor is
// connected.

/**
 * Serves the Omnia landing page and console, plus the API behind them.
 *
 * The signup flow is staged deliberately, in this order:
 *
 *   1. POST /api/signup        name, work email, business, optional phone
 *   2. POST /api/verify-email  6-digit code proves they own the address
 *   3. GET  /api/terms         the exact clauses + figures they must see
 *   4. POST /api/accept-terms  typed signature, stored immutably
 *   5. POST /api/payment-setup handoff to the processor for card/ACH
 *   6. trial starts, key issues, console unlocks
 *
 * Terms are shown and agreed BEFORE any payment method is collected --
 * that ordering is the point, not decoration.
 *
 * Card and bank numbers never touch this server. Step 5 creates a
 * processor-hosted Checkout session and we keep only the reference and a
 * last four for display. With no STRIPE_SECRET_KEY set, that step says
 * so plainly instead of pretending to have collected anything.
 *
 *   npm run site
 *   then open http://localhost:4323
 */

const PORT = Number(process.env.PORT ?? 4323);
const HERE = dirname(fileURLToPath(import.meta.url));

/** Bumped when the request/response contract changes; stamped on every response. */
const API_VERSION = '1.0.0';

/**
 * A session lasts a year from the last time it was used. The cookie's
 * Max-Age is the same length, so closing the browser does not drop it.
 * SESSION_SLIDE_AFTER_MS keeps the renewal from rewriting the store on
 * every request: the first request after a day extends both the stored
 * expiry and the cookie by another year.
 */
const SESSION_TTL_MS = 365 * 24 * 60 * 60_000;
const SESSION_SLIDE_AFTER_MS = 24 * 60 * 60_000;
/** Oldest sessions past this are dropped when a new one is issued. */
const MAX_SESSIONS_PER_ACCOUNT = 20;
const CODE_TTL_MS = 15 * 60_000;
const CODE_COOLDOWN_MS = 30_000;
/** A terms quote must be accepted within this long of being shown. */
const QUOTE_TTL_MS = 60 * 60_000;
/** Never-verified signups older than this are pruned, so junk signups can't pile up. */
const UNVERIFIED_RETENTION_MS = 7 * 24 * 60 * 60_000;

// The per-key limit on POST /api/paycheck (paycheckLimiterLimit() a
// minute) is kept in the store like every other limit here, so it holds
// across restarts and across instances sharing the volume -- N instances
// no longer allow N times the rate.

// Wrong-code attempts per issued code; past this the code is burned and
// the customer asks for a new one, so a 6-digit code can't be guessed.
// Counted on the account record itself (not in memory), so a restart or a
// second instance doesn't hand out fresh guesses.
const MAX_CODE_ATTEMPTS = 8;
// Across codes: requesting a fresh code resets the per-code count above,
// so wrong guesses per address are also capped per hour. Once spent, even
// the right code is refused until the hour passes.
const MAX_CODE_GUESSES_PER_HOUR = MAX_CODE_ATTEMPTS * 3;
/** Unaccepted terms quotes kept per account; older ones are dropped. */
const MAX_OPEN_QUOTES = 20;

// Sign-in and signup codes: at most this many requests per client address
// an hour, so neither form can be used to spam inboxes or grow the
// account store without bound. Kept in the store, so the limit survives
// restarts and is shared by every instance on the same volume.
const HOUR_MS = 60 * 60_000;
const signinPerHour = () => Number(process.env.SIGNIN_PER_HOUR ?? 10);
const signupPerHour = () => Number(process.env.SIGNUP_PER_HOUR ?? 10);

/** Production is NODE_ENV=production, or a process Render itself started. */
function inProduction(): boolean {
  return checkoutInProduction();
}

/**
 * Print verification codes to the console only in development, and only
 * when no email provider is configured. A code in a production log is a
 * working sign-in credential. The verify page mentions the log only when
 * this is true.
 */
function logCodesToConsole(): boolean {
  return !isEmailConfigured() && !verifierConfigured() && !inProduction();
}

type CodeDelivery =
  | { limited: true; retryAfterSec: number }
  | { limited: false; emailSent: boolean; cooldown: boolean; devCodeHint: boolean };

/**
 * Send a signup or sign-in code. Failures are logged without the code,
 * the address, or any API key. A verifier cooldown means a code was just
 * sent, so the caller treats it as delivered.
 */
async function deliverCodeEmail(
  where: 'signup' | 'sign-in',
  acct: { name: string; email: string; code: string; codeExpiresAt: string },
): Promise<CodeDelivery> {
  if (verifierConfigured()) {
    const issued = await issueCode(acct.email, acct.name);
    if (issued.status === 429) return { limited: true, retryAfterSec: issued.retryAfterSec ?? 3600 };
    const cooldown = issued.cooldown === true;
    const emailSent = issued.sent || cooldown;
    if (!issued.ok) console.error(`[${where}] verifier could not issue a code`);
    else if (!emailSent) console.error(`[${where}] verification email failed`);
    return { limited: false, emailSent, cooldown, devCodeHint: false };
  }
  if (logCodesToConsole()) {
    console.log('');
    console.log(`+- Omnia ${where} code (dev: no email provider) -`);
    console.log(`|  ${acct.email}`);
    console.log(`|  CODE: ${acct.code}`);
    console.log(`|  expires ${acct.codeExpiresAt}`);
    console.log('+--------------------------------------------------');
    console.log('');
    return { limited: false, emailSent: false, cooldown: false, devCodeHint: true };
  }
  if (!isEmailConfigured()) {
    console.error(`[${where}] verification email failed: no email provider is configured`);
    return { limited: false, emailSent: false, cooldown: false, devCodeHint: false };
  }
  const result = await sendVerificationEmail({
    name: acct.name,
    email: acct.email,
    code: acct.code,
    expiresAt: acct.codeExpiresAt,
  });
  // The provider's status and message only (mail.ts already removed keys and codes), under the
  // [mail] tag the verifier client also uses, so one grep finds a delivery failure on either path.
  if (!result.sent) console.error(`[mail] verification email failed: ${where}: ${scrubMailLog(result.reason ?? 'unknown error')}`);
  return { limited: false, emailSent: result.sent, cooldown: false, devCodeHint: false };
}

/**
 * The "code is in the server log" sentence is a local-development aid.
 * Production (NODE_ENV=production, including the Docker image) must not show
 * it. OMNIA_DEV_CODE_HINT=1 or VERIFIER_DEV=1 forces it on for a deliberate
 * local debug session.
 */
function showDevCodeHint(): boolean {
  const flag = (process.env.OMNIA_DEV_CODE_HINT ?? '').trim().toLowerCase();
  if (flag === '1' || flag === 'true') return true;
  if ((process.env.VERIFIER_DEV ?? '').trim() === '1') return true;
  return process.env.NODE_ENV !== 'production';
}

const SESSION_COOKIE = 'omnia_session';
/** Ties an unverified signup to the browser or API client that made it. */
const SIGNUP_COOKIE = 'omnia_signup';

/**
 * Plaintext of a code issued in this process. The store keeps a SHA-256
 * once email is configured or the process is production, so a database
 * copy is not a working sign-in code. Development with no mailer still
 * stores the code in the clear because the same value is printed to the
 * console for the person at the keyboard.
 */
const pendingCodes = new Map<string, string>();

function sealCode(code: string): string {
  if (logCodesToConsole()) return code;
  return 'sha256:' + createHash('sha256').update(code).digest('hex');
}

function codeMatches(stored: string, presented: string): boolean {
  if (stored.startsWith('sha256:')) {
    return safeEqual(stored, 'sha256:' + createHash('sha256').update(presented).digest('hex'));
  }
  return safeEqual(stored, presented);
}

function knownPlaintext(email: string, stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!stored.startsWith('sha256:')) return stored;
  return pendingCodes.get(email) ?? null;
}

// The set of state codes this build can actually compute, read once from
// data/states/. Used to reject an unknown workState at validation time
// (a clean 422) rather than letting it surface as an engine throw.
let VALID_STATE_CODES: Set<string> | null = null;
function validStateCodes(): Set<string> {
  if (VALID_STATE_CODES) return VALID_STATE_CODES;
  const dir = join(HERE, '..', 'data', 'states');
  const codes = readdirSync(dir)
    .filter((f) => /^[A-Z]{2}-\d{4}\.json$/.test(f))
    .map((f) => f.slice(0, 2).toUpperCase());
  VALID_STATE_CODES = new Set(codes);
  return VALID_STATE_CODES;
}

// Tax years with a federal ruleset on disk -- the years a check date may
// fall in. Read once; a year without one is a clean 422, not an engine throw.
let SUPPORTED_YEARS: number[] | null = null;
function supportedYears(): number[] {
  if (SUPPORTED_YEARS) return SUPPORTED_YEARS;
  SUPPORTED_YEARS = readdirSync(join(HERE, '..', 'data', 'federal'))
    .map((f) => /^(\d{4})\.json$/.exec(f)?.[1])
    .filter((y): y is string => Boolean(y))
    .map(Number)
    .sort((a, b) => a - b);
  return SUPPORTED_YEARS;
}

// ---------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------

// Applied to every response. Cheap, standard hardening: don't let the
// content type be sniffed, don't leak the referrer, don't allow framing,
// and stamp the API version so a caller can tell which build answered.
// HSTS is sent only for the public host. A header on a localhost response
// would pin the browser to HTTPS for localhost.
function hstsValue(req?: IncomingMessage): string | null {
  const base = (process.env.PUBLIC_BASE_URL ?? '').trim();
  if (!base.startsWith('https://')) return null;
  if (!req) return null;
  let canonicalHost = '';
  try { canonicalHost = new URL(base).host.toLowerCase(); } catch { return null; }
  const host = requestHost(req);
  if (host !== canonicalHost && host !== `www.${canonicalHost}`) return null;
  return 'max-age=31536000; includeSubDomains';
}

function securityHeaders(req?: IncomingMessage, nonce?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'X-Omnia-Version': API_VERSION,
    'Content-Security-Policy': nonce
      ? [
          "default-src 'self'",
          `script-src 'self' 'nonce-${nonce}'`,
          "script-src-attr 'none'",
          "style-src 'self' 'unsafe-inline'",
          "style-src-attr 'unsafe-inline'",
          "img-src 'self' data:",
          "font-src 'self'",
          "connect-src 'self'",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "object-src 'none'",
          "frame-src 'none'",
        ].join('; ')
      : "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  };
  const hsts = hstsValue(req);
  if (hsts) headers['Strict-Transport-Security'] = hsts;
  return headers;
}

/** Host the browser asked for, lowercased, without a port. */
function requestHost(req: IncomingMessage): string {
  const trust = trustProxy();
  const forwarded = trust ? String(req.headers['x-forwarded-host'] ?? '').split(',')[0].trim() : '';
  const raw = (forwarded || String(req.headers.host ?? '')).split(',')[0].trim().toLowerCase();
  return raw.replace(/:\d+$/, '');
}

function requestProto(req: IncomingMessage): 'http' | 'https' {
  if (trustProxy()) {
    const proto = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim().toLowerCase();
    if (proto === 'https' || proto === 'http') return proto;
  }
  return 'http';
}

/**
 * Send http://omniatax.io and www.omniatax.io to https://omniatax.io.
 * Health checks and any other host (localhost, the Render probe) stay put.
 */
function canonicalRedirect(req: IncomingMessage, rawUrl: string): string | null {
  const pathOnly = rawUrl.split('?')[0] ?? '/';
  if (pathOnly === '/healthz' || pathOnly === '/api/health' || pathOnly === '/v1/health') return null;
  const base = (process.env.PUBLIC_BASE_URL ?? '').trim().replace(/\/+$/, '');
  if (!base.startsWith('https://')) return null;
  let canonical: URL;
  try { canonical = new URL(base); } catch { return null; }
  const host = requestHost(req);
  const canonicalHost = canonical.host.toLowerCase();
  const toWww = host === `www.${canonicalHost}`;
  const toHttps = host === canonicalHost && requestProto(req) === 'http';
  if (!toWww && !toHttps) return null;
  const path = rawUrl.startsWith('/') && !rawUrl.startsWith('//') ? rawUrl : '/';
  return canonical.origin + path;
}

/** True when the browser's Origin (if any) is this site. */
function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const o = new URL(origin).host;
    const own = process.env.PUBLIC_BASE_URL ? new URL(process.env.PUBLIC_BASE_URL).host : null;
    return o === req.headers.host || o === own;
  } catch {
    return false;
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown, extraHeaders: Record<string, string | string[]> = {}): void {
  const payload = JSON.stringify(body);
  // A sliding session sets Set-Cookie before the handler responds. writeHead
  // must keep that header, and must also keep a Set-Cookie the handler passes
  // (sign-in, sign-out). Set-Cookie is sent as separate headers, not joined.
  const cookies: string[] = [];
  const addCookie = (value: unknown) => {
    if (value == null || value === '') return;
    if (Array.isArray(value)) for (const v of value) cookies.push(String(v));
    else cookies.push(String(value));
  };
  addCookie(res.getHeader('Set-Cookie'));
  addCookie(extraHeaders['Set-Cookie']);
  const headers: Record<string, string | number | readonly string[]> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    ...securityHeaders(res.req),
    ...corsHeaders(res.req),
    ...extraHeaders,
  };
  delete headers['Set-Cookie'];
  if (cookies.length === 1) headers['Set-Cookie'] = cookies[0];
  else if (cookies.length > 1) headers['Set-Cookie'] = cookies;
  const bytes = maybeGzip(res.req, Buffer.from(payload), headers);
  headers['Content-Length'] = bytes.length;
  res.writeHead(status, headers);
  res.end(bytes);
}

function sendHtml(req: IncomingMessage, res: ServerResponse, file: string, route: string): void {
  const nonce = randomBytes(16).toString('base64url');
  const html = decorateHtml(readFileSync(file, 'utf8'), route, nonce);
  const headers: Record<string, string | number | readonly string[]> = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    ...securityHeaders(req, nonce),
    ...corsHeaders(req),
  };
  const csrf = csrfCookie(req);
  if (csrf) headers['Set-Cookie'] = csrf;
  const body = maybeGzip(req, Buffer.from(html), headers);
  headers['Content-Length'] = body.length;
  res.writeHead(200, headers);
  res.end(body);
}

/**
 * Figures the pages may display. The per-call rate is intentionally omitted:
 * the public site shows the price as TBA and must not embed a dollar rate.
 */
function clientConfig() {
  return {
    trialDays: TRIAL_DAYS,
    termMonths: TERM_MONTHS,
    codeTtlSec: CODE_TTL_MS / 1000,
    codeCooldownSec: CODE_COOLDOWN_MS / 1000,
    devCodeHint: showDevCodeHint(),
    maxCodeAttempts: MAX_CODE_ATTEMPTS,
    rateLimitPerMin: paycheckLimiterLimit(),
    termsVersion: TERMS_VERSION,
  };
}

/** The origin the docs' curl examples should call: this deployment, not a host this build may not own. */
function apiOrigin(): string {
  const configured = (process.env.PUBLIC_BASE_URL ?? '').trim().replace(/\/+$/, '');
  return /^https?:\/\//.test(configured) ? configured : `http://localhost:${PORT}`;
}

function sendPage(req: IncomingMessage, res: ServerResponse, path: string, route: string): void {
  const nonce = randomBytes(16).toString('base64url');
  let source = readFileSync(path, 'utf8')
    .replace('<!--OMNIA_CONFIG-->', `<script>window.OMNIA=${JSON.stringify(clientConfig())};</script>`)
    .replaceAll('https://api.omnia.tax', apiOrigin());
  // Complete before any script runs, so a crawler that skips JavaScript still sees the tables.
  if (route === '/coverage') source = renderCoverageHtml(source, (p) => Boolean(pageForRoute(p)));
  const html = decorateHtml(source, route, nonce);
  const headers: Record<string, string | number | readonly string[]> = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    ...(pageForRoute(route)?.index === false ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}),
    ...securityHeaders(req, nonce),
    ...corsHeaders(req),
  };
  const csrf = csrfCookie(req);
  if (csrf) headers['Set-Cookie'] = csrf;
  const body = maybeGzip(req, Buffer.from(html), headers);
  headers['Content-Length'] = body.length;
  res.writeHead(200, headers);
  res.end(body);
}

function contentTypeFor(file: string): string {
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.ico')) return 'image/x-icon';
  if (file.endsWith('.webmanifest')) return 'application/manifest+json; charset=utf-8';
  if (file.endsWith('.jpg') || file.endsWith('.jpeg')) return 'image/jpeg';
  if (file.endsWith('.json')) return 'application/json; charset=utf-8';
  if (file.endsWith('.woff2')) return 'font/woff2';
  if (file.endsWith('.ttf')) return 'font/ttf';
  return 'application/octet-stream';
}

/**
 * Static files cache for a day and must revalidate after that. They carry
 * an ETag, so an unchanged file still costs only a 304 once the browser
 * checks again. HTML stays no-store because it is rewritten per request.
 */
function sendStatic(res: ServerResponse, path: string, contentType: string, req?: IncomingMessage): void {
  const buf = readFileSync(path);
  const etag = '"' + createHash('sha1').update(buf).digest('base64url') + '"';
  const headers: Record<string, string | number | readonly string[]> = {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=86400, must-revalidate',
    ETag: etag,
    ...securityHeaders(req),
  };
  if (req && req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    res.end();
    return;
  }
  const body = maybeGzip(req, buf, headers);
  res.writeHead(200, { 'Content-Length': body.length, ...headers });
  res.end(body);
}

function maybeGzip(req: IncomingMessage | undefined, body: Buffer, headers: Record<string, string | number | readonly string[]>): Buffer {
  const type = String(headers['Content-Type'] ?? '');
  const accept = String(req?.headers['accept-encoding'] ?? '');
  if (body.length < 256 || !/\bgzip\b/.test(accept) || !/text\/|json|javascript|xml|\bsvg\b/.test(type)) return body;
  headers['Content-Encoding'] = 'gzip';
  const vary = headers['Vary'];
  headers['Vary'] = vary ? `${vary}, Accept-Encoding` : 'Accept-Encoding';
  return gzipSync(body, { level: 6 });
}

/** Origins allowed to read this API from a browser. Everyone else gets no CORS headers. */
function corsHeaders(req: IncomingMessage | undefined): Record<string, string> {
  const origin = req?.headers.origin;
  if (!origin || Array.isArray(origin)) return {};
  let requestOrigin = '';
  try { requestOrigin = new URL(origin).origin; } catch { return {}; }
  const allowed = new Set<string>([canonicalOrigin(), `http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`]);
  if (!allowed.has(requestOrigin)) return {};
  return {
    'Access-Control-Allow-Origin': requestOrigin,
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token, Stripe-Signature',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}

const CSRF_COOKIE = 'omnia_csrf';
/** Browser POSTs that authenticate with a cookie. Bearer-key and webhook routes are not in this list. */
const CSRF_EXEMPT = new Set([
  '/api/billing/webhook', '/v1/billing/webhook',
  '/api/paycheck', '/v1/paycheck',
  '/api/address', '/v1/address',
]);

function readCookie(req: IncomingMessage, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('=')) || null;
  }
  return null;
}

/** Set a double-submit token when the browser does not already have one. */
function csrfCookie(req: IncomingMessage): string | null {
  const existing = readCookie(req, CSRF_COOKIE);
  if (existing && /^[A-Za-z0-9_-]{32,128}$/.test(existing)) return null;
  const token = randomBytes(32).toString('base64url');
  return `${CSRF_COOKIE}=${token}; Path=/; SameSite=Lax; Max-Age=31536000` + (cookieSecure() ? '; Secure' : '');
}

function browserRequest(req: IncomingMessage): boolean {
  return Boolean(req.headers.origin || req.headers['sec-fetch-site']);
}

function csrfOk(req: IncomingMessage): boolean {
  if (!browserRequest(req)) return true;
  const cookie = readCookie(req, CSRF_COOKIE);
  const header = req.headers['x-csrf-token'];
  const presented = Array.isArray(header) ? header[0] : header;
  if (!cookie || !presented) return false;
  return safeEqual(cookie, presented);
}

const MAX_BODY_BYTES = 1_000_000;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let received = 0;
    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    req.on('data', (chunk: Buffer) => {
      if (settled) return;
      received += chunk.length;
      if (received > MAX_BODY_BYTES) {
        chunks.length = 0;
        fail(new Error('Request body too large.'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', fail);
  });
}

/**
 * Parse a JSON request body. By default the body must be a JSON object:
 * `null`, a number, a string or an array would otherwise reach handlers that
 * read fields off it and throw. Pass 'any' for the few routes that take an
 * array or validate the whole body themselves.
 */
async function readJson<T>(req: IncomingMessage, shape: 'object' | 'any' = 'object'): Promise<T> {
  const raw = await readBody(req);
  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error('Request body must be valid JSON.');
  }
  if (shape === 'object' && (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))) {
    throw new Error('Request body must be a JSON object.');
  }
  return parsed as T;
}

/** A string field from a request body, or '' when it is missing or not a string. */
function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function bearerToken(req: IncomingMessage): string | null {
  const header = req.headers['authorization'];
  const value = Array.isArray(header) ? header[0] : header;
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function maskKey(prefix: string): string {
  return `${prefix}••••••••••••••••••••`;
}

// ---------------------------------------------------------------------
// Step 1 -- POST /api/signup
// ---------------------------------------------------------------------

async function handleSignup(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: { name?: string; email?: string; company?: string; phone?: string; password?: string; agreeToTerms?: unknown; signupToken?: unknown };
  try {
    body = await readJson(req);
  } catch (err) {
    sendJson(res, 400, { error: (err as Error).message });
    return;
  }

  const name = text(body.name).trim();
  const email = text(body.email).trim().toLowerCase();
  const company = text(body.company).trim();
  const phone = text(body.phone).trim();

  // Phone is stored when the visitor types one. Nothing else reads it:
  // no texts, no billing, no display. An empty phone is a valid signup.
  if (!name || !isValidEmail(email) || !company) {
    sendJson(res, 400, { error: 'Name, a valid work email, and a business name are required.' });
    return;
  }
  if (name.length > 200 || email.length > 254 || company.length > 200 || phone.length > 40) {
    sendJson(res, 400, { error: 'One of those fields is too long.' });
    return;
  }
  // Unchecked by default on the form. The account stores the timestamp and
  // TERMS_VERSION only after the server sees an explicit true.
  if (body.agreeToTerms !== true) {
    sendJson(res, 400, {
      error: 'Check “I agree to the Terms” to create an account.',
      code: 'terms_required',
      field: 'agreeToTerms',
    });
    return;
  }

  // Checked before any work is done on the password: hashing costs CPU, so an
  // address that is over its limit must not be able to make us do it.
  const now = Date.now();
  // Per client address, across all emails: the per-email cooldown below
  // doesn't stop a flood of unique addresses.
  const gate = withDb((db) => hitStoredLimit(db, 'signup:' + clientAddress(req), signupPerHour(), HOUR_MS, now));
  if (!gate.allowed) {
    sendJson(res, 429, { error: 'Too many signup attempts from this network. Try again later.', code: 'rate_limited' }, { 'Retry-After': String(gate.retryAfterSec) });
    return;
  }

  // A password is optional at the API (accounts can sign in by emailed code
  // alone) but the web form always sends one.
  let passwordHash: string | null = null;
  if (body.password !== undefined) {
    const problem = passwordProblem(body.password, email);
    if (problem) {
      sendJson(res, 400, { error: problem, field: 'password' });
      return;
    }
    passwordHash = await hashPassword(body.password);
  }

  // Whoever submits an email address is not necessarily its owner, so what
  // an unverified signup stores (profile, password) is bound to the client
  // that made it. Only that client may change it before the code is entered.
  const presentedToken = signupTokenFrom(req, body);
  let issuedToken: string | null = null;
  let realToken = '';

  const account = withDb((db) => {
    pruneUnverified(db, now);

    const existing = db.accounts[email];
    const unverified = Boolean(existing) && !existing!.emailVerifiedAt;
    const lastCode = existing?.codeRequestedAt ? new Date(existing.codeRequestedAt).getTime() : 0;
    const liveSignup = unverified && now - lastCode < CODE_TTL_MS;
    const sameSigner = unverified && Boolean(existing!.signupBindingHash) && Boolean(presentedToken)
      && safeEqual(sha256Hex(presentedToken!), existing!.signupBindingHash!);
    // New address, an abandoned unverified record, or the same client again.
    const claims = !existing || (unverified && (!liveSignup || sameSigner));
    // Every reply carries a token, so a signup for a taken address looks the
    // same as a new one. Only a claiming signup stores the token's hash; for
    // anyone else it is a throwaway that binds nothing.
    realToken = claims && sameSigner && presentedToken ? presentedToken : randomBytes(24).toString('hex');
    issuedToken = realToken;
    const cooling = Boolean(
      existing?.code && existing.codeRequestedAt && now - new Date(existing.codeRequestedAt).getTime() < CODE_COOLDOWN_MS,
    );
    const remote = verifierConfigured();
    const reused = !remote && cooling ? knownPlaintext(email, existing?.code) : null;
    const code = remote ? null : reused ?? String(randomInt(100000, 1000000));
    if (code) pendingCodes.set(email, code);

    const keep = !claims && existing; // a live signup by someone else, or a verified account
    const record: AccountRecord = {
      name: keep ? existing.name : name,
      email,
      company: keep ? existing.company : company,
      phone: keep ? existing.phone : phone,
      code: code ? sealCode(code) : null,
      codeRequestedAt: cooling ? existing!.codeRequestedAt : new Date(now).toISOString(),
      codeExpiresAt: remote ? null : cooling ? existing!.codeExpiresAt : new Date(now + CODE_TTL_MS).toISOString(),
      codeAttempts: remote ? 0 : cooling ? existing!.codeAttempts ?? 0 : 0,
      emailVerifiedAt: existing?.emailVerifiedAt ?? null,
      sessionToken: existing?.sessionToken ?? null,
      sessionExpiresAt: existing?.sessionExpiresAt ?? null,
      sessionIssuedAt: existing?.sessionIssuedAt ?? null,
      sessionMethod: existing?.sessionMethod ?? null,
      // The password of a verified account never changes here: that would let
      // anyone who knows an email address take its account over. Before
      // verification a typed password is only held as pending, behind the
      // signup token, and becomes the real one when that client verifies.
      passwordHash: existing?.emailVerifiedAt ? existing.passwordHash ?? null : null,
      passwordSetAt: existing?.emailVerifiedAt ? existing.passwordSetAt ?? null : null,
      pendingPasswordHash: existing?.emailVerifiedAt
        ? null
        : claims ? passwordHash ?? (sameSigner ? existing?.pendingPasswordHash ?? null : null) : existing?.pendingPasswordHash ?? null,
      signupBindingHash: existing?.emailVerifiedAt
        ? null
        : claims ? sha256Hex(realToken) : existing?.signupBindingHash ?? null,
      stage: existing?.emailVerifiedAt ? existing.stage : 'unverified',
      createdAt: existing?.createdAt ?? new Date(now).toISOString(),
      termsAcceptedAt: existing?.termsAcceptedAt ?? new Date(now).toISOString(),
      termsVersion: existing?.termsVersion ?? TERMS_VERSION,
    };
    db.accounts[email] = record;
    return record;
  });

  const delivery = account.code && !pendingCodes.get(email)
    ? { limited: false as const, emailSent: true, cooldown: true, devCodeHint: false }
    : await deliverCodeEmail('signup', {
      name: account.name,
      email,
      code: pendingCodes.get(email) ?? '',
      codeExpiresAt: account.codeExpiresAt ?? '',
    });
  if (delivery.limited) {
    sendJson(res, 429, { error: 'Too many codes requested for this address. Try again later.', code: 'rate_limited' }, { 'Retry-After': String(delivery.retryAfterSec) });
    return;
  }

  // The token travels in a cookie for a browser and an X-Signup-Token header
  // for an API client, not in the body, so the JSON is identical whether or
  // not the address already has an account.
  sendJson(
    res,
    200,
    { ok: true, emailSent: delivery.emailSent, cooldown: delivery.cooldown, devCodeHint: delivery.devCodeHint },
    { 'Set-Cookie': signupCookie(issuedToken!), 'X-Signup-Token': issuedToken! },
  );
}

/** The signup token a client presents: its cookie, the X-Signup-Token header, or a signupToken body field. */
function signupTokenFrom(req: IncomingMessage, body: { signupToken?: unknown }): string | null {
  const header = req.headers['x-signup-token'];
  return readCookie(req, SIGNUP_COOKIE) || (Array.isArray(header) ? header[0] : header) || text(body.signupToken) || null;
}

/** HttpOnly cookie holding a signup's token; cleared once the address is verified. */
function signupCookie(token: string, maxAgeSec = Math.floor(UNVERIFIED_RETENTION_MS / 1000)): string {
  return `${SIGNUP_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}` + (cookieSecure() ? '; Secure' : '');
}

/** Drop never-verified signups past retention (and their dangling state). */
function pruneUnverified(db: { accounts: Record<string, AccountRecord> }, now: number): void {
  for (const [email, a] of Object.entries(db.accounts)) {
    if (a.emailVerifiedAt) continue;
    const last = new Date(a.codeRequestedAt ?? a.createdAt).getTime();
    if (now - last > UNVERIFIED_RETENTION_MS) delete db.accounts[email];
  }
}

// ---------------------------------------------------------------------
// POST /api/signin -- a returning customer asks for a sign-in code. The
// code is checked by POST /api/verify-email, same as at signup. The reply
// is the same whether or not the email has an account, so the form can't
// be used to find out who is a customer.
// ---------------------------------------------------------------------

async function handleSignin(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: { email?: string };
  try {
    body = await readJson(req);
  } catch (err) {
    sendJson(res, 400, { error: (err as Error).message });
    return;
  }
  const email = text(body.email).trim().toLowerCase();
  if (!isValidEmail(email)) {
    sendJson(res, 400, { error: 'Enter the work email you signed up with.' });
    return;
  }
  const now = Date.now();
  const outcome = withDb((db) => {
    const rl = hitStoredLimit(db, 'signin:' + clientAddress(req), signinPerHour(), HOUR_MS, now);
    if (!rl.allowed) return { limited: true as const, retryAfterSec: rl.retryAfterSec };
    const a = db.accounts[email];
    if (!a || !a.emailVerifiedAt) return { acct: null };
    const cooling = Boolean(a.codeRequestedAt && a.code && now - new Date(a.codeRequestedAt).getTime() < CODE_COOLDOWN_MS);
    let plain = '';
    if (verifierConfigured()) {
      a.codeRequestedAt = new Date(now).toISOString();
    } else if (!cooling) {
      plain = String(randomInt(100000, 1000000));
      pendingCodes.set(email, plain);
      a.code = sealCode(plain);
      a.codeRequestedAt = new Date(now).toISOString();
      a.codeExpiresAt = new Date(now + CODE_TTL_MS).toISOString();
      a.codeAttempts = 0;
    } else {
      plain = knownPlaintext(email, a.code) ?? '';
    }
    return { acct: { name: a.name, email: a.email, code: plain, codeExpiresAt: a.codeExpiresAt ?? '', cooling } };
  });
  if ('limited' in outcome) {
    sendJson(res, 429, { error: 'Too many sign-in attempts. Try again later.', code: 'rate_limited' }, { 'Retry-After': String(outcome.retryAfterSec) });
    return;
  }

  const configured = isEmailConfigured() || verifierConfigured();
  // The JSON is the same whether or not the address has an account, and
  // whether or not the provider accepted the message. A different
  // emailSent for a real mailbox is an existence oracle. Failures are logged.
  const devHint = !configured && !inProduction();
  const publicBody = { ok: true, emailConfigured: configured, emailSent: configured, cooldown: false, devCodeHint: devHint };
  const acct = outcome.acct;
  if (!acct) {
    sendJson(res, 200, publicBody);
    return;
  }
  if (!acct.cooling) {
    const delivery = await deliverCodeEmail('sign-in', acct);
    if (delivery.limited || !delivery.emailSent) console.error('[sign-in] verification email failed');
  }
  sendJson(res, 200, publicBody);
}

// ---------------------------------------------------------------------
// Step 2 -- POST /api/verify-email
// ---------------------------------------------------------------------

async function handleVerifyEmail(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: { email?: string; code?: string; signupToken?: unknown };
  try {
    body = await readJson(req);
  } catch (err) {
    sendJson(res, 400, { error: (err as Error).message });
    return;
  }

  const email = text(body.email).trim().toLowerCase();
  const code = text(body.code).trim();
  const presentedToken = signupTokenFrom(req, body);
  if (!isValidEmail(email) || !code) {
    sendJson(res, 400, { error: 'Email and code are both required.' });
    return;
  }

  // One answer for every failure -- unknown email, no code, expired code,
  // wrong code -- so this endpoint can't be used to learn who has signed
  // up (POST /api/signin makes the same promise). Wrong guesses are
  // counted per address whether or not it exists, and a burned code is
  // reported the same way for all of them.
  const INVALID = 'That code is incorrect or has expired. Request a new one if needed.';
  const TOO_MANY = 'Too many wrong codes. Request a new one.';
  // With the Python verifier configured it owns the code, its expiry, its
  // attempt limits and its throttling; the site only acts on its answer.
  const remote = verifierConfigured();
  const remoteOk = remote ? await checkCode(email, code) : false;
  const outcome = withDb((db) => {
    const acct = db.accounts[email];
    const now = Date.now();
    if (remote) {
      if (!acct || !remoteOk) return { ok: false as const, error: INVALID };
    }
    const hourKey = 'verify-hour:' + email;
    const spent = db.rateLimits[hourKey];
    if (!remote && spent && now - spent.start < spent.windowMs && spent.count >= MAX_CODE_GUESSES_PER_HOUR) {
      return { ok: false as const, error: TOO_MANY };
    }
    const live = Boolean(acct?.code && acct.codeExpiresAt && now <= new Date(acct.codeExpiresAt).getTime());
    if (!remote && (!acct || !live || !codeMatches(acct.code!, code))) {
      const hourly = hitStoredLimit(db, hourKey, MAX_CODE_GUESSES_PER_HOUR, HOUR_MS, now);
      // Unknown addresses get a stored counter too, so "burned" looks
      // the same for them as for real accounts.
      const burned = !hourly.allowed || (acct
        ? (acct.codeAttempts = (acct.codeAttempts ?? 0) + 1) > MAX_CODE_ATTEMPTS
        : !hitStoredLimit(db, 'verify:' + email, MAX_CODE_ATTEMPTS, CODE_TTL_MS, now).allowed);
      if (burned && acct) {
        acct.code = null;
        acct.codeExpiresAt = null;
        pendingCodes.delete(email);
      }
      return { ok: false as const, error: burned ? TOO_MANY : INVALID };
    }

    if (!acct) return { ok: false as const, error: INVALID };
    if (!acct.emailVerifiedAt) {
      // First proof of the address. A password typed at signup becomes real
      // only for the client that made that signup; for anyone else the
      // account starts with no password and the owner sets one while signed in.
      const bound = Boolean(acct.signupBindingHash) && Boolean(presentedToken)
        && safeEqual(sha256Hex(presentedToken!), acct.signupBindingHash!);
      acct.passwordHash = bound ? acct.pendingPasswordHash ?? null : null;
      acct.passwordSetAt = acct.passwordHash ? new Date().toISOString() : null;
      acct.pendingPasswordHash = null;
      acct.signupBindingHash = null;
    }
    acct.emailVerifiedAt = acct.emailVerifiedAt ?? new Date().toISOString();
    acct.code = null;
    acct.codeExpiresAt = null;
    acct.codeAttempts = 0;
    pendingCodes.delete(email);
    // Rotate whatever cookie this browser already held so a session planted
    // before sign-in cannot be reused. Other devices keep their own rows.
    const previous = cookieToken(req);
    if (previous) endSession(db, previous);
    const token = startSession(db, acct, 'code');
    if (acct.stage === 'unverified') acct.stage = 'verified';

    return {
      ok: true as const,
      sessionToken: token,
      name: acct.name,
      email: acct.email,
      company: acct.company,
      stage: acct.stage,
      hasPassword: Boolean(acct.passwordHash),
    };
  });

  if (!outcome.ok) {
    sendJson(res, 401, { error: outcome.error });
    return;
  }
  // Verifying the email is what makes the account real, and it signs the
  // browser in immediately — there is no second login. The cookie is
  // HttpOnly so page script cannot read the token (an XSS can't lift it).
  // The token is also in the body for non-browser API clients, which send
  // it as a Bearer header; the console does not store it.
  // The session cookie first (clients that read only the first cookie keep working), then the spent signup token is cleared.
  sendJson(res, 200, outcome, { 'Set-Cookie': [sessionCookie(outcome.sessionToken, SESSION_TTL_MS), signupCookie('', 0)] });
}

/**
 * Begin a fresh session (mutates db; call inside withDb). Other sessions
 * for this account stay valid: a new sign-in is another device, not a
 * replacement. The account fields mirror the newest token so older readers
 * of the store still see one. Returns the token.
 */
function startSession(db: DB, acct: AccountRecord, method: 'code' | 'password'): string {
  const token = randomBytes(24).toString('hex');
  const now = Date.now();
  const issuedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + SESSION_TTL_MS).toISOString();
  pruneSessions(db, now);
  db.sessions[token] = { email: acct.email, expiresAt, issuedAt, method, renewedAt: issuedAt };
  const live = Object.entries(db.sessions)
    .filter(([, s]) => s.email === acct.email)
    .sort((a, b) => new Date(a[1].issuedAt).getTime() - new Date(b[1].issuedAt).getTime());
  while (live.length > MAX_SESSIONS_PER_ACCOUNT) {
    const oldest = live.shift();
    if (oldest) delete db.sessions[oldest[0]];
  }
  acct.sessionToken = token;
  acct.sessionExpiresAt = expiresAt;
  acct.sessionIssuedAt = issuedAt;
  acct.sessionMethod = method;
  return token;
}

/** Drop expired sessions so the map cannot grow without bound. */
function pruneSessions(db: DB, now: number): void {
  for (const [key, s] of Object.entries(db.sessions)) {
    if (!s.expiresAt || now > new Date(s.expiresAt).getTime()) delete db.sessions[key];
  }
}

// Wrong passwords per address per hour before further password attempts are
// refused (the emailed code still works), and password attempts per client
// address per hour regardless of the address tried.
const MAX_LOGIN_FAILURES = 10;
const MAX_LOGIN_ATTEMPTS_PER_IP = 60;
/** A session this fresh from an emailed code may set a new password without the old one. */
const RESET_WINDOW_MS = 15 * 60_000;

// ---------------------------------------------------------------------
// POST /api/signin-password -- email + password. Same session as the
// emailed-code route. One answer for every failure, and the password is
// always checked against something, so neither the reply nor its timing
// says whether an address has an account.
// ---------------------------------------------------------------------

async function handleSigninPassword(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: { email?: string; password?: string };
  try {
    body = await readJson(req);
  } catch (err) {
    sendJson(res, 400, { error: (err as Error).message });
    return;
  }
  const email = text(body.email).trim().toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  if (!isValidEmail(email) || !password) {
    sendJson(res, 400, { error: 'Enter your email and password.' });
    return;
  }
  const INVALID = 'That email and password don’t match. You can also sign in with an emailed code.';
  if (password.length > MAX_PASSWORD) {
    sendJson(res, 401, { error: INVALID });
    return;
  }

  const now = Date.now();
  const failKey = 'login-fail:' + email;
  const gate = withDb((db) => {
    const ip = hitStoredLimit(db, 'login-ip:' + clientAddress(req), MAX_LOGIN_ATTEMPTS_PER_IP, HOUR_MS, now);
    if (!ip.allowed) return { blocked: true as const, retryAfterSec: ip.retryAfterSec };
    const f = db.rateLimits[failKey];
    if (f && now - f.start < f.windowMs && f.count >= MAX_LOGIN_FAILURES) {
      return { blocked: true as const, retryAfterSec: Math.ceil((f.start + f.windowMs - now) / 1000) };
    }
    const a = db.accounts[email];
    return { blocked: false as const, hash: a?.emailVerifiedAt ? a.passwordHash ?? null : null };
  });
  if (gate.blocked) {
    sendJson(res, 429, { error: 'Too many sign-in attempts. Try again later, or sign in with an emailed code.', code: 'rate_limited' }, { 'Retry-After': String(gate.retryAfterSec) });
    return;
  }

  const good = await verifyPassword(password, gate.hash);
  if (!good) {
    withDb((db) => { hitStoredLimit(db, failKey, MAX_LOGIN_FAILURES, HOUR_MS, now); });
    sendJson(res, 401, { error: INVALID });
    return;
  }
  const upgraded = passwordNeedsRehash(gate.hash) ? await hashPassword(password) : null;
  const previous = cookieToken(req);

  const outcome = withDb((db) => {
    const acct = db.accounts[email];
    if (!acct || !acct.emailVerifiedAt) return null;
    if (upgraded) acct.passwordHash = upgraded;
    if (previous) endSession(db, previous);
    const token = startSession(db, acct, 'password');
    return { ok: true as const, sessionToken: token, name: acct.name, email: acct.email, company: acct.company, stage: acct.stage, hasPassword: true };
  });
  if (!outcome) {
    sendJson(res, 401, { error: INVALID });
    return;
  }
  // Same year-long cookie as the signup verification path.
  sendJson(res, 200, outcome, { 'Set-Cookie': sessionCookie(outcome.sessionToken, SESSION_TTL_MS) });
}

// ---------------------------------------------------------------------
// POST /api/password -- set or change the password of the signed-in
// account. Allowed when the account has no password yet, when the session
// came from an emailed code in the last 15 minutes (the "forgot password"
// path), or when the current password is supplied.
// ---------------------------------------------------------------------

async function handlePassword(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const session = requireSession(req, res);
  if (!session) {
    sendJson(res, 401, { error: 'Sign in first.' });
    return;
  }
  let body: { password?: string; currentPassword?: string };
  try {
    body = await readJson(req);
  } catch (err) {
    sendJson(res, 400, { error: (err as Error).message });
    return;
  }
  const problem = passwordProblem(body.password, session.email);
  if (problem) {
    sendJson(res, 400, { error: problem, field: 'password' });
    return;
  }

  const now = Date.now();
  // The reset window belongs to this device's session. A password sign-in
  // on another device must not take it away, and must not grant it.
  const recentCode =
    session.method === 'code' && !!session.issuedAt && now - new Date(session.issuedAt).getTime() < RESET_WINDOW_MS;
  const info = withDb((db) => {
    const rl = hitStoredLimit(db, 'pw-change:' + session.email, 10, HOUR_MS, now);
    if (!rl.allowed) return { limited: true as const, retryAfterSec: rl.retryAfterSec };
    const a = db.accounts[session.email];
    return { limited: false as const, hash: a?.passwordHash ?? null };
  });
  if (info.limited) {
    sendJson(res, 429, { error: 'Too many password changes. Try again later.', code: 'rate_limited' }, { 'Retry-After': String(info.retryAfterSec) });
    return;
  }
  if (info.hash && !recentCode) {
    const given = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    if (!given || given.length > MAX_PASSWORD || !(await verifyPassword(given, info.hash))) {
      sendJson(res, 403, { error: 'Enter your current password, or sign in with an emailed code first.', code: 'reauth_required' });
      return;
    }
  }

  const newHash = await hashPassword(body.password as string);
  const rotated = withDb((db) => {
    const a = db.accounts[session.email];
    if (!a) return null;
    a.passwordHash = newHash;
    a.passwordSetAt = new Date().toISOString();
    // A password change ends every device. This browser gets a new cookie.
    revokeAccountSessions(db, a.email);
    return startSession(db, a, 'password');
  });
  if (!rotated) {
    sendJson(res, 401, { error: 'Sign in first.' });
    return;
  }
  sendJson(res, 200, { ok: true, sessionToken: rotated }, { 'Set-Cookie': sessionCookie(rotated, SESSION_TTL_MS) });
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function cookieSecure(): boolean {
  // Render serves the site over https and talks to this process over http.
  // The Secure flag has to follow the public site, not the hop in front of it.
  return (process.env.PUBLIC_BASE_URL ?? '').startsWith('https://')
    || process.env.COOKIE_SECURE === '1'
    || Boolean((process.env.RENDER ?? '').trim());
}

function sessionCookie(token: string, ttlMs: number): string {
  // HttpOnly so script cannot read it. SameSite=Lax: sent on same-site
  // requests and top-level navigations (the Stripe Checkout return), never
  // on cross-site POSTs. Max-Age (not a session cookie) so it survives a
  // browser restart. Secure on https, which is how omniatax.io is served.
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(ttlMs / 1000)}` +
    (cookieSecure() ? '; Secure' : '');
}

function cookieToken(req: IncomingMessage): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === SESSION_COOKIE) return v.join('=') || null;
  }
  return null;
}

// ---------------------------------------------------------------------
// POST /api/signout -- deletes this device's server session and clears
// its cookie. Other devices keep their own sessions.
// ---------------------------------------------------------------------

function handleSignout(req: IncomingMessage, res: ServerResponse): void {
  const token = sessionTokenFrom(req);
  if (token) {
    withDb((db) => {
      endSession(db, token);
    });
  }
  sendJson(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
}

/** End every device for this account. Used when the password changes. */
function revokeAccountSessions(db: DB, email: string): void {
  for (const [key, session] of Object.entries(db.sessions)) {
    if (session.email === email) delete db.sessions[key];
  }
  const acct = db.accounts[email];
  if (!acct) return;
  acct.sessionToken = null;
  acct.sessionExpiresAt = null;
  acct.sessionIssuedAt = null;
  acct.sessionMethod = null;
}

/** Remove one token. The account mirror is cleared only when it is this token. */
function endSession(db: DB, token: string): void {
  for (const [key] of Object.entries(db.sessions)) {
    if (!safeEqual(key, token)) continue;
    delete db.sessions[key];
    break;
  }
  for (const acct of Object.values(db.accounts)) {
    if (!acct.sessionToken || !safeEqual(acct.sessionToken, token)) continue;
    acct.sessionToken = null;
    acct.sessionExpiresAt = null;
    acct.sessionIssuedAt = null;
    acct.sessionMethod = null;
    break;
  }
}

// ---------------------------------------------------------------------
// Step 3 -- GET /api/terms
// ---------------------------------------------------------------------

function handleTerms(req: IncomingMessage, res: ServerResponse): void {
  const session = requireSession(req, res);
  if (!session) {
    sendJson(res, 401, { error: 'Verify your email first.' });
    return;
  }
  const url = new URL(req.url ?? '/', 'http://localhost');
  const employees = Math.max(0, Math.trunc(Number(url.searchParams.get('employees')) || 0));
  const payFrequency = url.searchParams.get('payFrequency') || 'biweekly';
  const rooftop = url.searchParams.get('rooftop') === 'true';

  const breakdown = computePricing({ employees, payFrequency, rooftop });
  const now = Date.now();
  const trialEndsAt = new Date(now + TRIAL_DAYS * 86_400_000).toISOString();
  const clauses = termsClauses({
    trialEndsAt,
    estimatedAnnual: breakdown.total,
    expectedEmployees: employees,
  });

  // Record exactly what is about to be shown, under an unguessable id.
  // Acceptance must present this id and is recorded from this record, so
  // the stored evidence is what the server displayed -- not whatever the
  // client re-sends later.
  const quote: TermsQuote = {
    id: 'tq_' + randomBytes(16).toString('hex'),
    email: session.email,
    termsVersion: TERMS_VERSION,
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + QUOTE_TTL_MS).toISOString(),
    trialDays: TRIAL_DAYS,
    trialEndsAt,
    termMonths: TERM_MONTHS,
    estimatedAnnual: breakdown.total,
    expectedEmployees: employees,
    payFrequency,
    rooftop,
    clausesSha256: sha256Hex(JSON.stringify(clauses)),
    acceptedAt: null,
  };
  withDb((db) => {
    // Unaccepted quotes past expiry are noise; accepted ones stay as evidence.
    for (const [id, q] of Object.entries(db.termsQuotes)) {
      if (!q.acceptedAt && now > new Date(q.expiresAt).getTime()) delete db.termsQuotes[id];
    }
    // Bounded per account, however often the page recalculates.
    const open = Object.values(db.termsQuotes)
      .filter((q) => q.email === session.email && !q.acceptedAt)
      .sort((a, b) => a.issuedAt.localeCompare(b.issuedAt));
    for (const q of open.slice(0, Math.max(0, open.length - (MAX_OPEN_QUOTES - 1)))) delete db.termsQuotes[q.id];
    db.termsQuotes[quote.id] = quote;
  });

  sendJson(res, 200, {
    quoteId: quote.id,
    quoteExpiresAt: quote.expiresAt,
    termsVersion: TERMS_VERSION,
    trialDays: TRIAL_DAYS,
    termMonths: TERM_MONTHS,
    trialEndsAt,
    estimate: breakdown,
    clauses,
  });
}

// ---------------------------------------------------------------------
// Step 4 -- POST /api/accept-terms
// ---------------------------------------------------------------------

async function handleAcceptTerms(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const session = requireSession(req, res);
  if (!session) {
    sendJson(res, 401, { error: 'Verify your email first.' });
    return;
  }

  let body: {
    signedName?: string; agreed?: unknown; legalName?: string; billingEmail?: string; address?: string;
    quoteId?: string; expectedEmployees?: unknown; payFrequency?: string; rooftop?: unknown;
  };
  try {
    body = await readJson(req);
  } catch (err) {
    sendJson(res, 400, { error: (err as Error).message });
    return;
  }

  const signedName = text(body.signedName).trim();
  const legalName = text(body.legalName).trim();
  const billingEmail = text(body.billingEmail).trim().toLowerCase();
  const address = text(body.address).trim();
  const quoteId = String(body.quoteId ?? '');

  if (body.agreed !== true) {
    sendJson(res, 400, { error: 'You have to tick the authorization box to continue.' });
    return;
  }
  if (!signedName || !legalName || !isValidEmail(billingEmail) || !address) {
    sendJson(res, 400, {
      error: 'Signature, legal business name, billing email and address are all required.',
    });
    return;
  }
  if (!quoteId) {
    sendJson(res, 400, { error: 'Load the terms before agreeing to them.', code: 'quote_required' });
    return;
  }

  const now = Date.now();

  const result = withDb((db) => {
    const acct = db.accounts[session.email];

    // The agreement binds to the terms the server showed this account.
    const quote = db.termsQuotes[quoteId];
    if (!quote || quote.email !== session.email) {
      return { ok: false as const, status: 409, code: 'quote_invalid', error: 'Those terms are not valid for this account. Reload them and agree again.' };
    }
    if (quote.acceptedAt) {
      return { ok: false as const, status: 409, code: 'quote_used', error: 'Those terms were already agreed to. Reload them to agree again.' };
    }
    if (now > new Date(quote.expiresAt).getTime() || quote.termsVersion !== TERMS_VERSION) {
      return { ok: false as const, status: 409, code: 'quote_expired', error: 'Those terms have expired. Reload them and agree again.' };
    }
    // A client that re-sends the figures must re-send the ones it was shown.
    const mismatch =
      (body.expectedEmployees !== undefined && Math.trunc(Number(body.expectedEmployees) || 0) !== quote.expectedEmployees) ||
      (body.payFrequency !== undefined && String(body.payFrequency).trim() !== quote.payFrequency) ||
      (body.rooftop !== undefined && (body.rooftop === true) !== quote.rooftop);
    if (mismatch) {
      return { ok: false as const, status: 409, code: 'quote_mismatch', error: 'The figures changed since the terms were shown. Reload them and agree again.' };
    }
    // LEGACY per-employee quote gate (code: employees_required).
    // Scott chose pay-per-calculation on 2026-10-19. The public site does
    // not collect an employee count and does not show a price. The quote
    // still records expectedEmployees so older billing tests and stored
    // subscriptions keep their shape, but a zero count no longer blocks
    // acceptance. Set LEGACY_EMPLOYEES_REQUIRED to true only to restore
    // the old rejection.
    const LEGACY_EMPLOYEES_REQUIRED = false;
    if (LEGACY_EMPLOYEES_REQUIRED && quote.expectedEmployees <= 0) {
      return { ok: false as const, status: 400, code: 'employees_required', error: 'Enter your employee count and reload the terms before agreeing.' };
    }
    // Re-signing must not replace a subscription that already started (it
    // would drop the Stripe ids and hand out a second free trial).
    const prior = db.subscriptions[session.email];
    if (prior?.trialStartsAt || prior?.status === 'cancelled') {
      return { ok: false as const, status: 409, code: 'already_subscribed', error: 'This account already has a subscription. Contact support to change its terms.' };
    }
    quote.acceptedAt = new Date(now).toISOString();
    const { expectedEmployees, payFrequency, rooftop, trialEndsAt } = quote;

    // Append-only: an acceptance is evidence, never edited in place.
    const acceptance: TermsAcceptance = {
      email: session.email,
      termsVersion: quote.termsVersion,
      signedName,
      acceptedAt: new Date(now).toISOString(),
      ip: clientAddress(req),
      userAgent: (req.headers['user-agent'] as string) ?? null,
      quoteId: quote.id,
      clausesSha256: quote.clausesSha256,
      disclosed: {
        trialDays: quote.trialDays,
        trialEndsAt,
        termMonths: quote.termMonths,
        estimatedAnnual: quote.estimatedAnnual,
        expectedEmployees,
        payFrequency,
        rooftop,
      },
    };
    db.acceptances.push(acceptance);

    const sub: SubscriptionRecord = {
      email: session.email,
      legalName,
      billingContact: signedName,
      billingEmail,
      address,
      expectedEmployees,
      payFrequency,
      rooftop,
      estimatedAnnual: quote.estimatedAnnual,
      status: 'payment_pending',
      trialStartsAt: null,
      trialEndsAt,
      termMonths: TERM_MONTHS,
      termEndsAt: null,
      createdAt: prior?.createdAt ?? new Date(now).toISOString(),
      activatedAt: null,
      stripeCustomerId: prior?.stripeCustomerId ?? null,
    };
    db.subscriptions[session.email] = sub;
    if (acct) acct.stage = 'payment_pending';

    return { ok: true as const, acceptance, subscription: sub };
  });

  if (!result.ok) {
    sendJson(res, result.status, { error: result.error, code: result.code });
    return;
  }
  console.log(`[terms accepted] v${result.acceptance.termsVersion}`);

  sendJson(res, 200, {
    ok: true,
    acceptedAt: result.acceptance.acceptedAt,
    termsVersion: TERMS_VERSION,
    subscription: result.subscription,
    paymentsConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
  });
}

// ---------------------------------------------------------------------
// Step 5 -- POST /api/payment-setup
//
// Hands off to the processor. A card or bank number must never be posted
// to this server, so this creates a Checkout session in setup mode and
// returns its URL; the customer types their details on the processor's
// page and we get back a reference plus a last four.
// ---------------------------------------------------------------------

async function handlePaymentSetup(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const session = requireSession(req, res);
  if (!session) {
    sendJson(res, 401, { error: 'Verify your email first.' });
    return;
  }

  const sub = readDb((db) => db.subscriptions[session.email]);
  if (!sub) {
    sendJson(res, 409, { error: 'Agree to the terms before attaching a payment method.' });
    return;
  }

  // One subscription per account. Another Checkout would make a second
  // Stripe subscription (billed and metered separately) and offer another
  // free trial. A cancelled account may start a new one.
  if (sub.stripeSubscriptionId && sub.status !== 'cancelled') {
    sendJson(res, 409, {
      error: 'This account already has a subscription. If a payment failed, update the card from the link in Stripe\'s email, or contact support.',
      code: 'already_subscribed',
    });
    return;
  }

  const refused = stripeKeyRefused();
  if (refused) {
    console.error(`[payment] ${refused}`);
    sendJson(res, 503, { error: refused, paymentsConfigured: false });
    return;
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    // Honest 501 rather than a fake success. The UI renders this as
    // "processor not connected" and leaves the account payment_pending.
    console.error('[payment] STRIPE_SECRET_KEY is not set on this server, so no one can add a payment method. Add it in the environment settings (see docs/STRIPE-SETUP.md).');
    sendJson(res, 501, {
      error: 'No payment processor is connected yet.',
      detail:
        'Set STRIPE_SECRET_KEY in .env and this step creates a real Checkout session for card or ACH. ' +
        'Until then the account stays at payment_pending and no trial clock starts.',
      paymentsConfigured: false,
    });
    return;
  }

  const originResult = resolveCheckoutOrigin(req, PORT);
  if (!originResult.ok) {
    console.error(`[payment] ${originResult.error}`);
    sendJson(res, 500, { error: originResult.error, code: 'checkout_origin_invalid' });
    return;
  }
  const origin = originResult.origin;
  const successUrl = `${origin}/signup/payment?setup=ok&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/signup/payment?setup=cancelled`;

  // Preferred path: a metered subscription to the flat per-call price, so every
  // future call actually bills. Requires STRIPE_PRICE_ID (a usage-metered
  // price). Falls back to card-on-file only when no price is configured.
  if (billingConfigured()) {
    try {
      // Reuse the customer if this account already has one.
      let customerId = sub.stripeCustomerId ?? null;
      if (!customerId) {
        customerId = await createBillingCustomer({ email: sub.billingEmail, name: sub.legalName });
        withDb((db) => {
          const s = db.subscriptions[session.email];
          if (s) s.stripeCustomerId = customerId;
        });
      }
      // The free trial is once per account: coming back after a cancellation starts billing.
      const out = await startMeteredCheckout({ customerId, email: session.email, successUrl, cancelUrl, trialDays: sub.trialStartsAt ? 0 : TRIAL_DAYS });
      if (!out.ok || !out.url || !isAllowedCheckoutUrl(out.url)) {
        console.error(`[payment] could not start Stripe Checkout (${out.reason ?? 'unknown'}): ${scrubMailLog(out.error ?? '')}`);
        sendJson(res, 502, { error: 'Could not start checkout.', code: 'checkout_failed' });
        return;
      }
      sendJson(res, 200, { ok: true, checkoutUrl: out.url, paymentsConfigured: true, metered: true });
      return;
    } catch (err) {
      console.error('[payment] Stripe request failed:', scrubMailLog(err instanceof Error ? err.message : String(err)));
      sendJson(res, 502, { error: 'Could not start checkout.', code: 'checkout_failed' });
      return;
    }
  }

  // Fallback: STRIPE_SECRET_KEY is set but no metered price — save a payment
  // method on file (setup mode). Metering stays off until a price is
  // configured. payment_method_types is omitted so Checkout uses the
  // dynamic payment methods enabled in the Stripe Dashboard.
  const form = new URLSearchParams();
  form.set('mode', 'setup');
  form.set('customer_email', sub.billingEmail);
  form.set('success_url', successUrl);
  form.set('cancel_url', cancelUrl);
  form.set('metadata[omnia_email]', session.email);
  form.set('metadata[terms_version]', TERMS_VERSION);

  try {
    const r = await fetch(`${process.env.STRIPE_API_BASE ?? 'https://api.stripe.com'}/v1/checkout/sessions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const payload = (await r.json()) as { url?: string; error?: { message?: string } };
    const ok = r.ok;
    if (!ok || !payload.url || !isAllowedCheckoutUrl(payload.url)) {
      console.error('[payment] Stripe refused the setup checkout:', scrubMailLog(payload.error?.message ?? 'no reason given'));
      sendJson(res, 502, { error: 'Could not start checkout.', code: 'checkout_failed' });
      return;
    }
    sendJson(res, 200, { ok: true, checkoutUrl: payload.url, paymentsConfigured: true, metered: false });
  } catch (err) {
    console.error('[payment] Stripe request failed:', scrubMailLog(err instanceof Error ? err.message : String(err)));
    sendJson(res, 502, { error: 'Could not start checkout.', code: 'checkout_failed' });
  }
}

// ---------------------------------------------------------------------
// POST /api/billing/return -- the console calls this with the Checkout
// session_id from the ?setup=ok return, so we capture the Stripe customer
// + subscription ids, mark the account trialing, and promote its key.
// ---------------------------------------------------------------------

async function handleBillingReturn(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const session = requireSession(req, res);
  if (!session) {
    sendJson(res, 401, { error: 'Sign in first.' });
    return;
  }
  let body: { sessionId?: string };
  try {
    body = await readJson(req);
  } catch (err) {
    sendJson(res, 400, { error: (err as Error).message });
    return;
  }
  if (typeof body.sessionId !== 'string' || !body.sessionId) {
    sendJson(res, 400, { error: 'A Checkout session_id is required.' });
    return;
  }

  const done = await completeMeteredCheckout(body.sessionId);
  if (!done.ok) {
    if (done.reason === 'checkout_not_complete') {
      sendJson(res, 402, { error: 'That checkout was not completed. Add a card or bank account to continue.', code: 'checkout_not_complete' });
      return;
    }
    console.error('[billing] checkout confirm failed:', scrubMailLog(done.error ?? done.reason ?? ''));
    sendJson(res, 502, { error: 'Could not confirm the subscription with the processor.', code: 'checkout_failed' });
    return;
  }
  // The checkout must be this account's own, and must have saved a card
  // or bank account; otherwise someone else's session id could unlock it.
  if (!done.email || done.email.toLowerCase() !== session.email) {
    sendJson(res, 403, { error: 'That checkout belongs to a different account.', code: 'checkout_mismatch' });
    return;
  }
  const saved = done.paymentMethod;
  if (!saved) {
    sendJson(res, 402, { error: 'No card or bank account was saved in that checkout.', code: 'payment_method_required' });
    return;
  }

  // Stripe's word on the subscription decides whether this checkout unlocks
  // anything. A replayed or half-finished one (past_due, unpaid, incomplete)
  // must not clear a billing suspension.
  if (done.subscriptionStatus && !GOOD_SUBSCRIPTION_STATUSES.has(done.subscriptionStatus)) {
    sendJson(res, 402, {
      error: 'Stripe has not accepted the first payment for this subscription, so the account was not unlocked. Update the payment method and try again.',
      code: 'subscription_not_in_good_standing',
      status: done.subscriptionStatus,
    });
    return;
  }

  const now = Date.now();
  const outcome = withDb((db) => {
    const sub = db.subscriptions[session.email];
    const acct = db.accounts[session.email];
    if (!sub) return { ok: false as const };
    const resubscribed = Boolean(done.subscriptionId && done.subscriptionId !== sub.stripeSubscriptionId);
    if (sub.status === 'cancelled' && !resubscribed) return { ok: false as const, cancelled: true };
    // A checkout for some other subscription than the one this account holds
    // is an old or stray one. It must not replace the current subscription.
    if (sub.status !== 'cancelled' && sub.stripeSubscriptionId && done.subscriptionId && done.subscriptionId !== sub.stripeSubscriptionId) {
      return { ok: false as const, superseded: true };
    }
    db.paymentMethods[session.email] = {
      email: session.email,
      kind: saved.kind,
      processorRef: saved.id,
      last4: saved.last4,
      brand: saved.brand,
      attachedAt: new Date(now).toISOString(),
    };
    if (done.customerId) sub.stripeCustomerId = done.customerId;
    if (done.subscriptionId) sub.stripeSubscriptionId = done.subscriptionId;
    sub.suspended = false;
    sub.suspendedReason = null;
    // A returning (re-subscribed) customer is active, not on a second trial.
    // An account that is already trialing or active stays as it is: replaying
    // its checkout must not move it back to trialing.
    if (sub.status !== 'active' && sub.status !== 'trialing') {
      sub.status = sub.trialStartsAt && resubscribed && sub.status === 'cancelled' ? 'active' : 'trialing';
    }
    sub.trialStartsAt = sub.trialStartsAt ?? new Date(now).toISOString();
    sub.trialEndsAt = sub.trialEndsAt ?? new Date(now + TRIAL_DAYS * 86_400_000).toISOString();
    if (!sub.termEndsAt) {
      sub.termEndsAt = new Date(new Date(now + TRIAL_DAYS * 86_400_000).setMonth(new Date(now).getMonth() + TERM_MONTHS)).toISOString();
    }
    if (acct) acct.stage = sub.status;
    // Promote the key to live for the committed term.
    const life = keyLifeFor(sub, now);
    for (const k of Object.values(db.keys)) {
      if (k.ownerEmail === session.email && k.isActive) {
        k.plan = life.plan;
        k.expiresAt = life.expiresAt;
      }
    }
    return { ok: true as const, subscription: sub };
  });

  if (!outcome.ok) {
    sendJson(res, 409, 'cancelled' in outcome
      ? { error: 'This subscription was cancelled. Start a new subscription to resume.', code: 'subscription_cancelled' }
      : 'superseded' in outcome
        ? { error: 'That checkout is for a different subscription than the one on this account.', code: 'checkout_superseded' }
        : { error: 'No subscription on file for this account.' });
    return;
  }
  console.log('[billing] subscription linked');
  sendJson(res, 200, { ok: true, subscription: outcome.subscription, metered: meteringConfigured() });
}

// ---------------------------------------------------------------------
// POST /api/billing/webhook -- Stripe delivery (open route; verified by
// signature). Suspends a key on a failed invoice, reactivates on payment.
// ---------------------------------------------------------------------

/** Subscription statuses that mean the customer has paid or is in a free trial. */
const GOOD_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing']);

/** Keep event ids long enough for Stripe's retry window (several days). */
const STRIPE_EVENT_TTL_MS = 30 * 24 * 60 * 60_000;
const STRIPE_EVENT_CAP = 20_000;

function stripeEventId(row: string): string {
  const at = row.lastIndexOf('@');
  return at > 0 && /^\d+$/.test(row.slice(at + 1)) ? row.slice(0, at) : row;
}

function stripeEventSeen(db: { processedStripeEvents?: string[] }, eventId: string | undefined): boolean {
  if (!eventId) return false;
  return (db.processedStripeEvents ?? []).some((row) => stripeEventId(row) === eventId);
}

function rememberStripeEvent(db: { processedStripeEvents?: string[] }, eventId: string | undefined): void {
  if (!eventId) return;
  const now = Date.now();
  const kept = (db.processedStripeEvents ?? []).filter((row) => {
    const at = row.lastIndexOf('@');
    const ts = at > 0 ? Number(row.slice(at + 1)) : NaN;
    return !Number.isFinite(ts) || now - ts < STRIPE_EVENT_TTL_MS;
  });
  if (!kept.some((row) => stripeEventId(row) === eventId)) kept.push(`${eventId}@${now}`);
  db.processedStripeEvents = kept.length > STRIPE_EVENT_CAP ? kept.slice(kept.length - STRIPE_EVENT_CAP) : kept;
}

/**
 * Link a finished Checkout to the account Stripe named. A signature-verified
 * checkout.session.completed does this even if the browser never returns,
 * so the customer id the meter events need is on the account.
 */
function applyCheckoutCompletion(
  db: DB,
  done: { email?: string | null; customerId?: string | null; subscriptionId?: string | null; subscriptionStatus?: string | null; paymentMethod?: { id: string; kind: string; brand: string | null; last4: string | null } | null },
): string | null {
  const email = done.email?.trim().toLowerCase() || null;
  const sub = (email && db.subscriptions[email])
    || (done.customerId ? Object.values(db.subscriptions).find((s) => s.stripeCustomerId === done.customerId) : undefined);
  if (!sub) return null;
  const previousSubId = sub.stripeSubscriptionId ?? null;
  // A completed checkout for some other subscription than the one this
  // account holds is old or stray. It links nothing and unlocks nothing.
  if (sub.status !== 'cancelled' && previousSubId && done.subscriptionId && done.subscriptionId !== previousSubId) return null;
  // Stripe has not accepted the payment (past_due, unpaid, incomplete): keep
  // any suspension and any status as they are.
  const good = !done.subscriptionStatus || GOOD_SUBSCRIPTION_STATUSES.has(done.subscriptionStatus);
  const resubscribed = Boolean(done.subscriptionId && sub.status === 'cancelled' && done.subscriptionId !== previousSubId);
  if (done.customerId) sub.stripeCustomerId = done.customerId;
  if (done.subscriptionId) sub.stripeSubscriptionId = done.subscriptionId;
  const saved = done.paymentMethod;
  if (saved) {
    db.paymentMethods[sub.email] = {
      email: sub.email,
      kind: saved.kind,
      processorRef: saved.id,
      last4: saved.last4,
      brand: saved.brand,
      attachedAt: new Date().toISOString(),
    };
  }
  if (!good) return sub.email;
  if (resubscribed && saved) {
    sub.status = 'active';
    sub.suspended = false;
    sub.suspendedReason = null;
    const acct = db.accounts[sub.email];
    if (acct) acct.stage = 'active';
  } else if (saved && sub.status !== 'cancelled' && sub.status !== 'active' && sub.status !== 'trialing') {
    const now = Date.now();
    sub.suspended = false;
    sub.suspendedReason = null;
    sub.status = 'trialing';
    sub.trialStartsAt = sub.trialStartsAt ?? new Date(now).toISOString();
    sub.trialEndsAt = sub.trialEndsAt ?? new Date(now + TRIAL_DAYS * 86_400_000).toISOString();
    if (!sub.termEndsAt) {
      sub.termEndsAt = new Date(new Date(now + TRIAL_DAYS * 86_400_000).setMonth(new Date(now).getMonth() + TERM_MONTHS)).toISOString();
    }
    const acct = db.accounts[sub.email];
    if (acct) acct.stage = 'trialing';
    const life = keyLifeFor(sub, now);
    for (const k of Object.values(db.keys)) {
      if (k.ownerEmail === sub.email && k.isActive) {
        k.plan = life.plan;
        k.expiresAt = life.expiresAt;
      }
    }
  }
  return sub.email;
}

async function handleBillingWebhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let rawBody: string;
  try {
    rawBody = await readBody(req);
  } catch (err) {
    sendJson(res, 400, { error: (err as Error).message });
    return;
  }
  const sig = req.headers['stripe-signature'];
  const result = interpretWebhook(rawBody, Array.isArray(sig) ? sig[0] : sig);
  if (!result.ok) {
    // 400 for a bad/forged signature; nothing is changed.
    sendJson(res, 400, { error: result.reason });
    return;
  }
  if (result.eventId && readDb((db) => stripeEventSeen(db, result.eventId))) {
    sendJson(res, 200, { received: true, duplicate: true });
    return;
  }

  if (result.action === 'checkout_completed') {
    if (!result.sessionId) {
      withDb((db) => { rememberStripeEvent(db, result.eventId); });
      sendJson(res, 200, { received: true, action: 'ignore' });
      return;
    }
    const done = await completeMeteredCheckout(result.sessionId);
    if (!done.ok && done.reason === 'stripe_error') {
      // Leave the event unclaimed so Stripe's retry can finish the link.
      sendJson(res, 500, { error: 'Could not confirm the checkout with Stripe.' });
      return;
    }
    const applied = withDb((db) => {
      if (stripeEventSeen(db, result.eventId)) return 'duplicate' as const;
      rememberStripeEvent(db, result.eventId);
      if (!done.ok) return null;
      return applyCheckoutCompletion(db, {
        email: done.email ?? result.email,
        customerId: done.customerId ?? result.customerId,
        subscriptionId: done.subscriptionId ?? result.subscriptionId,
        subscriptionStatus: done.subscriptionStatus,
        paymentMethod: done.paymentMethod,
      });
    });
    if (applied === 'duplicate') {
      sendJson(res, 200, { received: true, duplicate: true });
      return;
    }
    console.log('[billing webhook] checkout_completed');
    sendJson(res, 200, { received: true, action: 'checkout_completed', matched: Boolean(applied) });
    return;
  }

  if (result.action === 'ignore' || !result.customerId) {
    withDb((db) => { rememberStripeEvent(db, result.eventId); });
    sendJson(res, 200, { received: true });
    return;
  }

  const applied = withDb((db) => {
    if (stripeEventSeen(db, result.eventId)) return 'duplicate' as const;
    rememberStripeEvent(db, result.eventId);
    const sub = Object.values(db.subscriptions).find((s) => s.stripeCustomerId === result.customerId);
    if (!sub) return null;
    // Events arrive late and out of order. One about a subscription this
    // account no longer holds (an earlier one it replaced) must not cancel,
    // suspend, revive or overwrite the current one.
    if (result.subscriptionId && sub.stripeSubscriptionId && result.subscriptionId !== sub.stripeSubscriptionId) return 'stale' as const;
    if (result.subscriptionId && sub.status !== 'cancelled') sub.stripeSubscriptionId = result.subscriptionId;
    if (result.action === 'cancel') {
      sub.suspended = true;
      sub.suspendedReason = 'subscription_cancelled';
      sub.status = 'cancelled';
      const acct = db.accounts[sub.email];
      if (acct) acct.stage = 'cancelled';
    } else if (result.action === 'suspend') {
      // A failed invoice on an already-cancelled subscription keeps the
      // cancellation as the reason.
      sub.suspended = true;
      if (sub.status !== 'cancelled') sub.suspendedReason = 'payment_failed';
    } else if (result.action === 'reactivate') {
      // A paid invoice settles a payment failure. It never revives a
      // cancelled subscription (Stripe sends invoice.paid for the final
      // invoice after cancellation, too).
      if (sub.status !== 'cancelled' && sub.suspendedReason !== 'subscription_cancelled') {
        sub.suspended = false;
        sub.suspendedReason = null;
      }
    }
    return sub.email;
  });

  if (applied === 'duplicate') {
    sendJson(res, 200, { received: true, duplicate: true });
    return;
  }
  if (applied === 'stale') {
    console.log(`[billing webhook] ignored ${result.action} for a superseded subscription`);
    sendJson(res, 200, { received: true, action: 'ignored_stale_subscription' });
    return;
  }
  console.log(`[billing webhook] ${result.action}`);
  sendJson(res, 200, { received: true, action: result.action, matched: Boolean(applied) });
}

// ---------------------------------------------------------------------
// Step 6 -- POST /api/start-trial
//
// Called once a payment method is attached. Starts the clock, issues the
// key, and moves the account to trialing.
// ---------------------------------------------------------------------

async function handleStartTrial(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const session = requireSession(req, res);
  if (!session) {
    sendJson(res, 401, { error: 'Verify your email first.' });
    return;
  }

  const now = Date.now();
  const outcome = withDb((db) => {
    const sub = db.subscriptions[session.email];
    const acct = db.accounts[session.email];
    if (!sub) return { ok: false as const, error: 'Agree to the terms first.', code: undefined };

    const hasPayment = paymentOnFile(db, session.email);
    if (!hasPayment) {
      return { ok: false as const, error: 'Add a card or bank account first.', code: 'payment_method_required' };
    }
    if (sub.status === 'cancelled') {
      return { ok: false as const, error: 'This subscription was cancelled. Contact support to restart it.', code: undefined };
    }
    // One trial per subscription: once started, calling this again reports
    // the existing trial instead of moving its dates (which would extend
    // the free window and the key's committed term).
    if (sub.trialStartsAt) {
      return { ok: true as const, subscription: sub, paymentAttached: hasPayment };
    }

    sub.status = 'trialing';
    sub.trialStartsAt = new Date(now).toISOString();
    sub.trialEndsAt = new Date(now + TRIAL_DAYS * 86_400_000).toISOString();
    sub.termEndsAt = new Date(
      new Date(now + TRIAL_DAYS * 86_400_000).setMonth(new Date(now).getMonth() + TERM_MONTHS),
    ).toISOString();
    if (acct) acct.stage = 'trialing';

    // Promote any key the customer already minted so it lives through the
    // committed term instead of expiring at the end of the 14-day window.
    const life = keyLifeFor(sub, now);
    for (const k of Object.values(db.keys)) {
      if (k.ownerEmail === session.email && k.isActive) {
        k.plan = life.plan;
        k.expiresAt = life.expiresAt;
      }
    }
    return { ok: true as const, subscription: sub, paymentAttached: hasPayment };
  });

  if (!outcome.ok) {
    sendJson(res, outcome.code ? 402 : 409, { error: outcome.error, code: outcome.code });
    return;
  }
  console.log('[trial started]');
  sendJson(res, 200, { ok: true, subscription: outcome.subscription, paymentAttached: outcome.paymentAttached });
}

// ---------------------------------------------------------------------
// GET /api/account -- where this signup currently stands
// ---------------------------------------------------------------------

function handleAccount(req: IncomingMessage, res: ServerResponse): void {
  const session = requireSession(req, res);
  if (!session) {
    sendJson(res, 401, { error: 'Not signed in.' });
    return;
  }
  readDb((db) => {
    const acct = db.accounts[session.email];
    const sub = db.subscriptions[session.email] ?? null;
    const pm = db.paymentMethods[session.email] ?? null;
    const acceptance = db.acceptances.filter((a) => a.email === session.email).pop() ?? null;
    sendJson(res, 200, {
      name: acct?.name,
      email: acct?.email,
      company: acct?.company,
      stage: acct?.stage ?? 'unverified',
      emailVerifiedAt: acct?.emailVerifiedAt ?? null,
      hasPassword: Boolean(acct?.passwordHash),
      subscription: sub,
      paymentMethod: pm,
      acceptance,
      paymentsConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
      trialDays: TRIAL_DAYS,
      termMonths: TERM_MONTHS,
    });
  });
}

// ---------------------------------------------------------------------
// session lookup shared by the /api/* console routes below
// ---------------------------------------------------------------------

/** The console's session token: the HttpOnly cookie, or a Bearer header from a non-browser client. */
function sessionTokenFrom(req: IncomingMessage): string | null {
  return cookieToken(req) ?? bearerToken(req);
}

type AccountSession = {
  email: string;
  name: string;
  company: string;
  method: 'code' | 'password' | null;
  issuedAt: string | null;
};

function findSession(db: DB, token: string, now: number): { key: string; session: AuthSession; account: AccountRecord } | null {
  for (const [key, session] of Object.entries(db.sessions)) {
    if (!safeEqual(key, token)) continue;
    if (!session.expiresAt || now > new Date(session.expiresAt).getTime()) return null;
    const account = db.accounts[session.email];
    if (!account?.emailVerifiedAt) return null;
    return { key, session, account };
  }
  return null;
}

function requireSession(req: IncomingMessage, res?: ServerResponse): AccountSession | null {
  const token = sessionTokenFrom(req);
  if (!token) return null;
  const now = Date.now();
  const view = readDb((db) => {
    const found = findSession(db, token, now);
    if (!found) return null;
    return {
      email: found.account.email,
      name: found.account.name,
      company: found.account.company,
      method: found.session.method,
      issuedAt: found.session.issuedAt,
      renewedAt: found.session.renewedAt,
    };
  });
  if (!view) return null;
  // Slide when this session has been quiet for a day. The new Max-Age
  // replaces the cookie the browser already has, so an active user is
  // not signed out at the original year's end.
  if (res && now - new Date(view.renewedAt).getTime() >= SESSION_SLIDE_AFTER_MS) {
    withDb((db) => {
      const found = findSession(db, token, Date.now());
      if (!found) return;
      const t = Date.now();
      if (t - new Date(found.session.renewedAt).getTime() < SESSION_SLIDE_AFTER_MS) return;
      const expiresAt = new Date(t + SESSION_TTL_MS).toISOString();
      found.session.expiresAt = expiresAt;
      found.session.renewedAt = new Date(t).toISOString();
      if (found.account.sessionToken && safeEqual(found.account.sessionToken, token)) {
        found.account.sessionExpiresAt = expiresAt;
      }
    });
    res.setHeader('Set-Cookie', sessionCookie(token, SESSION_TTL_MS));
  }
  return { email: view.email, name: view.name, company: view.company, method: view.method, issuedAt: view.issuedAt };
}

/**
 * A key is only issued to, and only works for, an account with a card or
 * bank account saved through the processor (recorded on checkout return).
 */
function paymentOnFile(db: { paymentMethods: Record<string, PaymentMethodRecord | undefined> }, email: string): boolean {
  return Boolean(db.paymentMethods[email]?.processorRef);
}

// ---------------------------------------------------------------------
// POST /api/issue-key
// ---------------------------------------------------------------------

async function handleIssueKey(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const session = requireSession(req, res);
  if (!session) {
    sendJson(res, 401, { error: 'Sign in first.' });
    return;
  }

  if (!readDb((db) => paymentOnFile(db, session.email))) {
    sendJson(res, 402, { error: 'Add a card or bank account before issuing an API key.', code: 'payment_method_required' });
    return;
  }

  // A stolen session can't churn keys: a handful of issues an hour per account.
  const issueLimit = withDb((db) => hitStoredLimit(db, 'issue-key:' + session.email, 5, HOUR_MS));
  if (!issueLimit.allowed) {
    sendJson(res, 429, { error: 'Too many keys issued. Try again later.', code: 'rate_limited' }, { 'Retry-After': String(issueLimit.retryAfterSec) });
    return;
  }

  // Every issued key is a real key. OMNIA_ISSUE_LIVE_KEYS no longer chooses the prefix.
  const key = 'sk_live_' + randomBytes(24).toString('base64url');
  const keyHash = sha256Hex(key);
  const keyPrefix = key.slice(0, 'sk_live_'.length + 6);
  const now = Date.now();

  const life = withDb((db) => {
    // Revoking any prior key for this email on reissue -- one live key per
    // account, same as "generate a new one invalidates the old" that the
    // docs page tells the user before they click the button.
    for (const existing of Object.values(db.keys)) {
      if (existing.ownerEmail === session.email) existing.isActive = false;
    }
    const l = keyLifeFor(db.subscriptions[session.email], now);
    const record: KeyRecord = {
      keyHash,
      keyPrefix,
      ownerEmail: session.email,
      ownerName: session.name,
      company: session.company,
      plan: l.plan,
      createdAt: new Date(now).toISOString(),
      expiresAt: l.expiresAt,
      isActive: true,
      lastUsedAt: null,
      totalCalls: 0,
    };
    db.keys[keyHash] = record;
    return l;
  });

  sendJson(res, 200, { key, keyPrefix, plan: life.plan, expiresAt: life.expiresAt });
}

// ---------------------------------------------------------------------
// POST /api/demo/paycheck -- the live calculator on the home page. No key:
// it runs the real engine on a small, fixed shape of input and returns both
// the full request it built and the real result. Not billed, not recorded
// against any account, and limited per client address.
// ---------------------------------------------------------------------

const DEMO_PER_HOUR = 120;
const DEMO_MAX_GROSS_CENTS = 50_000_000; // $500,000 a paycheck
const DEMO_FREQUENCIES = ['weekly', 'biweekly', 'semimonthly', 'monthly'];
const DEMO_FILING = ['single', 'married_joint', 'married_separate', 'head_of_household'];

async function handleDemoPaycheck(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const rl = withDb((db) => hitStoredLimit(db, 'demo:' + clientAddress(req), DEMO_PER_HOUR, HOUR_MS));
  if (!rl.allowed) {
    sendJson(res, 429, { error: 'The live calculator is rate limited. Try again in a little while, or sign up for a key.', code: 'rate_limited' }, { 'Retry-After': String(rl.retryAfterSec) });
    return;
  }
  let body: Record<string, unknown>;
  try {
    body = await readJson<Record<string, unknown>>(req);
  } catch (err) {
    sendJson(res, 400, { error: (err as Error).message, code: 'invalid_json' });
    return;
  }
  const state = typeof body.state === 'string' ? body.state.toUpperCase() : '';
  const payFrequency = typeof body.payFrequency === 'string' ? body.payFrequency : 'biweekly';
  const filingStatus = typeof body.filingStatus === 'string' ? body.filingStatus : 'single';
  const gross = body.grossCents;
  const pretax = body.pretaxCents === undefined ? 0 : body.pretaxCents;
  const bad = (error: string) => sendJson(res, 422, { error, code: 'invalid_input' });
  const certificate = demoCertificate(body.certificate);
  const residenceState = typeof body.residenceState === 'string' ? body.residenceState.toUpperCase() : '';
  if (residenceState && !validStateCodes().has(residenceState)) return bad('The home state is not one this build can compute.');
  if (!validStateCodes().has(state)) return bad('Choose a state from the list.');
  if (!DEMO_FREQUENCIES.includes(payFrequency)) return bad('Choose weekly, biweekly, semimonthly or monthly.');
  if (!DEMO_FILING.includes(filingStatus)) return bad('Choose a filing status from the list.');
  if (!Number.isInteger(gross) || (gross as number) < 1 || (gross as number) > DEMO_MAX_GROSS_CENTS) return bad('Enter a paycheck amount between $0.01 and $500,000.');
  if (!Number.isInteger(pretax) || (pretax as number) < 0 || (pretax as number) > (gross as number)) return bad('The 401(k) deferral must be between $0 and the paycheck amount.');

  // Today's rules when we have them; otherwise the latest year we do have.
  const have = supportedYears().filter((y) => stateYears(state).includes(y));
  const today = new Date().toISOString().slice(0, 10);
  const checkDate = have.includes(Number(today.slice(0, 4))) ? today : `${have.at(-1) ?? supportedYears().at(-1)}-06-15`;

  const input = {
    checkDate,
    payFrequency,
    earnings: [{ code: 'REG', category: 'regular', amount: gross }],
    deductions: (pretax as number) > 0 ? [{ code: '401K', category: 'deferral_401k', amount: pretax }] : [],
    federalW4: { filingStatus, multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
    ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
    workState: certificate ? { code: state, certificate } : { code: state },
    ...(residenceState && residenceState !== state ? { residenceState: { code: residenceState } } : {}),
  };
  const validation = validatePaycheckInput(input, {
    validStateCodes: validStateCodes(),
    supportedYears: supportedYears(),
    stateHasYear: (code, year) => stateYears(code).includes(year),
  });
  if (!validation.ok) return bad(validation.errors[0]?.message ?? 'That input could not be used.');
  try {
    sendJson(res, 200, { demo: true, request: input, result: calculatePaycheck(validation.value) });
  } catch (err) {
    console.error('[demo paycheck] calculation failed:', err instanceof Error ? err.message : err);
    sendJson(res, 422, err instanceof CannotComputeError
      ? { error: err.message, code: 'cannot_compute' }
      : { error: 'That calculation could not be completed.', code: 'calculation_error' });
  }
}

// The certificate the address lookup produced, handed back by the page.
// Only flat scalar facts are kept, so the page can't smuggle structure into
// the engine; the engine and validator still judge the values.
function demoCertificate(raw: unknown): Record<string, string | number | boolean> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 60)) {
    if (!/^[A-Za-z][A-Za-z0-9]{0,40}$/.test(k)) continue;
    if (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) out[k] = v;
    else if (typeof v === 'string' && v.length <= 120) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

// ---------------------------------------------------------------------
// POST /api/demo/resolve-address -- the calculator's address lookup. Turns a
// work address (and optionally a home address) into the state, the local
// jurisdictions and the certificate facts the engine reads, using the same
// resolver the API's customers use. Public, so it is rate limited much
// harder than the calculation itself: each lookup calls outside geocoders.
// ---------------------------------------------------------------------

const DEMO_LOOKUPS_PER_HOUR = 30;

async function handleDemoResolveAddress(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const rl = withDb((db) => hitStoredLimit(db, 'demo-geo:' + clientAddress(req), DEMO_LOOKUPS_PER_HOUR, HOUR_MS));
  if (!rl.allowed) {
    sendJson(res, 429, { error: 'Too many address lookups from this connection. Try again in a little while, or sign up for a key.', code: 'rate_limited' }, { 'Retry-After': String(rl.retryAfterSec) });
    return;
  }
  let body: Record<string, unknown>;
  try {
    body = await readJson<Record<string, unknown>>(req);
  } catch (err) {
    sendJson(res, 400, { error: (err as Error).message, code: 'invalid_json' });
    return;
  }
  const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
  const work = clean(body.workAddress);
  const home = clean(body.residenceAddress);
  if (!work && !home) {
    sendJson(res, 422, { error: 'Enter a work address, like 233 S Wacker Dr, Chicago, IL 60606.', code: 'invalid_input' });
    return;
  }
  if (work.length > 200 || home.length > 200) {
    sendJson(res, 422, { error: 'That address is too long.', code: 'invalid_input' });
    return;
  }
  const checkDate = new Date().toISOString().slice(0, 10);
  try {
    // The public lookup never reads the large local address index; that is a
    // keyed-API feature (see handleAddress, which leaves useLocalIndex on).
    const r = await resolveEmployee({ work: work || undefined, residence: home || undefined }, checkDate, { useLocalIndex: false });
    const side = (a: typeof r.work) => a && {
      matched: a.matched,
      matchedAddress: a.matchQuality?.matchedAddress ?? null,
      state: a.resolved?.state ?? null,
      place: a.geographies?.incorporatedPlaces[0] ?? null,
      county: a.geographies?.counties[0] ?? null,
      precision: a.matched ? a.precision : null,
    };
    const state = (r.work?.matched ? r.work.resolved?.state : null) ?? (r.residence?.matched ? r.residence.resolved?.state : null) ?? null;
    const homeState = r.residence?.matched ? r.residence.resolved?.state ?? null : null;
    sendJson(res, 200, {
      state,
      residenceState: homeState && homeState !== state ? homeState : null,
      certificate: demoCertificate(r.certificateFields) ?? null,
      work: side(r.work),
      residence: side(r.residence),
      notResolvable: r.notResolvable,
      warnings: r.lowConfidenceReasons,
      fullyResolved: r.fullyResolved,
    });
  } catch (err) {
    console.error('[demo resolve-address] failed:', err instanceof Error ? err.message : err);
    sendJson(res, 502, { error: 'The address lookup is unavailable right now. Pick the state by hand instead.', code: 'geocode_unavailable' });
  }
}

// ---------------------------------------------------------------------
// Saved calculator scenarios -- /api/scenarios (list), /api/scenarios/save,
// /api/scenarios/delete. Signed-in accounts only; each account sees only its
// own. A scenario is the calculator's inputs, not a result: loading one
// reruns the real engine, so a saved scenario never goes stale.
// ---------------------------------------------------------------------

const MAX_SCENARIOS = 25;

/** The calculator inputs worth keeping, each checked; anything else is dropped. */
function scenarioInputs(raw: unknown): Record<string, unknown> | string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'Send the calculator inputs as an object.';
  const b = raw as Record<string, unknown>;
  const state = typeof b.state === 'string' ? b.state.toUpperCase() : '';
  if (!validStateCodes().has(state)) return 'Choose a state from the list.';
  const payFrequency = typeof b.payFrequency === 'string' ? b.payFrequency : '';
  if (!DEMO_FREQUENCIES.includes(payFrequency)) return 'Choose weekly, biweekly, semimonthly or monthly.';
  const filingStatus = typeof b.filingStatus === 'string' ? b.filingStatus : '';
  if (!DEMO_FILING.includes(filingStatus)) return 'Choose a filing status from the list.';
  const gross = b.grossCents;
  const pretax = b.pretaxCents === undefined ? 0 : b.pretaxCents;
  if (!Number.isInteger(gross) || (gross as number) < 1 || (gross as number) > DEMO_MAX_GROSS_CENTS) return 'Enter a paycheck amount between $0.01 and $500,000.';
  if (!Number.isInteger(pretax) || (pretax as number) < 0 || (pretax as number) > (gross as number)) return 'The 401(k) deferral must be between $0 and the paycheck amount.';
  const out: Record<string, unknown> = { state, payFrequency, filingStatus, grossCents: gross, pretaxCents: pretax };
  const text = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 200) : '');
  if (text(b.workAddress)) out.workAddress = text(b.workAddress);
  if (text(b.residenceAddress)) out.residenceAddress = text(b.residenceAddress);
  const certificate = demoCertificate(b.certificate);
  if (certificate) out.certificate = certificate;
  const residenceState = typeof b.residenceState === 'string' ? b.residenceState.toUpperCase() : '';
  if (residenceState) {
    if (!validStateCodes().has(residenceState)) return 'The home state is not one this build can compute.';
    out.residenceState = residenceState;
  }
  return out;
}

function handleScenarioList(req: IncomingMessage, res: ServerResponse): void {
  const session = requireSession(req, res);
  if (!session) { sendJson(res, 401, { error: 'Sign in to see saved scenarios.', code: 'not_signed_in' }); return; }
  sendJson(res, 200, { scenarios: readDb((db) => db.scenarios[session.email] ?? []), max: MAX_SCENARIOS });
}

async function handleScenarioSave(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const session = requireSession(req, res);
  if (!session) { sendJson(res, 401, { error: 'Sign in to save a scenario.', code: 'not_signed_in' }); return; }
  let body: Record<string, unknown>;
  try {
    body = await readJson<Record<string, unknown>>(req);
  } catch (err) {
    sendJson(res, 400, { error: (err as Error).message, code: 'invalid_json' });
    return;
  }
  const name = typeof body.name === 'string' ? body.name.replace(/\s+/g, ' ').trim() : '';
  if (!name || name.length > 60) { sendJson(res, 422, { error: 'Give the scenario a name of up to 60 characters.', code: 'invalid_input' }); return; }
  const inputs = scenarioInputs(body.inputs);
  if (typeof inputs === 'string') { sendJson(res, 422, { error: inputs, code: 'invalid_input' }); return; }

  const saved = withDb((db): SavedScenario | 'full' => {
    const list = (db.scenarios[session.email] ??= []);
    // Saving under an existing name replaces it, so "update" needs no id.
    const same = list.findIndex((s) => s.name.toLowerCase() === name.toLowerCase());
    const entry: SavedScenario = { id: 'sc_' + randomBytes(6).toString('hex'), name, createdAt: new Date().toISOString(), inputs };
    if (same >= 0) { list[same] = entry; return entry; }
    if (list.length >= MAX_SCENARIOS) return 'full';
    list.push(entry);
    return entry;
  });
  if (saved === 'full') {
    sendJson(res, 409, { error: `You can keep ${MAX_SCENARIOS} scenarios. Delete one to save another.`, code: 'scenario_limit' });
    return;
  }
  sendJson(res, 200, { scenario: saved });
}

async function handleScenarioDelete(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const session = requireSession(req, res);
  if (!session) { sendJson(res, 401, { error: 'Sign in first.', code: 'not_signed_in' }); return; }
  let body: Record<string, unknown>;
  try {
    body = await readJson<Record<string, unknown>>(req);
  } catch (err) {
    sendJson(res, 400, { error: (err as Error).message, code: 'invalid_json' });
    return;
  }
  const id = typeof body.id === 'string' ? body.id : '';
  const removed = withDb((db) => {
    const list = db.scenarios[session.email] ?? [];
    const i = list.findIndex((s) => s.id === id);
    if (i < 0) return false;
    list.splice(i, 1);
    return true;
  });
  if (!removed) { sendJson(res, 404, { error: 'That scenario was not found.', code: 'not_found' }); return; }
  sendJson(res, 200, { deleted: id });
}

// Address of the caller, for per-address limits.
/**
 * Trust X-Forwarded-For when TRUST_PROXY is on, or when Render started the
 * process (it always sits behind its proxy). An explicit TRUST_PROXY=0
 * wins, so a direct deployment can refuse the header. render.yaml sets
 * TRUST_PROXY=1; this default covers a service that did not sync that file.
 */
function trustProxy(): boolean {
  const flag = (process.env.TRUST_PROXY ?? '').trim().toLowerCase();
  if (flag === '0' || flag === 'false' || flag === 'no') return false;
  if (flag === '1' || flag === 'true' || flag === 'yes') return true;
  return Boolean((process.env.RENDER ?? '').trim());
}

function clientAddress(req: IncomingMessage): string {
  // The first X-Forwarded-For hop is the client. Only trusted behind a
  // proxy, so a direct caller can't pick its own address to dodge the limit.
  if (trustProxy()) {
    const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
    if (fwd) return fwd;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function paycheckLimiterLimit(): number {
  return Number(process.env.RATE_LIMIT_PER_MIN ?? 120);
}

function keyMode(k: { keyPrefix: string }): 'test' | 'live' {
  return k.keyPrefix.startsWith('sk_live_') ? 'live' : 'test';
}

/** Shown when a stored sk_test_ key is presented. Does not echo the key. */
const RETIRED_KEY_ERROR = 'This API key is no longer accepted. Sign in to the console and issue a new API key. The new key returns real calculations.';

function retiredCustomerKey(presented: string, record: { keyPrefix: string } | undefined): boolean {
  if (!record) return false;
  return presented.startsWith('sk_test_') || record.keyPrefix.startsWith('sk_test_');
}

function callsInLastDay(db: { usage: { keyHash: string; at: string; statusCode: number }[] }, keyHash: string): number {
  const dayAgo = Date.now() - 24 * 60 * 60_000;
  return db.usage.filter((u) => u.keyHash === keyHash && u.statusCode === 200 && new Date(u.at).getTime() >= dayAgo).length;
}

// ---------------------------------------------------------------------
// GET /v1/me -- what the calling API key is: its mode, lifetime and
// limits. Authenticated by the key itself
// (no account) and account keys alike.
// ---------------------------------------------------------------------

function handleMe(req: IncomingMessage, res: ServerResponse): void {
  const key = bearerToken(req);
  if (!key) {
    sendJson(res, 401, { error: 'Missing API key. Send "Authorization: Bearer <key>".', code: 'missing_key' });
    return;
  }
  const keyHash = sha256Hex(key);
  const info = readDb((db) => {
    const k = db.keys[keyHash];
    if (!k) return null;
    return { k, callsToday: callsInLastDay(db, keyHash) };
  });
  if (info && retiredCustomerKey(key, info.k)) {
    sendJson(res, 401, { error: RETIRED_KEY_ERROR, code: 'key_not_accepted' });
    return;
  }
  if (!info || !info.k.isActive) {
    sendJson(res, 401, { error: 'Invalid or inactive API key.', code: 'invalid_key' });
    return;
  }
  const { k, callsToday } = info;
  const mode = keyMode(k);
  sendJson(res, 200, {
    keyPrefix: k.keyPrefix,
    mode,
    plan: k.plan,
    createdAt: k.createdAt,
    expiresAt: k.expiresAt,
    expired: Date.now() > new Date(k.expiresAt).getTime(),
    lastUsedAt: k.lastUsedAt,
    totalCalls: k.totalCalls ?? 0,
    callsToday,
    limits: { requestsPerMinute: paycheckLimiterLimit() },
  });
}

// ---------------------------------------------------------------------
// GET /api/usage
// ---------------------------------------------------------------------

function handleUsage(req: IncomingMessage, res: ServerResponse): void {
  const session = requireSession(req, res);
  if (!session) {
    sendJson(res, 401, { error: 'Sign in first.' });
    return;
  }

  // Counts come from the site store, not from Stripe. Trial rows, $0 rows,
  // and rows whose meter event failed are included. Another account's keys
  // are not.
  const summary = readDb((db) => dashboardUsage(db, session.email, { metering: meteringConfigured() }));
  sendJson(res, 200, summary);
}

// ---------------------------------------------------------------------
// POST /api/paycheck -- the real product, key-authenticated
// ---------------------------------------------------------------------

/** What a successful key check hands to the endpoint that asked for it. */
interface KeyContext {
  requestId: string;
  keyHash: string;
  rlHeaders: Record<string, string>;
  customerId: string | null;
  meteredSubscription: boolean;
}

/**
 * The checks every key-authenticated endpoint shares: a key that exists,
 * is active and unexpired, an account in good standing with a payment
 * method, then the per-key rate limit. Sends the error and returns null
 * when any fails. `limiter` names the rate-limit bucket so endpoints
 * with different costs don't spend each other's allowance.
 */
function authenticateKey(req: IncomingMessage, res: ServerResponse, limiter: string): KeyContext | null {
  const requestId = 'req_' + randomBytes(8).toString('hex');
  const baseHeaders: Record<string, string> = { 'X-Request-Id': requestId };

  const key = bearerToken(req);
  if (!key) {
    sendJson(res, 401, { error: 'Missing API key. Send "Authorization: Bearer <key>".', code: 'missing_key', requestId }, baseHeaders);
    return null;
  }

  const keyHash = sha256Hex(key);
  const auth = readDb((db) => {
    const kr = db.keys[keyHash];
    const sub = kr ? db.subscriptions[kr.ownerEmail] : undefined;
    return {
      keyRecord: kr,
      customerId: sub?.stripeCustomerId ?? null,
      // Meter only a customer on a metered subscription: an event for a
      // customer with none is accepted by Stripe and never invoiced.
      meteredSubscription: Boolean(sub?.stripeCustomerId && sub?.stripeSubscriptionId),
      paymentOnFile: kr ? paymentOnFile(db, kr.ownerEmail) : false,
      cancelled: sub?.status === 'cancelled',
      suspended: Boolean(sub?.suspended),
      suspendedReason: sub?.suspendedReason ?? null,
    };
  });
  const keyRecord = auth.keyRecord;

  if (retiredCustomerKey(key, keyRecord)) {
    sendJson(res, 401, { error: RETIRED_KEY_ERROR, code: 'key_not_accepted', requestId }, baseHeaders);
    return null;
  }
  if (!keyRecord || !keyRecord.isActive) {
    sendJson(res, 401, { error: 'Invalid or inactive API key.', code: 'invalid_key', requestId }, baseHeaders);
    return null;
  }
  if (Date.now() > new Date(keyRecord.expiresAt).getTime()) {
    sendJson(res, 401, { error: `This API key expired on ${keyRecord.expiresAt}.`, code: 'expired_key', requestId }, baseHeaders);
    return null;
  }
  const mode = keyMode(keyRecord);
  baseHeaders['Omnia-Mode'] = mode;
  if (!auth.paymentOnFile) {
    sendJson(res, 402, { error: 'This account has no card or bank account on file. Add one in the console to use the API.', code: 'payment_method_required', requestId }, baseHeaders);
    return null;
  }
  if (auth.cancelled) {
    sendJson(res, 402, { error: 'This account\'s subscription was cancelled. Start a new subscription in the console to resume.', code: 'subscription_cancelled', requestId }, baseHeaders);
    return null;
  }
  if (auth.suspended) {
    sendJson(res, 402, { error: 'This account is suspended for a billing issue. Update your payment method to resume.', code: 'account_suspended', reason: auth.suspendedReason, requestId }, baseHeaders);
    return null;
  }

  // --- rate limit (per key, stored: shared by instances, kept across restarts)
  const rl = withDb((db) => hitStoredLimit(db, limiter + ':' + keyHash, paycheckLimiterLimit(), 60_000));
  const rlHeaders = {
    ...baseHeaders,
    'RateLimit-Limit': String(rl.limit),
    'RateLimit-Remaining': String(rl.remaining),
    'RateLimit-Reset': String(rl.resetAt),
  };
  if (!rl.allowed) {
    sendJson(
      res,
      429,
      { error: `Rate limit of ${rl.limit} requests/minute exceeded. Retry in ${rl.retryAfterSec}s.`, code: 'rate_limited', requestId },
      { ...rlHeaders, 'Retry-After': String(rl.retryAfterSec) },
    );
    return null;
  }
  // Every accepted key is real. A trialing subscription still has a Stripe
  // subscription id, so paycheck usage during the trial is reported. Stripe
  // does not bill usage recorded during trial_period_days.
  return { requestId, keyHash, rlHeaders, customerId: auth.customerId, meteredSubscription: auth.meteredSubscription };
}

function idempotencyKeyOf(req: IncomingMessage): string | null {
  const raw = req.headers['idempotency-key'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200 || !/^[\w.:-]+$/.test(trimmed)) return null;
  return trimmed;
}

function endpointOf(req: IncomingMessage): string {
  const path = (req.url ?? '/').split('?')[0];
  return `${req.method ?? 'POST'} ${path}`;
}

/** Meter when this key's account has a metered subscription. Trial subscriptions qualify. */
function wantMeter(auth: KeyContext): boolean {
  return meteringConfigured() && auth.meteredSubscription && Boolean(auth.customerId);
}

/**
 * Write the local usage row (and any meter queue items) before the response.
 * Stripe is not called here. A retry with the same Idempotency-Key does not
 * write a second row.
 */
function noteUsage(
  ctx: KeyContext,
  req: IncomingMessage,
  input: {
    statusCode: number;
    error: string | null;
    checkDate: string | null;
    kind: RecordUsageInput['kind'];
    paychecks: number;
    matched?: boolean;
  },
): { recorded: boolean } {
  return recordAccountUsage({
    keyHash: ctx.keyHash,
    statusCode: input.statusCode,
    error: input.error,
    checkDate: input.checkDate,
    endpoint: endpointOf(req),
    requestId: ctx.requestId,
    idempotencyKey: idempotencyKeyOf(req),
    kind: input.kind,
    paychecks: input.paychecks,
    ...(input.matched === undefined ? {} : { matched: input.matched }),
    meterCustomerId: ctx.customerId,
    wantMeter: wantMeter(ctx),
  });
}

async function handlePaycheck(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const ctx = authenticateKey(req, res, 'paycheck');
  if (!ctx) return;
  const { requestId, rlHeaders } = ctx;
  const auth = ctx;

  // --- parse ------------------------------------------------------------
  let raw: unknown;
  try {
    raw = await readJson<unknown>(req, 'any');
  } catch (err) {
    noteUsage(ctx, req, { statusCode: 400, error: 'invalid_json', checkDate: null, kind: 'paycheck', paychecks: 0 });
    sendJson(res, 400, { error: (err as Error).message, code: 'invalid_json', requestId }, rlHeaders);
    return;
  }

  // --- validate (structured, field-level) ------------------------------
  const validation = validatePaycheckInput(raw, {
    validStateCodes: validStateCodes(),
    supportedYears: supportedYears(),
    stateHasYear: (code, year) => stateYears(code).includes(year),
  });
  if (!validation.ok) {
    noteUsage(ctx, req, {
      statusCode: 422,
      error: 'validation_failed',
      checkDate: (raw as { checkDate?: string } | null)?.checkDate ?? null,
      kind: 'paycheck',
      paychecks: 0,
    });
    sendJson(
      res,
      422,
      {
        error: 'The request did not pass validation.',
        code: 'invalid_input',
        details: validation.errors,
        requestId,
      },
      rlHeaders,
    );
    return;
  }

  // --- optional extras: garnishments[] and minimumWageCheck -------------
  // Answered in this same call and billed as this same call.
  const extrasCheck = validatePaycheckExtras(raw as Record<string, unknown>, validation.value.workState?.code);
  if (!extrasCheck.ok) {
    noteUsage(ctx, req, { statusCode: 422, error: 'validation_failed', checkDate: validation.value.checkDate, kind: 'paycheck', paychecks: 0 });
    sendJson(
      res,
      422,
      { error: 'The request did not pass validation.', code: 'invalid_input', details: extrasCheck.errors, requestId },
      rlHeaders,
    );
    return;
  }

  // --- calculate --------------------------------------------------------
  let status = 200;
  let responseBody: unknown;
  let usageError: string | null = null;
  try {
    const result = calculatePaycheck(validation.value);
    const extras = runPaycheckExtras(validation.value, result, extrasCheck.value);
    const ignored = unknownFieldWarnings(raw as Record<string, unknown>);
    responseBody = {
      result: {
        ...result,
        ...(ignored.length > 0 ? { warnings: [...(result.warnings ?? []), ...ignored] } : {}),
        ...(extras.garnishment ? { garnishment: extras.garnishment } : {}),
        ...(extras.minimumWage ? { minimumWage: extras.minimumWage } : {}),
      },
    };
  } catch (err) {
    // Validation covers the common bad-input cases, so a throw here is
    // unexpected. Log the real reason for support (keyed by requestId);
    // hand the caller a safe message, never an engine stack detail.
    status = 422;
    usageError = err instanceof Error ? err.message : 'calculation_error';
    console.error(`[paycheck ${requestId}] calculation failed:`, usageError);
    responseBody =
      err instanceof ExtrasRefusal
        ? { error: err.message, code: 'invalid_input', details: [{ path: err.path, message: err.message }], requestId }
        : err instanceof UnsupportedTaxYearError
        ? { error: err.message, code: 'unsupported_tax_year', requestId }
        : err instanceof CannotComputeError
        ? { error: err.message, code: 'cannot_compute', requestId }
        : {
            error: 'The calculation could not be completed for the input provided.',
            code: 'calculation_error',
            requestId,
          };
  }

  // The usage row and its meter events are one store write. Stripe is
  // called afterwards, off the response path. A failed or skipped meter
  // event leaves the row in place. One successful paycheck is one unit.
  // requestId is Stripe's idempotency identifier for a single paycheck.
  const recorded = noteUsage(ctx, req, {
    statusCode: status,
    error: usageError,
    checkDate: validation.value.checkDate,
    kind: 'paycheck',
    paychecks: status === 200 ? 1 : 0,
  });
  sendJson(res, status, responseBody, rlHeaders);
  if (recorded.recorded && status === 200 && wantMeter(auth)) flushMeterSoon();
}

// ---------------------------------------------------------------------
// POST /v1/address -- key-authenticated address resolution. Turns a work
// address (and optionally a home address) into the state, the local
// jurisdictions and the certificate facts a paycheck needs, so the caller
// resolves an employee once and reuses the result on every pay run:
//   workState: { code: <state>, certificate: <certificate> }
// Not a paycheck calculation: the lookup is recorded and is not metered.
// ---------------------------------------------------------------------

async function handleAddress(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const ctx = authenticateKey(req, res, 'address');
  if (!ctx) return;
  const { requestId, rlHeaders } = ctx;

  let body: Record<string, unknown>;
  try {
    body = await readJson<Record<string, unknown>>(req);
  } catch (err) {
    noteUsage(ctx, req, { statusCode: 400, error: 'invalid_json', checkDate: null, kind: 'address', paychecks: 0 });
    sendJson(res, 400, { error: (err as Error).message, code: 'invalid_json', requestId }, rlHeaders);
    return;
  }
  const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
  const work = clean(body.workAddress);
  const home = clean(body.residenceAddress);
  const checkDate = typeof body.checkDate === 'string' ? body.checkDate : new Date().toISOString().slice(0, 10);
  const problem =
    !work && !home ? 'Send workAddress, residenceAddress, or both, as one-line street addresses.'
    : work.length > 200 || home.length > 200 ? 'An address can be at most 200 characters.'
    : body.checkDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(checkDate) ? 'checkDate must be ISO yyyy-mm-dd.'
    : null;
  if (problem) {
    noteUsage(ctx, req, { statusCode: 422, error: 'validation_failed', checkDate: null, kind: 'address', paychecks: 0 });
    sendJson(res, 422, { error: problem, code: 'invalid_input', requestId }, rlHeaders);
    return;
  }

  try {
    // Key-authenticated, so the large local address index is allowed here.
    const r = await resolveEmployee({ work: work || undefined, residence: home || undefined }, checkDate, { useLocalIndex: true });
    const side = (a: typeof r.work) => a && {
      matched: a.matched,
      matchedAddress: a.matchQuality?.matchedAddress ?? null,
      state: a.resolved?.state ?? null,
      place: a.geographies?.incorporatedPlaces[0] ?? null,
      county: a.geographies?.counties[0] ?? null,
      precision: a.matched ? a.precision : null,
      pointSource: a.matched && a.precision !== 'interpolated' ? pointSourceOf(a.rooftop) : null,
      coordinates: a.coordinates,
    };
    const matched = Boolean(r.work?.matched || r.residence?.matched);
    const state = (r.work?.matched ? r.work.resolved?.state : null) ?? (r.residence?.matched ? r.residence.resolved?.state : null) ?? null;
    const homeState = r.residence?.matched ? r.residence.resolved?.state ?? null : null;
    // An address lookup is not a paycheck calculation and is not metered.
    noteUsage(ctx, req, { statusCode: 200, error: null, checkDate: null, kind: 'address', paychecks: 0, matched });
    sendJson(res, 200, {
      matched,
      state,
      residenceState: homeState && homeState !== state ? homeState : null,
      certificate: r.certificateFields,
      work: side(r.work),
      residence: side(r.residence),
      notResolvable: r.notResolvable,
      lookupFailures: r.lookupFailures,
      warnings: r.lowConfidenceReasons,
      fullyResolved: r.fullyResolved,
      requestId,
    }, rlHeaders);
  } catch (err) {
    console.error(`[address ${requestId}] lookup failed:`, err instanceof Error ? err.message : err);
    noteUsage(ctx, req, { statusCode: 502, error: 'geocode_unavailable', checkDate: null, kind: 'address', paychecks: 0 });
    sendJson(res, 502, { error: 'The address lookup is unavailable right now. Retry shortly; nothing was billed.', code: 'geocode_unavailable', requestId }, rlHeaders);
  }
}

/** Deliver queued meter events now, off the response path. Failures stay queued. */
function flushMeterSoon(): void {
  void flushMeterQueue()
    .then((r) => {
      if (r.failed || r.dead) console.error(`[meter] ${r.failed} failed, ${r.dead} past Stripe's window; ${r.pending} still queued`);
    })
    .catch((err) => console.error('[meter] flush error:', err instanceof Error ? err.message : err));
}

const PAY_FREQUENCIES = new Set<PayFrequency>(['weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'semiannual', 'annual']);

/**
 * POST /v1/payCalc — one meter unit per successful paycheck in the batch.
 * The HTTP status stays 200 when the batch was parsed, matching the
 * self-hosted adapter. The usage row's status is 422 when every paycheck
 * in the batch failed, so a failed batch is not billed.
 */
async function handlePayCalc(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const ctx = authenticateKey(req, res, 'payCalc');
  if (!ctx) return;
  const { requestId, rlHeaders } = ctx;

  let requests: PayCalcRequest[];
  try {
    const body = await readJson<PayCalcRequest[] | { payCalc: PayCalcRequest[] }>(req, 'any');
    requests = Array.isArray(body) ? body : body.payCalc;
    if (!Array.isArray(requests)) throw new Error('Request body must be an array of PayCalcRequest, or { "payCalc": [...] }.');
  } catch (err) {
    noteUsage(ctx, req, { statusCode: 400, error: 'invalid_json', checkDate: null, kind: 'payCalc', paychecks: 0 });
    sendJson(res, 400, { error: err instanceof Error ? err.message : 'Bad request.', code: 'invalid_json', requestId }, rlHeaders);
    return;
  }

  let results;
  try {
    results = payCalc(requests);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'calculation_error';
    console.error(`[payCalc ${requestId}] failed:`, message);
    noteUsage(ctx, req, { statusCode: 422, error: 'calculation_error', checkDate: null, kind: 'payCalc', paychecks: 0 });
    sendJson(res, 422, { error: 'The calculation could not be completed for the input provided.', code: 'calculation_error', requestId }, rlHeaders);
    return;
  }

  const successes = results.filter((row) => !row.error).length;
  const failed = results.length - successes;
  const usageStatus = successes === 0 && failed > 0 ? 422 : 200;
  const recorded = noteUsage(ctx, req, {
    statusCode: usageStatus,
    error: failed > 0 ? `${failed} of ${results.length} paychecks failed` : null,
    checkDate: null,
    kind: 'payCalc',
    paychecks: successes,
  });
  sendJson(res, 200, { payCalc: results }, rlHeaders);
  if (recorded.recorded && successes > 0 && wantMeter(ctx)) flushMeterSoon();
}

/**
 * POST /v1/payroll/run — one usage unit per employee paycheck, not one
 * unit for the HTTP request. The request itself is counted separately.
 */
async function handlePayrollRun(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const ctx = authenticateKey(req, res, 'payroll');
  if (!ctx) return;
  const { requestId, rlHeaders } = ctx;

  let body: { companyId?: string; checkDate?: string; payFrequency?: string; employees?: PlatformEmployeeInput[] };
  try {
    body = await readJson(req);
  } catch (err) {
    noteUsage(ctx, req, { statusCode: 400, error: 'invalid_json', checkDate: null, kind: 'payroll', paychecks: 0 });
    sendJson(res, 400, { error: err instanceof Error ? err.message : 'Bad request.', code: 'invalid_json', requestId }, rlHeaders);
    return;
  }
  const frequency = body.payFrequency ?? 'biweekly';
  if (!body.employees?.length || !body.checkDate || !PAY_FREQUENCIES.has(frequency as PayFrequency)) {
    noteUsage(ctx, req, { statusCode: 400, error: 'validation_failed', checkDate: body.checkDate ?? null, kind: 'payroll', paychecks: 0 });
    sendJson(res, 400, { error: 'checkDate, payFrequency, and a non-empty employees[] are required.', code: 'invalid_input', requestId }, rlHeaders);
    return;
  }
  try {
    const run = await runEmbeddedPayroll({
      companyId: body.companyId ?? 'company',
      checkDate: body.checkDate,
      payFrequency: frequency as PayFrequency,
      employees: body.employees,
    });
    const paychecks = run.paychecks.length;
    const recorded = noteUsage(ctx, req, {
      statusCode: 200,
      error: null,
      checkDate: body.checkDate,
      kind: 'payroll',
      paychecks,
    });
    sendJson(res, 200, { ok: true, run }, rlHeaders);
    if (recorded.recorded && paychecks > 0 && wantMeter(ctx)) flushMeterSoon();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Payroll run failed.';
    console.error(`[payroll ${requestId}] failed:`, message);
    noteUsage(ctx, req, { statusCode: 422, error: 'calculation_error', checkDate: body.checkDate, kind: 'payroll', paychecks: 0 });
    sendJson(res, 422, { error: 'The payroll run could not be completed for the input provided.', code: 'calculation_error', requestId }, rlHeaders);
  }
}

function catalogCheckDate(req: IncomingMessage): string {
  const raw = new URL(req.url ?? '/', 'http://localhost').searchParams.get('checkDate');
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : new Date().toISOString().slice(0, 10);
}

/** GET /v1/uniqueTaxIds — a keyed catalog read. Recorded, not a paycheck charge. */
function handleUniqueTaxIds(req: IncomingMessage, res: ServerResponse): void {
  const ctx = authenticateKey(req, res, 'catalog');
  if (!ctx) return;
  const checkDate = catalogCheckDate(req);
  try {
    const entries = listUniqueTaxIds(checkDate);
    noteUsage(ctx, req, { statusCode: 200, error: null, checkDate, kind: 'catalog', paychecks: 0 });
    sendJson(res, 200, { checkDate, count: entries.length, entries }, ctx.rlHeaders);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bad request.';
    noteUsage(ctx, req, { statusCode: 400, error: 'invalid_input', checkDate, kind: 'catalog', paychecks: 0 });
    sendJson(res, 400, { error: message, code: 'invalid_input', requestId: ctx.requestId }, ctx.rlHeaders);
  }
}

function handleUniqueTaxId(req: IncomingMessage, res: ServerResponse, path: string): void {
  const ctx = authenticateKey(req, res, 'catalog');
  if (!ctx) return;
  const prefix = path.startsWith('/api/') ? '/api/uniqueTaxIds/' : '/v1/uniqueTaxIds/';
  const id = decodeURIComponent(path.slice(prefix.length));
  const checkDate = catalogCheckDate(req);
  const entry = resolveUniqueTaxId(id, checkDate);
  if (!entry) {
    noteUsage(ctx, req, { statusCode: 404, error: 'not_found', checkDate, kind: 'catalog', paychecks: 0 });
    sendJson(res, 404, { error: `No such uniqueTaxId for ${checkDate}.`, code: 'not_found', requestId: ctx.requestId }, ctx.rlHeaders);
    return;
  }
  noteUsage(ctx, req, { statusCode: 200, error: null, checkDate, kind: 'catalog', paychecks: 0 });
  sendJson(res, 200, entry, ctx.rlHeaders);
}

// ---------------------------------------------------------------------
// GET /api/states -- drives the sandbox's state dropdown from the
// rulesets actually present in data/states/, so the list can never
// claim a state this build can't compute.
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// GET /api/health -- unauthenticated liveness/readiness probe. Cheap and
// safe to hit from a load balancer. Reports the build's API version and
// how many jurisdictions it can compute, so a probe also catches a bad
// deploy with missing data.
// ---------------------------------------------------------------------

function handleHealth(res: ServerResponse): void {
  let states = 0;
  let ok = true;
  try {
    states = validStateCodes().size;
    if (states === 0) ok = false;
  } catch {
    ok = false;
  }
  // A store that exists but won't parse is refused (never overwritten), so
  // every account request fails until it's restored: report that here.
  let store: 'ok' | 'unreadable' = 'ok';
  try {
    readDb(() => true);
  } catch {
    store = 'unreadable';
    ok = false;
  }
  sendJson(res, ok ? 200 : 503, {
    status: ok ? 'ok' : 'degraded',
    version: API_VERSION,
    states,
    store,
    taxYears: supportedYears(),
    // Which integrations this server has been given keys for. Booleans only.
    payments: stripeConfigured(),
    metering: meteringConfigured(),
    email: isEmailConfigured() || verifierConfigured(),
    time: new Date().toISOString(),
  });
}

// Tax years each state has a ruleset for (2025 covers only some states).
let STATE_YEARS: Map<string, number[]> | null = null;
function stateYears(code: string): number[] {
  if (!STATE_YEARS) {
    STATE_YEARS = new Map();
    for (const f of readdirSync(join(HERE, '..', 'data', 'states'))) {
      const m = /^([A-Z]{2})-(\d{4})\.json$/.exec(f);
      if (!m) continue;
      STATE_YEARS.set(m[1], [...(STATE_YEARS.get(m[1]) ?? []), Number(m[2])].sort((a, b) => a - b));
    }
  }
  return STATE_YEARS.get(code.toUpperCase()) ?? [];
}

function percentText(rate: number): string {
  return `${(Math.round(rate * 10000) / 100).toFixed(2)}%`;
}

/** Short withholding phrase for the sandbox. Comes from the ruleset, not a hardcoded rate. */
function stateRateLabel(raw: { method?: string; flatRate?: { rate?: number } }): string {
  if (raw.method === 'no_income_tax') return 'no income tax';
  const rate = raw.flatRate && typeof raw.flatRate.rate === 'number' ? raw.flatRate.rate : null;
  if (rate != null) return `a flat ${percentText(rate)}`;
  return 'withholding tables';
}

function paidLeaveNote(raw: Record<string, unknown>): string {
  const name = String(raw.name ?? 'This state');
  const hasLeave = raw.statePaidLeaveEmployee != null;
  const hasDisability = raw.stateDisabilityEmployee != null;
  const leave = raw.paidLeave as { program?: unknown } | undefined;
  const program = leave && typeof leave.program === 'string' ? leave.program : '';
  const family = raw.paidFamilyMedicalLeave as { status?: unknown } | undefined;
  const status = family && typeof family.status === 'string' ? family.status : '';
  if (hasLeave && hasDisability) return `${name} withholds state paid leave and disability insurance on this check.`;
  if (hasLeave) return `${name} withholds state paid leave on this check.`;
  if (hasDisability) return `${name} withholds state disability insurance on this check.`;
  if (program) return program.endsWith('.') ? program : `${program}.`;
  if (status.startsWith('no_program')) return `${name} has no state paid-leave or disability program, so nothing applies to this check.`;
  return `${name} has no state paid-leave or disability withholding in this build, so nothing applies to this check.`;
}

function handleStates(res: ServerResponse, rawUrl: string): void {
  const dir = join(HERE, '..', 'data', 'states');
  const asked = Number(new URL(rawUrl, 'http://x').searchParams.get('year'));
  const year = supportedYears().includes(asked) ? asked : supportedYears().at(-1);
  const states = readdirSync(dir)
    .filter((f) => f.endsWith(`-${year}.json`))
    .map((f) => {
      const raw = JSON.parse(readFileSync(join(dir, f), 'utf8')) as {
        code: string;
        name: string;
        method?: string;
        flatRate?: { rate?: number };
        reciprocity?: { reciprocalStates?: string[] };
      };
      return {
        code: raw.code,
        name: raw.name,
        rateLabel: stateRateLabel(raw),
        reciprocalStates: Array.isArray(raw.reciprocity?.reciprocalStates) ? raw.reciprocity.reciprocalStates : [],
        paidLeaveNote: paidLeaveNote(raw as unknown as Record<string, unknown>),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  sendJson(res, 200, { year, states });
}

// ---------------------------------------------------------------------
// POST /api/contact -- the contact form. Sends one email to the owner
// through the same provider as verification codes. 501 when no provider is
// connected, so the page can fall back to the visitor's own mail app.
// ---------------------------------------------------------------------

async function handleContact(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: { name?: unknown; email?: unknown; company?: unknown; message?: unknown; website?: unknown };
  try {
    body = await readJson(req);
  } catch (err) {
    sendJson(res, 400, { error: (err as Error).message });
    return;
  }
  // A hidden field real visitors never fill in; bots do. Pretend it worked.
  if (typeof body.website === 'string' && body.website.trim()) {
    sendJson(res, 200, { ok: true });
    return;
  }
  const name = text(body.name).trim().slice(0, 120);
  const email = text(body.email).trim().toLowerCase().slice(0, 254);
  const company = text(body.company).trim().slice(0, 160);
  const message = text(body.message).trim().slice(0, 5000);
  if (!name || !isValidEmail(email) || message.length < 5) {
    sendJson(res, 400, { error: 'Name, a valid email and a message are required.', code: 'invalid_input' });
    return;
  }
  if (!isEmailConfigured()) {
    sendJson(res, 501, { error: 'Email is not connected on this server.', code: 'email_not_configured' });
    return;
  }
  const gate = withDb((db) => hitStoredLimit(db, 'contact:' + clientAddress(req), 5, HOUR_MS));
  if (!gate.allowed) {
    sendJson(res, 429, { error: 'Too many messages from this network. Try again later.', code: 'rate_limited' }, { 'Retry-After': String(gate.retryAfterSec) });
    return;
  }
  const sent = await sendContactEmail({ name, email, company, message });
  if (!sent.sent) {
    console.error(`[contact] not delivered: ${sent.reason}`);
    sendJson(res, 502, { error: 'We could not send your message just now.', code: 'send_failed' });
    return;
  }
  sendJson(res, 200, { ok: true });
}

// ---------------------------------------------------------------------
// GET /api/coverage and /api/coverage/local -- what this build computes,
// read from the data files (site/lib/coverage.ts). Public: the coverage
// page needs no sign-in, and nothing here is account data.
// ---------------------------------------------------------------------

function handleCoverage(res: ServerResponse): void {
  const { year, summary, states } = coverage();
  sendJson(res, 200, { year, summary, states }, { 'Cache-Control': 'public, max-age=300' });
}

function handleCoverageLocal(res: ServerResponse, rawUrl: string): void {
  const q = new URL(rawUrl, 'http://x').searchParams;
  const kind = q.get('kind');
  sendJson(
    res,
    200,
    searchLocal({
      q: q.get('q') ?? '',
      state: q.get('state') ?? '',
      kind: kind === 'tax' || kind === 'wage' ? kind : 'all',
      page: Number(q.get('page') ?? 0) || 0,
      size: Number(q.get('size') ?? 25) || 25,
    }),
    { 'Cache-Control': 'public, max-age=300' },
  );
}

// ---------------------------------------------------------------------
// POST /api/estimate -- the homepage price estimator (index.html,
// Pricing section). Deliberately public: no session needed, since this
// runs before anyone has signed in. The number is computed here from
// site/lib/pricing.ts, the same module the console bills from, so what a
// visitor is quoted and what they'd actually be charged can't drift.
// ---------------------------------------------------------------------

async function handleEstimate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: { email?: string; employees?: unknown; payFrequency?: string; rooftop?: unknown };
  try {
    body = await readJson(req);
  } catch (err) {
    sendJson(res, 400, { error: (err as Error).message });
    return;
  }

  const email = text(body.email).trim().toLowerCase();
  const employees = Math.max(0, Math.trunc(Number(body.employees) || 0));
  const payFrequency = text(body.payFrequency).trim() || 'biweekly';
  const rooftop = body.rooftop === true;

  if (!isValidEmail(email)) {
    sendJson(res, 400, { error: 'A valid work email is required.' });
    return;
  }
  // LEGACY estimator. The public pricing page is pay-per-calculation and
  // shows the rate as TBA. This endpoint still answers employee-based
  // quotes so existing billing tests keep working. The site no longer calls it.
  if (employees <= 0) {
    sendJson(res, 400, { error: 'Tell us roughly how many employees you pay.' });
    return;
  }

  const breakdown = computePricing({ employees, payFrequency, rooftop });

  withDb((db) => {
    db.estimates.push({
      email,
      employees,
      payFrequency,
      callsPerYear: breakdown.callsPerYear,
      rooftop,
      estimatedPrice: breakdown.total,
      at: new Date().toISOString(),
    });
  });

  console.log(`[estimate] ${employees} employees, ${payFrequency}, rooftop=${rooftop}`);
  sendJson(res, 200, { ok: true, ...breakdown });
}

// ---------------------------------------------------------------------
// GET /api/billing -- trial countdown and what this account's real usage
// has cost so far, priced off the same tiers as everything else.
// ---------------------------------------------------------------------

function handleBilling(req: IncomingMessage, res: ServerResponse): void {
  const session = requireSession(req, res);
  if (!session) {
    sendJson(res, 401, { error: 'Sign in first.' });
    return;
  }

  readDb((db) => {
    const key = Object.values(db.keys).find((k) => k.ownerEmail === session.email && k.isActive);
    const sub = db.subscriptions[session.email] ?? null;
    const pm = db.paymentMethods[session.email] ?? null;
    const calls = key ? db.usage.filter((u) => u.keyHash === key.keyHash).length : 0;

    const trialEndsAt = sub?.trialEndsAt ?? key?.expiresAt ?? null;
    const daysLeft = trialEndsAt
      ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86_400_000))
      : null;

    sendJson(res, 200, {
      status: sub?.status ?? (key ? 'trialing' : 'no_key'),
      trialDays: TRIAL_DAYS,
      trialEndsAt,
      daysLeft,
      callsSoFar: calls,
      // The per-calculation rate is not published. It lives on the Stripe price.
      subscription: sub,
      paymentMethod: pm,
      termMonths: TERM_MONTHS,
      // Real billing state. paymentsConfigured means a card/subscription
      // Checkout can be created; metered means successful calls actually
      // report usage to Stripe; suspended means a failed invoice has paused
      // the key (a paid invoice reactivates it via webhook).
      paymentsConfigured: billingConfigured() || stripeConfigured(),
      metered: meteringConfigured() && Boolean(sub?.stripeCustomerId && sub?.stripeSubscriptionId),
      subscribed: Boolean(sub?.stripeSubscriptionId),
      suspended: Boolean(sub?.suspended),
      suspendedReason: sub?.suspendedReason ?? null,
    });
  });
}

// ---------------------------------------------------------------------
// routing
// ---------------------------------------------------------------------

createServer((req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  // A HEAD request is a GET without the body: link checkers, uptime monitors and some crawlers use it
  // to test a URL (the sitemap, robots.txt, a page) before fetching it. Every route below matches
  // 'GET' only, so without this a HEAD for any page was a 404 even though the GET was a 200.
  // Node drops the body of a HEAD response itself and keeps the headers, Content-Length included.
  const asked = req.method ?? 'GET';
  const method = asked === 'HEAD' ? 'GET' : asked;

  (async () => {
    if (method === 'GET') {
      const dest = canonicalRedirect(req, req.url ?? '/');
      if (dest) {
        res.writeHead(301, { Location: dest, ...securityHeaders(req), 'Cache-Control': 'public, max-age=3600' });
        res.end();
        return;
      }
    }
    if (method === 'GET' && url === '/robots.txt') {
      const body = Buffer.from(robotsTxt(canonicalOrigin()));
      const headers: Record<string, string | number> = {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
        ...securityHeaders(req),
      };
      const gz = maybeGzip(req, body, headers);
      headers['Content-Length'] = gz.length;
      res.writeHead(200, headers);
      res.end(gz);
      return;
    }
    if (method === 'GET' && url === '/sitemap.xml') {
      const lastmod: Record<string, string> = {};
      for (const page of indexablePages()) {
        try { lastmod[page.path] = statSync(join(HERE, page.file)).mtime.toISOString().slice(0, 10); } catch { /* missing file */ }
      }
      const body = Buffer.from(sitemapXml(canonicalOrigin(), lastmod));
      const headers: Record<string, string | number> = {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
        ...securityHeaders(req),
      };
      const gz = maybeGzip(req, body, headers);
      headers['Content-Length'] = gz.length;
      res.writeHead(200, headers);
      res.end(gz);
      return;
    }
    if (method === 'OPTIONS' && (url.startsWith('/api/') || url.startsWith('/v1/'))) {
      const cors = corsHeaders(req);
      if (!cors['Access-Control-Allow-Origin']) {
        sendJson(res, 403, { error: 'Origin not allowed.', code: 'cors' });
        return;
      }
      res.writeHead(204, { ...securityHeaders(req), ...cors, 'Content-Length': '0' });
      res.end();
      return;
    }

    const page = method === 'GET' ? pageForRoute(url) : undefined;
    if (page) {
      sendPage(req, res, join(HERE, page.file), page.path);
      return;
    }
    if (method === 'GET' && (url === '/favicon.ico' || url === '/favicon.svg' || url === '/apple-touch-icon.png' || url === '/site.webmanifest' || url.startsWith('/logo/') || url.startsWith('/assets/') || url === '/tokens.css')) {
      let decoded = url;
      try { decoded = decodeURIComponent(url); } catch { decoded = url; }
      // Google and every browser ask for /favicon.ico at the root first, so it must be a real .ico.
      const rel = decoded === '/favicon.ico'
        ? 'logo/favicon.ico'
        : decoded === '/favicon.svg'
          ? 'logo/favicon.svg'
          : decoded === '/site.webmanifest'
            ? 'site.webmanifest'
            : decoded === '/apple-touch-icon.png'
            ? 'logo/apple-touch-icon.png'
            : decoded.replace(/^\/+/, '');
      if (!rel.includes('..') && !rel.includes('\\') && !rel.includes('\0')) {
        const file = resolve(HERE, rel);
        if ((file === HERE || file.startsWith(HERE + '/')) && existsSync(file) && statSync(file).isFile()) {
          sendStatic(res, file, contentTypeFor(file), req);
          return;
        }
      }
    }
    if (method === 'GET' && url === '/sandbox-examples.json') {
      sendStatic(res, join(HERE, 'sandbox-examples.json'), 'application/json; charset=utf-8', req);
      return;
    }
    const aliases: Record<string, string> = {
      '/index.html': '/',
      '/docs.html': '/docs',
      '/sandbox.html': '/sandbox',
      '/terms.html': '/terms',
      '/privacy.html': '/privacy',
      '/legal/terms.html': '/terms',
      '/legal/privacy.html': '/privacy',
      '/legal/acceptable-use.html': '/acceptable-use',
      '/legal/disclaimer.html': '/disclaimer',
      '/reference': '/docs',
      '/reference.html': '/docs',
      '/api-reference': '/docs',
    };
    if (method === 'GET' && aliases[url]) {
      res.writeHead(301, { Location: aliases[url], ...securityHeaders(req) });
      res.end();
      return;
    }
    // Links in the wild add a trailing slash, an .html, or different capitals.
    // Send them to the one address that has a page, so they are not 404s.
    if (method === 'GET') {
      const tidy = url.replace(/\.html$/, '').replace(/\/+$/, '').toLowerCase();
      if (tidy && tidy !== url && pageForRoute(tidy)) {
        const search = (req.url ?? '').includes('?') ? '?' + (req.url ?? '').split('?').slice(1).join('?') : '';
        res.writeHead(301, { Location: tidy + search, ...securityHeaders(req) });
        res.end();
        return;
      }
    }

    // Legal pages (served, so customers can read them).
    if (method === 'GET' && url === '/legal/legal.css') {
      sendStatic(res, join(HERE, 'legal', 'legal.css'), 'text/css; charset=utf-8', req);
      return;
    }
    {
      const legal: Record<string, string> = {
        '/terms': 'terms',
        '/privacy': 'privacy',
        '/acceptable-use': 'acceptable-use',
        '/disclaimer': 'disclaimer',
      };
      if (method === 'GET' && legal[url]) {
        sendHtml(req, res, join(HERE, 'legal', `${legal[url]}.html`), url);
        return;
      }
    }

    // Cookie-authenticated routes refuse cross-site browser POSTs
    // (belt and braces on top of SameSite=Lax). Bearer-key clients and the
    // Stripe webhook send no Origin header, so they pass untouched.
    if (method === 'POST' && url.startsWith('/api/') && !CSRF_EXEMPT.has(url) && !sameOrigin(req)) {
      sendJson(res, 403, { error: 'Cross-origin request refused.', code: 'bad_origin' });
      return;
    }
    if (method === 'POST' && (url.startsWith('/api/') || url.startsWith('/v1/')) && !CSRF_EXEMPT.has(url) && !csrfOk(req)) {
      sendJson(res, 403, { error: 'Cross-site request refused.', code: 'bad_csrf' });
      return;
    }

    if (method === 'POST' && url === '/api/signup') return handleSignup(req, res);
    if (method === 'POST' && url === '/api/verify-email') return handleVerifyEmail(req, res);
    if (method === 'POST' && url === '/api/signin') return handleSignin(req, res);
    if (method === 'POST' && url === '/api/signin-password') return handleSigninPassword(req, res);
    if (method === 'POST' && url === '/api/password') return handlePassword(req, res);
    if (method === 'POST' && url === '/api/contact') return handleContact(req, res);
    if (method === 'POST' && url === '/api/demo/paycheck') return handleDemoPaycheck(req, res);
    if (method === 'POST' && url === '/api/demo/resolve-address') return handleDemoResolveAddress(req, res);
    if (method === 'GET' && url === '/api/scenarios') return handleScenarioList(req, res);
    if (method === 'POST' && url === '/api/scenarios/save') return handleScenarioSave(req, res);
    if (method === 'POST' && url === '/api/scenarios/delete') return handleScenarioDelete(req, res);
    if (method === 'POST' && url === '/api/signout') return handleSignout(req, res);
    if (method === 'GET' && url === '/api/terms') return handleTerms(req, res);
    if (method === 'POST' && url === '/api/accept-terms') return handleAcceptTerms(req, res);
    if (method === 'POST' && url === '/api/payment-setup') return handlePaymentSetup(req, res);
    if (method === 'POST' && url === '/api/billing/return') return handleBillingReturn(req, res);
    if (method === 'POST' && (url === '/api/billing/webhook' || url === '/v1/billing/webhook')) return handleBillingWebhook(req, res);
    if (method === 'POST' && url === '/api/start-trial') return handleStartTrial(req, res);
    if (method === 'GET' && url === '/api/account') return handleAccount(req, res);
    if (method === 'POST' && url === '/api/issue-key') return handleIssueKey(req, res);
    if (method === 'GET' && url === '/api/usage') return handleUsage(req, res);
    if (method === 'GET' && (url === '/api/me' || url === '/v1/me')) return handleMe(req, res);
    if (method === 'POST' && (url === '/api/paycheck' || url === '/v1/paycheck')) return handlePaycheck(req, res);
    if (method === 'POST' && (url === '/api/payCalc' || url === '/v1/payCalc')) return handlePayCalc(req, res);
    if (method === 'POST' && (url === '/api/payroll/run' || url === '/v1/payroll/run')) return handlePayrollRun(req, res);
    if (method === 'GET' && (url === '/api/uniqueTaxIds' || url === '/v1/uniqueTaxIds')) return handleUniqueTaxIds(req, res);
    if (method === 'GET' && (url.startsWith('/api/uniqueTaxIds/') || url.startsWith('/v1/uniqueTaxIds/'))) return handleUniqueTaxId(req, res, url);
    if (method === 'GET' && (url === '/api/health' || url === '/v1/health' || url === '/healthz')) return handleHealth(res);
    if (method === 'GET' && (url === '/v1/openapi.json' || url === '/openapi.json')) return sendJson(res, 200, openApiDocument(API_VERSION), { 'Cache-Control': 'public, max-age=300' });
    if (method === 'GET' && url === '/v1/schemas/paycheck-request.json') return sendJson(res, 200, paycheckRequestSchema, { 'Cache-Control': 'public, max-age=300' });
    if (method === 'GET' && (url === '/api/states' || url === '/v1/states')) return handleStates(res, req.url ?? url);
    if (method === 'GET' && (url === '/api/coverage' || url === '/v1/coverage')) return handleCoverage(res);
    if (method === 'GET' && (url === '/api/coverage/local' || url === '/v1/coverage/local')) return handleCoverageLocal(res, req.url ?? url);
    if (method === 'POST' && (url === '/api/address' || url === '/v1/address')) return handleAddress(req, res);
    if (method === 'POST' && url === '/api/estimate') return handleEstimate(req, res);
    if (method === 'GET' && url === '/api/billing') return handleBilling(req, res);

    if (method === 'GET' && !url.startsWith('/api/') && !url.startsWith('/v1/')) {
      const nonce = randomBytes(16).toString('base64url');
      const html = decorateHtml(readFileSync(join(HERE, 'not-found.html'), 'utf8'), '/404', nonce);
      const headers: Record<string, string | number> = {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
        ...securityHeaders(req, nonce),
      };
      const body = maybeGzip(req, Buffer.from(html), headers);
      headers['Content-Length'] = body.length;
      res.writeHead(404, headers);
      res.end(body);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...securityHeaders(req) });
    res.end('Not found');
  })().catch((err) => {
    console.error(scrubMailLog(err instanceof Error ? err.message : String(err)));
    if (!res.headersSent) sendJson(res, 500, { error: 'Internal server error.' });
  });
}).listen(PORT, () => {
  const liveRefused = stripeKeyRefused();
  if (liveRefused) {
    console.error(`[billing] ${liveRefused}`);
  } else if (meteringConfigured()) {
    // Retry anything a previous run left queued, then keep retrying.
    flushMeterSoon();
    setInterval(flushMeterSoon, 60_000).unref();
  } else if (process.env.STRIPE_SECRET_KEY) {
    console.warn('Stripe is connected but metering is OFF: set STRIPE_PRICE_ID (a usage-metered price) and STRIPE_METER_EVENT_NAME to bill per call. Onboarding will only save a card.');
  }
  console.log(`Omnia.tax:           http://localhost:${PORT}`);
  console.log(`Omnia.tax docs:      http://localhost:${PORT}/docs`);
  console.log(`Omnia.tax console:   http://localhost:${PORT}/sandbox`);
});

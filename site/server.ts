import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { calculatePaycheck } from '../src/calculate.ts';
import { CannotComputeError, UnsupportedTaxYearError } from '../src/registry.ts';
import { resolveEmployee } from '../geocode/index.ts';
import {
  withDb, readDb, appendUsage, hitStoredLimit,
  type AccountRecord, type KeyRecord, type PaymentMethodRecord,
  type SavedScenario, type SubscriptionRecord, type TermsAcceptance, type TermsQuote,
} from './lib/store.ts';
import { CALL_TIERS, ROOFTOP_RATE, TRIAL_DAYS, PERIODS_PER_YEAR, estimate as computePricing, costForCalls } from './lib/pricing.ts';
import { TERMS_VERSION, TERM_MONTHS, termsClauses } from './lib/terms.ts';
import { isEmailConfigured, sendVerificationEmail } from './lib/mail.ts';
import { validatePaycheckInput } from './lib/validate.ts';
import { keyLifeFor } from './lib/keylife.ts';
import { verifierConfigured, issueCode, checkCode } from './lib/verifier.ts';
import { checkoutPaymentMethodTypes } from '../api/stripe.ts';
import { hashPassword, verifyPassword, passwordProblem, MAX_PASSWORD } from './lib/password.ts';
import {
  billingConfigured, meteringConfigured, enqueueMeterEvent, flushMeterQueue,
  createBillingCustomer, startMeteredCheckout, completeMeteredCheckout, interpretWebhook,
} from './lib/billing.ts';

// Loads <repo root>/.env (RESEND_API_KEY, STRIPE_SECRET_KEY -- see
// .env.example) before any handler reads it. Absent .env is fine: signup
// still works, the code prints to this console instead of emailing, and
// the payment step reports honestly that no processor is connected.
try {
  process.loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), '..', '.env'));
} catch {
  /* no .env yet */
}

/**
 * Serves the Omnia landing page and console, plus the API behind them.
 *
 * The signup flow is staged deliberately, in this order:
 *
 *   1. POST /api/signup        name, work email, business, phone
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

const SESSION_TTL_MS = 24 * 60 * 60_000;
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

/**
 * Print verification codes to the console only when no email provider is
 * configured (local development). With email on, a code in the logs is a
 * working sign-in credential for anyone who can read them.
 */
function logCodesToConsole(): boolean {
  return !isEmailConfigured();
}

const SESSION_COOKIE = 'omnia_session';

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
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Omnia-Version': API_VERSION,
  ...((process.env.PUBLIC_BASE_URL ?? '').startsWith('https://') ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}),
};

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

function sendJson(res: ServerResponse, status: number, body: unknown, extraHeaders: Record<string, string> = {}): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
    ...extraHeaders,
  });
  res.end(payload);
}

function sendHtml(res: ServerResponse, path: string): void {
  const html = readFileSync(path);
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': html.byteLength,
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
  });
  res.end(html);
}

/** Figures the pages display, read from pricing.ts so the HTML cannot drift. */
function clientConfig() {
  return {
    trialDays: TRIAL_DAYS,
    termMonths: TERM_MONTHS,
    tiers: CALL_TIERS.map((t) => ({ upTo: Number.isFinite(t.upTo) ? t.upTo : null, rate: t.rate })),
    rooftopRate: ROOFTOP_RATE,
    periodsPerYear: PERIODS_PER_YEAR,
    codeTtlSec: CODE_TTL_MS / 1000,
    codeCooldownSec: CODE_COOLDOWN_MS / 1000,
    maxCodeAttempts: MAX_CODE_ATTEMPTS,
    rateLimitPerMin: paycheckLimiterLimit(),
  };
}

function sendPage(res: ServerResponse, path: string): void {
  const html = readFileSync(path, 'utf8').replace(
    '<!--OMNIA_CONFIG-->',
    `<script>window.OMNIA=${JSON.stringify(clientConfig())};</script>`,
  );
  const buf = Buffer.from(html);
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': buf.byteLength,
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
  });
  res.end(buf);
}

function contentTypeFor(file: string): string {
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

/**
 * Static files are always revalidated (no-cache) and carry an ETag, so a
 * deploy shows up on the next page load instead of after an hour of stale
 * CSS, while an unchanged file still costs only a 304.
 */
function sendStatic(res: ServerResponse, path: string, contentType: string, req?: IncomingMessage): void {
  const buf = readFileSync(path);
  const etag = '"' + createHash('sha1').update(buf).digest('base64url') + '"';
  const headers = { 'Cache-Control': 'no-cache', ETag: etag, ...SECURITY_HEADERS };
  if (req && req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    res.end();
    return;
  }
  res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': buf.byteLength, ...headers });
  res.end(buf);
}

function readBody(req: IncomingMessage): Promise<string> {
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
  const raw = await readBody(req);
  try {
    return raw ? (JSON.parse(raw) as T) : ({} as T);
  } catch {
    throw new Error('Request body must be valid JSON.');
  }
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
  let body: { name?: string; email?: string; company?: string; phone?: string; password?: string };
  try {
    body = await readJson(req);
  } catch (err) {
    sendJson(res, 400, { error: (err as Error).message });
    return;
  }

  const name = (body.name ?? '').trim();
  const email = (body.email ?? '').trim().toLowerCase();
  const company = (body.company ?? '').trim();
  const phone = (body.phone ?? '').trim();

  if (!name || !isValidEmail(email) || !company || !phone) {
    sendJson(res, 400, { error: 'Name, a valid work email, business name and phone are all required.' });
    return;
  }
  if (name.length > 200 || email.length > 254 || company.length > 200 || phone.length > 40) {
    sendJson(res, 400, { error: 'One of those fields is too long.' });
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

  const account = withDb((db) => {
    pruneUnverified(db, now);

    const existing = db.accounts[email];
    const cooling =
      existing?.codeRequestedAt && now - new Date(existing.codeRequestedAt).getTime() < CODE_COOLDOWN_MS;
    const remote = verifierConfigured();
    const code = remote ? null : cooling && existing.code ? existing.code : String(randomInt(100000, 1000000));

    const record: AccountRecord = {
      name,
      email,
      company,
      phone,
      code,
      codeRequestedAt: cooling ? existing!.codeRequestedAt : new Date(now).toISOString(),
      codeExpiresAt: remote ? null : cooling ? existing!.codeExpiresAt : new Date(now + CODE_TTL_MS).toISOString(),
      codeAttempts: remote ? 0 : cooling ? existing!.codeAttempts ?? 0 : 0,
      emailVerifiedAt: existing?.emailVerifiedAt ?? null,
      sessionToken: existing?.sessionToken ?? null,
      sessionExpiresAt: existing?.sessionExpiresAt ?? null,
      sessionIssuedAt: existing?.sessionIssuedAt ?? null,
      sessionMethod: existing?.sessionMethod ?? null,
      // A signup can set the password of an account that was never verified,
      // but never replace the password of one that was: that would let anyone
      // who knows an email address take its account over.
      passwordHash: existing?.emailVerifiedAt ? existing.passwordHash ?? null : passwordHash ?? existing?.passwordHash ?? null,
      passwordSetAt: existing?.emailVerifiedAt
        ? existing.passwordSetAt ?? null
        : passwordHash ? new Date(now).toISOString() : existing?.passwordSetAt ?? null,
      stage: existing?.emailVerifiedAt ? existing.stage : 'unverified',
      createdAt: existing?.createdAt ?? new Date(now).toISOString(),
    };
    // An existing account keeps its profile: an unauthenticated signup
    // for a known email may only issue a new code, never rewrite it.
    if (existing?.emailVerifiedAt) {
      record.name = existing.name;
      record.company = existing.company;
      record.phone = existing.phone;
    }
    db.accounts[email] = record;
    return record;
  });

  let emailSent = false;
  if (verifierConfigured()) {
    // The Python verifier owns the code: it mints, mails and later checks it.
    const issued = await issueCode(email, account.name);
    if (issued.status === 429) {
      sendJson(res, 429, { error: 'Too many codes requested for this address. Try again later.', code: 'rate_limited' }, { 'Retry-After': String(issued.retryAfterSec ?? 3600) });
      return;
    }
    emailSent = issued.sent;
    if (!issued.ok) console.error('[signup] verifier could not issue a code');
  } else if (logCodesToConsole()) {
    // Local development only: no email provider, so the code has to be
    // readable somewhere. Never taken when RESEND_API_KEY is set.
    console.log('');
    console.log('+- Omnia verification code (dev: no email provider) -');
    console.log(`|  ${email}`);
    console.log(`|  CODE: ${account.code}`);
    console.log(`|  expires ${account.codeExpiresAt}`);
    console.log('+--------------------------------------------------');
    console.log('');
  } else {
    const result = await sendVerificationEmail({
      name: account.name,
      email,
      code: account.code!,
      expiresAt: account.codeExpiresAt!,
    });
    emailSent = result.sent;
    // Never the code, and no personal details: just that delivery failed.
    if (!result.sent) console.error(`[signup] verification email failed: ${result.reason}`);
  }

  sendJson(res, 200, { ok: true, emailSent, alreadyVerified: Boolean(account.emailVerifiedAt) });
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
  const email = (body.email ?? '').trim().toLowerCase();
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
    const cooling = a.codeRequestedAt && a.code && now - new Date(a.codeRequestedAt).getTime() < CODE_COOLDOWN_MS;
    if (verifierConfigured()) {
      a.codeRequestedAt = new Date(now).toISOString();
    } else if (!cooling) {
      a.code = String(randomInt(100000, 1000000));
      a.codeRequestedAt = new Date(now).toISOString();
      a.codeExpiresAt = new Date(now + CODE_TTL_MS).toISOString();
      a.codeAttempts = 0;
    }
    return { acct: { name: a.name, email: a.email, code: a.code ?? '', codeExpiresAt: a.codeExpiresAt ?? '' } };
  });
  if ('limited' in outcome) {
    sendJson(res, 429, { error: 'Too many sign-in attempts. Try again later.', code: 'rate_limited' }, { 'Retry-After': String(outcome.retryAfterSec) });
    return;
  }

  const acct = outcome.acct;
  if (acct && verifierConfigured()) {
    const issued = await issueCode(acct.email, acct.name);
    if (!issued.ok) console.error('[sign-in] verifier could not issue a code');
  } else if (acct) {
    if (logCodesToConsole()) {
      console.log(`[sign-in code, dev: no email provider] ${acct.email}: ${acct.code} (expires ${acct.codeExpiresAt})`);
    } else {
      const result = await sendVerificationEmail({ name: acct.name, email: acct.email, code: acct.code, expiresAt: acct.codeExpiresAt });
      if (!result.sent) console.error(`[sign-in] verification email failed: ${result.reason}`);
    }
  }
  sendJson(res, 200, { ok: true, emailConfigured: isEmailConfigured() || verifierConfigured() });
}

// ---------------------------------------------------------------------
// Step 2 -- POST /api/verify-email
// ---------------------------------------------------------------------

async function handleVerifyEmail(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: { email?: string; code?: string };
  try {
    body = await readJson(req);
  } catch (err) {
    sendJson(res, 400, { error: (err as Error).message });
    return;
  }

  const email = (body.email ?? '').trim().toLowerCase();
  const code = (body.code ?? '').trim();
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
    if (!remote && (!acct || !live || !safeEqual(acct.code!, code))) {
      const hourly = hitStoredLimit(db, hourKey, MAX_CODE_GUESSES_PER_HOUR, HOUR_MS, now);
      // Unknown addresses get a stored counter too, so "burned" looks
      // the same for them as for real accounts.
      const burned = !hourly.allowed || (acct
        ? (acct.codeAttempts = (acct.codeAttempts ?? 0) + 1) > MAX_CODE_ATTEMPTS
        : !hitStoredLimit(db, 'verify:' + email, MAX_CODE_ATTEMPTS, CODE_TTL_MS, now).allowed);
      if (burned && acct) {
        acct.code = null;
        acct.codeExpiresAt = null;
      }
      return { ok: false as const, error: burned ? TOO_MANY : INVALID };
    }

    if (!acct) return { ok: false as const, error: INVALID };
    acct.emailVerifiedAt = acct.emailVerifiedAt ?? new Date().toISOString();
    acct.code = null;
    acct.codeExpiresAt = null;
    acct.codeAttempts = 0;
    const token = startSession(acct, 'code');
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
  // The browser console authenticates with an HttpOnly cookie, so the
  // session token is never readable by page script (an XSS can't lift
  // it). The token is also in the body for non-browser API clients, which
  // send it as a Bearer header; the console no longer stores it.
  sendJson(res, 200, outcome, { 'Set-Cookie': sessionCookie(outcome.sessionToken, SESSION_TTL_MS) });
}

/** Begin a fresh session on an account (mutates it; call inside withDb). Returns the token. */
function startSession(acct: AccountRecord, method: 'code' | 'password'): string {
  const token = randomBytes(24).toString('hex');
  const now = Date.now();
  acct.sessionToken = token;
  acct.sessionExpiresAt = new Date(now + SESSION_TTL_MS).toISOString();
  acct.sessionIssuedAt = new Date(now).toISOString();
  acct.sessionMethod = method;
  return token;
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
  const email = (body.email ?? '').trim().toLowerCase();
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

  const outcome = withDb((db) => {
    const acct = db.accounts[email];
    if (!acct || !acct.emailVerifiedAt) return null;
    const token = startSession(acct, 'password');
    return { ok: true as const, sessionToken: token, name: acct.name, email: acct.email, company: acct.company, stage: acct.stage, hasPassword: true };
  });
  if (!outcome) {
    sendJson(res, 401, { error: INVALID });
    return;
  }
  sendJson(res, 200, outcome, { 'Set-Cookie': sessionCookie(outcome.sessionToken, SESSION_TTL_MS) });
}

// ---------------------------------------------------------------------
// POST /api/password -- set or change the password of the signed-in
// account. Allowed when the account has no password yet, when the session
// came from an emailed code in the last 15 minutes (the "forgot password"
// path), or when the current password is supplied.
// ---------------------------------------------------------------------

async function handlePassword(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const session = requireSession(req);
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
  const info = withDb((db) => {
    const rl = hitStoredLimit(db, 'pw-change:' + session.email, 10, HOUR_MS, now);
    if (!rl.allowed) return { limited: true as const, retryAfterSec: rl.retryAfterSec };
    const a = db.accounts[session.email];
    const recentCode =
      a?.sessionMethod === 'code' && a.sessionIssuedAt && now - new Date(a.sessionIssuedAt).getTime() < RESET_WINDOW_MS;
    return { limited: false as const, hash: a?.passwordHash ?? null, recentCode: Boolean(recentCode) };
  });
  if (info.limited) {
    sendJson(res, 429, { error: 'Too many password changes. Try again later.', code: 'rate_limited' }, { 'Retry-After': String(info.retryAfterSec) });
    return;
  }
  if (info.hash && !info.recentCode) {
    const given = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    if (!given || given.length > MAX_PASSWORD || !(await verifyPassword(given, info.hash))) {
      sendJson(res, 403, { error: 'Enter your current password, or sign in with an emailed code first.', code: 'reauth_required' });
      return;
    }
  }

  const newHash = await hashPassword(body.password as string);
  withDb((db) => {
    const a = db.accounts[session.email];
    if (!a) return;
    a.passwordHash = newHash;
    a.passwordSetAt = new Date().toISOString();
  });
  sendJson(res, 200, { ok: true });
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function cookieSecure(): boolean {
  return (process.env.PUBLIC_BASE_URL ?? '').startsWith('https://') || process.env.COOKIE_SECURE === '1';
}

function sessionCookie(token: string, ttlMs: number): string {
  // SameSite=Lax: sent on same-site requests and top-level navigations
  // (the Stripe Checkout return), never on cross-site POSTs.
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
// POST /api/signout -- ends the session server-side and clears the cookie.
// ---------------------------------------------------------------------

function handleSignout(req: IncomingMessage, res: ServerResponse): void {
  const token = sessionTokenFrom(req);
  if (token) {
    withDb((db) => {
      const acct = Object.values(db.accounts).find((a) => a.sessionToken === token);
      if (acct) {
        acct.sessionToken = null;
        acct.sessionExpiresAt = null;
      }
    });
  }
  sendJson(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
}

// ---------------------------------------------------------------------
// Step 3 -- GET /api/terms
// ---------------------------------------------------------------------

function handleTerms(req: IncomingMessage, res: ServerResponse): void {
  const session = requireSession(req);
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
  const session = requireSession(req);
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

  const signedName = (body.signedName ?? '').trim();
  const legalName = (body.legalName ?? '').trim();
  const billingEmail = (body.billingEmail ?? '').trim().toLowerCase();
  const address = (body.address ?? '').trim();
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
    if (quote.expectedEmployees <= 0) {
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
  console.log(`[terms accepted] v${result.acceptance.termsVersion} quote ${result.acceptance.quoteId}`);

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
  const session = requireSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'Verify your email first.' });
    return;
  }

  const sub = readDb((db) => db.subscriptions[session.email]);
  if (!sub) {
    sendJson(res, 409, { error: 'Agree to the terms before attaching a payment method.' });
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

  const origin = (process.env.PUBLIC_BASE_URL ?? `http://localhost:${PORT}`).replace(/\/+$/, '');
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
      const out = await startMeteredCheckout({ customerId, email: session.email, successUrl, cancelUrl, trialDays: TRIAL_DAYS });
      if (!out.ok || !out.url) {
        console.error(`[payment] could not start Stripe Checkout (${out.reason ?? 'unknown'}): ${out.error ?? ''}`);
        sendJson(res, 502, { error: out.error ?? 'The processor rejected the subscription request.', reason: out.reason });
        return;
      }
      sendJson(res, 200, { ok: true, checkoutUrl: out.url, paymentsConfigured: true, metered: true });
      return;
    } catch (err) {
      console.error('[payment] Stripe request failed:', err instanceof Error ? err.message : err);
      sendJson(res, 502, { error: err instanceof Error ? err.message : 'Could not reach the processor.' });
      return;
    }
  }

  // Fallback: STRIPE_SECRET_KEY is set but no metered price — save a card
  // on file (setup mode), same as before. Metering stays off until a price
  // is configured.
  const setupForm = (types: string[]) => {
    const form = new URLSearchParams();
    form.set('mode', 'setup');
    form.set('customer_email', sub.billingEmail);
    types.forEach((t, i) => form.set(`payment_method_types[${i}]`, t));
    form.set('success_url', successUrl);
    form.set('cancel_url', cancelUrl);
    form.set('metadata[omnia_email]', session.email);
    form.set('metadata[terms_version]', TERMS_VERSION);
    return form.toString();
  };
  const postSetup = async (types: string[]) => {
    const r = await fetch(`${process.env.STRIPE_API_BASE ?? 'https://api.stripe.com'}/v1/checkout/sessions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: setupForm(types),
    });
    return { ok: r.ok, payload: (await r.json()) as { url?: string; error?: { message?: string } } };
  };

  try {
    let { ok, payload } = await postSetup(checkoutPaymentMethodTypes());
    if ((!ok || !payload.url) && checkoutPaymentMethodTypes().includes('us_bank_account')
        && /payment method type|us_bank_account|activated|not enabled/i.test(payload.error?.message ?? '')) {
      console.warn('[payment] Stripe refused bank-account setup; retrying with card only. Enable ACH Direct Debit in Stripe to offer bank accounts.');
      ({ ok, payload } = await postSetup(['card']));
    }
    if (!ok || !payload.url) {
      console.error('[payment] Stripe refused the setup checkout:', payload.error?.message ?? 'no reason given');
      sendJson(res, 502, { error: payload.error?.message ?? 'The processor rejected the setup request.' });
      return;
    }
    sendJson(res, 200, { ok: true, checkoutUrl: payload.url, paymentsConfigured: true, metered: false });
  } catch (err) {
    sendJson(res, 502, { error: err instanceof Error ? err.message : 'Could not reach the processor.' });
  }
}

// ---------------------------------------------------------------------
// POST /api/billing/return -- the console calls this with the Checkout
// session_id from the ?setup=ok return, so we capture the Stripe customer
// + subscription ids, mark the account trialing, and promote its key.
// ---------------------------------------------------------------------

async function handleBillingReturn(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const session = requireSession(req);
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
  if (!body.sessionId) {
    sendJson(res, 400, { error: 'A Checkout session_id is required.' });
    return;
  }

  const done = await completeMeteredCheckout(body.sessionId);
  if (!done.ok) {
    if (done.reason === 'checkout_not_complete') {
      sendJson(res, 402, { error: 'That checkout was not completed. Add a card or bank account to continue.', code: 'checkout_not_complete' });
      return;
    }
    sendJson(res, 502, { error: done.error ?? 'Could not confirm the subscription with the processor.', reason: done.reason });
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

  const now = Date.now();
  const outcome = withDb((db) => {
    const sub = db.subscriptions[session.email];
    const acct = db.accounts[session.email];
    if (!sub) return { ok: false as const };
    const resubscribed = Boolean(done.subscriptionId && done.subscriptionId !== sub.stripeSubscriptionId);
    if (sub.status === 'cancelled' && !resubscribed) return { ok: false as const, cancelled: true };
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
    sub.status = sub.trialStartsAt && resubscribed && sub.status === 'cancelled' ? 'active' : 'trialing';
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
      : { error: 'No subscription on file for this account.' });
    return;
  }
  console.log(`[billing] ${session.email} subscribed -- customer ${done.customerId}, sub ${done.subscriptionId}`);
  sendJson(res, 200, { ok: true, subscription: outcome.subscription, metered: meteringConfigured() });
}

// ---------------------------------------------------------------------
// POST /api/billing/webhook -- Stripe delivery (open route; verified by
// signature). Suspends a key on a failed invoice, reactivates on payment.
// ---------------------------------------------------------------------

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
  if (result.action === 'ignore' || !result.customerId) {
    sendJson(res, 200, { received: true });
    return;
  }

  const applied = withDb((db) => {
    const sub = Object.values(db.subscriptions).find((s) => s.stripeCustomerId === result.customerId);
    if (!sub) return null;
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

  console.log(`[billing webhook] ${result.action} customer=${result.customerId} account=${applied ?? 'unknown'}`);
  sendJson(res, 200, { received: true, action: result.action, matched: Boolean(applied) });
}

// ---------------------------------------------------------------------
// Step 6 -- POST /api/start-trial
//
// Called once a payment method is attached. Starts the clock, issues the
// key, and moves the account to trialing.
// ---------------------------------------------------------------------

async function handleStartTrial(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const session = requireSession(req);
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
  console.log(`[trial started] ${session.email} -- ends ${outcome.subscription.trialEndsAt}`);
  sendJson(res, 200, { ok: true, subscription: outcome.subscription, paymentAttached: outcome.paymentAttached });
}

// ---------------------------------------------------------------------
// GET /api/account -- where this signup currently stands
// ---------------------------------------------------------------------

function handleAccount(req: IncomingMessage, res: ServerResponse): void {
  const session = requireSession(req);
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

function requireSession(req: IncomingMessage): { email: string; name: string; company: string } | null {
  const token = sessionTokenFrom(req);
  if (!token) return null;
  return readDb((db) => {
    const acct = Object.values(db.accounts).find((a) => a.sessionToken === token);
    if (!acct || !acct.sessionExpiresAt || !acct.sessionToken || !safeEqual(acct.sessionToken, token)) return null;
    if (Date.now() > new Date(acct.sessionExpiresAt).getTime()) return null;
    if (!acct.emailVerifiedAt) return null; // unverified email gets no session powers
    return { email: acct.email, name: acct.name, company: acct.company };
  });
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
  const session = requireSession(req);
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

  const isLive = process.env.OMNIA_ISSUE_LIVE_KEYS === '1';
  const key = (isLive ? 'sk_live_' : 'sk_test_') + randomBytes(24).toString('base64url');
  const keyHash = sha256Hex(key);
  const keyPrefix = key.slice(0, (isLive ? 'sk_live_' : 'sk_test_').length + 6);
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
    const r = await resolveEmployee({ work: work || undefined, residence: home || undefined }, checkDate);
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
  const session = requireSession(req);
  if (!session) { sendJson(res, 401, { error: 'Sign in to see saved scenarios.', code: 'not_signed_in' }); return; }
  sendJson(res, 200, { scenarios: readDb((db) => db.scenarios[session.email] ?? []), max: MAX_SCENARIOS });
}

async function handleScenarioSave(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const session = requireSession(req);
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
  const session = requireSession(req);
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
function clientAddress(req: IncomingMessage): string {
  // Behind a proxy that sets it (the hosted deployment), the first
  // X-Forwarded-For hop is the client. Only trusted when TRUST_PROXY=1, so
  // a direct caller can't pick its own address to dodge the limit.
  if (process.env.TRUST_PROXY === '1') {
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
  const session = requireSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'Sign in first.' });
    return;
  }

  readDb((db) => {
    const keyRecord = Object.values(db.keys).find((k) => k.ownerEmail === session.email && k.isActive);
    if (!keyRecord) {
      sendJson(res, 200, { hasKey: false });
      return;
    }

    const events = db.usage.filter((u) => u.keyHash === keyRecord.keyHash);
    const dayAgo = Date.now() - 24 * 60 * 60_000;
    const monthAgo = Date.now() - 30 * 24 * 60 * 60_000;
    const callsToday = events.filter((e) => new Date(e.at).getTime() >= dayAgo).length;
    const callsThisMonth = events.filter((e) => new Date(e.at).getTime() >= monthAgo).length;
    const recent = events
      .slice()
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 15);

    sendJson(res, 200, {
      hasKey: true,
      keyPrefix: keyRecord.keyPrefix,
      keyMasked: maskKey(keyRecord.keyPrefix),
      plan: keyRecord.plan,
      issuedAt: keyRecord.createdAt,
      expiresAt: keyRecord.expiresAt,
      lastUsedAt: keyRecord.lastUsedAt,
      // Durable meter (survives usage-log trimming); falls back to the
      // retained-window count for keys minted before the counter existed.
      totalCalls: keyRecord.totalCalls ?? events.length,
      callsToday,
      callsThisMonth,
      recent,
    });
  });
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
  return { requestId, keyHash, rlHeaders, customerId: auth.customerId, meteredSubscription: auth.meteredSubscription };
}

async function handlePaycheck(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const ctx = authenticateKey(req, res, 'paycheck');
  if (!ctx) return;
  const { requestId, keyHash, rlHeaders } = ctx;
  const auth = ctx;

  // --- parse ------------------------------------------------------------
  let raw: unknown;
  try {
    raw = await readJson<unknown>(req);
  } catch (err) {
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
    recordUsage(keyHash, 422, 'validation_failed', (raw as { checkDate?: string } | null)?.checkDate ?? null);
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

  // --- calculate --------------------------------------------------------
  let status = 200;
  let responseBody: unknown;
  let usageError: string | null = null;
  try {
    responseBody = { result: calculatePaycheck(validation.value) };
  } catch (err) {
    // Validation covers the common bad-input cases, so a throw here is
    // unexpected. Log the real reason for support (keyed by requestId);
    // hand the caller a safe message, never an engine stack detail.
    status = 422;
    usageError = err instanceof Error ? err.message : 'calculation_error';
    console.error(`[paycheck ${requestId}] calculation failed:`, usageError);
    responseBody =
      err instanceof UnsupportedTaxYearError
        ? { error: err.message, code: 'unsupported_tax_year', requestId }
        : err instanceof CannotComputeError
        ? { error: err.message, code: 'cannot_compute', requestId }
        : {
            error: 'The calculation could not be completed for the input provided.',
            code: 'calculation_error',
            requestId,
          };
  }

  // A billable call on a metered subscription queues its Stripe meter
  // event in the same store write that records the call, so the two are
  // saved together; delivery happens off the response path and a failure
  // stays queued for retry (flushMeterQueue) rather than being lost.
  // requestId is Stripe's idempotency identifier for the event.
  const meter = status === 200 && meteringConfigured() && auth.meteredSubscription && auth.customerId
    ? { customerId: auth.customerId, identifier: requestId }
    : null;
  recordUsage(keyHash, status, usageError, validation.value.checkDate, meter);
  sendJson(res, status, responseBody, rlHeaders);
  if (meter) flushMeterSoon();
}

// ---------------------------------------------------------------------
// POST /v1/address -- key-authenticated address resolution. Turns a work
// address (and optionally a home address) into the state, the local
// jurisdictions and the certificate facts a paycheck needs, so the caller
// resolves an employee once and reuses the result on every pay run:
//   workState: { code: <state>, certificate: <certificate> }
// Billed as one unit when at least one address matched; an address that
// can't be matched costs nothing.
// ---------------------------------------------------------------------

async function handleAddress(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const ctx = authenticateKey(req, res, 'address');
  if (!ctx) return;
  const { requestId, keyHash, rlHeaders } = ctx;

  let body: Record<string, unknown>;
  try {
    body = await readJson<Record<string, unknown>>(req);
  } catch (err) {
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
    recordUsage(keyHash, 422, 'validation_failed', null);
    sendJson(res, 422, { error: problem, code: 'invalid_input', requestId }, rlHeaders);
    return;
  }

  try {
    const r = await resolveEmployee({ work: work || undefined, residence: home || undefined }, checkDate);
    const side = (a: typeof r.work) => a && {
      matched: a.matched,
      matchedAddress: a.matchQuality?.matchedAddress ?? null,
      state: a.resolved?.state ?? null,
      place: a.geographies?.incorporatedPlaces[0] ?? null,
      county: a.geographies?.counties[0] ?? null,
      precision: a.matched ? a.precision : null,
      coordinates: a.coordinates,
    };
    const matched = Boolean(r.work?.matched || r.residence?.matched);
    const state = (r.work?.matched ? r.work.resolved?.state : null) ?? (r.residence?.matched ? r.residence.resolved?.state : null) ?? null;
    const homeState = r.residence?.matched ? r.residence.resolved?.state ?? null : null;
    const meter = matched && meteringConfigured() && ctx.meteredSubscription && ctx.customerId
      ? { customerId: ctx.customerId, identifier: requestId }
      : null;
    recordUsage(keyHash, 200, null, null, meter);
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
    if (meter) flushMeterSoon();
  } catch (err) {
    console.error(`[address ${requestId}] lookup failed:`, err instanceof Error ? err.message : err);
    recordUsage(keyHash, 502, 'geocode_unavailable', null);
    sendJson(res, 502, { error: 'The address lookup is unavailable right now. Retry shortly; nothing was billed.', code: 'geocode_unavailable', requestId }, rlHeaders);
  }
}

/** One place that appends a bounded usage event and updates the key's meter. */
function recordUsage(
  keyHash: string,
  statusCode: number,
  error: string | null,
  checkDate: string | null,
  meter: { customerId: string; identifier: string } | null = null,
): void {
  withDb((db) => {
    const at = new Date().toISOString();
    appendUsage(db, { keyHash, at, statusCode, error, checkDate });
    const stored = db.keys[keyHash];
    if (stored) {
      stored.lastUsedAt = at;
      if (statusCode === 200) stored.totalCalls = (stored.totalCalls ?? 0) + 1;
    }
    if (meter) enqueueMeterEvent(db, { ...meter, at });
  });
}

/** Deliver queued meter events now, off the response path. Failures stay queued. */
function flushMeterSoon(): void {
  void flushMeterQueue()
    .then((r) => {
      if (r.failed || r.dead) console.error(`[meter] ${r.failed} failed, ${r.dead} past Stripe's window; ${r.pending} still queued`);
    })
    .catch((err) => console.error('[meter] flush error:', err instanceof Error ? err.message : err));
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

function handleStates(res: ServerResponse, rawUrl: string): void {
  const dir = join(HERE, '..', 'data', 'states');
  const asked = Number(new URL(rawUrl, 'http://x').searchParams.get('year'));
  const year = supportedYears().includes(asked) ? asked : supportedYears().at(-1);
  const states = readdirSync(dir)
    .filter((f) => f.endsWith(`-${year}.json`))
    .map((f) => {
      const raw = JSON.parse(readFileSync(join(dir, f), 'utf8')) as { code: string; name: string };
      return { code: raw.code, name: raw.name };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  sendJson(res, 200, { year, states });
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

  const email = (body.email ?? '').trim().toLowerCase();
  const employees = Math.max(0, Math.trunc(Number(body.employees) || 0));
  const payFrequency = (body.payFrequency ?? 'biweekly').trim();
  const rooftop = body.rooftop === true;

  if (!isValidEmail(email)) {
    sendJson(res, 400, { error: 'A valid work email is required.' });
    return;
  }
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

  console.log(
    `[estimate] ${email} — ${employees} employees, ${payFrequency}, ${breakdown.callsPerYear} calls/yr, ` +
      `rooftop=${rooftop} -> $${Math.round(breakdown.total).toLocaleString()}/yr`,
  );
  sendJson(res, 200, { ok: true, ...breakdown });
}

// ---------------------------------------------------------------------
// GET /api/billing -- trial countdown and what this account's real usage
// has cost so far, priced off the same tiers as everything else.
// ---------------------------------------------------------------------

function handleBilling(req: IncomingMessage, res: ServerResponse): void {
  const session = requireSession(req);
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
      costSoFar: Math.round(costForCalls(calls) * 100) / 100,
      tiers: CALL_TIERS.map((t) => ({ upTo: t.upTo === Infinity ? null : t.upTo, rate: t.rate })),
      rooftopRate: ROOFTOP_RATE,
      subscription: sub,
      paymentMethod: pm,
      termMonths: TERM_MONTHS,
      // Real billing state. paymentsConfigured means a card/subscription
      // Checkout can be created; metered means successful calls actually
      // report usage to Stripe; suspended means a failed invoice has paused
      // the key (a paid invoice reactivates it via webhook).
      paymentsConfigured: billingConfigured() || Boolean(process.env.STRIPE_SECRET_KEY),
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
  const method = req.method ?? 'GET';

  (async () => {
    const pages: Record<string, string> = {
      '/': 'index.html',
      '/index.html': 'index.html',
      '/signup': 'signup.html',
      '/signup/verify': 'signup-verify.html',
      '/signup/business': 'signup-business.html',
      '/signup/payment': 'signup-payment.html',
      '/signup/key': 'signup-key.html',
      '/signin': 'signin.html',
      '/docs': 'docs.html',
      '/docs.html': 'docs.html',
      '/sandbox': 'sandbox.html',
      '/sandbox.html': 'sandbox.html',
      '/console': 'sandbox.html',
      '/_states': 'states.html',
    };
    if (method === 'GET' && pages[url]) {
      sendPage(res, join(HERE, pages[url]));
      return;
    }
    if (method === 'GET' && (url === '/favicon.ico' || url === '/favicon.svg' || url.startsWith('/logo/') || url.startsWith('/assets/') || url === '/tokens.css')) {
      const rel = url === '/favicon.ico' || url === '/favicon.svg' ? 'logo/favicon.svg' : url.replace(/^\/+/, '');
      if (!rel.includes('..')) {
        const file = resolve(HERE, rel);
        if ((file === HERE || file.startsWith(HERE + '/')) && existsSync(file)) {
          sendStatic(res, file, contentTypeFor(file), req);
          return;
        }
      }
    }
    if (method === 'GET' && url === '/sandbox-examples.json') {
      sendStatic(res, join(HERE, 'sandbox-examples.json'), 'application/json; charset=utf-8', req);
      return;
    }
    if (method === 'GET' && (url === '/reference' || url === '/reference.html' || url === '/api-reference')) {
      // The old standalone reference page is gone; its URLs land on the docs.
      res.writeHead(301, { Location: '/docs', ...SECURITY_HEADERS });
      res.end();
      return;
    }

    // Legal pages (served, so customers can read them).
    if (method === 'GET' && url === '/legal/legal.css') {
      sendStatic(res, join(HERE, 'legal', 'legal.css'), 'text/css; charset=utf-8', req);
      return;
    }
    {
      const legal: Record<string, string> = {
        '/terms': 'terms', '/terms.html': 'terms', '/legal/terms.html': 'terms',
        '/privacy': 'privacy', '/privacy.html': 'privacy', '/legal/privacy.html': 'privacy',
        '/acceptable-use': 'acceptable-use', '/legal/acceptable-use.html': 'acceptable-use',
        '/disclaimer': 'disclaimer', '/legal/disclaimer.html': 'disclaimer',
      };
      if (method === 'GET' && legal[url]) {
        sendHtml(res, join(HERE, 'legal', `${legal[url]}.html`));
        return;
      }
    }

    // Cookie-authenticated console routes refuse cross-site browser POSTs
    // (belt and braces on top of SameSite=Lax). Bearer-key clients and the
    // Stripe webhook send no Origin header, so they pass untouched.
    if (method === 'POST' && url.startsWith('/api/') && url !== '/api/billing/webhook' && url !== '/api/paycheck' && url !== '/api/address' && !sameOrigin(req)) {
      sendJson(res, 403, { error: 'Cross-origin request refused.', code: 'bad_origin' });
      return;
    }

    if (method === 'POST' && url === '/api/signup') return handleSignup(req, res);
    if (method === 'POST' && url === '/api/verify-email') return handleVerifyEmail(req, res);
    if (method === 'POST' && url === '/api/signin') return handleSignin(req, res);
    if (method === 'POST' && url === '/api/signin-password') return handleSigninPassword(req, res);
    if (method === 'POST' && url === '/api/password') return handlePassword(req, res);
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
    if (method === 'GET' && (url === '/api/health' || url === '/v1/health' || url === '/healthz')) return handleHealth(res);
    if (method === 'GET' && (url === '/api/states' || url === '/v1/states')) return handleStates(res, req.url ?? url);
    if (method === 'POST' && (url === '/api/address' || url === '/v1/address')) return handleAddress(req, res);
    if (method === 'POST' && url === '/api/estimate') return handleEstimate(req, res);
    if (method === 'GET' && url === '/api/billing') return handleBilling(req, res);

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  })().catch((err) => {
    console.error(err);
    sendJson(res, 500, { error: 'Internal server error.' });
  });
}).listen(PORT, () => {
  if (meteringConfigured()) {
    // Retry anything a previous run left queued, then keep retrying.
    flushMeterSoon();
    setInterval(flushMeterSoon, 60_000).unref();
  } else if (process.env.STRIPE_SECRET_KEY) {
    console.warn('Stripe is connected but metering is OFF: set STRIPE_PRICE_ID (a usage-metered price) and STRIPE_METER_EVENT to bill per call. Onboarding will only save a card.');
  }
  console.log(`Omnia.tax:           http://localhost:${PORT}`);
  console.log(`Omnia.tax docs:      http://localhost:${PORT}/docs`);
  console.log(`Omnia.tax console:   http://localhost:${PORT}/sandbox`);
});

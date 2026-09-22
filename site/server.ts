import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { calculatePaycheck } from '../src/calculate.ts';
import {
  withDb, readDb, appendUsage,
  type AccountRecord, type KeyRecord, type PaymentMethodRecord,
  type SubscriptionRecord, type TermsAcceptance,
} from './lib/store.ts';
import { CALL_TIERS, ROOFTOP_RATE, TRIAL_DAYS, estimate as computePricing, costForCalls } from './lib/pricing.ts';
import { TERMS_VERSION, TERM_MONTHS, termsClauses } from './lib/terms.ts';
import { isEmailConfigured, sendVerificationEmail } from './lib/mail.ts';
import { validatePaycheckInput } from './lib/validate.ts';
import { RateLimiter } from './lib/ratelimit.ts';
import { keyLifeFor } from './lib/keylife.ts';
import {
  billingConfigured, meteringConfigured, reportCall,
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

// Per-key rate limiter for the metered calculation endpoint.
const paycheckLimiter = new RateLimiter();

// The set of state codes this build can actually compute, read once from
// data/states/. Used to reject an unknown workState at validation time
// (a clean 422) rather than letting it surface as an engine throw.
let VALID_STATE_CODES: Set<string> | null = null;
function validStateCodes(): Set<string> {
  if (VALID_STATE_CODES) return VALID_STATE_CODES;
  const dir = join(HERE, '..', 'data', 'states');
  const codes = readdirSync(dir)
    .filter((f) => f.endsWith('-2026.json'))
    .map((f) => f.slice(0, 2).toUpperCase());
  VALID_STATE_CODES = new Set(codes);
  return VALID_STATE_CODES;
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
};

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

function sendStatic(res: ServerResponse, path: string, contentType: string): void {
  const buf = readFileSync(path);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': buf.byteLength,
    'Cache-Control': 'public, max-age=3600',
    ...SECURITY_HEADERS,
  });
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
  let body: { name?: string; email?: string; company?: string; phone?: string };
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

  const now = Date.now();
  const account = withDb((db) => {
    const existing = db.accounts[email];
    const cooling =
      existing?.codeRequestedAt && now - new Date(existing.codeRequestedAt).getTime() < CODE_COOLDOWN_MS;
    const code = cooling && existing.code ? existing.code : String(randomInt(100000, 1000000));

    const record: AccountRecord = {
      name,
      email,
      company,
      phone,
      code,
      codeRequestedAt: cooling ? existing!.codeRequestedAt : new Date(now).toISOString(),
      codeExpiresAt: cooling ? existing!.codeExpiresAt : new Date(now + CODE_TTL_MS).toISOString(),
      emailVerifiedAt: existing?.emailVerifiedAt ?? null,
      sessionToken: existing?.sessionToken ?? null,
      sessionExpiresAt: existing?.sessionExpiresAt ?? null,
      stage: existing?.emailVerifiedAt ? existing.stage : 'unverified',
      createdAt: existing?.createdAt ?? new Date(now).toISOString(),
    };
    db.accounts[email] = record;
    return record;
  });

  console.log('');
  console.log('+- Omnia verification code ------------------------');
  console.log(`|  ${name} <${email}> (${company})`);
  console.log(`|  CODE: ${account.code}`);
  console.log(`|  expires ${account.codeExpiresAt}`);

  let emailSent = false;
  if (isEmailConfigured()) {
    const result = await sendVerificationEmail({
      name,
      email,
      code: account.code!,
      expiresAt: account.codeExpiresAt!,
    });
    emailSent = result.sent;
    console.log(result.sent ? `|  emailed via Resend` : `|  EMAIL FAILED (${result.reason})`);
  } else {
    console.log('|  no RESEND_API_KEY -- code is console-only');
  }
  console.log('+--------------------------------------------------');
  console.log('');

  sendJson(res, 200, { ok: true, emailSent, alreadyVerified: Boolean(account.emailVerifiedAt) });
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

  const outcome = withDb((db) => {
    const acct = db.accounts[email];
    if (!acct) return { ok: false as const, error: 'No signup found for that email.' };
    if (!acct.code || !acct.codeExpiresAt) return { ok: false as const, error: 'Request a new code.' };
    if (Date.now() > new Date(acct.codeExpiresAt).getTime()) {
      return { ok: false as const, error: 'That code expired. Request a new one.' };
    }
    if (acct.code !== code) return { ok: false as const, error: 'That code is incorrect.' };

    const token = randomBytes(24).toString('hex');
    acct.emailVerifiedAt = acct.emailVerifiedAt ?? new Date().toISOString();
    acct.code = null;
    acct.codeExpiresAt = null;
    acct.sessionToken = token;
    acct.sessionExpiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    if (acct.stage === 'unverified') acct.stage = 'verified';

    return {
      ok: true as const,
      sessionToken: token,
      name: acct.name,
      email: acct.email,
      company: acct.company,
      stage: acct.stage,
    };
  });

  if (!outcome.ok) {
    sendJson(res, 401, { error: outcome.error });
    return;
  }
  console.log(`[verified] ${outcome.email}`);
  sendJson(res, 200, outcome);
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
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString();

  sendJson(res, 200, {
    termsVersion: TERMS_VERSION,
    trialDays: TRIAL_DAYS,
    termMonths: TERM_MONTHS,
    trialEndsAt,
    estimate: breakdown,
    clauses: termsClauses({
      trialEndsAt,
      estimatedAnnual: breakdown.total,
      expectedEmployees: employees,
    }),
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
    expectedEmployees?: unknown; payFrequency?: string; rooftop?: unknown;
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
  const expectedEmployees = Math.max(0, Math.trunc(Number(body.expectedEmployees) || 0));
  const payFrequency = (body.payFrequency ?? 'biweekly').trim();
  const rooftop = body.rooftop === true;

  if (body.agreed !== true) {
    sendJson(res, 400, { error: 'You have to tick the authorization box to continue.' });
    return;
  }
  if (!signedName || !legalName || !isValidEmail(billingEmail) || !address || expectedEmployees <= 0) {
    sendJson(res, 400, {
      error: 'Signature, legal business name, billing email, address and employee count are all required.',
    });
    return;
  }

  const breakdown = computePricing({ employees: expectedEmployees, payFrequency, rooftop });
  const now = Date.now();
  const trialEndsAt = new Date(now + TRIAL_DAYS * 86_400_000).toISOString();

  const result = withDb((db) => {
    const acct = db.accounts[session.email];

    // Append-only: an acceptance is evidence, never edited in place.
    const acceptance: TermsAcceptance = {
      email: session.email,
      termsVersion: TERMS_VERSION,
      signedName,
      acceptedAt: new Date(now).toISOString(),
      ip: (req.socket.remoteAddress ?? null),
      userAgent: (req.headers['user-agent'] as string) ?? null,
      disclosed: {
        trialDays: TRIAL_DAYS,
        trialEndsAt,
        termMonths: TERM_MONTHS,
        estimatedAnnual: breakdown.total,
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
      estimatedAnnual: breakdown.total,
      status: 'payment_pending',
      trialStartsAt: null,
      trialEndsAt,
      termMonths: TERM_MONTHS,
      termEndsAt: null,
      createdAt: db.subscriptions[session.email]?.createdAt ?? new Date(now).toISOString(),
      activatedAt: null,
    };
    db.subscriptions[session.email] = sub;
    if (acct) acct.stage = 'payment_pending';

    return { acceptance, subscription: sub };
  });

  console.log(
    `[terms accepted] ${signedName} for ${legalName} -- v${TERMS_VERSION}, ` +
      `est $${Math.round(breakdown.total).toLocaleString()}/yr, trial ends ${trialEndsAt}`,
  );

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
  const successUrl = `${origin}/docs.html?setup=ok&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/docs.html?setup=cancelled`;

  // Preferred path: a metered subscription to the graduated price, so every
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
        sendJson(res, 502, { error: out.error ?? 'The processor rejected the subscription request.', reason: out.reason });
        return;
      }
      sendJson(res, 200, { ok: true, checkoutUrl: out.url, paymentsConfigured: true, metered: true });
      return;
    } catch (err) {
      sendJson(res, 502, { error: err instanceof Error ? err.message : 'Could not reach the processor.' });
      return;
    }
  }

  // Fallback: STRIPE_SECRET_KEY is set but no metered price — save a card
  // on file (setup mode), same as before. Metering stays off until a price
  // is configured.
  const form = new URLSearchParams();
  form.set('mode', 'setup');
  form.set('customer_email', sub.billingEmail);
  form.set('payment_method_types[0]', 'card');
  form.set('payment_method_types[1]', 'us_bank_account');
  form.set('success_url', successUrl);
  form.set('cancel_url', cancelUrl);
  form.set('metadata[omnia_email]', session.email);
  form.set('metadata[terms_version]', TERMS_VERSION);

  try {
    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    const payload = (await stripeRes.json()) as { url?: string; error?: { message?: string } };
    if (!stripeRes.ok || !payload.url) {
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
    sendJson(res, 502, { error: done.error ?? 'Could not confirm the subscription with the processor.', reason: done.reason });
    return;
  }

  const now = Date.now();
  const outcome = withDb((db) => {
    const sub = db.subscriptions[session.email];
    const acct = db.accounts[session.email];
    if (!sub) return { ok: false as const };
    if (done.customerId) sub.stripeCustomerId = done.customerId;
    if (done.subscriptionId) sub.stripeSubscriptionId = done.subscriptionId;
    sub.suspended = false;
    sub.suspendedReason = null;
    sub.status = 'trialing';
    sub.trialStartsAt = sub.trialStartsAt ?? new Date(now).toISOString();
    sub.trialEndsAt = sub.trialEndsAt ?? new Date(now + TRIAL_DAYS * 86_400_000).toISOString();
    if (!sub.termEndsAt) {
      sub.termEndsAt = new Date(new Date(now + TRIAL_DAYS * 86_400_000).setMonth(new Date(now).getMonth() + TERM_MONTHS)).toISOString();
    }
    if (acct) acct.stage = 'trialing';
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
    sendJson(res, 409, { error: 'No subscription on file for this account.' });
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
    if (result.action === 'suspend' || result.action === 'cancel') {
      sub.suspended = true;
      sub.suspendedReason = result.action === 'cancel' ? 'subscription_cancelled' : 'payment_failed';
      if (result.action === 'cancel') sub.status = 'cancelled';
    } else if (result.action === 'reactivate') {
      sub.suspended = false;
      sub.suspendedReason = null;
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
    if (!sub) return { ok: false as const, error: 'Agree to the terms first.' };

    const hasPayment = Boolean(db.paymentMethods[session.email]);
    if (!hasPayment && process.env.STRIPE_SECRET_KEY) {
      return { ok: false as const, error: 'Attach a payment method first.' };
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
    sendJson(res, 409, { error: outcome.error });
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

function requireSession(req: IncomingMessage): { email: string; name: string; company: string } | null {
  const token = bearerToken(req);
  if (!token) return null;
  return readDb((db) => {
    const acct = Object.values(db.accounts).find((a) => a.sessionToken === token);
    if (!acct || !acct.sessionExpiresAt) return null;
    if (Date.now() > new Date(acct.sessionExpiresAt).getTime()) return null;
    if (!acct.emailVerifiedAt) return null; // unverified email gets no session powers
    return { email: acct.email, name: acct.name, company: acct.company };
  });
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

async function handlePaycheck(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const requestId = 'req_' + randomBytes(8).toString('hex');
  const baseHeaders = { 'X-Request-Id': requestId };

  const key = bearerToken(req);
  if (!key) {
    sendJson(res, 401, { error: 'Missing API key. Send "Authorization: Bearer <key>".', code: 'missing_key', requestId }, baseHeaders);
    return;
  }

  const keyHash = sha256Hex(key);
  const auth = readDb((db) => {
    const kr = db.keys[keyHash];
    const sub = kr ? db.subscriptions[kr.ownerEmail] : undefined;
    return { keyRecord: kr, customerId: sub?.stripeCustomerId ?? null, suspended: Boolean(sub?.suspended), suspendedReason: sub?.suspendedReason ?? null };
  });
  const keyRecord = auth.keyRecord;

  if (!keyRecord || !keyRecord.isActive) {
    sendJson(res, 401, { error: 'Invalid or inactive API key.', code: 'invalid_key', requestId }, baseHeaders);
    return;
  }
  if (Date.now() > new Date(keyRecord.expiresAt).getTime()) {
    sendJson(res, 401, { error: `This API key expired on ${keyRecord.expiresAt}.`, code: 'expired_key', requestId }, baseHeaders);
    return;
  }
  if (auth.suspended) {
    sendJson(res, 402, { error: 'This account is suspended for a billing issue. Update your payment method to resume.', code: 'account_suspended', reason: auth.suspendedReason, requestId }, baseHeaders);
    return;
  }

  // --- rate limit (per key) --------------------------------------------
  const rl = paycheckLimiter.hit(keyHash);
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
    return;
  }

  // --- parse ------------------------------------------------------------
  let raw: unknown;
  try {
    raw = await readJson<unknown>(req);
  } catch (err) {
    sendJson(res, 400, { error: (err as Error).message, code: 'invalid_json', requestId }, rlHeaders);
    return;
  }

  // --- validate (structured, field-level) ------------------------------
  const validation = validatePaycheckInput(raw, { validStateCodes: validStateCodes() });
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
    responseBody = {
      error: 'The calculation could not be completed for the input provided.',
      code: 'calculation_error',
      requestId,
    };
  }

  recordUsage(keyHash, status, usageError, validation.value.checkDate);
  sendJson(res, status, responseBody, rlHeaders);

  // Meter the billable call to Stripe, best-effort and off the response
  // path: a slow or down Stripe never delays or fails the calculation. The
  // local usage log is the durable record and can reconcile. requestId
  // dedupes any retry. No-op unless metering is configured with a customer.
  if (status === 200 && meteringConfigured() && auth.customerId) {
    void reportCall(auth.customerId, requestId).then((r) => {
      if (!r.ok && r.reason === 'stripe_error') {
        console.error(`[paycheck ${requestId}] meter report failed:`, r.error);
      }
    });
  }
}

/** One place that appends a bounded usage event and updates the key's meter. */
function recordUsage(keyHash: string, statusCode: number, error: string | null, checkDate: string | null): void {
  withDb((db) => {
    appendUsage(db, { keyHash, at: new Date().toISOString(), statusCode, error, checkDate });
    const stored = db.keys[keyHash];
    if (stored) {
      stored.lastUsedAt = new Date().toISOString();
      if (statusCode === 200) stored.totalCalls = (stored.totalCalls ?? 0) + 1;
    }
  });
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
  sendJson(res, ok ? 200 : 503, {
    status: ok ? 'ok' : 'degraded',
    version: API_VERSION,
    states,
    time: new Date().toISOString(),
  });
}

function handleStates(res: ServerResponse): void {
  const dir = join(HERE, '..', 'data', 'states');
  const states = readdirSync(dir)
    .filter((f) => f.endsWith('-2026.json'))
    .map((f) => {
      const raw = JSON.parse(readFileSync(join(dir, f), 'utf8')) as { code: string; name: string };
      return { code: raw.code, name: raw.name };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  sendJson(res, 200, { states });
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
      metered: meteringConfigured() && Boolean(sub?.stripeCustomerId),
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
    if (method === 'GET' && (url === '/' || url === '/index.html')) {
      sendHtml(res, join(HERE, 'index.html'));
      return;
    }
    if (method === 'GET' && (url === '/docs' || url === '/docs.html')) {
      sendHtml(res, join(HERE, 'docs.html'));
      return;
    }
    if (method === 'GET' && (url === '/reference' || url === '/reference.html' || url === '/api-reference')) {
      sendHtml(res, join(HERE, 'reference.html'));
      return;
    }

    // Legal pages (served, so customers can read them).
    if (method === 'GET' && url === '/legal/legal.css') {
      sendStatic(res, join(HERE, 'legal', 'legal.css'), 'text/css; charset=utf-8');
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

    if (method === 'POST' && url === '/api/signup') return handleSignup(req, res);
    if (method === 'POST' && url === '/api/verify-email') return handleVerifyEmail(req, res);
    if (method === 'GET' && url === '/api/terms') return handleTerms(req, res);
    if (method === 'POST' && url === '/api/accept-terms') return handleAcceptTerms(req, res);
    if (method === 'POST' && url === '/api/payment-setup') return handlePaymentSetup(req, res);
    if (method === 'POST' && url === '/api/billing/return') return handleBillingReturn(req, res);
    if (method === 'POST' && (url === '/api/billing/webhook' || url === '/v1/billing/webhook')) return handleBillingWebhook(req, res);
    if (method === 'POST' && url === '/api/start-trial') return handleStartTrial(req, res);
    if (method === 'GET' && url === '/api/account') return handleAccount(req, res);
    if (method === 'POST' && url === '/api/issue-key') return handleIssueKey(req, res);
    if (method === 'GET' && url === '/api/usage') return handleUsage(req, res);
    if (method === 'POST' && (url === '/api/paycheck' || url === '/v1/paycheck')) return handlePaycheck(req, res);
    if (method === 'GET' && (url === '/api/health' || url === '/v1/health' || url === '/healthz')) return handleHealth(res);
    if (method === 'GET' && (url === '/api/states' || url === '/v1/states')) return handleStates(res);
    if (method === 'POST' && url === '/api/estimate') return handleEstimate(req, res);
    if (method === 'GET' && url === '/api/billing') return handleBilling(req, res);

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  })().catch((err) => {
    console.error(err);
    sendJson(res, 500, { error: 'Internal server error.' });
  });
}).listen(PORT, () => {
  console.log(`Omnia landing page:  http://localhost:${PORT}`);
  console.log(`Omnia docs/console:  http://localhost:${PORT}/docs.html`);
  console.log(`Omnia API reference: http://localhost:${PORT}/reference`);
});

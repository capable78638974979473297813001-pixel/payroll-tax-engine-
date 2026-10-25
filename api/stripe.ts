/**
 * A tiny Stripe client — just the calls the payroll-tax API's billing needs,
 * over plain fetch against Stripe's REST API, so the repo stays dependency-free
 * (no `stripe` npm package). It reads the secret key from the environment and
 * NOTHING else; if STRIPE_SECRET_KEY is unset, stripeConfigured() is false and
 * the billing layer stays in safe ledger-only mode instead of pretending.
 *
 * The key must be set where the SERVER runs (its host env / secrets) — not a
 * GitHub Actions secret, which only exists inside CI workflow runs and never
 * reaches the running app.
 *
 * Start with a TEST-mode key (sk_test_… or a restricted rk_test_…) and verify
 * with Stripe's test cards before ever using a live key.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

/** Read at call time so tests and a late-loaded env can point at a stub. */
function stripeApi(): string {
  return (process.env.STRIPE_API_BASE ?? 'https://api.stripe.com').trim().replace(/\/+$/, '');
}

export class StripeError extends Error {
  status: number;
  type: string | undefined;
  code: string | undefined;
  constructor(message: string, status: number, type?: string, code?: string) {
    super(message);
    this.name = 'StripeError';
    this.status = status;
    this.type = type;
    this.code = code;
  }
}

function stripeSecret(): string {
  return (process.env.STRIPE_SECRET_KEY ?? '').trim();
}

/**
 * Live-mode Stripe keys (sk_live_ / rk_live_) move real money. They are
 * refused unless the operator sets STRIPE_ALLOW_LIVE=1. Test mode is the
 * default for Omnia.tax.
 */
export function stripeKeyRefused(): string | null {
  const k = stripeSecret();
  if (!k) return null;
  if (/^(sk|rk)_live_/.test(k) && process.env.STRIPE_ALLOW_LIVE !== '1') {
    return 'STRIPE_SECRET_KEY is a live-mode key. Set STRIPE_ALLOW_LIVE=1 to use it. Test mode uses an sk_test_ key.';
  }
  return null;
}

export function stripeConfigured(): boolean {
  return Boolean(stripeSecret()) && !stripeKeyRefused();
}

/**
 * Billing-meter event name. STRIPE_METER_EVENT_NAME is the name the
 * dashboard meter listens for. STRIPE_METER_EVENT is accepted so existing
 * deployments keep working.
 */
export function configuredMeterEventName(): string {
  return (process.env.STRIPE_METER_EVENT_NAME || process.env.STRIPE_METER_EVENT || '').trim();
}

function secretKey(): string {
  const k = stripeSecret();
  if (!k) throw new StripeError('STRIPE_SECRET_KEY is not set in this environment.', 0, 'config_error');
  const refused = stripeKeyRefused();
  if (refused) throw new StripeError(refused, 0, 'live_key_refused');
  return k;
}

/** Form-encode a nested object the way Stripe's API expects (key[sub]=v, key[0]=v). */
function formEncode(obj: Record<string, unknown>, prefix = ''): string[] {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => parts.push(...formEncode({ [i]: item as unknown } as Record<string, unknown>, key)));
    } else if (typeof v === 'object') {
      parts.push(...formEncode(v as Record<string, unknown>, key));
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts;
}

async function stripeRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  params?: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey()}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const body = method === 'POST' && params ? formEncode(params).join('&') : undefined;
  const res = await fetch(`${stripeApi()}${path}`, { method, headers, body });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = (data.error ?? {}) as { message?: string; type?: string; code?: string };
    throw new StripeError(err.message ?? `Stripe ${method} ${path} failed (${res.status})`, res.status, err.type, err.code);
  }
  return data as T;
}

// ----------------------------------------------------------------------------
// The handful of calls billing needs
// ----------------------------------------------------------------------------

export interface StripeCustomer {
  id: string;
}
export function createCustomer(input: { name?: string; email?: string; apiKeyId: string }): Promise<StripeCustomer> {
  return stripeRequest<StripeCustomer>('POST', '/v1/customers', {
    name: input.name,
    email: input.email,
    metadata: { apiKeyId: input.apiKeyId },
  });
}

export interface StripeCheckoutSession {
  id: string;
  url: string | null;
  status?: string;
  mode?: string;
  customer?: string;
  subscription?: string | { id: string; status?: string; default_payment_method?: string | StripePaymentMethod | null };
  setup_intent?: string | { id: string; payment_method?: string | StripePaymentMethod | null };
}
/** Production is NODE_ENV=production, or any process Render itself started (RENDER is set). */
export function checkoutInProduction(): boolean {
  return process.env.NODE_ENV === 'production' || Boolean((process.env.RENDER ?? '').trim());
}

function headerFirst(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? '').split(',')[0].trim();
}

function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === '::1' || host === '0.0.0.0') return true;
  if (/^127(?:\.\d{1,3}){3}$/.test(host)) return true;
  return false;
}

/**
 * A Checkout return URL is usable in production only when it is https and
 * its host is not localhost. The amount of a price is irrelevant here and
 * is never read.
 */
export function isPublicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    if (url.username || url.password) return false;
    if (isLocalHostname(url.hostname)) return false;
    return Boolean(url.hostname);
  } catch {
    return false;
  }
}

export interface CheckoutOriginRequest {
  headers: {
    host?: string | string[];
    'x-forwarded-host'?: string | string[];
    'x-forwarded-proto'?: string | string[];
  };
  socket?: { encrypted?: boolean };
}

export type CheckoutOriginResult = { ok: true; origin: string } | { ok: false; error: string };

const PUBLIC_BASE_URL_HELP = 'Set PUBLIC_BASE_URL to the public https origin in the Render dashboard. render.yaml is not applied automatically.';

/**
 * Origin for Checkout success_url and cancel_url.
 * In production, never localhost. PUBLIC_BASE_URL wins when it is https and
 * public. Otherwise the request host is used, and on Render (or TRUST_PROXY=1)
 * that host comes from x-forwarded-proto and x-forwarded-host / Host.
 * Development keeps the localhost fallback.
 */
export function resolveCheckoutOrigin(req: CheckoutOriginRequest | undefined, fallbackPort: number): CheckoutOriginResult {
  const configured = (process.env.PUBLIC_BASE_URL ?? '').trim().replace(/\/+$/, '');
  if (!checkoutInProduction()) {
    if (configured) return { ok: true, origin: configured };
    return { ok: true, origin: `http://localhost:${fallbackPort}` };
  }
  if (configured) {
    if (!isPublicHttpsUrl(configured)) {
      return {
        ok: false,
        error: `PUBLIC_BASE_URL cannot be used for Checkout in production: it must be https and must not be localhost. ${PUBLIC_BASE_URL_HELP}`,
      };
    }
    return { ok: true, origin: configured };
  }
  const derived = originFromRequest(req);
  if (derived && isPublicHttpsUrl(derived)) return { ok: true, origin: derived };
  return {
    ok: false,
    error: `Checkout return URLs cannot be localhost in production. ${PUBLIC_BASE_URL_HELP}`,
  };
}

function trustForwardedHeaders(): boolean {
  return Boolean((process.env.RENDER ?? '').trim()) || process.env.TRUST_PROXY === '1';
}

function originFromRequest(req: CheckoutOriginRequest | undefined): string | null {
  if (!req) return null;
  const trust = trustForwardedHeaders();
  const forwardedHost = trust ? headerFirst(req.headers['x-forwarded-host']) : '';
  const host = forwardedHost || headerFirst(req.headers.host);
  if (!host || /[\s/]/.test(host)) return null;
  let proto = trust ? headerFirst(req.headers['x-forwarded-proto']).toLowerCase() : '';
  if (proto !== 'https' && proto !== 'http') proto = req.socket?.encrypted ? 'https' : 'http';
  try {
    return new URL(`${proto}://${host}`).origin;
  } catch {
    return null;
  }
}

const CHECKOUT_URL_REFUSAL = `Refusing to create a Checkout Session: success_url and cancel_url must be https and must not be localhost in production. ${PUBLIC_BASE_URL_HELP}`;

/** Throws before any Stripe call when production return URLs are not public https. */
export function assertProductionCheckoutUrls(successUrl: string, cancelUrl: string): void {
  if (!checkoutInProduction()) return;
  if (isPublicHttpsUrl(successUrl) && isPublicHttpsUrl(cancelUrl)) return;
  throw new StripeError(CHECKOUT_URL_REFUSAL, 0, 'checkout_origin_invalid');
}

/**
 * A hosted Checkout page in SETUP mode — the customer saves a payment method,
 * no charge. Which methods appear is decided by the Stripe Dashboard. Do not
 * send payment_method_types; API 2026-09-30.endive rejects it.
 */
export function createSetupCheckoutSession(input: {
  customerId: string;
  apiKeyId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<StripeCheckoutSession> {
  assertProductionCheckoutUrls(input.successUrl, input.cancelUrl);
  return stripeRequest<StripeCheckoutSession>('POST', '/v1/checkout/sessions', {
    mode: 'setup',
    customer: input.customerId,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: { apiKeyId: input.apiKeyId },
  });
}

/** Retrieve a completed Checkout session, expanding the saved payment method (setup or subscription mode). */
export function retrieveCheckoutSession(id: string): Promise<StripeCheckoutSession & { metadata?: Record<string, string> }> {
  return stripeRequest('GET', `/v1/checkout/sessions/${encodeURIComponent(id)}?expand[0]=setup_intent.payment_method&expand[1]=subscription.default_payment_method`);
}

export interface StripePaymentMethod {
  id: string;
  type?: string;
  card?: { brand?: string; last4?: string };
  us_bank_account?: { bank_name?: string; last4?: string };
}
export function retrievePaymentMethod(id: string): Promise<StripePaymentMethod> {
  return stripeRequest('GET', `/v1/payment_methods/${encodeURIComponent(id)}`);
}

type PriceUsage = 'metered' | 'licensed';

/** usage_type only. The price amount stays in Stripe and is never stored here. */
const priceUsageCache = new Map<string, PriceUsage>();

/**
 * Read STRIPE_PRICE_ID's usage type. Cached for the life of the process so
 * signup doesn't retrieve the same price on every Checkout.
 */
async function priceUsage(priceId: string): Promise<PriceUsage> {
  const cached = priceUsageCache.get(priceId);
  if (cached) return cached;
  let price: { recurring?: { usage_type?: string } | null };
  try {
    price = await stripeRequest('GET', `/v1/prices/${encodeURIComponent(priceId)}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = err instanceof StripeError ? err.status : 0;
    throw new StripeError(`Could not read STRIPE_PRICE_ID ${priceId}: ${message}`, status, 'price_lookup_failed');
  }
  const usage = price.recurring?.usage_type;
  if (usage !== 'metered' && usage !== 'licensed') {
    throw new StripeError(
      `STRIPE_PRICE_ID ${priceId} is not a metered or licensed recurring price, so Checkout cannot be created.`,
      0,
      'price_usage_unknown',
    );
  }
  priceUsageCache.set(priceId, usage);
  return usage;
}

/**
 * A hosted Checkout page in SUBSCRIPTION mode. Which payment methods appear
 * is decided by the Stripe Dashboard. A metered price omits quantity (usage
 * is reported per calculation). A licensed price sends quantity 1, because
 * Checkout requires it, and warns that usage will not bill.
 */
export async function createSubscriptionCheckoutSession(input: {
  customerId: string;
  apiKeyId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  /** Free-trial length. Usage sent during trial_period_days is not billed. */
  trialDays?: number;
  /** Extra subscription metadata, merged with apiKeyId. */
  metadata?: Record<string, string>;
}): Promise<StripeCheckoutSession> {
  assertProductionCheckoutUrls(input.successUrl, input.cancelUrl);
  const usage = await priceUsage(input.priceId);
  const lineItem: Record<string, unknown> = { price: input.priceId };
  if (usage === 'licensed') {
    lineItem.quantity = 1;
    console.warn(`[billing] STRIPE_PRICE_ID ${input.priceId} is not metered, so usage won't bill. Checkout is sending quantity 1. Use a usage-based metered price to bill each calculation.`);
  }
  const subscriptionData: Record<string, unknown> = {
    metadata: { apiKeyId: input.apiKeyId, ...input.metadata },
  };
  if (input.trialDays && input.trialDays > 0) subscriptionData.trial_period_days = input.trialDays;
  return stripeRequest<StripeCheckoutSession>('POST', '/v1/checkout/sessions', {
    mode: 'subscription',
    customer: input.customerId,
    line_items: [lineItem],
    // A payment method is required up front, trial or not. The Dashboard
    // chooses which methods Checkout offers.
    payment_method_collection: 'always',
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: { apiKeyId: input.apiKeyId, ...input.metadata },
    subscription_data: subscriptionData,
  });
}

export interface StripeSubscription {
  id: string;
  status: string;
  default_payment_method?: string | { id: string; card?: { brand?: string; last4?: string } };
}
export function retrieveSubscription(id: string): Promise<StripeSubscription> {
  return stripeRequest('GET', `/v1/subscriptions/${encodeURIComponent(id)}?expand[0]=default_payment_method`);
}

/**
 * Report one unit of usage to a Stripe billing meter — this is how a per-call
 * charge is recorded. Stripe aggregates these and charges the customer's card
 * on the subscription's monthly invoice (respecting the $0.50 minimum and
 * one fee per invoice, not per call). `identifier` dedupes retries.
 */
export function reportMeterEvent(input: {
  eventName: string;
  customerId: string;
  value?: number;
  identifier?: string;
  /** When the usage happened (Unix seconds). A retried event keeps its original time. */
  timestamp?: number;
}): Promise<{ identifier?: string }> {
  return stripeRequest(
    'POST',
    '/v1/billing/meter_events',
    {
      event_name: input.eventName,
      payload: { stripe_customer_id: input.customerId, value: String(input.value ?? 1) },
      identifier: input.identifier,
      timestamp: input.timestamp,
    },
    input.identifier,
  );
}

/**
 * Verify a Stripe webhook signature (the `Stripe-Signature` header) against the
 * raw request body and the endpoint's signing secret (STRIPE_WEBHOOK_SECRET).
 * Returns true only for a genuine, recent Stripe delivery — so a forged POST
 * can't suspend or reactivate a customer. Implements Stripe's scheme directly
 * (HMAC-SHA256 over "t.payload") so there's no dependency.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string, secret: string, toleranceSeconds = 300): boolean {
  if (!signatureHeader || !secret) return false;
  const parts = Object.fromEntries(signatureHeader.split(',').map((p) => p.split('=').map((s) => s.trim())));
  const t = parts['t'];
  const v1 = parts['v1'];
  if (!t || !v1) return false;
  // Reject stale timestamps (replay protection).
  const age = Math.abs(Date.now() / 1000 - Number(t));
  if (!Number.isFinite(age) || age > toleranceSeconds) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface StripePaymentIntent {
  id: string;
  status: string;
  amount: number;
}
/** Charge a saved card off-session (the customer isn't present). Throws on decline/needs-action. */
export function chargeOffSession(input: {
  customerId: string;
  paymentMethodId: string;
  amountCents: number;
  description?: string;
  idempotencyKey?: string;
}): Promise<StripePaymentIntent> {
  return stripeRequest<StripePaymentIntent>(
    'POST',
    '/v1/payment_intents',
    {
      amount: input.amountCents,
      currency: 'usd',
      customer: input.customerId,
      payment_method: input.paymentMethodId,
      off_session: true,
      confirm: true,
      description: input.description,
    },
    input.idempotencyKey,
  );
}

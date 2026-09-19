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

const STRIPE_API = 'https://api.stripe.com';

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

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

function secretKey(): string {
  const k = process.env.STRIPE_SECRET_KEY;
  if (!k) throw new StripeError('STRIPE_SECRET_KEY is not set in this environment.', 0, 'config_error');
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
  const res = await fetch(`${STRIPE_API}${path}`, { method, headers, body });
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
  customer?: string;
  setup_intent?: string | { id: string; payment_method?: string | null };
}
/** A hosted Checkout page in SETUP mode — the customer saves a card, no charge. */
export function createSetupCheckoutSession(input: {
  customerId: string;
  apiKeyId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<StripeCheckoutSession> {
  return stripeRequest<StripeCheckoutSession>('POST', '/v1/checkout/sessions', {
    mode: 'setup',
    customer: input.customerId,
    payment_method_types: ['card'],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: { apiKeyId: input.apiKeyId },
  });
}

/** Retrieve a completed Checkout session, expanding the setup intent so we can read the saved card. */
export function retrieveCheckoutSession(id: string): Promise<StripeCheckoutSession & { metadata?: Record<string, string> }> {
  return stripeRequest('GET', `/v1/checkout/sessions/${encodeURIComponent(id)}?expand[0]=setup_intent`);
}

export interface StripePaymentMethod {
  id: string;
  card?: { brand?: string; last4?: string };
}
export function retrievePaymentMethod(id: string): Promise<StripePaymentMethod> {
  return stripeRequest('GET', `/v1/payment_methods/${encodeURIComponent(id)}`);
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

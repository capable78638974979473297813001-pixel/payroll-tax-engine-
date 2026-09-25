import {
  createCustomer,
  createSubscriptionCheckoutSession,
  retrieveCheckoutSession,
  reportMeterEvent,
  verifyWebhookSignature,
  stripeConfigured,
  type StripePaymentMethod,
} from '../../api/stripe.ts';

/**
 * Metered billing for the Omnia site API, built on the dependency-free
 * Stripe client in api/stripe.ts.
 *
 * The model: each account is a Stripe customer subscribed to a single
 * usage-metered price whose GRADUATED tiers mirror site/lib/pricing.ts
 * ($0.12 → $0.09 → $0.06 → $0.04). Every successful POST /api/paycheck
 * reports one meter event; Stripe aggregates them and invoices monthly.
 * There is no per-call card charge — that would drown in Stripe's per-
 * charge minimum and fees.
 *
 * Everything here is a safe no-op when Stripe isn't configured: with no
 * STRIPE_SECRET_KEY the site meters usage locally (the usage log) and
 * charges nothing, rather than pretending. Nothing in this module ever
 * fakes a payment.
 */

/** The Stripe billing-meter event name; one setup in the Stripe dashboard. */
export const METER_EVENT = process.env.STRIPE_METER_EVENT ?? 'omnia_api_call';

/** Can we create customers / subscriptions at all? */
export function billingConfigured(): boolean {
  return stripeConfigured() && Boolean(process.env.STRIPE_PRICE_ID);
}

/** Can we report per-call usage to a meter? */
export function meteringConfigured(): boolean {
  return stripeConfigured() && Boolean(process.env.STRIPE_METER_EVENT ?? METER_EVENT);
}

export interface ReportResult {
  ok: boolean;
  reason?: string;
  error?: string;
}

/**
 * Report one billable call to Stripe. Best-effort: a failure here never
 * fails the calculation — the local usage log remains the durable record
 * and can reconcile. `identifier` (the request id) dedupes retries.
 */
export async function reportCall(customerId: string | null | undefined, identifier?: string): Promise<ReportResult> {
  if (!stripeConfigured()) return { ok: false, reason: 'stripe_not_configured' };
  if (!customerId) return { ok: false, reason: 'no_customer' };
  try {
    await reportMeterEvent({ eventName: METER_EVENT, customerId, value: 1, identifier });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: 'stripe_error', error: err instanceof Error ? err.message : String(err) };
  }
}

/** Create (or reuse) a Stripe customer for an account. */
export async function createBillingCustomer(input: { email: string; name?: string }): Promise<string> {
  const c = await createCustomer({ email: input.email, name: input.name, apiKeyId: input.email });
  return c.id;
}

export interface CheckoutResult {
  ok: boolean;
  url?: string;
  reason?: string;
  error?: string;
}

/**
 * Start a subscription-mode Checkout for the metered price, with the free
 * trial applied so Stripe won't invoice until it elapses. Returns the
 * hosted URL to redirect the customer to.
 */
export async function startMeteredCheckout(input: {
  customerId: string;
  email: string;
  successUrl: string;
  cancelUrl: string;
  trialDays: number;
}): Promise<CheckoutResult> {
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!stripeConfigured()) return { ok: false, reason: 'stripe_not_configured' };
  if (!priceId) return { ok: false, reason: 'no_price_configured' };
  try {
    const session = await createSubscriptionCheckoutSession({
      customerId: input.customerId,
      apiKeyId: input.email,
      priceId,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      trialDays: input.trialDays,
      metadata: { omnia_email: input.email },
    });
    if (!session.url) return { ok: false, reason: 'no_url' };
    return { ok: true, url: session.url };
  } catch (err) {
    return { ok: false, reason: 'stripe_error', error: err instanceof Error ? err.message : String(err) };
  }
}

export interface SavedPaymentMethod {
  id: string;
  /** 'card' or 'us_bank_account'. */
  kind: string;
  brand: string | null;
  last4: string | null;
}

export interface CompletedCheckout {
  ok: boolean;
  email?: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
  /** The card or bank account the customer saved. Null if none was. */
  paymentMethod?: SavedPaymentMethod | null;
  reason?: string;
  error?: string;
}

function describePaymentMethod(pm: StripePaymentMethod | string | null | undefined): SavedPaymentMethod | null {
  if (!pm) return null;
  if (typeof pm === 'string') return { id: pm, kind: 'card', brand: null, last4: null };
  if (pm.type === 'us_bank_account' || pm.us_bank_account) {
    return { id: pm.id, kind: 'us_bank_account', brand: pm.us_bank_account?.bank_name ?? null, last4: pm.us_bank_account?.last4 ?? null };
  }
  return { id: pm.id, kind: 'card', brand: pm.card?.brand ?? null, last4: pm.card?.last4 ?? null };
}

/**
 * Read back a finished Checkout session (subscription or setup mode):
 * the customer, the subscription, and the card or bank account saved on
 * it. Refuses a session that isn't complete, so a key can't be unlocked
 * by a checkout the customer abandoned.
 */
export async function completeMeteredCheckout(sessionId: string): Promise<CompletedCheckout> {
  if (!stripeConfigured()) return { ok: false, reason: 'stripe_not_configured' };
  try {
    const s = await retrieveCheckoutSession(sessionId);
    if (s.status !== 'complete') return { ok: false, reason: 'checkout_not_complete' };
    const sub = s.subscription;
    const subscriptionId = typeof sub === 'string' ? sub : sub?.id ?? null;
    const si = s.setup_intent;
    const raw = (typeof sub === 'object' && sub ? sub.default_payment_method : null)
      ?? (typeof si === 'object' && si ? si.payment_method : null);
    return {
      ok: true,
      email: s.metadata?.omnia_email ?? null,
      customerId: typeof s.customer === 'string' ? s.customer : null,
      subscriptionId,
      paymentMethod: describePaymentMethod(raw),
    };
  } catch (err) {
    return { ok: false, reason: 'stripe_error', error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------

export type WebhookAction = 'suspend' | 'reactivate' | 'cancel' | 'ignore';

export type WebhookInterpretation =
  | { ok: false; reason: string }
  | { ok: true; action: WebhookAction; customerId: string | null };

/**
 * Verify a Stripe webhook signature and classify the event into an action
 * the caller applies to its store. Verification is mandatory: a forged or
 * stale POST returns { ok: false } and changes nothing. DB-agnostic on
 * purpose — the caller owns the suspend/reactivate mutation.
 */
export function interpretWebhook(rawBody: string, signatureHeader: string | undefined): WebhookInterpretation {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return { ok: false, reason: 'webhook_not_configured' };
  if (!signatureHeader || !verifyWebhookSignature(rawBody, signatureHeader, secret)) {
    return { ok: false, reason: 'bad_signature' };
  }
  let event: { type?: string; data?: { object?: { customer?: string } } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { ok: false, reason: 'bad_payload' };
  }
  const customerId = event.data?.object?.customer ?? null;
  switch (event.type) {
    case 'invoice.payment_failed':
    case 'customer.subscription.paused':
      return { ok: true, action: 'suspend', customerId };
    case 'customer.subscription.deleted':
      return { ok: true, action: 'cancel', customerId };
    case 'invoice.paid':
    case 'invoice.payment_succeeded':
    case 'customer.subscription.resumed':
      return { ok: true, action: 'reactivate', customerId };
    default:
      return { ok: true, action: 'ignore', customerId };
  }
}

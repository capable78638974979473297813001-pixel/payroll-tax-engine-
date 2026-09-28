import {
  createCustomer,
  createSubscriptionCheckoutSession,
  retrieveCheckoutSession,
  reportMeterEvent,
  verifyWebhookSignature,
  stripeConfigured,
  type StripePaymentMethod,
} from '../../api/stripe.ts';
import { deliverMeterEvent, isDue } from '../../api/meter-queue.ts';
import { readDb, withDb, type DB, type MeterQueueItem } from './store.ts';

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

/**
 * The Stripe billing-meter event name the dashboard meter listens for.
 * No default: a meter event only bills when a metered price is tied to
 * this exact name, so it has to be configured on purpose (see
 * meteringConfigured). The fallback here is only what reportCall sends
 * when called directly without one.
 */
export const METER_EVENT = process.env.STRIPE_METER_EVENT || 'omnia_api_call';

function meterEventName(): string {
  return process.env.STRIPE_METER_EVENT || METER_EVENT;
}

/** Can we create customers / subscriptions at all? */
export function billingConfigured(): boolean {
  return stripeConfigured() && Boolean(process.env.STRIPE_PRICE_ID);
}

/**
 * Do successful calls actually bill? Only when there is a metered price
 * to subscribe customers to (STRIPE_PRICE_ID) AND an explicit meter event
 * name that price's meter listens for (STRIPE_METER_EVENT). A secret key
 * alone is not metering: onboarding then only saves a card, and events
 * sent for a customer with no metered subscription are never invoiced.
 * Same rule as the self-hosted API (api/billing.ts).
 */
export function meteringConfigured(): boolean {
  return billingConfigured() && Boolean(process.env.STRIPE_METER_EVENT);
}

export interface ReportResult {
  ok: boolean;
  reason?: string;
  error?: string;
}

/**
 * Report one billable call to Stripe, directly. The server doesn't use
 * this for paycheck calls any more -- those go through the durable queue
 * (enqueueMeterEvent + flushMeterQueue) so a failure is retried rather
 * than lost. `identifier` (the request id) dedupes retries.
 */
export async function reportCall(customerId: string | null | undefined, identifier?: string): Promise<ReportResult> {
  if (!stripeConfigured()) return { ok: false, reason: 'stripe_not_configured' };
  if (!customerId) return { ok: false, reason: 'no_customer' };
  try {
    await reportMeterEvent({ eventName: meterEventName(), customerId, value: 1, identifier });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: 'stripe_error', error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------
// Durable meter queue
// ---------------------------------------------------------------------

/**
 * Queue one billable call for Stripe inside the caller's store write (the
 * same withDb() that records the usage), so the call and its meter event
 * are saved together or not at all. The request id doubles as Stripe's
 * idempotency identifier.
 */
export function enqueueMeterEvent(db: DB, input: { customerId: string; identifier: string; at?: string; value?: number }): void {
  db.meterQueue.push({
    identifier: input.identifier,
    customerId: input.customerId,
    value: input.value ?? 1,
    at: input.at ?? new Date().toISOString(),
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
  });
}

export function pendingMeterEvents(): MeterQueueItem[] {
  return readDb((db) => db.meterQueue.slice());
}

let flushing: Promise<FlushResult> | null = null;

export interface FlushResult {
  delivered: number;
  failed: number;
  dead: number;
  pending: number;
}

/**
 * Deliver every due queued meter event to Stripe. Delivered events leave
 * the queue; failures stay with a backoff; events past Stripe's 35-day
 * window are marked dead (kept for manual invoicing, never dropped).
 * Overlapping calls share one run.
 */
export function flushMeterQueue(opts: { force?: boolean } = {}): Promise<FlushResult> {
  if (!meteringConfigured()) {
    return Promise.resolve({ delivered: 0, failed: 0, dead: 0, pending: pendingMeterEvents().length });
  }
  if (flushing) return flushing;
  flushing = (async () => {
    const eventName = meterEventName();
    const now = Date.now();
    let delivered = 0, failed = 0, dead = 0;
    for (const item of pendingMeterEvents()) {
      if (item.deadAt || (!opts.force && !isDue(item, now))) continue;
      const out = await deliverMeterEvent(item, eventName, now);
      withDb((db) => {
        const i = db.meterQueue.findIndex((q) => q.identifier === item.identifier);
        if (i === -1) return;
        if (out.delivered) { db.meterQueue.splice(i, 1); return; }
        const q = db.meterQueue[i];
        q.attempts += 1;
        q.lastAttemptAt = new Date().toISOString();
        q.lastError = out.error;
        if (out.dead) q.deadAt = q.lastAttemptAt;
      });
      if (out.delivered) delivered += 1;
      else if (out.dead) dead += 1;
      else failed += 1;
    }
    return { delivered, failed, dead, pending: pendingMeterEvents().length };
  })();
  void flushing.finally(() => { flushing = null; });
  return flushing;
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

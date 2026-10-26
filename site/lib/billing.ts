import {
  configuredMeterEventName,
  createCustomer,
  createSubscriptionCheckoutSession,
  retrieveCheckoutSession,
  reportMeterEvent,
  retrieveSubscription,
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
 * The model: each account is a Stripe customer subscribed to the
 * usage-metered price in STRIPE_PRICE_ID. The rate lives in Stripe and
 * is not hardcoded here. Every successful paycheck calculation reports
 * one meter event; Stripe aggregates them and invoices monthly.
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
  return configuredMeterEventName() || METER_EVENT;
}

/** Can we create customers / subscriptions at all? */
export function billingConfigured(): boolean {
  return stripeConfigured() && Boolean(process.env.STRIPE_PRICE_ID);
}

/**
 * Do successful calls actually bill? Only when there is a metered price
 * to subscribe customers to (STRIPE_PRICE_ID) AND an explicit meter event
 * name that price's meter listens for (STRIPE_METER_EVENT_NAME, or
 * STRIPE_METER_EVENT). A secret key alone is not metering: onboarding
 * then only saves a card, and events sent for a customer with no metered
 * subscription are never invoiced. Same rule as the self-hosted API
 * (api/billing.ts).
 */
export function meteringConfigured(): boolean {
  return billingConfigured() && Boolean(configuredMeterEventName());
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
  // The identifier is Stripe's idempotency key. A retry of the same call
  // must not queue a second event.
  if (db.meterQueue.some((q) => q.identifier === input.identifier)) return;
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
    // A call made while this run is in flight shares it (below), so an event
    // queued mid-run must be picked up by this run, not left for the next
    // sweep: keep going until every due event has been tried once.
    const tried = new Set<string>();
    for (;;) {
      const item = pendingMeterEvents().find((q) => !tried.has(q.identifier) && !q.deadAt && (opts.force || isDue(q, now)));
      if (!item) break;
      tried.add(item.identifier);
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
    // createSubscriptionCheckoutSession reads the price (cached per process).
    // Metered prices omit quantity. A licensed price sends quantity 1 and
    // warns that usage will not bill. The price amount is never read here.
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
  /** Stripe's status for that subscription right now (active, trialing, past_due, ...). Null when the checkout made none. */
  subscriptionStatus?: string | null;
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
    // A completed session can be reopened long after Checkout (the return URL,
    // or a late webhook). If its subscription has since ended, linking it would
    // overwrite the account's current subscription with a dead one and, for a
    // cancelled account, revive it. The expanded subscription carries its
    // status; a bare id is looked up. A failed lookup is a retryable error,
    // not a guess.
    let subscriptionStatus: string | null = null;
    if (subscriptionId) {
      const status = typeof sub === 'object' && sub ? sub.status : (await retrieveSubscription(subscriptionId)).status;
      if (status === 'canceled' || status === 'incomplete_expired') return { ok: false, reason: 'subscription_not_active' };
      subscriptionStatus = status ?? null;
    }
    const si = s.setup_intent;
    const raw = (typeof sub === 'object' && sub ? sub.default_payment_method : null)
      ?? (typeof si === 'object' && si ? si.payment_method : null);
    return {
      ok: true,
      email: s.metadata?.omnia_email ?? null,
      customerId: typeof s.customer === 'string' ? s.customer : null,
      subscriptionId,
      subscriptionStatus,
      paymentMethod: describePaymentMethod(raw),
    };
  } catch (err) {
    return { ok: false, reason: 'stripe_error', error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------

export type WebhookAction = 'suspend' | 'reactivate' | 'cancel' | 'checkout_completed' | 'ignore';

export type WebhookInterpretation =
  | { ok: false; reason: string }
  | {
      ok: true;
      action: WebhookAction;
      customerId: string | null;
      /** Present when Stripe sent an event id. Callers dedupe on it. */
      eventId?: string;
      sessionId?: string | null;
      subscriptionId?: string | null;
      email?: string | null;
      subscriptionStatus?: string | null;
    };

function idOf(value: unknown): string | null {
  if (typeof value === 'string' && value) return value;
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') {
    const id = (value as { id: string }).id;
    return id || null;
  }
  return null;
}

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
  let event: {
    id?: string;
    type?: string;
    data?: {
      object?: {
        id?: string;
        customer?: unknown;
        status?: string;
        mode?: string;
        subscription?: unknown;
        /** Newer Stripe API versions move an invoice's subscription here. */
        parent?: { subscription_details?: { subscription?: unknown } };
        metadata?: { omnia_email?: string };
        customer_email?: string | null;
        customer_details?: { email?: string | null };
      };
    };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { ok: false, reason: 'bad_payload' };
  }
  const obj = event.data?.object ?? {};
  const customerId = idOf(obj.customer);
  const eventId = typeof event.id === 'string' && event.id ? event.id : undefined;
  const tagged = <T extends { ok: true; action: WebhookAction; customerId: string | null }>(base: T): WebhookInterpretation =>
    eventId ? { ...base, eventId } : base;
  const forSubscription = (id: string | null | undefined) => (id ? { subscriptionId: id } : {});
  // An invoice names its subscription as `subscription` (older API versions)
  // or under `parent.subscription_details` (newer ones).
  const invoiceSubscription = idOf(obj.subscription) ?? idOf(obj.parent?.subscription_details?.subscription);

  switch (event.type) {
    case 'checkout.session.completed': {
      if (obj.status && obj.status !== 'complete') return tagged({ ok: true, action: 'ignore', customerId });
      const email = obj.metadata?.omnia_email ?? obj.customer_details?.email ?? obj.customer_email ?? null;
      return {
        ok: true,
        action: 'checkout_completed',
        customerId,
        ...(eventId ? { eventId } : {}),
        sessionId: obj.id ?? null,
        subscriptionId: idOf(obj.subscription),
        email,
      };
    }
    case 'customer.subscription.updated': {
      const status = obj.status ?? '';
      let action: WebhookAction = 'ignore';
      if (status === 'canceled' || status === 'incomplete_expired') action = 'cancel';
      else if (status === 'past_due' || status === 'unpaid' || status === 'paused') action = 'suspend';
      else if (status === 'active' || status === 'trialing') action = 'reactivate';
      return {
        ok: true,
        action,
        customerId,
        ...(eventId ? { eventId } : {}),
        subscriptionId: obj.id ?? null,
        subscriptionStatus: status || null,
      };
    }
    // Every one of these names the subscription it is about (a subscription
    // event's own id; an invoice's `subscription`), so the caller can tell an
    // event for the subscription an account holds from a late one for an old one.
    case 'invoice.payment_failed':
      return tagged({ ok: true, action: 'suspend', customerId, ...forSubscription(invoiceSubscription) });
    case 'customer.subscription.paused':
      return tagged({ ok: true, action: 'suspend', customerId, ...forSubscription(obj.id) });
    case 'customer.subscription.deleted':
      return tagged({ ok: true, action: 'cancel', customerId, ...forSubscription(obj.id) });
    case 'invoice.paid':
    case 'invoice.payment_succeeded':
      return tagged({ ok: true, action: 'reactivate', customerId, ...forSubscription(invoiceSubscription) });
    case 'customer.subscription.resumed':
      return tagged({ ok: true, action: 'reactivate', customerId, ...forSubscription(obj.id) });
    default:
      return tagged({ ok: true, action: 'ignore', customerId });
  }
}

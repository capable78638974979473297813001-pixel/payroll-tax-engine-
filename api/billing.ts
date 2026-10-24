import {
  cancelByCustomer, claimStripeEvent, enqueueMeterEvent, getApiKey, keyByStripeCustomer, pendingMeterEvents, setCardOnFile, setStripeCustomer,
  setSubscription, setSuspendedByCustomer, settleBalance, settleMeterEvent, stripeEventSeen,
} from './keys.ts';
import { deliverMeterEvent, isDue } from './meter-queue.ts';
import {
  chargeOffSession,
  configuredMeterEventName,
  createCustomer,
  createSetupCheckoutSession,
  createSubscriptionCheckoutSession,
  retrieveCheckoutSession,
  retrievePaymentMethod,
  retrieveSubscription,
  stripeConfigured,
  StripeError,
  type StripeSubscription,
  verifyWebhookSignature,
} from './stripe.ts';

/** Metered per-call billing is on when Stripe is configured AND a metered price + meter event name are set. */
export function meteringConfigured(): boolean {
  return stripeConfigured() && Boolean(process.env.STRIPE_PRICE_ID) && Boolean(configuredMeterEventName());
}

/**
 * Billing orchestration — the bridge between the local key ledger (api/keys.ts)
 * and Stripe (api/stripe.ts). Two flows:
 *
 *   1. Card capture (self-serve): startCardSetup() creates a Stripe Customer
 *      for the key and a hosted Checkout page in setup mode; the customer saves
 *      a card there; completeCardSetup() reads the finished session and stores
 *      the saved card on the key.
 *   2. Collection: chargeOutstanding() charges the key's saved card off-session
 *      for its balance due and ONLY zeroes the ledger balance once Stripe
 *      confirms the charge — never before.
 *
 * With no STRIPE_SECRET_KEY set, every path here returns a clear
 * "stripe_not_configured" result and changes no balance, so nothing pretends a
 * charge happened.
 */

export function billingConfigured(): boolean {
  return stripeConfigured();
}

/** Create/reuse a Stripe Customer for this key and return a hosted Checkout URL to save a card. */
export async function startCardSetup(keyId: string, baseUrl: string): Promise<{ ok: boolean; url?: string; reason?: string }> {
  const key = getApiKey(keyId);
  if (!key) return { ok: false, reason: 'no_such_key' };
  if (!stripeConfigured()) return { ok: false, reason: 'stripe_not_configured' };

  let customerId = key.stripeCustomerId;
  if (!customerId) {
    const customer = await createCustomer({ name: key.name, apiKeyId: key.id });
    customerId = customer.id;
    setStripeCustomer(key.id, customerId);
  }

  const urls = {
    successUrl: `${baseUrl}/v1/billing/return?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${baseUrl}/v1/billing/cancel`,
  };
  // Preferred: subscription mode. The shared Checkout helper reads the price:
  // metered omits quantity, licensed sends quantity 1. Falls back to setup
  // mode when no price is configured.
  const session = meteringConfigured()
    ? await createSubscriptionCheckoutSession({ customerId, apiKeyId: key.id, priceId: process.env.STRIPE_PRICE_ID!, ...urls })
    : await createSetupCheckoutSession({ customerId, apiKeyId: key.id, ...urls });
  return session.url ? { ok: true, url: session.url } : { ok: false, reason: 'no_checkout_url' };
}

/** Read a completed Checkout session and store the subscription + saved card on its key. */
export async function completeCardSetup(sessionId: string): Promise<{ ok: boolean; reason?: string; brand?: string | null; last4?: string | null; metered?: boolean }> {
  if (!stripeConfigured()) return { ok: false, reason: 'stripe_not_configured' };
  const session = await retrieveCheckoutSession(sessionId);
  const apiKeyId = session.metadata?.apiKeyId;
  if (!apiKeyId) return { ok: false, reason: 'no_api_key_in_session' };
  const sessionCustomer = typeof session.customer === 'string' ? session.customer : null;

  // Subscription mode (metered per-call billing): store the subscription id and
  // read the card off the subscription's default payment method for display.
  // The subscription is read BEFORE anything is stored: this URL can be
  // reopened long after Checkout, and an old session must not put a dead
  // subscription in place of the one the key has now.
  const sub = session.subscription;
  const subscriptionId = typeof sub === 'string' ? sub : sub?.id ?? null;
  if (subscriptionId) {
    let brand: string | null = null;
    let last4: string | null = null;
    let paymentMethodId: string | null = null;
    let current: StripeSubscription | null = null;
    try {
      current = await retrieveSubscription(subscriptionId);
    } catch {
      /* status unknown; handled below */
    }
    if (current && (current.status === 'canceled' || current.status === 'incomplete_expired')) {
      return { ok: false, reason: 'subscription_not_active' };
    }
    const existing = getApiKey(apiKeyId)?.stripeSubscriptionId;
    // Status couldn't be read: only fill an empty slot, never replace a subscription we already hold.
    if (!current && existing && existing !== subscriptionId) return { ok: false, reason: 'subscription_unverified' };
    if (sessionCustomer) setStripeCustomer(apiKeyId, sessionCustomer);
    setSubscription(apiKeyId, subscriptionId);
    const pm = current?.default_payment_method;
    if (typeof pm === 'object' && pm) {
      paymentMethodId = pm.id;
      brand = pm.card?.brand ?? null;
      last4 = pm.card?.last4 ?? null;
    } else if (typeof pm === 'string') {
      paymentMethodId = pm;
    }
    if (paymentMethodId) setCardOnFile(apiKeyId, { paymentMethodId, brand, last4 });
    return { ok: true, brand, last4, metered: true };
  }

  // Setup mode (card-only fallback): pull the saved payment method from the setup intent.
  const si = session.setup_intent;
  const rawPm = typeof si === 'object' && si ? si.payment_method : null;
  const paymentMethodId = typeof rawPm === 'string' ? rawPm : rawPm?.id ?? null;
  if (!paymentMethodId) return { ok: false, reason: 'no_payment_method' };
  if (sessionCustomer) setStripeCustomer(apiKeyId, sessionCustomer);
  let brand: string | null = null;
  let last4: string | null = null;
  try {
    const pm = await retrievePaymentMethod(paymentMethodId);
    brand = pm.card?.brand ?? null;
    last4 = pm.card?.last4 ?? null;
  } catch {
    /* display-only */
  }
  setCardOnFile(apiKeyId, { paymentMethodId, brand, last4 });
  return { ok: true, brand, last4, metered: false };
}

/**
 * Handle a Stripe webhook: verify the signature, then suspend a key when its
 * invoice goes unpaid and lift the suspension when it's paid. Verifying against
 * STRIPE_WEBHOOK_SECRET is what stops a forged POST from toggling any account.
 */
export function handleStripeWebhook(rawBody: string, signatureHeader: string): { ok: boolean; action: string; keyId?: string | null; reason?: string } {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return { ok: false, action: 'ignored', reason: 'no_webhook_secret' };
  if (!verifyWebhookSignature(rawBody, signatureHeader, secret)) return { ok: false, action: 'rejected', reason: 'bad_signature' };

  let event: StripeEventShape;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { ok: false, action: 'rejected', reason: 'bad_json' };
  }
  if (event.id && stripeEventSeen(event.id)) return { ok: true, action: 'duplicate' };

  const result = applyStripeEvent(event);
  // Record the id only now that the changes are saved: if applying threw or the
  // process died first, Stripe's retry is processed instead of skipped as a
  // duplicate. Every handler below sets state to a value, so applying an event
  // twice is harmless.
  if (event.id) claimStripeEvent(event.id);
  return result;
}

interface StripeEventShape {
  id?: string;
  type?: string;
  /** Unix seconds Stripe created the event — the order events happened in, whatever order they arrive. */
  created?: number;
  data?: {
    object?: {
      id?: string;
      customer?: string;
      status?: string;
      subscription?: string;
      metadata?: { apiKeyId?: string };
    };
  };
}

function applyStripeEvent(event: StripeEventShape): { ok: boolean; action: string; keyId?: string | null; reason?: string } {
  const obj = event.data?.object;
  const customer = typeof obj?.customer === 'string' ? obj.customer : undefined;

  if (event.type === 'checkout.session.completed') {
    const keyId = obj?.metadata?.apiKeyId;
    // A late event for an older Checkout session (the customer subscribed again
    // since) must not put the older subscription back. The event's own creation
    // time, not its arrival time, says which came first.
    const held = keyId ? getApiKey(keyId) : null;
    if (
      held && obj?.subscription && held.stripeSubscriptionId && held.stripeSubscriptionId !== obj.subscription &&
      held.stripeSubscriptionSetAt && typeof event.created === 'number' && event.created * 1000 < Date.parse(held.stripeSubscriptionSetAt)
    ) {
      return { ok: true, action: 'ignored_stale_checkout', keyId };
    }
    if (keyId && customer) setStripeCustomer(keyId, customer);
    if (keyId && obj?.subscription) setSubscription(keyId, obj.subscription, typeof event.created === 'number' ? event.created * 1000 : undefined);
    return { ok: true, action: keyId ? 'checkout_completed' : 'ignored', keyId: keyId ?? null, reason: keyId ? undefined : 'no_api_key' };
  }

  if (!customer) return { ok: true, action: 'ignored', reason: 'no_customer' };

  // Events are delivered late and out of order. One about a subscription the key
  // no longer holds (an old one it replaced) must not suspend, cancel or
  // revive the current one. Subscription events carry the subscription as
  // their own id; invoice events name it in `subscription`. An event naming no
  // subscription, or a key holding none, is applied as before.
  const eventSubscription = event.type?.startsWith('customer.subscription.') ? obj?.id : typeof obj?.subscription === 'string' ? obj.subscription : undefined;
  const heldKey = keyByStripeCustomer(customer);
  if (eventSubscription && heldKey?.stripeSubscriptionId && heldKey.stripeSubscriptionId !== eventSubscription) {
    return { ok: true, action: 'ignored_stale_subscription', keyId: heldKey.id };
  }

  switch (event.type) {
    case 'invoice.payment_failed':
      return { ok: true, action: 'suspended', keyId: setSuspendedByCustomer(customer, true, 'Your latest invoice could not be charged. Update your card to resume.') };
    case 'customer.subscription.deleted':
      return { ok: true, action: 'cancelled', keyId: cancelByCustomer(customer, 'Billing subscription canceled.') };
    case 'customer.subscription.updated': {
      const status = obj?.status;
      if (status === 'canceled' || status === 'incomplete_expired') {
        return { ok: true, action: 'cancelled', keyId: cancelByCustomer(customer, 'Billing subscription canceled.') };
      }
      if (status === 'past_due' || status === 'unpaid' || status === 'paused') {
        return { ok: true, action: 'suspended', keyId: setSuspendedByCustomer(customer, true, 'Your latest invoice could not be charged. Update your card to resume.') };
      }
      if (status === 'active' || status === 'trialing') {
        const keyId = setSuspendedByCustomer(customer, false, null);
        const k = keyId ? getApiKey(keyId) : null;
        if (keyId && obj?.id && !k?.billingCancelledAt) setSubscription(keyId, obj.id);
        return { ok: true, action: k?.billingCancelledAt ? 'ignored_cancelled' : 'reactivated', keyId };
      }
      return { ok: true, action: 'ignored', reason: status ?? event.type };
    }
    case 'invoice.paid':
    case 'invoice.payment_succeeded': {
      // Settles a failed invoice. Does NOT revive a cancelled subscription.
      const keyId = setSuspendedByCustomer(customer, false, null);
      const k = keyId ? getApiKey(keyId) : null;
      return { ok: true, action: k?.billingCancelledAt ? 'ignored_cancelled' : 'reactivated', keyId };
    }
    default:
      return { ok: true, action: 'ignored', reason: event.type };
  }
}

/**
 * Report API calls to Stripe's usage meter — the per-call charge. Queues
 * the event durably (api/keys.ts meterQueue) and then delivers the queue,
 * so a Stripe hiccup delays the charge instead of losing it. Never throws;
 * a metering failure must not fail the customer's calculate call.
 *
 * The server prefers recordUsage(..., { meterUnits }) (queues in the same
 * write as the call) followed by flushMeterQueue(); this is the one-step
 * form for callers that meter separately.
 */
export async function reportCall(keyId: string, units = 1): Promise<{ ok: boolean; reason?: string; queued?: boolean }> {
  if (!meteringConfigured()) return { ok: false, reason: 'metering_not_configured' };
  const item = enqueueMeterEvent(keyId, Math.max(1, Math.floor(units)));
  if (!item) return { ok: false, reason: 'no_customer' };
  const out = await flushMeterQueue({ only: item.identifier });
  return out.delivered > 0 ? { ok: true } : { ok: false, reason: 'queued_for_retry', queued: true };
}

let flushing: Promise<{ delivered: number; failed: number; dead: number; pending: number }> | null = null;

/**
 * Deliver every queued meter event that is due (backoff applies to ones
 * that failed before). Safe to call often and concurrently: overlapping
 * calls share one run. Returns counts for logging and the operator script.
 */
export function flushMeterQueue(opts: { only?: string; force?: boolean } = {}): Promise<{ delivered: number; failed: number; dead: number; pending: number }> {
  if (!meteringConfigured()) return Promise.resolve({ delivered: 0, failed: 0, dead: 0, pending: pendingMeterEvents().length });
  if (flushing && !opts.only) return flushing;
  const run = (async () => {
    const eventName = configuredMeterEventName();
    let delivered = 0, failed = 0, dead = 0;
    const now = Date.now();
    for (const item of pendingMeterEvents()) {
      if (opts.only && item.identifier !== opts.only) continue;
      if (!opts.only && !opts.force && !isDue(item, now)) continue;
      if (item.deadAt) continue;
      const out = await deliverMeterEvent(item, eventName, now);
      settleMeterEvent(item.identifier, out);
      if (out.delivered) delivered += 1;
      else if (out.dead) dead += 1;
      else failed += 1;
    }
    return { delivered, failed, dead, pending: pendingMeterEvents().length };
  })();
  if (!opts.only) {
    flushing = run;
    void run.finally(() => { flushing = null; });
  }
  return run;
}

export interface ChargeResult {
  ok: boolean;
  chargedCents: number;
  reason?: string;
  error?: string;
  paymentIntentId?: string;
}

/**
 * "Charge them the amount we have." Charges the key's saved card for its balance
 * due and settles the ledger to $0 only on Stripe's confirmation. Safe to call
 * when nothing is due (no-op) or when Stripe/card aren't set up (no charge, no
 * balance change).
 */
export async function chargeOutstanding(keyId: string): Promise<ChargeResult> {
  const key = getApiKey(keyId);
  if (!key) return { ok: false, chargedCents: 0, reason: 'no_such_key' };
  const amount = key.balanceDueCents;
  if (amount <= 0) return { ok: true, chargedCents: 0, reason: 'nothing_due' };
  if (!stripeConfigured()) return { ok: false, chargedCents: 0, reason: 'stripe_not_configured' };
  if (!key.stripeCustomerId || !key.stripePaymentMethodId) return { ok: false, chargedCents: 0, reason: 'no_card_on_file' };

  try {
    const intent = await chargeOffSession({
      customerId: key.stripeCustomerId,
      paymentMethodId: key.stripePaymentMethodId,
      amountCents: amount,
      description: `Payroll-tax API usage — ${key.name} (${key.prefix})`,
      // Stable per outstanding-balance state, so a retry can't double-charge.
      idempotencyKey: `settle_${key.id}_${key.lifetimeBilledCents}_${amount}`,
    });
    if (intent.status !== 'succeeded') {
      return { ok: false, chargedCents: 0, reason: 'charge_incomplete', error: intent.status, paymentIntentId: intent.id };
    }
    // Take off only what Stripe collected: usage recorded while the charge was
    // in flight is a new balance, not part of this payment.
    settleBalance(key.id, amount);
    return { ok: true, chargedCents: amount, paymentIntentId: intent.id };
  } catch (err) {
    const message = err instanceof StripeError ? err.message : err instanceof Error ? err.message : 'charge failed';
    return { ok: false, chargedCents: 0, reason: 'charge_failed', error: message };
  }
}

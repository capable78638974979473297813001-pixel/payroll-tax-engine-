import { getApiKey, setCardOnFile, setStripeCustomer, setSubscription, setSuspendedByCustomer, settleBalance } from './keys.ts';
import {
  chargeOffSession,
  createCustomer,
  createSetupCheckoutSession,
  createSubscriptionCheckoutSession,
  reportMeterEvent,
  retrieveCheckoutSession,
  retrievePaymentMethod,
  retrieveSubscription,
  stripeConfigured,
  StripeError,
  verifyWebhookSignature,
} from './stripe.ts';

/** Metered per-call billing is on when Stripe is configured AND a metered price + meter event name are set. */
export function meteringConfigured(): boolean {
  return stripeConfigured() && Boolean(process.env.STRIPE_PRICE_ID) && Boolean(process.env.STRIPE_METER_EVENT);
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
  // Preferred: subscription mode, which saves a card AND starts per-call metered
  // billing in one step. Falls back to card-only setup if no metered price is set.
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
  if (session.customer && typeof session.customer === 'string') setStripeCustomer(apiKeyId, session.customer);

  // Subscription mode (metered per-call billing): store the subscription id and
  // read the card off the subscription's default payment method for display.
  const sub = session.subscription;
  const subscriptionId = typeof sub === 'string' ? sub : sub?.id ?? null;
  if (subscriptionId) {
    setSubscription(apiKeyId, subscriptionId);
    let brand: string | null = null;
    let last4: string | null = null;
    let paymentMethodId: string | null = null;
    try {
      const s = await retrieveSubscription(subscriptionId);
      const pm = s.default_payment_method;
      if (typeof pm === 'object' && pm) {
        paymentMethodId = pm.id;
        brand = pm.card?.brand ?? null;
        last4 = pm.card?.last4 ?? null;
      } else if (typeof pm === 'string') {
        paymentMethodId = pm;
      }
    } catch {
      /* display-only */
    }
    if (paymentMethodId) setCardOnFile(apiKeyId, { paymentMethodId, brand, last4 });
    return { ok: true, brand, last4, metered: true };
  }

  // Setup mode (card-only fallback): pull the saved payment method from the setup intent.
  const si = session.setup_intent;
  const rawPm = typeof si === 'object' && si ? si.payment_method : null;
  const paymentMethodId = typeof rawPm === 'string' ? rawPm : rawPm?.id ?? null;
  if (!paymentMethodId) return { ok: false, reason: 'no_payment_method' };
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

  let event: { type?: string; data?: { object?: { customer?: string } } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { ok: false, action: 'rejected', reason: 'bad_json' };
  }
  const customer = event.data?.object?.customer;
  if (!customer) return { ok: true, action: 'ignored', reason: 'no_customer' };

  switch (event.type) {
    case 'invoice.payment_failed':
      return { ok: true, action: 'suspended', keyId: setSuspendedByCustomer(customer, true, 'Your latest invoice could not be charged. Update your card to resume.') };
    case 'customer.subscription.deleted':
      return { ok: true, action: 'suspended', keyId: setSuspendedByCustomer(customer, true, 'Billing subscription canceled.') };
    case 'invoice.paid':
    case 'invoice.payment_succeeded':
      return { ok: true, action: 'reactivated', keyId: setSuspendedByCustomer(customer, false, null) };
    default:
      return { ok: true, action: 'ignored', reason: event.type };
  }
}

/**
 * Report one API call to Stripe's usage meter — the per-call charge. Safe to
 * call on every request: it's a no-op unless metering is configured and the
 * key has a Stripe customer. Never throws; a metering hiccup must not fail the
 * customer's calculate call (the local ledger still counted it).
 */
export async function reportCall(keyId: string): Promise<{ ok: boolean; reason?: string }> {
  if (!meteringConfigured()) return { ok: false, reason: 'metering_not_configured' };
  const key = getApiKey(keyId);
  if (!key?.stripeCustomerId) return { ok: false, reason: 'no_customer' };
  try {
    await reportMeterEvent({
      eventName: process.env.STRIPE_METER_EVENT!,
      customerId: key.stripeCustomerId,
      value: 1,
      // Dedupe: at most one unit per key per second even if a retry double-fires.
      identifier: `${key.id}-${Date.now()}`,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'meter_failed' };
  }
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
    settleBalance(key.id); // zero the ledger only now that Stripe confirmed
    return { ok: true, chargedCents: amount, paymentIntentId: intent.id };
  } catch (err) {
    const message = err instanceof StripeError ? err.message : err instanceof Error ? err.message : 'charge failed';
    return { ok: false, chargedCents: 0, reason: 'charge_failed', error: message };
  }
}

import { getApiKey, setCardOnFile, setStripeCustomer, settleBalance } from './keys.ts';
import {
  chargeOffSession,
  createCustomer,
  createSetupCheckoutSession,
  retrieveCheckoutSession,
  retrievePaymentMethod,
  stripeConfigured,
  StripeError,
} from './stripe.ts';

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

  const session = await createSetupCheckoutSession({
    customerId,
    apiKeyId: key.id,
    successUrl: `${baseUrl}/v1/billing/return?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${baseUrl}/v1/billing/cancel`,
  });
  return session.url ? { ok: true, url: session.url } : { ok: false, reason: 'no_checkout_url' };
}

/** Read a completed Checkout session and store the saved card on its key. */
export async function completeCardSetup(sessionId: string): Promise<{ ok: boolean; reason?: string; brand?: string | null; last4?: string | null }> {
  if (!stripeConfigured()) return { ok: false, reason: 'stripe_not_configured' };
  const session = await retrieveCheckoutSession(sessionId);
  const apiKeyId = session.metadata?.apiKeyId;
  if (!apiKeyId) return { ok: false, reason: 'no_api_key_in_session' };

  // setup_intent was expanded on retrieval; pull the saved payment method.
  const si = session.setup_intent;
  const paymentMethodId = typeof si === 'object' && si ? (typeof si.payment_method === 'string' ? si.payment_method : null) : null;
  if (!paymentMethodId) return { ok: false, reason: 'no_payment_method' };

  if (session.customer && typeof session.customer === 'string') setStripeCustomer(apiKeyId, session.customer);

  let brand: string | null = null;
  let last4: string | null = null;
  try {
    const pm = await retrievePaymentMethod(paymentMethodId);
    brand = pm.card?.brand ?? null;
    last4 = pm.card?.last4 ?? null;
  } catch {
    /* display-only; not fatal */
  }
  setCardOnFile(apiKeyId, { paymentMethodId, brand, last4 });
  return { ok: true, brand, last4 };
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

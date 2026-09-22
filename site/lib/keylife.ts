import { TRIAL_DAYS } from './pricing.ts';
import type { SubscriptionRecord } from './store.ts';

/**
 * How long an issued API key should live, and what plan label it carries,
 * derived from the owning account's commercial status.
 *
 * The rule that matters for product-readiness: a paying customer's key
 * must not die mid-term. So a trialing or active subscription gets a key
 * that lives to the committed term end (never shorter than the 14-day
 * evaluation window), while everyone else gets a plain evaluation key.
 *
 * Pure and side-effect free so it can be unit-tested and reused both when
 * a key is first issued and when a trial converts an already-issued key.
 */

/** Evaluation-key lifetime: the free trial window. */
export const KEY_TTL_MS = TRIAL_DAYS * 24 * 60 * 60_000;

export interface KeyLife {
  plan: string;
  /** ISO timestamp. */
  expiresAt: string;
}

export function keyLifeFor(sub: SubscriptionRecord | undefined, now: number): KeyLife {
  const status = sub?.status;
  if (status === 'active' || status === 'trialing') {
    const termEnd = sub?.termEndsAt ? new Date(sub.termEndsAt).getTime() : now + 365 * 86_400_000;
    // Never shorter than the evaluation window, even very early in a trial.
    const expires = Math.max(termEnd, now + KEY_TTL_MS);
    return { plan: status === 'active' ? 'active' : 'trial', expiresAt: new Date(expires).toISOString() };
  }
  return { plan: 'evaluation', expiresAt: new Date(now + KEY_TTL_MS).toISOString() };
}

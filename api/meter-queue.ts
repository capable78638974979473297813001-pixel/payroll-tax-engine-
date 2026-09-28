import { reportMeterEvent } from './stripe.ts';

/**
 * Delivery rules for queued Stripe meter events, shared by the site
 * (site/lib/billing.ts) and the self-hosted API (api/billing.ts). Each
 * store owns its own queue; this decides when an item is due, delivers
 * it, and classifies the outcome.
 *
 * Why a queue at all: a meter event is the only record Stripe has of a
 * billable call. Firing it and logging a failure (the old behaviour)
 * loses the charge whenever Stripe is slow, down, or the process dies
 * mid-request. Queued in the same store write as the call, it is
 * retried until Stripe accepts it; the event's own `identifier` makes a
 * retry after an ambiguous failure idempotent on Stripe's side.
 */

/**
 * Stripe accepts meter events timestamped up to 35 days in the past. An
 * item older than this (minus a margin) can no longer be reported and is
 * marked dead -- kept, never deleted, so an operator can invoice it by
 * hand (see scripts/meter-queue.ts).
 */
export const METER_BACKDATE_LIMIT_MS = 35 * 86_400_000 - 60 * 60_000;

export interface QueuedMeterEvent {
  identifier: string;
  customerId: string;
  value: number;
  at: string;
  attempts: number;
  lastAttemptAt: string | null;
  deadAt?: string | null;
}

export type DeliveryOutcome = { delivered: true } | { delivered: false; error: string; dead?: boolean };

/** Exponential backoff: 1, 2, 4 ... minutes, capped at an hour. */
export function retryDelayMs(attempts: number): number {
  return Math.min(60 * 60_000, 60_000 * 2 ** Math.max(0, attempts - 1));
}

export function isDue(item: QueuedMeterEvent, now: number = Date.now()): boolean {
  if (item.deadAt) return false;
  if (!item.lastAttemptAt || item.attempts === 0) return true;
  return now - new Date(item.lastAttemptAt).getTime() >= retryDelayMs(item.attempts);
}

export async function deliverMeterEvent(
  item: QueuedMeterEvent,
  eventName: string,
  now: number = Date.now(),
): Promise<DeliveryOutcome> {
  const at = new Date(item.at).getTime();
  if (now - at > METER_BACKDATE_LIMIT_MS) {
    return { delivered: false, dead: true, error: 'older than Stripe\'s 35-day meter backdating window; invoice manually' };
  }
  try {
    await reportMeterEvent({
      eventName,
      customerId: item.customerId,
      value: item.value,
      identifier: item.identifier,
      timestamp: Math.floor(at / 1000),
    });
    return { delivered: true };
  } catch (err) {
    return { delivered: false, error: err instanceof Error ? err.message : String(err) };
  }
}

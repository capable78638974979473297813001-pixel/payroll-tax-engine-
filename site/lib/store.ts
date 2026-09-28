import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readJsonFile, withFileLock, writeJsonFileAtomic } from '../../api/json-store.ts';

/**
 * The site's own file-backed store: accounts, the terms each one agreed
 * to, issued keys, and usage.
 *
 * Not the real Supabase api_keys/usage_log schema
 * (supabase/migrations/20260829000000_api_keys.sql) -- this project's
 * Supabase instance isn't linked to a live URL from here, so there's
 * nothing to write to. The shapes mirror it closely enough (SHA-256 key
 * hashing, the same usage-log fields) that swapping the read/write calls
 * for Supabase later is mechanical.
 *
 * The one record here that has to be exact is TermsAcceptance: evidence
 * that a specific person, at a specific time, from a specific address,
 * agreed to a specific version of the terms BEFORE any payment method was
 * collected. Never rewrite an acceptance in place -- append a new one if
 * the terms change.
 *
 * Note what is deliberately absent: card and bank numbers. Those never
 * reach this server. The processor holds them and hands back a reference
 * plus a last four for display; see PaymentMethodRecord.
 */

// Overridable so a deployment can point the store at a durable, mounted
// volume (and so tests get an isolated directory). Absent, it defaults to
// site/.data, which is gitignored.
const DATA_DIR = process.env.SITE_DB_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..', '.data');

/**
 * The usage log is append-only and would otherwise grow without bound —
 * every billable call pushes one event. We keep the most recent
 * MAX_USAGE_EVENTS so db.json stays a sane size; per-key lifetime totals
 * are tracked separately on each KeyRecord (see totalCalls), so trimming
 * the log never loses a key's billed count. Override for high-volume
 * single-tenant deployments.
 */
export const MAX_USAGE_EVENTS = Number(process.env.MAX_USAGE_EVENTS ?? 50_000);

export type SignupStage =
  | 'unverified'
  | 'verified'
  | 'terms_accepted'
  | 'payment_pending'
  | 'trialing'
  | 'active'
  | 'cancelled';

export interface AccountRecord {
  name: string;
  email: string;
  company: string;
  phone: string;

  code: string | null;
  codeExpiresAt: string | null;
  codeRequestedAt: string | null;
  emailVerifiedAt: string | null;

  /** Wrong guesses against the current code; reset whenever a new code is issued. */
  codeAttempts?: number;

  sessionToken: string | null;
  sessionExpiresAt: string | null;

  stage: SignupStage;
  createdAt: string;
}

/** Written once, never edited. */
export interface TermsAcceptance {
  email: string;
  termsVersion: string;
  /** Typed full name, standing in for a signature. */
  signedName: string;
  acceptedAt: string;
  ip: string | null;
  userAgent: string | null;
  /**
   * The server-issued terms quote this acceptance is bound to (see
   * TermsQuote). The disclosed figures below are copied from that quote,
   * never from the client, so they are what the server actually showed.
   */
  quoteId?: string;
  /** SHA-256 of the exact clause text shown with the quote. */
  clausesSha256?: string;
  /** Exactly what was on screen when they agreed. */
  disclosed: {
    trialDays: number;
    trialEndsAt: string;
    termMonths: number;
    estimatedAnnual: number;
    expectedEmployees: number;
    payFrequency: string;
    rooftop: boolean;
  };
}

/**
 * What GET /api/terms showed a signed-in customer: the figures and the
 * exact clause text, keyed by an unguessable id. POST /api/accept-terms
 * must present that id, and the acceptance is recorded from this record
 * rather than from anything the client re-sends.
 */
export interface TermsQuote {
  id: string;
  email: string;
  termsVersion: string;
  issuedAt: string;
  expiresAt: string;
  trialDays: number;
  trialEndsAt: string;
  termMonths: number;
  estimatedAnnual: number;
  expectedEmployees: number;
  payFrequency: string;
  rooftop: boolean;
  clausesSha256: string;
  /** Set once an acceptance consumed it; a quote can be accepted only once. */
  acceptedAt?: string | null;
}

/**
 * A Stripe meter event that still has to be delivered. Written in the same
 * store transaction that records the billable call, removed only once
 * Stripe accepts it, so a Stripe outage or a crash can't silently drop a
 * billable call. `identifier` is Stripe's idempotency key for the event,
 * so a retry after an ambiguous failure can't double-bill.
 */
export interface MeterQueueItem {
  identifier: string;
  customerId: string;
  value: number;
  /** When the call happened: reported as the event timestamp. */
  at: string;
  attempts: number;
  lastAttemptAt: string | null;
  lastError: string | null;
  /**
   * Set when Stripe can no longer accept the event (older than its
   * backdating window). The item is kept for manual invoicing rather
   * than deleted, so the usage is never lost.
   */
  deadAt?: string | null;
}

/** One fixed window of a persistent (store-backed) rate limit. */
export interface RateWindow {
  count: number;
  start: number;
  windowMs: number;
}

export interface PaymentMethodRecord {
  email: string;
  /** 'card' or 'us_bank_account'. */
  kind: string;
  /** Processor's id for the saved method. Never a PAN. */
  processorRef: string | null;
  /** Display only, supplied by the processor. */
  last4: string | null;
  brand: string | null;
  attachedAt: string;
}

export interface SubscriptionRecord {
  email: string;
  legalName: string;
  billingContact: string;
  billingEmail: string;
  address: string;
  expectedEmployees: number;
  payFrequency: string;
  rooftop: boolean;
  estimatedAnnual: number;
  status: SignupStage;
  trialStartsAt: string | null;
  trialEndsAt: string | null;
  /** The committed term the trial converts into. */
  termMonths: number;
  termEndsAt: string | null;
  createdAt: string;
  activatedAt: string | null;

  // ---- Stripe metered billing (set once the customer subscribes) ----
  /** Stripe customer id; usage is metered against this. */
  stripeCustomerId?: string | null;
  /** Stripe subscription id for the metered graduated price. */
  stripeSubscriptionId?: string | null;
  /**
   * Set true when Stripe reports a failed invoice (payment_failed /
   * subscription deleted). A suspended account's key returns 402 until a
   * paid invoice reactivates it. Kept here, driven only by verified Stripe
   * webhooks — never by the caller.
   */
  suspended?: boolean;
  suspendedReason?: string | null;
}

export interface KeyRecord {
  keyHash: string;
  keyPrefix: string;
  ownerEmail: string;
  ownerName: string;
  company: string;
  plan: string;
  createdAt: string;
  expiresAt: string;
  isActive: boolean;
  lastUsedAt: string | null;
  /**
   * Monotonic lifetime count of billable calls on this key. Kept on the
   * key itself so it survives usage-log trimming (see MAX_USAGE_EVENTS)
   * and so metering never has to scan the whole log to bill.
   */
  totalCalls?: number;
}

export interface UsageEvent {
  keyHash: string;
  at: string;
  statusCode: number;
  error: string | null;
  checkDate: string | null;
}

export interface EstimateEvent {
  email: string;
  employees: number;
  payFrequency: string;
  callsPerYear: number;
  rooftop: boolean;
  estimatedPrice: number;
  at: string;
}

export interface DB {
  accounts: Record<string, AccountRecord>;
  acceptances: TermsAcceptance[];
  paymentMethods: Record<string, PaymentMethodRecord>;
  subscriptions: Record<string, SubscriptionRecord>;
  keys: Record<string, KeyRecord>;
  usage: UsageEvent[];
  estimates: EstimateEvent[];
  termsQuotes: Record<string, TermsQuote>;
  meterQueue: MeterQueueItem[];
  rateLimits: Record<string, RateWindow>;
}

function emptyDb(): DB {
  return {
    accounts: {},
    acceptances: [],
    paymentMethods: {},
    subscriptions: {},
    keys: {},
    usage: [],
    estimates: [],
    termsQuotes: {},
    meterQueue: [],
    rateLimits: {},
  };
}

const FILE = join(DATA_DIR, 'db.json');

// A file that exists but won't parse throws (see api/json-store.ts) rather
// than loading as empty: an empty load followed by any write would erase
// every account, key and billing record.
function load(): DB {
  const parsed = readJsonFile<Partial<DB>>(FILE);
  const base = emptyDb();
  if (!parsed) return base;
  return {
    accounts: parsed.accounts ?? base.accounts,
    acceptances: parsed.acceptances ?? base.acceptances,
    paymentMethods: parsed.paymentMethods ?? base.paymentMethods,
    subscriptions: parsed.subscriptions ?? base.subscriptions,
    keys: parsed.keys ?? base.keys,
    usage: parsed.usage ?? base.usage,
    estimates: parsed.estimates ?? base.estimates,
    termsQuotes: parsed.termsQuotes ?? base.termsQuotes,
    meterQueue: parsed.meterQueue ?? base.meterQueue,
    rateLimits: parsed.rateLimits ?? base.rateLimits,
  };
}

/**
 * Read-modify-write under an exclusive lock, saved atomically. Safe
 * against a crash mid-write and against another process sharing the
 * volume. Keep fn synchronous: the lock is held for its whole run.
 */
export function withDb<T>(fn: (db: DB) => T): T {
  return withFileLock(FILE, () => {
    const db = load();
    const result = fn(db);
    writeJsonFileAtomic(FILE, db);
    return result;
  });
}

export function readDb<T>(fn: (db: DB) => T): T {
  return fn(load());
}

/**
 * Append a usage event and keep the log bounded. Call this inside a
 * withDb() block rather than pushing to db.usage directly, so the log
 * can never grow past MAX_USAGE_EVENTS.
 */
export function appendUsage(db: DB, event: UsageEvent): void {
  db.usage.push(event);
  const overflow = db.usage.length - MAX_USAGE_EVENTS;
  if (overflow > 0) db.usage.splice(0, overflow);
}

/**
 * A fixed-window rate limit kept in the store instead of process memory,
 * so it survives restarts and is shared by every instance on the same
 * volume. Costs a store write per hit, so it is for the low-volume,
 * abuse-sensitive routes (signup, sign-in), not per-call metering.
 */
export function hitStoredLimit(
  db: DB,
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): { allowed: boolean; retryAfterSec: number } {
  // Sweep elapsed windows so the map can't grow without bound.
  for (const [k, w] of Object.entries(db.rateLimits)) {
    if (now - w.start >= w.windowMs) delete db.rateLimits[k];
  }
  let w = db.rateLimits[key];
  if (!w) {
    w = { count: 0, start: now, windowMs };
    db.rateLimits[key] = w;
  }
  const retryAfterSec = Math.max(1, Math.ceil((w.start + windowMs - now) / 1000));
  if (w.count >= limit) return { allowed: false, retryAfterSec };
  w.count += 1;
  return { allowed: true, retryAfterSec };
}

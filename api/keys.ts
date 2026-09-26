import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

/**
 * API keys + usage metering for the payroll-tax API (examples/api-server.ts) —
 * the self-contained, no-database replacement for what supabase/migrations'
 * api_keys + usage_log tables did. Same discipline as the Supabase version:
 * a presented key is SHA-256 hashed before comparison and the plaintext is
 * NEVER stored, so a leaked store file yields no usable key. It just keeps
 * that state in a JSON file (the pattern trades/accounts.ts and payroll/store.ts
 * already use) instead of Postgres, so the whole API runs on `node` with
 * nothing external to stand up.
 *
 * This is the right shape for a pilot or a single box. At real scale — many
 * concurrent callers, usage counts you bill from — swap this file for a real
 * database (the load/save seam is the only thing that changes); the mint /
 * verify / meter contract stays identical.
 */

/** A recorded call, kept as a small rolling window per key for a usage view. */
export interface UsageCall {
  at: string;
  stateCode: string | null;
  statusCode: number;
  /** What this one call added to the balance due (0 for non-billable calls). */
  chargedCents: number;
  error?: string;
}

export interface ApiKey {
  id: string;
  name: string;
  /** hex-encoded SHA-256 of the plaintext key — the plaintext is never stored. */
  keyHash: string;
  /** A non-secret display prefix, e.g. "sk_live_ab12cd" — safe to show in a dashboard. */
  prefix: string;
  plan: string;
  /** What each billable call costs this customer, in integer cents. */
  pricePerCallCents: number;
  /** Manual on/off (revoke). A revoked key cannot authenticate at all. */
  active: boolean;
  /** Auto-set when Stripe reports the monthly invoice went unpaid; the key can still sign in to fix its card but cannot make billable calls. */
  suspended: boolean;
  suspendedReason: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  /** Total calls ever metered against this key. */
  calls: number;
  /** Outstanding, not-yet-billed charges in cents — what you'd charge them right now. */
  balanceDueCents: number;
  /** Everything ever billed to this key, in cents (survives settlement). */
  lifetimeBilledCents: number;
  /** Stripe Customer id, set once this key's owner saves a card. */
  stripeCustomerId: string | null;
  /** The saved card to charge off-session (used only for the manual/settle path). */
  stripePaymentMethodId: string | null;
  /** Metered-billing subscription — set when the customer starts usage billing; each call reports one unit to it. */
  stripeSubscriptionId: string | null;
  /** Non-secret card display, e.g. "visa •••• 4242". */
  cardBrand: string | null;
  cardLast4: string | null;
  /** The most recent calls (bounded), newest first. */
  recent: UsageCall[];
}

/** What is safe to hand back / list — everything except the hash. */
export interface PublicApiKey {
  id: string;
  name: string;
  prefix: string;
  plan: string;
  pricePerCallCents: number;
  active: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  calls: number;
  balanceDueCents: number;
  lifetimeBilledCents: number;
  cardOnFile: boolean;
  cardBrand: string | null;
  cardLast4: string | null;
  suspended: boolean;
  suspendedReason: string | null;
}

/**
 * Per-call price by plan, in cents. This is "the amount we charge them" — the
 * default when a key is minted without an explicit price. Change these, or
 * pass an explicit price at mint time, to set your pricing.
 */
export const PLAN_PRICING_CENTS: Record<string, number> = {
  free: 0,
  standard: 15, // $0.15 / call on the self-hosted ledger. The public site bills graduated bands in site/lib/pricing.ts.
  pro: 15,
};

const RECENT_LIMIT = 25;

function dataDir(): string {
  return process.env.API_DB_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '.data');
}
function dbFile(): string {
  return join(dataDir(), 'api-keys.json');
}

interface KeysDB {
  keys: Record<string, ApiKey>;
}
function emptyDb(): KeysDB {
  return { keys: {} };
}
function ensureDataDir(): void {
  const dir = dataDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}
function load(): KeysDB {
  ensureDataDir();
  const file = dbFile();
  if (!existsSync(file)) return emptyDb();
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<KeysDB>;
    return { keys: parsed.keys ?? {} };
  } catch {
    return emptyDb();
  }
}
function save(db: KeysDB): void {
  ensureDataDir();
  writeFileSync(dbFile(), JSON.stringify(db, null, 2), 'utf8');
}
function withDb<T>(fn: (db: KeysDB) => T): T {
  const db = load();
  const result = fn(db);
  save(db);
  return result;
}

function hashKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

function toPublic(k: ApiKey): PublicApiKey {
  return {
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    plan: k.plan,
    pricePerCallCents: k.pricePerCallCents,
    active: k.active,
    createdAt: k.createdAt,
    lastUsedAt: k.lastUsedAt,
    calls: k.calls,
    balanceDueCents: k.balanceDueCents,
    lifetimeBilledCents: k.lifetimeBilledCents,
    cardOnFile: Boolean(k.stripePaymentMethodId),
    cardBrand: k.cardBrand,
    cardLast4: k.cardLast4,
    suspended: k.suspended,
    suspendedReason: k.suspendedReason,
  };
}
export function publicApiKey(k: ApiKey): PublicApiKey {
  return toPublic(k);
}

// ----------------------------------------------------------------------------
// Minting & lifecycle
// ----------------------------------------------------------------------------

/**
 * Mint a new key. Returns the plaintext ONCE (store it now — it is never
 * recoverable) alongside the stored record. Only the SHA-256 hash is persisted.
 */
export function mintApiKey(
  name: string,
  opts: { plan?: string; pricePerCallCents?: number } = {},
): { key: string; record: PublicApiKey } {
  const plan = opts.plan ?? 'standard';
  const price = opts.pricePerCallCents ?? PLAN_PRICING_CENTS[plan] ?? PLAN_PRICING_CENTS.standard;
  const key = 'sk_live_' + randomBytes(24).toString('base64url');
  const record: ApiKey = {
    id: `key_${randomUUID().slice(0, 8)}`,
    name: name.trim() || 'unnamed',
    keyHash: hashKey(key),
    prefix: key.slice(0, 14), // "sk_live_" + 6 chars — enough to identify, not to use
    plan,
    pricePerCallCents: Math.max(0, Math.round(price)),
    active: true,
    suspended: false,
    suspendedReason: null,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    calls: 0,
    balanceDueCents: 0,
    lifetimeBilledCents: 0,
    stripeCustomerId: null,
    stripePaymentMethodId: null,
    stripeSubscriptionId: null,
    cardBrand: null,
    cardLast4: null,
    recent: [],
  };
  withDb((db) => {
    db.keys[record.id] = record;
  });
  return { key, record: toPublic(record) };
}

/** Attach (or update) the Stripe Customer id for a key. */
export function setStripeCustomer(id: string, stripeCustomerId: string): void {
  withDb((db) => {
    const k = db.keys[id];
    if (k) k.stripeCustomerId = stripeCustomerId;
  });
}

/** Record the saved card for a key after the customer completes Checkout. */
export function setCardOnFile(id: string, card: { paymentMethodId: string; brand?: string | null; last4?: string | null }): void {
  withDb((db) => {
    const k = db.keys[id];
    if (!k) return;
    k.stripePaymentMethodId = card.paymentMethodId;
    k.cardBrand = card.brand ?? null;
    k.cardLast4 = card.last4 ?? null;
  });
}

/** Attach the metered-billing subscription id for a key. */
export function setSubscription(id: string, subscriptionId: string): void {
  withDb((db) => {
    const k = db.keys[id];
    if (k) k.stripeSubscriptionId = subscriptionId;
  });
}

/** Find the key belonging to a Stripe customer (for webhook handling). */
export function keyByStripeCustomer(stripeCustomerId: string): ApiKey | null {
  return Object.values(load().keys).find((k) => k.stripeCustomerId === stripeCustomerId) ?? null;
}

/**
 * Suspend or un-suspend the key for a Stripe customer — driven by invoice
 * webhooks. Suspension is separate from a manual revoke (active): a paid
 * invoice lifts it, a manual revoke it does not touch. Returns the affected
 * key's id, or null if no key matches that customer.
 */
export function setSuspendedByCustomer(stripeCustomerId: string, suspended: boolean, reason: string | null): string | null {
  return withDb((db) => {
    const k = Object.values(db.keys).find((x) => x.stripeCustomerId === stripeCustomerId);
    if (!k) return null;
    k.suspended = suspended;
    k.suspendedReason = suspended ? reason : null;
    return k.id;
  });
}

/** Change what each billable call costs this customer (integer cents). */
export function setPrice(id: string, pricePerCallCents: number): boolean {
  return withDb((db) => {
    const k = db.keys[id] ?? Object.values(db.keys).find((x) => x.prefix === id);
    if (!k) return false;
    k.pricePerCallCents = Math.max(0, Math.round(pricePerCallCents));
    return true;
  });
}

/** Resolve a presented plaintext key to its (active) record, or null. */
export function verifyApiKey(presented: string): ApiKey | null {
  if (!presented) return null;
  const token = presented.trim();
  if (!token.startsWith('sk_')) return null;
  const hash = hashKey(token);
  const found = Object.values(load().keys).find((k) => k.keyHash === hash);
  return found && found.active ? found : null;
}

export function getApiKey(id: string): ApiKey | null {
  return load().keys[id] ?? null;
}

export function listApiKeys(): PublicApiKey[] {
  return Object.values(load().keys)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(toPublic);
}

/** Revoke a key by id or by its display prefix. Returns true if one was revoked. */
export function revokeApiKey(idOrPrefix: string): boolean {
  return withDb((db) => {
    const target = db.keys[idOrPrefix] ?? Object.values(db.keys).find((k) => k.prefix === idOrPrefix);
    if (!target) return false;
    target.active = false;
    return true;
  });
}

// ----------------------------------------------------------------------------
// Metering
// ----------------------------------------------------------------------------

/**
 * Record one call against a key: bump the total, stamp last-used, and — when
 * the call is billable — add this key's per-call price to its balance due.
 * Returns what this call was charged (0 if not billable), so the caller can
 * echo it back in the response. Billable defaults to true; pass false for a
 * call you don't want to charge for (a bad request, say).
 */
export function recordUsage(
  id: string,
  call: { stateCode?: string | null; statusCode: number; error?: string; billable?: boolean },
): number {
  return withDb((db) => {
    const k = db.keys[id];
    if (!k) return 0;
    const billable = call.billable ?? true;
    const chargedCents = billable ? k.pricePerCallCents : 0;
    k.calls += 1;
    k.lastUsedAt = new Date().toISOString();
    k.balanceDueCents += chargedCents;
    k.lifetimeBilledCents += chargedCents;
    k.recent.unshift({
      at: k.lastUsedAt,
      stateCode: call.stateCode ?? null,
      statusCode: call.statusCode,
      chargedCents,
      ...(call.error ? { error: call.error } : {}),
    });
    if (k.recent.length > RECENT_LIMIT) k.recent.length = RECENT_LIMIT;
    return chargedCents;
  });
}

export function usageForKey(id: string): {
  calls: number;
  lastUsedAt: string | null;
  pricePerCallCents: number;
  balanceDueCents: number;
  lifetimeBilledCents: number;
  recent: UsageCall[];
} | null {
  const k = load().keys[id];
  if (!k) return null;
  return {
    calls: k.calls,
    lastUsedAt: k.lastUsedAt,
    pricePerCallCents: k.pricePerCallCents,
    balanceDueCents: k.balanceDueCents,
    lifetimeBilledCents: k.lifetimeBilledCents,
    recent: k.recent,
  };
}

// ----------------------------------------------------------------------------
// Billing / settlement
// ----------------------------------------------------------------------------

/**
 * Settle a key's outstanding balance — i.e. "charge them the amount we have."
 * This zeroes balanceDueCents and returns the amount that was owed, so the
 * caller can hand that amount to a payment processor.
 *
 * NOTE — this moves NO real money by itself. Actually charging a card needs a
 * payment processor (Stripe et al.): create a Customer + PaymentMethod at
 * signup, then here call the processor with `amountCents` and only clear the
 * balance once it confirms the charge succeeded. This function is that seam —
 * it does the accounting (what the repo does for SMS/ACH too: never claim a
 * charge happened when no processor is connected). Until a processor is wired,
 * treat a returned amount as "invoice this", not "money collected".
 */
export function settleBalance(idOrPrefix: string): { ok: boolean; name?: string; chargedCents: number } {
  return withDb((db) => {
    const k = db.keys[idOrPrefix] ?? Object.values(db.keys).find((x) => x.prefix === idOrPrefix);
    if (!k) return { ok: false, chargedCents: 0 };
    const chargedCents = k.balanceDueCents;
    k.balanceDueCents = 0;
    return { ok: true, name: k.name, chargedCents };
  });
}

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
  active: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  /** Total calls ever metered against this key. */
  calls: number;
  /** The most recent calls (bounded), newest first. */
  recent: UsageCall[];
}

/** What is safe to hand back / list — everything except the hash. */
export interface PublicApiKey {
  id: string;
  name: string;
  prefix: string;
  plan: string;
  active: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  calls: number;
}

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
    active: k.active,
    createdAt: k.createdAt,
    lastUsedAt: k.lastUsedAt,
    calls: k.calls,
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
export function mintApiKey(name: string, plan = 'free'): { key: string; record: PublicApiKey } {
  const key = 'sk_live_' + randomBytes(24).toString('base64url');
  const record: ApiKey = {
    id: `key_${randomUUID().slice(0, 8)}`,
    name: name.trim() || 'unnamed',
    keyHash: hashKey(key),
    prefix: key.slice(0, 14), // "sk_live_" + 6 chars — enough to identify, not to use
    plan,
    active: true,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    calls: 0,
    recent: [],
  };
  withDb((db) => {
    db.keys[record.id] = record;
  });
  return { key, record: toPublic(record) };
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

/** Record one call against a key: bump the total, stamp last-used, keep a rolling recent window. */
export function recordUsage(id: string, call: { stateCode?: string | null; statusCode: number; error?: string }): void {
  withDb((db) => {
    const k = db.keys[id];
    if (!k) return;
    k.calls += 1;
    k.lastUsedAt = new Date().toISOString();
    k.recent.unshift({
      at: k.lastUsedAt,
      stateCode: call.stateCode ?? null,
      statusCode: call.statusCode,
      ...(call.error ? { error: call.error } : {}),
    });
    if (k.recent.length > RECENT_LIMIT) k.recent.length = RECENT_LIMIT;
  });
}

export function usageForKey(id: string): { calls: number; lastUsedAt: string | null; recent: UsageCall[] } | null {
  const k = load().keys[id];
  if (!k) return null;
  return { calls: k.calls, lastUsedAt: k.lastUsedAt, recent: k.recent };
}

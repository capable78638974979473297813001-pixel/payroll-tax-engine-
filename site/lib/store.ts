import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.data');

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

interface DB {
  accounts: Record<string, AccountRecord>;
  acceptances: TermsAcceptance[];
  paymentMethods: Record<string, PaymentMethodRecord>;
  subscriptions: Record<string, SubscriptionRecord>;
  keys: Record<string, KeyRecord>;
  usage: UsageEvent[];
  estimates: EstimateEvent[];
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
  };
}

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

const FILE = join(DATA_DIR, 'db.json');

function load(): DB {
  ensureDataDir();
  if (!existsSync(FILE)) return emptyDb();
  try {
    const parsed = JSON.parse(readFileSync(FILE, 'utf8')) as Partial<DB>;
    const base = emptyDb();
    return {
      accounts: parsed.accounts ?? base.accounts,
      acceptances: parsed.acceptances ?? base.acceptances,
      paymentMethods: parsed.paymentMethods ?? base.paymentMethods,
      subscriptions: parsed.subscriptions ?? base.subscriptions,
      keys: parsed.keys ?? base.keys,
      usage: parsed.usage ?? base.usage,
      estimates: parsed.estimates ?? base.estimates,
    };
  } catch {
    return emptyDb();
  }
}

function save(db: DB): void {
  ensureDataDir();
  writeFileSync(FILE, JSON.stringify(db, null, 2), 'utf8');
}

export function withDb<T>(fn: (db: DB) => T): T {
  const db = load();
  const result = fn(db);
  save(db);
  return result;
}

export function readDb<T>(fn: (db: DB) => T): T {
  return fn(load());
}

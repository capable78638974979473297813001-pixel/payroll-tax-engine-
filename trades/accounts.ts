import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Accounts and sessions for Crewtally — the thin identity layer that turns the
 * single-tenant demo into a real sign-in: an owner creates a shop and gets an
 * owner account; each worker the owner adds can be given a login of their own.
 *
 * It follows the same file-backed boundary as trades/store.ts (a JSON file
 * standing in for what db/ describes; swapping these functions for real
 * queries later is mechanical), and lives in ITS OWN file
 * (crewtally-accounts.json) so a password hash never shares a record with a
 * job or a wage determination. Passwords are stored only as a scrypt hash over
 * a per-account random salt — never in the clear, never recoverable — and
 * sessions are opaque random tokens with an expiry. The two link to the rest
 * of the system by id: Account.companyId is a payroll Company.id, and a worker
 * account's Account.employeeId is a payroll Employee.id.
 */

export type AccountRole = 'owner' | 'worker';

export interface Account {
  id: string;
  /** Lowercased, unique across all accounts — the login handle. */
  email: string;
  name: string;
  role: AccountRole;
  /** The shop this account belongs to (a payroll Company.id). */
  companyId: string;
  /** For a worker account, the payroll Employee.id it signs in as; null for an owner. */
  employeeId: string | null;
  /** scrypt(password, salt) as hex — never the password itself. */
  passwordHash: string;
  /** Per-account random salt, hex. */
  salt: string;
  createdAt: string;
}

export interface Session {
  token: string;
  accountId: string;
  createdAt: string;
  expiresAt: string;
}

/** What is safe to hand back over the wire — everything except the secret material. */
export interface PublicAccount {
  id: string;
  email: string;
  name: string;
  role: AccountRole;
  companyId: string;
  employeeId: string | null;
}

/** Raised when a signup reuses an email that already has an account. */
export class EmailTakenError extends Error {
  constructor(email: string) {
    super(`An account already exists for ${email}.`);
    this.name = 'EmailTakenError';
  }
}

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const SCRYPT_KEYLEN = 64;

function dataDir(): string {
  return process.env.TRADES_DB_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '.data');
}
function dbFile(): string {
  return join(dataDir(), 'crewtally-accounts.json');
}

interface AccountsDB {
  /** Keyed by account id. */
  accounts: Record<string, Account>;
  /** Keyed by session token. */
  sessions: Record<string, Session>;
}

function emptyDb(): AccountsDB {
  return { accounts: {}, sessions: {} };
}
function ensureDataDir(): void {
  const dir = dataDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}
function load(): AccountsDB {
  ensureDataDir();
  const file = dbFile();
  if (!existsSync(file)) return emptyDb();
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<AccountsDB>;
    const base = emptyDb();
    return { accounts: parsed.accounts ?? base.accounts, sessions: parsed.sessions ?? base.sessions };
  } catch {
    return emptyDb();
  }
}
function save(db: AccountsDB): void {
  ensureDataDir();
  writeFileSync(dbFile(), JSON.stringify(db, null, 2), 'utf8');
}
function withDb<T>(fn: (db: AccountsDB) => T): T {
  const db = load();
  const result = fn(db);
  save(db);
  return result;
}

// ----------------------------------------------------------------------------
// Password hashing
// ----------------------------------------------------------------------------

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
}

/** Constant-time compare of a candidate password against a stored hash+salt. */
function passwordMatches(password: string, hashHex: string, salt: string): boolean {
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, salt, SCRYPT_KEYLEN);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toPublic(a: Account): PublicAccount {
  return { id: a.id, email: a.email, name: a.name, role: a.role, companyId: a.companyId, employeeId: a.employeeId };
}

// ----------------------------------------------------------------------------
// Accounts
// ----------------------------------------------------------------------------

export interface CreateAccountInput {
  email: string;
  password: string;
  name: string;
  role: AccountRole;
  companyId: string;
  employeeId?: string | null;
}

export function createAccount(input: CreateAccountInput): Account {
  const email = normalizeEmail(input.email);
  return withDb((db) => {
    if (Object.values(db.accounts).some((a) => a.email === email)) throw new EmailTakenError(email);
    const salt = randomBytes(16).toString('hex');
    const account: Account = {
      id: `acct_${randomUUID().slice(0, 8)}`,
      email,
      name: input.name.trim() || email,
      role: input.role,
      companyId: input.companyId,
      employeeId: input.employeeId ?? null,
      passwordHash: hashPassword(input.password, salt),
      salt,
      createdAt: new Date().toISOString(),
    };
    db.accounts[account.id] = account;
    return account;
  });
}

export function getAccount(id: string): Account | null {
  return load().accounts[id] ?? null;
}

export function getAccountByEmail(email: string): Account | null {
  const target = normalizeEmail(email);
  return Object.values(load().accounts).find((a) => a.email === target) ?? null;
}

/** The login account tied to a given worker (payroll Employee.id), if one was created. */
export function getAccountForEmployee(employeeId: string): Account | null {
  return Object.values(load().accounts).find((a) => a.employeeId === employeeId) ?? null;
}

/** Verify an email + password. Returns the account on success, null on any mismatch. */
export function verifyCredentials(email: string, password: string): Account | null {
  const account = getAccountByEmail(email);
  if (!account) return null;
  return passwordMatches(password, account.passwordHash, account.salt) ? account : null;
}

/** Set or replace an account's password (owner resetting a worker's login, say). */
export function setPassword(accountId: string, password: string): void {
  withDb((db) => {
    const a = db.accounts[accountId];
    if (!a) return;
    a.salt = randomBytes(16).toString('hex');
    a.passwordHash = hashPassword(password, a.salt);
  });
}

export function publicAccount(a: Account): PublicAccount {
  return toPublic(a);
}

// ----------------------------------------------------------------------------
// Sessions
// ----------------------------------------------------------------------------

export function createSession(accountId: string): Session {
  const now = Date.now();
  const session: Session = {
    token: randomBytes(24).toString('hex'),
    accountId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
  };
  withDb((db) => {
    db.sessions[session.token] = session;
  });
  return session;
}

/** The live session for a token, or null if it is missing or expired. Expired tokens are swept as they're encountered. */
export function getSession(token: string): Session | null {
  if (!token) return null;
  return withDb((db) => {
    const s = db.sessions[token];
    if (!s) return null;
    if (Date.parse(s.expiresAt) <= Date.now()) {
      delete db.sessions[token];
      return null;
    }
    return s;
  });
}

/** Resolve a token straight to its account (or null). */
export function accountForToken(token: string): Account | null {
  const session = getSession(token);
  return session ? getAccount(session.accountId) : null;
}

export function deleteSession(token: string): void {
  if (!token) return;
  withDb((db) => {
    delete db.sessions[token];
  });
}

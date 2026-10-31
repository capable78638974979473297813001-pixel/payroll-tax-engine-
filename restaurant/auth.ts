import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
export interface Account { id: string; email: string; name: string; companyId: string; salt: string; hash: string }
interface AuthDb { accounts: Account[]; sessions: Record<string, { accountId: string; expires: number; csrf: string }> }
function path() { const dir = process.env.RESTAURANT_AUTH_DIR ?? join(import.meta.dirname, '.data'); mkdirSync(dir, { recursive: true, mode: 0o700 }); return join(dir, 'auth.json'); }
function read(): AuthDb { try { return JSON.parse(readFileSync(path(), 'utf8')); } catch (e: any) { if (e.code === 'ENOENT') return { accounts: [], sessions: {} }; throw e; } }
function save(db: AuthDb) { const file = path(), temp = `${file}.${randomUUID()}.tmp`; writeFileSync(temp, JSON.stringify(db), { mode: 0o600 }); renameSync(temp, file); }
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
export function register(email: string, password: string, name: string): Account {
  email = String(email ?? '').trim().toLowerCase(); name = String(name ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !name || name.length > 100 || typeof password !== 'string' || password.length < 12 || password.length > 128) throw new Error('Enter your name, a valid email and a password of 12–128 characters.');
  const db = read(); if (db.accounts.some(a => a.email === email)) throw new Error('Unable to create this account. Try signing in.');
  const salt = randomBytes(16).toString('hex');
  const account = { id: randomUUID(), companyId: randomUUID(), email, name, salt, hash: scryptSync(password, salt, 64).toString('hex') };
  db.accounts.push(account); save(db); return account;
}
export function login(email: string, password: string): Account {
  const account = read().accounts.find(a => a.email === String(email ?? '').trim().toLowerCase());
  if (typeof password !== 'string' || password.length > 128) throw new Error('Email or password is incorrect.');
  const computed = scryptSync(password, account?.salt ?? 'missing-account-salt', 64);
  if (!account || !timingSafeEqual(computed, Buffer.from(account.hash, 'hex'))) throw new Error('Email or password is incorrect.');
  return account;
}
export function createSession(account: Account) { const db = read(), token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex'); for (const [id,s] of Object.entries(db.sessions)) if (s.expires <= Date.now()) delete db.sessions[id]; db.sessions[digest(token)] = { accountId: account.id, expires: Date.now() + 8 * 3600000, csrf }; save(db); return { token, csrf }; }
export function session(token: string) { const db = read(), value = db.sessions[digest(token)]; if (!value || value.expires <= Date.now()) return null; const account = db.accounts.find(a => a.id === value.accountId); return account ? { account, csrf: value.csrf } : null; }
export function logout(token: string) { const db = read(); delete db.sessions[digest(token)]; save(db); }

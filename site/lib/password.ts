/**
 * Account passwords: scrypt (node:crypto, no dependency), a fresh random salt
 * per password, stored as one string
 *
 *   scrypt$<N>$<r>$<p>$<salt b64>$<hash b64>
 *
 * so the cost can be raised later and old hashes still verify. Hashing is
 * asynchronous so a sign-in never blocks the event loop.
 */
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * OWASP Password Storage Cheat Sheet scrypt parameters: N=2^17, r=8, p=1.
 * Argon2id is the cheat sheet's first choice and needs a native module this
 * process does not ship. scrypt at these parameters is the listed alternative
 * in node:crypto. Hashes written at the previous N=2^14 still verify, and a
 * successful sign-in rewrites them at the current cost.
 */
const N = 131072;
const R = 8;
const P = 1;
const KEYLEN = 32;
const MIN_N = 16384;

export const MIN_PASSWORD = 12;
/** Upper bound so a huge password can't be used to burn CPU. */
export const MAX_PASSWORD = 200;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  const opts: ScryptOptions = { N: n, r, p, maxmem: 128 * n * r * 2 };
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEYLEN, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const parts = (stored ?? '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    // Burn the same time as a real check so a missing or malformed hash is
    // not distinguishable from a wrong password by timing.
    await derive(password, Buffer.alloc(16), N, R, P);
    return false;
  }
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  // A stored cost above the current one is rejected so a tampered row cannot
  // pin the event loop. Below MIN_N is not a hash this app ever wrote.
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p) || r !== R || p < 1 || p > 4 || n < MIN_N || n > N || (n & (n - 1)) !== 0) {
    await derive(password, Buffer.alloc(16), N, R, P);
    return false;
  }
  const salt = Buffer.from(parts[4]!, 'base64');
  const want = Buffer.from(parts[5]!, 'base64');
  const got = await derive(password, salt, n, r, p);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** True when a stored hash should be rewritten at the current cost. */
export function passwordNeedsRehash(stored: string | null | undefined): boolean {
  const parts = (stored ?? '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  return Number(parts[1]) !== N || Number(parts[2]) !== R || Number(parts[3]) !== P;
}

const WEAK = new Set([
  'password1234', 'passwordpassword', '123456789012', '1234567890123', 'qwertyuiopas', 'iloveyou1234',
  'administrator', 'letmeinletmein', 'welcome12345', 'changemechangeme',
]);

/** Null when acceptable, otherwise a message the form can show as is. */
export function passwordProblem(password: unknown, email?: string): string | null {
  if (typeof password !== 'string') return 'Enter a password.';
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (password.length > MAX_PASSWORD) return `Use at most ${MAX_PASSWORD} characters.`;
  const lower = password.toLowerCase();
  if (new Set(lower).size < 4) return 'That password is too repetitive. Mix in more different characters.';
  if (WEAK.has(lower)) return 'That password is too common. Pick something less guessable.';
  if (email && (lower === email.toLowerCase() || lower.includes(email.toLowerCase().split('@')[0]!) && email.split('@')[0]!.length >= 6)) {
    return 'Don’t use your email address in your password.';
  }
  return null;
}

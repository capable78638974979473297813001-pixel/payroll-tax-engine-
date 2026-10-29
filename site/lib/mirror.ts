import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';

import { createStoreCustomer, listCustomers, stripeConfigured, updateCustomerMetadata } from '../../api/stripe.ts';
import {
  onStoreWritten, readDb, storageStatus, withDb,
  type AccountRecord, type AuthSession, type DB, type KeyRecord, type PaymentMethodRecord,
  type SavedScenario, type SubscriptionRecord, type TermsAcceptance,
} from './store.ts';

/**
 * A durable copy of every verified account, kept in Stripe.
 *
 * The account store is a file. On a host whose disk does not outlive the container, a restart or a
 * redeploy brings that file back empty, and every account, sign-in and API key is forgotten even
 * though sign-up and sign-in worked a minute earlier. A durable disk is the right home for the
 * file. When the host does not have one, this keeps the data safe anyway, with the credential the
 * server already holds: each verified account (with its sessions, API keys, terms acceptances,
 * subscription and saved scenarios) is written, encrypted, to a Stripe customer's metadata, and
 * restored into an empty store at start-up.
 *
 *  - Encrypted with AES-256-GCM under a key derived (HKDF) from STORE_MIRROR_SECRET, or from the
 *    Stripe secret key when that is unset. The customer holds ciphertext only.
 *  - Written a couple of seconds after a change, and flushed when the process is told to stop.
 *  - Restored only into accounts the local store does not already have: a store that survived is
 *    never overwritten.
 *  - On only when Stripe is configured and the store is on temporary storage, or STORE_MIRROR=1.
 *    STORE_MIRROR=0 turns it off.
 *
 * Usage counters change on every API call and are left out of the change check, so a busy key does
 * not rewrite its backup on every request; they are refreshed whenever anything else changes.
 */

const MARKER = 'omnia_store';
const CHUNK_CHARS = 480;
/** Stripe allows 50 metadata keys; the backup uses up to 44 for data and a few for its own bookkeeping. */
const MAX_CHUNKS = 44;
const FLUSH_DELAY_MS = 2_000;
const READY_WAIT_MS = 20_000;

export interface AccountBundle {
  v: 1;
  savedAt: string;
  account: AccountRecord;
  sessions: Record<string, AuthSession>;
  keys: KeyRecord[];
  subscription?: SubscriptionRecord;
  paymentMethod?: PaymentMethodRecord;
  scenarios?: SavedScenario[];
  acceptances: TermsAcceptance[];
}

export function mirrorEnabled(): boolean {
  if (process.env.STORE_MIRROR === '0') return false;
  if (!stripeConfigured()) return false;
  return process.env.STORE_MIRROR === '1' || storageStatus().status === 'temporary';
}

const emailHash = (email: string) => createHash('sha256').update(email.trim().toLowerCase()).digest('hex');

function mirrorKey(): Buffer {
  const secret = (process.env.STORE_MIRROR_SECRET || process.env.STRIPE_SECRET_KEY || '').trim();
  if (!secret) throw new Error('No secret to encrypt the account backup with.');
  return Buffer.from(hkdfSync('sha256', secret, 'omnia-store-mirror-v1', 'aes-256-gcm', 32));
}

export function encryptBundle(bundle: AccountBundle, hash: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', mirrorKey(), nonce);
  cipher.setAAD(Buffer.from(hash));
  const ct = Buffer.concat([cipher.update(gzipSync(Buffer.from(JSON.stringify(bundle)))), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), ct]).toString('base64url');
}

export function decryptBundle(text: string, hash: string): AccountBundle {
  const raw = Buffer.from(text, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', mirrorKey(), raw.subarray(0, 12));
  decipher.setAAD(Buffer.from(hash));
  decipher.setAuthTag(raw.subarray(12, 28));
  const plain = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
  return JSON.parse(gunzipSync(plain).toString('utf8')) as AccountBundle;
}

/** Counters that move on every request; not part of what decides whether a backup is out of date. */
const VOLATILE_KEY_FIELDS = ['totalCalls', 'totalRequests', 'totalPaychecks', 'totalErrors', 'dayUsage', 'periodUsage', 'lastUsedAt', 'testDay'] as const;

function stable(value: unknown): string {
  return JSON.stringify(value);
}

/** One bundle per verified account. Accounts that never verified their address are not backed up. */
export function buildBundles(db: DB, savedAt = new Date().toISOString()): Map<string, AccountBundle> {
  const out = new Map<string, AccountBundle>();
  for (const [email, account] of Object.entries(db.accounts)) {
    if (!account.emailVerifiedAt) continue;
    out.set(email, {
      v: 1,
      savedAt,
      account: { ...account, code: null, codeExpiresAt: null, codeAttempts: 0 },
      sessions: {},
      keys: [],
      subscription: db.subscriptions[email],
      paymentMethod: db.paymentMethods[email],
      scenarios: db.scenarios[email],
      acceptances: [],
    });
  }
  for (const [token, session] of Object.entries(db.sessions)) {
    const bundle = out.get(session.email);
    if (bundle) bundle.sessions[token] = session;
  }
  for (const key of Object.values(db.keys)) out.get(key.ownerEmail)?.keys.push(key);
  for (const a of db.acceptances) out.get(a.email)?.acceptances.push(a);
  return out;
}

export function fingerprint(bundle: AccountBundle): string {
  const keys = bundle.keys.map((k) => {
    const copy: Record<string, unknown> = { ...k };
    for (const f of VOLATILE_KEY_FIELDS) delete copy[f];
    return copy;
  });
  return createHash('sha256').update(stable({ ...bundle, savedAt: '', keys })).digest('hex').slice(0, 32);
}

/** Split an encrypted bundle into Stripe metadata. Returns null if it cannot fit even stripped down. */
export function toMetadata(bundle: AccountBundle, hash: string, fp: string): Record<string, string> | null {
  const attempts: AccountBundle[] = [bundle, { ...bundle, sessions: {} }, { ...bundle, sessions: {}, scenarios: undefined }];
  for (const b of attempts) {
    const text = encryptBundle(b, hash);
    const chunks = text.match(new RegExp(`.{1,${CHUNK_CHARS}}`, 'g')) ?? [];
    if (chunks.length > MAX_CHUNKS) continue;
    const md: Record<string, string> = { [MARKER]: '1', h: hash, fp, t: bundle.savedAt, n: String(chunks.length), v: '1' };
    chunks.forEach((c, i) => { md[`b${i}`] = c; });
    // Clear leftover chunks from a longer earlier backup.
    for (let i = chunks.length; i < MAX_CHUNKS; i++) md[`b${i}`] = '';
    return md;
  }
  return null;
}

export function fromMetadata(md: Record<string, string>): { bundle: AccountBundle; hash: string } {
  const hash = md.h ?? '';
  const n = Number(md.n);
  let text = '';
  for (let i = 0; i < n; i++) text += md[`b${i}`] ?? '';
  return { bundle: decryptBundle(text, hash), hash };
}

/** Put a restored account back, never replacing one the store already has. Returns whether anything was added. */
export function restoreBundle(db: DB, bundle: AccountBundle): boolean {
  const email = bundle.account.email;
  if (db.accounts[email]) return false;
  db.accounts[email] = bundle.account;
  for (const [token, session] of Object.entries(bundle.sessions ?? {})) if (!db.sessions[token]) db.sessions[token] = session;
  for (const key of bundle.keys ?? []) if (!db.keys[key.keyHash]) db.keys[key.keyHash] = key;
  if (bundle.subscription && !db.subscriptions[email]) db.subscriptions[email] = bundle.subscription;
  if (bundle.paymentMethod && !db.paymentMethods[email]) db.paymentMethods[email] = bundle.paymentMethod;
  if (bundle.scenarios && !db.scenarios[email]) db.scenarios[email] = bundle.scenarios;
  for (const a of bundle.acceptances ?? []) {
    if (!db.acceptances.some((x) => x.email === a.email && x.acceptedAt === a.acceptedAt && x.termsVersion === a.termsVersion)) db.acceptances.push(a);
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// The running mirror
// ---------------------------------------------------------------------------------------------

type State = 'off' | 'restoring' | 'ok' | 'failing';

const customerOf = new Map<string, string>(); // email hash -> Stripe customer id
const uploadedFp = new Map<string, string>(); // email hash -> fingerprint last written
const pending = new Map<string, AccountBundle>(); // email hash -> bundle to write
let state: State = 'off';
let lastError = '';
let lastSyncAt = '';
let readyPromise: Promise<void> = Promise.resolve();
let started = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let diffTimer: ReturnType<typeof setTimeout> | null = null;
let latestDb: DB | null = null;
let flushing: Promise<void> | null = null;
let backoffMs = 5_000;

export function mirrorStatus(): { state: State; accounts: number; pending: number; lastError?: string; lastSyncAt?: string } {
  return { state, accounts: uploadedFp.size, pending: pending.size, ...(lastError ? { lastError } : {}), ...(lastSyncAt ? { lastSyncAt } : {}) };
}

/** Resolves once the account store has been checked against the backup (or after a wait, so a slow Stripe never stalls the site). */
export function mirrorReady(): Promise<void> {
  if (state === 'off' || state === 'ok' || state === 'failing') return Promise.resolve();
  return Promise.race([readyPromise, new Promise<void>((resolve) => setTimeout(resolve, READY_WAIT_MS).unref())]);
}

function noteFailure(err: unknown): void {
  lastError = (err instanceof Error ? err.message : String(err)).slice(0, 200);
  state = 'failing';
  console.error(`[mirror] account backup failed: ${lastError}`);
}

function scheduleDiff(db: DB): void {
  latestDb = db;
  if (state === 'off' || state === 'restoring' || diffTimer) return;
  diffTimer = setTimeout(() => {
    diffTimer = null;
    if (latestDb) queueChanges(latestDb);
  }, FLUSH_DELAY_MS);
  diffTimer.unref();
}

function queueChanges(db: DB): void {
  const bundles = buildBundles(db);
  for (const [email, bundle] of bundles) {
    const hash = emailHash(email);
    const fp = fingerprint(bundle);
    if (uploadedFp.get(hash) === fp && !pending.has(hash)) continue;
    pending.set(hash, bundle);
  }
  if (pending.size) scheduleFlush(0);
}

function scheduleFlush(delay: number): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushMirror();
  }, delay);
  flushTimer.unref();
}

async function writeOne(hash: string, bundle: AccountBundle): Promise<void> {
  const fp = fingerprint(bundle);
  const md = toMetadata(bundle, hash, fp);
  if (!md) {
    console.error('[mirror] one account is too large to back up; skipped.');
    uploadedFp.set(hash, fp);
    return;
  }
  let id = customerOf.get(hash);
  if (!id) {
    // Static parameters, so a retry inside Stripe's idempotency window never conflicts.
    const created = await createStoreCustomer({ metadata: { [MARKER]: '1', h: hash }, idempotencyKey: `omnia-store-${hash.slice(0, 40)}` });
    id = created.id;
    customerOf.set(hash, id);
  }
  await updateCustomerMetadata(id, md);
  uploadedFp.set(hash, fp);
}

/** Write what is pending. Safe to call at any time; also used to flush on shutdown. */
export function flushMirror(maxMs = 25_000): Promise<void> {
  if (state === 'off') return Promise.resolve();
  if (flushing) return flushing;
  const deadline = Date.now() + maxMs;
  flushing = (async () => {
    try {
      if (diffTimer) { clearTimeout(diffTimer); diffTimer = null; if (latestDb && state !== 'restoring') queueChanges(latestDb); }
      for (const [hash, bundle] of [...pending]) {
        if (Date.now() > deadline) break;
        await writeOne(hash, bundle);
        if (pending.get(hash) === bundle) pending.delete(hash);
      }
      if (state === 'failing') { state = 'ok'; lastError = ''; }
      backoffMs = 5_000;
      lastSyncAt = new Date().toISOString();
    } catch (err) {
      noteFailure(err);
      scheduleFlush(backoffMs);
      backoffMs = Math.min(backoffMs * 2, 60_000);
    } finally {
      flushing = null;
      if (pending.size && state !== 'failing') scheduleFlush(FLUSH_DELAY_MS);
    }
  })();
  return flushing;
}

async function listStoreCustomers(): Promise<Array<{ id: string; metadata: Record<string, string> }>> {
  const found: Array<{ id: string; metadata: Record<string, string> }> = [];
  let after: string | undefined;
  for (let page = 0; page < 500; page++) {
    const res = await listCustomers({ limit: 100, startingAfter: after });
    for (const c of res.data) if (c.metadata?.[MARKER] === '1') found.push({ id: c.id, metadata: c.metadata });
    if (!res.has_more || res.data.length === 0) break;
    after = res.data[res.data.length - 1]!.id;
  }
  return found;
}

/** Restore accounts the local store lacks, then bring the backup up to date with what it has. */
export async function restoreFromMirror(): Promise<{ restored: number; backedUp: number }> {
  const remote = await listStoreCustomers();
  // Newest backup first; if an account somehow has two, the newest wins.
  remote.sort((a, b) => (b.metadata.t ?? '').localeCompare(a.metadata.t ?? ''));
  const remoteFp = new Map<string, string>();
  const bundles: AccountBundle[] = [];
  for (const c of remote) {
    const hash = c.metadata.h ?? '';
    if (!hash || remoteFp.has(hash)) continue;
    customerOf.set(hash, c.id);
    remoteFp.set(hash, c.metadata.fp ?? '');
    try {
      bundles.push(fromMetadata(c.metadata).bundle);
    } catch (err) {
      console.error(`[mirror] could not read one backed-up account (${err instanceof Error ? err.message : String(err)}). Was STORE_MIRROR_SECRET or the Stripe key changed?`);
    }
  }
  let restored = 0;
  if (bundles.length) {
    withDb((db) => {
      for (const b of bundles) if (restoreBundle(db, b)) restored++;
    });
  }
  // Seed what is already backed up, so the next write does not rewrite every account.
  const local = readDb((db) => buildBundles(db));
  for (const [email, bundle] of local) {
    const hash = emailHash(email);
    if (remoteFp.get(hash) === fingerprint(bundle)) uploadedFp.set(hash, remoteFp.get(hash)!);
  }
  return { restored, backedUp: remote.length };
}

/** Start the backup. Call once, before the server takes requests. */
export function startMirror(): void {
  if (started) return;
  started = true;
  if (!mirrorEnabled()) return;
  state = 'restoring';
  onStoreWritten(scheduleDiff);
  const attempt = async (): Promise<boolean> => {
    try {
      const { restored, backedUp } = await restoreFromMirror();
      console.log(`[mirror] account backup on: ${backedUp} account(s) backed up, ${restored} restored into this store.`);
      state = 'ok';
      lastError = '';
      queueChanges(readDb((db) => db));
      return true;
    } catch (err) {
      noteFailure(err);
      return false;
    }
  };
  readyPromise = attempt().then((ok) => {
    if (ok) return;
    // Stripe unreachable at start: serve what the store has and keep trying to restore the rest.
    const retry = setInterval(() => {
      void attempt().then((done) => { if (done) clearInterval(retry); });
    }, 30_000);
    retry.unref();
  });
}

/** Test hook: forget everything so a fresh start can be simulated in one process. */
export function resetMirrorForTests(): void {
  customerOf.clear(); uploadedFp.clear(); pending.clear();
  state = 'off'; lastError = ''; lastSyncAt = ''; started = false; latestDb = null;
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (diffTimer) { clearTimeout(diffTimer); diffTimer = null; }
  readyPromise = Promise.resolve();
}

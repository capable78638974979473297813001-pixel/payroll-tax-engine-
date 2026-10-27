import { enqueueMeterEvent } from './billing.ts';
import {
  appendUsage,
  readDb,
  withDb,
  type DB,
  type KeyRecord,
  type SubscriptionRecord,
  type UsageBilling,
  type UsageBucket,
  type UsageEvent,
  type UsageKind,
} from './store.ts';

/**
 * Local usage records for the website dashboard.
 *
 * Every authenticated API call writes here, inside the site store
 * (SITE_DB_DIR), in the same transaction that queues a Stripe meter event.
 * The Stripe HTTP call happens later. A failed or skipped meter event does
 * not remove the row. Trial calls and other $0 calls are rows too.
 *
 * Counts:
 *   - requests: one per HTTP call
 *   - paychecks: one per paycheck calculated, which is what billing counts.
 *     A payroll run of N is one request and N paychecks.
 *
 * A client Idempotency-Key (or, absent that, the server request id) is
 * claimed in the same write. A retry does not append a second row and does
 * not queue a second meter event.
 */

/** How many idempotency receipts to keep. Older ones can be applied again. */
export const MAX_USAGE_RECEIPTS = Number(process.env.MAX_USAGE_RECEIPTS ?? 20_000);

const DAY_MS = 86_400_000;

export interface RecordUsageInput {
  keyHash: string;
  statusCode: number;
  error: string | null;
  checkDate: string | null;
  endpoint: string;
  requestId: string;
  /** Client Idempotency-Key. Falls back to requestId. */
  idempotencyKey: string | null;
  kind: UsageKind;
  /** Paycheck units on a success. Ignored when statusCode is not 200. */
  paychecks: number;
  matched?: boolean;
  /** Stripe customer to queue against, when this call should be metered. */
  meterCustomerId: string | null;
  /**
   * The caller already decided this account is on a metered subscription
   * and metering is configured. Trial accounts still pass true: the row is
   * labeled trial, and the meter event is queued because Stripe does not
   * bill usage inside the free-trial window.
   */
  wantMeter: boolean;
}

export interface BillingPeriod {
  start: string;
  end: string;
  trial: boolean;
  /** Stable bucket id. The trial start, or the monthly period start. */
  key: string;
}

interface Counts {
  requests: number;
  paychecks: number;
  errors: number;
}

/**
 * Trial usage is the window before trialEndsAt, while the subscription is
 * still trialing. An account Stripe has already moved to active is not a
 * trial, even if an old trial end is still on the record. A trialing
 * account whose end date has passed is not labeled trial either: the site
 * keeps status "trialing" until a webhook says otherwise, and the date is
 * what makes the usage $0.
 */
export function isTrial(sub: SubscriptionRecord | undefined, now = Date.now()): boolean {
  if (!sub || sub.status === 'cancelled' || sub.status === 'active') return false;
  if (!sub.trialStartsAt || !sub.trialEndsAt) return sub.status === 'trialing';
  const start = new Date(sub.trialStartsAt).getTime();
  const end = new Date(sub.trialEndsAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return sub.status === 'trialing';
  return now >= start && now < end;
}

function addMonths(anchor: Date, months: number): Date {
  const day = anchor.getUTCDate();
  const d = new Date(Date.UTC(
    anchor.getUTCFullYear(),
    anchor.getUTCMonth() + months,
    1,
    anchor.getUTCHours(),
    anchor.getUTCMinutes(),
    anchor.getUTCSeconds(),
    anchor.getUTCMilliseconds(),
  ));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

/** The billing window a call at `now` belongs to. */
export function billingPeriod(sub: SubscriptionRecord | undefined, now = Date.now()): BillingPeriod {
  if (isTrial(sub, now)) {
    const start = sub?.trialStartsAt ?? sub?.createdAt ?? new Date(now).toISOString();
    const end = sub?.trialEndsAt ?? new Date(now + 14 * DAY_MS).toISOString();
    return { start, end, trial: true, key: start };
  }
  const anchorIso = sub?.trialEndsAt ?? sub?.activatedAt ?? sub?.createdAt ?? null;
  if (!anchorIso) {
    const d = new Date(now);
    const startMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    const endMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    const start = new Date(startMs).toISOString();
    return { start, end: new Date(endMs).toISOString(), trial: false, key: start };
  }
  let start = new Date(anchorIso);
  if (Number.isNaN(start.getTime())) {
    start = new Date(now);
  }
  if (now < start.getTime()) {
    const prev = addMonths(start, -1);
    return { start: prev.toISOString(), end: start.toISOString(), trial: false, key: prev.toISOString() };
  }
  let next = addMonths(start, 1);
  for (let guard = 0; next.getTime() <= now && guard < 600; guard++) {
    start = next;
    next = addMonths(start, 1);
  }
  const startIso = start.toISOString();
  return { start: startIso, end: next.toISOString(), trial: false, key: startIso };
}

/** Paycheck units on one stored event. Legacy rows (no `paychecks`) count as one successful paycheck. */
export function eventPaychecks(event: UsageEvent): number {
  if (typeof event.paychecks === 'number') return event.paychecks;
  if (event.statusCode !== 200) return 0;
  if (event.kind === 'address' || event.kind === 'catalog') return 0;
  return 1;
}

function eventRequests(event: UsageEvent): number {
  return event.requests ?? 1;
}

function classify(sub: SubscriptionRecord | undefined, statusCode: number, paychecks: number, queued: boolean, now: number): UsageBilling {
  if (statusCode !== 200) return 'error';
  if (paychecks <= 0) return 'unbilled';
  if (isTrial(sub, now)) return 'trial';
  if (!queued) return 'unbilled';
  return 'metered';
}

function tally(events: UsageEvent[], pred: (event: UsageEvent) => boolean): Counts {
  const out: Counts = { requests: 0, paychecks: 0, errors: 0 };
  for (const event of events) {
    if (!pred(event)) continue;
    out.requests += eventRequests(event);
    out.paychecks += eventPaychecks(event);
    if (event.statusCode !== 200) out.errors += 1;
  }
  return out;
}

function bumpBucket(
  key: KeyRecord,
  field: 'dayUsage' | 'periodUsage',
  bucketKey: string,
  delta: Counts,
  mine: UsageEvent[],
  pred: (event: UsageEvent) => boolean,
  exceptRequestId: string,
): void {
  const current = key[field];
  if (!current || current.key !== bucketKey) {
    const seeded = tally(mine, (event) => event.requestId !== exceptRequestId && pred(event));
    const bucket: UsageBucket = {
      key: bucketKey,
      requests: seeded.requests + delta.requests,
      paychecks: seeded.paychecks + delta.paychecks,
      errors: seeded.errors + delta.errors,
    };
    key[field] = bucket;
    return;
  }
  current.requests += delta.requests;
  current.paychecks += delta.paychecks;
  current.errors += delta.errors;
}

function receiptId(keyHash: string, idempotencyKey: string): string {
  return `${keyHash}:${idempotencyKey}`;
}

/**
 * Append one usage row and, when this call is metered, queue one Stripe
 * meter event per paycheck. Both happen in one store write, before any
 * Stripe HTTP call. Returns recorded:false when this idempotency key was
 * already applied.
 */
export function recordAccountUsage(input: RecordUsageInput): { recorded: boolean } {
  return withDb((db) => {
    const at = new Date().toISOString();
    const now = new Date(at).getTime();
    const idem = (input.idempotencyKey || input.requestId).slice(0, 200);
    const id = receiptId(input.keyHash, idem);
    db.usageReceipts ??= [];
    if (db.usageReceipts.some((receipt) => receipt.id === id)) return { recorded: false };
    db.usageReceipts.push({ id, at });
    const overflow = db.usageReceipts.length - MAX_USAGE_RECEIPTS;
    if (overflow > 0) db.usageReceipts.splice(0, overflow);

    const paychecks = input.statusCode === 200 ? Math.max(0, Math.floor(input.paychecks)) : 0;
    const stored = db.keys[input.keyHash];
    const sub = stored ? db.subscriptions[stored.ownerEmail] : undefined;
    const queued = Boolean(input.wantMeter && input.meterCustomerId && paychecks > 0);
    const billing = classify(sub, input.statusCode, paychecks, queued, now);
    const event: UsageEvent = {
      keyHash: input.keyHash,
      at,
      statusCode: input.statusCode,
      error: input.error,
      checkDate: input.checkDate,
      kind: input.kind,
      endpoint: input.endpoint,
      requestId: input.requestId,
      paychecks,
      requests: 1,
      billing,
      ...(input.matched === undefined ? {} : { matched: input.matched }),
    };
    appendUsage(db, event);

    if (stored) {
      const mine = db.usage.filter((row) => row.keyHash === input.keyHash);
      const prior = (row: UsageEvent) => row.requestId !== input.requestId;
      stored.lastUsedAt = at;
      if (stored.totalRequests == null) {
        stored.totalRequests = mine.filter(prior).reduce((n, row) => n + eventRequests(row), 0);
      }
      stored.totalRequests += 1;
      if (input.statusCode === 200) {
        if (stored.totalCalls == null) {
          stored.totalCalls = mine.filter((row) => prior(row) && row.statusCode === 200).length;
        }
        stored.totalCalls += 1;
      }
      if (stored.totalPaychecks == null) {
        stored.totalPaychecks = mine.filter(prior).reduce((n, row) => n + eventPaychecks(row), 0);
      }
      stored.totalPaychecks += paychecks;
      if (stored.totalErrors == null) {
        stored.totalErrors = mine.filter((row) => prior(row) && row.statusCode !== 200).length;
      }
      if (input.statusCode !== 200) stored.totalErrors += 1;

      const delta: Counts = { requests: 1, paychecks, errors: input.statusCode === 200 ? 0 : 1 };
      const today = at.slice(0, 10);
      const period = billingPeriod(sub, now);
      bumpBucket(stored, 'dayUsage', today, delta, mine, (row) => row.at.slice(0, 10) === today, input.requestId);
      bumpBucket(
        stored,
        'periodUsage',
        period.key,
        delta,
        mine,
        (row) => {
          const t = new Date(row.at).getTime();
          return t >= new Date(period.start).getTime() && t < new Date(period.end).getTime();
        },
        input.requestId,
      );
    }

    if (queued && input.meterCustomerId) {
      for (let i = 0; i < paychecks; i++) {
        const identifier = paychecks === 1 ? input.requestId : `${input.requestId}:${i}`;
        enqueueMeterEvent(db, { customerId: input.meterCustomerId, identifier, at, value: 1 });
      }
    }
    return { recorded: true };
  });
}

function maskKey(prefix: string): string {
  return `${prefix}••••••••••••••••••••`;
}

function eventEndpoint(event: UsageEvent): string {
  if (event.endpoint) return event.endpoint;
  if (event.kind === 'address') return 'POST /v1/address';
  if (event.kind === 'payCalc') return 'POST /v1/payCalc';
  if (event.kind === 'payroll') return 'POST /v1/payroll/run';
  if (event.kind === 'catalog') return 'GET /v1/uniqueTaxIds';
  return 'POST /v1/paycheck';
}

function eventBilling(event: UsageEvent, sub: SubscriptionRecord | undefined): UsageBilling {
  if (event.billing) return event.billing;
  if (event.statusCode !== 200) return 'error';
  if (eventPaychecks(event) <= 0) return 'unbilled';
  if (isTrial(sub, new Date(event.at).getTime())) return 'trial';
  return 'unbilled';
}

function countsFromKey(
  key: KeyRecord,
  mine: UsageEvent[],
  bucket: UsageBucket | undefined,
  bucketKey: string,
  pred: (event: UsageEvent) => boolean,
): Counts {
  if (bucket && bucket.key === bucketKey) {
    return { requests: bucket.requests, paychecks: bucket.paychecks, errors: bucket.errors };
  }
  if (bucket) return { requests: 0, paychecks: 0, errors: 0 };
  return tally(mine, pred);
}

export interface DashboardUsage {
  hasKey: false;
}

export interface DashboardUsageReady {
  hasKey: true;
  keyPrefix: string;
  keyMasked: string;
  plan: string;
  issuedAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  totalCalls: number;
  callsToday: number;
  callsThisMonth: number;
  callsTodayOk: number;
  callsLast30: number;
  errorsLast30: number;
  errorRate: number;
  daily: { date: string; calls: number; paychecks: number; errors: number }[];
  billing: {
    paycheckCalculations: number;
    addressLookups: number;
    liveCalculations: number;
    liveAddressLookups: number;
    paychecksThisPeriod: number;
    trialPaychecks: number;
    unbilledPaychecks: number;
  };
  keys: {
    keyMasked: string;
    mode: 'live' | 'test';
    active: boolean;
    createdAt: string;
    expiresAt: string;
    lastUsedAt: string | null;
    totalCalls: number;
    totalPaychecks: number;
    totalRequests: number;
  }[];
  recent: {
    at: string;
    endpoint: string;
    statusCode: number;
    error: string | null;
    paychecks: number;
    requests: number;
    billing: UsageBilling;
    keyMasked: string;
    kind?: UsageKind;
    keyHash: string;
    checkDate: string | null;
  }[];
  today: { date: string; requests: number; paychecks: number; errors: number };
  period: {
    start: string;
    end: string;
    trial: boolean;
    requests: number;
    paychecks: number;
    errors: number;
    label: string;
  };
  allTime: { requests: number; paychecks: number; errors: number };
}

/**
 * The numbers GET /api/usage returns. Scoped to one account: another
 * account's keys are not included.
 */
export function dashboardUsage(db: DB, email: string, opts: { metering: boolean; now?: number }): DashboardUsage | DashboardUsageReady {
  const now = opts.now ?? Date.now();
  // Test keys are never billed and are not part of the account's usage.
  const ownKeys = Object.values(db.keys).filter((key) => key.ownerEmail === email && key.mode !== 'test');
  const active = ownKeys.find((key) => key.isActive);
  if (!active) return { hasKey: false };

  const ownHashes = new Set(ownKeys.map((key) => key.keyHash));
  const events = db.usage.filter((event) => ownHashes.has(event.keyHash));
  const activeEvents = events.filter((event) => event.keyHash === active.keyHash);
  const sub = db.subscriptions[email];
  const period = billingPeriod(sub, now);
  const today = new Date(now).toISOString().slice(0, 10);
  const dayAgo = now - DAY_MS;
  const monthAgo = now - 30 * DAY_MS;

  const byKey = new Map<string, UsageEvent[]>();
  for (const event of events) {
    const list = byKey.get(event.keyHash);
    if (list) list.push(event);
    else byKey.set(event.keyHash, [event]);
  }

  const todayCounts: Counts = { requests: 0, paychecks: 0, errors: 0 };
  const periodCounts: Counts = { requests: 0, paychecks: 0, errors: 0 };
  const allTime: Counts = { requests: 0, paychecks: 0, errors: 0 };
  for (const key of ownKeys) {
    const mine = byKey.get(key.keyHash) ?? [];
    if (key.totalRequests != null && key.totalPaychecks != null) {
      allTime.requests += key.totalRequests;
      allTime.paychecks += key.totalPaychecks;
      allTime.errors += key.totalErrors ?? mine.filter((event) => event.statusCode !== 200).length;
    } else {
      const scanned = tally(mine, () => true);
      allTime.requests += scanned.requests;
      allTime.paychecks += scanned.paychecks;
      allTime.errors += scanned.errors;
    }
    const day = countsFromKey(key, mine, key.dayUsage, today, (event) => event.at.slice(0, 10) === today);
    const per = countsFromKey(
      key,
      mine,
      key.periodUsage,
      period.key,
      (event) => {
        const t = new Date(event.at).getTime();
        return t >= new Date(period.start).getTime() && t < new Date(period.end).getTime();
      },
    );
    todayCounts.requests += day.requests;
    todayCounts.paychecks += day.paychecks;
    todayCounts.errors += day.errors;
    periodCounts.requests += per.requests;
    periodCounts.paychecks += per.paychecks;
    periodCounts.errors += per.errors;
  }

  const daily: DashboardUsageReady['daily'] = [];
  for (let i = 29; i >= 0; i--) daily.push({ date: new Date(now - i * DAY_MS).toISOString().slice(0, 10), calls: 0, paychecks: 0, errors: 0 });
  for (const event of events) {
    if (new Date(event.at).getTime() < monthAgo) continue;
    const bucket = daily.find((day) => day.date === event.at.slice(0, 10));
    if (!bucket) continue;
    const pay = eventPaychecks(event);
    if (event.statusCode === 200) {
      bucket.calls += pay;
      bucket.paychecks += pay;
    } else bucket.errors += 1;
  }

  let paycheckCalculations = 0;
  let addressLookups = 0;
  let trialPaychecks = 0;
  let unbilledPaychecks = 0;
  for (const event of events) {
    if (event.statusCode !== 200) continue;
    if (event.kind === 'address') {
      addressLookups += 1;
      continue;
    }
    const pay = eventPaychecks(event);
    paycheckCalculations += pay;
    const billing = eventBilling(event, sub);
    if (billing === 'trial') trialPaychecks += pay;
    else if (billing === 'unbilled') unbilledPaychecks += pay;
  }

  const callsLast30 = daily.reduce((n, day) => n + day.calls, 0);
  const errorsLast30 = daily.reduce((n, day) => n + day.errors, 0);
  const prefixByHash = new Map(ownKeys.map((key) => [key.keyHash, key.keyPrefix]));
  const recent = events
    .slice()
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 15)
    .map((event) => ({
      at: event.at,
      endpoint: eventEndpoint(event),
      statusCode: event.statusCode,
      error: event.error,
      paychecks: eventPaychecks(event),
      requests: eventRequests(event),
      billing: eventBilling(event, sub),
      keyMasked: maskKey(prefixByHash.get(event.keyHash) ?? ''),
      kind: event.kind,
      keyHash: event.keyHash,
      checkDate: event.checkDate,
    }));

  const meterReady = opts.metering && Boolean(sub?.stripeCustomerId && sub?.stripeSubscriptionId);
  const label = period.trial
    ? 'Trial — recorded, not billed'
    : meterReady
      ? 'This billing period'
      : 'Unbilled';

  return {
    hasKey: true,
    keyPrefix: active.keyPrefix,
    keyMasked: maskKey(active.keyPrefix),
    plan: active.plan,
    issuedAt: active.createdAt,
    expiresAt: active.expiresAt,
    lastUsedAt: active.lastUsedAt,
    totalCalls: active.totalCalls ?? activeEvents.length,
    callsToday: activeEvents.filter((event) => new Date(event.at).getTime() >= dayAgo).length,
    callsThisMonth: activeEvents.filter((event) => new Date(event.at).getTime() >= monthAgo).length,
    callsTodayOk: activeEvents.filter((event) => event.statusCode === 200 && new Date(event.at).getTime() >= dayAgo).length,
    callsLast30,
    errorsLast30,
    errorRate: callsLast30 + errorsLast30 ? errorsLast30 / (callsLast30 + errorsLast30) : 0,
    daily,
    billing: {
      paycheckCalculations,
      addressLookups,
      liveCalculations: paycheckCalculations,
      liveAddressLookups: addressLookups,
      paychecksThisPeriod: periodCounts.paychecks,
      trialPaychecks,
      unbilledPaychecks,
    },
    keys: ownKeys
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((key) => {
        const mine = byKey.get(key.keyHash) ?? [];
        const paychecks = key.totalPaychecks ?? mine.reduce((n, event) => n + eventPaychecks(event), 0);
        const requests = key.totalRequests ?? mine.reduce((n, event) => n + eventRequests(event), 0);
        return {
          keyMasked: maskKey(key.keyPrefix),
          mode: key.keyPrefix.startsWith('sk_live_') ? 'live' as const : 'test' as const,
          active: key.isActive,
          createdAt: key.createdAt,
          expiresAt: key.expiresAt,
          lastUsedAt: key.lastUsedAt,
          totalCalls: key.totalCalls ?? mine.filter((event) => event.statusCode === 200).length,
          totalPaychecks: paychecks,
          totalRequests: requests,
        };
      }),
    recent,
    today: { date: today, ...todayCounts },
    period: {
      start: period.start,
      end: period.end,
      trial: period.trial,
      ...periodCounts,
      label,
    },
    allTime,
  };
}

/** Read-only view used by tests and the usage route. */
export function usageForAccount(email: string, opts: { metering: boolean; now?: number }): DashboardUsage | DashboardUsageReady {
  return readDb((db) => dashboardUsage(db, email, opts));
}

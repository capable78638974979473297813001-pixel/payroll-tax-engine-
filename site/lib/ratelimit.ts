/**
 * A small in-memory, fixed-window rate limiter, keyed by API key.
 *
 * The marketing and the reference both promise "rate-limited per key";
 * this is what makes that true. It protects the engine from a runaway
 * integration or an abusive key without a database round-trip on every
 * call.
 *
 * Fixed window (per minute) rather than a token bucket, deliberately: it
 * is trivial to reason about, needs no background timer, and maps cleanly
 * onto the RateLimit-* response headers. State is per-process — fine for a
 * single instance; a multi-instance deployment would move this to a shared
 * store (Redis), which is a drop-in for the same interface.
 */

export interface RateLimitConfig {
  /** Requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  /** Requests left in the current window (0 when blocked). */
  remaining: number;
  /** Unix seconds at which the window resets. */
  resetAt: number;
  /** Seconds until reset — for the Retry-After header when blocked. */
  retryAfterSec: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  limit: Number(process.env.RATE_LIMIT_PER_MIN ?? 120),
  windowMs: 60_000,
};

interface Window {
  count: number;
  /** Window start, ms epoch. */
  start: number;
}

export class RateLimiter {
  private windows = new Map<string, Window>();
  private lastSweep = 0;
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig = DEFAULT_CONFIG) {
    this.config = config;
  }

  /** Record one hit for `key` and report whether it is allowed. */
  hit(key: string, now: number = Date.now()): RateLimitResult {
    this.maybeSweep(now);
    const { limit, windowMs } = this.config;

    let w = this.windows.get(key);
    if (!w || now - w.start >= windowMs) {
      w = { count: 0, start: now };
      this.windows.set(key, w);
    }

    const resetAtMs = w.start + windowMs;
    const resetAt = Math.ceil(resetAtMs / 1000);
    const retryAfterSec = Math.max(0, Math.ceil((resetAtMs - now) / 1000));

    if (w.count >= limit) {
      return { allowed: false, limit, remaining: 0, resetAt, retryAfterSec };
    }
    w.count += 1;
    return { allowed: true, limit, remaining: Math.max(0, limit - w.count), resetAt, retryAfterSec };
  }

  /** Drop windows that have fully elapsed, so the map can't grow forever. */
  private maybeSweep(now: number): void {
    if (now - this.lastSweep < this.config.windowMs) return;
    this.lastSweep = now;
    for (const [key, w] of this.windows) {
      if (now - w.start >= this.config.windowMs) this.windows.delete(key);
    }
  }

  /** Test seam. */
  reset(): void {
    this.windows.clear();
    this.lastSweep = 0;
  }
}

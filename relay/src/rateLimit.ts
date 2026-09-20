export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
}

/**
 * Sliding-window rate limiter keyed by an opaque token/id.
 * Pure helper — no I/O; pass `now` for deterministic tests.
 */
export class RateLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly hits = new Map<string, number[]>();

  constructor(options: RateLimiterOptions) {
    this.limit = options.limit;
    this.windowMs = options.windowMs;
  }

  allow(key: string, now = Date.now()): boolean {
    const cutoff = now - this.windowMs;
    const prev = this.hits.get(key) ?? [];
    const recent = prev.filter((t) => t > cutoff);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}

/** Default: 120 EVENT frames per token per minute (ICE-burst friendly). */
export const DEFAULT_EVENT_RATE_LIMIT = 120;
export const DEFAULT_EVENT_RATE_WINDOW_MS = 60_000;

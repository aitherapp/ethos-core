export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
}

/** Serializable sliding-window hit map (key → timestamps). */
export type RateLimiterSnapshot = Record<string, number[]>;

/**
 * Sliding-window rate limiter keyed by an opaque token/id.
 * Pure helper — no I/O; pass `now` for deterministic tests.
 * Callers (e.g. Durable Objects) persist via snapshot/restore across hibernation.
 */
export class RateLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly hits = new Map<string, number[]>();

  constructor(options: RateLimiterOptions) {
    this.limit = options.limit;
    this.windowMs = options.windowMs;
  }

  /** Pruned hit timestamps for one key (does not record). */
  private recentHits(key: string, now: number): number[] {
    const cutoff = now - this.windowMs;
    return (this.hits.get(key) ?? []).filter((t) => t > cutoff);
  }

  /**
   * Allow only if every key is under the limit; then record one hit on each.
   * Atomic across keys — rejecting one key records none.
   */
  allowAll(keys: string[], now = Date.now()): boolean {
    const next = new Map<string, number[]>();
    for (const key of keys) {
      const recent = this.recentHits(key, now);
      if (recent.length >= this.limit) {
        this.hits.set(key, recent);
        return false;
      }
      next.set(key, [...recent, now]);
    }
    for (const [key, timestamps] of next) {
      this.hits.set(key, timestamps);
    }
    return true;
  }

  allow(key: string, now = Date.now()): boolean {
    return this.allowAll([key], now);
  }

  /** Export pruned windows for Durable Object storage. */
  snapshot(now = Date.now()): RateLimiterSnapshot {
    const out: RateLimiterSnapshot = {};
    for (const key of this.hits.keys()) {
      const recent = this.recentHits(key, now);
      if (recent.length > 0) out[key] = recent;
      else this.hits.delete(key);
    }
    return out;
  }

  /** Replace in-memory state (e.g. after hibernation wake). */
  restore(data: RateLimiterSnapshot | null | undefined, now = Date.now()): void {
    this.hits.clear();
    if (!data || typeof data !== 'object') return;
    const cutoff = now - this.windowMs;
    for (const [key, timestamps] of Object.entries(data)) {
      if (!Array.isArray(timestamps)) continue;
      const recent = timestamps.filter((t): t is number => typeof t === 'number' && t > cutoff);
      if (recent.length > 0) this.hits.set(key, recent);
    }
  }
}

/** Default: 120 EVENT frames per key per minute (ICE-burst friendly). */
export const DEFAULT_EVENT_RATE_LIMIT = 120;
export const DEFAULT_EVENT_RATE_WINDOW_MS = 60_000;

/** DO storage key for RateLimiter snapshot (survives hibernation). */
export const RATE_LIMIT_STORAGE_KEY = 'rl:hits';

/** Mesh/token ceiling key (single-tenant DO = one owner token). */
export const RATE_KEY_TOKEN = 'token';

export function connectionRateKey(connectionId: string): string {
  return `conn:${connectionId}`;
}

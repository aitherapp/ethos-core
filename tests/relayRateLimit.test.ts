import { describe, it, expect } from 'vitest';
import {
  connectionRateKey,
  RATE_KEY_TOKEN,
  RateLimiter,
} from '../relay/src/rateLimit';

describe('RateLimiter', () => {
  it('allows up to limit then rejects within window', () => {
    const rl = new RateLimiter({ limit: 2, windowMs: 60_000 });
    expect(rl.allow('tok', 1000)).toBe(true);
    expect(rl.allow('tok', 1001)).toBe(true);
    expect(rl.allow('tok', 1002)).toBe(false);
  });

  it('allowAll is atomic across connection and token keys', () => {
    const rl = new RateLimiter({ limit: 1, windowMs: 60_000 });
    const connA = connectionRateKey('a');
    const connB = connectionRateKey('b');

    expect(rl.allowAll([connA, RATE_KEY_TOKEN], 1000)).toBe(true);
    // Same connection blocked
    expect(rl.allowAll([connA, RATE_KEY_TOKEN], 1001)).toBe(false);
    // Token ceiling blocks a different connection too
    expect(rl.allowAll([connB, RATE_KEY_TOKEN], 1002)).toBe(false);
  });

  it('allowAll does not record when any key is over limit', () => {
    const rl = new RateLimiter({ limit: 1, windowMs: 60_000 });
    expect(rl.allow('token', 1000)).toBe(true);
    expect(rl.allowAll(['conn:x', 'token'], 1001)).toBe(false);
    // conn:x must still have capacity (no partial record)
    expect(rl.allow('conn:x', 1002)).toBe(true);
  });

  it('snapshot/restore survives hibernation-style rebuild', () => {
    const rl = new RateLimiter({ limit: 2, windowMs: 60_000 });
    expect(rl.allow('token', 1000)).toBe(true);
    expect(rl.allow('token', 1001)).toBe(true);
    const snap = rl.snapshot(1002);

    const afterWake = new RateLimiter({ limit: 2, windowMs: 60_000 });
    afterWake.restore(snap, 1003);
    expect(afterWake.allow('token', 1004)).toBe(false);
  });

  it('restore drops timestamps outside the window', () => {
    const rl = new RateLimiter({ limit: 1, windowMs: 1000 });
    rl.restore({ token: [1000] }, 2500);
    expect(rl.allow('token', 2500)).toBe(true);
  });
});

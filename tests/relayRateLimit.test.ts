import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../relay/src/rateLimit';

describe('RateLimiter', () => {
  it('allows up to limit then rejects within window', () => {
    const rl = new RateLimiter({ limit: 2, windowMs: 60_000 });
    expect(rl.allow('tok', 1000)).toBe(true);
    expect(rl.allow('tok', 1001)).toBe(true);
    expect(rl.allow('tok', 1002)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  HANDSHAKE_BACKOFF_AFTER_RATE_LIMIT_MS,
  shouldResumeSignaling,
  shouldSendHandshakeNow,
} from '../src/lib/signalingResume';

describe('shouldResumeSignaling', () => {
  it('allows the first resume when lastResumeAt is undefined', () => {
    expect(shouldResumeSignaling(undefined, 10_000)).toBe(true);
  });

  it('blocks resume within the default 3000ms window', () => {
    expect(shouldResumeSignaling(10_000, 12_000)).toBe(false);
  });

  it('allows resume after the default window elapses', () => {
    expect(shouldResumeSignaling(10_000, 13_000)).toBe(true);
    expect(shouldResumeSignaling(10_000, 13_001)).toBe(true);
  });

  it('respects a custom minIntervalMs', () => {
    expect(shouldResumeSignaling(0, 500, 1000)).toBe(false);
    expect(shouldResumeSignaling(0, 1000, 1000)).toBe(true);
  });
});

describe('shouldSendHandshakeNow', () => {
  it('allows the first handshake when lastHandshakeAt is undefined', () => {
    expect(shouldSendHandshakeNow(undefined, 5_000)).toBe(true);
  });

  it('blocks handshake within the default 2000ms window', () => {
    expect(shouldSendHandshakeNow(20_000, 21_000)).toBe(false);
  });

  it('allows handshake after the default window elapses', () => {
    expect(shouldSendHandshakeNow(20_000, 22_000)).toBe(true);
  });

  it('respects a custom minIntervalMs', () => {
    expect(shouldSendHandshakeNow(100, 150, 100)).toBe(false);
    expect(shouldSendHandshakeNow(100, 200, 100)).toBe(true);
  });

  it('blocks while rate-limit backoffUntil is in the future', () => {
    const rateLimitedAt = 50_000;
    const backoffUntil = rateLimitedAt + HANDSHAKE_BACKOFF_AFTER_RATE_LIMIT_MS;
    expect(backoffUntil).toBe(60_000);
    expect(shouldSendHandshakeNow(undefined, 59_999, 2000, backoffUntil)).toBe(false);
    expect(shouldSendHandshakeNow(40_000, 59_999, 2000, backoffUntil)).toBe(false);
  });

  it('allows handshake once backoffUntil has passed (if interval also satisfied)', () => {
    const backoffUntil = 60_000;
    expect(shouldSendHandshakeNow(undefined, 60_000, 2000, backoffUntil)).toBe(true);
    expect(shouldSendHandshakeNow(58_001, 60_000, 2000, backoffUntil)).toBe(false);
    expect(shouldSendHandshakeNow(58_000, 60_000, 2000, backoffUntil)).toBe(true);
  });
});

describe('HANDSHAKE_BACKOFF_AFTER_RATE_LIMIT_MS', () => {
  it('is 10 seconds', () => {
    expect(HANDSHAKE_BACKOFF_AFTER_RATE_LIMIT_MS).toBe(10_000);
  });
});

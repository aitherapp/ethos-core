import { describe, it, expect } from 'vitest';
import {
  isAllowedRelayKind,
  isAcceptableEventSize,
  ALLOWED_RELAY_KINDS,
} from '../relay/src/kinds';

describe('relay kinds module', () => {
  it('exports allowlist with ETHOS signal and data kinds', () => {
    expect(ALLOWED_RELAY_KINDS.has(41002)).toBe(true);
    expect(ALLOWED_RELAY_KINDS.has(41003)).toBe(true);
    expect(ALLOWED_RELAY_KINDS.size).toBe(2);
  });

  it('isAllowedRelayKind mirrors allowlist', () => {
    expect(isAllowedRelayKind(41003)).toBe(true);
    expect(isAllowedRelayKind(99999)).toBe(false);
  });

  it('isAcceptableEventSize defaults to 65536 bytes', () => {
    expect(isAcceptableEventSize('a'.repeat(65536))).toBe(true);
    expect(isAcceptableEventSize('a'.repeat(65537))).toBe(false);
  });
});

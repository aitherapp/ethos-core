import { describe, it, expect } from 'vitest';
import { eventMatchesFilter, type NostrEvent } from '../relay/src/nostrRelay';

const base: NostrEvent = {
  id: 'abc',
  pubkey: 'pub1',
  created_at: 1000,
  kind: 41002,
  tags: [
    ['d', 'topic-x'],
    ['iv', 'iv1'],
  ],
  content: 'ciphertext',
  sig: 'sig',
};

describe('eventMatchesFilter', () => {
  it('matches ETHOS kinds + #d topic filter', () => {
    expect(eventMatchesFilter(base, { kinds: [41002], '#d': ['topic-x'], limit: 5 })).toBe(true);
    expect(eventMatchesFilter(base, { kinds: [41002], '#d': ['other'] })).toBe(false);
    expect(eventMatchesFilter(base, { kinds: [41003], '#d': ['topic-x'] })).toBe(false);
  });

  it('matches authors and ids when present', () => {
    expect(eventMatchesFilter(base, { ids: ['abc'] })).toBe(true);
    expect(eventMatchesFilter(base, { ids: ['nope'] })).toBe(false);
    expect(eventMatchesFilter(base, { authors: ['pub1'] })).toBe(true);
    expect(eventMatchesFilter(base, { authors: ['other'] })).toBe(false);
  });
});

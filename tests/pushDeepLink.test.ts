import { describe, it, expect } from 'vitest';
import { parseChatDeepLink } from '../src/lib/pushNotify';

describe('parseChatDeepLink', () => {
  it('parses chat deep-link hash', () => {
    expect(parseChatDeepLink('#/chat/peerABC/msg123')).toEqual({
      peerId: 'peerABC',
      messageId: 'msg123',
    });
  });

  it('returns null for other hashes', () => {
    expect(parseChatDeepLink('#/other')).toBeNull();
    expect(parseChatDeepLink('')).toBeNull();
  });
});

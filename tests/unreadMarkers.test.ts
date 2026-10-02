import { describe, expect, it } from 'vitest';
import type { SecureMessage } from '../src/types';
import {
  countUnread,
  firstUnreadMessageId,
  lastReadStorageKey,
} from '../src/lib/unreadMarkers';

function msg(partial: Partial<SecureMessage> & Pick<SecureMessage, 'id' | 'senderId' | 'receiverId' | 'timestamp'>): SecureMessage {
  return {
    type: 'text',
    content: 'hi',
    iv: '',
    ...partial,
  };
}

describe('unreadMarkers', () => {
  it('builds a stable localStorage key per identity', () => {
    expect(lastReadStorageKey('node-abc')).toBe('ethos_last_read_node-abc');
  });

  it('counts inbound non-group messages newer than lastRead', () => {
    const messages = [
      msg({ id: '1', senderId: 'peer', receiverId: 'me', timestamp: 100 }),
      msg({ id: '2', senderId: 'peer', receiverId: 'me', timestamp: 200 }),
      msg({ id: '3', senderId: 'me', receiverId: 'peer', timestamp: 300 }),
      msg({ id: '4', senderId: 'peer', receiverId: 'me', timestamp: 400 }),
      msg({ id: 'g', senderId: 'peer', receiverId: 'me', timestamp: 500, groupId: 'g1' }),
    ];
    expect(countUnread(messages, 'peer', 150, 'me')).toBe(2);
    expect(countUnread(messages, 'peer', 0, 'me')).toBe(3);
    expect(countUnread(messages, 'peer', 500, 'me')).toBe(0);
  });

  it('returns the first unread inbound message id in timestamp order', () => {
    const messages = [
      msg({ id: 'old', senderId: 'peer', receiverId: 'me', timestamp: 100 }),
      msg({ id: 'mine', senderId: 'me', receiverId: 'peer', timestamp: 250 }),
      msg({ id: 'new1', senderId: 'peer', receiverId: 'me', timestamp: 300 }),
      msg({ id: 'new2', senderId: 'peer', receiverId: 'me', timestamp: 400 }),
    ];
    expect(firstUnreadMessageId(messages, 'peer', 200, 'me')).toBe('new1');
    expect(firstUnreadMessageId(messages, 'peer', 400, 'me')).toBeNull();
    expect(firstUnreadMessageId(messages, 'peer', null, 'me')).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import {
  formatPushNotification,
  shouldSendRemotePush,
  buildNotificationData,
  resolveNotificationDeepLink,
} from '../src/lib/pushNotify';

describe('pushNotify', () => {
  it('formats Minimal / Sender / Preview', () => {
    expect(formatPushNotification('Minimal', 'Alice', 'hello world')).toEqual({
      title: 'ETHOS',
      body: 'New message',
    });
    expect(formatPushNotification('Sender', 'Alice', 'hello world')).toEqual({
      title: 'New chat from Alice',
      body: 'New message',
    });
    expect(formatPushNotification('Preview', 'Alice', 'hello world')).toEqual({
      title: 'New chat from Alice',
      body: 'hello world',
    });
  });

  it('truncates Preview body to 80 chars', () => {
    const long = 'x'.repeat(100);
    expect(formatPushNotification('Preview', 'A', long).body.length).toBe(80);
  });

  it('Background only sends when offline; Always always sends', () => {
    expect(
      shouldSendRemotePush({
        triggerMode: 'Background only',
        directConnected: false,
        relayConnected: false,
      })
    ).toBe(true);
    expect(
      shouldSendRemotePush({
        triggerMode: 'Background only',
        directConnected: true,
        relayConnected: false,
      })
    ).toBe(false);
    expect(
      shouldSendRemotePush({
        triggerMode: 'Always',
        directConnected: true,
        relayConnected: true,
      })
    ).toBe(true);
  });

  it('builds deep-link notification data', () => {
    expect(buildNotificationData({ peerId: 'p1', messageId: 'm1' })).toEqual({
      peerId: 'p1',
      messageId: 'm1',
      url: './#/chat/p1/m1',
    });
  });

  it('resolves deep link from payload fields or url hash', () => {
    expect(
      resolveNotificationDeepLink({ peerId: 'p1', messageId: 'm1' })
    ).toEqual({ peerId: 'p1', messageId: 'm1' });
    expect(
      resolveNotificationDeepLink({ url: './#/chat/peerABC/msg123' })
    ).toEqual({ peerId: 'peerABC', messageId: 'msg123' });
    expect(resolveNotificationDeepLink({ url: './' })).toBeNull();
  });
});

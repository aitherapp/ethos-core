import { describe, it, expect, vi } from 'vitest';
import {
  shouldSendPeerPush,
  buildPeerPushArgs,
  peerPushCallArgs,
  notifyPeerViaGateway,
  type NotifyPushProfile,
} from '../src/lib/peerPush';

const subscription: PushSubscriptionJSON = {
  endpoint: 'https://web.push.apple.com/sub-abc',
  keys: { p256dh: 'p256', auth: 'auth' },
};

function profile(overrides: Partial<NotifyPushProfile> = {}): NotifyPushProfile {
  return {
    pushGatewayUrl: 'https://gateway.example',
    pushAuthToken: 'secret-token',
    pushSubscription: subscription,
    pushContentMode: 'Sender',
    pushTriggerMode: 'Background only',
    ...overrides,
  };
}

describe('peerPush helpers', () => {
  it('sends push only when offline with an endpoint', () => {
    expect(
      shouldSendPeerPush({ hasPushEndpoint: true, directConnected: false, relayConnected: false })
    ).toBe(true);
    expect(
      shouldSendPeerPush({ hasPushEndpoint: true, directConnected: true, relayConnected: false })
    ).toBe(false);
    expect(
      shouldSendPeerPush({ hasPushEndpoint: true, directConnected: false, relayConnected: true })
    ).toBe(false);
    expect(
      shouldSendPeerPush({ hasPushEndpoint: false, directConnected: false, relayConnected: false })
    ).toBe(false);
  });

  it('builds generic push args without chat plaintext', () => {
    const args = buildPeerPushArgs('Alice');
    expect(args).toEqual({
      visitorId: 'Alice',
      pagePath: 'chat',
      messageText: 'New message',
    });
    expect(JSON.stringify(args)).not.toContain('secret plaintext');
  });

  it('peerPushCallArgs returns null when peer is reachable or has no endpoint', () => {
    expect(peerPushCallArgs('https://push.example/x', 'A', true, false)).toBeNull();
    expect(peerPushCallArgs('https://push.example/x', 'A', false, true)).toBeNull();
    expect(peerPushCallArgs(null, 'A', false, false)).toBeNull();
  });

  it('peerPushCallArgs returns generic args when offline with endpoint', () => {
    expect(peerPushCallArgs('https://push.example/x', 'A', false, false)).toEqual({
      endpoint: 'https://push.example/x',
      visitorId: 'A',
      pagePath: 'chat',
      messageText: 'New message',
    });
  });
});

describe('notifyPeerViaGateway', () => {
  it('POSTs to recipient gateway with Bearer auth, never to vendor endpoints', async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200 } as Response));

    const ok = await notifyPeerViaGateway(profile(), {
      senderName: 'Alice',
      previewText: 'hello world',
      localPeerId: 'local-peer',
      messageId: 'msg-1',
      directConnected: false,
      relayConnected: false,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://gateway.example/v1/push');
    expect(String(url)).not.toContain('web.push.apple.com');
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer secret-token',
      'Content-Type': 'application/json',
    });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.notification.title).toBe('New chat from Alice');
    expect(body.notification.body).toBe('New message');
    expect(body.notification.data).toEqual({
      peerId: 'local-peer',
      messageId: 'msg-1',
      url: './#/chat/local-peer/msg-1',
    });
    expect(body.subscription.endpoint).toBe(subscription.endpoint);
  });

  it('returns false and skips fetch when gateway profile is incomplete', async () => {
    const fetchFn = vi.fn();
    expect(
      await notifyPeerViaGateway(profile({ pushGatewayUrl: null }), {
        senderName: 'A',
        previewText: 'x',
        localPeerId: 'p',
        messageId: 'm',
        directConnected: false,
        relayConnected: false,
        fetchFn: fetchFn as unknown as typeof fetch,
      })
    ).toBe(false);
    expect(
      await notifyPeerViaGateway(null, {
        senderName: 'A',
        previewText: 'x',
        localPeerId: 'p',
        messageId: 'm',
        directConnected: false,
        relayConnected: false,
        fetchFn: fetchFn as unknown as typeof fetch,
      })
    ).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('skips remote push when Background only and peer is reachable', async () => {
    const fetchFn = vi.fn();
    const ok = await notifyPeerViaGateway(profile(), {
      senderName: 'Alice',
      previewText: 'hi',
      localPeerId: 'p',
      messageId: 'm',
      directConnected: true,
      relayConnected: false,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(ok).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('sends when trigger mode is Always even if peer is connected', async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200 } as Response));
    const ok = await notifyPeerViaGateway(profile({ pushTriggerMode: 'Always' }), {
      senderName: 'Alice',
      previewText: 'hi',
      localPeerId: 'p',
      messageId: 'm',
      directConnected: true,
      relayConnected: true,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

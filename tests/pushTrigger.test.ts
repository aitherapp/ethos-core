import { describe, it, expect, vi } from 'vitest';
import { sendDirectWebPush } from '../src/widget/pushTrigger';
import type { NotifyPushProfile } from '../src/lib/peerPush';

const subscription: PushSubscriptionJSON = {
  endpoint: 'https://web.push.apple.com/sub-abc',
  keys: { p256dh: 'p256', auth: 'auth' },
};

const gatewayProfile: NotifyPushProfile = {
  pushGatewayUrl: 'https://gateway.example',
  pushAuthToken: 'tok',
  pushSubscription: subscription,
  pushContentMode: 'Sender',
  pushTriggerMode: 'Always',
};

describe('Widget Direct Web Push (deprecated)', () => {
  it('should return false gracefully if no push profile is configured', async () => {
    const result = await sendDirectWebPush(null, 'Visitor #1', '/pricing', 'Hi');
    expect(result).toBe(false);
  });

  it('should send via recipient gateway with Bearer, never POST to vendor endpoints', async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, status: 201 } as Response));

    const result = await sendDirectWebPush(
      gatewayProfile,
      'Visitor #1234',
      '/marketplace',
      'Hello!',
      fetchFn as unknown as typeof fetch,
      { localPeerId: 'owner', messageId: 'm1', directConnected: false, relayConnected: false }
    );

    expect(result).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://gateway.example/v1/push');
    expect(String(url)).not.toContain('web.push.apple.com');
    expect(String(url)).not.toContain('push.apple.com');
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer tok',
    });
  });

  it('returns false for legacy string endpoint without calling fetch', async () => {
    const fetchFn = vi.fn();
    const result = await sendDirectWebPush(
      'https://web.push.apple.com/test' as unknown as NotifyPushProfile,
      'Visitor #1234',
      '/marketplace',
      'Hello!',
      fetchFn as unknown as typeof fetch
    );
    expect(result).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

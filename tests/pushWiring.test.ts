import { describe, it, expect, vi } from 'vitest';
import type { PushSettings } from '../src/lib/pushSettings';
import { setupPushFromSettings } from '../src/lib/pushPipeline';

const enabledSettings: PushSettings = {
  enabled: true,
  gatewayUrl: 'https://gw.example.com/',
  authToken: 'tok-123',
  contentMode: 'Preview',
  triggerMode: 'Always',
};

const disabledSettings: PushSettings = {
  ...enabledSettings,
  enabled: false,
};

const subJson: PushSubscriptionJSON = {
  endpoint: 'https://web.push.apple.com/abc',
  keys: { p256dh: 'p256', auth: 'auth' },
};

function fakeSubscription(json: PushSubscriptionJSON = subJson): PushSubscription {
  return {
    endpoint: json.endpoint!,
    toJSON: () => json,
  } as PushSubscription;
}

describe('setupPushFromSettings', () => {
  it('skips network when push is disabled', async () => {
    const deps = {
      fetchVapidPublicKey: vi.fn(),
      subscribeToWebPush: vi.fn(),
      registerPushSubscription: vi.fn(),
      setPushSubscription: vi.fn(),
      applyGatewayPrefs: vi.fn(),
    };

    const ok = await setupPushFromSettings(disabledSettings, deps);

    expect(ok).toBe(false);
    expect(deps.fetchVapidPublicKey).not.toHaveBeenCalled();
    expect(deps.subscribeToWebPush).not.toHaveBeenCalled();
    expect(deps.registerPushSubscription).not.toHaveBeenCalled();
    expect(deps.setPushSubscription).not.toHaveBeenCalled();
    expect(deps.applyGatewayPrefs).not.toHaveBeenCalled();
  });

  it('skips network when gateway URL is not HTTPS', async () => {
    const deps = {
      fetchVapidPublicKey: vi.fn(),
      subscribeToWebPush: vi.fn(),
      registerPushSubscription: vi.fn(),
      setPushSubscription: vi.fn(),
      applyGatewayPrefs: vi.fn(),
    };

    const ok = await setupPushFromSettings(
      { ...enabledSettings, gatewayUrl: 'http://insecure.example' },
      deps,
    );

    expect(ok).toBe(false);
    expect(deps.fetchVapidPublicKey).not.toHaveBeenCalled();
  });

  it('fetches VAPID, subscribes, registers, and stores on iroh', async () => {
    const subscription = fakeSubscription();
    const deps = {
      fetchVapidPublicKey: vi.fn(async () => 'vapid-public'),
      subscribeToWebPush: vi.fn(async () => subscription),
      registerPushSubscription: vi.fn(async () => true),
      setPushSubscription: vi.fn(),
      applyGatewayPrefs: vi.fn(),
    };

    const ok = await setupPushFromSettings(enabledSettings, deps);

    expect(ok).toBe(true);
    expect(deps.fetchVapidPublicKey).toHaveBeenCalledWith('https://gw.example.com/', expect.anything());
    expect(deps.subscribeToWebPush).toHaveBeenCalledWith('vapid-public');
    expect(deps.registerPushSubscription).toHaveBeenCalledWith(
      'https://gw.example.com/',
      'tok-123',
      subJson,
      expect.anything(),
    );
    expect(deps.setPushSubscription).toHaveBeenCalledWith(subscription);
    expect(deps.applyGatewayPrefs).toHaveBeenCalledWith({
      gatewayUrl: 'https://gw.example.com/',
      authToken: 'tok-123',
      contentMode: 'Preview',
      triggerMode: 'Always',
    });
  });

  it('returns false when subscribe fails', async () => {
    const deps = {
      fetchVapidPublicKey: vi.fn(async () => 'vapid-public'),
      subscribeToWebPush: vi.fn(async () => null),
      registerPushSubscription: vi.fn(),
      setPushSubscription: vi.fn(),
      applyGatewayPrefs: vi.fn(),
    };

    const ok = await setupPushFromSettings(enabledSettings, deps);

    expect(ok).toBe(false);
    expect(deps.registerPushSubscription).not.toHaveBeenCalled();
    expect(deps.setPushSubscription).not.toHaveBeenCalled();
  });

  it('returns false when register fails', async () => {
    const subscription = fakeSubscription();
    const deps = {
      fetchVapidPublicKey: vi.fn(async () => 'vapid-public'),
      subscribeToWebPush: vi.fn(async () => subscription),
      registerPushSubscription: vi.fn(async () => false),
      setPushSubscription: vi.fn(),
      applyGatewayPrefs: vi.fn(),
    };

    const ok = await setupPushFromSettings(enabledSettings, deps);

    expect(ok).toBe(false);
    expect(deps.setPushSubscription).not.toHaveBeenCalled();
    expect(deps.applyGatewayPrefs).not.toHaveBeenCalled();
  });
});

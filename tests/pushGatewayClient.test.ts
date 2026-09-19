import { describe, it, expect, vi } from 'vitest';
import {
  normalizeGatewayBaseUrl,
  fetchVapidPublicKey,
  registerPushSubscription,
  unregisterPushSubscription,
  sendViaPushGateway,
} from '../src/lib/pushGatewayClient';

const BASE = 'https://gw.example.com';
const TOKEN = 'secret-token';
const SUB: PushSubscriptionJSON = {
  endpoint: 'https://web.push.apple.com/abc',
  keys: { p256dh: 'p256', auth: 'auth' },
};

function mockFetch(ok: boolean, body: unknown, status = ok ? 200 : 500): typeof fetch {
  return vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  })) as unknown as typeof fetch;
}

describe('normalizeGatewayBaseUrl', () => {
  it('trims whitespace and strips trailing slash', () => {
    expect(normalizeGatewayBaseUrl('  https://gw.example/  ')).toBe('https://gw.example');
  });
});

describe('fetchVapidPublicKey', () => {
  it('GETs /v1/vapid-public-key and returns publicKey from JSON', async () => {
    const fetchFn = mockFetch(true, { publicKey: 'vapid-key-123' });
    const key = await fetchVapidPublicKey(BASE, fetchFn);
    expect(key).toBe('vapid-key-123');
    expect(fetchFn).toHaveBeenCalledWith(`${BASE}/v1/vapid-public-key`, expect.any(Object));
  });

  it('handles raw string response body', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => {
        throw new Error('not json');
      },
      text: async () => 'raw-vapid-key',
    })) as unknown as typeof fetch;
    const key = await fetchVapidPublicKey(BASE, fetchFn);
    expect(key).toBe('raw-vapid-key');
  });

  it('rejects http base URL without calling fetch', async () => {
    const fetchFn = mockFetch(true, { publicKey: 'x' });
    await expect(fetchVapidPublicKey('http://insecure.example', fetchFn)).rejects.toThrow();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('registerPushSubscription', () => {
  it('POSTs subscription with Bearer token', async () => {
    const fetchFn = mockFetch(true, {});
    const ok = await registerPushSubscription(BASE, TOKEN, SUB, fetchFn);
    expect(ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledWith(
      `${BASE}/v1/subscriptions`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ endpoint: SUB.endpoint, keys: SUB.keys }),
      }),
    );
  });

  it('returns false on non-OK response', async () => {
    const fetchFn = mockFetch(false, {});
    expect(await registerPushSubscription(BASE, TOKEN, SUB, fetchFn)).toBe(false);
  });

  it('rejects http base URL without calling fetch', async () => {
    const fetchFn = mockFetch(true, {});
    expect(await registerPushSubscription('http://bad', TOKEN, SUB, fetchFn)).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('unregisterPushSubscription', () => {
  it('DELETEs subscription with Bearer token', async () => {
    const fetchFn = mockFetch(true, {});
    const ok = await unregisterPushSubscription(BASE, TOKEN, SUB, fetchFn);
    expect(ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledWith(
      `${BASE}/v1/subscriptions`,
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ endpoint: SUB.endpoint, keys: SUB.keys }),
      }),
    );
  });

  it('returns false on non-OK response', async () => {
    const fetchFn = mockFetch(false, {});
    expect(await unregisterPushSubscription(BASE, TOKEN, SUB, fetchFn)).toBe(false);
  });

  it('rejects http base URL without calling fetch', async () => {
    const fetchFn = mockFetch(true, {});
    expect(await unregisterPushSubscription('http://bad', TOKEN, SUB, fetchFn)).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('sendViaPushGateway', () => {
  it('POSTs push payload with Bearer token', async () => {
    const fetchFn = mockFetch(true, {});
    const data = { peerId: 'p1', messageId: 'm1', url: './#/chat/p1/m1' };
    const result = await sendViaPushGateway({
      baseUrl: BASE,
      authToken: TOKEN,
      subscription: SUB,
      title: 'Title',
      body: 'Body',
      data,
      fetchFn,
    });
    expect(result).toEqual({ ok: true });
    expect(fetchFn).toHaveBeenCalledWith(
      `${BASE}/v1/push`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          subscription: { endpoint: SUB.endpoint, keys: SUB.keys },
          notification: { title: 'Title', body: 'Body', data },
        }),
      }),
    );
  });

  it('returns upstream details on non-OK JSON response', async () => {
    const fetchFn = mockFetch(false, { error: 'upstream_failed', status: 403 });
    const result = await sendViaPushGateway({
      baseUrl: BASE,
      authToken: TOKEN,
      subscription: SUB,
      title: 'T',
      body: 'B',
      data: {},
      fetchFn,
    });
    expect(result).toEqual({
      ok: false,
      status: 500,
      error: 'upstream_failed',
      upstreamStatus: 403,
    });
  });

  it('rejects http base URL without calling fetch', async () => {
    const fetchFn = mockFetch(true, {});
    const result = await sendViaPushGateway({
      baseUrl: 'http://bad',
      authToken: TOKEN,
      subscription: SUB,
      title: 'T',
      body: 'B',
      data: {},
      fetchFn,
    });
    expect(result.ok).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

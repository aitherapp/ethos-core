// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { urlBase64ToUint8Array, formatPushPayload, getOrCreateVapidPublicKey } from '../src/lib/webPush';

describe('Web Push Helper', () => {
  it('should convert URL-safe base64 string to Uint8Array', () => {
    const base64 = 'BC_m0vrB_test';
    const arr = urlBase64ToUint8Array(base64);
    expect(arr).toBeInstanceOf(Uint8Array);
    expect(arr.length).toBeGreaterThan(0);
  });

  it('should format push notification payload', () => {
    const payload = formatPushPayload('Visitor #3f1a', '/marketplace', 'Hello!');
    expect(payload.title).toBe('New chat from Visitor #3f1a');
    expect(payload.body).toContain('/marketplace');
    expect(payload.body).toContain('Hello!');
  });

  it('should generate or load VAPID public key string from localStorage', async () => {
    const key = await getOrCreateVapidPublicKey();
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(10);

    const reloadedKey = await getOrCreateVapidPublicKey();
    expect(reloadedKey).toBe(key);
  });
});

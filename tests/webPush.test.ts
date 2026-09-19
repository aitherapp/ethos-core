// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { urlBase64ToUint8Array, formatPushPayload, getOrCreateVapidPublicKey } from '../src/lib/webPush';

describe('Web Push Helper', () => {
  beforeEach(() => {
    localStorage.removeItem('ethos_vapid_public_key');
  });
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

  it('does not call Math.random when generating a VAPID public key', async () => {
    const spy = vi.spyOn(Math, 'random');
    await getOrCreateVapidPublicKey();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('falls back to getRandomValues when subtle.generateKey fails', async () => {
    localStorage.removeItem('ethos_vapid_public_key');
    const originalGenerateKey = crypto.subtle.generateKey.bind(crypto.subtle);
    const generateKeySpy = vi
      .spyOn(crypto.subtle, 'generateKey')
      .mockRejectedValue(new Error('subtle unavailable'));
    const getRandomSpy = vi.spyOn(crypto, 'getRandomValues');

    const key = await getOrCreateVapidPublicKey();

    expect(getRandomSpy).toHaveBeenCalled();
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(10);
    expect(key.startsWith('vapid_')).toBe(false);
    expect(Math.random).not.toBe(undefined); // sanity
    generateKeySpy.mockRestore();
    getRandomSpy.mockRestore();
    void originalGenerateKey;
  });

  it('throws when neither subtle nor getRandomValues can produce a key', async () => {
    localStorage.removeItem('ethos_vapid_public_key');
    const generateKeySpy = vi
      .spyOn(crypto.subtle, 'generateKey')
      .mockRejectedValue(new Error('fail'));
    const getRandomSpy = vi
      .spyOn(crypto, 'getRandomValues')
      .mockImplementation(() => {
        throw new Error('no entropy');
      });

    await expect(getOrCreateVapidPublicKey()).rejects.toThrow(/secure|entropy|random/i);

    generateKeySpy.mockRestore();
    getRandomSpy.mockRestore();
  });
});

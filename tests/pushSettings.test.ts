// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { loadPushSettings, savePushSettings, isHttpsGatewayUrl } from '../src/lib/pushSettings';

describe('pushSettings', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to disabled with safe defaults', () => {
    const s = loadPushSettings();
    expect(s.enabled).toBe(false);
    expect(s.gatewayUrl).toBe('');
    expect(s.authToken).toBe('');
    expect(s.contentMode).toBe('Sender');
    expect(s.triggerMode).toBe('Background only');
  });

  it('round-trips saved settings', () => {
    savePushSettings({
      enabled: true,
      gatewayUrl: 'https://example.com',
      authToken: 'tok',
      contentMode: 'Preview',
      triggerMode: 'Always',
    });
    expect(loadPushSettings()).toEqual({
      enabled: true,
      gatewayUrl: 'https://example.com',
      authToken: 'tok',
      contentMode: 'Preview',
      triggerMode: 'Always',
    });
  });

  it('accepts only https gateway URLs', () => {
    expect(isHttpsGatewayUrl('https://gw.example/')).toBe(true);
    expect(isHttpsGatewayUrl('http://gw.example/')).toBe(false);
    expect(isHttpsGatewayUrl('not-a-url')).toBe(false);
  });
});

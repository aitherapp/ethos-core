// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadPrivateRelaySettings,
  savePrivateRelaySettings,
  isWssRelayUrl,
  buildAuthedRelayUrl,
} from '../src/lib/privateRelaySettings';

describe('privateRelaySettings', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to disabled', () => {
    const s = loadPrivateRelaySettings();
    expect(s.enabled).toBe(false);
    expect(s.relayUrl).toBe('');
    expect(s.authToken).toBe('');
  });

  it('round-trips saved settings', () => {
    savePrivateRelaySettings({
      enabled: true,
      relayUrl: 'wss://relay.example.com',
      authToken: 'tok',
    });
    expect(loadPrivateRelaySettings()).toEqual({
      enabled: true,
      relayUrl: 'wss://relay.example.com',
      authToken: 'tok',
    });
  });

  it('accepts only wss relay URLs', () => {
    expect(isWssRelayUrl('wss://relay.example.com')).toBe(true);
    expect(isWssRelayUrl('ws://relay.example.com')).toBe(false);
    expect(isWssRelayUrl('https://relay.example.com')).toBe(false);
    expect(isWssRelayUrl('not-a-url')).toBe(false);
  });

  it('buildAuthedRelayUrl appends token query', () => {
    expect(buildAuthedRelayUrl('wss://relay.example.com/', 'secret')).toBe(
      'wss://relay.example.com/?token=secret'
    );
  });

  it('buildAuthedRelayUrl overwrites existing token', () => {
    expect(buildAuthedRelayUrl('wss://relay.example.com/?token=old', 'new')).toBe(
      'wss://relay.example.com/?token=new'
    );
  });
});

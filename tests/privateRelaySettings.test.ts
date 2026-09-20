// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadPrivateRelaySettings,
  savePrivateRelaySettings,
  isWssRelayUrl,
  buildAuthedRelayUrl,
  privateRelaySaveAction,
} from '../src/lib/privateRelaySettings';

describe('privateRelaySettings', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to disabled and not ready', () => {
    const s = loadPrivateRelaySettings();
    expect(s.enabled).toBe(false);
    expect(s.ready).toBe(false);
    expect(s.relayUrl).toBe('');
    expect(s.authToken).toBe('');
  });

  it('round-trips saved settings including ready', () => {
    savePrivateRelaySettings({
      enabled: true,
      ready: true,
      relayUrl: 'wss://relay.example.com',
      authToken: 'tok',
    });
    expect(loadPrivateRelaySettings()).toEqual({
      enabled: true,
      ready: true,
      relayUrl: 'wss://relay.example.com',
      authToken: 'tok',
    });
  });

  it('treats legacy saves without ready as not ready', () => {
    localStorage.setItem(
      'ethos_private_relay_settings',
      JSON.stringify({
        enabled: true,
        relayUrl: 'wss://relay.example.com',
        authToken: 'tok',
      })
    );
    expect(loadPrivateRelaySettings().ready).toBe(false);
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

  describe('privateRelaySaveAction', () => {
    it('does not apply when disabled', () => {
      expect(
        privateRelaySaveAction({
          enabled: false,
          ready: false,
          relayUrl: 'wss://relay.example.com',
          authToken: 'tok',
        })
      ).toEqual({ shouldApply: false });
    });

    it('errors when enabled but url or token invalid', () => {
      expect(
        privateRelaySaveAction({
          enabled: true,
          ready: false,
          relayUrl: 'https://not-wss.example',
          authToken: 'tok',
        })
      ).toEqual({ shouldApply: false, error: 'Private relay unavailable' });

      expect(
        privateRelaySaveAction({
          enabled: true,
          ready: false,
          relayUrl: 'wss://relay.example.com',
          authToken: '',
        })
      ).toEqual({ shouldApply: false, error: 'Private relay unavailable' });
    });

    it('applies when enabled with valid wss url and token', () => {
      expect(
        privateRelaySaveAction({
          enabled: true,
          ready: false,
          relayUrl: 'wss://relay.example.com',
          authToken: 'tok',
        })
      ).toEqual({ shouldApply: true });
    });
  });
});

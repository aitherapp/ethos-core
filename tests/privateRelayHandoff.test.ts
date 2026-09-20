import { describe, it, expect } from 'vitest';
import {
  parsePrivateRelayHandoff,
  planPrivateRelaySwitch,
  planOwnerPrivateRelayApply,
  shouldAutoRetryPrivateRelay,
  buildPrivateRelayHandshakeFields,
  dedupeRelays,
  relayUpdateMode,
} from '../src/lib/privateRelayHandoff';

describe('privateRelayHandoff', () => {
  it('parses valid handoff fields', () => {
    expect(
      parsePrivateRelayHandoff({
        relayUrl: 'wss://r.example',
        relayAuthToken: 'tok',
      })
    ).toEqual({ relayUrl: 'wss://r.example', relayAuthToken: 'tok' });
  });

  it('rejects missing or non-wss handoff', () => {
    expect(parsePrivateRelayHandoff({})).toBeNull();
    expect(
      parsePrivateRelayHandoff({
        relayUrl: 'https://r.example',
        relayAuthToken: 'tok',
      })
    ).toBeNull();
  });

  it('plans private-only list on successful peer handoff connect', () => {
    const r = planPrivateRelaySwitch({
      relayUrl: 'wss://r.example',
      authToken: 'tok',
      connectSucceeded: true,
    });
    expect(r).toEqual({
      ok: true,
      relays: ['wss://r.example/?token=tok'],
    });
  });

  it('stays on bootstrap when connect fails', () => {
    const r = planPrivateRelaySwitch({
      relayUrl: 'wss://r.example',
      authToken: 'tok',
      connectSucceeded: false,
    });
    expect(r).toEqual({
      ok: false,
      status: 'Private relay unavailable',
      relaysUnchanged: true,
    });
  });

  it('owner apply builds dual-homed list (defaults + authed private)', () => {
    const r = planOwnerPrivateRelayApply({
      relayUrl: 'wss://r.example',
      authToken: 'tok',
      connectSucceeded: true,
      defaultRelays: [
        'wss://nos.lol',
        'wss://relay.primal.net',
        'wss://nostr.mom',
      ],
    });
    expect(r).toEqual({
      ok: true,
      relays: [
        'wss://nos.lol',
        'wss://relay.primal.net',
        'wss://nostr.mom',
        'wss://r.example/?token=tok',
      ],
    });
  });

  it('owner apply dedupes when private already in defaults', () => {
    const authed = 'wss://r.example/?token=tok';
    const r = planOwnerPrivateRelayApply({
      relayUrl: 'wss://r.example',
      authToken: 'tok',
      connectSucceeded: true,
      defaultRelays: [authed, 'wss://nos.lol'],
    });
    expect(r).toEqual({
      ok: true,
      relays: [authed, 'wss://nos.lol'],
    });
  });

  it('owner apply fails without changing relays', () => {
    expect(
      planOwnerPrivateRelayApply({
        relayUrl: 'wss://r.example',
        authToken: 'tok',
        connectSucceeded: false,
        defaultRelays: ['wss://nos.lol'],
      })
    ).toEqual({
      ok: false,
      status: 'Private relay unavailable',
      relaysUnchanged: true,
    });
  });

  it('dedupeRelays preserves first occurrence order', () => {
    expect(dedupeRelays(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c']);
  });

  it('relayUpdateMode soft-updates mid-session without reconnect', () => {
    expect(relayUpdateMode(false)).toBe('noop');
    expect(relayUpdateMode(true)).toBe('reconnect');
    expect(relayUpdateMode(true, { soft: true })).toBe('soft');
    expect(relayUpdateMode(false, { soft: true })).toBe('noop');
  });

  it('never auto-retries', () => {
    expect(shouldAutoRetryPrivateRelay()).toBe(false);
  });

  it('handshake fields empty when not ready/active', () => {
    expect(
      buildPrivateRelayHandshakeFields({
        enabled: true,
        ready: false,
        relayUrl: 'wss://r.example',
        authToken: 'tok',
      })
    ).toEqual({});
    expect(
      buildPrivateRelayHandshakeFields({
        enabled: false,
        ready: true,
        relayUrl: 'wss://r.example',
        authToken: 'tok',
      })
    ).toEqual({});
  });

  it('builds handshake fields only when enabled and ready', () => {
    expect(
      buildPrivateRelayHandshakeFields({
        enabled: true,
        ready: true,
        relayUrl: 'wss://r.example',
        authToken: 'tok',
      })
    ).toEqual({ relayUrl: 'wss://r.example', relayAuthToken: 'tok' });
  });
});

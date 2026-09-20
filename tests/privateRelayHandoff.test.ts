import { describe, it, expect } from 'vitest';
import {
  parsePrivateRelayHandoff,
  planPrivateRelaySwitch,
  shouldAutoRetryPrivateRelay,
  buildPrivateRelayHandshakeFields,
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

  it('plans private-only list on successful connect', () => {
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

  it('never auto-retries', () => {
    expect(shouldAutoRetryPrivateRelay()).toBe(false);
  });

  it('builds handshake fields only when enabled', () => {
    expect(
      buildPrivateRelayHandshakeFields({
        enabled: false,
        relayUrl: 'wss://r.example',
        authToken: 'tok',
      })
    ).toEqual({});
    expect(
      buildPrivateRelayHandshakeFields({
        enabled: true,
        relayUrl: 'wss://r.example',
        authToken: 'tok',
      })
    ).toEqual({ relayUrl: 'wss://r.example', relayAuthToken: 'tok' });
  });
});

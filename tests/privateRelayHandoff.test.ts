import { describe, it, expect } from 'vitest';
import {
  parsePrivateRelayHandoff,
  planPrivateRelaySwitch,
  planOwnerPrivateRelayApply,
  shouldAutoRetryPrivateRelay,
  buildPrivateRelayHandshakeFields,
  dedupeRelays,
  relayUpdateMode,
  nostrSubscriptionKey,
  parseNostrSubscriptionKey,
  relaysRemovedFromList,
  subscriptionKeysToClearForRebind,
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

  it('parses subscription keys with colon-bearing topic ids', () => {
    const peerId = 'abc123';
    const dataKey = nostrSubscriptionKey(41003, `${peerId}:data`);
    expect(dataKey).toBe('41003:abc123:data');
    expect(parseNostrSubscriptionKey(dataKey)).toEqual({
      kind: 41003,
      topicId: 'abc123:data',
    });
    expect(parseNostrSubscriptionKey('not-a-key')).toBeNull();
  });

  it('lists relays removed when shrinking to private-only', () => {
    expect(
      relaysRemovedFromList(
        ['wss://nos.lol', 'wss://relay.primal.net', 'wss://private/?token=t'],
        ['wss://private/?token=t']
      )
    ).toEqual(['wss://nos.lol', 'wss://relay.primal.net']);
    expect(relaysRemovedFromList(['wss://a'], ['wss://a', 'wss://b'])).toEqual([]);
  });

  it('subscriptionKeysToClearForRebind keeps peer topics and active peer ticket subs', () => {
    const peerId = 'ownerpeer';
    const ticket = 'remotepeer';
    const keys = subscriptionKeysToClearForRebind({
      activeKeys: [
        nostrSubscriptionKey(41002, peerId),
        nostrSubscriptionKey(41003, `${peerId}:data`),
        nostrSubscriptionKey(41002, ticket),
      ],
      peerId,
      signalKind: 41002,
      relayDataKind: 41003,
      buildDataTopic: (id) => `${id}:data`,
    });
    expect(keys.sort()).toEqual(
      [
        '41002:ownerpeer',
        '41003:ownerpeer:data',
        '41002:remotepeer',
      ].sort()
    );
  });

  it('subscriptionKeysToClearForRebind seeds own topics when active set is empty', () => {
    expect(
      subscriptionKeysToClearForRebind({
        activeKeys: [],
        peerId: 'me',
        signalKind: 41002,
        relayDataKind: 41003,
        buildDataTopic: (id) => `${id}:data`,
      }).sort()
    ).toEqual(['41002:me', '41003:me:data'].sort());
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

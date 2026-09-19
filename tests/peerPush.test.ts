import { describe, it, expect } from 'vitest';
import { shouldSendPeerPush, buildPeerPushArgs, peerPushCallArgs } from '../src/lib/peerPush';

describe('peerPush helpers', () => {
  it('sends push only when offline with an endpoint', () => {
    expect(
      shouldSendPeerPush({ hasPushEndpoint: true, directConnected: false, relayConnected: false })
    ).toBe(true);
    expect(
      shouldSendPeerPush({ hasPushEndpoint: true, directConnected: true, relayConnected: false })
    ).toBe(false);
    expect(
      shouldSendPeerPush({ hasPushEndpoint: true, directConnected: false, relayConnected: true })
    ).toBe(false);
    expect(
      shouldSendPeerPush({ hasPushEndpoint: false, directConnected: false, relayConnected: false })
    ).toBe(false);
  });

  it('builds generic push args without chat plaintext', () => {
    const args = buildPeerPushArgs('Alice');
    expect(args).toEqual({
      visitorId: 'Alice',
      pagePath: 'chat',
      messageText: 'New message',
    });
    expect(JSON.stringify(args)).not.toContain('secret plaintext');
  });

  it('peerPushCallArgs returns null when peer is reachable or has no endpoint', () => {
    expect(peerPushCallArgs('https://push.example/x', 'A', true, false)).toBeNull();
    expect(peerPushCallArgs('https://push.example/x', 'A', false, true)).toBeNull();
    expect(peerPushCallArgs(null, 'A', false, false)).toBeNull();
  });

  it('peerPushCallArgs returns generic args when offline with endpoint', () => {
    expect(peerPushCallArgs('https://push.example/x', 'A', false, false)).toEqual({
      endpoint: 'https://push.example/x',
      visitorId: 'A',
      pagePath: 'chat',
      messageText: 'New message',
    });
  });
});

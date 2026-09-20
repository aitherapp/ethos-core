import { describe, expect, it } from 'vitest';
import {
  findPeerIdByDisplayQuery,
  forgetRemovedPeer,
  mergeDiscoveredPeers,
  rememberRemovedPeer,
  removePeerFromList,
} from '../src/lib/peerList';

describe('peer list helpers', () => {
  it('removes all instances of a peer from the list', () => {
    expect(removePeerFromList(['peer-a', 'peer-b', 'peer-a'], 'peer-a')).toEqual(['peer-b']);
  });

  it('leaves other peers in their current order', () => {
    expect(removePeerFromList(['peer-a', 'peer-b', 'peer-c'], 'peer-b')).toEqual(['peer-a', 'peer-c']);
  });

  it('does not re-add intentionally removed peers when merging discovery', () => {
    expect(mergeDiscoveredPeers(
      ['nisse'],
      ['nisse', 'visitor-bd0f', 'visitor-aa8f'],
      ['visitor-bd0f', 'visitor-aa8f'],
    )).toEqual(['nisse']);
  });

  it('tracks removed peers and clears them when the user reconnects', () => {
    const removed = rememberRemovedPeer(['old'], 'nisse');
    expect(removed).toEqual(['old', 'nisse']);
    expect(forgetRemovedPeer(removed, 'nisse')).toEqual(['old']);
  });

  it('resolves visitor short tags like #aa8f back to a known peer id', () => {
    const entries = [
      { peerId: 'peer-nisse', displayName: 'nisse' },
      { peerId: 'peer-visitor-aa8f', displayName: 'Visitor #aa8f (/pricing)' },
      { peerId: 'peer-visitor-bd0f', displayName: 'Visitor #bd0f (/)' },
    ];
    expect(findPeerIdByDisplayQuery('#aa8f', entries)).toBe('peer-visitor-aa8f');
    expect(findPeerIdByDisplayQuery('aa8f', entries)).toBe('peer-visitor-aa8f');
    expect(findPeerIdByDisplayQuery('Visitor #aa8f', entries)).toBe('peer-visitor-aa8f');
  });

  it('returns null when a visitor short tag is ambiguous or unknown', () => {
    expect(findPeerIdByDisplayQuery('#aa8f', [
      { peerId: 'a', displayName: 'Visitor #aa8f (/a)' },
      { peerId: 'b', displayName: 'Visitor #aa8f (/b)' },
    ])).toBeNull();
    expect(findPeerIdByDisplayQuery('#ffff', [
      { peerId: 'a', displayName: 'Visitor #aa8f (/a)' },
    ])).toBeNull();
  });
});

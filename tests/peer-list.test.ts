import { describe, expect, it } from 'vitest';
import {
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
});

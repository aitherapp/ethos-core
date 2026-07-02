import { describe, expect, it } from 'vitest';
import { removePeerFromList } from '../src/lib/peerList';

describe('peer list helpers', () => {
  it('removes all instances of a peer from the list', () => {
    expect(removePeerFromList(['peer-a', 'peer-b', 'peer-a'], 'peer-a')).toEqual(['peer-b']);
  });

  it('leaves other peers in their current order', () => {
    expect(removePeerFromList(['peer-a', 'peer-b', 'peer-c'], 'peer-b')).toEqual(['peer-a', 'peer-c']);
  });
});

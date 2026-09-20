export function removePeerFromList(peers: string[], peerId: string) {
  return peers.filter(peer => peer !== peerId);
}

export function rememberRemovedPeer(removedPeers: string[], peerId: string) {
  return removedPeers.includes(peerId) ? removedPeers : [...removedPeers, peerId];
}

export function forgetRemovedPeer(removedPeers: string[], peerId: string) {
  return removedPeers.filter(id => id !== peerId);
}

export function mergeDiscoveredPeers(
  knownPeers: string[],
  discovered: string[],
  removedPeers: string[] = [],
) {
  const removed = new Set(removedPeers);
  return [...new Set([
    ...knownPeers,
    ...discovered.filter(id => !removed.has(id)),
  ])];
}

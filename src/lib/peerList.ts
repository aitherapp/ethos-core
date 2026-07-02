export function removePeerFromList(peers: string[], peerId: string) {
  return peers.filter(peer => peer !== peerId);
}

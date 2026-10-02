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

/** Match "#aa8f", "aa8f", or "Visitor #aa8f" against stored contact labels. */
export function findPeerIdByDisplayQuery(
  query: string,
  entries: Array<{ peerId: string; displayName?: string | null }>,
): string | null {
  const raw = query.trim().toLowerCase();
  if (!raw) return null;

  const visitorTag = raw.match(/^(?:visitor\s*)?#?([a-f0-9]{4})$/i)?.[1]?.toLowerCase();

  const matches = entries.filter(({ displayName }) => {
    const name = (displayName || '').toLowerCase();
    if (!name) return false;
    if (name === raw || name.startsWith(`${raw} (`)) return true;
    if (visitorTag && (name.includes(`#${visitorTag}`) || name.startsWith(`visitor #${visitorTag}`))) {
      return true;
    }
    return false;
  });

  if (matches.length === 1) return matches[0].peerId;

  if (matches.length > 1 && visitorTag) {
    const exact = matches.filter(({ displayName }) =>
      (displayName || '').toLowerCase().startsWith(`visitor #${visitorTag}`)
    );
    if (exact.length === 1) return exact[0].peerId;
  }

  return null;
}

import type { SecureMessage } from '../types';

export function lastReadStorageKey(identityId: string): string {
  return `ethos_last_read_${identityId}`;
}

export type LastReadMap = Record<string, number>;

export function loadLastReadMap(identityId: string): LastReadMap {
  if (!identityId || typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(lastReadStorageKey(identityId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as LastReadMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveLastRead(identityId: string, peerId: string, ts: number): LastReadMap {
  const map = loadLastReadMap(identityId);
  map[peerId] = ts;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(lastReadStorageKey(identityId), JSON.stringify(map));
  }
  return map;
}

function isInboundPeerMessage(
  m: SecureMessage,
  peerId: string,
  selfId: string
): boolean {
  return (
    !m.groupId &&
    m.senderId === peerId &&
    m.receiverId === selfId &&
    m.type !== 'reaction'
  );
}

export function countUnread(
  messages: SecureMessage[],
  peerId: string,
  lastReadTs: number,
  selfId: string
): number {
  return messages.filter(
    (m) => isInboundPeerMessage(m, peerId, selfId) && m.timestamp > lastReadTs
  ).length;
}

export function firstUnreadMessageId(
  messages: SecureMessage[],
  peerId: string,
  lastReadTs: number | null | undefined,
  selfId: string
): string | null {
  if (lastReadTs == null) return null;
  const sorted = messages
    .filter((m) => isInboundPeerMessage(m, peerId, selfId) && m.timestamp > lastReadTs)
    .sort((a, b) => a.timestamp - b.timestamp);
  return sorted[0]?.id ?? null;
}

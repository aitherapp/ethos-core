/** Cache key used by the service worker + app to survive iOS PWA start_url opens. */
export const DEEP_LINK_STASH_CACHE = 'ethos-deeplink-v1';
export const DEEP_LINK_STASH_URL = './__ethos_pending_deeplink';

export type StashedDeepLink = {
  peerId: string;
  messageId: string;
  ts: number;
};

export function isFreshDeepLink(link: StashedDeepLink, now = Date.now(), maxAgeMs = 5 * 60 * 1000): boolean {
  return Boolean(link.peerId && link.messageId && now - link.ts <= maxAgeMs);
}

export async function stashChatDeepLink(
  link: { peerId?: string; messageId?: string },
  cachesApi: CacheStorage | undefined = typeof caches !== 'undefined' ? caches : undefined,
): Promise<boolean> {
  if (!cachesApi || !link.peerId || !link.messageId) return false;
  const payload: StashedDeepLink = {
    peerId: link.peerId,
    messageId: link.messageId,
    ts: Date.now(),
  };
  const cache = await cachesApi.open(DEEP_LINK_STASH_CACHE);
  await cache.put(
    DEEP_LINK_STASH_URL,
    new Response(JSON.stringify(payload), {
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  return true;
}

export async function consumeStashedChatDeepLink(
  cachesApi: CacheStorage | undefined = typeof caches !== 'undefined' ? caches : undefined,
): Promise<StashedDeepLink | null> {
  if (!cachesApi) return null;
  const cache = await cachesApi.open(DEEP_LINK_STASH_CACHE);
  const res = await cache.match(DEEP_LINK_STASH_URL);
  if (!res) return null;
  await cache.delete(DEEP_LINK_STASH_URL);
  try {
    const parsed = (await res.json()) as StashedDeepLink;
    if (!isFreshDeepLink(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

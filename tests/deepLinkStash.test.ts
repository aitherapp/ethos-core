import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  consumeStashedChatDeepLink,
  isFreshDeepLink,
  stashChatDeepLink,
} from '../src/lib/deepLinkStash';

function memoryCaches(): CacheStorage {
  const store = new Map<string, Map<string, Response>>();
  return {
    async open(name: string) {
      if (!store.has(name)) store.set(name, new Map());
      const bucket = store.get(name)!;
      return {
        async put(request: RequestInfo, response: Response) {
          const key = typeof request === 'string' ? request : request.url;
          bucket.set(key, response);
        },
        async match(request: RequestInfo) {
          const key = typeof request === 'string' ? request : request.url;
          return bucket.get(key);
        },
        async delete(request: RequestInfo) {
          const key = typeof request === 'string' ? request : request.url;
          return bucket.delete(key);
        },
      } as Cache;
    },
  } as CacheStorage;
}

describe('deepLinkStash', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('round-trips a fresh deep link through Cache Storage', async () => {
    const cachesApi = memoryCaches();
    await stashChatDeepLink({ peerId: 'p1', messageId: 'm1' }, cachesApi);
    await expect(consumeStashedChatDeepLink(cachesApi)).resolves.toMatchObject({
      peerId: 'p1',
      messageId: 'm1',
    });
    await expect(consumeStashedChatDeepLink(cachesApi)).resolves.toBeNull();
  });

  it('rejects stale stashes', () => {
    expect(
      isFreshDeepLink({ peerId: 'p', messageId: 'm', ts: Date.now() - 10 * 60 * 1000 })
    ).toBe(false);
  });
});

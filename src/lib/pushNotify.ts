import type { PushContentMode, PushTriggerMode } from './pushSettings';

/** SW → client message type when a push arrives (soft-resume wake). */
export const ETHOS_PUSH_WAKE = 'ethos_push_wake';

export function formatWakePushNotification(): { title: string; body: string } {
  return { title: 'ETHOS', body: 'Incoming connection…' };
}

export function formatPushNotification(
  mode: PushContentMode,
  senderName: string,
  previewText: string
): { title: string; body: string } {
  if (mode === 'Minimal') {
    return { title: 'ETHOS', body: 'New message' };
  }
  const title = `New chat from ${senderName}`;
  if (mode === 'Preview') {
    return { title, body: previewText.slice(0, 80) };
  }
  return { title, body: 'New message' };
}

export function shouldSendRemotePush(opts: {
  triggerMode: PushTriggerMode;
  directConnected: boolean;
  relayConnected: boolean;
}): boolean {
  if (opts.triggerMode === 'Always') {
    return true;
  }
  // Background only: skip push only when a live direct tunnel is up.
  // A stale "relay connected" flag must not suppress mobile wake-ups.
  void opts.relayConnected;
  return !opts.directConnected;
}

export function buildNotificationData(opts: {
  peerId: string;
  messageId: string;
}): { peerId: string; messageId: string; url: string } {
  const { peerId, messageId } = opts;
  return {
    peerId,
    messageId,
    url: `./#/chat/${peerId}/${messageId}`,
  };
}

const CHAT_DEEP_LINK = /^#\/chat\/([^/]+)\/([^/]+)$/;

export function parseChatDeepLink(hash: string): { peerId: string; messageId: string } | null {
  const match = CHAT_DEEP_LINK.exec(hash);
  if (!match) return null;
  return { peerId: match[1], messageId: match[2] };
}

/** Synthetic id used when waking a peer before ciphertext exists. */
export function isWakePlaceholderMessageId(messageId: string): boolean {
  return messageId.startsWith('widget-wake-') || messageId.startsWith('peer-wake-');
}

/** Resolve peer/message from SW notification payload or a deep-link URL/hash. */
export function resolveNotificationDeepLink(input: {
  peerId?: string;
  messageId?: string;
  url?: string;
  hash?: string;
}): { peerId: string; messageId: string } | null {
  if (input.peerId && input.messageId) {
    return { peerId: input.peerId, messageId: input.messageId };
  }
  const hash =
    input.hash ||
    (input.url
      ? (() => {
          try {
            return new URL(input.url, 'https://ethos.local/').hash;
          } catch {
            return '';
          }
        })()
      : '');
  return parseChatDeepLink(hash);
}

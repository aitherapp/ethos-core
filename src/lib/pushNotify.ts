import type { PushContentMode, PushTriggerMode } from './pushSettings';

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
  return !opts.directConnected && !opts.relayConnected;
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

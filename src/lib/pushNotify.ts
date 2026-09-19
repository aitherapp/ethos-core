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

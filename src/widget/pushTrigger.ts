import { notifyPeerViaGateway, type NotifyPushProfile } from '../lib/peerPush';

function isNotifyPushProfile(value: unknown): value is NotifyPushProfile {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @deprecated Prefer `notifyPeerViaGateway`. Legacy vendor POSTs are removed;
 * this wrapper only forwards when a gateway profile is present.
 */
export async function sendDirectWebPush(
  profile: NotifyPushProfile | null,
  visitorId: string,
  _pagePath: string,
  messageText: string,
  fetchFn: typeof fetch = fetch,
  extras: {
    localPeerId?: string;
    messageId?: string;
    directConnected?: boolean;
    relayConnected?: boolean;
  } = {}
): Promise<boolean> {
  if (!isNotifyPushProfile(profile)) return false;

  return notifyPeerViaGateway(profile, {
    senderName: visitorId,
    previewText: messageText,
    localPeerId: extras.localPeerId ?? 'widget',
    messageId: extras.messageId ?? `widget-${Date.now()}`,
    directConnected: extras.directConnected ?? false,
    relayConnected: extras.relayConnected ?? false,
    fetchFn,
  });
}

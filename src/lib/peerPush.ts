import {
  buildNotificationData,
  formatPushNotification,
  shouldSendRemotePush,
} from './pushNotify';
import { sendViaPushGateway } from './pushGatewayClient';
import type { PushContentMode, PushTriggerMode } from './pushSettings';

export type NotifyPushProfile = {
  pushGatewayUrl: string | null;
  pushAuthToken: string | null;
  pushSubscription: PushSubscriptionJSON | null;
  pushContentMode?: PushContentMode;
  pushTriggerMode?: PushTriggerMode;
};

export function shouldSendPeerPush(opts: {
  hasPushEndpoint: boolean;
  directConnected: boolean;
  relayConnected: boolean;
}): boolean {
  void opts.relayConnected;
  return opts.hasPushEndpoint && !opts.directConnected;
}

export function buildPeerPushArgs(senderName: string): {
  visitorId: string;
  pagePath: string;
  messageText: string;
} {
  return {
    visitorId: senderName,
    pagePath: 'chat',
    messageText: 'New message',
  };
}

export function peerPushCallArgs(
  endpoint: string | null | undefined,
  senderName: string,
  directConnected: boolean,
  relayConnected: boolean
): { endpoint: string; visitorId: string; pagePath: string; messageText: string } | null {
  if (
    !shouldSendPeerPush({
      hasPushEndpoint: Boolean(endpoint),
      directConnected,
      relayConnected,
    })
  ) {
    return null;
  }
  return { endpoint: endpoint as string, ...buildPeerPushArgs(senderName) };
}

export async function notifyPeerViaGateway(
  profile: NotifyPushProfile | null | undefined,
  opts: {
    senderName: string;
    previewText: string;
    localPeerId: string;
    messageId: string;
    directConnected: boolean;
    relayConnected: boolean;
    fetchFn?: typeof fetch;
  }
): Promise<boolean> {
  if (!profile?.pushGatewayUrl || !profile.pushAuthToken || !profile.pushSubscription) {
    return false;
  }
  if (
    !shouldSendRemotePush({
      triggerMode: profile.pushTriggerMode ?? 'Background only',
      directConnected: opts.directConnected,
      relayConnected: opts.relayConnected,
    })
  ) {
    return false;
  }

  const { title, body } = formatPushNotification(
    profile.pushContentMode ?? 'Sender',
    opts.senderName,
    opts.previewText
  );

  const result = await sendViaPushGateway({
    baseUrl: profile.pushGatewayUrl,
    authToken: profile.pushAuthToken,
    subscription: profile.pushSubscription,
    title,
    body,
    data: buildNotificationData({ peerId: opts.localPeerId, messageId: opts.messageId }),
    fetchFn: opts.fetchFn,
  });
  return result.ok;
}

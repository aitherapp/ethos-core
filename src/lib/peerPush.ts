export function shouldSendPeerPush(opts: {
  hasPushEndpoint: boolean;
  directConnected: boolean;
  relayConnected: boolean;
}): boolean {
  return opts.hasPushEndpoint && !opts.directConnected && !opts.relayConnected;
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

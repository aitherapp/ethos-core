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

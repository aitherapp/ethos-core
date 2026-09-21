export type PeerSendPlan =
  | { action: 'send-now' }
  | { action: 'wake-and-wait' }
  | { action: 'queue' };

export function planPeerSendAction(opts: {
  transportUsable: boolean;
  hasPushProfile: boolean;
}): PeerSendPlan {
  if (opts.transportUsable) {
    return { action: 'send-now' };
  }
  if (opts.hasPushProfile) {
    return { action: 'wake-and-wait' };
  }
  return { action: 'queue' };
}

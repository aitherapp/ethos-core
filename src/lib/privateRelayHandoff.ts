import {
  buildAuthedRelayUrl,
  isWssRelayUrl,
  type PrivateRelaySettings,
} from './privateRelaySettings';

export type PrivateRelayHandoffFields = {
  relayUrl: string;
  relayAuthToken: string;
};

export type PrivateRelaySwitchResult =
  | { ok: true; relays: string[] }
  | { ok: false; status: 'Private relay unavailable'; relaysUnchanged: true };

export type SetRelaysOpts = { soft?: boolean };

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function dedupeRelays(relays: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const relay of relays) {
    if (seen.has(relay)) continue;
    seen.add(relay);
    out.push(relay);
  }
  return out;
}

/** Soft mid-session pool updates avoid wipe-reconnect; hard for Reset / manual edits. */
export function relayUpdateMode(
  hasPeerId: boolean,
  opts?: SetRelaysOpts
): 'noop' | 'soft' | 'reconnect' {
  if (!hasPeerId) return 'noop';
  if (opts?.soft) return 'soft';
  return 'reconnect';
}

/** Subscription bookkeeping key used by listenOnNostr (`${kind}:${topicId}`). */
export function nostrSubscriptionKey(kind: number, topicId: string): string {
  return `${kind}:${topicId}`;
}

/**
 * Parse a subscription key back into kind + topic.
 * Topic ids may contain colons (e.g. `${peerId}:data`), so only the first `:` splits.
 */
export function parseNostrSubscriptionKey(
  key: string
): { kind: number; topicId: string } | null {
  const idx = key.indexOf(':');
  if (idx <= 0) return null;
  const kind = Number(key.slice(0, idx));
  const topicId = key.slice(idx + 1);
  if (!Number.isFinite(kind) || !topicId) return null;
  return { kind, topicId };
}

/** Relays present in `previous` but absent from `next` (stale sockets to close). */
export function relaysRemovedFromList(
  previous: readonly string[],
  next: readonly string[]
): string[] {
  const nextSet = new Set(next);
  return previous.filter((url) => !nextSet.has(url));
}

/**
 * Keys to clear + re-subscribe after a soft relay list change.
 * Preserves every currently active topic and always includes own peer signal + data topics.
 */
export function subscriptionKeysToClearForRebind(opts: {
  activeKeys: Iterable<string>;
  peerId: string | null;
  signalKind: number;
  relayDataKind: number;
  buildDataTopic: (peerId: string) => string;
}): string[] {
  const keys = new Set<string>();
  for (const key of opts.activeKeys) {
    if (key) keys.add(key);
  }
  if (opts.peerId) {
    keys.add(nostrSubscriptionKey(opts.signalKind, opts.peerId));
    keys.add(
      nostrSubscriptionKey(opts.relayDataKind, opts.buildDataTopic(opts.peerId))
    );
  }
  return [...keys];
}

export function parsePrivateRelayHandoff(
  signal: Record<string, unknown>
): PrivateRelayHandoffFields | null {
  const relayUrl = signal.relayUrl;
  const relayAuthToken = signal.relayAuthToken;
  if (!nonEmptyString(relayUrl) || !nonEmptyString(relayAuthToken)) {
    return null;
  }
  if (!isWssRelayUrl(relayUrl)) {
    return null;
  }
  return { relayUrl, relayAuthToken };
}

/** Peer handoff success → private-only pool. */
export function planPrivateRelaySwitch(opts: {
  relayUrl: string;
  authToken: string;
  connectSucceeded: boolean;
}): PrivateRelaySwitchResult {
  if (opts.connectSucceeded) {
    return {
      ok: true,
      relays: [buildAuthedRelayUrl(opts.relayUrl, opts.authToken)],
    };
  }
  return {
    ok: false,
    status: 'Private relay unavailable',
    relaysUnchanged: true,
  };
}

/**
 * Owner Settings apply success → dual-homed (public defaults + authed private)
 * so peers can still bootstrap on public Nostr before handoff.
 */
export function planOwnerPrivateRelayApply(opts: {
  relayUrl: string;
  authToken: string;
  connectSucceeded: boolean;
  defaultRelays: readonly string[];
}): PrivateRelaySwitchResult {
  if (opts.connectSucceeded) {
    return {
      ok: true,
      relays: dedupeRelays([
        ...opts.defaultRelays,
        buildAuthedRelayUrl(opts.relayUrl, opts.authToken),
      ]),
    };
  }
  return {
    ok: false,
    status: 'Private relay unavailable',
    relaysUnchanged: true,
  };
}

export function shouldAutoRetryPrivateRelay(): false {
  return false;
}

/** Advertise credentials only after a successful apply (`ready`). */
export function buildPrivateRelayHandshakeFields(
  settings: PrivateRelaySettings
): Record<string, string> {
  if (!settings.enabled || !settings.ready) {
    return {};
  }
  if (
    !nonEmptyString(settings.relayUrl) ||
    !nonEmptyString(settings.authToken) ||
    !isWssRelayUrl(settings.relayUrl)
  ) {
    return {};
  }
  return {
    relayUrl: settings.relayUrl,
    relayAuthToken: settings.authToken,
  };
}

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

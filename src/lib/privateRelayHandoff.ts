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

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
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

export function shouldAutoRetryPrivateRelay(): false {
  return false;
}

export function buildPrivateRelayHandshakeFields(
  settings: PrivateRelaySettings
): Record<string, string> {
  if (!settings.enabled) {
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

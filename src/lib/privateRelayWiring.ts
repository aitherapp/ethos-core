import {
  planOwnerPrivateRelayApply,
  planPrivateRelaySwitch,
  type PrivateRelayHandoffFields,
  type PrivateRelaySwitchResult,
  type SetRelaysOpts,
} from './privateRelayHandoff';
import {
  buildAuthedRelayUrl,
  isWssRelayUrl,
  type PrivateRelaySettings,
} from './privateRelaySettings';

export type ApplyPrivateRelayDeps = {
  setRelays: (relays: string[], opts?: SetRelaysOpts) => void;
  notifyStatus: (
    type: 'info' | 'error' | 'warning',
    message: string
  ) => void;
};

export type AttemptPrivateRelayDeps = ApplyPrivateRelayDeps & {
  probeConnect: (authedUrl: string) => Promise<boolean>;
};

export type AttemptOwnerPrivateRelayDeps = AttemptPrivateRelayDeps & {
  defaultRelays: readonly string[];
};

export function mergeSignalHandshakeFields(
  pushFields: Record<string, unknown>,
  privateRelayFields: Record<string, string>
): Record<string, unknown> {
  return { ...pushFields, ...privateRelayFields };
}

export function applyPrivateRelaySwitchResult(
  result: PrivateRelaySwitchResult,
  deps: ApplyPrivateRelayDeps
): boolean {
  if (result.ok === false) {
    deps.notifyStatus('warning', result.status);
    return false;
  }
  // Soft update preserves bootstrap session secrets/handshake mid-switch.
  deps.setRelays(result.relays, { soft: true });
  return true;
}

export async function attemptPrivateRelayFromHandoff(
  handoff: PrivateRelayHandoffFields,
  deps: AttemptPrivateRelayDeps
): Promise<boolean> {
  const authedUrl = buildAuthedRelayUrl(
    handoff.relayUrl,
    handoff.relayAuthToken
  );
  const connectSucceeded = await deps.probeConnect(authedUrl);
  const result = planPrivateRelaySwitch({
    relayUrl: handoff.relayUrl,
    authToken: handoff.relayAuthToken,
    connectSucceeded,
  });
  return applyPrivateRelaySwitchResult(result, deps);
}

/**
 * Owner Settings apply: probe first, then dual-homed pool (defaults + private).
 * Does not require `ready` — that flag is set by the caller after success.
 */
export async function attemptPrivateRelayFromSettings(
  settings: PrivateRelaySettings,
  deps: AttemptOwnerPrivateRelayDeps
): Promise<boolean> {
  if (!settings.enabled) {
    return false;
  }
  if (!isWssRelayUrl(settings.relayUrl) || !settings.authToken) {
    return false;
  }
  const connectSucceeded = await deps.probeConnect(
    buildAuthedRelayUrl(settings.relayUrl, settings.authToken)
  );
  const result = planOwnerPrivateRelayApply({
    relayUrl: settings.relayUrl,
    authToken: settings.authToken,
    connectSucceeded,
    defaultRelays: deps.defaultRelays,
  });
  return applyPrivateRelaySwitchResult(result, deps);
}

export function clearedPrivateRelaySettings(): PrivateRelaySettings {
  return { enabled: false, ready: false, relayUrl: '', authToken: '' };
}

/** Disable path: drop ready/advertise and restore public defaults. */
export function disabledPrivateRelaySettings(
  settings: PrivateRelaySettings
): PrivateRelaySettings {
  return {
    ...settings,
    enabled: false,
    ready: false,
  };
}

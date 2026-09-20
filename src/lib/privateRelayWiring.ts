import {
  buildPrivateRelayHandshakeFields,
  planPrivateRelaySwitch,
  type PrivateRelayHandoffFields,
  type PrivateRelaySwitchResult,
} from './privateRelayHandoff';
import {
  buildAuthedRelayUrl,
  type PrivateRelaySettings,
} from './privateRelaySettings';

export type ApplyPrivateRelayDeps = {
  setRelays: (relays: string[]) => void;
  notifyStatus: (
    type: 'info' | 'error' | 'warning',
    message: string
  ) => void;
};

export type AttemptPrivateRelayDeps = ApplyPrivateRelayDeps & {
  probeConnect: (authedUrl: string) => Promise<boolean>;
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
  deps.setRelays(result.relays);
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

export async function attemptPrivateRelayFromSettings(
  settings: PrivateRelaySettings,
  deps: AttemptPrivateRelayDeps
): Promise<boolean> {
  const fields = buildPrivateRelayHandshakeFields(settings);
  if (!fields.relayUrl || !fields.relayAuthToken) {
    return false;
  }
  return attemptPrivateRelayFromHandoff(
    {
      relayUrl: fields.relayUrl,
      relayAuthToken: fields.relayAuthToken,
    },
    deps
  );
}

export function clearedPrivateRelaySettings(): PrivateRelaySettings {
  return { enabled: false, relayUrl: '', authToken: '' };
}

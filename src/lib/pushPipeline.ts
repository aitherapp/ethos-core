import type { PushContentMode, PushSettings, PushTriggerMode } from './pushSettings';
import { isHttpsGatewayUrl } from './pushSettings';
import {
  fetchVapidPublicKey,
  registerPushSubscription,
} from './pushGatewayClient';
import { subscribeToWebPush } from './webPush';
import { iroh } from './iroh';

export interface PushGatewayPrefs {
  gatewayUrl: string;
  authToken: string;
  contentMode: PushContentMode;
  triggerMode: PushTriggerMode;
}

export interface SetupPushDeps {
  fetchVapidPublicKey: (
    baseUrl: string,
    fetchFn?: typeof fetch,
  ) => Promise<string>;
  subscribeToWebPush: (publicKeyBase64: string) => Promise<PushSubscription | null>;
  registerPushSubscription: (
    baseUrl: string,
    authToken: string,
    subscription: PushSubscriptionJSON,
    fetchFn?: typeof fetch,
  ) => Promise<boolean>;
  setPushSubscription: (subscription: PushSubscription | null) => void;
  applyGatewayPrefs: (prefs: PushGatewayPrefs) => void;
  fetchFn?: typeof fetch;
}

/**
 * Testable orchestration: validate settings → VAPID → subscribe → register → store on Iroh.
 * Returns false when disabled, invalid URL, or any step fails (fail closed).
 */
export async function setupPushFromSettings(
  settings: PushSettings,
  deps: SetupPushDeps,
): Promise<boolean> {
  if (!settings.enabled) {
    return false;
  }
  if (!isHttpsGatewayUrl(settings.gatewayUrl)) {
    return false;
  }

  const fetchFn = deps.fetchFn ?? fetch;

  let vapidKey: string;
  try {
    vapidKey = await deps.fetchVapidPublicKey(settings.gatewayUrl, fetchFn);
  } catch {
    return false;
  }

  const subscription = await deps.subscribeToWebPush(vapidKey);
  if (!subscription) {
    return false;
  }

  const subJson = subscription.toJSON();
  const registered = await deps.registerPushSubscription(
    settings.gatewayUrl,
    settings.authToken,
    subJson,
    fetchFn,
  );
  if (!registered) {
    return false;
  }

  deps.setPushSubscription(subscription);
  deps.applyGatewayPrefs({
    gatewayUrl: settings.gatewayUrl,
    authToken: settings.authToken,
    contentMode: settings.contentMode,
    triggerMode: settings.triggerMode,
  });
  return true;
}

/**
 * Loads settings from storage (caller may pass pre-loaded) via enable path:
 * wire real deps against the shared IrohManager singleton.
 */
export async function enablePushPipeline(
  settings: PushSettings,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  const ok = await setupPushFromSettings(settings, {
    fetchVapidPublicKey,
    // Reuse an existing browser subscription when possible. Replacing on every
    // page load invalidates the endpoint peers already stored from handshake.
    subscribeToWebPush: (key) => subscribeToWebPush(key, { replaceExisting: false }),
    registerPushSubscription,
    setPushSubscription: (sub) => iroh.setPushSubscription(sub),
    applyGatewayPrefs: (prefs) => iroh.applyPushGatewayPrefs(prefs),
    fetchFn,
  });
  if (ok) {
    iroh.rebroadcastPushProfile();
  }
  return ok;
}

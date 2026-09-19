/**
 * Builds an encrypted Web Push request (RFC 8291 + VAPID).
 * Isolated so tests can mock send without exercising crypto when unavailable.
 */
import { buildPushPayload } from '@block65/webcrypto-web-push';

export type WebPushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export type WebPushNotification = {
  title: string;
  body: string;
  data?: unknown;
};

export type VapidConfig = {
  subject: string;
  publicKey: string;
  privateKey: string;
};

export type BuiltWebPushRequest = {
  endpoint: string;
  init: RequestInit;
};

/**
 * Construct headers + encrypted body for fetch(endpoint, init).
 * Never logs notification content or keys.
 */
export async function buildWebPushRequest(
  subscription: WebPushSubscription,
  notification: WebPushNotification,
  vapid: VapidConfig,
): Promise<BuiltWebPushRequest> {
  const payloadJson = JSON.stringify({
    title: notification.title,
    body: notification.body,
    data: notification.data ?? {},
  });

  const init = await buildPushPayload(
    {
      data: payloadJson,
      options: { ttl: 60 },
    },
    {
      endpoint: subscription.endpoint,
      expirationTime: null,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    },
    {
      subject: vapid.subject,
      publicKey: vapid.publicKey,
      privateKey: vapid.privateKey,
    },
  );

  return {
    endpoint: subscription.endpoint,
    init,
  };
}

/**
 * Send a previously built Web Push request. Inject fetch for tests.
 */
export async function sendWebPushRequest(
  built: BuiltWebPushRequest,
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  return fetchFn(built.endpoint, built.init);
}

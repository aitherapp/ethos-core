import { isHttpsGatewayUrl } from './pushSettings';

export function normalizeGatewayBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function subscriptionPayload(subscription: PushSubscriptionJSON): {
  endpoint: string;
  keys: PushSubscriptionJSON['keys'];
} {
  return { endpoint: subscription.endpoint!, keys: subscription.keys };
}

async function parseVapidPublicKey(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as { publicKey?: string };
    if (parsed.publicKey) {
      return parsed.publicKey;
    }
  } catch {
    // fall through to raw string
  }
  return text;
}

export async function fetchVapidPublicKey(
  baseUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const base = normalizeGatewayBaseUrl(baseUrl);
  if (!isHttpsGatewayUrl(base)) {
    throw new Error('Push gateway URL must use HTTPS');
  }
  const res = await fetchFn(`${base}/v1/vapid-public-key`, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`Failed to fetch VAPID public key: ${res.status}`);
  }
  return parseVapidPublicKey(res);
}

export async function registerPushSubscription(
  baseUrl: string,
  authToken: string,
  subscription: PushSubscriptionJSON,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  const base = normalizeGatewayBaseUrl(baseUrl);
  if (!isHttpsGatewayUrl(base)) {
    return false;
  }
  const res = await fetchFn(`${base}/v1/subscriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(subscriptionPayload(subscription)),
  });
  return res.ok;
}

export async function unregisterPushSubscription(
  baseUrl: string,
  authToken: string,
  subscription: PushSubscriptionJSON,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  const base = normalizeGatewayBaseUrl(baseUrl);
  if (!isHttpsGatewayUrl(base)) {
    return false;
  }
  if (!subscription.endpoint || !subscription.keys) {
    return false;
  }
  const res = await fetchFn(`${base}/v1/subscriptions`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(subscriptionPayload(subscription)),
  });
  return res.ok;
}

export async function sendViaPushGateway(opts: {
  baseUrl: string;
  authToken: string;
  subscription: PushSubscriptionJSON;
  title: string;
  body: string;
  data: Record<string, string>;
  fetchFn?: typeof fetch;
}): Promise<boolean> {
  const fetchFn = opts.fetchFn ?? fetch;
  const base = normalizeGatewayBaseUrl(opts.baseUrl);
  if (!isHttpsGatewayUrl(base)) {
    return false;
  }
  const res = await fetchFn(`${base}/v1/push`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subscription: subscriptionPayload(opts.subscription),
      notification: {
        title: opts.title,
        body: opts.body,
        data: opts.data,
      },
    }),
  });
  return res.ok;
}

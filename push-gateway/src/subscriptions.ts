import { isAllowedPushEndpointHost } from './allowlist';

export const MAX_TITLE_LEN = 100;
export const MAX_BODY_LEN = 200;
/** Max serialized JSON length for notification.data (bytes / UTF-16 code units). */
export const MAX_NOTIFICATION_DATA_JSON_LEN = 2048;
export const MAX_SUBSCRIPTIONS_PER_TOKEN = 20;
/** Subscription TTL in seconds (180 days). */
export const SUBSCRIPTION_TTL_SECONDS = 180 * 24 * 60 * 60;
export const MAX_PUSHES_PER_MINUTE = 30;

export type PushKeys = { p256dh: string; auth: string };

export type SubscriptionRecord = {
  endpoint: string;
  keys: PushKeys;
  updatedAt: string;
};

export type ValidationResult =
  | { ok: true; endpoint: string; keys: PushKeys }
  | { ok: false; error: string };

export type PushValidationResult =
  | {
      ok: true;
      endpoint: string;
      keys: PushKeys;
      notification: { title: string; body: string; data?: unknown };
    }
  | { ok: false; error: string };

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * KV key for a subscription under a token namespace: sub:{tokenHash}:{endpointHash}
 */
export async function subscriptionKvKey(authToken: string, endpoint: string): Promise<string> {
  const enc = new TextEncoder();
  const tokenDigest = await crypto.subtle.digest('SHA-256', enc.encode(authToken));
  const endpointDigest = await crypto.subtle.digest('SHA-256', enc.encode(endpoint));
  return `sub:${toHex(tokenDigest).slice(0, 16)}:${toHex(endpointDigest)}`;
}

/** Index key listing endpoint hashes for a token (for cap enforcement). */
export async function subscriptionIndexKey(authToken: string): Promise<string> {
  const enc = new TextEncoder();
  const tokenDigest = await crypto.subtle.digest('SHA-256', enc.encode(authToken));
  return `idx:${toHex(tokenDigest).slice(0, 16)}`;
}

export async function rateLimitKey(authToken: string, windowMinute: number): Promise<string> {
  const enc = new TextEncoder();
  const tokenDigest = await crypto.subtle.digest('SHA-256', enc.encode(authToken));
  return `rl:${toHex(tokenDigest).slice(0, 16)}:${windowMinute}`;
}

/** Per registered endpoint (same token namespace), same window as token rate limit. */
export async function endpointRateLimitKey(
  authToken: string,
  endpoint: string,
  windowMinute: number,
): Promise<string> {
  const enc = new TextEncoder();
  const tokenDigest = await crypto.subtle.digest('SHA-256', enc.encode(authToken));
  const endpointDigest = await crypto.subtle.digest('SHA-256', enc.encode(endpoint));
  return `rle:${toHex(tokenDigest).slice(0, 16)}:${toHex(endpointDigest).slice(0, 16)}:${windowMinute}`;
}

/** Returns JSON.stringify length for data cap checks; non-serializable → Infinity. */
export function notificationDataJsonLength(data: unknown): number {
  if (data === undefined) return 0;
  try {
    return JSON.stringify(data).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function validateSubscriptionPayload(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'invalid_body' };
  }
  const rec = body as Record<string, unknown>;
  const endpoint = rec.endpoint;
  const keys = rec.keys;
  if (!isNonEmptyString(endpoint)) {
    return { ok: false, error: 'missing_endpoint' };
  }
  if (!isAllowedPushEndpointHost(endpoint)) {
    return { ok: false, error: 'endpoint_not_allowed' };
  }
  if (!keys || typeof keys !== 'object') {
    return { ok: false, error: 'missing_keys' };
  }
  const k = keys as Record<string, unknown>;
  if (!isNonEmptyString(k.p256dh) || !isNonEmptyString(k.auth)) {
    return { ok: false, error: 'missing_keys' };
  }
  return { ok: true, endpoint, keys: { p256dh: k.p256dh, auth: k.auth } };
}

export function validatePushPayload(body: unknown): PushValidationResult {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'invalid_body' };
  }
  const rec = body as Record<string, unknown>;

  // Accept either top-level endpoint/keys or nested subscription
  let endpoint: unknown = rec.endpoint;
  let keys: unknown = rec.keys;
  if ((!endpoint || !keys) && rec.subscription && typeof rec.subscription === 'object') {
    const sub = rec.subscription as Record<string, unknown>;
    endpoint = endpoint ?? sub.endpoint;
    keys = keys ?? sub.keys;
  }

  const subCheck = validateSubscriptionPayload({ endpoint, keys });
  if (!subCheck.ok) return subCheck;

  const notification = rec.notification;
  if (!notification || typeof notification !== 'object') {
    return { ok: false, error: 'missing_notification' };
  }
  const n = notification as Record<string, unknown>;
  if (!isNonEmptyString(n.title) || typeof n.body !== 'string') {
    return { ok: false, error: 'invalid_notification' };
  }
  if (n.title.length > MAX_TITLE_LEN || n.body.length > MAX_BODY_LEN) {
    return { ok: false, error: 'payload_too_large' };
  }
  // Plain text only — reject obvious HTML markup in title/body
  if (/[<>]/.test(n.title) || /[<>]/.test(n.body)) {
    return { ok: false, error: 'html_not_allowed' };
  }
  if (notificationDataJsonLength(n.data) > MAX_NOTIFICATION_DATA_JSON_LEN) {
    return { ok: false, error: 'payload_too_large' };
  }

  return {
    ok: true,
    endpoint: subCheck.endpoint,
    keys: subCheck.keys,
    notification: {
      title: n.title,
      body: n.body,
      data: n.data,
    },
  };
}

/**
 * ETHOS reference push gateway — Cloudflare Worker (secure-by-default).
 *
 * Never console.log notification title/body/data, subscription keys, or auth tokens.
 */
import { isAuthorized } from './auth';
import { buildWebPushRequest, sendWebPushRequest } from './buildWebPushRequest';
import {
  bootstrapGatewayConfig,
  claimGatewayConfig,
  resolveCredentials,
  secretsComplete,
  type ResolvedCredentials,
} from './gatewayConfig';
import { renderSetupPageHtml } from './setupPage';
import {
  MAX_PUSHES_PER_MINUTE,
  MAX_SUBSCRIPTIONS_PER_TOKEN,
  SUBSCRIPTION_TTL_SECONDS,
  endpointRateLimitKey,
  rateLimitKey,
  subscriptionIndexKey,
  subscriptionKvKey,
  validatePushPayload,
  validateSubscriptionPayload,
  type SubscriptionRecord,
} from './subscriptions';

export interface Env {
  AUTH_TOKEN?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  /** mailto: or https: subject for VAPID JWT (optional). */
  VAPID_SUBJECT?: string;
  SUBSCRIPTIONS: KVNamespace;
}

type ActiveCredentials = Extract<ResolvedCredentials, { source: 'secrets' | 'kv' }>;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};

function json(data: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...extra,
    },
  });
}

function text(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'text/html; charset=utf-8' },
  });
}

async function credentialsOr503(env: Env): Promise<ActiveCredentials | Response> {
  const resolved = await resolveCredentials(env);
  if (resolved.source === 'none') {
    return json({ error: 'misconfigured' }, 503);
  }
  return resolved;
}

function requireAuth(request: Request, authToken: string): Response | null {
  if (!isAuthorized(request.headers.get('Authorization'), authToken)) {
    return json({ error: 'unauthorized' }, 401);
  }
  return null;
}

async function handleRegister(
  request: Request,
  env: Env,
  authToken: string,
): Promise<Response> {
  const denied = requireAuth(request, authToken);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const validated = validateSubscriptionPayload(body);
  if (!validated.ok) {
    return json({ error: validated.error }, 400);
  }

  const key = await subscriptionKvKey(authToken, validated.endpoint);
  const indexKey = await subscriptionIndexKey(authToken);
  const existingRaw = await env.SUBSCRIPTIONS.get(indexKey);
  let index: string[] = [];
  if (existingRaw) {
    try {
      index = JSON.parse(existingRaw) as string[];
      if (!Array.isArray(index)) index = [];
    } catch {
      index = [];
    }
  }

  const already = index.includes(key);
  if (!already && index.length >= MAX_SUBSCRIPTIONS_PER_TOKEN) {
    return json({ error: 'subscription_limit' }, 403);
  }

  const record: SubscriptionRecord = {
    endpoint: validated.endpoint,
    keys: validated.keys,
    updatedAt: new Date().toISOString(),
  };

  await env.SUBSCRIPTIONS.put(key, JSON.stringify(record), {
    expirationTtl: SUBSCRIPTION_TTL_SECONDS,
  });

  if (!already) {
    index.push(key);
  }
  await env.SUBSCRIPTIONS.put(indexKey, JSON.stringify(index), {
    expirationTtl: SUBSCRIPTION_TTL_SECONDS,
  });

  return json({ ok: true }, 200);
}

async function handleUnregister(
  request: Request,
  env: Env,
  authToken: string,
): Promise<Response> {
  const denied = requireAuth(request, authToken);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const validated = validateSubscriptionPayload(body);
  if (!validated.ok) {
    return json({ error: validated.error }, 400);
  }

  const key = await subscriptionKvKey(authToken, validated.endpoint);
  await env.SUBSCRIPTIONS.delete(key);

  const indexKey = await subscriptionIndexKey(authToken);
  const existingRaw = await env.SUBSCRIPTIONS.get(indexKey);
  if (existingRaw) {
    try {
      const index = (JSON.parse(existingRaw) as string[]).filter((k) => k !== key);
      await env.SUBSCRIPTIONS.put(indexKey, JSON.stringify(index), {
        expirationTtl: SUBSCRIPTION_TTL_SECONDS,
      });
    } catch {
      // ignore corrupt index
    }
  }

  return json({ ok: true }, 200);
}

async function chargeRateLimitBucket(env: Env, key: string): Promise<Response | null> {
  const currentRaw = await env.SUBSCRIPTIONS.get(key);
  const current = currentRaw ? Number.parseInt(currentRaw, 10) || 0 : 0;
  if (current >= MAX_PUSHES_PER_MINUTE) {
    return json({ error: 'rate_limited' }, 429);
  }
  await env.SUBSCRIPTIONS.put(key, String(current + 1), { expirationTtl: 120 });
  return null;
}

async function checkRateLimits(
  env: Env,
  authToken: string,
  endpoint: string,
): Promise<Response | null> {
  const windowMinute = Math.floor(Date.now() / 60_000);
  const tokenKey = await rateLimitKey(authToken, windowMinute);
  const endpointKey = await endpointRateLimitKey(authToken, endpoint, windowMinute);
  for (const key of [tokenKey, endpointKey]) {
    const limited = await chargeRateLimitBucket(env, key);
    if (limited) return limited;
  }
  return null;
}

async function handlePush(
  request: Request,
  env: Env,
  creds: ActiveCredentials,
): Promise<Response> {
  const denied = requireAuth(request, creds.authToken);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const validated = validatePushPayload(body);
  if (!validated.ok) {
    return json({ error: validated.error }, 400);
  }

  const limited = await checkRateLimits(env, creds.authToken, validated.endpoint);
  if (limited) return limited;

  const key = await subscriptionKvKey(creds.authToken, validated.endpoint);
  const registered = await env.SUBSCRIPTIONS.get(key);
  if (!registered) {
    return json({ error: 'not_registered' }, 403);
  }

  let record: SubscriptionRecord;
  try {
    record = JSON.parse(registered) as SubscriptionRecord;
  } catch {
    return json({ error: 'not_registered' }, 403);
  }

  // Prefer stored keys (registration binding); require endpoint match
  if (record.endpoint !== validated.endpoint) {
    return json({ error: 'not_registered' }, 403);
  }

  const subject = env.VAPID_SUBJECT || 'mailto:push-gateway@ethos.local';

  try {
    const built = await buildWebPushRequest(
      { endpoint: record.endpoint, keys: record.keys },
      validated.notification,
      {
        subject,
        publicKey: creds.vapidPublicKey,
        privateKey: creds.vapidPrivateKey,
      },
    );
    const upstream = await sendWebPushRequest(built);
    if (!upstream.ok) {
      // Do not forward upstream body (may contain sensitive details)
      return json({ error: 'upstream_failed', status: upstream.status }, 502);
    }
    return json({ ok: true }, 200);
  } catch {
    return json({ error: 'push_failed' }, 500);
  }
}

async function handleSetupPage(request: Request, env: Env): Promise<Response> {
  const gatewayUrl = new URL(request.url).origin;

  if (secretsComplete(env)) {
    return html(renderSetupPageHtml({ kind: 'secrets', gatewayUrl }));
  }

  const cfg = await bootstrapGatewayConfig(env.SUBSCRIPTIONS);
  if (cfg.claimed) {
    return html(renderSetupPageHtml({ kind: 'claimed', gatewayUrl }));
  }
  return html(
    renderSetupPageHtml({
      kind: 'reveal',
      gatewayUrl,
      authToken: cfg.authToken,
    }),
  );
}

async function handleClaim(request: Request, env: Env): Promise<Response> {
  const result = await claimGatewayConfig(
    env.SUBSCRIPTIONS,
    request.headers.get('Authorization'),
  );
  if (result === 'missing') return json({ error: 'not_found' }, 404);
  if (result === 'unauthorized') return json({ error: 'unauthorized' }, 401);
  return json({ ok: true }, 200);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return text('ok');
    }

    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '')) {
      return handleSetupPage(request, env);
    }

    if (request.method === 'POST' && url.pathname === '/v1/setup/claim') {
      return handleClaim(request, env);
    }

    if (request.method === 'GET' && url.pathname === '/v1/vapid-public-key') {
      const creds = await credentialsOr503(env);
      if (creds instanceof Response) return creds;
      return json({ publicKey: creds.vapidPublicKey });
    }

    if (url.pathname === '/v1/subscriptions') {
      const creds = await credentialsOr503(env);
      if (creds instanceof Response) return creds;
      if (request.method === 'POST') return handleRegister(request, env, creds.authToken);
      if (request.method === 'DELETE') return handleUnregister(request, env, creds.authToken);
    }

    if (request.method === 'POST' && url.pathname === '/v1/push') {
      const creds = await credentialsOr503(env);
      if (creds instanceof Response) return creds;
      return handlePush(request, env, creds);
    }

    return json({ error: 'not_found' }, 404);
  },
};

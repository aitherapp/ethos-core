/**
 * ETHOS reference private Nostr relay — Cloudflare Worker (secure-by-default).
 *
 * Never console.log event.content or auth tokens.
 */
import { isAuthorizedRelayRequest } from './auth';
import { NostrRelay, type Env } from './nostrRelay';
import {
  bootstrapRelayConfig,
  claimRelayConfig,
  resolveAuthToken,
  secretsComplete,
} from './relayConfig';
import { httpsOriginToWss, renderSetupPageHtml } from './setupPage';

export { NostrRelay };
export type { Env };

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
    },
  });
}

async function handleSetupPage(request: Request, env: Env): Promise<Response> {
  const relayUrl = httpsOriginToWss(new URL(request.url).origin);

  if (secretsComplete(env)) {
    return html(renderSetupPageHtml({ kind: 'secrets', relayUrl }));
  }

  const cfg = await bootstrapRelayConfig(env.CONFIG);
  if (cfg.claimed) {
    return html(renderSetupPageHtml({ kind: 'claimed', relayUrl }));
  }
  return html(
    renderSetupPageHtml({
      kind: 'reveal',
      relayUrl,
      authToken: cfg.authToken,
    }),
  );
}

async function handleClaim(request: Request, env: Env): Promise<Response> {
  const result = await claimRelayConfig(env.CONFIG, request.headers.get('Authorization'));
  if (result === 'missing') return json({ error: 'not_found' }, 404);
  if (result === 'unauthorized') return json({ error: 'unauthorized' }, 401);
  return json({ ok: true }, 200);
}

async function handleWebSocket(request: Request, env: Env): Promise<Response> {
  const authToken = await resolveAuthToken(env);
  if (!authToken) {
    return new Response('Misconfigured', { status: 503 });
  }
  if (!isAuthorizedRelayRequest(request, authToken)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const id = env.RELAY.idFromName('owner-mesh');
  const stub = env.RELAY.get(id);
  // Forward the original upgrade request so the DO can accept the WebSocket.
  return stub.fetch(request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true });
    }

    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      return handleWebSocket(request, env);
    }

    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '')) {
      return handleSetupPage(request, env);
    }

    if (request.method === 'POST' && url.pathname === '/v1/setup/claim') {
      return handleClaim(request, env);
    }

    return json({ error: 'not_found' }, 404);
  },
};

/**
 * Durable Object Nostr relay — EVENT / REQ / CLOSE / EOSE / OK.
 * Never log event.content.
 */
import { isAcceptableEventSize, isAllowedRelayKind } from './kinds';
import {
  connectionRateKey,
  DEFAULT_EVENT_RATE_LIMIT,
  DEFAULT_EVENT_RATE_WINDOW_MS,
  RATE_KEY_TOKEN,
  RATE_LIMIT_STORAGE_KEY,
  RateLimiter,
  type RateLimiterSnapshot,
} from './rateLimit';

export const DEFAULT_EVENT_TTL_MS = 15 * 60 * 1000;
const MAX_STORED_EVENTS = 500;
const STORAGE_PREFIX = 'evt:';

export interface Env {
  AUTH_TOKEN?: string;
  CONFIG: KVNamespace;
  RELAY: DurableObjectNamespace;
  EVENT_TTL_MS?: string;
}

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export type NostrFilter = {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number;
  until?: number;
  limit?: number;
  [key: `#${string}`]: string[] | undefined;
};

interface StoredEvent {
  event: NostrEvent;
  expiresAt: number;
}

interface WsAttachment {
  /** Stable id for per-connection rate limiting across hibernation. */
  connId: string;
  /** subId → filters */
  subs: Record<string, NostrFilter[]>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseEvent(raw: unknown): NostrEvent | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== 'string' || raw.id.length === 0) return null;
  if (typeof raw.pubkey !== 'string') return null;
  if (typeof raw.created_at !== 'number') return null;
  if (typeof raw.kind !== 'number') return null;
  if (!Array.isArray(raw.tags)) return null;
  if (typeof raw.content !== 'string') return null;
  if (typeof raw.sig !== 'string') return null;
  return raw as unknown as NostrEvent;
}

/** Match a Nostr filter against an event (kinds, authors, ids, #tags, since/until). */
export function eventMatchesFilter(event: NostrEvent, filter: NostrFilter): boolean {
  if (filter.ids && filter.ids.length > 0 && !filter.ids.includes(event.id)) return false;
  if (filter.authors && filter.authors.length > 0 && !filter.authors.includes(event.pubkey)) {
    return false;
  }
  if (filter.kinds && filter.kinds.length > 0 && !filter.kinds.includes(event.kind)) {
    return false;
  }
  if (typeof filter.since === 'number' && event.created_at < filter.since) return false;
  if (typeof filter.until === 'number' && event.created_at > filter.until) return false;

  for (const [key, values] of Object.entries(filter)) {
    if (!key.startsWith('#') || !Array.isArray(values) || values.length === 0) continue;
    const tagName = key.slice(1);
    const tagValues: string[] = [];
    for (const t of event.tags) {
      if (Array.isArray(t) && t[0] === tagName && typeof t[1] === 'string') {
        tagValues.push(t[1]);
      }
    }
    const wanted = values.filter((v): v is string => typeof v === 'string');
    if (!wanted.some((v) => tagValues.includes(v))) return false;
  }
  return true;
}

function normalizeFilters(rawFilters: unknown[]): NostrFilter[] {
  const out: NostrFilter[] = [];
  for (const f of rawFilters) {
    if (!isRecord(f)) continue;
    out.push(f as NostrFilter);
  }
  return out.length > 0 ? out : [{}];
}

function sendJson(ws: WebSocket, msg: unknown): void {
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    // ignore broken sockets
  }
}

export class NostrRelay implements DurableObject {
  private readonly rateLimiter = new RateLimiter({
    limit: DEFAULT_EVENT_RATE_LIMIT,
    windowMs: DEFAULT_EVENT_RATE_WINDOW_MS,
  });
  private readonly ttlMs: number;
  /** True after sliding-window state has been loaded from DO storage this isolate life. */
  private ratesHydrated = false;

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {
    const parsed = Number.parseInt(env.EVENT_TTL_MS ?? '', 10);
    this.ttlMs = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_EVENT_TTL_MS;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.state.acceptWebSocket(server);
    server.serializeAttachment({
      connId: crypto.randomUUID(),
      subs: {},
    } satisfies WsAttachment);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const text = typeof message === 'string' ? message : new TextDecoder().decode(message);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      sendJson(ws, ['NOTICE', 'invalid: bad json']);
      return;
    }
    if (!Array.isArray(parsed) || parsed.length < 1 || typeof parsed[0] !== 'string') {
      sendJson(ws, ['NOTICE', 'invalid: expected array frame']);
      return;
    }

    const type = parsed[0];
    if (type === 'EVENT') {
      await this.handleEvent(ws, parsed[1], text);
      return;
    }
    if (type === 'REQ') {
      await this.handleReq(ws, parsed);
      return;
    }
    if (type === 'CLOSE') {
      this.handleClose(ws, parsed[1]);
      return;
    }
    sendJson(ws, ['NOTICE', `unsupported: ${type}`]);
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, _wasClean: boolean): Promise<void> {
    try {
      ws.close(code, reason);
    } catch {
      // already closed
    }
  }

  private getAttachment(ws: WebSocket): WsAttachment {
    const raw = ws.deserializeAttachment() as Partial<WsAttachment> | null | undefined;
    const connId =
      raw && typeof raw.connId === 'string' && raw.connId.length > 0
        ? raw.connId
        : crypto.randomUUID();
    const subs =
      raw && typeof raw.subs === 'object' && raw.subs !== null && !Array.isArray(raw.subs)
        ? raw.subs
        : {};
    const att: WsAttachment = { connId, subs };
    if (!raw || raw.connId !== connId || raw.subs !== subs) {
      ws.serializeAttachment(att);
    }
    return att;
  }

  private setAttachment(ws: WebSocket, att: WsAttachment): void {
    ws.serializeAttachment(att);
  }

  private async hydrateRateLimiter(now = Date.now()): Promise<void> {
    if (this.ratesHydrated) return;
    const stored = await this.state.storage.get<RateLimiterSnapshot>(RATE_LIMIT_STORAGE_KEY);
    this.rateLimiter.restore(stored ?? null, now);
    this.ratesHydrated = true;
  }

  private async persistRateLimiter(now = Date.now()): Promise<void> {
    await this.state.storage.put(RATE_LIMIT_STORAGE_KEY, this.rateLimiter.snapshot(now));
  }

  private async handleEvent(ws: WebSocket, rawEvent: unknown, rawFrame: string): Promise<void> {
    const event = parseEvent(rawEvent);
    if (!event) {
      sendJson(ws, ['OK', '', false, 'invalid: malformed event']);
      return;
    }

    if (!isAcceptableEventSize(rawFrame)) {
      sendJson(ws, ['OK', event.id, false, 'invalid: event too large']);
      return;
    }

    if (!isAllowedRelayKind(event.kind)) {
      sendJson(ws, ['OK', event.id, false, 'blocked: kind not allowed']);
      return;
    }

    const now = Date.now();
    await this.hydrateRateLimiter(now);
    const { connId } = this.getAttachment(ws);
    // Per-connection and mesh/token ceiling — reject when either is exceeded.
    if (!this.rateLimiter.allowAll([connectionRateKey(connId), RATE_KEY_TOKEN], now)) {
      await this.persistRateLimiter(now);
      sendJson(ws, ['OK', event.id, false, 'rate-limited: too many events']);
      return;
    }
    await this.persistRateLimiter(now);

    const stored: StoredEvent = { event, expiresAt: now + this.ttlMs };
    await this.state.storage.put(`${STORAGE_PREFIX}${event.id}`, stored);
    await this.enforceStoreBound();
    await this.fanOut(event);

    sendJson(ws, ['OK', event.id, true, '']);
  }

  private async handleReq(ws: WebSocket, frame: unknown[]): Promise<void> {
    const subId = frame[1];
    if (typeof subId !== 'string' || subId.length === 0) {
      sendJson(ws, ['NOTICE', 'invalid: REQ needs sub id']);
      return;
    }
    const filters = normalizeFilters(frame.slice(2));
    const att = this.getAttachment(ws);
    att.subs[subId] = filters;
    this.setAttachment(ws, att);

    const matches = await this.queryStored(filters);
    for (const event of matches) {
      sendJson(ws, ['EVENT', subId, event]);
    }
    sendJson(ws, ['EOSE', subId]);
  }

  private handleClose(ws: WebSocket, subId: unknown): void {
    if (typeof subId !== 'string') return;
    const att = this.getAttachment(ws);
    delete att.subs[subId];
    this.setAttachment(ws, att);
  }

  private async queryStored(filters: NostrFilter[]): Promise<NostrEvent[]> {
    const now = Date.now();
    const all = await this.state.storage.list<StoredEvent>({ prefix: STORAGE_PREFIX });
    const expired: string[] = [];
    const matched: NostrEvent[] = [];

    for (const [key, stored] of all) {
      if (!stored?.event || stored.expiresAt <= now) {
        expired.push(key);
        continue;
      }
      if (filters.some((f) => eventMatchesFilter(stored.event, f))) {
        matched.push(stored.event);
      }
    }

    if (expired.length > 0) {
      await this.state.storage.delete(expired);
    }

    // Apply per-filter limit: take the max limit across filters, default unlimited (capped by store).
    let limit = 0;
    for (const f of filters) {
      if (typeof f.limit === 'number' && f.limit > limit) limit = f.limit;
    }
    matched.sort((a, b) => b.created_at - a.created_at);
    return limit > 0 ? matched.slice(0, limit) : matched;
  }

  private async fanOut(event: NostrEvent): Promise<void> {
    for (const peer of this.state.getWebSockets()) {
      const att = this.getAttachment(peer);
      for (const [subId, filters] of Object.entries(att.subs)) {
        if (filters.some((f) => eventMatchesFilter(event, f))) {
          sendJson(peer, ['EVENT', subId, event]);
        }
      }
    }
  }

  private async enforceStoreBound(): Promise<void> {
    const all = await this.state.storage.list<StoredEvent>({ prefix: STORAGE_PREFIX });
    if (all.size <= MAX_STORED_EVENTS) return;

    const entries = [...all.entries()].sort(
      (a, b) => (a[1]?.event.created_at ?? 0) - (b[1]?.event.created_at ?? 0),
    );
    const toDelete = entries.slice(0, entries.length - MAX_STORED_EVENTS).map(([k]) => k);
    if (toDelete.length > 0) {
      await this.state.storage.delete(toDelete);
    }
  }
}

# BYO Private Relay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. REQUIRED: Use superpowers:test-driven-development for every code task (red → green → refactor → commit).

**Goal:** Ship an opt-in BYO private Nostr relay (Cloudflare reference Worker + Durable Object with one-click deploy) plus ETHOS client/widget wiring: DHT bootstrap on public Nostr, E2EE handoff of URL+token, then private-only mesh with manual retry on failure.

**Architecture:** Reference `relay/` mirrors `push-gateway/` (setup page, auth token, fail-closed). Wire protocol is authenticated Nostr WebSocket (`wss://host/?token=…`) with kind allowlist `41002`/`41003`. Owner configures Settings; peers receive `relayUrl`/`relayAuthToken` on the existing encrypted handshake path (same pattern as push prefs); widget uses `data-relay-url`/`data-relay-token`.

**Tech Stack:** TypeScript, Vitest, Cloudflare Workers + Durable Objects + Wrangler, `nostr-tools` SimplePool (existing), React Settings in `App.tsx`.

**Spec:** `docs/superpowers/specs/2026-09-20-byo-private-relay-design.md`

## Global Constraints

- English only in code identifiers, Settings copy, README, and Worker docs.
- Opt-in private relay **default off**; without BYO keep `DEFAULT_NOSTR_RELAYS`.
- Client refuses non-`wss://` private relay URLs.
- Client attaches auth as query `?token=` on the WebSocket URL.
- Kind allowlist exactly: `41002`, `41003` — reject all other kinds.
- Handoff failure status copy exactly: `Private relay unavailable`.
- Retry policy: **one** connect attempt on handoff or Settings save; **no** timed auto-retry loop; further attempts only via explicit user Retry / re-save.
- After successful private switch: no automatic fallback to public Nostr.
- No ETHOS-hosted relay; Cloudflare is reference + one-click only.
- No event `content` logging on the Worker.
- Follow `DEPLOY-CHECKLIST.md` when cutting a user-facing release.

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/privateRelaySettings.ts` | Load/save owner prefs; `isWssRelayUrl`; `buildAuthedRelayUrl`; handoff outcome helpers |
| `src/lib/privateRelayHandoff.ts` | Pure helpers: parse handoff fields, decide pool switch vs stay-on-bootstrap |
| `relay/src/auth.ts` | Token extraction + constant-time compare |
| `relay/src/kinds.ts` | Kind allowlist + event size checks |
| `relay/src/rateLimit.ts` | Per-token / per-connection rate counters |
| `relay/src/relayConfig.ts` | Resolve AUTH_TOKEN from Secrets or KV bootstrap (like push-gateway) |
| `relay/src/setupPage.ts` | English setup HTML + claim |
| `relay/src/nostrRelay.ts` | Durable Object: WS sessions, EVENT/REQ/CLOSE, TTL store, fan-out |
| `relay/src/index.ts` | HTTP routes + WS upgrade → DO |
| `relay/wrangler.toml` | Worker + DO + KV bindings |
| `relay/README.md` | One-click deploy + portable contract |
| `src/lib/iroh.ts` | Apply private pool; handoff send/receive; manual retry hook |
| `src/App.tsx` | Settings UI + Retry button |
| `src/widget/widgetCore.ts` | Parse `data-relay-url` / `data-relay-token` |
| `src/widget/index.ts` | Apply private relays before connect when attrs present |
| `tests/privateRelaySettings.test.ts` | Prefs + URL helpers |
| `tests/privateRelayHandoff.test.ts` | Handoff / failure / no-auto-retry decisions |
| `tests/relayAuth.test.ts` | Import Worker auth/kinds modules |
| `tests/relayKinds.test.ts` | Kind allowlist / size |
| `tests/widgetRelayConfig.test.ts` | Widget config parsing |
| `README.md` | How-to enable private relay + widget attrs |

---

### Task 1: Private relay settings + URL helpers (TDD)

**Files:**
- Create: `src/lib/privateRelaySettings.ts`
- Create: `tests/privateRelaySettings.test.ts`

**Interfaces:**
- Consumes: `localStorage`
- Produces:
  - `export interface PrivateRelaySettings { enabled: boolean; relayUrl: string; authToken: string }`
  - `loadPrivateRelaySettings(): PrivateRelaySettings`
  - `savePrivateRelaySettings(settings: PrivateRelaySettings): void`
  - `isWssRelayUrl(url: string): boolean`
  - `buildAuthedRelayUrl(relayUrl: string, authToken: string): string` — returns `wss://…` with `token` query param (preserve existing query; overwrite `token`)

- [ ] **Step 1: Write failing tests**

```typescript
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadPrivateRelaySettings,
  savePrivateRelaySettings,
  isWssRelayUrl,
  buildAuthedRelayUrl,
} from '../src/lib/privateRelaySettings';

describe('privateRelaySettings', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to disabled', () => {
    const s = loadPrivateRelaySettings();
    expect(s.enabled).toBe(false);
    expect(s.relayUrl).toBe('');
    expect(s.authToken).toBe('');
  });

  it('round-trips saved settings', () => {
    savePrivateRelaySettings({
      enabled: true,
      relayUrl: 'wss://relay.example.com',
      authToken: 'tok',
    });
    expect(loadPrivateRelaySettings()).toEqual({
      enabled: true,
      relayUrl: 'wss://relay.example.com',
      authToken: 'tok',
    });
  });

  it('accepts only wss relay URLs', () => {
    expect(isWssRelayUrl('wss://relay.example.com')).toBe(true);
    expect(isWssRelayUrl('ws://relay.example.com')).toBe(false);
    expect(isWssRelayUrl('https://relay.example.com')).toBe(false);
    expect(isWssRelayUrl('not-a-url')).toBe(false);
  });

  it('buildAuthedRelayUrl appends token query', () => {
    expect(buildAuthedRelayUrl('wss://relay.example.com/', 'secret')).toBe(
      'wss://relay.example.com/?token=secret'
    );
  });

  it('buildAuthedRelayUrl overwrites existing token', () => {
    expect(buildAuthedRelayUrl('wss://relay.example.com/?token=old', 'new')).toBe(
      'wss://relay.example.com/?token=new'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/privateRelaySettings.test.ts`  
Expected: FAIL (module missing)

- [ ] **Step 3: Write minimal implementation**

Implement `src/lib/privateRelaySettings.ts` with `localStorage` key `ethos_private_relay_settings` (JSON). `isWssRelayUrl` parses with `URL` and requires `protocol === 'wss:'`. `buildAuthedRelayUrl` uses `URL` + `searchParams.set('token', authToken)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/privateRelaySettings.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/privateRelaySettings.ts tests/privateRelaySettings.test.ts
git commit -m "$(cat <<'EOF'
feat(relay): add private relay settings helpers

EOF
)"
```

---

### Task 2: Handoff decision helpers (TDD)

**Files:**
- Create: `src/lib/privateRelayHandoff.ts`
- Create: `tests/privateRelayHandoff.test.ts`

**Interfaces:**
- Produces:
  - `export type PrivateRelayHandoffFields = { relayUrl: string; relayAuthToken: string }`
  - `parsePrivateRelayHandoff(signal: Record<string, unknown>): PrivateRelayHandoffFields | null` — requires non-empty string `relayUrl` + `relayAuthToken` and `isWssRelayUrl(relayUrl)`
  - `export type PrivateRelaySwitchResult = { ok: true; relays: string[] } | { ok: false; status: 'Private relay unavailable'; relaysUnchanged: true }`
  - `planPrivateRelaySwitch(opts: { relayUrl: string; authToken: string; connectSucceeded: boolean }): PrivateRelaySwitchResult` — if `connectSucceeded`, `relays: [buildAuthedRelayUrl(...)]`; else failure with exact status string and `relaysUnchanged: true`
  - `shouldAutoRetryPrivateRelay(): false` — always false (documents locked policy for callers)
  - `buildPrivateRelayHandshakeFields(settings: PrivateRelaySettings): Record<string, string>` — `{}` if disabled or invalid; else `{ relayUrl, relayAuthToken }` (URL without token query)

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import {
  parsePrivateRelayHandoff,
  planPrivateRelaySwitch,
  shouldAutoRetryPrivateRelay,
  buildPrivateRelayHandshakeFields,
} from '../src/lib/privateRelayHandoff';

describe('privateRelayHandoff', () => {
  it('parses valid handoff fields', () => {
    expect(
      parsePrivateRelayHandoff({
        relayUrl: 'wss://r.example',
        relayAuthToken: 'tok',
      })
    ).toEqual({ relayUrl: 'wss://r.example', relayAuthToken: 'tok' });
  });

  it('rejects missing or non-wss handoff', () => {
    expect(parsePrivateRelayHandoff({})).toBeNull();
    expect(
      parsePrivateRelayHandoff({
        relayUrl: 'https://r.example',
        relayAuthToken: 'tok',
      })
    ).toBeNull();
  });

  it('plans private-only list on successful connect', () => {
    const r = planPrivateRelaySwitch({
      relayUrl: 'wss://r.example',
      authToken: 'tok',
      connectSucceeded: true,
    });
    expect(r).toEqual({
      ok: true,
      relays: ['wss://r.example/?token=tok'],
    });
  });

  it('stays on bootstrap when connect fails', () => {
    const r = planPrivateRelaySwitch({
      relayUrl: 'wss://r.example',
      authToken: 'tok',
      connectSucceeded: false,
    });
    expect(r).toEqual({
      ok: false,
      status: 'Private relay unavailable',
      relaysUnchanged: true,
    });
  });

  it('never auto-retries', () => {
    expect(shouldAutoRetryPrivateRelay()).toBe(false);
  });

  it('builds handshake fields only when enabled', () => {
    expect(
      buildPrivateRelayHandshakeFields({
        enabled: false,
        relayUrl: 'wss://r.example',
        authToken: 'tok',
      })
    ).toEqual({});
    expect(
      buildPrivateRelayHandshakeFields({
        enabled: true,
        relayUrl: 'wss://r.example',
        authToken: 'tok',
      })
    ).toEqual({ relayUrl: 'wss://r.example', relayAuthToken: 'tok' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/privateRelayHandoff.test.ts`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation** in `src/lib/privateRelayHandoff.ts` using helpers from Task 1.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/privateRelayHandoff.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/privateRelayHandoff.ts tests/privateRelayHandoff.test.ts
git commit -m "$(cat <<'EOF'
feat(relay): add private relay handoff decision helpers

EOF
)"
```

---

### Task 3: Worker auth + kind allowlist modules (TDD)

**Files:**
- Create: `relay/package.json`, `relay/tsconfig.json`, `relay/wrangler.toml` (scaffold only; DO wiring in Task 4)
- Create: `relay/src/auth.ts`
- Create: `relay/src/kinds.ts`
- Create: `tests/relayAuth.test.ts`
- Create: `tests/relayKinds.test.ts`

**Interfaces:**
- Produces:
  - `extractRelayToken(request: Request): string | null` — query `token` first, else `Authorization: Bearer …`
  - `tokensEqual(a: string, b: string): boolean` — length-safe compare
  - `isAuthorizedRelayRequest(request: Request, expectedToken: string): boolean`
  - `export const ALLOWED_RELAY_KINDS = new Set([41002, 41003])`
  - `isAllowedRelayKind(kind: number): boolean`
  - `isAcceptableEventSize(rawJson: string, maxBytes?: number): boolean` — default max `65536`

Mirror how `tests/pushGateway*.test.ts` import from `push-gateway/src/…`.

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import {
  extractRelayToken,
  isAuthorizedRelayRequest,
} from '../relay/src/auth';
import {
  isAllowedRelayKind,
  isAcceptableEventSize,
  ALLOWED_RELAY_KINDS,
} from '../relay/src/kinds';

describe('relay auth', () => {
  it('reads token from query', () => {
    const req = new Request('https://r.example/?token=abc');
    expect(extractRelayToken(req)).toBe('abc');
    expect(isAuthorizedRelayRequest(req, 'abc')).toBe(true);
    expect(isAuthorizedRelayRequest(req, 'nope')).toBe(false);
  });

  it('reads Bearer token', () => {
    const req = new Request('https://r.example/', {
      headers: { Authorization: 'Bearer xyz' },
    });
    expect(extractRelayToken(req)).toBe('xyz');
  });

  it('rejects missing token', () => {
    const req = new Request('https://r.example/');
    expect(isAuthorizedRelayRequest(req, 'abc')).toBe(false);
  });
});

describe('relay kinds', () => {
  it('allows only ETHOS kinds', () => {
    expect([...ALLOWED_RELAY_KINDS].sort()).toEqual([41002, 41003]);
    expect(isAllowedRelayKind(41002)).toBe(true);
    expect(isAllowedRelayKind(1)).toBe(false);
  });

  it('rejects oversized events', () => {
    expect(isAcceptableEventSize('x'.repeat(10), 8)).toBe(false);
    expect(isAcceptableEventSize('{"ok":true}', 100)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run tests/relayAuth.test.ts tests/relayKinds.test.ts`

- [ ] **Step 3: Implement `relay/src/auth.ts` and `relay/src/kinds.ts`; add minimal `relay/package.json` / `tsconfig.json` / `wrangler.toml` stubs** (name `ethos-private-relay`, DO binding name `RELAY` placeholder for Task 4).

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add relay/ tests/relayAuth.test.ts tests/relayKinds.test.ts
git commit -m "$(cat <<'EOF'
feat(relay): add auth and kind allowlist for private relay Worker

EOF
)"
```

---

### Task 4: Reference Worker — setup page, DO Nostr relay, README

**Files:**
- Create: `relay/src/relayConfig.ts`, `relay/src/setupPage.ts`, `relay/src/rateLimit.ts`, `relay/src/nostrRelay.ts`, `relay/src/index.ts`
- Create: `relay/README.md`
- Modify: `relay/wrangler.toml` — KV `CONFIG`, DO class `NostrRelay`
- Create: `tests/relayRateLimit.test.ts` (pure rate-limit helper)
- Optional: `tests/relayConfig.test.ts` if bootstrap/claim is non-trivial (mirror push-gateway setup tests)

**Interfaces:**
- `resolveAuthToken(env): Promise<string | null>` — Secrets `AUTH_TOKEN` override, else KV bootstrap (same idea as push-gateway `gateway:config`)
- `GET /` → setup HTML (token shown once until claimed)
- `POST /v1/setup/claim` Bearer → mark claimed
- `GET /health` → `{ ok: true }`
- WebSocket upgrade (authenticated) → Durable Object `NostrRelay`
- DO behavior:
  - Parse client frames: `["EVENT", event]`, `["REQ", subId, ...filters]`, `["CLOSE", subId]`
  - On EVENT: verify kind allowlist + size; store with TTL (default **15 minutes**); fan-out to matching REQs; reply `["OK", id, true, ""]` or false with reason
  - On REQ: send matching stored events then `["EOSE", subId]`
  - Rate limit: default **120 EVENT / token / minute** (ICE-burst friendly)
  - Never log `event.content`

**Pattern reference:** `push-gateway/src/setupPage.ts`, `push-gateway/src/gatewayConfig.ts`, `push-gateway/README.md` Deploy button URL form:
`https://deploy.workers.cloudflare.com/?url=https://github.com/aitherapp/ethos-core/tree/main/relay`

- [ ] **Step 1: Write failing rate-limit test**

```typescript
import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../relay/src/rateLimit';

describe('RateLimiter', () => {
  it('allows up to limit then rejects within window', () => {
    const rl = new RateLimiter({ limit: 2, windowMs: 60_000 });
    expect(rl.allow('tok', 1000)).toBe(true);
    expect(rl.allow('tok', 1001)).toBe(true);
    expect(rl.allow('tok', 1002)).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run tests/relayRateLimit.test.ts`

- [ ] **Step 3: Implement rate limiter + full Worker/DO + setup page + README**

Keep DO logic in `relay/src/nostrRelay.ts`. Export `RateLimiter` class from `rateLimit.ts`. Index routes HTTP and upgrades WS only when `isAuthorizedRelayRequest`.

Filter matching for REQ v1: support `#` tag filters and `kinds` / `authors` / `ids` as needed for ETHOS topics — minimum: match `kinds` include and at least one `#` tag filter if present (inspect how ETHOS publishes tags in `iroh.ts` `sendNostrSignal` / relay-data publish and match that).

- [ ] **Step 4: Run unit tests**

Run: `npx vitest run tests/relayAuth.test.ts tests/relayKinds.test.ts tests/relayRateLimit.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add relay/ tests/relayRateLimit.test.ts
git commit -m "$(cat <<'EOF'
feat(relay): add Cloudflare private Nostr relay reference Worker

EOF
)"
```

---

### Task 5: Wire iroh handoff + pool switch (TDD where extractable)

**Files:**
- Modify: `src/lib/iroh.ts`
- Create: `tests/privateRelayIrohWiring.test.ts` — test exported helpers or thin wrappers added for wiring (prefer extracting pure functions rather than constructing full `IrohManager`)

**Behavior:**
- Owner with `loadPrivateRelaySettings().enabled` + valid wss+token: on Settings apply / `applyPrivateRelayFromSettings()`, call `setRelays([buildAuthedRelayUrl(...)])` once; on failure notify `Private relay unavailable` and leave prior relays.
- Extend `pushHandshakeFields` pattern: add `privateRelayHandshakeFields(): { relayUrl?: string; relayAuthToken?: string }` when owner private relay enabled (send **base** `wss` URL without embedding token in a second place if token is already the auth secret — send both `relayUrl` (without token query) and `relayAuthToken` as separate fields).
- Spread those fields into `relay-helo`, `relay-helo-ack`, and `push-profile` (or dedicated `private-relay-profile` signal type — prefer **same helo/ack + push-profile style** spreading fields so one path stores them).
- On receive: `parsePrivateRelayHandoff` → attempt **one** private switch via `planPrivateRelaySwitch` after a single health/connect check; if `ok`, `setRelays(result.relays)`; else `notifyStatus('warning', 'Private relay unavailable')` and do not change relays.
- Export `retryPrivateRelayHandoff(peerId?: string)` or app-level `retryPrivateRelay()` that re-runs one attempt from stored handoff or owner settings — no timers.
- `resetRelays()` must also clear private-relay opt-in via `savePrivateRelaySettings({ enabled: false, relayUrl: '', authToken: '' })`.

- [ ] **Step 1: Write failing tests for any new exported wiring helpers** (e.g. merging handshake fields):

```typescript
import { describe, it, expect } from 'vitest';
import { buildPrivateRelayHandshakeFields } from '../src/lib/privateRelayHandoff';

describe('buildPrivateRelayHandshakeFields', () => {
  it('returns empty when disabled', () => {
    expect(
      buildPrivateRelayHandshakeFields({
        enabled: false,
        relayUrl: 'wss://r.example',
        authToken: 'tok',
      })
    ).toEqual({});
  });

  it('returns url and token when enabled', () => {
    expect(
      buildPrivateRelayHandshakeFields({
        enabled: true,
        relayUrl: 'wss://r.example',
        authToken: 'tok',
      })
    ).toEqual({ relayUrl: 'wss://r.example', relayAuthToken: 'tok' });
  });
});
```

Add `buildPrivateRelayHandshakeFields` to `privateRelayHandoff.ts` in this task if not already present.

- [ ] **Step 2: Run — expect FAIL**, then implement helper + iroh wiring.

- [ ] **Step 3: Run** `npx vitest run tests/privateRelayHandoff.test.ts tests/privateRelayIrohWiring.test.ts` — PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/iroh.ts src/lib/privateRelayHandoff.ts tests/privateRelayIrohWiring.test.ts
git commit -m "$(cat <<'EOF'
feat(iroh): hand off private relay credentials and switch pool

EOF
)"
```

---

### Task 6: Settings UI — opt-in, help, Retry

**Files:**
- Modify: `src/App.tsx` (relay Settings section near existing custom relays UI ~line 3108+)

**UI (English):**
- Checkbox: `Enable private relay` (default off)
- Inputs: `Relay URL` (`wss://…`), `Auth token`
- Help: one line linking/pointing to `relay/README.md` — after Cloudflare deploy, open Worker URL to copy URL + token
- Button: `Retry private relay` — calls `iroh` retry once
- On Save: persist `savePrivateRelaySettings`; if enabled, one apply attempt; on failure show status `Private relay unavailable`
- Reset relays: existing control also clears private settings

- [ ] **Step 1:** No pure-UI unit required if wiring is covered; manually verify in browser after implement. Prefer extracting save handler to a tiny tested function if logic grows:

```typescript
export function privateRelaySaveAction(settings: PrivateRelaySettings): {
  shouldApply: boolean;
  error?: string;
} {
  if (!settings.enabled) return { shouldApply: false };
  if (!isWssRelayUrl(settings.relayUrl) || !settings.authToken) {
    return { shouldApply: false, error: 'Private relay unavailable' };
  }
  return { shouldApply: true };
}
```

Add test in `tests/privateRelaySettings.test.ts`.

- [ ] **Step 2: Implement UI + handler**

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx src/lib/privateRelaySettings.ts tests/privateRelaySettings.test.ts
git commit -m "$(cat <<'EOF'
feat(settings): opt-in private relay controls and manual retry

EOF
)"
```

---

### Task 7: Widget `data-relay-url` / `data-relay-token` (TDD)

**Files:**
- Modify: `src/widget/widgetCore.ts`
- Modify: `src/widget/index.ts`
- Create: `tests/widgetRelayConfig.test.ts`
- Modify: `README.md` embed attribute table

**Interfaces:**
- Extend `WidgetConfig` with optional `relayUrl?: string; relayToken?: string`
- `parseWidgetConfig`: read `relayUrl` / `relayToken` from data map (from `data-relay-url` / `data-relay-token`)
- When both present and `isWssRelayUrl(relayUrl)` and token non-empty: before `connectByTicket`, call `iroh.setRelays([buildAuthedRelayUrl(relayUrl, relayToken)])` (or dedicated API). Do **not** use public defaults in that case.
- When absent: unchanged behavior

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { parseWidgetConfig } from '../src/widget/widgetCore';

describe('widget relay attrs', () => {
  it('parses optional relay attrs', () => {
    const c = parseWidgetConfig({
      ownerTicket: 'ethos://node/abc',
      relayUrl: 'wss://r.example',
      relayToken: 'tok',
    });
    expect(c.relayUrl).toBe('wss://r.example');
    expect(c.relayToken).toBe('tok');
  });

  it('omits relay when absent', () => {
    const c = parseWidgetConfig({ ownerTicket: 'ethos://node/abc' });
    expect(c.relayUrl).toBeUndefined();
    expect(c.relayToken).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — FAIL**, implement parse + `index.ts` wiring + README rows for `data-relay-url` / `data-relay-token`.

- [ ] **Step 3: Run — PASS**

- [ ] **Step 4: Commit**

```bash
git add src/widget/widgetCore.ts src/widget/index.ts tests/widgetRelayConfig.test.ts README.md
git commit -m "$(cat <<'EOF'
feat(widget): support private relay embed attributes

EOF
)"
```

---

### Task 8: Docs polish + README private-relay how-to

**Files:**
- Modify: `README.md` — short section: enable Pkarr DHT → discover peer → owner deploys `relay/` → Settings → handoff; widget attrs; link `relay/README.md`
- Modify: `public/trust/cryptographic-design.md` — one sentence that BYO private relay reduces public metadata after handoff (optional if already accurate)
- Ensure `relay/README.md` covers rotate token, no content logging, portable API

- [ ] **Step 1: Update docs** (no code tests)

- [ ] **Step 2: Commit**

```bash
git add README.md relay/README.md public/trust/cryptographic-design.md
git commit -m "$(cat <<'EOF'
docs: explain opt-in BYO private relay setup

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Thin Cloudflare Nostr Worker + DO + one-click | 3–4 |
| Auth `?token=` + kind allowlist 41002/41003 | 3–4 |
| Setup page / secrets | 4 |
| Owner Settings opt-in | 1, 6 |
| DHT bootstrap → E2EE handoff → private only | 2, 5 (docs: 8) |
| Stay on bootstrap + `Private relay unavailable` | 2, 5 |
| Manual retry only | 2, 5, 6 |
| Widget data-relay attrs | 7 |
| No ETHOS-hosted relay / English / portable | 4, 8 |
| Tests listed in spec | 1–7 |

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-20-byo-private-relay.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks (`superpowers:subagent-driven-development` + TDD)
2. **Inline Execution** — execute tasks in this session (`superpowers:executing-plans`)

Which approach?

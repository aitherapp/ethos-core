# BYO Push Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an opt-in, provider-agnostic push pipeline (Settings + client helpers + handshake + deep links) plus a secure-by-default Cloudflare reference Worker that users can one-click deploy.

**Architecture:** ETHOS clients speak only a portable HTTPS API (`/v1/vapid-public-key`, `/v1/subscriptions`, `/v1/push`). Recipients own the gateway; senders POST to the recipient’s URL with a token learned over E2EE handshake. Cloudflare Worker in `push-gateway/` is the reference implementation (allowlist + registration binding + rate limits), not a hard dependency.

**Tech Stack:** TypeScript, Vitest, existing `webPush` / `iroh` / widget code, Cloudflare Workers + Wrangler, Web Crypto for VAPID/Web Push in the Worker (use a Workers-compatible web-push helper such as `@block65/webcrypto-web-push` or equivalent).

**Spec:** `docs/superpowers/specs/2026-09-19-byo-push-gateway-design.md`

## Global Constraints

- English only in code identifiers, Settings copy, README, and Worker docs.
- Opt-in: background push **default off**; no gateway traffic when disabled.
- Content modes exactly: `Minimal` | `Sender` | `Preview` (no Full).
- Trigger modes exactly: `Background only` | `Always`.
- Client must refuse non-HTTPS gateway URLs.
- No ETHOS-hosted gateway; Cloudflare is reference + one-click only.
- Gateway: auth required on mutating routes; host allowlist; registration binding; no notification body logging; fail closed.
- Widget and peer share one send helper.
- Notification click deep-links to `peerId` + `messageId`.
- Follow `DEPLOY-CHECKLIST.md` when cutting a user-facing release (version + cache bump + About + README).

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/pushSettings.ts` | Load/save opt-in prefs from `localStorage` |
| `src/lib/pushNotify.ts` | Content formatting, trigger predicate, deep-link payload builders |
| `src/lib/pushGatewayClient.ts` | HTTPS client for vapid / register / push |
| `src/widget/pushTrigger.ts` | Replace raw vendor POST with gateway client (or thin wrapper) |
| `src/lib/peerPush.ts` | Evolve to gateway-aware send decision |
| `src/lib/webPush.ts` | Subscribe using gateway VAPID key when opt-in |
| `src/lib/iroh.ts` | Wire subscription; share push prefs in handshake; send via gateway |
| `src/App.tsx` | Settings UI; subscribe/register on enable; deep-link handler; rename Test Push |
| `public/sw.js` | `notificationclick` deep-link |
| `push-gateway/` | Reference Worker + wrangler + README + deploy scripts |
| `tests/pushSettings.test.ts` | Prefs tests |
| `tests/pushNotify.test.ts` | Content/trigger/deep-link tests |
| `tests/pushGatewayClient.test.ts` | Client HTTP tests (mock fetch) |
| `push-gateway/` tests or `tests/pushGatewayWorker.test.ts` | Allowlist/auth/register tests |
| `README.md` | How to enable your own gateway |

---

### Task 1: Push settings + notify helpers (TDD)

**Files:**
- Create: `src/lib/pushSettings.ts`
- Create: `src/lib/pushNotify.ts`
- Create: `tests/pushSettings.test.ts`
- Create: `tests/pushNotify.test.ts`

**Interfaces:**
- Consumes: `localStorage`
- Produces:
  - `export type PushContentMode = 'Minimal' | 'Sender' | 'Preview'`
  - `export type PushTriggerMode = 'Background only' | 'Always'`
  - `export interface PushSettings { enabled: boolean; gatewayUrl: string; authToken: string; contentMode: PushContentMode; triggerMode: PushTriggerMode }`
  - `loadPushSettings(): PushSettings`
  - `savePushSettings(settings: PushSettings): void`
  - `isHttpsGatewayUrl(url: string): boolean`
  - `formatPushNotification(mode: PushContentMode, senderName: string, previewText: string): { title: string; body: string }`
  - `shouldSendRemotePush(opts: { triggerMode: PushTriggerMode; directConnected: boolean; relayConnected: boolean }): boolean`
  - `buildNotificationData(opts: { peerId: string; messageId: string }): { peerId: string; messageId: string; url: string }`

- [ ] **Step 1: Write failing tests**

`tests/pushSettings.test.ts`:

```typescript
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { loadPushSettings, savePushSettings, isHttpsGatewayUrl } from '../src/lib/pushSettings';

describe('pushSettings', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to disabled with safe defaults', () => {
    const s = loadPushSettings();
    expect(s.enabled).toBe(false);
    expect(s.gatewayUrl).toBe('');
    expect(s.authToken).toBe('');
    expect(s.contentMode).toBe('Sender');
    expect(s.triggerMode).toBe('Background only');
  });

  it('round-trips saved settings', () => {
    savePushSettings({
      enabled: true,
      gatewayUrl: 'https://example.com',
      authToken: 'tok',
      contentMode: 'Preview',
      triggerMode: 'Always',
    });
    expect(loadPushSettings()).toEqual({
      enabled: true,
      gatewayUrl: 'https://example.com',
      authToken: 'tok',
      contentMode: 'Preview',
      triggerMode: 'Always',
    });
  });

  it('accepts only https gateway URLs', () => {
    expect(isHttpsGatewayUrl('https://gw.example/')).toBe(true);
    expect(isHttpsGatewayUrl('http://gw.example/')).toBe(false);
    expect(isHttpsGatewayUrl('not-a-url')).toBe(false);
  });
});
```

`tests/pushNotify.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  formatPushNotification,
  shouldSendRemotePush,
  buildNotificationData,
} from '../src/lib/pushNotify';

describe('pushNotify', () => {
  it('formats Minimal / Sender / Preview', () => {
    expect(formatPushNotification('Minimal', 'Alice', 'hello world')).toEqual({
      title: 'ETHOS',
      body: 'New message',
    });
    expect(formatPushNotification('Sender', 'Alice', 'hello world')).toEqual({
      title: 'New chat from Alice',
      body: 'New message',
    });
    expect(formatPushNotification('Preview', 'Alice', 'hello world')).toEqual({
      title: 'New chat from Alice',
      body: 'hello world',
    });
  });

  it('truncates Preview body to 80 chars', () => {
    const long = 'x'.repeat(100);
    expect(formatPushNotification('Preview', 'A', long).body.length).toBe(80);
  });

  it('Background only sends when offline; Always always sends', () => {
    expect(
      shouldSendRemotePush({
        triggerMode: 'Background only',
        directConnected: false,
        relayConnected: false,
      })
    ).toBe(true);
    expect(
      shouldSendRemotePush({
        triggerMode: 'Background only',
        directConnected: true,
        relayConnected: false,
      })
    ).toBe(false);
    expect(
      shouldSendRemotePush({
        triggerMode: 'Always',
        directConnected: true,
        relayConnected: true,
      })
    ).toBe(true);
  });

  it('builds deep-link notification data', () => {
    expect(buildNotificationData({ peerId: 'p1', messageId: 'm1' })).toEqual({
      peerId: 'p1',
      messageId: 'm1',
      url: './#/chat/p1/m1',
    });
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL** (modules missing)

Run: `npm test -- tests/pushSettings.test.ts tests/pushNotify.test.ts`

- [ ] **Step 3: Implement**

`src/lib/pushSettings.ts` — storage key `ethos_push_settings`, JSON parse with defaults above; `isHttpsGatewayUrl` via `URL` + `protocol === 'https:'`.

`src/lib/pushNotify.ts` — implement formatters/predicate/`buildNotificationData` exactly as tests assert. Preview: `previewText.slice(0, 80)`.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/pushSettings.ts src/lib/pushNotify.ts tests/pushSettings.test.ts tests/pushNotify.test.ts
git commit -m "feat(push): add settings and notification formatting helpers"
```

---

### Task 2: Push gateway HTTP client (TDD)

**Files:**
- Create: `src/lib/pushGatewayClient.ts`
- Create: `tests/pushGatewayClient.test.ts`

**Interfaces:**
- Consumes: `fetch`, Task 1 `isHttpsGatewayUrl`
- Produces:
  - `normalizeGatewayBaseUrl(url: string): string` (trim, strip trailing slash)
  - `fetchVapidPublicKey(baseUrl: string, fetchFn?: typeof fetch): Promise<string>`
  - `registerPushSubscription(baseUrl: string, authToken: string, subscription: PushSubscriptionJSON, fetchFn?: typeof fetch): Promise<boolean>`
  - `sendViaPushGateway(opts: { baseUrl: string; authToken: string; subscription: PushSubscriptionJSON; title: string; body: string; data: Record<string, string>; fetchFn?: typeof fetch }): Promise<boolean>`

- [ ] **Step 1: Write failing tests** with mock `fetchFn` asserting:
  - `GET ${base}/v1/vapid-public-key` → returns `{ publicKey: '...' }` or raw string handled
  - `POST ${base}/v1/subscriptions` with `Authorization: Bearer ${token}` and JSON body `{ endpoint, keys }`
  - `POST ${base}/v1/push` with Bearer token and `{ subscription, notification: { title, body, data } }`
  - Rejects `http://` base URL without calling fetch
  - Returns `false` on non-OK responses

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- tests/pushGatewayClient.test.ts`

- [ ] **Step 3: Implement `src/lib/pushGatewayClient.ts`** per assertions. Auth header: `Authorization: Bearer <token>`.

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/pushGatewayClient.ts tests/pushGatewayClient.test.ts
git commit -m "feat(push): add portable push gateway HTTP client"
```

---

### Task 3: Reference Cloudflare Worker (secure-by-default)

**Files:**
- Create: `push-gateway/src/index.ts` (or `.js`)
- Create: `push-gateway/src/allowlist.ts`
- Create: `push-gateway/src/auth.ts`
- Create: `push-gateway/wrangler.toml`
- Create: `push-gateway/package.json`
- Create: `push-gateway/README.md` (English)
- Create: `push-gateway/scripts/generate-secrets.mjs`
- Create: `tests/pushGatewayAllowlist.test.ts` (and auth/register unit tests for pure helpers exported from allowlist — keep Worker logic testable by exporting pure functions)

**Interfaces:**
- Consumes: CF `env.AUTH_TOKEN`, `env.VAPID_PUBLIC_KEY`, `env.VAPID_PRIVATE_KEY`, `env.SUBSCRIPTIONS` (KV) optional — if KV not desired for v1, use in-memory Map with note that production should use KV; **prefer KV binding `SUBSCRIPTIONS`** for registration binding across isolates.
- Produces HTTP API as spec.

- [ ] **Step 1: Write failing tests for pure helpers**

```typescript
import { describe, it, expect } from 'vitest';
import { isAllowedPushEndpointHost } from '../push-gateway/src/allowlist';

describe('push endpoint allowlist', () => {
  it('allows known Web Push hosts', () => {
    expect(isAllowedPushEndpointHost('https://web.push.apple.com/foo')).toBe(true);
    expect(isAllowedPushEndpointHost('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isAllowedPushEndpointHost('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
  });

  it('rejects non-push hosts', () => {
    expect(isAllowedPushEndpointHost('https://evil.example/steal')).toBe(false);
    expect(isAllowedPushEndpointHost('http://web.push.apple.com/foo')).toBe(false);
  });
});
```

Allowlist exact hostnames (maintainable array): at minimum  
`web.push.apple.com`, `fcm.googleapis.com`, `updates.push.services.mozilla.com`, `push.services.mozilla.com`.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement allowlist + Worker routes**

Worker behavior:
- `GET /health` → `ok`
- `GET /v1/vapid-public-key` → `{ "publicKey": env.VAPID_PUBLIC_KEY }`
- `POST /v1/subscriptions` → require Bearer `env.AUTH_TOKEN`; validate allowlist; store `{ endpoint, keys, updatedAt }` in KV keyed by hash(endpoint) under token namespace; cap max subscriptions (e.g. 20); TTL e.g. 180 days
- `POST /v1/push` → require Bearer; require registration hit; allowlist; enforce title/body max lengths (e.g. 100/200); build Web Push request with VAPID; `fetch(endpoint)`; **never `console.log` title/body/keys**
- Simple in-memory/KV rate limit: e.g. max 30 pushes / token / minute → 429
- CORS: reflect simple `Access-Control-Allow-Origin: *` for POST with auth still required (widget on arbitrary origins), or echo request origin — auth is the control

Use a Workers-compatible web-push library; pin version in `push-gateway/package.json`.

`generate-secrets.mjs`: print `AUTH_TOKEN`, VAPID keys for `wrangler secret put`.

`README.md`: Deploy to Cloudflare button, secret generation, paste URL+token into ETHOS Settings, rotate secrets, note API is portable.

- [ ] **Step 4: Run allowlist tests PASS; smoke-test Worker with `wrangler dev` if available**

- [ ] **Step 5: Commit**

```bash
git add push-gateway tests/pushGatewayAllowlist.test.ts
git commit -m "feat(push-gateway): add secure-by-default Cloudflare reference Worker"
```

---

### Task 4: Wire subscribe + register + Iroh (TDD where practical)

**Files:**
- Modify: `src/lib/webPush.ts`
- Modify: `src/App.tsx` (subscription effect)
- Modify: `src/lib/iroh.ts` (handshake fields already have `pushEndpoint`; extend with `pushGatewayUrl`, `pushAuthToken`, `pushContentMode`, `pushTriggerMode`, `pushSubscription` JSON as needed)
- Test: extend `tests/webPush.test.ts` and/or new `tests/pushWiring.test.ts` for pure orchestration helper

**Interfaces:**
- Consumes: Task 1–2, `subscribeToWebPush`, `iroh.setPushSubscription`
- Produces: `enablePushPipeline(): Promise<boolean>` helper that: loads settings → validates HTTPS → fetch VAPID → subscribe → register → `iroh.setPushSubscription` + store gateway prefs on manager

- [ ] **Step 1: Add failing test for orchestration helper** e.g. `setupPushFromSettings(settings, deps)` with mocked fetch/subscribe/iroh.

- [ ] **Step 2: RED**

- [ ] **Step 3: Implement helper in `src/lib/pushPipeline.ts`; call from `App.tsx` when settings enabled; on disable, skip network.

Handshake: when sending `relay-helo` / `relay-helo-ack`, include:
```typescript
pushGatewayUrl: this.pushGatewayUrl,
pushAuthToken: this.pushAuthToken, // shared so peers can call recipient gateway
pushSubscription: this.pushSubscription?.toJSON?.() ?? null,
pushContentMode: this.pushContentMode,
pushTriggerMode: this.pushTriggerMode,
```
And setters on `IrohManager`. Also keep `pushEndpoint` derived from subscription.endpoint for backward compatibility.

On receive hello/ack: store peer’s gateway URL, token, subscription JSON, modes on a `peerPushProfiles: Map<string, PeerPushProfile>`.

- [ ] **Step 4: PASS focused tests**

- [ ] **Step 5: Commit**

```bash
git add src/lib/pushPipeline.ts src/lib/webPush.ts src/lib/iroh.ts src/App.tsx tests/*
git commit -m "feat(push): wire gateway subscribe, register, and handshake profile"
```

---

### Task 5: Unified send path (peer + widget)

**Files:**
- Modify: `src/lib/peerPush.ts`
- Modify: `src/widget/pushTrigger.ts`
- Modify: `src/lib/iroh.ts` `sendMessage`
- Modify: `src/widget/index.ts`
- Test: `tests/peerPush.test.ts`, `tests/pushTrigger.test.ts`

**Interfaces:**
- Consumes: `shouldSendRemotePush`, `formatPushNotification`, `buildNotificationData`, `sendViaPushGateway`
- Produces: `notifyPeerViaGateway(profile, opts) => Promise<boolean>` used by iroh + widget

Replace logic:

```typescript
// Decision
if (!peerProfile?.pushGatewayUrl || !peerProfile.pushAuthToken || !peerProfile.pushSubscription) return;
if (!shouldSendRemotePush({
  triggerMode: peerProfile.pushTriggerMode ?? 'Background only',
  directConnected,
  relayConnected,
})) return;

const { title, body } = formatPushNotification(
  peerProfile.pushContentMode ?? 'Sender',
  senderName,
  previewText
);
await sendViaPushGateway({
  baseUrl: peerProfile.pushGatewayUrl,
  authToken: peerProfile.pushAuthToken,
  subscription: peerProfile.pushSubscription,
  title,
  body,
  data: buildNotificationData({ peerId: localPeerIdOrOwnerId, messageId }),
});
```

Remove/stop using raw `sendDirectWebPush` vendor POST (keep function as deprecated wrapper that calls gateway if profile present, else returns false).

Widget: after handshake (or from `data-push-gateway-url` + `data-push-auth-token` attributes as optional bootstrap), use same helper. Prefer handshake profile from owner once connected; attributes are optional English-documented bootstrap for first message races.

- [ ] **Step 1: Update/extend tests** — assert gateway fetch called with Bearer; assert no fetch to `web.push.apple.com` from client.

- [ ] **Step 2: RED then GREEN**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(push): send widget and peer notifies via recipient gateway"
```

---

### Task 6: Deep link on notification click

**Files:**
- Modify: `public/sw.js`
- Modify: `src/App.tsx` (listen for `message` / hash `#/chat/:peerId/:messageId`)
- Test: pure helper already in Task 1; add `tests/pushDeepLink.test.ts` for hash parse if extracted

**Interfaces:**
- Produces: `parseChatDeepLink(hash: string): { peerId: string; messageId: string } | null`

- [ ] **Step 1: Failing test for `parseChatDeepLink`**

```typescript
expect(parseChatDeepLink('#/chat/peerABC/msg123')).toEqual({ peerId: 'peerABC', messageId: 'msg123' });
expect(parseChatDeepLink('#/other')).toBeNull();
```

- [ ] **Step 2: Implement parse helper in `pushNotify.ts`; SW `notificationclick`:

```javascript
const data = event.notification.data || {};
const targetUrl = data.url || './';
event.waitUntil((async () => {
  const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of all) {
    if ('focus' in client) {
      client.postMessage({ type: 'ethos_notification_open', peerId: data.peerId, messageId: data.messageId });
      return client.focus();
    }
  }
  if (clients.openWindow) return clients.openWindow(targetUrl);
})());
```

App: `navigator.serviceWorker.addEventListener('message', ...)` + on load parse `location.hash` → select peer chat and scroll to message id (reuse existing chat selection state setters).

- [ ] **Step 3: PASS + manual note in commit body**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(push): deep-link notification clicks to chat message"
```

---

### Task 7: Settings UI + Test Push labeling

**Files:**
- Modify: `src/App.tsx` (Node Configuration / OS Notifications section)
- English copy only

- [ ] **Step 1: Add Settings controls** bound to `loadPushSettings` / `savePushSettings`:
  - Enable background push
  - Gateway URL
  - Auth token (password-style input)
  - Content mode select
  - Notify when select
  - Short help: link/path to `push-gateway/README.md` / Cloudflare one-click; note any HTTPS API-compatible host works
  - On save/enable: call `enablePushPipeline()`
  - Rename existing button to **Test local notification**; optionally **Test gateway push** when enabled (calls gateway with a test payload to own subscription)

- [ ] **Step 2: `npm run lint` + relevant tests**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(settings): opt-in BYO push gateway controls"
```

---

### Task 8: README (English how-to)

**Files:**
- Modify: `README.md` — expand Web Push section with how-to enable own gateway (Cloudflare quick path + portable API), Settings fields, content/trigger modes, iPhone home-screen note, widget+peer same pipeline. Do not frame as a limitation essay.

- [ ] **Step 1: Write README section**

- [ ] **Step 2: Commit**

```bash
git commit -m "docs: explain opt-in BYO push gateway setup"
```

---

### Task 9: Release hygiene (when shipping to users)

**Files:** per `DEPLOY-CHECKLIST.md`

- [ ] Bump `package.json`, `APP_VERSION`, `CACHE_NAME`, `index.html` manifest `?v=`
- [ ] `ABOUT_CHANGELOG` + README changelog entry (English)
- [ ] Do **not** change canary dates unless weekly cadence requires it
- [ ] `npm run lint && npm test && npm run build`
- [ ] Commit release bump; staging/tag per checklist (only when asked to deploy)

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| Opt-in settings + modes | 1, 7 |
| Portable HTTP client | 2 |
| Reference Worker + security defaults | 3 |
| Subscribe/register/wire Iroh | 4 |
| Handshake share profile | 4 |
| Widget + peer unified send | 5 |
| Deep link click | 6 |
| README how-to | 8 |
| English throughout | Global |
| Deploy checklist | 9 |

## Self-review notes

- No ETHOS-hosted gateway in any task.
- Raw `sendDirectWebPush` vendor POST retired in Task 5.
- Auth token sharing via handshake is intentional so peers/widgets can call recipient gateway; document rotation in Worker README.

# Design: Opt-in BYO Push Gateway

**Date:** 2026-09-19  
**Status:** Approved in conversation (content mode A, trigger mode 3, deep-link A; no ETHOS-hosted servers; security-by-default for non-expert operators)

## Problem

Background OS notifications for ETHOS (widget → owner PWA and peer ↔ peer) do not work reliably today, especially on iPhone home-screen PWAs. Root causes include:

1. Push subscription is never wired into `IrohManager` (`setPushSubscription` unused).
2. `sendDirectWebPush` POSTs raw JSON to vendor endpoints (not Web Push / VAPID / RFC 8291) and fails under CORS.
3. “Test Push” only exercises local `showNotification`, not remote delivery.
4. Notification clicks do not deep-link to the correct chat message.

ETHOS cannot operate shared push servers. Users who want background push must bring their own minimal gateway.

## Goals

- One push pipeline for **widget** and **peer ↔ peer**.
- Works across Safari/Chrome (and equivalents) on macOS, Windows, Linux, Android, and **iPhone/iPad home-screen PWA** where the platform supports Web Push.
- **Opt-in** only; default is push gateway disabled.
- Users configure **their own** Cloudflare Worker URL in Settings.
- Ship Worker source + **one-click Deploy to Cloudflare** so non-experts get a working, **secure-by-default** gateway.
- User controls **notification content** and **when** to notify.
- Notification click opens the **correct conversation and message**.
- All user-facing docs, README, Settings copy, and code identifiers in **English**.

## Non-goals

- ETHOS-operated or default-hosted push gateway.
- Guaranteeing Web Push inside mobile Safari **without** “Add to Home Screen” (platform limitation).
- Logging or storing chat content on the gateway.
- “Full message” notification body mode on the lock screen.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Hosting | BYO Cloudflare Worker only |
| Default | Opt-in (disabled until user enables + sets URL) |
| Content modes | `Minimal` \| `Sender` \| `Preview` |
| Trigger modes | `Background only` \| `Always` |
| Notification click | Open correct peer/widget chat + highlight/scroll to `messageId` |
| README tone | Exact how-to for enabling your own gateway (not a “limitations” essay) |
| Security posture | Secure-by-default for operators who are not security experts |

## Architecture

### Roles

- **Recipient** owns the Worker (VAPID keypair + auth secret live only in Cloudflare Secrets).
- **Sender** (another ETHOS peer, or the website widget) calls the **recipient’s** gateway URL with an auth token obtained via E2EE handshake (or, for the owner’s own widget path, credentials provisioned for that owner).

The gateway is a dumb, authenticated pipe: it does not participate in chat E2EE and must not persist payloads.

### Settings (English UI)

Stored locally (e.g. `localStorage`), applied only when opt-in is on:

- `Enable background push` — boolean, **default false**
- `Push gateway URL` — HTTPS Worker URL
- `Notification content` — `Minimal` | `Sender` | `Preview` (default `Sender`)
- `Notify when` — `Background only` | `Always` (default `Background only`)

Help text explains Deploy to Cloudflare + paste URL. No requirement that the user invent secrets manually if deploy automates them (see Security).

### Content modes

| Mode | Title | Body |
|------|-------|------|
| `Minimal` | `ETHOS` | `New message` |
| `Sender` | `New chat from {name}` | `New message` |
| `Preview` | `New chat from {name}` | Up to ~80 characters of preview |

### Trigger modes

- `Background only` — send remote push only when the recipient is not reachable on a live transport the sender trusts as delivering the message now (no usable direct/relay delivery), **or** when the recipient’s advertised preference requires background delivery. Exact client predicate is defined in the implementation plan; must not spam when both sides are in an active foreground session exchanging messages live unless mode is `Always`.
- `Always` — also request a remote push for each new message (subject to gateway rate limits). Local OS notification when the app is already foreground remains allowed for UX consistency where useful.

Recipient preferences that affect what others send are shared over the encrypted handshake (or equivalent authenticated channel), not via the public Worker.

### Deep link

Notification `data` includes at least:

- `peerId` or conversation id
- `messageId`
- optional `url` path/hash the client understands

`notificationclick` in `public/sw.js` focuses an existing window or opens the app, then posts a message / uses URL hash so the React app selects that chat and scrolls/highlights that message. If the message is not yet in local history, open the conversation and surface a clear “jump when available” behavior rather than failing silently.

## Push gateway Worker

### Location

`push-gateway/` in this repository, with:

- Worker source (TypeScript or JS)
- `wrangler.toml`
- README (English) with **Deploy to Cloudflare** button / one-click instructions
- Scripts that **generate** VAPID keypair + auth token on first deploy and set Cloudflare Secrets (user does not need to invent crypto)

### HTTP API (illustrative)

- `GET /v1/vapid-public-key` — returns the application server public key for `PushManager.subscribe`
- `POST /v1/push` — body includes subscription (`endpoint`, `keys`), notification (`title`, `body`, `data`), auth header/token
- Optional: `GET /health` — no secrets

Fail closed on missing/invalid auth, disallowed endpoint host, oversized payload, or rate limit exceeded.

### Client integration

1. When opt-in + URL set: fetch VAPID public key → `subscribe` → `iroh.setPushSubscription` / persist.
2. Handshake shares: gateway URL, auth token material as designed for recipients, subscription JSON, content mode, trigger mode.
3. Replace insecure direct vendor POST with “POST to recipient gateway”.
4. Widget and peer senders use the same client helper.
5. Fix Test Push labeling in UI so it is clear it tests **local** permission/display; add a separate “Send test via gateway” when opt-in is configured (optional in first slice, recommended).

## Security (secure-by-default)

Target operators: people who are **not** security experts. Defaults must be safe; unsafe modes must be hard or impossible.

### Built-in controls (required)

1. **Auth token required** on all mutating routes (`POST /v1/push`). No anonymous push.
2. **Secrets only in Cloudflare Secrets** (VAPID private key, auth token). Never commit secrets; never ship private VAPID key to browsers.
3. **Deploy automation generates** strong random auth token + VAPID keypair and writes secrets — user copies Worker URL (+ token into ETHOS Settings if not delivered via a one-time setup page on the Worker that shows token once). Prefer a setup UX that does not encourage pasting secrets into public READMEs.
4. **Endpoint host allowlist** — only known Web Push endpoints (Apple, FCM, Mozilla, Windows, etc.). Reject everything else (SSRF protection).
5. **Payload limits** — max title/body/`data` size; strip/forbid HTML; plain text only.
6. **Rate limiting** — per auth token and per subscription endpoint (built into Worker; enabled by default).
7. **No body logging** — do not log title/body/`data`/subscription keys. At most aggregated counters (optional) without message content.
8. **No persistence** of push payloads or subscriptions on the Worker (beyond optional short-lived rate-limit state).
9. **CORS** — do not rely on `Origin` for authorization. Token auth is mandatory because widgets run on arbitrary sites.
10. **TLS only** — refuse non-HTTPS gateway URLs in the ETHOS client.
11. **Fail closed** — misconfiguration yields no push, not open relay.

### Threat model (summary)

| Threat | Mitigation |
|--------|------------|
| Spam to a known Worker URL | Auth token + rate limits |
| SSRF via `endpoint` | Host allowlist |
| Secret leakage in git | Secrets store + generated at deploy |
| XSS via notification text | Length limits + plain text |
| Operator turns on debug logging of bodies | Document strongly; default code paths never log bodies |
| Stolen token | User rotates secret in CF + Settings; deploy docs include rotate steps |

### Explicit non-protections

- A stolen auth token + VAPID private key (Cloudflare account compromise) can send pushes until rotated — same class as any BYO secret.
- The gateway cannot verify chat E2EE; it only delivers OS notifications the recipient opted into.

## README / docs (English)

Document:

1. Opt-in Settings fields and what each content/trigger mode means.
2. One-click Cloudflare deploy for `push-gateway/`.
3. Paste gateway URL (and token, if required by setup) into ETHOS.
4. iPhone: use home-screen PWA for background delivery.
5. Same pipeline for website widget and peer chats.

Do **not** center the docs on “this does not work without a server.” Center on **how to enable your own gateway**.

## Testing

- Unit tests for content-mode formatting, trigger predicates, host allowlist, deep-link payload shape.
- Worker tests for auth failure, allowlist rejection, happy-path push construction (mock `fetch` to vendor).
- Client tests: subscription wiring into Iroh; send path uses gateway not raw endpoint when opt-in.
- Manual matrix later: Safari/Chrome × macOS/iOS PWA; widget and peer.

## Success criteria

- With opt-in + user Worker: background notification can wake iPhone PWA and deep-link to the right message.
- With opt-in off: no gateway traffic; behavior remains local-only where applicable.
- Widget and peer share one send helper.
- Gateway is usable by non-experts without manual crypto, and is not an open relay by default.
- English throughout user-facing surfaces.

## Implementation follow-up

After this spec is approved as written, create an implementation plan under `docs/superpowers/plans/` and execute with TDD / subagent-driven development as requested by the project workflow.

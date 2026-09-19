# Design: Secure VAPID randomness + privacy-preserving peer push

**Date:** 2026-09-19  
**Status:** Approved in conversation (option A for peer push)

## Problem

1. **Code Scanning alert #1 (insecure randomness):** `getOrCreateVapidPublicKey()` in `src/lib/webPush.ts` falls back to `Math.random()` when SubtleCrypto fails or is unavailable. CodeQL flags this as insecure randomness for cryptographic key material.

2. **Uncommitted WIP in `src/lib/iroh.ts`:** Adds Web Push on every `sendMessage`, including when the peer is already connected, and puts the full chat message in plaintext in the push body. That breaks the E2E privacy model (ratchet-encrypted chat).

## Goals

- Eliminate `Math.random()` from VAPID key generation paths.
- Deliver offline peer notifications without leaking message plaintext.
- Implement via TDD; discard the uncommitted WIP and rebuild from tests.
- Keep widget push behavior unchanged (out of scope).

## Non-goals

- Persisting a real VAPID private key or implementing server-side VAPID JWT signing.
- Changing widget `sendDirectWebPush` payload format.
- Broader refactor of `IrohManager`.

## Design

### A. VAPID key generation (`src/lib/webPush.ts`)

**Primary path (unchanged intent):**  
If `crypto.subtle` is available, generate an ECDSA P-256 key pair, export the public key as raw bytes, encode as URL-safe base64 without padding, persist under `ethos_vapid_public_key` in `localStorage`.

**Fallback path (new):**  
If SubtleCrypto generation/export fails, or SubtleCrypto is missing, but `crypto.getRandomValues` exists:

1. Fill a 65-byte buffer with `crypto.getRandomValues` (same length class as an uncompressed P-256 public key used as `applicationServerKey`).
2. Encode with the same URL-safe base64 rules as the primary path.
3. Persist and return it.

**Hard failure:**  
If neither SubtleCrypto nor `getRandomValues` is available, throw an `Error` with a clear message. Do not invent keys from `Date.now()`, `Math.random()`, or fixed demo strings in browser environments.

**Node / non-browser:**  
Keep the existing early return `demo_vapid_key_for_node_env` when `localStorage` is undefined (tests / Node). That path is not used as a real push application server key in production browsers.

**Tests (`tests/webPush.test.ts`):**  
- Existing happy-path and reload tests remain.  
- Add coverage that generation never uses `Math.random` (e.g. spy that `Math.random` is not called during generation, and/or that fallback uses `getRandomValues`).  
- Add coverage that missing crypto surfaces an error rather than an insecure string (where environment can be stubbed).

### B. Peer offline push (`src/lib/iroh.ts` + small helpers)

**Discard WIP:** Reset uncommitted `iroh.ts` changes before implementation. Rebuild under TDD.

**Extract pure helpers** (new small module or colocated exports testable without full `IrohManager`), for example:

- `shouldSendPeerPush({ hasPushEndpoint, directConnected, relayConnected }): boolean`  
  Returns `true` only when `hasPushEndpoint && !directConnected && !relayConnected`.

- `buildPeerPushNotification(senderName: string): { title: string; body: string }`  
  - `title`: e.g. `New chat from ${senderName}` (sender display name already shared in signaling)  
  - `body`: exactly `New message` — never include message text

**`sendMessage` integration:**

1. Move `import { sendDirectWebPush } from '../widget/pushTrigger'` to the top of `iroh.ts` with other imports.
2. After encrypting / building the outbound message path decision, if `shouldSendPeerPush(...)` is true, call `sendDirectWebPush(endpoint, senderName, 'chat', 'New message')` (or adapt the helper so the push body stays `"New message"` without using chat plaintext). Errors are swallowed (`.catch(() => {})`) so push failure never blocks send.
3. Do **not** call push when direct WebRTC or relay is connected.
4. Message transport (direct / relay / handshake) remains as today.

**Privacy rule:** The chat plaintext `text` parameter must never be passed into the push payload builder or `sendDirectWebPush` for peer chat.

**Tests:** Unit tests for `shouldSendPeerPush` and `buildPeerPushNotification` covering:

| direct | relay | endpoint | expect push |
|--------|-------|----------|-------------|
| false  | false | yes      | yes         |
| true   | false | yes      | no          |
| false  | true  | yes      | no          |
| false  | false | no       | no          |

Plus assert body is `"New message"` and does not contain sample plaintext.

## Error handling

- VAPID: throw if no secure entropy source in browser; log nothing sensitive.
- Peer push: network/push failures are non-fatal; `sendMessage` continues.

## Testing strategy

- TDD for both areas: failing tests first, then minimal implementation.
- Prefer pure helpers for peer-push policy so tests stay unit-level.
- Run targeted Vitest files, then a broader related suite if needed.

## Success criteria

- No `Math.random()` in VAPID generation / fallback paths.
- Code Scanning insecure-randomness finding for this code path is addressable (secure entropy only).
- Offline-only peer push with generic body; no plaintext leak.
- Import placement correct; WIP discarded and replaced by tested code.
- Widget push unchanged.

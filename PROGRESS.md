# E T H O S Core - Progress Report

**Date:** 2026-07-03
**Version:** 3.1.58
**Component:** WebRTC Tunnel Establishment (`src/lib/iroh.ts`)
**Status:** Phase 1 and Phase 2 implemented; Phase 3+ remain on the reliable transport roadmap

---

## Problem Statement

Users could not establish secure WebRTC tunnels between peers. The root causes were layered:

1. **Signaling kind was parameterized replaceable** — offers got overwritten by ICE candidates on relays
2. **Signaling topic routing was broken** — answerer sent responses to wrong topic, offerer never received them
3. **WebRTC state machine mismanagement** — race conditions in signal delivery and connection registration
4. **Stale per-peer crypto state** — reconnection left old secrets/ratchets in memory
5. **Dead webOfTrust code** — `verifyNIP26Event()` was a no-op (empty Set) but added latency to every incoming signal

This report now covers the current public codebase. For the forward-looking task list, see `docs/plans/2026-06-11-reliable-peer-transport.md`.

Latest staging polish: the right-rail Network Metrics panel now uses real app diagnostics instead of decorative document-sync text, scrolls on mobile, and the mobile hamburger menu has a foregrounded, more opaque dropdown with larger click targets. The chat header now shows the secure transport mode only once with mobile-friendly truncation.

---

## Current Roadmap Status

| Phase | Status | Evidence |
|-------|--------|----------|
| Phase 1: Stabilize Signaling | Implemented | `src/lib/iroh.ts`, `tests/signaling-helpers.test.ts`, `tests/signaling.test.ts` |
| Phase 2: Add Production TURN Configuration | Implemented | `src/lib/iceServers.ts`, `tests/ice-servers.test.ts`, Settings UI, README ICE/TURN guidance |
| Phase 3: Add Manual SDP Pairing | Not started | Roadmap-only; no manual offer/answer flow in source |
| Phase 4: Add Encrypted Nostr Fallback Transport | Implemented | Dedicated relay data kind/topic, relay envelopes, replay rejection, confirmation gate, file limit, and session-bound relay context |
| Phase 5: Make Status Product-Friendly | Implemented | Main UI now shows direct/relay/connecting/unavailable product states |
| Phase 6: Verify Production Readiness | Not complete | Full manual verification matrix remains open |

---

## Root Cause Analysis

### Issue 1: Replaceable Signaling Kind (CRITICAL)

**Kind 20000 is in the 20000-29999 range → parameterized replaceable per NIP-33**

Relays only keep the latest event per (pubkey, d-tag). When a peer sends an offer then ICE candidates to the same topic, candidates OVERWRITE the offer. The remote peer never sees the offer.

Kind 20202 was tried as a fix but is ALSO in the 20000-29999 range → also parameterized replaceable.

**Fix:** Kind 41002 is in the 40000-49999 regular range → all events stored independently by relays.

### Issue 2: Signaling Topic Routing

The offerer was subscribing to `ticket` for responses, but the answerer was sending answers to `peerId` (offerer's ID). The answer never reached the offerer.

**Fix:** Offerer subscribes to both `ticket` (for incoming offers when someone connects to them) and its own `peerId` (for answers/candidates). Answerer sends responses to offerer's `peerId`.

### Issue 3: WebRTC State Machine

- Remote answers processed before local offer was set → "wrong state" errors
- Connections registered AFTER signaling → early signals lost
- No signal queuing for out-of-order delivery

**Fix:** Register connections before signaling, implement pending signal queue with deduplication.

### Issue 4: Per-Peer State Leaks

`secrets`, `ratchetStates`, `peerPks`, `handshakeStatus`, `pendingSignals` were not cleared on connection close/error. Dead connections destroyed but associated state remained.

**Fix:** Comprehensive cleanup in `peer.on('close')`, `peer.on('error')`, `handleNostrOffer()`, and `connectByTicket()`.

### Issue 5: webOfTrust Dead Code

`webOfTrust` was an empty Set by default. `verifyNIP26Event()` checked `this.webOfTrust.size > 0` → always returned `true`. But the `await` call on every incoming signal added unnecessary latency.

**Fix:** Removed all webOfTrust code in v3.1.3.

---

## Fix Timeline

| Version | Date | Fix | Impact |
|---------|------|-----|--------|
| v3.0.6 | 2026-04-25 | Signal queuing, connection registration before signaling, relay health | Partial — still used kind 20000 |
| v3.0.7 | 2026-04-25 | CORS proxy for pkarr (later reverted) | No — proxy was unreliable |
| v3.0.8 | 2026-04-25 | Per-peer state cleanup, pkarr direct fetch, relay connection robustness | Partial — signaling kind still broken |
| v3.0.9 | 2026-04-25 | Code review bug fixes, publish error handling | Partial — signaling kind still broken |
| v3.1.0 | 2026-04-26 | Kind 20202 (still replaceable — wrong range) | No — same NIP-33 overwrite bug |
| v3.1.1 | 2026-04-26 | Signaling topic routing fix | Partial — correct routing but kind still overwriting |
| v3.1.2 | 2026-04-27 | Kind 41002 (regular, non-replaceable), trickle re-enabled | YES — this is the critical fix |
| v3.1.3 | 2026-04-28 | Remove webOfTrust dead code, test fixes, docs sync | Cleanup — removes latency overhead |

---

## Current Architecture

### Signaling Flow (v3.1.2+)

```
Initiator (A)                          Responder (B)
    |                                       |
    | subscribes to: ticket, peerIdA        |
    |                                       | subscribes to: ticket
    |                                       |
    |--- offer (kind 41002, d: ticket) ---->|
    |                                       | subscribes to: peerIdA
    |<-- answer (kind 41002, d: peerIdA) ---|
    |<-- candidate (kind 41002, d: peerIdA)-|
    |--- candidate (kind 41002, d: peerIdA)>|
    |                                       |
    stable <------ WebRTC Data Channel ----> stable
```

Key: Kind 41002 events are regular (non-replaceable). Multiple events with same (pubkey, d-tag) are stored independently by relays. Offers are never overwritten by candidates.

### Kind Range Reference (NIP-01/NIP-33)

| Range | Type | Behavior |
|-------|------|----------|
| 0 | Replaceable | Only latest per pubkey |
| 1000–9999 | Regular | All stored |
| 10000–19999 | Regular | All stored |
| 20000–29999 | Parameterized replaceable (NIP-33) | Only latest per (pubkey, d-tag) |
| 30000–39999 | Parameterized replaceable | Only latest per (pubkey, d-tag) |
| 40000–49999 | Regular | All stored ← **kind 41002 here** |

---

## Files Modified

| File | Changes |
|------|---------|
| `src/lib/iroh.ts` | Kind 41002, signaling topic routing, trickle re-enable, webOfTrust removal, state cleanup, ICE/TURN usage |
| `src/lib/iceServers.ts` | User ICE/TURN parsing, persistence, hosted defaults, presets, and ICE candidate testing |
| `src/App.tsx` | APP_VERSION bumps, ICE/TURN Settings UI |
| `public/sw.js` | Cache name bumps |
| `index.html` | Manifest query param bumps |
| `package.json` | Version bumps |
| `tests/signaling.test.ts` | Kind 41002 assertions, relay tests skipped (need browser) |
| `tests/signaling-structure.test.ts` | Kind range verification tests |
| `tests/ice-servers.test.ts` | ICE/TURN server parsing, priority, persistence, and candidate summary tests |
| `README.md` | Changelog entries, ICE/TURN guidance, and release-flow documentation |
| `PROGRESS.md` | This file |

---

## Verification

### Automated Tests

```bash
npx vitest run tests/signaling-structure.test.ts tests/signaling.test.ts
# 12 passed, 3 skipped (relay integration tests need browser WebSocket)
```

Tests verify:
- Kind 20000/20202 are parameterized replaceable (NIP-33)
- Kind 41002 is regular (non-replaceable)
- Signal encryption/decryption roundtrip
- Multi-event preservation on same topic with kind 41002
- Full connection flow: offer → answer → candidate
- ICE/TURN URL parsing and validation
- User ICE/TURN server priority before hosted/default servers
- Local persistence under `nexus_ice_servers`
- Relay candidate reporting for the ICE test UI

### Build

```bash
npm run lint   # TypeScript type check
npm run build  # Vite production build
```

### Manual Testing Checklist

- [ ] Open two browsers, establish tunnel between two peers
- [ ] Verify no "wrong state" errors in console
- [ ] Verify messages flow bidirectionally
- [ ] Simulate relay failure → verify reconnection
- [ ] Test concurrent connection attempts
- [ ] Verify no webOfTrust errors in console

---

## Cache Invalidation Strategy

1. **Service Worker** – `CACHE_NAME = 'ethos-v3.1.58'` triggers fresh install
2. **localStorage version check** – Detects old version, clears stale data, hard reloads
3. **Manifest query param** – `manifest.webmanifest?v=3.1.58` bypasses browser cache
4. **Vite asset hashes** – Content-based filenames for long-term cache busting

---

## Known Limitations

- Pkarr DHT discovery is best-effort (CORS may block from GitHub Pages)
- Hosted TURN defaults are optional and must be injected at build time with `VITE_TURN_URLS`, `VITE_TURN_USERNAME`, and `VITE_TURN_CREDENTIAL`.
- Users can configure TURN in Settings; the bundled demo TURN fallback remains best-effort and is not production-grade.
- Relay integration tests skipped in Node.js (need browser WebSocket)
- No UI for managing relay list persistence across sessions
- Manual SDP pairing is not implemented yet.

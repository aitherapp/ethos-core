# E T H O S CORE

ETHOS is a browser-based secure messaging and file transfer app for people who want private peer-to-peer communication without creating an account. It uses hybrid quantum-safe encryption: today's standard elliptic-curve cryptography combined with ML-KEM, a post-quantum key exchange selected by NIST. Each browser becomes its own cryptographic node. Users share a node ticket, connect, then exchange messages and files through an encrypted tunnel.

The project is designed around one rule: user content must never fall back to plaintext. If direct peer-to-peer transport is unavailable, ETHOS uses encrypted relay transport instead of weakening the security model.

## What You Can Do

- Send end-to-end encrypted one-to-one messages.
- Create encrypted group chats with persisted group membership.
- Transfer encrypted files directly between devices when WebRTC is available.
- Continue communicating through encrypted Nostr relay fallback when a direct tunnel cannot be established.
- Use ETHOS from mobile Chrome/Safari and desktop browsers.
- Use the app without email, phone number, signup, or password account.
- Keep local chat history encrypted in the browser, with an optional passphrase lock.
- Copy mobile diagnostics from inside the app when a peer connection needs troubleshooting.
- Treat display-name discovery as unverified; direct peer tickets are the trusted connection path.
- On small screens, use the top-right menu for Network/Metrics, About, and Settings.

## How Connections Work

ETHOS uses public relays only to help peers find and reach each other. Relays are not trusted with message contents.

1. Each device creates a local cryptographic identity.
2. A user shares their node ticket with another user.
3. The apps exchange encrypted signaling events through Nostr relays.
4. The peers establish a secure session using hybrid quantum-safe key exchange.
5. Messages use a Double Ratchet so message keys evolve over time.
6. Files are split into encrypted chunks for transfer.
7. If direct WebRTC fails, ETHOS can use encrypted relay fallback for resilience.

## Security Model

ETHOS combines classical and quantum-safe post-quantum cryptography. This protects messages against today's attackers while preparing for future quantum computers:

- **Hybrid quantum-safe key exchange**: ML-KEM-1024 plus ECDH P-256.
- **Message protection**: Double Ratchet with AES-256-GCM message encryption.
- **Forward secrecy**: message keys evolve so one message key does not unlock the full conversation.
- **No plaintext fallback**: messages and files remain encrypted even when relayed.
- **Local identity**: your node identity is generated and stored in your browser.

Relays can help deliver encrypted signaling and fallback transport, but they should only see encrypted blobs and routing metadata. They should not be able to read message text, file contents, or cryptographic private keys.

## Local Data

ETHOS stores some data in the browser so the app can work after reloads:

- Your local cryptographic identity.
- Known peer list.
- Encrypted peer display metadata in IndexedDB.
- Encrypted group metadata in IndexedDB.
- Encrypted chat history in IndexedDB.
- Optional history-lock state.
- Redacted diagnostics logs for troubleshooting.

Chat history, peer display names, and group metadata are encrypted at rest. Users can also enable a chat-history passphrase lock from Settings. When enabled, saved conversations remain hidden after reload until the passphrase is entered.

Important limitation: if a device, browser profile, or active app session is compromised, local encryption cannot fully protect data already available to that running app. Keep the device secure and use the history lock on shared devices.

## Reliability Notes

ETHOS tries direct WebRTC first because it is fast and efficient. Some mobile networks, corporate networks, NATs, and sleeping browser tabs can block or interrupt direct connections. ETHOS therefore also supports encrypted relay fallback.

When relay fallback is active, ETHOS pins messages to the established secure relay session so reconnect attempts do not silently deliver messages on an outdated session.

If a peer reloads or asks to resync while the other browser still has stale in-memory relay state, ETHOS starts a fresh encrypted relay handshake instead of trusting the old connection state.

File transfers are reassembled by chunk offset, so relay reordering or duplicate delivery should not corrupt downloaded files.

For best mobile reliability:

- Keep the browser tab open and foregrounded while connecting.
- Ask the peer to open ETHOS before retrying.
- Avoid repeatedly tapping reconnect; the app throttles retries to reduce relay rate limits.
- Use the in-app Diagnostics copy button when reporting connection problems.
- On restrictive networks, configure production TURN in Settings and run **Test ICE Config** until relay candidates appear. See [ICE / TURN Configuration](#ice--turn-configuration).

## ICE / TURN Configuration

Direct WebRTC tunnels use **ICE** to discover network paths between peers. **STUN** helps with simple NAT traversal. **TURN** relays media when UDP is blocked or symmetric NAT prevents a direct path.

Nostr relays in Settings are for **signaling only** (helping peers exchange WebRTC offers/answers). They do not replace TURN for direct tunnel setup.

### Configure in the app

1. Open the app and go to **Settings** (top-right menu on mobile).
2. Scroll to **ICE / TURN Servers**.
3. Choose a provider preset or paste your own `stun:`, `turn:`, or `turns:` URLs.
4. Add optional TURN username and credential if your provider requires them.
5. Click **Add ICE Server**.
6. Click **Test ICE Config** and confirm the result reports relay candidates on networks that need TURN.
7. Click **Save Changes**.

Presets are provided for:

- Metered.ca
- Twilio Network Traversal
- Xirsys
- Self-hosted coturn
- Metered Open Relay (demo only)

Custom entries are stored locally in the browser as `nexus_ice_servers`. TURN credentials stay on the device; they are not sent over Nostr or included in identity export.

### Server priority

When establishing a direct tunnel, ETHOS uses ICE servers in this order:

1. **Custom servers** saved in Settings
2. **Hosted deployment defaults** from build-time environment variables (see below)
3. **Public STUN** fallbacks
4. **Demo TURN** (Metered Open Relay shared credentials) only when no production TURN is configured

The bundled demo TURN is best-effort and not suitable for production traffic. Use your own TURN pool for reliable direct connections on corporate Wi‑Fi, carrier NAT, and similar networks.

If direct WebRTC still cannot connect, ETHOS can continue in **encrypted Nostr relay mode** for text and small files. That path remains end-to-end encrypted.

### Hosted / developer defaults

For deployments you build yourself, you can inject default TURN settings through `.env` (see `.env.example`):

```bash
VITE_TURN_USERNAME=your-username
VITE_TURN_CREDENTIAL=your-credential
VITE_TURN_URLS=turn:turn.example.com:3478,turns:turn.example.com:443?transport=tcp
```

These hosted defaults are used after any user-configured ICE servers and before the public STUN/demo fallbacks.

Local development:

```bash
cp .env.example .env
# optionally fill VITE_TURN_* for your TURN pool
npm install
npm run dev
```

### Troubleshooting direct tunnels

- **Test ICE Config shows no relay candidates:** verify TURN URLs, username, credential, and that your provider allows browser WebRTC traffic.
- **Signaling works but direct tunnel fails:** you likely need working TURN, not more Nostr relays.
- **Direct tunnel fails but chat still works:** ETHOS is probably using encrypted Nostr relay fallback; check the peer transport label in the app.

## What ETHOS Does Not Claim

ETHOS is experimental software. It is built for strong privacy goals, but it has not had the same time, review, or independent audit history as mature messengers.

ETHOS does not claim:

- That browser storage is safe against a fully compromised device.
- That relays hide all metadata, such as timing and relay routing.
- That every mobile browser will keep connections alive while backgrounded.
- That the implementation has been independently audited.
- That it replaces mature, audited messengers for high-risk users today.

Advanced users can add their own relay to reduce dependence on public relays, but the relay operator may still observe connection timing and routing metadata.

## Verify ETHOS

ETHOS should be judged by verifiable artifacts, not by trust-us marketing. Public users can inspect:

- [`/trust/canary.txt`](public/trust/canary.txt): weekly warrant canary.
- [`/trust/canary-policy.md`](public/trust/canary-policy.md): what the canary means and what it cannot prove.
- [`/trust/cryptographic-design.md`](public/trust/cryptographic-design.md): public cryptographic design goals, relay limits, local-data limits, and audit status.
- [`/trust/reproducible-builds.md`](public/trust/reproducible-builds.md): how release receipts and GitHub artifact attestations are checked.
- `trust/release-manifest.json` and `trust/SHA256SUMS` in release builds: source, build, lockfile, and artifact hash receipts.

The source code is published on GitHub at [aitherapp/ethos-core](https://github.com/aitherapp/ethos-core). Anyone can inspect the implementation, verify the published trust artifacts, and reproduce release builds against the public hashes.

## Safe-Use Checklist

- Verify that you are using the expected node ticket for a peer.
- Keep ETHOS open while connecting or transferring files.
- Enable chat-history lock on shared or high-risk devices.
- Add a trusted relay if you want more control over the relay path.
- Export your identity only when you intend to move or back it up.
- Treat diagnostics logs as shareable troubleshooting data, but still review before sending.

## Support ETHOS

ETHOS is developed in the open under the AGPL-3.0 license. Voluntary Monero donations help sustain development.

Official Monero donation address:

```text
457gGJfBaW1KnE8xKorPQxFyrB6hkDvNtfS6JcGF77cDdfeQRKxuwTGNLKWrZohyym6KwKQ6DGJH52bYf4C5APwM4DPjUFD
```

Donations are voluntary support and do not unlock features. ETHOS does not verify payments in the browser. For better privacy, use Monero from a self-custody wallet instead of sending directly from a KYC exchange.

## Developer Notes

### Prerequisites

- Node.js 18+
- npm

### Install & Run

```bash
npm install
npm run dev
```

Open http://localhost:3000 to use the local development app.

### Useful Commands

```bash
npm run lint
npm test
npm run build
npm run build:release
```

For ICE/TURN setup in the running app, see [ICE / TURN Configuration](#ice--turn-configuration).

### Release Flow

ETHOS uses two GitHub Pages targets:

- **Staging:** pushes to the source `staging` branch, or manual runs of the staging workflow, deploy to `aitherapp/ethos-staging`.
- **Production:** version tags matching `v*`, or manual runs of the production workflow, deploy to `aitherapp/ethos`.

Pushing to `main` does not deploy production. Merge or push candidate work to `staging` first, test the staging Pages build, then promote a reviewed build with a version tag or a manual production workflow dispatch.

Required GitHub repository setup:

- Create a `staging` environment with `STAGING_DEPLOY_KEY` and optional `STAGING_TURN_URLS`, `STAGING_TURN_USERNAME`, and `STAGING_TURN_CREDENTIAL` secrets.
- Create a `production` environment with `PAGES_TOKEN` and optional `PRODUCTION_TURN_URLS`, `PRODUCTION_TURN_USERNAME`, and `PRODUCTION_TURN_CREDENTIAL` secrets.
- Protect the `production` environment with required reviewers so production deployments pause for approval before environment secrets are released.
- Enable GitHub Pages for the external staging repository, expected at `https://aitherapp.github.io/ethos-staging/`.

Staging builds intentionally use `npm run build` and do not create release receipts or GitHub artifact attestations. Production builds use `npm run build:release`, record release manifests, and verify artifact attestations before publishing.

### Tech Stack

- React + TypeScript + TailwindCSS
- Vite
- Web Crypto API
- ML-KEM-1024
- Nostr signaling
- WebRTC data channels

## Changelog

### v3.1.59 – Compact Mobile Header (2026-07-03)

- Shortened the secure transport badge on very small screens (`RELAY`, `DIRECT`, `GROUP`, `CHAT`) while preserving full labels on wider screens.
- Made the quantum-safe header status icon-only on the smallest screens so labels no longer collide.

### v3.1.58 – Mobile Panel Polish (2026-07-03)

- Made the mobile Network Diagnostics panel scrollable within the phone viewport so bottom content remains reachable.
- Removed the duplicate secure transport label from the chat header and tightened header spacing for mobile.

### v3.1.57 – Real Network Diagnostics (2026-07-03)

- Replaced the decorative Document Sync panel and fake sync speed with real diagnostics: relay count, active peers, selected transport mode, transfers, live relay sockets, reactions, and recent diagnostic entries.
- Made the mobile hamburger dropdown more solid, foregrounded, wider, and easier to click.

### v3.1.56 – Secure Relay Mode (2026-07-03)

**Encrypted relay fallback**
- Separated encrypted relay data events from signaling events with a dedicated Nostr kind and data topic.
- Added relay data envelopes with message IDs, nonces, session checks, and replay rejection.
- Bound relay fallback derivation to peer identity, relay session, and secure relay transport mode.
- Added explicit relay key confirmation before accepting fallback data.
- Limited relay-only file transfer to small files and tells users when direct files need TURN.

**Product status**
- Replaced protocol-heavy peer/header labels with `Secure direct tunnel`, `Secure relay mode`, and usable connection states.
- Relay-only success now clears the connecting state instead of leaving the UI stuck.

### v3.1.55 – Staging Release Flow (2026-07-03)

**Release workflow**
- Added a separate GitHub Pages staging deployment target for testing builds before production.
- Changed production deployment so `main` pushes no longer publish directly to users.
- Documented the staging-first release flow, required GitHub environments, and deployment secrets.

**Transport roadmap**
- Updated the reliable transport roadmap and progress notes to show Phase 1 and Phase 2 completion.
- Clarified that manual SDP pairing, encrypted fallback completion, product-friendly status, and final production verification remain open.

### v3.1.54 – Public Source Trust Copy (2026-07-02)

- Updated landing page and canary policy text so verification points to the public GitHub repository.
- Removed outdated language that implied only supporters could inspect source or reproduce builds.

### v3.1.53 – Production TURN Configuration (2026-07-02)

**Connection reliability**
- Added ICE/TURN server settings in the app with provider presets, local persistence, and ICE candidate testing.
- Direct WebRTC tunnels now prefer user-configured TURN before hosted and demo fallbacks.
- Documented ICE/TURN setup and troubleshooting in the README.

### v3.1.52 – Canary Date Refresh (2026-07-02)

**Trust model**
- Updated the public warrant canary to the current weekly statement date.
- Noted GitHub artifact attestation verification in the public canary text.
- Bumped the app and service-worker cache version so browsers fetch the refreshed canary.

### v3.1.51 – GitHub Artifact Attestations (2026-07-01)

**Release verification**
- Enabled signed GitHub artifact attestations in the public CI deploy workflow.
- Recorded attestation metadata in `trust/release-manifest.json` for deployed releases.
- Updated reproducible-build guidance with `gh attestation verify` instructions.

### v3.1.50 – Open Source Release (2026-07-01)

**Public repository**
- Published ETHOS Core on GitHub under AGPL-3.0 at [aitherapp/ethos-core](https://github.com/aitherapp/ethos-core).
- Updated README, trust docs, and in-app support copy for the open repository.
- Removed leftover AI Studio scaffolding and unused dependencies.
- Bumped the app and service-worker cache version for the release.

### v3.1.49 – Canary Verification Steps (2026-06-25)

**Trust model**
- Added SHA-256 verification instructions directly to the public warrant canary.
- Bumped the app and service-worker cache version so browsers fetch the updated canary text.

### v3.1.48 – Canary Date Refresh (2026-06-25)

**Trust model**
- Updated the public warrant canary to the current weekly statement date.
- Bumped the app and service-worker cache version so browsers fetch the refreshed canary.

### v3.1.47 – Private Repo Deploy Fix (2026-06-14)

**Release verification**
- Skipped GitHub artifact attestation on private source repositories where GitHub does not support it.
- Clarified that SHA-256 release receipts are the active verification path until attestations are available.
- Bumped the app and service-worker cache version so browsers fetch the corrected transparency release.

### v3.1.46 – Transparency Receipts (2026-06-14)

**Trust model**
- Added public canary, canary policy, cryptographic design, and reproducible-build guidance.
- Added release receipts with SHA-256 artifact hashes and CI provenance attestation wiring where GitHub supports it.
- Bumped the app and service-worker cache version so browsers fetch the transparency release.

### v3.1.45 – Landing Slogan Cleanup (2026-06-14)

**Public wording**
- Updated the landing-page slogan to “Secure peer-to-peer messaging” for clearer public positioning.

### v3.1.44 – Security Hardening (2026-06-14)

**Trust fixes**
- Bound claimed peer IDs to handshake public keys before accepting secure relay/WebRTC handshakes.
- Added bounded signaling queues and inbound file-transfer quotas to reduce public-topic and peer-level DoS risk.
- Upgraded locked chat history to a salted PBKDF2 envelope and raised passphrase guidance.
- Made display-name discovery explicitly unverified and added confirmation before connecting.
- Redacted peer/session/name/relay metadata from diagnostics exports by default.

### v3.1.43 – Landing Page Comparison (2026-06-14)

**Discovery**
- Added a public comparison section for ETHOS, Signal, and WhatsApp.
- Kept the copy careful about ETHOS being experimental while Signal and WhatsApp are mature messengers.

### v3.1.42 – Landing Copy Cleanup (2026-06-14)

**Public wording**
- Replaced the awkward server-focused slogan with clearer no-signup messaging.

### v3.1.41 – Public Landing Page (2026-06-14)

**Discovery**
- Added a public landing page at `/` for search engines and first-time visitors.
- Kept the full messaging app available at `/#app` and updated the PWA start URL to open the app directly.
- Added stronger SEO metadata, Open Graph/Twitter tags, and software application JSON-LD.

### v3.1.40 – Donation Action Cleanup (2026-06-14)

**Support ETHOS**
- Removed the Monero wallet-opening button because desktop browsers may not have a `monero:` handler installed.
- Kept the reliable address and wallet URI copy actions.

### v3.1.39 – Local ETHOS App Icon (2026-06-14)

**PWA assets**
- Replaced external `picsum.photos` manifest and favicon references with a local ETHOS SVG icon.
- Added the local icon to the service worker asset cache.

### v3.1.38 – Monero Support Donations (2026-06-14)

**Support ETHOS**
- Added a Monero-only donation card to the About modal with the official ETHOS support address.
- Added copy actions for the address and `monero:` wallet URI.
- Replaced the old donation placeholder copy with clear voluntary-support and privacy notes.

### v3.1.37 – ETHOS Branding Cleanup (2026-06-14)

**User-facing copy**
- Replaced old visible Iroh wording with ETHOS tunnel and peer-ticket language in the app shell.
- Updated the visible transport label from `iroh_hybrid/1` to `ethos_hybrid/1`.

### v3.1.36 – Styled Group Delete Confirmation (2026-06-14)

**Group UI polish**
- Replaced the browser-native group deletion confirmation with an ETHOS-styled modal.
- Clarified the difference between owner delete-for-everyone and local-only removal.

### v3.1.35 – Reliable Group Chat (2026-06-14)

**Group reliability**
- Sends group invites and group messages through the same encrypted per-peer WebRTC-or-secure-relay path used by one-to-one chat.
- Persists group metadata in encrypted IndexedDB storage and migrates legacy `nexus_groups` data out of plaintext localStorage.

**Group ownership**
- Adds an owner field to groups.
- Lets the owner delete a group for every member through encrypted group-delete control events.
- Lets non-owners remove a group locally.

### v3.1.34 – In-App Changelog (2026-06-13)

**User-facing release notes**
- Added a readable changelog to the About modal so users can see recent changes without visiting GitHub.
- Kept the entries focused on user-visible reliability, security, storage, and usability changes.

### v3.1.33 – Relay Resync & Chat Scroll Fixes (2026-06-13)

**Connection reliability**
- Responds to relay resync requests with a fresh secure relay handshake, even when stale in-memory state says an older relay is still connected.
- Keeps relay recovery end-to-end encrypted; no plaintext fallback was added.

**Chat usability**
- Stops forcing the chat view to the newest message while a user is scrolling up to read older messages.
- Keeps automatic scrolling when the user is already near the bottom of the conversation.

### v3.1.3 – Web of Trust Cleanup & Docs Sync (2026-04-28)

**Dead Code Removal**
- Removed all `webOfTrust` code: `verifyNIP26Event()`, `addToWebOfTrust()`, `removeFromWebOfTrust()`, `getWebOfTrust()`, `persistWebOfTrust()`, localStorage loading
- Removed NIP-26 event verification gate in signaling handler (was a no-op with empty Set, added latency to every incoming signal)
- Cleaned up `nexus_web_of_trust` localStorage key from version mismatch reset

**Test Fixes**
- Fixed signaling tests referencing old kind 20202 (now correctly 41002)
- Skipped relay integration tests (require browser WebSocket, not available in Node.js)

**Documentation**
- Synced README changelog with v3.1.0–v3.1.2 changes
- Updated PROGRESS.md with signaling kind fix and webOfTrust removal

### v3.1.2 – Signaling Kind Fix & Trickle Re-enable (2026-04-27)

**Critical Signaling Fix**
- Changed Nostr signaling kind from 20000 → 41002 (regular, non-replaceable)
- Kind 20000 is in the 20000-29999 parameterized replaceable range (NIP-33): relays only keep the latest event per (pubkey, d-tag), causing ICE candidates to overwrite offers
- Kind 41002 is in the 40000-49999 regular range: all events stored independently

**Trickle ICE Re-enabled**
- Re-enabled `trickle: true` on both initiator and responder
- With kind 41002 (non-replaceable), trickle candidates no longer overwrite offers/answers
- Restores proper ICE candidate delivery for NAT traversal

### v3.1.1 – Signaling Topic Routing Fix (2026-04-26)

**Signaling Flow Fix**
- Fixed offerer subscribing to `ticket` instead of own `peerId` for receiving answers
- Answerer now correctly sends responses to offerer's peerId (where offerer is listening)
- This was the root cause of "offer sent but answer never received"

### v3.1.0 – Non-Replaceable Event Kind (2026-04-26)

**Signaling Kind Migration**
- Changed signaling kind from 20000 to 20202 to avoid parameterized replaceable behavior
- Note: 20202 was later found to also be in the replaceable range (20000-29999), superseded by v3.1.2's kind 41002 fix

### v3.0.9 – Bug Fixes from Code Review (2026-04-25)

**Bug Fixes**
- Fix `peer.on('error')` handler missing `handshakeStatus.delete()` causing stale state
- Fix unbounded recursive reconnect on ICE failure – now bounded to 3 retries with 3s delay
- Fix `publishToNostrDiscovery()` fire-and-forget causing unhandled promise rejections
- Fix `reconnect()` not destroying peer connections or cleaning up per-peer crypto state
- Fix `handleNostrOffer()` error path not cleaning up all per-peer Maps

**Cache Invalidation**
- Bumped service worker cache name to `ethos-v3.0.9`
- Incremented manifest query param to ?v=1.6

### v3.1.7 – Signaling Session Isolation (2026-06-11)

**WebRTC signaling fixes**
- Added per-connection `sessionId` values to offers, answers, and ICE candidates
- Ignores stale relay-retained answers/candidates from previous connection attempts
- Prevents `setRemoteDescription(...answer...)` from running after the peer is already stable
- Each retry creates a fresh signaling session, so TURN retries are isolated from older direct attempts

### v3.1.6 – ICE Fallback Retry Fix (2026-06-11)

**WebRTC tunnel fixes**
- Fixed ICE retry hook to use SimplePeer's actual `iceStateChange` event and `ERR_ICE_CONNECTION_FAILURE` error path
- Preserved retry counters across reconnect attempts instead of resetting them on each retry
- Escalates later retries to TURN relay-only mode (`iceTransportPolicy: 'relay'`) when direct/STUN paths fail
- Added `VITE_TURN_URLS` override for production TURN pools

### v3.1.5 – Connection Reliability & Soft Failure (2026-06-11)

**P2P tunnel fixes**
- Restored pending-signal flush (answers/candidates that arrive before WebRTC is ready)
- Added TURN fallback via Open Relay Project for symmetric NAT / UDP-blocked networks
- Bounded ICE retry (3 attempts) for outbound connections
- Extended signaling TTL to 5 minutes; setup failures now mark peers as FAILED

**Soft failure UX**
- Disconnected peers stay in the sidebar with a FAILED badge instead of disappearing
- Click a failed peer to retry the tunnel; peer names and metadata are preserved

**Optional TURN credentials** — set in `.env` for production:
```
VITE_TURN_USERNAME=your-username
VITE_TURN_CREDENTIAL=your-credential
VITE_TURN_URLS=turn:turn.example.com:3478,turns:turn.example.com:443?transport=tcp
```

### v3.0.8 – Reconnection & Pkarr Fixes (2026-04-25)

**Reconnection Fixes**
- Clean up all per-peer crypto state (secrets, ratchet, keys) on connection close/error
- Clean up stale state in `connectByTicket` and `handleNostrOffer` before reconnecting
- Ensure dead connections are properly destroyed and removed from all maps
- Fix relay connections to always attempt all relays (removed unhealthy gate that prevented connections)

**Pkarr Discovery Fix**
- Reverted pkarr DHT to simple direct fetch (CORS errors caught and ignored as best-effort)
- Removed broken CORS proxy code that caused 404s and unhandled rejections
- Pkarr now works reliably on GitHub Pages without third-party proxies

**Cache Invalidation**
- Bumped service worker cache name to `ethos-v3.0.8`
- Incremented manifest query param to ?v=1.5

### v3.0.6 – WebRTC Reliability & Rate Limiting (2026-04-25)

**WebRTC Tunnel Fixes**
- Fixed "Failed to set remote description: Called in wrong state" errors by implementing signal queuing and proper connection lifecycle management
- Resolved "No connection found" errors by registering connections before signaling and flushing pending signals
- Added out-of-order ICE candidate buffering to prevent race conditions
- Disabled ICE trickle (`trickle: false`) to send all candidates in offer/answer, reducing signaling load by ~95% and preventing relay rate-limiting

**Relay & Signaling Improvements**
- Implemented relay health monitoring with automatic failover to healthy relays
- Added proper async error handling for Nostr publish rejections (rate-limit, policy violations)
- Version mismatch detection now triggers hard reload to avoid stale in-memory state

**Cache Invalidation**
- Bumped service worker cache name to `ethos-v3.0.6` for clean upgrade
- Updated localStorage version check to force migration and reload
- Incremented manifest query param to ?v=1.3 to bypass browser cache

### v3.0.5 – Initial Beta Release (2026-04-25)

Initial beta release with post-quantum hybrid key exchange, Double Ratchet, and Nostr signaling.

## License

AGPL-3.0 license

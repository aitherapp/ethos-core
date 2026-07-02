# ETHOS Cryptographic Design

ETHOS is built around a narrow rule: user content must never fall back to
plaintext. If a direct browser-to-browser path cannot be established, ETHOS
uses encrypted relay transport instead of weakening the content encryption
model.

This document describes the public design goals and limits. It is not an
independent audit report.

## Goals

- No account, phone number, email address, or password account is required.
- Each browser creates and stores its own local cryptographic identity.
- One-to-one messages, group messages, files, and local history are protected
  by encryption.
- Public relays can help with discovery, signaling, and fallback transport,
  but they are not trusted with plaintext message or file content.
- The implementation combines current elliptic-curve cryptography with a
  post-quantum key agreement layer.

## Session Establishment

ETHOS sessions use hybrid key agreement:

- ECDH P-256 for a widely deployed classical elliptic-curve component.
- ML-KEM-1024 for a post-quantum component selected by NIST.

The session design is hybrid: both components contribute to the secure
session. This protects against ordinary classical attackers today while
reducing exposure to future harvest-now-decrypt-later attacks.

## Message Protection

Messages use a Double Ratchet construction with AES-256-GCM message
encryption. Message keys evolve over time, so one exposed message key should
not unlock the entire conversation history.

ETHOS does not intentionally provide a plaintext transport mode for user
content. When direct WebRTC is available, encrypted content moves over the
direct peer path. When direct WebRTC is not available, encrypted content may
move through relay fallback.

## Files And Groups

Files are split into chunks and protected before transfer. Group messages are
sent over encrypted per-peer channels. Group metadata is stored locally and is
encrypted at rest.

ETHOS group behavior is designed for small, private peer groups rather than
large public rooms.

## Local Data

ETHOS stores data in the browser so the app can survive reloads:

- Local cryptographic identity.
- Known peers.
- Peer display metadata.
- Group metadata.
- Chat history.
- Optional history-lock state.
- Redacted diagnostics.

Chat history, display metadata, and group metadata are encrypted in IndexedDB.
Users can enable a passphrase history lock so saved conversations remain
hidden after reload until the passphrase is entered.

Browser storage encryption does not protect data that is already available to
a running compromised browser profile, compromised device, malicious extension,
or active app session.

## Relay And Metadata Limits

Relays should see encrypted blobs and routing metadata, not plaintext message
text, file contents, or private cryptographic keys.

Relays may still observe metadata such as:

- Approximate connection timing.
- Relay routing paths.
- Message and file-transfer activity timing.
- IP-level network metadata visible to relay infrastructure.

Advanced users can add their own trusted relay to reduce dependence on public
relays, but operating a relay does not remove all metadata exposure.

## Source And Build Verification

The public web app publishes transparency artifacts that anyone can inspect:

- Warrant canary.
- Cryptographic design note.
- Release manifest.
- SHA-256 release hashes.
- GitHub artifact attestations for production releases built from the public repository.

The source code is published on GitHub at https://github.com/aitherapp/ethos-core.
Anyone can inspect the implementation and reproduce release builds using the
public release receipt.

ETHOS is licensed under AGPL-3.0.

## Audit Status

ETHOS is experimental software and has not been independently audited. It is
not yet a replacement for mature, widely reviewed messengers for high-risk
users.

Security reports and reproducibility mismatches should be treated as serious
project input: publish the finding, fix the issue, and update the release
receipt or design note when behavior changes.

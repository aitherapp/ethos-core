import * as dnsPacket from 'dns-packet';
import bencode from 'bencode';
import Pkarr, { z32, SignedPacket } from 'pkarr';
import { generateIdentity, hashId, deriveHybridSecret, encryptData, decryptText, decryptData, QuantumIdentity, importIdentity, exportIdentity, b64encode, initializeRatchet, ratchetEncrypt, ratchetDecrypt, RatchetState, doesPublicKeyMatchPeerId } from './crypto';
import { Identity, SecureMessage, FileTransfer, Group } from '../types';
import { v4 as uuidv4 } from 'uuid';
import * as ed from '@noble/ed25519';
import { sha512 } from 'js-sha512';
import SimplePeer from 'simple-peer/simplepeer.min.js';
import { SimplePool, getPublicKey, getEventHash, nip19, finalizeEvent } from 'nostr-tools';
import { diagnosticsLog } from './diagnostics';
import {
  clearUserIceServers,
  loadUserIceServers,
  saveUserIceServers,
  testIceConfiguration,
  buildIceServers,
  type UserIceServer,
} from './iceServers';
import { normalizeGroupMembers } from './groups';
import { IndexedDbMessageHistoryStore, loadEncryptedGroups, loadEncryptedPeerMetadata, PeerMetadata, saveEncryptedGroups, saveEncryptedPeerMetadata } from './messageHistory';

const CHUNK_SIZE = 16384;
const MAX_PENDING_SIGNAL_PEERS = 64;
const MAX_PENDING_SIGNALS_PER_PEER = 12;
const MAX_INBOUND_FILE_SIZE = 50 * 1024 * 1024;
const MAX_INBOUND_CHUNKS_PER_TRANSFER = Math.ceil(MAX_INBOUND_FILE_SIZE / CHUNK_SIZE) + 2;
const MAX_ACTIVE_INBOUND_TRANSFERS_PER_PEER = 3;
const INBOUND_TRANSFER_TIMEOUT_MS = 10 * 60 * 1000;
export const DEFAULT_NOSTR_RELAYS = [
  'wss://nos.lol',
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://offchain.pub',
  'wss://nostr.mom'
];

export const PKARR_RELAYS = [
  'https://relay.pkarr.org'
];

let NOSTR_RELAYS = [...DEFAULT_NOSTR_RELAYS];

const savedRelays = typeof localStorage !== 'undefined'
  ? localStorage.getItem('nexus_custom_relays')
  : null;
if (savedRelays) {
  try {
    const parsed = JSON.parse(savedRelays);
    if (Array.isArray(parsed) && parsed.length > 0) {
      NOSTR_RELAYS = parsed;
    }
  } catch (e) {}
}

let USER_ICE_SERVERS = loadUserIceServers();

export const SIGNAL_KIND = 41002;

export function buildSignalTags(topicId: string, iv: string, sessionId?: string) {
  const tags = [['d', topicId], ['iv', iv]];
  if (sessionId) tags.push(['sid', sessionId]);
  return tags;
}

export function isSignalForSession(currentSession: string | undefined, signalSession: string | undefined) {
  if (!currentSession) return true;
  return signalSession === currentSession;
}

export function isStableAnswerSignalError(signalType: string, err: unknown) {
  const message = err instanceof Error ? err.message : String((err as any)?.message || err || '');
  return (signalType === 'answer' || signalType === 'sdp') &&
    /setRemoteDescription|Called in wrong state: stable|stable/i.test(message);
}

export function getDeterministicRelayRole(currentPeerId: string, peerId: string) {
  return currentPeerId < peerId ? 'initiator' : 'responder';
}

export class BoundedEventCache {
  private seen = new Set<string>();
  private order: string[] = [];

  constructor(private readonly maxSize = 500) {}

  has(id: string) {
    return this.seen.has(id);
  }

  add(id: string) {
    if (this.seen.has(id)) return;

    this.seen.add(id);
    this.order.push(id);

    while (this.order.length > this.maxSize) {
      const oldest = this.order.shift();
      if (oldest) this.seen.delete(oldest);
    }
  }
}

export type SignalRelayHealth = {
  status: 'healthy' | 'unhealthy' | 'unknown';
  lastCheck: number;
};

export function selectSignalPublishRelays(
  relays: string[],
  health: Map<string, SignalRelayHealth>,
  signalType = 'unknown'
) {
  if (signalType === 'candidate') {
    const healthy = relays.filter(relayUrl => health.get(relayUrl)?.status === 'healthy');
    const unknown = relays.filter(relayUrl => !health.has(relayUrl));
    const usable = [...healthy, ...unknown];
    const fallback = relays.filter(relayUrl => health.get(relayUrl)?.status !== 'unhealthy');
    const selected = usable.length > 0 ? usable : fallback;

    return (selected.length > 0 ? selected : relays).slice(0, 2);
  }

  return [...relays];
}

export function selectVisiblePeers({
  connectedPeers,
  relayPeers,
  handshakenPeers,
  metadataPeers,
}: {
  connectedPeers: string[];
  relayPeers: string[];
  handshakenPeers: string[];
  metadataPeers: string[];
}) {
  return [...new Set([
    ...connectedPeers,
    ...relayPeers,
    ...handshakenPeers,
    ...metadataPeers,
  ])];
}

export function selectConnectedPeers({
  connectedPeers,
  relayPeers,
}: {
  connectedPeers: string[];
  relayPeers: string[];
}) {
  return [...new Set([
    ...connectedPeers,
    ...relayPeers,
  ])];
}

export type RelayConnectionStatus = 'connecting' | 'connected';

export function shouldAcceptRelayHello(
  existingSession: string | undefined,
  relayStatus: RelayConnectionStatus | undefined,
  incomingSession: string | undefined
) {
  if (!incomingSession) return false;
  return relayStatus !== 'connected' || existingSession !== incomingSession;
}

export function shouldSendRelayHelloForSync(role: 'initiator' | 'responder') {
  return role === 'initiator';
}

export function shouldProcessRelayHelloAck({
  attemptedSession,
  establishedSession,
  relayStatus,
  incomingSession,
}: {
  attemptedSession: string | undefined;
  establishedSession: string | undefined;
  relayStatus: RelayConnectionStatus | undefined;
  incomingSession: string | undefined;
}) {
  if (!incomingSession || attemptedSession !== incomingSession) return false;
  return relayStatus !== 'connected' || establishedSession !== incomingSession;
}

export function isRelayMessageForSession(establishedSession: string | undefined, incomingSession: string | undefined) {
  return !establishedSession || incomingSession === establishedSession;
}

export function canQueueSignal({
  existingPeerQueueLength,
  pendingPeerCount,
  peerAlreadyQueued,
  maxSignalsPerPeer,
  maxPendingPeers,
}: {
  existingPeerQueueLength: number;
  pendingPeerCount: number;
  peerAlreadyQueued: boolean;
  maxSignalsPerPeer: number;
  maxPendingPeers: number;
}) {
  if (existingPeerQueueLength >= maxSignalsPerPeer) return false;
  if (!peerAlreadyQueued && pendingPeerCount >= maxPendingPeers) return false;
  return true;
}

export function addFileChunk(chunks: Map<number, Uint8Array>, offset: number, chunk: Uint8Array) {
  if (!Number.isFinite(offset) || offset < 0 || chunks.has(offset)) return 0;
  const end = offset + chunk.length;
  for (const [existingOffset, existingChunk] of chunks.entries()) {
    const existingEnd = existingOffset + existingChunk.length;
    if (offset < existingEnd && end > existingOffset) return 0;
  }

  chunks.set(offset, chunk);
  return chunk.length;
}

export function assembleFileChunks(chunks: Map<number, Uint8Array>) {
  const orderedChunks = Array.from(chunks.entries())
    .sort(([offsetA], [offsetB]) => offsetA - offsetB)
    .map(([, chunk]) => chunk);
  const totalLength = orderedChunks.reduce((total, chunk) => total + chunk.length, 0);
  const assembled = new Uint8Array(totalLength);
  let cursor = 0;

  orderedChunks.forEach(chunk => {
    assembled.set(chunk, cursor);
    cursor += chunk.length;
  });

  return assembled;
}

export function validateInboundFileChunk({
  offset,
  chunkSize,
  totalSize,
  maxFileSize,
  existingChunkCount,
  maxChunksPerTransfer,
}: {
  offset: number;
  chunkSize: number;
  totalSize: number;
  maxFileSize: number;
  existingChunkCount: number;
  maxChunksPerTransfer: number;
}): { ok: true } | { ok: false; reason: string } {
  if (!Number.isFinite(offset) || offset < 0) return { ok: false, reason: 'invalid-offset' };
  if (!Number.isFinite(chunkSize) || chunkSize <= 0) return { ok: false, reason: 'invalid-chunk-size' };
  if (!Number.isFinite(totalSize) || totalSize <= 0) return { ok: false, reason: 'invalid-total-size' };
  if (totalSize > maxFileSize) return { ok: false, reason: 'file-too-large' };
  if (existingChunkCount >= maxChunksPerTransfer) return { ok: false, reason: 'too-many-chunks' };
  if (offset + chunkSize > totalSize) return { ok: false, reason: 'chunk-out-of-range' };
  return { ok: true };
}

export function selectStaleTransferIds(
  transfers: Map<string, Pick<FileTransfer, 'status' | 'type'>>,
  startedAt: Map<string, number>,
  now: number,
  timeoutMs: number
) {
  return Array.from(transfers.entries())
    .filter(([id, transfer]) => (
      transfer.type === 'download' &&
      transfer.status === 'active' &&
      startedAt.has(id) &&
      now - startedAt.get(id)! >= timeoutMs
    ))
    .map(([id]) => id);
}

export function shouldProcessWebRtcOffer(relayStatus: RelayConnectionStatus | undefined) {
  return relayStatus !== 'connected';
}

export function shouldStartConnectionAttempt(lastAttemptAt: number | undefined, now: number, cooldownMs: number) {
  return lastAttemptAt === undefined || now - lastAttemptAt >= cooldownMs;
}

export function hasConnectionAttemptTimedOut(startedAt: number | undefined, now: number, timeoutMs: number) {
  return startedAt !== undefined && now - startedAt >= timeoutMs;
}

export type DiscoveryResult = {
  peerId: string;
  timestamp?: number;
};

export function chooseDiscoveryResult({
  pkarrPeerId,
  nostrResult,
  now,
  maxAgeMs,
}: {
  pkarrPeerId: string | null;
  nostrResult: DiscoveryResult | null;
  now: number;
  maxAgeMs: number;
}) {
  if (nostrResult?.peerId && nostrResult.timestamp && now - nostrResult.timestamp <= maxAgeMs) {
    return nostrResult.peerId;
  }

  return pkarrPeerId || nostrResult?.peerId || null;
}

export function syncLocalVersion(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  currentVersion: string,
  versionKey = 'nexus_iroh_ver'
) {
  if (storage.getItem(versionKey) === currentVersion) return false;
  storage.setItem(versionKey, currentVersion);
  return true;
}

// Configure Ed25519 v2 with SHA-512 hooks
// 1. Synchronous hook (using js-sha512) - Required for Pkarr and some internal methods
// @ts-ignore
ed.hashes.sha512 = (...m) => {
  const hash = sha512.create();
  for (const arr of m) hash.update(arr);
  return new Uint8Array(hash.arrayBuffer());
};

// 2. Asynchronous hook (using Web Crypto) - Used for ed.signAsync and ed.getPublicKeyAsync
// @ts-ignore
ed.hashes.sha512Async = (...m) => {
  const length = m.reduce((acc, x) => acc + x.length, 0);
  const combined = new Uint8Array(length);
  let offset = 0;
  for (const arr of m) {
    combined.set(arr, offset);
    offset += arr.length;
  }
  return crypto.subtle.digest('SHA-512', combined).then(b => new Uint8Array(b));
};

export class IrohManager {
  private identity: Identity | null = null;
  private qIdentity: QuantumIdentity | null = null;
  private connections: Map<string, any> = new Map();
  private secrets: Map<string, CryptoKey> = new Map();
  private ratchetStates: Map<string, RatchetState> = new Map();
  private peerPks: Map<string, { classical: string; pqc: string }> = new Map();
  private peerMetadata: Map<string, { displayName: string }> = new Map();
  private peerMetadataStore = new IndexedDbMessageHistoryStore();
  private groupStore = new IndexedDbMessageHistoryStore();
  private handshakeStatus: Map<string, boolean> = new Map();
  private connectionStatus: Map<string, 'connecting' | 'connected' | 'failed'> = new Map();
  private groups: Map<string, Group> = new Map();
  private transfers: Map<string, FileTransfer> = new Map();
  private fileChunks: Map<string, Map<number, Uint8Array>> = new Map();
  private transferStartedAt: Map<string, number> = new Map();
  private pendingSignals: Map<string, any[]> = new Map();
  private iceReconnectRetries: Map<string, number> = new Map();
  private retryingPeers: Set<string> = new Set();
  private signalSessions: Map<string, string> = new Map();
  private processedEventIds = new BoundedEventCache();
  private relaySessions: Map<string, string> = new Map();
  private establishedRelaySessions: Map<string, string> = new Map();
  private relayStatus: Map<string, 'connecting' | 'connected'> = new Map();
  private relayHelloAcks: Map<string, any> = new Map();
  private relayHealth: Map<string, SignalRelayHealth> = new Map();
  private connectionAttemptStartedAt: Map<string, number> = new Map();
  private noResponseTimers: Map<string, number> = new Map();

  private static readonly SIGNAL_MAX_AGE_SEC = 300;
  private static readonly DISCOVERY_ANNOUNCEMENT_MAX_AGE_MS = IrohManager.SIGNAL_MAX_AGE_SEC * 1000;
  private static readonly ICE_MAX_RETRIES = 3;
  private static readonly ICE_RETRY_DELAY_MS = 3000;
  private static readonly PEER_RESPONSE_TIMEOUT_MS = 20000;
  private static readonly CONNECTION_ATTEMPT_COOLDOWN_MS = 30000;

  private onMessageCallback: ((msg: SecureMessage) => void) | null = null;
  private onGroupUpdateCallback: ((groups: Group[]) => void) | null = null;
  private onTransferUpdateCallback: ((transfers: FileTransfer[]) => void) | null = null;
  private onStatusCallback: ((type: 'info' | 'error' | 'warning', message: string) => void) | null = null;
  private onSignalStatusCallback: ((count: number) => void) | null = null;
  
  private nostrPool = new SimplePool();
  private currentPeerId: string | null = null;
  private signKey: Uint8Array | null = null;
  private isSignalingSettled = false;
  private activeSubscriptions: Set<string> = new Set();
  private nostrSubs: Map<string, any> = new Map();

  async initialize(displayName: string) {
    // Defensive initialization
    if (!this.activeSubscriptions) this.activeSubscriptions = new Set();
    if (!this.nostrSubs) this.nostrSubs = new Map();
    if (!this.connections) this.connections = new Map();
    if (!this.secrets) this.secrets = new Map();

    const savedIdentity = localStorage.getItem('nexus_identity');
    if (savedIdentity) {
      try {
        this.qIdentity = await importIdentity(savedIdentity);
      } catch (e) {
        this.qIdentity = await generateIdentity();
      }
    } else {
      this.qIdentity = await generateIdentity();
      const serialized = await exportIdentity(this.qIdentity);
      localStorage.setItem('nexus_identity', serialized);
    }

    // Refresh assets on version mismatch without deleting user-facing metadata.
    if (syncLocalVersion(localStorage, '3.1.55')) {
      // Hard reload to clear in-memory state and fetch fresh assets
      window.location.replace(window.location.href);
      return;
    }

    const id = await hashId(this.qIdentity.classicalPublicKey);
    this.currentPeerId = id;
    
    // Step 1: Connect to all Nostr relays unconditionally (let the pool handle reconnection)
    NOSTR_RELAYS.forEach(url => {
      try {
        (this.nostrPool as any).ensureRelay(url).catch(() => {});
      } catch (e) {}
    });

    // Mesh Status Logic for nostr-tools v2
    setInterval(() => {
      let active = 0;
      try {
        const pool = (this.nostrPool as any);
        // Direct access to the relay Map in nostr-tools v2 SimplePool
        const relayMap = pool.relays || pool._relays;
        if (relayMap) {
          relayMap.forEach((relay: any) => {
            // Check for websocket readyState 1 (OPEN) or pool-level status 1
            if (relay && (relay.status === 1 || (relay.ws && relay.ws.readyState === 1))) {
              active++;
            }
          });
        }
      } catch (e) {}
      this.onSignalStatusCallback?.(active);
    }, 3000);
    
    // Monitor relay health periodically
    setInterval(() => {
      NOSTR_RELAYS.forEach(url => {
        this.checkRelayHealth(url).catch(() => {});
      });
    }, 30000);
    
    // Nostr needs a 32-byte private key. We derive it from the identity.
    const signSeed = new TextEncoder().encode(`nostr-sig-v2-${this.qIdentity.classicalPublicKey}`);
    const signHash = await window.crypto.subtle.digest('SHA-256', signSeed);
    this.signKey = new Uint8Array(signHash);

    // Initial listen on own ID to receive incoming offers
    this.listenOnNostr(this.currentPeerId!);
    
    await this.setupPeer(displayName);

    await this.loadPeerMetadata();
    await this.loadGroups();
  }

  private async setupPeer(displayName: string) {
    this.identity = { 
      classicalPublicKey: this.qIdentity!.classicalPublicKey,
      pqcPublicKey: this.qIdentity!.pqcPublicKey,
      identityBytes: this.qIdentity!.classicalPublicKey + this.qIdentity!.pqcPublicKey,
      displayName,
      id: this.currentPeerId!
    };

    this.isSignalingSettled = false;
    this.notifyStatus('info', 'Connecting to Global Relay Nodes...');
    this.listenOnNostr(this.currentPeerId!);

    setTimeout(async () => {
       this.isSignalingSettled = true;
       this.notifyStatus('info', 'Secure Node Online (Decentralized)');
       await this.publishToDiscovery();
    }, 2000);
  }

  private async getSignalingSecret(topicId: string) {
    const encoder = new TextEncoder();
    const data = encoder.encode(`iroh-signal-v3-${topicId}`);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return await crypto.subtle.importKey(
      'raw', 
      new Uint8Array(hash), 
      { name: 'AES-GCM', length: 256 }, 
      false, 
      ['encrypt', 'decrypt']
    );
  }

  private async listenOnNostr(topicId: string) {
    if (!topicId || this.activeSubscriptions.has(topicId)) return;
    this.activeSubscriptions.add(topicId);

    const secret = await this.getSignalingSecret(topicId);
    console.debug(`[Nostr] Subscribing to topic: ${topicId.slice(0, 8)}...`);
    
    // Regular (non-replaceable) Signaling using Kind 41002 + d tag for filtering
    const filter = {
      kinds: [41002],
      '#d': [topicId]
    };

    try {
      const pool = this.nostrPool as any;
      const selfEventPubkey = getPublicKey(this.signKey!);
      const sub = pool.subscribeMany(
        NOSTR_RELAYS,
        filter,
        {
          onevent: async (event: any) => {
            if (event.pubkey === selfEventPubkey) return;
            if (event.id && this.processedEventIds.has(event.id)) return;
            if (event.id) this.processedEventIds.add(event.id);
            if (event.created_at && Date.now() / 1000 - event.created_at > IrohManager.SIGNAL_MAX_AGE_SEC) return;
            try {

              const iv = event.tags.find((t: any) => t[0] === 'iv')?.[1];
              if (!iv) return;
              const decrypted = await decryptText(secret, event.content, iv);
              const signal = JSON.parse(decrypted);

              if (signal.senderId === this.currentPeerId) return;
              this.recordPeerResponse(signal.senderId);
              const sessionLabel = signal.sessionId ? ` session=${signal.sessionId.slice(0, 8)}` : ' legacy-session';
              console.debug(`[Nostr] Mesh IN: ${signal.type} from ${signal.senderId.slice(0, 8)}${sessionLabel}`);

              if (signal.type === 'offer') {
                if (!signal.sessionId) {
                  console.debug(`[Nostr] Ignoring legacy offer without session id from ${signal.senderId.slice(0, 8)}`);
                  return;
                }
                console.debug(`[Nostr] Processing offer, subscribing to sender's topic`);
                this.handleNostrOffer(signal.senderId, signal);
               } else if (signal.type === 'relay-sync') {
                 this.handleRelaySync(signal.senderId);
               } else if (signal.type === 'relay-helo') {
                 this.handleRelayHello(signal.senderId, signal);
               } else if (signal.type === 'relay-helo-ack') {
                 this.handleRelayHelloAck(signal.senderId, signal);
               } else if (signal.type === 'relay-message') {
                 this.handleRelayMessage(signal.senderId, signal);
               } else if (signal.type === 'answer' || signal.type === 'candidate' || signal.type === 'sdp') {
                 if (!this.isSignalForCurrentSession(signal.senderId, signal)) return;
                 console.debug(`[Nostr] Signaling ${signal.type} for peer`);
                 const conn = this.connections.get(signal.senderId);
                 if (conn) {
                   try {
                     conn.signal(signal.sdp);
                   } catch (err: any) {
                     if (isStableAnswerSignalError(signal.type, err)) {
                       console.debug(`[Nostr] Ignoring stale ${signal.type} for ${signal.senderId.slice(0, 8)} after stable state`);
                       return;
                     }
                     console.error(`[Nostr] Failed to process signal for ${signal.senderId.slice(0, 8)}: ${err.message}`);
                     this.queueSignal(signal.senderId, signal);
                   }
                 } else {
                   console.debug(`[Nostr] No connection found for ${signal.senderId.slice(0, 8)}, queueing signal`);
                   this.queueSignal(signal.senderId, signal);
                 }
               }
            } catch (e) {
              // Ignore messages not for us or decryption failures
            }
          },
          oneose: () => {
            console.debug(`[Nostr] Sub Settled: ${topicId.slice(0, 8)}`);
          }
        }
      );
      this.nostrSubs.set(topicId, sub);
    } catch (e) {
      console.error(`[Nostr] Sub Error for ${topicId}:`, e);
    }
  }

  /** Replay signals that arrived before the WebRTC peer was ready. */
  private flushPendingSignals(peer: any, peerId: string) {
    const pending = this.pendingSignals.get(peerId);
    if (!pending?.length) return;

    console.debug(`[Nostr] Flushing ${pending.length} pending signals for ${peerId.slice(0, 8)}`);
    const toProcess = [...pending];
    this.pendingSignals.delete(peerId);

    for (const sig of toProcess) {
      if (!this.isSignalForCurrentSession(peerId, sig)) continue;
      try {
        peer.signal(sig.sdp);
      } catch (err) {
        console.error('[Nostr] Failed to flush pending signal:', err);
        this.queueSignal(peerId, sig);
      }
    }
  }

  private isSignalForCurrentSession(peerId: string, signal: any) {
    const currentSession = this.signalSessions.get(peerId);
    if (isSignalForSession(currentSession, signal.sessionId)) return true;

    const label = signal.sessionId ? signal.sessionId.slice(0, 8) : 'missing';
    console.debug(`[Nostr] Ignoring stale ${signal.type} for ${peerId.slice(0, 8)}: session=${label}, current=${currentSession.slice(0, 8)}`);
    return false;
  }

  private queueSignal(peerId: string, signal: any) {
    if (!this.isSignalForCurrentSession(peerId, signal)) return;

    const queue = this.pendingSignals.get(peerId) ?? [];
    if (!canQueueSignal({
      existingPeerQueueLength: queue.length,
      pendingPeerCount: this.pendingSignals.size,
      peerAlreadyQueued: this.pendingSignals.has(peerId),
      maxSignalsPerPeer: MAX_PENDING_SIGNALS_PER_PEER,
      maxPendingPeers: MAX_PENDING_SIGNAL_PEERS,
    })) {
      console.warn(`[Nostr] Dropping excess queued signal for ${peerId.slice(0, 8)}`);
      return;
    }

    if (!queue.find(s => s.type === signal.type && s.sessionId === signal.sessionId && JSON.stringify(s.sdp) === JSON.stringify(signal.sdp))) {
      queue.push(signal);
    }
    this.pendingSignals.set(peerId, queue);
  }

  private async isClaimedPeerKeyValid(peerId: string, classicalPublicKey: string | undefined, context: string) {
    if (!classicalPublicKey || !await doesPublicKeyMatchPeerId(peerId, classicalPublicKey)) {
      console.warn(`[Security] Rejected ${context} from ${peerId.slice(0, 8)} because the public key does not match the peer id`);
      return false;
    }

    return true;
  }

  private markPeerFailed(peerId: string, message: string) {
    this.connectionStatus.set(peerId, 'failed');
    this.notifyStatus('error', message);
  }

  private recordPeerResponse(peerId: string) {
    this.connectionAttemptStartedAt.delete(peerId);
    const timeoutId = this.noResponseTimers.get(peerId);
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      this.noResponseTimers.delete(peerId);
    }
  }

  private scheduleNoResponseWarning(peerId: string, startedAt: number) {
    const existingTimer = this.noResponseTimers.get(peerId);
    if (existingTimer !== undefined) {
      window.clearTimeout(existingTimer);
    }

    const timeoutId = window.setTimeout(() => {
      if (!hasConnectionAttemptTimedOut(startedAt, Date.now(), IrohManager.PEER_RESPONSE_TIMEOUT_MS)) return;
      if (this.connections.get(peerId)?.connected || this.relayStatus.get(peerId) === 'connected') return;

      console.warn(`[Nostr] No response from ${peerId.slice(0, 8)} after ${IrohManager.PEER_RESPONSE_TIMEOUT_MS / 1000}s`);
      this.notifyStatus('warning', 'No response from peer yet. They may be offline or their browser may be sleeping.');
    }, IrohManager.PEER_RESPONSE_TIMEOUT_MS);

    this.noResponseTimers.set(peerId, timeoutId);
  }

  private ensureRelayHandshake(peerId: string) {
    const existingRelayStatus = this.relayStatus.get(peerId);
    if (!this.currentPeerId || !this.identity || existingRelayStatus === 'connected') return;
    if (existingRelayStatus === 'connecting' && this.relaySessions.has(peerId)) return;

    const role = getDeterministicRelayRole(this.currentPeerId, peerId);
    this.relayStatus.set(peerId, 'connecting');

    if (role === 'initiator') {
      const sessionId = this.relaySessions.get(peerId) || uuidv4();
      this.relaySessions.set(peerId, sessionId);
      this.sendNostrSignal(peerId, {
        senderId: this.currentPeerId,
        type: 'relay-helo',
        sessionId,
        classicalPublicKey: this.identity.classicalPublicKey,
        pqcPublicKey: this.identity.pqcPublicKey,
        displayName: this.identity.displayName,
      });
      return;
    }

    this.sendNostrSignal(peerId, {
      senderId: this.currentPeerId,
      type: 'relay-sync',
    });
  }

  private handleRelaySync(peerId: string) {
    if (!this.currentPeerId || !this.identity) return;
    const role = getDeterministicRelayRole(this.currentPeerId, peerId);
    if (!shouldSendRelayHelloForSync(role)) return;

    const sessionId = uuidv4();
    this.relaySessions.set(peerId, sessionId);
    this.relayStatus.set(peerId, 'connecting');
    this.sendNostrSignal(peerId, {
      senderId: this.currentPeerId,
      type: 'relay-helo',
      sessionId,
      classicalPublicKey: this.identity.classicalPublicKey,
      pqcPublicKey: this.identity.pqcPublicKey,
      displayName: this.identity.displayName,
    });
  }

  private async handleRelayHello(peerId: string, signal: any) {
    if (!this.currentPeerId || !this.identity || !this.qIdentity) return;
    if (getDeterministicRelayRole(this.currentPeerId, peerId) !== 'responder') return;
    if (!await this.isClaimedPeerKeyValid(peerId, signal.classicalPublicKey, 'relay hello')) return;
    if (!shouldAcceptRelayHello(this.relaySessions.get(peerId), this.relayStatus.get(peerId), signal.sessionId)) {
      const cachedAck = this.relayHelloAcks.get(peerId);
      if (cachedAck && cachedAck.sessionId === signal.sessionId) {
        this.sendNostrSignal(peerId, cachedAck);
      }
      return;
    }

    try {
      const { secret, ciphertext, secretBytes } = await deriveHybridSecret(
        this.qIdentity,
        signal.classicalPublicKey,
        signal.pqcPublicKey,
        false
      );
      this.secrets.set(peerId, secret);
      (secret as any).secretBytes = secretBytes;
      this.ratchetStates.set(peerId, await initializeRatchet(secretBytes, false));
      this.handshakeStatus.set(peerId, true);
      this.relayStatus.set(peerId, 'connected');
      this.relaySessions.set(peerId, signal.sessionId);
      this.establishedRelaySessions.set(peerId, signal.sessionId);
      this.peerPks.set(peerId, { classical: signal.classicalPublicKey, pqc: signal.pqcPublicKey });

      if (signal.displayName) {
        this.peerMetadata.set(peerId, { displayName: signal.displayName });
        this.persistMetadata();
      }

      const ack = {
        senderId: this.currentPeerId,
        type: 'relay-helo-ack',
        sessionId: signal.sessionId,
        classicalPublicKey: this.identity.classicalPublicKey,
        pqcCiphertext: ciphertext,
        displayName: this.identity.displayName,
      };
      this.relayHelloAcks.set(peerId, ack);
      this.sendNostrSignal(peerId, ack);
      this.notifyStatus('info', `Secure Relay Ready: Node_${peerId.slice(0, 4)}`);
    } catch (err) {
      console.error('[Nostr] Relay HELO failed:', err);
      this.relayStatus.delete(peerId);
    }
  }

  private async handleRelayHelloAck(peerId: string, signal: any) {
    if (!this.currentPeerId || !this.identity || !this.qIdentity) return;
    if (getDeterministicRelayRole(this.currentPeerId, peerId) !== 'initiator') return;
    if (!await this.isClaimedPeerKeyValid(peerId, signal.classicalPublicKey, 'relay hello ack')) return;
    if (!shouldProcessRelayHelloAck({
      attemptedSession: this.relaySessions.get(peerId),
      establishedSession: this.establishedRelaySessions.get(peerId),
      relayStatus: this.relayStatus.get(peerId),
      incomingSession: signal.sessionId,
    })) return;

    try {
      const { secret, secretBytes } = await deriveHybridSecret(
        this.qIdentity,
        signal.classicalPublicKey,
        signal.pqcCiphertext,
        true
      );
      this.secrets.set(peerId, secret);
      (secret as any).secretBytes = secretBytes;
      this.ratchetStates.set(peerId, await initializeRatchet(secretBytes, true));
      this.handshakeStatus.set(peerId, true);
      this.relayStatus.set(peerId, 'connected');
      this.establishedRelaySessions.set(peerId, signal.sessionId);
      this.peerPks.set(peerId, { classical: signal.classicalPublicKey, pqc: 'Encapsulated Session' });

      if (signal.displayName) {
        this.peerMetadata.set(peerId, { displayName: signal.displayName });
        this.persistMetadata();
      }

      this.notifyStatus('info', `Secure Relay Ready: Node_${peerId.slice(0, 4)}`);
    } catch (err) {
      console.error('[Nostr] Relay HELO_ACK failed:', err);
      this.relayStatus.delete(peerId);
    }
  }

  private handleRelayMessage(peerId: string, signal: any) {
    if (this.relayStatus.get(peerId) !== 'connected') return;
    if (!isRelayMessageForSession(this.establishedRelaySessions.get(peerId), signal.sessionId)) return;
    if (!signal.message) return;
    this.processIncomingMessage(peerId, signal.message);
  }

  private async handleNostrOffer(peerId: string, signal: any) {
    if (!shouldProcessWebRtcOffer(this.relayStatus.get(peerId))) {
      console.debug(`[Nostr] Secure relay already available for ${peerId.slice(0, 8)}, ignoring speculative WebRTC offer`);
      return;
    }

    // Check if a connection already exists
    const existingConn = this.connections.get(peerId);
    if (existingConn) {
      if (existingConn.connected) {
        console.debug(`[Nostr] Connection already exists for ${peerId.slice(0, 8)}, ignoring duplicate offer`);
        return;
      } else {
        // Clean up dead connection; keep peer metadata for soft-failure UX
        try {
          existingConn.destroy();
        } catch (e) {}
        this.connections.delete(peerId);
        this.pendingSignals.delete(peerId);
        this.secrets.delete(peerId);
        this.ratchetStates.delete(peerId);
        this.handshakeStatus.delete(peerId);
      }
    }

    const sessionId = signal.sessionId || uuidv4();
    this.signalSessions.set(peerId, sessionId);
    this.connectionStatus.set(peerId, 'connecting');
    this.notifyStatus('info', `P2P Handshake from ${peerId.slice(0, 8)}...`);
    
    // The offerer is subscribed to their own ID as topic.
    // We must send our answer back to that SAME topic so they receive it.
    // The offer arrived on topicId = peerId (offerer's ID), so we send responses there.
    const responseTopic = peerId;
    
    // @ts-ignore
    const peer = new SimplePeer({
      initiator: false,
      trickle: true,  // Re-enable trickle so candidates + answer go to same topic
      config: { iceServers: this.getIceServers() }
    });

    // Register connection BEFORE signaling to avoid race conditions
    this.connections.set(peerId, peer);
    console.debug(`[Nostr] Connection registered for ${peerId.slice(0, 8)}`);
    
    this.setupSimplePeer(peer, peerId, responseTopic, false);
    
    console.debug(`[Nostr] Signaling offer to WebRTC for ${peerId.slice(0, 8)}`);
    try {
      peer.signal(signal.sdp);
      this.flushPendingSignals(peer, peerId);
    } catch (err: any) {
      console.error(`[Nostr] Failed to signal offer to ${peerId.slice(0, 8)}:`, err.message);
      this.connections.delete(peerId);
      this.handshakeStatus.delete(peerId);
      this.pendingSignals.delete(peerId);
      this.secrets.delete(peerId);
      this.ratchetStates.delete(peerId);
      this.signalSessions.delete(peerId);
      this.markPeerFailed(peerId, `Tunnel setup failed: ${err.message || 'Invalid offer'}`);
    }
  }

  private getIceServers() {
    return buildIceServers(USER_ICE_SERVERS).map(({ layer, label, ...server }) => server);
  }

  private async sendNostrSignal(topicId: string, payload: any) {
    if (!this.signKey || this.signKey.length !== 32) return;

    const secret = await this.getSignalingSecret(topicId);
    const { ciphertext, iv } = await encryptData(secret, JSON.stringify(payload));
    const tags = buildSignalTags(topicId, iv, payload.sessionId);

    // Use kind 41002 (regular, non-replaceable) for signaling.
    // Kind 20000-29999 is parameterized replaceable per NIP-33: the relay only
    // keeps the latest event per (pubkey, d-tag). This causes candidates to
    // overwrite offers/answers on the same topic. Kind 41002 is in the
    // 40000-49999 regular range so all events are stored independently.
    const unsignedEvent = {
      kind: SIGNAL_KIND,
      pubkey: getPublicKey(this.signKey!),
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: ciphertext
    };

    const event = finalizeEvent(unsignedEvent, this.signKey!);
    console.debug(`[Nostr] Signal OUT: ${payload.type}`);
    
    // Critical encrypted signaling must fan out broadly; mobile browser relay
    // health can be stale exactly when ICE fallback needs Nostr most.
    const relaysToTry = selectSignalPublishRelays(NOSTR_RELAYS, this.relayHealth, payload.type);
    console.debug(`[Nostr] Publishing signal to ${relaysToTry.length} relays`);

    // Publish to all selected relays concurrently, handle rejections individually
    relaysToTry.forEach(url => {
      const promises = this.nostrPool.publish([url], event);
      promises.forEach(p => {
        p.then(() => {
          this.relayHealth.set(url, { status: 'healthy', lastCheck: Date.now() });
        })
        .catch((err: any) => {
          const msg = err?.message || String(err);
          console.warn(`[Nostr] Publish failed on ${url}: ${msg}`);
          if (msg.includes('rate-limited') || msg.includes('Policy violated') || msg.includes('timed out')) {
            this.relayHealth.set(url, { status: 'unhealthy', lastCheck: Date.now() });
          }
        });
      });
    });
   }


  // Relay health monitoring – uses only WebSocket state, no cross-origin fetch
  private async checkRelayHealth(relayUrl: string): Promise<boolean> {
    try {
      const pool = this.nostrPool as any;
      const relay = pool.relays?.get?.(relayUrl) || pool._relays?.get?.(relayUrl);
      
      if (relay) {
        const isConnected = (relay.ws && relay.ws.readyState === 1) || relay.status === 1;
        this.relayHealth.set(relayUrl, { 
          status: isConnected ? 'healthy' : 'unhealthy', 
          lastCheck: Date.now() 
        });
        return isConnected;
      }
      
      // No relay object yet – assume unhealthy until connection establishes
      this.relayHealth.set(relayUrl, { status: 'unhealthy', lastCheck: Date.now() });
      return false;
    } catch (err) {
      this.relayHealth.set(relayUrl, { status: 'unhealthy', lastCheck: Date.now() });
      return false;
    }
  }

  private attachIceRetry(peer: any, peerId: string, isInitiator: boolean) {
    if (!isInitiator) return;

    // SimplePeer emits `iceStateChange`; retry here and in `error` because
    // browsers may destroy the peer before a caller sees the state transition.
    peer.on('iceStateChange', (state: string) => {
      if (state === 'connected' || state === 'completed') {
        this.iceReconnectRetries.delete(peerId);
        this.retryingPeers.delete(peerId);
        return;
      }
      if (state !== 'failed' && state !== 'disconnected') return;
      if (peer.connected) return;

      this.scheduleIceRetry(peer, peerId, `ICE ${state}`);
    });
  }

  private scheduleIceRetry(peer: any, peerId: string, reason: string) {
    const retryCount = this.iceReconnectRetries.get(peerId) || 0;
    if (retryCount >= IrohManager.ICE_MAX_RETRIES) {
      this.markPeerFailed(peerId, `Tunnel Failed: ICE connection failed after ${IrohManager.ICE_MAX_RETRIES} attempts`);
      try { peer.destroy(); } catch (e) {}
      this.connections.delete(peerId);
      this.iceReconnectRetries.delete(peerId);
      this.retryingPeers.delete(peerId);
      return false;
    }

    const nextRetry = retryCount + 1;
    const forceRelay = nextRetry >= 2;
    console.warn(
      `[Nostr] ${reason} for ${peerId.slice(0, 8)}, retry ${nextRetry}/${IrohManager.ICE_MAX_RETRIES}` +
      (forceRelay ? ' with TURN relay only' : '')
    );
    this.notifyStatus(
      'warning',
      forceRelay ? 'Direct tunnel failed; retrying through TURN relay...' : 'Tunnel failed; retrying...'
    );
    this.connectionStatus.set(peerId, 'connecting');
    this.retryingPeers.add(peerId);
    this.iceReconnectRetries.set(peerId, nextRetry);
    try { peer.destroy(); } catch (e) {}
    this.connections.delete(peerId);
    setTimeout(
      () => this.connectByTicket(peerId, { retryAttempt: true, forceRelay }),
      IrohManager.ICE_RETRY_DELAY_MS
    );
    return true;
  }

  private setupSimplePeer(peer: any, peerId: string, topicId: string, isInitiator = false) {
    this.attachIceRetry(peer, peerId, isInitiator);

    peer.on('signal', (data: any) => {
      let signalType = 'unknown';
      if (data.type === 'offer') signalType = 'offer';
      else if (data.type === 'answer') signalType = 'answer';
      else if (data.candidate) signalType = 'candidate';
      
      console.debug(`[Nostr] WebRTC signal: type=${signalType}, topic=${topicId.slice(0,8)}`);
      this.sendNostrSignal(topicId, {
        senderId: this.currentPeerId,
        type: signalType,
        sessionId: this.signalSessions.get(peerId),
        sdp: data
      });

      if (signalType === 'offer') {
        this.flushPendingSignals(peer, peerId);
      }
    });

    peer.on('connect', () => {
      console.debug(`[Nostr] WebRTC connect event fired for ${peerId.slice(0, 8)}`);
      this.recordPeerResponse(peerId);
      this.connectionStatus.set(peerId, 'connected');
      this.iceReconnectRetries.delete(peerId);
      this.retryingPeers.delete(peerId);
      this.flushPendingSignals(peer, peerId);
      this.notifyStatus('info', `Tunnel Established: Node_${peerId.slice(0, 4)}`);
      
      peer.send(JSON.stringify({ 
        type: 'HELO', 
        classicalPublicKey: this.identity!.classicalPublicKey,
        pqcPublicKey: this.identity!.pqcPublicKey,
        displayName: this.identity!.displayName
      }));
    });

    peer.on('data', async (data: any) => {
       console.debug(`[Nostr] Received data from ${peerId.slice(0, 8)}`);
       const msg = JSON.parse(data.toString());
       this.processIncomingMessage(peerId, msg);
    });

    peer.on('close', () => {
      console.debug(`[Nostr] WebRTC connection closed for ${peerId.slice(0, 8)}`);
      this.connections.delete(peerId);
      this.pendingSignals.delete(peerId);
      if (this.retryingPeers.has(peerId)) return;
      if (this.relayStatus.get(peerId) === 'connected') {
        this.connectionStatus.set(peerId, 'connected');
        return;
      }
      this.handshakeStatus.delete(peerId);
      this.secrets.delete(peerId);
      this.ratchetStates.delete(peerId);
      this.signalSessions.delete(peerId);
      this.connectionStatus.set(peerId, 'failed');
      this.notifyStatus('info', 'Tunnel Closed');
    });

    peer.on('error', (err: any) => {
      console.debug(`[Nostr] WebRTC error for ${peerId.slice(0, 8)}:`, err.message);
      const isIceFailure = err?.code === 'ERR_ICE_CONNECTION_FAILURE' || /ice connection failed/i.test(err?.message || '');
      if (isInitiator && isIceFailure && this.scheduleIceRetry(peer, peerId, 'ICE connection failed')) {
        return;
      }

      this.connections.delete(peerId);
      this.pendingSignals.delete(peerId);
      if (this.relayStatus.get(peerId) === 'connected') {
        this.connectionStatus.set(peerId, 'connected');
        this.notifyStatus('warning', 'Direct tunnel failed; secure relay mode remains available');
        return;
      }
      this.handshakeStatus.delete(peerId);
      this.secrets.delete(peerId);
      this.ratchetStates.delete(peerId);
      this.signalSessions.delete(peerId);
      this.connectionStatus.set(peerId, 'failed');
      this.notifyStatus('error', `Tunnel Failed: ${err.message || 'Network unreachable'}`);
    });
  }

  private async processIncomingMessage(peerId: string, data: any) {
    console.debug(`[Nostr] processIncomingMessage: type=${data.type}, encrypted=${data.encrypted}`);
    
    if (data.type === 'HELO') {
      console.debug(`[Nostr] Received HELO from ${peerId.slice(0, 8)}`);
      if (!await this.isClaimedPeerKeyValid(peerId, data.classicalPublicKey, 'WebRTC hello')) return;
      const { secret, ciphertext, secretBytes } = await deriveHybridSecret(
        this.qIdentity!, 
        data.classicalPublicKey, 
        data.pqcPublicKey, 
        false
      );
      this.secrets.set(peerId, secret);
      // Store secretBytes for ratchet (attached to secret object for access)
      (secret as any).secretBytes = secretBytes;
      // Initialize Double Ratchet for forward secrecy
      const ratchetState = await initializeRatchet(secretBytes, false);
      this.ratchetStates.set(peerId, ratchetState);
      this.handshakeStatus.set(peerId, true);
      this.peerPks.set(peerId, { classical: data.classicalPublicKey, pqc: data.pqcPublicKey });
      
      const conn = this.connections.get(peerId);
      conn?.send(JSON.stringify({ 
        type: 'HELO_ACK', 
        classicalPublicKey: this.identity!.classicalPublicKey,
        pqcCiphertext: ciphertext, 
        displayName: this.identity!.displayName
      }));
      
      if (data.displayName) {
        this.peerMetadata.set(peerId, { displayName: data.displayName });
        this.persistMetadata();
      }

    } else if (data.type === 'HELO_ACK') {
      if (!await this.isClaimedPeerKeyValid(peerId, data.classicalPublicKey, 'WebRTC hello ack')) return;
      const { secret, secretBytes } = await deriveHybridSecret(
        this.qIdentity!, 
        data.classicalPublicKey, 
        data.pqcCiphertext,
        true
      );
      this.secrets.set(peerId, secret);
      // Store secretBytes for ratchet
      (secret as any).secretBytes = secretBytes;
      // Initialize Double Ratchet for forward secrecy
      const ratchetState = await initializeRatchet(secretBytes, true);
      this.ratchetStates.set(peerId, ratchetState);
      this.handshakeStatus.set(peerId, true);
      this.peerPks.set(peerId, { classical: data.classicalPublicKey, pqc: 'Encapsulated Session' });
      
      if (data.displayName) {
        this.peerMetadata.set(peerId, { displayName: data.displayName });
        this.persistMetadata();
      }

    } else if (data.encrypted) {
      const secret = this.secrets.get(peerId);
      console.debug(`[Nostr] Encrypted message, has secret:`, !!secret);
      if (secret) {
        try {
          if (data.type === 'reaction') {
            const reactionData = JSON.parse(await decryptText(secret, data.content, data.iv));
            if (this.onMessageCallback) {
              this.onMessageCallback({
                ...data,
                content: reactionData.emoji,
                targetMessageId: reactionData.targetMessageId,
                receiverId: this.identity!.id,
              });
            }
          } else if (data.type === 'file_chunk') {
            await this.handleFileChunk(peerId, data, secret);
          } else {
             const ratchetState = this.ratchetStates.get(peerId);
             if (ratchetState) {
               const result = await ratchetDecrypt(ratchetState, data.content, data.iv);
               if (result) {
                 this.ratchetStates.set(peerId, result.state);
                 if (data.type === 'group_control') {
                   await this.handleGroupControl(peerId, JSON.parse(result.plaintext));
                   return;
                 }
                 if (this.onMessageCallback) {
                   this.onMessageCallback({
                     ...data,
                     content: result.plaintext,
                     receiverId: this.identity!.id,
                   });
                 }
               } else {
                 console.warn('[Nostr] Ratchet decrypt failed');
               }
             }
           }
        } catch (err) {
          console.debug(`[Nostr] Decryption failed:`, err);
        }
      } else {
        console.debug(`[Nostr] No secret found for peer, message ignored`);
      }
    }
  }

  async connectByTicket(ticket: string, options: { retryAttempt?: boolean; forceRelay?: boolean } = {}) {
    const now = Date.now();

    // Check existing connection first
    const existingConn = this.connections.get(ticket);
    if (existingConn?.connected || this.relayStatus.get(ticket) === 'connected') {
      console.debug(`[Nostr] Connection already exists for ${ticket.slice(0, 8)}`);
      return;
    }

    if (!options.retryAttempt && !shouldStartConnectionAttempt(
      this.connectionAttemptStartedAt.get(ticket),
      now,
      IrohManager.CONNECTION_ATTEMPT_COOLDOWN_MS
    )) {
      this.notifyStatus('warning', 'Still waiting for peer. Ask them to open ETHOS and keep it in the foreground.');
      return;
    }

    if (existingConn) {
      try { existingConn.destroy(); } catch (e) {}
      this.connections.delete(ticket);
      this.pendingSignals.delete(ticket);
      this.secrets.delete(ticket);
      this.ratchetStates.delete(ticket);
      this.handshakeStatus.delete(ticket);
    }

    this.connectionStatus.set(ticket, 'connecting');
    this.connectionAttemptStartedAt.set(ticket, now);
    this.scheduleNoResponseWarning(ticket, now);
    this.relaySessions.delete(ticket);
    this.establishedRelaySessions.delete(ticket);
    this.relayStatus.delete(ticket);
    this.relayHelloAcks.delete(ticket);
    this.signalSessions.set(ticket, uuidv4());
    if (!options.retryAttempt) {
      this.iceReconnectRetries.delete(ticket);
      this.retryingPeers.delete(ticket);
    }
    this.notifyStatus('info', options.forceRelay ? 'Attempting Tunnel via TURN Relay...' : 'Attempting Tunnel via Nostr Relay...');
    this.listenOnNostr(ticket);
    this.ensureRelayHandshake(ticket);

    // @ts-ignore
    const peer = new SimplePeer({
      initiator: true,
      trickle: true,  // Re-enable trickle for reliable signaling
      config: {
        iceServers: this.getIceServers(),
        iceTransportPolicy: options.forceRelay ? 'relay' : 'all'
      }
    });

    // Register connection before signaling to avoid race conditions
    this.connections.set(ticket, peer);

    this.setupSimplePeer(peer, ticket, ticket, true);
    this.flushPendingSignals(peer, ticket);
  }

  private async getDiscoveryKeypair(name: string) {
    const seed = new TextEncoder().encode(`iroh-discovery-v3-${name.toLowerCase().trim()}`);
    const hash = await window.crypto.subtle.digest('SHA-256', seed);
    const keyPair = Pkarr.generateKeyPair(new Uint8Array(hash));
    return { publicKey: new Uint8Array(keyPair.publicKey), privateKey: new Uint8Array(keyPair.secretKey) };
  }

   async publishToDiscovery() {
     if (!this.identity || this.identity.displayName.length < 3) return;
     try {
       const name = this.identity.displayName;
       const { publicKey, privateKey } = await this.getDiscoveryKeypair(name);
       const packet = { answers: [{ type: 'TXT', name: '@', data: [this.currentPeerId!] }] };
       const seq = Math.floor(Date.now() / 1000);
       const signedPacket = SignedPacket.fromPacket({ publicKey, secretKey: privateKey }, packet as any, { seq: BigInt(seq) } as any);
       const bytes = signedPacket.bytes();
       
       let successCount = 0;
       for (const relayUrl of PKARR_RELAYS) {
         try {
           const res = await fetch(`${relayUrl}/${z32.encode(publicKey)}`, {
             method: 'PUT',
             body: bytes,
             mode: 'cors',
             headers: { 'Content-Type': 'application/octet-stream' }
           });
           if (res.ok || res.status === 204) {
             successCount++;
             console.debug(`Identity published to Pkarr node: ${relayUrl}`);
           }
         } catch (e) {
            // Silent fail – pkarr is best-effort
         }
       }
       
       if (successCount > 0) {
         this.notifyStatus('info', `Node Discovered via ${successCount} DHT Relays`);
       }
       
       // Parallel layer: Nostr Announcement
       await this.publishToNostrDiscovery(name);
     } catch (e) {}
   }

  private async publishToNostrDiscovery(name: string) {
    if (!this.nostrPool || !this.signKey) return;
    const topic = `nexus_v2_discovery_${name.toLowerCase().trim()}`;
    const announcement = { type: 'announcement', peerId: this.currentPeerId, name, timestamp: Date.now() };
    const secret = await this.getSignalingSecret(topic);
    const { ciphertext, iv } = await encryptData(secret, JSON.stringify(announcement));
    
    const event = {
      kind: 41002,
      pubkey: getPublicKey(this.signKey),
      created_at: Math.floor(Date.now() / 1000),
      tags: [['d', topic], ['iv', iv]],
      content: ciphertext
    };
    const signed = finalizeEvent(event, this.signKey);
    const promises = this.nostrPool.publish(NOSTR_RELAYS, signed);
    promises.forEach(p => p.catch(() => {}));
  }

  async searchByName(name: string): Promise<string | null> {
    try {
      this.notifyStatus('info', `Searching Mesh for "${name}"...`);
      
      const pkarrTask = this.searchByNamePkarr(name);
      const nostrTask = this.searchByNameNostr(name);

      const [pkarrPeerId, nostrResult] = await Promise.all([pkarrTask, nostrTask]);
      const selectedPeerId = chooseDiscoveryResult({
        pkarrPeerId,
        nostrResult,
        now: Date.now(),
        maxAgeMs: IrohManager.DISCOVERY_ANNOUNCEMENT_MAX_AGE_MS,
      });

      if (pkarrPeerId && nostrResult?.peerId && pkarrPeerId !== nostrResult.peerId && selectedPeerId === nostrResult.peerId) {
        console.debug(`[Nostr] Fresh discovery for "${name}" superseded stale Pkarr identity ${pkarrPeerId.slice(0, 8)} with ${nostrResult.peerId.slice(0, 8)}`);
      }

      return selectedPeerId;
    } catch (e) {
      return null;
    }
  }

  private async searchByNameNostr(name: string): Promise<DiscoveryResult | null> {
    if (!this.nostrPool) return null;
    const topic = `nexus_v2_discovery_${name.toLowerCase().trim()}`;
    const secret = await this.getSignalingSecret(topic);
    
    return new Promise((resolve) => {
      let newest: DiscoveryResult | null = null;
      const timeout = setTimeout(() => {
        sub.close();
        resolve(newest);
      }, 5000);

      const filter = { kinds: [41002], '#d': [topic], limit: 5 };
      const sub = (this.nostrPool as any).subscribeMany(NOSTR_RELAYS, filter, {
        onevent: async (event: any) => {
          try {
            const iv = event.tags.find((t: any) => t[0] === 'iv')?.[1];
            if (!iv) return;
            const decrypted = await decryptText(secret, event.content, iv);
            const data = JSON.parse(decrypted);
            if (data.type === 'announcement' && data.peerId) {
              const timestamp = typeof data.timestamp === 'number' ? data.timestamp : event.created_at ? event.created_at * 1000 : undefined;
              if (!newest || (timestamp || 0) > (newest.timestamp || 0)) {
                newest = { peerId: data.peerId, timestamp };
              }
            }
          } catch (e) {}
        },
        oneose: () => {
          // Keep searching for a bit longer even after EOSE
        }
      });
    });
  }

   private async searchByNamePkarr(name: string): Promise<string | null> {
     try {
       const { publicKey } = await this.getDiscoveryKeypair(name);
       let signedPacket: SignedPacket | null = null;
       
       for (const relayUrl of PKARR_RELAYS) {
         try {
           // Direct fetch – CORS errors caught and ignored (best-effort discovery)
           const controller = new AbortController();
           const timeout = setTimeout(() => controller.abort(), 5000);
           
           const response = await fetch(`${relayUrl}/${z32.encode(publicKey)}`, {
             method: 'GET',
             mode: 'cors',
             credentials: 'omit',
             signal: controller.signal
           });
           
           clearTimeout(timeout);
           
           if (!response.ok) continue;
           
           const buffer = await response.arrayBuffer();
           signedPacket = SignedPacket.fromBytes(publicKey, new Uint8Array(buffer));
           if (signedPacket) {
             console.debug(`Identity found via Pkarr node: ${relayUrl}`);
             break;
           }
         } catch (err) {
           // Silent fail – try next relay
         }
       }
       
       if (!signedPacket) return null;
       const txtRecords = signedPacket.resourceRecords('@').filter(r => r.type === 'TXT');
       if (txtRecords.length > 0 && txtRecords[0].data && txtRecords[0].data[0]) {
         return txtRecords[0].data[0].toString();
       }
     } catch (e) {}
     return null;
    }

  async reconnect() {
    // Destroy all existing peer connections
    this.connections.forEach((peer, id) => {
      try { peer.destroy(); } catch (e) {}
    });
    // Clear all per-peer state
    this.connections.clear();
    this.handshakeStatus.clear();
    this.pendingSignals.clear();
    this.iceReconnectRetries.clear();
    this.retryingPeers.clear();
    this.signalSessions.clear();
    this.relaySessions.clear();
    this.establishedRelaySessions.clear();
    this.relayStatus.clear();
    this.relayHelloAcks.clear();
    this.connectionAttemptStartedAt.clear();
    this.noResponseTimers.forEach(timeoutId => window.clearTimeout(timeoutId));
    this.noResponseTimers.clear();
    this.processedEventIds = new BoundedEventCache();
    this.connectionStatus.clear();
    this.secrets.clear();
    this.ratchetStates.clear();
    this.peerPks.clear();
    this.nostrPool.close(NOSTR_RELAYS);
    this.activeSubscriptions.clear();
    this.isSignalingSettled = false;
    this.initialize(this.identity?.displayName || 'Node');
  }

  public notifyStatus(type: 'info' | 'error' | 'warning', message: string) {
    diagnosticsLog.record('status', [type, message]);
    if (this.onStatusCallback) this.onStatusCallback(type, message);
  }

  onStatus(callback: (type: 'info' | 'error' | 'warning', message: string) => void) {
    this.onStatusCallback = callback;
  }

  onSignalStatus(callback: (count: number) => void) {
    this.onSignalStatusCallback = callback;
  }

  private async getEncryptedStorageContext() {
    if (!this.qIdentity || !this.currentPeerId) return null;
    return {
      identityMaterial: await exportIdentity(this.qIdentity),
      nodeId: this.currentPeerId,
    };
  }

  private applyPeerMetadata(metadata: PeerMetadata) {
    Object.entries(metadata).forEach(([id, meta]) => {
      if (meta?.displayName) {
        this.peerMetadata.set(id, { displayName: meta.displayName });
      }
    });
  }

  private async loadPeerMetadata() {
    const context = await this.getEncryptedStorageContext();
    if (!context) return;

    const encryptedMetadata = await loadEncryptedPeerMetadata({
      store: this.peerMetadataStore,
      ...context,
    });
    if (encryptedMetadata) {
      this.applyPeerMetadata(encryptedMetadata);
    }

    const legacyMetadata = localStorage.getItem('nexus_metadata');
    if (!legacyMetadata) return;

    try {
      const parsed = JSON.parse(legacyMetadata) as PeerMetadata;
      this.applyPeerMetadata(parsed);
      await this.persistMetadata();
      localStorage.removeItem('nexus_metadata');
    } catch {
      localStorage.removeItem('nexus_metadata');
    }
  }

  private async persistMetadata() {
    try {
      const context = await this.getEncryptedStorageContext();
      if (!context) return;

      await saveEncryptedPeerMetadata({
        store: this.peerMetadataStore,
        ...context,
        metadata: Object.fromEntries(this.peerMetadata),
      });
      localStorage.removeItem('nexus_metadata');
    } catch (err) {
      console.warn('[Storage] Failed to persist encrypted peer metadata:', err);
    }
  }

  private normalizeGroup(group: Partial<Group>, ownerFallback = this.currentPeerId ?? ''): Group | null {
    if (!group?.id || !group.name || !Array.isArray(group.members)) return null;
    const createdAt = typeof group.createdAt === 'number' ? group.createdAt : Date.now();
    const updatedAt = typeof group.updatedAt === 'number' ? group.updatedAt : createdAt;
    const ownerId = group.ownerId || ownerFallback;
    if (!ownerId) return null;

    return {
      id: group.id,
      name: group.name.slice(0, 120),
      members: normalizeGroupMembers(group.members, ownerId),
      ownerId,
      createdAt,
      updatedAt,
    };
  }

  private applyGroups(groups: Group[]) {
    groups.forEach(group => this.groups.set(group.id, group));
    this.onGroupUpdateCallback?.(Array.from(this.groups.values()));
  }

  private async loadGroups() {
    const context = await this.getEncryptedStorageContext();
    if (!context) return;

    const encryptedGroups = await loadEncryptedGroups({
      store: this.groupStore,
      ...context,
    });
    if (encryptedGroups) {
      this.applyGroups(encryptedGroups);
    }

    const legacyGroups = localStorage.getItem('nexus_groups');
    if (!legacyGroups) return;

    try {
      const parsed = JSON.parse(legacyGroups) as Partial<Group>[];
      const migratedGroups = parsed
        .map(group => this.normalizeGroup(group))
        .filter((group): group is Group => !!group);
      this.applyGroups(migratedGroups);
      await this.persistGroups();
      localStorage.removeItem('nexus_groups');
    } catch {
      localStorage.removeItem('nexus_groups');
    }
  }

  private async persistGroups() {
    try {
      const context = await this.getEncryptedStorageContext();
      if (!context) return;

      await saveEncryptedGroups({
        store: this.groupStore,
        ...context,
        groups: Array.from(this.groups.values()),
      });
      localStorage.removeItem('nexus_groups');
    } catch (err) {
      console.warn('[Storage] Failed to persist encrypted groups:', err);
    }
  }

  private async handleFileChunk(peerId: string, data: any, secret: CryptoKey) {
    this.cleanupStaleInboundTransfers();

    // Validate incoming chunk data
    if (!data.content || !data.iv || !data.transferId) {
      console.warn('[Nostr] Invalid chunk data received');
      return;
    }
    
    let transfer = this.transfers.get(data.transferId);
    let chunks = this.fileChunks.get(data.transferId);
    const totalSize = Number(data.totalSize);
    const fileName = typeof data.fileName === 'string' ? data.fileName : 'encrypted-file';
    if (!transfer) {
      const activeInboundForPeer = Array.from(this.transfers.values()).filter(existing =>
        existing.type === 'download' &&
        existing.status === 'active' &&
        existing.peerId === peerId
      ).length;
      if (activeInboundForPeer >= MAX_ACTIVE_INBOUND_TRANSFERS_PER_PEER) {
        console.warn(`[Nostr] Rejecting excess inbound transfer from ${peerId.slice(0, 8)}`);
        return;
      }

      if (!Number.isFinite(totalSize) || totalSize > MAX_INBOUND_FILE_SIZE) {
        console.warn(`[Nostr] Rejecting oversized inbound transfer from ${peerId.slice(0, 8)}`);
        return;
      }

      transfer = { id: data.transferId, name: fileName, size: totalSize, progress: 0, type: 'download', status: 'active', peerId };
      this.transfers.set(data.transferId, transfer);
      this.transferStartedAt.set(data.transferId, Date.now());
      chunks = new Map();
      this.fileChunks.set(data.transferId, chunks);
    } else if (transfer.peerId !== peerId || transfer.size !== totalSize || transfer.name !== fileName) {
      console.warn(`[Nostr] Rejecting inconsistent transfer metadata from ${peerId.slice(0, 8)}`);
      return;
    }
    
    try {
      const chunk = await decryptData(secret, data.content, data.iv);
      const offset = Number(data.offset) || 0;
      const validation = validateInboundFileChunk({
        offset,
        chunkSize: chunk.length,
        totalSize: Number(data.totalSize),
        maxFileSize: MAX_INBOUND_FILE_SIZE,
        existingChunkCount: chunks!.size,
        maxChunksPerTransfer: MAX_INBOUND_CHUNKS_PER_TRANSFER,
      });
      if (validation.ok === false) {
        console.warn(`[Nostr] Rejecting invalid inbound file chunk from ${peerId.slice(0, 8)}: ${validation.reason}`);
        return;
      }

      const bytesAdded = addFileChunk(chunks!, offset, chunk);
      transfer.progress += bytesAdded;
      this.notifyTransferUpdate();
      
      if (transfer.progress >= transfer.size) {
        transfer.status = 'completed';
        const blob = new Blob([assembleFileChunks(chunks!)], { type: 'application/octet-stream' });
        transfer.downloadUrl = URL.createObjectURL(blob);
        this.fileChunks.delete(data.transferId);
        this.transferStartedAt.delete(data.transferId);
        
        // Add file message to chat
        if (this.onMessageCallback) {
          this.onMessageCallback({
            id: data.transferId,
            senderId: peerId,
            receiverId: this.identity!.id,
            type: 'file',
            content: fileName,
            iv: '',
            timestamp: Date.now(),
            fileName,
            fileSize: totalSize,
            downloadUrl: transfer.downloadUrl
          });
        }
      }
    } catch (err) {
      console.error('[Nostr] Chunk decrypt error:', err);
    }
  }

  private cleanupStaleInboundTransfers() {
    const staleIds = selectStaleTransferIds(
      this.transfers,
      this.transferStartedAt,
      Date.now(),
      INBOUND_TRANSFER_TIMEOUT_MS
    );

    staleIds.forEach(id => {
      const transfer = this.transfers.get(id);
      if (transfer) transfer.status = 'failed';
      this.fileChunks.delete(id);
      this.transferStartedAt.delete(id);
    });

    if (staleIds.length > 0) this.notifyTransferUpdate();
  }

  private notifyTransferUpdate() {
    if (this.onTransferUpdateCallback) this.onTransferUpdateCallback(Array.from(this.transfers.values()));
  }

  onTransferUpdate(callback: (transfers: FileTransfer[]) => void) { this.onTransferUpdateCallback = callback; }
  onGroupUpdate(callback: (groups: Group[]) => void) { this.onGroupUpdateCallback = callback; }

  private async sendEncryptedPeerPayload(peerId: string, payload: any, plaintext: string) {
    const conn = this.connections.get(peerId);
    const ratchetState = this.ratchetStates.get(peerId);
    if (!ratchetState) {
      this.ensureRelayHandshake(peerId);
      return false;
    }

    const { ciphertext, iv, state } = await ratchetEncrypt(ratchetState, plaintext);
    this.ratchetStates.set(peerId, state);
    const encryptedPayload = { ...payload, content: ciphertext, iv, encrypted: true };

    if (conn?.connected) {
      conn.send(JSON.stringify(encryptedPayload));
      return true;
    }

    if (this.relayStatus.get(peerId) === 'connected') {
      await this.sendNostrSignal(peerId, {
        senderId: this.currentPeerId,
        type: 'relay-message',
        sessionId: this.establishedRelaySessions.get(peerId),
        message: encryptedPayload,
      });
      return true;
    }

    this.ensureRelayHandshake(peerId);
    return false;
  }

  private async sendGroupControl(peerId: string, groupId: string, control: any) {
    return this.sendEncryptedPeerPayload(peerId, {
      id: uuidv4(),
      senderId: this.identity!.id,
      receiverId: peerId,
      groupId,
      type: 'group_control',
      timestamp: Date.now(),
    }, JSON.stringify(control));
  }

  private async handleGroupControl(peerId: string, control: any) {
    if (control?.kind === 'group-invite') {
      const group = this.normalizeGroup(control.group, peerId);
      if (!group || group.ownerId !== peerId || !group.members.includes(this.identity!.id)) return;

      this.groups.set(group.id, group);
      await this.persistGroups();
      this.onGroupUpdateCallback?.(Array.from(this.groups.values()));
      this.notifyStatus('info', `New Group: ${group.name}`);
      return;
    }

    if (control?.kind === 'group-delete') {
      const group = this.groups.get(control.groupId);
      if (!group || group.ownerId !== peerId) return;

      this.groups.delete(group.id);
      await this.persistGroups();
      this.onGroupUpdateCallback?.(Array.from(this.groups.values()));
      this.notifyStatus('info', `Group deleted: ${group.name}`);
    }
  }

  async createGroup(name: string, members: string[]) {
    const now = Date.now();
    const group: Group = {
      id: uuidv4(),
      name,
      members: normalizeGroupMembers(members, this.identity!.id),
      ownerId: this.identity!.id,
      createdAt: now,
      updatedAt: now,
    };
    this.groups.set(group.id, group);
    await this.persistGroups();
    if (this.onGroupUpdateCallback) this.onGroupUpdateCallback(Array.from(this.groups.values()));
    await Promise.all(members.map(memberId => this.sendGroupControl(memberId, group.id, {
      kind: 'group-invite',
      group,
    })));
    return group;
  }

  async deleteGroup(groupId: string, options: { forEveryone?: boolean } = {}) {
    const group = this.groups.get(groupId);
    if (!group || !this.identity) return false;

    const shouldDeleteForEveryone = options.forEveryone === true;
    if (shouldDeleteForEveryone && group.ownerId !== this.identity.id) return false;

    if (shouldDeleteForEveryone) {
      await Promise.all(group.members.map(memberId => {
        if (memberId === this.identity?.id) return Promise.resolve(false);
        return this.sendGroupControl(memberId, group.id, {
          kind: 'group-delete',
          groupId: group.id,
          ownerId: this.identity!.id,
          deletedAt: Date.now(),
        });
      }));
    }

    this.groups.delete(groupId);
    await this.persistGroups();
    this.onGroupUpdateCallback?.(Array.from(this.groups.values()));
    this.notifyStatus('info', shouldDeleteForEveryone ? `Group deleted: ${group.name}` : `Removed group: ${group.name}`);
    return true;
  }

  async sendGroupMessage(groupId: string, text: string, options: { ephemeral?: boolean } = {}) {
    const group = this.groups.get(groupId);
    if (!group) return;
    const msgId = uuidv4();
    const timestamp = Date.now();
    const expiresAt = options.ephemeral ? timestamp + 60000 : undefined;
    const results = await Promise.all(group.members.map(async (memberId) => {
      if (memberId === this.identity?.id) return;
      return this.sendEncryptedPeerPayload(memberId, {
        id: msgId,
        senderId: this.identity!.id,
        receiverId: memberId,
        groupId,
        type: 'text',
        timestamp,
        expiresAt,
      }, text);
    }));
    if (!results.some(Boolean)) return null;
    return { id: msgId, senderId: this.identity!.id, receiverId: groupId, groupId, type: 'text' as const, content: text, iv: '', timestamp, expiresAt };
  }

  async sendMessage(peerId: string, text: string, options: { ephemeral?: boolean } = {}) {
    const conn = this.connections.get(peerId);
    const ratchetState = this.ratchetStates.get(peerId);
    if (!ratchetState) {
      this.ensureRelayHandshake(peerId);
      return null;
    }
    
    const { ciphertext, iv, state } = await ratchetEncrypt(ratchetState, text);
    this.ratchetStates.set(peerId, state);
    
    const msg: SecureMessage = { id: uuidv4(), senderId: this.identity!.id, receiverId: peerId, type: 'text', content: ciphertext, iv, timestamp: Date.now(), expiresAt: options.ephemeral ? Date.now() + 60000 : undefined };
    if (conn?.connected) {
      conn.send(JSON.stringify({ ...msg, encrypted: true }));
    } else if (this.relayStatus.get(peerId) === 'connected') {
      await this.sendNostrSignal(peerId, {
        senderId: this.currentPeerId,
        type: 'relay-message',
        sessionId: this.establishedRelaySessions.get(peerId),
        message: { ...msg, encrypted: true },
      });
    } else {
      this.ensureRelayHandshake(peerId);
      return null;
    }
    return { ...msg, content: text };
  }

  async sendFile(peerId: string, file: File) {
    const conn = this.connections.get(peerId);
    const secret = this.secrets.get(peerId);
    const canUseRelay = this.relayStatus.get(peerId) === 'connected';
    if ((!conn?.connected && !canUseRelay) || !secret) {
      console.warn('[Nostr] No connection for file transfer');
      return;
    }
    
    const transferId = uuidv4();
    const transfer: FileTransfer = { id: transferId, name: file.name, size: file.size, progress: 0, type: 'upload', status: 'active', peerId };
    this.transfers.set(transferId, transfer);
    
    const CHUNK_SIZE = 8192;
    let offset = 0;
    let aborted = false;
    
    const sendChunk = async () => {
      // Check connection is still valid
      const currentConn = this.connections.get(peerId);
      const currentCanUseRelay = this.relayStatus.get(peerId) === 'connected';
      if ((!currentConn?.connected && !currentCanUseRelay) || aborted || offset >= file.size) {
        if (offset >= file.size) {
          transfer.status = 'completed';
          setTimeout(() => {
            if (this.onMessageCallback) this.onMessageCallback({
              id: transferId, senderId: this.identity!.id, receiverId: peerId,
              type: 'file', content: file.name, iv: '', timestamp: Date.now(),
              fileName: file.name, fileSize: file.size
            });
          }, 100);
          this.notifyTransferUpdate();
        } else if (aborted || (!currentConn?.connected && !currentCanUseRelay)) {
          transfer.status = 'failed';
          this.notifyTransferUpdate();
        }
        return;
      }
      
      // Wait for buffer to drain if full
      const dc = currentConn?.connected ? (currentConn as any)._pc?.dataChannel : undefined;
      if (dc && dc.bufferedAmount > 256 * 1024) {
        setTimeout(() => sendChunk(), 100);
        return;
      }
      
      const chunk = file.slice(offset, offset + CHUNK_SIZE);
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        if (aborted) return;
        
        // Re-check connection after async operation
        const activeConn = this.connections.get(peerId);
        const activeCanUseRelay = this.relayStatus.get(peerId) === 'connected';
        if (!activeConn?.connected && !activeCanUseRelay) {
          transfer.status = 'failed';
          this.notifyTransferUpdate();
          return;
        }
        
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const { ciphertext, iv } = await encryptData(secret, data);
          const msg = {
            encrypted: true, 
            type: 'file_chunk', 
            transferId, 
            fileName: file.name, 
            totalSize: file.size, 
            content: ciphertext, 
            iv,
            offset,
            isLast: offset + CHUNK_SIZE >= file.size
          };
          
          if (activeConn?.connected) {
            activeConn.send(JSON.stringify(msg));
          } else {
            await this.sendNostrSignal(peerId, {
              senderId: this.currentPeerId,
              type: 'relay-message',
              sessionId: this.establishedRelaySessions.get(peerId),
              message: msg,
            });
          }
          
          offset += data.byteLength;
          transfer.progress = offset;
          this.notifyTransferUpdate();
          
          // Schedule next chunk
          setTimeout(() => sendChunk(), 10);
        } catch (err) {
          console.error('[Nostr] File send error:', err);
          transfer.status = 'failed';
          this.notifyTransferUpdate();
        }
      };
      
      reader.onerror = () => {
        transfer.status = 'failed';
        this.notifyTransferUpdate();
      };
      
      reader.readAsArrayBuffer(chunk);
    };
    
    // Store abort function
    (transfer as any).abort = () => {
      aborted = true;
      transfer.status = 'failed';
      this.notifyTransferUpdate();
    };
    
    sendChunk();
  }

  async sendReaction(peerId: string, messageId: string, emoji: string) {
    const conn = this.connections.get(peerId);
    const secret = this.secrets.get(peerId);
    if (!conn || !secret) return;
    const { ciphertext, iv } = await encryptData(secret, JSON.stringify({ targetMessageId: messageId, emoji }));
    const msg: SecureMessage = { id: uuidv4(), senderId: this.identity!.id, receiverId: peerId, type: 'reaction', content: ciphertext, iv, timestamp: Date.now(), targetMessageId: messageId };
    conn.send(JSON.stringify({ ...msg, encrypted: true, type: 'reaction' }));
    return { ...msg, content: emoji };
  }

  onMessage(callback: (msg: SecureMessage) => void) { this.onMessageCallback = callback; }
  getIdentity() { return this.identity; }
  getQuantumIdentity() { return this.qIdentity; }
  getPeerKeys(peerId: string) { return this.peerPks.get(peerId); }
  isHandshakeComplete(peerId: string) { return this.handshakeStatus.get(peerId) || false; }
  getPeerName(peerId: string) { return this.peerMetadata.get(peerId)?.displayName; }
  getGroups() { return Array.from(this.groups.values()); }
  isGroupOwner(groupId: string) { return this.groups.get(groupId)?.ownerId === this.identity?.id; }
  setDisplayName(name: string) {
    if (this.identity) {
      this.identity.displayName = name;
      localStorage.setItem('nexus_name', name);
      this.publishToDiscovery();
    }
  }
  
  getRelays() {
    return NOSTR_RELAYS;
  }

  abortTransfer(transferId: string) {
    const transfer = this.transfers.get(transferId);
    if (transfer && (transfer as any).abort) {
      (transfer as any).abort();
    }
    this.transfers.delete(transferId);
    this.fileChunks.delete(transferId);
    this.notifyTransferUpdate();
  }

  clearCompletedTransfers() {
    for (const [id, t] of this.transfers) {
      if (t.status === 'completed' || t.status === 'failed') {
        this.transfers.delete(id);
        this.fileChunks.delete(id);
      }
    }
    this.notifyTransferUpdate();
  }

  async importIdentity(serialized: string) {
    const qId = await importIdentity(serialized);
    const id = await hashId(qId.classicalPublicKey);
    this.qIdentity = qId;
    localStorage.setItem('nexus_identity', serialized);
    localStorage.setItem('nexus_iroh_id', id);
    this.currentPeerId = id;
  }

  updateRelays(relays: string[]) {
    if (!Array.isArray(relays) || relays.length === 0) return;
    NOSTR_RELAYS = relays;
    localStorage.setItem('nexus_custom_relays', JSON.stringify(relays));
    this.notifyStatus('info', 'Relay list updated. Re-initializing...');
    this.reconnect();
  }

  resetRelays() {
    NOSTR_RELAYS = [...DEFAULT_NOSTR_RELAYS];
    localStorage.removeItem('nexus_custom_relays');
    this.notifyStatus('info', 'Relays reset to default.');
    this.reconnect();
  }

  getUserIceServers() {
    return [...USER_ICE_SERVERS];
  }

  getResolvedIceServers() {
    return buildIceServers(USER_ICE_SERVERS);
  }

  updateIceServers(servers: UserIceServer[]) {
    USER_ICE_SERVERS = servers;
    saveUserIceServers(servers);
    this.notifyStatus('info', 'ICE server settings saved. New tunnels will use the updated configuration.');
  }

  resetIceServers() {
    USER_ICE_SERVERS = [];
    clearUserIceServers();
    this.notifyStatus('info', 'ICE servers reset to bundled defaults.');
  }

  testIceServers(servers: UserIceServer[] = USER_ICE_SERVERS) {
    return testIceConfiguration(servers);
  }


  getConnectedPeers() {
    return selectConnectedPeers({
      connectedPeers: Array.from(this.connections.keys()).filter(k => this.connections.get(k)?.connected),
      relayPeers: Array.from(this.relayStatus.entries())
        .filter(([_, status]) => status === 'connected')
        .map(([id]) => id),
    });
  }

  getVisiblePeers() {
    return selectVisiblePeers({
      connectedPeers: this.getConnectedPeers(),
      relayPeers: [],
      handshakenPeers: Array.from(this.handshakeStatus.entries())
        .filter(([_, isComplete]) => isComplete)
        .map(([id]) => id),
      metadataPeers: Array.from(this.peerMetadata.keys()),
    });
  }

  getFailedPeers() {
    return Array.from(this.connectionStatus.entries())
      .filter(([id, status]) => status === 'failed' && !this.connections.get(id)?.connected)
      .map(([id]) => id);
  }

  getConnectionStatus(peerId: string) {
    return this.connectionStatus.get(peerId);
  }
}

export const iroh = new IrohManager();

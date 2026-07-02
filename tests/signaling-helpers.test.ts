import { describe, expect, it } from 'vitest';
import {
  BoundedEventCache,
  buildSignalTags,
  getDeterministicRelayRole,
  isSignalForSession,
  isStableAnswerSignalError,
  selectConnectedPeers,
  selectSignalPublishRelays,
  selectVisiblePeers,
  shouldStartConnectionAttempt,
  shouldAcceptRelayHello,
  shouldSendRelayHelloForSync,
  shouldProcessRelayHelloAck,
  isRelayMessageForSession,
  addFileChunk,
  assembleFileChunks,
  canQueueSignal,
  selectStaleTransferIds,
  validateInboundFileChunk,
  shouldProcessWebRtcOffer,
  hasConnectionAttemptTimedOut,
  chooseDiscoveryResult,
  syncLocalVersion,
  SIGNAL_KIND,
} from '../src/lib/iroh';

describe('signaling helpers', () => {
  it('uses regular non-replaceable signaling kind', () => {
    expect(SIGNAL_KIND).toBe(41002);
  });

  it('adds session id as a nostr tag when present', () => {
    expect(buildSignalTags('peer-topic', 'iv-value', 'session-1')).toEqual([
      ['d', 'peer-topic'],
      ['iv', 'iv-value'],
      ['sid', 'session-1'],
    ]);
  });

  it('omits session tag for legacy signals without a session id', () => {
    expect(buildSignalTags('peer-topic', 'iv-value')).toEqual([
      ['d', 'peer-topic'],
      ['iv', 'iv-value'],
    ]);
  });

  it('accepts only signals for the active session once a session exists', () => {
    expect(isSignalForSession(undefined, undefined)).toBe(true);
    expect(isSignalForSession('active-session', 'active-session')).toBe(true);
    expect(isSignalForSession('active-session', 'old-session')).toBe(false);
    expect(isSignalForSession('active-session', undefined)).toBe(false);
  });

  it('detects stale answer errors caused by stable peer state', () => {
    const err = new Error(
      "Failed to execute 'setRemoteDescription' on 'RTCPeerConnection': " +
      'Failed to set remote answer sdp: Called in wrong state: stable'
    );

    expect(isStableAnswerSignalError('answer', err)).toBe(true);
    expect(isStableAnswerSignalError('sdp', err)).toBe(true);
    expect(isStableAnswerSignalError('candidate', err)).toBe(false);
  });

  it('bounds processed event cache and evicts oldest ids', () => {
    const cache = new BoundedEventCache(2);

    cache.add('event-1');
    cache.add('event-2');
    cache.add('event-3');

    expect(cache.has('event-1')).toBe(false);
    expect(cache.has('event-2')).toBe(true);
    expect(cache.has('event-3')).toBe(true);
  });

  it('assigns one deterministic relay initiator to avoid fallback glare', () => {
    expect(getDeterministicRelayRole('aaa-peer', 'bbb-peer')).toBe('initiator');
    expect(getDeterministicRelayRole('bbb-peer', 'aaa-peer')).toBe('responder');
  });

  it('fans out critical signals to every configured relay despite stale health', () => {
    const relays = ['wss://relay-1.example', 'wss://relay-2.example', 'wss://relay-3.example'];
    const health = new Map([
      ['wss://relay-1.example', { status: 'healthy' as const, lastCheck: Date.now() }],
      ['wss://relay-2.example', { status: 'unhealthy' as const, lastCheck: Date.now() }],
    ]);

    expect(selectSignalPublishRelays(relays, health, 'offer')).toEqual(relays);
  });

  it('caps high-volume ICE candidate fanout and avoids known bad relays', () => {
    const relays = [
      'wss://relay-1.example',
      'wss://relay-2.example',
      'wss://relay-3.example',
      'wss://relay-4.example',
      'wss://relay-5.example',
    ];
    const health = new Map([
      ['wss://relay-1.example', { status: 'healthy' as const, lastCheck: Date.now() }],
      ['wss://relay-2.example', { status: 'unhealthy' as const, lastCheck: Date.now() }],
      ['wss://relay-3.example', { status: 'healthy' as const, lastCheck: Date.now() }],
    ]);

    expect(selectSignalPublishRelays(relays, health, 'candidate')).toEqual([
      'wss://relay-1.example',
      'wss://relay-3.example',
    ]);
  });

  it('includes secure inbound handshakes in the visible peer set', () => {
    expect(selectVisiblePeers({
      connectedPeers: [],
      relayPeers: [],
      handshakenPeers: ['desktop-peer'],
      metadataPeers: ['desktop-peer'],
    })).toEqual(['desktop-peer']);
  });

  it('keeps merely visible metadata peers out of the active connected set', () => {
    expect(selectConnectedPeers({
      connectedPeers: ['connected-peer'],
      relayPeers: [],
    })).toEqual(['connected-peer']);
  });

  it('accepts a fresh relay hello even when old relay state says connected', () => {
    expect(shouldAcceptRelayHello('old-session', 'connected', 'new-session')).toBe(true);
    expect(shouldAcceptRelayHello('same-session', 'connected', 'same-session')).toBe(false);
    expect(shouldAcceptRelayHello('same-session', 'connecting', 'same-session')).toBe(true);
  });

  it('responds to relay sync with a fresh hello even when old relay state is connected', () => {
    expect(shouldSendRelayHelloForSync('initiator')).toBe(true);
    expect(shouldSendRelayHelloForSync('responder')).toBe(false);
  });

  it('processes a relay hello ack for a newer attempted session even if an older session is connected', () => {
    expect(shouldProcessRelayHelloAck({
      attemptedSession: 'new-session',
      establishedSession: 'old-session',
      relayStatus: 'connected',
      incomingSession: 'new-session',
    })).toBe(true);
    expect(shouldProcessRelayHelloAck({
      attemptedSession: 'new-session',
      establishedSession: 'new-session',
      relayStatus: 'connected',
      incomingSession: 'new-session',
    })).toBe(false);
    expect(shouldProcessRelayHelloAck({
      attemptedSession: 'new-session',
      establishedSession: 'old-session',
      relayStatus: 'connected',
      incomingSession: 'old-session',
    })).toBe(false);
  });

  it('accepts relay messages only for the established relay session', () => {
    expect(isRelayMessageForSession('established-session', 'established-session')).toBe(true);
    expect(isRelayMessageForSession('established-session', 'attempted-session')).toBe(false);
    expect(isRelayMessageForSession(undefined, 'legacy-session')).toBe(true);
  });

  it('bounds queued signaling by peer and total pending peers', () => {
    expect(canQueueSignal({
      existingPeerQueueLength: 2,
      pendingPeerCount: 2,
      peerAlreadyQueued: true,
      maxSignalsPerPeer: 2,
      maxPendingPeers: 4,
    })).toBe(false);

    expect(canQueueSignal({
      existingPeerQueueLength: 0,
      pendingPeerCount: 4,
      peerAlreadyQueued: false,
      maxSignalsPerPeer: 2,
      maxPendingPeers: 4,
    })).toBe(false);

    expect(canQueueSignal({
      existingPeerQueueLength: 1,
      pendingPeerCount: 4,
      peerAlreadyQueued: true,
      maxSignalsPerPeer: 2,
      maxPendingPeers: 4,
    })).toBe(true);
  });

  it('assembles file chunks by byte offset even when relay delivery is out of order', () => {
    const chunks = new Map<number, Uint8Array>();

    expect(addFileChunk(chunks, 4, new Uint8Array([5, 6]))).toBe(2);
    expect(addFileChunk(chunks, 0, new Uint8Array([1, 2]))).toBe(2);
    expect(addFileChunk(chunks, 2, new Uint8Array([3, 4]))).toBe(2);

    expect(Array.from(assembleFileChunks(chunks))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('ignores duplicate file chunks so relay replays do not corrupt downloads', () => {
    const chunks = new Map<number, Uint8Array>();

    expect(addFileChunk(chunks, 0, new Uint8Array([1, 2]))).toBe(2);
    expect(addFileChunk(chunks, 0, new Uint8Array([1, 2]))).toBe(0);

    expect(Array.from(assembleFileChunks(chunks))).toEqual([1, 2]);
  });

  it('rejects overlapping file chunks so progress cannot be inflated', () => {
    const chunks = new Map<number, Uint8Array>();

    expect(addFileChunk(chunks, 0, new Uint8Array(10))).toBe(10);
    expect(addFileChunk(chunks, 5, new Uint8Array(5))).toBe(0);
    expect(addFileChunk(chunks, 10, new Uint8Array(5))).toBe(5);
  });

  it('rejects inbound file chunks that exceed declared size or quota', () => {
    expect(validateInboundFileChunk({
      offset: 10,
      chunkSize: 5,
      totalSize: 12,
      maxFileSize: 100,
      existingChunkCount: 0,
      maxChunksPerTransfer: 10,
    }).ok).toBe(false);

    expect(validateInboundFileChunk({
      offset: 0,
      chunkSize: 5,
      totalSize: 101,
      maxFileSize: 100,
      existingChunkCount: 0,
      maxChunksPerTransfer: 10,
    }).ok).toBe(false);

    expect(validateInboundFileChunk({
      offset: 0,
      chunkSize: 5,
      totalSize: 100,
      maxFileSize: 100,
      existingChunkCount: 10,
      maxChunksPerTransfer: 10,
    }).ok).toBe(false);
  });

  it('selects stale active inbound transfers for cleanup', () => {
    const transfers = new Map([
      ['active-stale', { status: 'active' as const, type: 'download' as const }],
      ['active-fresh', { status: 'active' as const, type: 'download' as const }],
      ['completed-stale', { status: 'completed' as const, type: 'download' as const }],
      ['upload-stale', { status: 'active' as const, type: 'upload' as const }],
    ]);
    const startedAt = new Map([
      ['active-stale', 0],
      ['active-fresh', 15_000],
      ['completed-stale', 0],
      ['upload-stale', 0],
    ]);

    expect(selectStaleTransferIds(transfers, startedAt, 20_000, 10_000)).toEqual(['active-stale']);
  });

  it('does not process speculative WebRTC offers once secure relay is connected', () => {
    expect(shouldProcessWebRtcOffer('connected')).toBe(false);
    expect(shouldProcessWebRtcOffer('connecting')).toBe(true);
    expect(shouldProcessWebRtcOffer(undefined)).toBe(true);
  });

  it('throttles repeated connection attempts while a peer may be offline', () => {
    expect(shouldStartConnectionAttempt(undefined, 10_000, 30_000)).toBe(true);
    expect(shouldStartConnectionAttempt(0, 10_000, 30_000)).toBe(false);
    expect(shouldStartConnectionAttempt(0, 31_000, 30_000)).toBe(true);
  });

  it('detects a connection attempt with no remote response', () => {
    expect(hasConnectionAttemptTimedOut(undefined, 60_000, 20_000)).toBe(false);
    expect(hasConnectionAttemptTimedOut(0, 10_000, 20_000)).toBe(false);
    expect(hasConnectionAttemptTimedOut(0, 21_000, 20_000)).toBe(true);
  });

  it('prefers a fresh online Nostr discovery result over a stale Pkarr identity', () => {
    expect(chooseDiscoveryResult({
      pkarrPeerId: 'stale-peer',
      nostrResult: { peerId: 'online-peer', timestamp: 100_000 },
      now: 105_000,
      maxAgeMs: 30_000,
    })).toBe('online-peer');
  });

  it('falls back to Pkarr when the Nostr discovery result is stale', () => {
    expect(chooseDiscoveryResult({
      pkarrPeerId: 'pkarr-peer',
      nostrResult: { peerId: 'old-peer', timestamp: 10_000 },
      now: 100_000,
      maxAgeMs: 30_000,
    })).toBe('pkarr-peer');
  });

  it('updates the local version marker without deleting peer metadata', () => {
    const storage = new Map<string, string>([
      ['nexus_iroh_ver', '3.1.28'],
      ['nexus_metadata', JSON.stringify({ 'peer-1': { displayName: 'Heimdal' } })],
    ]);
    const removedKeys: string[] = [];
    const mockStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => {
        removedKeys.push(key);
        storage.delete(key);
      },
    };

    expect(syncLocalVersion(mockStorage, '3.1.53')).toBe(true);
    expect(storage.get('nexus_iroh_ver')).toBe('3.1.53');
    expect(storage.get('nexus_metadata')).toBe(JSON.stringify({ 'peer-1': { displayName: 'Heimdal' } }));
    expect(removedKeys).toEqual([]);
  });
});

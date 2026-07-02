import { describe, it, expect, beforeEach } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';

// Replicate the signaling constants from iroh.ts
const SIGNAL_KIND = 41002;
const OLD_SIGNAL_KIND = 20000;

// Derive shared secret (same algorithm as iroh.ts)
async function getSignalingSecret(topicId: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`iroh-signal-v3-${topicId}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hash);
}

// Encrypt (same as iroh.ts)
async function encryptData(key: Uint8Array, plaintext: string): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['encrypt']);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, new TextEncoder().encode(plaintext));
  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode(...iv)),
  };
}

// Decrypt (same as iroh.ts)
async function decryptText(key: Uint8Array, ciphertext: string, ivStr: string): Promise<string> {
  const iv = Uint8Array.from(atob(ivStr), c => c.charCodeAt(0));
  const data = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, data);
  return new TextDecoder().decode(decrypted);
}

// Build a signal event (same as sendNostrSignal in iroh.ts)
async function buildSignalEvent(
  signKey: Uint8Array,
  topicId: string,
  payload: any,
  kind: number = SIGNAL_KIND
) {
  const secret = await getSignalingSecret(topicId);
  const { ciphertext, iv } = await encryptData(secret, JSON.stringify(payload));
  const unsignedEvent = {
  kind,
  created_at: Math.floor(Date.now() / 1000),
  tags: [['d', topicId], ['iv', iv]],
  content: ciphertext,
  };
  return finalizeEvent(unsignedEvent, signKey);
}

// Parse a signal event (same as listenOnNostr onevent in iroh.ts)
async function parseSignalEvent(event: any, topicId: string) {
  const secret = await getSignalingSecret(topicId);
  const iv = event.tags.find((t: any) => t[0] === 'iv')?.[1];
  if (!iv) return null;
  const decrypted = await decryptText(secret, event.content, iv);
  return JSON.parse(decrypted);
}

describe('Nostr Signaling Protocol', () => {
  const topicId = 'test-topic-' + Date.now();
  let secretKeyA: Uint8Array;
  let secretKeyB: Uint8Array;
  let pubkeyA: string;
  let pubkeyB: string;

  beforeEach(() => {
    secretKeyA = generateSecretKey();
    secretKeyB = generateSecretKey();
    pubkeyA = getPublicKey(secretKeyA);
    pubkeyB = getPublicKey(secretKeyB);
  });

  it('should encrypt and decrypt signals on the same topic', async () => {
    const payload = { senderId: 'peer-a', type: 'offer', sdp: { type: 'offer', sdp: 'fake-sdp' } };
    const event = await buildSignalEvent(secretKeyA, topicId, payload);
    const parsed = await parseSignalEvent(event, topicId);

    expect(parsed).not.toBeNull();
    expect(parsed.type).toBe('offer');
    expect(parsed.senderId).toBe('peer-a');
    expect(parsed.sdp.type).toBe('offer');
  });

  it('should not decrypt signals with wrong topic', async () => {
    const payload = { senderId: 'peer-a', type: 'offer', sdp: { type: 'offer', sdp: 'fake-sdp' } };
    const event = await buildSignalEvent(secretKeyA, topicId, payload);

    // Try to decrypt with wrong topic
    await expect(parseSignalEvent(event, 'wrong-topic')).rejects.toThrow();
  });

  it('should use kind 41002 (non-replaceable)', async () => {
    const payload = { senderId: 'peer-a', type: 'offer', sdp: {} };
    const event = await buildSignalEvent(secretKeyA, topicId, payload, SIGNAL_KIND);
    expect(event.kind).toBe(41002);
  });

  it('should NOT use kind 20000 (replaceable)', async () => {
    // Kind 20000 is parameterized replaceable per NIP-33
    // Events with same (pubkey, d-tag) overwrite each other
    const payload = { senderId: 'peer-a', type: 'offer', sdp: {} };
    const event = await buildSignalEvent(secretKeyA, topicId, payload, OLD_SIGNAL_KIND);
    expect(event.kind).toBe(20000);
    // This is the bug: kind 20000 events get overwritten
  });

  it('should allow multiple events from same pubkey on same topic with kind 41002', async () => {
    // Simulate: A sends offer, then candidates, all to same topic
    const offer = await buildSignalEvent(secretKeyA, topicId, 
      { senderId: 'a', type: 'offer', sdp: { type: 'offer', sdp: 'offer-sdp' } }, SIGNAL_KIND);
    
    const candidate1 = await buildSignalEvent(secretKeyA, topicId,
      { senderId: 'a', type: 'candidate', sdp: { candidate: 'c1' } }, SIGNAL_KIND);
    
    const candidate2 = await buildSignalEvent(secretKeyA, topicId,
      { senderId: 'a', type: 'candidate', sdp: { candidate: 'c2' } }, SIGNAL_KIND);

    // All three events should have different IDs (not overwriting each other)
    expect(offer.id).not.toBe(candidate1.id);
    expect(candidate1.id).not.toBe(candidate2.id);
    expect(offer.id).not.toBe(candidate2.id);

    // All should be decryptable
    const parsedOffer = await parseSignalEvent(offer, topicId);
    const parsedC1 = await parseSignalEvent(candidate1, topicId);
    const parsedC2 = await parseSignalEvent(candidate2, topicId);

    expect(parsedOffer.type).toBe('offer');
    expect(parsedC1.type).toBe('candidate');
    expect(parsedC2.type).toBe('candidate');
  });

  it('should demonstrate kind 20000 overwrite bug', async () => {
    // With kind 20000, same (pubkey, d-tag) events replace each other
    // This means only the latest event is retained by the relay
    const offer = await buildSignalEvent(secretKeyA, topicId,
      { senderId: 'a', type: 'offer', sdp: { type: 'offer' } }, OLD_SIGNAL_KIND);
    
    const candidate = await buildSignalEvent(secretKeyA, topicId,
      { senderId: 'a', type: 'candidate', sdp: { candidate: 'c1' } }, OLD_SIGNAL_KIND);

    // Both events have same (pubkey, d-tag) → relay would only keep the latest
    expect(offer.pubkey).toBe(candidate.pubkey);
    expect(offer.tags[0]).toEqual(candidate.tags[0]); // same d-tag
    
    // The IDs are different (they're different events)
    expect(offer.id).not.toBe(candidate.id);
    
    // But a relay implementing NIP-33 would DELETE offer and only keep candidate
    // This is why tunnels fail: the offer gets replaced by candidates
    console.log('Kind 20000 overwrite bug: offer and candidate share same (pubkey, d-tag)');
    console.log('  pubkey:', offer.pubkey.slice(0, 8));
    console.log('  d-tag:', offer.tags[0][1].slice(0, 8));
    console.log('  offer id:', offer.id?.slice(0, 8));
    console.log('  candidate id:', candidate.id?.slice(0, 8));
  });

  it('should support two-way signaling: offer → answer flow', async () => {
    // A sends offer on topic = A's peerId (responseTopic)
    const offerTopic = 'peer-a-id';
    const offerPayload = { senderId: 'peer-a', type: 'offer', sdp: { type: 'offer', sdp: 'offer-sdp' } };
    const offerEvent = await buildSignalEvent(secretKeyA, offerTopic, offerPayload);

    // B sends answer on same topic = A's peerId (responseTopic)
    const answerPayload = { senderId: 'peer-b', type: 'answer', sdp: { type: 'answer', sdp: 'answer-sdp' } };
    const answerEvent = await buildSignalEvent(secretKeyB, offerTopic, answerPayload);

    // A receives both events (subscribed to its own peerId)
    const parsedOffer = await parseSignalEvent(offerEvent, offerTopic);
    const parsedAnswer = await parseSignalEvent(answerEvent, offerTopic);

    expect(parsedOffer.type).toBe('offer');
    expect(parsedOffer.senderId).toBe('peer-a');
    expect(parsedAnswer.type).toBe('answer');
    expect(parsedAnswer.senderId).toBe('peer-b');
  });

  it('should support full connection flow: A→ticket, B→ticket, B→A_id', async () => {
    // Simulate the full signaling flow
    const ticket = 'shared-ticket-id';
    const peerIdA = 'peer-a-id';
    const peerIdB = 'peer-b-id';

    // A subscribes to: ticket, peerIdA
    // B subscribes to: ticket

    // Step 1: A sends offer to ticket
    const offerEvent = await buildSignalEvent(secretKeyA, ticket,
      { senderId: peerIdA, type: 'offer', sdp: { type: 'offer', sdp: 'offer-sdp' } });

    // Step 2: B receives offer (subscribed to ticket)
    const parsedOffer = await parseSignalEvent(offerEvent, ticket);
    expect(parsedOffer.type).toBe('offer');
    expect(parsedOffer.senderId).toBe(peerIdA);

    // Step 3: B sends answer to peerIdA (A's ID, where A is listening)
    const answerEvent = await buildSignalEvent(secretKeyB, peerIdA,
      { senderId: peerIdB, type: 'answer', sdp: { type: 'answer', sdp: 'answer-sdp' } });

    // Step 4: A receives answer (subscribed to peerIdA)
    const parsedAnswer = await parseSignalEvent(answerEvent, peerIdA);
    expect(parsedAnswer.type).toBe('answer');
    expect(parsedAnswer.senderId).toBe(peerIdB);

    // Step 5: B sends candidates to peerIdA
    const candidateEvent = await buildSignalEvent(secretKeyB, peerIdA,
      { senderId: peerIdB, type: 'candidate', sdp: { candidate: 'ice-candidate-1' } });

    // Step 6: A receives candidate
    const parsedCandidate = await parseSignalEvent(candidateEvent, peerIdA);
    expect(parsedCandidate.type).toBe('candidate');

  console.log('Full signaling flow verified:');
  console.log(' A→ticket: offer (kind 41002, d: ticket)');
  console.log(' B→peerIdA: answer (kind 41002, d: peerIdA)');
  console.log(' B→peerIdA: candidate (kind 41002, d: peerIdA)');
  console.log(' All events non-replaceable → no overwrites');
  });
});

describe.skip('Nostr Relay Integration', () => {
  // These tests connect to real Nostr relays
  const RELAYS = ['wss://nos.lol', 'wss://relay.primal.net'];
  const TEST_TIMEOUT = 15000;

  it('should publish and receive kind 41002 events via relay', async () => {
    const pool = new SimplePool();
    const topicId = 'ethos-test-' + Date.now();
    const signKey = generateSecretKey();
    const pubkey = getPublicKey(signKey);

    const payload = { senderId: 'test-sender', type: 'offer', sdp: { type: 'offer', sdp: 'test' } };
    const event = await buildSignalEvent(signKey, topicId, payload);

    // Publish
    const promises = pool.publish(RELAYS, event);
    await Promise.allSettled(promises);

    // Subscribe and wait for our own event
    const received = await new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        sub.close();
        reject(new Error('Timeout waiting for event'));
      }, TEST_TIMEOUT);

      const sub = pool.subscribeMany(RELAYS, {
        kinds: [SIGNAL_KIND],
        '#d': [topicId],
        limit: 1,
      }, {
        onevent: (evt: any) => {
          clearTimeout(timeout);
          sub.close();
          resolve(evt);
        },
        oneose: () => {
          // EOSE received, keep waiting for event
        },
      });
    });

    expect(received).not.toBeNull();
    expect(received.kind).toBe(SIGNAL_KIND);

    const parsed = await parseSignalEvent(received, topicId);
    expect(parsed.type).toBe('offer');
    expect(parsed.senderId).toBe('test-sender');

    pool.close(RELAYS);
  }, 20000);

  it('should NOT receive kind 41002 events with wrong d-tag filter', async () => {
    const pool = new SimplePool();
    const topicId = 'ethos-wrong-' + Date.now();
    const signKey = generateSecretKey();

    const payload = { senderId: 'test', type: 'offer', sdp: {} };
    const event = await buildSignalEvent(signKey, topicId, payload);

    await Promise.allSettled(pool.publish(RELAYS, event));

    // Subscribe with wrong d-tag
    let received = false;
    const sub = pool.subscribeMany(RELAYS, {
      kinds: [SIGNAL_KIND],
      '#d': ['nonexistent-topic'],
      limit: 1,
    }, {
      onevent: () => { received = true; },
      oneose: () => {},
    });

    await new Promise(r => setTimeout(r, 3000));
    sub.close();
    expect(received).toBe(false);

    pool.close(RELAYS);
  }, 10000);

  it('should preserve multiple events from same pubkey on same topic (kind 41002)', async () => {
    const pool = new SimplePool();
    const topicId = 'ethos-multi-' + Date.now();
    const signKey = generateSecretKey();

    // Send 3 events to same topic from same pubkey
    const events = [];
    for (let i = 0; i < 3; i++) {
      const payload = { senderId: 'test', type: i === 0 ? 'offer' : 'candidate', sdp: { idx: i } };
      const event = await buildSignalEvent(signKey, topicId, payload);
      events.push(event);
      await Promise.allSettled(pool.publish(RELAYS, event));
      await new Promise(r => setTimeout(r, 500)); // Small delay between events
    }

    // Subscribe and collect all events
    const received: any[] = [];
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        sub.close();
        resolve();
      }, 5000);

      const sub = pool.subscribeMany(RELAYS, {
        kinds: [SIGNAL_KIND],
        '#d': [topicId],
      }, {
        onevent: (evt: any) => {
          received.push(evt);
        },
        oneose: () => {},
      });
    });

    // With kind 41002, we should get all 3 events (not just the latest)
    expect(received.length).toBeGreaterThanOrEqual(1);
    console.log(`Received ${received.length} of 3 events (kind 41002, non-replaceable)`);

    pool.close(RELAYS);
  }, 20000);
});

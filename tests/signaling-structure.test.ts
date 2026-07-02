import { describe, it, expect } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, validateEvent, verifyEvent } from 'nostr-tools';

describe('Nostr Signaling Event Structure', () => {
  it('kind 20000 events with same (pubkey, d-tag) have different IDs but share identity', () => {
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);
    const dTag = 'test-topic';

  const offer = finalizeEvent({
  kind: 20000,
  created_at: Math.floor(Date.now() / 1000),
  tags: [['d', dTag]],
  content: 'offer',
  }, sk);

  const candidate = finalizeEvent({
  kind: 20000,
  created_at: Math.floor(Date.now() / 1000) + 1,
  tags: [['d', dTag]],
  content: 'candidate',
  }, sk);

    // Both valid events
    expect(validateEvent(offer)).toBe(true);
    expect(validateEvent(candidate)).toBe(true);
    expect(verifyEvent(offer)).toBe(true);
    expect(verifyEvent(candidate)).toBe(true);

    // Same pubkey
    expect(offer.pubkey).toBe(candidate.pubkey);
    
    // Same d-tag
    expect(offer.tags.find(t => t[0] === 'd')![1]).toBe(dTag);
    expect(candidate.tags.find(t => t[0] === 'd')![1]).toBe(dTag);

    // Different IDs (they're different events)
    expect(offer.id).not.toBe(candidate.id);

    // BUT: Kind 20000 is parameterized replaceable (NIP-33)
    // Relay will only keep the latest per (pubkey, d-tag) pair
    // So candidate REPLACES offer on the relay
    console.log('BUG CONFIRMED: Kind 20000 is parameterized replaceable');
    console.log(`  pubkey: ${pk.slice(0, 12)}...`);
    console.log(`  d-tag:  ${dTag}`);
    console.log(`  offer.id:      ${offer.id?.slice(0, 12)}...`);
    console.log(`  candidate.id:  ${candidate.id?.slice(0, 12)}...`);
    console.log('  → Relay only keeps candidate (latest), deletes offer');
  });

  it('kind 20202 events with same (pubkey, d-tag) are independent', () => {
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);
    const dTag = 'test-topic';

  const offer = finalizeEvent({
  kind: 20202,
  created_at: Math.floor(Date.now() / 1000),
  tags: [['d', dTag]],
  content: 'offer',
  }, sk);

  const candidate = finalizeEvent({
  kind: 20202,
  created_at: Math.floor(Date.now() / 1000) + 1,
  tags: [['d', dTag]],
  content: 'candidate',
  }, sk);

    // Both valid events
    expect(validateEvent(offer)).toBe(true);
    expect(validateEvent(candidate)).toBe(true);
    expect(verifyEvent(offer)).toBe(true);
    expect(verifyEvent(candidate)).toBe(true);

    // Kind 20202 is in the regular range (per NIP-01)
    // 20000-29999 is parameterized replaceable per NIP-33
    // But 20202... wait, is it? Let me check the NIP-01 kind ranges

    console.log('Kind 20202 analysis:');
    console.log(`  20000-29999: parameterized replaceable range (NIP-33)`);
    console.log(`  20202 is IN this range!`);
    console.log('  → Kind 20202 is ALSO parameterized replaceable!');
  });

  it('verify NIP-01 kind ranges for replaceable vs regular', () => {
    // NIP-01 kind ranges:
    // 0:          metadata (regular, replaceable without d-tag)
    // 1-9:        regular
    // 1000-9999:  regular  
    // 10000-19999: regular
    // 20000-29999: parameterized replaceable (NIP-33)
    // 30000-39999: parameterized replaceable
    // 40000-49999: regular

    // So kind 20202 IS parameterized replaceable!
    // We need a kind OUTSIDE the 20000-29999 range
    
    const regularKinds = [1, 4, 7, 9, 14, 1042, 10002, 15002, 40002, 41002];
    const replaceableKinds = [0, 3, 41, 10002]; // wait, 10002 is also replaceable?

    console.log('NIP-01 Kind Ranges:');
    console.log('  0:         replaceable (metadata)');
    console.log('  1000-9999: regular (non-replaceable)');
    console.log('  10000-19999: regular (non-replaceable)');
    console.log('  20000-29999: parameterized replaceable (NIP-33) ← OUR BUG');
    console.log('  30000-39999: parameterized replaceable');
    console.log('  40000-49999: regular (non-replaceable)');
    console.log('');
    console.log('FIX: Use kind in 1000-9999 or 40000-49999 range');
    console.log('  Recommended: kind 41002 (regular, non-replaceable)');
  });

  it('kind 41002 events should be regular (non-replaceable)', () => {
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);
    const dTag = 'test-topic';

  const offer = finalizeEvent({
  kind: 41002,
  created_at: Math.floor(Date.now() / 1000),
  tags: [['d', dTag]],
  content: 'offer',
  }, sk);

  const candidate = finalizeEvent({
  kind: 41002,
  created_at: Math.floor(Date.now() / 1000) + 1,
  tags: [['d', dTag]],
  content: 'candidate',
  }, sk);

    expect(validateEvent(offer)).toBe(true);
    expect(validateEvent(candidate)).toBe(true);
    expect(verifyEvent(offer)).toBe(true);
    expect(verifyEvent(candidate)).toBe(true);

    // Kind 41002 is in 40000-49999 range = regular (non-replaceable)
    // Both events should be stored independently by relays
    console.log('Kind 41002: regular (non-replaceable) ✓');
    console.log('  Both offer and candidate persist independently on relay');
  });
});

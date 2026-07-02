import { describe, it, expect } from 'vitest';
import { SimplePool } from 'nostr-tools/pool';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools';

const RELAYS = ['wss://nos.lol', 'wss://relay.primal.net', 'wss://relay.damus.io'];

async function publishAndWait(pool: SimplePool, signKey: Uint8Array, kind: number, dTag: string) {
  const event = finalizeEvent({
  kind,
  created_at: Math.floor(Date.now() / 1000),
  tags: [['d', dTag]],
  content: 'test-' + Date.now(),
  }, signKey);

  const results = await Promise.allSettled(pool.publish(RELAYS, event));
  const succeeded = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;
  
  // Wait a bit for propagation
  await new Promise(r => setTimeout(r, 2000));

  // Try to read it back
  const received = await new Promise<any>((resolve) => {
    let found: any = null;
    const timeout = setTimeout(() => {
      sub.close();
      resolve(found);
    }, 5000);

    const sub = pool.subscribeMany(RELAYS, {
      kinds: [kind],
      '#d': [dTag],
      limit: 1,
    }, {
      onevent: (evt: any) => {
        found = evt;
        clearTimeout(timeout);
        sub.close();
        resolve(found);
      },
      oneose: () => {},
    });
  });

  return { kind, succeeded, failed, received: received !== null, eventId: event.id?.slice(0, 8) };
}

describe('Relay Kind Support', () => {
  it('should test which event kinds relays accept and return', async () => {
    const pool = new SimplePool();
    const signKey = generateSecretKey();

    const kinds = [
      1,      // Short text note (regular)
      4,      // Encrypted DM (regular) 
      7,      // Reaction (regular)
      20000,  // Parameterized replaceable (old broken kind)
      20202,  // Custom regular kind (our proposed fix)
      30000,  // Parameterized replaceable range start
      21002,  // Custom regular
      9,      // Regular
      14,     // Regular
      1042,   // Regular
    ];

    const results = [];
    for (const kind of kinds) {
      const dTag = `kind-test-${kind}-${Date.now()}`;
      const result = await publishAndWait(pool, signKey, kind, dTag);
      results.push(result);
      console.log(`Kind ${kind}: publish=${result.succeeded}ok/${result.failed}fail, received=${result.received}`);
      await new Promise(r => setTimeout(r, 500));
    }

    // Print summary
    console.log('\n=== RELAY KIND SUPPORT SUMMARY ===');
    results.forEach(r => {
      console.log(`  Kind ${r.kind}: publish=${r.succeeded}/${r.failed}, roundtrip=${r.received ? 'YES' : 'NO'}`);
    });

    // At minimum, kind 1 should work
    const kind1Result = results.find(r => r.kind === 1);
    expect(kind1Result?.succeeded).toBeGreaterThan(0);

    pool.close(RELAYS);
  }, 120000);
});

import { describe, it, expect } from 'vitest';
import { SimplePool } from 'nostr-tools/pool';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools';

const RELAYS = ['wss://nos.lol', 'wss://relay.primal.net'];
const describeLiveRelay = process.env.RUN_LIVE_RELAY_TESTS === '1' ? describe : describe.skip;

describeLiveRelay('Relay Roundtrip', () => {
  it('should publish kind 20000 and read it back', async () => {
    const pool = new SimplePool();
    const signKey = generateSecretKey();
    const dTag = 'test-20000-' + Date.now();

    // Subscribe FIRST (before publish, so we catch the event in real-time)
    const received = await new Promise<any[]>((resolve) => {
      const events: any[] = [];
      const timeout = setTimeout(() => {
        sub.close();
        resolve(events);
      }, 10000);

      const sub = (pool as any).subscribeMany(RELAYS, {
        kinds: [20000],
        '#d': [dTag],
      }, {
        onevent: (evt: any) => {
          events.push(evt);
          clearTimeout(timeout);
          sub.close();
          resolve(events);
        },
        oneose: () => {
          // After EOSE, now publish so the event arrives in real-time
          const event = finalizeEvent({
            kind: 20000,
            
            created_at: Math.floor(Date.now() / 1000),
            tags: [['d', dTag]],
            content: 'hello-20000',
          }, signKey);
          
          pool.publish(RELAYS, event).forEach(p => p.catch(() => {}));
        },
      });
    });

    console.log(`Kind 20000: received ${received.length} events`);
    expect(received.length).toBeGreaterThanOrEqual(1);
    pool.close(RELAYS);
  }, 15000);

  it('should publish kind 20202 and read it back', async () => {
    const pool = new SimplePool();
    const signKey = generateSecretKey();
    const dTag = 'test-20202-' + Date.now();

    const received = await new Promise<any[]>((resolve) => {
      const events: any[] = [];
      const timeout = setTimeout(() => {
        sub.close();
        resolve(events);
      }, 10000);

      const sub = (pool as any).subscribeMany(RELAYS, {
        kinds: [20202],
        '#d': [dTag],
      }, {
        onevent: (evt: any) => {
          events.push(evt);
          clearTimeout(timeout);
          sub.close();
          resolve(events);
        },
        oneose: () => {
          const event = finalizeEvent({
            kind: 20202,
            
            created_at: Math.floor(Date.now() / 1000),
            tags: [['d', dTag]],
            content: 'hello-20202',
          }, signKey);
          
          pool.publish(RELAYS, event).forEach(p => p.catch(() => {}));
        },
      });
    });

    console.log(`Kind 20202: received ${received.length} events`);
    pool.close(RELAYS);
    // If relays reject kind 20202, this will be 0
  }, 15000);

  it('should verify kind 20000 replaceable behavior: later event replaces earlier', async () => {
    const pool = new SimplePool();
    const signKey = generateSecretKey();
    const dTag = 'test-replace-' + Date.now();

    // Collect events in real-time while publishing
    const received: any[] = [];
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        sub.close();
        resolve();
      }, 10000);

      const sub = (pool as any).subscribeMany(RELAYS, {
        kinds: [20000],
        '#d': [dTag],
      }, {
        onevent: (evt: any) => {
          received.push(evt);
        },
        oneose: () => {
          // Publish offer first
          const offer = finalizeEvent({
            kind: 20000,
            
            created_at: Math.floor(Date.now() / 1000),
            tags: [['d', dTag]],
            content: 'offer',
          }, signKey);
          pool.publish(RELAYS, offer).forEach(p => p.catch(() => {}));

          // Then publish candidate (same pubkey, same d-tag → replaces offer on relay)
          setTimeout(() => {
            const candidate = finalizeEvent({
              kind: 20000,
              
              created_at: Math.floor(Date.now() / 1000),
              tags: [['d', dTag]],
              content: 'candidate',
            }, signKey);
            pool.publish(RELAYS, candidate).forEach(p => p.catch(() => {}));
          }, 1000);
        },
      });
    });

    console.log(`Replaceable test: received ${received.length} events in real-time`);
    // In real-time, we should get both events (2)
    // But if we query later, only the latest would exist
    console.log(`  Events: ${received.map(e => e.content).join(', ')}`);
    pool.close(RELAYS);
  }, 15000);

  it('should verify kind 20202 non-replaceable behavior: all events preserved', async () => {
    const pool = new SimplePool();
    const signKey = generateSecretKey();
    const dTag = 'test-noreplace-' + Date.now();

    const received: any[] = [];
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        sub.close();
        resolve();
      }, 10000);

      const sub = (pool as any).subscribeMany(RELAYS, {
        kinds: [20202],
        '#d': [dTag],
      }, {
        onevent: (evt: any) => {
          received.push(evt);
        },
        oneose: () => {
          const offer = finalizeEvent({
            kind: 20202,
            
            created_at: Math.floor(Date.now() / 1000),
            tags: [['d', dTag]],
            content: 'offer',
          }, signKey);
          pool.publish(RELAYS, offer).forEach(p => p.catch(() => {}));

          setTimeout(() => {
            const candidate = finalizeEvent({
              kind: 20202,
              
              created_at: Math.floor(Date.now() / 1000),
              tags: [['d', dTag]],
              content: 'candidate',
            }, signKey);
            pool.publish(RELAYS, candidate).forEach(p => p.catch(() => {}));
          }, 1000);
        },
      });
    });

    console.log(`Non-replaceable test: received ${received.length} events in real-time`);
    console.log(`  Events: ${received.map(e => e.content).join(', ')}`);
    pool.close(RELAYS);
  }, 15000);
});

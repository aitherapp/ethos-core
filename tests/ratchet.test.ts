import { beforeAll, describe, expect, it } from 'vitest';

describe('double ratchet message derivation', () => {
  beforeAll(() => {
    (globalThis as any).window = { crypto: globalThis.crypto };
  });

  it('can encrypt more than one message with the evolved chain key', async () => {
    const { b64encode, initializeRatchet, ratchetEncrypt } = await import('../src/lib/crypto');
    const secretBytes = b64encode(crypto.getRandomValues(new Uint8Array(64)));
    const state = await initializeRatchet(secretBytes, true);

    const first = await ratchetEncrypt(state, 'first message');
    const second = await ratchetEncrypt(first.state, 'second message');

    expect(first.ciphertext).toBeTruthy();
    expect(second.ciphertext).toBeTruthy();
    expect(second.state.sendMessageNum).toBe(2);
  });
});

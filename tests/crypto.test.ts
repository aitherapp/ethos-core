import { describe, expect, it } from 'vitest';
import { doesPublicKeyMatchPeerId, hashId } from '../src/lib/crypto';

describe('crypto identity helpers', () => {
  it('matches a peer id to the public key that created it', async () => {
    const publicKey = 'test-classical-public-key';
    const peerId = await hashId(publicKey);

    await expect(doesPublicKeyMatchPeerId(peerId, publicKey)).resolves.toBe(true);
  });

  it('rejects a peer id claimed with a different public key', async () => {
    const peerId = await hashId('victim-public-key');

    await expect(doesPublicKeyMatchPeerId(peerId, 'attacker-public-key')).resolves.toBe(false);
  });

  it('supports legacy 16-character peer id prefixes', async () => {
    const publicKey = 'legacy-classical-public-key';
    const peerId = await hashId(publicKey);

    await expect(doesPublicKeyMatchPeerId(peerId.slice(0, 16), publicKey)).resolves.toBe(true);
  });
});

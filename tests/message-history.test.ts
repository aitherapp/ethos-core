import { describe, expect, it } from 'vitest';
import {
  MemoryMessageHistoryStore,
  loadEncryptedMessageHistory,
  loadEncryptedGroups,
  loadEncryptedPeerMetadata,
  saveEncryptedMessageHistory,
  saveEncryptedGroups,
  saveEncryptedPeerMetadata,
} from '../src/lib/messageHistory';
import { SecureMessage } from '../src/types';

function message(id: string, content: string, expiresAt?: number): SecureMessage {
  return {
    id,
    senderId: 'sender-peer',
    receiverId: 'receiver-peer',
    type: 'text',
    content,
    iv: '',
    timestamp: Number(id),
    expiresAt,
  };
}

describe('encrypted message history', () => {
  it('stores and loads messages encrypted at rest', async () => {
    (globalThis as any).window = { crypto: globalThis.crypto };
    const store = new MemoryMessageHistoryStore();

    await saveEncryptedMessageHistory({
      store,
      identityMaterial: 'node-secret-material',
      nodeId: 'node-1',
      messages: [message('1', 'hello Singapore')],
    });

    const stored = await store.get('node-1');
    expect(stored).toBeTruthy();
    expect(stored).not.toContain('hello Singapore');

    await expect(loadEncryptedMessageHistory({
      store,
      identityMaterial: 'node-secret-material',
      nodeId: 'node-1',
    })).resolves.toEqual([message('1', 'hello Singapore')]);
  });

  it('does not persist ephemeral messages and caps retained history', async () => {
    (globalThis as any).window = { crypto: globalThis.crypto };
    const store = new MemoryMessageHistoryStore();

    await saveEncryptedMessageHistory({
      store,
      identityMaterial: 'node-secret-material',
      nodeId: 'node-1',
      maxMessages: 2,
      messages: [
        message('1', 'oldest'),
        message('2', 'self destruct', Date.now() + 60_000),
        message('3', 'newer'),
        message('4', 'newest'),
      ],
    });

    await expect(loadEncryptedMessageHistory({
      store,
      identityMaterial: 'node-secret-material',
      nodeId: 'node-1',
    })).resolves.toEqual([
      message('3', 'newer'),
      message('4', 'newest'),
    ]);
  });

  it('requires the same optional lock secret to decrypt locked history', async () => {
    (globalThis as any).window = { crypto: globalThis.crypto };
    const store = new MemoryMessageHistoryStore();

    await saveEncryptedMessageHistory({
      store,
      identityMaterial: 'node-secret-material',
      nodeId: 'node-1',
      lockSecret: 'correct horse battery staple',
      messages: [message('1', 'locked message')],
    });

    await expect(loadEncryptedMessageHistory({
      store,
      identityMaterial: 'node-secret-material',
      nodeId: 'node-1',
      lockSecret: 'wrong passphrase',
    })).resolves.toBeNull();

    await expect(loadEncryptedMessageHistory({
      store,
      identityMaterial: 'node-secret-material',
      nodeId: 'node-1',
      lockSecret: 'correct horse battery staple',
    })).resolves.toEqual([message('1', 'locked message')]);
  });

  it('stores locked history with a salted PBKDF2 envelope', async () => {
    (globalThis as any).window = { crypto: globalThis.crypto };
    const store = new MemoryMessageHistoryStore();

    await saveEncryptedMessageHistory({
      store,
      identityMaterial: 'node-secret-material',
      nodeId: 'node-1',
      lockSecret: 'correct horse battery staple',
      messages: [message('1', 'locked message')],
    });

    const stored = await store.get('node-1');
    const envelope = JSON.parse(stored ?? '{}');

    expect(envelope.version).toBe(2);
    expect(envelope.kdf).toBe('PBKDF2-SHA256');
    expect(envelope.salt).toEqual(expect.any(String));
    expect(envelope.iterations).toBeGreaterThanOrEqual(200_000);
    expect(stored).not.toContain('correct horse battery staple');
  });

  it('uses a fresh salt when locked history is saved again', async () => {
    (globalThis as any).window = { crypto: globalThis.crypto };
    const store = new MemoryMessageHistoryStore();

    await saveEncryptedMessageHistory({
      store,
      identityMaterial: 'node-secret-material',
      nodeId: 'node-1',
      lockSecret: 'correct horse battery staple',
      messages: [message('1', 'first save')],
    });
    const first = JSON.parse(await store.get('node-1') ?? '{}');

    await saveEncryptedMessageHistory({
      store,
      identityMaterial: 'node-secret-material',
      nodeId: 'node-1',
      lockSecret: 'correct horse battery staple',
      messages: [message('2', 'second save')],
    });
    const second = JSON.parse(await store.get('node-1') ?? '{}');

    expect(second.salt).not.toBe(first.salt);
  });

  it('stores peer metadata encrypted in the same IndexedDB-backed store', async () => {
    (globalThis as any).window = { crypto: globalThis.crypto };
    const store = new MemoryMessageHistoryStore();

    await saveEncryptedPeerMetadata({
      store,
      identityMaterial: 'node-secret-material',
      nodeId: 'node-1',
      metadata: { 'peer-1': { displayName: 'Heimdal' } },
    });

    const stored = await store.get('node-1:peer-metadata');
    expect(stored).toBeTruthy();
    expect(stored).not.toContain('Heimdal');
    expect(stored).not.toContain('peer-1');

    await expect(loadEncryptedPeerMetadata({
      store,
      identityMaterial: 'node-secret-material',
      nodeId: 'node-1',
    })).resolves.toEqual({ 'peer-1': { displayName: 'Heimdal' } });
  });

  it('does not decrypt peer metadata with different identity material', async () => {
    (globalThis as any).window = { crypto: globalThis.crypto };
    const store = new MemoryMessageHistoryStore();

    await saveEncryptedPeerMetadata({
      store,
      identityMaterial: 'node-secret-material',
      nodeId: 'node-1',
      metadata: { 'peer-1': { displayName: 'Heimdal' } },
    });

    await expect(loadEncryptedPeerMetadata({
      store,
      identityMaterial: 'different-node-secret',
      nodeId: 'node-1',
    })).resolves.toBeNull();
  });

  it('stores group metadata encrypted in the same IndexedDB-backed store', async () => {
    (globalThis as any).window = { crypto: globalThis.crypto };
    const store = new MemoryMessageHistoryStore();

    await saveEncryptedGroups({
      store,
      identityMaterial: 'node-secret-material',
      nodeId: 'node-1',
      groups: [{
        id: 'group-1',
        name: 'Operation Alpha',
        members: ['node-1', 'peer-1'],
        ownerId: 'node-1',
        createdAt: 100,
        updatedAt: 100,
      }],
    });

    const stored = await store.get('node-1:groups');
    expect(stored).toBeTruthy();
    expect(stored).not.toContain('Operation Alpha');
    expect(stored).not.toContain('peer-1');

    await expect(loadEncryptedGroups({
      store,
      identityMaterial: 'node-secret-material',
      nodeId: 'node-1',
    })).resolves.toEqual([{
      id: 'group-1',
      name: 'Operation Alpha',
      members: ['node-1', 'peer-1'],
      ownerId: 'node-1',
      createdAt: 100,
      updatedAt: 100,
    }]);
  });
});

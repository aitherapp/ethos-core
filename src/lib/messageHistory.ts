import { Group, SecureMessage } from '../types';

const MESSAGE_HISTORY_VERSION = 1;
const LOCKED_MESSAGE_HISTORY_VERSION = 2;
const HISTORY_LOCK_KDF = 'PBKDF2-SHA256';
const HISTORY_LOCK_PBKDF2_ITERATIONS = 310_000;
const PEER_METADATA_VERSION = 1;
const GROUPS_VERSION = 1;
const DEFAULT_MAX_MESSAGES = 500;
const HISTORY_DB_NAME = 'ethos-message-history';
const HISTORY_DB_VERSION = 1;
const HISTORY_STORE_NAME = 'histories';

type MessageHistoryEnvelope = {
  version: number;
  iv: string;
  ciphertext: string;
};

type LockedMessageHistoryEnvelope = MessageHistoryEnvelope & {
  version: typeof LOCKED_MESSAGE_HISTORY_VERSION;
  kdf: typeof HISTORY_LOCK_KDF;
  salt: string;
  iterations: number;
};

type EncryptedEnvelope = {
  version: number;
  iv: string;
  ciphertext: string;
};

export type PeerMetadataRecord = {
  displayName: string;
};

export type PeerMetadata = Record<string, PeerMetadataRecord>;

export interface MessageHistoryStore {
  get(nodeId: string): Promise<string | null>;
  set(nodeId: string, value: string): Promise<void>;
  delete(nodeId: string): Promise<void>;
}

export class MemoryMessageHistoryStore implements MessageHistoryStore {
  private items = new Map<string, string>();

  async get(nodeId: string) {
    return this.items.get(nodeId) ?? null;
  }

  async set(nodeId: string, value: string) {
    this.items.set(nodeId, value);
  }

  async delete(nodeId: string) {
    this.items.delete(nodeId);
  }
}

export class IndexedDbMessageHistoryStore implements MessageHistoryStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  async get(nodeId: string) {
    const db = await this.open();
    return this.request<string | undefined>(
      db.transaction(HISTORY_STORE_NAME, 'readonly').objectStore(HISTORY_STORE_NAME).get(nodeId)
    ).then(value => value ?? null);
  }

  async set(nodeId: string, value: string) {
    const db = await this.open();
    await this.request(
      db.transaction(HISTORY_STORE_NAME, 'readwrite').objectStore(HISTORY_STORE_NAME).put(value, nodeId)
    );
  }

  async delete(nodeId: string) {
    const db = await this.open();
    await this.request(
      db.transaction(HISTORY_STORE_NAME, 'readwrite').objectStore(HISTORY_STORE_NAME).delete(nodeId)
    );
  }

  private open() {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not available'));
        return;
      }

      const request = indexedDB.open(HISTORY_DB_NAME, HISTORY_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(HISTORY_STORE_NAME)) {
          db.createObjectStore(HISTORY_STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Failed to open message history database'));
    });

    return this.dbPromise;
  }

  private request<T = unknown>(request: IDBRequest<T>) {
    return new Promise<T>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    });
  }
}

type MessageHistoryOptions = {
  store: MessageHistoryStore;
  identityMaterial: string;
  nodeId: string;
  lockSecret?: string;
  messages?: SecureMessage[];
  maxMessages?: number;
};

type PeerMetadataOptions = {
  store: MessageHistoryStore;
  identityMaterial: string;
  nodeId: string;
  metadata?: PeerMetadata;
};

type GroupsOptions = {
  store: MessageHistoryStore;
  identityMaterial: string;
  nodeId: string;
  groups?: Group[];
};

function encodeBase64(bytes: ArrayBuffer | Uint8Array) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function getStorageKeyMaterial(identityMaterial: string, nodeId: string, lockSecret = '') {
  return new TextEncoder().encode(`ethos-message-history-v2:${nodeId}:${identityMaterial}:${lockSecret}`);
}

async function deriveHistoryKey(identityMaterial: string, nodeId: string, lockSecret?: string) {
  const digest = await window.crypto.subtle.digest(
    'SHA-256',
    getStorageKeyMaterial(identityMaterial, nodeId, lockSecret)
  );

  return window.crypto.subtle.importKey(
    'raw',
    digest,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function deriveLockedHistoryKey(identityMaterial: string, nodeId: string, lockSecret: string, salt: string, iterations: number) {
  const passphraseKey = await window.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(lockSecret),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode(`ethos-history-lock-v3:${nodeId}:${identityMaterial}:${salt}`),
      iterations,
      hash: 'SHA-256',
    },
    passphraseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function getPeerMetadataStorageKey(nodeId: string) {
  return `${nodeId}:peer-metadata`;
}

function getGroupsStorageKey(nodeId: string) {
  return `${nodeId}:groups`;
}

async function encryptJsonEnvelope(value: unknown, key: CryptoKey, version: number): Promise<EncryptedEnvelope> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );

  return {
    version,
    iv: encodeBase64(iv),
    ciphertext: encodeBase64(ciphertext),
  };
}

async function decryptJsonEnvelope<T>(stored: string, key: CryptoKey, expectedVersion: number): Promise<T | null> {
  try {
    const envelope = JSON.parse(stored) as EncryptedEnvelope;
    if (envelope.version !== expectedVersion || !envelope.iv || !envelope.ciphertext) {
      return null;
    }

    const plaintext = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: decodeBase64(envelope.iv) },
      key,
      decodeBase64(envelope.ciphertext)
    );

    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch {
    return null;
  }
}

function sanitizeForHistory(messages: SecureMessage[], maxMessages: number) {
  return messages
    .filter(message => !message.expiresAt)
    .map(({ downloadUrl, ...message }) => message)
    .slice(-maxMessages);
}

export async function saveEncryptedMessageHistory(options: MessageHistoryOptions) {
  const messages = sanitizeForHistory(
    options.messages ?? [],
    options.maxMessages ?? DEFAULT_MAX_MESSAGES
  );
  const salt = options.lockSecret ? encodeBase64(window.crypto.getRandomValues(new Uint8Array(16))) : undefined;
  const key = options.lockSecret
    ? await deriveLockedHistoryKey(
      options.identityMaterial,
      options.nodeId,
      options.lockSecret,
      salt!,
      HISTORY_LOCK_PBKDF2_ITERATIONS
    )
    : await deriveHistoryKey(options.identityMaterial, options.nodeId);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(messages));
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );
  const envelope: MessageHistoryEnvelope | LockedMessageHistoryEnvelope = {
    version: options.lockSecret ? LOCKED_MESSAGE_HISTORY_VERSION : MESSAGE_HISTORY_VERSION,
    iv: encodeBase64(iv),
    ciphertext: encodeBase64(ciphertext),
    ...(options.lockSecret ? {
      kdf: HISTORY_LOCK_KDF,
      salt: salt!,
      iterations: HISTORY_LOCK_PBKDF2_ITERATIONS,
    } : {}),
  };

  await options.store.set(options.nodeId, JSON.stringify(envelope));
}

function sanitizePeerMetadata(metadata: PeerMetadata) {
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([peerId, meta]) => typeof peerId === 'string' && typeof meta?.displayName === 'string')
      .map(([peerId, meta]) => [peerId, { displayName: meta.displayName.slice(0, 80) }])
  );
}

function sanitizeGroups(groups: Group[]) {
  return groups
    .filter(group => (
      typeof group?.id === 'string' &&
      typeof group.name === 'string' &&
      Array.isArray(group.members) &&
      typeof group.ownerId === 'string' &&
      typeof group.createdAt === 'number' &&
      typeof group.updatedAt === 'number'
    ))
    .map(group => ({
      id: group.id,
      name: group.name.slice(0, 120),
      members: [...new Set(group.members.filter(member => typeof member === 'string'))],
      ownerId: group.ownerId,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    }));
}

export async function saveEncryptedPeerMetadata(options: PeerMetadataOptions) {
  const key = await deriveHistoryKey(options.identityMaterial, options.nodeId);
  const envelope = await encryptJsonEnvelope(
    sanitizePeerMetadata(options.metadata ?? {}),
    key,
    PEER_METADATA_VERSION
  );

  await options.store.set(getPeerMetadataStorageKey(options.nodeId), JSON.stringify(envelope));
}

export async function loadEncryptedPeerMetadata(options: Omit<PeerMetadataOptions, 'metadata'>) {
  const stored = await options.store.get(getPeerMetadataStorageKey(options.nodeId));
  if (!stored) return {};

  const key = await deriveHistoryKey(options.identityMaterial, options.nodeId);
  const metadata = await decryptJsonEnvelope<PeerMetadata>(stored, key, PEER_METADATA_VERSION);
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;

  return sanitizePeerMetadata(metadata);
}

export async function saveEncryptedGroups(options: GroupsOptions) {
  const key = await deriveHistoryKey(options.identityMaterial, options.nodeId);
  const envelope = await encryptJsonEnvelope(
    sanitizeGroups(options.groups ?? []),
    key,
    GROUPS_VERSION
  );

  await options.store.set(getGroupsStorageKey(options.nodeId), JSON.stringify(envelope));
}

export async function loadEncryptedGroups(options: Omit<GroupsOptions, 'groups'>) {
  const stored = await options.store.get(getGroupsStorageKey(options.nodeId));
  if (!stored) return [];

  const key = await deriveHistoryKey(options.identityMaterial, options.nodeId);
  const groups = await decryptJsonEnvelope<Group[]>(stored, key, GROUPS_VERSION);
  if (!groups || !Array.isArray(groups)) return null;

  return sanitizeGroups(groups);
}

export async function loadEncryptedMessageHistory(options: Omit<MessageHistoryOptions, 'messages' | 'maxMessages'>) {
  const stored = await options.store.get(options.nodeId);
  if (!stored) return [];

  try {
    const envelope = JSON.parse(stored) as MessageHistoryEnvelope | LockedMessageHistoryEnvelope;
    if (!envelope.iv || !envelope.ciphertext) {
      return null;
    }

    let key: CryptoKey;
    if (envelope.version === LOCKED_MESSAGE_HISTORY_VERSION) {
      const lockedEnvelope = envelope as LockedMessageHistoryEnvelope;
      if (
        lockedEnvelope.kdf !== HISTORY_LOCK_KDF ||
        !lockedEnvelope.salt ||
        !Number.isFinite(lockedEnvelope.iterations) ||
        !options.lockSecret
      ) {
        return null;
      }
      key = await deriveLockedHistoryKey(
        options.identityMaterial,
        options.nodeId,
        options.lockSecret,
        lockedEnvelope.salt,
        lockedEnvelope.iterations
      );
    } else if (envelope.version === MESSAGE_HISTORY_VERSION) {
      key = await deriveHistoryKey(options.identityMaterial, options.nodeId, options.lockSecret);
    } else {
      return null;
    }

    const plaintext = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: decodeBase64(envelope.iv) },
      key,
      decodeBase64(envelope.ciphertext)
    );
    const messages = JSON.parse(new TextDecoder().decode(plaintext));

    if (!Array.isArray(messages)) return null;
    return messages.filter((message): message is SecureMessage =>
      typeof message?.id === 'string' &&
      typeof message?.senderId === 'string' &&
      typeof message?.receiverId === 'string' &&
      typeof message?.type === 'string' &&
      typeof message?.content === 'string' &&
      typeof message?.iv === 'string' &&
      typeof message?.timestamp === 'number'
    );
  } catch {
    return null;
  }
}

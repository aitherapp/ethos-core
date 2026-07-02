import { describe, expect, it } from 'vitest';
import { createDiagnosticsLog } from '../src/lib/diagnostics';

class MemoryStorage implements Storage {
  private items = new Map<string, string>();
  readonly length = 0;

  clear(): void {
    this.items.clear();
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.items.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

describe('diagnostics log', () => {
  it('keeps the newest entries within the configured limit', () => {
    const log = createDiagnosticsLog({ maxEntries: 2, storage: new MemoryStorage() });

    log.record('debug', ['first']);
    log.record('info', ['second']);
    log.record('warn', ['third']);

    expect(log.getEntries().map(entry => entry.message)).toEqual(['second', 'third']);
  });

  it('redacts private keys and large encrypted payloads before export', () => {
    const log = createDiagnosticsLog({ maxEntries: 5, storage: new MemoryStorage() });

    log.record('error', [
      'failed',
      {
        classicalPrivateKey: 'super-secret-key',
        ciphertext: 'A'.repeat(120),
        peerId: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      },
    ]);

    const exported = log.exportText({ appVersion: 'test-version' });

    expect(exported).toContain('ETHOS Diagnostics');
    expect(exported).toContain('App Version: test-version');
    expect(exported).toContain('[redacted-private-key]');
    expect(exported).toContain('[redacted-large-value:120]');
    expect(exported).not.toContain('super-secret-key');
    expect(exported).not.toContain('A'.repeat(120));
  });

  it('redacts relationship metadata before export', () => {
    const log = createDiagnosticsLog({ maxEntries: 5, storage: new MemoryStorage() });
    const peerId = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    const sessionId = 'session=12345678-1234-1234-1234-123456789abc';
    const relayUrl = 'wss://relay.example.com';

    log.record('debug', [`Searching Mesh for "Alice"`]);
    log.record('debug', [`[Nostr] Mesh IN: relay-message from ${peerId.slice(0, 8)} ${sessionId}`]);
    log.record('info', [{ relayUrl, peerId, displayName: 'Alice' }]);

    const exported = log.exportText({ appVersion: 'test-version' });

    expect(exported).toContain('[redacted-name]');
    expect(exported).toContain('[redacted-peer-id]');
    expect(exported).toContain('[redacted-session]');
    expect(exported).toContain('[redacted-relay-url]');
    expect(exported).not.toContain('Alice');
    expect(exported).not.toContain(peerId);
    expect(exported).not.toContain(relayUrl);
    expect(exported).not.toContain('12345678-1234-1234-1234-123456789abc');
  });
});

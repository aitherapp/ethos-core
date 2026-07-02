import { describe, expect, it } from 'vitest';
import {
  ICE_SERVERS_STORAGE_KEY,
  buildIceServers,
  formatIceTestResult,
  isValidUserIceServer,
  loadUserIceServers,
  parseIceUrls,
  saveUserIceServers,
  summarizeIceCandidates,
  userIceServerToRtc,
} from '../src/lib/iceServers';

describe('ice server configuration', () => {
  it('parses comma and newline separated ICE URLs', () => {
    expect(parseIceUrls('turn:a.example:3478, stun:b.example:3478\nturns:c.example:443')).toEqual([
      'turn:a.example:3478',
      'stun:b.example:3478',
      'turns:c.example:443',
    ]);
  });

  it('prefers user servers before hosted, stun, and demo defaults', () => {
    const servers = buildIceServers([
      {
        id: 'user-turn',
        label: 'My TURN',
        urls: 'turn:turn.example.com:3478',
        username: 'alice',
        credential: 'secret',
      },
    ], {
      urls: 'turn:hosted.example:3478',
      username: 'hosted-user',
      credential: 'hosted-pass',
    });

    expect(servers.map(server => server.layer)).toEqual(['user', 'hosted', 'stun']);
    expect(servers[0]).toMatchObject({
      urls: ['turn:turn.example.com:3478'],
      username: 'alice',
      credential: 'secret',
    });
  });

  it('skips demo TURN when the user already configured TURN servers', () => {
    const servers = buildIceServers([
      {
        id: 'user-turn',
        urls: 'turn:turn.example.com:3478',
      },
    ]);

    expect(servers.some(server => server.layer === 'demo')).toBe(false);
  });

  it('includes demo TURN only when no user or hosted TURN exists', () => {
    const servers = buildIceServers([], {});
    expect(servers.at(-1)?.layer).toBe('demo');
    expect(servers.at(-1)?.label).toContain('Demo TURN');
  });

  it('persists user ICE servers in localStorage', () => {
    const storage = new Map<string, string>();
    const servers = [{
      id: 'turn-1',
      label: 'Production TURN',
      urls: 'turn:turn.example.com:3478',
      username: 'alice',
      credential: 'secret',
    }];

    saveUserIceServers(servers, {
      setItem: (key, value) => { storage.set(key, value); },
    });

    expect(storage.get(ICE_SERVERS_STORAGE_KEY)).toBeTruthy();
    expect(loadUserIceServers({
      getItem: key => storage.get(key) ?? null,
    })).toEqual(servers);
  });

  it('rejects invalid stored ICE server entries', () => {
    const storage = {
      getItem: () => JSON.stringify([
        { id: 'bad', urls: 'https://not-ice.example' },
        { id: 'good', urls: 'turn:turn.example.com:3478' },
      ]),
    };

    expect(loadUserIceServers(storage)).toEqual([
      { id: 'good', urls: 'turn:turn.example.com:3478' },
    ]);
  });

  it('converts user entries to RTCIceServer objects without logging credentials elsewhere', () => {
    expect(isValidUserIceServer({ urls: 'stun:stun.example.com:3478' })).toBe(true);
    expect(userIceServerToRtc({
      id: 'turn-1',
      urls: 'turn:turn.example.com:3478,turns:turn.example.com:5349',
      username: 'alice',
      credential: 'secret',
    })).toEqual({
      urls: ['turn:turn.example.com:3478', 'turns:turn.example.com:5349'],
      username: 'alice',
      credential: 'secret',
    });
  });

  it('summarizes gathered ICE candidate types', () => {
    expect(summarizeIceCandidates([
      'candidate:1 1 udp 2122260223 192.0.2.1 54321 typ host',
      'candidate:2 1 udp 1686052607 203.0.113.1 54321 typ srflx raddr 192.0.2.1',
      'candidate:3 1 udp 41885439 198.51.100.9 54321 typ relay raddr 203.0.113.1',
    ])).toEqual({
      host: 1,
      srflx: 1,
      relay: 1,
      total: 3,
    });

    expect(formatIceTestResult({
      host: 1,
      srflx: 1,
      relay: 1,
      total: 3,
    })).toContain('Relay candidates are available');
  });
});

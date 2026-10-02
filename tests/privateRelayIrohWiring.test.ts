import { describe, it, expect, vi } from 'vitest';
import { buildPrivateRelayHandshakeFields } from '../src/lib/privateRelayHandoff';
import {
  mergeSignalHandshakeFields,
  applyPrivateRelaySwitchResult,
  attemptPrivateRelayFromHandoff,
  attemptPrivateRelayFromSettings,
  clearedPrivateRelaySettings,
  disabledPrivateRelaySettings,
} from '../src/lib/privateRelayWiring';

const DEFAULTS = [
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://nostr.mom',
];

describe('buildPrivateRelayHandshakeFields', () => {
  it('returns empty when disabled or not ready', () => {
    expect(
      buildPrivateRelayHandshakeFields({
        enabled: false,
        ready: false,
        relayUrl: 'wss://r.example',
        authToken: 'tok',
      })
    ).toEqual({});
    expect(
      buildPrivateRelayHandshakeFields({
        enabled: true,
        ready: false,
        relayUrl: 'wss://r.example',
        authToken: 'tok',
      })
    ).toEqual({});
  });

  it('returns url and token when enabled and ready', () => {
    expect(
      buildPrivateRelayHandshakeFields({
        enabled: true,
        ready: true,
        relayUrl: 'wss://r.example',
        authToken: 'tok',
      })
    ).toEqual({ relayUrl: 'wss://r.example', relayAuthToken: 'tok' });
  });
});

describe('mergeSignalHandshakeFields', () => {
  it('spreads private relay fields alongside push fields', () => {
    expect(
      mergeSignalHandshakeFields(
        { pushGatewayUrl: 'https://gw.example' },
        { relayUrl: 'wss://r.example', relayAuthToken: 'tok' }
      )
    ).toEqual({
      pushGatewayUrl: 'https://gw.example',
      relayUrl: 'wss://r.example',
      relayAuthToken: 'tok',
    });
  });

  it('leaves push-only when private fields empty', () => {
    expect(
      mergeSignalHandshakeFields({ pushEndpoint: 'https://push' }, {})
    ).toEqual({ pushEndpoint: 'https://push' });
  });
});

describe('applyPrivateRelaySwitchResult', () => {
  it('calls setRelays with soft on success', () => {
    const setRelays = vi.fn();
    const notifyStatus = vi.fn();
    const ok = applyPrivateRelaySwitchResult(
      { ok: true, relays: ['wss://r.example/?token=tok'] },
      { setRelays, notifyStatus }
    );
    expect(ok).toBe(true);
    expect(setRelays).toHaveBeenCalledWith(['wss://r.example/?token=tok'], {
      soft: true,
    });
    expect(notifyStatus).not.toHaveBeenCalled();
  });

  it('warns and leaves relays unchanged on failure', () => {
    const setRelays = vi.fn();
    const notifyStatus = vi.fn();
    const ok = applyPrivateRelaySwitchResult(
      {
        ok: false,
        status: 'Private relay unavailable',
        relaysUnchanged: true,
      },
      { setRelays, notifyStatus }
    );
    expect(ok).toBe(false);
    expect(setRelays).not.toHaveBeenCalled();
    expect(notifyStatus).toHaveBeenCalledWith(
      'warning',
      'Private relay unavailable'
    );
  });
});

describe('attemptPrivateRelayFromHandoff', () => {
  it('probes once then switches private-only when connect succeeds', async () => {
    const setRelays = vi.fn();
    const notifyStatus = vi.fn();
    const probeConnect = vi.fn(async () => true);

    const ok = await attemptPrivateRelayFromHandoff(
      { relayUrl: 'wss://r.example', relayAuthToken: 'tok' },
      { setRelays, notifyStatus, probeConnect }
    );

    expect(ok).toBe(true);
    expect(probeConnect).toHaveBeenCalledTimes(1);
    expect(probeConnect).toHaveBeenCalledWith('wss://r.example/?token=tok');
    expect(setRelays).toHaveBeenCalledWith(['wss://r.example/?token=tok'], {
      soft: true,
    });
  });

  it('probes once and does not switch when connect fails', async () => {
    const setRelays = vi.fn();
    const notifyStatus = vi.fn();
    const probeConnect = vi.fn(async () => false);

    const ok = await attemptPrivateRelayFromHandoff(
      { relayUrl: 'wss://r.example', relayAuthToken: 'tok' },
      { setRelays, notifyStatus, probeConnect }
    );

    expect(ok).toBe(false);
    expect(probeConnect).toHaveBeenCalledTimes(1);
    expect(setRelays).not.toHaveBeenCalled();
    expect(notifyStatus).toHaveBeenCalledWith(
      'warning',
      'Private relay unavailable'
    );
  });
});

describe('attemptPrivateRelayFromSettings', () => {
  it('skips when disabled', async () => {
    const setRelays = vi.fn();
    const notifyStatus = vi.fn();
    const probeConnect = vi.fn(async () => true);

    const ok = await attemptPrivateRelayFromSettings(
      {
        enabled: false,
        ready: false,
        relayUrl: 'wss://r.example',
        authToken: 'tok',
      },
      { setRelays, notifyStatus, probeConnect, defaultRelays: DEFAULTS }
    );

    expect(ok).toBe(false);
    expect(probeConnect).not.toHaveBeenCalled();
    expect(setRelays).not.toHaveBeenCalled();
  });

  it('owner apply builds dual-homed list without requiring ready', async () => {
    const setRelays = vi.fn();
    const notifyStatus = vi.fn();
    const probeConnect = vi.fn(async () => true);

    const ok = await attemptPrivateRelayFromSettings(
      {
        enabled: true,
        ready: false,
        relayUrl: 'wss://r.example',
        authToken: 'tok',
      },
      { setRelays, notifyStatus, probeConnect, defaultRelays: DEFAULTS }
    );

    expect(ok).toBe(true);
    expect(setRelays).toHaveBeenCalledWith(
      [...DEFAULTS, 'wss://r.example/?token=tok'],
      { soft: true }
    );
  });

  it('does not switch pool when probe fails', async () => {
    const setRelays = vi.fn();
    const notifyStatus = vi.fn();
    const probeConnect = vi.fn(async () => false);

    const ok = await attemptPrivateRelayFromSettings(
      {
        enabled: true,
        ready: false,
        relayUrl: 'wss://r.example',
        authToken: 'tok',
      },
      { setRelays, notifyStatus, probeConnect, defaultRelays: DEFAULTS }
    );

    expect(ok).toBe(false);
    expect(setRelays).not.toHaveBeenCalled();
    expect(notifyStatus).toHaveBeenCalledWith(
      'warning',
      'Private relay unavailable'
    );
  });
});

describe('clearedPrivateRelaySettings', () => {
  it('returns disabled empty settings for reset', () => {
    expect(clearedPrivateRelaySettings()).toEqual({
      enabled: false,
      ready: false,
      relayUrl: '',
      authToken: '',
    });
  });
});

describe('disabledPrivateRelaySettings', () => {
  it('clears ready and enabled while keeping url/token for the form', () => {
    expect(
      disabledPrivateRelaySettings({
        enabled: true,
        ready: true,
        relayUrl: 'wss://r.example',
        authToken: 'tok',
      })
    ).toEqual({
      enabled: false,
      ready: false,
      relayUrl: 'wss://r.example',
      authToken: 'tok',
    });
  });
});

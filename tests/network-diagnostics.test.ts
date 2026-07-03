import { describe, expect, it } from 'vitest';
import { buildNetworkDiagnostics } from '../src/lib/networkDiagnostics';

describe('network diagnostics helpers', () => {
  it('summarizes real panel metrics from app state', () => {
    expect(buildNetworkDiagnostics({
      relayCount: 5,
      activePeerCount: 2,
      transferCount: 1,
      activeTransportLabel: 'Secure relay mode',
      recentEntries: [
        { id: 1, timestamp: '2026-07-03T12:00:00.000Z', level: 'info', message: 'older' },
        { id: 2, timestamp: '2026-07-03T12:00:01.000Z', level: 'warn', message: 'newer' },
      ],
    })).toEqual({
      metrics: [
        { label: 'Relays', value: '5' },
        { label: 'Active peers', value: '2' },
        { label: 'Transport', value: 'Secure relay mode' },
        { label: 'Transfers', value: '1' },
      ],
      recentEntries: [
        { id: 2, timestamp: '2026-07-03T12:00:01.000Z', level: 'warn', message: 'newer' },
        { id: 1, timestamp: '2026-07-03T12:00:00.000Z', level: 'info', message: 'older' },
      ],
    });
  });

  it('uses readable empty states when no peer or diagnostics are active', () => {
    expect(buildNetworkDiagnostics({
      relayCount: 0,
      activePeerCount: 0,
      transferCount: 0,
      recentEntries: [],
    })).toEqual({
      metrics: [
        { label: 'Relays', value: '0' },
        { label: 'Active peers', value: '0' },
        { label: 'Transport', value: 'No active peer' },
        { label: 'Transfers', value: '0' },
      ],
      recentEntries: [],
    });
  });
});

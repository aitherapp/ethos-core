import type { DiagnosticEntry } from './diagnostics';

export type NetworkDiagnosticMetric = {
  label: string;
  value: string;
};

export function buildNetworkDiagnostics({
  relayCount,
  activePeerCount,
  transferCount,
  activeTransportLabel,
  recentEntries,
}: {
  relayCount: number;
  activePeerCount: number;
  transferCount: number;
  activeTransportLabel?: string;
  recentEntries: DiagnosticEntry[];
}) {
  return {
    metrics: [
      { label: 'Relays', value: String(relayCount) },
      { label: 'Active peers', value: String(activePeerCount) },
      { label: 'Transport', value: activeTransportLabel ?? 'No active peer' },
      { label: 'Transfers', value: String(transferCount) },
    ] satisfies NetworkDiagnosticMetric[],
    recentEntries: [...recentEntries].slice(-3).reverse(),
  };
}

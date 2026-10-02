// src/widget/connectionStatus.ts
import type { RelayTransportMode } from '../lib/iroh';

export type WidgetConnectionStatus = 'connecting' | 'direct' | 'relay' | 'offline';

export function mapTransportModeToWidgetStatus(mode: RelayTransportMode): WidgetConnectionStatus {
  if (mode === 'direct') return 'direct';
  if (mode === 'relay') return 'relay';
  if (mode === 'unavailable') return 'offline';
  return 'connecting';
}

export function widgetStatusLabel(status: WidgetConnectionStatus): string {
  switch (status) {
    case 'direct':
      return 'Direct';
    case 'relay':
      return 'Relay';
    case 'offline':
      return 'Offline';
    default:
      return 'Connecting…';
  }
}

export function widgetStatusDotClass(status: WidgetConnectionStatus): string {
  return `ethos-online-dot ethos-online-dot--${status}`;
}

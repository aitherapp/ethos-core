// tests/widgetConnectionStatus.test.ts
import { describe, it, expect } from 'vitest';
import {
  mapTransportModeToWidgetStatus,
  widgetStatusLabel,
  widgetStatusDotClass,
} from '../src/widget/connectionStatus';

describe('widget connection status', () => {
  it('maps iroh transport modes to widget statuses', () => {
    expect(mapTransportModeToWidgetStatus('connecting')).toBe('connecting');
    expect(mapTransportModeToWidgetStatus('direct')).toBe('direct');
    expect(mapTransportModeToWidgetStatus('relay')).toBe('relay');
    expect(mapTransportModeToWidgetStatus('unavailable')).toBe('offline');
  });

  it('exposes visitor-facing labels', () => {
    expect(widgetStatusLabel('connecting')).toBe('Connecting…');
    expect(widgetStatusLabel('direct')).toBe('Direct');
    expect(widgetStatusLabel('relay')).toBe('Relay');
    expect(widgetStatusLabel('offline')).toBe('Offline');
  });

  it('exposes CSS classes for the status dot', () => {
    expect(widgetStatusDotClass('connecting')).toBe('ethos-online-dot ethos-online-dot--connecting');
    expect(widgetStatusDotClass('direct')).toBe('ethos-online-dot ethos-online-dot--direct');
    expect(widgetStatusDotClass('relay')).toBe('ethos-online-dot ethos-online-dot--relay');
    expect(widgetStatusDotClass('offline')).toBe('ethos-online-dot ethos-online-dot--offline');
  });
});

import { describe, expect, it } from 'vitest';
import { getMobileNavItems } from '../src/lib/mobileNav';

describe('mobile nav helpers', () => {
  it('keeps the compact mobile action menu in the expected order', () => {
    expect(getMobileNavItems('chat')).toEqual([
      { id: 'metrics', label: 'Network / Metrics' },
      { id: 'about', label: 'About' },
      { id: 'settings', label: 'Settings' },
    ]);
  });

  it('shows a hide label when the metrics panel is already open', () => {
    expect(getMobileNavItems('metrics')[0]).toEqual({
      id: 'metrics',
      label: 'Hide Network / Metrics',
    });
  });
});

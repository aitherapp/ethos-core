import { describe, expect, it } from 'vitest';
import { getAppLaunchHash, shouldShowAppForHash } from '../src/lib/appRoute';

describe('app route helpers', () => {
  it('shows the chat app only for the app hash', () => {
    expect(shouldShowAppForHash('#app')).toBe(true);
    expect(shouldShowAppForHash('app')).toBe(true);
    expect(shouldShowAppForHash('')).toBe(false);
    expect(shouldShowAppForHash('#security')).toBe(false);
  });

  it('uses a stable app launch hash for landing page calls to action', () => {
    expect(getAppLaunchHash()).toBe('#app');
  });
});

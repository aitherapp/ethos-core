import { describe, expect, it } from 'vitest';
import { ETHOS_MONERO_DONATION_ADDRESS, getMoneroDonationUri, isLikelyMoneroAddress } from '../src/lib/donations';

describe('donations', () => {
  it('pins the official ETHOS Monero donation address', () => {
    expect(ETHOS_MONERO_DONATION_ADDRESS).toBe('457gGJfBaW1KnE8xKorPQxFyrB6hkDvNtfS6JcGF77cDdfeQRKxuwTGNLKWrZohyym6KwKQ6DGJH52bYf4C5APwM4DPjUFD');
    expect(isLikelyMoneroAddress(ETHOS_MONERO_DONATION_ADDRESS)).toBe(true);
  });

  it('builds a Monero wallet URI without adding tracking metadata', () => {
    expect(getMoneroDonationUri()).toBe(`monero:${ETHOS_MONERO_DONATION_ADDRESS}`);
  });
});

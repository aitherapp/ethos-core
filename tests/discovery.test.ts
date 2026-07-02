import { describe, expect, it } from 'vitest';
import { getUnverifiedDiscoveryWarning, isDirectPeerTicket } from '../src/lib/discovery';

describe('discovery helpers', () => {
  it('recognizes direct peer tickets', () => {
    expect(isDirectPeerTicket('a'.repeat(64))).toBe(true);
    expect(isDirectPeerTicket('Alice')).toBe(false);
  });

  it('warns that display-name discovery is not identity proof', () => {
    expect(getUnverifiedDiscoveryWarning('Alice')).toContain('Display names are not identity proof');
    expect(getUnverifiedDiscoveryWarning('Alice')).toContain('Alice');
  });
});

import { describe, expect, it } from 'vitest';
import { validateHistoryPassphrase } from '../src/lib/historyLock';

describe('history lock passphrase validation', () => {
  it('rejects short history lock passphrases', () => {
    expect(validateHistoryPassphrase('short123')).toEqual({
      ok: false,
      message: 'Use at least 14 characters for the history lock.',
    });
  });

  it('accepts longer history lock passphrases', () => {
    expect(validateHistoryPassphrase('correct horse battery')).toEqual({ ok: true });
  });
});

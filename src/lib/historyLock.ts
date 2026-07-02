const MIN_HISTORY_PASSPHRASE_LENGTH = 14;

export function validateHistoryPassphrase(passphrase: string): { ok: true } | { ok: false; message: string } {
  if (passphrase.trim().length < MIN_HISTORY_PASSPHRASE_LENGTH) {
    return {
      ok: false,
      message: `Use at least ${MIN_HISTORY_PASSPHRASE_LENGTH} characters for the history lock.`,
    };
  }

  return { ok: true };
}

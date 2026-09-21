export const HANDSHAKE_BACKOFF_AFTER_RATE_LIMIT_MS = 10_000;

export function shouldResumeSignaling(
  lastResumeAt: number | undefined,
  now: number,
  minIntervalMs = 3000,
): boolean {
  if (lastResumeAt === undefined) {
    return true;
  }
  return now - lastResumeAt >= minIntervalMs;
}

export function shouldSendHandshakeNow(
  lastHandshakeAt: number | undefined,
  now: number,
  minIntervalMs = 2000,
  backoffUntil?: number,
): boolean {
  if (backoffUntil !== undefined && now < backoffUntil) {
    return false;
  }
  if (lastHandshakeAt === undefined) {
    return true;
  }
  return now - lastHandshakeAt >= minIntervalMs;
}

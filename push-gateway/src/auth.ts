/**
 * Extract a Bearer token from an Authorization header value.
 */
export function extractBearerToken(authorization: string | null | undefined): string | null {
  if (!authorization || typeof authorization !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  if (!match) return null;
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

/**
 * Timing-safe string equality for auth tokens (UTF-8 bytes).
 * Returns false when lengths differ (still scans the shorter buffer).
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aa = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(aa.length, bb.length);
  let diff = aa.length === bb.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    const x = i < aa.length ? aa[i]! : 0;
    const y = i < bb.length ? bb[i]! : 0;
    diff |= x ^ y;
  }
  return diff === 0;
}

/**
 * True when Authorization Bearer matches the configured AUTH_TOKEN.
 */
export function isAuthorized(
  authorization: string | null | undefined,
  expectedToken: string | undefined,
): boolean {
  if (!expectedToken) return false;
  const provided = extractBearerToken(authorization);
  if (!provided) return false;
  return timingSafeEqualString(provided, expectedToken);
}

/**
 * Extract Bearer token from Authorization header.
 */
function extractBearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  if (!match) return null;
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

/**
 * Query `token` param first, else `Authorization: Bearer …`.
 */
export function extractRelayToken(request: Request): string | null {
  const url = new URL(request.url);
  const queryToken = url.searchParams.get('token')?.trim();
  if (queryToken) return queryToken.length > 0 ? queryToken : null;
  return extractBearerToken(request.headers.get('Authorization'));
}

/**
 * Timing-safe string equality for auth tokens (UTF-8 bytes).
 */
export function tokensEqual(a: string, b: string): boolean {
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
 * True when the request carries a token matching expectedToken.
 */
export function isAuthorizedRelayRequest(request: Request, expectedToken: string): boolean {
  if (!expectedToken) return false;
  const provided = extractRelayToken(request);
  if (!provided) return false;
  return tokensEqual(provided, expectedToken);
}

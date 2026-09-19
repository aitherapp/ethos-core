/**
 * Exact Web Push service hostnames (SSRF protection).
 * Keep precise — never broad wildcards like *.googleapis.com.
 */
export const ALLOWED_PUSH_ENDPOINT_HOSTS: readonly string[] = [
  'web.push.apple.com',
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
];

/**
 * Returns true only for https URLs whose hostname is on the allowlist.
 */
export function isAllowedPushEndpointHost(endpoint: string): boolean {
  if (typeof endpoint !== 'string' || !endpoint) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  return (ALLOWED_PUSH_ENDPOINT_HOSTS as readonly string[]).includes(host);
}

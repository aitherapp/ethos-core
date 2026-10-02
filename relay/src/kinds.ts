/** ETHOS Nostr kinds allowed on the private relay (signaling + relay data). */
export const ALLOWED_RELAY_KINDS = new Set([41002, 41003]);

export const DEFAULT_MAX_EVENT_BYTES = 65536;

export function isAllowedRelayKind(kind: number): boolean {
  return ALLOWED_RELAY_KINDS.has(kind);
}

/**
 * True when raw JSON payload is within maxBytes (UTF-8), default 65536.
 */
export function isAcceptableEventSize(rawJson: string, maxBytes = DEFAULT_MAX_EVENT_BYTES): boolean {
  return new TextEncoder().encode(rawJson).byteLength <= maxBytes;
}

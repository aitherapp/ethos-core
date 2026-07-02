export function isDirectPeerTicket(value: string) {
  return /^[a-f0-9]{16,64}$/.test(value.trim());
}

export function getUnverifiedDiscoveryWarning(name: string) {
  return `Display names are not identity proof. "${name}" was found by public discovery, so confirm the peer ticket fingerprint before connecting.`;
}

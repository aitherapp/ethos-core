export const ETHOS_MONERO_DONATION_ADDRESS = '457gGJfBaW1KnE8xKorPQxFyrB6hkDvNtfS6JcGF77cDdfeQRKxuwTGNLKWrZohyym6KwKQ6DGJH52bYf4C5APwM4DPjUFD';

export function isLikelyMoneroAddress(address: string) {
  return /^[48][1-9A-HJ-NP-Za-km-z]{94}$/.test(address);
}

export function getMoneroDonationUri(address = ETHOS_MONERO_DONATION_ADDRESS) {
  return `monero:${address}`;
}

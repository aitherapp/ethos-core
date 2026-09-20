export interface PrivateRelaySettings {
  enabled: boolean;
  relayUrl: string;
  authToken: string;
}

const STORAGE_KEY = 'ethos_private_relay_settings';

const DEFAULT_SETTINGS: PrivateRelaySettings = {
  enabled: false,
  relayUrl: '',
  authToken: '',
};

export function loadPrivateRelaySettings(): PrivateRelaySettings {
  if (typeof localStorage === 'undefined') {
    return { ...DEFAULT_SETTINGS };
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { ...DEFAULT_SETTINGS };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<PrivateRelaySettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function savePrivateRelaySettings(settings: PrivateRelaySettings): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function isWssRelayUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'wss:';
  } catch {
    return false;
  }
}

export function buildAuthedRelayUrl(relayUrl: string, authToken: string): string {
  const parsed = new URL(relayUrl);
  parsed.searchParams.set('token', authToken);
  return parsed.toString();
}

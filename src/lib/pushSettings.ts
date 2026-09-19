export type PushContentMode = 'Minimal' | 'Sender' | 'Preview';
export type PushTriggerMode = 'Background only' | 'Always';

export interface PushSettings {
  enabled: boolean;
  gatewayUrl: string;
  authToken: string;
  contentMode: PushContentMode;
  triggerMode: PushTriggerMode;
}

const STORAGE_KEY = 'ethos_push_settings';

const DEFAULT_SETTINGS: PushSettings = {
  enabled: false,
  gatewayUrl: '',
  authToken: '',
  contentMode: 'Sender',
  triggerMode: 'Background only',
};

export function loadPushSettings(): PushSettings {
  if (typeof localStorage === 'undefined') {
    return { ...DEFAULT_SETTINGS };
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { ...DEFAULT_SETTINGS };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<PushSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function savePushSettings(settings: PushSettings): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function isHttpsGatewayUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

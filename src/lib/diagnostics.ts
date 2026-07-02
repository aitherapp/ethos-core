export type DiagnosticLevel = 'debug' | 'info' | 'warn' | 'error' | 'status';

export type DiagnosticEntry = {
  id: number;
  timestamp: string;
  level: DiagnosticLevel;
  message: string;
};

type DiagnosticsOptions = {
  maxEntries?: number;
  storageKey?: string;
  storage?: Storage | null;
};

type ExportContext = {
  appVersion?: string;
  relayCount?: number;
  peerCount?: number;
  visibilityState?: string;
  online?: boolean;
};

const DEFAULT_MAX_ENTRIES = 400;
const DEFAULT_STORAGE_KEY = 'ethos_diagnostics_log';
const LARGE_VALUE_MIN_LENGTH = 80;
const PRIVATE_KEY_PATTERN = /(privatekey|private_key|secretkey|secret_key|signkey|sign_key|seed|identitybundle|identity_bundle)/i;
const LARGE_PAYLOAD_PATTERN = /(ciphertext|content|pqcCiphertext|file_chunk|identityBytes)/i;
const RELATIONSHIP_METADATA_KEY_PATTERN = /(peerId|peer_id|displayName|display_name|relayUrl|relay_url|sessionId|session_id)/i;

function getSessionStorage() {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage;
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') return redactString(value);
  if (value instanceof Error) return redactString(`${value.name}: ${value.message}`);

  try {
    return JSON.stringify(value, (_key, nestedValue) => redactValue(_key, nestedValue));
  } catch {
    return redactString(String(value));
  }
}

function redactValue(key: string, value: unknown): unknown {
  if (PRIVATE_KEY_PATTERN.test(key)) return '[redacted-private-key]';
  if (RELATIONSHIP_METADATA_KEY_PATTERN.test(key)) {
    if (/relay/i.test(key)) return '[redacted-relay-url]';
    if (/session/i.test(key)) return '[redacted-session]';
    if (/display|name/i.test(key)) return '[redacted-name]';
    return '[redacted-peer-id]';
  }

  if (typeof value === 'string') {
    if (LARGE_PAYLOAD_PATTERN.test(key) && value.length >= LARGE_VALUE_MIN_LENGTH) {
      return `[redacted-large-value:${value.length}]`;
    }

    return redactString(value);
  }

  return value;
}

function redactString(value: string): string {
  return value
    .replace(/wss?:\/\/[^\s"',)]+/gi, '[redacted-relay-url]')
    .replace(/\bsession=[A-Za-z0-9_-]+(?:-[A-Za-z0-9_-]+)*/gi, 'session=[redacted-session]')
    .replace(/\b[a-f0-9]{64}\b/gi, '[redacted-peer-id]')
    .replace(/\bfrom\s+[a-f0-9]{8}\b/gi, 'from [redacted-peer-id]')
    .replace(/Searching Mesh for "[^"]+"/gi, 'Searching Mesh for "[redacted-name]"')
    .replace(/(classicalPrivateKey|pqcPrivateKey|privateKey|secretKey|signKey|seed)["':=\s]+[A-Za-z0-9+/=_-]+/gi, '$1=[redacted-private-key]')
    .replace(/[A-Za-z0-9+/=_-]{120,}/g, match => `[redacted-large-value:${match.length}]`);
}

function formatArgs(args: unknown[]) {
  return args.map(safeStringify).join(' ');
}

export class DiagnosticsLog {
  private entries: DiagnosticEntry[] = [];
  private nextId = 1;
  private readonly maxEntries: number;
  private readonly storageKey: string;
  private readonly storage: Storage | null;
  private listeners = new Set<() => void>();

  constructor(options: DiagnosticsOptions = {}) {
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
    this.storage = options.storage === undefined ? getSessionStorage() : options.storage;
    this.load();
  }

  record(level: DiagnosticLevel, args: unknown[]) {
    const entry: DiagnosticEntry = {
      id: this.nextId++,
      timestamp: new Date().toISOString(),
      level,
      message: formatArgs(args),
    };

    this.entries.push(entry);
    this.trim();
    this.persist();
    this.emit();
    return entry;
  }

  getEntries() {
    return [...this.entries];
  }

  clear() {
    this.entries = [];
    this.persist();
    this.emit();
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  exportText(context: ExportContext = {}) {
    const lines = [
      'ETHOS Diagnostics',
      `Generated: ${new Date().toISOString()}`,
      `App Version: ${context.appVersion ?? 'unknown'}`,
      `User Agent: ${typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent}`,
      `Visibility: ${context.visibilityState ?? (typeof document === 'undefined' ? 'unknown' : document.visibilityState)}`,
      `Online: ${String(context.online ?? (typeof navigator === 'undefined' ? 'unknown' : navigator.onLine))}`,
      `Relay Count: ${context.relayCount ?? 'unknown'}`,
      `Peer Count: ${context.peerCount ?? 'unknown'}`,
      '',
      'Recent Log:',
      ...this.entries.map(entry => `[${entry.timestamp}] ${entry.level.toUpperCase()} ${entry.message}`),
    ];

    return lines.join('\n');
  }

  private load() {
    if (!this.storage) return;

    try {
      const stored = this.storage.getItem(this.storageKey);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return;
      this.entries = parsed
        .filter((entry): entry is DiagnosticEntry =>
          typeof entry?.id === 'number' &&
          typeof entry?.timestamp === 'string' &&
          typeof entry?.level === 'string' &&
          typeof entry?.message === 'string'
        )
        .slice(-this.maxEntries);
      this.nextId = Math.max(0, ...this.entries.map(entry => entry.id)) + 1;
    } catch {
      this.entries = [];
    }
  }

  private persist() {
    if (!this.storage) return;

    try {
      this.storage.setItem(this.storageKey, JSON.stringify(this.entries));
    } catch {
      // Diagnostics must never break the app.
    }
  }

  private trim() {
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
  }

  private emit() {
    this.listeners.forEach(listener => listener());
  }
}

export function createDiagnosticsLog(options?: DiagnosticsOptions) {
  return new DiagnosticsLog(options);
}

export const diagnosticsLog = createDiagnosticsLog();

let uninstallConsoleCapture: (() => void) | null = null;

export function installDiagnosticsConsoleCapture(consoleLike: Pick<Console, 'debug' | 'info' | 'warn' | 'error'> = console) {
  if (uninstallConsoleCapture) return uninstallConsoleCapture;

  const originals = {
    debug: consoleLike.debug.bind(consoleLike),
    info: consoleLike.info.bind(consoleLike),
    warn: consoleLike.warn.bind(consoleLike),
    error: consoleLike.error.bind(consoleLike),
  };

  (['debug', 'info', 'warn', 'error'] as const).forEach(level => {
    consoleLike[level] = (...args: unknown[]) => {
      diagnosticsLog.record(level, args);
      originals[level](...args);
    };
  });

  uninstallConsoleCapture = () => {
    (['debug', 'info', 'warn', 'error'] as const).forEach(level => {
      consoleLike[level] = originals[level];
    });
    uninstallConsoleCapture = null;
  };

  return uninstallConsoleCapture;
}

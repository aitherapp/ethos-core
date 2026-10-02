import { tokensEqual } from './auth';

export const RELAY_CONFIG_KV_KEY = 'relay:config';

export interface RelayConfig {
  authToken: string;
  claimed: boolean;
  createdAt: string;
}

export type ResolvedAuth =
  | { source: 'secrets' | 'kv'; authToken: string; claimed: boolean }
  | { source: 'none' };

function randomToken(bytes = 32): string {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function secretsComplete(env: { AUTH_TOKEN?: string }): boolean {
  return Boolean(env.AUTH_TOKEN && env.AUTH_TOKEN.trim().length > 0);
}

export async function readRelayConfig(kv: KVNamespace): Promise<RelayConfig | null> {
  const raw = await kv.get(RELAY_CONFIG_KV_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as RelayConfig;
    if (typeof parsed.authToken !== 'string' || typeof parsed.claimed !== 'boolean') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function writeRelayConfig(kv: KVNamespace, config: RelayConfig): Promise<void> {
  await kv.put(RELAY_CONFIG_KV_KEY, JSON.stringify(config));
}

export async function bootstrapRelayConfig(kv: KVNamespace): Promise<RelayConfig> {
  const existing = await readRelayConfig(kv);
  if (existing) return existing;
  const config: RelayConfig = {
    authToken: randomToken(32),
    claimed: false,
    createdAt: new Date().toISOString(),
  };
  await writeRelayConfig(kv, config);
  return config;
}

/**
 * Secrets `AUTH_TOKEN` override, else KV bootstrap token.
 * Returns null when neither is available.
 */
export async function resolveAuthToken(env: {
  AUTH_TOKEN?: string;
  CONFIG: KVNamespace;
}): Promise<string | null> {
  const resolved = await resolveAuth(env);
  if (resolved.source === 'none') return null;
  return resolved.authToken;
}

export async function resolveAuth(env: {
  AUTH_TOKEN?: string;
  CONFIG: KVNamespace;
}): Promise<ResolvedAuth> {
  if (secretsComplete(env)) {
    return { source: 'secrets', authToken: env.AUTH_TOKEN!.trim(), claimed: true };
  }
  const cfg = await readRelayConfig(env.CONFIG);
  if (!cfg) return { source: 'none' };
  return { source: 'kv', authToken: cfg.authToken, claimed: cfg.claimed };
}

function extractBearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  if (!match) return null;
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

export async function claimRelayConfig(
  kv: KVNamespace,
  authorization: string | null,
): Promise<'ok' | 'unauthorized' | 'missing'> {
  const cfg = await readRelayConfig(kv);
  if (!cfg) return 'missing';
  const provided = extractBearerToken(authorization);
  if (!provided || !tokensEqual(provided, cfg.authToken)) return 'unauthorized';
  if (!cfg.claimed) {
    await writeRelayConfig(kv, { ...cfg, claimed: true });
  }
  return 'ok';
}

import { isAuthorized } from './auth';

export const GATEWAY_CONFIG_KV_KEY = 'gateway:config';

export interface GatewayConfig {
  authToken: string;
  vapidPublicKey: string;
  vapidPrivateKey: string;
  claimed: boolean;
  createdAt: string;
}

export type ResolvedCredentials =
  | {
      source: 'secrets' | 'kv';
      authToken: string;
      vapidPublicKey: string;
      vapidPrivateKey: string;
      claimed: boolean;
    }
  | { source: 'none' };

export function secretsComplete(env: {
  AUTH_TOKEN?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
}): boolean {
  return Boolean(env.AUTH_TOKEN && env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

function randomToken(bytes = 32): string {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export async function generateGatewayCredentials(): Promise<
  Omit<GatewayConfig, 'claimed' | 'createdAt'>
> {
  const authToken = randomToken(32);
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const privJwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey;
  const pubRaw = new Uint8Array(
    (await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer,
  );
  if (!privJwk.d) throw new Error('Failed to export VAPID private key');
  const vapidPublicKey = btoa(String.fromCharCode(...pubRaw))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  const vapidPrivateKey = privJwk.d;
  return { authToken, vapidPublicKey, vapidPrivateKey };
}

export async function readGatewayConfig(kv: KVNamespace): Promise<GatewayConfig | null> {
  const raw = await kv.get(GATEWAY_CONFIG_KV_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GatewayConfig;
    if (
      typeof parsed.authToken !== 'string' ||
      typeof parsed.vapidPublicKey !== 'string' ||
      typeof parsed.vapidPrivateKey !== 'string' ||
      typeof parsed.claimed !== 'boolean'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function writeGatewayConfig(kv: KVNamespace, config: GatewayConfig): Promise<void> {
  await kv.put(GATEWAY_CONFIG_KV_KEY, JSON.stringify(config));
}

export async function resolveCredentials(env: {
  AUTH_TOKEN?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  SUBSCRIPTIONS: KVNamespace;
}): Promise<ResolvedCredentials> {
  if (secretsComplete(env)) {
    return {
      source: 'secrets',
      authToken: env.AUTH_TOKEN!,
      vapidPublicKey: env.VAPID_PUBLIC_KEY!,
      vapidPrivateKey: env.VAPID_PRIVATE_KEY!,
      claimed: true,
    };
  }
  const cfg = await readGatewayConfig(env.SUBSCRIPTIONS);
  if (!cfg) return { source: 'none' };
  return {
    source: 'kv',
    authToken: cfg.authToken,
    vapidPublicKey: cfg.vapidPublicKey,
    vapidPrivateKey: cfg.vapidPrivateKey,
    claimed: cfg.claimed,
  };
}

export async function bootstrapGatewayConfig(kv: KVNamespace): Promise<GatewayConfig> {
  const existing = await readGatewayConfig(kv);
  if (existing) return existing;
  const creds = await generateGatewayCredentials();
  const config: GatewayConfig = {
    ...creds,
    claimed: false,
    createdAt: new Date().toISOString(),
  };
  await writeGatewayConfig(kv, config);
  return config;
}

export async function claimGatewayConfig(
  kv: KVNamespace,
  authorization: string | null,
): Promise<'ok' | 'unauthorized' | 'missing'> {
  const cfg = await readGatewayConfig(kv);
  if (!cfg) return 'missing';
  if (!isAuthorized(authorization, cfg.authToken)) return 'unauthorized';
  if (!cfg.claimed) {
    await writeGatewayConfig(kv, { ...cfg, claimed: true });
  }
  return 'ok';
}

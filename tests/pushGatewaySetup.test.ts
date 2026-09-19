import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GATEWAY_CONFIG_KV_KEY,
  secretsComplete,
  generateGatewayCredentials,
  resolveCredentials,
  bootstrapGatewayConfig,
  readGatewayConfig,
  type GatewayConfig,
} from '../push-gateway/src/gatewayConfig';
import { renderSetupPageHtml, claimGatewayConfig } from '../push-gateway/src/setupPage';

function memoryKv() {
  const store = new Map<string, string>();
  return {
    store,
    kv: {
      get: async (key: string) => store.get(key) ?? null,
      put: async (key: string, value: string) => {
        store.set(key, value);
      },
      delete: async (key: string) => {
        store.delete(key);
      },
    } as unknown as KVNamespace,
  };
}

describe('gatewayConfig', () => {
  it('secretsComplete requires all three', () => {
    expect(secretsComplete({})).toBe(false);
    expect(secretsComplete({ AUTH_TOKEN: 't' })).toBe(false);
    expect(
      secretsComplete({
        AUTH_TOKEN: 't',
        VAPID_PUBLIC_KEY: 'p',
        VAPID_PRIVATE_KEY: 's',
      }),
    ).toBe(true);
  });

  it('generateGatewayCredentials returns token + vapid keys', async () => {
    const c = await generateGatewayCredentials();
    expect(c.authToken.length).toBeGreaterThan(20);
    expect(c.vapidPublicKey.length).toBeGreaterThan(20);
    expect(c.vapidPrivateKey.length).toBeGreaterThan(20);
  });

  it('resolveCredentials prefers complete secrets over KV', async () => {
    const { kv, store } = memoryKv();
    store.set(
      GATEWAY_CONFIG_KV_KEY,
      JSON.stringify({
        authToken: 'kv-tok',
        vapidPublicKey: 'kv-pub',
        vapidPrivateKey: 'kv-priv',
        claimed: false,
        createdAt: '2026-01-01T00:00:00.000Z',
      } satisfies GatewayConfig),
    );
    const resolved = await resolveCredentials({
      AUTH_TOKEN: 'sec-tok',
      VAPID_PUBLIC_KEY: 'sec-pub',
      VAPID_PRIVATE_KEY: 'sec-priv',
      SUBSCRIPTIONS: kv,
    });
    expect(resolved).toEqual({
      source: 'secrets',
      authToken: 'sec-tok',
      vapidPublicKey: 'sec-pub',
      vapidPrivateKey: 'sec-priv',
      claimed: true,
    });
  });

  it('resolveCredentials uses KV when secrets incomplete', async () => {
    const { kv, store } = memoryKv();
    store.set(
      GATEWAY_CONFIG_KV_KEY,
      JSON.stringify({
        authToken: 'kv-tok',
        vapidPublicKey: 'kv-pub',
        vapidPrivateKey: 'kv-priv',
        claimed: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      } satisfies GatewayConfig),
    );
    const resolved = await resolveCredentials({ SUBSCRIPTIONS: kv });
    expect(resolved.source).toBe('kv');
    if (resolved.source !== 'kv') throw new Error('expected kv');
    expect(resolved.authToken).toBe('kv-tok');
    expect(resolved.claimed).toBe(true);
  });

  it('resolveCredentials returns none when empty', async () => {
    const { kv } = memoryKv();
    expect(await resolveCredentials({ SUBSCRIPTIONS: kv })).toEqual({ source: 'none' });
  });

  it('bootstrapGatewayConfig creates once and reuses', async () => {
    const { kv, store } = memoryKv();
    const first = await bootstrapGatewayConfig(kv);
    expect(first.claimed).toBe(false);
    expect(store.has(GATEWAY_CONFIG_KV_KEY)).toBe(true);
    const second = await bootstrapGatewayConfig(kv);
    expect(second.authToken).toBe(first.authToken);
  });
});

describe('setup page HTML', () => {
  it('reveal state includes token and once-only warning', () => {
    const html = renderSetupPageHtml({
      kind: 'reveal',
      gatewayUrl: 'https://gw.example',
      authToken: 'secret-token-value',
    });
    expect(html).toContain('secret-token-value');
    expect(html).toContain('https://gw.example');
    expect(html.toLowerCase()).toContain('once');
    expect(html).toContain('/v1/setup/claim');
    expect(html).toContain('Enable background push');
  });

  it('claimed and secrets states omit auth token', () => {
    const claimed = renderSetupPageHtml({ kind: 'claimed', gatewayUrl: 'https://gw.example' });
    const secrets = renderSetupPageHtml({ kind: 'secrets', gatewayUrl: 'https://gw.example' });
    expect(claimed).not.toContain('secret-token');
    expect(secrets.toLowerCase()).toContain('secret');
    expect(claimed.toLowerCase()).toContain('already');
  });
});

describe('claimGatewayConfig', () => {
  it('rejects missing or wrong bearer', async () => {
    const { kv } = memoryKv();
    await bootstrapGatewayConfig(kv);
    expect(await claimGatewayConfig(kv, null)).toBe('unauthorized');
    expect(await claimGatewayConfig(kv, 'Bearer wrong')).toBe('unauthorized');
  });

  it('claims with correct bearer and is idempotent', async () => {
    const { kv } = memoryKv();
    const cfg = await bootstrapGatewayConfig(kv);
    expect(await claimGatewayConfig(kv, `Bearer ${cfg.authToken}`)).toBe('ok');
    const after = await readGatewayConfig(kv);
    expect(after?.claimed).toBe(true);
    expect(await claimGatewayConfig(kv, `Bearer ${cfg.authToken}`)).toBe('ok');
  });

  it('returns missing when no config', async () => {
    const { kv } = memoryKv();
    expect(await claimGatewayConfig(kv, 'Bearer x')).toBe('missing');
  });
});

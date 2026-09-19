# Push Gateway Setup Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After Cloudflare one-click deploy, opening the Worker URL shows an English setup page with gateway URL + auth token (copy once), so users can paste into ETHOS without CLI.

**Architecture:** Prefer Cloudflare Secrets when all three are set; otherwise load/bootstrap credentials in KV (`gateway:config`). `GET /` returns English setup HTML (reveal token only while unclaimed). `POST /v1/setup/claim` with Bearer marks claimed. Existing `/v1/*` routes resolve credentials the same way. Docs lead with this path; CLI stays Advanced.

**Tech Stack:** Cloudflare Workers + KV, Web Crypto (ECDSA P-256 VAPID), Vitest (import Worker modules from repo root), TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-19-push-gateway-setup-page-design.md`

## Global Constraints

- English only in setup HTML, README, Settings help, and code comments aimed at users.
- One-click path must work with **browser only** (no Wrangler, no `generate-secrets`).
- Cloudflare Secrets override KV when `AUTH_TOKEN`, `VAPID_PUBLIC_KEY`, and `VAPID_PRIVATE_KEY` are all set.
- Token shown in HTML **once** (until claim); never logged; never re-displayed after claim.
- Portable `/v1/vapid-public-key`, `/v1/subscriptions`, `/v1/push` client contract unchanged.
- Keep allowlist, registration binding, rate limits, fail-closed misconfigured behavior.
- `push-gateway/README.md` is the **primary** one-click guide.
- Claim must require Bearer matching the current KV auth token (setup page sends it) so a stranger cannot blind-claim and hide the token.

## File Structure

| File | Responsibility |
|------|----------------|
| `push-gateway/src/gatewayConfig.ts` | KV key, config type, generate credentials, resolve secrets vs KV |
| `push-gateway/src/setupPage.ts` | English HTML for reveal / claimed / secrets-configured states |
| `push-gateway/src/index.ts` | Wire `GET /`, `POST /v1/setup/claim`, resolve creds for API routes |
| `push-gateway/README.md` | Primary one-click instructions; Advanced CLI section |
| `README.md` | Short Cloudflare path: open Worker URL for token |
| `src/App.tsx` | Settings help line about opening Worker URL |
| `tests/pushGatewaySetup.test.ts` | Resolution, bootstrap, claim, HTML reveal rules |

---

### Task 1: Gateway config + credential resolution (TDD)

**Files:**
- Create: `push-gateway/src/gatewayConfig.ts`
- Create: `tests/pushGatewaySetup.test.ts`

**Interfaces:**
- Consumes: Web Crypto (`crypto.subtle`), `KVNamespace`
- Produces:
  - `export const GATEWAY_CONFIG_KV_KEY = 'gateway:config'`
  - `export interface GatewayConfig { authToken: string; vapidPublicKey: string; vapidPrivateKey: string; claimed: boolean; createdAt: string }`
  - `export type ResolvedCredentials = { source: 'secrets' | 'kv'; authToken: string; vapidPublicKey: string; vapidPrivateKey: string; claimed: boolean } | { source: 'none' }`
  - `export function secretsComplete(env: { AUTH_TOKEN?: string; VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string }): boolean`
  - `export async function generateGatewayCredentials(): Promise<Omit<GatewayConfig, 'claimed' | 'createdAt'>>`
  - `export async function readGatewayConfig(kv: KVNamespace): Promise<GatewayConfig | null>`
  - `export async function writeGatewayConfig(kv: KVNamespace, config: GatewayConfig): Promise<void>`
  - `export async function resolveCredentials(env: { AUTH_TOKEN?: string; VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string; SUBSCRIPTIONS: KVNamespace }): Promise<ResolvedCredentials>`
  - `export async function bootstrapGatewayConfig(kv: KVNamespace): Promise<GatewayConfig>` — generate, write with `claimed: false`, return (if config already exists, return existing without regenerating)

- [ ] **Step 1: Write the failing tests**

Append to new `tests/pushGatewaySetup.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/pushGatewaySetup.test.ts`

Expected: FAIL (module not found / exports missing)

- [ ] **Step 3: Write minimal implementation**

Create `push-gateway/src/gatewayConfig.ts`:

```typescript
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
  let s = '';
  for (const b of arr) s += b.toString(16).padStart(2, '0');
  // Prefer base64url for compactness matching generate-secrets.mjs style:
  const bin = String.fromCharCode(...arr);
  // Use buffer-free b64url:
  const b64 = btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  return b64;
}

export async function generateGatewayCredentials(): Promise<
  Omit<GatewayConfig, 'claimed' | 'createdAt'>
> {
  const authToken = randomToken(32);
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const privJwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey;
  const pubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
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
```

Fix `randomToken` to only use the base64url path (remove dead hex loop) when implementing.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/pushGatewaySetup.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add push-gateway/src/gatewayConfig.ts tests/pushGatewaySetup.test.ts
git commit -m "$(cat <<'EOF'
feat(push-gateway): add KV credential resolution and bootstrap

Support secrets-first resolution and one-click first-open bootstrap without CLI.
EOF
)"
```

---

### Task 2: Setup HTML + claim helper (TDD)

**Files:**
- Create: `push-gateway/src/setupPage.ts`
- Modify: `tests/pushGatewaySetup.test.ts`
- Modify: `push-gateway/src/gatewayConfig.ts` (add `claimGatewayConfig`)

**Interfaces:**
- Consumes: `GatewayConfig`, `isAuthorized` from `./auth`
- Produces:
  - `export type SetupPageState = { kind: 'reveal'; gatewayUrl: string; authToken: string } | { kind: 'claimed'; gatewayUrl: string } | { kind: 'secrets'; gatewayUrl: string }`
  - `export function renderSetupPageHtml(state: SetupPageState): string` — English HTML; reveal includes Copy buttons (inline JS) and “I’ve saved this” that `POST /v1/setup/claim` with `Authorization: Bearer <token>`
  - `export async function claimGatewayConfig(kv: KVNamespace, authorization: string | null): Promise<'ok' | 'unauthorized' | 'missing'>` — requires Bearer matching KV token; sets `claimed: true`; idempotent if already claimed

- [ ] **Step 1: Write the failing tests**

Add to `tests/pushGatewaySetup.test.ts`:

```typescript
import { renderSetupPageHtml, claimGatewayConfig } from '../push-gateway/src/setupPage';
// if claim lives in gatewayConfig, import from there instead

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/pushGatewaySetup.test.ts`

Expected: FAIL on missing `renderSetupPageHtml` / `claimGatewayConfig`

- [ ] **Step 3: Write minimal implementation**

`claimGatewayConfig` in `gatewayConfig.ts` (or `setupPage.ts` importing auth + config):

```typescript
import { isAuthorized } from './auth';
import { readGatewayConfig, writeGatewayConfig } from './gatewayConfig';

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
```

`setupPage.ts` — English HTML string with:

- Reveal: H1 “ETHOS Push Gateway setup”; gateway URL + token fields; Copy buttons; steps 1–4 matching Settings wording; warning about first visitor / once-only; button “I’ve saved this” → `fetch('/v1/setup/claim', { method:'POST', headers:{ Authorization: 'Bearer '+token }})` then reload
- Claimed: “Already set up” + reminder to use Settings; no token
- Secrets: “Configured via Cloudflare Secrets” + Advanced note

Keep CSS minimal inline; no external assets.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/pushGatewaySetup.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add push-gateway/src/setupPage.ts push-gateway/src/gatewayConfig.ts tests/pushGatewaySetup.test.ts
git commit -m "$(cat <<'EOF'
feat(push-gateway): English setup page HTML and claim helper

Show token once; claim requires Bearer so blind claim cannot hide credentials.
EOF
)"
```

---

### Task 3: Wire Worker routes to resolved credentials (TDD)

**Files:**
- Modify: `push-gateway/src/index.ts`
- Modify: `tests/pushGatewaySetup.test.ts`

**Interfaces:**
- Consumes: `resolveCredentials`, `bootstrapGatewayConfig`, `claimGatewayConfig`, `renderSetupPageHtml`
- Produces: Worker behavior:
  - `GET /` → secrets → secrets HTML; else bootstrap KV if needed → reveal or claimed HTML (`Content-Type: text/html`)
  - `POST /v1/setup/claim` → JSON `{ ok: true }` or 401/404
  - `/v1/vapid-public-key`, subscriptions, push use resolved `authToken` / VAPID (not raw `env.AUTH_TOKEN` alone)
  - `Env` fields `AUTH_TOKEN?`, `VAPID_PUBLIC_KEY?`, `VAPID_PRIVATE_KEY?` optional

- [ ] **Step 1: Write the failing integration-style tests**

Add to `tests/pushGatewaySetup.test.ts`:

```typescript
import worker from '../push-gateway/src/index';

describe('worker setup routes', () => {
  it('GET / bootstraps and reveals token, claim hides it, API accepts token', async () => {
    const { kv } = memoryKv();
    const env = { SUBSCRIPTIONS: kv } as any;

    const first = await worker.fetch(new Request('https://gw.example/'), env);
    expect(first.headers.get('content-type')).toContain('text/html');
    const html1 = await first.text();
    expect(html1).toMatch(/[A-Za-z0-9_-]{20,}/); // token present

    const cfg = await readGatewayConfig(kv);
    expect(cfg?.claimed).toBe(false);
    const token = cfg!.authToken;
    expect(html1).toContain(token);

    const claim = await worker.fetch(
      new Request('https://gw.example/v1/setup/claim', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }),
      env,
    );
    expect(claim.status).toBe(200);

    const second = await worker.fetch(new Request('https://gw.example/'), env);
    const html2 = await second.text();
    expect(html2).not.toContain(token);
    expect(html2.toLowerCase()).toContain('already');

    const vapid = await worker.fetch(new Request('https://gw.example/v1/vapid-public-key'), env);
    expect(vapid.status).toBe(200);
    const body = (await vapid.json()) as { publicKey: string };
    expect(body.publicKey).toBe(cfg!.vapidPublicKey);
  });

  it('GET / with secrets does not bootstrap KV and does not reveal a generated token', async () => {
    const { kv, store } = memoryKv();
    const env = {
      AUTH_TOKEN: 'sec-tok',
      VAPID_PUBLIC_KEY: 'sec-pub',
      VAPID_PRIVATE_KEY: 'sec-priv',
      SUBSCRIPTIONS: kv,
    } as any;
    const res = await worker.fetch(new Request('https://gw.example/'), env);
    const html = await res.text();
    expect(html.toLowerCase()).toContain('secret');
    expect(store.has(GATEWAY_CONFIG_KV_KEY)).toBe(false);
    expect(html).not.toContain('sec-tok');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/pushGatewaySetup.test.ts`

Expected: FAIL (`GET /` still 404)

- [ ] **Step 3: Write minimal implementation**

In `push-gateway/src/index.ts`:

1. Make secret env fields optional on `Env`.
2. Add helper `async function credentialsOr503(env)` using `resolveCredentials`; on `none` return 503 JSON for API.
3. Refactor `requireAuth` / handlers to take resolved `authToken` (and VAPID for push).
4. In `fetch`:
   - `GET /` → if `secretsComplete(env)` return secrets HTML; else `bootstrapGatewayConfig(env.SUBSCRIPTIONS)` then render reveal or claimed
   - `POST /v1/setup/claim` → `claimGatewayConfig`; map missing→404, unauthorized→401, ok→`{ok:true}`
5. `/v1/vapid-public-key` uses resolved public key.
6. Register/unregister/push use resolved credentials.

Do not `console.log` tokens or keys.

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/pushGatewaySetup.test.ts tests/pushGatewayAllowlist.test.ts`

Expected: all PASS

Also run: `npm test` (full suite) to ensure app tests still pass.

- [ ] **Step 5: Commit**

```bash
git add push-gateway/src/index.ts tests/pushGatewaySetup.test.ts
git commit -m "$(cat <<'EOF'
feat(push-gateway): wire setup page and KV credentials into Worker

One-click deploy can bootstrap on first open; API uses resolved secrets or KV.
EOF
)"
```

---

### Task 4: English docs + Settings help

**Files:**
- Modify: `push-gateway/README.md`
- Modify: `README.md` (Enable your own push gateway section)
- Modify: `src/App.tsx` (Settings help paragraph ~2595–2601)

**Interfaces:**
- Consumes: none
- Produces: English copy aligned with setup page

- [ ] **Step 1: Rewrite `push-gateway/README.md` one-click section**

Primary path (exact intent):

```markdown
## One-click deploy (Cloudflare)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/aitherapp/ethos-core/tree/main/push-gateway)

1. Click **Deploy to Cloudflare** and finish the Cloudflare wizard.
2. Open your Worker **HTTPS URL** in the browser (shown after deploy).
3. On the setup page, **copy the Gateway URL and Auth token** immediately.
   - The auth token is shown **once**. Click **I’ve saved this** after copying.
   - Open the URL yourself right after deploy; do not share it until the token is saved.
4. In ETHOS → **Settings** → **OS Notifications**: enable **background push**, paste **Gateway URL** and **Auth token**, then **Save Changes**.

### Advanced (CLI secrets)

Use only if you prefer Cloudflare Secrets instead of the setup page:

\`\`\`bash
cd push-gateway
npm install
npm run generate-secrets
# wrangler secret put AUTH_TOKEN / VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
npx wrangler deploy
\`\`\`

When all three secrets are set, the setup page shows “Configured via Cloudflare Secrets” and does not reveal a token.
```

Keep HTTP API + security defaults sections. Remove outdated “copy AUTH_TOKEN from the setup script” as the primary path. Note redeploy for already-deployed Workers; wipe KV under Advanced for rebootstrap.

- [ ] **Step 2: Update root `README.md`**

Replace the Cloudflare bullet that says “from the setup script” with:

```markdown
- **Cloudflare (quick):** Use the one-click **Deploy to Cloudflare** button in [`push-gateway/README.md`](push-gateway/README.md). After deploy, **open your Worker HTTPS URL**, copy the gateway URL and auth token from the setup page, then paste them into ETHOS Settings. (CLI secret generation is documented under Advanced in that README.)
```

- [ ] **Step 3: Update Settings help in `src/App.tsx`**

Replace the help paragraph with English text like:

```tsx
<p className="text-[9px] opacity-40 leading-relaxed">
  After one-click Cloudflare deploy, open your Worker URL to copy the auth token (shown once). See{' '}
  <a href="./push-gateway/README.md" className="text-brand hover:underline" target="_blank" rel="noreferrer">
    push-gateway/README.md
  </a>
  . Any HTTPS host that implements the same API works.
</p>
```

- [ ] **Step 4: Sanity check**

Confirm no remaining primary-path wording that requires `generate-secrets` for one-click users (grep `setup script` / `generate-secrets` in README files).

- [ ] **Step 5: Commit**

```bash
git add push-gateway/README.md README.md src/App.tsx
git commit -m "$(cat <<'EOF'
docs(push): instruct one-click setup via Worker URL

Make push-gateway README the primary English guide; CLI secrets stay Advanced.
EOF
)"
```

---

### Task 5: Verify full suite

**Files:** none new

- [ ] **Step 1: Run full tests + typecheck**

```bash
npm test
npm run typecheck
cd push-gateway && npm run typecheck
```

Expected: all pass

- [ ] **Step 2: Manual smoke (optional if wrangler available)**

```bash
cd push-gateway && npx wrangler dev
# GET http://127.0.0.1:8787/ → setup HTML with token
# POST claim with Bearer → reload hides token
# GET /v1/vapid-public-key → publicKey
```

- [ ] **Step 3: Commit only if typecheck/docs fixes were needed**; otherwise done

Do **not** bump app version / deploy in this plan unless the user asks to ship (follow `DEPLOY-CHECKLIST.md` then).

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| First-open KV bootstrap | 1, 3 |
| Secrets override KV | 1, 3 |
| `GET /` English setup / claimed / secrets | 2, 3 |
| `POST /v1/setup/claim` | 2, 3 |
| Token once; never after claim | 2, 3 |
| API uses resolved credentials | 3 |
| `push-gateway/README.md` primary | 4 |
| Root README + Settings help | 4 |
| Existing security controls preserved | 3 (no change to allowlist/binding) |
| Tests for bootstrap/claim/secrets | 1–3 |
| No rotate API / claim window | omitted (non-goals) |

## Placeholder / consistency notes

- Claim requires Bearer (spec table omitted auth; Global Constraints + Task 2 lock this for blind-claim safety).
- VAPID encoding must match what `buildWebPushRequest` already expects (same as `generate-secrets.mjs`: raw public base64url + JWK `d` private).

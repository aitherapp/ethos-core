# Secure VAPID + Peer Push Privacy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove insecure `Math.random()` from VAPID key generation and add offline-only peer push that never leaks chat plaintext.

**Architecture:** Fix `getOrCreateVapidPublicKey` to fall back to `crypto.getRandomValues` (or throw). Extract pure peer-push helpers into `src/lib/peerPush.ts`, wire them into `IrohManager.sendMessage`, discard uncommitted WIP in `iroh.ts` first.

**Tech Stack:** TypeScript, Vitest, happy-dom, existing `sendDirectWebPush` helper.

**Spec:** `docs/superpowers/specs/2026-09-19-vapid-randomness-peer-push-design.md`

## Global Constraints

- Never use `Math.random()`, `Date.now()`-based fake keys, or insecure strings for browser VAPID generation.
- Peer push only when `hasPushEndpoint && !directConnected && !relayConnected`.
- Peer push `messageText` must be exactly `New message`; `pagePath` exactly `chat`; never pass chat plaintext into push.
- Do not change widget `sendDirectWebPush` behavior or signature.
- TDD required: failing test first, then minimal implementation; discard WIP before peer-push implementation.
- Keep Node/`localStorage === undefined` demo return: `demo_vapid_key_for_node_env`.
- Commit after each task; do not push unless asked.

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/webPush.ts` | Secure VAPID public key get-or-create |
| `tests/webPush.test.ts` | VAPID / webPush unit tests |
| `src/lib/peerPush.ts` | Pure `shouldSendPeerPush` + `buildPeerPushArgs` |
| `tests/peerPush.test.ts` | Unit tests for peer push helpers |
| `src/lib/iroh.ts` | Call helpers from `sendMessage`; top-level import |

---

### Task 1: Secure VAPID fallback (TDD)

**Files:**
- Modify: `src/lib/webPush.ts`
- Test: `tests/webPush.test.ts`

**Interfaces:**
- Consumes: Web Crypto (`crypto.subtle`, `crypto.getRandomValues`), `localStorage`
- Produces: `getOrCreateVapidPublicKey(): Promise<string>` with secure entropy only in browser

- [ ] **Step 1: Write the failing tests**

Append to `tests/webPush.test.ts` (keep existing imports; add `vi` from vitest):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// inside describe('Web Push Helper', ...):

  beforeEach(() => {
    localStorage.removeItem('ethos_vapid_public_key');
  });

  it('does not call Math.random when generating a VAPID public key', async () => {
    const spy = vi.spyOn(Math, 'random');
    await getOrCreateVapidPublicKey();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('falls back to getRandomValues when subtle.generateKey fails', async () => {
    localStorage.removeItem('ethos_vapid_public_key');
    const originalGenerateKey = crypto.subtle.generateKey.bind(crypto.subtle);
    const generateKeySpy = vi
      .spyOn(crypto.subtle, 'generateKey')
      .mockRejectedValue(new Error('subtle unavailable'));
    const getRandomSpy = vi.spyOn(crypto, 'getRandomValues');

    const key = await getOrCreateVapidPublicKey();

    expect(getRandomSpy).toHaveBeenCalled();
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(10);
    expect(key.startsWith('vapid_')).toBe(false);
    expect(Math.random).not.toBe(undefined); // sanity
    generateKeySpy.mockRestore();
    getRandomSpy.mockRestore();
    void originalGenerateKey;
  });

  it('throws when neither subtle nor getRandomValues can produce a key', async () => {
    localStorage.removeItem('ethos_vapid_public_key');
    const generateKeySpy = vi
      .spyOn(crypto.subtle, 'generateKey')
      .mockRejectedValue(new Error('fail'));
    const getRandomSpy = vi
      .spyOn(crypto, 'getRandomValues')
      .mockImplementation(() => {
        throw new Error('no entropy');
      });

    await expect(getOrCreateVapidPublicKey()).rejects.toThrow(/secure|entropy|random/i);

    generateKeySpy.mockRestore();
    getRandomSpy.mockRestore();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/webPush.test.ts`

Expected: FAIL — `Math.random` is still called on fallback, and/or throw test fails because insecure string is returned.

- [ ] **Step 3: Implement minimal secure generation**

Replace `getOrCreateVapidPublicKey` in `src/lib/webPush.ts` with:

```typescript
function encodeUrlSafeBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function generateVapidPublicKeyFromEntropy(): string {
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    throw new Error('Secure random entropy is required to generate a VAPID public key');
  }
  const bytes = new Uint8Array(65);
  crypto.getRandomValues(bytes);
  return encodeUrlSafeBase64(bytes);
}

export async function getOrCreateVapidPublicKey(): Promise<string> {
  if (typeof localStorage === 'undefined') {
    return 'demo_vapid_key_for_node_env';
  }
  let key = localStorage.getItem('ethos_vapid_public_key');
  if (!key) {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      try {
        const keyPair = await crypto.subtle.generateKey(
          { name: 'ECDSA', namedCurve: 'P-256' },
          true,
          ['sign', 'verify']
        );
        const exported = await crypto.subtle.exportKey('raw', keyPair.publicKey);
        key = encodeUrlSafeBase64(new Uint8Array(exported));
      } catch {
        key = generateVapidPublicKeyFromEntropy();
      }
    } else {
      key = generateVapidPublicKeyFromEntropy();
    }
    localStorage.setItem('ethos_vapid_public_key', key);
  }
  return key;
}
```

Ensure no `Math.random` remains anywhere in this file.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/webPush.test.ts`

Expected: PASS (all tests in file green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/webPush.ts tests/webPush.test.ts
git commit -m "$(cat <<'EOF'
fix(webPush): use secure entropy for VAPID key fallback

EOF
)"
```

---

### Task 2: Discard WIP and add peer push helpers (TDD)

**Files:**
- Create: `src/lib/peerPush.ts`
- Create: `tests/peerPush.test.ts`
- Modify: `src/lib/iroh.ts` (restore to clean HEAD for this file only — discard WIP before any new edits)

**Interfaces:**
- Consumes: none (pure functions)
- Produces:
  - `shouldSendPeerPush(opts: { hasPushEndpoint: boolean; directConnected: boolean; relayConnected: boolean }): boolean`
  - `buildPeerPushArgs(senderName: string): { visitorId: string; pagePath: string; messageText: string }`

- [ ] **Step 1: Discard uncommitted WIP in iroh.ts**

```bash
git restore src/lib/iroh.ts
git status -- src/lib/iroh.ts
```

Expected: `iroh.ts` clean (no mid-file import, no push in `sendMessage`).

- [ ] **Step 2: Write the failing tests**

Create `tests/peerPush.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { shouldSendPeerPush, buildPeerPushArgs } from '../src/lib/peerPush';

describe('peerPush helpers', () => {
  it('sends push only when offline with an endpoint', () => {
    expect(
      shouldSendPeerPush({ hasPushEndpoint: true, directConnected: false, relayConnected: false })
    ).toBe(true);
    expect(
      shouldSendPeerPush({ hasPushEndpoint: true, directConnected: true, relayConnected: false })
    ).toBe(false);
    expect(
      shouldSendPeerPush({ hasPushEndpoint: true, directConnected: false, relayConnected: true })
    ).toBe(false);
    expect(
      shouldSendPeerPush({ hasPushEndpoint: false, directConnected: false, relayConnected: false })
    ).toBe(false);
  });

  it('builds generic push args without chat plaintext', () => {
    const args = buildPeerPushArgs('Alice');
    expect(args).toEqual({
      visitorId: 'Alice',
      pagePath: 'chat',
      messageText: 'New message',
    });
    expect(JSON.stringify(args)).not.toContain('secret plaintext');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- tests/peerPush.test.ts`

Expected: FAIL — module `../src/lib/peerPush` not found / exports missing.

- [ ] **Step 4: Implement minimal helpers**

Create `src/lib/peerPush.ts`:

```typescript
export function shouldSendPeerPush(opts: {
  hasPushEndpoint: boolean;
  directConnected: boolean;
  relayConnected: boolean;
}): boolean {
  return opts.hasPushEndpoint && !opts.directConnected && !opts.relayConnected;
}

export function buildPeerPushArgs(senderName: string): {
  visitorId: string;
  pagePath: string;
  messageText: string;
} {
  return {
    visitorId: senderName,
    pagePath: 'chat',
    messageText: 'New message',
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/peerPush.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/peerPush.ts tests/peerPush.test.ts
git commit -m "$(cat <<'EOF'
feat(push): add offline peer push policy helpers

EOF
)"
```

Note: `git restore` of `iroh.ts` is not a commit by itself; if restore left the tree dirty previously and now clean, no commit needed for restore. Do not commit unrelated files.

---

### Task 3: Wire peer push into `IrohManager.sendMessage`

**Files:**
- Modify: `src/lib/iroh.ts` (top imports + `sendMessage` only)
- Test: extend `tests/peerPush.test.ts` if needed; verify with `npm test -- tests/peerPush.test.ts tests/webPush.test.ts` and any existing iroh/signaling tests if present

**Interfaces:**
- Consumes: `shouldSendPeerPush`, `buildPeerPushArgs` from `./peerPush`; `sendDirectWebPush` from `../widget/pushTrigger`
- Produces: `sendMessage` triggers push only when offline + endpoint present, using generic args

- [ ] **Step 1: Write a failing integration-style unit test for wiring contract**

Append to `tests/peerPush.test.ts` a documentation-style assertion that the args shape matches `sendDirectWebPush` (already covered). Optionally add:

```typescript
  it('push args are safe to forward to sendDirectWebPush without message body', () => {
    const secret = 'TOP_SECRET_CHAT_BODY';
    const args = buildPeerPushArgs('Bob');
    // Simulate what sendMessage must do: never pass `secret` into push
    const forwarded = { ...args };
    expect(Object.values(forwarded).join(' ')).not.toContain(secret);
    expect(forwarded.messageText).toBe('New message');
  });
```

This should already pass once Task 2 is done — if so, treat Step 1–2 as confirming green before wiring, then proceed to implement wiring (the wiring itself is verified by code review + grep that `sendMessage` does not pass `text` into push).

If the implementer prefers a true red test for wiring, extract a tiny pure function in `peerPush.ts`:

```typescript
export function peerPushCallArgs(
  endpoint: string | null | undefined,
  senderName: string,
  directConnected: boolean,
  relayConnected: boolean
): { endpoint: string; visitorId: string; pagePath: string; messageText: string } | null {
  if (
    !shouldSendPeerPush({
      hasPushEndpoint: Boolean(endpoint),
      directConnected,
      relayConnected,
    })
  ) {
    return null;
  }
  return { endpoint: endpoint as string, ...buildPeerPushArgs(senderName) };
}
```

Add failing tests for `peerPushCallArgs` first (null when online / no endpoint; object when offline), then implement, then use it from `sendMessage`.

**Prefer this `peerPushCallArgs` approach** so Task 3 stays TDD-clean.

- [ ] **Step 2: RED — tests for `peerPushCallArgs`**

```typescript
  it('peerPushCallArgs returns null when peer is reachable or has no endpoint', () => {
    expect(peerPushCallArgs('https://push.example/x', 'A', true, false)).toBeNull();
    expect(peerPushCallArgs('https://push.example/x', 'A', false, true)).toBeNull();
    expect(peerPushCallArgs(null, 'A', false, false)).toBeNull();
  });

  it('peerPushCallArgs returns generic args when offline with endpoint', () => {
    expect(peerPushCallArgs('https://push.example/x', 'A', false, false)).toEqual({
      endpoint: 'https://push.example/x',
      visitorId: 'A',
      pagePath: 'chat',
      messageText: 'New message',
    });
  });
```

Run: `npm test -- tests/peerPush.test.ts` — expect FAIL (export missing).

- [ ] **Step 3: GREEN — implement `peerPushCallArgs` in `src/lib/peerPush.ts`**

```typescript
export function peerPushCallArgs(
  endpoint: string | null | undefined,
  senderName: string,
  directConnected: boolean,
  relayConnected: boolean
): { endpoint: string; visitorId: string; pagePath: string; messageText: string } | null {
  if (
    !shouldSendPeerPush({
      hasPushEndpoint: Boolean(endpoint),
      directConnected,
      relayConnected,
    })
  ) {
    return null;
  }
  return { endpoint: endpoint as string, ...buildPeerPushArgs(senderName) };
}
```

Run tests — expect PASS.

- [ ] **Step 4: Wire `sendMessage` in `src/lib/iroh.ts`**

1. Add top-level imports (with other imports, not mid-file):

```typescript
import { sendDirectWebPush } from '../widget/pushTrigger';
import { peerPushCallArgs } from './peerPush';
```

2. Inside `sendMessage`, after building `msg` and before/at the transport branch, add:

```typescript
    const pushArgs = peerPushCallArgs(
      this.peerPushEndpoints.get(peerId),
      this.identity?.displayName || 'ETHOS Peer',
      Boolean(conn?.connected),
      this.relayStatus.get(peerId) === 'connected'
    );
    if (pushArgs) {
      sendDirectWebPush(
        pushArgs.endpoint,
        pushArgs.visitorId,
        pushArgs.pagePath,
        pushArgs.messageText
      ).catch(() => {});
    }
```

Do **not** pass `text` into any push call.

- [ ] **Step 5: Verify**

```bash
npm test -- tests/peerPush.test.ts tests/webPush.test.ts
rg -n "Math\\.random" src/lib/webPush.ts   # must be empty
rg -n "sendDirectWebPush" src/lib/iroh.ts  # only top import + sendMessage usage
```

Confirm `sendMessage` does not pass the `text` parameter into `sendDirectWebPush`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/peerPush.ts tests/peerPush.test.ts src/lib/iroh.ts
git commit -m "$(cat <<'EOF'
feat(push): notify offline peers without leaking chat plaintext

EOF
)"
```

---

### Task 4: Final verification

**Files:** none new

- [ ] **Step 1: Run related test suites**

```bash
npm test -- tests/webPush.test.ts tests/peerPush.test.ts tests/pushTrigger.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Confirm constraints**

```bash
rg -n "Math\\.random" src/lib/webPush.ts
rg -n "vapid_\\\$\{Date" src/lib/webPush.ts
rg -n "sendDirectWebPush\\(" src/lib/iroh.ts
```

Expected: no Math.random / Date.now fake keys in webPush; iroh push call uses `pushArgs.messageText` only.

- [ ] **Step 3: Commit only if verification fixed anything; otherwise no empty commit**

If graphify-out exists and code changed earlier, controller may run `graphify update .` after all tasks (AST-only).

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| Secure VAPID fallback / throw | Task 1 |
| No Math.random | Task 1 |
| Discard WIP | Task 2 Step 1 |
| shouldSendPeerPush + buildPeerPushArgs | Task 2 |
| Offline-only + generic body | Task 2–3 |
| Wire sendMessage, top import | Task 3 |
| Widget unchanged | Global constraint / Task 3 |
| TDD | All tasks |

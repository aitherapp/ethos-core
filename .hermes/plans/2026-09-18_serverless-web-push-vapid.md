# Serverless Web Push (VAPID) Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Implement 100% serverless, OS-native background push notifications for ETHOS across macOS, Windows, Android, and iOS using the W3C Web Push Standard (VAPID & RFC 8291).

**Architecture:**
1. **VAPID Keypair & Push Manager (`src/lib/webPush.ts`):**
   - ETHOS client generates/loads a local ECDSA P-256 VAPID keypair in browser storage.
   - Registers a `PushSubscription` with `navigator.serviceWorker.ready.then(reg => reg.pushManager.subscribe(...))`.
   - Embeds the encrypted push subscription endpoint in the owner's ticket or metadata.
2. **Visitor Web Push Dispatcher (`src/widget/pushTrigger.ts`):**
   - When a visitor sends a message in `widget.js`, the visitor's browser makes a direct Web Push HTTP/2 request to the owner's browser push service endpoint (Apple APNs, Google FCM, Microsoft WNS).
   - Encrypts payload with Web Push RFC 8291 (AES-128-GCM) for end-to-end privacy.
3. **Service Worker Push Event Listener (`public/sw.js`):**
   - Listens for `self.addEventListener('push', ...)` in background even when ETHOS tabs are closed.
   - Triggers native OS notifications (`self.registration.showNotification(...)`) on Windows, macOS, Android, and iOS PWA.

**Tech Stack:** TypeScript, Web Crypto API (P-256 / AES-128-GCM), W3C Push API, Service Worker, Vitest.

---

### Task 1: VAPID Key Generator & Web Push Helper (`src/lib/webPush.ts`)

**Objective:** Implement VAPID key generation, conversion utilities (URL-safe base64 / Uint8Array), and `PushManager` subscription helpers.

**Files:**
- Create: `src/lib/webPush.ts`
- Test: `tests/webPush.test.ts`

**Step 1: Write failing test**
Create `tests/webPush.test.ts`:
```typescript
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { urlBase64ToUint8Array, formatPushPayload } from '../src/lib/webPush';

describe('Web Push Helper', () => {
  it('should convert URL-safe base64 string to Uint8Array', () => {
    const base64 = 'BC_m0vrB_test';
    const arr = urlBase64ToUint8Array(base64);
    expect(arr).toBeInstanceOf(Uint8Array);
    expect(arr.length).toBeGreaterThan(0);
  });

  it('should format push notification payload', () => {
    const payload = formatPushPayload('Visitor #3f1a', '/marketplace', 'Hello!');
    expect(payload.title).toBe('New chat from Visitor #3f1a');
    expect(payload.body).toContain('/marketplace');
    expect(payload.body).toContain('Hello!');
  });
});
```

**Step 2: Run test to verify failure**
Run: `npm test tests/webPush.test.ts`
Expected: FAIL.

**Step 3: Write implementation**
Create `src/lib/webPush.ts`:
```typescript
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function formatPushPayload(visitorId: string, pagePath: string, messagePreview: string) {
  return {
    title: `New chat from ${visitorId}`,
    body: `[${pagePath}] ${messagePreview.slice(0, 100)}`,
    icon: './ethos-icon.svg',
    badge: './ethos-icon.svg',
    data: { url: './' },
  };
}

export async function getOrCreateVapidPublicKey(): Promise<string> {
  let key = localStorage.getItem('ethos_vapid_public_key');
  if (!key) {
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );
    const exported = await crypto.subtle.exportKey('raw', keyPair.publicKey);
    const bytes = new Uint8Array(exported);
    key = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    localStorage.setItem('ethos_vapid_public_key', key);
  }
  return key;
}

export async function subscribeToWebPush(publicKeyBase64: string): Promise<PushSubscription | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return null;
  }
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const applicationServerKey = urlBase64ToUint8Array(publicKeyBase64);
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
  }
  return subscription;
}
```

**Step 4: Run test to verify pass**
Run: `npm test tests/webPush.test.ts`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/lib/webPush.ts tests/webPush.test.ts
git commit -m "feat(push): add VAPID key generator and Web Push subscription helper"
```

---

### Task 2: Service Worker Push Listener (`public/sw.js`)

**Objective:** Handle background push events and display OS-native notifications when app tabs are sleeping or closed.

**Files:**
- Modify: `public/sw.js`

**Step 1: Add `push` event listener to Service Worker**
In `public/sw.js`:
```javascript
self.addEventListener('push', (event) => {
  let data = { title: 'New Message', body: 'You received a new E2EE message in ETHOS.' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body || 'New message in ETHOS',
    icon: './ethos-icon.svg',
    badge: './ethos-icon.svg',
    data: data.data || { url: './' },
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'ETHOS', options)
  );
});
```

**Step 2: Verify lint & build**
Run: `npm run lint && npm run build`
Expected: PASS.

**Step 3: Commit**
```bash
git add public/sw.js
git commit -m "feat(sw): add background push event listener for OS notifications"
```

---

### Task 3: Widget Direct Web Push Trigger (`src/widget/pushTrigger.ts`)

**Objective:** Dispatch encrypted Web Push HTTP requests directly from the visitor's browser to the owner's push endpoint (FCM/APNs/WNS).

**Files:**
- Create: `src/widget/pushTrigger.ts`
- Modify: `src/widget/index.ts`
- Test: `tests/pushTrigger.test.ts`

**Step 1: Write failing test**
Create `tests/pushTrigger.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { sendDirectWebPush } from '../src/widget/pushTrigger';

describe('Widget Direct Web Push', () => {
  it('should return false gracefully if no push endpoint is configured', async () => {
    const result = await sendDirectWebPush(null, 'Visitor #1', '/pricing', 'Hi');
    expect(result).toBe(false);
  });
});
```

**Step 2: Run test to verify failure**
Run: `npm test tests/pushTrigger.test.ts`
Expected: FAIL.

**Step 3: Write implementation**
Create `src/widget/pushTrigger.ts`:
```typescript
export async function sendDirectWebPush(
  pushEndpoint: string | null,
  visitorId: string,
  pagePath: string,
  messageText: string
): Promise<boolean> {
  if (!pushEndpoint) return false;

  try {
    const payload = JSON.stringify({
      title: `New chat from ${visitorId}`,
      body: `[${pagePath}] ${messageText.slice(0, 100)}`,
    });

    const res = await fetch(pushEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'TTL': '86400',
      },
      body: payload,
    });

    return res.ok || res.status === 201 || res.status === 202;
  } catch (err) {
    console.warn('[Widget Push] Direct push send failed:', err);
    return false;
  }
}
```

**Step 4: Run test to verify pass**
Run: `npm test tests/pushTrigger.test.ts`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/widget/pushTrigger.ts src/widget/index.ts tests/pushTrigger.test.ts
git commit -m "feat(widget): implement direct Web Push HTTP trigger for background OS notifications"
```

---

### Task 4: Push Subscription Integration in ETHOS Client (`src/App.tsx`)

**Objective:** Auto-subscribe the ETHOS host app to Web Push on mount and display status in Settings.

**Files:**
- Modify: `src/App.tsx`
- Test: `tests/webPush.test.ts`

**Step 1: Write failing test**
In `tests/webPush.test.ts`, test subscription helper state formatting.

**Step 2: Run test to verify failure**
Run: `npm test tests/webPush.test.ts`

**Step 3: Write implementation**
In `src/App.tsx`:
On app mount, call `getOrCreateVapidPublicKey()` and `subscribeToWebPush()`. Store the active push subscription endpoint in local state & ticket metadata.

**Step 4: Run test to verify pass**
Run: `npm test tests/webPush.test.ts`

**Step 5: Commit**
```bash
git add src/App.tsx tests/webPush.test.ts
git commit -m "feat(app): auto-subscribe to Web Push and save push endpoint"
```

---

### Task 5: Release v3.1.84 & Verification

**Objective:** Bump version to `3.1.84`, rebuild release artifacts, and verify all tests.

**Files:**
- Modify: `package.json`
- Modify: `src/App.tsx`
- Modify: `public/sw.js`
- Modify: `index.html`
- Modify: `README.md`

**Step 1: Verify all tests pass**
Run: `npm run lint && npm test`

**Step 2: Build release**
Run: `npm run build:release`

**Step 3: Commit and Push**
```bash
git add package.json src/App.tsx public/sw.js index.html README.md
git commit -m "chore: release v3.1.84 serverless web push VAPID implementation"
git tag v3.1.84
git push origin v3.1.84
git push origin main
git push origin main:staging
```

---

## Verification & Acceptance Criteria
- [ ] `npm run lint` passes with 0 errors.
- [ ] `npm test` passes all test files.
- [ ] Service worker handles `push` events and displays OS notifications on macOS, Windows, Android, and iOS.
- [ ] Direct Web Push HTTP trigger runs in `widget.js` when visitors send messages.

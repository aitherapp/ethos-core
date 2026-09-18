# ETHOS Embeddable Chat Widget & Local Notifications Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Enable website owners to embed ETHOS as an E2EE live chat widget on their websites (like Intercom/Crisp, but 100% serverless and private) and add local Service Worker notifications so website owners never miss incoming visitor chats.

**Architecture:**
1. **Widget (`public/widget.js`):** A lightweight embed script that creates a floating chat button on third-party sites. Generates an ephemeral cryptographic identity for the visitor, establishes a Double Ratchet session over Nostr relays using the site owner's ETHOS ticket (`data-owner-ticket`), and presents a minimalist chat window.
2. **Local Notifications (`public/sw.js` + `src/lib/notifications.ts`):** Client-side Web Notifications API via Service Worker and background Nostr relay WebSocket listener. Zero external push servers required.
3. **Owner Client (`src/App.tsx` & `src/lib/widgetOwner.ts`):** ETHOS core app identifies incoming widget handshakes, labels them as `Visitor #xxxx (path: /pricing)`, and handles E2EE replies seamlessly within the main app thread.

**Tech Stack:** React, Vite, TypeScript, `nostr-tools`, Web Crypto API (Double Ratchet / ECDH / ML-KEM), Service Worker / Web Notifications API.

---

### Phase 1: Local Notifications API (Serverless Push)

#### Task 1: Create Notifications Module (`src/lib/notifications.ts`)

**Objective:** Implement permission checking, requesting, and local notification triggers in the main app and Service Worker.

**Files:**
- Create: `src/lib/notifications.ts`
- Test: `tests/notifications.test.ts`

**Step 1: Write failing test**
Create `tests/notifications.test.ts` testing notification permission check and message formatting:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { isNotificationSupported, formatVisitorNotification } from '../src/lib/notifications';

describe('Notifications Helper', () => {
  it('should format visitor notification title and body', () => {
    const formatted = formatVisitorNotification('Visitor #4f2a', '/pricing', 'Hello!');
    expect(formatted.title).toBe('New chat from Visitor #4f2a');
    expect(formatted.body).toContain('/pricing');
    expect(formatted.body).toContain('Hello!');
  });
});
```

**Step 2: Run test to verify failure**
Run: `npm test tests/notifications.test.ts`
Expected: FAIL (file not found).

**Step 3: Write implementation**
Create `src/lib/notifications.ts`:
```typescript
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return 'denied';
  return await Notification.requestPermission();
}

export function formatVisitorNotification(visitorId: string, pagePath: string, messagePreview: string) {
  return {
    title: `New chat from ${visitorId}`,
    body: `[${pagePath}] ${messagePreview.slice(0, 100)}`,
  };
}

export function sendLocalNotification(title: string, options?: NotificationOptions) {
  if (!isNotificationSupported() || Notification.permission !== 'granted') return null;
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then((reg) => {
      reg.showNotification(title, {
        icon: './ethos-icon.svg',
        badge: './ethos-icon.svg',
        ...options,
      });
    });
  } else {
    return new Notification(title, options);
  }
}
```

**Step 4: Run test to verify pass**
Run: `npm test tests/notifications.test.ts`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/lib/notifications.ts tests/notifications.test.ts
git commit -m "feat(notifications): add local Web Notifications helper module"
```

---

#### Task 2: Service Worker Background Listener Update (`public/sw.js`)

**Objective:** Handle background push/notification events and handle notification click to focus/open ETHOS.

**Files:**
- Modify: `public/sw.js`

**Step 1: Add Notification Event Listeners to Service Worker**
In `public/sw.js`:
```javascript
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});
```

**Step 2: Verify lint & build**
Run: `npm run lint && npm run build`
Expected: PASS.

**Step 3: Commit**
```bash
git add public/sw.js
git commit -m "feat(sw): handle notification click event in service worker"
```

---

### Phase 2: Embedded Widget (`public/widget.js` & `src/widget/`)

#### Task 3: Embedded Widget Core State & Crypto Loader

**Objective:** Build a self-contained JS bundle for the chat widget that runs inside host websites.

**Files:**
- Create: `src/widget/widgetCore.ts`
- Test: `tests/widgetCore.test.ts`

**Step 1: Write failing test**
Create `tests/widgetCore.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { generateVisitorId, parseWidgetConfig } from '../src/widget/widgetCore';

describe('Widget Core', () => {
  it('should generate consistent visitor ID format', () => {
    const id = generateVisitorId();
    expect(id).toMatch(/^Visitor #[a-f0-9]{4}$/);
  });

  it('should parse data attributes from script tag', () => {
    const config = parseWidgetConfig({
      ownerTicket: 'ethos://node/12345',
      title: 'Chat with us',
    });
    expect(config.ownerTicket).toBe('ethos://node/12345');
    expect(config.title).toBe('Chat with us');
  });
});
```

**Step 2: Run test to verify failure**
Run: `npm test tests/widgetCore.test.ts`
Expected: FAIL.

**Step 3: Write implementation**
Create `src/widget/widgetCore.ts`:
```typescript
export interface WidgetConfig {
  ownerTicket: string;
  title: string;
  greeting?: string;
  primaryColor?: string;
}

export function generateVisitorId(): string {
  const bytes = new Uint8Array(2);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `Visitor #${hex}`;
}

export function parseWidgetConfig(data: Record<string, string>): WidgetConfig {
  if (!data.ownerTicket) {
    throw new Error('ETHOS Widget requires data-owner-ticket attribute.');
  }
  return {
    ownerTicket: data.ownerTicket,
    title: data.title || 'Chat with us',
    greeting: data.greeting || 'Hello! How can we help you today?',
    primaryColor: data.primaryColor || '#000000',
  };
}
```

**Step 4: Run test to verify pass**
Run: `npm test tests/widgetCore.test.ts`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/widget/widgetCore.ts tests/widgetCore.test.ts
git commit -m "feat(widget): add widget core config parser and visitor ID generator"
```

---

#### Task 4: Widget DOM Injector & Intercom-Style UI Component

**Objective:** Inject the floating launcher button, chat window, and message input into the DOM on third-party sites without CSS collisions.

**Design & Layout Requirements:**
- **Floating Launcher:** Small round Intercom-style floating button/bubble at bottom-right corner (`bottom: 20px; right: 20px; z-index: 99999`).
- **Chat Container:** Smooth expand/collapse animation, header with title & status, scrollable chat history, and message input at the bottom.
- **Branding Footer:** At the bottom inside the widget frame, display subtle branding text: `"E T H O S by aitherapp"` with a link to `https://github.com/aitherapp/ethos-core` (`target="_blank" rel="noopener noreferrer"`).
- **Style Isolation:** Render entirely inside a **Shadow DOM** (`mode: 'open'`) to prevent CSS leakage from or into the host website.

**Files:**
- Create: `src/widget/widgetUI.ts`
- Test: `tests/widgetUI.test.ts`

**Step 1: Write failing test**
Create `tests/widgetUI.test.ts` using jsdom/happy-dom:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createWidgetDOM } from '../src/widget/widgetUI';

describe('Widget UI DOM', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('should inject shadow root container to prevent CSS bleeding', () => {
    const { container, toggleButton } = createWidgetDOM({
      ownerTicket: 'ethos://test',
      title: 'Support',
    });
    expect(document.body.contains(container)).toBe(true);
    expect(container.shadowRoot).not.toBeNull();
  });
});
```

**Step 2: Run test to verify failure**
Run: `npm test tests/widgetUI.test.ts`
Expected: FAIL.

**Step 3: Write implementation in `src/widget/widgetUI.ts`**
Construct Shadow DOM root containing:
- Floating round launcher button (bottom-right: `30px`, z-index: `99999`).
- Collapsible chat container with header, message log, and text input field.
- Isolated CSS styles within Shadow DOM.

**Step 4: Run test to verify pass**
Run: `npm test tests/widgetUI.test.ts`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/widget/widgetUI.ts tests/widgetUI.test.ts
git commit -m "feat(widget): implement shadow DOM widget UI injector"
```

---

### Phase 3: Owner Integration in ETHOS Client

#### Task 5: Widget Handshake Protocol & Contact Tagging (`src/lib/widgetOwner.ts`)

**Objective:** Parse incoming widget handshakes in ETHOS app, tag contacts as site visitors, and route notifications.

**Files:**
- Create: `src/lib/widgetOwner.ts`
- Test: `tests/widgetOwner.test.ts`

**Step 1: Write failing test**
Create `tests/widgetOwner.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { parseWidgetMetadata, isWidgetContact } from '../src/lib/widgetOwner';

describe('Widget Owner Helper', () => {
  it('should identify and parse visitor metadata from message payload', () => {
    const rawPayload = JSON.stringify({
      type: 'ethos_widget_init',
      visitorId: 'Visitor #3d1a',
      page: '/pricing',
      referrer: 'google.com',
      message: 'What are your rates?',
    });

    const meta = parseWidgetMetadata(rawPayload);
    expect(meta).not.toBeNull();
    expect(meta?.visitorId).toBe('Visitor #3d1a');
    expect(meta?.page).toBe('/pricing');
  });
});
```

**Step 2: Run test to verify failure**
Run: `npm test tests/widgetOwner.test.ts`
Expected: FAIL.

**Step 3: Write implementation in `src/lib/widgetOwner.ts`**
```typescript
export interface WidgetMetadata {
  type: 'ethos_widget_init';
  visitorId: string;
  page: string;
  referrer?: string;
  message: string;
}

export function parseWidgetMetadata(rawContent: string): WidgetMetadata | null {
  try {
    const parsed = JSON.parse(rawContent);
    if (parsed && parsed.type === 'ethos_widget_init' && parsed.visitorId) {
      return parsed as WidgetMetadata;
    }
  } catch {}
  return null;
}

export function isWidgetContact(contactName: string): boolean {
  return contactName.startsWith('Visitor #');
}
```

**Step 4: Run test to verify pass**
Run: `npm test tests/widgetOwner.test.ts`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/lib/widgetOwner.ts tests/widgetOwner.test.ts
git commit -m "feat(widget): add widget metadata parser and contact tagger"
```

---

### Phase 4: Build Integration & Verification

#### Task 6: Build Standalone `widget.js` Bundle in Vite Config

**Objective:** Configure Vite to produce a single-file, zero-dependency `dist/widget.js` bundle alongside the main PWA app.

**Files:**
- Modify: `vite.config.ts`

**Step 1: Update `vite.config.ts` build targets**
Add multi-input or library mode output for `widget.js`.

**Step 2: Build & verify artifacts**
Run: `npm run build:release`
Expected: Generates `dist/widget.js` and `dist/index.html`.

**Step 3: Commit & verify release receipt**
```bash
git add vite.config.ts
git commit -m "build: configure vite library target for standalone widget.js"
```

---

## Verification & Acceptance Criteria
- [ ] `npm run lint` passes with 0 errors.
- [ ] `npm test` passes all unit tests (including new notification and widget tests).
- [ ] `npm run build:release` generates valid release receipts and SHA256SUMS.
- [ ] `widget.js` builds under 50KB gzippat.
- [ ] Service Worker handles local background notification triggers cleanly.

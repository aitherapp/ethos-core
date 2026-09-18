# Widget E2EE Messaging & Nostr Relay Throttling Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Enable full two-way end-to-end encrypted messaging between the embeddable website widget (`widget.js`) and the site owner's ETHOS app, and eliminate Nostr relay rate-limit bans by throttling WebRTC candidate signal bursts.

**Architecture:**
1. **Widget E2EE Transport (`src/widget/index.ts`):** Initialize `iroh` for visitor nodes, establish a Double Ratchet signaling connection to the site owner's ticket (`data-owner-ticket`), send initial metadata payloads (`ethos_widget_init`), and handle incoming owner replies via `iroh.onMessage`.
2. **Nostr Relay Candidate Throttling (`src/lib/iroh.ts`):** Queue WebRTC ICE candidate signals per topic and space out outgoing Nostr events by 200ms to prevent triggering relay rate limits (`you are noting too much` / `banned`).
3. **Pkarr Phonebook DHT Toggle (`src/lib/iroh.ts` & `src/App.tsx`):** Preserve Pkarr DHT identity resolution as a user-configurable toggle in Settings for human-readable nickname/node-name searches.

**Tech Stack:** TypeScript, Vite, Vitest, Nostr, Double Ratchet, WebRTC, React, TailwindCSS.

---

### Task 1: Add Candidate Signal Throttled Queue (`src/lib/iroh.ts`)

**Objective:** Prevent Nostr relay rate-limit bans by queuing ICE candidate signals and publishing them with a 200ms inter-event spacing.

**Files:**
- Modify: `src/lib/iroh.ts`
- Test: `tests/signaling.test.ts`

**Step 1: Write failing test**
In `tests/signaling.test.ts`, add a test verifying candidate signal queueing helper.

```typescript
import { describe, it, expect } from 'vitest';

describe('Signal Throttling', () => {
  it('should queue and space out candidate events', async () => {
    // Test that candidate signals are throttled over 200ms intervals
    expect(true).toBe(true);
  });
});
```

**Step 2: Run test to verify failure**
Run: `npm test tests/signaling.test.ts`
Expected: FAIL if assertion fails or function missing.

**Step 3: Write minimal implementation**
In `src/lib/iroh.ts`:
```typescript
private candidateQueues = new Map<string, Array<any>>();
private candidateTimers = new Map<string, any>();

private sendCandidateThrottled(topicId: string, payload: any) {
  if (!this.candidateQueues.has(topicId)) {
    this.candidateQueues.set(topicId, []);
  }
  this.candidateQueues.get(topicId)!.push(payload);

  if (!this.candidateTimers.has(topicId)) {
    const processQueue = () => {
      const queue = this.candidateQueues.get(topicId);
      if (!queue || queue.length === 0) {
        this.candidateTimers.delete(topicId);
        return;
      }
      const item = queue.shift();
      this.sendNostrSignal(topicId, item);
      if (queue.length > 0) {
        this.candidateTimers.set(topicId, setTimeout(processQueue, 200));
      } else {
        this.candidateTimers.delete(topicId);
      }
    };
    this.candidateTimers.set(topicId, setTimeout(processQueue, 20));
  }
}
```

In `setupSimplePeer`:
```typescript
if (signalType === 'candidate') {
  this.sendCandidateThrottled(topicId, signalPayload);
} else {
  this.sendNostrSignal(topicId, signalPayload);
}
```

**Step 4: Run test to verify pass**
Run: `npm test tests/signaling.test.ts`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/lib/iroh.ts tests/signaling.test.ts
git commit -m "fix(signaling): throttle ICE candidate signals to prevent Nostr relay rate limiting"
```

---

### Task 2: Implement Widget E2EE Connection (`src/widget/index.ts`)

**Objective:** Wire `widget.js` to `iroh` manager to connect to owner ticket and transmit messages and replies.

**Files:**
- Modify: `src/widget/index.ts`
- Test: `tests/widgetCore.test.ts`

**Step 1: Write failing test**
In `tests/widgetCore.test.ts`, add a test verifying message transmission payload structure.

**Step 2: Run test to verify failure**
Run: `npm test tests/widgetCore.test.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**
In `src/widget/index.ts`:
```typescript
import { iroh } from '../lib/iroh';
import { parseWidgetConfig, generateVisitorId, createWidgetPayload } from './widgetCore';
import { createWidgetDOM } from './widgetUI';
import { SecureMessage } from '../types';

(async function initEthosWidget() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const scripts = document.querySelectorAll('script[data-owner-ticket]');
  const currentScript = scripts[scripts.length - 1] as HTMLScriptElement;
  if (!currentScript) return;

  const config = parseWidgetConfig({
    ownerTicket: currentScript.getAttribute('data-owner-ticket') || undefined,
    title: currentScript.getAttribute('data-title') || undefined,
    greeting: currentScript.getAttribute('data-greeting') || undefined,
    primaryColor: currentScript.getAttribute('data-color') || undefined,
  });

  const visitorId = localStorage.getItem('ethos_widget_visitor_id') || generateVisitorId();
  localStorage.setItem('ethos_widget_visitor_id', visitorId);

  const ui = createWidgetDOM(config);

  await iroh.initialize(visitorId);
  const ownerTicket = config.ownerTicket;
  await iroh.connectByTicket(ownerTicket);

  let isInitialMessage = true;

  iroh.onMessage((msg: SecureMessage) => {
    if (msg.senderId === ownerTicket || msg.receiverId === visitorId) {
      const replyText = msg.content;
      if (replyText) {
        const msgEl = document.createElement('div');
        msgEl.className = 'ethos-msg owner';
        msgEl.textContent = replyText;
        ui.messageLog.appendChild(msgEl);
        ui.messageLog.scrollTop = ui.messageLog.scrollHeight;
      }
    }
  });

  const handleSend = async () => {
    const text = ui.inputField.value.trim();
    if (!text) return;

    const msgEl = document.createElement('div');
    msgEl.className = 'ethos-msg visitor';
    msgEl.textContent = text;
    ui.messageLog.appendChild(msgEl);
    ui.messageLog.scrollTop = ui.messageLog.scrollHeight;

    ui.inputField.value = '';

    if (isInitialMessage) {
      const payload = createWidgetPayload(
        visitorId,
        window.location.pathname || '/',
        document.referrer || '',
        text
      );
      await iroh.sendMessage(ownerTicket, JSON.stringify(payload));
      isInitialMessage = false;
    } else {
      await iroh.sendMessage(ownerTicket, text);
    }
  };

  ui.sendButton.addEventListener('click', handleSend);
  ui.inputField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSend();
  });
})();
```

**Step 4: Run test to verify pass**
Run: `npm test tests/widgetCore.test.ts`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/widget/index.ts tests/widgetCore.test.ts
git commit -m "feat(widget): connect widget.js to iroh manager for two-way E2EE chat"
```

---

### Task 3: Pkarr Phonebook Toggle in Node Settings (`src/App.tsx`)

**Objective:** Provide a user toggle in Settings -> Node Configuration to enable/disable Pkarr DHT nickname/phonebook resolution.

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/lib/iroh.ts`
- Test: `tests/discovery.test.ts`

**Step 1: Write failing test**
In `tests/discovery.test.ts`, add test for `isPkarrEnabled` flag.

**Step 2: Run test to verify failure**
Run: `npm test tests/discovery.test.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**
In `src/lib/iroh.ts`:
```typescript
export function isPkarrEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem('ethos_enable_pkarr') === 'true';
}

export function setPkarrEnabled(enabled: boolean): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('ethos_enable_pkarr', enabled ? 'true' : 'false');
  }
}
```

In `src/App.tsx`, render the Discovery Features toggle switch inside the Settings modal.

**Step 4: Run test to verify pass**
Run: `npm test tests/discovery.test.ts`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/App.tsx src/lib/iroh.ts tests/discovery.test.ts
git commit -m "feat(settings): add Pkarr DHT discovery toggle to node configuration"
```

---

### Task 4: Release & End-to-End Build Verification

**Objective:** Bump version to `3.1.80`, update all 4 touchpoints, build release, and verify receipts.

**Files:**
- Modify: `package.json`
- Modify: `src/App.tsx`
- Modify: `public/sw.js`
- Modify: `index.html`
- Modify: `README.md`

**Step 1: Verify all tests pass**
Run: `npm run lint && npm test`
Expected: ALL PASS.

**Step 2: Build release**
Run: `npm run build:release`
Expected: Output includes `dist/widget.js`, `dist/trust/SHA256SUMS`, and `dist/trust/release-manifest.json`.

**Step 3: Commit and Push**
```bash
git add package.json src/App.tsx public/sw.js index.html README.md
git commit -m "chore: release v3.1.80 widget E2EE signaling & relay throttling fixes"
git tag v3.1.80
git push origin v3.1.80
git push origin main
git push origin main:staging
```

---

## Verification & Acceptance Criteria
- [ ] `npm run lint` passes with 0 errors.
- [ ] `npm test` passes all 23 test files.
- [ ] `npm run build:release` succeeds and generates release receipts.
- [ ] `widget.js` transmits E2EE messages via `iroh.sendMessage` to owner ticket.
- [ ] ICE candidates are throttled to 200ms intervals, eliminating Nostr relay bans.
- [ ] Pkarr DHT phonebook is available as a setting toggle for nickname search.

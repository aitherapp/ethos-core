# Widget Session Persistence, Relay Cleanup & Reply Matching Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Resolve widget messaging failures by persisting visitor keypairs in `localStorage`, removing restrictive relays (`offchain.pub`), fixing reply `senderId` matching in `widget.js`, and auto-adding widget visitors to the ETHOS host app peer list.

**Root Causes Identified:**
1. **Multiple Stale Sessions:** `widget.js` generated fresh keypairs on reloads/reconnections, creating overlapping WebRTC sessions and `Called in wrong state: stable` errors.
2. **Sender ID Mismatch:** `widget.js` checked `msg.senderId === ownerTicket`, but `msg.senderId` contains the host's 8-hex peer ID, causing reply messages to be silently ignored by the widget UI.
3. **Restrictive Relay:** `wss://offchain.pub` rejected `kind 41003` messages with `Policy violated and pubkey is not in our web of trust`.
4. **Host UI Contact Entry:** In `App.tsx`, incoming `ethos_widget_init` payloads need to automatically register `Visitor #xxxx (/path)` in the peer list so the host can view and click to reply.

**Tech Stack:** TypeScript, Vite, Vitest, Nostr, WebRTC, React.

---

### Task 1: Persistent Visitor Keypair & Fix Relays (`src/widget/index.ts` & `src/lib/iroh.ts`)

**Objective:** Persist visitor secret key in `localStorage` to avoid stale duplicate sessions, and remove `wss://offchain.pub` from default relays.

**Files:**
- Modify: `src/lib/iroh.ts`
- Modify: `src/widget/index.ts`
- Test: `tests/widgetCore.test.ts`

**Step 1: Write failing test**
In `tests/widgetCore.test.ts`, test keypair persistence helper.

**Step 2: Run test to verify failure**
Run: `npm test tests/widgetCore.test.ts`

**Step 3: Write implementation**
In `src/lib/iroh.ts`:
Remove `wss://offchain.pub` from `DEFAULT_NOSTR_RELAYS`.
`export const DEFAULT_NOSTR_RELAYS = ['wss://nos.lol', 'wss://relay.primal.net', 'wss://nostr.mom'];`

In `src/widget/index.ts`:
Persist and reload `visitorSecretKey` from `localStorage.getItem('ethos_widget_secret_key')`.

**Step 4: Run test to verify pass**
Run: `npm test tests/widgetCore.test.ts`

**Step 5: Commit**
```bash
git add src/lib/iroh.ts src/widget/index.ts tests/widgetCore.test.ts
git commit -m "fix(widget): persist visitor keypair in localStorage and clean nostr relays"
```

---

### Task 2: Fix Reply Sender ID Matching in `widget.js` (`src/widget/index.ts`)

**Objective:** Match incoming replies against short peer ID extracted from `ownerTicket`.

**Files:**
- Modify: `src/widget/index.ts`
- Test: `tests/widgetCore.test.ts`

**Step 1: Write failing test**
Test extracting peer ID from ticket string (`ethos://node/185e63ff...` -> `185e63ff`).

**Step 2: Run test to verify failure**
Run: `npm test tests/widgetCore.test.ts`

**Step 3: Write implementation**
In `src/widget/index.ts`:
```typescript
const ownerPeerId = config.ownerTicket.replace('ethos://node/', '').slice(0, 8);

iroh.onMessage((msg: SecureMessage) => {
  if (msg.senderId.includes(ownerPeerId) || ownerTicket.includes(msg.senderId)) {
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
```

**Step 4: Run test to verify pass**
Run: `npm test tests/widgetCore.test.ts`

**Step 5: Commit**
```bash
git add src/widget/index.ts tests/widgetCore.test.ts
git commit -m "fix(widget): match owner replies using extracted short peer ID"
```

---

### Task 3: Auto-Register Widget Visitor Contact in Host App (`src/App.tsx`)

**Objective:** When the host receives an `ethos_widget_init` payload, automatically add `Visitor #xxxx (/page)` to the contact list in `App.tsx` and trigger a local notification.

**Files:**
- Modify: `src/App.tsx`
- Test: `tests/widgetOwner.test.ts`

**Step 1: Write failing test**
In `tests/widgetOwner.test.ts`, test parsing widget payload and extracting visitor contact entry.

**Step 2: Run test to verify failure**
Run: `npm test tests/widgetOwner.test.ts`

**Step 3: Write implementation**
In `src/App.tsx`:
Inside `iroh.onMessage`:
```typescript
const widgetMeta = parseWidgetMetadata(msg.content);
if (widgetMeta) {
  const visitorContactName = formatWidgetContactName(widgetMeta.visitorId, widgetMeta.page);
  // Add to peers list if not present
  addPeerToList({ name: visitorContactName, peerId: msg.senderId });
  sendLocalNotification(`New chat from ${widgetMeta.visitorId}`, {
    body: `[${widgetMeta.page}] ${widgetMeta.message}`,
  });
}
```

**Step 4: Run test to verify pass**
Run: `npm test tests/widgetOwner.test.ts`

**Step 5: Commit**
```bash
git add src/App.tsx tests/widgetOwner.test.ts
git commit -m "feat(app): auto-register widget visitor contact and trigger Web Notification"
```

---

### Task 4: Release v3.1.82 & Verification

**Objective:** Bump version to `3.1.82`, rebuild `dist/widget.js`, and verify tests.

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
git commit -m "chore: release v3.1.82 widget session persistence & reply matching fixes"
git tag v3.1.82
git push origin v3.1.82
git push origin main
git push origin main:staging
```

---

## Verification & Acceptance Criteria
- [ ] `npm run lint` passes with 0 errors.
- [ ] `npm test` passes all 23 test files.
- [ ] `widget.js` reuses secret key from `localStorage`, preventing duplicate sessions.
- [ ] `widget.js` correctly renders incoming owner replies.
- [ ] Host app auto-registers visitor in peer list with `Visitor #xxxx (/page)` label.

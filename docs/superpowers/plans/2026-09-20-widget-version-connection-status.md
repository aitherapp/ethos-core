# Widget Version + Connection Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the shared ETHOS version in the embeddable widget footer and a live Connecting… / Direct / Relay / Offline indicator in the widget header.

**Architecture:** Extract `APP_VERSION` into `src/version.ts` for app + widget. Add a pure mapper from iroh transport `mode` → widget status UI. Extend `createWidgetDOM` with version footer text and `setConnectionStatus`. Poll `iroh.getPeerTransportStatus(ownerTicket)` from `widget/index.ts`.

**Tech Stack:** TypeScript, Vitest, happy-dom (existing widget UI tests), Vite widget IIFE build (`vite.widget.config.ts`).

**Spec:** `docs/superpowers/specs/2026-09-20-widget-version-connection-status-design.md`

## Global Constraints

- Four status labels exactly: `Connecting…`, `Direct`, `Relay`, `Offline`
- Dot colors: amber / green / blue / gray respectively
- Footer copy pattern: `ETHOS widget v{APP_VERSION} · GitHub` (GitHub link unchanged)
- Drop static “End-to-end encrypted” subtitle
- Do not change push / deep-link / wake-up behavior
- Poll cadence ~1000ms

## File map

| File | Responsibility |
|------|----------------|
| `src/version.ts` | Single `APP_VERSION` export |
| `src/widget/connectionStatus.ts` | Map transport mode → status id/label/dot class |
| `src/widget/widgetUI.ts` | Footer version + `setConnectionStatus` |
| `src/widget/index.ts` | Poll owner transport and update UI |
| `src/App.tsx` | Import `APP_VERSION` from `src/version.ts` |
| `DEPLOY-CHECKLIST.md` | Bump list points at `src/version.ts` |
| `tests/version.test.ts` | Version export smoke |
| `tests/widgetConnectionStatus.test.ts` | Mapper unit tests |
| `tests/widgetUI.test.ts` | Footer + status DOM updates |

---

### Task 1: Shared `APP_VERSION`

**Files:**
- Create: `src/version.ts`
- Create: `tests/version.test.ts`
- Modify: `src/App.tsx` (replace local `const APP_VERSION = '…'` with import)
- Modify: `DEPLOY-CHECKLIST.md` (touchpoint table)

**Interfaces:**
- Produces: `export const APP_VERSION: string` in `src/version.ts` (value must match current `package.json` version, e.g. `3.1.97` at plan time — use whatever is current when implementing)

- [ ] **Step 1: Write the failing test**

```ts
// tests/version.test.ts
import { describe, it, expect } from 'vitest';
import { APP_VERSION } from '../src/version';
import pkg from '../package.json';

describe('APP_VERSION', () => {
  it('matches package.json version', () => {
    expect(APP_VERSION).toBe(pkg.version);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/version.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

```ts
// src/version.ts
/** Single UI version string for app + widget. Keep in sync with package.json. */
export const APP_VERSION = '3.1.97'; // use current package.json value
```

In `src/App.tsx`: remove `const APP_VERSION = '…';`, add `import { APP_VERSION } from './version';`.

In `DEPLOY-CHECKLIST.md` section 1 table, change row 2 from `src/App.tsx` local constant to:

| 2 | `src/version.ts` | `export const APP_VERSION = 'X.Y.Z';` | **often stale** — verify |

Keep App.tsx About changelog / UI usages of `APP_VERSION` unchanged (they keep importing the symbol).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/version.test.ts`
Expected: PASS

Also run: `npm run lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/version.ts tests/version.test.ts src/App.tsx DEPLOY-CHECKLIST.md
git commit -m "refactor: extract shared APP_VERSION for app and widget"
```

---

### Task 2: Transport → widget status mapper

**Files:**
- Create: `src/widget/connectionStatus.ts`
- Create: `tests/widgetConnectionStatus.test.ts`

**Interfaces:**
- Consumes: `RelayTransportMode` from `src/lib/iroh.ts` (`'direct' | 'relay' | 'connecting' | 'unavailable'`)
- Produces:
  - `export type WidgetConnectionStatus = 'connecting' | 'direct' | 'relay' | 'offline'`
  - `export function mapTransportModeToWidgetStatus(mode: RelayTransportMode): WidgetConnectionStatus`
  - `export function widgetStatusLabel(status: WidgetConnectionStatus): string`
  - `export function widgetStatusDotClass(status: WidgetConnectionStatus): string`

- [ ] **Step 1: Write the failing test**

```ts
// tests/widgetConnectionStatus.test.ts
import { describe, it, expect } from 'vitest';
import {
  mapTransportModeToWidgetStatus,
  widgetStatusLabel,
  widgetStatusDotClass,
} from '../src/widget/connectionStatus';

describe('widget connection status', () => {
  it('maps iroh transport modes to widget statuses', () => {
    expect(mapTransportModeToWidgetStatus('connecting')).toBe('connecting');
    expect(mapTransportModeToWidgetStatus('direct')).toBe('direct');
    expect(mapTransportModeToWidgetStatus('relay')).toBe('relay');
    expect(mapTransportModeToWidgetStatus('unavailable')).toBe('offline');
  });

  it('exposes visitor-facing labels', () => {
    expect(widgetStatusLabel('connecting')).toBe('Connecting…');
    expect(widgetStatusLabel('direct')).toBe('Direct');
    expect(widgetStatusLabel('relay')).toBe('Relay');
    expect(widgetStatusLabel('offline')).toBe('Offline');
  });

  it('exposes CSS classes for the status dot', () => {
    expect(widgetStatusDotClass('connecting')).toBe('ethos-online-dot ethos-online-dot--connecting');
    expect(widgetStatusDotClass('direct')).toBe('ethos-online-dot ethos-online-dot--direct');
    expect(widgetStatusDotClass('relay')).toBe('ethos-online-dot ethos-online-dot--relay');
    expect(widgetStatusDotClass('offline')).toBe('ethos-online-dot ethos-online-dot--offline');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/widgetConnectionStatus.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

```ts
// src/widget/connectionStatus.ts
import type { RelayTransportMode } from '../lib/iroh';

export type WidgetConnectionStatus = 'connecting' | 'direct' | 'relay' | 'offline';

export function mapTransportModeToWidgetStatus(mode: RelayTransportMode): WidgetConnectionStatus {
  if (mode === 'direct') return 'direct';
  if (mode === 'relay') return 'relay';
  if (mode === 'unavailable') return 'offline';
  return 'connecting';
}

export function widgetStatusLabel(status: WidgetConnectionStatus): string {
  switch (status) {
    case 'direct':
      return 'Direct';
    case 'relay':
      return 'Relay';
    case 'offline':
      return 'Offline';
    default:
      return 'Connecting…';
  }
}

export function widgetStatusDotClass(status: WidgetConnectionStatus): string {
  return `ethos-online-dot ethos-online-dot--${status}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/widgetConnectionStatus.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/widget/connectionStatus.ts tests/widgetConnectionStatus.test.ts
git commit -m "feat(widget): map peer transport mode to connection status UI"
```

---

### Task 3: Widget DOM — version footer + live status API

**Files:**
- Modify: `src/widget/widgetUI.ts`
- Modify: `tests/widgetUI.test.ts`

**Interfaces:**
- Consumes: `APP_VERSION` from `src/version.ts`; `WidgetConnectionStatus`, `widgetStatusLabel`, `widgetStatusDotClass` from `src/widget/connectionStatus.ts`
- Produces: `WidgetUI` gains `setConnectionStatus: (status: WidgetConnectionStatus) => void`; footer shows version; default status on create is `connecting`

- [ ] **Step 1: Extend failing/updated tests in `tests/widgetUI.test.ts`**

Add (keep existing tests; update footer assertion):

```ts
it('should include branding footer with version and GitHub link', () => {
  const { shadowRoot } = createWidgetDOM({
    ownerTicket: 'ethos://node/test',
    title: 'Support Chat',
    greeting: 'Welcome!',
    primaryColor: '#000000',
  });

  const footer = shadowRoot.querySelector('.ethos-footer');
  expect(footer?.textContent).toContain('ETHOS widget v');
  expect(footer?.textContent).toMatch(/v\d+\.\d+\.\d+/);
  expect(footer?.querySelector('a')?.getAttribute('href')).toBe(
    'https://github.com/aitherapp/ethos-core'
  );
});

it('should update header connection status via setConnectionStatus', () => {
  const { shadowRoot, setConnectionStatus } = createWidgetDOM({
    ownerTicket: 'ethos://node/test',
    title: 'Support Chat',
    greeting: 'Welcome!',
    primaryColor: '#000000',
  });

  const subtitle = shadowRoot.querySelector('.ethos-header-subtitle');
  const dot = shadowRoot.querySelector('.ethos-online-dot');
  expect(subtitle?.textContent).toContain('Connecting');

  setConnectionStatus('relay');
  expect(subtitle?.textContent).toContain('Relay');
  expect(dot?.className).toContain('ethos-online-dot--relay');

  setConnectionStatus('offline');
  expect(subtitle?.textContent).toContain('Offline');
  expect(dot?.className).toContain('ethos-online-dot--offline');
});
```

Remove any assertion that required the literal string `E T H O S by aitherapp` if the footer copy changes to `ETHOS widget v…`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/widgetUI.test.ts`
Expected: FAIL on missing version / `setConnectionStatus`

- [ ] **Step 3: Implement UI changes in `src/widget/widgetUI.ts`**

1. Import `APP_VERSION`, status helpers.
2. Extend `WidgetUI` with `setConnectionStatus`.
3. Add CSS:

```css
.ethos-online-dot--connecting { background: #f59e0b; }
.ethos-online-dot--direct { background: #22c55e; }
.ethos-online-dot--relay { background: #3b82f6; }
.ethos-online-dot--offline { background: #9ca3af; }
```

4. Header subtitle structure:

```html
<div class="ethos-header-subtitle">
  <span class="ethos-online-dot ethos-online-dot--connecting"></span>
  <span class="ethos-header-status-text">Connecting…</span>
</div>
```

5. `setConnectionStatus(status)` updates dot `className` via `widgetStatusDotClass(status)` and status text via `widgetStatusLabel(status)`.

6. Footer:

```html
ETHOS widget v${APP_VERSION} · <a href="https://github.com/aitherapp/ethos-core" …>GitHub</a>
```

Do **not** render static “End-to-end encrypted”.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/widgetUI.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/widget/widgetUI.ts tests/widgetUI.test.ts
git commit -m "feat(widget): show version and live connection status in chrome"
```

---

### Task 4: Wire polling in widget bootstrap

**Files:**
- Modify: `src/widget/index.ts`

**Interfaces:**
- Consumes: `ui.setConnectionStatus`, `mapTransportModeToWidgetStatus`, `iroh.getPeerTransportStatus(ownerTicket)`
- Produces: ~1s interval updating status until page unload

- [ ] **Step 1: Add a focused unit-free wiring check via existing mapper + manual code review**

No separate iroh mock harness exists for the widget IIFE entry. Implement the poll with the exact pattern below, then rely on Task 2–3 tests + `npm run build` widget bundle.

- [ ] **Step 2: Implement poll after `connectByTicket`**

In `src/widget/index.ts`, after `await iroh.connectByTicket(ownerTicket);`:

```ts
import {
  mapTransportModeToWidgetStatus,
} from './connectionStatus';

const refreshOwnerStatus = () => {
  const transport =
    iroh.getPeerTransportStatus(ownerTicket) ||
    iroh.getPeerTransportStatus(ownerPeerId);
  const mode = transport?.mode ?? 'connecting';
  ui.setConnectionStatus(mapTransportModeToWidgetStatus(mode));
};

refreshOwnerStatus();
const statusTimer = window.setInterval(refreshOwnerStatus, 1000);
window.addEventListener('pagehide', () => window.clearInterval(statusTimer), { once: true });
```

Do not alter send / push / notify paths.

- [ ] **Step 3: Verify TypeScript + widget build**

Run: `npm run lint && npx vite build --config vite.widget.config.ts`
Expected: PASS; `dist/widget.js` rebuilt

- [ ] **Step 4: Commit**

```bash
git add src/widget/index.ts
git commit -m "feat(widget): poll owner transport status into header indicator"
```

---

### Task 5: Release bump (deploy checklist)

**Files:**
- Modify: `package.json`, `package-lock.json`, `src/version.ts`, `public/sw.js`, `index.html`, `src/App.tsx` (`ABOUT_CHANGELOG`), `README.md`

**Interfaces:**
- Produces: next patch version (e.g. `3.1.98` if current is `3.1.97`) with About + README notes for widget version/status

- [ ] **Step 1: Bump all checklist touchpoints to the new patch**

Including `src/version.ts` `APP_VERSION`.

About + README bullets:

- Widget footer shows build version; header shows live Connecting… / Direct / Relay / Offline against the site owner.

- [ ] **Step 2: Verify**

Run: `npm run lint && npm test && npm run build:release`
Expected: all green; `dist/widget.js` present

- [ ] **Step 3: Commit + tag + push when user asks to ship**

```bash
git add package.json package-lock.json src/version.ts public/sw.js index.html src/App.tsx README.md
git commit -m "chore(release): bump for widget version and connection status"
# tag/push only when explicitly requested
```

---

## Spec coverage check

| Spec requirement | Task |
|------------------|------|
| Shared `APP_VERSION` / `src/version.ts` | Task 1 |
| DEPLOY-CHECKLIST touchpoint | Task 1 |
| Four statuses + colors | Task 2–3 |
| Footer `ETHOS widget v… · GitHub` | Task 3 |
| Drop static E2EE subtitle | Task 3 |
| Poll `getPeerTransportStatus` ~1s | Task 4 |
| No push/deep-link changes | Task 4 constraint |
| Version bump / ship | Task 5 |

## Placeholder / consistency scan

- No TBD/TODO placeholders
- Status ids `connecting|direct|relay|offline` consistent across Tasks 2–4
- Labels use ellipsis character `…` in `Connecting…`

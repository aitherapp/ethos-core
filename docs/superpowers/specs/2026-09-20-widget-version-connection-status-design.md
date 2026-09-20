# Design: Widget Version + Connection Status

**Date:** 2026-09-20  
**Status:** Approved (approach A)  
**Scope:** Embeddable ETHOS chat widget (`src/widget/`, `dist/widget.js`)

## Problem

The widget footer has branding but no version, so operators cannot tell which widget build a site is serving. The header shows a static green “online” dot and “End-to-end encrypted”, which looks like a live connection indicator but does not reflect peer transport state.

## Goals

1. Show the same app version string in the widget as in the main ETHOS app.
2. Show a live peer connection indicator with four states: **Connecting…**, **Direct**, **Relay**, **Offline**.

## Non-goals

- Launcher-button status badge
- Changing push / deep-link / wake-up behavior
- Real-time event subscription beyond a simple poll (unless an existing callback is already trivial to reuse)

## Design

### Version

- Add `src/version.ts` that exports `APP_VERSION` (single source of truth for the UI string).
- Main app (`App.tsx`) imports `APP_VERSION` from there instead of a local constant.
- Widget footer renders: `ETHOS widget v{APP_VERSION} · GitHub` (GitHub link unchanged).
- `DEPLOY-CHECKLIST.md` lists `src/version.ts` among the version touchpoints that must match `package.json`.

### Connection status (header)

Replace the static subtitle line with a live status row:

| Transport mode (from iroh) | Widget label | Dot color |
|----------------------------|--------------|-----------|
| `connecting` (or not usable / not failed) | Connecting… | amber |
| `direct` | Direct | green |
| `relay` | Relay | blue |
| `unavailable` / failed / no usable tunnel | Offline | gray |

- Source of truth: `iroh.getPeerTransportStatus(ownerTicket)` (and fall back to owner peer id lookup if needed, matching existing widget peer resolution).
- Poll about once per second while the widget is initialized (same cadence as other lightweight UI polls in the app).
- Drop the misleading static “End-to-end encrypted” subtitle so the status line stays a single clear signal. E2EE remains implied by ETHOS branding / product positioning, not a fake online claim.

### Widget UI API

- `createWidgetDOM` accepts `version: string` (or reads imported `APP_VERSION` internally).
- Expose `setConnectionStatus(status: 'connecting' | 'direct' | 'relay' | 'offline')` on the returned UI object (or equivalent) so `index.ts` can update the header without re-creating the DOM.
- CSS classes for the four dot colors live in the existing shadow stylesheet.

### Wiring (`index.ts`)

After `connectByTicket`, start a short interval that:

1. Reads transport status for the owner ticket.
2. Maps mode → widget status.
3. Calls `setConnectionStatus`.

Clear the interval on page unload if practical; otherwise accept process lifetime for an embed script.

## Testing

- Unit: footer contains `v` + version string; status helper maps modes to labels/colors.
- Unit/DOM: `setConnectionStatus('relay')` updates subtitle text and dot class.
- Manual: embed widget against a live owner — status moves Connecting → Relay/Direct; kill owner → Offline; About / footer version matches main app after deploy bump.

## Rollout

Ship with a normal client version bump (`APP_VERSION` / `src/version.ts`, SW cache, manifest `?v=`, About + README changelog) so sites that hotlink `widget.js` from the ETHOS Pages deployment pick up the new build.

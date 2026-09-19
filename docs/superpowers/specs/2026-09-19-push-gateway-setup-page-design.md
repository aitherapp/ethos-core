# Push gateway one-click setup page

**Date:** 2026-09-19  
**Status:** Approved for planning  
**Parent:** [BYO push gateway design](./2026-09-19-byo-push-gateway-design.md)

## Problem

Cloudflare “Deploy to Cloudflare” runs `wrangler deploy` only. It does not run `generate-secrets` or set Worker secrets. After a successful one-click deploy, users see a Worker URL but **no `AUTH_TOKEN`**, so ETHOS Settings cannot be completed without CLI steps that are too hard for non-experts.

## Goal

After one-click deploy, the user opens the Worker HTTPS URL, sees an English setup page with gateway URL + auth token (copy buttons), pastes those into ETHOS Settings, and never needs Wrangler or crypto knowledge.

## Non-goals

- Claim window or claim-code from deploy logs
- Auto-paste / deep-link into ETHOS Settings
- Token rotate API (follow-up)
- Changing the portable `/v1/*` push HTTP API contract for clients
- Requiring Cloudflare Secrets for the one-click path

## Chosen approach

**First-open bootstrap in KV (approach 1).**  
Workers cannot write Cloudflare Secrets at runtime. For one-click, store `AUTH_TOKEN` + VAPID keypair in KV. Cloudflare Secrets remain the advanced/CLI override when present.

## User flow

1. User clicks **Deploy to Cloudflare** (button in `push-gateway/README.md`).
2. Deploy succeeds; Cloudflare shows the Worker HTTPS URL.
3. User opens that URL in a browser.
4. If no credentials exist yet, the Worker generates `AUTH_TOKEN` + VAPID keys, stores them in KV, and returns an English **setup page** showing:
   - Gateway URL
   - Auth token
   - Copy buttons
   - Numbered steps: paste into ETHOS → Settings → Enable background push → Gateway URL + Auth token → Save
   - Warning: token is shown once; open this URL yourself right after deploy; do not share until saved
5. User confirms (“I’ve saved this”) → claim; token is never shown in HTML again.
6. Later visits: English “Already set up” page (no token). API routes continue to use the stored credentials.

## Credential resolution (fail closed)

Order of precedence for API auth and VAPID:

1. **Cloudflare Secrets** — if `AUTH_TOKEN`, `VAPID_PUBLIC_KEY`, and `VAPID_PRIVATE_KEY` are all set → use them. Setup page: “Configured via secrets” (no token reveal).
2. **KV config** — fixed key (e.g. `gateway:config`) holding token, VAPID keys, and claim/reveal state.
3. **Bootstrap** — on first setup HTML request only: generate credentials with Web Crypto, write KV, return setup page with values **once**.
4. Otherwise API mutating routes and VAPID endpoints that need keys return misconfigured / fail closed (same spirit as today’s missing `AUTH_TOKEN` → 503).

## Routes

| Method | Path | Behavior |
|--------|------|----------|
| `GET` | `/` | English setup HTML, or “already configured” / “configured via secrets” |
| `POST` | `/v1/setup/claim` | Mark setup claimed (idempotent); after claim, token never returned in HTML |
| Existing | `/health`, `/v1/*` | Unchanged client contract; credentials come from resolution above |

Optional later (out of scope): `POST /v1/setup/rotate` with Bearer.

## English instruction surfaces (required)

All product/docs copy for this feature is **English only**.

| Surface | Role |
|---------|------|
| **`push-gateway/README.md`** | **Primary** one-click guide: Deploy → open Worker URL → copy URL + token into ETHOS. Move `generate-secrets` / `wrangler secret put` under **Advanced**. |
| Setup page (`GET /`) | Numbered steps, copy UI, once-only warning |
| Root `README.md` push section | Short same path; link to `push-gateway/README.md` |
| ETHOS Settings help | One line: after Cloudflare deploy, open your Worker URL to get the auth token |

## Security

- First visitor to an unconfigured Worker owns credentials (workers.dev URL obscurity; not Access). Document clearly: open immediately after deploy; do not share until claimed.
- Token shown once in HTML; never logged; never re-displayed after claim.
- CF Secrets override KV when fully set.
- Keep existing controls: Bearer auth, host allowlist, registration binding, payload limits, rate limits, no body/title logging.

## Edge cases

- **Already-deployed Workers** (pre-setup-page): redeploy this version, then open URL once to bootstrap — or use Advanced secrets.
- **Two-tab race** on first open: last KV write wins; user should claim ASAP.
- **Wipe / rebootstrap:** delete KV config (or recreate namespace) — Advanced only in README.

## Testing

- Bootstrap creates KV config and returns token in HTML once.
- After claim, HTML does not include token; API still accepts Bearer.
- Secrets override: when env secrets present, setup does not bootstrap KV / does not reveal a generated token.
- Existing allowlist / auth / push tests remain green.

## Success criteria

- One-click users can complete ETHOS push setup with **browser only** (Deploy → open URL → copy → Settings).
- `push-gateway/README.md` is the clear primary English guide for that path.
- CLI secret generation remains available but clearly Advanced.

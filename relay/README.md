# ETHOS Private Relay (Cloudflare Worker reference)

Secure-by-default reference **Nostr WebSocket relay** for ETHOS private mesh traffic  
(signaling kind `41002` and relay-data kind `41003`). Clients speak portable Nostr + auth — any host that implements the same contract works. This Worker is the recommended one-click path for non-experts.

## What it does

- Authenticates WebSocket upgrades via query `?token=` (preferred by ETHOS / `nostr-tools`) or `Authorization: Bearer`
- Accepts only ETHOS kinds (`41002`, `41003`) with payload size limits
- Short-lived in-DO event store (default **15 minutes** TTL) with REQ fan-out
- Rate limits EVENT frames (**120 / connection / minute** and **120 / token / minute**; reject if either exceeded; counters persist across DO hibernation)
- Never logs `event.content`
- Workers Observability is **disabled** by default (`relay/wrangler.toml`). If you enable it, request URLs (including `?token=`) can appear in Cloudflare logs — keep sampling off or very low.

It is a transport buffer, not a public archive. Defaults fail closed (no anonymous relay).

## One-click deploy (Cloudflare)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/aitherapp/ethos-core/tree/main/relay)

1. Click **Deploy to Cloudflare** and finish the Cloudflare wizard.
   - If you already deployed once, choose a **new project / repo name** (e.g. `ethos-relay2`). Reusing the same name fails because the KV namespace already exists.
2. Open your Worker **HTTPS URL** in the browser (shown after deploy, like `https://<name>.<account>.workers.dev`).
3. On the setup page, **copy the Relay URL (`wss://…`) and Auth token** immediately.
   - The auth token is shown **once**. Paste into ETHOS **before** clicking **I've saved this**.
   - Open the URL yourself right after deploy; do not share it until the token is saved.
4. In ETHOS → **Settings** → enable **private relay**, paste **Relay URL** and **Auth token**, then **Save Changes**.
5. Peers receive credentials over E2EE handoff after DHT discover + public bootstrap (see main ETHOS README).

### Advanced (CLI secrets)

Use only if you prefer Cloudflare Secrets instead of the setup page:

```bash
cd relay
npm install
# wrangler secret put AUTH_TOKEN
npx wrangler deploy
```

When `AUTH_TOKEN` is set, the setup page shows "Configured via Cloudflare Secrets" and does not reveal a token.

**Already deployed?** Do **not** click Deploy to Cloudflare again (it tries to create a new KV namespace and fails if the name exists). Update the existing Worker instead:

1. **Code update:** open your existing relay GitHub repo (created by the first one-click), pull or paste the latest `relay/` sources, then from that folder run `npm install && npx wrangler deploy`.
2. **New one-time bootstrap token:** in the existing `CONFIG` KV namespace, delete key `relay:config`, then open your Worker URL again.

## Wire protocol

| Direction | Frame | Notes |
|-----------|--------|-------|
| Client → relay | `["EVENT", event]` | Kind allowlist + size + rate limit; reply `["OK", id, true/false, msg]` |
| Client → relay | `["REQ", subId, ...filters]` | Supports `kinds`, `authors`, `ids`, `#d` (and other `#` tags), `limit` |
| Client → relay | `["CLOSE", subId]` | Drop subscription |
| Relay → client | `["EVENT", subId, event]` | Stored match or live fan-out |
| Relay → client | `["EOSE", subId]` | End of stored backlog for REQ |
| Relay → client | `["NOTICE", message]` | Errors / unsupported |

### Auth

Connect with:

```
wss://<your-worker>.workers.dev/?token=<auth-token>
```

Or send `Authorization: Bearer <auth-token>` on the upgrade request.

### Security defaults

1. **Auth token** required on WebSocket upgrade — no anonymous REQ/EVENT  
2. **Kind allowlist** — only `41002` and `41003`  
3. **Payload limit** — max event frame size 65536 bytes (UTF-8)  
4. **Rate limit** — 120 EVENT / connection / minute **and** 120 EVENT / token / minute (either exceeded → reject); sliding window persisted in DO storage across hibernation  
5. **TTL** — events expire after 15 minutes; store capped  
6. **No content logging** — never log `event.content` or tokens  
7. **Credentials** — one-click setup stores auth token in KV; Cloudflare Secret `AUTH_TOKEN` overrides when set  
8. **Observability** — disabled by default; enabling CF Workers Observability can capture `?token=` in request URLs — keep off or use a low sample rate  

## HTTP routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | no | `{ "ok": true }` |
| `GET` | `/` | no | Setup HTML (token shown once until claimed) |
| `POST` | `/v1/setup/claim` | Bearer | Mark bootstrap token as claimed |
| `GET` (Upgrade) | `/` or any path | token | WebSocket → Durable Object relay |

## Rotate secrets

1. `wrangler secret put AUTH_TOKEN` with a new value (or delete `relay:config` in KV and re-open `/`)  
2. Update the token in ETHOS Settings and re-handoff to peers / update widget embed attrs  

## Portable API

You do **not** have to use Cloudflare. Any `wss` service that implements authenticated Nostr frames with the security controls above can be pasted into ETHOS as the private relay URL.

## Local development

```bash
cd relay
npm install
# Optional: create .dev.vars (gitignored by wrangler convention)
npx wrangler dev
```

Example `.dev.vars`:

```
AUTH_TOKEN=dev-token-change-me
```

## License

Same as the ETHOS repository.

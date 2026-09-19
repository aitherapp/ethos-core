# ETHOS Push Gateway (Cloudflare Worker reference)

Secure-by-default reference implementation of the **ETHOS push-gateway HTTP API**.  
ETHOS clients talk only to this portable API — any host that implements the same routes works. This Worker is the recommended one-click path for non-experts.

## What it does

- Serves your **VAPID public key** for `PushManager.subscribe`
- **Registers** device push subscriptions under your auth token
- Accepts authenticated **`POST /v1/push`** and delivers Web Push to allowlisted vendor endpoints only

It never stores chat message bodies. Defaults fail closed (no open relay).

## One-click deploy (Cloudflare)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/aitherapp/ethos-core/tree/main/push-gateway)

Until `push-gateway/` lands on `main`, prefer the Wrangler CLI steps below (or retarget the button at the feature branch that contains this folder).

Or from this folder:

```bash
cd push-gateway
npm install
npx wrangler kv namespace create SUBSCRIPTIONS
# Paste the returned id into wrangler.toml [[kv_namespaces]] id=
npm run generate-secrets   # copy printed values — do not commit them
# set secrets as printed by the script
npx wrangler deploy
```

After deploy, copy the Worker **HTTPS URL** and your **AUTH_TOKEN** into ETHOS:

**Settings → Enable background push → Push gateway URL** (+ auth token as documented in the app).

## HTTP API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | no | Returns `ok` |
| `GET` | `/v1/vapid-public-key` | no | `{ "publicKey": "..." }` |
| `POST` | `/v1/subscriptions` | Bearer | Register `{ endpoint, keys }` |
| `DELETE` | `/v1/subscriptions` | Bearer | Unregister `{ endpoint, keys }` |
| `POST` | `/v1/push` | Bearer | Send notification (requires prior registration) |

### Security defaults

1. **Bearer `AUTH_TOKEN`** required on mutating routes  
2. **Host allowlist** — only known Web Push hosts (`web.push.apple.com`, `fcm.googleapis.com`, `updates.push.services.mozilla.com`, `push.services.mozilla.com`)  
3. **Registration binding** — push only to endpoints previously registered under the same token  
4. **Payload limits** — title ≤ 100, body ≤ 200, plain text only  
5. **Rate limit** — 30 pushes / token / minute  
6. **No body logging** — never log title, body, data, or subscription keys  
7. **Secrets** — VAPID private key + auth token only in Cloudflare Secrets  

## Rotate secrets

1. Run `npm run generate-secrets` again  
2. `wrangler secret put` for `AUTH_TOKEN`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`  
3. Update the token in ETHOS Settings and re-subscribe / re-register devices  

## Portable API

You do **not** have to use Cloudflare. Any HTTPS service that implements the routes above with the same security controls can be pasted into ETHOS as the push gateway URL.

## Local development

```bash
cd push-gateway
npm install
# Set secrets for local: create .dev.vars (gitignored by wrangler convention)
npx wrangler dev
```

Example `.dev.vars`:

```
AUTH_TOKEN=dev-token-change-me
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
```

## License

Same as the ETHOS repository.

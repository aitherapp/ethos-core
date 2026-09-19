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

1. Click **Deploy to Cloudflare** and finish the Cloudflare wizard.
   - If you already deployed once, choose a **new project / repo name** (e.g. `ethos-push-gw2`). Reusing the same name fails because the KV namespace already exists.
2. Open your Worker **HTTPS URL** in the browser (shown after deploy, like `https://<name>.<account>.workers.dev`).
3. On the setup page, **copy the Gateway URL and Auth token** immediately.
   - The auth token is shown **once**. Paste into ETHOS **before** clicking **I've saved this**.
   - Open the URL yourself right after deploy; do not share it until the token is saved.
4. In ETHOS → **Settings** → **OS Notifications**: enable **background push**, paste **Gateway URL** and **Auth token**, then **Save Changes**.
5. Use **Test gateway push**. A `502` with `upstream_failed` usually means re-save ETHOS settings (fresh subscription) or check Cloudflare **Logs → Live**.

### Advanced (CLI secrets)

Use only if you prefer Cloudflare Secrets instead of the setup page:

```bash
cd push-gateway
npm install
npm run generate-secrets
# wrangler secret put AUTH_TOKEN / VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
npx wrangler deploy
```

When all three secrets are set, the setup page shows "Configured via Cloudflare Secrets" and does not reveal a token.

**Already deployed?** Do **not** click Deploy to Cloudflare again (it tries to create a new KV namespace and fails if the name exists). Update the existing Worker instead:

1. **Quick secret-only fix** (e.g. VAPID subject for Chrome/FCM): Cloudflare Dashboard → Workers → your Worker → **Settings** → **Variables and Secrets** → add secret `VAPID_SUBJECT` = `mailto:you@example.com` (no full redeploy required for secrets; trigger a normal **Deploy** / **Retry deployment** from the Worker’s Deployments tab if the dashboard asks you to apply).
2. **Code update:** open your existing gateway GitHub repo (created by the first one-click), pull or paste the latest `push-gateway/` sources, then from that folder run `npm install && npx wrangler deploy` (updates the same Worker + existing KV binding).
3. **New one-time bootstrap token:** in the existing `SUBSCRIPTIONS` KV namespace, delete key `gateway:config`, then open your Worker URL again.

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
7. **Credentials** — one-click setup stores auth token + VAPID keys in KV; Cloudflare Secrets override when all three (`AUTH_TOKEN`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`) are set  


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

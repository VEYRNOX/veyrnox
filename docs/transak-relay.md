# Transak static-egress relay — runbook

**Status: ACTIVE on `veyrnox-prod` since 2026-09-21** (issue #2655, closed).
Host provisioned 2026-09-21. `TRANSAK_PROXY_BASE` and `TRANSAK_PROXY_SECRET`
are set, and production deployment `c32b2543` returns 200 with a real Transak
session URL from `/api/buy/session`. The relay answers `401` to requests
without the correct `x-proxy-secret`.

**Not verified:**
- widget launch and quote display on **web**. Native Buy was confirmed on iOS
  and Android by owner test on 2026-09-21; no artifact was captured. An
  automated web check from a UK machine is stopped by the deliberate UK block
  in `src/lib/buy/useBuyEnabled.js` (`Europe/London` timezone or a GB locale)
  before it reaches Transak.
- bounded 401 handling on the relay path
- Transak's written allowlist confirmation

**Known gaps:** no relay-side rate limit (only the Pages Function holds the
secret), no per-request logs, and no monitoring beyond `/healthz`. Staging is
still not relayed.

## Why this exists

Production Buy failed from ~2026-09-16 with `POST /api/v2/auth/session →
401 invalid_api_key`, while the same key worked on Transak's price API and the
same code worked on staging (issue #2655).

**Root cause, confirmed by Transak support (Harsh Shah, 2026-09-21):** our
Mandatory Security checklist, submitted 2026-08-31, left the **Backend IPs**
field without an address. Transak's partner APIs are gated on that allowlist —
*"any request from an unrecognised IP is blocked, even if the API key is
valid"* — so once they enforced it, every call from every source was refused.

We left it blank because the backend runs on **Cloudflare Pages Functions**,
which egress from Cloudflare's shared network and have **no static IP**. This
relay gives the two partner calls one stable source address.

## Architecture

```
app ──▶ veyrnox-prod.pages.dev/api/buy/session   (Pages Function, Cloudflare)
          │  upstreamUrlFor() rewrites ONLY the two partner endpoints
          ▼  HTTPS + x-proxy-secret
        transak-relay.veyrnox.com                (Caddy → Node, GCP VM)
          │  egress from static IP 34.56.200.9
          ▼
        api.transak.com / api-gateway.transak.com
```

Only two calls are relayed: `refresh-token` and `auth/session`. Everything else
(CORS, rate limiting, validation, `x-user-ip` from `CF-Connecting-IP`,
`x-api-key`, the widget hand-off) stays in `functions/api/buy/session.js`.

Code: `services/transak-proxy/server.mjs` (relay, zero dependencies) and
`upstreamUrlFor()` in `functions/api/buy/session.js` (PR #2656). With
`TRANSAK_PROXY_BASE` unset, `upstreamUrlFor()` returns the direct Transak URL
and the relay is bypassed entirely.

## Resources

| What | Value |
|---|---|
| GCP project | `veyrnox-wallet` |
| Region / zone | `us-central1` / `us-central1-a` |
| VM | `transak-relay` — `e2-micro`, Debian 12 |
| Static IP | `transak-relay-ip` → **`34.56.200.9`** (the address registered with Transak) |
| Firewall | `allow-transak-relay-web` — tcp 80, 443 to tag `transak-relay` |
| Hostname | `transak-relay.veyrnox.com` → A `34.56.200.9`, **DNS only (grey cloud)** |
| TLS | Caddy, automatic Let's Encrypt; ACME contact `support@veyrnox.com` |
| Service | systemd `transak-relay`, runs as unprivileged `relay` user |
| Cost | ~US$3–4/month (in-use static IP); e2-micro is free-tier-eligible |

**The DNS record must stay grey-cloud.** Proxying it through Cloudflare hides
the origin IP and breaks Caddy's certificate issuance; it also means the
address Transak sees would not be ours.

## Secrets

The relay authenticates the Pages Function with a shared secret (constant-time
compared). The **Transak partner secret is not stored on the relay** — it
arrives in the forwarded headers, so there is still exactly one copy of it (in
Cloudflare Pages).

| Where | Name | Value |
|---|---|---|
| VM | `/etc/transak-relay.env` → `PROXY_SHARED_SECRET` (mode 600) | shared secret |
| VM metadata | key `proxy-secret` | same value (source of the env file) |
| Cloudflare Pages `veyrnox-prod` | `TRANSAK_PROXY_SECRET` | same value |
| Dev machine | `~/.veyrnox/transak-proxy-secret` (mode 600) | same value |

Known residual: instance metadata is readable by anyone with read access to the
`veyrnox-wallet` project. Moving the secret to Secret Manager is the upgrade
path if that set of people grows.

## Activation

Only after DNS resolves **and** Caddy has issued a certificate:

```bash
curl -sS https://transak-relay.veyrnox.com/healthz      # want: {"ok":true}
```

Then set both values on the production Pages project and redeploy — Pages
Functions bake env at deploy time, so setting them alone changes nothing:

```bash
npx -y wrangler@4 pages secret put TRANSAK_PROXY_BASE --project-name veyrnox-prod
# value: https://transak-relay.veyrnox.com
npx -y wrangler@4 pages secret put TRANSAK_PROXY_SECRET --project-name veyrnox-prod
# value: contents of ~/.veyrnox/transak-proxy-secret
```

Redeploy by re-running the `Deploy Preview` workflow on `main` (it publishes
the production deployment). **Do not `wrangler pages deploy` from a worktree**
— that ships the worktree's branch to production.

Then send Transak the IP if not already done, and verify:

```bash
curl -sS -X POST https://veyrnox-prod.pages.dev/api/buy/session \
  -H 'Content-Type: application/json' \
  -d '{"asset":"ETH","network":"ethereum","address":"0x000000000000000000000000000000000000dEaD"}'
# want: {"url":"https://global.transak.com?apiKey=…&sessionId=…"}
```

## Operations

**Logs**

```bash
gcloud compute ssh transak-relay --zone us-central1-a --project veyrnox-wallet \
  --command 'sudo journalctl -u transak-relay -u caddy -n 100 --no-pager'
```

**Update the relay code** (after a change to `services/transak-proxy/server.mjs` merges):

```bash
git show origin/main:services/transak-proxy/server.mjs > /tmp/relay.mjs
gcloud compute instances add-metadata transak-relay --zone us-central1-a \
  --project veyrnox-wallet --metadata-from-file relay-js=/tmp/relay.mjs
gcloud compute instances reset transak-relay --zone us-central1-a --project veyrnox-wallet
```

The startup script re-fetches `relay-js` and `proxy-secret` on every boot.

**Rotate the shared secret** — all three copies must change together, or the
Pages Function gets `401 unauthorized` from the relay:

```bash
openssl rand -hex 32 > ~/.veyrnox/transak-proxy-secret
gcloud compute instances add-metadata transak-relay --zone us-central1-a \
  --project veyrnox-wallet --metadata-from-file proxy-secret=$HOME/.veyrnox/transak-proxy-secret
gcloud compute instances reset transak-relay --zone us-central1-a --project veyrnox-wallet
npx -y wrangler@4 pages secret put TRANSAK_PROXY_SECRET --project-name veyrnox-prod
# then redeploy production
```

**Rollback** — unset `TRANSAK_PROXY_BASE` on `veyrnox-prod` and redeploy.
`upstreamUrlFor()` falls back to calling Transak directly. Note that direct
calls will be rejected for as long as Transak enforces the IP allowlist, so
this is a rollback of the relay, not of the outage.

## Standing rules

- **The IP is registered with Transak.** If `transak-relay-ip` is released, or
  the VM moves region, Buy breaks the moment Transak's allowlist no longer
  matches. Any change to the address means resubmitting it to Transak first.
- **Staging is not relayed.** `veyrnox-staging` still calls Transak STAGING
  directly and works today. If Transak starts enforcing the allowlist on
  staging, register the same IP for staging and set the two env vars there.
- **This lives outside the repo's deploy path.** A merge to `main` does not
  update the VM. See *Update the relay code* above.
- **Declaration on Transak's side.** The Mandatory Security checklist records
  our backend IPs and integration type (see CLAUDE.md, Transak block). Changing
  where the backend runs, or how the widget opens, means resubmitting it.

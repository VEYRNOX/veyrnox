## Global Constraints

- Node 22, npm 11 (match existing CI).
- `npm install --legacy-peer-deps` (match existing CI).
- `VITE_ENV_LABEL` must be set to `"Staging"` for preview builds so the `EnvBadge` component renders visibly — production (main) deploys must NOT set it.
- `VITE_WALLETCONNECT_PROJECT_ID` must be injected (match existing CI).
- Never set `VITE_RELEASE=1` for staging (no obfuscation — debugging must be possible).
- Never set `VITE_DEMO_MODE=1` for staging (staging must mirror real behavior).
- Supabase env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are NOT injected into staging builds — staging must not write to production Supabase (I2/I3 safety).
- The `prebuild` script (`node scripts/bundle-trezor-connect.mjs`) runs automatically via npm's `prebuild` hook when `npm run build` is called — do not invoke it separately.

### Task 1: Cloudflare Pages Project Setup & Wrangler Config

**Files:**
- Create: `wrangler.toml`
- Create: `public/_headers`
- Modify: `.gitignore` (add wrangler artifacts)

**Interfaces:**
- Consumes: nothing
- Produces: `wrangler.toml` config consumed by the deploy workflow (Task 2). `public/_headers` sets security headers on the deployed site.

- [ ] **Step 1: Create `wrangler.toml`**

```toml
# Cloudflare Pages deployment config.
# Project must be created first: `npx wrangler pages project create veyrnox-staging`
name = "veyrnox-staging"

[pages]
build_output_dir = "dist"
```

- [ ] **Step 2: Create `public/_headers`**

Cloudflare Pages serves `_headers` from the build output. Vite copies `public/` into `dist/` at build time.

```
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://*.walletconnect.com wss://*.walletconnect.com https://*.walletconnect.org wss://*.walletconnect.org; font-src 'self' data:; frame-ancestors 'none'
```

- [ ] **Step 3: Add wrangler artifacts to `.gitignore`**

Append to the existing `.gitignore`:

```
# Wrangler (Cloudflare Pages CLI)
.wrangler/
```

- [ ] **Step 4: Create the Cloudflare Pages project**

This is a one-time manual step. The repo owner runs:

```bash
npx wrangler pages project create veyrnox-staging --production-branch main
```

Then adds these GitHub Actions secrets:
- `CLOUDFLARE_ACCOUNT_ID` — from Cloudflare dashboard → Account ID
- `CLOUDFLARE_API_TOKEN` — API token with `Cloudflare Pages:Edit` permission

- [ ] **Step 5: Commit**

```bash
git add wrangler.toml public/_headers .gitignore
git commit -m "chore: add Cloudflare Pages config and security headers"
```

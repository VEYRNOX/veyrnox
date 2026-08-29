# TIP_SIGNING_SECRET rotation runbook

Owner-only. Rotates the HMAC signing secret shared between the Cloudflare
Worker (`veyrnox-tip`) and the two Supabase Edge Functions (`tip-chat`,
`tip-screen`) on both `veyrnox-prod` and `veyrnox-staging`.

Trigger: the current production value was leaked in git history via commit
`d8125e85` (2026-08-06), scrubbed at HEAD by `30919d6b` (2026-08-11) but never
rotated. History-leaked secrets stay recoverable from any anonymous clone;
rotation is the only containment. See STRIX retest 2026-08-29.

## Preconditions

- Cloudflare account access with `wrangler` authenticated (`npx wrangler whoami`).
- Supabase CLI logged in with owner role on both projects
  (`npx supabase@latest projects list`).
- Access to the operations password store to record the new value.
- No in-flight PR touching `supabase/functions/tip-chat`,
  `supabase/functions/tip-screen`, or the `veyrnox-tip` worker repo — those
  files' signing logic must not move during rotation.

## Steps (execute in order, do not skip)

Generate the new secret and stash it in the ops password store BEFORE any
system flip:

```bash
NEW=$(openssl rand -hex 32); echo "$NEW"
```

Look up the CURRENT live API key on BOTH worker environments. Prod and
staging are SEPARATE worker deployments (`tip.veyrnox.com` and
`veyrnox-tip-staging.al-jobson.workers.dev`), each with its own D1 binding
declared in the `veyrnox-tip` repo's `wrangler.toml`. Rotating one and not
the other leaves the other side broken. Substitute the exact D1 binding names
from that repo (e.g. `veyrnox_tip_prod`, `veyrnox_tip_staging`).

The key `vtip_82524a703712279fc6affac1320575d6` was revoked at scrub time
(2026-08-11) and is dead — a UPDATE against it rotates nothing. Find the
active row (confirm against Supabase secret `TIP_API_KEY` on each project,
which the Edge Functions actually send):

Add `--env production` / `--env staging` to EVERY `wrangler d1 execute`
call below if the `veyrnox-tip` repo's `wrangler.toml` uses `[env.*]`
sections (check first). Without the qualifier every call hits the default
env — you can read/update prod twice and never touch staging.

```bash
# PROD worker
npx wrangler d1 execute <prod-d1-binding> --remote [--env production] \
  --command "SELECT api_key, created_at FROM api_keys WHERE revoked_at IS NULL ORDER BY created_at DESC"
LIVE_KEY_PROD=<paste the live vtip_… value>

# STAGING worker
npx wrangler d1 execute <staging-d1-binding> --remote [--env staging] \
  --command "SELECT api_key, created_at FROM api_keys WHERE revoked_at IS NULL ORDER BY created_at DESC"
LIVE_KEY_STAGING=<paste the live vtip_… value>
```

Update BOTH Cloudflare Worker D1 rows — verifier side. Edge Functions
still sign with the OLD value at this point, so requests MUST fail here.
Client-visible status will be `502 tip_upstream_error` (not 401) because
`tip-screen` maps every non-2xx upstream response to 502; the underlying
Worker rejection is 401. This 502 window is expected; do not roll back on it.

If the `veyrnox-tip` repo uses `[env.staging]` in its `wrangler.toml`, add
`--env staging` to the staging call (and `--env production` to the prod
call if that env exists) so wrangler resolves the env-specific D1 binding.
Without the qualifier, both calls hit the default env and staging is
never rotated.

```bash
# PROD
npx wrangler d1 execute <prod-d1-binding> --remote [--env production] \
  --command "UPDATE api_keys SET signing_secret='$NEW' WHERE api_key='$LIVE_KEY_PROD'"
# STAGING
npx wrangler d1 execute <staging-d1-binding> --remote [--env staging] \
  --command "UPDATE api_keys SET signing_secret='$NEW' WHERE api_key='$LIVE_KEY_STAGING'"
```

(If both environments happen to share one D1 database — confirm in the
`veyrnox-tip` repo's `wrangler.toml` — run the UPDATE once. Verify before
skipping the second call.)

Flip Supabase Edge Function secret on production:

```bash
npx supabase@latest secrets set TIP_SIGNING_SECRET=$NEW \
  --project-ref jwstkrtslotnjyerzzsi
```

Flip Supabase Edge Function secret on staging:

```bash
npx supabase@latest secrets set TIP_SIGNING_SECRET=$NEW \
  --project-ref nszlbcmcysftwyudthjz
```

No Cloudflare Pages redeploy needed. `TIP_SIGNING_SECRET` is consumed only
by the Supabase Edge Functions (`supabase/functions/tip-chat/index.ts`,
`supabase/functions/tip-screen/index.ts`); the client-side bundle explicitly
refuses `VITE_TIP_SIGNING_SECRET` (see `src/api/tipScreen.js`). Supabase Edge
Function secrets take effect on the next function invocation — no deploy step.
(The 2026-08-10 Pages hot-propagate lesson applied to `SUPABASE_ANON_KEY` in
Pages Functions, a different code path.)

## Verification

Verify via `tip-screen`, not `tip-chat`. `tip-chat` has a separate open issue
for Safety Plus subscribers (#1850) — a rotation-unrelated 401/5xx there
would falsely signal rotation failure. `tip-screen` shares the same HMAC path
with no such caveat.

- Hit Security Advisor address screening from prod client — expect 200 with
  a screening verdict.
- Verify staging via a native mobile build pointed at the staging Supabase
  project (or `npm run dev` from an allowlisted localhost origin). The
  Supabase `Authorization`/`apikey` header is REQUIRED (`tip-screen`
  returns 401 if both are absent); an `Origin` header is optional
  (`tip-screen` allows no-Origin requests — Capacitor native sends none —
  but if an Origin IS present it must be in `DEFAULT_ALLOWED_ORIGINS`).
  Do NOT verify by loading `https://veyrnox-staging.pages.dev` in a
  browser: that origin is not allowlisted and requests will 403
  (`origin_not_allowed`) before the HMAC path runs. Do NOT verify with a
  bare `curl` that omits the Supabase auth header (→ 401 before HMAC).
  Either would falsely fail a correct rotation.
- Optionally also try `tip-chat`; success is a bonus signal, failure is
  inconclusive (see #1850).
- If 502 persists past first request after BOTH Supabase secret flips
  completed: `supabase secrets list` shows names only, not values, so it
  cannot confirm the plaintext matches D1. Instead re-run BOTH `supabase
  secrets set` commands from Steps above (idempotent), then repeat the
  screening probe. If 502 STILL persists, the wrong `LIVE_KEY` row was
  updated in D1 — SELECT the row again and confirm against what the Edge
  Function sends as `X-Api-Key` (a bad LIVE_KEY presents as 502 to the
  client, same as a bad signature — both come from `tip-screen`'s non-2xx
  → 502 mapping).

## Rollback

Only if verification fails on BOTH environments simultaneously (indicates D1
write bad or wrong `LIVE_KEY`). Record the OLD value from the ops password
store as `OLD=…`, then:

```bash
npx wrangler d1 execute <prod-d1-binding> --remote [--env production] \
  --command "UPDATE api_keys SET signing_secret='$OLD' WHERE api_key='$LIVE_KEY_PROD'"
npx wrangler d1 execute <staging-d1-binding> --remote [--env staging] \
  --command "UPDATE api_keys SET signing_secret='$OLD' WHERE api_key='$LIVE_KEY_STAGING'"
npx supabase@latest secrets set TIP_SIGNING_SECRET=$OLD --project-ref jwstkrtslotnjyerzzsi
npx supabase@latest secrets set TIP_SIGNING_SECRET=$OLD --project-ref nszlbcmcysftwyudthjz
```

Rollback restores the LEAKED value. Treat as short-term only; re-attempt
rotation same day.

## Post-rotation

- Record new value in ops password store with rotation date.
- Update `docs/SecurityAdvisor-TIP-integration.md` "Last rotated:" line.
- Close STRIX finding "TIP HMAC signing secret recoverable from public git
  history" with the rotation commit SHA + verification timestamp.
- Companion API key `vtip_82524a703712279fc6affac1320575d6` was revoked at
  scrub time (confirmed dead 2026-08-11); no action needed.

## Do NOT

- Do NOT rewrite git history to remove the leaked value. Rotation contains
  the leak; history rewrite is optional hygiene AFTER rotation and coordinates
  poorly with the 10+ live worktrees (CLAUDE.md).
- Do NOT rotate the API key at the same time. One moving part at a time —
  API key rotation requires a separate D1 row swap plus client-side coordination.
- Do NOT flip Supabase secrets before D1. Reversed order gives a longer
  outage window because clients retry against a verifier that still expects
  the OLD signature.

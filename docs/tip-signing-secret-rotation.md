# TIP_SIGNING_SECRET rotation runbook

Owner-only. Rotates the HMAC master signing secret shared between the
Cloudflare Workers in the `veyrnox-tip` repo and the two Supabase Edge
Functions (`tip-chat`, `tip-screen`).

**Worker side names it `API_SIGNING_SECRET`. Supabase side names it
`TIP_SIGNING_SECRET`. Same value, different name.**

## Mechanism

The Worker verifier accepts up to two roots — `API_SIGNING_SECRET` (master)
and `API_SIGNING_SECRET_PREVIOUS` (optional overlap). Rotation is
zero-downtime: set PREVIOUS to OLD, flip master to NEW, flip Supabase to
NEW, remove PREVIOUS. See `src/lib/auth.ts` `verificationRoots` for the
verifier logic.

Trigger: any known or suspected compromise of `API_SIGNING_SECRET`, or on
a scheduled rotation cadence.

## Preconditions

- Cloudflare `npx wrangler whoami` authenticated with `workers` write scope.
- Supabase owner role on both projects (`jwstkrtslotnjyerzzsi` prod,
  `nszlbcmcysftwyudthjz` staging). Personal access token available.
- `veyrnox-tip` repo checkout — commands run from its root so
  `wrangler.toml` resolves.
- OLD value in hand (from ops password store, or the leaked value if
  rotating after disclosure).
- No in-flight PR touching `src/lib/auth.ts` in the `veyrnox-tip` repo, or
  `supabase/functions/tip-chat/index.ts` / `tip-screen/index.ts` in the
  main app repo.

## Deployments to rotate

There are THREE Worker deployments and BOTH environments must be rotated
together. Skipping one leaves the leaked value live on that surface.

- `veyrnox-tip` (default, no `--env` flag) — shares D1 with production
- `veyrnox-tip-staging` (`--env staging`)
- `veyrnox-tip-production` (`--env production`)

And BOTH Supabase Edge Function stores:

- `jwstkrtslotnjyerzzsi` — production
- `nszlbcmcysftwyudthjz` — staging

## Steps

Generate the new secret and stash it BEFORE touching anything:

```bash
NEW=$(openssl rand -hex 32)
```

Save `$NEW` in the ops password store immediately. Losing it mid-rotation
= no rollback path without a DB restore. Record its fingerprint too
(`echo -n "$NEW" | shasum -a 256 | cut -c1-16`) — the marker in
`docs/SecurityAdvisor-TIP-integration.md` uses the fingerprint, never the
value.

### Phase 1: set PREVIOUS to OLD on all three workers (safe, additive)

Verifier now accepts BOTH master and previous. Nothing changes for callers.

```bash
cd /path/to/veyrnox-tip
echo "$OLD" | npx wrangler secret put API_SIGNING_SECRET_PREVIOUS --env staging
echo "$OLD" | npx wrangler secret put API_SIGNING_SECRET_PREVIOUS --env production
echo "$OLD" | npx wrangler secret put API_SIGNING_SECRET_PREVIOUS
```

The bare command (no `--env`) targets the default deployment. Wrangler
prints a warning about the missing env flag — expected; the default
deployment is a real Worker and needs the same rotation.

### Phase 2: flip master to NEW on all three workers

Verifier now accepts NEW (master) + OLD (previous). Callers still signing
with OLD stay working via the previous root.

```bash
echo "$NEW" | npx wrangler secret put API_SIGNING_SECRET --env staging
echo "$NEW" | npx wrangler secret put API_SIGNING_SECRET --env production
echo "$NEW" | npx wrangler secret put API_SIGNING_SECRET
```

### Phase 3: flip TIP_SIGNING_SECRET on both Supabase projects

Supabase Edge Functions now sign with NEW.

```bash
export SUPABASE_ACCESS_TOKEN=<owner PAT>
for REF in jwstkrtslotnjyerzzsi nszlbcmcysftwyudthjz; do
  curl -sS -X POST https://api.supabase.com/v1/projects/$REF/secrets \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d "[{\"name\":\"TIP_SIGNING_SECRET\",\"value\":\"$NEW\"}]" \
    -w "\n$REF http=%{http_code}\n"
done
```

Expect `http=201` on both.

**Warm-isolate trap:** Supabase Edge Function isolates snapshot
environment at boot. A warm isolate will keep serving with the OLD value
until it evicts (~minutes) or is redeployed. If verification below fails
with 502, force a fresh isolate by redeploying without source changes:

```bash
for REF in jwstkrtslotnjyerzzsi nszlbcmcysftwyudthjz; do
  for FN in tip-screen tip-chat; do
    npx supabase@latest functions deploy $FN --project-ref $REF --use-api
  done
done
```

Both functions read `TIP_SIGNING_SECRET`; redeploy both on both projects,
not just the one that failed the probe. Skipping the staging `tip-chat`
redeploy will leave a warm chat isolate signing with OLD, and once
Phase 5 removes `API_SIGNING_SECRET_PREVIOUS` those requests start 502ing
until the isolate happens to evict. On the 2026-08-29 rotation, staging
`tip-screen` was the one that surfaced the trap; the other three isolates
happened to be cold, but the runbook cannot rely on that pattern.

### Phase 4: verify

Probe both environments via the Supabase Edge Function endpoint. Owner
PAT works as the bearer for the `functions/v1/*` call because it inherits
the project's anon key acceptance:

```bash
export SUPABASE_ACCESS_TOKEN=<owner PAT>
for REF in jwstkrtslotnjyerzzsi nszlbcmcysftwyudthjz; do
  ANON=$(curl -sS https://api.supabase.com/v1/projects/$REF/api-keys \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    | jq -r '.[] | select(.name=="anon") | .api_key')
  STATUS=$(curl -sS -o /dev/null -w "%{http_code}" \
    -X POST "https://$REF.supabase.co/functions/v1/tip-screen" \
    -H "Authorization: Bearer $ANON" -H "apikey: $ANON" \
    -H "Content-Type: application/json" \
    -d '{"chain":"ethereum","action_type":"address_lookup","from_address":"0x0000000000000000000000000000000000000000","to_address":"0xdead000000000000000000000000000000000000"}')
  echo "$REF: $STATUS"
done
```

Expect both `200`. Then probe `tip-chat` on both projects too — it
signs upstream requests with the same `TIP_SIGNING_SECRET` and shares
the warm-isolate failure mode; skipping it means the rotation can be
declared complete while chat still 502s:

```bash
for REF in jwstkrtslotnjyerzzsi nszlbcmcysftwyudthjz; do
  ANON=$(curl -sS https://api.supabase.com/v1/projects/$REF/api-keys \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    | jq -r '.[] | select(.name=="anon") | .api_key')
  STATUS=$(curl -sS -o /dev/null -w "%{http_code}" \
    -X POST "https://$REF.supabase.co/functions/v1/tip-chat" \
    -H "Authorization: Bearer $ANON" -H "apikey: $ANON" \
    -H "Content-Type: application/json" \
    -d '{"messages":[{"role":"user","content":"ping"}],"context":{"current_screen":"dashboard"}}')
  echo "$REF tip-chat: $STATUS"
done
```

Expect both `200`. A 502 here is the same signing-path failure as on
`tip-screen`; the fact that `tip-chat` has an unrelated open bug for
Safety Plus subscribers (#1850) is not an excuse to skip the probe — that
bug shows up as a specific error body, not as auth/upstream 502, so a
2xx here is still a valid rotation proof.

If either returns `502`, that is `tip_upstream_error` — the Edge Function
mapped a non-2xx from the Worker to 502. Diagnose via
`npx wrangler tail <worker-name> --format json` on the veyrnox-tip repo
side. Cases:

- Worker returned 401 → signature or api-key mismatch. Check the Supabase
  side has the NEW value stored (fingerprint via
  `curl .../secrets | jq '.[] | select(.name=="TIP_SIGNING_SECRET") | .value[0:16]'`
  — the API returns a hash, not the plaintext).
- Isolate not warmed with new env → redeploy the function (see Phase 3).

### Phase 5: remove PREVIOUS to close the rotation

Verifier now only accepts NEW. Leaked value is dead.

```bash
cd /path/to/veyrnox-tip
npx wrangler secret delete API_SIGNING_SECRET_PREVIOUS --env staging
npx wrangler secret delete API_SIGNING_SECRET_PREVIOUS --env production
npx wrangler secret delete API_SIGNING_SECRET_PREVIOUS
```

Answer `y` at each prompt. Re-run the Phase 4 probe once more to confirm
both envs still return `200` with only the new root live.

## Rollback

Only if Phase 4 fails on BOTH environments after redeploy. Restore OLD as
master on all three workers, and re-set the Supabase secret to OLD:

```bash
cd /path/to/veyrnox-tip
echo "$OLD" | npx wrangler secret put API_SIGNING_SECRET --env staging
echo "$OLD" | npx wrangler secret put API_SIGNING_SECRET --env production
echo "$OLD" | npx wrangler secret put API_SIGNING_SECRET

export SUPABASE_ACCESS_TOKEN=<owner PAT>
for REF in jwstkrtslotnjyerzzsi nszlbcmcysftwyudthjz; do
  curl -sS -X POST https://api.supabase.com/v1/projects/$REF/secrets \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d "[{\"name\":\"TIP_SIGNING_SECRET\",\"value\":\"$OLD\"}]"
done
```

Rollback restores the potentially-compromised OLD value. Treat as
short-term only; re-attempt rotation same day.

## Post-rotation

- Record NEW in ops password store with rotation date (already done in
  the "before touching anything" step).
- Update `TIP_SIGNING_SECRET last rotated:` line at
  `docs/SecurityAdvisor-TIP-integration.md` with date + fingerprint (NOT
  the value).
- Close the STRIX finding with the rotation commit SHA + Phase 4 probe
  output.
- Revoke the Supabase PAT used for the rotation.

## Do NOT

- Do NOT update D1 `api_keys.signing_secret` — that column does not exist.
  The prior version of this runbook was wrong. The signing secret is a
  Worker environment variable set via `wrangler secret put`, not a D1 row.
  Per-key derivation reads `key_hash` from `api_keys` but the master root
  is env, not DB. See `veyrnox-tip/src/lib/auth.ts:98-100`.
- Do NOT rewrite git history to remove the leaked value. Rotation contains
  the leak; history rewrite is optional hygiene AFTER rotation and
  coordinates poorly with the many active worktrees.
- Do NOT rotate the API key at the same time. One moving part at a time.
- Do NOT skip the default `veyrnox-tip` deployment (no `--env` flag).
  Supabase Edge Function `TIP_BASE_URL` may point at it for either
  environment; rotating only the named envs leaves that one on OLD.

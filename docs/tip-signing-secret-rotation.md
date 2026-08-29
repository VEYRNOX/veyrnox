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

Update Cloudflare Worker D1 first — the verifier side. The Edge Functions
still sign with the OLD value at this point, so `/chat` MUST fail here (401).
That is expected; do not roll back on this signal.

```bash
npx wrangler d1 execute veyrnox-tip --remote \
  --command "UPDATE api_keys SET signing_secret='$NEW' WHERE api_key='vtip_82524a703712279fc6affac1320575d6'"
```

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

Force a fresh Cloudflare Pages deploy on both projects. Pages secret updates
do NOT hot-propagate to running Pages Functions — takes effect only on next
deployment (see CLAUDE.md 2026-08-10 lesson):

```bash
npx wrangler pages deploy dist --project-name veyrnox-prod    --branch main
npx wrangler pages deploy dist --project-name veyrnox-staging --branch main
```

## Verification

- Hit Security Advisor chat from prod client — expect 200 + streamed response.
- Hit Security Advisor chat from staging client — expect 200.
- If 401 persists past 60s after Pages redeploy: check Supabase Edge Function
  secret store matches D1 exactly (`npx supabase@latest secrets list` on both
  refs) and re-issue the Pages deploy.

## Rollback

Only if verification fails on BOTH environments simultaneously (indicates D1
write bad, not a Pages cache issue). Record the OLD value from the ops
password store as `OLD=…`, then:

```bash
npx wrangler d1 execute veyrnox-tip --remote \
  --command "UPDATE api_keys SET signing_secret='$OLD' WHERE api_key='vtip_82524a703712279fc6affac1320575d6'"
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

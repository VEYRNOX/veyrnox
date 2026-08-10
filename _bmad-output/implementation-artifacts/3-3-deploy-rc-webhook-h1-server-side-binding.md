---
story_id: 3.3
story_key: 3-3-deploy-rc-webhook-h1-server-side-binding
epic: 3
status: ready-for-dev
created: 2026-08-09
---

# Story 3.3 — Deploy RC webhook (H-1 server-side `rc_user_id` binding)

## User story

**As** the platform engineer
**I want** a RevenueCat webhook handler that verifies signatures and calls `set_referral_rc_user()` with `service_role`
**So that** the referral bonus chain functions end-to-end without the client being able to forge `rc_user_id`

## Why this exists

H-1 (internal audit 2026-07-28) removed `p_rc_user_id` from client-callable `generate_referral_code` / `register_referral_code`. Until the webhook lands, `referrals.rc_user_id` stays NULL on every row, `check_first_referral_bonus` returns NULL, `first-referral-bonus` Edge Function short-circuits on `not_eligible`, and **no referral bonus is ever granted** (fail-closed, I4).

**This story is the load-bearing dependency for Epic 3 (IAP + Referral E2E on Production).** Nothing in E3 works end-to-end without it.

## Acceptance criteria

### AC-1 — New Edge Function `rc-webhook`

- New file: `supabase/functions/rc-webhook/index.ts`
- Endpoint: `POST https://<project>.supabase.co/functions/v1/rc-webhook`
- Deploys via `supabase functions deploy rc-webhook --no-verify-jwt`. RC sends only its shared secret in `Authorization`, not a Supabase-signed JWT; with platform JWT verification enabled the gateway rejects every webhook before AC-2's secret check runs. Fail-closed posture is preserved by AC-2 (missing/wrong secret → 401; missing env var → 500).
- Env vars used (all in Supabase dashboard → Edge Functions → Secrets):
  - `SUPABASE_URL` (auto)
  - `SUPABASE_SERVICE_ROLE_KEY` (auto) — used for the RPC call
  - `REVENUECAT_WEBHOOK_AUTHORIZATION` — the shared Bearer secret configured on the RC dashboard's webhook page (**NOT** the same value as `REVENUECAT_V1_SECRET_KEY`, which is the RC REST API secret used by `first-referral-bonus`)

### AC-2 — Signature / authorization verification (fail-closed)

- Read `Authorization` header from the incoming request
- Compare against `REVENUECAT_WEBHOOK_AUTHORIZATION` using **timing-safe** comparison (Deno `crypto.subtle` or a hand-rolled constant-time compare — never `===` on the raw string)
- Missing header → `401 unauthorized`
- Wrong value → `401 unauthorized`
- Missing `REVENUECAT_WEBHOOK_AUTHORIZATION` env var → `500 misconfigured` and log; do **NOT** fall through to "accept anonymous"
- Non-`POST` → `405 method_not_allowed`
- Body larger than 32 KB → `413 payload_too_large` (defensive cap; RC events are ≤ ~4 KB)

### AC-3 — Resolve referrer code from RC event

RC event shape: `{ event: { type, app_user_id, subscriber_attributes, ... } }`.

- Accept only events where `event.type ∈ { "INITIAL_PURCHASE", "NON_RENEWING_PURCHASE" }` — every other type (RENEWAL, CANCELLATION, BILLING_ISSUE, ...) returns `200 ignored` and writes nothing
- Extract referrer code from `event.subscriber_attributes.referralCode.value`. This matches the existing client, which writes `referralCode` via `setReferralAttributes` in `src/lib/purchases.js:299`. Do NOT rename to `$referral_code` or `veyrnox_referral_code` without a matching client change in the same story — a mismatch silently routes every real purchase through the `no_code` path and referral bonuses never fire.
- If no code present → `200 no_code` (this is the majority of purchases; it is not an error)
- If code present but does not match `/^[A-Z0-9]{6,12}$/` → `400 bad_code`

### AC-4 — Call the SQL setter with `service_role`

- Instantiate Supabase client with `SUPABASE_SERVICE_ROLE_KEY`
- Call `set_referral_rc_user(p_code := <code>, p_rc_user_id := event.app_user_id)`
- On success → `200 ok`
- Error `P0009` (null args) → `400 bad_request` — should not happen given AC-3 filters
- Error `P0010` (rc_user_id > 128 chars) → `400 bad_rc_user_id`
- Any other DB error → `500` with generic message to caller, full detail logged server-side (do NOT leak PG error text to the caller)

### AC-5 — Idempotency + first-writer-wins semantics preserved

- `set_referral_rc_user` is already first-writer-wins by SQL — a repeated webhook is a no-op UPDATE
- The Edge Function must **not** short-circuit on "already bound" — always call the SQL and return `200 ok` when the SQL succeeds, whether it wrote 0 rows or 1
- Duplicate RC events (RC retries on 5xx) must therefore be safe by construction

### AC-6 — Rate limit

- Independent rate limit from `first-referral-bonus`
- 100 requests / minute / IP at the Edge Function boundary (guards against amplification if RC's origin is spoofed and the shared secret leaks)
- Return `429` with `Retry-After: 60` when exceeded
- Implementation: in-memory (per-worker) is acceptable — this is a smoothing bound, not a security control; the real security control is the shared-secret check in AC-2

### AC-7 — Wire RC dashboard

- In RevenueCat dashboard → Project → Integrations → Webhooks:
  - URL: `https://<project>.supabase.co/functions/v1/rc-webhook`
  - Authorization header: value of `REVENUECAT_WEBHOOK_AUTHORIZATION`
- Send a test event from the dashboard → 200 ok
- Screenshot + timestamp logged to `docs/play-launch/rc-webhook-deploy.md`

### AC-8 — Tests

New test file: `supabase/functions/rc-webhook/__tests__/rc-webhook.test.ts` (Deno test runner). At minimum:

1. `missing Authorization → 401`
2. `wrong Authorization → 401` (verify constant-time compare via a wrong-length string)
3. `GET /rc-webhook → 405`
4. `payload > 32 KB → 413`
5. `event.type = "RENEWAL" → 200 ignored, no DB write`
6. `event without referral code → 200 no_code, no DB write`
7. `event with malformed code → 400 bad_code`
8. `valid event → 200 ok, SQL called with correct args` (mock the Supabase client)
9. `duplicate event → 200 ok on both calls` (first-writer-wins verified via mock)
10. `rate limit exceeded → 429`

### AC-9 — End-to-end proof against production

- Deploy to production Supabase (not staging — this is the whole point of the story)
- Fire a real `INITIAL_PURCHASE` event from a test purchase (can be the S3.1 smoke-test purchase)
- Verify `referrals.rc_user_id` populated for that referrer
- Owner query result logged to `docs/play-launch/rc-webhook-deploy.md`

## Files to touch

**NEW:**
- `supabase/functions/rc-webhook/index.ts` (handler)
- `supabase/functions/rc-webhook/__tests__/rc-webhook.test.ts`
- `docs/play-launch/rc-webhook-deploy.md` (evidence log)

**UPDATE — none.** SQL setter (`sql/referral-rc-webhook.sql`) is already in place and does not need re-running unless a fresh env; if so, run per FR-6.1 ordering in the PRD.

**READ (do not modify, but must be understood):**
- `supabase/functions/first-referral-bonus/index.ts` — mirror its posture on env vars, error shapes, response format, CORS handling; same repo, same reviewer expectations
- `sql/referral-rc-webhook.sql` — the SQL setter this function calls
- `sql/first-referral-bonus.sql` — the `check_first_referral_bonus` claim path that becomes live once `rc_user_id` is populated

## Developer context

### Repo conventions the dev must honor

- **I1–I6 apply.** In particular I4 (fail closed) — every branch that cannot proceed must return an error status, never fall through to "accept".
- **No `console.log` of PII or secrets.** Log the event type, presence-or-absence of code (not the code itself), and the outcome. Never log `app_user_id` or `Authorization` values.
- **Never leak PG error text to the caller.** Wrap in a generic message. Log the raw error server-side.
- **CORS.** Match `first-referral-bonus`'s CORS handling — same `ALLOWED_ORIGINS` handling if a preview environment needs to hit it, but RC's callers do not need CORS at all (webhooks are server-to-server). Default to no CORS; add only if a real caller needs it.

### Timing-safe compare in Deno

Use `crypto.subtle.timingSafeEqual` if available in the deployed Deno version, else a manual constant-time loop over `TextEncoder().encode(a)` and `.encode(b)` — DO NOT return early on length mismatch (compare hashes of both strings so length itself is not a side channel; or accept the length side channel and document it — either is defensible for a shared-secret compare, opinions welcome).

### Ordering vs the SQL side

The SQL setter (`sql/referral-rc-webhook.sql`) is already deployed on production (per CLAUDE.md's 2026-07-28 wave — SQL is code-only, hasn't run yet in a fresh env). Verify with:

```sql
SELECT proname, prosrc IS NOT NULL FROM pg_proc WHERE proname = 'set_referral_rc_user';
```

If it returns no row, run `sql/referral-rc-webhook.sql` in Supabase SQL Editor BEFORE deploying the Edge Function.

### What "done" looks like for the dev agent

- All 10 tests in AC-8 green locally under `deno test`
- `supabase functions deploy rc-webhook` succeeds against production
- RC dashboard webhook sends a test event → 200 ok in Edge Function logs
- One real production event verified per AC-9
- `docs/play-launch/rc-webhook-deploy.md` updated with deploy SHA, timestamps, test-event screenshot, real-event owner query result

## Out of scope

- Any change to `first-referral-bonus/index.ts`
- Any change to `sql/*` — SQL is already in place
- Any change to client code — H-1 client-side removal already landed in the 2026-07-28 wave
- Backfill of existing referrals with NULL `rc_user_id` — the only referrals in production are test rows, they will be superseded by real users

## Open questions

- [Q1] Should we also handle `RENEWAL` events? No, per current design — the referral bonus is a first-purchase event only. Confirm with owner before writing test #5.

## Risks

- **Shared-secret leak.** If `REVENUECAT_WEBHOOK_AUTHORIZATION` leaks, an attacker can bind arbitrary RC users to arbitrary referral codes. Mitigation: rate limit + first-writer-wins limits blast radius, but a rotation runbook should exist. Add to `docs/play-launch/rc-webhook-deploy.md`.
- **RC event replay across projects.** If Veyrnox has staging + production RC projects sharing the same secret (do NOT do this), events from staging can bind rc_user_ids in prod. Each env must have its own secret.
- **First-writer-wins hides bugs.** If the attribute name is wrong AC-3 and events silently `200 no_code` for months, we discover it only when the first bonus fails to fire. Log a metric (count of `no_code` vs `ok` responses) so this is visible in the Edge Function logs.

## Status

`ready-for-dev` — comprehensive context loaded. Only [Q1] (RENEWAL handling) remains for the dev agent to confirm with owner.

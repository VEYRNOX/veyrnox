# RC webhook deploy log (H-1 remediation)

**Story:** [3.3 — Deploy RC webhook](../../_bmad-output/implementation-artifacts/3-3-deploy-rc-webhook-h1-server-side-binding.md)

**Purpose:** Bind `referrals.rc_user_id` server-side from verified RevenueCat events. Until this handler is deployed, `check_first_referral_bonus()` returns NULL for every code and the referral bonus path is inert (I4 fail-closed).

## Design decisions (baked in)

| Q | Decision | Rationale |
|---|---|---|
| Q1 attribute name | `veyrnox_referral_code` (free-form, no `$` prefix) | Avoids collision with RC's well-known-attribute reserved namespace. Client sets it via RC SDK `setAttributes({ veyrnox_referral_code: '<code>' })`. |
| Q2 renewal handling | `INITIAL_PURCHASE` + `NON_RENEWING_PURCHASE` only | Referral bonus is first-purchase only. RENEWAL / CANCELLATION / BILLING_ISSUE etc. return 200 ignored and write nothing. SQL is first-writer-wins anyway, but filtering here keeps the "ignored" telemetry legible. |

## Files

- Handler: `supabase/functions/rc-webhook/index.ts`
- Tests: `supabase/functions/rc-webhook/__tests__/rc-webhook.test.ts` (12/12 green under `deno test`)
- SQL setter (pre-existing): `sql/referral-rc-webhook.sql` — `set_referral_rc_user(p_code, p_rc_user_id)` service_role-only

## Deploy

Pre-flight (verify SQL is in place):

```sql
SELECT proname FROM pg_proc WHERE proname = 'set_referral_rc_user';
```

If empty, run `sql/referral-rc-webhook.sql` first.

Set Edge Function secret (Supabase dashboard → Edge Functions → Secrets):

- `REVENUECAT_WEBHOOK_AUTHORIZATION` — a random 32+ char value. Same value goes in RC dashboard below. **NOT** the same as `REVENUECAT_V1_SECRET_KEY`.

Deploy:

```bash
supabase functions deploy rc-webhook
```

Note the deliberately absent `--no-verify-jwt` — same rationale as `first-referral-bonus`.

## Wire RC dashboard

RevenueCat dashboard → Project → Integrations → Webhooks:

- URL: `https://<project>.supabase.co/functions/v1/rc-webhook`
- Authorization header: value of `REVENUECAT_WEBHOOK_AUTHORIZATION`

Client SDK (out of this story's scope, but must exist for the chain to work):
after a user generates a referral code, call `Purchases.setAttributes({ veyrnox_referral_code: '<VYX-XXXXXX>' })` on the REFERRER's session so RC includes it in their purchase events later.

## Verification

- [ ] SQL `set_referral_rc_user` exists in production
- [ ] Edge Function deployed — SHA:
- [ ] `REVENUECAT_WEBHOOK_AUTHORIZATION` set in Supabase env — timestamp:
- [ ] Same value set in RC dashboard webhook — timestamp:
- [ ] RC dashboard "Send test event" → 200 ok — screenshot:
- [ ] First real `INITIAL_PURCHASE` event verified:
  - Referrer code:
  - RC `app_user_id`:
  - `SELECT rc_user_id FROM referrals WHERE code = '<code>';` returns non-NULL — timestamp:

## Secret rotation runbook

If `REVENUECAT_WEBHOOK_AUTHORIZATION` leaks:

1. Generate new value.
2. Update in Supabase env FIRST (accepts new; still accepts old until step 3).
3. Actually the function only checks the current env value, so there is a window: update Supabase, then RC dashboard immediately. During the window, in-flight RC deliveries may 401 and RC will retry.
4. RC retries idempotently on 4xx/5xx, so a brief 401 window is safe.
5. Log rotation timestamp here.

## Risks

- **Shared-secret leak.** Only security control on this endpoint. First-writer-wins SQL bounds blast radius (an attacker can bind arbitrary rc_user_id to a code ONCE per code); rotation runbook above is the response.
- **Env mixing across projects.** Never share the secret between staging + production RC projects. Cross-env replay would silently bind wrong rc_user_ids in prod.
- **Silent `no_code`.** If the client SDK never sets `veyrnox_referral_code`, every event returns `200 no_code` and rc_user_id stays NULL forever. Watch the Edge Function logs for the `no_code` vs `ok` ratio during first week post-launch.

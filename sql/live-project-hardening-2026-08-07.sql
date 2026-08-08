-- =============================================================================
-- Live-project hardening — 2026-08-07
--
-- TARGET: jwstkrtslotnjyerzzsi  ("Veyrnox PRODUCTION (live)")
-- NOT:    nszlbcmcysftwyudthjz  ("veyrnox-STAGING (not production)")
--
-- Check before you run ANYTHING. The two projects were named the other way
-- round until today, and a full session of analysis was spent on the wrong one
-- because the Supabase CLI reported staging as `linked` and it was called
-- "veyrnox-prod". Confirm the ref in the dashboard URL, not the name:
--
--     select current_setting('request.jwt.claim.iss', true);   -- or just look at the URL
--
-- WHY THIS FILE EXISTS. sql/api-security-hardening.sql was applied to STAGING
-- only. On the live project every SECURITY DEFINER function still carries the
-- default PUBLIC EXECUTE grant, the L-8 index is absent, and none of the
-- 2026-07-28 audit-wave tables exist. This script closes that gap in the order
-- that does not break the running app.
--
-- STATE AS MEASURED ON THE LIVE PROJECT, 2026-08-07 (read-only queries):
--     referral_attributions   0 rows      referrals   228
--     events                  225 rows    waitlist    4 rows
--     uq_referral_attributions_hour_dedup   ABSENT
--     bonus_claim_attempts / _by_ip / first_referral_bonus_attempts   ABSENT
--     all 9 RPCs              anon, authenticated, postgres, PUBLIC, service_role
--
-- Re-measure before running. These numbers are why STAGE 1 is safe; if
-- referral_attributions is no longer 0, re-read the STAGE 1 note on
-- record_attribution before proceeding.
-- =============================================================================


-- =============================================================================
-- STAGE 1 — ✅ APPLIED to jwstkrtslotnjyerzzsi on 2026-08-07. Idempotent; safe
-- to re-run (CREATE INDEX IF NOT EXISTS, and REVOKE/GRANT are declarative).
--
-- Applied inside a single transaction so a partial failure would have rolled
-- back. Verified immediately afterwards, against the LIVE endpoints, not just
-- the catalog:
--     record_attribution        -> postgres, service_role       (was PUBLIC)
--     get_referral_leaderboard  -> postgres, service_role       (was PUBLIC)
--     waitlist                  -> anon:INSERT only, 4 rows intact
--     uq_referral_attributions_hour_dedup  -> present
--     get_referral_count / get_referral_paid_count / track_event -> still 200
--     record_attribution via /api/rpc -> permission denied  (H-3 CLOSED)
--
-- NOTE on that last line: `permission denied for function <name>` is ALSO the
-- symptom of running STAGE 2 out of order. For record_attribution it is the
-- intended end state; for the other six it means the proxy is still on the anon
-- key. Check WHICH function before treating it as a fault.
-- =============================================================================

-- ── 1a. L-8 dedup index ──────────────────────────────────────────────────────
-- record_attribution has no idempotency key, so a retried webhook can book the
-- same sale twice and inflate paid-count and earnings.
--
-- `AT TIME ZONE 'UTC'` is load-bearing, not cosmetic: created_at is timestamptz
-- and date_trunc(text, timestamptz) is STABLE, not IMMUTABLE, so without the
-- pin PostgreSQL rejects the statement outright:
--     ERROR: 42P17: functions in index expression must be marked IMMUTABLE
-- That is why L-8 had never been applied anywhere — the original statement was
-- dead on arrival. Fixed in #1609; this is the working form.
--
-- Verified against this project: 0 rows, 0 duplicate groups, so it applies
-- instantly with no backfill and no risk of failing on existing duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS uq_referral_attributions_hour_dedup
  ON referral_attributions (
    referral_code,
    plan,
    revenue_cents,
    date_trunc('hour', created_at AT TIME ZONE 'UTC')
  );


-- ── 1b. H-3 primary: record_attribution ──────────────────────────────────────
-- THE ONE GENUINE OPEN VULNERABILITY. Anyone holding the public anon key can
-- call this and forge revenue rows against any published referral code,
-- inflating that referrer's earnings display. Bounded by the function's own
-- 2/hour/code rate limit and the $0–1000 range, but not otherwise gated.
--
-- SAFE TO REVOKE NOW because referral_attributions has 0 rows and no purchase
-- has ever completed on either store — the client path exists but has never
-- successfully recorded anything. Revoking costs no working behaviour.
--
-- AFTER THIS, the client's recordAttribution() call will fail. That is the
-- intended end state: H-3 says attribution must be server-authored, via the
-- RevenueCat webhook in sql/referral-rc-webhook.sql (still a skeleton). Until
-- that webhook lands, attribution is simply not recorded — which is the same
-- as today, since it has never been recorded at all.
--
-- REVOKE from PUBLIC is required IN ADDITION to revoking the roles: anon is a
-- member of PUBLIC, so revoking the role alone leaves the PUBLIC grant intact
-- and the function stays reachable.
REVOKE ALL ON FUNCTION public.record_attribution(text, text, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_attribution(text, text, int, int) FROM anon;
REVOKE ALL ON FUNCTION public.record_attribution(text, text, int, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_attribution(text, text, int, int) TO service_role;


-- ── 1c. get_referral_leaderboard ─────────────────────────────────────────────
-- No client caller anywhere (not in src/, not in the /api/rpc allowlist), so
-- this is safe-immediate on the same reasoning it was on staging.
REVOKE ALL ON FUNCTION public.get_referral_leaderboard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_referral_leaderboard() FROM anon;
REVOKE ALL ON FUNCTION public.get_referral_leaderboard() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_referral_leaderboard() TO service_role;


-- ── 1d. waitlist least-privilege ─────────────────────────────────────────────
-- `waitlist` carries a full GRANT ALL to anon and authenticated — SELECT,
-- INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN — while every
-- other table on this project grants anon nothing. Almost certainly Supabase's
-- default GRANT ALL at table creation, never tightened.
--
-- RLS is currently doing the work: the only anon policy is "Anyone can join
-- waitlist" (INSERT), so SELECT/UPDATE/DELETE are already blocked. But TRUNCATE
-- BYPASSES RLS ENTIRELY, and anon holds it — on a table with 4 real signups.
-- Not reachable through PostgREST, which does not expose TRUNCATE, so this is
-- latent rather than live. It should still not be there.
--
-- Re-grants INSERT afterwards because the RLS policy needs the underlying table
-- privilege to be present; the policy alone is not sufficient.
REVOKE ALL ON TABLE public.waitlist FROM PUBLIC;
REVOKE ALL ON TABLE public.waitlist FROM anon;
REVOKE ALL ON TABLE public.waitlist FROM authenticated;
GRANT INSERT ON TABLE public.waitlist TO anon;

-- Verify STAGE 1 ─────────────────────────────────────────────────────────────
-- Expect: record_attribution and get_referral_leaderboard show only
-- postgres + service_role; waitlist shows anon:INSERT and nothing else.
--
--   select p.proname,
--          coalesce((select string_agg(distinct
--                      case when a.grantee = 0 then 'PUBLIC'
--                           else a.grantee::regrole::text end, ', ')
--                    from aclexplode(p.proacl) a
--                    where a.privilege_type = 'EXECUTE'), 'DEFAULT => PUBLIC') as can_execute
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('record_attribution','get_referral_leaderboard')
--    order by 1;


-- =============================================================================
-- STAGE 2 — DO NOT RUN YET. Blocked on the /api/rpc proxy using service_role.
-- =============================================================================
--
-- These six DO have a live caller: functions/api/rpc/[fn].js, which currently
-- authenticates with SUPABASE_ANON_KEY. Revoking anon breaks every referral and
-- telemetry write immediately — the exact 401 outage that ran from 2026-08-04
-- to 2026-08-07.
--
-- PREREQUISITE, in order:
--   1. Set SUPABASE_SERVICE_ROLE_KEY on the veyrnox-prod Pages project, taken
--      from THIS project (jwstkrtslotnjyerzzsi), not staging.
--   2. Redeploy so a running instance has it.
--   3. Confirm /api/rpc/get_referral_count still returns 200, not 401.
--   4. Only then run the block below.
--
-- The proxy already prefers SUPABASE_SERVICE_ROLE_KEY over the anon key
-- (#1606), so step 1 is the whole change. Full runbook, including rollback:
-- docs/rpc-service-role-migration.md.
--
-- Symptom if run out of order: `permission denied for function <name>` from
-- /api/rpc/*. That string is pinned as a test in
-- functions/api/rpc/__tests__/rpc-proxy.test.js so it greps back to here.
--
-- REVOKE ALL ON FUNCTION public.track_event(uuid, text, jsonb) FROM PUBLIC;
-- REVOKE ALL ON FUNCTION public.track_event(uuid, text, jsonb) FROM anon;
-- REVOKE ALL ON FUNCTION public.track_event(uuid, text, jsonb) FROM authenticated;
-- GRANT EXECUTE ON FUNCTION public.track_event(uuid, text, jsonb) TO service_role;
--
-- REVOKE ALL ON FUNCTION public.increment_referral(text, uuid) FROM PUBLIC;
-- REVOKE ALL ON FUNCTION public.increment_referral(text, uuid) FROM anon;
-- REVOKE ALL ON FUNCTION public.increment_referral(text, uuid) FROM authenticated;
-- GRANT EXECUTE ON FUNCTION public.increment_referral(text, uuid) TO service_role;
--
-- REVOKE ALL ON FUNCTION public.generate_referral_code(uuid) FROM PUBLIC;
-- REVOKE ALL ON FUNCTION public.generate_referral_code(uuid) FROM anon;
-- REVOKE ALL ON FUNCTION public.generate_referral_code(uuid) FROM authenticated;
-- GRANT EXECUTE ON FUNCTION public.generate_referral_code(uuid) TO service_role;
--
-- REVOKE ALL ON FUNCTION public.register_referral_code(text, uuid) FROM PUBLIC;
-- REVOKE ALL ON FUNCTION public.register_referral_code(text, uuid) FROM anon;
-- REVOKE ALL ON FUNCTION public.register_referral_code(text, uuid) FROM authenticated;
-- GRANT EXECUTE ON FUNCTION public.register_referral_code(text, uuid) TO service_role;
--
-- REVOKE ALL ON FUNCTION public.get_referral_earnings(text) FROM PUBLIC;
-- REVOKE ALL ON FUNCTION public.get_referral_earnings(text) FROM anon;
-- REVOKE ALL ON FUNCTION public.get_referral_earnings(text) FROM authenticated;
-- GRANT EXECUTE ON FUNCTION public.get_referral_earnings(text) TO service_role;
--
-- REVOKE ALL ON FUNCTION public.get_referral_paid_count(text) FROM PUBLIC;
-- REVOKE ALL ON FUNCTION public.get_referral_paid_count(text) FROM anon;
-- REVOKE ALL ON FUNCTION public.get_referral_paid_count(text) FROM authenticated;
-- GRANT EXECUTE ON FUNCTION public.get_referral_paid_count(text) TO service_role;
--
-- get_referral_count is NOT in this list: it is already anon-only with no
-- PUBLIC grant on this project, so it needs no change.


-- =============================================================================
-- STAGE 3 — only needed when the first-referral-bonus Edge Function is deployed
-- =============================================================================
--
-- bonus_claim_attempts, bonus_claim_attempts_by_ip and
-- first_referral_bonus_attempts do not exist on this project. They back the
-- rate limits and idempotency for the bonus claim, which is BUILT but NOT
-- DEPLOYED, so their absence breaks nothing today.
--
-- Do not hand-write them here — run the source files in this order so the
-- definitions stay the single source of truth:
--     sql/first-referral-bonus.sql
--     sql/check-first-referral-bonus-hardening.sql
--     sql/bonus-claim-rate-limit.sql
--     sql/first-referral-bonus-attempts.sql
--     sql/track-event-ip-rate-limit.sql
--     sql/definer-search-path-pin.sql        (re-run last)
--
-- Then re-verify STAGE 1's grants: several of those files CREATE OR REPLACE
-- functions, and a recreated function comes back with the default PUBLIC
-- EXECUTE grant. Running them AFTER stage 1 silently reopens H-3.
-- =============================================================================

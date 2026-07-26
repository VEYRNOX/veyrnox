-- ============================================================================
-- Rate limit for the first-referral-bonus Edge Function
-- Run in Supabase SQL Editor AFTER first-referral-bonus.sql and
-- check-first-referral-bonus-hardening.sql, and BEFORE (or re-run)
-- definer-search-path-pin.sql.
-- Date: 2026-07-26
-- ============================================================================
--
-- WHY
--
-- supabase/functions/first-referral-bonus/index.ts had no rate limit of any
-- kind, on an endpoint that performs a DB round-trip and, when eligible, a
-- write to the RevenueCat REST API. Project rule: "All Supabase RPCs are
-- rate-limited per device... New RPCs must define and enforce a rate limit
-- before merge -- no unthrottled write endpoints."
--
-- The limit is keyed by REFERRAL CODE, not by device. The request body carries
-- only a code, and the caller is unauthenticated (see the Edge Function's own
-- header for why there is no user identity to key on in a self-custody wallet
-- with no accounts). Per-code is what the data actually supports, and it is
-- the right key for the abuse being throttled: repeated claim attempts against
-- one referrer.
--
-- WHY A SEPARATE TABLE, NOT COLUMNS ON `referrals`
--
-- Putting the counter on `referrals` would have been simpler, and wrong.
-- supabase/referrals.sql creates `create policy "public select" on referrals
-- for select using (true)`, so EVERY column of that table is readable by anon
-- through PostgREST. Adding rate-limit state there would publish it.
--
-- (Note for whoever picks this up: that same policy already exposes the
-- columns first-referral-bonus.sql added -- `rc_user_id` and
-- `first_bonus_granted_at` -- plus `device_id`, to any anon caller. That is a
-- separate and larger disclosure than the RPC-level one fixed in the
-- check_first_referral_bonus hardening, and it is NOT addressed here because
-- narrowing that policy needs a check of every client read path first.)
--
-- This table has RLS enabled and NO policies, which is the same shape as
-- referral_increments: anon cannot read or write it at all, and only
-- SECURITY DEFINER functions can touch it.
--
-- STATUS: NOT VERIFIED. This SQL has not been executed; there is no Postgres
-- or Docker in the environment it was written in.

-- ----------------------------------------------------------------------------
-- Fixed-window counter, one row per code.
--
-- The FK to referrals(code) is load-bearing: it bounds the table to the number
-- of real referral codes, so spraying invented codes at the endpoint cannot
-- grow it. The function below turns the resulting FK violation into a plain
-- "denied" rather than an error.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bonus_claim_attempts (
  code         text PRIMARY KEY REFERENCES public.referrals(code) ON DELETE CASCADE,
  window_start timestamptz NOT NULL DEFAULT clock_timestamp(),
  attempts     int         NOT NULL DEFAULT 0
);

ALTER TABLE public.bonus_claim_attempts ENABLE ROW LEVEL SECURITY;
-- No RLS policies, deliberately: anon has no path to this table.

-- ----------------------------------------------------------------------------
-- record_bonus_claim_attempt(code) -> true = allowed, false = denied.
--
-- One statement does the whole read-modify-write, so concurrent callers
-- serialise on the row lock and cannot both slip under the limit.
-- Server-side clock only (clock_timestamp) -- no client-supplied timestamp is
-- accepted anywhere, per the rate-limit rule.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_bonus_claim_attempt(p_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Captured once so both CASE branches below see the same instant.
  v_now      timestamptz := clock_timestamp();
  v_attempts int;
BEGIN
  INSERT INTO public.bonus_claim_attempts AS b (code, window_start, attempts)
  VALUES (p_code, v_now, 1)
  ON CONFLICT (code) DO UPDATE
     SET window_start = CASE
           WHEN b.window_start < v_now - interval '1 hour' THEN v_now
           ELSE b.window_start
         END,
         attempts = CASE
           WHEN b.window_start < v_now - interval '1 hour' THEN 1
           ELSE b.attempts + 1
         END
  RETURNING b.attempts INTO v_attempts;

  -- 5/hour/code. A legitimate client calls this once, after record_attribution
  -- succeeds; the headroom is for transient retries, not for volume.
  RETURN v_attempts <= 5;

EXCEPTION
  -- Unknown code: the FK rejected it, so nothing was stored and nothing needs
  -- cleaning up. Deny rather than raise -- an invented code is an expected
  -- input on a public endpoint, not a server error (I4: fail closed).
  WHEN foreign_key_violation THEN
    RETURN false;
END;
$$;

-- ----------------------------------------------------------------------------
-- Only the Edge Function (service_role) may call this. CREATE OR REPLACE
-- preserves privileges, so the REVOKE is required, and it must name PUBLIC --
-- Postgres grants EXECUTE to PUBLIC on CREATE FUNCTION.
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.record_bonus_claim_attempt(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_bonus_claim_attempt(text) FROM anon;
REVOKE ALL ON FUNCTION public.record_bonus_claim_attempt(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_bonus_claim_attempt(text) TO service_role;

-- ----------------------------------------------------------------------------
-- VERIFY (run after the migration)
--
--   -- 1. anon must NOT be able to execute it, or read the table. Expect: f
--   SELECT has_function_privilege('anon',
--     'public.record_bonus_claim_attempt(text)', 'EXECUTE');
--
--   -- 2. service_role must. Expect: t
--   SELECT has_function_privilege('service_role',
--     'public.record_bonus_claim_attempt(text)', 'EXECUTE');
--
--   -- 3. RLS on with no policies. Expect rowsecurity = t, and no rows from
--   --    pg_policies.
--   SELECT relrowsecurity FROM pg_class WHERE relname = 'bonus_claim_attempts';
--   SELECT * FROM pg_policies WHERE tablename = 'bonus_claim_attempts';
--
--   -- 4. The limit actually bites. On a real code, calls 1-5 return t and the
--   --    6th returns f:
--   --    SELECT public.record_bonus_claim_attempt('VYX-TESTCD');  -- x6
--   --    Reset with:
--   --    DELETE FROM public.bonus_claim_attempts WHERE code = 'VYX-TESTCD';
--
--   -- 5. An invented code is denied and stores nothing. Expect f, then 0.
--   SELECT public.record_bonus_claim_attempt('VYX-NOSUCH');
--   SELECT count(*) FROM public.bonus_claim_attempts WHERE code = 'VYX-NOSUCH';
-- ----------------------------------------------------------------------------

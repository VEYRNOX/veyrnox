-- ============================================================================
-- Rate limit for the first-referral-bonus Edge Function
-- Run in Supabase SQL Editor AFTER first-referral-bonus.sql and
-- check-first-referral-bonus-hardening.sql, and BEFORE (or re-run)
-- definer-search-path-pin.sql.
-- Date: 2026-07-26 (revised 2026-07-28 — L-10, per-IP second dimension)
-- ============================================================================
--
-- 2026-07-28 REVISION (L-10)
--
-- Single-dimension per-code rate limiting stops one attacker hammering ONE
-- referrer, but it does not stop one attacker fuzzing MANY codes at 5/hr each,
-- and (more usefully for the abuser) it does not stop the same host from
-- spending its budget on every code it knows about. A second dimension keyed
-- on client IP is added: the Edge Function now passes p_ip alongside p_code
-- and the request is denied if EITHER counter is exceeded. Per-code stays as
-- the defence against a distributed multi-IP flood at one referrer; per-IP is
-- the defence against one IP fanning out across codes.
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
-- Fixed-window counter, one row per IP (L-10 second dimension).
--
-- Same shape as bonus_claim_attempts. `inet` PK bounds the row size and
-- rejects garbage before it hits the table. No FK: the set of IPs is
-- unbounded by design, so there is nothing to reference. Growth is bounded
-- instead by the 1-hour reset — old windows are overwritten in place.
--
-- A NULL IP (no forwarding header on the request, or an unparseable value)
-- must NOT collapse every anonymous caller into one row: that row would
-- rate-limit legitimate traffic and give attackers a trivial bypass by
-- stripping headers. The Edge Function must therefore pass a non-NULL p_ip
-- OR accept that only the per-code counter defends the request. The wrapper
-- below skips the per-IP check when p_ip is NULL (falls back to per-code
-- only) rather than silently uniting every unknown caller into one bucket.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bonus_claim_attempts_by_ip (
  ip           inet        PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT clock_timestamp(),
  attempts     int         NOT NULL DEFAULT 0
);

ALTER TABLE public.bonus_claim_attempts_by_ip ENABLE ROW LEVEL SECURITY;
-- No RLS policies, deliberately: anon has no path to this table.

-- ----------------------------------------------------------------------------
-- record_bonus_claim_attempt(code, ip) -> true = allowed, false = denied.
--
-- Signature widened for L-10 (per-IP second dimension). p_ip is optional so
-- an infrastructure change that drops the forwarding header does not brick
-- the endpoint — the per-code counter still fires. Both counters are
-- incremented on every call so the abuser cannot spend one budget without
-- also spending the other; the request is denied if EITHER exceeds its
-- limit.
--
-- One statement per counter does the whole read-modify-write, so concurrent
-- callers serialise on the row lock and cannot both slip under the limit.
-- Server-side clock only (clock_timestamp) -- no client-supplied timestamp is
-- accepted anywhere, per the rate-limit rule.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_bonus_claim_attempt(
  p_code text,
  p_ip   inet DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Captured once so every CASE branch below sees the same instant.
  v_now         timestamptz := clock_timestamp();
  v_attempts    int;
  v_ip_attempts int;
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
  IF v_attempts > 5 THEN
    RETURN false;
  END IF;

  -- Per-IP dimension. Skipped if the Edge Function could not determine an
  -- IP (see the NULL note above) — the per-code counter is then the only
  -- brake, which is worse than both but better than uniting every unknown
  -- caller into one shared row.
  IF p_ip IS NOT NULL THEN
    INSERT INTO public.bonus_claim_attempts_by_ip AS bi (ip, window_start, attempts)
    VALUES (p_ip, v_now, 1)
    ON CONFLICT (ip) DO UPDATE
       SET window_start = CASE
             WHEN bi.window_start < v_now - interval '1 hour' THEN v_now
             ELSE bi.window_start
           END,
           attempts = CASE
             WHEN bi.window_start < v_now - interval '1 hour' THEN 1
             ELSE bi.attempts + 1
           END
    RETURNING bi.attempts INTO v_ip_attempts;

    -- 20/hour/IP: allows a NAT'd household to make several attempts against
    -- distinct codes, but caps a single host fanning out across the code
    -- space. Higher than the per-code limit deliberately — this bound
    -- exists to stop enumeration, not to duplicate the per-code brake.
    IF v_ip_attempts > 20 THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;

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
--
-- The single-argument variant is dropped so a caller cannot accidentally
-- resolve to the old, IP-unaware overload after this migration runs.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.record_bonus_claim_attempt(text);

REVOKE ALL ON FUNCTION public.record_bonus_claim_attempt(text, inet) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_bonus_claim_attempt(text, inet) FROM anon;
REVOKE ALL ON FUNCTION public.record_bonus_claim_attempt(text, inet) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_bonus_claim_attempt(text, inet) TO service_role;

-- ----------------------------------------------------------------------------
-- VERIFY (run after the migration)
--
--   -- 1. anon must NOT be able to execute it, or read either table. Expect: f
--   SELECT has_function_privilege('anon',
--     'public.record_bonus_claim_attempt(text, inet)', 'EXECUTE');
--
--   -- 2. service_role must. Expect: t
--   SELECT has_function_privilege('service_role',
--     'public.record_bonus_claim_attempt(text, inet)', 'EXECUTE');
--
--   -- 3. Old single-arg overload gone. Expect: 0.
--   SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'record_bonus_claim_attempt'
--      AND pg_get_function_identity_arguments(p.oid) = 'p_code text';
--
--   -- 4. RLS on with no policies on BOTH tables. Expect rowsecurity = t, and
--   --    no rows from pg_policies.
--   SELECT relname, relrowsecurity FROM pg_class
--    WHERE relname IN ('bonus_claim_attempts', 'bonus_claim_attempts_by_ip');
--   SELECT * FROM pg_policies
--    WHERE tablename IN ('bonus_claim_attempts', 'bonus_claim_attempts_by_ip');
--
--   -- 5. Per-code limit bites. On a real code, calls 1-5 return t and the
--   --    6th returns f (use a fresh IP each time to isolate the code counter):
--   --    SELECT public.record_bonus_claim_attempt('VYX-TESTCD', NULL);  -- x6
--   --    Reset with:
--   --    DELETE FROM public.bonus_claim_attempts WHERE code = 'VYX-TESTCD';
--
--   -- 6. Per-IP limit bites. From one IP, 20 attempts across DIFFERENT codes
--   --    return t; the 21st returns f. Requires 21 real codes.
--
--   -- 7. An invented code is denied and stores nothing in EITHER table.
--   --    Expect f, then 0, then 0.
--   SELECT public.record_bonus_claim_attempt('VYX-NOSUCH', '203.0.113.1'::inet);
--   SELECT count(*) FROM public.bonus_claim_attempts       WHERE code = 'VYX-NOSUCH';
--   SELECT count(*) FROM public.bonus_claim_attempts_by_ip WHERE ip   = '203.0.113.1';
-- ----------------------------------------------------------------------------

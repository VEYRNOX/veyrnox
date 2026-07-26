-- ============================================================================
-- check_first_referral_bonus hardening — run in Supabase SQL Editor AFTER
-- first-referral-bonus.sql
-- Date: 2026-07-26
-- ============================================================================
--
-- WHAT WAS WRONG
--
-- Two separate defects in the version shipped by first-referral-bonus.sql.
--
-- (1) ANON-CALLABLE. Like every other function in this repo it was created with
--     no GRANT/REVOKE, and Postgres grants EXECUTE to PUBLIC on CREATE
--     FUNCTION. `anon` is a member of PUBLIC, so PostgREST exposed it to the
--     anon key that ships in the client bundle. Two consequences, both
--     reachable by anyone holding a publicly shared referral code:
--
--       - BONUS BURN. The function sets first_bonus_granted_at BEFORE any
--         entitlement exists. Called directly with the anon key, it trips the
--         claim flag, the Edge Function never runs, no RevenueCat grant is
--         made, and nothing reverts it. The referrer silently loses their
--         one-time free month, permanently.
--       - IDENTIFIER DISCLOSURE. It returns the referrer's RevenueCat
--         app_user_id to an unauthenticated caller — the handle used to
--         address that subscriber in RevenueCat's API. referralApi.js
--         populates that column on every generateServerCode/registerCode, so
--         the code -> subscriber mapping is live for real users.
--
-- (2) NOT ATOMIC, DESPITE SAYING SO. Its header called it an "atomic check +
--     claim" and "idempotent — second call returns NULL". Neither held. The
--     shape was check-then-act:
--
--         SELECT ... INTO v_already_granted;          -- read
--         IF v_already_granted IS NOT NULL THEN RETURN NULL; END IF;
--         UPDATE ... WHERE first_bonus_granted_at IS NULL;   -- claim
--         RETURN v_rc_user_id;                        -- unconditional!
--
--     Two concurrent callers both read NULL, both pass the guard, then the
--     first UPDATE claims and the second matches zero rows — but the return
--     value never depended on which one actually won, so BOTH received the
--     rc_user_id. Two Edge Function invocations, two RevenueCat promotional
--     grants, two free months for a one-time bonus. The Edge Function's own
--     retry path makes concurrent invocation a realistic event, not a
--     theoretical one.
--
-- WHAT THIS CHANGES
--
--   1. EXECUTE revoked from PUBLIC/anon/authenticated, granted to service_role
--      only. This is the part that closes (1). Verified safe: the sole caller
--      is supabase/functions/first-referral-bonus/index.ts, which builds its
--      client from SUPABASE_SERVICE_ROLE_KEY, so it already calls as
--      service_role. No client calls this RPC — the client posts to the Edge
--      Function, which is a separate boundary.
--   2. The claim becomes ONE statement. The UPDATE is the claim, and the
--      rc_user_id is returned only to the caller whose UPDATE actually flipped
--      the column. Row-level locking serialises concurrent callers, so exactly
--      one can ever win. That closes (2) and makes the "idempotent" claim in
--      the original header true instead of aspirational.
--   3. search_path pinned, every reference schema-qualified.
--
-- WHAT THIS DOES *NOT* CLOSE
--
-- The Edge Function itself is still unauthenticated (deployed --no-verify-jwt,
-- called with the public anon key as bearer, wildcard CORS, no rate limit).
-- After this migration an attacker can still POST a code to it — but that path
-- is self-correcting in a way the direct RPC call was not: the Edge Function
-- either completes the RevenueCat grant (so the referrer receives the bonus
-- they were owed) or reverts first_bonus_granted_at on failure. It cannot burn
-- the bonus the way a direct anon RPC call could. Rate-limiting and
-- authenticating the Edge Function remains open — see
-- docs/security-diffs/diff-2026-07-26.md.
--
-- SAFE TO REPLACE: same signature, same return type, same contract for the one
-- caller (text rc_user_id when eligible, NULL otherwise — never raises).
--
-- STATUS: NOT VERIFIED. This SQL has not been executed. It is real only once
-- run against the Supabase project. Verification queries are at the foot.

-- ----------------------------------------------------------------------------
-- Signature is unchanged, so CREATE OR REPLACE is sufficient. Note that
-- REPLACE preserves existing grants, which is exactly why the REVOKE below is
-- required and not merely belt-and-braces.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_first_referral_bonus(p_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rc_user_id text;
BEGIN
  -- One statement does the whole check-and-claim, so there is no window
  -- between deciding and claiming. Every eligibility condition that used to
  -- be a separate read now lives in the WHERE clause:
  --
  --   first_bonus_granted_at IS NULL  -> not already granted (the claim)
  --   rc_user_id IS NOT NULL          -> we know where to send the grant
  --   EXISTS (attribution)            -> at least one referee actually paid
  --
  -- RETURNING yields a row ONLY for the caller that actually flipped the
  -- column; a concurrent second caller blocks on the row lock, then matches
  -- zero rows and falls through to RETURN NULL.
  UPDATE public.referrals r
     SET first_bonus_granted_at = now()
   WHERE r.code = p_code
     AND r.first_bonus_granted_at IS NULL
     AND r.rc_user_id IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM public.referral_attributions a
        WHERE a.referral_code = p_code
     )
  RETURNING r.rc_user_id INTO v_rc_user_id;

  -- Ineligible, already claimed, unknown code, or lost the race. All four are
  -- ordinary outcomes the Edge Function reports as not_eligible, so return
  -- NULL rather than raising — matching the previous contract exactly.
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN v_rc_user_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- Lock down EXECUTE.
--
-- CREATE OR REPLACE does NOT reset privileges, so a function that was
-- previously created with the default PUBLIC grant keeps it. The REVOKE must
-- name PUBLIC — revoking from anon alone leaves the PUBLIC grant intact and
-- accomplishes nothing.
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.check_first_referral_bonus(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_first_referral_bonus(text) FROM anon;
REVOKE ALL ON FUNCTION public.check_first_referral_bonus(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_first_referral_bonus(text) TO service_role;

-- ----------------------------------------------------------------------------
-- VERIFY (run after the migration; do not take the above on trust)
--
--   -- 1. anon must NOT have EXECUTE. Expect: f
--   SELECT has_function_privilege('anon',
--     'public.check_first_referral_bonus(text)', 'EXECUTE');
--
--   -- 2. service_role must, or the Edge Function breaks. Expect: t
--   SELECT has_function_privilege('service_role',
--     'public.check_first_referral_bonus(text)', 'EXECUTE');
--
--   -- 3. search_path must be pinned. Expect: {search_path=}
--   SELECT proconfig FROM pg_proc
--    WHERE proname = 'check_first_referral_bonus';
--
--   -- 4. From the client with the anon key, this must now fail with 42501
--   --    (permission denied for function check_first_referral_bonus):
--   --    supabase.rpc('check_first_referral_bonus', { p_code: 'VYX-XXXXXX' })
--
--   -- 5. Single-claim behaviour, on a test code with >=1 attribution and a
--   --    non-null rc_user_id. First call returns the id, second returns NULL:
--   --    SELECT public.check_first_referral_bonus('VYX-TESTCD');  -- rc id
--   --    SELECT public.check_first_referral_bonus('VYX-TESTCD');  -- NULL
--   --    Reset with:
--   --    UPDATE public.referrals SET first_bonus_granted_at = NULL
--   --     WHERE code = 'VYX-TESTCD';
-- ----------------------------------------------------------------------------

-- ============================================================================
-- STILL OPEN AFTER THIS MIGRATION
-- ============================================================================
--
-- 1. The Edge Function needs authentication and a rate limit, and should not
--    send Access-Control-Allow-Origin: * on a write endpoint that grants a
--    paid entitlement.
-- 2. The remaining definer functions still carry the default PUBLIC grant:
--    track_event, increment_referral, generate_referral_code,
--    register_referral_code, record_attribution, get_referral_earnings,
--    get_referral_paid_count and get_referral_leaderboard. Several of those
--    are legitimately anon-callable (the client calls them directly), so each
--    needs an individual decision rather than a blanket REVOKE — unlike
--    decrement_referral and this one, which have no client caller at all.

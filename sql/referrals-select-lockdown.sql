-- ============================================================================
-- referrals: remove anon's direct table access
-- Run in Supabase SQL Editor AFTER api-security-hardening.sql,
-- growth-backend-changes.sql and first-referral-bonus.sql.
-- Ship the matching client build (src/api/referralApi.js fetchStatus) with it.
-- Date: 2026-07-26
-- ============================================================================
--
-- WHAT WAS WRONG
--
-- supabase/referrals.sql creates:
--
--     create policy "public select" on referrals for select using (true);
--
-- RLS is ROW-level, not column-level, so that policy exposes every column of
-- the table to anon through PostgREST — not just the two the client actually
-- reads. When the policy was written the table held only `code`, `count` and
-- `created_at`, and its own comment justified the exposure on exactly that
-- basis: "The table holds no sensitive data (code + counter only, no
-- identity/addresses)".
--
-- That stopped being true as columns were added and nobody revisited the
-- policy:
--
--   device_id              -- the app's per-install identifier
--   rc_user_id             -- the referrer's RevenueCat app_user_id
--                             (first-referral-bonus.sql)
--   first_bonus_granted_at -- (first-referral-bonus.sql)
--   is_founding_referrer   -- (growth-backend-changes.sql)
--   founding_expires_at    -- (growth-backend-changes.sql)
--
-- So `GET /rest/v1/referrals?select=code,device_id,rc_user_id` with the public
-- anon key returned the whole mapping. This is a bigger disclosure than the
-- RPC-level one already fixed in check_first_referral_bonus, and it needed no
-- RPC at all — the table was readable directly.
--
-- WHY NOT JUST A COLUMN GRANT
--
-- `REVOKE SELECT ... ; GRANT SELECT (code, count) ...` would have hidden the
-- sensitive columns with no client change. It was rejected because it leaves
-- the table enumerable: `?select=code,count` with no filter still dumps every
-- referral code and its running count. Routing the one legitimate read through
-- an RPC that takes a code and returns a single integer removes the disclosure
-- and the enumeration together.
--
-- THE ONLY DIRECT READ IN THE CLIENT
--
--     git grep "\.from('" -- src/
--
-- returns exactly one hit against this table: referralApi.js fetchStatus,
-- which does .from('referrals').select('count').eq('code', code).single().
-- get_referral_count() below replaces it exactly, and the matching client
-- change is in the same commit.
--
-- OLD CLIENTS DEGRADE, THEY DO NOT BREAK. An installed build still calling
-- .from('referrals') gets a permission error, which fetchStatus already
-- converts to `null` in its own catch. That path is explicitly covered by
-- src/pages/__tests__/ReferralTracker.syncFailure.test.jsx (the K-2 hardening):
-- the tracker renders a neutral state rather than a fake count. Testers on the
-- Play internal track will see the count unavailable until they update — the
-- fail-closed direction, and the reason this is worth doing before the App
-- Store submission rather than after.
--
-- STATUS: NOT VERIFIED. This SQL has not been executed; there is no Postgres or
-- Docker in the environment it was written in.

-- ----------------------------------------------------------------------------
-- 1. The replacement read: one code in, one integer out.
--
-- STABLE because it only reads. NULL for an unknown code, which fetchStatus
-- maps to `null` exactly as the old .single() miss did.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_referral_count(p_code text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_count int;
BEGIN
  SELECT r.count INTO v_count
    FROM public.referrals r
   WHERE r.code = p_code;

  -- NULL when the code does not exist. Deliberately not an exception: an
  -- unknown code is an ordinary outcome for a code typed by a user.
  RETURN v_count;
END;
$$;

-- This one IS meant to be callable by the app, unlike decrement_referral and
-- check_first_referral_bonus. The REVOKE-then-GRANT makes that an explicit
-- decision rather than an inherited default.
REVOKE ALL ON FUNCTION public.get_referral_count(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_referral_count(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_referral_count(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_referral_count(text) TO service_role;

-- ----------------------------------------------------------------------------
-- 2. Close the direct path.
--
-- Both the policy and the grant, on purpose. Dropping the policy is what stops
-- reads today; revoking the grant means the table stays shut even if RLS is
-- ever disabled on it by accident. Either alone would leave a way back in.
--
-- api-security-hardening.sql already dropped "public insert" on this table,
-- and there has never been an UPDATE or DELETE policy, so after this the anon
-- role has no direct access of any kind — every path goes through a SECURITY
-- DEFINER RPC, which is the rule the rest of the schema already follows.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "public select" ON public.referrals;

REVOKE ALL ON TABLE public.referrals FROM anon;
REVOKE ALL ON TABLE public.referrals FROM authenticated;

-- ----------------------------------------------------------------------------
-- VERIFY (run after the migration)
--
--   -- 1. anon has no table privileges left. Expect no rows.
--   SELECT privilege_type
--     FROM information_schema.role_table_grants
--    WHERE table_name = 'referrals' AND grantee = 'anon';
--
--   -- 2. The select policy is gone. Expect no row named 'public select'.
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'referrals';
--
--   -- 3. anon can still call the replacement. Expect: t
--   SELECT has_function_privilege('anon',
--     'public.get_referral_count(text)', 'EXECUTE');
--
--   -- 4. It returns the same number the client used to read. Expect equality.
--   SELECT public.get_referral_count('VYX-TESTCD') IS NOT DISTINCT FROM
--          (SELECT count FROM public.referrals WHERE code = 'VYX-TESTCD');
--
--   -- 5. From the client with the anon key, the direct read must now fail
--   --    (42501) and the RPC must succeed:
--   --    supabase.from('referrals').select('count').eq('code','VYX-TESTCD')
--   --    supabase.rpc('get_referral_count', { p_code: 'VYX-TESTCD' })
-- ----------------------------------------------------------------------------

-- ============================================================================
-- STILL OPEN
-- ============================================================================
--
-- The same audit has not been done for the other tables. `events` and
-- `referral_attributions` were locked down in api-security-hardening.sql, and
-- referral_increments / bonus_claim_attempts have RLS with no policies. Any
-- NEW table, or any new column on an existing one, needs the same question
-- asked: this policy was correct when written and became wrong because columns
-- were added underneath it. A `using (true)` select policy is a standing
-- commitment that every future column on that table is public.

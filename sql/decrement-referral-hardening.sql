-- ============================================================================
-- decrement_referral hardening — run in Supabase SQL Editor AFTER
-- api-security-hardening.sql AND growth-backend-changes.sql
-- Date: 2026-07-26
-- ============================================================================
--
-- WHAT WAS WRONG
--
-- growth-backend-changes.sql (PR #1340) shipped:
--
--     CREATE OR REPLACE FUNCTION decrement_referral(p_code text)
--     RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
--     BEGIN
--       UPDATE public.referrals SET count = GREATEST(count - 1, 0)
--        WHERE code = p_code;
--     END; $$;
--
-- with no GRANT/REVOKE anywhere in sql/ or supabase/. Postgres grants EXECUTE
-- to PUBLIC on a new function by default and `anon` is a member of PUBLIC, so
-- PostgREST exposed this to the anon key — the key that ships in the client
-- bundle by design. No rate limit, no device binding, no dedup, no caller
-- authentication. Referral codes are shared publicly by their owners (that is
-- the entire feature), so anyone who saw a code could call this in a loop and
-- drive that referrer's count to 0, downgrading their discount tier.
--
-- This reintroduced, through a different door, a hole the project had already
-- closed. supabase/referrals.sql says of the removed "public update" policy:
--
--     "This closes the prior gap where `public update using (true)` let any
--      client set any code's count to any value (or zero it)."
--
-- RLS on `referrals` still has no UPDATE policy, so the direct path stays shut.
-- But SECURITY DEFINER bypasses RLS by design, so an anon-callable definer
-- function that decrements is exactly the same capability with extra steps.
--
-- WHAT THIS CHANGES
--
--   1. EXECUTE is revoked from PUBLIC/anon/authenticated and granted only to
--      service_role. A refund clawback is a server-side event; no client has
--      any business calling it. This alone closes the vulnerability.
--   2. The reversal is bound to the SAME dedup row that authorised the
--      increment, so a caller can only ever undo one specific device's +1 —
--      it can no longer decrement an arbitrary code by an arbitrary amount.
--   3. It is idempotent. Refund webhooks are at-least-once; replaying one must
--      not decrement twice. The DELETE is the dedup key: no row deleted => no
--      decrement.
--   4. search_path is pinned and every object reference is schema-qualified.
--      No function in this repo did this before (grep: zero occurrences of
--      search_path across sql/ and supabase/), which is the standard
--      privilege-escalation vector against definer-rights functions.
--
-- SAFE TO CHANGE THE SIGNATURE: `decrement_referral` has no caller anywhere in
-- the codebase — only its own definition and a design-doc mention. Nothing to
-- skew, and we are still pre-first-publish. Verified with:
--     git grep -n "decrement_referral"
--
-- STATUS: NOT VERIFIED. This is SQL that has not been executed. It becomes
-- real only when run against the Supabase project, and nothing here should be
-- described as fixed until it has been.

-- ----------------------------------------------------------------------------
-- Replace the function. DROP first: the return type changes (void -> integer)
-- and the arity changes, neither of which CREATE OR REPLACE can do in place.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.decrement_referral(text);
DROP FUNCTION IF EXISTS public.decrement_referral(text, uuid);

CREATE FUNCTION public.decrement_referral(p_code text, p_device_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_count integer;
BEGIN
  -- Mirrors increment_referral: a reversal is always scoped to the device
  -- whose increment is being undone. Same errcode so callers can branch
  -- identically on either direction.
  IF p_device_id IS NULL THEN
    RAISE EXCEPTION 'device_id required' USING errcode = 'P0006';
  END IF;

  -- The dedup row IS the authorisation to decrement: it exists only because
  -- increment_referral previously counted this device against this code.
  -- Deleting it both authorises exactly one -1 and restores the device's
  -- ability to be counted again later (e.g. a resubscribe after a refund).
  DELETE FROM public.referral_increments
   WHERE code = p_code
     AND device_id = p_device_id;

  -- plpgsql sets FOUND from the DELETE: true iff a row was actually removed.
  -- (Deliberately not GET DIAGNOSTICS ... = ROW_COUNT — that yields an integer,
  -- and Postgres has no assignment cast from integer to boolean.)
  --
  -- Idempotent: nothing was counted for this device, so there is nothing to
  -- reverse. Return the current count rather than raising — a replayed refund
  -- webhook is an expected event, not an error.
  IF NOT FOUND THEN
    SELECT r.count INTO new_count
      FROM public.referrals r
     WHERE r.code = p_code;

    IF new_count IS NULL THEN
      RAISE EXCEPTION 'Code not found: %', p_code USING errcode = 'P0001';
    END IF;

    RETURN new_count;
  END IF;

  -- GREATEST floors at 0 so a counter can never go negative even if the
  -- ledger and the counter have drifted for some other reason.
  UPDATE public.referrals
     SET count = GREATEST(count - 1, 0)
   WHERE code = p_code
  RETURNING count INTO new_count;

  IF new_count IS NULL THEN
    -- Unreachable in practice: referral_increments.code is FK-constrained to
    -- referrals(code), so a dedup row cannot outlive its code. Kept as a
    -- fail-closed backstop (I4).
    --
    -- No compensating INSERT here on purpose. RAISE aborts the transaction,
    -- which rolls back the DELETE above, so the ledger repairs itself; writing
    -- the row back would be rolled back too and would only imply that manual
    -- compensation was needed. (increment_referral does perform such a
    -- compensating DELETE before its RAISE — harmless, but redundant for the
    -- same reason. Left alone; it is not this migration's business.)
    RAISE EXCEPTION 'Code not found: %', p_code USING errcode = 'P0001';
  END IF;

  RETURN new_count;
END;
$$;

-- ----------------------------------------------------------------------------
-- Lock down EXECUTE. This is the part that actually closes the hole.
--
-- Postgres grants EXECUTE to PUBLIC on CREATE FUNCTION, so the REVOKE must
-- come after the CREATE, and it must name PUBLIC — revoking from anon alone
-- leaves the PUBLIC grant in place and changes nothing.
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.decrement_referral(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decrement_referral(text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.decrement_referral(text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_referral(text, uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- VERIFY (run these after the migration; do not take the above on trust)
--
--   -- 1. anon must NOT have EXECUTE. Expect: f
--   SELECT has_function_privilege('anon',
--     'public.decrement_referral(text, uuid)', 'EXECUTE');
--
--   -- 2. service_role must. Expect: t
--   SELECT has_function_privilege('service_role',
--     'public.decrement_referral(text, uuid)', 'EXECUTE');
--
--   -- 3. search_path must be pinned. Expect: {search_path=}
--   SELECT proconfig FROM pg_proc WHERE proname = 'decrement_referral';
--
--   -- 4. From the client with the anon key, this must now fail with 42501
--   --    (permission denied for function decrement_referral):
--   --    supabase.rpc('decrement_referral', { p_code: 'VYX-XXXXXX',
--   --                                         p_device_id: '<uuid>' })
-- ----------------------------------------------------------------------------

-- ============================================================================
-- OPEN — NOT ADDRESSED HERE
-- ============================================================================
--
-- 1. NO CALLER CAN USE THIS YET. There is no refund webhook, and the clawback
--    described in docs/superpowers/specs/2026-07-24-10k-subscriber-growth-design.md
--    would need the REFEREE's device_id to name the increment being reversed.
--    record_attribution() does not record one, so a refund handler currently
--    has no way to resolve code -> device. Wiring the clawback therefore needs
--    a device_id on record_attribution (an owner decision — it changes what is
--    stored per purchase, so it is deliberately NOT done here).
--
-- 2. EVERY OTHER FUNCTION IN THIS REPO HAS THE SAME DEFAULT PUBLIC GRANT.
--    This migration hardens decrement_referral only. The one that matters most
--    is check_first_referral_bonus(p_code) in first-referral-bonus.sql: it is
--    anon-callable, sets first_bonus_granted_at BEFORE any entitlement is
--    granted (so a third party can burn a referrer's one-time bonus), and
--    returns the referrer's RevenueCat app_user_id to an unauthenticated
--    caller. It is intended to be called only by the first-referral-bonus Edge
--    Function, i.e. service_role — the same REVOKE/GRANT pair applies. See
--    docs/security-diffs/diff-2026-07-26.md.

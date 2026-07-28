-- ============================================================================
-- Referral RC-user webhook plumbing — H-1 remediation
-- Date: 2026-07-28
-- Run in Supabase SQL Editor AFTER sql/first-referral-bonus.sql
-- ============================================================================
--
-- Owner decision (H-1, 2026-07-28 internal audit): the referrer's RevenueCat
-- app_user_id (`referrals.rc_user_id`) is set ONLY from a verified RevenueCat
-- webhook. The client can no longer supply it — the client-facing variants of
-- generate_referral_code / register_referral_code that took p_rc_user_id have
-- been removed (see sql/first-referral-bonus.sql BLOCK 4).
--
-- This file installs the server-only setter that the RC webhook handler calls.
-- The handler itself is a Supabase Edge Function (out of scope for this file)
-- that:
--
--   1. Verifies the RC webhook signature using the shared secret.
--   2. Extracts the referrer's referral code from the RC event (either the
--      subscriber's original_app_user_id metadata or an explicit attribute the
--      app has set on the referrer's RC subscriber — decision pending).
--   3. Calls set_referral_rc_user(p_code, p_rc_user_id) with the SERVICE_ROLE
--      key. No other caller is permitted.
--
-- Until that handler is deployed:
--   - rc_user_id stays NULL on every row;
--   - check_first_referral_bonus returns NULL for every code;
--   - the first-referral bonus path is inert (I4: fail closed).
--
-- Nothing here grants an entitlement on its own; the grant path still runs
-- through supabase/functions/first-referral-bonus/index.ts and the atomic
-- claim in check_first_referral_bonus().

-- ============================================================================
-- set_referral_rc_user — service_role only
-- ============================================================================

CREATE OR REPLACE FUNCTION set_referral_rc_user(
  p_code       text,
  p_rc_user_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
-- Pin search_path so a schema-shadowing attack cannot redirect writes.
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_code IS NULL OR p_rc_user_id IS NULL THEN
    RAISE EXCEPTION 'code and rc_user_id required' USING errcode = 'P0009';
  END IF;

  -- Length bounds — RC app_user_ids are ~36 chars for UUIDs but the field is
  -- free-form; cap defensively to keep this endpoint from being turned into a
  -- bulk-write oracle.
  IF length(p_rc_user_id) > 128 THEN
    RAISE EXCEPTION 'rc_user_id too long' USING errcode = 'P0010';
  END IF;

  -- First-writer-wins: never overwrite an already-set rc_user_id. If the
  -- webhook fires twice for the same referrer, or a duplicate event arrives,
  -- the second call is a no-op.
  UPDATE referrals
     SET rc_user_id = p_rc_user_id
   WHERE code = p_code
     AND rc_user_id IS NULL;
END;
$$;

-- Callable ONLY by service_role. anon / authenticated must never invoke this.
REVOKE ALL ON FUNCTION set_referral_rc_user(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION set_referral_rc_user(text, text) FROM anon;
REVOKE ALL ON FUNCTION set_referral_rc_user(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION set_referral_rc_user(text, text) TO service_role;

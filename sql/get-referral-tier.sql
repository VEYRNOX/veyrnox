-- ============================================================================
-- get_referral_tier — server-side tier resolution for the referee paywall
-- Run in Supabase SQL Editor AFTER sql/partner-referral-codes.sql (needs
-- referrals.tier_override). Staging first; production after the PR merges.
-- Date: 2026-09-12
-- ============================================================================
--
-- WHY. Subscription.jsx resolved the referee's discount from the REFERRER's
-- tier, which it computed client-side from get_referral_paid_count(). Strix
-- H-2 (2026-08-28) made fetchPaidCount() fail closed, because an exact paid
-- count behind a public code disclosed a referrer's sales volume to anyone
-- holding the code. Since then NO referee has received a referral offer.
--
-- This RPC returns only the TIER KEY. It is the coarsest value the paywall can
-- act on: the offering id is `referral-<tier>`, so nothing finer would help it.
--
-- OWNER DECISION 2026-09-12 — the posture this reopens, stated plainly:
-- a public code now reveals which of five buckets its paid count falls in
-- (none / 1-99 / 100-999 / 1000-9999 / 10000+). For a partner code with
-- tier_override set it reveals nothing about volume at all, only the
-- contracted tier, which the partner advertises anyway. Accepted so that
-- partner referees actually get the platinum offer.
--
-- Resolution order:
--   1. unknown code                -> NULL   (client: no offer)
--   2. tier_override set           -> that tier (partner deals)
--   3. paid count, deduped exactly as get_referral_paid_count() does it
--      (same AT TIME ZONE 'UTC' hour bucket — change one, change both),
--      bucketed with the thresholds from lib/referral.js TIERS:
--        >= 10000 platinum | >= 1000 gold | >= 100 silver | > 0 bronze | 'none'
--      NOTE get_referral_leaderboard() uses different thresholds (500/100/25).
--      That drift predates this file; TIERS is the one the paywall honours.
--
-- The client allowlists the returned string before composing an offering id
-- from it (referralApi.js fetchReferralTier) — the server is I5-untrusted.

CREATE OR REPLACE FUNCTION public.get_referral_tier(p_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_override text;
  v_paid     integer;
BEGIN
  SELECT r.tier_override INTO v_override
    FROM public.referrals r
   WHERE r.code = p_code;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_override IS NOT NULL THEN
    RETURN v_override;
  END IF;

  SELECT count(*)::integer INTO v_paid
    FROM (
      SELECT DISTINCT plan, revenue_cents,
             date_trunc('hour', created_at AT TIME ZONE 'UTC') AS hr
        FROM public.referral_attributions
       WHERE referral_code = p_code
    ) dedup;

  RETURN CASE
    WHEN v_paid >= 10000 THEN 'platinum'
    WHEN v_paid >= 1000  THEN 'gold'
    WHEN v_paid >= 100   THEN 'silver'
    WHEN v_paid > 0      THEN 'bronze'
    ELSE 'none'
  END;
END;
$$;

-- Callable by the app on purpose (it replaces the fail-closed paid-count read).
-- REVOKE-then-GRANT so this is an explicit decision, not an inherited default.
REVOKE ALL ON FUNCTION public.get_referral_tier(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_referral_tier(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_referral_tier(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_referral_tier(text) TO service_role;

-- VERIFY
--   SELECT public.get_referral_tier('VYX-NOPE00');     -- NULL
--   SELECT public.get_referral_tier('<partner code>'); -- 'platinum'
--   SELECT public.get_referral_tier('<organic code>'); -- 'none' today (0 attributions on prod)
--   SELECT proconfig FROM pg_proc WHERE proname = 'get_referral_tier'; -- {search_path=}

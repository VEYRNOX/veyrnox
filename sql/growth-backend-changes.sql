-- ============================================================================
-- Growth Backend Changes — run each block in Supabase SQL Editor
-- Date: 2026-07-24
-- ============================================================================

-- ============================================================================
-- BLOCK 1: Founding referrer columns on referrals table
-- ============================================================================

ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS is_founding_referrer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS founding_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_referrals_founding
  ON public.referrals (is_founding_referrer)
  WHERE is_founding_referrer = true;


-- ============================================================================
-- BLOCK 2: Referral leaderboard RPC (top 10, server-side masking)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_referral_leaderboard()
RETURNS TABLE(rank bigint, masked_code text, paid_count int, tier text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    row_number() OVER (ORDER BY r.count DESC) AS rank,
    left(r.code, 5) || '****' AS masked_code,
    r.count AS paid_count,
    CASE
      WHEN r.count >= 500 THEN 'platinum'
      WHEN r.count >= 100 THEN 'gold'
      WHEN r.count >= 25  THEN 'silver'
      ELSE 'bronze'
    END AS tier
  FROM public.referrals r
  WHERE r.count > 0
  ORDER BY r.count DESC
  LIMIT 10;
END;
$$;


-- ============================================================================
-- BLOCK 3: Decrement referral RPC (clawback on refund within 72h)
--
-- !! SUPERSEDED — DO NOT RUN THIS BLOCK. See sql/decrement-referral-hardening.sql
--
-- As written below this function was anon-callable (Postgres grants EXECUTE to
-- PUBLIC by default and there are no GRANT/REVOKE statements in this file), with
-- no rate limit, no device binding and no dedup. Since referral codes are shared
-- publicly by their owners, anyone holding a code could loop this call and zero
-- that referrer's count — the same capability the "public update" RLS policy was
-- removed to prevent (see supabase/referrals.sql).
--
-- The block is left here rather than deleted so this file still reads as the
-- history of what was actually run. If you are provisioning a database from
-- scratch, skip it and run sql/decrement-referral-hardening.sql instead; that
-- file DROPs this signature before creating the hardened one, so running both
-- in order is also safe.
-- ============================================================================

-- CREATE OR REPLACE FUNCTION decrement_referral(p_code text)
-- RETURNS void
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- AS $$
-- BEGIN
--   UPDATE public.referrals
--   SET count = GREATEST(count - 1, 0)
--   WHERE code = p_code;
-- END;
-- $$;

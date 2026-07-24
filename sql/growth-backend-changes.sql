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
-- ============================================================================

CREATE OR REPLACE FUNCTION decrement_referral(p_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.referrals
  SET count = GREATEST(count - 1, 0)
  WHERE code = p_code;
END;
$$;

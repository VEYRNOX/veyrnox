-- ============================================================================
-- AI referral attribution plan family support
-- Date: 2026-08-21
-- ============================================================================
--
-- WHY THIS EXISTS
--
-- `record_attribution(p_plan text, ...)` originally accepted only 'monthly' or
-- 'annual'. That was enough while Safety Plus was the only paid family, but it
-- becomes ambiguous once AI Security Protection referrals also exist: the bonus
-- grant path cannot honestly decide whether the referrer earned a Safety Plus
-- month or an AI Security Protection month from 'annual' alone.
--
-- This change keeps the same function signature and table shape, but widens the
-- accepted `plan` vocabulary to include a plan FAMILY:
--
--   safety_plus_monthly
--   safety_plus_annual
--   ai_security_protection_monthly
--   ai_security_protection_annual
--
-- Legacy rows ('monthly' / 'annual') remain valid and continue to mean the
-- historical Safety Plus family.

CREATE OR REPLACE FUNCTION public.record_attribution(
  p_code text,
  p_plan text,
  p_revenue_cents integer,
  p_discount_cents integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  recent_count int;
BEGIN
  IF p_plan NOT IN (
    'monthly',
    'annual',
    'safety_plus_monthly',
    'safety_plus_annual',
    'ai_security_protection_monthly',
    'ai_security_protection_annual'
  ) THEN
    RAISE EXCEPTION 'Invalid plan' USING errcode = 'P0007';
  END IF;

  IF p_revenue_cents < 0 OR p_revenue_cents > 100000 THEN
    RAISE EXCEPTION 'Invalid revenue' USING errcode = 'P0008';
  END IF;

  IF p_discount_cents IS NULL OR p_discount_cents < 0 OR p_discount_cents > p_revenue_cents THEN
    RAISE EXCEPTION 'Invalid discount' USING errcode = 'P0010';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM referrals WHERE code = p_code) THEN
    RAISE EXCEPTION 'Code not found: %', p_code USING errcode = 'P0001';
  END IF;

  SELECT count(*) INTO recent_count
    FROM referral_attributions
   WHERE referral_code = p_code
     AND created_at > now() - interval '1 hour';
  IF recent_count >= 2 THEN
    RETURN;
  END IF;

  INSERT INTO referral_attributions (referral_code, plan, revenue_cents, discount_cents)
  VALUES (p_code, p_plan, p_revenue_cents, p_discount_cents);
END;
$function$;

-- Privileges are preserved across CREATE OR REPLACE. Production should remain
-- service_role-only after the existing hardening REVOKEs.

-- ============================================================================
-- Audit log for first-referral-bonus Edge Function attempts
-- Run in Supabase SQL Editor AFTER bonus-claim-rate-limit.sql, and BEFORE
-- (or re-run) definer-search-path-pin.sql.
-- Date: 2026-07-28
-- ============================================================================
--
-- WHY
--
-- supabase/functions/first-referral-bonus/index.ts calls the RevenueCat REST
-- API AFTER atomically claiming the bonus (check_first_referral_bonus).
--
-- Before the M-8 fix, ANY non-2xx response from RC unconditionally rolled the
-- claim back with:
--   UPDATE referrals SET first_bonus_granted_at = null WHERE code = $1
-- That is safe for a 4xx (RC rejected the request; nothing was granted) and
-- UNSAFE for a 5xx or a network timeout — in those cases RC may have granted
-- the entitlement anyway, and clearing the claim lets a retry double-grant.
--
-- M-8 fix (index.ts): 4xx → release claim; 5xx / timeout / network error →
-- LEAVE the claim in place and record the attempt. This table is the record.
--
-- It also gives the operator a queryable trail for RC-side reconciliation:
--   SELECT * FROM first_referral_bonus_attempts
--   WHERE outcome IN ('rc_5xx_held','rc_timeout_held','rc_network_held')
--   ORDER BY attempted_at DESC;
--
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.first_referral_bonus_attempts (
  id                bigserial PRIMARY KEY,
  attempted_at      timestamptz NOT NULL DEFAULT now(),
  referral_code     text        NOT NULL,
  idempotency_key   text        NOT NULL,
  granted_at_iso    text,
  outcome           text        NOT NULL,
  rc_status         int,
  rc_error_excerpt  text,
  CONSTRAINT first_referral_bonus_attempts_outcome_chk CHECK (outcome IN (
    'granted',
    'rc_4xx_released',
    'rc_5xx_held',
    'rc_timeout_held',
    'rc_network_held'
  ))
);

CREATE INDEX IF NOT EXISTS first_referral_bonus_attempts_code_time_idx
  ON public.first_referral_bonus_attempts (referral_code, attempted_at DESC);

CREATE INDEX IF NOT EXISTS first_referral_bonus_attempts_held_idx
  ON public.first_referral_bonus_attempts (attempted_at DESC)
  WHERE outcome IN ('rc_5xx_held','rc_timeout_held','rc_network_held');

-- Deny-by-default: only service_role (the Edge Function) writes here, and
-- nothing else reads it via PostgREST. Operators read it via the SQL editor,
-- which bypasses RLS.
ALTER TABLE public.first_referral_bonus_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.first_referral_bonus_attempts FROM anon, authenticated;
GRANT  ALL ON public.first_referral_bonus_attempts TO   service_role;
GRANT  USAGE, SELECT ON SEQUENCE public.first_referral_bonus_attempts_id_seq
  TO   service_role;

-- Add discount_cents column to referral_attributions.
-- Tracks the face-value discount applied per subscriber for the
-- tier-based referral model (PR #1194). The influencer earns this amount.
--
-- Existing rows get default 0 (pre-tier legacy attributions).
-- Run via Supabase dashboard SQL editor or `supabase db push`.

ALTER TABLE referral_attributions
  ADD COLUMN IF NOT EXISTS discount_cents integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN referral_attributions.discount_cents IS
  'Face-value discount in cents applied to this subscription. The referrer earns this amount.';

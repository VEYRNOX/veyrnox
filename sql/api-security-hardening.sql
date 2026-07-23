-- API security hardening migration
-- Run via Supabase dashboard SQL editor AFTER the base schemas
-- (referrals.sql, referral_attributions.sql, events.sql, generate-referral-code.sql,
-- add-discount-cents.sql) are in place.
--
-- Closes: open INSERT on events (spam), unbounded increment_referral (count
-- inflation → free tier upgrades), open INSERT/SELECT on referral_attributions
-- (fake revenue + info disclosure), unlimited generate_referral_code (code spam).
--
-- Approach: Postgres-level rate limiting via SECURITY DEFINER functions that
-- replace direct table access. RLS policies are tightened so the anon role
-- can only call these functions, never write rows directly.

-- ============================================================================
-- 1. EVENTS — rate-limited, validated INSERT via RPC
-- ============================================================================

-- Column constraints (safe to add on existing data — current values are small).
DO $$ BEGIN
  ALTER TABLE events ADD CONSTRAINT chk_event_length
    CHECK (length(event) <= 64);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE events ADD CONSTRAINT chk_metadata_size
    CHECK (octet_length(metadata::text) <= 4096);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Rate-limited insert function. Replaces direct anon INSERT.
CREATE OR REPLACE FUNCTION track_event(
  p_device_id uuid,
  p_event     text,
  p_metadata  jsonb DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  recent_count int;
BEGIN
  -- Allowlist: only known event names accepted.
  IF p_event NOT IN (
    'wallet_created', 'wallet_imported', 'session_start',
    'send_completed', 'receive_viewed', 'wc_session_approved',
    'backup_confirmed'
  ) THEN
    RAISE EXCEPTION 'Unknown event' USING errcode = 'P0003';
  END IF;

  -- Rate limit: max 60 events per device per hour.
  SELECT count(*) INTO recent_count
    FROM events
   WHERE device_id = p_device_id
     AND created_at > now() - interval '1 hour';

  IF recent_count >= 60 THEN
    RETURN; -- silent drop — client is fire-and-forget
  END IF;

  INSERT INTO events (device_id, event, metadata)
  VALUES (p_device_id, p_event, p_metadata);
END;
$$;

-- Remove direct INSERT — all writes go through track_event().
DROP POLICY IF EXISTS "anon insert" ON events;


-- ============================================================================
-- 2. REFERRAL INCREMENT — dedup table prevents count inflation
-- ============================================================================

CREATE TABLE IF NOT EXISTS referral_increments (
  code       text NOT NULL REFERENCES referrals(code),
  device_id  uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (code, device_id)
);

ALTER TABLE referral_increments ENABLE ROW LEVEL SECURITY;
-- No RLS policies = anon cannot touch this table directly.

-- Replace increment_referral: requires device_id, allows max 1 increment
-- per device per code. Idempotent — second call returns current count.
CREATE OR REPLACE FUNCTION increment_referral(ref_code text, p_device_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_count integer;
BEGIN
  IF p_device_id IS NULL THEN
    RAISE EXCEPTION 'device_id required' USING errcode = 'P0006';
  END IF;

  -- Already incremented by this device? Return current count (idempotent).
  IF EXISTS (
    SELECT 1 FROM referral_increments
     WHERE code = ref_code AND device_id = p_device_id
  ) THEN
    SELECT count INTO new_count FROM referrals WHERE code = ref_code;
    IF new_count IS NULL THEN
      RAISE EXCEPTION 'Code not found: %', ref_code USING errcode = 'P0001';
    END IF;
    RETURN new_count;
  END IF;

  -- Record the device so it can't increment again.
  INSERT INTO referral_increments (code, device_id)
  VALUES (ref_code, p_device_id);

  UPDATE referrals
     SET count = count + 1
   WHERE code = ref_code
  RETURNING count INTO new_count;

  IF new_count IS NULL THEN
    -- Rollback the increment record if the code doesn't exist.
    DELETE FROM referral_increments
     WHERE code = ref_code AND device_id = p_device_id;
    RAISE EXCEPTION 'Code not found: %', ref_code USING errcode = 'P0001';
  END IF;

  RETURN new_count;
END;
$$;


-- ============================================================================
-- 3. REFERRAL CODE GENERATION — 1 code per device, idempotent
-- ============================================================================

-- Track which device generated each code.
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS device_id uuid;

CREATE INDEX IF NOT EXISTS idx_referrals_device
  ON referrals (device_id) WHERE device_id IS NOT NULL;

-- Replace generate_referral_code: requires device_id, returns existing code
-- if one was already generated for this device.
CREATE OR REPLACE FUNCTION generate_referral_code(p_device_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  chars    text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result   text;
  existing text;
  i        int;
  byte_val int;
  raw      bytea;
  attempt  int := 0;
BEGIN
  IF p_device_id IS NULL THEN
    RAISE EXCEPTION 'device_id required' USING errcode = 'P0006';
  END IF;

  -- Idempotent: return existing code for this device.
  SELECT code INTO existing
    FROM referrals
   WHERE device_id = p_device_id
   LIMIT 1;
  IF existing IS NOT NULL THEN
    RETURN existing;
  END IF;

  LOOP
    attempt := attempt + 1;
    IF attempt > 10 THEN
      RAISE EXCEPTION 'Could not generate unique code after 10 attempts'
        USING errcode = 'P0002';
    END IF;

    raw := gen_random_bytes(6);
    result := 'VYX-';
    FOR i IN 0..5 LOOP
      byte_val := get_byte(raw, i);
      result := result || substr(chars, (byte_val % length(chars)) + 1, 1);
    END LOOP;

    BEGIN
      INSERT INTO referrals (code, device_id) VALUES (result, p_device_id);
      RETURN result;
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
  END LOOP;
END;
$$;


-- ============================================================================
-- 4. REFERRAL ATTRIBUTIONS — lock down direct access
-- ============================================================================

-- Remove anon INSERT/SELECT. All access via SECURITY DEFINER functions.
DROP POLICY IF EXISTS "public insert" ON referral_attributions;
DROP POLICY IF EXISTS "public select" ON referral_attributions;

-- Server-side attribution recording with validation + rate limit.
CREATE OR REPLACE FUNCTION record_attribution(
  p_code           text,
  p_plan           text,
  p_revenue_cents  int,
  p_discount_cents int DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  recent_count int;
BEGIN
  IF p_plan NOT IN ('monthly', 'annual') THEN
    RAISE EXCEPTION 'Invalid plan' USING errcode = 'P0007';
  END IF;

  IF p_revenue_cents < 0 OR p_revenue_cents > 100000 THEN
    RAISE EXCEPTION 'Invalid revenue' USING errcode = 'P0008';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM referrals WHERE code = p_code) THEN
    RAISE EXCEPTION 'Code not found: %', p_code USING errcode = 'P0001';
  END IF;

  -- Rate limit: max 2 attributions per code per hour (monthly + annual).
  SELECT count(*) INTO recent_count
    FROM referral_attributions
   WHERE referral_code = p_code
     AND created_at > now() - interval '1 hour';
  IF recent_count >= 2 THEN
    RETURN; -- silent drop
  END IF;

  INSERT INTO referral_attributions (referral_code, plan, revenue_cents, discount_cents)
  VALUES (p_code, p_plan, p_revenue_cents, p_discount_cents);
END;
$$;

-- Read-only functions for referral owner to query their own data.
CREATE OR REPLACE FUNCTION get_referral_earnings(p_code text)
RETURNS TABLE(plan text, revenue_cents integer, discount_cents integer, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
    SELECT ra.plan, ra.revenue_cents, ra.discount_cents, ra.created_at
      FROM referral_attributions ra
     WHERE ra.referral_code = p_code
     ORDER BY ra.created_at DESC
     LIMIT 1000;
END;
$$;

CREATE OR REPLACE FUNCTION get_referral_paid_count(p_code text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  c integer;
BEGIN
  SELECT count(*)::integer INTO c
    FROM referral_attributions
   WHERE referral_code = p_code;
  RETURN c;
END;
$$;


-- ============================================================================
-- 5. REFERRALS TABLE — keep SELECT (codes are public-facing), remove INSERT
-- ============================================================================

-- Codes are created via generate_referral_code() or registerCode's upsert.
-- registerCode still needs INSERT for client-generated codes (fallback when
-- Supabase RPC fails). Keep INSERT but add a rate-limit wrapper.

-- registerCode upsert wrapper — limits to 3 registrations per device per hour.
CREATE OR REPLACE FUNCTION register_referral_code(p_code text, p_device_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  recent_count int;
BEGIN
  IF p_device_id IS NOT NULL THEN
    SELECT count(*) INTO recent_count
      FROM referrals
     WHERE device_id = p_device_id
       AND created_at > now() - interval '1 hour';
    IF recent_count >= 3 THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO referrals (code, device_id)
  VALUES (p_code, p_device_id)
  ON CONFLICT (code) DO NOTHING;
END;
$$;

-- Remove direct INSERT — registration goes through register_referral_code().
DROP POLICY IF EXISTS "public insert" ON referrals;

-- Keep public SELECT on referrals (codes are shared by design, count is
-- vanity-only — paid subscriber count drives tier, not raw referral count).

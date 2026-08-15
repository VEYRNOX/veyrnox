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
    'backup_confirmed',
    'referral_code_applied', 'paywall_shown',
    'paywall_dismissed', 'paywall_converted'
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
--
-- Pre-first-publish rename: `ref_code` → `p_code` to match the naming
-- convention used by all sibling RPCs. This is a DROP+CREATE (Postgres can't
-- rename a param in place). Safe while 0 published clients exist — no version
-- skew. See CLAUDE.md "Open residuals".
DROP FUNCTION IF EXISTS increment_referral(text, uuid);
DROP FUNCTION IF EXISTS increment_referral(text);

CREATE OR REPLACE FUNCTION increment_referral(p_code text, p_device_id uuid DEFAULT NULL)
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
     WHERE code = p_code AND device_id = p_device_id
  ) THEN
    SELECT count INTO new_count FROM referrals WHERE code = p_code;
    IF new_count IS NULL THEN
      RAISE EXCEPTION 'Code not found: %', p_code USING errcode = 'P0001';
    END IF;
    RETURN new_count;
  END IF;

  -- Record the device so it can't increment again.
  INSERT INTO referral_increments (code, device_id)
  VALUES (p_code, p_device_id);

  UPDATE referrals
     SET count = count + 1
   WHERE code = p_code
  RETURNING count INTO new_count;

  IF new_count IS NULL THEN
    -- Rollback the increment record if the code doesn't exist.
    DELETE FROM referral_increments
     WHERE code = p_code AND device_id = p_device_id;
    RAISE EXCEPTION 'Code not found: %', p_code USING errcode = 'P0001';
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
--
-- H-1 (2026-07-28): rc_user_id is deliberately NOT a parameter. The referrer's
-- RevenueCat identity is set server-side from a verified RC webhook (see
-- sql/referral-rc-webhook.sql). Do not add a client-supplied variant; earlier
-- revs of sql/first-referral-bonus.sql did, and it was a self-serve
-- entitlement mint.
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

  -- Codex P2 2026-08-15: previously p_discount_cents was trusted entirely.
  -- A caller could submit p_revenue_cents=599 with p_discount_cents=1000000000
  -- (or -5000) and the tracker would report impossible positive/negative
  -- commission. Discount is money in the earnings view, so bound it the same
  -- way as revenue: non-negative and no larger than what was actually paid.
  IF p_discount_cents IS NULL OR p_discount_cents < 0 OR p_discount_cents > p_revenue_cents THEN
    RAISE EXCEPTION 'Invalid discount' USING errcode = 'P0010';
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

-- L-8 (2026-07-28 internal audit): record_attribution had no idempotency key,
-- so a retried purchase webhook (or a coerced retry) could book the same sale
-- twice within the rate-limit window and inflate paid-count / earnings. Until
-- a real client-supplied idempotency key (e.g. store transaction id) is
-- threaded through the RPC signature, collapse duplicates at rest with a
-- UNIQUE partial index on the natural key of an attribution within an hour
-- bucket, and dedup at read time so historical duplicates cannot skew payouts.
--
-- `AT TIME ZONE 'UTC'` is NOT cosmetic — without it this statement cannot run.
-- `created_at` is timestamptz, and date_trunc(text, timestamptz) is STABLE, not
-- IMMUTABLE, because its result depends on the session TimeZone. PostgreSQL
-- rejects a non-IMMUTABLE function in an index expression:
--
--   ERROR: 42P17: functions in index expression must be marked IMMUTABLE
--
-- Verified against veyrnox-prod on 2026-08-07 (run in a transaction and rolled
-- back): the original form errors, this form succeeds. So L-8 had never been
-- applied to any database and could not have been — the statement was dead on
-- arrival. Pinning the zone makes the expression immutable AND removes a
-- correctness trap: an hour bucket that shifted with the reader's session
-- timezone would silently change which rows count as duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS uq_referral_attributions_hour_dedup
  ON referral_attributions (
    referral_code,
    plan,
    revenue_cents,
    date_trunc('hour', created_at AT TIME ZONE 'UTC')
  );

-- Read-only functions for referral owner to query their own data.
CREATE OR REPLACE FUNCTION get_referral_earnings(p_code text)
RETURNS TABLE(plan text, revenue_cents integer, discount_cents integer, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  -- L-8: dedup by (plan, revenue_cents, hour) so a duplicate attribution
  -- that slipped in before uq_referral_attributions_hour_dedup existed
  -- (or via a future signature change) cannot double-count earnings.
  --
  -- AT TIME ZONE 'UTC' must match uq_referral_attributions_hour_dedup exactly.
  -- It is not required here (a query has no IMMUTABLE constraint), but if the
  -- read path bucketed by session timezone while the index bucketed by UTC, the
  -- two would disagree about which rows are "the same hour" for any session not
  -- on UTC — the write-side constraint and the read-side dedup would enforce
  -- different things. Change one, change all four sites in this file.
  RETURN QUERY
    WITH deduped AS (
      SELECT DISTINCT ON (ra.plan, ra.revenue_cents, date_trunc('hour', ra.created_at AT TIME ZONE 'UTC'))
             ra.plan, ra.revenue_cents, ra.discount_cents, ra.created_at
        FROM referral_attributions ra
       WHERE ra.referral_code = p_code
       ORDER BY ra.plan, ra.revenue_cents, date_trunc('hour', ra.created_at AT TIME ZONE 'UTC'),
                ra.created_at ASC
    )
    SELECT d.plan, d.revenue_cents, d.discount_cents, d.created_at
      FROM deduped d
     ORDER BY d.created_at DESC
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
  -- L-8: count distinct (plan, revenue_cents, hour) tuples so a duplicate
  -- attribution cannot inflate the paid count that drives tier upgrades.
  -- AT TIME ZONE 'UTC' must match uq_referral_attributions_hour_dedup — see the
  -- note in get_referral_earnings. This count drives TIER UPGRADES, so a bucket
  -- that disagreed with the index would hand out discounts on miscounted sales.
  SELECT count(*)::integer INTO c
    FROM (
      SELECT DISTINCT plan, revenue_cents, date_trunc('hour', created_at AT TIME ZONE 'UTC') AS hr
        FROM referral_attributions
       WHERE referral_code = p_code
    ) dedup;
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
--
-- H-1 (2026-07-28): rc_user_id is deliberately NOT a parameter here either;
-- see the note on generate_referral_code above.
--
-- INVARIANT (audit H-2, 2026-07-28): p_device_id is REQUIRED. A previous
-- signature accepted NULL and only rate-limited when NOT NULL, so a client
-- could bypass the 3/hour cap by omitting device_id and mint unlimited codes.
-- The rate-limit block therefore runs BEFORE any nullable guard, and NULL is
-- explicitly rejected. Do not add a DEFAULT back — every caller must pass a
-- device id from lib/deviceId.js (which itself fails closed on no-CSPRNG).
-- Codex P2 2026-08-15: `ON CONFLICT (code) DO NOTHING` silently dropped a
-- client-supplied code that happened to collide with an existing row. The
-- client kept displaying that code as its own even though every attribution
-- accrued to the pre-existing owner. Now returns the code that was actually
-- registered:
--   - happy path (unique) — insert p_code, return p_code
--   - collision — mint fresh Crockford-base32 codes server-side (same loop
--     shape as generate_referral_code) up to 8 tries, return the successful
--     code so the client can reconcile its local state
--   - rate limited or out of tries — return NULL; caller treats as retryable
-- Return type changes from void → text. Any caller (client or SQL) that
-- ignored the return before still works; the ones that reconcile now use it.
CREATE OR REPLACE FUNCTION register_referral_code(p_code text, p_device_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  recent_count int;
  alphabet     text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  attempt      text;
  i            int;
BEGIN
  IF p_device_id IS NULL THEN
    RAISE EXCEPTION 'device_id required' USING ERRCODE = '22004';
  END IF;

  SELECT count(*) INTO recent_count
    FROM referrals
   WHERE device_id = p_device_id
     AND created_at > now() - interval '1 hour';
  IF recent_count >= 3 THEN
    RETURN NULL;
  END IF;

  BEGIN
    INSERT INTO referrals (code, device_id) VALUES (p_code, p_device_id);
    RETURN p_code;
  EXCEPTION WHEN unique_violation THEN
    -- Fall through to server-side retry loop below.
    NULL;
  END;

  FOR i IN 1..8 LOOP
    attempt := 'VYX-' ||
      substr(alphabet, 1 + (floor(random() * 32))::int, 1) ||
      substr(alphabet, 1 + (floor(random() * 32))::int, 1) ||
      substr(alphabet, 1 + (floor(random() * 32))::int, 1) ||
      substr(alphabet, 1 + (floor(random() * 32))::int, 1) ||
      substr(alphabet, 1 + (floor(random() * 32))::int, 1) ||
      substr(alphabet, 1 + (floor(random() * 32))::int, 1);
    BEGIN
      INSERT INTO referrals (code, device_id) VALUES (attempt, p_device_id);
      RETURN attempt;
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
  END LOOP;

  -- Extremely unlikely — a 32^6 (~10^9) code space would need to be
  -- ~exhausted for 8 tries to all collide. Return NULL and let the client
  -- decide (retry later, surface an error, etc.).
  RETURN NULL;
END;
$$;

-- Remove direct INSERT — registration goes through register_referral_code().
DROP POLICY IF EXISTS "public insert" ON referrals;

-- Keep public SELECT on referrals (codes are shared by design, count is
-- vanity-only — paid subscriber count drives tier, not raw referral count).


-- ============================================================================
-- 6. EXECUTE lockdown — H-3 (2026-07-28 internal audit)
-- ============================================================================
--
-- Every SECURITY DEFINER function created above was shipped with the default
-- PUBLIC EXECUTE grant. `anon` is a member of PUBLIC, so PostgREST exposes
-- each one to the anon key baked into the client bundle. The primary H-3
-- finding is `record_attribution`: with only anon access, a caller can forge
-- revenue rows against any published referral code (subject to the 2/hr rate
-- limit and the $0–$1000 range), inflating a referrer's earnings display and
-- polluting the attribution table. Attribution recording belongs
-- server-side (Edge Function or webhook), never client-driven — REVOKE and
-- GRANT to service_role only, matching the pattern established by
-- check-first-referral-bonus-hardening.sql and decrement-referral-hardening.sql.
--
-- REVOKE from PUBLIC is required in addition to REVOKE from anon: revoking
-- the role alone leaves the PUBLIC grant intact and the function stays
-- reachable.
--
-- SHIP FILES ONLY. This migration is NOT executed by this PR. Owner must run
-- it manually after reviewing the client-impact notes below.
--
-- CLIENT IMPACT — the STILL OPEN batch below includes functions the client
-- currently calls with the anon key (see src/api/referralApi.js and
-- src/api/trackEvent.js). Running these REVOKEs without a matching client
-- refactor will break the referral + telemetry flows at runtime. The four
-- writes flagged (track_event, increment_referral, generate_referral_code,
-- register_referral_code) each need a decision — leave anon-callable (accept
-- current threat model, rely on rate limits), or move behind an Edge
-- Function. record_attribution has no such tension: revenue attribution
-- should not be client-authored, so this one is safe to REVOKE immediately.
-- The two read helpers (get_referral_earnings, get_referral_paid_count) are
-- called from the referral-owner UI on their own device; treat as decisions
-- pending the same review.
-- ============================================================================

-- H-3 primary — record_attribution: never client-authored. Safe to revoke.
REVOKE ALL ON FUNCTION public.record_attribution(text, text, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_attribution(text, text, int, int) FROM anon;
REVOKE ALL ON FUNCTION public.record_attribution(text, text, int, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_attribution(text, text, int, int) TO service_role;

-- STILL-OPEN batch from check-first-referral-bonus-hardening.sql.
-- WARNING: each of the following (except get_referral_leaderboard) currently
-- has a client caller with the anon key. Running these REVOKEs breaks the
-- app until callers move to a service-role path. Kept in this file so the
-- owner has one place to make the call.

REVOKE ALL ON FUNCTION public.track_event(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.track_event(uuid, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.track_event(uuid, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.track_event(uuid, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.increment_referral(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_referral(text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.increment_referral(text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_referral(text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.generate_referral_code(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_referral_code(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.generate_referral_code(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.generate_referral_code(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.register_referral_code(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_referral_code(text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.register_referral_code(text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.register_referral_code(text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_referral_earnings(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_referral_earnings(text) FROM anon;
REVOKE ALL ON FUNCTION public.get_referral_earnings(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_referral_earnings(text) TO service_role;

REVOKE ALL ON FUNCTION public.get_referral_paid_count(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_referral_paid_count(text) FROM anon;
REVOKE ALL ON FUNCTION public.get_referral_paid_count(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_referral_paid_count(text) TO service_role;

-- get_referral_leaderboard has no client caller — safe to revoke immediately.
REVOKE ALL ON FUNCTION public.get_referral_leaderboard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_referral_leaderboard() FROM anon;
REVOKE ALL ON FUNCTION public.get_referral_leaderboard() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_referral_leaderboard() TO service_role;

-- VERIFY (run after the migration; do not take the above on trust):
--   SELECT has_function_privilege('anon',
--     'public.record_attribution(text,text,int,int)', 'EXECUTE');   -- expect f
--   SELECT has_function_privilege('service_role',
--     'public.record_attribution(text,text,int,int)', 'EXECUTE');   -- expect t

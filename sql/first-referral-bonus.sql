-- ============================================================================
-- First-referral bonus — run in Supabase SQL Editor AFTER api-security-hardening.sql
-- Date: 2026-07-24
-- ============================================================================
--
-- Grants the REFERRER a 1-month free Safety Plus entitlement when their first
-- referee converts to a paid subscription. The bonus is granted server-side via
-- a Supabase Edge Function that calls the RevenueCat REST API — the RC secret
-- key never leaves the server.
--
-- Flow:
--   1. Client calls record_attribution (existing) after purchase
--   2. Client calls the first-referral-bonus Edge Function with the referral code
--   3. Edge Function calls check_first_referral_bonus() to verify eligibility
--   4. If eligible, Edge Function calls RC REST API to grant promotional entitlement
--   5. SQL marks bonus as granted (idempotent)

-- ============================================================================
-- BLOCK 1: Store the referrer's RevenueCat app_user_id
-- ============================================================================

ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS rc_user_id text;

-- ============================================================================
-- BLOCK 2: Bonus tracking — prevents double-granting
-- ============================================================================

ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS first_bonus_granted_at timestamptz;

-- ============================================================================
-- BLOCK 2b: Source-IP column for M-6 per-IP rate limiting (see Block 4)
-- ============================================================================
--
-- Populated best-effort from PostgREST's forwarded x-forwarded-for header at
-- code-mint time. Nullable — direct-SQL callers and requests without the
-- forwarded header degrade to the global ceiling only. Not indexed for the
-- hourly lookup because the table stays small (unique per device) and
-- created_at is already indexed; revisit if the row count outgrows a seq scan.

ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS client_ip text;

-- ============================================================================
-- BLOCK 3: Check + claim the first-referral bonus
--
-- !! SUPERSEDED — RUN sql/check-first-referral-bonus-hardening.sql AFTER THIS
-- !! FILE, AND NEVER RE-RUN THIS BLOCK ON ITS OWN AFTERWARDS.
--
-- This block uses CREATE OR REPLACE with an unchanged signature, so re-running
-- it silently reverts the hardened body and drops the pinned search_path. (The
-- REVOKE/GRANT would survive, since REPLACE preserves privileges — so the
-- damage would be quiet: still locked down, but racy again.)
--
-- Two defects, both fixed in the hardening migration:
--
--   1. Created with no GRANT/REVOKE, so the default PUBLIC grant made it
--      anon-callable. A third party holding a shared code could trip the claim
--      flag with no entitlement ever granted — burning the referrer's one-time
--      bonus — and read back the referrer's RevenueCat app_user_id.
--   2. The header below claimed "atomic" and "idempotent"; it was neither. The
--      SELECT-then-UPDATE let two concurrent callers both pass the guard, and
--      the return value did not depend on which one actually claimed, so both
--      got the rc_user_id and the referrer could be granted two free months.
--
-- The block is left in place, not deleted, so this file still reads as the
-- history of what was actually run.
-- ============================================================================
--
-- Returns the referrer's rc_user_id if:
--   1. The code exists and has a stored rc_user_id
--   2. The code has at least 1 paid attribution
--   3. The bonus has not already been granted
--
-- On success, sets first_bonus_granted_at. Returns NULL if ineligible or
-- already granted. (See the correction above: the original "atomically" and
-- "idempotent — second call returns NULL" in this comment were not true of
-- the code beneath it.)

CREATE OR REPLACE FUNCTION check_first_referral_bonus(p_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rc_user_id text;
  v_already_granted timestamptz;
  v_paid_count int;
BEGIN
  SELECT rc_user_id, first_bonus_granted_at
    INTO v_rc_user_id, v_already_granted
    FROM referrals
   WHERE code = p_code;

  IF v_rc_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_already_granted IS NOT NULL THEN
    RETURN NULL;
  END IF;

  SELECT count(*)::int INTO v_paid_count
    FROM referral_attributions
   WHERE referral_code = p_code;

  IF v_paid_count < 1 THEN
    RETURN NULL;
  END IF;

  UPDATE referrals
     SET first_bonus_granted_at = now()
   WHERE code = p_code
     AND first_bonus_granted_at IS NULL;

  RETURN v_rc_user_id;
END;
$$;

-- ============================================================================
-- BLOCK 4: Code generation / registration — rc_user_id is NOT taken from client
-- ============================================================================
--
-- H-1 (2026-07-28 internal audit): the previous versions of these functions
-- accepted p_rc_user_id from the CLIENT and wrote it directly onto the
-- referrals row. That was a self-serve entitlement mint: anyone who could
-- call the RPC (i.e. anyone with the app bundle's public anon key) could set
-- rc_user_id to a RevenueCat user of their choosing, then trigger
-- check_first_referral_bonus to have a promotional entitlement granted
-- against that arbitrary account.
--
-- OWNER DECISION: rc_user_id is server-authoritative — set only from a
-- verified RevenueCat webhook (see sql/referral-rc-webhook.sql, which adds
-- set_referral_rc_user() restricted to service_role). Client input is
-- REMOVED from this surface. Until the webhook is deployed, rc_user_id
-- stays NULL and check_first_referral_bonus returns NULL — i.e. the bonus
-- path is inert rather than exploitable (I4: fail closed).
--
-- Signatures below match sql/api-security-hardening.sql exactly, so running
-- this file is now idempotent with respect to that one — no DROP required.
-- (The old 3-arg overload cleanup remains a TODO at the bottom of the file,
-- gated on webhook rollout.)
--
-- Rate limiting (M-6, 2026-07-28 internal audit) — TWO DIMENSIONS:
--
--   1. Per-device (pre-existing): if the caller's device_id already owns a
--      code, return that code unchanged. This ISN'T a rate limit — it's
--      idempotency, and a coerced/malicious caller can trivially defeat it
--      by minting a fresh UUID on every call. The audit finding: without a
--      second dimension the endpoint mints unlimited codes per hour, letting
--      one caller enumerate the code namespace or exhaust the referrals
--      table.
--   2. NEW ceiling — hourly caps on ACTUAL insert throughput:
--        (a) per source-IP  <= 10 new codes / hour, when x-forwarded-for is
--            forwarded by PostgREST (Supabase does this by default).
--        (b) global fallback <= 500 new codes / hour across the whole table,
--            so a botnet that spreads across many IPs is still bounded.
--      Both apply only on the "mint a NEW code" branch — the idempotent
--      return of an existing code is never rate-limited.
--
--   Both limits RAISE (errcode P0007) rather than returning NULL, so the
--   client sees a clear "too many requests" surface rather than a
--   silently-swallowed miss. See register_referral_code for the return-void
--   pattern used elsewhere; that one has to stay silent because void, but
--   this function returns text and the caller relies on a non-null result.

CREATE OR REPLACE FUNCTION generate_referral_code(p_device_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  chars           text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result          text;
  existing        text;
  i               int;
  byte_val        int;
  raw             bytea;
  attempt         int := 0;
  v_client_ip     text;
  v_ip_count      int;
  v_global_count  int;
BEGIN
  IF p_device_id IS NULL THEN
    RAISE EXCEPTION 'device_id required' USING errcode = 'P0006';
  END IF;

  SELECT code INTO existing
    FROM referrals
   WHERE device_id = p_device_id
   LIMIT 1;

  IF existing IS NOT NULL THEN
    RETURN existing;
  END IF;

  -- Second-dimension rate limit (M-6): only when about to MINT a new code.
  -- current_setting(..., true) returns NULL if the GUC isn't set (missing
  -- true would raise), so this is safe to call outside of a PostgREST
  -- request context (e.g. direct SQL Editor use).
  BEGIN
    v_client_ip := split_part(
      coalesce(
        current_setting('request.headers', true)::json->>'x-forwarded-for',
        ''
      ),
      ',',
      1
    );
    v_client_ip := nullif(btrim(v_client_ip), '');
  EXCEPTION WHEN others THEN
    -- Malformed headers GUC — treat as no IP, fall back to global bucket.
    v_client_ip := NULL;
  END;

  IF v_client_ip IS NOT NULL THEN
    SELECT count(*)::int INTO v_ip_count
      FROM referrals
     WHERE created_at > now() - interval '1 hour'
       AND client_ip = v_client_ip;
    IF v_ip_count >= 10 THEN
      RAISE EXCEPTION 'rate limit: too many codes generated from this source'
        USING errcode = 'P0007';
    END IF;
  END IF;

  SELECT count(*)::int INTO v_global_count
    FROM referrals
   WHERE created_at > now() - interval '1 hour';
  IF v_global_count >= 500 THEN
    RAISE EXCEPTION 'rate limit: global generation ceiling reached, retry shortly'
      USING errcode = 'P0007';
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
      INSERT INTO referrals (code, device_id, client_ip)
      VALUES (result, p_device_id, v_client_ip);
      RETURN result;
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
  END LOOP;
END;
$$;

-- INVARIANT (audit H-2, 2026-07-28): p_device_id is REQUIRED. The prior
-- signature accepted NULL and only rate-limited when NOT NULL — a client
-- could bypass the 3/hour cap by omitting device_id and mint unlimited
-- codes. Rate-limit runs BEFORE any nullable guard; NULL is rejected. Do
-- not add a DEFAULT back — every caller must pass a device id from
-- lib/deviceId.js (which itself fails closed when no CSPRNG is available).
--
-- DROP + CREATE, not CREATE OR REPLACE (learned 2026-08-10 applying to prod):
-- earlier revisions of this file shipped the same (text, uuid) signature with
-- `p_device_id uuid DEFAULT NULL`. CREATE OR REPLACE cannot strip a default —
-- it fails with 42P13 "cannot remove parameter defaults from existing function"
-- — so an environment that ran the older file blocks the new one at exactly
-- the point that removes the H-2 bypass. The DROP is IF EXISTS so a fresh
-- environment (or a re-run of this file) still works: it becomes a no-op there
-- and the CREATE runs. Signature is stable and every caller passes
-- p_device_id already (referralApi.js), so this is not a client-visible change.
DROP FUNCTION IF EXISTS public.register_referral_code(text, uuid);

CREATE FUNCTION register_referral_code(p_code text, p_device_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  recent_count int;
BEGIN
  IF p_device_id IS NULL THEN
    RAISE EXCEPTION 'device_id required' USING ERRCODE = '22004';
  END IF;

  SELECT count(*) INTO recent_count
    FROM referrals
   WHERE device_id = p_device_id
     AND created_at > now() - interval '1 hour';
  IF recent_count >= 3 THEN
    RETURN;
  END IF;

  INSERT INTO referrals (code, device_id)
  VALUES (p_code, p_device_id)
  ON CONFLICT (code) DO NOTHING;
END;
$$;

-- TODO(H-1): drop the old 3-arg signatures that shipped in earlier revs of
-- this file on any environment that already ran the previous version. Do this
-- ONLY after sql/referral-rc-webhook.sql is deployed, so no callers depend on
-- the client-supplied variant:
--
--   DROP FUNCTION IF EXISTS generate_referral_code(uuid, text);
--   DROP FUNCTION IF EXISTS register_referral_code(text, uuid, text);
--
-- Left as a comment rather than executed here because CREATE OR REPLACE above
-- does not remove the old overloads — PostgreSQL treats different parameter
-- lists as distinct functions. Owner runs this after webhook rollout.

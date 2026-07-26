-- ============================================================================
-- VEYRNOX — consolidated live remediation, 2026-07-26
--
-- Paste the whole file into the Supabase SQL Editor and run it once.
-- The editor wraps the script in a single transaction, so it is all-or-nothing:
-- if any statement fails, nothing is applied and you can fix and re-run.
-- Every statement is idempotent — running it twice is safe.
--
-- The last statement returns a PASS/FAIL table. Read it. Do not assume success
-- from the absence of an error.
-- ============================================================================
--
-- WHAT THIS IS
--
-- The ordered remediation for what was VERIFIED live against this project on
-- 2026-07-26 by probing the REST API with the public anon key. Not a guess from
-- reading migrations — the migrations turned out not to describe the deployed
-- state.
--
-- CONFIRMED LIVE AND EXPLOITABLE (this file closes both):
--
--   1. referrals is world-readable. GET /rest/v1/referrals returned HTTP 206
--      with Content-Range */222 — all 222 codes, and device_id with them. RLS is
--      ROW-level, so the "public select using (true)" policy exposes every
--      column, not the two the client reads.
--
--   2. decrement_referral(p_code) is anon-callable. POST returned HTTP 204 — it
--      exists and executes for anyone holding the anon key, with no device
--      binding, no dedup and no rate limit. Chained with (1): read all 222
--      codes, then zero any referrer's count and their discount tier with it.
--
-- ALSO FOUND, AND CLOSED HERE:
--
--   3. Two unhardened function overloads are present in the database:
--      increment_referral(ref_code text) and generate_referral_code().
--      Neither is currently REACHABLE — PostgREST answers PGRST203 "could not
--      choose the best candidate" because a hardened overload shadows each. That
--      is an accident of overload resolution, not a control: drop the hardened
--      sibling and the unhardened one becomes callable. They are removed.
--
-- NOT PRESENT, SO NOT ADDRESSED HERE:
--
--   sql/first-referral-bonus.sql has never been run — rc_user_id and
--   first_bonus_granted_at do not exist (42703) and check_first_referral_bonus
--   is absent (PGRST202). The bonus-burn and RevenueCat-ID disclosure were
--   never live. Provisioning that feature is a separate, deliberate act; it is
--   not folded in here.
--
-- ── ONE BEHAVIOUR CHANGE YOU SHOULD EXPECT ─────────────────────────────────
--
-- Section 2 revokes anon's direct SELECT on referrals. The Play internal-track
-- build reads the referral count with .from('referrals') and will stop getting
-- it — fetchStatus() converts the permission error to null in its own catch,
-- and ReferralTracker renders a neutral state rather than a fake count (that
-- path is covered by ReferralTracker.syncFailure.test.jsx). Testers see the
-- count unavailable until they update to a build carrying get_referral_count().
--
-- That is the only client-visible effect. The redemption path is deliberately
-- left alone — see SECTION 7.
--
-- ============================================================================


-- ============================================================================
-- SECTION 1 — PREFLIGHT. Abort before changing anything if the definer RPCs
-- the app depends on are missing, because Sections 2 and 5 revoke the direct
-- table access those RPCs replace. Locking the tables without them would take
-- the app down.
-- ============================================================================
DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(f, ', ' ORDER BY f) INTO missing
    FROM unnest(ARRAY[
      'track_event', 'record_attribution', 'get_referral_earnings',
      'get_referral_paid_count', 'register_referral_code', 'increment_referral',
      'generate_referral_code'
    ]) AS f
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = f
   );

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION
      'PREFLIGHT FAILED — missing RPC(s): %. Run sql/api-security-hardening.sql first; revoking table access without these would break the app.',
      missing;
  END IF;

  IF to_regclass('public.referral_increments') IS NULL THEN
    RAISE EXCEPTION
      'PREFLIGHT FAILED — referral_increments is missing. Run sql/api-security-hardening.sql first.';
  END IF;

  RAISE NOTICE 'preflight OK';
END $$;


-- ============================================================================
-- SECTION 2 — CLOSE LIVE HOLE #1: referrals is world-readable.
--
-- Replaces the one direct table read in the client (fetchStatus) with an RPC
-- that takes a code and returns a single integer. That removes the column
-- exposure AND the enumeration: ?select=code,count with no filter currently
-- dumps every code and its count.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_referral_count(p_code text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_count int;
BEGIN
  SELECT r.count INTO v_count
    FROM public.referrals r
   WHERE r.code = p_code;
  -- NULL for an unknown code; fetchStatus maps that to null exactly as the old
  -- .single() miss did. Not an exception — an unknown code is ordinary input.
  RETURN v_count;
END;
$$;

-- This one IS meant to be anon-callable, unlike decrement_referral below. The
-- REVOKE-then-GRANT makes that an explicit decision rather than the default
-- PUBLIC grant Postgres applies to every new function.
REVOKE ALL ON FUNCTION public.get_referral_count(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_referral_count(text) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "public select" ON public.referrals;
DROP POLICY IF EXISTS "public insert" ON public.referrals;
DROP POLICY IF EXISTS "public update" ON public.referrals;

-- Belt and braces alongside RLS: with grants revoked the table stays shut even
-- if RLS is ever disabled on it by accident. Definer RPCs run as the owner and
-- are unaffected.
REVOKE ALL ON TABLE public.referrals FROM anon;
REVOKE ALL ON TABLE public.referrals FROM authenticated;


-- ============================================================================
-- SECTION 3 — CLOSE LIVE HOLE #2: decrement_referral is anon-callable.
--
-- Rebuilds it as a service_role-only, device-scoped, idempotent reversal. The
-- referral_increments row that authorised the original +1 becomes the
-- authorisation for the -1, so a caller can only undo one specific device's
-- increment rather than decrement an arbitrary code arbitrarily far.
--
-- Signature change is free: decrement_referral has no caller anywhere in the
-- codebase — only its own definition and a design-doc mention.
-- ============================================================================
DROP FUNCTION IF EXISTS public.decrement_referral(text);
DROP FUNCTION IF EXISTS public.decrement_referral(text, uuid);

CREATE FUNCTION public.decrement_referral(p_code text, p_device_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_count integer;
BEGIN
  IF p_device_id IS NULL THEN
    RAISE EXCEPTION 'device_id required' USING errcode = 'P0006';
  END IF;

  DELETE FROM public.referral_increments
   WHERE code = p_code
     AND device_id = p_device_id;

  -- FOUND comes from the DELETE. Deliberately not GET DIAGNOSTICS ... =
  -- ROW_COUNT: that yields an integer and Postgres has no assignment cast from
  -- integer to boolean.
  IF NOT FOUND THEN
    -- Nothing was counted for this device, so there is nothing to reverse.
    -- Idempotent: a replayed refund webhook is expected, not an error.
    SELECT r.count INTO new_count FROM public.referrals r WHERE r.code = p_code;
    IF new_count IS NULL THEN
      RAISE EXCEPTION 'Code not found: %', p_code USING errcode = 'P0001';
    END IF;
    RETURN new_count;
  END IF;

  UPDATE public.referrals
     SET count = GREATEST(count - 1, 0)
   WHERE code = p_code
  RETURNING count INTO new_count;

  IF new_count IS NULL THEN
    -- Unreachable in practice: referral_increments.code is FK-constrained to
    -- referrals(code). No compensating INSERT — RAISE aborts the transaction,
    -- which rolls the DELETE back, so the ledger repairs itself.
    RAISE EXCEPTION 'Code not found: %', p_code USING errcode = 'P0001';
  END IF;

  RETURN new_count;
END;
$$;

REVOKE ALL ON FUNCTION public.decrement_referral(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decrement_referral(text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.decrement_referral(text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_referral(text, uuid) TO service_role;


-- ============================================================================
-- SECTION 4 — REMOVE THE UNHARDENED OVERLOADS.
--
-- Both DROPs name the OLD argument types only, so neither can touch the
-- hardened sibling the app actually calls:
--
--   increment_referral(text)        drops increment_referral(ref_code text)
--                                   KEEPS  increment_referral(ref_code, p_device_id)
--   generate_referral_code()        drops the zero-arg orphan
--                                   KEEPS  generate_referral_code(p_device_id)
--
-- DROP FUNCTION matches on argument TYPES, not parameter names, which is why
-- these work against the ref_code-named versions currently deployed.
--
-- The single-arg increment does an unconditional count = count + 1 with no
-- device binding — the count-inflation attack the referral_increments dedup
-- table was built to stop. The zero-arg generate mints codes with no device_id
-- and no rate limit. Neither is reachable today only because PostgREST cannot
-- resolve the ambiguity; that is not a control worth keeping.
-- ============================================================================
DROP FUNCTION IF EXISTS public.increment_referral(text);
DROP FUNCTION IF EXISTS public.generate_referral_code();


-- ============================================================================
-- SECTION 5 — LOCK DOWN THE REMAINING TABLES.
--
-- Every one of these policies is created by a base file in supabase/ and
-- dropped by sql/api-security-hardening.sql, so the hardening only ever held
-- while the two were run in that order and the base file was never re-run.
-- These drops are the repair; the base files in the repo no longer recreate
-- them.
--
-- events: all writes go through track_event() — allowlist, 60/device/hour,
--   4 KB metadata cap. Verified live and enforcing (an invalid event name
--   returns P0003 'Unknown event'). There is no read path by design.
-- referral_attributions: record_attribution / get_referral_earnings /
--   get_referral_paid_count. Public SELECT re-disclosed the revenue ledger,
--   including discount_cents, which was added AFTER the policy was written.
-- ============================================================================
DROP POLICY IF EXISTS "anon insert" ON public.events;
REVOKE ALL ON TABLE public.events FROM anon;
REVOKE ALL ON TABLE public.events FROM authenticated;

DROP POLICY IF EXISTS "public insert" ON public.referral_attributions;
DROP POLICY IF EXISTS "public select" ON public.referral_attributions;
REVOKE ALL ON TABLE public.referral_attributions FROM anon;
REVOKE ALL ON TABLE public.referral_attributions FROM authenticated;

ALTER TABLE public.referral_increments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.referral_increments FROM anon;
REVOKE ALL ON TABLE public.referral_increments FROM authenticated;


-- ============================================================================
-- SECTION 6 — PIN search_path ON EVERY SECURITY DEFINER FUNCTION.
--
-- A definer function that resolves object names through a caller-controlled
-- search_path lets whoever can create an object in an earlier schema decide
-- what it executes. Nothing in this project pinned its path before today.
--
-- Value is public, extensions, pg_temp:
--   extensions is REQUIRED — generate_referral_code calls gen_random_bytes(),
--     which is pgcrypto, and Supabase installs extensions into the `extensions`
--     schema. Pinning to public alone breaks referral-code generation outright.
--   pg_temp is named EXPLICITLY and LAST — when unnamed, Postgres searches the
--     temp schema FIRST for relations, which is the shadowing hole itself.
--   pg_catalog is omitted because it is always searched implicitly.
--
-- Catalog-driven rather than a hardcoded list so a mistyped signature cannot
-- silently skip one. Skips functions that already carry a pin, so it will not
-- downgrade the two above from the stricter search_path = ''.
-- ============================================================================
DO $$
DECLARE
  fn      record;
  pinned  int := 0;
BEGIN
  FOR fn IN
    -- %I.%I rather than oid::regprocedure: regprocedure omits the schema when
    -- the function is visible in the current search_path, which would emit an
    -- ALTER that re-resolves through the mechanism being removed.
    SELECT format('%I.%I(%s)', n.nspname, p.proname,
                  pg_get_function_identity_arguments(p.oid)) AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
       AND NOT EXISTS (
         SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS cfg
          WHERE cfg LIKE 'search_path=%'
       )
     ORDER BY 1
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions, pg_temp', fn.sig);
    pinned := pinned + 1;
    RAISE NOTICE 'pinned search_path on %', fn.sig;
  END LOOP;
  RAISE NOTICE 'search_path pinned on % function(s)', pinned;
END $$;


-- ============================================================================
-- SECTION 7 — DEFERRED, ON PURPOSE: the increment_referral ref_code → p_code
-- rename. LEFT COMMENTED OUT. Do not uncomment today.
--
-- The deployed database has increment_referral(ref_code text, p_device_id uuid).
-- src/api/referralApi.js on main calls p_code. Play release 5 (uploaded
-- 2026-07-22) predates the 2026-07-24 rename, so the INSTALLED build calls
-- ref_code and works right now. Running this block renames the parameter and
-- that build immediately starts getting PGRST202 on every redemption.
--
-- Run it in the same change window as shipping a client build from main —
-- not before.
--
-- DROP FUNCTION IF EXISTS public.increment_referral(text, uuid);
--
-- CREATE FUNCTION public.increment_referral(p_code text, p_device_id uuid DEFAULT NULL)
-- RETURNS integer
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public, extensions, pg_temp
-- AS $fn$
-- DECLARE
--   new_count integer;
-- BEGIN
--   IF p_device_id IS NULL THEN
--     RAISE EXCEPTION 'device_id required' USING errcode = 'P0006';
--   END IF;
--
--   IF EXISTS (SELECT 1 FROM referral_increments
--               WHERE code = p_code AND device_id = p_device_id) THEN
--     SELECT count INTO new_count FROM referrals WHERE code = p_code;
--     IF new_count IS NULL THEN
--       RAISE EXCEPTION 'Code not found: %', p_code USING errcode = 'P0001';
--     END IF;
--     RETURN new_count;
--   END IF;
--
--   INSERT INTO referral_increments (code, device_id) VALUES (p_code, p_device_id);
--
--   UPDATE referrals SET count = count + 1
--    WHERE code = p_code
--   RETURNING count INTO new_count;
--
--   IF new_count IS NULL THEN
--     DELETE FROM referral_increments
--      WHERE code = p_code AND device_id = p_device_id;
--     RAISE EXCEPTION 'Code not found: %', p_code USING errcode = 'P0001';
--   END IF;
--
--   RETURN new_count;
-- END;
-- $fn$;
-- ============================================================================


-- ============================================================================
-- SECTION 8 — VERIFY. This is the last statement, so its result is what the
-- editor shows you. Every row must read PASS.
-- ============================================================================
SELECT ord, check_name, status, detail
FROM (
  SELECT 1 AS ord,
         'referrals: no policies' AS check_name,
         CASE WHEN NOT EXISTS (SELECT 1 FROM pg_policies
                                WHERE schemaname='public' AND tablename='referrals')
              THEN 'PASS' ELSE 'FAIL' END AS status,
         coalesce((SELECT string_agg(policyname, ', ') FROM pg_policies
                    WHERE schemaname='public' AND tablename='referrals'), '—') AS detail
  UNION ALL
  SELECT 2, 'referral_attributions: no policies',
         CASE WHEN NOT EXISTS (SELECT 1 FROM pg_policies
                                WHERE schemaname='public' AND tablename='referral_attributions')
              THEN 'PASS' ELSE 'FAIL' END,
         coalesce((SELECT string_agg(policyname, ', ') FROM pg_policies
                    WHERE schemaname='public' AND tablename='referral_attributions'), '—')
  UNION ALL
  SELECT 3, 'events: no policies',
         CASE WHEN NOT EXISTS (SELECT 1 FROM pg_policies
                                WHERE schemaname='public' AND tablename='events')
              THEN 'PASS' ELSE 'FAIL' END,
         coalesce((SELECT string_agg(policyname, ', ') FROM pg_policies
                    WHERE schemaname='public' AND tablename='events'), '—')
  UNION ALL
  -- has_table_privilege rather than information_schema.role_table_grants: that
  -- view only shows grants where the grantor or grantee is a CURRENTLY ENABLED
  -- role, so it can report nothing for anon even when grants exist. This asks
  -- the authoritative question directly.
  SELECT 4, 'anon: no table privileges',
         CASE WHEN NOT EXISTS (
                SELECT 1
                  FROM (VALUES ('public.referrals'), ('public.events'),
                               ('public.referral_attributions'), ('public.referral_increments')) AS t(tbl)
                  CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS pr(priv)
                 WHERE has_table_privilege('anon', t.tbl, pr.priv))
              THEN 'PASS' ELSE 'FAIL' END,
         coalesce((SELECT string_agg(t.tbl || ':' || pr.priv, ', ')
                     FROM (VALUES ('public.referrals'), ('public.events'),
                                  ('public.referral_attributions'), ('public.referral_increments')) AS t(tbl)
                     CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS pr(priv)
                    WHERE has_table_privilege('anon', t.tbl, pr.priv)), '—')
  UNION ALL
  SELECT 5, 'decrement_referral: not anon-callable',
         CASE WHEN to_regprocedure('public.decrement_referral(text,uuid)') IS NULL THEN 'FAIL'
              WHEN has_function_privilege('anon',
                     to_regprocedure('public.decrement_referral(text,uuid)')::oid, 'EXECUTE') THEN 'FAIL'
              ELSE 'PASS' END,
         'service_role only'
  UNION ALL
  SELECT 6, 'get_referral_count: anon-callable',
         CASE WHEN to_regprocedure('public.get_referral_count(text)') IS NOT NULL
               AND has_function_privilege('anon',
                     to_regprocedure('public.get_referral_count(text)')::oid, 'EXECUTE')
              THEN 'PASS' ELSE 'FAIL' END,
         'replaces the direct table read'
  UNION ALL
  SELECT 7, 'increment_referral: one overload only',
         CASE WHEN (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                     WHERE n.nspname='public' AND p.proname='increment_referral') = 1
              THEN 'PASS' ELSE 'FAIL' END,
         coalesce((SELECT string_agg(p.oid::regprocedure::text, ' | ')
                     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                    WHERE n.nspname='public' AND p.proname='increment_referral'), '—')
  UNION ALL
  SELECT 8, 'generate_referral_code: one overload only',
         CASE WHEN (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                     WHERE n.nspname='public' AND p.proname='generate_referral_code') = 1
              THEN 'PASS' ELSE 'FAIL' END,
         coalesce((SELECT string_agg(p.oid::regprocedure::text, ' | ')
                     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                    WHERE n.nspname='public' AND p.proname='generate_referral_code'), '—')
  UNION ALL
  SELECT 9, 'all SECURITY DEFINER fns pinned',
         CASE WHEN NOT EXISTS (
                SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.prosecdef
                   AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) c
                                    WHERE c LIKE 'search_path=%'))
              THEN 'PASS' ELSE 'FAIL' END,
         coalesce((SELECT string_agg(p.oid::regprocedure::text, ', ')
                     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                    WHERE n.nspname='public' AND p.prosecdef
                      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) c
                                       WHERE c LIKE 'search_path=%')), 'none unpinned')
) checks
ORDER BY ord;


-- ============================================================================
-- AFTER RUNNING — confirm from the outside, with the anon key, that the two
-- live holes are actually shut. Both should now fail:
--
--   curl -s -o /dev/null -w '%{http_code}\n' \
--     -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
--     "$SUPABASE_URL/rest/v1/referrals?select=code&limit=1"
--   # was 200/206 with rows — expect 401
--
--   curl -s -X POST -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
--     -H 'Content-Type: application/json' \
--     -d '{"p_code":"__probe_nonexistent__"}' \
--     "$SUPABASE_URL/rest/v1/rpc/decrement_referral"
--   # was HTTP 204 — expect 404 PGRST202 (renamed signature) or 42501
--
-- STILL OUTSTANDING AFTER THIS FILE:
--   - Section 7 rename, paired with a client build from main.
--   - sql/first-referral-bonus.sql + bonus-claim-rate-limit.sql, if and when
--     the first-referral bonus is actually deployed.
--   - The Edge Function is still undeployed; deploy WITHOUT --no-verify-jwt.
-- ============================================================================

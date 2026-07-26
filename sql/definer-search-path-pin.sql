-- ============================================================================
-- Pin search_path on every SECURITY DEFINER function — run in Supabase SQL
-- Editor LAST, after every other file in sql/ and supabase/.
-- Date: 2026-07-26
-- ============================================================================
--
-- WHY
--
-- A SECURITY DEFINER function runs with its owner's privileges. If it resolves
-- an object name through a caller-controlled search_path, whoever can create an
-- object in an earlier schema decides what the function actually executes —
-- the standard privilege-escalation vector against definer-rights functions.
-- The fix is to pin the path as part of the function definition so the caller's
-- setting is irrelevant.
--
-- Until now NO function in this repo did that. `git grep search_path` over sql/
-- and supabase/ returned zero results before 2026-07-26. decrement_referral and
-- check_first_referral_bonus were pinned in their own hardening migrations;
-- this file covers everything else.
--
-- HOW — AND WHY NOT `search_path = ''`
--
-- The two functions already hardened use `SET search_path = ''` with every
-- object reference schema-qualified, which is the strictest form. That is not
-- available here without rewriting eight function bodies that cannot be tested
-- in this environment, and an untested rewrite of live RPCs to close a
-- lower-severity finding is a bad trade.
--
-- So this migration uses ALTER FUNCTION ... SET, which pins the path WITHOUT
-- touching a single line of any function body. The bodies keep their existing
-- unqualified references and keep working, and the caller's search_path stops
-- mattering — which is the entire point of the finding.
--
-- The value is `public, extensions, pg_temp`:
--
--   public      — where every table these functions touch lives (referrals,
--                 events, referral_increments, referral_attributions).
--   extensions  — REQUIRED, not decorative. generate_referral_code calls
--                 gen_random_bytes(), which is pgcrypto, and Supabase installs
--                 extensions into the `extensions` schema rather than public.
--                 Pinning to `public, pg_temp` alone would make every call to
--                 generate_referral_code fail with "function gen_random_bytes
--                 does not exist" — i.e. no new referral codes, at all. If the
--                 schema is absent on some project, Postgres silently ignores
--                 unknown schemas in search_path, so naming it is safe either
--                 way.
--   pg_temp     — listed EXPLICITLY, and listed LAST, on purpose. When pg_temp
--                 is not named, Postgres searches the temporary schema FIRST
--                 for relation names, which is precisely the shadowing hole
--                 being closed: any caller could create a temp table named
--                 `referrals` and have a definer function read it instead.
--                 Naming it last demotes it behind public.
--
-- pg_catalog is not listed because Postgres always searches it implicitly when
-- it is not named, so now(), count() and GREATEST() resolve regardless.
--
-- WHAT IT TOUCHES
--
-- The loop below pins every SECURITY DEFINER function in `public` that does not
-- already have a search_path setting. On a database that has run every prior
-- migration in order, that is exactly these eight:
--
--   track_event(uuid, text, jsonb)              -- telemetry-events-allowlist.sql
--   increment_referral(text, uuid)              -- api-security-hardening.sql
--   record_attribution(text, text, int, int)    -- api-security-hardening.sql
--   get_referral_earnings(text)                 -- api-security-hardening.sql
--   get_referral_paid_count(text)               -- api-security-hardening.sql
--   generate_referral_code(uuid, text)          -- first-referral-bonus.sql
--   register_referral_code(text, uuid, text)    -- first-referral-bonus.sql
--   get_referral_leaderboard()                  -- growth-backend-changes.sql
--
-- It deliberately SKIPS functions that already have a pin, so it will not
-- downgrade decrement_referral or check_first_referral_bonus from their
-- stricter `search_path = ''`.
--
-- It is written as a catalog-driven loop rather than eight hardcoded ALTERs so
-- that it cannot be defeated by a signature I mistyped, and so that re-running
-- it after any future migration re-pins whatever that migration reset.
--
-- RE-RUN THIS AFTER RE-RUNNING ANY OTHER sql/ FILE. CREATE OR REPLACE FUNCTION
-- resets attributes that the new definition does not restate, so replacing a
-- function drops its pin while keeping its privileges — quietly leaving it
-- locked down but unpinned.
--
-- STATUS: NOT VERIFIED. This SQL has not been executed; there is no Postgres or
-- Docker in the environment it was written in. It is real only once run.

-- ----------------------------------------------------------------------------
-- Pin.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  fn record;
  pinned int := 0;
BEGIN
  FOR fn IN
    -- Built with %I.%I rather than oid::regprocedure on purpose: regprocedure
    -- OMITS the schema when the function happens to be visible in the current
    -- search_path, which would emit an ALTER that re-resolves through the very
    -- mechanism this migration exists to stop relying on. %I also quotes any
    -- identifier that needs it. pg_get_function_identity_arguments gives
    -- exactly the argument list ALTER FUNCTION needs to identify an overload,
    -- and returns '' for a zero-arg function, yielding a bare "name()".
    SELECT format('%I.%I(%s)', n.nspname, p.proname,
                  pg_get_function_identity_arguments(p.oid)) AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef                       -- SECURITY DEFINER only
       AND NOT EXISTS (
         SELECT 1
           FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS cfg
          WHERE cfg LIKE 'search_path=%'     -- already pinned; leave alone
       )
     ORDER BY 1
  LOOP
    -- fn.sig is assembled from system-catalog data through format's %I, not
    -- from any caller-supplied value, so there is no injection surface here.
    EXECUTE format(
      'ALTER FUNCTION %s SET search_path = public, extensions, pg_temp',
      fn.sig
    );
    pinned := pinned + 1;
    RAISE NOTICE 'pinned search_path on %', fn.sig;
  END LOOP;

  RAISE NOTICE 'search_path pinned on % function(s)', pinned;
END $$;

-- ----------------------------------------------------------------------------
-- Verify, in the same run. Fails the migration loudly if anything was missed,
-- rather than reporting success and leaving the finding half-closed (I4).
--
-- The SQL Editor runs the whole script as one transaction, so a failure here
-- rolls the pins back too: the migration is all-or-nothing, and a partial pin
-- can never be mistaken for a complete one. This can only fire if the loop's
-- predicate and this one disagree — i.e. it is a check on the logic above, not
-- on the database.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  unpinned text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text)
    INTO unpinned
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosecdef
     AND NOT EXISTS (
       SELECT 1
         FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS cfg
        WHERE cfg LIKE 'search_path=%'
     );

  IF unpinned IS NOT NULL THEN
    RAISE EXCEPTION
      'SECURITY DEFINER function(s) still without a pinned search_path: %',
      unpinned;
  END IF;

  RAISE NOTICE 'verified: every SECURITY DEFINER function in public is pinned';
END $$;

-- ----------------------------------------------------------------------------
-- VERIFY MANUALLY TOO (do not take the above on trust)
--
--   -- Every SECURITY DEFINER function and its pin. Expect a search_path entry
--   -- on every row; decrement_referral and check_first_referral_bonus show
--   -- {search_path=""}, the rest {"search_path=public, extensions, pg_temp"}.
--   SELECT p.oid::regprocedure AS fn, p.proconfig
--     FROM pg_proc p
--     JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.prosecdef
--    ORDER BY 1;
--
--   -- Referral code generation must still work — this is the call that would
--   -- break if `extensions` were missing from the path. Expect a VYX- code.
--   SELECT public.generate_referral_code(gen_random_uuid(), NULL);
--
--   -- And telemetry must still insert. Expect no error.
--   SELECT public.track_event(gen_random_uuid(), 'session_start', '{}'::jsonb);
-- ----------------------------------------------------------------------------

-- ============================================================================
-- STILL OPEN
-- ============================================================================
--
-- This closes the search_path finding only. The default PUBLIC EXECUTE grant
-- remains on the eight functions above. That is NOT a blanket bug: most are
-- called directly by the client with the anon key and are meant to be
-- anon-callable, which is why they were not swept up with decrement_referral
-- and check_first_referral_bonus (those two had no client caller at all).
-- Each of the eight needs an individual decision about who should be able to
-- call it. See docs/security-diffs/diff-2026-07-26.md.

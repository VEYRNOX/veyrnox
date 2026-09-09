-- =============================================================================
-- Prod / staging parity audit — 2026-09-09
--
-- TARGET (for the remediation stages): jwstkrtslotnjyerzzsi  "Veyrnox PRODUCTION (live)"
-- REFERENCE (already in the desired state):  nszlbcmcysftwyudthjz  "veyrnox-STAGING"
--
-- Confirm the ref in the dashboard URL, not the project name. The two projects
-- were named the other way round until 2026-08-07 and a full session was spent
-- analysing the wrong one — see the header of
-- sql/live-project-hardening-2026-08-07.sql, which is the file this one follows.
--
-- APPLIED STATE — check here first, and keep it true:
--     Section 0 (audit)   read-only, run 2026-09-09 on both projects
--     STAGE 1             ✅ APPLIED to prod 2026-09-09
--     STAGE 2             ❌ NOT APPLIED, owner-gated
--
-- This block said "NOTHING IN THIS FILE HAS BEEN APPLIED" for the few minutes
-- between Stage 1 running and this commit. Leaving it that way is precisely the
-- failure this file exists to document — a header describing a state the
-- database no longer has. Update it in the same change as the apply, never
-- after.
--
--
-- WHY THIS FILE EXISTS
--
-- On 2026-09-08 the `ref_code -> p_code` rename was found to have been
-- staging-only for six weeks: every production call to increment_referral had
-- been failing at PostgREST and 3560 prod referral rows sat at count=0.
-- CLAUDE.md drew the right lesson ("SQL migration DONE needs to mean applied to
-- prod AND staging") and applied it to exactly one function. Nothing then
-- established that the REST of sql/api-security-hardening.sql had reached prod.
--
-- This file is the answer to that question, measured rather than assumed.
--
--
-- HEADLINE: THE FUNCTION LAYER AGREES. Both projects carry the same 15 public
-- functions, identical signatures, all SECURITY DEFINER, identical search_path
-- pins. The core of the hardening did reach production. Two divergences remain,
-- both in GRANTS, and both leave prod looser than staging.
--
--
-- ⚠ THE MIGRATION LEDGER IS NOT A RELIABLE RECORD — READ THIS BEFORE USING IT
--
-- supabase_migrations.schema_migrations disagrees with the catalog, and it
-- disagrees in BOTH directions:
--
--     prod    12 entries   lacks  register_referral_code_restore_explicit_grants
--     staging 11 entries   lacks  ai_referral_attribution_plan_family
--                          lacks  increment_referral_rename_arg_ref_code_to_p_code
--
-- Yet staging's increment_referral ALREADY has the p_code signature, with no
-- migration recording it. So at least one change was applied outside the ledger.
-- A ledger-only comparison would have concluded staging was behind on the rename
-- when it was in fact ahead — the exact inversion of the 2026-09-08 finding.
--
-- Compare CATALOG STATE (Section 0). Treat the ledger as a hint about intent,
-- never as evidence of what is deployed.
-- =============================================================================


-- =============================================================================
-- SECTION 0 — the audit. Read-only. Run on BOTH projects and diff the output.
-- Re-measure before running any stage below; the numbers here are from
-- 2026-09-09 and grants are exactly the kind of state that moves silently.
-- =============================================================================

-- 0a. Functions: name, signature, definer flag, search_path pin, ACL.
--     An ACL entry with an EMPTY grantee ("=X/postgres") is a grant to PUBLIC.
--     That notation is easy to skim past, and it is the whole of finding 2.
select p.proname,
       pg_get_function_identity_arguments(p.oid)               as args,
       p.prosecdef                                             as security_definer,
       coalesce(array_to_string(p.proconfig, ','), '(none)')   as config,
       coalesce(array_to_string(p.proacl::text[], ' '), '(default)') as acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname, args;

-- 0b. Tables: RLS flag, policy count, ACL.
--     RLS enabled with ZERO policies denies all access to non-owners. That is
--     the actual gate on this schema, and it is why finding 1 is latent rather
--     than live. Do not read "anon has arwdDxtm" as "anon can read the table"
--     without checking the policy count in the same row.
select c.relname                                                as tbl,
       c.relrowsecurity                                         as rls,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname) as policies,
       coalesce(array_to_string(c.relacl::text[], ' '), '(default)') as acl
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;


-- =============================================================================
-- MEASURED STATE, 2026-09-09 (both projects, via 0a/0b above)
--
-- FINDING 1 — ✅ CLOSED by STAGE 1 on 2026-09-09. Stated below in the present
--             tense as measured, because this section is the point-in-time
--             record the stages act on; do not rewrite it to match the current
--             state, or the reason Stage 1 exists disappears with it.
--
--             anon and authenticated held FULL CRUD on three rate-limit tables
--             on PROD. Staging held Dxtm only (no select/insert/update/delete).
--
--     table                        prod              staging
--     bonus_claim_attempts         anon=arwdDxtm     anon=Dxtm
--     bonus_claim_attempts_by_ip   anon=arwdDxtm     anon=Dxtm
--     track_event_rate_hits        anon=arwdDxtm     anon=Dxtm
--
--     This contradicts CLAUDE.md's own database rule: "no table allows raw
--     INSERT/UPDATE/DELETE via the anon key — all writes go through SECURITY
--     DEFINER RPCs".
--
--     NOT CURRENTLY EXPLOITABLE, and the reason matters: all three have RLS
--     enabled with ZERO policies, which denies non-owners everything. The grant
--     is a latent hazard, not an open door — add one permissive policy to any of
--     these on prod and rate limits become anon-writable, while staging would be
--     unaffected. Rate limits are the specific thing at stake: these tables are
--     what stops track_event's 60/device/hour and the bonus-claim caps from
--     being reset by the caller they are meant to bound.
--
-- FINDING 2 — five functions carry PUBLIC EXECUTE on PROD, revoked on staging:
--
--     generate_referral_code(uuid)
--     get_referral_earnings(text)
--     get_referral_paid_count(text)
--     increment_referral(text, uuid)
--     track_event(uuid, text, jsonb)
--
--     LOW impact, stated honestly rather than inflated: anon and authenticated
--     already hold explicit EXECUTE on all five on prod, and PostgREST connects
--     only as those two roles, so PUBLIC opens no path that is not already open.
--     This is defence-in-depth alignment, not a fix for a reachable hole.
--
-- CHECKED AND NOT A FINDING — recorded so it is not re-raised:
--
--   * rls_auto_enable() is granted to anon on prod (and is at ACL default on
--     staging, which is ALSO PUBLIC for functions — staging did not revoke it).
--     It RETURNS event_trigger, so PostgreSQL refuses to call it directly; the
--     grant is inert. It is also a defensive control: it auto-enables RLS on new
--     public tables. Leave it alone.
--
--   * service_role holds arwdDxtm on several prod tables vs Dxtm on staging.
--     No action: every write path is a SECURITY DEFINER function owned by
--     postgres, so service_role's direct table rights are not load-bearing on
--     either project.
--
--   * `waitlist` exists on prod only, with 2 policies and anon=a (INSERT only).
--     Deliberate public signup surface, correctly minimal. Leave it alone.
-- =============================================================================


-- =============================================================================
-- STAGE 1 — ✅ APPLIED to jwstkrtslotnjyerzzsi on 2026-09-09, as migration
-- `env_parity_stage1_revoke_anon_table_grants`. Finding 1: align prod's table
-- grants to staging. Idempotent and declarative; safe to re-run.
--
-- POST-CHECK, from query 0b immediately after (anon and authenticated gone from
-- all three; RLS and policy counts untouched, which is the point — the gate that
-- was already doing the work is undisturbed):
--
--   bonus_claim_attempts        rls=t policies=0  postgres=arwdDxtm service_role=arwdDxtm
--   bonus_claim_attempts_by_ip  rls=t policies=0  postgres=arwdDxtm service_role=arwdDxtm
--   track_event_rate_hits       rls=t policies=0  postgres=arwdDxtm service_role=arwdDxtm
--
-- Prod now matches staging on these three tables, modulo service_role's wider
-- rights, which are not load-bearing (see the CHECKED AND NOT A FINDING notes).
--
-- WHAT WAS NOT DONE, and why, so nobody records this as more verified than it is:
-- the write paths were NOT exercised by a live call. Proving it end to end means
-- invoking track_event against production, which writes a real telemetry row and
-- mints a device id — the exact pollution that PR #1328 was opened to stop after
-- a test run put 126 phantom rows into prod. The static argument is relied on
-- instead, and it is a strong one rather than a hedge: all three tables are
-- touched only inside SECURITY DEFINER functions owned by `postgres` (verified
-- post-apply: track_event, check_first_referral_bonus and
-- record_bonus_claim_attempt are all prosecdef=true, proowner=postgres), and a
-- definer function does not consult the CALLER's table grants. If a rate-limit
-- write ever does fail after this, that premise is where to look first.
--
-- Historical note — the pre-apply state this replaced:
--   all three carried anon=arwdDxtm and authenticated=arwdDxtm.
--
-- SAFE, and here is the argument rather than an assertion: nothing reads or
-- writes these tables through PostgREST. Every access is inside a SECURITY
-- DEFINER function owned by postgres, which does not consult the caller's table
-- grants. RLS with zero policies already denies anon everything, so this REVOKE
-- removes a privilege that is currently unusable. Expected behavioural delta:
-- none.
--
-- Verify that claim before trusting it — from src/, these tables should appear
-- ONLY inside sql/ function bodies, never in a client query:
--     git grep -nF 'bonus_claim_attempts' -- src functions
--     git grep -nF 'track_event_rate_hits' -- src functions
-- If either returns a client-side hit, STOP: something reads the table directly
-- and this stage would break it.
--
-- Idempotent and declarative; safe to re-run.
-- =============================================================================

-- Applied 2026-09-09. Left uncommented as the record of exactly what ran; they
-- are idempotent, so re-running is a no-op rather than a hazard.
REVOKE ALL ON TABLE public.bonus_claim_attempts       FROM anon, authenticated;
REVOKE ALL ON TABLE public.bonus_claim_attempts_by_ip FROM anon, authenticated;
REVOKE ALL ON TABLE public.track_event_rate_hits      FROM anon, authenticated;


-- =============================================================================
-- STAGE 2 — ❌ NOT APPLIED. Finding 2: drop PUBLIC EXECUTE on prod.
--
-- ⚠ THIS IS NOT H-3, AND THE DIFFERENCE IS LOAD-BEARING. H-3 wants EXECUTE
-- revoked from anon AND authenticated, and CLAUDE.md gates that on
-- SUPABASE_SERVICE_ROLE_KEY being set on the veyrnox-prod Pages project first —
-- running it early breaks every referral and telemetry write, with
-- `permission denied for function <name>` from /api/rpc/*. See
-- docs/rpc-service-role-migration.md.
--
-- The statements below revoke from PUBLIC ONLY. They deliberately leave anon and
-- authenticated in place, so they are safe BEFORE the service-role key is set.
-- Do NOT "tidy" them into the H-3 form by appending anon, authenticated — that
-- converts a no-op into an outage.
-- =============================================================================

-- REVOKE ALL ON FUNCTION public.generate_referral_code(uuid)             FROM PUBLIC;
-- REVOKE ALL ON FUNCTION public.get_referral_earnings(text)              FROM PUBLIC;
-- REVOKE ALL ON FUNCTION public.get_referral_paid_count(text)            FROM PUBLIC;
-- REVOKE ALL ON FUNCTION public.increment_referral(text, uuid)           FROM PUBLIC;
-- REVOKE ALL ON FUNCTION public.track_event(uuid, text, jsonb)           FROM PUBLIC;

-- Post-check: re-run 0a. Each of the five should lose its "=X/postgres" entry
-- and KEEP anon=X and authenticated=X. If anon disappeared too, the H-3 form was
-- run by mistake — re-grant before the next client request.


-- =============================================================================
-- AFTER APPLYING EITHER STAGE
--
-- Record it here the way sql/live-project-hardening-2026-08-07.sql does: flip
-- the ❌ to ✅ with the date, and paste the post-check output. A stage file whose
-- applied-state is only in someone's memory is how the six-week rename gap
-- happened in the first place.
--
-- Still open after both stages, and NOT addressed by this file:
--   * H-3 proper (anon/authenticated EXECUTE revokes) — gated on the service-role
--     key, see docs/rpc-service-role-migration.md.
--   * Whether the two ledgers should be reconciled at all. They are cosmetic
--     next to catalog state, and forcing entries in risks implying a migration
--     ran when it did not. Recommend leaving them and trusting Section 0.
-- =============================================================================

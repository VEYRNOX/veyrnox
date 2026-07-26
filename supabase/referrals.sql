-- Veyrnox referral tracker schema
-- Run this once in the Supabase SQL editor for your project.

-- 1. Table: one row per referral code.
--    No wallet addresses, no seed material, no holdings.
--
--    NOTE the columns below are not the whole table. Later migrations add
--    device_id (api-security-hardening.sql), rc_user_id and
--    first_bonus_granted_at (first-referral-bonus.sql), is_founding_referrer
--    and founding_expires_at (growth-backend-changes.sql). That drift is
--    exactly why this file no longer grants blanket access — see below.
create table if not exists referrals (
  code        text primary key,
  count       integer not null default 0,
  created_at  timestamptz not null default now()
);

-- 2. RLS: enable row-level security, and grant nothing on top of it.
alter table referrals enable row level security;

-- Idempotent, and load-bearing: these drops are what repair a database where an
-- older version of this file (or of sql/api-security-hardening.sql) left a
-- permissive policy behind. Running this file is now the remediation, not the
-- regression.
drop policy if exists "public insert"  on referrals;
drop policy if exists "public update"  on referrals;
drop policy if exists "public select"  on referrals;

-- AUTHZ MODEL: anon has NO direct access to this table. None. Every read and
-- every write goes through a SECURITY DEFINER RPC that validates its input and
-- enforces its own rate limit.
--
--   read  count      -> get_referral_count(p_code)      (sql/referrals-select-lockdown.sql)
--   create a code    -> generate_referral_code(...)      (sql/first-referral-bonus.sql)
--   register a code  -> register_referral_code(...)      3/device/hour
--   +1 a code        -> increment_referral(...)          1/device/code, dedup table
--   -1 a code        -> decrement_referral(...)          service_role only
--
-- NO POLICIES ARE CREATED HERE, DELIBERATELY. This file used to create
-- "public insert" and "public select", and sql/api-security-hardening.sql then
-- dropped the insert one. That split meant the hardening held only while the
-- two files were run in the right order and this one was never re-run — and
-- this file is written to be idempotent and calls itself canonical, so
-- re-running it is the obvious thing to do. Doing so silently re-opened the
-- hole. The policies now simply do not exist to be restored.
--
-- The select policy was worse than the insert one and outlived it. RLS is
-- ROW-level, so `using (true)` exposed every COLUMN of this table to anon —
-- fine when the table was code+count+created_at, which is what its old comment
-- claimed, but device_id, rc_user_id, first_bonus_granted_at,
-- is_founding_referrer and founding_expires_at were all added underneath it
-- later. See sql/referrals-select-lockdown.sql.
--
-- If a future feature needs anon to read something here, add an RPC that
-- returns exactly that, rather than a policy that returns whatever columns the
-- table happens to have next year.

-- Belt and braces alongside RLS: with the grants revoked the table stays shut
-- even if RLS is ever disabled on it by accident. Definer RPCs are unaffected —
-- they run as the owner.
revoke all on table referrals from anon;
revoke all on table referrals from authenticated;

-- 3. Atomic increment function.
--
-- !! SUPERSEDED — THIS FILE NOW REMOVES THE FUNCTION IT USED TO CREATE.
--
-- The single-argument increment_referral(p_code text) below is the ORIGINAL,
-- UNHARDENED version: it performs an unconditional `count = count + 1` with no
-- device binding, no dedup check and no rate limit. It was replaced in
-- sql/api-security-hardening.sql by increment_referral(p_code text,
-- p_device_id uuid), which records the device in referral_increments and allows
-- at most one increment per device per code.
--
-- That file DROPs increment_referral(text) before creating the two-argument
-- version — so the hardening held only while these two files were run in that
-- order and this one was never re-run afterwards. Re-running this file restored
-- an unlimited count-inflation endpoint: with a code and the public anon key,
-- call it in a loop and promote any referrer through the discount tiers. That
-- is precisely the attack the referral_increments dedup table was built to
-- stop, reachable again through the base schema file.
--
-- Whether the one-argument overload was directly callable through PostgREST is
-- untested — with increment_referral(text, uuid DEFAULT NULL) also present, a
-- {p_code}-only call may be ambiguous and error rather than resolve. Not a
-- defence worth relying on. It is dropped.
--
-- The DROP below is the repair for any database still carrying it. It names the
-- one-argument signature explicitly so it can never touch the hardened
-- two-argument function.
drop function if exists public.increment_referral(text);

-- Verify (expect exactly one row: increment_referral(text,uuid)):
--   SELECT p.oid::regprocedure
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'increment_referral';

-- ============================================================================
-- ORIGINAL DEFINITION — kept commented so this file still reads as the history
-- of what was once run. Do NOT uncomment.
-- ============================================================================
-- create or replace function increment_referral(p_code text)
-- returns integer
-- language plpgsql
-- security definer
-- as $$
-- declare
--   new_count integer;
-- begin
--   update referrals
--      set count = count + 1
--    where code = p_code
--   returning count into new_count;
--
--   if new_count is null then
--     raise exception 'Code not found: %', p_code using errcode = 'P0001';
--   end if;
--
--   return new_count;
-- end;
-- $$;

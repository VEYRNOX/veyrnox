-- ============================================================================
-- Shared cache for the tip-manifest Edge Function
-- Run in the Supabase SQL Editor on BOTH wallet projects (staging
-- nszlbcmcysftwyudthjz first, prod jwstkrtslotnjyerzzsi after the PR merges).
-- Idempotent. Date: 2026-10-03.
-- ============================================================================
--
-- WHY
--
-- The wallet's local IOC cache (src/lib/localIocCache.js) needs the signed
-- manifest from the TIP Worker's GET /api/v1/manifest. That route has required
-- HMAC since veyrnox-tip #48 (2026-08-10) and the wallet must never sign, so
-- supabase/functions/tip-manifest signs server-side.
--
-- The Worker rate-limits the manifest at 5 requests/hour PER TENANT, and every
-- wallet shares one tenant. An Edge Function isolate's memory is not shared
-- with the next isolate, so an in-memory cache would spend that budget in
-- minutes and leave most wallets with a 429. The cache has to live somewhere
-- every isolate can see: here.
--
-- WHAT IS STORED
--
-- One row: the manifest body exactly as the Worker returned it. It is public
-- threat data, Ed25519-signed by the Worker, and the wallet verifies that
-- signature itself (I5), so this table is not trusted for integrity. No user
-- data, no addresses asked about, no identifiers.
--
-- BUDGET
--
-- A fresh body is served for 30 minutes (at most 2 upstream fetches/hour). A
-- refresh lease lasts 15 minutes, so a failing upstream is retried at most 4
-- times/hour. Both sit under the Worker's 5/hour.

create table if not exists tip_manifest_cache (
  id          smallint primary key default 1 check (id = 1),
  body        text,
  fetched_at  timestamptz,
  claimed_at  timestamptz
);

alter table tip_manifest_cache enable row level security;

-- No policies, deliberately: anon and authenticated have no direct access.
-- The grants are revoked as well so the table stays shut even if RLS is ever
-- disabled on it by accident. The definer RPCs below are unaffected.
revoke all on table tip_manifest_cache from anon;
revoke all on table tip_manifest_cache from authenticated;

insert into tip_manifest_cache (id) values (1) on conflict (id) do nothing;

-- Returns the cached body and whether THIS caller won the lease to refresh it.
-- The claim is a single UPDATE, so two isolates racing cannot both win.
create or replace function tip_manifest_cache_take()
returns table (body text, should_refresh boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_claimed boolean := false;
begin
  update tip_manifest_cache c
     set claimed_at = now()
   where c.id = 1
     and (c.fetched_at is null or c.fetched_at < now() - interval '30 minutes')
     and (c.claimed_at is null or c.claimed_at < now() - interval '15 minutes');
  v_claimed := found;

  return query
    select c.body, v_claimed
      from tip_manifest_cache c
     where c.id = 1;
end;
$$;

-- Stores a freshly fetched body. Idempotent: storing the same body twice only
-- moves fetched_at. Capped at 8 MiB, the same bound the wallet applies before
-- it will parse a manifest.
create or replace function tip_manifest_cache_put(p_body text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_body is null or octet_length(p_body) = 0 or octet_length(p_body) > 8388608 then
    raise exception 'bad manifest body' using errcode = 'P0020';
  end if;

  update tip_manifest_cache c
     set body = p_body,
         fetched_at = now()
   where c.id = 1;
end;
$$;

-- service_role only. The Edge Function is the sole caller.
revoke all on function tip_manifest_cache_take() from public;
revoke all on function tip_manifest_cache_take() from anon;
revoke all on function tip_manifest_cache_take() from authenticated;
grant execute on function tip_manifest_cache_take() to service_role;

revoke all on function tip_manifest_cache_put(text) from public;
revoke all on function tip_manifest_cache_put(text) from anon;
revoke all on function tip_manifest_cache_put(text) from authenticated;
grant execute on function tip_manifest_cache_put(text) to service_role;

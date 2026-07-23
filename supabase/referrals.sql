-- Veyrnox referral tracker schema
-- Run this once in the Supabase SQL editor for your project.

-- 1. Table: one row per referral code, stores only code + count.
--    No wallet addresses, no user identity, no holdings.
create table if not exists referrals (
  code        text primary key,
  count       integer not null default 0,
  created_at  timestamptz not null default now()
);

-- 2. RLS: enable row-level security. The table holds no sensitive data (code +
--    counter only, no identity/addresses), so anon may READ and may INSERT a new
--    code. It may NOT update rows directly — see the authz note below.
alter table referrals enable row level security;

-- Idempotent: drop any policy from a previous version of this migration, including
-- the old broad "public update" policy that this migration intentionally REMOVES.
drop policy if exists "public insert"  on referrals;
drop policy if exists "public update"  on referrals;
drop policy if exists "public select"  on referrals;

-- AUTHZ MODEL (server-side, not browser-trusted):
--   - SELECT: public — anon clients read a code's count (fetchStatus).
--   - INSERT: public — registerCode upserts with ignoreDuplicates, i.e.
--             INSERT ... ON CONFLICT DO NOTHING, which needs only INSERT. A new
--             code starts at count 0; an existing code is left untouched.
--   - UPDATE: NO policy. With RLS on and no UPDATE policy, anon clients CANNOT
--             write the counter directly. The ONLY way `count` changes is the
--             increment_referral() function below, which is SECURITY DEFINER and
--             therefore bypasses RLS to perform exactly a +1.
--   This closes the prior gap where "public update using (true)" let any client
--   set any code's count to any value (or zero it). HARDENED (PR #1334):
--   increment_referral() now enforces one-per-device-per-code via the
--   referral_increments dedup table, and direct anon INSERT on referrals is
--   dropped (registration goes through register_referral_code() RPC,
--   3/device/hour). See sql/api-security-hardening.sql.
create policy "public insert" on referrals for insert with check (true);
create policy "public select" on referrals for select using (true);

-- 3. Atomic increment function: increments the count for a known code
--    and returns the new value. Raises an exception if the code doesn't
--    exist so the app can distinguish 404 from 500.
create or replace function increment_referral(ref_code text)
returns integer
language plpgsql
security definer
as $$
declare
  new_count integer;
begin
  update referrals
     set count = count + 1
   where code = ref_code
  returning count into new_count;

  if new_count is null then
    raise exception 'Code not found: %', ref_code using errcode = 'P0001';
  end if;

  return new_count;
end;
$$;

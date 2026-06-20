-- Veyrnox referral tracker schema
-- Run this once in the Supabase SQL editor for your project.

-- 1. Table: one row per referral code, stores only code + count.
--    No wallet addresses, no user identity, no holdings.
create table if not exists referrals (
  code        text primary key,
  count       integer not null default 0,
  created_at  timestamptz not null default now()
);

-- 2. RLS: enable row-level security, then grant public read/write.
--    This table holds no sensitive data — code + counter only.
alter table referrals enable row level security;

drop policy if exists "public insert"  on referrals;
drop policy if exists "public update"  on referrals;
drop policy if exists "public select"  on referrals;

create policy "public insert" on referrals for insert with check (true);
create policy "public update" on referrals for update using (true);
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

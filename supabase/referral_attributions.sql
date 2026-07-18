-- Referral attribution tracking
-- Records when a referred user subscribes to Safety Plus.
-- No user identity stored — only the referral code, plan, and revenue.
-- Run this in the Supabase SQL editor after referrals.sql.

create table if not exists referral_attributions (
  id             serial primary key,
  referral_code  text not null references referrals(code),
  plan           text not null check (plan in ('monthly', 'annual')),
  revenue_cents  integer not null,
  created_at     timestamptz not null default now()
);

alter table referral_attributions enable row level security;

drop policy if exists "public insert" on referral_attributions;
drop policy if exists "public select" on referral_attributions;

-- INSERT: the app records an attribution after a successful purchase.
-- SELECT: influencer can query earnings for their own code.
-- No UPDATE/DELETE — immutable ledger.
create policy "public insert" on referral_attributions for insert with check (true);
create policy "public select" on referral_attributions for select using (true);

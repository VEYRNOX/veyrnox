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

-- AUTHZ MODEL: anon has NO direct access. Both paths are SECURITY DEFINER RPCs:
--
--   record an attribution -> record_attribution(...)     validated, 2/code/hour
--   read earnings         -> get_referral_earnings(p_code)
--   read paid count       -> get_referral_paid_count(p_code)
--
-- NO POLICIES ARE CREATED HERE, DELIBERATELY. This file used to create both,
-- and sql/api-security-hardening.sql then dropped both. That split meant the
-- hardening held only while the two files were run in that order and this one
-- was never re-run — and this file is idempotent and presents itself as the
-- canonical schema, so re-running it is the obvious thing to do. Doing so
-- silently restored:
--
--   public INSERT — anyone with the anon key could forge attribution rows.
--     That is worse now than when it was first closed: check_first_referral_bonus
--     gates eligibility on EXISTS(SELECT 1 FROM referral_attributions WHERE
--     referral_code = ...), so forged rows manufacture bonus eligibility. Forged
--     rows also inflate get_referral_paid_count and the tier/discount maths.
--
--   public SELECT — re-disclosed the revenue ledger. RLS is ROW-level, so
--     `using (true)` covered every column, including discount_cents, which
--     sql/add-discount-cents.sql added AFTER this policy was written. Same
--     column-drift failure as the referrals table.
--
-- No UPDATE/DELETE path exists in either direction — immutable ledger.

-- Belt and braces alongside RLS: with the grants revoked the table stays shut
-- even if RLS is ever disabled on it by accident. Definer RPCs are unaffected.
revoke all on table referral_attributions from anon;
revoke all on table referral_attributions from authenticated;

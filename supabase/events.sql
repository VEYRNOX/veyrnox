-- Veyrnox anonymous event tracking schema
-- Run this once in the Supabase SQL editor for your project.
--
-- Privacy model: no wallet addresses, no balances, no seed material,
-- no user identity. Only anonymous action names + timestamps.
-- The device_id is a random UUID generated per install — not tied to
-- any hardware identifier, Apple IDFV, or Google Advertising ID.

-- 1. Table: anonymous events — one row per tracked action.
create table if not exists events (
  id          bigint generated always as identity primary key,
  device_id   uuid not null,
  event       text not null,
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

-- 2. Index for querying by event type and time range.
create index if not exists idx_events_event_created
  on events (event, created_at desc);

-- 3. Index for returning-user / retention queries by device.
create index if not exists idx_events_device_created
  on events (device_id, created_at desc);

-- 4. RLS: enable row-level security, and grant nothing on top of it.
--
--    Anon has NO direct access. Every write goes through track_event() — a
--    SECURITY DEFINER RPC with an event allowlist, a 60/device/hour rate limit
--    and a 4 KB metadata cap (sql/api-security-hardening.sql, extended by
--    sql/telemetry-events-allowlist.sql). There is no read path at all: the app
--    never reads its own events back, so only the dashboard and server-side
--    queries can.
--
--    NO POLICY IS CREATED HERE, DELIBERATELY. Until 2026-07-26 this file said
--    "HARDENED (PR #1334): direct anon INSERT policy dropped" and then, two
--    lines below, recreated the policy it had just described as dropped. The
--    drop lived in sql/api-security-hardening.sql, so the hardening held only
--    while the two files were run in that order and this one was never re-run.
--    Re-running this file — which it invites, being idempotent and calling
--    itself canonical — restored direct anon INSERT and with it the ability to
--    write arbitrary event names at unbounded volume and size, bypassing the
--    allowlist, the rate limit and the metadata cap in one step.
--
--    The policy now simply does not exist to be restored, and the drop below is
--    the repair for any database still carrying it.
alter table events enable row level security;

drop policy if exists "anon insert" on events;

-- Belt and braces alongside RLS: with the grants revoked the table stays shut
-- even if RLS is ever disabled on it by accident. track_event() is unaffected —
-- SECURITY DEFINER runs as the owner.
revoke all on table events from anon;
revoke all on table events from authenticated;

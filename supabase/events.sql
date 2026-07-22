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

-- 4. RLS: enable row-level security. Anon clients may INSERT only.
--    No SELECT/UPDATE/DELETE — the app never reads its own events back;
--    only the Supabase dashboard / server-side queries can.
alter table events enable row level security;

drop policy if exists "anon insert" on events;
create policy "anon insert" on events for insert to anon with check (true);

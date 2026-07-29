-- Cohort retention + onboarding drop-off views.
-- Run AFTER supabase/events.sql and sql/api-security-hardening.sql.
--
-- Scope: read-only analytics on top of the existing `events` table. Adds no
-- writers, no new columns, no new indexes (the (device_id, created_at) index
-- from events.sql covers every access path here).
--
-- Grain: cohort = ISO week of the device's FIRST recorded event. The app has
-- no user identity, so `device_id` is the only identity available; a wipe or
-- reinstall mints a new device_id and therefore lands in a new cohort. That
-- is a real overcount of "new users" — do not paper over it in a view.
--
-- Access model: `anon` and `authenticated` have no SELECT on `events` (see
-- events.sql:54-55), so these views are unreadable by either role. Views are
-- created WITH (security_invoker = true) so the caller's own grants decide
-- access — a view owned by a superuser cannot be used to bypass the revoke.
-- The dashboard reads via service_role, which bypasses RLS.

-- ============================================================================
-- 1. device_cohorts — one row per device, tagged with its cohort week.
-- ============================================================================
CREATE OR REPLACE VIEW device_cohorts
WITH (security_invoker = true) AS
SELECT
  device_id,
  date_trunc('week', min(created_at))::date AS cohort_week,
  min(created_at)                           AS first_seen_at
FROM events
GROUP BY device_id;

COMMENT ON VIEW device_cohorts IS
  'One row per device. cohort_week is the ISO week of the device''s first event.';

-- ============================================================================
-- 2. cohort_retention_weekly — devices active per (cohort_week, week_offset).
--
-- week_offset 0 is the cohort's own week (always == cohort_size, by definition).
-- week_offset N is devices from that cohort that fired ANY event in week N.
-- retention_pct is rounded to 2 dp; cohort_size is repeated on each row for
-- easy pivoting in a dashboard.
-- ============================================================================
CREATE OR REPLACE VIEW cohort_retention_weekly
WITH (security_invoker = true) AS
WITH activity AS (
  SELECT
    c.cohort_week,
    date_trunc('week', e.created_at)::date AS activity_week,
    e.device_id
  FROM events e
  JOIN device_cohorts c USING (device_id)
),
sizes AS (
  SELECT cohort_week, count(*)::int AS cohort_size
  FROM device_cohorts
  GROUP BY cohort_week
)
SELECT
  a.cohort_week,
  ((a.activity_week - a.cohort_week) / 7)::int          AS week_offset,
  s.cohort_size,
  count(DISTINCT a.device_id)::int                       AS active_devices,
  round(
    100.0 * count(DISTINCT a.device_id) / s.cohort_size,
    2
  )                                                      AS retention_pct
FROM activity a
JOIN sizes s USING (cohort_week)
GROUP BY a.cohort_week, week_offset, s.cohort_size
ORDER BY a.cohort_week, week_offset;

COMMENT ON VIEW cohort_retention_weekly IS
  'Weekly retention curve per cohort. week_offset 0 is the cohort week itself.';

-- ============================================================================
-- 3. onboarding_funnel_dropoff — devices reaching each onboarding step.
--
-- Steps ordered by the funnel in src/lib/analytics.js. `reached` counts
-- distinct devices that ever fired the event; `pct_of_first_open` is the
-- share against the top of the funnel; `drop_from_prev_pct` is the drop
-- against the immediately preceding step in this list.
--
-- Steps a device never reaches are not omitted — they appear with reached=0
-- so a dashboard row is present at every stage.
-- ============================================================================
CREATE OR REPLACE VIEW onboarding_funnel_dropoff
WITH (security_invoker = true) AS
WITH steps(step_order, event_name) AS (
  VALUES
    (1,  'first_open'),
    (2,  'onboarding_start'),
    (3,  'custody_path_chosen'),
    (4,  'seed_generated'),
    (5,  'seed_revealed'),
    (6,  'seed_backup_acknowledged'),
    (7,  'seed_verify_started'),
    (8,  'seed_verify_passed'),
    (9,  'lock_method_set'),
    (10, 'wallet_ready'),
    (11, 'receive_address_viewed'),
    (12, 'first_inbound_detected'),
    (13, 'send_flow_started'),
    (14, 'first_send')
),
reached AS (
  SELECT
    s.step_order,
    s.event_name,
    count(DISTINCT e.device_id)::int AS reached
  FROM steps s
  LEFT JOIN events e ON e.event = s.event_name
  GROUP BY s.step_order, s.event_name
),
top AS (
  SELECT reached AS first_open_count
  FROM reached
  WHERE event_name = 'first_open'
)
SELECT
  r.step_order,
  r.event_name,
  r.reached,
  CASE WHEN t.first_open_count > 0
       THEN round(100.0 * r.reached / t.first_open_count, 2)
       ELSE NULL
  END AS pct_of_first_open,
  CASE
    WHEN lag(r.reached) OVER (ORDER BY r.step_order) IS NULL
      OR lag(r.reached) OVER (ORDER BY r.step_order) = 0
    THEN NULL
    ELSE round(
      100.0 * (lag(r.reached) OVER (ORDER BY r.step_order) - r.reached)
            / lag(r.reached) OVER (ORDER BY r.step_order),
      2
    )
  END AS drop_from_prev_pct
FROM reached r
CROSS JOIN top t
ORDER BY r.step_order;

COMMENT ON VIEW onboarding_funnel_dropoff IS
  'Distinct devices reaching each onboarding/funding/send step, with drop-off vs the previous step.';

-- ============================================================================
-- 4. Grants — service_role only. anon/authenticated stay locked out by
--    the underlying events grants; make it explicit here as well.
-- ============================================================================
REVOKE ALL ON device_cohorts           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON cohort_retention_weekly  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON onboarding_funnel_dropoff FROM PUBLIC, anon, authenticated;

GRANT SELECT ON device_cohorts           TO service_role;
GRANT SELECT ON cohort_retention_weekly  TO service_role;
GRANT SELECT ON onboarding_funnel_dropoff TO service_role;

-- ============================================================================
-- 5. Automated drop-off alerts.
--
-- A "hot" drop-off is a step where the drop from the previous step exceeds a
-- threshold AND the previous step had enough traffic to make the ratio
-- meaningful (small-sample noise guard). Defaults: 40% drop, previous step
-- with at least 50 devices. Both are function arguments so a caller can tune
-- them without a migration.
--
-- Consumer model: an external scheduled job (or the dashboard's own cron)
-- calls check_funnel_dropoff_alerts() on a cadence. New alerts are inserted
-- into funnel_dropoff_alert_log and returned; already-logged alerts are NOT
-- returned again, so the same drop-off never fires twice. There is no
-- push/email/webhook here — Veyrnox has no such internal pipeline and this
-- file is not the place to invent one.
-- ============================================================================

CREATE TABLE IF NOT EXISTS funnel_dropoff_alert_log (
  id             bigint generated always as identity primary key,
  event_name     text        NOT NULL,
  prev_event     text        NOT NULL,
  drop_pct       numeric     NOT NULL,
  prev_reached   int         NOT NULL,
  reached        int         NOT NULL,
  detected_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_name, prev_event)
);

ALTER TABLE funnel_dropoff_alert_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON funnel_dropoff_alert_log FROM PUBLIC, anon, authenticated;

-- View: current hot drop-off steps (recomputed on every read).
CREATE OR REPLACE VIEW funnel_dropoff_hotspots
WITH (security_invoker = true) AS
WITH ordered AS (
  SELECT
    step_order,
    event_name,
    reached,
    lag(event_name) OVER (ORDER BY step_order) AS prev_event,
    lag(reached)    OVER (ORDER BY step_order) AS prev_reached,
    drop_from_prev_pct
  FROM onboarding_funnel_dropoff
)
SELECT
  step_order,
  event_name,
  prev_event,
  prev_reached,
  reached,
  drop_from_prev_pct AS drop_pct
FROM ordered
WHERE prev_event IS NOT NULL
  AND drop_from_prev_pct IS NOT NULL
ORDER BY drop_from_prev_pct DESC NULLS LAST;

COMMENT ON VIEW funnel_dropoff_hotspots IS
  'Every step ranked by drop from previous step. Filter in the RPC by threshold.';

REVOKE ALL ON funnel_dropoff_hotspots FROM PUBLIC, anon, authenticated;
GRANT SELECT ON funnel_dropoff_hotspots TO service_role;

-- RPC: returns NEW alerts (unseen event_name/prev_event pairs) above threshold
-- and records them in funnel_dropoff_alert_log for dedup.
-- Uses LANGUAGE sql (not plpgsql) so RETURNS SETOF doesn't create OUT parameters
-- that would shadow same-named columns inside the query body — plpgsql's classic
-- 42702 ambiguity trap.
CREATE OR REPLACE FUNCTION check_funnel_dropoff_alerts(
  p_min_drop_pct       numeric DEFAULT 40,
  p_min_prev_reached   int     DEFAULT 50
)
RETURNS SETOF funnel_dropoff_alert_log
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH candidates AS (
    SELECT h.event_name, h.prev_event, h.drop_pct, h.prev_reached, h.reached
    FROM funnel_dropoff_hotspots h
    WHERE h.drop_pct     >= p_min_drop_pct
      AND h.prev_reached >= p_min_prev_reached
  )
  INSERT INTO funnel_dropoff_alert_log
    (event_name, prev_event, drop_pct, prev_reached, reached)
  SELECT c.event_name, c.prev_event, c.drop_pct, c.prev_reached, c.reached
  FROM candidates c
  ON CONFLICT (event_name, prev_event) DO NOTHING
  RETURNING *;
$$;

COMMENT ON FUNCTION check_funnel_dropoff_alerts(numeric, int) IS
  'Returns new drop-off alerts above threshold. Each (event, prev_event) pair fires at most once — clear rows from funnel_dropoff_alert_log to re-arm.';

REVOKE EXECUTE ON FUNCTION check_funnel_dropoff_alerts(numeric, int)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION check_funnel_dropoff_alerts(numeric, int)
  TO service_role;

-- ============================================================================
-- 6. Hourly schedule via pg_cron.
--
-- Requires the pg_cron extension. On Supabase, enable it once via
--   Database → Extensions → pg_cron (toggle on)
-- or the SQL below (both are idempotent). pg_cron installs into the
-- `extensions` schema on Supabase and into `cron` on self-hosted Postgres —
-- the calls below use `cron.schedule` which is the API name in both cases.
--
-- The job runs as the database owner (pg_cron's own role), which can execute
-- the SECURITY DEFINER function regardless of the anon revoke above. Output
-- rows are discarded; the side effect is the INSERT into
-- funnel_dropoff_alert_log, which is what a dashboard reads.
--
-- Unschedule with: SELECT cron.unschedule('veyrnox-funnel-dropoff-hourly');
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Replace any prior schedule with the same name so this file stays idempotent.
DO $$
BEGIN
  PERFORM cron.unschedule('veyrnox-funnel-dropoff-hourly');
EXCEPTION WHEN OTHERS THEN
  -- No prior schedule — nothing to remove.
  NULL;
END $$;

SELECT cron.schedule(
  'veyrnox-funnel-dropoff-hourly',
  '0 * * * *',
  $cron$ SELECT check_funnel_dropoff_alerts(); $cron$
);

-- Bug-report upload schema — slice 1e-2 of the opt-in bug-report recording
-- feature. See docs/bug-report-recording-plan.md for the full contract.
--
-- Ship-ordering note: this migration DOES NOT wire any client code. The
-- application still has zero callers of the RPC defined here (Settings
-- button self-hides when VITE_BUG_REPORT_ENABLED != '1', default OFF).
-- Slice 1e-3 adds the Pages Function proxy allowlist entry that lets the
-- client reach this RPC. Landing 1e-2 without 1e-3 is inert but safe.
--
-- Run via Supabase dashboard SQL editor on STAGING first; only run on
-- production AFTER the PR carrying THIS SQL has merged to main and after
-- 1e-3's proxy allowlist change is scheduled. Ordering rationale — see
-- CLAUDE.md 'RPC service-role migration' pattern.
--
-- Design constraints:
--   - Uploads happen via a Pages Function using service_role, NOT via
--     direct anon PostgREST. This RPC RESERVES a report_id and validates
--     the request; the Pages Function then writes the object to storage
--     under service_role authority.
--   - Recordings are E2E-encrypted client-side (see
--     src/lib/bugReport/encrypt.js, slice 1e-1). The server never sees
--     plaintext.
--   - Rate limit: 3 reports per device per 24h.
--   - Size cap: 50 MB per upload (envelope of ~30s H.264 clip well under
--     this ceiling; encryption adds <1 KB overhead).
--   - The Storage bucket is private; only service_role can read/write.

-- ============================================================================
-- 1. Tables
-- ============================================================================

-- Metadata table. Rows are reserved when the RPC is called; the Pages
-- Function updates the row after a successful storage put (marks it
-- 'uploaded') or the row is auto-purged if still 'reserved' after 1h.
--
-- NO PII, NO wallet address, NO IP. The device_id is a fresh random uuid
-- generated per-report by the client — NOT the telemetry device id (see
-- docs/bug-report-recording-plan.md §Metadata sent with the report).
CREATE TABLE IF NOT EXISTS bug_reports (
  report_id      uuid PRIMARY KEY,
  size_bytes     bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 52428800),
  app_version    text NOT NULL CHECK (length(app_version) BETWEEN 1 AND 32),
  platform       text NOT NULL CHECK (platform IN ('ios', 'android')),
  status         text NOT NULL DEFAULT 'reserved'
                   CHECK (status IN ('reserved', 'uploaded', 'expired')),
  reserved_at    timestamptz NOT NULL DEFAULT now(),
  uploaded_at    timestamptz,
  -- device_id is a FRESH random uuid per report, deliberately NOT joined
  -- to the telemetry install id. Kept only for rate limiting; auto-purged
  -- with the row on retention expiry.
  device_id      uuid NOT NULL
);
ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;

-- Rate-limit ledger — writes here on every RPC call regardless of success
-- of the eventual upload. Prevents an attacker from making 1000 reservations
-- and never uploading. Rows GC'd on the retention sweep.
CREATE TABLE IF NOT EXISTS bug_report_upload_rate_limit (
  device_id      uuid NOT NULL,
  reserved_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, reserved_at)
);
ALTER TABLE bug_report_upload_rate_limit ENABLE ROW LEVEL SECURITY;

-- Indexes for the rate-limit lookup and the retention sweep.
CREATE INDEX IF NOT EXISTS idx_bug_reports_status_reserved
  ON bug_reports (status, reserved_at);
CREATE INDEX IF NOT EXISTS idx_bug_report_rate_limit_device
  ON bug_report_upload_rate_limit (device_id, reserved_at);

-- ============================================================================
-- 2. RPC — reserve an upload slot
-- ============================================================================

-- Rate-limited reservation. Returns the report_id (echoed from input) plus
-- the object path the client will upload to via the Pages Function.
--
-- The RPC does NOT return a signed URL: signed URLs from Supabase Storage
-- are minted via the JS/REST API, not via SQL. Instead the Pages Function
-- consumes this RPC, then uses service_role to write the object. That
-- keeps the anon key from ever being able to touch the bucket directly.
--
-- Contract:
--   - p_device_id must be a fresh random uuid per report (client
--     generates via crypto.randomUUID()). Enforced only implicitly:
--     the rate limit counts (device_id, hour bucket) so reusing a
--     device_id burns budget faster than rotating.
--   - p_size_bytes must be within (0, 52428800] — enforced by CHECK.
--   - p_app_version + p_platform are cheap metadata for support triage.
--   - p_client_meta is currently unused; reserved for future fields
--     the client may want to include in the reservation (never the
--     plaintext description — that ships inside the encrypted blob).
CREATE OR REPLACE FUNCTION create_bug_report_upload(
  p_report_id    uuid,
  p_device_id    uuid,
  p_size_bytes   bigint,
  p_app_version  text,
  p_platform     text,
  p_client_meta  jsonb DEFAULT '{}'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  recent_count int;
BEGIN
  -- Input validation.
  IF p_report_id IS NULL THEN
    RAISE EXCEPTION 'report_id required' USING errcode = 'P0004';
  END IF;
  IF p_device_id IS NULL THEN
    RAISE EXCEPTION 'device_id required' USING errcode = 'P0004';
  END IF;
  IF p_size_bytes IS NULL OR p_size_bytes <= 0 OR p_size_bytes > 52428800 THEN
    RAISE EXCEPTION 'size out of range' USING errcode = 'P0004';
  END IF;
  IF p_platform NOT IN ('ios', 'android') THEN
    RAISE EXCEPTION 'unsupported platform' USING errcode = 'P0004';
  END IF;
  IF p_app_version IS NULL OR length(p_app_version) < 1 OR length(p_app_version) > 32 THEN
    RAISE EXCEPTION 'app_version out of range' USING errcode = 'P0004';
  END IF;
  IF p_client_meta IS NULL OR octet_length(p_client_meta::text) > 1024 THEN
    RAISE EXCEPTION 'client_meta out of range' USING errcode = 'P0004';
  END IF;

  -- Rate limit: 3 reservations per device per 24h.
  SELECT count(*) INTO recent_count
    FROM bug_report_upload_rate_limit
    WHERE device_id = p_device_id
      AND reserved_at > (clock_timestamp() - interval '24 hours');

  IF recent_count >= 3 THEN
    RAISE EXCEPTION 'bug report rate limit exceeded' USING errcode = 'P0004';
  END IF;

  -- Reserve the row. Conflict on report_id is intentional — a repeat call
  -- with the same id is treated as replay of the same client request.
  INSERT INTO bug_reports (
    report_id, size_bytes, app_version, platform, device_id, status
  ) VALUES (
    p_report_id, p_size_bytes, p_app_version, p_platform, p_device_id, 'reserved'
  ) ON CONFLICT (report_id) DO NOTHING;

  INSERT INTO bug_report_upload_rate_limit (device_id) VALUES (p_device_id);

  -- Object path is deterministic from the report_id. The Pages Function
  -- uploads to this exact key using service_role.
  RETURN jsonb_build_object(
    'report_id', p_report_id,
    'object_path', 'bug-reports/' || p_report_id::text || '.br1'
  );
END;
$$;

-- Lock down execution: only service_role may call.
REVOKE ALL ON FUNCTION create_bug_report_upload(uuid, uuid, bigint, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_bug_report_upload(uuid, uuid, bigint, text, text, jsonb)
  TO service_role;

-- ============================================================================
-- 3. Storage bucket
-- ============================================================================

-- Create the bucket if it does not exist. Private (public = false); size
-- cap enforced at the RPC layer above rather than at the bucket layer so
-- the error surface for oversized uploads is consistent server-side.
INSERT INTO storage.buckets (id, name, public)
  VALUES ('bug-reports', 'bug-reports', false)
  ON CONFLICT (id) DO NOTHING;

-- No RLS policy on storage.objects for this bucket. service_role bypasses
-- RLS entirely, so it can read/write regardless. RLS-with-no-matching-policy
-- denies by default for anon and authenticated — which is what we want.
--
-- A prior version of this file DEFINED bug_reports_service_role_all with no
-- TO clause, which grants FOR ALL to PUBLIC (anon + authenticated). That
-- inverted the intent: it opened the bucket to every role instead of locking
-- it down. Removed 2026-09-07 (issue #2417). Never re-add a policy on this
-- bucket without an explicit TO clause naming the role.
DROP POLICY IF EXISTS bug_reports_service_role_all ON storage.objects;

-- Authorization test (run as postgres in Supabase SQL editor after applying).
--
-- Run the WHOLE block as one statement. The BEGIN/ROLLBACK wrapper is not
-- cosmetic: SET LOCAL scopes to the current transaction, and outside a
-- transaction block Postgres emits "SET LOCAL can only be used in transaction
-- blocks" and DISCARDS the setting. The role switches would then be no-ops and
-- every query below would run as the editor's own role — typically postgres,
-- which bypasses RLS — so the anon/authenticated assertions would be measuring
-- nothing. ROLLBACK also removes the need for a cleanup step.
--
--   BEGIN;
--
--   -- Step 0 — the assumption everything else rests on. With no policy on this
--   -- bucket, "deny by default" holds ONLY while RLS is enabled; if this comes
--   -- back f, the bucket is wide open and every result below is meaningless
--   -- rather than reassuring. Assert it FIRST.
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'storage.objects'::regclass;  -- t
--
--   -- Seed as the session role (bypasses RLS).
--   INSERT INTO storage.objects (bucket_id, name, owner, metadata)
--     VALUES ('bug-reports', 'test-object.br1', NULL, '{}'::jsonb);
--
--   -- anon must see and touch nothing.
--   SET LOCAL ROLE anon;
--   SELECT count(*) FROM storage.objects WHERE bucket_id = 'bug-reports';  -- 0
--   INSERT INTO storage.objects (bucket_id, name) VALUES ('bug-reports','x'); -- denied
--   UPDATE storage.objects SET name = 'y' WHERE bucket_id = 'bug-reports';    -- 0 rows
--   DELETE FROM storage.objects WHERE bucket_id = 'bug-reports';              -- 0 rows
--   RESET ROLE;
--
--   -- authenticated must see and touch nothing.
--   SET LOCAL ROLE authenticated;
--   SELECT count(*) FROM storage.objects WHERE bucket_id = 'bug-reports';  -- 0
--   INSERT INTO storage.objects (bucket_id, name) VALUES ('bug-reports','x'); -- denied
--   UPDATE storage.objects SET name = 'y' WHERE bucket_id = 'bug-reports';    -- 0 rows
--   DELETE FROM storage.objects WHERE bucket_id = 'bug-reports';              -- 0 rows
--   RESET ROLE;
--
--   -- Positive control: service_role still sees the seeded row (the Pages
--   -- Function upload path). Without this, a configuration that denied EVERY
--   -- role would pass all the assertions above.
--   SET LOCAL ROLE service_role;
--   SELECT count(*) FROM storage.objects WHERE bucket_id = 'bug-reports';  -- 1
--   RESET ROLE;
--
--   ROLLBACK;  -- discards the seeded row; no cleanup step needed

-- ============================================================================
-- 4. Retention sweep (manual invocation for now; slice 1e-3 or 2 wires cron)
-- ============================================================================

CREATE OR REPLACE FUNCTION prune_bug_reports() RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  purged int;
BEGIN
  -- Expire reservations that never uploaded (1h grace).
  UPDATE bug_reports
     SET status = 'expired'
   WHERE status = 'reserved'
     AND reserved_at < (clock_timestamp() - interval '1 hour');

  -- Delete metadata rows past 30d retention. Storage objects are removed
  -- by a matching sweep in the Pages Function / cron in slice 1e-3.
  WITH deleted AS (
    DELETE FROM bug_reports
     WHERE reserved_at < (clock_timestamp() - interval '30 days')
     RETURNING report_id
  ) SELECT count(*) INTO purged FROM deleted;

  -- Rate-limit ledger doesn't need long retention — 24h is plenty.
  DELETE FROM bug_report_upload_rate_limit
    WHERE reserved_at < (clock_timestamp() - interval '48 hours');

  RETURN purged;
END;
$$;

REVOKE ALL ON FUNCTION prune_bug_reports() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION prune_bug_reports() TO service_role;

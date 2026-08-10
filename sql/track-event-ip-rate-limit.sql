-- ============================================================================
-- M-7 (2026-07-28 internal audit) — MEDIUM
-- track_event rate limit bypassed by rotating device_id.
--
-- Run AFTER telemetry-events-allowlist.sql. Re-run definer-search-path-pin.sql
-- AFTER this file, because CREATE OR REPLACE FUNCTION drops the search_path
-- attribute — the pin note in definer-search-path-pin.sql already says so.
-- ============================================================================
--
-- WHY
--
-- The existing bucket is 60 events / device_id / hour. device_id is a random
-- UUID minted client-side in lib/deviceId.js, so an attacker rotating the UUID
-- gets unbounded write throughput against the events table under the anon key.
-- The metadata cap and event allowlist limit blast RADIUS per row, not RATE.
--
-- WHAT
--
-- Two additional buckets, checked in ADDITION to the existing device bucket.
-- track_event returns silently (fire-and-forget, matching prior behaviour) if
-- ANY bucket is exceeded — no bucket has veto rights the others do not have.
--
--   device : 60      / hour / device_id             (unchanged)
--   ip     : 600     / hour / x-forwarded-for       (new)
--   global : 100000  / hour                         (new, belt-and-braces)
--
-- IP is read from the Supabase edge proxy header. x-forwarded-for is a
-- comma-separated chain (`client, proxy1, proxy2`); the first entry is the
-- client-facing hop. If the header is absent (direct DB connections, tests,
-- misconfigured proxies) the IP bucket is SKIPPED rather than failing the
-- whole call — the device bucket still applies and the global bucket still
-- applies. This is the honest fail mode: with no IP we cannot bound per-IP,
-- so we do not pretend to; we do not fall through to "no rate limit at all"
-- either.
--
-- Hits are counted in a dedicated table rather than by scanning `events`,
-- because a bucket needs to count REJECTED attempts too (otherwise refusing
-- to insert also refuses to rate-limit — a hit-and-miss attacker never leaves
-- a trace). Hits are recorded BEFORE the events insert for the same reason.
--
-- SIZING
--
-- 600/hour/IP is generous enough that no legitimate device (60/hour cap) is
-- affected by shared NAT with up to ~10 concurrent users on the same egress
-- IP, and tight enough that rotating device_ids from one host is bounded to
-- 10x the intended per-device rate rather than unbounded. 100000/hour global
-- is roughly 100x current peak throughput — sized to catch a distributed
-- attack from many IPs, not to constrain steady-state traffic.
--
-- NOT RUN. Owner: run this file in the Supabase SQL editor, then re-run
-- sql/definer-search-path-pin.sql to restore the pin CREATE OR REPLACE drops.

-- ----------------------------------------------------------------------------
-- Attempts table.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS track_event_rate_hits (
  scope   text        NOT NULL CHECK (scope IN ('ip', 'global')),
  key     text        NOT NULL,
  hit_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_track_event_rate_hits_lookup
  ON track_event_rate_hits (scope, key, hit_at DESC);

ALTER TABLE track_event_rate_hits ENABLE ROW LEVEL SECURITY;
-- No policies. Only the SECURITY DEFINER track_event() reads or writes it.

-- ----------------------------------------------------------------------------
-- Function.
--
-- Body is a superset of telemetry-events-allowlist.sql: same allowlist, same
-- metadata cap, same device bucket, plus the two new buckets. Kept as one
-- CREATE OR REPLACE rather than an ALTER so the whole current-truth body is
-- readable in a single file — matching the pattern the prior track_event
-- migrations already established.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION track_event(
  p_device_id uuid,
  p_event     text,
  p_metadata  jsonb DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  recent_device int;
  recent_ip     int;
  recent_global int;
  headers       jsonb;
  client_ip     text := '';
BEGIN
  -- Payload cap: reject oversized metadata rather than storing it.
  IF p_metadata IS NOT NULL AND octet_length(p_metadata::text) > 4096 THEN
    RAISE EXCEPTION 'Metadata too large' USING errcode = 'P0004';
  END IF;

  IF p_event NOT IN (
    -- Original 7
    'wallet_created', 'wallet_imported', 'session_start',
    'send_completed', 'receive_viewed', 'wc_session_approved',
    'backup_confirmed',
    -- Onboarding funnel
    'first_open', 'onboarding_start', 'custody_path_chosen',
    'seed_generated', 'seed_revealed', 'seed_backup_acknowledged',
    'consent_granted', 'consent_denied',
    'seed_verify_started', 'seed_verify_attempt',
    'seed_verify_passed', 'seed_verify_failed',
    'seed_verify_deferred', 'seed_verify_resumed',
    'lock_method_set', 'wallet_ready',
    -- Funding
    'receive_address_viewed', 'first_inbound_detected', 'first_receive_shown',
    -- Send flow
    'send_flow_started', 'send_step_reached', 'send_abandoned', 'first_send',
    -- Unlock
    'unlock_attempt', 'unlock_result',
    -- Security / diagnostics
    'crypto_diagnostics', 'tamper_signal', 'security_modal_shown',
    'kek_unwrap_failed',
    -- dApp
    'dapp_connect_start', 'dapp_connect_result',
    -- Growth / paywall (PR #1340)
    'referral_code_applied', 'paywall_shown',
    'paywall_dismissed', 'paywall_converted'
  ) THEN
    RAISE EXCEPTION 'Unknown event' USING errcode = 'P0003';
  END IF;

  -- Read the edge-proxy header. current_setting throws if the GUC is missing
  -- and true has not been asked for — the second arg = true returns NULL
  -- instead. The extra BEGIN block also catches a malformed JSON header.
  BEGIN
    headers := current_setting('request.headers', true)::jsonb;
    IF headers IS NOT NULL THEN
      client_ip := trim(split_part(coalesce(headers->>'x-forwarded-for', ''), ',', 1));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    client_ip := '';
  END;

  -- Device bucket (unchanged): 60/hour/device_id.
  SELECT count(*) INTO recent_device
    FROM events
   WHERE device_id = p_device_id
     AND created_at > now() - interval '1 hour';

  IF recent_device >= 60 THEN
    RETURN;
  END IF;

  -- IP bucket: 600/hour/IP. Skipped when no IP is available.
  IF client_ip <> '' THEN
    SELECT count(*) INTO recent_ip
      FROM track_event_rate_hits
     WHERE scope = 'ip'
       AND key = client_ip
       AND hit_at > now() - interval '1 hour';

    IF recent_ip >= 600 THEN
      RETURN;
    END IF;
  END IF;

  -- Global bucket: 100000/hour. Belt-and-braces.
  SELECT count(*) INTO recent_global
    FROM track_event_rate_hits
   WHERE scope = 'global'
     AND hit_at > now() - interval '1 hour';

  IF recent_global >= 100000 THEN
    RETURN;
  END IF;

  -- Record hits BEFORE the insert so buckets count attempts, not just successes.
  IF client_ip <> '' THEN
    INSERT INTO track_event_rate_hits (scope, key) VALUES ('ip', client_ip);
  END IF;
  INSERT INTO track_event_rate_hits (scope, key) VALUES ('global', '');

  INSERT INTO events (device_id, event, metadata)
  VALUES (p_device_id, p_event, p_metadata);
END;
$$;

-- ----------------------------------------------------------------------------
-- Housekeeping suggestion (do NOT run automatically here — leaving cron
-- scheduling to the owner). Rows older than 2 hours are unused by any bucket
-- and can be pruned:
--
--   DELETE FROM track_event_rate_hits WHERE hit_at < now() - interval '2 hours';
--
-- Suggested pg_cron entry (owner runs manually):
--
--   SELECT cron.schedule(
--     'prune-track-event-rate-hits',
--     '17 * * * *',
--     $$DELETE FROM track_event_rate_hits WHERE hit_at < now() - interval '2 hours'$$
--   );
-- ----------------------------------------------------------------------------

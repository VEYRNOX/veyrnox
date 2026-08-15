-- Expand track_event() allowlist with funnel/diagnostic events.
-- Run AFTER api-security-hardening.sql.
--
-- Two hardening fixes land with this revision (both pre-dated the funnel work,
-- neither was ever present in api-security-hardening.sql):
--   1. SET search_path — a SECURITY DEFINER function without a pinned
--      search_path resolves unqualified names (`events`) against the CALLER's
--      search_path, the classic definer-rights escalation path.
--   2. The 4 KB metadata cap that CLAUDE.md has been documenting as if it
--      existed. It did not exist in any version of this function; p_metadata
--      was accepted unbounded. It is enforced below for real now.
CREATE OR REPLACE FUNCTION track_event(
  p_device_id uuid,
  p_event     text,
  p_metadata  jsonb DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  recent_count int;
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
    -- Codex P2 2026-08-15: WC rejectRequest emits this from src/wallet-core/
    -- evm/walletconnect/session.js. Missing here made every reject a silent
    -- P0003 → trackEvent swallow. Added in the same commit as the client
    -- ALLOWED_EVENTS entry in src/api/trackEvent.js.
    'dapp_request_rejected',
    -- Growth / paywall (PR #1340)
    'referral_code_applied', 'paywall_shown',
    'paywall_dismissed', 'paywall_converted'
  ) THEN
    RAISE EXCEPTION 'Unknown event' USING errcode = 'P0003';
  END IF;

  SELECT count(*) INTO recent_count
  FROM events
  WHERE device_id = p_device_id
    AND created_at > now() - interval '1 hour';

  IF recent_count >= 60 THEN
    RETURN;
  END IF;

  INSERT INTO events (device_id, event, metadata)
  VALUES (p_device_id, p_event, p_metadata);
END;
$$;

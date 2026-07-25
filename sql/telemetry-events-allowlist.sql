-- Expand track_event() allowlist with funnel/diagnostic events.
-- Run AFTER api-security-hardening.sql.
CREATE OR REPLACE FUNCTION track_event(
  p_device_id uuid,
  p_event     text,
  p_metadata  jsonb DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  recent_count int;
BEGIN
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
    'receive_address_viewed', 'first_inbound_detected',
    -- Send flow
    'send_flow_started', 'send_step_reached', 'send_abandoned', 'first_send',
    -- Unlock
    'unlock_attempt', 'unlock_result',
    -- Security / diagnostics
    'crypto_diagnostics', 'tamper_signal', 'security_modal_shown',
    'kek_unwrap_failed',
    -- dApp
    'dapp_connect_start', 'dapp_connect_result'
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

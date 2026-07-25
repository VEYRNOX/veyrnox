// src/api/trackEvent.js
//
// Privacy-respecting anonymous event tracking via Supabase.
// Follows the referralApi.js pattern: null-guard on supabase,
// gate on DEMO (load-time) + isDeniabilityOrDemoActive() (live),
// best-effort fire-and-forget.
//
// I2 compliance: no silent egress in deniability/demo sessions.
// I3 compliance: device_id is only written in real primary sessions
// (tracking is fully suppressed in demo/deniability, so the key is
// never created on a demo-only install). No event content
// distinguishes real from decoy.

import { supabase } from '@/lib/supabaseClient';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import { DEMO } from '@/api/demoClient';
import { getOrCreateDeviceId } from '@/lib/deviceId';

export async function trackEvent(event, metadata = {}) {
  if (!supabase || DEMO || isDeniabilityOrDemoActive()) return;
  const deviceId = getOrCreateDeviceId();
  if (!deviceId) return;
  try {
    await supabase.rpc('track_event', {
      p_device_id: deviceId,
      p_event: event,
      p_metadata: metadata && typeof metadata === 'object' ? metadata : {},
    });
  } catch {
    // Best-effort: never block the app on analytics failure.
  }
}

// Convenience constants to avoid typos at call sites.
export const EVENT = {
  WALLET_CREATED: 'wallet_created',
  WALLET_IMPORTED: 'wallet_imported',
  SESSION_START: 'session_start',
  SEND_COMPLETED: 'send_completed',
  RECEIVE_VIEWED: 'receive_viewed',
  WC_SESSION_APPROVED: 'wc_session_approved',
  BACKUP_CONFIRMED: 'backup_confirmed',
  REFERRAL_CODE_APPLIED: 'referral_code_applied',
  PAYWALL_SHOWN: 'paywall_shown',
  PAYWALL_DISMISSED: 'paywall_dismissed',
  PAYWALL_CONVERTED: 'paywall_converted',
  // Funnel/diagnostic events — see src/lib/analytics.js FunnelEvent for the
  // canonical enum new call sites should import from. Mirrored here only for
  // discoverability alongside the original 7; emit() calls trackEvent()
  // with the raw string, so this object is not consumed functionally.
  FIRST_OPEN: 'first_open',
  ONBOARDING_START: 'onboarding_start',
  CUSTODY_PATH_CHOSEN: 'custody_path_chosen',
  SEED_GENERATED: 'seed_generated',
  SEED_REVEALED: 'seed_revealed',
  SEED_BACKUP_ACKNOWLEDGED: 'seed_backup_acknowledged',
  CONSENT_GRANTED: 'consent_granted',
  CONSENT_DENIED: 'consent_denied',
  SEED_VERIFY_STARTED: 'seed_verify_started',
  SEED_VERIFY_ATTEMPT: 'seed_verify_attempt',
  SEED_VERIFY_PASSED: 'seed_verify_passed',
  SEED_VERIFY_FAILED: 'seed_verify_failed',
  SEED_VERIFY_DEFERRED: 'seed_verify_deferred',
  SEED_VERIFY_RESUMED: 'seed_verify_resumed',
  LOCK_METHOD_SET: 'lock_method_set',
  WALLET_READY: 'wallet_ready',
  RECEIVE_ADDRESS_VIEWED: 'receive_address_viewed',
  FIRST_INBOUND_DETECTED: 'first_inbound_detected',
  SEND_FLOW_STARTED: 'send_flow_started',
  SEND_STEP_REACHED: 'send_step_reached',
  SEND_ABANDONED: 'send_abandoned',
  FIRST_SEND: 'first_send',
  UNLOCK_ATTEMPT: 'unlock_attempt',
  UNLOCK_RESULT: 'unlock_result',
  CRYPTO_DIAGNOSTICS: 'crypto_diagnostics',
  TAMPER_SIGNAL: 'tamper_signal',
  SECURITY_MODAL_SHOWN: 'security_modal_shown',
  KEK_UNWRAP_FAILED: 'kek_unwrap_failed',
  DAPP_CONNECT_START: 'dapp_connect_start',
  DAPP_CONNECT_RESULT: 'dapp_connect_result',
>>>>>>> claude/transak-integration-recommendations-96fb78
};

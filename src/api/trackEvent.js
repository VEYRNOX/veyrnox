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

import { rpc } from '@/api/edgeApi';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import { DEMO } from '@/api/demoClient';
import { getOrCreateDeviceId } from '@/lib/deviceId';
import { hasConsent } from '@/lib/consent';

const METADATA_BYTE_LIMIT = 4096;

export async function trackEvent(event, metadata = {}) {
  if (DEMO || isDeniabilityOrDemoActive()) return;
  // Client-side pre-flight: mirrors the server allowlist and 4 KB cap in
  // sql/telemetry-events-allowlist.sql. Catches typos at call sites in dev
  // and avoids unnecessary round-trips for invalid input.
  if (typeof event !== 'string' || !ALLOWED_EVENTS.has(event)) return;
  const safeMetadata = metadata && typeof metadata === 'object' ? metadata : {};
  if (JSON.stringify(safeMetadata).length > METADATA_BYTE_LIMIT) return;
  // CONSENT IS CHECKED HERE, NOT AT THE CALL SITE. Previously only
  // analytics.js emit() gated on consent, so the 11 pre-existing call sites
  // that invoke trackEvent() directly (WalletProvider, SendCrypto,
  // ReceiveCrypto, WalletConnectProvider, referral + paywall) uploaded events
  // from users who had explicitly declined. Gating at the single egress
  // chokepoint means a new call site cannot reintroduce that bypass.
  //
  // NOTE: nothing is exempt — not even the consent-decision events. A denial
  // is recorded locally and never transmitted (see TelemetryConsent.jsx);
  // CONSENT_GRANTED passes because setConsent() writes synchronously before
  // the call, so hasConsent() is already true by the time we read it.
  if (!hasConsent()) return;
  const deviceId = getOrCreateDeviceId();
  if (!deviceId) return;
  try {
    await rpc('track_event', {
      p_device_id: deviceId,
      p_event: event,
      p_metadata: safeMetadata,
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
  FIRST_RECEIVE_SHOWN: 'first_receive_shown',
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
};

// Set built after EVENT so TypeScript infers Set<string> with no null union.
// trackEvent() closes over this — by call time the module is fully initialised.
const ALLOWED_EVENTS = new Set(Object.values(EVENT));

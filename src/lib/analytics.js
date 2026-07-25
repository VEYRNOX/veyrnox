// src/lib/analytics.js — Consent-gated analytics wrapper.
// All events flow through trackEvent() (I2/I3 gates baked in — see
// src/api/trackEvent.js for the demo/deniability/no-supabase guards).
// Consent is a localStorage flag, not a server round-trip.
//
// CONSENT_GRANTED / CONSENT_DENIED are the one exception: those two events
// describe the consent decision itself, so they must fire via trackEvent()
// directly (see FunnelEvent below) rather than through emit(), which would
// otherwise suppress CONSENT_DENIED (no consent yet) and race
// CONSENT_GRANTED against the localStorage write.

import { trackEvent } from '@/api/trackEvent';

const CONSENT_KEY = 'veyrnox-telemetry-consent';

export function setConsent(granted) {
  try { localStorage.setItem(CONSENT_KEY, granted ? 'granted' : 'denied'); } catch {}
}

export function hasConsent() {
  return getConsentState() === 'granted';
}

export function getConsentState() {
  try { return localStorage.getItem(CONSENT_KEY); } catch { return null; }
}

export async function emit(event, metadata = {}) {
  if (!hasConsent()) return;
  return trackEvent(event, metadata);
}

export const FunnelEvent = {
  // Onboarding funnel
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
  // Funding funnel
  RECEIVE_ADDRESS_VIEWED: 'receive_address_viewed',
  FIRST_INBOUND_DETECTED: 'first_inbound_detected',
  // Send flow
  SEND_FLOW_STARTED: 'send_flow_started',
  SEND_STEP_REACHED: 'send_step_reached',
  SEND_ABANDONED: 'send_abandoned',
  FIRST_SEND: 'first_send',
  // Unlock
  UNLOCK_ATTEMPT: 'unlock_attempt',
  UNLOCK_RESULT: 'unlock_result',
  // Security
  CRYPTO_DIAGNOSTICS: 'crypto_diagnostics',
  TAMPER_SIGNAL: 'tamper_signal',
  SECURITY_MODAL_SHOWN: 'security_modal_shown',
  KEK_UNWRAP_FAILED: 'kek_unwrap_failed',
  // dApp
  DAPP_CONNECT_START: 'dapp_connect_start',
  DAPP_CONNECT_RESULT: 'dapp_connect_result',
};

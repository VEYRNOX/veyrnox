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
};

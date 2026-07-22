// src/api/trackEvent.js
//
// Privacy-respecting anonymous event tracking via Supabase.
// Follows the referralApi.js pattern: null-guard on supabase,
// gate on isDeniabilityOrDemoActive(), best-effort fire-and-forget.
//
// I2 compliance: no silent egress in deniability/demo sessions.
// I3 compliance: device_id is stored in localStorage under a key
// that exists identically in real AND demo sessions (set once on
// first real-session track, never written in deniability/demo).
// No event content distinguishes real from decoy.

import { supabase } from '@/lib/supabaseClient';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import { DEMO } from '@/api/demoClient';

const DEVICE_ID_KEY = 'veyrnox-device-id';

function getOrCreateDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (id) return id;
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return null;
  }
}

export async function trackEvent(event, metadata = {}) {
  if (!supabase || DEMO || isDeniabilityOrDemoActive()) return;
  const deviceId = getOrCreateDeviceId();
  if (!deviceId) return;
  try {
    await supabase.from('events').insert({
      device_id: deviceId,
      event,
      metadata,
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

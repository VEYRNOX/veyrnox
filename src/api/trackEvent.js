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

const DEVICE_ID_KEY = 'veyrnox-device-id';

function getOrCreateDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (id) return id;
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      id = crypto.randomUUID();
    } else if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const buf = new Uint8Array(16);
      crypto.getRandomValues(buf);
      buf[6] = (buf[6] & 0x0f) | 0x40;
      buf[8] = (buf[8] & 0x3f) | 0x80;
      const h = [...buf].map(b => b.toString(16).padStart(2, '0')).join('');
      id = `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
    } else {
      id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
    }
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
    const { error } = await supabase.from('events').insert({
      device_id: deviceId,
      event,
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
    });
    if (error) return;
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

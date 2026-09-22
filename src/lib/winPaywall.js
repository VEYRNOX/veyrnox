// src/lib/winPaywall.js
//
// The WIN emitter. Lives apart from components/WinPaywall.jsx so non-React
// modules (WalletProvider) can fire a win without pulling in the modal, the
// router, framer-motion and Vigil.
//
// I3 chokepoint #1: a decoy/demo session never dispatches. The listener in
// WinPaywall.jsx re-checks live at render — a session can flip between the two.

import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

export const WIN_EVENT = 'veyrnox:win';

// The wins. Values ride in PAYWALL_* metadata as `trigger`, so they are series
// keys in production `public.events` — renaming one splits its series.
//
// There is deliberately NO wallet-created win: creation is mid-onboarding and
// WIN.BACKUP_CONFIRMED fires moments later on the same flow. See the note at
// WalletProvider.createWallet before adding one back.
export const WIN = Object.freeze({
  WALLET_IMPORTED: 'win_wallet_imported',
  BACKUP_CONFIRMED: 'win_backup_confirmed',
  SEND_COMPLETED: 'win_send_completed',
  FIRST_INBOUND: 'win_first_inbound',
});

// In-memory only (no residue key): set once a win has fired in this app
// process. PaywallNudge reads it so a user who just saw the WIN modal (e.g. on
// seed restore) does not get a second upsell stacked straight after it, nor
// again on a lock/unlock minutes later. A cold restart resets it.
let winFired = false;
export function winFiredThisSession() {
  return winFired;
}

export function recordWin(trigger) {
  if (isDeniabilityOrDemoActive()) return;
  winFired = true;
  try {
    window.dispatchEvent(new CustomEvent(WIN_EVENT, { detail: { trigger } }));
  } catch {
    // Best-effort: an upsell must never break the win it is celebrating.
  }
}

// src/lib/kekPinNotice.js
//
// M-9 (S1-S4 audit): one-time proactive notice for native users whose vault has
// no hardware KEK wrap — their only protection is Argon2id over an 8-digit PIN,
// which a GPU cluster could exhaust in days. The notice fires once on first
// unlock after install, never on web, never when KEK is already enrolled.
//
// Pattern mirrors ensureBiometric2faOnNative (biometric.js) — best-effort, never
// throws, fire-and-forget from WalletProvider.unlock().

import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { getKeyStore } from '@/wallet-core/keystore';
// Issue #1094 (I3, GAP-6-adjacent): the short-PIN disclosure toast AND its
// persisted localStorage marker are both deniability tells — the toast is a
// UI-visible artefact of a real vault (a decoy/hidden/demo session must never
// surface it), and the marker itself proves a real Veyrnox vault existed on the
// device. Gate BOTH on the LIVE deniability-or-demo helper (PR #978 pattern),
// so a session flipped after module import is still respected.
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession.js';


export const KEK_PIN_NOTICE_KEY = 'veyrnox-kek-pin-notice';

export async function ensureKekPinNoticeOnNative() {
  try {
    if (!Capacitor.isNativePlatform()) return;
    // I3 (issue #1094): fail-closed — no toast, no marker write in a decoy/
    // hidden/demo session. Gate BEFORE the localStorage read too, so the marker
    // is never even queried in a deniability context.
    if (isDeniabilityOrDemoActive()) return;
    if (localStorage.getItem(KEK_PIN_NOTICE_KEY)) return;

    const ks = getKeyStore();
    const enrolled = typeof ks.hasVaultKekWrap === 'function'
      ? await ks.hasVaultKekWrap()
      : false;
    // Mark regardless so the notice never fires retroactively if the user unenrolls.
    localStorage.setItem(KEK_PIN_NOTICE_KEY, '1');
    if (enrolled) return;

    toast.warning(
      'Your vault relies on an 8-digit PIN (~100 million combinations). ' +
      'A GPU cluster could exhaust them in days. ' +
      'Enable Face ID or fingerprint in Security Settings to make offline attacks infeasible.',
      { duration: 9000 },
    );
  } catch {
    // best-effort — never block unlock
  }
}

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

const _ks = getKeyStore();

export const KEK_PIN_NOTICE_KEY = 'veyrnox-kek-pin-notice';

export async function ensureKekPinNoticeOnNative() {
  try {
    if (!Capacitor.isNativePlatform()) return;
    if (localStorage.getItem(KEK_PIN_NOTICE_KEY)) return;

    const enrolled = typeof _ks.hasVaultKekWrap === 'function'
      ? await _ks.hasVaultKekWrap()
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

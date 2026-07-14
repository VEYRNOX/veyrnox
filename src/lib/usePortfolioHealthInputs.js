// @ts-nocheck
// lib/usePortfolioHealthInputs.js
//
// R2 facade hook that gathers the non-portfolio inputs the Portfolio Health
// widget needs, so UI components never import wallet-core/keystore, passkey,
// biometric, or the deniability marker directly (ring boundary: R0/R1 → R2).
//
// Returns a stable object:
//   { isVaultKekEnrolled, hasPasskeyOrBiometric, isDeniability }
//
// Fail-closed (I4): every read defaults to the WEAKER interpretation on error
//   - KEK check throws / unavailable / web  → isVaultKekEnrolled = false
//   - passkey/biometric read throws          → hasPasskeyOrBiometric = false
// I3: in a deniability/demo session we do NOT touch the keystore at all and we
//   report isDeniability = true so the caller suppresses the score entirely.

import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { getKeyStore } from '@/wallet-core/keystore';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import { isPasskeyRegistered } from '@/lib/passkey';
import { isBiometricUnlockEnabled } from '@/lib/biometric';

/** Synchronous, side-effect-free read of the app-layer control flags. */
export function readPasskeyOrBiometric() {
  let passkey = false;
  let biometric = false;
  try { passkey = isPasskeyRegistered() === true; } catch { passkey = false; }
  try { biometric = isBiometricUnlockEnabled() === true; } catch { biometric = false; }
  return passkey || biometric;
}

/**
 * @param {{ isUnlocked?: boolean }} [opts]
 */
export function usePortfolioHealthInputs({ isUnlocked = true } = {}) {
  const isDeniability = (() => {
    try { return isDeniabilityOrDemoActive() === true; } catch { return true; } // fail-closed
  })();

  const [isVaultKekEnrolled, setKek] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      // I3: no keystore access in a deniability/demo session.
      if (!isUnlocked || isDeniability) { if (live) setKek(false); return; }
      // Web has no native hardware KEK wrap; report false (fail-closed).
      if (!Capacitor.isNativePlatform()) { if (live) setKek(false); return; }
      try {
        const ks = getKeyStore();
        if (typeof ks.hasVaultKekWrap !== 'function') { if (live) setKek(false); return; }
        const wrapped = await ks.hasVaultKekWrap();
        if (live) setKek(wrapped === true);
      } catch {
        if (live) setKek(false); // fail-closed: unknown → not enrolled
      }
    })();
    return () => { live = false; };
  }, [isUnlocked, isDeniability]);

  // In a deniability session the control flags are irrelevant (score is hidden);
  // still report them fail-closed to avoid any incidental tell.
  const hasPasskeyOrBiometric = isDeniability ? false : readPasskeyOrBiometric();

  return { isVaultKekEnrolled: isDeniability ? false : isVaultKekEnrolled, hasPasskeyOrBiometric, isDeniability };
}

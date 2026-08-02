// @ts-nocheck
// lib/hardwareKekStatus.js — R2 facade for READ-ONLY hardware-KEK status.
// UI components call this instead of importing wallet-core/keystore directly
// (ring-import-lint). Same pattern as lib/useKekEnrollmentGate.js.
//
// Reports TWO things: (a) whether a hardware credential alias exists, AND
// (b) whether the current vault is actually KEK-wrapped. An orphaned alias
// without a kekWrap is NOT treated as "active" — that would inflate the
// posture score for an unprotected vault.

import { isHardwareEnrolled } from '@/wallet-core/keystore/hardware';
import { getKeyStore } from '@/wallet-core/keystore/index';

/** @returns {Promise<boolean>} whether a hardware KEK credential is enrolled AND the vault is KEK-wrapped. */
export async function isHardwareKekEnrolled() {
  try {
    const enrolled = await isHardwareEnrolled();
    if (!enrolled) return false;
    const ks = getKeyStore();
    return typeof ks.hasVaultKekWrap === 'function'
      ? await ks.hasVaultKekWrap()
      : false;
  } catch {
    return false;
  }
}

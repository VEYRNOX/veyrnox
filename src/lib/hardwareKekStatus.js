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
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

/**
 * @returns {Promise<boolean>} whether a hardware KEK credential is enrolled
 * AND the vault is KEK-wrapped.
 *
 * Codex P2 2026-08-15 — self-defensive I3 gate. Every caller today already
 * folds a decoy/hidden check into whether it shows KEK state, but the
 * function itself was an ungated status oracle: any future caller that
 * forgot the local guard could answer "is this device KEK-enrolled?" from a
 * decoy/demo session (a deniability tell about the REAL wallet's security
 * posture). Fail-closed to false in deniable — matches the WalletProvider
 * hasVault export gate from PR #1825.
 */
export async function isHardwareKekEnrolled() {
  if (isDeniabilityOrDemoActive()) return false;
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

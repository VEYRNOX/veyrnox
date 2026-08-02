// @ts-nocheck
// lib/hardwareKekStatus.js — R2 facade for a READ-ONLY hardware-KEK enrollment
// check. src/lib is not a forbidden ring layer, so this module may import from
// wallet-core/keystore directly (ring-import-lint). UI components (src/components)
// must NOT import wallet-core/keystore/* directly — they call this facade instead,
// same pattern as lib/useKekEnrollmentGate.js.
//
// Read-only: this never enrolls, clears, or mutates the hardware credential — it
// only reports whether one already exists, for display purposes (e.g. the Security
// Posture widget). Best-effort: any probe error resolves to `false` rather than
// throwing, since a status widget must never crash the dashboard it's on (I4 — a
// failed read is treated as "not enrolled", the conservative/lower-score answer).

import { isHardwareEnrolled } from '@/wallet-core/keystore/hardware';

/** @returns {Promise<boolean>} whether a hardware KEK credential is enrolled on this device. */
export async function isHardwareKekEnrolled() {
  try {
    return await isHardwareEnrolled();
  } catch {
    return false;
  }
}

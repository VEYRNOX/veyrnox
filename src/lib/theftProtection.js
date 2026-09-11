// @ts-nocheck
// lib/theftProtection.js
//
// Theft Protection — extra OS-biometric factor at the unlock chokepoint,
// composed on top of PIN + KEK (which WalletProvider.unlock() has already run
// successfully by the time this gate fires).
//
// SCOPE (honest ceiling):
//   * We do NOT enroll any face data. OS biometric only (Face ID / Android
//     BIOMETRIC_STRONG). Zero face templates stored by us.
//   * iOS is face-STRICT: after verifyBiometric2fa() succeeds we post-check
//     the cached biometryType and reject anything that is not Face ID
//     (touchId → 'requires-face').
//   * Android accepts any BIOMETRIC_STRONG class. There is no public API to
//     force face-only on Android — UI copy must be honest about that.
//   * Fail-closed (I4) on RASP WARN/BLOCK, on biometric decline, on any
//     probe/verify error, and on an unknown biometryType.
//   * K-2: never fires on decoy/hidden — the caller passes isPrimary and this
//     gate short-circuits to a no-op there. Prompting on decoy would be an I3
//     tell (real-user setting reflected on a coerced surface).
//   * The setting WRITE is I3-guarded (setBiometricUnlockEnabled pattern from
//     lib/biometric.js). READS are ungated to match the module's convention
//     (a decoy unlock ceremony may need to read real prefs during the
//     pre-decision window).
//
// STATUS: BUILT — not "verified". No device-verification and no independent
// audit. Do not promote the featureCatalogue entry.

import { Capacitor } from '@capacitor/core';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import { verifyBiometric2fa } from '@/lib/biometric';
import { getCachedBiometry } from '@/lib/biometricProbe';
import { getFreshRaspArtifact, TIER } from '@/rasp';

export const THEFT_PROTECTION_KEY = 'veyrnox-theft-protection';

/** @returns {boolean} default false; opt-in setting. */
export function isTheftProtectionEnabled() {
  try {
    return localStorage.getItem(THEFT_PROTECTION_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Persist the Theft Protection preference. I3-guarded (K-2): a deniable/demo
 * session must NOT mutate the real user's device-global setting, matching
 * setBiometricUnlockEnabled in lib/biometric.js.
 */
export function setTheftProtectionEnabled(on) {
  if (isDeniabilityOrDemoActive()) return;
  try {
    if (on) localStorage.setItem(THEFT_PROTECTION_KEY, '1');
    else localStorage.removeItem(THEFT_PROTECTION_KEY);
  } catch {
    /* best-effort; storage unavailable */
  }
}

/**
 * Fail-closed error thrown by runTheftProtectionGate. `reason` is the
 * machine-stable code — copy changes, codes are the contract.
 *
 *   'rasp-blocked'          — RASP tier was WARN or BLOCK at unlock time.
 *   'rasp-unavailable'      — RASP artifact fetch failed (fail closed).
 *   'declined'              — OS biometric cancelled, mismatched, or errored.
 *   'requires-face'         — iOS device had biometryType !== 'faceId'.
 *   'biometry-probe-failed' — biometryType could not be read (fail closed).
 */
export class TheftProtectionError extends Error {
  constructor(reason = 'declined', cause) {
    super(`Theft Protection ${reason}`);
    this.name = 'TheftProtectionError';
    this.reason = reason;
    this.cause = cause;
    this.isTheftProtectionError = true;
  }
}

/** duck-typed so it survives structuredClone / cross-bundle boundaries. */
export function isTheftProtectionError(err) {
  return !!(err && typeof err === 'object' && err.isTheftProtectionError);
}

/**
 * User-facing copy per gate reason (#2515). The gate only runs AFTER the PIN
 * has decrypted the vault, so a failure here must never read as a wrong PIN —
 * and must never reach the wrong-PIN wipe counter. Every unlock surface renders
 * from this one map so they cannot drift (same shape as PASSKEY_GATE_MESSAGES).
 */
export const THEFT_PROTECTION_MESSAGES = Object.freeze({
  'rasp-blocked': "Theft Protection kept your wallet locked because this device's security check didn't pass. Try again.",
  'rasp-unavailable': "Theft Protection couldn't check this device's security, so your wallet stayed locked. Try again.",
  declined: "Theft Protection's biometric check didn't pass, so your wallet stayed locked. Try again.",
  'requires-face': 'Theft Protection on iPhone needs Face ID, so your wallet stayed locked.',
  'biometry-probe-failed': "Theft Protection couldn't read this device's biometric settings, so your wallet stayed locked. Try again.",
  error: "Theft Protection couldn't finish its check, so your wallet stayed locked. Try again.",
});

export function theftProtectionMessage(err) {
  return THEFT_PROTECTION_MESSAGES[err?.reason] ?? THEFT_PROTECTION_MESSAGES.error;
}

/**
 * @aparajita/capacitor-biometric-auth BiometryType enum:
 *   none=0, touchId=1, faceId=2, fingerprintAuthentication=3,
 *   faceAuthentication=4, irisAuthentication=5.
 * Accept the numeric enum value AND the string label — tests pin the semantic
 * string, runtime returns the integer.
 */
export function isFaceBiometry(biometryType) {
  return biometryType === 'faceId' || biometryType === 2;
}

/**
 * Can Theft Protection be ENABLED on this device? (#2515) Checked when the user
 * switches it on, so a device the gate would refuse at every unlock cannot opt
 * in. Mirrors the gate's own preconditions: native only (verifyBiometric2fa
 * throws off-native), an available biometric, and Face ID on iOS (the gate's
 * post-check). Never throws — a failed probe reads as unsupported.
 *
 * @returns {Promise<{supported: boolean, reason: 'not-native'|'no-biometric'|'requires-face'|null}>}
 */
export async function getTheftProtectionSupport({
  platform = Capacitor?.getPlatform ? Capacitor.getPlatform() : 'web',
  probe = getCachedBiometry,
} = {}) {
  if (platform !== 'ios' && platform !== 'android') {
    return { supported: false, reason: 'not-native' };
  }
  let info = null;
  try { info = await probe(); } catch { info = null; }
  if (!info?.isAvailable) return { supported: false, reason: 'no-biometric' };
  if (platform === 'ios' && !isFaceBiometry(info.biometryType)) {
    return { supported: false, reason: 'requires-face' };
  }
  return { supported: true, reason: null };
}

/**
 * Run the Theft Protection gate. Called from WalletProvider.unlock() AFTER
 * PIN + KEK have already succeeded and AFTER assertUnlockCurrent(), gated on
 * isPrimary.
 *
 * Deps injected so the pure logic is testable without native plugins:
 * @param {{
 *   isPrimary: boolean,
 *   enabled?: () => boolean,
 *   verify?: () => Promise<boolean>,
 *   probe?: () => Promise<{biometryType?: any} | null>,
 *   raspArtifact?: () => Promise<{tier?: string} | null>,
 *   platform?: string,
 * }} opts
 * @returns {Promise<void>} resolves silently on success; throws
 *   TheftProtectionError on any failure (fail closed).
 */
export async function runTheftProtectionGate({
  isPrimary,
  enabled = isTheftProtectionEnabled,
  verify = verifyBiometric2fa,
  probe = getCachedBiometry,
  raspArtifact = getFreshRaspArtifact,
  platform,
} = {}) {
  // K-2: never prompt on decoy/hidden. Silent no-op — the coerced session must
  // not observe that Theft Protection is even configured.
  if (!isPrimary) return;
  if (!enabled()) return;

  // RASP composition — a WARN/BLOCK device fails closed BEFORE the biometric
  // prompt (no point asking Face ID on a jailbroken/rooted device just to
  // ignore the result).
  let raspTier;
  try {
    const art = await raspArtifact();
    raspTier = art?.tier;
  } catch (err) {
    throw new TheftProtectionError('rasp-unavailable', err);
  }
  if (raspTier !== TIER.ALLOW) {
    throw new TheftProtectionError('rasp-blocked');
  }

  // OS biometric. verifyBiometric2fa itself fails closed (throws on cancel /
  // no-match / unavailable). We normalise any throw into a stable 'declined'.
  let verified;
  try {
    verified = await verify();
  } catch (err) {
    throw new TheftProtectionError('declined', err);
  }
  if (!verified) throw new TheftProtectionError('declined');

  // iOS face-strict post-check. Android has no public API to require face
  // specifically — accepting any Class-3 biometric there is the honest
  // ceiling; UI copy documents the asymmetry.
  const plat = platform ?? (Capacitor?.getPlatform ? Capacitor.getPlatform() : 'web');
  if (plat === 'ios') {
    let biometryType;
    try {
      const info = await probe();
      biometryType = info?.biometryType;
    } catch (err) {
      throw new TheftProtectionError('biometry-probe-failed', err);
    }
    if (!isFaceBiometry(biometryType)) throw new TheftProtectionError('requires-face');
  }
}

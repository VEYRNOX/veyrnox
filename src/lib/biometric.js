// lib/biometric.js — app-layer biometric-unlock UI helpers (preference + status).
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ PROVISIONAL UI — NOT AUDITED-SECURE, NOT OS-ENFORCED.                      │
// │ This is the *user-facing* layer on top of M2b's native keyStore biometric │
// │ gate (src/wallet-core/keystore/native.js). M2b's gate is itself an        │
// │ APP-LAYER "authenticate → then read" check, NOT an OS-enforced Keychain/  │
// │ Keystore biometric ACL — it is flagged for independent audit and likely   │
// │ OS-enforced rework (see M2c/M2d). This file adds NO new security          │
// │ guarantee; it only renders the toggle, status, and (in demo) a clearly    │
// │ simulated prompt. Do not treat the demo prompt as real OS security.       │
// └─────────────────────────────────────────────────────────────────────────┘
//
// SCOPE: reads/writes a single boolean preference, and reports biometric
// availability for the Security settings screen. It NEVER touches vault crypto
// (vault.js/vaultStore.js) or the mainnet gate. The actual unlock wiring lives
// in WalletProvider.unlock(); this module is its source of truth for "is the
// biometric unlock gate required?" and "what should the prompt look like?".

import { Capacitor } from '@capacitor/core';
import { DEMO } from '@/api/demoClient';

// localStorage key for the user's "require biometric unlock" preference. Mirrors
// the app's existing localStorage-preference convention (see BiometricAuth.jsx,
// demoClient.js). Stored as "1" (on) / absent (off).
export const BIOMETRIC_PREF_KEY = 'veyrnox-biometric-unlock';

// Separate preference for "use the OS biometric as my SECOND FACTOR at critical
// actions" (send, reveal seed, duress/stealth setup) — the device-global dual of
// the passkey-2FA pref (lib/passkey.js TWOFACTOR_PASSKEY_KEY). Independent of the
// biometric-UNLOCK pref above: a user can require biometrics on send without
// requiring them to unlock, and vice-versa. Stored as "1" (on) / absent (off).
export const TWOFACTOR_BIOMETRIC_KEY = 'veyrnox-2fa-biometric';

/** @returns {boolean} whether the user has required biometric unlock. */
export function isBiometricUnlockEnabled() {
  // On native, biometric/passcode is always required by the OS — treat as always on.
  // localStorage is wiped on app uninstall, so we can't rely on the stored pref here.
  try {
    if (Capacitor.isNativePlatform()) return true;
    return localStorage.getItem(BIOMETRIC_PREF_KEY) === '1';
  } catch {
    return false;
  }
}

/** @returns {boolean} has the user turned on "OS biometric as my critical-action second factor"? */
export function is2faBiometricEnabled() {
  try {
    return localStorage.getItem(TWOFACTOR_BIOMETRIC_KEY) === '1';
  } catch {
    return false;
  }
}

/** Persist the "OS biometric is my critical-action second factor" preference. */
export function set2faBiometricEnabled(on) {
  try {
    if (on) localStorage.setItem(TWOFACTOR_BIOMETRIC_KEY, '1');
    else localStorage.removeItem(TWOFACTOR_BIOMETRIC_KEY);
  } catch {
    /* storage unavailable — preference is best-effort, non-fatal. */
  }
}

/**
 * Perform a REAL OS biometric authentication as a SECOND FACTOR, returning true on
 * a successful match. This is the possession-factor dual of verifyPasskeyAssertion()
 * (lib/passkey.js): it yields NO secret and decrypts nothing — it is purely a gate
 * signal the caller composes with the PIN via evaluateTwoFactor().
 *
 * FAIL CLOSED (I4): a cancel / no-match / lockout / unavailable all THROW, so the
 * caller's `try { ok = await verifyBiometric2fa() } catch { ok = false }` treats
 * them as NOT verified — the opposite of the unlock gate's deliberate degrade path.
 * (A blocked critical action is safe; the user can disable this factor in settings.)
 *
 * Policy mirrors the audited keystore/native.js → authenticateOrThrow and
 * biometricUnlock.js: require a biometric match, with a one-time device-credential
 * fallback only on biometryLockout, and a passcode fallback when biometrics are not
 * enrolled but the device IS secured.
 *
 * DEMO: resolves true (the caller shows the clearly-SIMULATED prompt, like the
 * passkey/biometric-unlock demo flows). Plain web: THROWS (no OS biometric).
 * @returns {Promise<boolean>}
 */
export async function verifyBiometric2fa() {
  if (DEMO) return true;
  if (!Capacitor.isNativePlatform()) {
    throw new BiometricGateError('unavailable');
  }
  const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
  // Suppress the native keyStore's background-lock hook while the OS biometric
  // dialog is open — the dialog briefly pauses the app, which normally fires
  // lock() and redirects to the unlock screen mid-flow.
  const { nativeKeyStore } = await import('@/wallet-core/keystore/native.js');
  const info = await BiometricAuth.checkBiometry();
  if (!info.isAvailable && !info.deviceIsSecure) {
    throw new BiometricGateError('unavailable');
  }
  const reason = 'Authorise this action in VEYRNOX';
  // Suppress the background-lock hook while the OS dialog is open (the dialog
  // briefly pauses the app, which would otherwise fire lock() mid-flow).
  return nativeKeyStore.suppressLock(async () => {
    if (info.isAvailable) {
      try {
        await BiometricAuth.authenticate({
          reason,
          cancelTitle: 'Cancel',
          androidTitle: 'VEYRNOX',
          androidSubtitle: 'Authorise this action',
          allowDeviceCredential: false,
        });
        return true;
      } catch (err) {
        if (err && err.code === 'biometryLockout') {
          await BiometricAuth.authenticate({ reason, allowDeviceCredential: true });
          return true;
        }
        throw err;
      }
    }
    // Biometrics not enrolled but the device IS secured → deliberate passcode fallback.
    await BiometricAuth.authenticate({ reason, allowDeviceCredential: true });
    return true;
  });
}

/**
 * Thrown when the app-layer biometric gate fails or is cancelled, so unlock()
 * can fail CLOSED and the UI can surface the password-only escape hatch. This is
 * the exact dual of lib/passkey.js's PasskeyGateError. It carries NO secret and
 * NEVER weakens the vault: the escape hatch it enables still requires the
 * correct vault password (the real Argon2id+AES-GCM gate) — it only refuses to
 * let a failed *convenience* factor strand a user from funds they can unlock
 * with their password. Duck-typed flag (like PasskeyGateError) so it survives a
 * structuredClone / cross-bundle boundary.
 */
export class BiometricGateError extends Error {
  constructor(reason = 'cancelled', cause) {
    super(`Biometric gate ${reason}`);
    this.name = 'BiometricGateError';
    this.reason = reason; // 'cancelled' today (demo cancel); room for more later
    this.cause = cause;
    this.isBiometricGateError = true;
  }
}

/** @returns {boolean} true if `err` is a BiometricGateError (gate failed/cancelled). */
export function isBiometricGateError(err) {
  return !!(err && typeof err === 'object' && err.isBiometricGateError);
}

/** Persist the "require biometric unlock" preference. */
export function setBiometricUnlockEnabled(on) {
  try {
    if (on) localStorage.setItem(BIOMETRIC_PREF_KEY, '1');
    else localStorage.removeItem(BIOMETRIC_PREF_KEY);
  } catch {
    /* storage unavailable — preference is best-effort, non-fatal. */
  }
}

// Map the plugin's BiometryType enum to a human label for the settings screen
// and the prompt. Defensive default so an unknown/future enum value still
// renders something sensible.
function labelForBiometry(BiometryType, info) {
  switch (info.biometryType) {
    case BiometryType.faceId: return 'Face ID';
    case BiometryType.touchId: return 'Touch ID';
    case BiometryType.faceAuthentication: return 'Face Unlock';
    case BiometryType.fingerprintAuthentication: return 'Fingerprint';
    case BiometryType.irisAuthentication: return 'Iris';
    default: return info.isAvailable ? 'Biometrics' : 'Device passcode';
  }
}

/**
 * @typedef {object} BiometricStatus
 * @property {'demo'|'native'|'web'} mode    Which environment resolved this.
 * @property {boolean} available             Can a prompt actually be shown?
 * @property {string}  label                 e.g. "Face ID", "Touch ID".
 * @property {boolean} simulated             True when the prompt is a demo stub.
 * @property {string}  detail                One-line honest status for the UI.
 */

/**
 * Resolve biometric availability for the current environment.
 *
 * DEMO is checked FIRST and on purpose: on the simulator a real-device build is
 * native, but we still want the clearly-stubbed simulated prompt rather than a
 * real OS call (which may have nothing enrolled). On a real device build (not
 * demo) we ask the M2b plugin. Plain web has no platform biometric.
 *
 * @returns {Promise<BiometricStatus>}
 */
export async function getBiometricStatus() {
  if (DEMO) {
    return {
      mode: 'demo',
      available: true,
      label: 'Face ID',
      simulated: true,
      detail: 'Demo mode — the prompt below is a simulation, not real OS security.',
    };
  }

  if (Capacitor.isNativePlatform()) {
    try {
      // Dynamic import keeps the Capacitor plugin out of the web/test bundle,
      // exactly like keystore/index.js does for native.js.
      const { BiometricAuth, BiometryType } = await import('@aparajita/capacitor-biometric-auth');
      const info = await BiometricAuth.checkBiometry();
      const label = labelForBiometry(BiometryType, info);
      if (info.isAvailable) {
        return { mode: 'native', available: true, label, simulated: false,
          detail: `${label} is set up on this device.` };
      }
      if (info.deviceIsSecure) {
        return { mode: 'native', available: true, label: 'Device passcode', simulated: false,
          detail: 'No biometrics enrolled; unlock falls back to your device passcode.' };
      }
      return { mode: 'native', available: false, label: 'Biometrics', simulated: false,
        detail: 'No passcode or biometrics set on this device.' };
    } catch {
      return { mode: 'native', available: false, label: 'Biometrics', simulated: false,
        detail: 'Biometric hardware could not be queried on this device.' };
    }
  }

  return {
    mode: 'web',
    available: false,
    label: 'Biometrics',
    simulated: false,
    detail: 'Platform biometrics are only available in the mobile app. Enable demo mode to preview the flow.',
  };
}

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

/** @returns {boolean} whether the user has required biometric unlock. */
export function isBiometricUnlockEnabled() {
  try {
    return localStorage.getItem(BIOMETRIC_PREF_KEY) === '1';
  } catch {
    return false;
  }
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

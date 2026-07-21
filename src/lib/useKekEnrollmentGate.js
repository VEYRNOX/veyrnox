// @ts-nocheck
// lib/useKekEnrollmentGate.js
//
// R2 facade for the mandatory hardware-KEK enrollment gate. src/lib is not a
// forbidden ring layer, so this hook may import from wallet-core/keystore directly.
// UI components (src/components) must NOT import those modules — they call this hook
// instead (ring-boundary: R0/R1 → R2 facade).
//
// Returns:
//   gateActive  — boolean: true when a restored vault needs hardware re-enrollment
//   dismiss()   — clears the gate (call on complete OR skip)
//   enroll(pin) — async: runs the full enrollment flow, returns
//                   { ok: true } on success
//                   { ok: false, msg: string, isInsecureTier: bool, isWrongPin: bool } on error

import { useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { getKeyStore } from '@/wallet-core/keystore';
import { KEK_ERR } from '@/wallet-core/keystore/kek.js';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

const WRONG_PIN_MSG =
  "That PIN didn’t match. Enter the PIN you use to unlock your wallet.";
const NO_HARDWARE_MSG =
  "Couldn’t reach this device’s hardware security. Please try again.";
const INSECURE_TIER_MSG =
  "This device doesn’t meet the hardware security requirement. You can continue without hardware protection.";
const STALE_KEY_MSG =
  "A stale hardware key from a previous install couldn’t be removed. Try again — if it keeps failing, use Skip and re-enable hardware protection from Security settings.";
const ANDROID_11_MSG =
  "Hardware protection requires Android 11 or later. You can continue without it.";
const PLUGIN_UNAVAILABLE_MSG =
  "Hardware protection isn’t available on this version of the app. You can continue without hardware protection.";
const BIOMETRIC_LOCKOUT_MSG =
  "Your device's biometric sensor is temporarily locked from too many attempts. Wait a moment, then try again — or skip for now and enable hardware protection later in Security settings.";
const GENERIC_MSG = 'Something went wrong. Please try again.';

function isWrongPinVaultError(e) {
  const msg = e?.message || '';
  return msg.startsWith('Decryption failed') || msg.startsWith('No wallet');
}

function classifyEnrollError(e) {
  const code = e?.code;
  const emsg = e?.message || '';
  if (code === 'KEK_ENROLL_INSECURE_TIER') {
    return { msg: INSECURE_TIER_MSG, isInsecureTier: true, isWrongPin: false };
  }
  if (
    code === KEK_ERR.UNWRAP_FAILED ||
    code === KEK_ERR.NO_HARDWARE_FACTOR ||
    code === 'WRONG_PASSWORD' ||
    code === 'KEK_NO_HARDWARE_FACTOR' ||
    isWrongPinVaultError(e)
  ) {
    const msg = code === KEK_ERR.NO_HARDWARE_FACTOR ? NO_HARDWARE_MSG : WRONG_PIN_MSG;
    return { msg, isInsecureTier: false, isWrongPin: true };
  }
  // Stale hardware key from a previous install — auto-clear failed in the native layer.
  // Codes: KEK_CLEAR_STALE_FAILED (Android), STALE_CLEAR_FAILED (iOS).
  // Legacy message fallback: old builds emit KEK_ALREADY_ENROLLED with no .code.
  if (
    code === 'KEK_CLEAR_STALE_FAILED' ||
    code === 'STALE_CLEAR_FAILED' ||
    emsg.includes('KEK_ALREADY_ENROLLED') ||
    emsg.includes('STALE_CLEAR_FAILED')
  ) {
    return { msg: STALE_KEY_MSG, isInsecureTier: false, isWrongPin: false };
  }
  // Android < API 30 (Android 11): hardware KEK not supported.
  if (code === 'KEK_REQUIRES_ANDROID_11' || emsg.includes('KEK_REQUIRES_ANDROID_11')) {
    return { msg: ANDROID_11_MSG, isInsecureTier: true, isWrongPin: false };
  }
  // Native plugin not registered in this build — Capacitor rejects an unavailable
  // plugin with code 'UNIMPLEMENTED' ('"HardwareKek" plugin is not implemented on
  // ios'). This happens when the local iOS plugin was dropped from packageClassList
  // (see scripts/register-local-ios-plugins.mjs). It is NOT a device fault, so FAIL
  // OPEN like the insecure-tier case: surface a "continue without it" message and let
  // the gate be skipped, rather than a generic dead-end that re-fires every unlock.
  if (code === 'UNIMPLEMENTED' || emsg.includes('not implemented')) {
    return { msg: PLUGIN_UNAVAILABLE_MSG, isInsecureTier: true, isWrongPin: false };
  }
  // Biometric lockout: the user cancelled the OS device-credential recovery dialog
  // that Android shows when biometric is locked out from too many attempts. The
  // origCode marker is set by getHardwareFactorWithLockoutFallback (native.js) so we
  // can distinguish "cancelled while recovering from lockout" from other cancels.
  if (e?.origCode === KEK_ERR.NO_HARDWARE_FACTOR || emsg.includes('biometryLockout')) {
    return { msg: BIOMETRIC_LOCKOUT_MSG, isInsecureTier: false, isWrongPin: false };
  }
  return { msg: GENERIC_MSG, isInsecureTier: false, isWrongPin: false };
}

async function bestEffortClearCredential() {
  try {
    const { clearHardwareCredential } = await import('@/wallet-core/keystore/hardware.js');
    await clearHardwareCredential();
  } catch { /* best-effort */ }
}

export function useKekEnrollmentGate({ isUnlocked }) {
  const [gateActive, setGateActive] = useState(false);
  const checkedRef = useRef(false);

  // Detect "restored vault on hardware-capable device, not yet KEK-enrolled".
  // Runs once when isUnlocked flips true; resets when vault re-locks.
  //   - Web / non-native       → skip.
  //   - Deniability / demo     → skip (I3: no keystore access in these sessions).
  //   - isSecureHardwareAvailable() throws → skip (I4: fail OPEN, never block user).
  //   - No secure hardware     → skip.
  //   - hasVaultKekWrap() throws → treat as NOT enrolled (safer to prompt).
  //   - Already wrapped        → skip.
  useEffect(() => {
    if (!isUnlocked) { checkedRef.current = false; return undefined; }
    if (checkedRef.current) return undefined;
    checkedRef.current = true;
    let live = true;
    (async () => {
      try {
        if (!Capacitor.isNativePlatform()) return;
        if (isDeniabilityOrDemoActive()) return;
        const ks = getKeyStore();
        let secure;
        try { secure = await ks.isSecureHardwareAvailable(); } catch { return; }
        if (!secure) return;
        let wrapped = false;
        if (typeof ks.hasVaultKekWrap === 'function') {
          try { wrapped = await ks.hasVaultKekWrap(); } catch { wrapped = false; }
        }
        if (wrapped) return;
        if (live) setGateActive(true);
      } catch { /* fail open */ }
    })();
    return () => { live = false; };
  }, [isUnlocked]);

  const enroll = useCallback(async (pin) => {
    try {
      const { enrollHardwareCredential, getHardwareFactor } = await import(
        '@/wallet-core/keystore/hardware.js'
      );
      const ks = getKeyStore();
      const enrolledTier = await enrollHardwareCredential({
        isVaultWrapped: () => ks.hasVaultKekWrap(),
      });
      await ks.enrollKek(pin, {
        getHardwareFactor,
        hardwareKekTier: enrolledTier?.securityLevelName ?? null,
      });
      return { ok: true };
    } catch (e) {
      const { msg, isInsecureTier, isWrongPin } = classifyEnrollError(e);
      if (!isInsecureTier) await bestEffortClearCredential();
      return { ok: false, msg, isInsecureTier, isWrongPin };
    }
  }, []);

  const dismiss = useCallback(() => setGateActive(false), []);

  return { gateActive, enroll, dismiss };
}

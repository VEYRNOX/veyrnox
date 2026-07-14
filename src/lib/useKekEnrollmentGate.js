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
const GENERIC_MSG = 'Something went wrong. Please try again.';

function isWrongPinVaultError(e) {
  const msg = e?.message || '';
  return msg.startsWith('Decryption failed') || msg.startsWith('No wallet');
}

function classifyEnrollError(e) {
  const code = e?.code;
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

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
//   suppressInsecureTier() — persist "this device cannot satisfy the KEK bar"
//                            so future unlocks do not re-prompt forever
//   enroll(pin) — async: runs the full enrollment flow, returns
//                   { ok: true } on success
//                   { ok: false, msg: string, isInsecureTier: bool, isWrongPin: bool } on error

import { useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { getKeyStore, withLockSuppressed } from '@/wallet-core/keystore';
import { KEK_ERR } from '@/wallet-core/keystore/kek.js';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

// Persistent "this device cannot pass the hardware-tier gate" verdict. Written
// when enroll() returns isInsecureTier (Chinese OEM Keystore reporting SOFTWARE
// or unmapped, Android<11, no plugin, etc.) so the gate does not re-prompt on
// every unlock forever. Cleared by panic-wipe (see panic.js METADATA_RESIDUE_KEYS)
// and by Security settings "re-enable hardware protection" (clearKekInsecureTier).
//
// I3 — WRITES ARE THE CHOKEPOINT. veyrnox-kek-insecure-tier is SHARED: the
// primary wallet reads back whatever any session wrote. A decoy/duress/stealth
// or demo session must never mutate it — a coerced tap must not suppress the
// real user's enrollment prompt, nor clear a valid suppression and restore the
// every-unlock re-prompt loop this key exists to end.
//
// The guard lives HERE, in the writes, not at the call sites. Both current
// callers happen to be unreachable in those sessions (the detect effect returns
// early; HardwareKekSettings' enroll branch is behind `blocked`), but that is a
// property of two other functions, and clearKekInsecureTier is exported. This is
// the lib/consent.js lesson applied before it bites: there, three writers to a
// shared key each carried their own guard, one shipped without it, and "a rule
// enforced in three places is a rule that will be missed in a fourth."
// Do NOT add matching guards at call sites — that duplication is the bug.
//
// Reads stay ungated: reading leaves no trace.
export const KEK_INSECURE_TIER_KEY = 'veyrnox-kek-insecure-tier';
function isKekInsecureTierPersisted() {
  try { return localStorage.getItem(KEK_INSECURE_TIER_KEY) === '1'; } catch { return false; }
}
function persistKekInsecureTier() {
  if (isDeniabilityOrDemoActive()) return;
  try { localStorage.setItem(KEK_INSECURE_TIER_KEY, '1'); } catch { /* best-effort */ }
}
export function clearKekInsecureTier() {
  if (isDeniabilityOrDemoActive()) return;
  try { localStorage.removeItem(KEK_INSECURE_TIER_KEY); } catch { /* best-effort */ }
}

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
  if (code === KEK_ERR.NO_HARDWARE_FACTOR || code === 'KEK_NO_HARDWARE_FACTOR') {
    return { msg: NO_HARDWARE_MSG, isInsecureTier: false, isWrongPin: false };
  }
  if (code === 'KEK_ENROLL_INSECURE_TIER') {
    return { msg: INSECURE_TIER_MSG, isInsecureTier: true, isWrongPin: false };
  }
  if (
    code === KEK_ERR.UNWRAP_FAILED ||
    code === 'WRONG_PASSWORD' ||
    isWrongPinVaultError(e)
  ) {
    return { msg: WRONG_PIN_MSG, isInsecureTier: false, isWrongPin: true };
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
  //
  // deviceVerdict:false — #2257. `isInsecureTier` carries TWO consequences, and
  // this branch only ever wanted one of them. It makes the gate skippable (what
  // the comment above describes and intends) AND it makes enroll() persist
  // veyrnox-kek-insecure-tier, a PERMANENT per-device verdict that stops the
  // gate ever firing again (useKekEnrollmentGate detect effect). A missing
  // plugin is a property of the BUILD, not the device: ship one build without
  // the plugin and every device that runs it is marked hardware-ineligible
  // forever, including after the next build restores it. Those users then have
  // to discover Settings → Security and retry by hand — and the "Retest device
  // security" affordance there is Android-only (HardwareKekSettings), so on iOS
  // the banner invites a retry the screen cannot offer directly (the enroll
  // button does clear it on success, which is the actual recovery path).
  // So: still skippable, but never cached.
  if (code === 'UNIMPLEMENTED' || emsg.includes('not implemented')) {
    return {
      msg: PLUGIN_UNAVAILABLE_MSG,
      isInsecureTier: true,
      isWrongPin: false,
      deviceVerdict: false,
    };
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
  // Runs once when isUnlocked flips true. The native capability result is also
  // cached for the app process, so an unsupported phone is never re-probed or
  // re-routed into enrollment after each lock/unlock cycle.
  //   - Web / non-native       → skip.
  //   - Deniability / demo     → skip (I3: no keystore access in these sessions).
  //   - isSecureHardwareAvailable() throws → skip (I4: fail OPEN, never block user).
  //   - No secure hardware     → skip.
  //   - hasVaultKekWrap() throws → treat as ALREADY wrapped and skip the gate
  //                                 (M-3, 2026-07-28): defaulting to "not wrapped"
  //                                 activates the gate and routes into
  //                                 enrollHardwareCredential, which used to coerce the
  //                                 same probe failure into the DESTRUCTIVE re-enroll
  //                                 path (clearCredential rotates H and invalidates
  //                                 the existing kekWrap — funds lock-out). An
  //                                 ambiguous probe is not evidence the vault is bare;
  //                                 skip rather than risk destroying a real wrap.
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
        // Persistent verdict: this device already failed the hardware-tier gate
        // (StrongBox/TEE absent or Keystore reports SOFTWARE/unmapped — common on
        // Chinese OEM ROMs without GMS, older Android, or plugin-unavailable
        // builds). Without this the gate re-fires every unlock forever.
        // Re-enable via Security settings (clearKekInsecureTier) or panic-wipe.
        if (isKekInsecureTierPersisted()) return;
        const ks = getKeyStore();
        let secure;
        try { secure = await ks.isSecureHardwareAvailable(); } catch { return; }
        if (!secure) return;

        let wrapped = true;
        if (typeof ks.hasVaultKekWrap === 'function') {
          try { wrapped = await ks.hasVaultKekWrap(); } catch { wrapped = true; }
        }
        if (wrapped) return;
        if (live) setGateActive(true);
      } catch { /* fail open */ }
    })();
    return () => { live = false; };
  }, [isUnlocked]);

  const enroll = useCallback(async (pin) => {
    // Wrap the WHOLE enroll body in withLockSuppressed. enrollHardwareCredential
    // ->  HardwareKekPlugin.enroll: mints an SE key with a biometry-gated ACL; on
    // iOS that resigns-active momentarily, Capacitor dispatches appStateChange,
    // and fireLockHook() otherwise relocks the vault mid-enroll → the KEK gate
    // unmounts and the hasVault effect re-routes to Unlock (looks like a bounce
    // to the Hero brand block). ks.enrollKek already suppressed internally; this
    // covers the sibling native call that used to race it (same class as
    // commits 02711199 / ef7aa705). Web is a transparent no-op.
    return withLockSuppressed(async () => {
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
        const { msg, isInsecureTier, isWrongPin, deviceVerdict } = classifyEnrollError(e);
        if (!isInsecureTier) await bestEffortClearCredential();
        // Persist the ineligible verdict so the next unlock does NOT re-prompt.
        // Deterministic per device — no benefit to asking again.
        //
        // ...but ONLY when the verdict really is about the DEVICE (#2257).
        // classifyEnrollError sets deviceVerdict:false for causes that are
        // properties of the BUILD rather than the hardware — today that is the
        // unregistered-native-plugin case. Caching one of those marks every
        // device running a bad build as permanently ineligible, and the next
        // build that fixes the plugin cannot undo it: the detect effect returns
        // early on the persisted key, so the gate never fires again. Absent
        // (undefined) means device-derived, so every other branch is unchanged.
        if (isInsecureTier && deviceVerdict !== false) persistKekInsecureTier();
        return { ok: false, msg, isInsecureTier, isWrongPin, deviceVerdict };
      }
    });
  }, []);

  const dismiss = useCallback(() => setGateActive(false), []);
  const suppressInsecureTier = useCallback(() => {
    persistKekInsecureTier();
  }, []);

  return { gateActive, enroll, dismiss, suppressInsecureTier };
}

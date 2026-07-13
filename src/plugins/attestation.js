// src/plugins/attestation.js — JS bridge for the native remote-attestation plugins.
//
// RASP Phase 2b (Option B, signed off 2026-07-13). Routes to:
//   • Android — PlayIntegrityPlugin  (Play Integrity API, JWS verdict token)
//   • iOS     — AppAttestPlugin       (App Attest / DeviceCheck)
//   • Web      — no-op (returns { available:false }; no attestation channel)
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ BUILT · UNAUDITED-PROVISIONAL · NOT DEVICE-VERIFIED · NOT AUDITED.         │
// │ Loaded ONLY via attestationProbeSource() (src/rasp/attestation.js), which  │
// │ dynamically imports this behind the I3 deniability guard + a native-       │
// │ platform check, so it never reaches the web bundle's hot path.             │
// └─────────────────────────────────────────────────────────────────────────┘
//
// I3 — this bridge takes NO wallet-set handle. The only argument sent to native is
// a fresh random nonce, identical in shape whichever set is active. The caller
// (attestationProbeSource) guarantees this is never invoked under a decoy/hidden
// session. NEVER call this from an unlock path — pre-sign gate only (Option B §4).
//
// I4 — fail closed. The web stubs and every native failure resolve to
// { available:false }, which the RASP layer maps to INTEGRITY_UNAVAILABLE (→ WARN),
// never a fabricated clean/allow.
//
// HONEST GAPS:
//   • Android Play Integrity JWS is NOT signature-verified on-device (no Google
//     public key bundled). See PlayIntegrityPlugin.kt.
//   • iOS App Attest needs the appattest-environment entitlement + DeviceCheck
//     framework linkage (not yet present). See AppAttestPlugin.m.

import { Capacitor, registerPlugin } from '@capacitor/core';

// The honest fail-closed verdict used by the web stubs and any absent-plugin path.
const noOp = async () => ({ available: false });

// Web implementations are pure no-ops: web has no Play Integrity / App Attest
// channel, so calling them must fail closed rather than pretend to attest.
const PlayIntegrity = registerPlugin('PlayIntegrity', {
  web: () => ({ requestVerdict: noOp }),
});

const AppAttest = registerPlugin('AppAttest', {
  web: () => ({ checkAttestation: noOp }),
});

/**
 * Generate a fresh 32-byte nonce, base64-encoded, for the attestation request.
 * crypto.getRandomValues only — no Math.random (wallet-core RNG rule). The nonce
 * binds this specific attestation request; the native layer folds it into the
 * verdict request (Android) or the App Attest clientDataHash (iOS).
 * @returns {string} base64 of 32 random bytes
 */
function freshNonceB64() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/**
 * Request a remote-attestation verdict for the current device, routing to the
 * correct native plugin by platform. PRE-SIGN GATE ONLY — never on unlock.
 *
 * @returns {Promise<{ available: boolean, attestationFailed?: boolean,
 *   meetsDeviceIntegrity?: boolean, meetsBasicIntegrity?: boolean }>}
 *   Always fail-closed: any error / unsupported platform → { available:false }.
 */
export async function requestAttestationVerdict() {
  const nonce = freshNonceB64();
  const platform = Capacitor.getPlatform();

  try {
    if (platform === 'android') {
      return await PlayIntegrity.requestVerdict({ nonce });
    }
    if (platform === 'ios') {
      return await AppAttest.checkAttestation({ nonce });
    }
    // web / unknown platform: no attestation channel.
    return { available: false };
  } catch {
    // Plugin absent, bridge threw, Play Services / App Attest unavailable →
    // fail closed. The RASP layer maps this to INTEGRITY_UNAVAILABLE (→ WARN).
    return { available: false };
  }
}

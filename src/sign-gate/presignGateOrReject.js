// @ts-nocheck
// Shared fail-closed adapter for signing surfaces that need a fresh RASP verdict.
// The pure decision remains in presignGate(); this module only obtains the
// just-in-time artifact and refuses every missing, errored, thrown, or incomplete
// result. Callers must check `proceedAllowed === true` before touching a key.

import { Capacitor } from '@capacitor/core';
import { getFreshRaspArtifact } from '@/rasp/getFreshRaspArtifact';
import { TIER } from '@/rasp';
import { LEVEL } from '@/risk/levels';
import { presignGate } from './presign.js';

const BLOCKED = Object.freeze({
  proceedAllowed: false,
  rejectCode: 'RASP_BLOCK',
  gate: null,
  artifact: null,
  requiresBiometric: false,
});

function isNativeRuntime() {
  try {
    return Capacitor.isNativePlatform() === true;
  } catch {
    // Platform detection is part of the security decision. If it is unavailable,
    // assume native so a required biometric cannot be skipped.
    return true;
  }
}

/**
 * Obtain and apply the shared fresh-artifact pre-sign decision.
 *
 * `getFreshArtifact` and `isNative` are injectable for deterministic unit tests;
 * production callers use the fail-closed defaults.
 */
export async function presignGateOrReject({
  txLevel = LEVEL.OK,
  acknowledged = false,
  biometricConfirmed = false,
  getFreshArtifact = getFreshRaspArtifact,
  isNative = isNativeRuntime,
} = {}) {
  try {
    const artifact = await getFreshArtifact();
    if (!artifact || artifact.error || typeof artifact.tier !== 'string') {
      return { ...BLOCKED };
    }

    // WARN policy requires biometric confirmation on native. Treat a missing or
    // false field as BLOCK so artifact drift cannot silently remove that step.
    if (artifact.tier === TIER.WARN && artifact.requiresBiometric !== true) {
      return { ...BLOCKED, artifact };
    }

    const requiresBiometric = artifact.requiresBiometric === true && isNative() === true;
    const gate = presignGate(artifact.tier, txLevel, acknowledged);
    if (!gate || gate.error || gate.proceedAllowed !== true) {
      const hardBlock = gate?.signerReachable !== true;
      return {
        proceedAllowed: false,
        rejectCode: hardBlock ? 'RASP_BLOCK' : 'RASP_WARN_ACK_REQUIRED',
        gate: gate ?? null,
        artifact,
        requiresBiometric,
      };
    }
    if (requiresBiometric && biometricConfirmed !== true) {
      return {
        proceedAllowed: false,
        rejectCode: 'RASP_BIOMETRIC_REQUIRED',
        gate,
        artifact,
        requiresBiometric: true,
      };
    }

    return {
      proceedAllowed: true,
      rejectCode: null,
      gate,
      artifact,
      requiresBiometric,
    };
  } catch {
    return { ...BLOCKED };
  }
}

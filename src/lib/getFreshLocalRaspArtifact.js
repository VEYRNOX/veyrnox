// @ts-nocheck
// src/lib/getFreshLocalRaspArtifact.js
//
// L-6 (audit 2026-08-25): fresh-at-confirm RASP probe for LOCAL seed-material
// surfaces (seed reveal, personal-backup export, restore import). These
// surfaces previously gated ONLY on the mount-time useRaspArtifact() sample,
// which can be up to ~60s stale (heartbeat) — an attacker injecting a hook
// AFTER the last sample but BEFORE the user commits to reveal/export/import
// would proceed under a verdict that never saw the hook. This mirrors the
// sign hot-path's fresh-probe pattern (src/rasp/getFreshRaspArtifact.js, used
// by SendCrypto.jsx:1232) but composes the ON-DEVICE leg ONLY — no remote
// Play-Integrity/App-Attest call.
//
// WHY A SEPARATE HELPER, NOT src/rasp/getFreshRaspArtifact.js WITH AN OPTION:
// this module deliberately lives outside src/rasp/ (a boundary owned by a
// concurrent workstream) and imports ONLY that module's already-public,
// stable exports (detect, nativeProbeSource, browserProbeSource,
// selectPresignProbeSource, degrade — all exported from src/rasp/index.js).
// It duplicates the small timeout-race helper rather than editing
// src/rasp/getFreshRaspArtifact.js.
//
// Same owner decision as the mount-time hook (useRaspArtifact({
// excludeAttestation: true }), see useRaspArtifact.js): local seed material
// must not be gated on the REMOTE attestation leg, which is unavailable by
// design on any sideloaded/non-Play-Store build and would otherwise fail
// every fresh probe closed on every non-native/sideloaded device. Genuine
// ON-DEVICE threats (root/jailbreak, tamper, hook) still compose in and
// still fail closed (I4) — this only ever OMITS the remote leg, never
// weakens the on-device one.
//
// I4 fail-closed: timeout, throw, or shape drift anywhere in the chain
// returns degrade(undefined) — the module's own fail-closed spec (BLOCK tier,
// full SENSITIVE blockedActions) — never a fabricated ALLOW.

import { Capacitor } from '@capacitor/core';
import {
  detect,
  nativeProbeSource,
  browserProbeSource,
  selectPresignProbeSource,
  degrade,
} from '@/rasp';

// Matches src/rasp/getFreshRaspArtifact.js's FRESH_PROBE_TIMEOUT_MS — same
// bound (comfortably above measured native probe latency; short enough that
// a stuck bridge does not lock the confirm action).
export const LOCAL_FRESH_PROBE_TIMEOUT_MS = 1500;

const UNAVAILABLE_SOURCE = Object.freeze({ available: false });

// Race a probe promise against a fail-closed timeout. NEVER fabricates a
// clean result: on throw or timeout the source is UNAVAILABLE, which
// detect() maps to INTEGRITY_UNAVAILABLE (→ WARN via degrade, and WARN
// carries the SENSITIVE blockedActions set — see degrade.js).
function withFailClosedTimeout(promise, ms) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve(UNAVAILABLE_SOURCE);
    }, ms);
    Promise.resolve(promise)
      .then((v) => { if (done) return; done = true; clearTimeout(timer); resolve(v); })
      .catch(() => { if (done) return; done = true; clearTimeout(timer); resolve(UNAVAILABLE_SOURCE); });
  });
}

/**
 * Probe the ON-DEVICE RASP condition fresh (no remote attestation leg) and
 * return the degrade() artifact. Callers pass the result to sensitiveGate()
 * at the moment the user commits to a seed-material action.
 *
 * @returns {Promise<{tier:string, sentence:string|null, blockedActions:string[], requiresBiometric:boolean}>}
 */
export async function getFreshLocalRaspArtifact() {
  try {
    const isNative = Capacitor.isNativePlatform();
    const nativeSource = isNative
      ? await withFailClosedTimeout(nativeProbeSource(), LOCAL_FRESH_PROBE_TIMEOUT_MS)
      : null;

    const osCondition = detect(
      selectPresignProbeSource(isNative, nativeSource, browserProbeSource),
    );
    const artifact = degrade(osCondition);
    // I4: shape drift → strongest BLOCK, full shape (so sensitiveGate never
    // crashes on a missing blockedActions — it fails closed instead).
    if (!artifact || typeof artifact.tier === 'undefined') {
      return degrade(undefined);
    }
    return artifact;
  } catch {
    return degrade(undefined);
  }
}

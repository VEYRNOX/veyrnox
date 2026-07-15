// @ts-nocheck
// src/rasp/getFreshRaspArtifact.js
//
// P2-1 (audit 2026-07-15): the fresh-at-sign RASP probe.
//
// Purpose. On the SIGN HOT-PATH, mount-time state can be up to ~60 s stale
// (last heartbeat). An attacker injecting a hook AFTER the last probe but
// BEFORE the user taps Send would sign under a verdict that never saw the hook.
// This async helper mirrors WalletConnect's presignGateOrReject pattern
// (src/lib/WalletConnectProvider.jsx): await the OS probe and the remote-
// attestation probe FRESH, with a bounded fail-closed timeout, then compose
// and degrade. Callers use the returned artifact's tier instead of a closure.
//
// I3 preserved. attestationProbeSource() checks isDeniabilityOrDemoActive()
// FIRST inside its own body — no new egress in decoy/hidden/demo.
//
// I4 fail-closed. On timeout, exception, or shape drift anywhere in the chain,
// the returned artifact has tier === TIER.BLOCK (never a fabricated CLEAN).
//
// The function is deliberately module-level (not a hook, no React state) so
// it can be awaited from mutationFn / WalletConnect handlers / any async
// signing chokepoint without a component context.

import { Capacitor } from '@capacitor/core';
import { degrade } from './degrade.js';
import { detect } from './detect.js';
import { nativeProbeSource } from './nativeProbe.js';
import { browserProbeSource } from './browserProbe.js';
import { selectPresignProbeSource } from './selectPresignProbeSource.js';
import {
  ATTESTATION_ENABLED,
  attestationProbeSource,
  detectAttestation,
  composeConditions,
} from './attestation.js';
import { TIER } from './conditions.js';

// Bounded timeout so an in-flight bridge cannot silently allow. 1500 ms
// matches WC's RASP_ASYNC_PROBE_TIMEOUT_MS — comfortably above measured native
// probe latency and short enough that a stuck bridge does not lock the signer.
export const FRESH_PROBE_TIMEOUT_MS = 1500;

const UNAVAILABLE_SOURCE = Object.freeze({ available: false });

// Race a probe promise against a fail-closed timeout. NEVER fabricates a clean
// result: on throw or timeout the source is UNAVAILABLE, which detect() /
// detectAttestation() both map to INTEGRITY_UNAVAILABLE (→ WARN via degrade).
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

export async function getFreshRaspArtifact() {
  try {
    const isNative = Capacitor.isNativePlatform();
    // Kick off both async legs in parallel. On web, native/attestation are not
    // sampled — the browser leg is the source of truth off-device. On native the
    // OS leg is authoritative (C-01: never fall back to browser CLEAN).
    const [nativeSource, attestationResult] = await Promise.all([
      isNative
        ? withFailClosedTimeout(nativeProbeSource(), FRESH_PROBE_TIMEOUT_MS)
        : Promise.resolve(null),
      isNative && ATTESTATION_ENABLED
        ? withFailClosedTimeout(attestationProbeSource(), FRESH_PROBE_TIMEOUT_MS)
        : Promise.resolve(null),
    ]);

    const osCondition = detect(
      selectPresignProbeSource(isNative, nativeSource, browserProbeSource),
    );
    const attestCondition = detectAttestation(attestationResult);
    const artifact = degrade(composeConditions(osCondition, attestCondition));
    // I4: shape drift → strongest BLOCK (RASP-A2 discipline).
    if (!artifact || typeof artifact.tier === 'undefined') {
      return { tier: TIER.BLOCK, sentence: null };
    }
    return artifact;
  } catch {
    // Total failure in the detection chain → strongest BLOCK.
    return { tier: TIER.BLOCK, sentence: null };
  }
}

// @ts-nocheck
// src/rasp/useRaspArtifact.js
//
// React hook: sample the RASP environment and return the current degrade() artifact.
// Encapsulates the probe-sampling pattern so every surface that gates on the RASP
// verdict shares one implementation (chokepoint) — no copy-pasted async effect,
// no divergent inline sampling. Current live consumers (2026-07-15):
//   • src/pages/SendCrypto.jsx           — pre-sign environment gate (P2-7)
//   • src/pages/RaspSecurity.jsx         — environment dashboard (P2-8)
//   • src/pages/SecurityDashboard.jsx    — top-level security surface
//   • src/pages/CryptoSigning.jsx        — sign-flow re-confirm
//   • src/pages/ColdSign.jsx             — cold-sign surface
//   • src/pages/HDWalletManager.jsx      — key/seed management gate
//   • src/pages/PersonalBackup.jsx       — backup/export gate
//   • src/pages/WalletPortfolioPage.jsx  — portfolio surface
//   • src/components/WalletEntry.jsx     — first-mount readout
//   • src/components/security/useRevealWithReauth.jsx — reveal re-auth
//   • src/lib/WalletConnectProvider.jsx  — WC pre-sign environment gate
//
// On native: asynchronously calls the native integrity plugin once per mount AND on
// every app-foreground event (G4-A). A 60 s periodic heartbeat (G4-B) additionally
// re-probes without requiring a background/foreground cycle — closing the window where
// Frida is injected mid-session and remains invisible until the next remount.
// Until the probe resolves, selectPresignProbeSource returns UNAVAILABLE_PROBE_SOURCE
// (INTEGRITY_UNAVAILABLE → WARN) rather than the browser CLEAN — fail-closed (I4).
//
// On web: only the browser probe is sampled (re-evaluated on every render via its
// live getters). Foreground listener and heartbeat are native-only.
//
// I3: no wallet-set handle, no egress, no key access. Output is identical across
// real and decoy sessions (degrade() is set-blind by construction).

import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { degrade } from './degrade.js';
import { detect } from './detect.js';
import { nativeProbeSource } from './nativeProbe.js';
import { browserProbeSource } from './browserProbe.js';
import { selectPresignProbeSource } from './selectPresignProbeSource.js';
import { ATTESTATION_ENABLED, attestationProbeSource, detectAttestation, composeConditions } from './attestation.js';
import { CONDITION } from './conditions.js';

// DEV override: VITE_BYPASS_RASP=1 skips all integrity checks for on-device testing.
// Dead-code-eliminated in production builds (env var never set in CI/release).
const BYPASS_RASP = import.meta.env.VITE_BYPASS_RASP === '1';

// #1107: runtime guard -- if BYPASS_RASP leaks into a production build, emit an
// auditable console.error on module load. Does NOT disable sending (that would be
// a UX change beyond the issue scope); the error provides a signal for monitoring.
if (BYPASS_RASP && import.meta.env.PROD) {
  console.error('[RASP] BYPASS_RASP is enabled in a production build -- this is a configuration error');
}

const HEARTBEAT_MS = 60_000;

// Options:
//   deferAttestation (default false): when true, the attestation useEffect body
//     early-returns — the network call is NOT fired on mount / foreground /
//     heartbeat. Callers pass true until the user reaches an explicit sign
//     intent (e.g. step === "verify"), matching the documented "attestation only
//     on explicit pre-sign egress" boundary (P2-4 audit 2026-07-15). When the
//     flag flips false the effect re-runs (probeKey deps carry through) and the
//     probe fires. Default behaviour is unchanged for existing consumers.
//   excludeAttestation (default false): when true, the returned artifact is
//     derived from the ON-DEVICE probe leg ONLY — the remote Play Integrity /
//     App Attest condition is NOT composed in, and its network effect does not
//     fire (no egress). Local seed-material surfaces (backup / export / import /
//     reveal) pass this: a self-custody backup must not be gated on a REMOTE
//     attestation that is unavailable by design on any sideloaded / non-Play-Store
//     build (Google returns HTTP 404 for unregistered apps → INTEGRITY_UNAVAILABLE
//     → backup blocked). Owner decision 2026-07-16: genuine ON-DEVICE threats
//     (root/jailbreak, tamper, hook) STILL block via the OS leg; the remote leg
//     stays fully in force for SIGNING/sending (SendCrypto/WC do NOT pass this).
export function useRaspArtifact({ deferAttestation = false, excludeAttestation = false } = {}) {
  // P2-9 (audit 2026-07-15): rules-of-hooks — every hook call MUST run
  // unconditionally on every render, regardless of BYPASS_RASP. The bypass
  // early-return that used to sit ABOVE useState/useEffect was runtime-stable
  // only because BYPASS_RASP is a module-load constant; a future author
  // reactifying the flag would turn that into a real hook-order bug. Hooks
  // now come first; the bypass short-circuits the returned ARTIFACT below
  // (probe effects still fire but no-op on web / return-value substituted).
  const [nativeProbe, setNativeProbe] = useState(null);
  const [attestationResult, setAttestationResult] = useState(null);
  // probeKey increments to re-trigger the OS-probe effect on foreground/heartbeat.
  const [probeKey, setProbeKey] = useState(0);

  // G4-A: re-probe on foreground. Resets nativeProbe to null immediately so the
  // gate stays WARN (not stale CLEAN) during the async re-sample window (I4).
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const handle = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        setNativeProbe(null);
        setAttestationResult(null);
        setProbeKey(k => k + 1);
      }
    });
    return () => { handle.then(h => h.remove()); };
  }, []);

  // G4-B: periodic heartbeat — catches mid-session injection without a bg/fg cycle.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const id = setInterval(() => {
      setNativeProbe(null);
      setAttestationResult(null);
      setProbeKey(k => k + 1);
    }, HEARTBEAT_MS);
    return () => { clearInterval(id); };
  }, []);

  // OS on-device probe leg (Phase 2a — NO egress). Re-runs whenever probeKey
  // changes (foreground event or heartbeat tick). Separate effect from the
  // attestation leg below by design (one leg per effect).
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let cancelled = false;
    (async () => {
      try {
        const source = await nativeProbeSource();
        if (!cancelled) setNativeProbe(source);
      } catch {
        // I4 FAIL CLOSED: native-bridge throw → unavailable, not clean.
        if (!cancelled) setNativeProbe({ available: false });
      }
    })();
    return () => { cancelled = true; };
  }, [probeKey]);

  // Remote-attestation leg (Phase 2b — the egress leg, pre-sign only, deniability-
  // gated inside attestationProbeSource). Play Integrity JWS RS256/ES256 IS
  // on-device signature-verified (PR #943 landed RS256; PR #955 added ES256
  // raw→DER transcoding; PR #1009 added nonce binding). The tracked residual is
  // G2-ROOTCERT-PIN (weak issuer heuristic in the cert-chain walk); iOS App
  // Attest entitlement + DeviceCheck linkage remain honest gaps.
  useEffect(() => {
    if (!ATTESTATION_ENABLED) return;
    if (!Capacitor.isNativePlatform()) return;
    // P2-4 (audit 2026-07-15): caller opt-out. When deferred, no network call
    // fires — the attestation-plane condition stays INTEGRITY_UNAVAILABLE (WARN)
    // by construction (detectAttestation(null) fail-closes). The effect re-runs
    // when deferAttestation flips false → true→false, sampling then.
    if (deferAttestation) return;
    // Local seed-material surfaces opt out of the remote leg entirely — no egress,
    // and the composed condition below ignores attestation (owner decision 2026-07-16).
    if (excludeAttestation) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await attestationProbeSource();
        if (!cancelled) setAttestationResult(r);
      } catch {
        // I4 FAIL CLOSED: bridge throw → unavailable, never fabricated clean.
        if (!cancelled) setAttestationResult({ available: false });
      }
    })();
    return () => { cancelled = true; };
  }, [probeKey, deferAttestation, excludeAttestation]);

  // Dev bypass: substitute the returned ARTIFACT with ALLOW, AFTER every hook
  // above has been invoked (P2-9). Shape matches the success/catch branches —
  // `condition` is included so tsc unions the three returns without an
  // inconsistent-shape error (P2-8, 2026-07-15).
  if (BYPASS_RASP) return { ...degrade(CONDITION.CLEAN), condition: CONDITION.CLEAN };

  try {
    const _osCondition = detect(selectPresignProbeSource(Capacitor.isNativePlatform(), nativeProbe, browserProbeSource));
    // excludeAttestation: seed-material surfaces gate on the ON-DEVICE leg only.
    // Genuine on-device threats (root/tamper/hook) still surface here; the remote
    // Play-Integrity condition (unavailable on any sideloaded build) is NOT composed.
    const composed = excludeAttestation
      ? _osCondition
      : composeConditions(_osCondition, detectAttestation(attestationResult));
    // P2-8 (2026-07-15): expose the composed CONDITION so environment-read
    // surfaces (e.g. RaspSecurity.jsx dashboard) can render a specific
    // condition label without re-sampling the probes themselves. Existing
    // consumers that only read {tier, sentence, blockedActions, requiresBiometric}
    // are unaffected (superset shape).
    return { ...degrade(composed), condition: composed };
  } catch {
    // fail-closed (BLOCK) if detection throws; keep the artifact shape stable.
    return { ...degrade(undefined), condition: undefined };
  }
}

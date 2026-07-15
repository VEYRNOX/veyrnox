// @ts-nocheck
// src/rasp/useRaspArtifact.js
//
// React hook: sample the RASP environment and return the current degrade() artifact.
// Encapsulates the probe-sampling pattern from SendCrypto.jsx so callsites outside
// the send flow (seed-reveal, export, import) can gate on the same RASP verdict
// without copy-pasting the async effect.
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

const HEARTBEAT_MS = 60_000;

// Options:
//   deferAttestation (default false): when true, the attestation useEffect body
//     early-returns — the network call is NOT fired on mount / foreground /
//     heartbeat. Callers pass true until the user reaches an explicit sign
//     intent (e.g. step === "verify"), matching the documented "attestation only
//     on explicit pre-sign egress" boundary (P2-4 audit 2026-07-15). When the
//     flag flips false the effect re-runs (probeKey deps carry through) and the
//     probe fires. Default behaviour is unchanged for existing consumers.
export function useRaspArtifact({ deferAttestation = false } = {}) {
  // Dev bypass: skip all probe effects and return ALLOW immediately.
  if (BYPASS_RASP) return degrade(CONDITION.CLEAN);

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
  // gated inside attestationProbeSource). BUILT · NOT device-verified (Play Integrity
  // JWS RS256 not verified on-device; iOS appattest entitlement not yet present).
  useEffect(() => {
    if (!ATTESTATION_ENABLED) return;
    if (!Capacitor.isNativePlatform()) return;
    // P2-4 (audit 2026-07-15): caller opt-out. When deferred, no network call
    // fires — the attestation-plane condition stays INTEGRITY_UNAVAILABLE (WARN)
    // by construction (detectAttestation(null) fail-closes). The effect re-runs
    // when deferAttestation flips false → true→false, sampling then.
    if (deferAttestation) return;
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
  }, [probeKey, deferAttestation]);

  try {
    const _osCondition = detect(selectPresignProbeSource(Capacitor.isNativePlatform(), nativeProbe, browserProbeSource));
    const _attestCondition = detectAttestation(attestationResult);
    const composed = composeConditions(_osCondition, _attestCondition);
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

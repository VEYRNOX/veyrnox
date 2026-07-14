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

const HEARTBEAT_MS = 60_000;

export function useRaspArtifact() {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probeKey]);

  // Remote-attestation leg (Phase 2b — the egress leg, pre-sign only, deniability-
  // gated inside attestationProbeSource). BUILT · NOT device-verified (Play Integrity
  // JWS RS256 not verified on-device; iOS appattest entitlement not yet present).
  useEffect(() => {
    if (!ATTESTATION_ENABLED) return;
    if (!Capacitor.isNativePlatform()) return;
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
  }, []);

  try {
    const _osCondition = detect(selectPresignProbeSource(Capacitor.isNativePlatform(), nativeProbe, browserProbeSource));
    const _attestCondition = detectAttestation(attestationResult);
    return degrade(composeConditions(_osCondition, _attestCondition));
  } catch {
    return degrade(undefined); // fail-closed (BLOCK) if detection throws
  }
}

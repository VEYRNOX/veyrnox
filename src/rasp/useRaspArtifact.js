// @ts-nocheck
// src/rasp/useRaspArtifact.js
//
// React hook: sample the RASP environment and return the current degrade() artifact.
// Encapsulates the probe-sampling pattern from SendCrypto.jsx so callsites outside
// the send flow (seed-reveal, export, import) can gate on the same RASP verdict
// without copy-pasting the async effect.
//
// On native: asynchronously calls the native integrity plugin once per mount; until
// it resolves, selectPresignProbeSource returns UNAVAILABLE_PROBE_SOURCE
// (INTEGRITY_UNAVAILABLE → WARN) rather than the browser CLEAN — fail-closed (I4).
//
// On web: only the browser probe is sampled (re-evaluated on every render via its
// live getters).
//
// I3: no wallet-set handle, no egress, no key access. Output is identical across
// real and decoy sessions (degrade() is set-blind by construction).

import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { degrade } from './degrade.js';
import { detect } from './detect.js';
import { nativeProbeSource } from './nativeProbe.js';
import { browserProbeSource } from './browserProbe.js';
import { selectPresignProbeSource } from './selectPresignProbeSource.js';

export function useRaspArtifact() {
  const [nativeProbe, setNativeProbe] = useState(null);

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
  }, []);

  try {
    return degrade(detect(selectPresignProbeSource(Capacitor.isNativePlatform(), nativeProbe, browserProbeSource)));
  } catch {
    return degrade(undefined); // fail-closed (BLOCK) if detection throws
  }
}

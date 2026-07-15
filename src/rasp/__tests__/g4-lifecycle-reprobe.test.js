// src/rasp/__tests__/g4-lifecycle-reprobe.test.js
//
// G4 lifecycle coverage — structural pins ensuring:
//   (A) useRaspArtifact re-probes the native OS on app foreground (appStateChange
//       isActive:true) so a Frida attach during backgrounding is caught before
//       the next send.
//   (B) useRaspArtifact runs a periodic heartbeat re-probe so mid-session injection
//       is caught even without a background/foreground cycle.
//   (C) SendCrypto.jsx re-probes on foreground via the same appStateChange pattern.
//
// These are STRUCTURAL PINS against the source text. They confirm the wiring is
// present and cannot be silently removed by a refactor. The actual behaviour is
// exercised by the existing useRaspArtifact unit tests plus the new
// appStateChange listener integration.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../..');

const artifact = readFileSync(join(root, 'src/rasp/useRaspArtifact.js'), 'utf8');
const send     = readFileSync(join(root, 'src/pages/SendCrypto.jsx'),     'utf8');

// ── A. useRaspArtifact — foreground re-probe ─────────────────────────────────

describe('useRaspArtifact — G4 foreground re-probe', () => {
  it('imports App from @capacitor/app', () => {
    expect(artifact).toMatch(/@capacitor\/app/);
  });

  it('listens to appStateChange', () => {
    expect(artifact).toMatch(/appStateChange/);
  });

  it('re-triggers the native probe when isActive is true', () => {
    // The listener must check isActive before resetting — so both tokens appear near each other.
    const idx = artifact.indexOf('appStateChange');
    expect(idx).toBeGreaterThan(-1);
    const region = artifact.slice(idx, idx + 300);
    expect(region).toMatch(/isActive/);
  });

  it('resets nativeProbe to null on foreground so the async window is WARN not stale CLEAN', () => {
    // The only way to force a re-probe is to reset the cached source.
    // The implementation must call setNativeProbe(null) (or equivalent) inside the
    // isActive branch so selectPresignProbeSource returns UNAVAILABLE during re-sample.
    expect(artifact).toMatch(/setNativeProbe\s*\(\s*null\s*\)/);
  });

  it('removes the appStateChange listener on unmount', () => {
    // App.addListener returns a handle; the cleanup must call handle.remove().
    expect(artifact).toMatch(/\.remove\s*\(\s*\)/);
  });
});

// ── B. useRaspArtifact — periodic heartbeat ───────────────────────────────────

describe('useRaspArtifact — G4 periodic heartbeat', () => {
  it('sets up a periodic re-probe interval on native', () => {
    expect(artifact).toMatch(/setInterval/);
  });

  it('clears the interval on unmount', () => {
    expect(artifact).toMatch(/clearInterval/);
  });

  it('uses a probe-key or equivalent mechanism to retrigger the async effect', () => {
    // A bare setInterval that calls an async fn inside a closure would work,
    // but a probeKey counter (whose increment triggers a useEffect dependency)
    // is the idiomatic pattern. Either way, a counter or reset of nativeProbe
    // must appear near the setInterval.
    const idx = artifact.indexOf('setInterval');
    expect(idx).toBeGreaterThan(-1);
    const region = artifact.slice(idx, idx + 200);
    // Either setNativeProbe(null) or a counter increment happens in the timer body.
    const hasReset = /setNativeProbe\s*\(\s*null\s*\)/.test(region)
      || /setProbeKey|setRefresh|setTick|setProbeTick|counter/.test(region);
    expect(hasReset, 'interval body must reset probe state to trigger a re-sample').toBe(true);
  });
});

// ── C. SendCrypto.jsx — foreground re-probe ───────────────────────────────────

describe('SendCrypto — G4 foreground re-probe (via useRaspArtifact)', () => {
  // P2-7 (audit 2026-07-15): SendCrypto no longer duplicates the appStateChange /
  // heartbeat / probe effects inline — that logic lives in useRaspArtifact.js
  // (pinned above in this file). The Send screen now delegates by calling the
  // hook, so foreground/heartbeat re-probes still happen — through shared code.
  it('delegates the re-probe lifecycle to useRaspArtifact()', () => {
    expect(send).toMatch(/useRaspArtifact\s*\(/);
  });

  it('no longer contains an inline appStateChange listener (dedupe)', () => {
    expect(send).not.toMatch(/appStateChange/);
  });

  it('no longer manages nativeProbe state directly (delegated to the hook)', () => {
    expect(send).not.toMatch(/setNativeProbe\s*\(/);
  });
});

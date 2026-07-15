// F-09 — wire the NATIVE RASP probe into the Send page so OS-level root/jailbreak
// detection actually fires on device (not just the browser-level WebDriver probe).
//
// C-01 (internal-audit-2026-07-11, CRITICAL) UPDATE: the original F-09 wiring used
// resolveProbeSource(nativeProbe, browserProbeSource), which falls back to the BROWSER
// leg when the native leg did not run. On a native WebView the browser leg is CLEAN
// (available:true, rooted:false) — so that fallback was fail-OPEN: a rooted device signed
// with no friction. The pre-sign gate now uses selectPresignProbeSource(isNative, …),
// which on native consumes the OS leg ONLY and fails CLOSED to WARN when it did not run.
//
// Two layers are pinned here:
//  (1) selectPresignProbeSource — the pure, platform-aware chooser (fail-closed on
//      native). Its full behaviour matrix lives in
//      src/rasp/__tests__/selectPresignProbeSource.test.js.
//  (2) SendCrypto.jsx wiring — nativeProbeSource() is sampled once at mount behind a
//      Capacitor.isNativePlatform() gate inside a try/catch, cached in state (RASP-A1:
//      the OS verdict does not change during a session), and the chosen source is passed
//      to detect() on every render.
//
// resolveProbeSource (the legacy chooser) still exists and is unit-tested below, but is
// no longer wired into the pre-sign gate — it is superseded by selectPresignProbeSource.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { detect, degrade, TIER, resolveProbeSource } from '@/rasp';

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, '../SendCrypto.jsx'), 'utf8');

// Legacy helper — retained and tested, but superseded by selectPresignProbeSource for the
// pre-sign gate (its browser fallback is fail-open on native; see C-01).
describe('resolveProbeSource — legacy native/browser chooser (superseded for the gate)', () => {
  it('a rooted native probe drives the RASP tier to WARN', () => {
    // P2-6a (audit batch, 2026-07-15): detect() now requires all four boolean fields.
    const nativeSource = {
      available: true,
      signals: { rooted: true, hooked: false, emulator: false, tampered: false },
    };
    const browserSource = {
      available: true,
      signals: { rooted: false, hooked: false, emulator: false, tampered: false },
    };
    const chosen = resolveProbeSource(nativeSource, browserSource);
    expect(chosen).toBe(nativeSource);
    expect(degrade(detect(chosen)).tier).toBe(TIER.WARN);
  });

  it('an unavailable native probe falls back to the browser source (never fabricated clean)', () => {
    const nativeSource = { available: false };
    // The browser leg still catches a hooked/automation runtime → BLOCK. Full-shape.
    const browserSource = {
      available: true,
      signals: { rooted: false, hooked: true, emulator: false, tampered: false },
    };
    const chosen = resolveProbeSource(nativeSource, browserSource);
    expect(chosen).toBe(browserSource);
    expect(degrade(detect(chosen)).tier).toBe(TIER.BLOCK);
  });

  it('a null native probe (nativeProbeSource threw in the effect) falls back — fail-closed, NOT ALLOW', () => {
    const browserSource = { available: false }; // browser cannot evaluate either
    const chosen = resolveProbeSource(null, browserSource);
    expect(chosen).toBe(browserSource);
    // INTEGRITY_UNAVAILABLE → WARN, never ALLOW: absence of a clean signal is not clean.
    expect(degrade(detect(chosen)).tier).not.toBe(TIER.ALLOW);
    expect(degrade(detect(chosen)).tier).toBe(TIER.WARN);
  });
});

describe('SendCrypto.jsx — the native RASP probe is wired fail-closed (F-09 + C-01)', () => {
  // P2-7 (audit 2026-07-15): SendCrypto no longer duplicates the native probe
  // wiring inline. It now delegates render-time RASP to useRaspArtifact() (which
  // owns the mount/foreground/heartbeat sampling + selectPresignProbeSource +
  // fail-closed try/catch) and, on the sign hot-path, awaits getFreshRaspArtifact()
  // (which composes fresh OS + attestation with the 1500 ms fail-closed timeout).
  // Both delegates pin the same "native leg only on native, never falls back to
  // browser CLEAN" invariant (C-01). The old inline pins have been replaced
  // with the delegation pins below; the invariant they guarded is now guarded
  // by useRaspArtifact and getFreshRaspArtifact's own tests.
  it('routes render-time RASP through useRaspArtifact (hook owns fail-closed native wiring)', () => {
    expect(src).toMatch(/useRaspArtifact\s*\(/);
  });

  it('awaits getFreshRaspArtifact on the sign hot-path (P2-1 fresh-at-sign)', () => {
    expect(src).toMatch(/await\s+getFreshRaspArtifact\s*\(\s*\)/);
  });

  it('does NOT reintroduce inline nativeProbeSource() sampling (dedupe)', () => {
    // The inline duplicate was the RASP-A1 / C-01 chokepoint pre-refactor. If
    // it comes back, the hook and inline diverge again — reject.
    expect(src).not.toMatch(/await\s+nativeProbeSource\s*\(\s*\)/);
  });

  it('does NOT call the fail-open legacy resolveProbeSource for detect()', () => {
    expect(src).not.toMatch(/detect\(\s*resolveProbeSource\(/);
  });
});

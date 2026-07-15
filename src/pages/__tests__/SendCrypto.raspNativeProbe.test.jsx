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
  it('imports nativeProbeSource and selectPresignProbeSource from @/rasp', () => {
    expect(src).toMatch(/nativeProbeSource/);
    expect(src).toMatch(/selectPresignProbeSource/);
  });

  it('samples nativeProbeSource() inside a Capacitor.isNativePlatform()-gated useEffect', () => {
    // The native OS probe must not run on web, and must be sampled (not called on
    // every render). Pin the mount-effect wiring by source.
    expect(src).toMatch(/Capacitor\.isNativePlatform\(\)/);
    expect(src).toMatch(/nativeProbeSource\(\)/);
  });

  it('wraps the native probe sampling in a try/catch (I4: a throw falls back to browser)', () => {
    // The effect body must catch — a native-bridge throw must degrade to the browser
    // source, never leave a stale clean signal. We assert the effect keeps the state
    // null/browser on failure by pinning a catch near the nativeProbeSource call.
    const callIdx = src.indexOf('await nativeProbeSource()');
    expect(callIdx).toBeGreaterThan(-1);
    const effectRegion = src.slice(Math.max(0, callIdx - 400), callIdx + 400);
    expect(effectRegion).toMatch(/catch/);
  });

  it('passes the platform-aware chosen source into detect(), not raw browserProbeSource and not the fail-open resolveProbeSource', () => {
    // The live detect() call must consume selectPresignProbeSource(isNative, native, browser)
    // — which fails closed on native — NOT resolveProbeSource (fail-open browser fallback).
    expect(src).toMatch(/detect\(\s*selectPresignProbeSource\(\s*Capacitor\.isNativePlatform\(\)/);
    expect(src).not.toMatch(/detect\(\s*resolveProbeSource\(/);
  });
});

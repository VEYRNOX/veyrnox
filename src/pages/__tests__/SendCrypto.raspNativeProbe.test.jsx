// F-09 — wire the NATIVE RASP probe into the Send page so OS-level root/jailbreak
// detection actually fires on device (not just the browser-level WebDriver probe).
//
// Two layers are pinned here, matching the codebase pattern (a pure helper carries
// the combining logic + a source-pin proves SendCrypto.jsx wires it fail-closed —
// a full render of SendCrypto requires the entire send stack, so it is pinned by
// source per SendCrypto.confirmation.test.js / SendCrypto.deniability.test.jsx):
//
//  (1) resolveProbeSource(nativeSource, browserSource) — the pure chooser. Uses the
//      native ProbeSource ONLY when it genuinely ran (available === true), else it
//      falls back to the browser source. It NEVER fabricates a clean source (I4).
//
//  (2) SendCrypto.jsx wiring — nativeProbeSource() is sampled once at mount behind a
//      Capacitor.isNativePlatform() gate inside a try/catch (fail-closed to browser),
//      cached in state (RASP-A1: the OS verdict does not change during a session),
//      and the chosen source is passed to detect() on every render.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { detect, degrade, TIER, resolveProbeSource } from '@/rasp';

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, '../SendCrypto.jsx'), 'utf8');

describe('resolveProbeSource — the pure native/browser chooser (I4 fail-closed)', () => {
  it('a rooted native probe drives the RASP tier to WARN', () => {
    const nativeSource = { available: true, signals: { rooted: true } };
    const browserSource = { available: true, signals: {} }; // browser sees nothing
    const chosen = resolveProbeSource(nativeSource, browserSource);
    expect(chosen).toBe(nativeSource);
    expect(degrade(detect(chosen)).tier).toBe(TIER.WARN);
  });

  it('an unavailable native probe falls back to the browser source (never fabricated clean)', () => {
    const nativeSource = { available: false };
    // The browser leg still catches a hooked/automation runtime → BLOCK.
    const browserSource = { available: true, signals: { hooked: true } };
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

describe('SendCrypto.jsx — the native RASP probe is wired fail-closed (F-09)', () => {
  it('imports nativeProbeSource and resolveProbeSource from @/rasp', () => {
    expect(src).toMatch(/nativeProbeSource/);
    expect(src).toMatch(/resolveProbeSource/);
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

  it('passes the resolved (native-or-browser) source into detect(), not raw browserProbeSource', () => {
    // The live detect() call must consume the chosen source. Pin that resolveProbeSource
    // feeds detect().
    expect(src).toMatch(/detect\(\s*resolveProbeSource\(/);
  });
});

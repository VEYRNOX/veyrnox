// F-09 — wire the NATIVE RASP probe into the Send page so OS-level root/jailbreak
// detection actually fires on device (not just the browser-level WebDriver probe).
//
// C-01 (internal-audit-2026-07-11, CRITICAL) UPDATE: the original F-09 wiring used
// resolveProbeSource(nativeProbe, browserProbeSource), which fell back to the BROWSER
// leg when the native leg did not run. On a native WebView the browser leg is CLEAN
// (available:true, rooted:false) — so that fallback was fail-OPEN: a rooted device signed
// with no friction. The pre-sign gate now uses selectPresignProbeSource(isNative, …),
// which on native consumes the OS leg ONLY and fails CLOSED to WARN when it did not run.
//
// Full selectPresignProbeSource behaviour matrix lives in
// src/rasp/__tests__/selectPresignProbeSource.test.js. This file pins the
// SendCrypto.jsx delegation wiring — no inline nativeProbeSource() sampling, no
// legacy resolveProbeSource call, always through useRaspArtifact +
// getFreshRaspArtifact.
//
// P3-1 (audit 2026-07-15): resolveProbeSource.js was deleted — the fail-open legacy
// chooser had no live consumers after C-01 (PR #825) and remained as attractive dead
// code. The three legacy behaviour tests it carried here were removed with it.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, '../SendCrypto.jsx'), 'utf8');

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

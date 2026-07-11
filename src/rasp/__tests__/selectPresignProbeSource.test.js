// C-01 (internal-audit-2026-07-11, CRITICAL) — the Send pre-sign gate read
// detect(resolveProbeSource(nativeProbe, browserProbeSource)). resolveProbeSource falls
// back to the BROWSER leg when the native leg did not run. On a native WebView the browser
// leg reports available:true with hard-coded rooted/emulator/tampered=false
// (browserProbe.js), so a rooted device whose native probe is absent/threw/not-yet-resolved
// (iOS entirely, or the async window on Android) resolved to CLEAN → TIER.ALLOW: a silent
// fail-OPEN. selectPresignProbeSource() fixes this by, on native, consuming the OS leg ONLY
// and never falling back to the browser CLEAN — failing CLOSED (UNAVAILABLE →
// INTEGRITY_UNAVAILABLE → WARN, never ALLOW) when the native leg did not genuinely run.
import { describe, it, expect } from 'vitest';
import { selectPresignProbeSource } from '@/rasp/selectPresignProbeSource.js';
import { degrade } from '@/rasp/degrade.js';
import { detect, UNAVAILABLE_PROBE_SOURCE } from '@/rasp/detect.js';
import { TIER } from '@/rasp/conditions.js';

// The tier a chosen ProbeSource resolves to through the REAL gate pipeline (detect→degrade).
const tierOf = (src) => degrade(detect(src)).tier;

// What the browser leg looks like on a native WebView: available, but blind to root — CLEAN.
const CLEAN_BROWSER_ON_NATIVE = {
  available: true,
  signals: { hooked: false, rooted: false, emulator: false, tampered: false },
};

describe('selectPresignProbeSource — C-01 platform-aware, fail-closed', () => {
  it('CAUTIONARY: trusting the browser leg on native is fail-OPEN (CLEAN → ALLOW)', () => {
    // The bug the selector fixes (resolveProbeSource fell back to this) — documented so a
    // regression is obvious.
    expect(tierOf(CLEAN_BROWSER_ON_NATIVE)).toBe(TIER.ALLOW);
  });

  it('native + UNAVAILABLE native probe (plugin absent/threw/iOS) must NOT reach ALLOW', () => {
    const chosen = selectPresignProbeSource(true, { available: false }, CLEAN_BROWSER_ON_NATIVE);
    expect(tierOf(chosen)).not.toBe(TIER.ALLOW);
    expect(tierOf(chosen)).toBe(TIER.WARN);
  });

  it('native + NOT-YET-RESOLVED native probe (async window, null) must NOT reach ALLOW', () => {
    const chosen = selectPresignProbeSource(true, null, CLEAN_BROWSER_ON_NATIVE);
    expect(tierOf(chosen)).not.toBe(TIER.ALLOW);
    expect(tierOf(chosen)).toBe(TIER.WARN);
  });

  it('native + ROOTED native probe drives the tier to WARN (native leg consumed)', () => {
    const chosen = selectPresignProbeSource(
      true,
      { available: true, signals: { rooted: true } },
      CLEAN_BROWSER_ON_NATIVE,
    );
    expect(tierOf(chosen)).toBe(TIER.WARN);
  });

  it('native + HOOKED native probe BLOCKS the gate (native leg consumed)', () => {
    const chosen = selectPresignProbeSource(
      true,
      { available: true, signals: { hooked: true } },
      CLEAN_BROWSER_ON_NATIVE,
    );
    expect(tierOf(chosen)).toBe(TIER.BLOCK);
  });

  it('native + CLEAN native probe → ALLOW (only when the OS leg genuinely ran)', () => {
    const chosen = selectPresignProbeSource(
      true,
      { available: true, signals: { hooked: false, rooted: false, emulator: false, tampered: false } },
      CLEAN_BROWSER_ON_NATIVE,
    );
    expect(tierOf(chosen)).toBe(TIER.ALLOW);
  });

  it('native NEVER returns the browser leg — it returns the UNAVAILABLE source instead', () => {
    expect(selectPresignProbeSource(true, { available: false }, CLEAN_BROWSER_ON_NATIVE))
      .toBe(UNAVAILABLE_PROBE_SOURCE);
    expect(selectPresignProbeSource(true, null, CLEAN_BROWSER_ON_NATIVE))
      .toBe(UNAVAILABLE_PROBE_SOURCE);
  });

  it('web + clean browser → ALLOW (web behaviour unchanged)', () => {
    const cleanBrowser = { available: true, signals: { hooked: false, rooted: false, emulator: false, tampered: false } };
    expect(tierOf(selectPresignProbeSource(false, null, cleanBrowser))).toBe(TIER.ALLOW);
  });

  it('web + webdriver-hooked browser → BLOCK (web behaviour unchanged)', () => {
    const hookedBrowser = { available: true, signals: { hooked: true } };
    expect(tierOf(selectPresignProbeSource(false, null, hookedBrowser))).toBe(TIER.BLOCK);
  });
});

// src/rasp/__tests__/nativeProbe.hardSignalLatch.test.js
//
// Audit 2026-09-07 M-1 — a muted probe must not walk back a hard detection.
//
// THE HOLE. A well-formed verdict reporting hooked/tampered/emulator drives
// CONDITION.HOOKED/TAMPERED/EMULATOR → BLOCK, and compose.js makes BLOCK
// non-overridable precisely because a hostile runtime can forge the "sign
// anyway" confirmation. Every failure path in nativeProbe returns
// { available:false }, which detect() maps to INTEGRITY_UNAVAILABLE → WARN —
// and WARN *is* overridable (biometric + ack). So an attacker already caught by
// the probe only had to MUTE it on the next presign — kill the plugin, stall
// past FRESH_PROBE_TIMEOUT_MS, return a partial shape — to demote their own
// BLOCK into a re-confirm-and-continue prompt. "Detect once, warn forever."
//
// THE SHAPE OF THE FIX, and the thing worth protecting in review: the latch arms
// ONLY on a positive hard detection from an available, shape-valid verdict. It
// can never be armed by an absence. That is what keeps #2276's self-renewing
// BLOCK out of this leg — attestation's latch arms on `attestationFailed`, which
// a stale root pinset can assert on a genuine device; this one cannot arm on a
// genuine device at all, because a genuine device reports false on all three.
// The "never arms from an absence" and "clean device never arms" cases below are
// the ones that pin that distinction. Do not delete them to make a change pass.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  isNative: true,
  platform: 'android',
  checkIntegrity: null,
  pluginPresent: true,
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => h.isNative, getPlatform: () => h.platform },
}));

vi.mock('@/rasp/raspIntegrityPlugin', () => ({
  get RaspIntegrity() {
    if (!h.pluginPresent) return undefined;
    return {
      checkIntegrity: (...args) =>
        h.checkIntegrity ? h.checkIntegrity(...args) : Promise.resolve({}),
    };
  },
}));

import { nativeProbeSource, _resetNativeHardSignalLatchForTests } from '@/rasp/nativeProbe.js';
import { detect } from '@/rasp/detect.js';
import { degrade } from '@/rasp/degrade.js';
import { CONDITION, TIER } from '@/rasp/conditions.js';

// The four core booleans every honest native producer emits.
const core = (over = {}) => ({
  rooted: false, hookedProcess: false, emulator: false, tampered: false, ...over,
});

const tierOf = async () => degrade(detect(await nativeProbeSource())).tier;

beforeEach(() => {
  _resetNativeHardSignalLatchForTests();
  h.isNative = true;
  h.platform = 'android';
  h.pluginPresent = true;
  h.checkIntegrity = null;
});

describe('nativeProbe — hard-signal session latch (audit M-1)', () => {
  it('a hooked verdict BLOCKS, and a later muted probe still BLOCKS', async () => {
    h.checkIntegrity = () => Promise.resolve(core({ hookedProcess: true }));
    expect(await tierOf()).toBe(TIER.BLOCK);

    // The attack: silence the bridge on the next presign.
    h.checkIntegrity = () => Promise.reject(new Error('bridge killed'));
    expect(await tierOf()).toBe(TIER.BLOCK);
  });

  it('holds through a partial/malformed shape too, not just a throw', async () => {
    h.checkIntegrity = () => Promise.resolve(core({ tampered: true }));
    expect(await tierOf()).toBe(TIER.BLOCK);

    // Shape drift is the other way to mute a leg (P2-6b fail-closed path).
    h.checkIntegrity = () => Promise.resolve({ rooted: false });
    expect(await tierOf()).toBe(TIER.BLOCK);
  });

  it('holds through the plugin disappearing entirely', async () => {
    h.checkIntegrity = () => Promise.resolve(core({ emulator: true }));
    expect(await tierOf()).toBe(TIER.BLOCK);

    h.pluginPresent = false;
    expect(await tierOf()).toBe(TIER.BLOCK);
  });

  it('re-asserts the SPECIFIC signal that was seen, not a generic block', async () => {
    h.checkIntegrity = () => Promise.resolve(core({ tampered: true }));
    expect(detect(await nativeProbeSource())).toBe(CONDITION.TAMPERED);

    h.checkIntegrity = () => Promise.reject(new Error('muted'));
    expect(detect(await nativeProbeSource())).toBe(CONDITION.TAMPERED);
  });

  // ---- the cases that keep this from becoming #2276 -----------------------

  it('NEVER arms from an absence: a mute with no prior detection stays WARN', async () => {
    // This is the whole safety argument. If an unavailable verdict could arm the
    // latch, a genuine device with a flaky bridge would latch itself to BLOCK and
    // re-arm on every subsequent probe — the self-renewing failure that keeps
    // #2276 pinned at WARN. It must stay INTEGRITY_UNAVAILABLE → WARN.
    h.checkIntegrity = () => Promise.reject(new Error('flaky bridge'));
    expect(detect(await nativeProbeSource())).toBe(CONDITION.INTEGRITY_UNAVAILABLE);
    expect(await tierOf()).toBe(TIER.WARN);

    // Still WARN after several failures — no accumulation.
    expect(await tierOf()).toBe(TIER.WARN);
    expect(await tierOf()).toBe(TIER.WARN);
  });

  it('a clean device never arms the latch, so a later mute is still WARN', async () => {
    h.checkIntegrity = () => Promise.resolve(core());
    expect(await tierOf()).toBe(TIER.ALLOW);

    h.checkIntegrity = () => Promise.reject(new Error('muted'));
    expect(await tierOf()).toBe(TIER.WARN);
  });

  it('a real PASS clears a prior detection — mute alone cannot', async () => {
    h.checkIntegrity = () => Promise.resolve(core({ hookedProcess: true }));
    expect(await tierOf()).toBe(TIER.BLOCK);

    // Defeating the probe (a genuine all-clear verdict) is the only way out.
    h.checkIntegrity = () => Promise.resolve(core());
    expect(await tierOf()).toBe(TIER.ALLOW);

    // ...and the latch is genuinely gone, not merely masked.
    h.checkIntegrity = () => Promise.reject(new Error('muted'));
    expect(await tierOf()).toBe(TIER.WARN);
  });

  it('does NOT latch the soft axes — rooted is WARN either way', async () => {
    // rooted/elevated/screenCapture are already WARN, so a mute downgrades
    // nothing and there is no hole to close. Latching them would strand the
    // false-positive-prone axis (custom ROMs, OEM quirks) in a sticky state.
    h.checkIntegrity = () => Promise.resolve(core({ rooted: true }));
    expect(detect(await nativeProbeSource())).toBe(CONDITION.ROOTED);

    h.checkIntegrity = () => Promise.reject(new Error('muted'));
    // Falls back to plain UNAVAILABLE, not a re-asserted ROOTED.
    expect(detect(await nativeProbeSource())).toBe(CONDITION.INTEGRITY_UNAVAILABLE);
    expect(await tierOf()).toBe(TIER.WARN);
  });

  it('a web session cannot inherit a latch', async () => {
    h.checkIntegrity = () => Promise.resolve(core({ hookedProcess: true }));
    expect(await tierOf()).toBe(TIER.BLOCK);

    // The non-native early return is checked BEFORE the latch wrapper.
    h.isNative = false;
    expect(detect(await nativeProbeSource())).toBe(CONDITION.INTEGRITY_UNAVAILABLE);
  });

  it('app-lock clears the latch so a rebooted-to-clean session starts fresh', async () => {
    h.checkIntegrity = () => Promise.resolve(core({ hookedProcess: true }));
    expect(await tierOf()).toBe(TIER.BLOCK);

    window.dispatchEvent(new Event('veyrnox:app-lock'));

    h.checkIntegrity = () => Promise.reject(new Error('muted'));
    expect(await tierOf()).toBe(TIER.WARN);
  });
});

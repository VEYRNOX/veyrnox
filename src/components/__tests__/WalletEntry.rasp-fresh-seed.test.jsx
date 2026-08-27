// WalletEntry — seed-material actions are gated on a probe taken AT THE TAP,
// not on the <=60 s-stale mount sample (L-6, audit 2026-08-25).
//
// useRaspArtifact samples once at mount and refreshes on foreground plus a 60 s
// heartbeat, so a hook injected after the last probe but before the user taps is
// judged under a verdict that never saw it. The sign hot-path was hardened for
// exactly this (SendCrypto.jsx: await getFreshRaspArtifact()); degrade.js calls
// seed reveal / export / import "the highest-danger moments" and they still had
// the weaker guarantee.
//
// freshSensitiveGate() is the WalletEntry equivalent. It differs from
// getFreshRaspArtifact() in ONE deliberate way: it composes the ON-DEVICE leg
// only, because these surfaces run excludeAttestation (owner decision
// 2026-07-16 — a sideloaded build gets HTTP 404 from Play Integrity ->
// INTEGRITY_UNAVAILABLE -> seed backup blocked). Swapping in the plain
// getFreshRaspArtifact() would have re-broken that.
//
// We assert the gate's machine output ({ blocked }), plus a source scan that the
// three seed-material call sites actually route through it — the same
// wiring-scan pattern as rasp/__tests__/g2-wiring.test.js, which exists because
// a correct helper wired to nothing is the failure mode this class of finding
// keeps producing.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const nativeProbeSource = vi.fn();
let isNative = true;

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => isNative, getPlatform: () => (isNative ? 'android' : 'web') },
}));
vi.mock('@/rasp', async (orig) => {
  const real = await orig();
  return { ...real, nativeProbeSource };
});

const { freshSensitiveGate } = await import('@/components/WalletEntry');

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const src = readFileSync(resolve(repoRoot, 'src/components/WalletEntry.jsx'), 'utf8');

// detect() requires all four core booleans present (P2-6a): a partial shape is
// bridge drift and fails closed, so the fixtures spell them out.
const SIGNALS = (over = {}) => ({ rooted: false, hooked: false, emulator: false, tampered: false, ...over });

beforeEach(() => { isNative = true; nativeProbeSource.mockReset(); });

describe('WalletEntry — freshSensitiveGate probes at the tap (L-6)', () => {
  it('blocks seed-reveal when the FRESH native probe reports a hook', async () => {
    nativeProbeSource.mockResolvedValue({ available: true, signals: SIGNALS({ hooked: true }) });
    await expect(freshSensitiveGate('seed-reveal')).resolves.toMatchObject({ blocked: true });
    expect(nativeProbeSource).toHaveBeenCalledTimes(1);
  });

  it('allows seed-reveal when the fresh probe is clean', async () => {
    nativeProbeSource.mockResolvedValue({ available: true, signals: SIGNALS() });
    await expect(freshSensitiveGate('seed-reveal')).resolves.toMatchObject({ blocked: false });
  });

  it('re-probes on EVERY call — no cached verdict between taps', async () => {
    nativeProbeSource.mockResolvedValue({ available: true, signals: SIGNALS() });
    await freshSensitiveGate('import');
    await freshSensitiveGate('import');
    expect(nativeProbeSource).toHaveBeenCalledTimes(2);
  });

  it('fails CLOSED when the probe throws (I4 — absence of a verdict is not a clean verdict)', async () => {
    nativeProbeSource.mockRejectedValue(new Error('bridge gone'));
    await expect(freshSensitiveGate('import')).resolves.toMatchObject({ blocked: true });
  });

  it('fails CLOSED when the native probe is unavailable', async () => {
    nativeProbeSource.mockResolvedValue({ available: false });
    await expect(freshSensitiveGate('export')).resolves.toMatchObject({ blocked: true });
  });
});

describe('WalletEntry — the seed-material call sites use the fresh gate (L-6 wiring)', () => {
  it('no seed-material site still gates on the stale mount artifact', () => {
    expect(src).not.toMatch(/sensitiveGate\(\s*raspArtifact\s*,/);
  });

  it('awaits freshSensitiveGate at each of the three seed-material sites', () => {
    const hits = src.match(/await\s+freshSensitiveGate\(/g) || [];
    expect(hits.length).toBe(3);
  });
});

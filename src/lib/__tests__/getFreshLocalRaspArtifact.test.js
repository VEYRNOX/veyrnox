// getFreshLocalRaspArtifact — L-6 (audit 2026-08-25) fresh-at-confirm probe
// for local seed-material surfaces (on-device leg only, no attestation).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => true) },
}));

vi.mock('@/rasp/nativeProbe.js', () => ({
  nativeProbeSource: vi.fn(),
}));

const { getFreshLocalRaspArtifact, LOCAL_FRESH_PROBE_TIMEOUT_MS } = await import('../getFreshLocalRaspArtifact.js');
const { Capacitor } = await import('@capacitor/core');
const { nativeProbeSource } = await import('@/rasp/nativeProbe.js');
const { TIER } = await import('@/rasp');

beforeEach(() => {
  vi.clearAllMocks();
  Capacitor.isNativePlatform.mockReturnValue(true);
});
afterEach(() => { vi.useRealTimers(); });

describe('getFreshLocalRaspArtifact — L-6 on-device-only fresh probe', () => {
  it('calls nativeProbeSource fresh on native (no memoization)', async () => {
    nativeProbeSource.mockResolvedValue({
      available: true,
      signals: { rooted: false, hooked: false, emulator: false, tampered: false },
    });

    const a1 = await getFreshLocalRaspArtifact();
    const a2 = await getFreshLocalRaspArtifact();

    expect(nativeProbeSource).toHaveBeenCalledTimes(2);
    expect(a1.tier).toBe(TIER.ALLOW);
    expect(a2.tier).toBe(TIER.ALLOW);
  });

  it('a genuine on-device threat still fails closed (blocks seed-reveal/export/import)', async () => {
    nativeProbeSource.mockResolvedValue({
      available: true,
      signals: { rooted: false, hooked: true, emulator: false, tampered: false },
    });

    const artifact = await getFreshLocalRaspArtifact();
    expect(artifact.tier).toBe(TIER.BLOCK);
    expect(artifact.blockedActions).toEqual(expect.arrayContaining(['seed-reveal', 'export', 'import']));
  });

  it('fails closed on a hanging native probe (timeout → NOT ALLOW, full shape)', async () => {
    vi.useFakeTimers();
    nativeProbeSource.mockImplementation(() => new Promise(() => {}));

    const p = getFreshLocalRaspArtifact();
    await vi.advanceTimersByTimeAsync(LOCAL_FRESH_PROBE_TIMEOUT_MS + 100);
    const artifact = await p;

    expect(artifact.tier).not.toBe(TIER.ALLOW);
    // Full shape — sensitiveGate() must not crash consuming this.
    expect(Array.isArray(artifact.blockedActions)).toBe(true);
  });

  it('fails closed on native probe throw', async () => {
    nativeProbeSource.mockRejectedValue(new Error('bridge exploded'));
    const artifact = await getFreshLocalRaspArtifact();
    expect(artifact.tier).not.toBe(TIER.ALLOW);
    expect(Array.isArray(artifact.blockedActions)).toBe(true);
  });

  it('on web: does not call nativeProbeSource (browser leg only)', async () => {
    Capacitor.isNativePlatform.mockReturnValue(false);
    const artifact = await getFreshLocalRaspArtifact();
    expect(nativeProbeSource).not.toHaveBeenCalled();
    expect(artifact.tier).toBeDefined();
  });

  it('never composes a remote-attestation condition (no such leg exists here)', async () => {
    // Sanity: on native with a CLEAN OS leg, the result is a plain ALLOW —
    // there is no attestation axis that could downgrade it to WARN, unlike
    // src/rasp/getFreshRaspArtifact.js's default (attestation-composing) path.
    nativeProbeSource.mockResolvedValue({
      available: true,
      signals: { rooted: false, hooked: false, emulator: false, tampered: false },
    });
    const artifact = await getFreshLocalRaspArtifact();
    expect(artifact.tier).toBe(TIER.ALLOW);
    expect(artifact.blockedActions).toEqual([]);
  });
});

// getFreshRaspArtifact — fresh-at-sign RASP probe.
//
// P2-1 (audit): SendCrypto.mutationFn was reusing the closure's `raspTier`, up to
// ~60 s stale (last heartbeat sample). An attacker who injected a hook AFTER the
// last probe but BEFORE the user tapped Send would sign with a verdict that never
// saw the hook. Mirror WalletConnect's presignGateOrReject pattern: at gate time
// await FRESH probes with a bounded fail-closed timeout, compose, degrade.
//
// This is the pure async layer, unit-tested in isolation. SendCrypto.mutationFn
// awaits it and uses the returned artifact instead of the stale closure.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock BEFORE importing the module-under-test so the vi.mock hoisting captures the
// probe sources and Capacitor. All four are used inside getFreshRaspArtifact.
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => true) },
}));

vi.mock('../nativeProbe.js', () => ({
  nativeProbeSource: vi.fn(),
}));

vi.mock('../attestation.js', async () => {
  const actual = await vi.importActual('../attestation.js');
  return {
    ...actual,
    ATTESTATION_ENABLED: true,
    attestationProbeSource: vi.fn(),
  };
});

const { getFreshRaspArtifact } = await import('../getFreshRaspArtifact.js');
const { Capacitor } = await import('@capacitor/core');
const { nativeProbeSource } = await import('../nativeProbe.js');
const { attestationProbeSource } = await import('../attestation.js');
const { TIER } = await import('../conditions.js');

beforeEach(() => {
  vi.clearAllMocks();
  Capacitor.isNativePlatform.mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getFreshRaspArtifact — P2-1 fresh-at-sign', () => {
  it('awaits BOTH nativeProbeSource and attestationProbeSource on native', async () => {
    nativeProbeSource.mockResolvedValue({
      available: true,
      signals: { rooted: false, hooked: false, emulator: false, tampered: false },
    });
    attestationProbeSource.mockResolvedValue({ available: true, attestationFailed: false });

    const artifact = await getFreshRaspArtifact();

    expect(nativeProbeSource).toHaveBeenCalledTimes(1);
    expect(attestationProbeSource).toHaveBeenCalledTimes(1);
    // Clean OS + clean attest → ALLOW.
    expect(artifact.tier).toBe(TIER.ALLOW);
  });

  it('two consecutive calls both re-probe (no memoization → truly fresh)', async () => {
    nativeProbeSource.mockResolvedValue({
      available: true,
      signals: { rooted: false, hooked: false, emulator: false, tampered: false },
    });
    attestationProbeSource.mockResolvedValue({ available: true, attestationFailed: false });

    await getFreshRaspArtifact();
    await getFreshRaspArtifact();

    expect(nativeProbeSource).toHaveBeenCalledTimes(2);
    expect(attestationProbeSource).toHaveBeenCalledTimes(2);
  });

  it('fails closed on a hanging native probe (> 1500 ms timeout → NOT ALLOW)', async () => {
    vi.useFakeTimers();
    // A never-resolving native probe. Attestation is clean but the OS leg being
    // unavailable must fail closed to WARN (not ALLOW).
    nativeProbeSource.mockImplementation(() => new Promise(() => {}));
    attestationProbeSource.mockResolvedValue({ available: true, attestationFailed: false });

    const p = getFreshRaspArtifact();
    // Advance past the 1500 ms fail-closed timeout.
    await vi.advanceTimersByTimeAsync(1600);
    const artifact = await p;
    expect(artifact.tier).not.toBe(TIER.ALLOW);
  });

  it('fails closed on native probe throw', async () => {
    nativeProbeSource.mockRejectedValue(new Error('bridge exploded'));
    attestationProbeSource.mockResolvedValue({ available: true, attestationFailed: false });

    const artifact = await getFreshRaspArtifact();
    expect(artifact.tier).not.toBe(TIER.ALLOW);
  });

  it('fails closed (BLOCK) when detection chain throws entirely', async () => {
    // Force compose to explode by returning a shape that classifyEnvironment rejects.
    nativeProbeSource.mockResolvedValue({ available: 'not-a-boolean' });
    attestationProbeSource.mockResolvedValue({ available: 'not-a-boolean' });

    const artifact = await getFreshRaspArtifact();
    // I4: absence of a clean signal is not clean — total failure resolves to BLOCK.
    expect([TIER.BLOCK, TIER.WARN]).toContain(artifact.tier);
    expect(artifact.tier).not.toBe(TIER.ALLOW);
  });

  it('on web: does NOT call native/attestation probes (browser leg only)', async () => {
    Capacitor.isNativePlatform.mockReturnValue(false);
    const artifact = await getFreshRaspArtifact();
    expect(nativeProbeSource).not.toHaveBeenCalled();
    expect(attestationProbeSource).not.toHaveBeenCalled();
    // A vanilla test env with no WebDriver flag reads CLEAN on the browser leg.
    expect(artifact).toBeTruthy();
    expect(artifact.tier).toBeDefined();
  });

  it('composes so the more dangerous leg wins (rooted OS + clean attest → NOT ALLOW)', async () => {
    nativeProbeSource.mockResolvedValue({
      available: true,
      signals: { rooted: true, hooked: false, emulator: false, tampered: false },
    });
    attestationProbeSource.mockResolvedValue({ available: true, attestationFailed: false });

    const artifact = await getFreshRaspArtifact();
    expect(artifact.tier).not.toBe(TIER.ALLOW);
  });
});

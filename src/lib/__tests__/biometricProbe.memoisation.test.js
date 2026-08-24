/**
 * biometricProbe.memoisation — pins the single-delegate-call contract.
 *
 * A cold Android unlock previously fired six BiometricAuth.checkBiometry() IPCs
 * back-to-back. This suite fails if any regression re-fans that out.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const checkBiometryMock = vi.fn();

vi.mock('@aparajita/capacitor-biometric-auth', () => ({
  BiometricAuth: {
    checkBiometry: (...args) => checkBiometryMock(...args),
  },
}));

let getCachedBiometry;
let invalidateBiometryProbe;

beforeEach(async () => {
  vi.resetModules();
  checkBiometryMock.mockReset();
  const mod = await import('../biometricProbe.js');
  getCachedBiometry = mod.getCachedBiometry;
  invalidateBiometryProbe = mod.invalidateBiometryProbe;
});

afterEach(() => {
  invalidateBiometryProbe?.();
});

describe('getCachedBiometry', () => {
  it('probes the plugin exactly once across many concurrent callers', async () => {
    checkBiometryMock.mockResolvedValue({ isAvailable: true, deviceIsSecure: true });

    const results = await Promise.all([
      getCachedBiometry(),
      getCachedBiometry(),
      getCachedBiometry(),
      getCachedBiometry(),
      getCachedBiometry(),
      getCachedBiometry(),
    ]);

    expect(checkBiometryMock).toHaveBeenCalledTimes(1);
    for (const r of results) {
      expect(r).toEqual({ isAvailable: true, deviceIsSecure: true });
    }
  });

  it('probes exactly once across sequential callers', async () => {
    checkBiometryMock.mockResolvedValue({ isAvailable: true, deviceIsSecure: false });

    await getCachedBiometry();
    await getCachedBiometry();
    await getCachedBiometry();

    expect(checkBiometryMock).toHaveBeenCalledTimes(1);
  });

  it('re-probes after invalidateBiometryProbe()', async () => {
    checkBiometryMock
      .mockResolvedValueOnce({ isAvailable: true, deviceIsSecure: true })
      .mockResolvedValueOnce({ isAvailable: false, deviceIsSecure: true });

    const first = await getCachedBiometry();
    expect(first).toEqual({ isAvailable: true, deviceIsSecure: true });

    invalidateBiometryProbe();

    const second = await getCachedBiometry();
    expect(second).toEqual({ isAvailable: false, deviceIsSecure: true });
    expect(checkBiometryMock).toHaveBeenCalledTimes(2);
  });

  it('does not cache a rejected probe (fail-closed, retry next call)', async () => {
    checkBiometryMock
      .mockRejectedValueOnce(new Error('plugin unavailable'))
      .mockResolvedValueOnce({ isAvailable: true, deviceIsSecure: true });

    const first = await getCachedBiometry();
    expect(first).toBeNull();

    const second = await getCachedBiometry();
    expect(second).toEqual({ isAvailable: true, deviceIsSecure: true });
    expect(checkBiometryMock).toHaveBeenCalledTimes(2);
  });
});

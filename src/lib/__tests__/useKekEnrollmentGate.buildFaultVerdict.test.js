// A BUILD fault must never be cached as a DEVICE verdict (#2257).
//
// veyrnox-kek-insecure-tier is a PERMANENT per-device record. The detect effect
// in useKekEnrollmentGate returns early whenever it is set, so once written the
// hardware-KEK enrollment gate never fires again on that install — by design,
// because a device without StrongBox/TEE will not grow one and re-prompting
// every unlock forever is worse than not asking.
//
// That reasoning holds only for verdicts that are genuinely about the DEVICE.
// classifyEnrollError also returns isInsecureTier:true for an unregistered
// native plugin ('UNIMPLEMENTED'), which its own comment calls out as "NOT a
// device fault" — it is a property of the BUILD, and it happens for real (the
// local iOS plugin being dropped from packageClassList). Caching that marks
// every device running one bad build as permanently ineligible, and the next
// build that restores the plugin cannot undo it, because the gate that would
// re-probe is the thing being suppressed. Recovery then depends on the user
// finding Settings → Security and retrying by hand.
//
// So the two consequences of isInsecureTier are deliberately split:
//   isInsecureTier: true   → the gate is skippable (unchanged, still wanted)
//   deviceVerdict:  false  → do NOT persist (new; absent means device-derived)
//
// These tests exercise classifyEnrollError through the module's public surface
// by driving enroll() with synthetic native errors and asserting on what
// reaches localStorage.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const enrollKekMock = vi.fn();
const hasVaultKekWrapMock = vi.fn(async () => false);
const enrollHardwareCredentialMock = vi.fn();

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
}));

vi.mock('@/wallet-core/keystore', () => ({
  getKeyStore: () => ({
    enrollKek: enrollKekMock,
    hasVaultKekWrap: hasVaultKekWrapMock,
    isSecureHardwareAvailable: async () => true,
  }),
  withLockSuppressed: async (fn) => fn(),
}));

vi.mock('@/wallet-core/keystore/hardware.js', () => ({
  enrollHardwareCredential: enrollHardwareCredentialMock,
  getHardwareFactor: async () => new Uint8Array(32),
  clearHardwareCredential: async () => {},
}));

vi.mock('@/wallet-core/keystore/kek.js', () => ({
  KEK_ERR: { NO_HARDWARE_FACTOR: 'KEK_NO_HARDWARE_FACTOR', UNWRAP_FAILED: 'KEK_UNWRAP_FAILED' },
}));

vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: () => false,
}));

const { renderHook, act } = await import('@testing-library/react');
const { useKekEnrollmentGate, KEK_INSECURE_TIER_KEY } = await import('@/lib/useKekEnrollmentGate');

/** Drive enroll() with a native error and report what it returned. */
async function enrollFailingWith(error) {
  enrollHardwareCredentialMock.mockRejectedValueOnce(error);
  const { result } = renderHook(() => useKekEnrollmentGate({ isUnlocked: false }));
  let outcome;
  await act(async () => { outcome = await result.current.enroll('12345678'); });
  return outcome;
}

describe('KEK insecure-tier verdict — build fault vs device fault (#2257)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('does NOT persist the verdict when the native plugin is unregistered (build fault)', async () => {
    const err = Object.assign(new Error('"HardwareKek" plugin is not implemented on ios'), {
      code: 'UNIMPLEMENTED',
    });
    const outcome = await enrollFailingWith(err);

    // Still skippable — that behaviour is intentional and unchanged.
    expect(outcome.isInsecureTier).toBe(true);
    // But explicitly NOT a statement about this device.
    expect(outcome.deviceVerdict).toBe(false);
    // The permanent suppression key must be untouched: this is the whole point.
    // Before the fix this read '1' and the gate never fired again, including on
    // the next build that restored the plugin.
    expect(localStorage.getItem(KEK_INSECURE_TIER_KEY)).toBeNull();
  });

  it('DOES persist the verdict for a genuine device-tier failure', async () => {
    const err = Object.assign(new Error('insecure tier'), {
      code: 'KEK_ENROLL_INSECURE_TIER',
    });
    const outcome = await enrollFailingWith(err);

    expect(outcome.isInsecureTier).toBe(true);
    expect(outcome.deviceVerdict).not.toBe(false);
    // A device that reports SOFTWARE-tier Keystore will report it again
    // tomorrow — caching is correct here, and this case must not regress.
    expect(localStorage.getItem(KEK_INSECURE_TIER_KEY)).toBe('1');
  });

  it('DOES persist for Android < 11 (device/OS fault, recoverable via the Android retest)', async () => {
    const err = Object.assign(new Error('KEK_REQUIRES_ANDROID_11'), {
      code: 'KEK_REQUIRES_ANDROID_11',
    });
    await enrollFailingWith(err);
    expect(localStorage.getItem(KEK_INSECURE_TIER_KEY)).toBe('1');
  });

  it('does not persist anything for a non-insecure-tier failure (wrong PIN)', async () => {
    const err = Object.assign(new Error('Decryption failed'), {});
    const outcome = await enrollFailingWith(err);
    expect(outcome.isWrongPin).toBe(true);
    expect(localStorage.getItem(KEK_INSECURE_TIER_KEY)).toBeNull();
  });
});

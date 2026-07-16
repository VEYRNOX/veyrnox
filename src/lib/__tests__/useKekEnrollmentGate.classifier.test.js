// src/lib/__tests__/useKekEnrollmentGate.classifier.test.js
//
// Regression tests for classifyEnrollError() in useKekEnrollmentGate.js.
//
// ROOT CAUSE: Kotlin call.reject(message) leaves e.code undefined; codes such as
// KEK_ALREADY_ENROLLED and KEK_REQUIRES_ANDROID_11 were only in e.message and fell
// through to GENERIC_MSG — producing a permanent "Something went wrong" stuck loop.
// FIX: classifier now checks e.message as a fallback for all native-layer codes,
// and KEK_CLEAR_STALE_FAILED / STALE_CLEAR_FAILED are added as explicit codes.

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Minimal Capacitor mock — native platform.
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
  registerPlugin: () => ({}),
}));

// Mock wallet-core/keystore and hardware.js — we're only testing the classifier logic.
vi.mock('@/wallet-core/keystore', () => ({
  getKeyStore: () => ({
    isSecureHardwareAvailable: async () => false, // gate stays inactive — unit testing classifier only
    hasVaultKekWrap: async () => true,
  }),
}));
vi.mock('@/wallet-core/keystore/hardware.js', () => ({
  enrollHardwareCredential: vi.fn(),
  getHardwareFactor: vi.fn(),
}));
vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: () => false,
}));

const { enrollHardwareCredential } = await import('@/wallet-core/keystore/hardware.js');
const { useKekEnrollmentGate } = await import('@/lib/useKekEnrollmentGate.js');

function makeError(message, code) {
  return Object.assign(new Error(message), code ? { code } : {});
}

async function enrollAndGetResult(error) {
  enrollHardwareCredential.mockRejectedValue(error);

  const { result } = renderHook(() => useKekEnrollmentGate({ isUnlocked: false }));
  let outcome;
  await act(async () => {
    outcome = await result.current.enroll('12345678');
  });
  return outcome;
}

describe('classifyEnrollError — stale key codes', () => {
  it('KEK_CLEAR_STALE_FAILED code (Android Kotlin) → stale key message, not generic', async () => {
    const r = await enrollAndGetResult(makeError('Cannot remove stale key', 'KEK_CLEAR_STALE_FAILED'));
    expect(r.ok).toBe(false);
    expect(r.msg).toMatch(/stale hardware key/i);
    expect(r.isInsecureTier).toBe(false);
    expect(r.isWrongPin).toBe(false);
  });

  it('STALE_CLEAR_FAILED code (iOS ObjC) → stale key message', async () => {
    const r = await enrollAndGetResult(makeError('SE delete OSStatus -25308', 'STALE_CLEAR_FAILED'));
    expect(r.ok).toBe(false);
    expect(r.msg).toMatch(/stale hardware key/i);
  });

  it('KEK_ALREADY_ENROLLED in message only (old build) → stale key message', async () => {
    // Kotlin 1-arg call.reject() leaves e.code undefined — legacy fallback via message
    const r = await enrollAndGetResult(makeError('KEK_ALREADY_ENROLLED: clearCredential first'));
    expect(r.ok).toBe(false);
    expect(r.msg).toMatch(/stale hardware key/i);
  });
});

describe('classifyEnrollError — Android 11 gate', () => {
  it('KEK_REQUIRES_ANDROID_11 code → insecure tier (Android <11 treated as non-HW)', async () => {
    const r = await enrollAndGetResult(makeError('Hardware KEK requires Android 11+', 'KEK_REQUIRES_ANDROID_11'));
    expect(r.ok).toBe(false);
    expect(r.isInsecureTier).toBe(true);
    expect(r.msg).toMatch(/android 11/i);
  });

  it('KEK_REQUIRES_ANDROID_11 in message only (legacy) → insecure tier', async () => {
    const r = await enrollAndGetResult(makeError('KEK_REQUIRES_ANDROID_11: Hardware KEK requires Android 11+'));
    expect(r.ok).toBe(false);
    expect(r.isInsecureTier).toBe(true);
  });
});

describe('classifyEnrollError — biometric lockout', () => {
  it('origCode NO_HARDWARE_FACTOR (lockout fallback cancelled) → lockout message', async () => {
    const err = makeError('User cancelled');
    err.origCode = 'KEK_NO_HARDWARE_FACTOR';
    const r = await enrollAndGetResult(err);
    expect(r.ok).toBe(false);
    expect(r.msg).toMatch(/biometric sensor is temporarily locked/i);
    expect(r.isInsecureTier).toBe(false);
    expect(r.isWrongPin).toBe(false);
  });

  it('biometryLockout in message → lockout message', async () => {
    const r = await enrollAndGetResult(makeError('biometryLockout: too many attempts'));
    expect(r.ok).toBe(false);
    expect(r.msg).toMatch(/biometric sensor is temporarily locked/i);
  });
});

describe('classifyEnrollError — existing classifications still work', () => {
  it('KEK_ENROLL_INSECURE_TIER → insecure tier', async () => {
    const r = await enrollAndGetResult(makeError('SOFTWARE tier refused', 'KEK_ENROLL_INSECURE_TIER'));
    expect(r.ok).toBe(false);
    expect(r.isInsecureTier).toBe(true);
  });

  it('WRONG_PASSWORD → wrong PIN', async () => {
    const r = await enrollAndGetResult(makeError('wrong', 'WRONG_PASSWORD'));
    expect(r.ok).toBe(false);
    expect(r.isWrongPin).toBe(true);
  });

  it('unknown error → generic message', async () => {
    const r = await enrollAndGetResult(makeError('Some unexpected error'));
    expect(r.ok).toBe(false);
    expect(r.msg).toMatch(/something went wrong/i);
  });
});

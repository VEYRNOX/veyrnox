// src/wallet-core/keystore/__tests__/hardware.stale-alias-recovery.test.js
//
// Regression tests for the reinstall+restore stale-alias recovery path.
//
// ROOT CAUSE: After app reinstall on Android, the AndroidKeyStore alias survives.
// plugin.isEnrolled() returns {enrolled:true}, but the vault is bare (no kekWrap).
// JS calls clearCredential() best-effort — it silently fails on some devices.
// Previously: plugin.enroll() hit KEK_ALREADY_ENROLLED → GENERIC_MSG stuck loop.
// FIX: JS now catches isVaultWrapped() throws; Kotlin now force-deletes the stale
// alias instead of rejecting. classifyEnrollError() classifies all stale-key codes.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const enrollFn = vi.fn(async () => ({ securityLevel: 2, securityLevelName: 'STRONGBOX' }));
const isEnrolledFn = vi.fn(async () => ({ enrolled: false }));
const clearCredentialFn = vi.fn(async () => {});

const pluginMock = {
  enroll: enrollFn,
  isEnrolled: isEnrolledFn,
  getHardwareFactor: vi.fn(async () => ({ h: btoa('x'.repeat(32)) })),
  clearCredential: clearCredentialFn,
};
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
  registerPlugin: () => pluginMock,
}));

const { enrollHardwareCredential } = await import('../hardware.js');

beforeEach(() => {
  vi.clearAllMocks();
  isEnrolledFn.mockResolvedValue({ enrolled: false });
  enrollFn.mockResolvedValue({ securityLevel: 2, securityLevelName: 'STRONGBOX' });
  clearCredentialFn.mockResolvedValue({});
});

describe('hardware.js stale-alias recovery', () => {
  it('proceeds with enrollment when stale alias present but vault is bare', async () => {
    isEnrolledFn.mockResolvedValue({ enrolled: true });
    clearCredentialFn.mockResolvedValue({}); // clearCredential succeeds

    const tier = await enrollHardwareCredential({
      isVaultWrapped: async () => false, // bare vault — stale alias
    });
    expect(tier.securityLevelName).toBe('STRONGBOX');
    expect(clearCredentialFn).toHaveBeenCalledOnce();
    expect(enrollFn).toHaveBeenCalledOnce();
  });

  it('proceeds even when clearCredential() silently fails (backstop: Kotlin force-deletes)', async () => {
    isEnrolledFn.mockResolvedValue({ enrolled: true });
    clearCredentialFn.mockRejectedValue(new Error('SecItem delete failed'));

    // Should still call plugin.enroll() after best-effort clear fails —
    // the Kotlin layer force-deletes the stale alias as a backstop.
    enrollFn.mockResolvedValue({ securityLevel: 2, securityLevelName: 'STRONGBOX' });

    const tier = await enrollHardwareCredential({
      isVaultWrapped: async () => false,
    });
    expect(tier.securityLevelName).toBe('STRONGBOX');
    expect(enrollFn).toHaveBeenCalledOnce();
  });

  it('blocks enrollment when vault is already wrapped (real active enrollment)', async () => {
    isEnrolledFn.mockResolvedValue({ enrolled: true });

    await expect(
      enrollHardwareCredential({ isVaultWrapped: async () => true })
    ).rejects.toMatchObject({ code: 'HARDWARE_KEK_ALREADY_ENROLLED' });

    expect(enrollFn).not.toHaveBeenCalled();
  });

  it('treats isVaultWrapped() throw as bare vault (safe: allows enrollment)', async () => {
    isEnrolledFn.mockResolvedValue({ enrolled: true });
    clearCredentialFn.mockResolvedValue({});

    const tier = await enrollHardwareCredential({
      isVaultWrapped: async () => { throw new Error('IndexedDB unavailable'); },
    });
    // Should NOT throw HARDWARE_KEK_ALREADY_ENROLLED — treats thrown check as "not wrapped"
    expect(tier.securityLevelName).toBe('STRONGBOX');
  });

  it('blocks enrollment when no opts.isVaultWrapped provided (conservative default)', async () => {
    isEnrolledFn.mockResolvedValue({ enrolled: true });

    await expect(
      enrollHardwareCredential({}) // no isVaultWrapped fn
    ).rejects.toMatchObject({ code: 'HARDWARE_KEK_ALREADY_ENROLLED' });
  });
});

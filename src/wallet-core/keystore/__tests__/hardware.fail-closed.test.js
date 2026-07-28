// src/wallet-core/keystore/__tests__/hardware.fail-closed.test.js
//
// M-3 regression (2026-07-28 internal audit).
//
// enrollHardwareCredential() used to coerce an isVaultWrapped() throw to FALSE, which
// routes into the DESTRUCTIVE recovery path: plugin.clearCredential() + plugin.enroll()
// rotates the hardware factor H and permanently invalidates the existing kekWrap —
// funds lock-out. An ambiguous probe failure is not evidence the vault is bare; the
// only safe default is to treat it as wrapped and refuse to proceed (I4 fail-closed).
//
// This test locks the safe-closed default: on isVaultWrapped throw, clearCredential
// MUST NOT be called and the function MUST throw HARDWARE_KEK_ALREADY_ENROLLED.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const enrollFn = vi.fn(async () => ({ securityLevel: 2, securityLevelName: 'STRONGBOX' }));
const isEnrolledFn = vi.fn(async () => ({ enrolled: true }));
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
  isEnrolledFn.mockResolvedValue({ enrolled: true });
  enrollFn.mockResolvedValue({ securityLevel: 2, securityLevelName: 'STRONGBOX' });
  clearCredentialFn.mockResolvedValue({});
});

describe('M-3: enrollHardwareCredential fail-closed on isVaultWrapped probe error', () => {
  it('throws HARDWARE_KEK_ALREADY_ENROLLED when isVaultWrapped throws (sync throw)', async () => {
    await expect(
      enrollHardwareCredential({
        isVaultWrapped: () => { throw new Error('storage backend offline'); },
      }),
    ).rejects.toMatchObject({ code: 'HARDWARE_KEK_ALREADY_ENROLLED' });
  });

  it('throws HARDWARE_KEK_ALREADY_ENROLLED when isVaultWrapped rejects (async throw)', async () => {
    await expect(
      enrollHardwareCredential({
        isVaultWrapped: async () => { throw new Error('IndexedDB unavailable'); },
      }),
    ).rejects.toMatchObject({ code: 'HARDWARE_KEK_ALREADY_ENROLLED' });
  });

  it('NEVER calls clearCredential when the probe throws', async () => {
    try {
      await enrollHardwareCredential({
        isVaultWrapped: async () => { throw new Error('probe failed'); },
      });
    } catch { /* expected */ }
    expect(clearCredentialFn).not.toHaveBeenCalled();
  });

  it('NEVER calls plugin.enroll when the probe throws (no H rotation, no wrap invalidation)', async () => {
    try {
      await enrollHardwareCredential({
        isVaultWrapped: async () => { throw new Error('probe failed'); },
      });
    } catch { /* expected */ }
    expect(enrollFn).not.toHaveBeenCalled();
  });
});

// Issue #729 (M-5): VeyrnoxEnclavePlugin is auto-registered by Capacitor, so
// Capacitor.Plugins.VeyrnoxEnclave is callable from any injected JS even though the
// M2c hardware-wrap path is gated OFF (M2C_HARDWARE_WRAP_ENABLED=false in native.js).
// An injected script could call createWrappingKey() and mint an orphaned Secure
// Enclave key. The JS bridge must fail closed at this layer too: the mutating /
// key-touching functions (createWrappingKey, hwWrap, hwUnwrap) must throw
// M2C_DISABLED while the flag is false, WITHOUT reaching the native plugin.
//
// isHardwareKeyAvailable (read-only capability probe) and deleteWrappingKey
// (cleanup — deleting a key cannot leak material, and clearVault relies on it) stay
// callable.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the registered plugin so we can observe whether the native surface is reached.
// registerPlugin runs at import time, so build the fake in vi.hoisted to avoid the
// temporal-dead-zone the mock factory would otherwise hit.
const { nativeCalls, fakePlugin } = vi.hoisted(() => {
  const nativeCalls = { createWrappingKey: 0, wrap: 0, unwrap: 0, isHardwareKeyAvailable: 0, deleteWrappingKey: 0 };
  const fakePlugin = {
    isHardwareKeyAvailable: async () => { nativeCalls.isHardwareKeyAvailable++; return { backing: 'none', biometryEnrolled: false }; },
    createWrappingKey: async () => { nativeCalls.createWrappingKey++; },
    wrap: async () => { nativeCalls.wrap++; return { ciphertext: 'CT' }; },
    unwrap: async () => { nativeCalls.unwrap++; return { blob: 'BLOB' }; },
    deleteWrappingKey: async () => { nativeCalls.deleteWrappingKey++; },
  };
  return { nativeCalls, fakePlugin };
});

vi.mock('@capacitor/core', () => ({
  registerPlugin: () => fakePlugin,
}));

import {
  M2C_ENABLED,
  createWrappingKey,
  hwWrap,
  hwUnwrap,
  isHardwareKeyAvailable,
  deleteWrappingKey,
} from '../veyrnoxEnclave.js';

beforeEach(() => {
  for (const k of Object.keys(nativeCalls)) nativeCalls[k] = 0;
});

describe('#729 M-5: veyrnoxEnclave M2c JS fail-closed gate', () => {
  it('M2C_ENABLED is false (must be flipped together with native.js M2C_HARDWARE_WRAP_ENABLED)', () => {
    expect(M2C_ENABLED).toBe(false);
  });

  it('createWrappingKey throws M2C_DISABLED and never reaches native', async () => {
    await expect(createWrappingKey()).rejects.toMatchObject({ code: 'M2C_DISABLED' });
    expect(nativeCalls.createWrappingKey).toBe(0);
  });

  it('hwWrap throws M2C_DISABLED and never reaches native', async () => {
    await expect(hwWrap('AAAA')).rejects.toMatchObject({ code: 'M2C_DISABLED' });
    expect(nativeCalls.wrap).toBe(0);
  });

  it('hwUnwrap throws M2C_DISABLED and never reaches native', async () => {
    await expect(hwUnwrap('AAAA')).rejects.toMatchObject({ code: 'M2C_DISABLED' });
    expect(nativeCalls.unwrap).toBe(0);
  });

  it('isHardwareKeyAvailable stays callable (read-only probe)', async () => {
    await expect(isHardwareKeyAvailable()).resolves.toEqual({ backing: 'none', biometryEnrolled: false });
    expect(nativeCalls.isHardwareKeyAvailable).toBe(1);
  });

  it('deleteWrappingKey stays callable (cleanup path used by clearVault)', async () => {
    await expect(deleteWrappingKey()).resolves.toBeUndefined();
    expect(nativeCalls.deleteWrappingKey).toBe(1);
  });
});

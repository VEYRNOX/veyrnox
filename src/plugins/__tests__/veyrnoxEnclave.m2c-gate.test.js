// Issue #729 (M-5): VeyrnoxEnclavePlugin is auto-registered by Capacitor, so
// Capacitor.Plugins.VeyrnoxEnclave is callable from any injected JS. The JS
// bridge enforces two layers of protection:
//   1. M2C_ENABLED gate — when false, mutating functions throw M2C_DISABLED
//      before reaching native. NOW TRUE (ungated after device verification,
//      PR #1152 / commit f518ba57).
//   2. deleteWrappingKey intent allowlist — injected JS must supply an
//      allowlisted intent string to reach the native delete path.
//
// isHardwareKeyAvailable (read-only capability probe) and deleteWrappingKey
// (cleanup — deleting a key cannot leak material, and clearVault relies on it)
// stay callable regardless of the M2C_ENABLED flag.

import { describe, it, expect, vi, beforeEach } from 'vitest';

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

describe('#729 M-5: veyrnoxEnclave M2c JS bridge layer', () => {
  it('M2C_ENABLED is true (ungated after device verification)', () => {
    expect(M2C_ENABLED).toBe(true);
  });

  it('createWrappingKey reaches native when M2C_ENABLED is true', async () => {
    await createWrappingKey();
    expect(nativeCalls.createWrappingKey).toBe(1);
  });

  it('hwWrap reaches native when M2C_ENABLED is true', async () => {
    const result = await hwWrap('AAAA');
    expect(result).toBe('CT');
    expect(nativeCalls.wrap).toBe(1);
  });

  it('hwUnwrap reaches native when M2C_ENABLED is true', async () => {
    const result = await hwUnwrap('AAAA');
    expect(result).toBe('BLOB');
    expect(nativeCalls.unwrap).toBe(1);
  });

  it('isHardwareKeyAvailable stays callable (read-only probe)', async () => {
    await expect(isHardwareKeyAvailable()).resolves.toEqual({ backing: 'none', biometryEnrolled: false });
    expect(nativeCalls.isHardwareKeyAvailable).toBe(1);
  });

  it('deleteWrappingKey stays callable (cleanup path) — with explicit intent (P2-#1)', async () => {
    await expect(deleteWrappingKey({ intent: 'cleanup' })).resolves.toBeUndefined();
    expect(nativeCalls.deleteWrappingKey).toBe(1);
  });

  it('deleteWrappingKey rejects without a valid intent string', async () => {
    await expect(deleteWrappingKey()).rejects.toMatchObject({ code: 'M2C_DELETE_INTENT_REQUIRED' });
    await expect(deleteWrappingKey({ intent: 'hack' })).rejects.toMatchObject({ code: 'M2C_DELETE_INTENT_REQUIRED' });
    expect(nativeCalls.deleteWrappingKey).toBe(0);
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Demo path: verifyBiometric2fa() resolves true (the UI shows the simulated prompt),
// and the preference round-trips through localStorage under the documented key.
vi.mock('@/api/demoClient', () => ({ DEMO: true }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

import {
  is2faBiometricEnabled, set2faBiometricEnabled, verifyBiometric2fa, TWOFACTOR_BIOMETRIC_KEY,
} from '@/lib/biometric';

beforeEach(() => { window.localStorage.clear(); });

describe('biometric 2FA preference + verifier', () => {
  it('the pref round-trips under veyrnox-2fa-biometric', () => {
    expect(is2faBiometricEnabled()).toBe(false);
    set2faBiometricEnabled(true);
    expect(window.localStorage.getItem(TWOFACTOR_BIOMETRIC_KEY)).toBe('1');
    expect(is2faBiometricEnabled()).toBe(true);
    set2faBiometricEnabled(false);
    expect(window.localStorage.getItem(TWOFACTOR_BIOMETRIC_KEY)).toBeNull();
    expect(is2faBiometricEnabled()).toBe(false);
  });

  it('verifyBiometric2fa resolves true in demo (simulated prompt)', async () => {
    await expect(verifyBiometric2fa()).resolves.toBe(true);
  });
});

describe('biometric 2FA verifier on plain web (no demo, not native)', () => {
  it('THROWS (fails closed) because the OS biometric cannot run', async () => {
    vi.resetModules();
    vi.doMock('@/api/demoClient', () => ({ DEMO: false }));
    vi.doMock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
    const mod = await import('@/lib/biometric');
    await expect(mod.verifyBiometric2fa()).rejects.toThrow();
  });
});

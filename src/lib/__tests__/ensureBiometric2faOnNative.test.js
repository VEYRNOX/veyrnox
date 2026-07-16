import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/api/demoClient', () => ({ DEMO: false }));

let mockIsNative = true;
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => mockIsNative },
}));

let mockBiometricStatus = { mode: 'native', available: true, label: 'Face ID', simulated: false };
vi.mock('@aparajita/capacitor-biometric-auth', () => ({
  BiometricAuth: {
    checkBiometry: vi.fn(async () => ({
      isAvailable: true, deviceIsSecure: true, biometryType: 1,
    })),
  },
  BiometryType: { faceId: 1, touchId: 2 },
}));

import {
  ensureBiometric2faOnNative,
  is2faBiometricEnabled,
  set2faBiometricEnabled,
  TWOFACTOR_BIOMETRIC_KEY,
} from '@/lib/biometric';

beforeEach(() => {
  window.localStorage.clear();
  mockIsNative = true;
  mockBiometricStatus = { mode: 'native', available: true, label: 'Face ID', simulated: false };
});

describe('ensureBiometric2faOnNative', () => {
  it('auto-enables biometric 2FA on a native device with biometrics available', async () => {
    expect(is2faBiometricEnabled()).toBe(false);
    await ensureBiometric2faOnNative();
    expect(is2faBiometricEnabled()).toBe(true);
  });

  it('sets the auto marker so a second call is a no-op', async () => {
    await ensureBiometric2faOnNative();
    expect(is2faBiometricEnabled()).toBe(true);

    set2faBiometricEnabled(false);
    expect(is2faBiometricEnabled()).toBe(false);

    await ensureBiometric2faOnNative();
    expect(is2faBiometricEnabled()).toBe(false);
  });

  it('does NOT auto-enable on web', async () => {
    mockIsNative = false;
    await ensureBiometric2faOnNative();
    expect(is2faBiometricEnabled()).toBe(false);
  });

  it('does NOT auto-enable when biometrics are unavailable', async () => {
    vi.resetModules();
    vi.doMock('@/api/demoClient', () => ({ DEMO: false }));
    vi.doMock('@capacitor/core', () => ({
      Capacitor: { isNativePlatform: () => true },
    }));
    vi.doMock('@aparajita/capacitor-biometric-auth', () => ({
      BiometricAuth: {
        checkBiometry: vi.fn(async () => ({
          isAvailable: false, deviceIsSecure: false, biometryType: 0,
        })),
      },
      BiometryType: { faceId: 1, touchId: 2 },
    }));
    const mod = await import('@/lib/biometric');
    await mod.ensureBiometric2faOnNative();
    expect(mod.is2faBiometricEnabled()).toBe(false);
  });

  it('never throws — a plugin failure is swallowed', async () => {
    vi.resetModules();
    vi.doMock('@/api/demoClient', () => ({ DEMO: false }));
    vi.doMock('@capacitor/core', () => ({
      Capacitor: { isNativePlatform: () => true },
    }));
    vi.doMock('@aparajita/capacitor-biometric-auth', () => ({
      BiometricAuth: {
        checkBiometry: vi.fn(async () => { throw new Error('plugin crash'); }),
      },
      BiometryType: { faceId: 1, touchId: 2 },
    }));
    const mod = await import('@/lib/biometric');
    await expect(mod.ensureBiometric2faOnNative()).resolves.toBeUndefined();
    expect(mod.is2faBiometricEnabled()).toBe(false);
  });
});

// Pins that isBiometricUnlockEnabled() reads the stored preference, even on
// native — it must NEVER hardcode `true` (Critical I4 violation: a hardcoded
// "always on" makes the unlock gate claim a control the user never enabled).
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/api/demoClient', () => ({ DEMO: false }));
// Force native platform for this whole file.
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));

import { isBiometricUnlockEnabled, BIOMETRIC_PREF_KEY } from '@/lib/biometric.js';

describe('isBiometricUnlockEnabled() on native', () => {
  beforeEach(() => { localStorage.clear(); });

  it('is FALSE when the user has not set the preference (no hardcoded true)', () => {
    expect(isBiometricUnlockEnabled()).toBe(false);
  });

  it('is TRUE only when the stored preference is set', () => {
    localStorage.setItem(BIOMETRIC_PREF_KEY, '1');
    expect(isBiometricUnlockEnabled()).toBe(true);
  });
});

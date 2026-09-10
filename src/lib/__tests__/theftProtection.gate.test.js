// Theft Protection — pure-helper gate. Asserts machine-stable `reason` codes,
// never prose copy (codes are the contract).
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' },
}));
vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));
// Keep the eager imports at the top of theftProtection.js resolvable in jsdom.
vi.mock('@/lib/biometric', () => ({ verifyBiometric2fa: vi.fn() }));
vi.mock('@/lib/biometricProbe', () => ({ getCachedBiometry: vi.fn() }));
vi.mock('@/rasp', () => ({
  getFreshRaspArtifact: vi.fn(),
  TIER: Object.freeze({ ALLOW: 'allow', WARN: 'warn-before-sign', BLOCK: 'block-signing' }),
}));

import {
  THEFT_PROTECTION_KEY,
  isTheftProtectionEnabled,
  setTheftProtectionEnabled,
  runTheftProtectionGate,
  TheftProtectionError,
  isTheftProtectionError,
} from '@/lib/theftProtection';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

const allow = () => Promise.resolve({ tier: 'allow' });
const warn = () => Promise.resolve({ tier: 'warn-before-sign' });
const block = () => Promise.resolve({ tier: 'block-signing' });

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(false);
});

describe('preference', () => {
  it('defaults to false and round-trips under veyrnox-theft-protection', () => {
    expect(isTheftProtectionEnabled()).toBe(false);
    setTheftProtectionEnabled(true);
    expect(window.localStorage.getItem(THEFT_PROTECTION_KEY)).toBe('1');
    expect(isTheftProtectionEnabled()).toBe(true);
    setTheftProtectionEnabled(false);
    expect(window.localStorage.getItem(THEFT_PROTECTION_KEY)).toBeNull();
    expect(isTheftProtectionEnabled()).toBe(false);
  });

  it('setter no-ops in deniability/demo (I3, K-2 pattern)', () => {
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(true);
    setTheftProtectionEnabled(true);
    expect(window.localStorage.getItem(THEFT_PROTECTION_KEY)).toBeNull();
    expect(isTheftProtectionEnabled()).toBe(false);
  });
});

describe('runTheftProtectionGate — disabled / decoy short-circuits', () => {
  it('no-op + no verify/rasp call when disabled', async () => {
    const verify = vi.fn();
    const raspArtifact = vi.fn();
    await expect(
      runTheftProtectionGate({ isPrimary: true, enabled: () => false, verify, raspArtifact })
    ).resolves.toBeUndefined();
    expect(verify).not.toHaveBeenCalled();
    expect(raspArtifact).not.toHaveBeenCalled();
  });

  it('no-op on decoy branch even when enabled (K-2: no prompt fires)', async () => {
    const verify = vi.fn();
    const raspArtifact = vi.fn(allow);
    await expect(
      runTheftProtectionGate({ isPrimary: false, enabled: () => true, verify, raspArtifact })
    ).resolves.toBeUndefined();
    expect(verify).not.toHaveBeenCalled();
    expect(raspArtifact).not.toHaveBeenCalled();
  });
});

describe('runTheftProtectionGate — happy paths', () => {
  it('resolves on iOS when RASP=ALLOW, face verifies, biometryType=faceId', async () => {
    await expect(runTheftProtectionGate({
      isPrimary: true,
      enabled: () => true,
      raspArtifact: allow,
      verify: async () => true,
      probe: async () => ({ biometryType: 'faceId' }),
      platform: 'ios',
    })).resolves.toBeUndefined();
  });

  it('resolves on Android with any Class-3 biometric (no face post-check)', async () => {
    await expect(runTheftProtectionGate({
      isPrimary: true,
      enabled: () => true,
      raspArtifact: allow,
      verify: async () => true,
      probe: async () => ({ biometryType: 'fingerprintAuthentication' }),
      platform: 'android',
    })).resolves.toBeUndefined();
  });
});

describe('runTheftProtectionGate — fail closed', () => {
  it('RASP=WARN → rasp-blocked, and the biometric prompt never fires', async () => {
    const verify = vi.fn(async () => true);
    await expect(runTheftProtectionGate({
      isPrimary: true, enabled: () => true, raspArtifact: warn, verify, platform: 'ios',
    })).rejects.toMatchObject({ isTheftProtectionError: true, reason: 'rasp-blocked' });
    expect(verify).not.toHaveBeenCalled();
  });

  it('RASP=BLOCK → rasp-blocked', async () => {
    await expect(runTheftProtectionGate({
      isPrimary: true, enabled: () => true, raspArtifact: block,
      verify: async () => true, platform: 'ios',
    })).rejects.toMatchObject({ reason: 'rasp-blocked' });
  });

  it('RASP fetch throws → rasp-unavailable (fail closed on fetch error)', async () => {
    await expect(runTheftProtectionGate({
      isPrimary: true, enabled: () => true,
      raspArtifact: async () => { throw new Error('probe down'); },
      verify: async () => true, platform: 'ios',
    })).rejects.toMatchObject({ reason: 'rasp-unavailable' });
  });

  it('biometric declined (throws) → declined', async () => {
    await expect(runTheftProtectionGate({
      isPrimary: true, enabled: () => true, raspArtifact: allow,
      verify: async () => { throw new Error('userCancel'); },
      platform: 'ios',
    })).rejects.toMatchObject({ reason: 'declined' });
  });

  it('biometric returns false → declined', async () => {
    await expect(runTheftProtectionGate({
      isPrimary: true, enabled: () => true, raspArtifact: allow,
      verify: async () => false, platform: 'ios',
    })).rejects.toMatchObject({ reason: 'declined' });
  });

  it('iOS with biometryType=touchId → requires-face (face-strict)', async () => {
    await expect(runTheftProtectionGate({
      isPrimary: true, enabled: () => true, raspArtifact: allow,
      verify: async () => true,
      probe: async () => ({ biometryType: 'touchId' }),
      platform: 'ios',
    })).rejects.toMatchObject({ reason: 'requires-face' });
  });

  // Plugin runtime returns the BiometryType enum as an INTEGER.
  // faceId=2, touchId=1. Pin both so an enum-value drift is caught here.
  it('iOS with numeric enum biometryType=2 (faceId) → resolves', async () => {
    await expect(runTheftProtectionGate({
      isPrimary: true, enabled: () => true, raspArtifact: allow,
      verify: async () => true,
      probe: async () => ({ biometryType: 2 }),
      platform: 'ios',
    })).resolves.toBeUndefined();
  });

  it('iOS with numeric enum biometryType=1 (touchId) → requires-face', async () => {
    await expect(runTheftProtectionGate({
      isPrimary: true, enabled: () => true, raspArtifact: allow,
      verify: async () => true,
      probe: async () => ({ biometryType: 1 }),
      platform: 'ios',
    })).rejects.toMatchObject({ reason: 'requires-face' });
  });

  it('iOS with unknown biometryType → requires-face (fail closed)', async () => {
    await expect(runTheftProtectionGate({
      isPrimary: true, enabled: () => true, raspArtifact: allow,
      verify: async () => true,
      probe: async () => ({ biometryType: undefined }),
      platform: 'ios',
    })).rejects.toMatchObject({ reason: 'requires-face' });
  });

  it('iOS probe throws → biometry-probe-failed', async () => {
    await expect(runTheftProtectionGate({
      isPrimary: true, enabled: () => true, raspArtifact: allow,
      verify: async () => true,
      probe: async () => { throw new Error('probe blew up'); },
      platform: 'ios',
    })).rejects.toMatchObject({ reason: 'biometry-probe-failed' });
  });
});

describe('TheftProtectionError shape', () => {
  it('carries the duck-typed flag and the reason code', () => {
    const e = new TheftProtectionError('declined');
    expect(isTheftProtectionError(e)).toBe(true);
    expect(e.reason).toBe('declined');
    expect(isTheftProtectionError(new Error('nope'))).toBe(false);
  });
});

// Theft Protection — enable-time capability check and the shared failure copy (#2515).
// Codes are the contract; copy is asserted only as "present for every reason".
import { describe, it, expect, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' },
}));
vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));
vi.mock('@/lib/biometric', () => ({ verifyBiometric2fa: vi.fn() }));
vi.mock('@/lib/biometricProbe', () => ({ getCachedBiometry: vi.fn() }));
vi.mock('@/rasp', () => ({
  getFreshRaspArtifact: vi.fn(),
  TIER: Object.freeze({ ALLOW: 'allow', WARN: 'warn-before-sign', BLOCK: 'block-signing' }),
}));

import {
  getTheftProtectionSupport,
  isFaceBiometry,
  runTheftProtectionGate,
  THEFT_PROTECTION_MESSAGES,
  theftProtectionMessage,
} from '@/lib/theftProtection';

const probeOf = (info) => async () => info;

describe('getTheftProtectionSupport', () => {
  it('web → not-native, without probing', async () => {
    const probe = vi.fn();
    expect(await getTheftProtectionSupport({ platform: 'web', probe }))
      .toEqual({ supported: false, reason: 'not-native' });
    expect(probe).not.toHaveBeenCalled();
  });

  it('defaults to the Capacitor platform (web in this suite)', async () => {
    expect((await getTheftProtectionSupport({ probe: vi.fn() })).reason).toBe('not-native');
  });

  it('no available biometric → no-biometric (null probe, isAvailable false, probe throws)', async () => {
    for (const probe of [
      probeOf(null),
      probeOf({ isAvailable: false, biometryType: 2 }),
      async () => { throw new Error('bridge'); },
    ]) {
      expect(await getTheftProtectionSupport({ platform: 'ios', probe }))
        .toEqual({ supported: false, reason: 'no-biometric' });
    }
  });

  it('iOS Touch ID → requires-face', async () => {
    expect(await getTheftProtectionSupport({ platform: 'ios', probe: probeOf({ isAvailable: true, biometryType: 1 }) }))
      .toEqual({ supported: false, reason: 'requires-face' });
  });

  it('iOS Face ID available → supported', async () => {
    expect(await getTheftProtectionSupport({ platform: 'ios', probe: probeOf({ isAvailable: true, biometryType: 2 }) }))
      .toEqual({ supported: true, reason: null });
  });

  it('Android any available biometric → supported (no face-only API)', async () => {
    expect(await getTheftProtectionSupport({ platform: 'android', probe: probeOf({ isAvailable: true, biometryType: 3 }) }))
      .toEqual({ supported: true, reason: null });
  });
});

describe('isFaceBiometry', () => {
  it('accepts the enum integer and the string label only', () => {
    expect(isFaceBiometry(2)).toBe(true);
    expect(isFaceBiometry('faceId')).toBe(true);
    for (const t of [0, 1, 3, 4, 5, 'touchId', null, undefined]) expect(isFaceBiometry(t)).toBe(false);
  });
});

describe('THEFT_PROTECTION_MESSAGES covers every reason the gate can throw', () => {
  const allow = async () => ({ tier: 'allow' });
  const cases = [
    { raspArtifact: async () => { throw new Error('x'); } },
    { raspArtifact: async () => ({ tier: 'warn-before-sign' }) },
    { raspArtifact: allow, verify: async () => false },
    { raspArtifact: allow, verify: async () => true, platform: 'ios', probe: probeOf({ biometryType: 1 }) },
    { raspArtifact: allow, verify: async () => true, platform: 'ios', probe: async () => { throw new Error('x'); } },
  ];

  it('each produced reason has its own message, and none reads as a wrong PIN', async () => {
    const reasons = new Set();
    for (const c of cases) {
      const err = await runTheftProtectionGate({ isPrimary: true, enabled: () => true, ...c }).catch((e) => e);
      reasons.add(err.reason);
      expect(Object.hasOwn(THEFT_PROTECTION_MESSAGES, err.reason)).toBe(true);
      expect(theftProtectionMessage(err)).toBe(THEFT_PROTECTION_MESSAGES[err.reason]);
      expect(theftProtectionMessage(err)).not.toMatch(/incorrect pin/i);
    }
    expect(reasons.size).toBe(cases.length);
  });

  it('unknown reason falls back to the generic message', () => {
    expect(theftProtectionMessage({ reason: 'nope' })).toBe(THEFT_PROTECTION_MESSAGES.error);
    expect(theftProtectionMessage(null)).toBe(THEFT_PROTECTION_MESSAGES.error);
  });
});

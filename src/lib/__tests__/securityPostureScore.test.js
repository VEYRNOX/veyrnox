// lib/__tests__/securityPostureScore.test.js
//
// Strict TDD tests for the Security Posture scoring logic (spec SS9.0.1a).
// Tests pin structure/codes, NOT prose copy. Written BEFORE the implementation.

import { describe, it, expect } from 'vitest';
import {
  computePostureScore,
  getPostureColor,
  getPostureLabel,
  getBannerMessage,
} from '../securityPosture';

// ---------------------------------------------------------------------------
// Helpers — reusable state builders
// ---------------------------------------------------------------------------

/** Minimal post-onboard state: PIN created, everything else off. */
function bareState(overrides = {}) {
  return {
    pinCreated: false,
    pinLength: null,
    biometricEnabled: false,
    raspTier: 'BLOCK',
    kekActive: false,
    hardwareTier: null,
    recoveryPassphraseSet: false,
    shareAWrapped: false,
    shareBUploaded: false,
    shareCExported: false,
    shareCVerified: false,
    wcSpendLimitSet: false,
    wcSessionExpiry: false,
    wcStepUpReauth: false,
    ...overrides,
  };
}

/** Typical post-onboard: PIN + biometric + RASP clean + KEK + TEE. */
function typicalState(overrides = {}) {
  return bareState({
    pinCreated: true,
    pinLength: 8,
    biometricEnabled: true,
    raspTier: 'ALLOW',
    kekActive: true,
    hardwareTier: 'TEE',
    ...overrides,
  });
}

/** Full-score state: every live check passes, StrongBox tier. */
function fullState(overrides = {}) {
  return bareState({
    pinCreated: true,
    pinLength: 14,
    biometricEnabled: true,
    raspTier: 'ALLOW',
    kekActive: true,
    hardwareTier: 'STRONGBOX',
    recoveryPassphraseSet: true,
    shareAWrapped: true,
    shareBUploaded: true,
    shareCExported: true,
    shareCVerified: true,
    wcSpendLimitSet: true,
    wcSessionExpiry: true,
    wcStepUpReauth: true,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// 1. Post-onboard typical: PIN(10) + PIN meets min(5) + bio(5) + RASP(25) + KEK(5) + TEE(3) = 53
// ---------------------------------------------------------------------------
describe('computePostureScore', () => {
  it('scores a typical post-onboard state correctly', () => {
    const state = typicalState();
    const result = computePostureScore(state);

    // Authentication: PIN created(10) + PIN>=8(5) + biometric(5) = 20
    expect(result.dimensions.authentication.score).toBe(20);
    expect(result.dimensions.authentication.max).toBe(20);

    // Device integrity: ALLOW = 25
    expect(result.dimensions.deviceIntegrity.score).toBe(25);
    expect(result.dimensions.deviceIntegrity.max).toBe(25);

    // Hardware: KEK(5) + TEE(3) = 8
    expect(result.dimensions.hardwareBinding.score).toBe(8);
    expect(result.dimensions.hardwareBinding.max).toBe(10);

    // Recovery: all off = 0
    expect(result.dimensions.recovery.score).toBe(0);
    expect(result.dimensions.recovery.max).toBe(30);

    // Session: all off = 0
    expect(result.dimensions.sessionSecurity.score).toBe(0);
    expect(result.dimensions.sessionSecurity.max).toBe(10);

    // Total: 20 + 25 + 8 + 0 + 0 = 53
    expect(result.total).toBe(53);
    expect(result.percentage).toBe(53);
    expect(result.color).toBe('#E8A838');  // Amber
    expect(result.label).toBe('Fair');
  });

  // -------------------------------------------------------------------------
  // 2. Full score: all live checks pass with StrongBox = 95
  // -------------------------------------------------------------------------
  it('scores a full-security state as 100/100 Complete Green', () => {
    const result = computePostureScore(fullState());

    expect(result.total).toBe(100);
    expect(result.percentage).toBe(100);
    expect(result.color).toBe('#4ADAC2');  // 86+ = Green
    expect(result.label).toBe('Complete'); // 86+ = Complete

    // Verify each dimension
    expect(result.dimensions.authentication.score).toBe(20);
    expect(result.dimensions.deviceIntegrity.score).toBe(25);
    expect(result.dimensions.hardwareBinding.score).toBe(10);
    expect(result.dimensions.recovery.score).toBe(30);
    expect(result.dimensions.sessionSecurity.score).toBe(10);
  });

  // -------------------------------------------------------------------------
  // 3. TEE caps hardware at 8/10 (not 10/10)
  // -------------------------------------------------------------------------
  it('TEE gives 3 pts (not 5), capping hardware at 8/10', () => {
    const result = computePostureScore(fullState({ hardwareTier: 'TEE' }));

    expect(result.dimensions.hardwareBinding.score).toBe(8);
    // Total drops by 2 from the full 100 (StrongBox 5 -> TEE 3)
    expect(result.total).toBe(98);
  });

  // -------------------------------------------------------------------------
  // 3b. SecureEnclave gives 5 pts like StrongBox
  // -------------------------------------------------------------------------
  it('SECURE_ENCLAVE gives 5 pts same as StrongBox', () => {
    const result = computePostureScore(fullState({ hardwareTier: 'SECURE_ENCLAVE' }));
    expect(result.dimensions.hardwareBinding.score).toBe(10);
    expect(result.total).toBe(100);
  });

  // -------------------------------------------------------------------------
  // 4. RASP BLOCK = 0/25 device integrity
  // -------------------------------------------------------------------------
  it('RASP BLOCK scores 0/25 on device integrity', () => {
    const result = computePostureScore(typicalState({ raspTier: 'BLOCK' }));
    expect(result.dimensions.deviceIntegrity.score).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 5. RASP WARN = 10/25 device integrity
  // -------------------------------------------------------------------------
  it('RASP WARN scores 10/25 on device integrity', () => {
    const result = computePostureScore(typicalState({ raspTier: 'WARN' }));
    expect(result.dimensions.deviceIntegrity.score).toBe(10);
  });

  // -------------------------------------------------------------------------
  // 6. All dimensions at zero: 0%, Critical, Red
  // -------------------------------------------------------------------------
  it('scores 0% Critical Red when all checks fail', () => {
    const result = computePostureScore(bareState());

    expect(result.total).toBe(0);
    expect(result.percentage).toBe(0);
    expect(result.color).toBe('#E85A5A');
    expect(result.label).toBe('Critical');

    // Every dimension at 0
    expect(result.dimensions.authentication.score).toBe(0);
    expect(result.dimensions.deviceIntegrity.score).toBe(0);
    expect(result.dimensions.hardwareBinding.score).toBe(0);
    expect(result.dimensions.recovery.score).toBe(0);
    expect(result.dimensions.sessionSecurity.score).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 7. Recovery dimension scoring: each item independently
  // -------------------------------------------------------------------------
  it('scores recovery items with dependency gating', () => {
    // Only passphrase: 8
    const r1 = computePostureScore(bareState({ recoveryPassphraseSet: true }));
    expect(r1.dimensions.recovery.score).toBe(8);

    // Share flags WITHOUT recoveryPassphraseSet earn nothing (dependency gate)
    const r2 = computePostureScore(bareState({ shareAWrapped: true }));
    expect(r2.dimensions.recovery.score).toBe(0);

    const r3 = computePostureScore(bareState({ shareBUploaded: true }));
    expect(r3.dimensions.recovery.score).toBe(0);

    const r4 = computePostureScore(bareState({ shareCExported: true }));
    expect(r4.dimensions.recovery.score).toBe(0);

    // shareCVerified without shareCExported earns nothing
    const r5 = computePostureScore(bareState({ recoveryPassphraseSet: true, shareCVerified: true }));
    expect(r5.dimensions.recovery.score).toBe(8); // only passphrase

    // All together: 8+2+8+6+6 = 30
    const r6 = computePostureScore(bareState({
      recoveryPassphraseSet: true,
      shareAWrapped: true,
      shareBUploaded: true,
      shareCExported: true,
      shareCVerified: true,
    }));
    expect(r6.dimensions.recovery.score).toBe(30);
  });

  // -------------------------------------------------------------------------
  // 8. Banner message picks lowest dimension
  // -------------------------------------------------------------------------
  it('lowestDimension picks the dimension with the lowest percentage score', () => {
    // Typical state has recovery=0/30 and session=0/10 both at 0%.
    // When tied, either is acceptable but it must be one of them.
    const result = computePostureScore(typicalState());
    expect(['recovery', 'sessionSecurity']).toContain(result.lowestDimension);
    expect(typeof result.bannerMessage).toBe('string');
    expect(result.bannerMessage.length).toBeGreaterThan(0);
  });

  it('lowestDimension is deviceIntegrity when RASP is BLOCK and others are maxed', () => {
    const result = computePostureScore(fullState({ raspTier: 'BLOCK' }));
    expect(result.lowestDimension).toBe('deviceIntegrity');
  });

  // -------------------------------------------------------------------------
  // 10. Handles null pinLength gracefully
  // -------------------------------------------------------------------------
  it('null pinLength gives 0 pts for the minimum-length check, not an error', () => {
    const result = computePostureScore(typicalState({ pinLength: null }));
    // PIN created(10) + PIN length null(0) + biometric(5) = 15
    expect(result.dimensions.authentication.score).toBe(15);
  });

  it('pinLength >= 8 gives full 5 pts', () => {
    const result = computePostureScore(typicalState({ pinLength: 8 }));
    // PIN created(10) + PIN>=8(5) + biometric(5) = 20
    expect(result.dimensions.authentication.score).toBe(20);
  });

  // -------------------------------------------------------------------------
  // 11. lowestDimension returns correct key
  // -------------------------------------------------------------------------
  it('lowestDimension returns the key as a string matching a dimensions key', () => {
    const result = computePostureScore(fullState());
    // All at 100% -- any dimension is valid when all tied at max
    const validKeys = ['authentication', 'deviceIntegrity', 'hardwareBinding', 'recovery', 'sessionSecurity'];
    expect(validKeys).toContain(result.lowestDimension);
  });

  // -------------------------------------------------------------------------
  // Dimension items arrays exist
  // -------------------------------------------------------------------------
  it('each dimension has an items array', () => {
    const result = computePostureScore(fullState());
    for (const key of Object.keys(result.dimensions)) {
      expect(Array.isArray(result.dimensions[key].items)).toBe(true);
      expect(result.dimensions[key].items.length).toBeGreaterThan(0);
    }
  });

  // -------------------------------------------------------------------------
  // KEK inactive with null hardwareTier scores 0/15
  // -------------------------------------------------------------------------
  it('no KEK and null hardwareTier scores 0/15 hardware', () => {
    const result = computePostureScore(bareState());
    expect(result.dimensions.hardwareBinding.score).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Session security items score independently
  // -------------------------------------------------------------------------
  it('session security items score independently', () => {
    const r1 = computePostureScore(bareState({ wcSpendLimitSet: true }));
    expect(r1.dimensions.sessionSecurity.score).toBe(3);

    const r2 = computePostureScore(bareState({ wcSessionExpiry: true }));
    expect(r2.dimensions.sessionSecurity.score).toBe(3);

    const r3 = computePostureScore(bareState({ wcStepUpReauth: true }));
    expect(r3.dimensions.sessionSecurity.score).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 9. Color thresholds at boundaries
// ---------------------------------------------------------------------------
describe('getPostureColor', () => {
  it('returns Red for 0-30', () => {
    expect(getPostureColor(0)).toBe('#E85A5A');
    expect(getPostureColor(15)).toBe('#E85A5A');
    expect(getPostureColor(30)).toBe('#E85A5A');
  });

  it('returns Amber at 31', () => {
    expect(getPostureColor(31)).toBe('#E8A838');
  });

  it('returns Amber for 31-50', () => {
    expect(getPostureColor(50)).toBe('#E8A838');
  });

  it('returns Yellow at 51', () => {
    expect(getPostureColor(51)).toBe('#D4C44A');
  });

  it('returns Yellow for 51-70', () => {
    expect(getPostureColor(70)).toBe('#D4C44A');
  });

  it('returns Yellow-green at 71', () => {
    expect(getPostureColor(71)).toBe('#B8D44A');
  });

  it('returns Yellow-green for 71-85', () => {
    expect(getPostureColor(85)).toBe('#B8D44A');
  });

  it('returns Green at 86', () => {
    expect(getPostureColor(86)).toBe('#4ADAC2');
  });

  it('returns Green for 86-100', () => {
    expect(getPostureColor(100)).toBe('#4ADAC2');
  });
});

describe('getPostureLabel', () => {
  it('returns correct labels at each threshold', () => {
    expect(getPostureLabel(0)).toBe('Critical');
    expect(getPostureLabel(30)).toBe('Critical');
    expect(getPostureLabel(31)).toBe('Weak');
    expect(getPostureLabel(50)).toBe('Weak');
    expect(getPostureLabel(51)).toBe('Fair');
    expect(getPostureLabel(70)).toBe('Fair');
    expect(getPostureLabel(71)).toBe('Strong');
    expect(getPostureLabel(85)).toBe('Strong');
    expect(getPostureLabel(86)).toBe('Complete');
    expect(getPostureLabel(100)).toBe('Complete');
  });
});

describe('getBannerMessage', () => {
  it('returns RASP message when deviceIntegrity is 0/25', () => {
    const dims = {
      authentication: { score: 20, max: 20 },
      deviceIntegrity: { score: 0, max: 25 },
      hardwareBinding: { score: 10, max: 15 },
      recovery: { score: 30, max: 30 },
      sessionSecurity: { score: 10, max: 10 },
    };
    const msg = getBannerMessage(dims);
    expect(msg).toContain('integrity');
  });

  it('returns auth message when authentication is lowest', () => {
    const dims = {
      authentication: { score: 10, max: 20 },
      deviceIntegrity: { score: 25, max: 25 },
      hardwareBinding: { score: 10, max: 15 },
      recovery: { score: 30, max: 30 },
      sessionSecurity: { score: 10, max: 10 },
    };
    const msg = getBannerMessage(dims);
    expect(msg.length).toBeGreaterThan(0);
  });

  it('returns recovery message when recovery is 0/30', () => {
    const dims = {
      authentication: { score: 20, max: 20 },
      deviceIntegrity: { score: 25, max: 25 },
      hardwareBinding: { score: 10, max: 15 },
      recovery: { score: 0, max: 30 },
      sessionSecurity: { score: 10, max: 10 },
    };
    const msg = getBannerMessage(dims);
    expect(msg).toContain('recovery');
  });

  it('returns session message when session is lowest', () => {
    const dims = {
      authentication: { score: 20, max: 20 },
      deviceIntegrity: { score: 25, max: 25 },
      hardwareBinding: { score: 10, max: 15 },
      recovery: { score: 30, max: 30 },
      sessionSecurity: { score: 0, max: 10 },
    };
    const msg = getBannerMessage(dims);
    expect(msg).toContain('session');
  });

  it('returns hardware message when hardware is lowest', () => {
    const dims = {
      authentication: { score: 20, max: 20 },
      deviceIntegrity: { score: 25, max: 25 },
      hardwareBinding: { score: 0, max: 15 },
      recovery: { score: 30, max: 30 },
      sessionSecurity: { score: 10, max: 10 },
    };
    const msg = getBannerMessage(dims);
    expect(msg).toContain('ardware');
  });
});

// src/wallet-core/keystore/__tests__/hardware.enroll-tier-gating.test.js
//
// AUDIT M2 (MEDIUM) — the Android Keystore security tier was measured then DISCARDED.
//
// ROOT CAUSE: enrollHardwareCredential() called plugin.enroll() and threw away its
// { securityLevel, securityLevelName } result. A key that lands in
// SECURITY_LEVEL_SOFTWARE (securityLevelName 'SOFTWARE', tier 0) enrolled EXACTLY like
// StrongBox/TEE and showed the same "Hardware Protection ON" badge — with NO hardware
// binding, defeating the offline-seizure protection the feature exists for.
//
// FIX (fail-closed, I4): enrollHardwareCredential() consumes the tier and REFUSES
// enrollment (throws a machine-coded error) when the tier is SOFTWARE / UNKNOWN /
// NO_KEY / probe-error / missing. It ACCEPTS real secure-hardware tiers — TEE
// (TRUSTED_ENVIRONMENT), StrongBox, pre-31 secure hardware, and iOS SecureEnclave.
// TEE is NOT refused (it meets the at-rest threat model); StrongBox enforcement stays
// TARGET. It also RETURNS the tier so the caller can surface it.
//
// The native plugin is mocked (established JS-orchestration-only pattern). This is NOT
// native proof; it pins the JS gate contract.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @capacitor/core so getPlugin() resolves our fake plugin on a "native" platform.
const enrollFn = vi.fn(async () => ({ securityLevel: 2, securityLevelName: 'STRONGBOX' }));
const pluginMock = {
  enroll: enrollFn,
  isEnrolled: vi.fn(async () => ({ enrolled: false })),
  getHardwareFactor: vi.fn(async () => ({ h: btoa('x'.repeat(32)) })),
  clearCredential: vi.fn(async () => {}),
};
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
  registerPlugin: () => pluginMock,
}));

const {
  enrollHardwareCredential,
  ENROLL_ERR,
} = await import('../hardware.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('M2 — enrollHardwareCredential refuses non-secure tiers (fail-closed)', () => {
  it('exports a machine-coded error for insecure-tier refusal', () => {
    expect(typeof ENROLL_ERR).toBe('object');
    expect(ENROLL_ERR.INSECURE_TIER).toBe('KEK_ENROLL_INSECURE_TIER');
  });

  it('REFUSES a SOFTWARE-tier key (securityLevel 0) — throws INSECURE_TIER', async () => {
    enrollFn.mockResolvedValueOnce({ securityLevel: 0, securityLevelName: 'SOFTWARE' });
    await expect(enrollHardwareCredential()).rejects.toThrow(ENROLL_ERR.INSECURE_TIER);
  });

  it('REFUSES an UNKNOWN tier — throws INSECURE_TIER', async () => {
    enrollFn.mockResolvedValueOnce({ securityLevel: -2, securityLevelName: 'UNKNOWN' });
    await expect(enrollHardwareCredential()).rejects.toThrow(ENROLL_ERR.INSECURE_TIER);
  });

  it('REFUSES a probe-error result — throws INSECURE_TIER (do not trust an unreadable tier)', async () => {
    enrollFn.mockResolvedValueOnce({ securityLevel: -98, securityLevelName: 'PROBE_ERROR: boom' });
    await expect(enrollHardwareCredential()).rejects.toThrow(ENROLL_ERR.INSECURE_TIER);
  });

  it('REFUSES a NO_KEY result — throws INSECURE_TIER', async () => {
    enrollFn.mockResolvedValueOnce({ securityLevel: -99, securityLevelName: 'NO_KEY' });
    await expect(enrollHardwareCredential()).rejects.toThrow(ENROLL_ERR.INSECURE_TIER);
  });

  it('REFUSES a missing/undefined tier result — throws INSECURE_TIER (fail-closed on absent evidence)', async () => {
    enrollFn.mockResolvedValueOnce(undefined);
    await expect(enrollHardwareCredential()).rejects.toThrow(ENROLL_ERR.INSECURE_TIER);
  });
});

describe('M2 — enrollHardwareCredential ACCEPTS real secure-hardware tiers', () => {
  it('ACCEPTS StrongBox (tier 2) and RETURNS the tier', async () => {
    enrollFn.mockResolvedValueOnce({ securityLevel: 2, securityLevelName: 'STRONGBOX' });
    const tier = await enrollHardwareCredential();
    expect(tier.securityLevelName).toBe('STRONGBOX');
  });

  it('ACCEPTS TEE / TRUSTED_ENVIRONMENT (tier 1) — must NOT be refused', async () => {
    enrollFn.mockResolvedValueOnce({ securityLevel: 1, securityLevelName: 'TRUSTED_ENVIRONMENT' });
    const tier = await enrollHardwareCredential();
    expect(tier.securityLevelName).toBe('TRUSTED_ENVIRONMENT');
  });

  it('ACCEPTS pre-31 secure hardware (SECURE_HARDWARE_PRE31)', async () => {
    enrollFn.mockResolvedValueOnce({ securityLevel: 1, securityLevelName: 'SECURE_HARDWARE_PRE31' });
    const tier = await enrollHardwareCredential();
    expect(tier.securityLevelName).toBe('SECURE_HARDWARE_PRE31');
  });

  it('ACCEPTS iOS SecureEnclave (keyTier shape from the iOS plugin)', async () => {
    enrollFn.mockResolvedValueOnce({ keyTier: 'SecureEnclave' });
    const tier = await enrollHardwareCredential();
    // Normalized name surfaced for the caller.
    expect(tier.securityLevelName).toBe('SecureEnclave');
  });
});

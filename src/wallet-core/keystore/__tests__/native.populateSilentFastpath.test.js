// src/wallet-core/keystore/__tests__/native.populateSilentFastpath.test.js
//
// Issue #2019 (owner Tier 2, 2026-08-28) — populateFastpathBestEffort now
// stores the RAW DEK (as base64) directly under the biometric-gated Keystore
// alias. No HKDF-of-H layer, no aparajita hop. The Keystore-cipher-bound
// alias IS the crypto layer.
//
// This file pins:
//   1. putFastpathDek receives exactly `base64(dek)` — 32 bytes decoded.
//   2. No JSON envelope (no v/iv/ct fields — that was the removed layer).
//   3. All existing gates (deniability, disabled, disclosure, passkey,
//      duress-configured, RASP<ALLOW) still short-circuit populate.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const VAULT_KEY = 'vault_v1';
const store = new Map();
const setVault = (v) => { if (v == null) store.delete(VAULT_KEY); else store.set(VAULT_KEY, v); };

const secureStoreMock = {
  setKeyPrefix: vi.fn(async () => {}),
  setSynchronize: vi.fn(async () => {}),
  setDefaultKeychainAccess: vi.fn(async () => {}),
  get: vi.fn(async (k) => (store.has(k) ? store.get(k) : null)),
  set: vi.fn(async (k, v) => { store.set(k, v); }),
  remove: vi.fn(async (k) => { const had = store.has(k); store.delete(k); return had; }),
};
vi.mock('@aparajita/capacitor-secure-storage', () => ({
  SecureStorage: secureStoreMock,
  KeychainAccess: { whenPasscodeSetThisDeviceOnly: 'x', whenUnlockedThisDeviceOnly: 'y' },
}));
vi.mock('@aparajita/capacitor-biometric-auth', () => ({
  BiometricAuth: { checkBiometry: vi.fn(async () => ({ isAvailable: true, deviceIsSecure: true })), authenticate: vi.fn(async () => {}) },
}));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn() } }));

vi.mock('../../vault.js', () => ({
  encryptVault: vi.fn(async () => ({ v: 1, kdf: 'argon2id', salt: 's', iv: 'i', ct: 'c' })),
  decryptVault: vi.fn(async () => 'seed'),
  deriveKekC: vi.fn(async () => new Uint8Array(32).fill(7)),
  encryptVaultWithDek: vi.fn(async () => ({ iv: 'newiv', ct: 'newct' })),
  decryptVaultWithDek: vi.fn(async () => 'seed'),
  encryptVaultWithDekV3: vi.fn(async () => ({ v: 3, kdf: 'kek-dek', iv: 'v3iv', ct: 'v3ct' })),
  VAULT_VERSION_V3: 3,
  AAD_V3_MIGRATION_ENABLED: false,
}));

const FIXED_DEK = new Uint8Array(32).fill(4);
vi.mock('../kek.js', () => ({
  combineKek: vi.fn(async () => new Uint8Array(32).fill(9)),
  randomDek: vi.fn(() => new Uint8Array(FIXED_DEK)),
  wrapDek: vi.fn(async () => ({ v: 2, iv: 'wrap-iv', ct: 'wrap-ct' })),
  unwrapDek: vi.fn(async () => new Uint8Array(FIXED_DEK)),
  KEK_ERR: { NO_HARDWARE_FACTOR: 'NO_HARDWARE_FACTOR', UNWRAP_FAILED: 'UNWRAP_FAILED', MALFORMED_VAULT: 'KEK_MALFORMED_VAULT', NOT_ENROLLED: 'KEK_NOT_ENROLLED' },
  decodeKekSalt: vi.fn(() => new Uint8Array(32).fill(1)),
  parseVaultBlob: vi.fn((raw) => (typeof raw === 'string' ? JSON.parse(raw) : raw)),
}));
vi.mock('../hardware.js', () => ({
  clearHardwareCredential: vi.fn(async () => {}),
  getHardwareFactor: vi.fn(async () => new Uint8Array(32).fill(2)),
}));

const putFastpathDek = vi.fn(async () => {});
const getFastpathDek = vi.fn(async () => null);
const clearFastpathDek = vi.fn(async () => {});
vi.mock('@/plugins/androidBiometricCache', () => ({
  putFastpathDek, getFastpathDek, clearFastpathDek,
}));

const isFastpathEnabledMock = vi.fn(() => true);
const hasSeenFastpathDisclosureMock = vi.fn(() => true);
vi.mock('@/lib/fastpathUnlock.js', () => ({
  isFastpathEnabled: () => isFastpathEnabledMock(),
  hasSeenFastpathDisclosure: () => hasSeenFastpathDisclosureMock(),
  FASTPATH_ENABLED_STORAGE_KEY: 'veyrnox-fastpath-enabled',
  FASTPATH_DISCLOSURE_SEEN_KEY: 'veyrnox-fastpath-disclosure-seen',
}));
const isDeniabilityOrDemoActiveMock = vi.fn(() => false);
vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  isDeniabilityOrDemoActive: () => isDeniabilityOrDemoActiveMock(),
}));
const isPasskeyRegisteredMock = vi.fn(() => false);
vi.mock('@/lib/passkey.js', () => ({
  isPasskeyRegistered: () => isPasskeyRegisteredMock(),
}));
const raspTierMock = vi.fn(async () => ({ tier: 'allow' }));
vi.mock('@/rasp/getFreshRaspArtifact.js', () => ({
  getFreshRaspArtifact: () => raspTierMock(),
  FRESH_PROBE_TIMEOUT_MS: 1500,
}));
vi.mock('@/rasp/conditions.js', () => ({
  TIER: Object.freeze({ ALLOW: 'allow', WARN: 'warn-before-sign', BLOCK: 'block-signing' }),
}));

const enrolledBlob = () => JSON.stringify({
  v: 1, kdf: 'kek-dek', iv: 'ct-iv', ct: 'ct-ct',
  kekWrap: { v: 2, iv: 'wrap-iv', ct: 'wrap-ct' },
  kekSalt: Buffer.from(new Uint8Array(32).fill(1)).toString('base64'),
  hardwareKekVersion: 3,
});

const getHF = async () => new Uint8Array(32).fill(2);

let keyStore;

beforeEach(async () => {
  vi.resetModules();
  store.clear();
  try { localStorage.clear(); } catch { /* shimmed */ }
  putFastpathDek.mockClear();
  getFastpathDek.mockClear();
  clearFastpathDek.mockClear();
  isFastpathEnabledMock.mockReturnValue(true);
  hasSeenFastpathDisclosureMock.mockReturnValue(true);
  isDeniabilityOrDemoActiveMock.mockReturnValue(false);
  isPasskeyRegisteredMock.mockReturnValue(false);
  raspTierMock.mockResolvedValue({ tier: 'allow' });
  ({ nativeKeyStore: keyStore } = await import('../native.js'));
});

describe('populateFastpathBestEffort — silent scheme', () => {
  it('writes exactly base64(DEK) — 32 raw bytes, no JSON envelope', async () => {
    setVault(enrolledBlob());
    await keyStore.unlock('87654321', { getHardwareFactor: getHF });
    expect(putFastpathDek).toHaveBeenCalledTimes(1);
    const payload = putFastpathDek.mock.calls[0][0];
    expect(typeof payload).toBe('string');

    // Must not be a JSON envelope with v/iv/ct — that was the removed HKDF
    // layer. A leading '{' would mean populate is still wrapping.
    expect(payload.startsWith('{')).toBe(false);

    // Round-trip: the payload decodes to the exact 32-byte DEK the mocks
    // provided (FIXED_DEK filled with 4).
    const decoded = Buffer.from(payload, 'base64');
    expect(decoded.length).toBe(32);
    expect(Array.from(decoded)).toEqual(Array.from(FIXED_DEK));
  });

  it('gate: does NOT populate in deniability/demo (I3)', async () => {
    isDeniabilityOrDemoActiveMock.mockReturnValue(true);
    setVault(enrolledBlob());
    await keyStore.unlock('87654321', { getHardwareFactor: getHF });
    expect(putFastpathDek).not.toHaveBeenCalled();
  });

  it('gate: does NOT populate when a duress PIN is configured (H-1 write-side gate)', async () => {
    try { localStorage.setItem('veyrnox-duress-configured', '1'); } catch { /* shimmed */ }
    try {
      setVault(enrolledBlob());
      await keyStore.unlock('87654321', { getHardwareFactor: getHF });
      expect(putFastpathDek).not.toHaveBeenCalled();
    } finally {
      try { localStorage.removeItem('veyrnox-duress-configured'); } catch { /* shimmed */ }
    }
  });

  it('gate: does NOT populate when opt-in OFF', async () => {
    isFastpathEnabledMock.mockReturnValue(false);
    setVault(enrolledBlob());
    await keyStore.unlock('87654321', { getHardwareFactor: getHF });
    expect(putFastpathDek).not.toHaveBeenCalled();
  });

  it('gate: does NOT populate when disclosure not seen', async () => {
    hasSeenFastpathDisclosureMock.mockReturnValue(false);
    setVault(enrolledBlob());
    await keyStore.unlock('87654321', { getHardwareFactor: getHF });
    expect(putFastpathDek).not.toHaveBeenCalled();
  });

  it('gate: does NOT populate when a passkey is registered', async () => {
    isPasskeyRegisteredMock.mockReturnValue(true);
    setVault(enrolledBlob());
    await keyStore.unlock('87654321', { getHardwareFactor: getHF });
    expect(putFastpathDek).not.toHaveBeenCalled();
  });

  it('gate: does NOT populate when RASP tier < ALLOW', async () => {
    raspTierMock.mockResolvedValue({ tier: 'warn-before-sign' });
    setVault(enrolledBlob());
    await keyStore.unlock('87654321', { getHardwareFactor: getHF });
    expect(putFastpathDek).not.toHaveBeenCalled();
  });

  it('populate failure never fails the unlock (best-effort, I4)', async () => {
    putFastpathDek.mockRejectedValueOnce(new Error('bridge boom'));
    setVault(enrolledBlob());
    await expect(keyStore.unlock('87654321', { getHardwareFactor: getHF })).resolves.toBe('seed');
  });
});

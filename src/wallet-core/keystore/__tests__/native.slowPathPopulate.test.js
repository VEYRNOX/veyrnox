// src/wallet-core/keystore/__tests__/native.slowPathPopulate.test.js
//
// Issue #2019 (owner Option 1) — the slow-path unlock MUST populate the
// fast-path DEK alias so the biometric-only branch can succeed on subsequent
// unlocks. This test pins the gating (opt-in ON + not-deniability + RASP
// ALLOW) and pins the invariant that populate NEVER fails an unlock.
//
// Mock discipline mirrors native.fastpathClearHooks.test.js.

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

const FIXED_KEK = new Uint8Array(32).fill(9);
const FIXED_DEK = new Uint8Array(32).fill(4);
vi.mock('../kek.js', () => ({
  combineKek: vi.fn(async () => new Uint8Array(FIXED_KEK)),
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

// Gate mocks — control isFastpathEnabled / hasSeenFastpathDisclosure /
// isDeniabilityOrDemoActive per test. Under the default-ON reversal, populate
// must be gated on BOTH the tri-state enabled read AND the disclosure marker
// — a fresh install returns enabled=true from the default flip, but the
// informed-consent chokepoint must suppress warming until the first-run card
// has been acknowledged.
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

describe('slow-path fast-path populate (issue #2019 Option 1)', () => {
  it('populates the fast-path alias after a successful KEK unlock when enabled + ALLOW', async () => {
    setVault(enrolledBlob());
    await keyStore.unlock('87654321', { getHardwareFactor: getHF });
    expect(putFastpathDek).toHaveBeenCalledTimes(1);
    // The payload must be a JSON-encoded fastpath v1 wrap blob, NOT the
    // primary wrap constants (proves it went through wrapForFastpath with
    // its own AAD, not through wrapDek).
    const arg = putFastpathDek.mock.calls[0][0];
    const blob = JSON.parse(arg);
    expect(blob.v).toBe(1);
    expect(typeof blob.iv).toBe('string');
    expect(typeof blob.ct).toBe('string');
    expect(blob.iv).not.toBe('wrap-iv');
    expect(blob.ct).not.toBe('wrap-ct');
  });

  it('does NOT populate when opt-in is OFF', async () => {
    isFastpathEnabledMock.mockReturnValue(false);
    setVault(enrolledBlob());
    await keyStore.unlock('87654321', { getHardwareFactor: getHF });
    expect(putFastpathDek).not.toHaveBeenCalled();
  });

  it('does NOT populate when the first-run disclosure has not been seen (informed-consent chokepoint)', async () => {
    // Default-ON reversal: isFastpathEnabled() defaults true on a fresh
    // install, so the disclosure marker is the ONLY thing preventing a
    // silent posture downgrade. Populate must skip until the user has seen
    // the card and made a choice.
    isFastpathEnabledMock.mockReturnValue(true);
    hasSeenFastpathDisclosureMock.mockReturnValue(false);
    setVault(enrolledBlob());
    await keyStore.unlock('87654321', { getHardwareFactor: getHF });
    expect(putFastpathDek).not.toHaveBeenCalled();
  });

  it('does NOT populate in a deniability/demo session (I3)', async () => {
    isDeniabilityOrDemoActiveMock.mockReturnValue(true);
    setVault(enrolledBlob());
    await keyStore.unlock('87654321', { getHardwareFactor: getHF });
    expect(putFastpathDek).not.toHaveBeenCalled();
  });

  it('does NOT populate when a passkey is registered (Finding 2 — owner ruling: passkey wins)', async () => {
    // Owner ruling on PR #2051 F2: users with a passkey enrolled see NEITHER
    // the button NOR the toggle. Populate must respect the same rule so a
    // "enable fast-path → enrol passkey → unenrol passkey" sequence cannot
    // silently resurrect a warm cache. Fast-path only warms when passkey is
    // NOT enrolled at the moment of the successful primary-PIN unlock.
    isPasskeyRegisteredMock.mockReturnValue(true);
    setVault(enrolledBlob());
    await keyStore.unlock('87654321', { getHardwareFactor: getHF });
    expect(putFastpathDek).not.toHaveBeenCalled();
  });

  it('does NOT populate when RASP tier is WARN', async () => {
    raspTierMock.mockResolvedValue({ tier: 'warn-before-sign' });
    setVault(enrolledBlob());
    await keyStore.unlock('87654321', { getHardwareFactor: getHF });
    expect(putFastpathDek).not.toHaveBeenCalled();
  });

  it('does NOT populate when RASP tier is BLOCK', async () => {
    raspTierMock.mockResolvedValue({ tier: 'block-signing' });
    setVault(enrolledBlob());
    await keyStore.unlock('87654321', { getHardwareFactor: getHF });
    expect(putFastpathDek).not.toHaveBeenCalled();
  });

  it('does NOT populate when RASP artifact is unknown/absent (fail-closed)', async () => {
    raspTierMock.mockResolvedValue(null);
    setVault(enrolledBlob());
    await keyStore.unlock('87654321', { getHardwareFactor: getHF });
    expect(putFastpathDek).not.toHaveBeenCalled();
  });

  it('populate failure does NOT fail the unlock (I4 best-effort)', async () => {
    putFastpathDek.mockRejectedValueOnce(new Error('plugin bridge error'));
    setVault(enrolledBlob());
    await expect(keyStore.unlock('87654321', { getHardwareFactor: getHF })).resolves.toBe('seed');
  });

  it('a getFreshRaspArtifact throw does NOT fail the unlock (fail-closed populate skip)', async () => {
    raspTierMock.mockRejectedValueOnce(new Error('probe blew up'));
    setVault(enrolledBlob());
    await expect(keyStore.unlock('87654321', { getHardwareFactor: getHF })).resolves.toBe('seed');
    expect(putFastpathDek).not.toHaveBeenCalled();
  });
});

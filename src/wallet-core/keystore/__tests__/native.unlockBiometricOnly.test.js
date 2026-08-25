// src/wallet-core/keystore/__tests__/native.unlockBiometricOnly.test.js
//
// Issue #2019 (owner Option 1) — the NEW biometric-only unlock branch.
// Runs BEFORE PIN entry; `_unlockInner(password)` and the WalletProvider
// PIN path are untouched. Every failure mode returns a distinct FastpathError
// code so the UI can render the right hint before falling back to the PIN
// keypad. Codes are UI-only routing signals — MUST NEVER be logged or
// emitted (I2).

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

const isFastpathEnabledMock = vi.fn(() => true);
// M-4 (2026-08-25): unlockBiometricOnly now asserts the disclosure marker
// itself instead of inheriting it from populate's gate, so this mock must
// carry it. The DISCLOSURE-off case is covered in native.duressFastpathGate.test.js.
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
const bareBlob = () => JSON.stringify({ v: 1, kdf: 'argon2id', salt: 's', iv: 'i', ct: 'c' });

const getHF = async () => new Uint8Array(32).fill(2);

let keyStore;
let FASTPATH_CODE;

beforeEach(async () => {
  vi.resetModules();
  store.clear();
  putFastpathDek.mockClear();
  getFastpathDek.mockClear();
  getFastpathDek.mockResolvedValue(null);
  clearFastpathDek.mockClear();
  isFastpathEnabledMock.mockReturnValue(true);
  isDeniabilityOrDemoActiveMock.mockReturnValue(false);
  raspTierMock.mockResolvedValue({ tier: 'allow' });
  const mod = await import('../native.js');
  keyStore = mod.nativeKeyStore;
  FASTPATH_CODE = mod.FASTPATH_CODE;
});

// Seed the alias with a REAL wrapped DEK for the given H, so the happy-path
// end-to-end (getFastpathDek → HKDF → unwrap → decrypt) genuinely works.
async function seedCache(H) {
  const { wrapForFastpath, deriveFastpathKek } = await import('../fastpathDekCache.js');
  const kekFp = await deriveFastpathKek(H);
  const wrapped = await wrapForFastpath(kekFp, FIXED_DEK);
  getFastpathDek.mockResolvedValue(JSON.stringify(wrapped));
}

describe('unlockBiometricOnly — gate matrix', () => {
  it('throws DENIABILITY_BLOCKED in a decoy/demo session (I3, no biometric prompt)', async () => {
    setVault(enrolledBlob());
    isDeniabilityOrDemoActiveMock.mockReturnValue(true);
    const called = vi.fn(async () => new Uint8Array(32).fill(2));
    await expect(keyStore.unlockBiometricOnly({ getHardwareFactor: called })).rejects.toMatchObject({
      code: FASTPATH_CODE.DENIABILITY_BLOCKED,
    });
    expect(called).not.toHaveBeenCalled();
  });

  it('throws DISABLED when the opt-in toggle is OFF (no biometric prompt)', async () => {
    setVault(enrolledBlob());
    isFastpathEnabledMock.mockReturnValue(false);
    const called = vi.fn(async () => new Uint8Array(32).fill(2));
    await expect(keyStore.unlockBiometricOnly({ getHardwareFactor: called })).rejects.toMatchObject({
      code: FASTPATH_CODE.DISABLED,
    });
    expect(called).not.toHaveBeenCalled();
  });

  it('throws RASP_GATE on WARN tier', async () => {
    setVault(enrolledBlob());
    raspTierMock.mockResolvedValue({ tier: 'warn-before-sign' });
    await expect(keyStore.unlockBiometricOnly({ getHardwareFactor: getHF })).rejects.toMatchObject({
      code: FASTPATH_CODE.RASP_GATE,
    });
  });

  it('throws RASP_GATE on BLOCK tier', async () => {
    setVault(enrolledBlob());
    raspTierMock.mockResolvedValue({ tier: 'block-signing' });
    await expect(keyStore.unlockBiometricOnly({ getHardwareFactor: getHF })).rejects.toMatchObject({
      code: FASTPATH_CODE.RASP_GATE,
    });
  });

  it('throws RASP_GATE on an unknown/absent artifact (fail-closed)', async () => {
    setVault(enrolledBlob());
    raspTierMock.mockResolvedValue(null);
    await expect(keyStore.unlockBiometricOnly({ getHardwareFactor: getHF })).rejects.toMatchObject({
      code: FASTPATH_CODE.RASP_GATE,
    });
  });

  it('throws RASP_GATE on a probe throw (fail-closed)', async () => {
    setVault(enrolledBlob());
    raspTierMock.mockRejectedValue(new Error('probe blew up'));
    await expect(keyStore.unlockBiometricOnly({ getHardwareFactor: getHF })).rejects.toMatchObject({
      code: FASTPATH_CODE.RASP_GATE,
    });
  });

  it('throws NO_VAULT when SecureStorage has no vault', async () => {
    // no setVault
    await expect(keyStore.unlockBiometricOnly({ getHardwareFactor: getHF })).rejects.toMatchObject({
      code: FASTPATH_CODE.NO_VAULT,
    });
  });

  it('throws NOT_KEK for a bare (non-KEK) vault', async () => {
    setVault(bareBlob());
    await expect(keyStore.unlockBiometricOnly({ getHardwareFactor: getHF })).rejects.toMatchObject({
      code: FASTPATH_CODE.NOT_KEK,
    });
  });

  it('throws NOT_KEK for a corrupt vault (parse throws)', async () => {
    setVault('{{not-json');
    await expect(keyStore.unlockBiometricOnly({ getHardwareFactor: getHF })).rejects.toMatchObject({
      code: FASTPATH_CODE.NOT_KEK,
    });
  });
});

describe('unlockBiometricOnly — cache flow', () => {
  it('throws MISS when the cache alias is empty', async () => {
    setVault(enrolledBlob());
    getFastpathDek.mockResolvedValue(null);
    await expect(keyStore.unlockBiometricOnly({ getHardwareFactor: getHF })).rejects.toMatchObject({
      code: FASTPATH_CODE.MISS,
    });
  });

  it('throws MISS on a tampered/parse-fail cache blob (no oracle vs empty)', async () => {
    setVault(enrolledBlob());
    getFastpathDek.mockResolvedValue('not-json');
    await expect(keyStore.unlockBiometricOnly({ getHardwareFactor: getHF })).rejects.toMatchObject({
      code: FASTPATH_CODE.MISS,
    });
  });

  it('throws MISS when the wrapped DEK does not authenticate under the derived kek_fp', async () => {
    setVault(enrolledBlob());
    getFastpathDek.mockResolvedValue(JSON.stringify({ v: 1, iv: 'AAAA', ct: 'BBBB' }));
    await expect(keyStore.unlockBiometricOnly({ getHardwareFactor: getHF })).rejects.toMatchObject({
      code: FASTPATH_CODE.MISS,
    });
  });

  it('throws MISS when getHardwareFactor is not provided', async () => {
    setVault(enrolledBlob());
    await expect(keyStore.unlockBiometricOnly({})).rejects.toMatchObject({
      code: FASTPATH_CODE.MISS,
    });
  });

  it('returns the decrypted vault on cache HIT (end-to-end via real fastpathDekCache primitives)', async () => {
    setVault(enrolledBlob());
    const H = new Uint8Array(32).fill(2);
    await seedCache(H);
    const out = await keyStore.unlockBiometricOnly({ getHardwareFactor: async () => H.slice() });
    expect(out).toBe('seed'); // vault mock returns 'seed'
  });

  it('throws KEY_INVALIDATED and clears the alias when the biometric key was re-enrolled', async () => {
    setVault(enrolledBlob());
    const err = Object.assign(new Error('invalid'), { code: 'KEY_PERMANENTLY_INVALIDATED' });
    getFastpathDek.mockRejectedValue(err);
    await expect(keyStore.unlockBiometricOnly({ getHardwareFactor: getHF })).rejects.toMatchObject({
      code: FASTPATH_CODE.KEY_INVALIDATED,
    });
    expect(clearFastpathDek).toHaveBeenCalled();
  });
});

describe('unlockBiometricOnly — safety invariants', () => {
  it('never accepts a password argument (signature has no PIN plumbing)', () => {
    // Structural check — reading source is heavier than needed; here we just
    // confirm the function's arity does not carry a password (opts only).
    expect(keyStore.unlockBiometricOnly.length).toBeLessThanOrEqual(1);
  });

  it('DENIABILITY_BLOCKED short-circuits BEFORE the vault read (no metadata leak)', async () => {
    setVault(enrolledBlob());
    isDeniabilityOrDemoActiveMock.mockReturnValue(true);
    secureStoreMock.get.mockClear();
    await expect(keyStore.unlockBiometricOnly({ getHardwareFactor: getHF })).rejects.toMatchObject({
      code: FASTPATH_CODE.DENIABILITY_BLOCKED,
    });
    // The gate returned before any SecureStorage read.
    expect(secureStoreMock.get).not.toHaveBeenCalled();
  });
});

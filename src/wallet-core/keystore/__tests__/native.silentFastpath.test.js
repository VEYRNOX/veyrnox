// src/wallet-core/keystore/__tests__/native.silentFastpath.test.js
//
// Issue #2019 (owner Tier 2, 2026-08-28) — the SILENT fast-path unlock.
//
// The refactor eliminates the aparajita BiometricAuth.authenticate hop (and
// its ~2 s Pixel AuthContainerView success animation) and the HKDF(H) layer
// on the hot path. The whole biometric gate is the 30 s STRONG validity
// window baked into the `veyrnox_fastpath_dek` Keystore alias — a phone
// Face-unlocked within 30 s satisfies Cipher.doFinal silently; otherwise
// UserNotAuthenticatedException surfaces on the plugin side as a null miss.
//
// The tests below PIN the "no getHardwareFactor call on the hot path"
// invariant. If a future edit re-introduces an aparajita/HKDF step, the
// injected getHardwareFactor spy fires and this file goes red.

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

// Node's Buffer.toString('base64') matches the WHATWG btoa the module uses.
const b64 = (u8) => Buffer.from(u8).toString('base64');

let keyStore;
let FASTPATH_CODE;
let getHFSpy;

beforeEach(async () => {
  vi.resetModules();
  store.clear();
  putFastpathDek.mockClear();
  getFastpathDek.mockClear();
  getFastpathDek.mockResolvedValue(null);
  clearFastpathDek.mockClear();
  isFastpathEnabledMock.mockReturnValue(true);
  hasSeenFastpathDisclosureMock.mockReturnValue(true);
  isDeniabilityOrDemoActiveMock.mockReturnValue(false);
  isPasskeyRegisteredMock.mockReturnValue(false);
  raspTierMock.mockResolvedValue({ tier: 'allow' });
  getHFSpy = vi.fn(async () => new Uint8Array(32).fill(2));
  const mod = await import('../native.js');
  keyStore = mod.nativeKeyStore;
  FASTPATH_CODE = mod.FASTPATH_CODE;
});

describe('unlockBiometricOnly — silent fast-path (Tier 2, 2026-08-28)', () => {
  it('HIT: opens the vault without ever calling getHardwareFactor', async () => {
    setVault(enrolledBlob());
    getFastpathDek.mockResolvedValue(b64(FIXED_DEK));

    const out = await keyStore.unlockBiometricOnly({ getHardwareFactor: getHFSpy });

    expect(out).toBe('seed');
    // THE new invariant: no aparajita hop, no HKDF-of-H, no H fetch on the
    // hot path. The 30 s STRONG Keystore window is the sole gate.
    expect(getHFSpy).not.toHaveBeenCalled();
  });

  it('MISS (empty alias) surfaces without a getHardwareFactor call', async () => {
    setVault(enrolledBlob());
    getFastpathDek.mockResolvedValue(null);

    await expect(keyStore.unlockBiometricOnly({ getHardwareFactor: getHFSpy }))
      .rejects.toMatchObject({ code: FASTPATH_CODE.MISS });
    expect(getHFSpy).not.toHaveBeenCalled();
  });

  it('KEY_PERMANENTLY_INVALIDATED surfaces as KEY_INVALIDATED and clears the alias', async () => {
    setVault(enrolledBlob());
    const err = Object.assign(new Error('invalid'), { code: 'KEY_PERMANENTLY_INVALIDATED' });
    getFastpathDek.mockRejectedValue(err);

    await expect(keyStore.unlockBiometricOnly({ getHardwareFactor: getHFSpy }))
      .rejects.toMatchObject({ code: FASTPATH_CODE.KEY_INVALIDATED });
    expect(clearFastpathDek).toHaveBeenCalled();
    expect(getHFSpy).not.toHaveBeenCalled();
  });

  it('MISS when the alias returns malformed base64 (fail-closed)', async () => {
    setVault(enrolledBlob());
    // Non-base64, not 32 bytes decoded — the raw-DEK reader must map to MISS
    // rather than propagate a decode/decrypt exception.
    getFastpathDek.mockResolvedValue('not-base64@@');

    await expect(keyStore.unlockBiometricOnly({ getHardwareFactor: getHFSpy }))
      .rejects.toMatchObject({ code: FASTPATH_CODE.MISS });
    expect(getHFSpy).not.toHaveBeenCalled();
  });

  it('MISS when decrypted DEK is the wrong length (32-byte structural check)', async () => {
    setVault(enrolledBlob());
    getFastpathDek.mockResolvedValue(b64(new Uint8Array(16).fill(3)));

    await expect(keyStore.unlockBiometricOnly({ getHardwareFactor: getHFSpy }))
      .rejects.toMatchObject({ code: FASTPATH_CODE.MISS });
    expect(getHFSpy).not.toHaveBeenCalled();
  });
});

describe('unlockBiometricOnly — gate matrix still fails-closed and never prompts', () => {
  it('DENIABILITY_BLOCKED — I3 chokepoint', async () => {
    setVault(enrolledBlob());
    isDeniabilityOrDemoActiveMock.mockReturnValue(true);
    await expect(keyStore.unlockBiometricOnly({ getHardwareFactor: getHFSpy }))
      .rejects.toMatchObject({ code: FASTPATH_CODE.DENIABILITY_BLOCKED });
    expect(getFastpathDek).not.toHaveBeenCalled();
    expect(getHFSpy).not.toHaveBeenCalled();
  });

  it('DISABLED — opt-in OFF', async () => {
    setVault(enrolledBlob());
    isFastpathEnabledMock.mockReturnValue(false);
    await expect(keyStore.unlockBiometricOnly({ getHardwareFactor: getHFSpy }))
      .rejects.toMatchObject({ code: FASTPATH_CODE.DISABLED });
    expect(getFastpathDek).not.toHaveBeenCalled();
    expect(getHFSpy).not.toHaveBeenCalled();
  });

  it('DISABLED — disclosure not seen', async () => {
    setVault(enrolledBlob());
    hasSeenFastpathDisclosureMock.mockReturnValue(false);
    await expect(keyStore.unlockBiometricOnly({ getHardwareFactor: getHFSpy }))
      .rejects.toMatchObject({ code: FASTPATH_CODE.DISABLED });
    expect(getFastpathDek).not.toHaveBeenCalled();
    expect(getHFSpy).not.toHaveBeenCalled();
  });

  it('RASP_GATE — WARN tier', async () => {
    setVault(enrolledBlob());
    raspTierMock.mockResolvedValue({ tier: 'warn-before-sign' });
    await expect(keyStore.unlockBiometricOnly({ getHardwareFactor: getHFSpy }))
      .rejects.toMatchObject({ code: FASTPATH_CODE.RASP_GATE });
    expect(getHFSpy).not.toHaveBeenCalled();
  });

  it('MISS — duress PIN configured (H-1 read-side gate)', async () => {
    setVault(enrolledBlob());
    try { localStorage.setItem('veyrnox-duress-configured', '1'); } catch { /* shimmed */ }
    try {
      getFastpathDek.mockResolvedValue(b64(FIXED_DEK));
      await expect(keyStore.unlockBiometricOnly({ getHardwareFactor: getHFSpy }))
        .rejects.toMatchObject({ code: FASTPATH_CODE.MISS });
      expect(getHFSpy).not.toHaveBeenCalled();
    } finally {
      try { localStorage.removeItem('veyrnox-duress-configured'); } catch { /* shimmed */ }
    }
  });
});

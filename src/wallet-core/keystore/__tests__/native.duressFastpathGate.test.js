// src/wallet-core/keystore/__tests__/native.duressFastpathGate.test.js
//
// H-1 / M-2 / M-4 (weekly audit 2026-08-25).
//
// M-2 is why this file exists at all. The gating comment above FASTPATH_CODE
// used to close with "…verified by native.duressStillWorks / .panicStillWorks
// / .wrongPinStillFails tests" — three files that never existed. It attached a
// fabricated verification claim to the exact invariant H-1 turned out to
// violate, so a reviewer who trusted the comment stopped looking precisely
// where the defect was. These are those tests, written for real.
//
// H-1 is the defect they pin. `populateFastpathBestEffort` had five gates and
// `isDuressConfigured()` was not one of them, so the wrapped-DEK cache warmed
// on a device with an Emergency PIN configured — and `unlockBiometricOnly`
// then opened the REAL vault with no PIN entry, i.e. no duress fork at all. A
// coercer taps the fingerprint button and gets the real funds, which is the
// verbatim inverse of the invariant stated at duressBiometricGuard.js:1-6.
//
// The duress signal is read for REAL here (`veyrnox-duress-configured` in
// localStorage, via the real isDuressConfigured) rather than mocked — the
// discriminator between deliberate configuration and PIN-cohort chaff is the
// whole subtlety of that helper (see its module header on PR #714), and a
// mocked boolean would not pin it.
//
// Mock discipline mirrors native.slowPathPopulate.test.js and
// native.unlockBiometricOnly.test.js.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const VAULT_KEY = 'vault_v1';
const DURESS_CONFIGURED_KEY = 'veyrnox-duress-configured';
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
// unwrapDek is the wrong-PIN chokepoint: on a KEK vault a PIN that is not the
// primary one produces a different C, so the AES-GCM unwrap fails to
// authenticate and this throws. Tests flip it to model duress / panic / wrong
// PIN reaching the keystore.
const unwrapDekMock = vi.fn(async () => new Uint8Array(FIXED_DEK));
vi.mock('../kek.js', () => ({
  combineKek: vi.fn(async () => new Uint8Array(FIXED_KEK)),
  randomDek: vi.fn(() => new Uint8Array(FIXED_DEK)),
  wrapDek: vi.fn(async () => ({ v: 2, iv: 'wrap-iv', ct: 'wrap-ct' })),
  unwrapDek: (...a) => unwrapDekMock(...a),
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

const REAL_PIN = '87654321';
const H_BYTES = new Uint8Array(32).fill(2);
const getHF = async () => H_BYTES.slice();

let keyStore;
let FASTPATH_CODE;

/** Put a genuinely openable wrapped DEK in the alias, as a warm cache would hold. */
async function seedWarmCache() {
  const { wrapForFastpath, deriveFastpathKek } = await import('../fastpathDekCache.js');
  const kekFp = await deriveFastpathKek(H_BYTES.slice());
  const wrapped = await wrapForFastpath(kekFp, FIXED_DEK);
  getFastpathDek.mockResolvedValue(JSON.stringify(wrapped));
}

beforeEach(async () => {
  vi.resetModules();
  store.clear();
  try { localStorage.clear(); } catch { /* shimmed */ }
  putFastpathDek.mockClear();
  getFastpathDek.mockClear();
  getFastpathDek.mockResolvedValue(null);
  clearFastpathDek.mockClear();
  unwrapDekMock.mockReset();
  unwrapDekMock.mockImplementation(async () => new Uint8Array(FIXED_DEK));
  isFastpathEnabledMock.mockReturnValue(true);
  hasSeenFastpathDisclosureMock.mockReturnValue(true);
  isDeniabilityOrDemoActiveMock.mockReturnValue(false);
  isPasskeyRegisteredMock.mockReturnValue(false);
  raspTierMock.mockResolvedValue({ tier: 'allow' });
  const mod = await import('../native.js');
  keyStore = mod.nativeKeyStore;
  FASTPATH_CODE = mod.FASTPATH_CODE;
});

// ---------------------------------------------------------------------------
// duressStillWorks — the claim the old comment made without a test behind it.
// ---------------------------------------------------------------------------
describe('duressStillWorks — a configured Emergency PIN suppresses the fast path (H-1)', () => {
  it('does NOT populate the wrapped-DEK cache when a duress PIN is configured', async () => {
    // THE H-1 BUG. Every other gate is satisfied (enabled, disclosure seen, no
    // passkey, RASP ALLOW, real session) and the correct primary PIN was
    // typed — but a duress PIN exists, so warming the cache would hand a
    // coercer a PIN-free door into the REAL vault.
    localStorage.setItem(DURESS_CONFIGURED_KEY, '1');
    setVault(enrolledBlob());

    await keyStore.unlock(REAL_PIN, { getHardwareFactor: getHF });

    expect(putFastpathDek).not.toHaveBeenCalled();
  });

  it('DOES populate when no duress PIN is configured (the gate is specific, not blanket)', async () => {
    // Mutation check: without this case a gate that suppressed populate
    // unconditionally would pass every other test in this file.
    setVault(enrolledBlob());

    await keyStore.unlock(REAL_PIN, { getHardwareFactor: getHF });

    expect(putFastpathDek).toHaveBeenCalledTimes(1);
  });

  it('does NOT populate when the duress signal cannot be read (fail-closed, I4)', async () => {
    // isDuressConfigured() returns TRUE on an unreadable store by design, so
    // the protective branch is taken. Pinned here because the fail-closed
    // direction is the whole point of that catch.
    //
    // The global is REPLACED rather than a method spied: which object
    // `localStorage` resolves to inside the module is Node-version dependent
    // (see the same helper's rationale in duressBiometricGuard.test.js), and a
    // method spy that the module never sees would make this pass vacuously.
    // Only the duress key throws, so every other read on the unlock path is
    // unaffected.
    const real = globalThis.localStorage;
    vi.stubGlobal('localStorage', new Proxy(real, {
      get(target, prop) {
        if (prop === 'getItem') {
          return (k) => {
            if (k === DURESS_CONFIGURED_KEY) throw new Error('storage unavailable');
            return real.getItem(k);
          };
        }
        const v = Reflect.get(target, prop);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    }));
    try {
      setVault(enrolledBlob());
      await keyStore.unlock(REAL_PIN, { getHardwareFactor: getHF });
      expect(putFastpathDek).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('unlockBiometricOnly refuses to open the real vault while a duress PIN is configured, even with a warm cache', async () => {
    // The installed-base / failed-clear residual: a cache warmed BEFORE the
    // Emergency PIN was configured is still sitting in the alias. The read
    // gate makes that a plain MISS — indistinguishable from an empty slot, so
    // the fallback to the PIN keypad is not itself a tell.
    localStorage.setItem(DURESS_CONFIGURED_KEY, '1');
    setVault(enrolledBlob());
    await seedWarmCache();

    await expect(keyStore.unlockBiometricOnly({ getHardwareFactor: getHF }))
      .rejects.toMatchObject({ code: FASTPATH_CODE.MISS });
  });

  it('the same warm cache DOES open without a duress PIN (proves the refusal above is the duress gate)', async () => {
    setVault(enrolledBlob());
    await seedWarmCache();

    await expect(keyStore.unlockBiometricOnly({ getHardwareFactor: getHF }))
      .resolves.toBe('seed');
  });
});

// ---------------------------------------------------------------------------
// panicStillWorks / wrongPinStillFails — the other two claims. At THIS layer
// both are the same mechanism, and saying so is the honest version: panic and
// duress PINs are routed by WalletProvider.resolveDeniabilityUnlock and never
// produce a successful primary unwrapDek, so neither can warm the cache.
// ---------------------------------------------------------------------------
describe('panicStillWorks / wrongPinStillFails — a non-primary PIN never warms the cache', () => {
  it('a PIN that fails the KEK unwrap (duress / panic / wrong) rejects and populates nothing', async () => {
    unwrapDekMock.mockRejectedValue(Object.assign(new Error('unwrap failed'), { code: 'UNWRAP_FAILED' }));
    setVault(enrolledBlob());

    await expect(keyStore.unlock('00000000', { getHardwareFactor: getHF })).rejects.toBeTruthy();
    expect(putFastpathDek).not.toHaveBeenCalled();
  });

  it('unlockBiometricOnly accepts no PIN at all (structural: duress/panic routing cannot be reached here)', () => {
    // The routing lives in the PIN-entry path; this branch has nowhere to put
    // a PIN. Arity is the cheap structural proof that no password plumbing
    // was added later.
    expect(keyStore.unlockBiometricOnly.length).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// M-4 (optional hardening the audit recommends): make "no warm cache before
// consent" a LOCAL property of the read path, not one that merely emerges from
// populate's gate.
// ---------------------------------------------------------------------------
describe('M-4 — unlockBiometricOnly gates on the disclosure card directly', () => {
  it('refuses to open a warm cache when the first-run disclosure has not been acknowledged', async () => {
    hasSeenFastpathDisclosureMock.mockReturnValue(false);
    setVault(enrolledBlob());
    await seedWarmCache();

    await expect(keyStore.unlockBiometricOnly({ getHardwareFactor: getHF }))
      .rejects.toMatchObject({ code: FASTPATH_CODE.DISABLED });
  });
});

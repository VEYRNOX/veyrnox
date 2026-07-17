// src/wallet-core/keystore/__tests__/native.kek-upgrade-v3.test.js
//
// upgradeKekToV3(password, opts) — the EXPLICIT, user-consented, FAIL-CLOSED re-enroll
// that upgrades a pre-#568 v2 (or legacy v1) KEK vault to a genuinely salt-bound v3 wrap.
//
// This is the on-demand replacement for the silent v2→v3 lazy migration that was removed
// from the unlock hot path (PR #662) because it fired a 3rd biometric prompt per unlock and
// swallowed failures forever. Unlike that removed path, this is:
//   - a SINGLE explicit action (two biometric prompts — unwrap H + re-wrap H2 — is correct
//     and acceptable for a one-time consented upgrade),
//   - FAIL-CLOSED: any failure PROPAGATES; safeWriteVault's set→read-back→verify leaves the
//     stored blob byte-for-byte unchanged, so a failed upgrade never downgrades/half-writes.
//
// HARNESS: mock ONLY the native plugins + hardware.js. Use REAL kek.js (real HKDF/AES-GCM
// wrap/unwrap) and a REAL-BEHAVIOUR vault.js where the DEK crypto is real WebCrypto and
// deriveKekC is a fast, DETERMINISTIC function of (password, salt) — so the load-bearing
// properties are GENUINELY exercised: SAME DEK preserved across the re-wrap, seed decrypts
// to the SAME secret, a WRONG password produces a different C → different KEK → real GCM
// unwrap failure. (Argon2id at 192 MiB is too heavy per-test; the deterministic C keeps the
// "wrong password fails / same password same C" contract without the cost.)

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── native plugin mocks ──────────────────────────────────────────────────────────────
const VAULT_KEY = 'vault_v1';
const store = new Map();
const setVault = (v) => { if (v === null || v === undefined) store.delete(VAULT_KEY); else store.set(VAULT_KEY, v); };
const secureStoreMock = {
  setKeyPrefix: vi.fn(async () => {}),
  setSynchronize: vi.fn(async () => {}),
  setDefaultKeychainAccess: vi.fn(async () => {}),
  get: vi.fn(async (key) => (store.has(key) ? store.get(key) : null)),
  set: vi.fn(async (key, data) => { store.set(key, data); }),
  remove: vi.fn(async (key) => { const e = store.has(key); store.delete(key); return e; }),
};
vi.mock('@aparajita/capacitor-secure-storage', () => ({
  SecureStorage: secureStoreMock,
  KeychainAccess: { whenPasscodeSetThisDeviceOnly: 'whenPasscodeSetThisDeviceOnly' },
}));
const authenticateMock = vi.fn(async () => {});
vi.mock('@aparajita/capacitor-biometric-auth', () => ({
  BiometricAuth: {
    checkBiometry: vi.fn(async () => ({ isAvailable: true, deviceIsSecure: true })),
    authenticate: authenticateMock,
  },
}));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn() } }));

// hardware.js is the native boundary — mocked so no real Keystore/Enclave is touched.
vi.mock('../hardware.js', () => ({
  getHardwareFactor: vi.fn(async () => new Uint8Array(32).fill(1)),
  clearHardwareCredential: vi.fn(async () => {}),
}));

// ── REAL-behaviour vault.js: real DEK WebCrypto, deterministic (fast) deriveKekC ────────
// deriveKekC(password, salt) → a stable 32-byte C that DEPENDS on both password and salt,
// so: same (password, salt) ⇒ same C (unlock works); different password ⇒ different C
// (wrong-PIN unwrap fails); different salt ⇒ different C (salt binding is meaningful).
async function deterministicC(password, salt) {
  const enc = new TextEncoder();
  const material = new Uint8Array([...enc.encode(String(password)), ...salt]);
  const digest = await crypto.subtle.digest('SHA-256', material);
  return new Uint8Array(digest);
}
vi.mock('../../vault.js', async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    // Fast, deterministic replacement for the 192 MiB Argon2id C-factor derivation.
    deriveKekC: vi.fn((password, salt) => deterministicC(password, salt)),
    // encryptVaultWithDek / decryptVaultWithDek / encryptVault / decryptVault stay REAL.
  };
});

const { nativeKeyStore } = await import('../native.js');
const { randomDek, wrapDek, combineKek } = await import('../kek.js');
const { encryptVaultWithDek, decryptVaultWithDek } = await import('../../vault.js');
const hwMod = await import('../hardware.js');

const SECRET = 'test test test test test test test test test test test junk';
const FIXED_V1_SALT_B64 = btoa('s'.repeat(32)); // the fixed salt v1/v2 wraps were made under

const newHF = () => new Uint8Array(32).fill(1);
const saltBytesOf = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

// Build a genuinely-wrapped KEK vault blob for a given password + salt + version.
// The wrap is made with H=newHF() and C=deterministicC(password, salt) so unlock/upgrade
// with the same password + the SAME salt reproduces the KEK and unwraps the SAME DEK.
async function makeKekVault({ password, saltB64, version, dek, tier }) {
  const salt = saltBytesOf(saltB64);
  const H = newHF();
  const C = await deterministicC(password, salt);
  const kek = await combineKek(H, C); // combineKek zeroes H/C
  const kekWrap = await wrapDek(kek, dek);
  // Spread the full encryptVaultWithDek result so the blob's `v` matches VAULT_VERSION
  // (currently 2, PR #1076). decryptVaultWithDek gates the AAD path on v >= 2; hard-
  // coding v:1 here would encrypt-with-AAD but decrypt-without → auth-tag mismatch.
  const encrypted = await encryptVaultWithDek(SECRET, dek);
  const blob = { ...encrypted, kdf: 'kek-dek', kekWrap, kekSalt: saltB64 };
  if (version !== undefined) blob.hardwareKekVersion = version;
  if (tier) blob.hardwareKekTier = tier;
  return blob;
}

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  secureStoreMock.get.mockImplementation(async (key) => (store.has(key) ? store.get(key) : null));
  secureStoreMock.set.mockImplementation(async (key, data) => { store.set(key, data); });
  secureStoreMock.remove.mockImplementation(async (key) => { const e = store.has(key); store.delete(key); return e; });
  authenticateMock.mockResolvedValue(undefined);
});

// ── (1) v2/v1 → v3 upgrade: fresh salt, SAME DEK, SAME secret, tier preserved ──────────
describe('(1) upgradeKekToV3 — v2/v1 KEK vault upgraded to a genuinely salt-bound v3 wrap', () => {
  it('v2 vault → v3: fresh distinct salt, seed still decrypts to SAME secret (SAME DEK), tier preserved', async () => {
    const dek = randomDek();
    const dekCopy = dek.slice();
    const blob = await makeKekVault({
      password: 'pin12345678', saltB64: FIXED_V1_SALT_B64, version: 2, dek, tier: 'STRONGBOX',
    });
    setVault(JSON.stringify(blob));

    // Old side of a v2 vault uses the FIXED salt (v2 was inert); new side is salt-bound.
    const getHF = vi.fn(async () => newHF());
    const res = await nativeKeyStore.upgradeKekToV3('pin12345678', { getHardwareFactor: getHF });
    expect(res).toEqual({ upgraded: true, version: 3 });

    const written = JSON.parse(store.get(VAULT_KEY));
    expect(written.hardwareKekVersion).toBe(3);
    // Fresh salt: distinct from the old salt AND from the fixed v1 salt.
    expect(written.kekSalt).not.toBe(FIXED_V1_SALT_B64);
    // Seed ciphertext UNCHANGED — only the wrap rotates (§3 property).
    expect(written.iv).toBe(blob.iv);
    expect(written.ct).toBe(blob.ct);
    // Tier preserved through the ...blob spread.
    expect(written.hardwareKekTier).toBe('STRONGBOX');

    // The wrap really changed.
    expect(JSON.stringify(written.kekWrap)).not.toBe(JSON.stringify(blob.kekWrap));

    // The SAME DEK protects the seed: unlocking the new v3 wrap must recover the SAME secret.
    const recovered = await nativeKeyStore.unlock('pin12345678', { getHardwareFactor: vi.fn(async () => newHF()) });
    expect(recovered).toBe(SECRET);

    // And the seed CT (unchanged) still decrypts under the ORIGINAL DEK directly.
    expect(await decryptVaultWithDek(written, dekCopy)).toBe(SECRET);
  });

  it('legacy v1 vault (kekWrap, no version) → v3', async () => {
    const dek = randomDek();
    const blob = await makeKekVault({
      password: 'pin12345678', saltB64: FIXED_V1_SALT_B64, version: undefined, dek,
    });
    setVault(JSON.stringify(blob));

    const res = await nativeKeyStore.upgradeKekToV3('pin12345678', { getHardwareFactor: vi.fn(async () => newHF()) });
    expect(res).toEqual({ upgraded: true, version: 3 });
    const written = JSON.parse(store.get(VAULT_KEY));
    expect(written.hardwareKekVersion).toBe(3);
    expect(written.kekSalt).not.toBe(FIXED_V1_SALT_B64);

    const recovered = await nativeKeyStore.unlock('pin12345678', { getHardwareFactor: vi.fn(async () => newHF()) });
    expect(recovered).toBe(SECRET);
  });
});

// ── (2) idempotent on v3 ───────────────────────────────────────────────────────────────
describe('(2) upgradeKekToV3 — idempotent on an already-v3 vault (zero prompts, no write)', () => {
  it('v3 vault → returns { upgraded:false, version:3 }, getHardwareFactor NEVER called, no write', async () => {
    const dek = randomDek();
    const v3salt = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
    const blob = await makeKekVault({ password: 'pin12345678', saltB64: v3salt, version: 3, dek });
    setVault(JSON.stringify(blob));
    const before = store.get(VAULT_KEY);

    const getHF = vi.fn(async () => newHF());
    const res = await nativeKeyStore.upgradeKekToV3('pin12345678', { getHardwareFactor: getHF });

    expect(res).toEqual({ upgraded: false, version: 3 });
    expect(getHF).toHaveBeenCalledTimes(0);
    // No write occurred — the stored blob is byte-for-byte identical.
    expect(store.get(VAULT_KEY)).toBe(before);
    expect(secureStoreMock.set).not.toHaveBeenCalled();
  });
});

// ── (3) fail-closed ───────────────────────────────────────────────────────────────────
describe('(3) upgradeKekToV3 — FAIL-CLOSED (no swallow); vault byte-for-byte unchanged on any failure', () => {
  it('(a) missing getHardwareFactor → throws NO_HARDWARE_FACTOR, vault unchanged', async () => {
    const dek = randomDek();
    const blob = await makeKekVault({ password: 'pin12345678', saltB64: FIXED_V1_SALT_B64, version: 2, dek });
    setVault(JSON.stringify(blob));
    const before = store.get(VAULT_KEY);

    await expect(nativeKeyStore.upgradeKekToV3('pin12345678', {})).rejects.toThrow('KEK_NO_HARDWARE_FACTOR');
    expect(store.get(VAULT_KEY)).toBe(before);
  });

  it('(b) getHardwareFactor that throws → propagates, vault unchanged, no half-write', async () => {
    const dek = randomDek();
    const blob = await makeKekVault({ password: 'pin12345678', saltB64: FIXED_V1_SALT_B64, version: 2, dek });
    setVault(JSON.stringify(blob));
    const before = store.get(VAULT_KEY);

    const getHF = vi.fn(async () => { throw new Error('biometric cancelled during upgrade'); });
    await expect(
      nativeKeyStore.upgradeKekToV3('pin12345678', { getHardwareFactor: getHF }),
    ).rejects.toThrow('biometric cancelled during upgrade');
    expect(store.get(VAULT_KEY)).toBe(before);
    expect(secureStoreMock.set).not.toHaveBeenCalled();
  });

  it('(c) wrong password → real GCM unwrap fails, vault unchanged, no downgrade', async () => {
    const dek = randomDek();
    const blob = await makeKekVault({ password: 'pin12345678', saltB64: FIXED_V1_SALT_B64, version: 2, dek });
    setVault(JSON.stringify(blob));
    const before = store.get(VAULT_KEY);

    await expect(
      nativeKeyStore.upgradeKekToV3('WRONG-password', { getHardwareFactor: vi.fn(async () => newHF()) }),
    ).rejects.toThrow('KEK_UNWRAP_FAILED');
    // Blob unchanged — still v2, still the fixed salt.
    expect(store.get(VAULT_KEY)).toBe(before);
    const still = JSON.parse(store.get(VAULT_KEY));
    expect(still.hardwareKekVersion).toBe(2);
    expect(still.kekSalt).toBe(FIXED_V1_SALT_B64);
  });
});

// ── (4) not enrolled ──────────────────────────────────────────────────────────────────
describe('(4) upgradeKekToV3 — bare (non-KEK) vault: NOT_ENROLLED, zero biometric prompts', () => {
  it('bare vault → throws NOT_ENROLLED-style error, getHardwareFactor NOT called', async () => {
    setVault(JSON.stringify({ v: 1, kdf: { name: 'argon2id' }, salt: 's', iv: 'x', ct: 'y' }));
    const getHF = vi.fn(async () => newHF());

    await expect(
      nativeKeyStore.upgradeKekToV3('pin12345678', { getHardwareFactor: getHF }),
    ).rejects.toThrow(/NOT_ENROLLED|not enrolled/i);
    expect(getHF).toHaveBeenCalledTimes(0);
  });

  it('no vault at all → throws No wallet found', async () => {
    setVault(null);
    await expect(
      nativeKeyStore.upgradeKekToV3('pin12345678', { getHardwareFactor: vi.fn(async () => newHF()) }),
    ).rejects.toThrow(/No wallet found/i);
  });
});

// ── (5) zeroing ───────────────────────────────────────────────────────────────────────
describe('(5) upgradeKekToV3 — all TypedArrays zeroed on success AND on throw', () => {
  const isAllZero = (u8) => u8.every((b) => b === 0);

  it('zeroes both hardware factors (H old side, H2 new side) on the success path', async () => {
    const dek = randomDek();
    const blob = await makeKekVault({ password: 'pin12345678', saltB64: FIXED_V1_SALT_B64, version: 2, dek });
    setVault(JSON.stringify(blob));

    const handedOut = [];
    const getHF = vi.fn(async () => { const h = newHF(); handedOut.push(h); return h; });
    await nativeKeyStore.upgradeKekToV3('pin12345678', { getHardwareFactor: getHF });

    expect(handedOut.length).toBe(2); // unwrap H + re-wrap H2
    for (const h of handedOut) expect(isAllZero(h)).toBe(true);
  });

  it('zeroes the old-side H even when the SECOND getHardwareFactor (re-wrap) throws', async () => {
    const dek = randomDek();
    const blob = await makeKekVault({ password: 'pin12345678', saltB64: FIXED_V1_SALT_B64, version: 2, dek });
    setVault(JSON.stringify(blob));

    let firstH;
    const getHF = vi.fn()
      .mockImplementationOnce(async () => { firstH = newHF(); return firstH; })
      .mockRejectedValueOnce(new Error('biometric-cancel-2'));

    await expect(
      nativeKeyStore.upgradeKekToV3('pin12345678', { getHardwareFactor: getHF }),
    ).rejects.toThrow('biometric-cancel-2');

    expect(firstH).toBeDefined();
    expect(isAllZero(firstH)).toBe(true);
  });
});

// ── (6) getVaultKekVersion — metadata only, no prompt, no secret read ──────────────────
describe('(6) getVaultKekVersion — metadata-only accessor (never prompts)', () => {
  it('v2 → 2, v3 → 3, legacy kekWrap-no-version → 1, and NEVER calls getHardwareFactor', async () => {
    const dek = randomDek();

    setVault(JSON.stringify(await makeKekVault({ password: 'p12345678', saltB64: FIXED_V1_SALT_B64, version: 2, dek })));
    expect(await nativeKeyStore.getVaultKekVersion()).toBe(2);

    const v3salt = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
    setVault(JSON.stringify(await makeKekVault({ password: 'p12345678', saltB64: v3salt, version: 3, dek })));
    expect(await nativeKeyStore.getVaultKekVersion()).toBe(3);

    setVault(JSON.stringify(await makeKekVault({ password: 'p12345678', saltB64: FIXED_V1_SALT_B64, version: undefined, dek })));
    expect(await nativeKeyStore.getVaultKekVersion()).toBe(1);

    expect(hwMod.getHardwareFactor).toHaveBeenCalledTimes(0);
  });

  it('bare vault → null, corrupt blob → null, no vault → null', async () => {
    setVault(JSON.stringify({ v: 1, kdf: { name: 'argon2id' }, salt: 's', iv: 'x', ct: 'y' }));
    expect(await nativeKeyStore.getVaultKekVersion()).toBeNull();

    setVault('{ this is not json');
    expect(await nativeKeyStore.getVaultKekVersion()).toBeNull();

    setVault(null);
    expect(await nativeKeyStore.getVaultKekVersion()).toBeNull();
  });
});

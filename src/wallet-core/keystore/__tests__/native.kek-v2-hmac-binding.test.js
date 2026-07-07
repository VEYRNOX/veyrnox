// src/wallet-core/keystore/__tests__/native.kek-v2-hmac-binding.test.js
//
// C-1 (CRITICAL): Android HMAC input was a global fixed constant (PRF_EVAL_SALT),
// so HMAC(androidKeyStoreKey, FIXED_SALT) produced an identical H for EVERY vault on
// the same device. The fix binds H to the per-enrollment kekSalt.
//
// C-1 regression (2026-07-05): the FIRST attempt at this binding stamped vaults v2 but
// was cryptographically inert on device — two masking bugs (the facade dropped
// getHardwareFactor's opts, and hardware.js sent kekSalt as raw bytes the Capacitor bridge
// could not carry) meant every v2 wrap was ACTUALLY made under the fixed v1 salt. So the
// real contract now is:
//   - hardwareKekVersion:3 = GENUINELY salt-bound wrap → unlock passes { kekSalt }.
//   - hardwareKekVersion:2 = inert stamp → unlock uses the fixed salt (NO kekSalt).
//     There is NO lazy on-unlock upgrade: the unlock path fires exactly ONE biometric
//     prompt (the hardware factor only). The v2→v3 upgrade is done exclusively via
//     changePassword / upgradeKekToV3 (PR #662 removed the lazy re-wrap because it
//     fired a second biometric prompt on every unlock and could not converge safely).
//   - v1 (no hardwareKekVersion) = legacy fixed-salt wrap → unlock uses the fixed salt.
// New enrollments and password changes stamp v3.
//
// Tests assert the CONTRACT: what native.js passes to getHF and what version it stamps.
// Mocking pattern mirrors native.kek-preserving-repersist.test.js.
//
// C-1 regression HARDENING (2026-07-05): the v2 { kekSalt } binding was inert on device
// because native.js handed getHF a raw Uint8Array that the Capacitor bridge could not
// carry. Here getHF is the boundary native.js calls (hardware.js). To make the bug class
// UNTESTABLE-AS-PASSING, the getHF the tests inject BRIDGE-CHECKS its kekSalt: it encodes
// the salt to a base64 string and asserts it survives JSON.parse(JSON.stringify(...)) as a
// string — mirroring Kotlin's call.getString semantics (a non-string kekSalt reads as null
// on device and would silently fall back to the fixed salt). A raw Uint8Array now THROWS.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Uint8Array → base64(no-wrap), matching hardware.js's internal encoder.
const bytesToB64 = (u8) => btoa(String.fromCharCode(...u8));

// A getHF stand-in that enforces the on-device bridge contract: kekSalt must be encodable
// to a base64 STRING that survives the JSON bridge. Kotlin's getString("kekSalt") returns
// the string on device only when the JS side sends a string; a Uint8Array serialises to a
// keyed object and reads as null, silently reverting to the fixed v1 salt (the C-1 bug).
// This helper rejects that shape so no future regression can pass these tests.
const makeBridgeCheckedHF = () =>
  vi.fn(async (opts) => {
    if (opts && opts.kekSalt !== undefined) {
      if (!(opts.kekSalt instanceof Uint8Array)) {
        throw new Error('KEK_SALT_NOT_BYTES: native.js must hand getHardwareFactor raw bytes');
      }
      // Encode as hardware.js does, then confirm the encoded value is a bridge-safe string.
      const encoded = bytesToB64(opts.kekSalt);
      const bridged = JSON.parse(JSON.stringify({ kekSalt: encoded }));
      if (typeof bridged.kekSalt !== 'string' || bridged.kekSalt.length === 0) {
        throw new Error('KEK_SALT_MALFORMED: kekSalt did not survive the bridge as a string');
      }
    }
    return new Uint8Array(32).fill(1);
  });

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
vi.mock('@aparajita/capacitor-biometric-auth', () => ({
  BiometricAuth: {
    checkBiometry: vi.fn(async () => ({ isAvailable: true, deviceIsSecure: true })),
    authenticate: vi.fn(async () => {}),
  },
}));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn() } }));

const vaultMock = {
  encryptVault: vi.fn(async () => ({ v: 1, kdf: 'argon2id', salt: 's', iv: 'bareiv', ct: 'barect' })),
  decryptVault: vi.fn(async () => 'seed'),
  deriveKekC: vi.fn(async () => new Uint8Array(32).fill(7)),
  encryptVaultWithDek: vi.fn(async () => ({ iv: 'newiv', ct: 'newct' })),
  decryptVaultWithDek: vi.fn(async () => 'seed'),
};
vi.mock('../../vault.js', () => vaultMock);

const kekMock = {
  combineKek: vi.fn(async () => new Uint8Array(32).fill(9)),
  randomDek: vi.fn(() => new Uint8Array(32).fill(3)),
  wrapDek: vi.fn(async () => ({ v: 1, iv: 'iv', ct: 'ct' })),
  unwrapDek: vi.fn(async () => new Uint8Array(32).fill(4)),
  // Real-behaviour blob-shape guards (added when kek.js gained the error-contract).
  decodeKekSalt: vi.fn((s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))),
  parseVaultBlob: vi.fn((raw) => (typeof raw === 'string' ? JSON.parse(raw) : raw)),
  KEK_ERR: { NO_HARDWARE_FACTOR: 'NO_HARDWARE_FACTOR', UNWRAP_FAILED: 'UNWRAP_FAILED', MALFORMED_VAULT: 'MALFORMED_VAULT' },
};
vi.mock('../kek.js', () => kekMock);

vi.mock('../hardware.js', () => ({
  getHardwareFactor: vi.fn(async () => new Uint8Array(32).fill(1)),
  clearHardwareCredential: vi.fn(async () => {}),
}));

const { nativeKeyStore } = await import('../native.js');

const kekSalt = btoa('s'.repeat(32));
const newHF = () => new Uint8Array(32).fill(1);

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  secureStoreMock.get.mockImplementation(async (key) => (store.has(key) ? store.get(key) : null));
  secureStoreMock.set.mockImplementation(async (key, data) => { store.set(key, data); });
  secureStoreMock.remove.mockImplementation(async (key) => { const e = store.has(key); store.delete(key); return e; });
  vaultMock.deriveKekC.mockResolvedValue(new Uint8Array(32).fill(7));
  vaultMock.decryptVault.mockResolvedValue('seed');
  vaultMock.decryptVaultWithDek.mockResolvedValue('seed');
  vaultMock.encryptVault.mockResolvedValue({ v: 1, kdf: 'argon2id', salt: 's', iv: 'bareiv', ct: 'barect' });
  vaultMock.encryptVaultWithDek.mockResolvedValue({ iv: 'newiv', ct: 'newct' });
  kekMock.combineKek.mockResolvedValue(new Uint8Array(32).fill(9));
  kekMock.unwrapDek.mockResolvedValue(new Uint8Array(32).fill(4));
  kekMock.wrapDek.mockResolvedValue({ v: 1, iv: 'iv', ct: 'ct' });
  kekMock.randomDek.mockReturnValue(new Uint8Array(32).fill(3));
});

// Decode the base64 kekSalt string the blob stores into the Uint8Array native.js
// is expected to hand to getHardwareFactor({ kekSalt }).
const saltBytesOf = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

describe('(1) enrollKek — v3 protocol: binds H to fresh kekSalt and stamps hardwareKekVersion:3', () => {
  it('passes the generated kekSalt to getHardwareFactor and saves hardwareKekVersion:3', async () => {
    setVault(JSON.stringify({ v: 1, kdf: 'argon2id', salt: 's', iv: 'x', ct: 'y' }));
    const getHF = makeBridgeCheckedHF();

    await nativeKeyStore.enrollKek('pw', { getHardwareFactor: getHF });

    const written = JSON.parse(store.get(VAULT_KEY));
    expect(written.hardwareKekVersion).toBe(3);

    // getHF must have been called with { kekSalt } matching the salt written to the blob.
    expect(getHF).toHaveBeenCalledTimes(1);
    const arg = getHF.mock.calls[0][0];
    expect(arg).toBeTruthy();
    expect(arg.kekSalt).toBeInstanceOf(Uint8Array);
    expect(Array.from(arg.kekSalt)).toEqual(Array.from(saltBytesOf(written.kekSalt)));
  });
});

describe('(2) _unlockInner — v3 blob: reads blob.kekSalt and passes it to getHardwareFactor', () => {
  it('passes { kekSalt } decoded from blob.kekSalt on a v3 vault', async () => {
    setVault(JSON.stringify({
      v: 1, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct',
      kekWrap: { v: 1 }, kekSalt, hardwareKekVersion: 3,
    }));
    const getHF = makeBridgeCheckedHF();

    await nativeKeyStore.unlock('pw', { getHardwareFactor: getHF });

    // A v3 vault is already salt-bound — single getHF call, carrying the bound kekSalt,
    // and NO lazy upgrade (that is v2-only).
    expect(getHF).toHaveBeenCalledTimes(1);
    const arg = getHF.mock.calls[0][0];
    expect(arg).toBeTruthy();
    expect(arg.kekSalt).toBeInstanceOf(Uint8Array);
    expect(Array.from(arg.kekSalt)).toEqual(Array.from(saltBytesOf(kekSalt)));
  });
});

describe('(2b) _unlockInner — v2 blob: unlocks with the FIXED salt and does NOT migrate on unlock', () => {
  // RE-POINTED (2026-07-06): this section previously asserted unlock LAZILY UPGRADED a v2
  // vault to v3 (a second getHF re-wrap). That lazy upgrade was removed from the unlock hot
  // path because it forced a second biometric prompt per unlock (the cross-platform 3-prompt
  // bug). The salt-binding upgrade now lives on changePassword — see (4b) below, which still
  // proves the v2→v3 fresh-salt re-wrap. The security-meaningful assertion here is now the
  // NEW invariant: unlock is single-prompt and leaves the v2 blob untouched.
  it('unlock calls getHF exactly ONCE (fixed salt) and leaves the v2 blob at v2', async () => {
    setVault(JSON.stringify({
      v: 1, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct',
      kekWrap: { v: 1 }, kekSalt, hardwareKekVersion: 2,
    }));
    const getHF = makeBridgeCheckedHF();

    await nativeKeyStore.unlock('pw', { getHardwareFactor: getHF });

    // Single biometric prompt; v2 → fixed salt (no kekSalt).
    expect(getHF).toHaveBeenCalledTimes(1);
    expect(getHF.mock.calls[0][0]).toBeUndefined();
    // Unlock does NOT migrate: the stored blob stays v2 with its original salt.
    const written = JSON.parse(store.get(VAULT_KEY));
    expect(written.hardwareKekVersion).toBe(2);
    expect(written.kekSalt).toBe(kekSalt);
  });
});

describe('(3) _unlockInner — v1 blob (no hardwareKekVersion): calls getHardwareFactor with NO kekSalt', () => {
  it('does not pass a kekSalt for a legacy v1 vault (backwards compat)', async () => {
    setVault(JSON.stringify({
      v: 1, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct',
      kekWrap: { v: 1 }, kekSalt,
      // NO hardwareKekVersion → v1
    }));
    const getHF = makeBridgeCheckedHF();

    await nativeKeyStore.unlock('pw', { getHardwareFactor: getHF });

    expect(getHF).toHaveBeenCalledTimes(1);
    const arg = getHF.mock.calls[0][0];
    // v1 legacy path: either no argument, or an argument without kekSalt.
    if (arg !== undefined) {
      expect(arg.kekSalt).toBeUndefined();
    }
  });
});

describe('(4) changePassword — v3 vault: passes existing kekSalt on unlock, fresh kekSalt on re-wrap', () => {
  it('unlocks with the stored kekSalt and re-wraps under a NEW v3 kekSalt', async () => {
    setVault(JSON.stringify({
      v: 1, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct',
      kekWrap: { v: 1 }, kekSalt, hardwareKekVersion: 3,
    }));
    const getHF = makeBridgeCheckedHF();

    await nativeKeyStore.changePassword('old', 'new', { getHardwareFactor: getHF });

    // getHF is called for the OLD (unlock) side and the NEW (re-wrap) side.
    expect(getHF).toHaveBeenCalledTimes(2);

    // Old side: the existing stored kekSalt (v3 is salt-bound on unlock).
    const oldArg = getHF.mock.calls[0][0];
    expect(oldArg.kekSalt).toBeInstanceOf(Uint8Array);
    expect(Array.from(oldArg.kekSalt)).toEqual(Array.from(saltBytesOf(kekSalt)));

    const written = JSON.parse(store.get(VAULT_KEY));
    expect(written.hardwareKekVersion).toBe(3);
    // The re-wrap side used a FRESH kekSalt (rotated), matching the new blob.
    const newArg = getHF.mock.calls[1][0];
    expect(newArg.kekSalt).toBeInstanceOf(Uint8Array);
    expect(Array.from(newArg.kekSalt)).toEqual(Array.from(saltBytesOf(written.kekSalt)));
    // Salt must actually have rotated.
    expect(written.kekSalt).not.toBe(kekSalt);
  });
});

describe('(4b) changePassword — v2 vault: OLD side uses the FIXED salt, re-wrap stamps v3', () => {
  it('unlocks a v2 blob with the fixed salt and re-wraps under a fresh v3 salt', async () => {
    setVault(JSON.stringify({
      v: 1, kdf: 'kek-dek', iv: 'oldiv', ct: 'oldct',
      kekWrap: { v: 1 }, kekSalt, hardwareKekVersion: 2,
    }));
    const getHF = makeBridgeCheckedHF();

    await nativeKeyStore.changePassword('old', 'new', { getHardwareFactor: getHF });

    expect(getHF).toHaveBeenCalledTimes(2);
    // Old side of a v2 vault: fixed salt (no kekSalt) — the v2 wrap was made under it.
    expect(getHF.mock.calls[0][0]).toBeUndefined();

    const written = JSON.parse(store.get(VAULT_KEY));
    expect(written.hardwareKekVersion).toBe(3); // re-wrap upgrades to a genuine binding
    const newArg = getHF.mock.calls[1][0];
    expect(newArg.kekSalt).toBeInstanceOf(Uint8Array);
    expect(Array.from(newArg.kekSalt)).toEqual(Array.from(saltBytesOf(written.kekSalt)));
    expect(written.kekSalt).not.toBe(kekSalt);
  });
});

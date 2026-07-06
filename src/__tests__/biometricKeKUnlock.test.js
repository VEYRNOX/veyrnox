// src/__tests__/biometricKeKUnlock.test.js
//
// DIRECT FACE-ID → KEK UNLOCK — both-factors-required contract (I6, I4).
//
// THE BUG THIS PINS. A Hardware-KEK-enrolled vault wraps the DEK under
// KEK = HKDF(H ‖ C): H = the hardware factor (biometric-gated platform key), C =
// the Argon2id(secret) factor. A "direct Face ID" unlock releases a CACHED secret
// and hands it to keyStore.unlock() as the C-factor password. If that cached secret
// is NOT the one the vault was wrapped under (e.g. it is the DURESS pin while the
// vault was enrolled under the REAL pin), combineKek yields the wrong KEK and
// unwrapDek FAILS CLOSED with KEK_UNWRAP_FAILED — the seed is never released.
//
// This suite exercises the REAL wallet-core crypto — vault.js (Argon2id + AES-GCM),
// kek.js (HKDF combine + AES-GCM wrap/unwrap), and native.js's KEK unlock path. It
// mocks ONLY the platform plugins (secure-storage / biometric-auth / app) and the H
// SOURCE (getHardwareFactor), exactly as the shipped native tests do. The KEK unwrap
// and its fail-closed check are NEVER mocked — that is the control under test.
//
// It asserts machine CODES (KEK_ERR.*), never prose, because codes are the contract.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shouldAutoCacheTypedPin } from '../lib/authModel';

const VAULT_KEY = 'vault_v1';
const store = new Map();
const setVault = (v) => { if (v == null) store.delete(VAULT_KEY); else store.set(VAULT_KEY, v); };

// Platform secure-store stand-in: a plain in-memory Map. This is the STORAGE layer,
// not the crypto — the vault blob it holds is a REAL Argon2id+AES-GCM/KEK blob.
const secureStoreMock = {
  setKeyPrefix: vi.fn(async () => {}),
  setSynchronize: vi.fn(async () => {}),
  setDefaultKeychainAccess: vi.fn(async () => {}),
  get: vi.fn(async (key) => (store.has(key) ? store.get(key) : null)),
  set: vi.fn(async (key, data) => { store.set(key, data); }),
  remove: vi.fn(async (key) => { const e = store.has(key); store.delete(key); return e; }),
  keys: vi.fn(async () => Array.from(store.keys())),
};
vi.mock('@aparajita/capacitor-secure-storage', () => ({
  SecureStorage: secureStoreMock,
  KeychainAccess: { whenPasscodeSetThisDeviceOnly: 'whenPasscodeSetThisDeviceOnly' },
}));

// Biometric plugin stand-in: the OS sheet always "succeeds" here. The point of this
// suite is the C-factor / KEK math AFTER a successful biometric match, not the sheet.
vi.mock('@aparajita/capacitor-biometric-auth', () => ({
  BiometricAuth: {
    checkBiometry: vi.fn(async () => ({ isAvailable: true, deviceIsSecure: true })),
    authenticate: vi.fn(async () => {}),
  },
}));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn() } }));

// Force the native platform branch so native.js is the keystore under test.
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));

// The HARDWARE FACTOR SOURCE (H). On a real device this is the Secure Enclave /
// StrongBox / WebAuthn-PRF key. In the test it is a deterministic 32-byte value
// BOUND to the vault's per-enrollment kekSalt (v2+/v3 protocol) — so the SAME vault
// always yields the SAME H, exactly like the real per-enrollment binding, and we
// are NOT faking the KEK combine: real kek.js still runs over this H and the real C.
async function deterministicH(opts) {
  let saltBytes = opts && opts.kekSalt ? opts.kekSalt : new Uint8Array(32);
  // v3 protocol may hand the salt across as a base64 STRING (the bridge-safe form);
  // normalize to bytes so H is deterministic either way.
  if (typeof saltBytes === 'string') {
    saltBytes = Uint8Array.from(atob(saltBytes), (c) => c.charCodeAt(0));
  }
  // Hash to a stable 32-byte H so H depends on kekSalt (per-enrollment binding).
  const digest = await crypto.subtle.digest('SHA-256', saltBytes);
  return new Uint8Array(digest);
}

const { nativeKeyStore } = await import('../wallet-core/keystore/native.js');
const { KEK_ERR } = await import('../wallet-core/keystore/kek.js');

// 12-char minimum (H-A) so these secrets are valid on a mainnet build.
const REAL_SECRET = '135724680000';
const DURESS_SECRET = '246813570000';
const SEED = 'legal winner thank year wave sausage worth useful legal winner thank yellow';

async function enrollRealKekVault() {
  // Start from a bare (PIN-only) vault, then enroll the KEK under REAL_SECRET.
  const { encryptVault } = await import('../wallet-core/vault.js');
  const bare = await encryptVault(SEED, REAL_SECRET);
  setVault(JSON.stringify(bare));
  await nativeKeyStore.enrollKek(REAL_SECRET, { getHardwareFactor: deterministicH });
}

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  secureStoreMock.get.mockImplementation(async (key) => (store.has(key) ? store.get(key) : null));
  secureStoreMock.set.mockImplementation(async (key, data) => { store.set(key, data); });
  secureStoreMock.remove.mockImplementation(async (key) => { const e = store.has(key); store.delete(key); return e; });
  secureStoreMock.keys.mockImplementation(async () => Array.from(store.keys()));
});

describe('direct Face ID → KEK unlock: both H and C are required (I6/I4)', () => {
  it('should fail-closed when Face ID is pressed without the C factor (no password)', async () => {
    await enrollRealKekVault();
    // A KEK-enrolled vault with NO getHardwareFactor supplied cannot even source H —
    // the missing-factor path must throw the stable NO_HARDWARE_FACTOR code and NEVER
    // release the seed (fail-closed, I4). This is the "H present but pipeline missing a
    // required factor" contract: the unlock refuses rather than silently degrading.
    await expect(
      nativeKeyStore.unlock(REAL_SECRET, {}),
    ).rejects.toThrow(KEK_ERR.NO_HARDWARE_FACTOR);
  });

  it('should unlock the REAL wallet when Face ID succeeds and the cached secret is the REAL one (no duress)', async () => {
    await enrollRealKekVault();
    // Direct Face ID (no duress configured): the cache holds the REAL secret, so C is
    // correct, H matches the enrollment kekSalt, and the REAL KEK unwraps the DEK.
    const seed = await nativeKeyStore.unlock(REAL_SECRET, { getHardwareFactor: deterministicH });
    expect(seed).toBe(SEED);
  });

  it('should fail-closed with KEK_UNWRAP_FAILED when the cached secret is the DURESS one (wrong C) on a REAL-enrolled KEK vault', async () => {
    await enrollRealKekVault();
    // Face-ID-opens-decoy caches the DURESS secret. Handed to a REAL-enrolled KEK vault
    // as C, combineKek(H, C_duress) yields the WRONG KEK, so unwrapDek FAILS CLOSED with
    // the generic KEK_UNWRAP_FAILED — the real seed is never released down the KEK path.
    // (The decoy itself lives in a SEPARATE duress vault resolved one layer up, in
    // WalletProvider — see duress-biometric-decoy.test.jsx — never through this wrap.)
    await expect(
      nativeKeyStore.unlock(DURESS_SECRET, { getHardwareFactor: deterministicH }),
    ).rejects.toThrow(KEK_ERR.UNWRAP_FAILED);
  });
});

// ── The Face-ID-routing contract that governs WHAT secret gets cached ───────────
//
// Design intent (owner): NO duress PIN → Face ID unlocks the REAL wallet; a duress
// PIN present → Face ID unlocks the DECOY. The DECOY cache is written explicitly by
// the Duress screen opt-in (enableDecoyBiometricUnlock — pinned by
// duress-biometric-decoy.test.jsx). The bug this pins is the OTHER side: the returning
// PIN-unlock screen must NEVER auto-cache the typed PIN once a duress vault exists, or
// a user who unlocks with the REAL PIN would silently make Face ID open the REAL wallet
// (KEK unwraps because C = real C) — breaking coercion resistance. shouldAutoCacheTypedPin
// is the pure decision helper the screen consults.
describe('shouldAutoCacheTypedPin — never auto-cache the REAL pin once duress exists', () => {
  it('caches the typed pin when biometric is ON, nothing cached yet, and NO duress vault (real-wallet Face ID)', () => {
    expect(shouldAutoCacheTypedPin({ biometricEnabled: true, alreadyCached: false, duressConfigured: false })).toBe(true);
  });

  it('does NOT auto-cache the typed pin when a DURESS vault is configured (decoy cache is opt-in only)', () => {
    expect(shouldAutoCacheTypedPin({ biometricEnabled: true, alreadyCached: false, duressConfigured: true })).toBe(false);
  });

  it('does NOT re-cache when a secret is already cached (never clobber the decoy cache)', () => {
    expect(shouldAutoCacheTypedPin({ biometricEnabled: true, alreadyCached: true, duressConfigured: false })).toBe(false);
  });

  it('does NOT cache when biometric unlock is OFF', () => {
    expect(shouldAutoCacheTypedPin({ biometricEnabled: false, alreadyCached: false, duressConfigured: false })).toBe(false);
  });
});

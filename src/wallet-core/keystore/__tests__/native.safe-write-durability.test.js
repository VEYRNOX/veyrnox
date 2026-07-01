// src/wallet-core/keystore/__tests__/native.safe-write-durability.test.js
//
// Durable verified vault write (I4 fail-closed).
//
// ROOT CAUSE (now fixed at the plugin layer): @aparajita/capacitor-secure-storage
// used SharedPreferences.apply() (async) on Android, so writes could be lost on
// app-kill. That is patched to .commit() (synchronous, durable) and device-verified.
//
// The previous journaled safe-write (commit 69ea07f: stage to vault_v1.next +
// recoverVaultJournal on every load) was built on the pre-patch assumption and is
// now HARMFUL — on load it could promote a stale/leftover vault_v1.next blob OVER a
// good kek-dek vault, silently reverting hardware protection. It is REMOVED.
//
// The write is now simply: set(VAULT_KEY) → read back → verify byte-equal → throw
// VAULT_WRITE_VERIFY_FAILED on mismatch. This suite pins:
//   (a) a vault mutation writes durably and a fresh read reflects it,
//   (b) a persisted-value mismatch after write THROWS VAULT_WRITE_VERIFY_FAILED,
//   (c) a pre-existing stale vault_v1.next is NOT promoted — the real VAULT_KEY
//       value wins and the stale journal is cleaned up on init.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Simple durable key-value store. A `set` durably commits (mirrors the patched
// plugin using .commit()); a fresh read returns whatever was last committed.
let store;

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
  encryptVault: vi.fn(async () => ({ v: 1, kdf: 'argon2id', salt: 's', iv: 'iv', ct: 'ct' })),
  decryptVault: vi.fn(async () => 'seed'),
  deriveKekC: vi.fn(async () => new Uint8Array(32).fill(7)),
  encryptVaultWithDek: vi.fn(async () => ({ iv: 'iv2', ct: 'ct2' })),
  decryptVaultWithDek: vi.fn(async () => 'seed'),
};
vi.mock('../../vault.js', () => vaultMock);

const kekMock = {
  combineKek: vi.fn(async () => new Uint8Array(32).fill(9)),
  randomDek: vi.fn(() => new Uint8Array(32).fill(3)),
  wrapDek: vi.fn(async () => ({ v: 1, iv: 'kiv', ct: 'kct' })),
  unwrapDek: vi.fn(async () => new Uint8Array(32).fill(4)),
  KEK_ERR: { NO_HARDWARE_FACTOR: 'NO_HARDWARE_FACTOR', UNWRAP_FAILED: 'UNWRAP_FAILED' },
};
vi.mock('../kek.js', () => kekMock);

vi.mock('../hardware.js', () => ({
  getHardwareFactor: vi.fn(async () => new Uint8Array(32).fill(1)),
  clearHardwareCredential: vi.fn(async () => {}),
}));

const { nativeKeyStore } = await import('../native.js');

const VAULT_KEY = 'vault_v1';
const NEXT_KEY = 'vault_v1.next';
const kekSalt = btoa('s'.repeat(32));
const newHF = () => new Uint8Array(32).fill(1);

// Simulate a cold app launch read of the durably-committed value.
function freshRead(key) {
  return store.has(key) ? store.get(key) : null;
}

function seedBareVault() {
  store.set(VAULT_KEY, JSON.stringify({ v: 1, kdf: 'argon2id', salt: 's', iv: 'x', ct: 'y' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  store = new Map();
  secureStoreMock.get.mockImplementation(async (key) => (store.has(key) ? store.get(key) : null));
  secureStoreMock.set.mockImplementation(async (key, data) => { store.set(key, data); });
  secureStoreMock.remove.mockImplementation(async (key) => { const e = store.has(key); store.delete(key); return e; });
  vaultMock.decryptVault.mockResolvedValue('seed');
  vaultMock.decryptVaultWithDek.mockResolvedValue('seed');
  vaultMock.encryptVault.mockResolvedValue({ v: 1, kdf: 'argon2id', salt: 's', iv: 'x', ct: 'y' });
  vaultMock.encryptVaultWithDek.mockResolvedValue({ iv: 'iv2', ct: 'ct2' });
  vaultMock.deriveKekC.mockResolvedValue(new Uint8Array(32).fill(7));
  kekMock.combineKek.mockResolvedValue(new Uint8Array(32).fill(9));
  kekMock.randomDek.mockReturnValue(new Uint8Array(32).fill(3));
  kekMock.wrapDek.mockResolvedValue({ v: 1, iv: 'kiv', ct: 'kct' });
  kekMock.unwrapDek.mockResolvedValue(new Uint8Array(32).fill(4));
});

describe('(a) durable write — a vault mutation survives a cold launch', () => {
  it('a fresh read after enrollKek returns a vault WITH kekWrap, no temp key', async () => {
    seedBareVault();

    await nativeKeyStore.enrollKek('pw', { getHardwareFactor: async () => newHF() });

    const raw = freshRead(VAULT_KEY);
    expect(raw).not.toBeNull();
    const blob = JSON.parse(raw);
    expect(blob.kekWrap).toBeTruthy();
    expect(blob.kdf).toBe('kek-dek');
    // No journal/temp key is ever written.
    expect(freshRead(NEXT_KEY)).toBeNull();
    expect(secureStoreMock.set).not.toHaveBeenCalledWith(NEXT_KEY, expect.anything());
  });
});

describe('(b) read-back-verify fail-closed (I4)', () => {
  it('enrollKek throws VAULT_WRITE_VERIFY_FAILED when the persisted value does not match', async () => {
    seedBareVault();
    // Model a silent write failure: set() to VAULT_KEY does nothing, so the read-back
    // returns the OLD bare blob and the byte-equality check must fail-closed.
    secureStoreMock.set.mockImplementation(async (key, data) => {
      if (key === VAULT_KEY) return; // silently drop the write
      store.set(key, data);
    });

    await expect(
      nativeKeyStore.enrollKek('pw', { getHardwareFactor: async () => newHF() }),
    ).rejects.toThrow('VAULT_WRITE_VERIFY_FAILED');
  });
});

describe('(c) a stale vault_v1.next journal is NEVER promoted', () => {
  it('hasVaultKekWrap reflects the real kek-dek VAULT_KEY, ignoring a bare stale journal', async () => {
    // The good, durable vault is kek-wrapped.
    store.set(VAULT_KEY, JSON.stringify({ v: 1, kdf: 'kek-dek', salt: 's', iv: 'iv2', ct: 'ct2', kekWrap: { v: 1 }, kekSalt }));
    // A stale bare journal blob lingers from a prior build.
    store.set(NEXT_KEY, JSON.stringify({ v: 1, kdf: 'argon2id', salt: 's', iv: 'x', ct: 'y' }));

    // The real vault wins — hardware protection is NOT reverted by the stale journal.
    expect(await nativeKeyStore.hasVaultKekWrap()).toBe(true);
    // The good vault is untouched (never overwritten by the bare journal).
    expect(JSON.parse(freshRead(VAULT_KEY)).kekWrap).toBeTruthy();
    // The load path NEVER reads the journal key for content (no promote).
    expect(secureStoreMock.get).not.toHaveBeenCalledWith(NEXT_KEY, expect.anything());
  });

  it('hasVault reads only the real VAULT_KEY, never promoting a kek-wrapped journal', async () => {
    seedBareVault();
    store.set(NEXT_KEY, JSON.stringify({ v: 1, kdf: 'kek-dek', kekWrap: { v: 1 } }));

    expect(await nativeKeyStore.hasVault()).toBe(true);
    // The bare vault must NOT have been overwritten by the kek-wrapped journal.
    expect(JSON.parse(freshRead(VAULT_KEY)).kekWrap).toBeUndefined();
    expect(secureStoreMock.get).not.toHaveBeenCalledWith(NEXT_KEY, expect.anything());
  });

  it('cleanupLegacyJournal removes a stale journal on a FRESH init (first storage call)', async () => {
    // Fresh module state proves the init-time cleanup deletes the leftover journal.
    vi.resetModules();
    store = new Map();
    seedBareVault();
    store.set(NEXT_KEY, JSON.stringify({ v: 1, kdf: 'argon2id', iv: 'x', ct: 'y' }));
    const { nativeKeyStore: fresh } = await import('../native.js');

    await fresh.hasVault(); // triggers init() → cleanupLegacyJournal()

    expect(freshRead(NEXT_KEY)).toBeNull();
    expect(JSON.parse(freshRead(VAULT_KEY)).kekWrap).toBeUndefined();
  });
});

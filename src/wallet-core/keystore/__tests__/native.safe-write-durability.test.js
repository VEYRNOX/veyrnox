// src/wallet-core/keystore/__tests__/native.safe-write-durability.test.js
//
// DURABILITY BUG (Android, device-reproduced on Pixel 10 Pro XL).
//
// Confirmed defect mechanism:
//   `SecureStorage.set(VAULT_KEY, newBlob)` OVER an already-existing key does NOT
//   durably overwrite the item on Android. In-session read-back returns the NEW
//   blob (the write "works" in-process), but every FRESH read (cold app launch /
//   new process) returns the ORIGINAL blob — the update is silently lost. Net
//   effect: enrollKek / unenrollKek / changePassword never persist across restart,
//   so the hardware-KEK badge lies and unlock never truly gates on the KEK.
//
// This suite MODELS non-durable overwrite with a fake store that has two layers:
//   - `committed`  : what a FRESH read (new process) would return.
//   - `session`    : the in-session view a `set` mutates.
// A plain `set` over an existing committed key updates ONLY `session` (mirrors the
// Android bug). `remove` is what actually deletes the committed item; a `set` on a
// key that has NO committed value commits durably. `freshRead()` simulates a cold
// launch by discarding the session layer.
//
// The fix is a journaled safe-write: write to a temp key (durably, since temp has
// no prior committed value), read-back-verify, then promote (remove main + set),
// read-back-verify again (fail-closed), then delete temp. On load, recover a
// leftover temp if the main write did not complete.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Fake secure store that reproduces Android non-durable overwrite ----
// committed = cold-launch truth; session = in-process view.
let committed;
let session;

function makeStore() {
  committed = new Map();
  session = new Map();
  return {
    setKeyPrefix: vi.fn(async () => {}),
    setSynchronize: vi.fn(async () => {}),
    setDefaultKeychainAccess: vi.fn(async () => {}),
    get: vi.fn(async (key) => {
      if (session.has(key)) return session.get(key);
      return committed.has(key) ? committed.get(key) : null;
    }),
    set: vi.fn(async (key, data) => {
      // Android bug: a set OVER an existing committed key does NOT durably
      // overwrite — only the in-session view changes. A set on a key with no
      // committed value DOES commit durably (fresh item insert works).
      session.set(key, data);
      if (!committed.has(key)) committed.set(key, data);
    }),
    remove: vi.fn(async (key) => {
      const existed = committed.has(key) || session.has(key);
      committed.delete(key);
      session.delete(key);
      return existed;
    }),
  };
}

const secureStoreMock = makeStore();
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

// Simulate a cold app launch: the in-process session layer is gone; only the
// durably-committed values survive.
function freshRead(key) {
  return committed.has(key) ? committed.get(key) : null;
}

// Seed the store as if createVault ran and durably committed a BARE vault.
function seedBareVault() {
  const bare = JSON.stringify({ v: 1, kdf: 'argon2id', salt: 's', iv: 'x', ct: 'y' });
  committed.set(VAULT_KEY, bare);
}

beforeEach(() => {
  vi.clearAllMocks();
  committed = new Map();
  session = new Map();
  // Restore the default (Android-bug-modelling) set implementation — a prior test
  // may have overridden it via mockImplementation, which clearAllMocks does NOT reset.
  secureStoreMock.set.mockImplementation(async (key, data) => {
    session.set(key, data);
    if (!committed.has(key)) committed.set(key, data);
  });
  secureStoreMock.get.mockImplementation(async (key) => {
    if (session.has(key)) return session.get(key);
    return committed.has(key) ? committed.get(key) : null;
  });
  secureStoreMock.remove.mockImplementation(async (key) => {
    const existed = committed.has(key) || session.has(key);
    committed.delete(key);
    session.delete(key);
    return existed;
  });
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

describe('enrollKek durability — the vault UPDATE survives a cold launch', () => {
  it('a fresh read after enrollKek returns a vault WITH kekWrap (durable overwrite)', async () => {
    seedBareVault();

    await nativeKeyStore.enrollKek('pw', { getHardwareFactor: async () => newHF() });

    // Cold-launch read: the committed truth MUST now be the kek-wrapped blob.
    const raw = freshRead(VAULT_KEY);
    expect(raw).not.toBeNull();
    const blob = JSON.parse(raw);
    expect(blob.kekWrap).toBeTruthy();
    expect(blob.kdf).toBe('kek-dek');
    // No leftover journal key after a successful mutation.
    expect(freshRead(NEXT_KEY)).toBeNull();
  });
});

describe('read-back-verify fail-closed (I4) — a silent write failure THROWS', () => {
  it('enrollKek throws if the promoted vault does not match what was written', async () => {
    seedBareVault();
    // Simulate a store that accepts the promote set() but silently drops it so the
    // committed value never actually changes (worst-case non-durable overwrite even
    // for the promote). The read-back-verify MUST catch this and throw.
    secureStoreMock.set.mockImplementation(async (key, data) => {
      if (key === NEXT_KEY) {
        // temp write works durably (fresh key)
        session.set(key, data);
        committed.set(key, data);
        return;
      }
      // VAULT_KEY promote: pretend it did nothing at all (silent failure).
    });

    await expect(
      nativeKeyStore.enrollKek('pw', { getHardwareFactor: async () => newHF() }),
    ).rejects.toThrow();
  });
});

describe('crash-safety — a crash between temp-write and promote leaves a RECOVERABLE state', () => {
  it('load recovers the verified journal when the main promote never happened', async () => {
    // Model the crash: temp (.next) holds a verified new kek-wrapped blob, but the
    // main VAULT_KEY still holds the OLD bare blob (promote never ran). This must
    // NOT be a lost vault — hasVault must be true and a fresh read must recover a
    // consistent vault (prefer the verified journal).
    seedBareVault();
    const nextBlob = JSON.stringify({ v: 1, kdf: 'kek-dek', salt: 's', iv: 'iv2', ct: 'ct2', kekWrap: { v: 1 }, kekSalt });
    committed.set(NEXT_KEY, nextBlob);

    // A cold launch sees both keys; recovery must present a consistent vault.
    expect(await nativeKeyStore.hasVault()).toBe(true);
    // After recovery the enrolled state must reflect the verified journal (kekWrap).
    expect(await nativeKeyStore.hasVaultKekWrap()).toBe(true);
    // And the journal must be cleaned up / promoted so a subsequent fresh read is clean.
    expect(freshRead(NEXT_KEY)).toBeNull();
    expect(JSON.parse(freshRead(VAULT_KEY)).kekWrap).toBeTruthy();
  });
});

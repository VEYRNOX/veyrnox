// src/wallet-core/keystore/__tests__/native.lock-suppression-coverage.test.js
//
// AUDIT L1 (LOW) — changePassword and saveVaultContents open OS biometric sheets, so
// an appStateChange (pause / !isActive) lock hook can fire mid-operation and navigate
// the user away. unlock / enrollKek / unenrollKek already run under withLockSuppressed;
// these two did NOT. This pins that BOTH now run under lock suppression, matching the
// other three biometric-gated methods.
//
// OBSERVABLE: native.js wires App pause/appStateChange listeners that call fireLockHook(),
// which invokes the registered lock hook UNLESS _lockSuppressDepth > 0. We capture the
// registered appStateChange listener, register a lock hook, then fire the listener from
// INSIDE the operation (via a mocked biometric/crypto step). If the op runs under
// suppression, the lock hook must NOT fire during the op.
//
// The native plugin is mocked (established JS-orchestration-only pattern). Robustness
// guard, not native proof — the crypto and write ordering are unchanged.

import { describe, it, expect, vi, beforeEach } from 'vitest';

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

// Capture every listener registered so a test can fire the appStateChange handler
// (the pause path native.js wires to fireLockHook).
const listeners = { pause: [], appStateChange: [] };
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn((event, cb) => {
      if (event === 'pause') listeners.pause.push(cb);
      if (event === 'appStateChange') listeners.appStateChange.push(cb);
      return { remove: () => {} };
    }),
  },
}));

const vaultMock = {
  encryptVault: vi.fn(async () => ({ v: 1, kdf: 'argon2id', salt: 's', iv: 'iv', ct: 'ct' })),
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
  KEK_ERR: { NO_HARDWARE_FACTOR: 'NO_HARDWARE_FACTOR', UNWRAP_FAILED: 'UNWRAP_FAILED' },
  // I/O-boundary helpers (real behaviour) so callers can decode a valid kekSalt / parse a blob.
  MALFORMED_VAULT: 'KEK_MALFORMED_VAULT',
  decodeKekSalt: (kekSalt) => {
    if (typeof kekSalt !== 'string' || kekSalt.length === 0) throw new Error('KEK_MALFORMED_VAULT');
    let bin; try { bin = atob(kekSalt); } catch { throw new Error('KEK_MALFORMED_VAULT'); }
    const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out;
  },
  parseVaultBlob: (raw) => {
    if (raw && typeof raw === 'object') return raw;
    if (typeof raw !== 'string') throw new Error('KEK_MALFORMED_VAULT');
    try { return JSON.parse(raw); } catch { throw new Error('KEK_MALFORMED_VAULT'); }
  },
};
vi.mock('../kek.js', () => kekMock);

vi.mock('../hardware.js', () => ({
  getHardwareFactor: vi.fn(async () => new Uint8Array(32).fill(1)),
  clearHardwareCredential: vi.fn(async () => {}),
}));

// M2c enclave plugin: hwUnwrap presents the OS biometric prompt (the appStateChange
// pause source) inside downgradeFromHardwareWrap. Lazy-imported by native.js.
const enclaveMock = {
  isHardwareKeyAvailable: vi.fn(async () => ({ backing: 'none', biometryEnrolled: false })),
  createWrappingKey: vi.fn(async () => {}),
  hwWrap: vi.fn(async () => 'ct'),
  hwUnwrap: vi.fn(async () => btoa(JSON.stringify({ v: 1, kdf: 'argon2id', salt: 's', iv: 'x', ct: 'y' }))),
  deleteWrappingKey: vi.fn(async () => {}),
};
vi.mock('../../../plugins/veyrnoxEnclave.js', () => enclaveMock);

const { nativeKeyStore } = await import('../native.js');

const kekSalt = btoa('s'.repeat(32));
const newHF = () => new Uint8Array(32).fill(1);

// Fire the appStateChange listener as though the OS backgrounded the app (the pause
// event that a biometric sheet triggers). Returns the lock hook's call count after.
function fireAppBackground() {
  for (const cb of listeners.appStateChange) cb({ isActive: false });
  for (const cb of listeners.pause) cb();
}

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  // NOTE: do NOT clear the captured listeners here. native.js wires its App
  // pause/appStateChange listeners exactly once (init() is memoized), so clearing
  // them between tests would strand the capture — the module never re-registers.
  secureStoreMock.get.mockImplementation(async (key) => (store.has(key) ? store.get(key) : null));
  secureStoreMock.set.mockImplementation(async (key, data) => { store.set(key, data); });
  vaultMock.deriveKekC.mockResolvedValue(new Uint8Array(32).fill(7));
  vaultMock.decryptVault.mockResolvedValue('seed');
  vaultMock.decryptVaultWithDek.mockResolvedValue('seed');
  vaultMock.encryptVault.mockResolvedValue({ v: 1, kdf: 'argon2id', salt: 's', iv: 'iv', ct: 'ct' });
  vaultMock.encryptVaultWithDek.mockResolvedValue({ iv: 'newiv', ct: 'newct' });
  kekMock.combineKek.mockResolvedValue(new Uint8Array(32).fill(9));
  kekMock.unwrapDek.mockResolvedValue(new Uint8Array(32).fill(4));
  enclaveMock.hwUnwrap.mockResolvedValue(btoa(JSON.stringify({ v: 1, kdf: 'argon2id', salt: 's', iv: 'x', ct: 'y' })));
  enclaveMock.deleteWrappingKey.mockResolvedValue(undefined);
});

describe('L1 — changePassword runs under lock suppression', () => {
  it('does NOT fire the lock hook when the app backgrounds mid-changePassword (bare vault)', async () => {
    setVault(JSON.stringify({ v: 1, kdf: 'argon2id', salt: 's', iv: 'x', ct: 'y' }));
    const lockHook = vi.fn();
    nativeKeyStore.setLockHook(lockHook);

    // Fire the OS background event DURING the operation, from inside a mocked step.
    vaultMock.decryptVault.mockImplementationOnce(async () => {
      fireAppBackground();
      return 'seed';
    });

    await nativeKeyStore.changePassword('old', 'new', { getHardwareFactor: async () => newHF() });

    expect(lockHook).not.toHaveBeenCalled();
    nativeKeyStore.setLockHook(null);
  });

  it('does NOT fire the lock hook when the app backgrounds mid-changePassword (KEK vault)', async () => {
    setVault(JSON.stringify({ v: 1, kdf: 'kek-dek', iv: 'x', ct: 'y', kekWrap: { v: 1 }, kekSalt }));
    const lockHook = vi.fn();
    nativeKeyStore.setLockHook(lockHook);

    kekMock.unwrapDek.mockImplementationOnce(async () => {
      fireAppBackground();
      return new Uint8Array(32).fill(4);
    });

    await nativeKeyStore.changePassword('old', 'new', { getHardwareFactor: async () => newHF() });

    expect(lockHook).not.toHaveBeenCalled();
    nativeKeyStore.setLockHook(null);
  });
});

describe('L1 — saveVaultContents runs under lock suppression', () => {
  it('does NOT fire the lock hook when the app backgrounds mid-saveVaultContents (KEK vault)', async () => {
    setVault(JSON.stringify({ v: 1, kdf: 'kek-dek', iv: 'x', ct: 'y', kekWrap: { v: 1 }, kekSalt }));
    const lockHook = vi.fn();
    nativeKeyStore.setLockHook(lockHook);

    kekMock.unwrapDek.mockImplementationOnce(async () => {
      fireAppBackground();
      return new Uint8Array(32).fill(4);
    });

    await nativeKeyStore.saveVaultContents('NEW', 'pw', { getHardwareFactor: async () => newHF() });

    expect(lockHook).not.toHaveBeenCalled();
    nativeKeyStore.setLockHook(null);
  });

  it('does NOT fire the lock hook when the app backgrounds mid-saveVaultContents (bare vault)', async () => {
    setVault(JSON.stringify({ v: 1, kdf: 'argon2id', salt: 's', iv: 'x', ct: 'y' }));
    const lockHook = vi.fn();
    nativeKeyStore.setLockHook(lockHook);

    vaultMock.encryptVault.mockImplementationOnce(async () => {
      fireAppBackground();
      return { v: 1, kdf: 'argon2id', salt: 's', iv: 'iv', ct: 'ct' };
    });

    await nativeKeyStore.saveVaultContents('NEW', 'pw', {});

    expect(lockHook).not.toHaveBeenCalled();
    nativeKeyStore.setLockHook(null);
  });
});

describe('M-9 — downgradeFromHardwareWrap runs under lock suppression', () => {
  it('does NOT fire the lock hook when the app backgrounds mid-downgradeFromHardwareWrap', async () => {
    // Enclave-wrapped record so downgrade reaches hwUnwrap (the OS biometric prompt).
    setVault(JSON.stringify({ wrap: 'enclave-v1', hw: 'ciphertext' }));
    const lockHook = vi.fn();
    nativeKeyStore.setLockHook(lockHook);

    // Fire the OS background event DURING the biometric-gated unwrap.
    enclaveMock.hwUnwrap.mockImplementationOnce(async () => {
      fireAppBackground();
      return btoa(JSON.stringify({ v: 1, kdf: 'argon2id', salt: 's', iv: 'x', ct: 'y' }));
    });

    await nativeKeyStore.downgradeFromHardwareWrap();

    expect(lockHook).not.toHaveBeenCalled();
    nativeKeyStore.setLockHook(null);
  });
});

describe('L1 — control: the lock hook DOES fire when NOT inside a suppressed op', () => {
  it('fires the registered lock hook on a background event outside any operation', async () => {
    // Trigger init() so the App listeners are wired.
    setVault(null);
    await nativeKeyStore.hasVault();
    const lockHook = vi.fn();
    nativeKeyStore.setLockHook(lockHook);

    fireAppBackground();

    expect(lockHook).toHaveBeenCalled();
    nativeKeyStore.setLockHook(null);
  });
});

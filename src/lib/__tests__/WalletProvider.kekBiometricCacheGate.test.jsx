// KEK-vault biometric unlock: skip the redundant app-layer cache-gate (triple-prompt fix).
//
// THE BUG THIS PINS. On a KEK-enrolled NATIVE vault, one-tap biometric unlock fires
// THREE OS biometric prompts:
//   #1  the JS cache-gate — retrieveUnlockSecret() → nativeAuthenticateOrThrow() →
//       BiometricAuth.authenticate — gating the read of the cached PIN Keychain item.
//   #2  Secure-Enclave key retrieval (HardwareKekPlugin.m SecItemCopyMatching).
//   #3  Secure-Enclave decrypt (HardwareKekPlugin.m SecKeyCreateDecryptedData).
// Prompts #2/#3 are inherent to the SE design (one biometric evaluation per ACL-gated
// operation) and are CORRECT — the native plugin is not touched. Prompt #1 is
// REDUNDANT for a KEK vault: the cached PIN alone is useless without H (the SE-derived
// hardware factor), and H is producible ONLY by passing the hardware-enforced SE gate
// (#2/#3). The DEK = HKDF(H ‖ C); reading the cached C without H unwraps nothing.
//
// So for a KEK vault we drop the app-layer cache-gate (retrieveUnlockSecretDirect,
// which reads the cached PIN WITHOUT BiometricAuth.authenticate) and rely solely on
// the unbypassable SE gate inside keyStore.unlock(). For a NON-KEK vault the cache-gate
// IS the sole biometric gate and MUST be preserved.
//
// We exercise the REAL WalletProvider and the REAL lib/biometricUnlock.js chokepoint
// (NOT mocked) so BiometricAuth.authenticate is genuinely reached (or not). Only the
// Capacitor plugins (secure-storage / biometric-auth / app / core), getBiometricStatus,
// and the keystore seam are stood in — exactly as the shipped native tests do. The
// contract under test is the CALL to BiometricAuth.authenticate (the cache-gate), so we
// assert on its call count, never on prose.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';

// ── Native platform + Capacitor plugin stand-ins ────────────────────────────────
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));

// Force DEMO false so lib/biometricUnlock.js takes the REAL native branch (which fires
// BiometricAuth.authenticate as the cache-gate) rather than the in-memory demo path.
// (In vitest import.meta.env.DEV is true + native is mocked, which would otherwise make
// DEMO resolve true and short-circuit the very gate under test.) All other demoClient
// exports are preserved so WalletProvider's wider deps are unaffected.
vi.mock('@/api/demoClient', async (orig) => {
  const actual = /** @type {any} */ (await orig());
  return { ...actual, DEMO: false };
});
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn(() => ({ remove: vi.fn() })) } }));

// In-memory secure store holding the cached PIN. This is the STORAGE layer, not a gate.
const secureStore = new Map();
const secureStoreMock = {
  setKeyPrefix: vi.fn(async () => {}),
  setSynchronize: vi.fn(async () => {}),
  setDefaultKeychainAccess: vi.fn(async () => {}),
  get: vi.fn(async (key) => (secureStore.has(key) ? secureStore.get(key) : null)),
  set: vi.fn(async (key, data) => { secureStore.set(key, data); }),
  remove: vi.fn(async (key) => { const e = secureStore.has(key); secureStore.delete(key); return e; }),
  keys: vi.fn(async () => Array.from(secureStore.keys())),
};
vi.mock('@aparajita/capacitor-secure-storage', () => ({
  SecureStorage: secureStoreMock,
  KeychainAccess: { whenPasscodeSetThisDeviceOnly: 'whenPasscodeSetThisDeviceOnly' },
}));

// The app-layer cache-gate under test. authenticate() is the exact call we count.
const bioAuth = {
  checkBiometry: vi.fn(async () => ({ isAvailable: true, deviceIsSecure: true })),
  authenticate: vi.fn(async () => {}),
};
vi.mock('@aparajita/capacitor-biometric-auth', () => ({ BiometricAuth: bioAuth }));

// Native biometric status so unlockWithBiometric takes the native (non-demo) branch.
vi.mock('@/lib/biometric', async (orig) => {
  const actual = /** @type {any} */ (await orig());
  return {
    ...actual,
    getBiometricStatus: vi.fn(async () => ({
      mode: 'native', available: true, label: 'Face ID', simulated: false,
      detail: 'Face ID is set up on this device.',
    })),
  };
});

// Keystore seam: a controllable KEK-wrap flag + a spy unlock that records reaching
// the vault. The SE gate lives inside keyStore.unlock() on a real device; here we only
// need to confirm the provider forwarded the (directly-read) cached PIN to it.
// A valid BIP-39 mnemonic so the provider's post-unlock parseVault() accepts the
// keystore's decrypted payload (legacy-bare path → migrated container).
const SEED = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const kekState = { enrolled: false };
const unlockSpy = vi.fn(async () => SEED);
vi.mock('@/wallet-core/keystore', () => ({
  getKeyStore: () => ({
    isSecureHardwareAvailable: async () => true,
    hasVault: async () => true,
    hasVaultKekWrap: async () => kekState.enrolled,
    getHardwareFactor: async () => new Uint8Array(32),
    unlock: (...a) => unlockSpy(...a),
    saveVaultContents: async () => {},
    changePassword: async () => {},
    createVault: async () => {},
    lock: () => {},
    setLockHook: () => {},
    suppressLock: async (fn) => fn(),
  }),
  webKeyStore: {},
  // WalletProvider imports this module-level facade directly (R2 lock
  // suppression, issue #627 burn-down) — pass straight through in tests.
  withLockSuppressed: async (fn) => fn(),
}));

import { WalletProvider, useWallet } from '@/lib/WalletProvider';
import { setAuthModel, clearAuthModel } from '@/lib/authModel';
import { setBiometricUnlockEnabled } from '@/lib/biometric';
import { storeUnlockSecret } from '@/lib/biometricUnlock';

const REAL_PIN = '135724680000';

let ctx;
function Capture() { ctx = useWallet(); return null; }
async function renderProvider() {
  await act(async () => { render(<WalletProvider><Capture /></WalletProvider>); });
}

beforeEach(async () => {
  vi.clearAllMocks();
  secureStore.clear();
  secureStoreMock.get.mockImplementation(async (key) => (secureStore.has(key) ? secureStore.get(key) : null));
  secureStoreMock.set.mockImplementation(async (key, data) => { secureStore.set(key, data); });
  secureStoreMock.keys.mockImplementation(async () => Array.from(secureStore.keys()));
  kekState.enrolled = false;
  try { localStorage.clear(); } catch { /* shimmed */ }
  setBiometricUnlockEnabled(true);
  setAuthModel('pin');
  // Seed the biometric cache with the real PIN (as first-run create/import would).
  await storeUnlockSecret(REAL_PIN);
});
afterEach(() => { cleanup(); clearAuthModel(); });

describe('unlockWithBiometric — KEK vaults skip the redundant app-layer cache-gate', () => {
  it('KEK-enrolled vault: does NOT call BiometricAuth.authenticate (cache-gate removed)', async () => {
    kekState.enrolled = true;
    await renderProvider();

    await act(async () => { await ctx.unlockWithBiometric(); });

    // The cache-gate (prompt #1) must NOT fire — the SE gate inside keyStore.unlock()
    // is the sole, hardware-enforced biometric protection for a KEK vault.
    expect(bioAuth.authenticate).not.toHaveBeenCalled();
    // The unlock still reached the keystore with the directly-read cached PIN.
    expect(unlockSpy).toHaveBeenCalledTimes(1);
    expect(unlockSpy.mock.calls[0][0]).toBe(REAL_PIN);
  });

  it('NON-KEK vault: STILL calls BiometricAuth.authenticate once (cache-gate is the sole gate)', async () => {
    kekState.enrolled = false;
    await renderProvider();

    await act(async () => { await ctx.unlockWithBiometric(); });

    // The cache-gate is the ONLY biometric gate here and must be preserved.
    expect(bioAuth.authenticate).toHaveBeenCalledTimes(1);
    expect(unlockSpy).toHaveBeenCalledTimes(1);
    expect(unlockSpy.mock.calls[0][0]).toBe(REAL_PIN);
  });
});

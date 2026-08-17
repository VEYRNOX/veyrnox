// One-tap biometric unlock: the app-layer cache-gate fires for EVERY vault, KEK or not.
//
// ⚠️ DO NOT "OPTIMISE" THIS BACK. This file pins a deliberate revert, not an oversight.
// The prompt count here is the settled shape — see docs/Feature-Status.md
// "2026-08-17 — one-tap biometric prompt count" before changing anything below.
//
// WHAT THIS FILE USED TO ASSERT, AND WHY IT NO LONGER DOES.
// PR #1821/#694 lineage shipped a "triple-prompt fix": on a KEK-enrolled native vault,
// one-tap unlock fired THREE OS biometric prompts —
//   #1  the JS cache-gate — retrieveUnlockSecret() → nativeAuthenticateOrThrow() →
//       BiometricAuth.authenticate — gating the read of the cached PIN Keychain item;
//   #2  Secure-Enclave key retrieval (HardwareKekPlugin.m SecItemCopyMatching);
//   #3  Secure-Enclave decrypt (HardwareKekPlugin.m SecKeyCreateDecryptedData).
// The reasoning for dropping #1 was sound ON PAPER: for a KEK vault the cached PIN is
// the C-factor ONLY, the DEK = HKDF(H ‖ C), and H is producible only by passing the
// hardware-enforced SE gate (#2/#3) — so reading C without H unwraps nothing and the
// app-layer gate cannot strengthen a KEK vault. A KEK branch therefore read the cache
// via retrieveUnlockSecretDirect(), skipping BiometricAuth.authenticate, and this file
// asserted that skip.
//
// PR #1881 REVERTED IT, device-confirmed. Suppressing prompt #1 did not survive real
// hardware: the FaceID sheet's appStateChange(isActive:false) pause interacts with the
// unlock flow, and the optimisation was confirmed insufficient on KEK vaults on device
// (iPhone 17 Pro Max / Pixel 10 Pro XL). #1881's primary change — wrapping the whole
// unlock() body in withLockSuppressed so a queued appStateChange cannot fire lock()
// mid-unlock and throw UNLOCK_SUPERSEDED — is the load-bearing fix; the prompt-count
// revert shipped alongside it. Both KEK and non-KEK now take the same path:
//   password = await withLockSuppressed(() => retrieveUnlockSecret())
// so BiometricAuth.authenticate fires exactly once for every vault.
//
// THE COST, STATED HONESTLY. A KEK one-tap unlock is back to three biometric prompts.
// That is an accepted UX cost of a working unlock, NOT a solved problem — tracked
// separately. Anyone re-attempting the optimisation must re-verify on a real device
// FIRST and update this file with that evidence; making these assertions pass by
// relaxing them would delete the record of a security-relevant prompt-count change.
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
// need to confirm the provider forwarded the cached PIN to it.
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

describe('unlockWithBiometric — the app-layer cache-gate fires for every vault (#1881 revert)', () => {
  it('KEK-enrolled vault: STILL calls BiometricAuth.authenticate once (optimisation reverted, #1881)', async () => {
    kekState.enrolled = true;
    await renderProvider();

    await act(async () => { await ctx.unlockWithBiometric(); });

    // Prompt #1 fires again for KEK vaults. Re-introducing a KEK branch that reads the
    // cache without authenticating turns this red — which is the point. Re-verify on a
    // real device and rewrite this file with that evidence before changing it.
    expect(bioAuth.authenticate).toHaveBeenCalledTimes(1);
    // The unlock still reached the keystore with the cached PIN.
    expect(unlockSpy).toHaveBeenCalledTimes(1);
    expect(unlockSpy.mock.calls[0][0]).toBe(REAL_PIN);
  });

  it('NON-KEK vault: calls BiometricAuth.authenticate once (cache-gate is the sole gate)', async () => {
    kekState.enrolled = false;
    await renderProvider();

    await act(async () => { await ctx.unlockWithBiometric(); });

    // For a non-KEK vault the cache-gate is the ONLY biometric protection over the
    // cached password — it was never in scope for the reverted optimisation and must
    // never be dropped (I4).
    expect(bioAuth.authenticate).toHaveBeenCalledTimes(1);
    expect(unlockSpy).toHaveBeenCalledTimes(1);
    expect(unlockSpy.mock.calls[0][0]).toBe(REAL_PIN);
  });

  it('KEK and non-KEK take the SAME path — no vault-shape branch on the cache-gate', async () => {
    // The revert's actual contract: one code path, not two. A future branch that gates
    // on hasVaultKekWrap() would make these two counts differ.
    kekState.enrolled = true;
    await renderProvider();
    await act(async () => { await ctx.unlockWithBiometric(); });
    const kekCalls = bioAuth.authenticate.mock.calls.length;

    cleanup();
    bioAuth.authenticate.mockClear();
    unlockSpy.mockClear();

    kekState.enrolled = false;
    await renderProvider();
    await act(async () => { await ctx.unlockWithBiometric(); });
    const nonKekCalls = bioAuth.authenticate.mock.calls.length;

    expect(kekCalls).toBe(nonKekCalls);
    expect(kekCalls).toBe(1);
  });
});

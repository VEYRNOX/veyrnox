// Tests for the biometric one-tap unlock CACHE (lib/biometricUnlock.js) — NATIVE
// path. These pin the SECURITY INVARIANT that the hardening is about:
//
//   The cached vault password is RELEASED ONLY after a fresh, OS-enforced
//   biometric match. retrieveUnlockSecret() is the single chokepoint; it calls
//   the OS authenticate() FIRST and reads the secret SECOND, and a cancelled or
//   failed match means the secret is NEVER read from the store.
//
// We also pin that a presence check (hasStoredUnlockSecret) does NOT prompt — so
// the entry screen can offer the one-tap button without firing Face ID.
//
// The Capacitor plugins are dynamically imported inside the module, so we mock
// both the secure store and the biometric-auth plugin. The vault crypto is never
// touched here.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Hoisted, mutable mock state shared with the vi.mock factories below.
const h = vi.hoisted(() => ({
  store: new Map(),
  calls: [], // ordered log of 'authenticate' / 'get' to prove the precondition
  authImpl: null, // per-test override for authenticate() behaviour
  checkBiometryResult: { isAvailable: true, deviceIsSecure: true },
}));

vi.mock('@/api/demoClient', () => ({ DEMO: false }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));

vi.mock('@aparajita/capacitor-secure-storage', () => ({
  KeychainAccess: { whenPasscodeSetThisDeviceOnly: 4 },
  SecureStorage: {
    setKeyPrefix: vi.fn(async () => {}),
    setSynchronize: vi.fn(async () => {}),
    setDefaultKeychainAccess: vi.fn(async () => {}),
    set: vi.fn(async (k, v) => { h.store.set(k, String(v)); }),
    get: vi.fn(async (k) => { h.calls.push('get'); return h.store.has(k) ? h.store.get(k) : null; }),
    keys: vi.fn(async () => { h.calls.push('keys'); return Array.from(h.store.keys()); }),
    remove: vi.fn(async (k) => { const had = h.store.has(k); h.store.delete(k); return had; }),
  },
}));

vi.mock('@aparajita/capacitor-biometric-auth', () => ({
  BiometricAuth: {
    checkBiometry: vi.fn(async () => h.checkBiometryResult),
    authenticate: vi.fn(async (opts) => {
      h.calls.push('authenticate');
      if (h.authImpl) return h.authImpl(opts);
      return undefined; // default: biometric match succeeds
    }),
  },
}));

import {
  biometricUnlockSupported,
  storeUnlockSecret,
  retrieveUnlockSecret,
  retrieveUnlockSecretDirect,
  hasStoredUnlockSecret,
  clearUnlockSecret,
} from '@/lib/biometricUnlock';

const NATIVE_KEY = 'bio_unlock_secret';

beforeEach(() => {
  h.store.clear();
  h.calls.length = 0;
  h.authImpl = null;
  h.checkBiometryResult = { isAvailable: true, deviceIsSecure: true };
  vi.clearAllMocks();
});

describe('biometricUnlock — NATIVE (OS biometric-gated secure-store cache)', () => {
  it('is supported on a native platform', () => {
    expect(biometricUnlockSupported()).toBe(true);
  });

  it('stores then releases the password — but ONLY after a biometric match, in that order', async () => {
    expect(await storeUnlockSecret('correct horse battery staple')).toBe(true);

    const pw = await retrieveUnlockSecret();
    expect(pw).toBe('correct horse battery staple');

    // THE INVARIANT: authenticate() ran, and it ran BEFORE the store was read.
    const authIdx = h.calls.indexOf('authenticate');
    const getIdx = h.calls.indexOf('get');
    expect(authIdx).toBeGreaterThanOrEqual(0);
    expect(getIdx).toBeGreaterThanOrEqual(0);
    expect(authIdx).toBeLessThan(getIdx);
  });

  it('CANCEL/FAIL: a failed biometric match throws and the secret is NEVER read', async () => {
    await storeUnlockSecret('top-secret');
    // Simulate the user cancelling the OS Face ID sheet.
    h.authImpl = () => { const e = new Error('User cancelled'); e.code = 'userCancel'; throw e; };

    await expect(retrieveUnlockSecret()).rejects.toThrow();

    // The plaintext store read must not have happened at all.
    expect(h.calls).toContain('authenticate');
    expect(h.calls).not.toContain('get');
  });

  it('LOCKOUT: falls back ONCE to the device credential, then releases the secret', async () => {
    await storeUnlockSecret('locked-out-pw');
    let n = 0;
    h.authImpl = () => {
      n += 1;
      if (n === 1) { const e = new Error('locked out'); e.code = 'biometryLockout'; throw e; }
      return undefined; // second call (allowDeviceCredential) succeeds
    };

    expect(await retrieveUnlockSecret()).toBe('locked-out-pw');
    // Two authenticate attempts, and the read still came after them.
    expect(h.calls.filter((c) => c === 'authenticate')).toHaveLength(2);
    expect(h.calls.lastIndexOf('authenticate')).toBeLessThan(h.calls.indexOf('get'));
  });

  it('throws (no read) when the device has no biometrics AND no passcode', async () => {
    await storeUnlockSecret('unreachable');
    h.checkBiometryResult = { isAvailable: false, deviceIsSecure: false };

    await expect(retrieveUnlockSecret()).rejects.toThrow(/passcode or biometrics/i);
    expect(h.calls).not.toContain('get');
  });

  it('presence check (hasStoredUnlockSecret) reports correctly and NEVER prompts or reads the value', async () => {
    expect(await hasStoredUnlockSecret()).toBe(false);

    await storeUnlockSecret('present');
    expect(await hasStoredUnlockSecret()).toBe(true);

    // Metadata only: no biometric prompt, no plaintext read.
    expect(h.calls).not.toContain('authenticate');
    expect(h.calls).not.toContain('get');
  });

  it('clearing wipes the item so it can no longer be released', async () => {
    await storeUnlockSecret('to-be-wiped');
    expect(h.store.has(NATIVE_KEY)).toBe(true);

    await clearUnlockSecret();
    expect(h.store.has(NATIVE_KEY)).toBe(false);
    expect(await hasStoredUnlockSecret()).toBe(false);

    // With nothing stored, a (biometric-passing) retrieve returns null, not a stale secret.
    expect(await retrieveUnlockSecret()).toBe(null);
  });

  it('overwrites the cached password (e.g. after a password change)', async () => {
    await storeUnlockSecret('old-password');
    await storeUnlockSecret('new-password');
    expect(await retrieveUnlockSecret()).toBe('new-password');
  });
});

// retrieveUnlockSecretDirect — the KEK-only path that INTENTIONALLY skips the app-layer
// cache-gate. Its whole reason to exist is that on a KEK vault the Secure Enclave /
// StrongBox gate inside keyStore.unlock() is the sole hardware-enforced biometric gate,
// so the app-layer BiometricAuth.authenticate here is a redundant THIRD prompt. These
// tests pin: (1) it reads the store WITHOUT authenticate() first, and (2) it still fails
// safe (null, not a stale/undefined value) when nothing is cached. The security contract
// — only ever call this on a hasVaultKekWrap()===true vault — is enforced by the CALLER
// (WalletProvider.unlockWithBiometric), pinned in WalletProvider.kekBiometricCacheGate.test.jsx.
describe('biometricUnlock — retrieveUnlockSecretDirect (KEK-only, no app-layer cache-gate)', () => {
  it('releases the cached password WITHOUT calling BiometricAuth.authenticate', async () => {
    await storeUnlockSecret('kek-cached-pin');

    const pw = await retrieveUnlockSecretDirect();
    expect(pw).toBe('kek-cached-pin');

    // The invariant that distinguishes it from retrieveUnlockSecret: NO app-layer
    // biometric prompt fired — the store was read directly.
    expect(h.calls).not.toContain('authenticate');
    expect(h.calls).toContain('get');
  });

  it('returns null (no stale/undefined leak) when nothing is cached', async () => {
    expect(await retrieveUnlockSecretDirect()).toBe(null);
    expect(h.calls).not.toContain('authenticate');
  });
});

// Tests for verifyPasskeyAssertion()'s NATIVE branch.
//
// On a real iOS/Android device the WebAuthn platform authenticator is not exposed
// to the Capacitor WKWebView, so the genuine, working possession factor is the OS
// biometric (@aparajita/capacitor-biometric-auth) — the SAME prompt the wallet
// already uses to unlock. verifyPasskeyAssertion() must therefore route through
// BiometricAuth.authenticate() when Capacitor.isNativePlatform() is true, instead
// of calling navigator.credentials.get (which would fail in the WebView).
//
// HONESTY: this is NOT a FIDO2 passkey — it is an OS biometric standing in as the
// possession factor on native. The SendCrypto call site (verifyPasskeyAssertion)
// is unchanged; this branch makes it work on-device. FAIL CLOSED (I4): a cancel /
// no-match THROWS so the caller's `try { ok = await ... } catch { ok = false }`
// treats it as NOT verified.
//
// We mock @capacitor/core (isNativePlatform → true) and the biometric plugin as a
// UNIT test — we are NOT asserting the OS prompt itself is real, only that the
// native branch dispatches to it and fails closed when it throws.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/api/demoClient', () => ({ DEMO: false }));

const isNativePlatform = vi.fn(() => true);
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => isNativePlatform() } }));

const authenticate = vi.fn(async () => undefined);
vi.mock('@aparajita/capacitor-biometric-auth', () => ({
  BiometricAuth: { authenticate: (...a) => authenticate(...a) },
}));

import { verifyPasskeyAssertion } from '@/lib/passkey';

function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
  };
}

let storage;

beforeEach(() => {
  isNativePlatform.mockReturnValue(true);
  authenticate.mockReset();
  authenticate.mockResolvedValue(undefined);
  storage = makeStorage();
  // A registered passkey handle so verify() doesn't bail on "no passkey".
  storage.setItem('veyrnox-passkey-cred', JSON.stringify({ id: 'AQIDBA', rpId: 'veyrnox.test', label: 'L' }));
  // No WebAuthn API on native (the WKWebView does not expose a usable one).
  vi.stubGlobal('window', { localStorage: storage, location: { hostname: 'veyrnox.test' } });
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('navigator', {}); // no credentials — proves we don't use WebAuthn
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('verifyPasskeyAssertion — native branch (OS biometric possession factor)', () => {
  it('routes through BiometricAuth.authenticate() on native and returns true on success', async () => {
    const ok = await verifyPasskeyAssertion();
    expect(ok).toBe(true);
    expect(authenticate).toHaveBeenCalledTimes(1);
  });

  it('FAILS CLOSED (I4): throws when the OS biometric is cancelled / fails', async () => {
    const err = new Error('cancelled');
    err.code = 'userCancel';
    authenticate.mockRejectedValueOnce(err);
    await expect(verifyPasskeyAssertion()).rejects.toThrow();
  });

  it('does NOT require a registered WebAuthn credential record on native (biometric is the factor)', async () => {
    storage.removeItem('veyrnox-passkey-cred');
    const ok = await verifyPasskeyAssertion();
    expect(ok).toBe(true);
    expect(authenticate).toHaveBeenCalledTimes(1);
  });
});

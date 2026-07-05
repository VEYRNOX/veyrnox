// Tests for lib/passkey.js's NATIVE (Capacitor) branches.
//
// On a real iOS/Android device the WebAuthn platform authenticator is not exposed
// to the Capacitor WKWebView — NO WebAuthn plugin ships in the app, so
// navigator.credentials.create()/get() always fail (NotAllowedError). The genuine,
// working possession factor is the OS biometric (@aparajita/capacitor-biometric-auth)
// — the SAME prompt the wallet already uses to unlock. Therefore on native:
//   • verifyPasskeyAssertion()      → BiometricAuth.authenticate()
//   • registerPasskeyCredential()   → BiometricAuth.authenticate() + a local marker
//                                     record honestly flagged nativeBiometric
//   • getPasskeyStatus()            → BiometricAuth.checkBiometry(), NEVER the
//                                     WebAuthn API presence (mode 'native-biometric')
//
// HONESTY: this is NOT a FIDO2 passkey — it is an OS biometric standing in as the
// possession factor on native. FAIL CLOSED (I4): a cancel / no-match THROWS so the
// caller's `try { ok = await ... } catch { ok = false }` treats it as NOT verified,
// and a failed enrollment stores NO record.
//
// We mock @capacitor/core (isNativePlatform → true) and the biometric plugin as a
// UNIT test — we are NOT asserting the OS prompt itself is real, only that the
// native branches dispatch to it and fail closed when it throws.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/api/demoClient', () => ({ DEMO: false }));

const isNativePlatform = vi.fn(() => true);
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => isNativePlatform() } }));

const authenticate = vi.fn(async () => undefined);
const checkBiometry = vi.fn(async () => ({ isAvailable: true }));
vi.mock('@aparajita/capacitor-biometric-auth', () => ({
  BiometricAuth: {
    authenticate: (...a) => authenticate(...a),
    checkBiometry: (...a) => checkBiometry(...a),
  },
}));

// registerPasskeyCredential() wraps the enrollment prompt in the keystore's
// background-lock suppressor (same pattern as PasskeySetup.registerNative).
// Passthrough here — we only assert the prompt runs and fails closed.
const suppressLock = vi.fn(async (fn) => fn());
vi.mock('@/wallet-core/keystore/native.js', () => ({
  nativeKeyStore: { suppressLock: (fn) => suppressLock(fn) },
}));

import {
  PASSKEY_CRED_KEY,
  verifyPasskeyAssertion,
  registerPasskeyCredential,
  getPasskeyStatus,
  getRegisteredPasskey,
} from '@/lib/passkey';

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
let credentialsCreate;

beforeEach(() => {
  isNativePlatform.mockReturnValue(true);
  authenticate.mockReset();
  authenticate.mockResolvedValue(undefined);
  checkBiometry.mockReset();
  checkBiometry.mockResolvedValue({ isAvailable: true });
  suppressLock.mockClear();
  storage = makeStorage();
  // A registered passkey handle so verify() doesn't bail on "no passkey".
  storage.setItem('veyrnox-passkey-cred', JSON.stringify({ id: 'AQIDBA', rpId: 'veyrnox.test', label: 'L' }));
  // The WebView DOES expose a (dead) WebAuthn stub on native — the native
  // branches must never touch it. Spies prove it.
  credentialsCreate = vi.fn(async () => { const e = new Error('not allowed'); e.name = 'NotAllowedError'; throw e; });
  vi.stubGlobal('window', {
    localStorage: storage,
    location: { hostname: 'veyrnox.test' },
    PublicKeyCredential: function PublicKeyCredential() {},
  });
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('navigator', { credentials: { create: credentialsCreate } });
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

describe('registerPasskeyCredential — native branch (biometric enrollment, no fake WebAuthn)', () => {
  beforeEach(() => {
    storage.removeItem(PASSKEY_CRED_KEY); // start unenrolled
  });

  it('NEVER calls navigator.credentials.create on native; uses BiometricAuth.authenticate', async () => {
    const res = await registerPasskeyCredential({ label: 'Veyrnox unlock' });
    expect(credentialsCreate).not.toHaveBeenCalled();
    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(true);
    expect(res.nativeBiometric).toBe(true);
    expect(res.simulated).toBe(false);
  });

  it('stores a marker record honestly flagged nativeBiometric (not a WebAuthn credential)', async () => {
    await registerPasskeyCredential({ label: 'Veyrnox unlock' });
    const rec = getRegisteredPasskey();
    expect(rec).not.toBe(null);
    expect(rec.nativeBiometric).toBe(true);
    expect(rec.simulated).toBe(false);
    expect(rec.id.startsWith('native-biometric:')).toBe(true);
    // No seed/privateKey/password-ish fields — marker only, no secrets.
    for (const k of Object.keys(rec)) {
      expect(/seed|mnemonic|private|password|secret/i.test(k)).toBe(false);
    }
  });

  it('FAILS CLOSED (I4): a cancelled/failed biometric throws and stores NO record', async () => {
    const err = new Error('cancelled');
    err.code = 'userCancel';
    authenticate.mockRejectedValueOnce(err);
    await expect(registerPasskeyCredential()).rejects.toThrow();
    expect(getRegisteredPasskey()).toBe(null);
    expect(credentialsCreate).not.toHaveBeenCalled();
  });

  it('wraps the enrollment prompt in the keystore lock suppressor (background-lock guard)', async () => {
    await registerPasskeyCredential();
    expect(suppressLock).toHaveBeenCalledTimes(1);
    expect(authenticate).toHaveBeenCalledTimes(1);
  });
});

describe('getPasskeyStatus — native (honest biometric availability, never WebAuthn presence)', () => {
  it('reports mode native-biometric + available when BiometricAuth.checkBiometry says so', async () => {
    checkBiometry.mockResolvedValueOnce({ isAvailable: true });
    const s = await getPasskeyStatus();
    expect(s.mode).toBe('native-biometric');
    expect(s.available).toBe(true);
    expect(s.supported).toBe(true);
    expect(s.simulated).toBe(false);
    expect(s.label).toBe('Biometric unlock');
    expect(checkBiometry).toHaveBeenCalledTimes(1);
  });

  it('reports unavailable when biometry is not enrolled — even though window.PublicKeyCredential EXISTS', async () => {
    // The dead WebAuthn stub is present in the WebView; presence must not be
    // mistaken for availability (that was the original silent-failure bug).
    expect(window.PublicKeyCredential).toBeTypeOf('function');
    checkBiometry.mockResolvedValueOnce({ isAvailable: false });
    const s = await getPasskeyStatus();
    expect(s.mode).toBe('native-biometric');
    expect(s.available).toBe(false);
    expect(s.supported).toBe(false);
  });

  it('FAILS CLOSED: a checkBiometry error reports unavailable, never a WebAuthn claim', async () => {
    checkBiometry.mockRejectedValueOnce(new Error('plugin missing'));
    const s = await getPasskeyStatus();
    expect(s.mode).toBe('native-biometric');
    expect(s.available).toBe(false);
    expect(s.supported).toBe(false);
  });

  it('tracks registration state of the native marker record', async () => {
    let s = await getPasskeyStatus();
    expect(s.registered).toBe(true); // seeded in beforeEach
    storage.removeItem(PASSKEY_CRED_KEY);
    s = await getPasskeyStatus();
    expect(s.registered).toBe(false);
  });
});

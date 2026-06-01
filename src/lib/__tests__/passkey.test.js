// Tests for the passkey UNLOCK GATE module (web / real-WebAuthn path).
//
// DEMO is forced OFF here so we exercise the real navigator.credentials path
// with a mocked authenticator. The demo (simulated) path is covered separately
// in passkey-demo.test.js.
//
// Globals (window/navigator/localStorage) are stubbed explicitly so the suite
// does not depend on the jsdom realm — passkey.js only needs a handful of them.
//
// Invariant under test: the module is an AUTH FACTOR, not key custody — it
// stores only a public credential id, scopes assertions to that credential, and
// never produces or persists any secret/decryption material.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/api/demoClient', () => ({ DEMO: false }));

import {
  PASSKEY_PREF_KEY,
  PASSKEY_CRED_KEY,
  isWebAuthnSupported,
  isPasskeyUnlockEnabled,
  setPasskeyUnlockEnabled,
  getRegisteredPasskey,
  isPasskeyRegistered,
  clearRegisteredPasskey,
  getPasskeyStatus,
  registerPasskeyCredential,
  verifyPasskeyAssertion,
  PASSKEY_GATE,
  PasskeyGateError,
  classifyPasskeyError,
  isPasskeyGateError,
} from '@/lib/passkey';

// In-memory localStorage stand-in.
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

function stubWindow({ withWebAuthn = false } = {}) {
  storage = makeStorage();
  const win = {
    localStorage: storage,
    location: { hostname: 'veyrnox.test' },
  };
  if (withWebAuthn) win.PublicKeyCredential = function PublicKeyCredential() {};
  vi.stubGlobal('window', win);
  vi.stubGlobal('localStorage', storage);
}

function installAuthenticator({ rawId } = {}) {
  // Minimal WebAuthn surface. rawId defaults to a fixed 4-byte buffer so the
  // base64url round-trip is deterministic.
  const id = rawId || new Uint8Array([1, 2, 3, 4]).buffer;
  const create = vi.fn(async () => ({ rawId: id }));
  const get = vi.fn(async () => ({ rawId: id }));
  window.PublicKeyCredential = function PublicKeyCredential() {};
  vi.stubGlobal('navigator', { credentials: { create, get } });
  return { create, get, id };
}

beforeEach(() => {
  stubWindow();
  vi.stubGlobal('navigator', {}); // no credentials by default
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('preference + credential storage (no secrets)', () => {
  it('enable/disable preference round-trips through localStorage', () => {
    expect(isPasskeyUnlockEnabled()).toBe(false);
    setPasskeyUnlockEnabled(true);
    expect(storage.getItem(PASSKEY_PREF_KEY)).toBe('1');
    expect(isPasskeyUnlockEnabled()).toBe(true);
    setPasskeyUnlockEnabled(false);
    expect(storage.getItem(PASSKEY_PREF_KEY)).toBe(null);
    expect(isPasskeyUnlockEnabled()).toBe(false);
  });

  it('getRegisteredPasskey returns null when absent and the record when present', () => {
    expect(getRegisteredPasskey()).toBe(null);
    expect(isPasskeyRegistered()).toBe(false);
    storage.setItem(PASSKEY_CRED_KEY, JSON.stringify({ id: 'abc', rpId: 'x', label: 'L' }));
    expect(isPasskeyRegistered()).toBe(true);
    expect(getRegisteredPasskey()).toMatchObject({ id: 'abc', rpId: 'x' });
  });

  it('clearRegisteredPasskey forgets the handle AND disables the gate', () => {
    storage.setItem(PASSKEY_CRED_KEY, JSON.stringify({ id: 'abc' }));
    setPasskeyUnlockEnabled(true);
    clearRegisteredPasskey();
    expect(getRegisteredPasskey()).toBe(null);
    expect(isPasskeyUnlockEnabled()).toBe(false);
  });

  it('stored record never contains key material (only public handle + metadata)', async () => {
    installAuthenticator();
    await registerPasskeyCredential({ label: 'Veyrnox unlock' });
    const raw = JSON.parse(storage.getItem(PASSKEY_CRED_KEY));
    expect(Object.keys(raw).sort()).toEqual(
      ['createdAt', 'id', 'label', 'rpId', 'simulated'].sort(),
    );
    // No seed/privateKey/password-ish fields.
    for (const k of Object.keys(raw)) {
      expect(/seed|mnemonic|private|password|secret/i.test(k)).toBe(false);
    }
  });
});

describe('WebAuthn support detection', () => {
  it('reports unsupported without PublicKeyCredential', () => {
    expect(isWebAuthnSupported()).toBe(false);
  });

  it('reports supported once the API is present', () => {
    installAuthenticator();
    expect(isWebAuthnSupported()).toBe(true);
  });
});

describe('registration (real path)', () => {
  it('throws when WebAuthn is unsupported', async () => {
    await expect(registerPasskeyCredential()).rejects.toThrow(/not supported/i);
  });

  it('calls navigator.credentials.create with platform + user-verification and stores base64url id', async () => {
    const { create } = installAuthenticator();
    const res = await registerPasskeyCredential({ label: 'Veyrnox unlock' });
    expect(create).toHaveBeenCalledTimes(1);
    const opts = create.mock.calls[0][0].publicKey;
    expect(opts.authenticatorSelection.authenticatorAttachment).toBe('platform');
    expect(opts.authenticatorSelection.userVerification).toBe('required');
    expect(opts.challenge).toBeInstanceOf(Uint8Array);
    expect(opts.challenge.length).toBe(32);
    expect(opts.rp.id).toBe('veyrnox.test');
    // rawId [1,2,3,4] → base64url "AQIDBA"
    expect(res.credentialId).toBe('AQIDBA');
    expect(res.simulated).toBe(false);
    expect(getRegisteredPasskey().id).toBe('AQIDBA');
  });
});

describe('assertion (real path)', () => {
  it('throws when no passkey is registered', async () => {
    installAuthenticator();
    await expect(verifyPasskeyAssertion()).rejects.toThrow(/no passkey/i);
  });

  it('scopes the assertion to the registered credential id', async () => {
    const { get } = installAuthenticator();
    await registerPasskeyCredential();
    await verifyPasskeyAssertion();
    expect(get).toHaveBeenCalledTimes(1);
    const opts = get.mock.calls[0][0].publicKey;
    expect(opts.userVerification).toBe('required');
    expect(opts.allowCredentials).toHaveLength(1);
    expect(opts.allowCredentials[0].type).toBe('public-key');
    // The allowed id decodes back to the stored rawId bytes [1,2,3,4].
    expect(Array.from(new Uint8Array(opts.allowCredentials[0].id))).toEqual([1, 2, 3, 4]);
  });

  it('propagates a cancelled assertion (so unlock aborts)', async () => {
    const { get } = installAuthenticator();
    await registerPasskeyCredential();
    const err = new Error('cancelled');
    err.name = 'NotAllowedError';
    get.mockRejectedValueOnce(err);
    await expect(verifyPasskeyAssertion()).rejects.toThrow(/cancelled/i);
  });
});

describe('status (web)', () => {
  it('is unavailable + unsupported with no WebAuthn API', async () => {
    const s = await getPasskeyStatus();
    expect(s.mode).toBe('web');
    expect(s.supported).toBe(false);
    expect(s.available).toBe(false);
    expect(s.simulated).toBe(false);
  });

  it('is available + supported once the API is present, and tracks registration', async () => {
    installAuthenticator();
    let s = await getPasskeyStatus();
    expect(s.supported).toBe(true);
    expect(s.available).toBe(true);
    expect(s.registered).toBe(false);
    await registerPasskeyCredential();
    s = await getPasskeyStatus();
    expect(s.registered).toBe(true);
  });
});

// SAST M-3 — the escape-hatch primitives. These let the unlock flow tell a
// deliberate CANCEL of a working passkey (fail closed, retry) apart from a HARD
// failure where the credential can no longer be used (offer the password-only
// escape hatch as recovery). The vault is still gated by the password either way.
describe('gate outcome classification (escape hatch)', () => {
  it('classifies a NotAllowedError as the ambiguous cancel-or-removed case', () => {
    const err = new Error('x');
    err.name = 'NotAllowedError';
    expect(classifyPasskeyError(err)).toBe('cancelled');
  });

  it('classifies any other error (broken/deleted credential, authenticator fault) as a hard failure', () => {
    const named = new Error('boom');
    named.name = 'InvalidStateError';
    expect(classifyPasskeyError(named)).toBe('error');
    expect(classifyPasskeyError(new Error('plain'))).toBe('error');
    // Defensive: non-error inputs must not be mistaken for a user cancel.
    expect(classifyPasskeyError(null)).toBe('error');
    expect(classifyPasskeyError(undefined)).toBe('error');
    expect(classifyPasskeyError('NotAllowedError')).toBe('error');
  });

  it('PasskeyGateError carries the classified reason and a stable tag', () => {
    const cancelled = new PasskeyGateError('cancelled');
    expect(cancelled.reason).toBe('cancelled');
    expect(cancelled.isPasskeyGateError).toBe(true);
    expect(isPasskeyGateError(cancelled)).toBe(true);
    expect(cancelled).toBeInstanceOf(Error);

    const hard = new PasskeyGateError('error', new Error('cause'));
    expect(hard.reason).toBe('error');
    expect(hard.cause).toBeInstanceOf(Error);
  });

  it('isPasskeyGateError rejects ordinary (wrong-password / vault) errors', () => {
    // So the unlock UI never shows the passkey escape hatch for a wrong password.
    expect(isPasskeyGateError(new Error('wrong password or corrupted vault'))).toBe(false);
    expect(isPasskeyGateError(null)).toBe(false);
    expect(isPasskeyGateError({})).toBe(false);
  });

  it('PASSKEY_GATE enumerates the three gate outcomes and is frozen', () => {
    expect(PASSKEY_GATE.PASSED).toBe('passed');
    expect(PASSKEY_GATE.SKIPPED).toBe('skipped');
    expect(PASSKEY_GATE.UNAVAILABLE).toBe('unavailable');
    expect(Object.isFrozen(PASSKEY_GATE)).toBe(true);
  });
});

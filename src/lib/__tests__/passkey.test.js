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
  PASSKEY_SIGNCOUNT_KEY,
  getPasskeySignCount,
  setPasskeySignCount,
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

describe('M-K — signCount validation (cloned authenticator detection)', () => {
  // authenticatorData layout: rpIdHash(32) | flags(1) | signCount(4, big-endian uint32) | …
  function makeAuthenticatorData(signCount) {
    const data = new Uint8Array(37);
    for (let i = 0; i < 32; i++) data[i] = 0xaa; // rpIdHash (dummy)
    data[32] = 0x05;                              // flags: UP|UV
    data[33] = (signCount >>> 24) & 0xff;
    data[34] = (signCount >>> 16) & 0xff;
    data[35] = (signCount >>> 8) & 0xff;
    data[36] = signCount & 0xff;
    return data.buffer;
  }
  function resolveWith(get, signCount) {
    get.mockResolvedValueOnce({
      rawId: new Uint8Array([1, 2, 3, 4]).buffer,
      response: { authenticatorData: makeAuthenticatorData(signCount) },
    });
  }

  it('extracts + stores signCount on the first successful assertion', async () => {
    const { get } = installAuthenticator();
    await registerPasskeyCredential();
    resolveWith(get, 1);
    await expect(verifyPasskeyAssertion()).resolves.toBe(true);
    expect(storage.getItem(PASSKEY_SIGNCOUNT_KEY)).toBe('1');
    expect(getPasskeySignCount()).toBe(1);
  });

  it('rejects a replayed (same) signCount with the authenticator_cloned code + structured counters', async () => {
    const { get } = installAuthenticator();
    await registerPasskeyCredential();
    resolveWith(get, 5);
    await verifyPasskeyAssertion();
    expect(storage.getItem(PASSKEY_SIGNCOUNT_KEY)).toBe('5');

    resolveWith(get, 5); // cloned soft authenticator replays old state
    let caught;
    try { await verifyPasskeyAssertion(); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(Error);
    expect(caught.code).toBe('authenticator_cloned');
    expect(caught.authenticatorCloned).toBe(true);
    expect(caught.oldSignCount).toBe(5);
    expect(caught.newSignCount).toBe(5);
    // Fail-closed (I4): the stored counter MUST NOT advance on a rejected assertion.
    expect(storage.getItem(PASSKEY_SIGNCOUNT_KEY)).toBe('5');
  });

  it('rejects a rolled-back (lower) signCount as authenticator_cloned', async () => {
    const { get } = installAuthenticator();
    await registerPasskeyCredential();
    resolveWith(get, 10);
    await verifyPasskeyAssertion();

    resolveWith(get, 8);
    let caught;
    try { await verifyPasskeyAssertion(); } catch (e) { caught = e; }
    expect(caught.code).toBe('authenticator_cloned');
    expect(caught.oldSignCount).toBe(10);
    expect(caught.newSignCount).toBe(8);
    expect(storage.getItem(PASSKEY_SIGNCOUNT_KEY)).toBe('10');
  });

  it('accepts a legitimate strictly-increasing advancement (1 → 2)', async () => {
    const { get } = installAuthenticator();
    await registerPasskeyCredential();
    resolveWith(get, 1);
    await expect(verifyPasskeyAssertion()).resolves.toBe(true);
    resolveWith(get, 2);
    await expect(verifyPasskeyAssertion()).resolves.toBe(true);
    expect(storage.getItem(PASSKEY_SIGNCOUNT_KEY)).toBe('2');
  });

  it('does not misread a top-bit-set signCount as negative (uint32, not int32)', async () => {
    const { get } = installAuthenticator();
    await registerPasskeyCredential();
    const big = 0x80000001; // 2147483649
    resolveWith(get, big);
    await expect(verifyPasskeyAssertion()).resolves.toBe(true);
    expect(storage.getItem(PASSKEY_SIGNCOUNT_KEY)).toBe(String(big));
    expect(getPasskeySignCount()).toBe(big);

    resolveWith(get, big); // equal → still cloned
    let caught;
    try { await verifyPasskeyAssertion(); } catch (e) { caught = e; }
    expect(caught.code).toBe('authenticator_cloned');
    expect(caught.oldSignCount).toBe(big);
  });

  it('persists the counter across a page reload (localStorage round-trip)', () => {
    setPasskeySignCount(42);
    // Simulate a reload: a fresh read off the same storage still sees the value.
    expect(getPasskeySignCount()).toBe(42);
    expect(storage.getItem(PASSKEY_SIGNCOUNT_KEY)).toBe('42');
  });

  it('treats absent stored counter as 0 (first use) and does not reject', async () => {
    const { get } = installAuthenticator();
    await registerPasskeyCredential();
    expect(storage.getItem(PASSKEY_SIGNCOUNT_KEY)).toBe(null);
    resolveWith(get, 1);
    await expect(verifyPasskeyAssertion()).resolves.toBe(true);
    expect(storage.getItem(PASSKEY_SIGNCOUNT_KEY)).toBe('1');
  });

  it('clearRegisteredPasskey wipes the stored signCount', async () => {
    const { get } = installAuthenticator();
    await registerPasskeyCredential();
    resolveWith(get, 3);
    await verifyPasskeyAssertion();
    expect(storage.getItem(PASSKEY_SIGNCOUNT_KEY)).toBe('3');
    clearRegisteredPasskey();
    expect(storage.getItem(PASSKEY_SIGNCOUNT_KEY)).toBe(null);
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
